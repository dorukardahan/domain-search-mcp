/**
 * Base Registrar Adapter.
 *
 * Abstract class that all registrar adapters extend.
 * Provides common functionality:
 * - Rate limiting (token bucket)
 * - Retry with exponential backoff
 * - Error handling and logging
 */

import type { DomainResult, TLDInfo } from '../types.js';
import { logger } from '../utils/logger.js';
import {
  RateLimitError,
  RegistrarApiError,
  TimeoutError,
  wrapError,
} from '../utils/errors.js';
import { config } from '../config.js';

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(maxPerMinute: number = 60) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillRate = maxPerMinute / 60; // Convert to per-second
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token. Returns true if successful.
   */
  tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available.
   */
  async waitForToken(): Promise<void> {
    while (!this.tryConsume()) {
      // Calculate wait time for next token
      const waitMs = Math.ceil(1000 / this.refillRate);
      await sleep(waitMs);
    }
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const refillAmount = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + refillAmount);
    this.lastRefill = now;
  }

  /**
   * Get seconds until next token is available.
   */
  getWaitSeconds(): number {
    if (this.tokens >= 1) return 0;
    const neededTokens = 1 - this.tokens;
    return Math.ceil(neededTokens / this.refillRate);
  }
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Abstract base class for registrar adapters.
 */
export abstract class RegistrarAdapter {
  /** Human-readable name of the registrar */
  abstract readonly name: string;

  /** Identifier used in results */
  abstract readonly id: string;

  /** Rate limiter for this registrar */
  protected readonly rateLimiter: RateLimiter;

  /** Max retry attempts */
  protected readonly maxRetries: number = 3;

  /** Base delay for exponential backoff (ms) */
  protected readonly baseDelayMs: number = 2000;

  /** Request timeout (ms) */
  protected readonly timeoutMs: number = 10000;

  constructor(requestsPerMinute: number = 60) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
  }

  /**
   * Check domain availability and get pricing.
   * This is the main method each adapter must implement.
   */
  abstract search(domain: string, tld: string): Promise<DomainResult>;

  /**
   * Get information about a TLD.
   * Optional - not all registrars provide this.
   */
  abstract getTldInfo(tld: string): Promise<TLDInfo | null>;

  /**
   * Check if this adapter is enabled (has required credentials).
   */
  abstract isEnabled(): boolean;

  /**
   * Execute a function with rate limiting.
   */
  protected async rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should even try (dry run mode)
    if (config.dryRun) {
      throw new RegistrarApiError(this.name, 'Dry run mode - no API calls made');
    }

    // Wait for rate limit
    const waitSeconds = this.rateLimiter.getWaitSeconds();
    if (waitSeconds > 0) {
      logger.debug(`Rate limiting: waiting ${waitSeconds}s for ${this.name}`);
    }
    await this.rateLimiter.waitForToken();

    return fn();
  }

  /**
   * Execute with retry and exponential backoff.
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operation: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.rateLimitedCall(fn);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const wrapped = wrapError(error);
        if (!wrapped.retryable) {
          throw wrapped;
        }

        // Check if it's a rate limit error with retry-after
        if (error instanceof RateLimitError && error.retryAfter) {
          const waitMs = error.retryAfter - Date.now();
          if (waitMs > 0 && waitMs < 60000) {
            logger.info(`Rate limited, waiting ${waitMs}ms`, {
              registrar: this.name,
              attempt,
            });
            await sleep(waitMs);
            continue;
          }
        }

        // Exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`Retry ${attempt}/${this.maxRetries} for ${operation}`, {
            registrar: this.name,
            delay_ms: delay,
            error: lastError.message,
          });
          await sleep(delay);
        }
      }
    }

    // All retries failed
    throw lastError || new Error(`Failed after ${this.maxRetries} retries`);
  }

  /**
   * Create a timeout wrapper for a promise.
   */
  protected withTimeout<T>(
    promise: Promise<T>,
    operation: string,
    timeoutMs: number = this.timeoutMs,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(operation, timeoutMs));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Log an error with context.
   */
  protected logError(error: Error, context?: Record<string, unknown>): void {
    logger.logError(`${this.name} error`, error, {
      registrar: this.id,
      ...context,
    });
  }

  /**
   * Create a standardized DomainResult.
   */
  protected createResult(
    domain: string,
    tld: string,
    data: Partial<DomainResult>,
  ): DomainResult {
    return {
      domain: `${domain}.${tld}`,
      available: data.available ?? false,
      premium: data.premium ?? false,
      price_first_year: data.price_first_year ?? null,
      price_renewal: data.price_renewal ?? null,
      currency: data.currency ?? 'USD',
      privacy_included: data.privacy_included ?? false,
      transfer_price: data.transfer_price ?? null,
      registrar: this.id,
      source: data.source ?? (`${this.id}_api` as DomainResult['source']),
      checked_at: new Date().toISOString(),
      premium_reason: data.premium_reason,
      tld_restrictions: data.tld_restrictions,
      score: data.score,
    };
  }
}
