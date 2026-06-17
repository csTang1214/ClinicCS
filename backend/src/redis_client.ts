import { Redis } from 'ioredis';

const sharedOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 300, 1000)),
};

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { ...sharedOptions, tls: {} })
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      ...sharedOptions,
    });

redis.on('error', (err: Error) => console.error('[Redis] Connection error:', err.message || String(err)));
redis.on('connect', () => console.log('[Redis] Connected'));

export default redis;
