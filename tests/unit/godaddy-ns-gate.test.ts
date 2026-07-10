import { resolveNs } from 'node:dns/promises';
import { gateGodaddyAvailability } from '../../src/fallbacks/godaddy-ns-gate';
import { logger } from '../../src/utils/logger';
import type { DomainResult } from '../../src/types';

jest.mock('node:dns/promises', () => ({
  resolveNs: jest.fn(),
}));

const mockedResolveNs = resolveNs as jest.MockedFunction<typeof resolveNs>;

function makeResult(overrides: Partial<DomainResult> = {}): DomainResult {
  return {
    domain: 'verdict.ai',
    available: true,
    premium: false,
    price_first_year: null,
    price_renewal: null,
    currency: 'USD',
    privacy_included: false,
    transfer_price: null,
    registrar: 'unknown',
    source: 'godaddy_api',
    checked_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('gateGodaddyAvailability', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedResolveNs.mockReset();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('(a) NS records present: overrides available -> false, forces premium, adds aftermarket insight', async () => {
    mockedResolveNs.mockResolvedValue(['ns1.afternic.com', 'ns2.afternic.com']);
    const result = makeResult();

    await gateGodaddyAvailability(result);

    expect(mockedResolveNs).toHaveBeenCalledWith('verdict.ai');
    expect(result.available).toBe(false);
    expect(result.premium).toBe(true);
    expect(result.aftermarket?.note?.toLowerCase()).toContain('aftermarket');
  });

  it('(b) ENOTFOUND: no NS records anywhere, stays available', async () => {
    const err = Object.assign(new Error('queryNs ENOTFOUND verdict.ai'), {
      code: 'ENOTFOUND',
    });
    mockedResolveNs.mockRejectedValue(err);
    const result = makeResult();

    await gateGodaddyAvailability(result);

    expect(result.available).toBe(true);
    expect(result.premium).toBe(false);
    expect(result.aftermarket).toBeUndefined();
  });

  it('(b2) ENODATA: no NS records anywhere, stays available', async () => {
    const err = Object.assign(new Error('queryNs ENODATA verdict.ai'), {
      code: 'ENODATA',
    });
    mockedResolveNs.mockRejectedValue(err);
    const result = makeResult();

    await gateGodaddyAvailability(result);

    expect(result.available).toBe(true);
    expect(result.premium).toBe(false);
  });

  it('(c) non-GoDaddy source: resolveNs is never called and result is untouched', async () => {
    const result = makeResult({ source: 'rdap', available: true });

    await gateGodaddyAvailability(result);

    expect(mockedResolveNs).not.toHaveBeenCalled();
    expect(result.available).toBe(true);
    expect(result.premium).toBe(false);
  });

  it('(d) DNS timeout: result unchanged, warning logged, never throws', async () => {
    jest.useFakeTimers();
    mockedResolveNs.mockImplementation(() => new Promise<string[]>(() => {}));
    const result = makeResult();

    const gatePromise = gateGodaddyAvailability(result);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(gatePromise).resolves.toBeUndefined();

    expect(result.available).toBe(true);
    expect(result.premium).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('already-unavailable GoDaddy results are not cross-checked', async () => {
    const result = makeResult({ available: false });

    await gateGodaddyAvailability(result);

    expect(mockedResolveNs).not.toHaveBeenCalled();
  });
});
