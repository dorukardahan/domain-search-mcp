/**
 * Lightweight in-memory metrics collection.
 *
 * Tracks latencies (with percentile calculation), counters, and hit rates.
 * Designed for the /metrics endpoint and observability.
 *
 * Memory-bounded: Uses sliding window for histograms to prevent unbounded growth.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum samples per histogram (sliding window) */
const MAX_HISTOGRAM_SAMPLES = 1000;

/** Percentiles to calculate for histograms */
const PERCENTILES = [50, 90, 95, 99] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface HistogramData {
  samples: number[];
  sum: number;
  count: number;
  min: number;
  max: number;
}

interface CounterData {
  value: number;
}

interface HitRateData {
  hits: number;
  misses: number;
}

interface HistogramSummary {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

interface MetricsSummary {
  uptime_seconds: number;
  collected_at: string;
  histograms: Record<string, HistogramSummary>;
  counters: Record<string, number>;
  hit_rates: Record<string, { hits: number; misses: number; rate: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════════════════════════════════

const histograms = new Map<string, HistogramData>();
const counters = new Map<string, CounterData>();
const hitRates = new Map<string, HitRateData>();
const startTime = Date.now();

// ═══════════════════════════════════════════════════════════════════════════
// Histogram Operations (for latency tracking)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a latency value in milliseconds.
 *
 * @example
 * const start = Date.now();
 * await doWork();
 * recordLatency('rdap_lookup', Date.now() - start);
 */
export function recordLatency(name: string, ms: number): void {
  let data = histograms.get(name);

  if (!data) {
    data = {
      samples: [],
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
    };
    histograms.set(name, data);
  }

  // Sliding window: remove oldest if at capacity
  if (data.samples.length >= MAX_HISTOGRAM_SAMPLES) {
    const removed = data.samples.shift()!;
    data.sum -= removed;
    // Note: min/max become approximate after removal, but acceptable for monitoring
  }

  data.samples.push(ms);
  data.sum += ms;
  data.count++;
  data.min = Math.min(data.min, ms);
  data.max = Math.max(data.max, ms);
}

/**
 * Calculate percentile from sorted array.
 */
function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex] ?? 0; // ?? 0 for TS narrowing (array is never empty here)
}

/**
 * Get histogram summary with percentiles.
 */
function getHistogramSummary(data: HistogramData): HistogramSummary {
  const sorted = [...data.samples].sort((a, b) => a - b);

  return {
    count: data.count,
    min: data.min === Infinity ? 0 : data.min,
    max: data.max === -Infinity ? 0 : data.max,
    avg: data.samples.length > 0 ? data.sum / data.samples.length : 0,
    p50: calculatePercentile(sorted, 50),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Counter Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Increment a counter.
 *
 * @example
 * incrementCounter('rdap_requests');
 * incrementCounter('rdap_errors');
 */
export function incrementCounter(name: string, amount: number = 1): void {
  const data = counters.get(name);
  if (data) {
    data.value += amount;
  } else {
    counters.set(name, { value: amount });
  }
}

/**
 * Get current counter value.
 */
export function getCounter(name: string): number {
  return counters.get(name)?.value ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hit Rate Tracking (for caches)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a cache hit.
 *
 * @example
 * if (cache.has(key)) {
 *   recordCacheHit('domain_cache');
 *   return cache.get(key);
 * }
 * recordCacheMiss('domain_cache');
 */
export function recordCacheHit(name: string): void {
  let data = hitRates.get(name);
  if (!data) {
    data = { hits: 0, misses: 0 };
    hitRates.set(name, data);
  }
  data.hits++;
}

/**
 * Record a cache miss.
 */
export function recordCacheMiss(name: string): void {
  let data = hitRates.get(name);
  if (!data) {
    data = { hits: 0, misses: 0 };
    hitRates.set(name, data);
  }
  data.misses++;
}

/**
 * Get hit rate as percentage (0-100).
 */
export function getHitRate(name: string): number {
  const data = hitRates.get(name);
  if (!data) return 0;
  const total = data.hits + data.misses;
  return total > 0 ? (data.hits / total) * 100 : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary Export
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get complete metrics summary for /metrics endpoint.
 *
 * Returns all collected metrics with percentiles and hit rates calculated.
 */
export function getMetricsSummary(): MetricsSummary {
  const histogramSummaries: Record<string, HistogramSummary> = {};
  for (const [name, data] of histograms) {
    histogramSummaries[name] = getHistogramSummary(data);
  }

  const counterValues: Record<string, number> = {};
  for (const [name, data] of counters) {
    counterValues[name] = data.value;
  }

  const hitRateSummaries: Record<
    string,
    { hits: number; misses: number; rate: number }
  > = {};
  for (const [name, data] of hitRates) {
    const total = data.hits + data.misses;
    hitRateSummaries[name] = {
      hits: data.hits,
      misses: data.misses,
      rate: total > 0 ? Math.round((data.hits / total) * 10000) / 100 : 0,
    };
  }

  return {
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    collected_at: new Date().toISOString(),
    histograms: histogramSummaries,
    counters: counterValues,
    hit_rates: hitRateSummaries,
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics(): void {
  histograms.clear();
  counters.clear();
  hitRates.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Timer helper for measuring async operation latency.
 *
 * @example
 * const stop = startTimer('api_call');
 * try {
 *   await apiCall();
 * } finally {
 *   stop(); // Records latency automatically
 * }
 */
export function startTimer(metricName: string): () => number {
  const start = Date.now();
  return () => {
    const elapsed = Date.now() - start;
    recordLatency(metricName, elapsed);
    return elapsed;
  };
}

/**
 * Wrap an async function with automatic latency recording.
 *
 * @example
 * const timedFetch = withLatency('fetch_data', fetchData);
 * await timedFetch(url);
 */
export function withLatency<T extends (...args: unknown[]) => Promise<unknown>>(
  metricName: string,
  fn: T,
): T {
  return (async (...args: Parameters<T>) => {
    const stop = startTimer(metricName);
    try {
      return await fn(...args);
    } finally {
      stop();
    }
  }) as T;
}
