/**
 * Hybrid Redis + In-Memory Cache.
 *
 * Uses Redis as primary cache when available, with automatic fallback
 * to in-memory cache when Redis is unavailable or not configured.
 *
 * Features:
 * - Zero-config: Works without Redis (uses in-memory only)
 * - Graceful degradation: Falls back to in-memory on Redis failures
 * - Circuit breaker: Prevents hammering failing Redis
 * - Automatic reconnection: Reconnects when Redis comes back
 * - Shared cache: Multiple MCP instances share the same Redis cache
 */

import Redis from 'ioredis';
import { logger } from './logger.js';
import { TtlCache } from './cache.js';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import { incrementCounter, recordLatency } from './metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface RedisCacheOptions {
  /** Redis connection URL (redis://[:password@]host:port) */
  redisUrl?: string;

  /** Key prefix for namespacing */
  keyPrefix?: string;

  /** Default TTL in seconds */
  defaultTtlSeconds?: number;

  /** Max entries for in-memory fallback cache */
  fallbackMaxEntries?: number;

  /** Connection timeout in ms */
  connectTimeoutMs?: number;

  /** Command timeout in ms */
  commandTimeoutMs?: number;
}

const DEFAULT_OPTIONS = {
  keyPrefix: 'dsmcp:',
  defaultTtlSeconds: 3600,
  fallbackMaxEntries: 10000,
  connectTimeoutMs: 5000,
  commandTimeoutMs: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════
// Redis Cache Class
// ═══════════════════════════════════════════════════════════════════════════

export class HybridCache<T> {
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;
  private readonly commandTimeoutMs: number;

  private redis: Redis | null = null;
  private readonly fallbackCache: TtlCache<T>;
  private readonly circuitBreaker: CircuitBreaker;
  private isConnected = false;
  private readonly redisUrl: string | undefined;

  constructor(options: RedisCacheOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_OPTIONS.keyPrefix;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_OPTIONS.defaultTtlSeconds;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_OPTIONS.commandTimeoutMs;
    this.redisUrl = options.redisUrl;

    // In-memory fallback cache
    this.fallbackCache = new TtlCache<T>(
      this.defaultTtlSeconds,
      options.fallbackMaxEntries ?? DEFAULT_OPTIONS.fallbackMaxEntries
    );

    // Circuit breaker for Redis operations
    this.circuitBreaker = new CircuitBreaker({
      name: 'redis_cache',
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      failureWindowMs: 60_000,
      successThreshold: 2,
    });

    // Connect to Redis if URL provided
    if (options.redisUrl) {
      this.initRedis(options.redisUrl, options.connectTimeoutMs ?? DEFAULT_OPTIONS.connectTimeoutMs);
    } else {
      logger.info('Redis not configured, using in-memory cache only');
    }
  }

  /**
   * Initialize Redis connection.
   */
  private initRedis(url: string, connectTimeoutMs: number): void {
    try {
      this.redis = new Redis(url, {
        connectTimeout: connectTimeoutMs,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis connection failed, using fallback cache', { attempts: times });
            return null; // Stop retrying
          }
          return Math.min(times * 500, 2000); // Exponential backoff
        },
        lazyConnect: false,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected', { url: this.maskUrl(url) });
        incrementCounter('redis_connected');
      });

      this.redis.on('error', (err) => {
        logger.debug('Redis error', { error: err.message });
        incrementCounter('redis_error');
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.debug('Redis connection closed');
        incrementCounter('redis_disconnected');
      });

      this.redis.on('reconnecting', () => {
        logger.debug('Redis reconnecting...');
        incrementCounter('redis_reconnecting');
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.redis = null;
    }
  }

  /**
   * Mask password in Redis URL for logging.
   */
  private maskUrl(url: string): string {
    return url.replace(/:([^@]+)@/, ':***@');
  }

  /**
   * Build full key with prefix.
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get value from cache.
   */
  async get(key: string): Promise<T | undefined> {
    const fullKey = this.buildKey(key);

    // Try Redis first if available
    if (this.redis && this.isConnected) {
      try {
        const startTime = Date.now();
        const value = await this.circuitBreaker.execute(async () => {
          return Promise.race([
            this.redis!.get(fullKey),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Redis timeout')), this.commandTimeoutMs)
            ),
          ]);
        });

        recordLatency('redis_get_latency', Date.now() - startTime);

        if (value !== null) {
          incrementCounter('redis_cache_hit');
          return JSON.parse(value) as T;
        }

        incrementCounter('redis_cache_miss');
        // Fall through to fallback cache
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          incrementCounter('redis_circuit_open');
        } else {
          incrementCounter('redis_get_error');
          logger.debug('Redis get failed, using fallback', {
            key,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
        // Fall through to fallback cache
      }
    }

    // Use fallback cache
    return this.fallbackCache.get(key);
  }

  /**
   * Set value in cache.
   */
  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.buildKey(key);
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const serialized = JSON.stringify(value);

    // Always set in fallback cache
    this.fallbackCache.set(key, value, ttl);

    // Try Redis if available
    if (this.redis && this.isConnected) {
      try {
        const startTime = Date.now();
        await this.circuitBreaker.execute(async () => {
          return Promise.race([
            this.redis!.setex(fullKey, ttl, serialized),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Redis timeout')), this.commandTimeoutMs)
            ),
          ]);
        });

        recordLatency('redis_set_latency', Date.now() - startTime);
        incrementCounter('redis_set_success');
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          incrementCounter('redis_circuit_open');
        } else {
          incrementCounter('redis_set_error');
          logger.debug('Redis set failed', {
            key,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
        // Value is already in fallback cache, so we're fine
      }
    }
  }

  /**
   * Delete value from cache.
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.buildKey(key);

    // Delete from fallback
    this.fallbackCache.delete(key);

    // Try Redis if available
    if (this.redis && this.isConnected) {
      try {
        await this.circuitBreaker.execute(async () => {
          return this.redis!.del(fullKey);
        });
        incrementCounter('redis_delete_success');
      } catch (error) {
        incrementCounter('redis_delete_error');
        // Ignore errors - key might not exist
      }
    }
  }

  /**
   * Check if key exists.
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  /**
   * Get cache stats.
   */
  getStats(): {
    redisConnected: boolean;
    redisConfigured: boolean;
    fallbackSize: number;
    circuitState: string;
  } {
    return {
      redisConnected: this.isConnected,
      redisConfigured: !!this.redisUrl,
      fallbackSize: this.fallbackCache.size,
      circuitState: this.circuitBreaker.getState().state,
    };
  }

  /**
   * Close Redis connection.
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

let defaultCache: HybridCache<unknown> | null = null;

/**
 * Get the default hybrid cache instance.
 * Uses REDIS_URL environment variable if set.
 */
export function getDefaultHybridCache(): HybridCache<unknown> {
  if (!defaultCache) {
    defaultCache = new HybridCache({
      redisUrl: process.env.REDIS_URL,
      keyPrefix: 'dsmcp:',
      defaultTtlSeconds: 3600,
    });
  }
  return defaultCache;
}

/**
 * Create a namespaced hybrid cache.
 */
export function createHybridCache<T>(
  namespace: string,
  options: Partial<RedisCacheOptions> = {}
): HybridCache<T> {
  return new HybridCache<T>({
    redisUrl: process.env.REDIS_URL,
    keyPrefix: `dsmcp:${namespace}:`,
    ...options,
  });
}
