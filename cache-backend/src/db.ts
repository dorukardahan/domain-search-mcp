/**
 * Database Connection Module.
 *
 * PostgreSQL connection pool and Redis client.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';

// ═══════════════════════════════════════════════════════════════════════════
// PostgreSQL
// ═══════════════════════════════════════════════════════════════════════════

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL error:', err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Redis
// ═══════════════════════════════════════════════════════════════════════════

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });

    redis.on('error', (err: Error) => {
      console.error('Redis error:', err);
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache Helpers
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_TAKEN = 86400; // 24 hours
const CACHE_TTL_QUERY = 3600; // 1 hour

/**
 * Cache a domain as taken.
 */
export async function cacheTaken(fqdn: string, expiresAt?: string): Promise<void> {
  const r = getRedis();
  const key = `taken:${fqdn.toLowerCase()}`;
  const value = JSON.stringify({ expires_at: expiresAt || null });
  await r.setex(key, CACHE_TTL_TAKEN, value);
}

/**
 * Check if domain is cached as taken.
 */
export async function getCachedTaken(fqdn: string): Promise<{ taken: boolean; expires_at?: string } | null> {
  const r = getRedis();
  const key = `taken:${fqdn.toLowerCase()}`;
  const value = await r.get(key);
  if (!value) return null;

  try {
    const data = JSON.parse(value);
    return { taken: true, expires_at: data.expires_at || undefined };
  } catch {
    return { taken: true };
  }
}

/**
 * Batch check cached domains.
 */
export async function getCachedTakenBatch(fqdns: string[]): Promise<Map<string, { taken: boolean; expires_at?: string }>> {
  const r = getRedis();
  const result = new Map<string, { taken: boolean; expires_at?: string }>();

  if (fqdns.length === 0) return result;

  const keys = fqdns.map(fqdn => `taken:${fqdn.toLowerCase()}`);
  const values = await r.mget(...keys);

  for (let i = 0; i < fqdns.length; i++) {
    const value = values[i];
    if (value) {
      try {
        const data = JSON.parse(value);
        result.set(fqdns[i]!.toLowerCase(), { taken: true, expires_at: data.expires_at || undefined });
      } catch {
        result.set(fqdns[i]!.toLowerCase(), { taken: true });
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check and increment rate limit.
 * Returns remaining requests, or -1 if exceeded.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<number> {
  const r = getRedis();
  const fullKey = `ratelimit:${key}`;

  const multi = r.multi();
  multi.incr(fullKey);
  multi.expire(fullKey, windowSeconds);
  const results = await multi.exec();

  const count = results?.[0]?.[1] as number || 0;

  if (count > limit) {
    return -1;
  }

  return limit - count;
}
