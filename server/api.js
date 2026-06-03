import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { ScrapeResult } from './models/ScrapeResult.js';
import { AgentSession } from './models/AgentSession.js';
import { enqueueScrape } from './queue/scrapeQueue.js';
import { runGoalAgent } from './agent/goalAgent.js';

await mongoose.connect(config.mongoUri);
console.log('[api] connected to mongo');

const app = express();
app.use(cors());
app.use(express.json());

// ── Scrape ────────────────────────────────────────────────────────────────────

function isFresh(doc) {
  return doc && Date.now() - doc.scrapedAt.getTime() < config.cacheTtlMs;
}

// GET /api/data?target=<url>
// Fresh cache => return data. Stale/missing => enqueue job, tell client to poll.
app.get('/api/data', async (req, res) => {
  const { target } = req.query;
  if (!target) return res.status(400).json({ error: 'target required' });

  const doc = await ScrapeResult.findOne({ target });

  if (isFresh(doc)) {
    return res.json({ status: 'ready', scrapedAt: doc.scrapedAt, items: doc.items, videos: doc.videos ?? [] });
  }

  await enqueueScrape(target);
  return res.status(202).json({
    status: 'pending',
    items: doc?.items ?? [],
    videos: doc?.videos ?? [],
    scrapedAt: doc?.scrapedAt ?? null,
  });
});

// ── Agent ─────────────────────────────────────────────────────────────────────

// POST /api/agent — start a new goal-oriented agent session
app.post('/api/agent', async (req, res) => {
  const { goal, seedUrl, maxIterations, maxUrls } = req.body;
  if (!goal || !seedUrl) {
    return res.status(400).json({ error: 'goal and seedUrl are required' });
  }

  const session = await AgentSession.create({
    goal,
    seedUrl,
    maxIterations: maxIterations ?? 20,
    maxUrls: maxUrls ?? 100,
  });

  // Fire-and-forget: agent runs in the background
  runGoalAgent(session._id.toString()).catch((err) =>
    console.error('[api] unhandled agent error:', err)
  );

  return res.status(202).json({ sessionId: session._id });
});

// GET /api/agent — list all sessions (newest first)
app.get('/api/agent', async (_req, res) => {
  const sessions = await AgentSession.find(
    {},
    'goal seedUrl status iterations collectedItems createdAt completedAt summary'
  )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json(sessions);
});

// GET /api/agent/:id — full session state (polled by client)
app.get('/api/agent/:id', async (req, res) => {
  const session = await AgentSession.findById(req.params.id).lean();
  if (!session) return res.status(404).json({ error: 'not found' });
  res.json(session);
});

// POST /api/agent/:id/stop — request agent stop
app.post('/api/agent/:id/stop', async (req, res) => {
  const session = await AgentSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  if (session.status === 'running') {
    session.status = 'stopped';
    session.completedAt = new Date();
    session.log.push({ level: 'info', message: 'Stopped by user' });
    await session.save();
  }
  res.json({ status: session.status });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
