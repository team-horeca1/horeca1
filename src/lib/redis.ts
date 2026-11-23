import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis: Redis };

function createRedisClient() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true, // Don't connect until first command — prevents crash when Redis isn't running
    retryStrategy(times) {
      return Math.min(times * 500, 10_000);
    },
  });
  // ioredis emits 'error' on every refused connect. Without a listener Node
  // prints "Unhandled error event" forever and the terminal looks stuck.
  let lastLog = 0;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLog < 15_000) return;
    lastLog = now;
    console.warn(`[redis] ${err.message}. Start it with npm run dev:db`);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
