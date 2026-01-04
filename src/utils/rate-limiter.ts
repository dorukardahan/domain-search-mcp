/**
 * Simple in-memory rate limiter for MCP tool calls.
 *
 * P3 FIX: Prevents rapid-fire requests that could abuse external APIs.
 * Uses sliding window algorithm for smooth rate limiting.
 */

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly requests: Map<string, number[]> = new Map();

  /**
   * Create a new rate limiter.
   *
   * @param maxRequests - Maximum requests allowed per window
   * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   */
  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed for the given key.
   * If allowed, records the request.
   *
   * @param key - Identifier for the rate limit bucket (e.g., 'suggest_domains')
   * @returns true if request is allowed, false if rate limited
   */
  tryRequest(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request history for this key
    let history = this.requests.get(key);
    if (!history) {
      history = [];
      this.requests.set(key, history);
    }

    // Remove expired requests (outside the window)
    const validRequests = history.filter((timestamp) => timestamp > windowStart);

    // Check if we're at the limit
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Record this request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Get remaining requests for a key.
   */
  getRemaining(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const history = this.requests.get(key) || [];
    const validRequests = history.filter((timestamp) => timestamp > windowStart);
    return Math.max(0, this.maxRequests - validRequests.length);
  }

  /**
   * Get time until the rate limit resets (in ms).
   */
  getResetTime(key: string): number {
    const history = this.requests.get(key);
    if (!history || history.length === 0) {
      return 0;
    }
    const oldestRequest = Math.min(...history);
    const resetTime = oldestRequest + this.windowMs - Date.now();
    return Math.max(0, resetTime);
  }

  /**
   * Clear all rate limit data (for testing).
   */
  clear(): void {
    this.requests.clear();
  }
}

/**
 * Global rate limiter for AI inference calls.
 * Limits to 30 AI requests per minute to protect VPS.
 */
export const inferenceRateLimiter = new RateLimiter(30, 60000);

/**
 * Global rate limiter for domain search calls.
 * More generous: 120 requests per minute.
 */
export const searchRateLimiter = new RateLimiter(120, 60000);

/**
 * Check rate limit and throw if exceeded.
 */
export function checkRateLimit(
  limiter: RateLimiter,
  key: string,
  operationName: string,
): void {
  if (!limiter.tryRequest(key)) {
    const resetSeconds = Math.ceil(limiter.getResetTime(key) / 1000);
    throw new Error(
      `Rate limit exceeded for ${operationName}. ` +
      `Please wait ${resetSeconds} seconds before trying again.`
    );
  }
}
