import Anthropic from '@anthropic-ai/sdk';
import { AgentSession } from '../models/AgentSession.js';
import { ScrapeResult } from '../models/ScrapeResult.js';
import { enqueueScrape, makeQueueEvents } from '../queue/scrapeQueue.js';
import { config } from '../config/index.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tools Claude can call each iteration to drive the scrape loop
const AGENT_TOOLS = [
  {
    name: 'add_to_frontier',
    description:
      'Enqueue URLs to be scraped next. Only add URLs that are likely to contain data relevant to the goal. Max 10 per call.',
    input_schema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Absolute URLs to scrape',
        },
        reasoning: {
          type: 'string',
          description: 'Why these URLs were chosen',
        },
      },
      required: ['urls', 'reasoning'],
    },
  },
  {
    name: 'record_items',
    description:
      'Store items you have extracted from the scraped pages that satisfy the goal criteria.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of extracted objects relevant to the goal',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'finish_goal',
    description: 'Call this when the goal has been fully achieved.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Short summary of what was accomplished',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'give_up',
    description:
      'Call this when it is clear the goal cannot be achieved with the available data.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the goal cannot be met' },
      },
      required: ['reason'],
    },
  },
];

const SYSTEM_PROMPT = `You are a goal-oriented web scraping agent.
You run in a loop: each iteration you receive the current state, then decide what to do next by calling tools.

Rules:
- Call record_items with every piece of data you extract that satisfies the goal.
- IMPORTANT: In the SAME turn you call record_items, check if the goal is now fully met.
  If it is, you MUST also call finish_goal in that same turn — do not wait for the next iteration.
- Only call add_to_frontier when you need MORE data to meet the goal.
- Call give_up only when you are certain the goal is unreachable.
- You may call multiple tools in a single turn (record_items + finish_goal together is the normal pattern).
- Respect politeness: the scraper already throttles requests per domain.`;

async function waitForJobs(jobs, timeoutMs = 90_000) {
  const queueEvents = makeQueueEvents();
  try {
    await Promise.allSettled(
      jobs.map((job) => job.waitUntilFinished(queueEvents, timeoutMs))
    );
  } finally {
    await queueEvents.close();
  }
}

function buildUserMessage(session, freshPages) {
  const pagesSummary = freshPages.map((p) => ({
    url: p.target,
    title: p.title,
    description: p.description,
    bodyText: p.bodyText?.slice(0, 800),
    linkCount: p.links?.length ?? 0,
    links: (p.links ?? []).slice(0, 30),
    itemCount: p.items?.length ?? 0,
    items: (p.items ?? []).slice(0, 10),
  }));

  return `## Goal
${session.goal}

## Current state
- Iteration: ${session.iterations + 1} / ${session.maxIterations}
- URLs visited: ${session.visited.length} / ${session.maxUrls}
- Collected items so far: ${session.collectedItems.length}
- URLs in frontier (not yet scraped): ${session.frontier.length}

## Freshly scraped pages this iteration
${JSON.stringify(pagesSummary, null, 2)}

## Already collected items (sample)
${JSON.stringify(session.collectedItems.slice(0, 20), null, 2)}

Decide what to do next. Remember: call finish_goal as soon as the goal is met.`;
}

async function askClaudeToEvaluate(session, freshPages) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: AGENT_TOOLS,
    messages: [{ role: 'user', content: buildUserMessage(session, freshPages) }],
  });

  let done = false;
  let doneReason = '';
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;
    const { name, input } = block;

    if (name === 'record_items') {
      const items = input.items ?? [];
      session.collectedItems.push(...items);
      session.log.push({
        level: 'info',
        message: `Recorded ${items.length} items (total: ${session.collectedItems.length})`,
      });
    }
    if (name === 'add_to_frontier') {
      const candidates = (input.urls ?? []).filter(
        (u) =>
          typeof u === 'string' &&
          u.startsWith('http') &&
          !session.visited.includes(u) &&
          !session.frontier.includes(u) &&
          session.visited.length + session.frontier.length < session.maxUrls
      );
      session.frontier.push(...candidates);
      session.log.push({
        level: 'info',
        message: `Added ${candidates.length} URLs to frontier. Reason: ${input.reasoning}`,
      });
    }
    if (name === 'finish_goal') {
      session.status = 'completed';
      session.summary = input.summary;
      session.completedAt = new Date();
      session.log.push({ level: 'info', message: `Goal achieved: ${input.summary}` });
      done = true;
      doneReason = 'goal_achieved';
    }
    if (name === 'give_up') {
      session.status = 'failed';
      session.summary = input.reason;
      session.completedAt = new Date();
      session.log.push({ level: 'warn', message: `Agent gave up: ${input.reason}` });
      done = true;
      doneReason = 'gave_up';
    }
  }
  return { done, doneReason };
}

async function runIteration(session) {
  // Pick next batch from frontier (seed is already there on first run)
  const batch = session.frontier.splice(0, 5);
  if (batch.length === 0) {
    // Frontier exhausted — ask Claude to evaluate with what we have
    if (session.collectedItems.length > 0) {
      session.log.push({
        level: 'info',
        message: `Frontier empty with ${session.collectedItems.length} collected items — asking Claude to evaluate.`,
      });
      const { done, doneReason } = await askClaudeToEvaluate(session, []);
      session.iterations += 1;
      await session.save();
      return { done, reason: doneReason || 'frontier exhausted' };
    }
    return { done: true, reason: 'frontier exhausted' };
  }

  // Mark as visited before enqueueing (idempotent due to BullMQ jobId dedupe)
  const newUrls = batch.filter((u) => !session.visited.includes(u));
  session.visited.push(...newUrls);

  // Enqueue and wait
  const jobs = await Promise.all(newUrls.map((u) => enqueueScrape(u)));
  if (jobs.length > 0) {
    await waitForJobs(jobs);
    // Brief pause so the worker has time to write to Mongo
    await sleep(500);
  }

  // Fetch freshly scraped results
  const freshPages = await ScrapeResult.find({ target: { $in: batch } }).lean();

  const { done, doneReason } = await askClaudeToEvaluate(session, freshPages);
  session.iterations += 1;
  await session.save();

  return { done, reason: doneReason };
}

export async function runGoalAgent(sessionId) {
  let session;
  try {
    session = await AgentSession.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Seed the frontier with the starting URL
    session.frontier.push(session.seedUrl);
    session.log.push({ level: 'info', message: `Agent started. Goal: ${session.goal}` });
    await session.save();

    while (
      session.status === 'running' &&
      session.iterations < session.maxIterations
    ) {
      const { done } = await runIteration(session);
      // Re-fetch session to pick up any external stop signals
      session = await AgentSession.findById(sessionId);
      if (done || session.status !== 'running') break;
    }

    // Iterations exhausted without Claude calling finish_goal
    if (session.status === 'running') {
      session.status = 'failed';
      session.summary = `Max iterations (${session.maxIterations}) reached without achieving goal.`;
      session.completedAt = new Date();
      session.log.push({ level: 'warn', message: session.summary });
      await session.save();
    }
  } catch (err) {
    console.error(`[agent] session ${sessionId} crashed:`, err);
    if (session) {
      session.status = 'failed';
      session.summary = `Agent crashed: ${err.message}`;
      session.completedAt = new Date();
      session.log.push({ level: 'error', message: session.summary });
      await session.save();
    }
  }
}
