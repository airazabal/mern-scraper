import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { SCRAPE_QUEUE } from '../queue/scrapeQueue.js';
import { connection } from '../queue/connection.js';
import { config } from '../config/index.js';
import { fetchHtml } from '../scraper/fetcher.js';
import { parseItems } from '../scraper/parser.js';
import { ScrapeResult } from '../models/ScrapeResult.js';

await mongoose.connect(config.mongoUri);
console.log('[worker] connected to mongo');

const worker = new Worker(
  SCRAPE_QUEUE,
  async (job) => {
    const { target } = job.data;
    console.log(`[worker] scraping ${target}`);

    const html = await fetchHtml(target);
    const { items, rejected } = parseItems(html);

    // Upsert: overwrite cache with fresh data + timestamp
    await ScrapeResult.findOneAndUpdate(
      { target },
      { target, items, scrapedAt: new Date() },
      { upsert: true, new: true }
    );

    return { count: items.length, rejected };
  },
  { connection, concurrency: 2 }
);

worker.on('completed', (job, res) =>
  console.log(`[worker] done ${job.id}:`, res)
);
worker.on('failed', (job, err) =>
  console.error(`[worker] failed ${job?.id} (attempt ${job?.attemptsMade}):`, err.message)
);
