import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { ScrapeResult } from './models/ScrapeResult.js';
import { enqueueScrape } from './queue/scrapeQueue.js';

await mongoose.connect(config.mongoUri);
console.log('[api] connected to mongo');

const app = express();
app.use(cors());
app.use(express.json());

function isFresh(doc) {
  return doc && Date.now() - doc.scrapedAt.getTime() < config.cacheTtlMs;
}

// GET /api/data?target=<url>
// - fresh cache  => return data
// - stale/missing => enqueue job, tell client to poll
app.get('/api/data', async (req, res) => {
  const { target } = req.query;
  if (!target) return res.status(400).json({ error: 'target required' });

  const doc = await ScrapeResult.findOne({ target });

  if (isFresh(doc)) {
    return res.json({ status: 'ready', scrapedAt: doc.scrapedAt, items: doc.items });
  }

  await enqueueScrape(target);
  return res.status(202).json({
    status: 'pending',
    // serve stale data while refreshing, if any
    items: doc?.items ?? [],
    scrapedAt: doc?.scrapedAt ?? null,
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
