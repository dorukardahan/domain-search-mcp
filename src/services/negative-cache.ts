/**
 * Federated Negative Cache Client.
 *
 * Reports taken domains to a central backend and queries known-taken domains
 * for pre-filtering suggestions. This reduces redundant availability checks
 * by leveraging community-reported data.
 *
 * Features:
 * - Async batch reporting (non-blocking)
 * - Local query caching
 * - Expiring domain queries
 * - Graceful degradation when backend unavailable
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ConcurrencyLimiter } from '../utils/concurrency.js';
import { TtlCache } from '../utils/cache.js';
import type { DataSource } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Domain info to report as taken.
 */
export interface TakenDomainReport {
  fqdn: string;
  expires_at?: string;
  registered_at?: string;
  source: DataSource;
}

/**
 * Response from query endpoint.
 */
export interface NegativeCacheQueryResult {
  /** Set of FQDNs that are known to be taken */
  taken: Set<string>;
  /** FQDNs not found in cache (unknown status) */
  unknown: string[];
  /** Cache hit rate for this query */
  hitRate: number;
}

/**
 * Expiring domain info.
 */
export interface ExpiringDomain {
  fqdn: string;
  expires_at: string;
  days_until_expiration: number;
}

/**
 * Response from expiring endpoint.
 */
export interface ExpiringDomainsResult {
  domains: ExpiringDomain[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE
// ═══════════════════════════════════════════════════════════════════════════

/** Concurrency limiter for API requests */
const limiter = new ConcurrencyLimiter(config.negativeCache.concurrency);

/** Local cache for query results (fqdn -> taken status) */
const localCache = new TtlCache<boolean>(
  config.negativeCache.localCacheTtl,
  50000, // Max 50k entries
);

/** Pending reports to batch */
let pendingReports: TakenDomainReport[] = [];

/** Debounce timer for batch reporting */
let reportTimer: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize base URL (remove trailing slashes).
 */
function normalizeBaseUrl(baseUrl?: string): string | null {
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Build request headers with optional auth.
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.negativeCache.token) {
    headers.Authorization = `Bearer ${config.negativeCache.token}`;
  }
  return headers;
}

/**
 * Fetch JSON with timeout.
 */
async function fetchJson<T>(
  url: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
    timeoutMs: number;
  },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: buildHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug('Negative cache request timed out', { url });
    }
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flush pending reports to backend.
 */
async function flushReports(): Promise<void> {
  if (pendingReports.length === 0) return;

  const baseUrl = normalizeBaseUrl(config.negativeCache.baseUrl);
  if (!baseUrl) return;

  // Take current batch and clear pending
  const batch = pendingReports.splice(0, config.negativeCache.reportBatchSize);

  try {
    await limiter.run(async () => {
      const { ok, status } = await fetchJson<{ accepted: number }>(
        `${baseUrl}/report`,
        {
          method: 'POST',
          body: { domains: batch },
          timeoutMs: config.negativeCache.timeoutMs,
        },
      );

      if (!ok) {
        logger.debug('Negative cache report failed', { status, count: batch.length });
      } else {
        logger.debug('Negative cache reported domains', { count: batch.length });

        // Update local cache with reported domains
        for (const report of batch) {
          localCache.set(`taken:${report.fqdn.toLowerCase()}`, true);
        }
      }
    });
  } catch (error) {
    logger.debug('Negative cache report error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // If more pending, schedule another flush
  if (pendingReports.length > 0) {
    scheduleFlush();
  }
}

/**
 * Schedule a debounced flush.
 */
function scheduleFlush(): void {
  if (reportTimer) return; // Already scheduled

  reportTimer = setTimeout(() => {
    reportTimer = null;
    flushReports().catch(() => {
      // Ignore errors - reporting is best-effort
    });
  }, config.negativeCache.reportDebounceMs);
}

/**
 * Report domains as taken (async, non-blocking).
 *
 * Batches reports and sends them periodically to reduce API calls.
 * This is fire-and-forget - errors are logged but not thrown.
 */
export function reportTakenDomains(domains: TakenDomainReport[]): void {
  if (!config.negativeCache.enabled) return;

  // Add to pending queue
  pendingReports.push(...domains);

  // Immediately update local cache
  for (const domain of domains) {
    localCache.set(`taken:${domain.fqdn.toLowerCase()}`, true);
  }

  // Flush if batch is full, otherwise schedule debounced flush
  if (pendingReports.length >= config.negativeCache.reportBatchSize) {
    flushReports().catch(() => {});
  } else {
    scheduleFlush();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query the negative cache for known-taken domains.
 *
 * Returns a Set of FQDNs that are known to be taken.
 * Unknown domains should still be checked via normal availability APIs.
 */
export async function queryTakenDomains(
  fqdns: string[],
): Promise<NegativeCacheQueryResult> {
  const taken = new Set<string>();
  const toQuery: string[] = [];

  // Check local cache first
  for (const fqdn of fqdns) {
    const normalized = fqdn.toLowerCase();
    const cached = localCache.get(`taken:${normalized}`);
    if (cached === true) {
      taken.add(normalized);
    } else if (cached === undefined) {
      toQuery.push(normalized);
    }
    // If cached === false, it's known available (don't add to taken or query)
  }

  // If nothing to query or backend disabled, return local results
  if (toQuery.length === 0 || !config.negativeCache.enabled) {
    return {
      taken,
      unknown: toQuery,
      hitRate: fqdns.length > 0 ? taken.size / fqdns.length : 0,
    };
  }

  const baseUrl = normalizeBaseUrl(config.negativeCache.baseUrl);
  if (!baseUrl) {
    return { taken, unknown: toQuery, hitRate: taken.size / fqdns.length };
  }

  // Query backend for unknown domains
  try {
    const result = await limiter.run(async () => {
      const { ok, data } = await fetchJson<{
        taken: Array<{ fqdn: string; expires_at?: string }>;
        unknown: string[];
      }>(`${baseUrl}/query`, {
        method: 'POST',
        body: { domains: toQuery, include_expiry: false },
        timeoutMs: config.negativeCache.timeoutMs,
      });

      if (!ok || !data) {
        return null;
      }

      return data;
    });

    if (result) {
      // Update local cache and result set
      for (const item of result.taken) {
        const normalized = item.fqdn.toLowerCase();
        taken.add(normalized);
        localCache.set(`taken:${normalized}`, true);
      }

      // Cache misses as "not taken" (will expire and be rechecked)
      for (const fqdn of result.unknown) {
        localCache.set(`taken:${fqdn.toLowerCase()}`, false);
      }

      logger.debug('Negative cache query result', {
        queried: toQuery.length,
        found_taken: result.taken.length,
        unknown: result.unknown.length,
      });

      return {
        taken,
        unknown: result.unknown,
        hitRate: taken.size / fqdns.length,
      };
    }
  } catch (error) {
    logger.debug('Negative cache query error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // On error, return what we have from local cache
  return { taken, unknown: toQuery, hitRate: taken.size / fqdns.length };
}

/**
 * Check if a single domain is known to be taken.
 *
 * Fast path that only checks local cache.
 * Returns undefined if unknown (should check normally).
 */
export function isKnownTaken(fqdn: string): boolean | undefined {
  if (!config.negativeCache.enabled) return undefined;
  return localCache.get(`taken:${fqdn.toLowerCase()}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRING DOMAINS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get domains that are about to expire.
 */
export async function getExpiringDomains(options: {
  tlds?: string[];
  days?: number;
  limit?: number;
  keywords?: string;
} = {}): Promise<ExpiringDomainsResult> {
  if (!config.negativeCache.enabled) {
    return { domains: [], total: 0 };
  }

  const baseUrl = normalizeBaseUrl(config.negativeCache.baseUrl);
  if (!baseUrl) {
    return { domains: [], total: 0 };
  }

  const { tlds, days = 30, limit = 25, keywords } = options;

  try {
    const queryParams = new URLSearchParams();
    if (tlds && tlds.length > 0) queryParams.set('tlds', tlds.join(','));
    queryParams.set('days', String(days));
    queryParams.set('limit', String(limit));
    if (keywords) queryParams.set('keywords', keywords);

    const result = await limiter.run(async () => {
      const { ok, data } = await fetchJson<{
        domains: ExpiringDomain[];
        total: number;
      }>(`${baseUrl}/expiring?${queryParams.toString()}`, {
        method: 'GET',
        timeoutMs: config.negativeCache.timeoutMs,
      });

      if (!ok || !data) {
        return null;
      }

      return data;
    });

    if (result) {
      logger.debug('Fetched expiring domains', {
        count: result.domains.length,
        total: result.total,
      });
      return result;
    }
  } catch (error) {
    logger.debug('Failed to fetch expiring domains', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { domains: [], total: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get local cache stats.
 */
export function getCacheStats(): { size: number; hitRate: number } {
  return {
    size: localCache.size,
    hitRate: 0, // Would need to track hits/misses
  };
}

/**
 * Clear local cache (for testing).
 */
export function clearLocalCache(): void {
  localCache.clear();
}
