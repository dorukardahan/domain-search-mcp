/**
 * Circuit Breaker Pattern Implementation.
 *
 * Prevents cascading failures by temporarily blocking requests to failing services.
 * After a cooldown period, allows a probe request to test if service recovered.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests blocked immediately
 * - HALF_OPEN: Testing recovery, single request allowed
 */

import { logger } from './logger.js';
import { incrementCounter, recordLatency } from './metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface CircuitBreakerOptions {
  /** Name for logging and metrics */
  name: string;

  /** Number of failures before opening circuit */
  failureThreshold?: number;

  /** Time in ms before attempting recovery (half-open) */
  resetTimeoutMs?: number;

  /** Time window in ms for counting failures */
  failureWindowMs?: number;

  /** Number of successes in half-open needed to close circuit */
  successThreshold?: number;
}

const DEFAULT_OPTIONS = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,    // 30 seconds
  failureWindowMs: 60_000,   // 1 minute
  successThreshold: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type CircuitState = 'closed' | 'open' | 'half_open';

interface FailureRecord {
  timestamp: number;
  error: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Circuit Breaker Error
// ═══════════════════════════════════════════════════════════════════════════

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly openedAt: number;
  public readonly resetAt: number;

  constructor(name: string, openedAt: number, resetTimeoutMs: number) {
    const resetAt = openedAt + resetTimeoutMs;
    const remainingMs = Math.max(0, resetAt - Date.now());
    super(`Circuit breaker '${name}' is OPEN. Retry in ${Math.ceil(remainingMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.openedAt = openedAt;
    this.resetAt = resetAt;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Circuit Breaker Class
// ═══════════════════════════════════════════════════════════════════════════

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly failureWindowMs: number;
  private readonly successThreshold: number;

  private state: CircuitState = 'closed';
  private failures: FailureRecord[] = [];
  private lastFailureTime = 0;
  private halfOpenSuccesses = 0;
  private openedAt = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs ?? DEFAULT_OPTIONS.resetTimeoutMs;
    this.failureWindowMs = options.failureWindowMs ?? DEFAULT_OPTIONS.failureWindowMs;
    this.successThreshold = options.successThreshold ?? DEFAULT_OPTIONS.successThreshold;
  }

  /**
   * Execute a function with circuit breaker protection.
   *
   * @throws CircuitOpenError if circuit is open
   * @throws Original error if function fails and circuit stays closed
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should block
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half_open');
      } else {
        incrementCounter(`circuit_${this.name}_rejected`);
        throw new CircuitOpenError(this.name, this.openedAt, this.resetTimeoutMs);
      }
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if circuit should transition from open to half-open.
   */
  private shouldAttemptReset(): boolean {
    return Date.now() >= this.openedAt + this.resetTimeoutMs;
  }

  /**
   * Handle successful execution.
   */
  private onSuccess(latencyMs: number): void {
    recordLatency(`circuit_${this.name}_latency`, latencyMs);
    incrementCounter(`circuit_${this.name}_success`);

    if (this.state === 'half_open') {
      this.halfOpenSuccesses++;

      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.transitionTo('closed');
        logger.info('Circuit breaker recovered', {
          name: this.name,
          state: 'closed',
          successCount: this.halfOpenSuccesses,
        });
      }
    } else if (this.state === 'closed') {
      // Clear old failures on success
      this.pruneOldFailures();
    }
  }

  /**
   * Handle failed execution.
   */
  private onFailure(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    incrementCounter(`circuit_${this.name}_failure`);

    if (this.state === 'half_open') {
      // Any failure in half-open goes back to open
      this.transitionTo('open');
      logger.warn('Circuit breaker reopened (half-open failure)', {
        name: this.name,
        error: errorMessage,
      });
      return;
    }

    // Record failure
    this.failures.push({
      timestamp: Date.now(),
      error: errorMessage,
    });
    this.lastFailureTime = Date.now();

    // Prune old failures outside window
    this.pruneOldFailures();

    // Check if threshold exceeded
    if (this.failures.length >= this.failureThreshold) {
      this.transitionTo('open');
      logger.warn('Circuit breaker opened', {
        name: this.name,
        failures: this.failures.length,
        threshold: this.failureThreshold,
        recentErrors: this.failures.slice(-3).map(f => f.error),
      });
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'open') {
      this.openedAt = Date.now();
      this.halfOpenSuccesses = 0;
      incrementCounter(`circuit_${this.name}_opened`);
    } else if (newState === 'closed') {
      this.failures = [];
      this.halfOpenSuccesses = 0;
      incrementCounter(`circuit_${this.name}_closed`);
    } else if (newState === 'half_open') {
      this.halfOpenSuccesses = 0;
      incrementCounter(`circuit_${this.name}_half_open`);
    }

    logger.debug('Circuit breaker state change', {
      name: this.name,
      from: oldState,
      to: newState,
    });
  }

  /**
   * Remove failures outside the time window.
   */
  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.failureWindowMs;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  /**
   * Get current circuit state (for monitoring).
   */
  getState(): {
    name: string;
    state: CircuitState;
    failures: number;
    lastFailure: number | null;
    openedAt: number | null;
  } {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      lastFailure: this.lastFailureTime || null,
      openedAt: this.state === 'open' ? this.openedAt : null,
    };
  }

  /**
   * Manually reset the circuit (for testing/admin).
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.openedAt = 0;

    logger.info('Circuit breaker manually reset', { name: this.name });
  }

  /**
   * Check if circuit is currently allowing requests.
   */
  isAllowingRequests(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half_open') return true;
    if (this.state === 'open' && this.shouldAttemptReset()) return true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Circuit Breaker Registry
// ═══════════════════════════════════════════════════════════════════════════

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker by name.
 */
export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  let breaker = circuitBreakers.get(options.name);

  if (!breaker) {
    breaker = new CircuitBreaker(options);
    circuitBreakers.set(options.name, breaker);
  }

  return breaker;
}

/**
 * Get all circuit breaker states (for /metrics endpoint).
 */
export function getAllCircuitStates(): Array<ReturnType<CircuitBreaker['getState']>> {
  return Array.from(circuitBreakers.values()).map(cb => cb.getState());
}

/**
 * Reset all circuit breakers (for testing).
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}
