import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { SCRAPE_QUEUE } from './queue/scrapeQueue.js';
import { connection } from './queue/connection.js';
import { config } from './config/index.js';
import { fetchHtml } from './scraper/fetcher.js';
import { parseItems, extractPageMeta } from './scraper/parser.js';
import { ScrapeResult } from './models/ScrapeResult.js';

await mongoose.connect(config.mongoUri);
console.log('[worker] connected to mongo');

const worker = new Worker(
  SCRAPE_QUEUE,
  async (job) => {
    const { target } = job.data;
    console.log(`[worker] scraping ${target}`);

    const html = await fetchHtml(target);

    // Generic meta (links, title, body text) — always extracted for the agent
    const meta = extractPageMeta(html, target);

    // Structured item extraction — fails loudly if selectors are stale
    let items = [];
    let rejected = 0;
    try {
      const parsed = parseItems(html);
      items = parsed.items;
      rejected = parsed.rejected;
    } catch (err) {
      // Page may not have structured items (e.g. it's a link-discovery page)
      console.warn(`[worker] no structured items for ${target}: ${err.message}`);
    }

    await ScrapeResult.findOneAndUpdate(
      { target },
      {
        target,
        items,
        title: meta.title,
        description: meta.description,
        bodyText: meta.bodyText,
        links: meta.links,
        videos: meta.videos,
        scrapedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return { count: items.length, rejected, links: meta.links.length, videos: meta.videos.length };
  },
  { connection, concurrency: 2 }
);

worker.on('completed', (job, res) =>
  console.log(`[worker] done ${job.id}:`, res)
);
worker.on('failed', (job, err) =>
  console.error(
    `[worker] failed ${job?.id} (attempt ${job?.attemptsMade}):`,
    err.message
  )
);
