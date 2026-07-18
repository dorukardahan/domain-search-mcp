import { logger, withLoggerSuppressed } from '../../src/utils/logger';

describe('withLoggerSuppressed', () => {
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stderr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stderr.mockRestore();
  });

  it('suppresses logger output for a synchronous operation only', () => {
    const result = withLoggerSuppressed(() => {
      logger.warn('protected sync candidate', { domain: 'secret-root.com' });
      return 42;
    });

    logger.warn('normal operation resumed');

    expect(result).toBe(42);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls.flat().join('\n')).toContain('normal operation resumed');
    expect(stderr.mock.calls.flat().join('\n')).not.toContain('secret-root.com');
  });

  it('keeps logger output suppressed across asynchronous boundaries', async () => {
    await withLoggerSuppressed(async () => {
      logger.warn('protected before await', { name: 'private-candidate' });
      await Promise.resolve();
      logger.warn('protected after await', { domain: 'private-candidate.com' });
    });

    expect(stderr).not.toHaveBeenCalled();
  });

  it('restores normal logging when a suppressed operation rejects', async () => {
    const failure = new Error('provider failed');

    await expect(withLoggerSuppressed(async () => {
      logger.error('protected rejection', { name: 'private-rejection' });
      throw failure;
    })).rejects.toBe(failure);

    logger.warn('normal logging after rejection');

    expect(stderr).toHaveBeenCalledTimes(1);
    const output = stderr.mock.calls.flat().join('\n');
    expect(output).toContain('normal logging after rejection');
    expect(output).not.toContain('private-rejection');
  });

  it('isolates concurrent suppressed and non-suppressed operations', async () => {
    let releaseSuppressed!: () => void;
    let suppressedStarted!: () => void;
    const suppressedGate = new Promise<void>((resolve) => {
      releaseSuppressed = resolve;
    });
    const started = new Promise<void>((resolve) => {
      suppressedStarted = resolve;
    });

    const suppressed = withLoggerSuppressed(async () => {
      logger.warn('protected concurrent start', { name: 'concurrent-secret' });
      suppressedStarted();
      await suppressedGate;
      logger.warn('protected concurrent end', { domain: 'concurrent-secret.com' });
    });

    await started;
    logger.warn('visible concurrent operation');
    releaseSuppressed();
    await suppressed;

    expect(stderr).toHaveBeenCalledTimes(1);
    const output = stderr.mock.calls.flat().join('\n');
    expect(output).toContain('visible concurrent operation');
    expect(output).not.toContain('concurrent-secret');
  });
});
