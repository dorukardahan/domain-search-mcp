import { AdaptiveConcurrencyLimiter } from '../../src/utils/adaptive-concurrency';

describe('AdaptiveConcurrencyLimiter', () => {
  it('does not keep the Node process alive with its evaluation timer', () => {
    const limiter = new AdaptiveConcurrencyLimiter({
      name: 'test-unref',
      evaluationIntervalMs: 60_000,
    });

    try {
      const timer = (
        limiter as unknown as {
          evaluationTimer: NodeJS.Timeout;
        }
      ).evaluationTimer;

      expect(timer.hasRef()).toBe(false);
    } finally {
      limiter.stop();
    }
  });
});
