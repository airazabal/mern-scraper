import 'dotenv/config';

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/scraper',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
  },
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 6 * 60 * 60 * 1000),
  minRequestDelayMs: Number(process.env.MIN_REQUEST_DELAY_MS || 1500),
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (compatible; MyScraperBot/1.0; +https://example.com/bot)',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};
