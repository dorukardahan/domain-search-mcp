/**
 * Concurrency limiters for async work.
 *
 * Keeps upstream services from being flooded and helps control latency.
 */

export class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
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
}

export class KeyedLimiter {
  private readonly limiters = new Map<string, ConcurrencyLimiter>();

  constructor(private readonly limit: number) {}

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = new ConcurrencyLimiter(this.limit);
      this.limiters.set(key, limiter);
    }
    return limiter.run(fn);
  }
}
