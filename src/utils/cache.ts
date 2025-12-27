/**
 * TTL-based In-Memory Cache.
 *
 * Simple but effective caching for domain availability and pricing.
 * Reduces API calls and improves response times.
 */

import { config } from '../config.js';
import { logger } from './logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Default maximum cache size to prevent memory exhaustion.
 * With ~1KB per entry average, 10000 entries ≈ 10MB max.
 */
const DEFAULT_MAX_CACHE_SIZE = 10000;

/**
 * Generic TTL cache with automatic expiration and size limits.
 *
 * SECURITY: Implements max size to prevent memory DoS attacks.
 * When at capacity, evicts least-recently-used (LRU) entries.
 */
export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTtlSeconds: number = 300, maxSize: number = DEFAULT_MAX_CACHE_SIZE) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
    this.maxSize = maxSize;

    // Clean up expired entries every minute
    // .unref() prevents this interval from keeping the process alive
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref();
  }

  /**
   * Get a value from cache if it exists and hasn't expired.
   * Updates lastAccessedAt for LRU tracking.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update last accessed time for LRU
    entry.lastAccessedAt = now;

    logger.debug('Cache hit', { key, age_ms: now - entry.createdAt });
    return entry.value;
  }

  /**
   * Set a value in cache with optional custom TTL.
   * Implements LRU eviction when cache is at capacity.
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttlMs ?? this.defaultTtlMs);

    // If key already exists, just update it
    if (this.cache.has(key)) {
      this.cache.set(key, {
        value,
        expiresAt,
        createdAt: now,
        lastAccessedAt: now,
      });
      return;
    }

    // If at capacity, evict least recently used entries
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: now,
      lastAccessedAt: now,
    });

    logger.debug('Cache set', {
      key,
      ttl_ms: expiresAt - now,
      size: this.cache.size,
    });
  }

  /**
   * Evict least recently used entry.
   * Called when cache is at capacity.
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Cache LRU eviction', { evicted_key: oldestKey });
    }
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const value = this.get(key);
    return value !== undefined;
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get the number of entries in cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cache cleanup', { removed, remaining: this.cache.size });
    }
  }

  /**
   * Stop the cleanup interval (for testing/shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Domain-Specific Caches
// ═══════════════════════════════════════════════════════════════════════════

import type { DomainResult, TLDInfo } from '../types.js';

/**
 * Generate a cache key for domain availability.
 */
export function domainCacheKey(domain: string, source: string): string {
  return `domain:${domain.toLowerCase()}:${source}`;
}

/**
 * Generate a cache key for TLD info.
 */
export function tldCacheKey(tld: string): string {
  return `tld:${tld.toLowerCase()}`;
}

/**
 * Global cache instances.
 */
export const domainCache = new TtlCache<DomainResult>(
  config.cache.availabilityTtl,
);

export const pricingCache = new TtlCache<DomainResult[]>(config.cache.pricingTtl);

export const tldCache = new TtlCache<TLDInfo>(86400); // 24 hours for TLD info

/**
 * Get or compute a domain result.
 */
export async function getOrCompute<T>(
  cache: TtlCache<T>,
  key: string,
  compute: () => Promise<T>,
  ttlMs?: number,
): Promise<{ value: T; fromCache: boolean }> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return { value: cached, fromCache: true };
  }

  const value = await compute();
  cache.set(key, value, ttlMs);
  return { value, fromCache: false };
}
