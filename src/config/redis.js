import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // production-safe options
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy(times) {
    if (times > 5) return null; // stop retry after 5 attempts
    return Math.min(times * 200, 2000);
  }
});

/* ================= EVENTS ================= */

redis.on('connect', () => {
  console.log('Redis connecting...');
});

redis.on('ready', () => {
  console.log('Redis connected & ready');
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

redis.on('close', () => {
  console.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  console.warn('Redis reconnecting...');
});

/* ================= GRACEFUL SHUTDOWN ================= */

const shutdown = async () => {
  try {
    await redis.quit();
    console.log('Redis connection closed gracefully');
  } catch (err) {
    console.error('Redis shutdown error:', err.message);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default redis;
