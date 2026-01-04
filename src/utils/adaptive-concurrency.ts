/**
 * Adaptive Concurrency Limiter.
 *
 * Dynamically adjusts concurrency based on real-time performance metrics.
 * Unlike circuit breaker (which blocks traffic), this maintains flow but
 * adjusts intensity based on success/error rates and latency.
 *
 * Behavior:
 * - Starts at minConcurrency
 * - Increases towards maxConcurrency when error rate is low
 * - Decreases when errors or timeouts spike
 * - Uses AIMD (Additive Increase, Multiplicative Decrease) algorithm
 */

import { logger } from './logger.js';
import { recordLatency, incrementCounter } from './metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface AdaptiveConcurrencyOptions {
  /** Name for logging and metrics */
  name: string;

  /** Minimum concurrency limit (floor) */
  minConcurrency?: number;

  /** Maximum concurrency limit (ceiling) */
  maxConcurrency?: number;

  /** Starting concurrency */
  initialConcurrency?: number;

  /** Error rate threshold to trigger decrease (0-1) */
  errorThreshold?: number;

  /** Latency threshold (ms) to trigger decrease */
  latencyThresholdMs?: number;

  /** Window size in ms for calculating metrics */
  windowMs?: number;

  /** Minimum samples before adjusting */
  minSamples?: number;

  /** How often to evaluate and adjust (ms) */
  evaluationIntervalMs?: number;
}

const DEFAULT_OPTIONS = {
  minConcurrency: 2,
  maxConcurrency: 20,
  initialConcurrency: 5,
  errorThreshold: 0.1,        // 10% error rate
  latencyThresholdMs: 2000,   // 2 second average latency
  windowMs: 30_000,           // 30 second window
  minSamples: 10,             // Need at least 10 samples
  evaluationIntervalMs: 5_000, // Evaluate every 5 seconds
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Sample {
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Concurrency Limiter
// ═══════════════════════════════════════════════════════════════════════════

export class AdaptiveConcurrencyLimiter {
  private readonly name: string;
  private readonly minConcurrency: number;
  private readonly maxConcurrency: number;
  private readonly errorThreshold: number;
  private readonly latencyThresholdMs: number;
  private readonly windowMs: number;
  private readonly minSamples: number;
  private readonly evaluationIntervalMs: number;

  private currentConcurrency: number;
  private active = 0;
  private queue: Array<() => void> = [];
  private samples: Sample[] = [];
  private evaluationTimer: ReturnType<typeof setInterval> | null = null;
  private lastAdjustment = 0;

  constructor(options: AdaptiveConcurrencyOptions) {
    this.name = options.name;
    this.minConcurrency = options.minConcurrency ?? DEFAULT_OPTIONS.minConcurrency;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_OPTIONS.maxConcurrency;
    this.currentConcurrency = options.initialConcurrency ?? DEFAULT_OPTIONS.initialConcurrency;
    this.errorThreshold = options.errorThreshold ?? DEFAULT_OPTIONS.errorThreshold;
    this.latencyThresholdMs = options.latencyThresholdMs ?? DEFAULT_OPTIONS.latencyThresholdMs;
    this.windowMs = options.windowMs ?? DEFAULT_OPTIONS.windowMs;
    this.minSamples = options.minSamples ?? DEFAULT_OPTIONS.minSamples;
    this.evaluationIntervalMs = options.evaluationIntervalMs ?? DEFAULT_OPTIONS.evaluationIntervalMs;

    // Start periodic evaluation
    this.startEvaluation();
  }

  /**
   * Execute a function with adaptive concurrency limiting.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    const startTime = Date.now();

    try {
      const result = await fn();
      this.recordSample(Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordSample(Date.now() - startTime, false);
      throw error;
    } finally {
      this.release();
    }
  }

  /**
   * Get current state (for monitoring).
   */
  getState(): {
    name: string;
    currentConcurrency: number;
    minConcurrency: number;
    maxConcurrency: number;
    activeRequests: number;
    queuedRequests: number;
    recentErrorRate: number;
    recentAvgLatency: number;
    sampleCount: number;
  } {
    const metrics = this.calculateMetrics();
    return {
      name: this.name,
      currentConcurrency: this.currentConcurrency,
      minConcurrency: this.minConcurrency,
      maxConcurrency: this.maxConcurrency,
      activeRequests: this.active,
      queuedRequests: this.queue.length,
      recentErrorRate: metrics.errorRate,
      recentAvgLatency: metrics.avgLatency,
      sampleCount: this.samples.length,
    };
  }

  /**
   * Stop the evaluation timer (for cleanup).
   */
  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private acquire(): Promise<void> {
    if (this.active < this.currentConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  private recordSample(latencyMs: number, success: boolean): void {
    this.samples.push({
      timestamp: Date.now(),
      latencyMs,
      success,
    });

    // Record to metrics system
    recordLatency(`adaptive_${this.name}_latency`, latencyMs);
    incrementCounter(`adaptive_${this.name}_${success ? 'success' : 'error'}`);

    // Prune old samples
    this.pruneOldSamples();
  }

  private pruneOldSamples(): void {
    const cutoff = Date.now() - this.windowMs;
    this.samples = this.samples.filter(s => s.timestamp > cutoff);
  }

  private calculateMetrics(): { errorRate: number; avgLatency: number } {
    this.pruneOldSamples();

    if (this.samples.length === 0) {
      return { errorRate: 0, avgLatency: 0 };
    }

    const errors = this.samples.filter(s => !s.success).length;
    const errorRate = errors / this.samples.length;

    const totalLatency = this.samples.reduce((sum, s) => sum + s.latencyMs, 0);
    const avgLatency = totalLatency / this.samples.length;

    return { errorRate, avgLatency };
  }

  private startEvaluation(): void {
    this.evaluationTimer = setInterval(() => {
      this.evaluate();
    }, this.evaluationIntervalMs);
  }

  private evaluate(): void {
    this.pruneOldSamples();

    // Need minimum samples before adjusting
    if (this.samples.length < this.minSamples) {
      return;
    }

    const metrics = this.calculateMetrics();
    const oldConcurrency = this.currentConcurrency;

    // AIMD: Additive Increase, Multiplicative Decrease
    if (metrics.errorRate > this.errorThreshold) {
      // High error rate → decrease by 50%
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.5)
      );
      incrementCounter(`adaptive_${this.name}_decrease`);
    } else if (metrics.avgLatency > this.latencyThresholdMs) {
      // High latency → decrease by 25%
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.75)
      );
      incrementCounter(`adaptive_${this.name}_decrease`);
    } else if (
      metrics.errorRate < this.errorThreshold * 0.5 &&
      metrics.avgLatency < this.latencyThresholdMs * 0.5
    ) {
      // Everything healthy → increase by 1
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        this.currentConcurrency + 1
      );
      incrementCounter(`adaptive_${this.name}_increase`);
    }

    // Log significant changes
    if (this.currentConcurrency !== oldConcurrency) {
      this.lastAdjustment = Date.now();
      logger.debug('Adaptive concurrency adjusted', {
        name: this.name,
        from: oldConcurrency,
        to: this.currentConcurrency,
        errorRate: metrics.errorRate.toFixed(3),
        avgLatency: Math.round(metrics.avgLatency),
        sampleCount: this.samples.length,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

const adaptiveLimiters = new Map<string, AdaptiveConcurrencyLimiter>();

/**
 * Get or create an adaptive concurrency limiter by name.
 */
export function getAdaptiveLimiter(
  options: AdaptiveConcurrencyOptions
): AdaptiveConcurrencyLimiter {
  let limiter = adaptiveLimiters.get(options.name);

  if (!limiter) {
    limiter = new AdaptiveConcurrencyLimiter(options);
    adaptiveLimiters.set(options.name, limiter);
  }

  return limiter;
}

/**
 * Get all adaptive limiter states (for /metrics endpoint).
 */
export function getAllAdaptiveStates(): Array<ReturnType<AdaptiveConcurrencyLimiter['getState']>> {
  return Array.from(adaptiveLimiters.values()).map(l => l.getState());
}

/**
 * Stop all adaptive limiters (for cleanup/testing).
 */
export function stopAllAdaptiveLimiters(): void {
  for (const limiter of adaptiveLimiters.values()) {
    limiter.stop();
  }
}
