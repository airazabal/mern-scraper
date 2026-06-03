import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const SCRAPE_QUEUE = 'scrape';

export const scrapeQueue = new Queue(SCRAPE_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Deterministic job id => natural dedupe of identical in-flight jobs
export function enqueueScrape(target) {
  return scrapeQueue.add(
    'scrape-target',
    { target },
    { jobId: `scrape:${encodeURIComponent(target)}` }
  );
}
