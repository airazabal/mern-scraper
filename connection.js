import { Redis } from 'ioredis';
import { config } from '../config/index.js';

// BullMQ requires maxRetriesPerRequest: null
export const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
});
