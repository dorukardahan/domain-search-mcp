jest.mock('../../src/services/domain-search', () => ({
  searchDomain: jest.fn(async (name: string, tlds: string[]) => ({
    results: tlds.map((t) => ({ domain: `${name}.${t}`, available: t === 'com', price_first_year: 11.08 })),
    insights: [], next_steps: [],
  })),
}));
jest.mock('../../src/tools/check_socials', () => ({
  executeCheckSocials: jest.fn(async () => ({
    results: [
      { platform: 'github', handle: 'corda', available: true, url: '', checked_at: '', confidence: 'high' },
      { platform: 'npm', handle: 'corda', available: false, url: '', checked_at: '', confidence: 'high' },
    ],
  })),
}));

import { clearName } from '../../src/naming/clearance';
import { searchDomain } from '../../src/services/domain-search';
import { executeCheckSocials } from '../../src/tools/check_socials';
import { logger } from '../../src/utils/logger';

describe('clearName', () => {
  it('merges domain and social checks into one report', async () => {
    const r = await clearName('corda', { tlds: ['com', 'io'], platforms: ['github', 'npm'] });
    expect(r.domains).toHaveLength(2);
    expect(r.socials).toHaveLength(2);
    expect(r.verdict).toBe('partial'); // com free, io taken, npm taken
  });
  it('returns verdict unknown (not a throw) when a source fails', async () => {
    (searchDomain as jest.Mock).mockRejectedValueOnce(new Error('rdap down'));
    const r = await clearName('corda', { tlds: ['com'] });
    // The rejected source resolves to null internally, but the requested TLD
    // must still be backfilled as an unchecked (null) entry rather than
    // vanishing - a rejected source must never look identical to "nothing
    // was requested".
    expect(r.domains).toEqual([{ domain: 'corda.com', available: null, price_first_year: null }]);
    expect(r.verdict).toBe('unknown');
  });
  it('rejected domain source + fully-available socials => partial, never cleared', async () => {
    (searchDomain as jest.Mock).mockRejectedValueOnce(new Error('rdap down'));
    (executeCheckSocials as jest.Mock).mockResolvedValueOnce({
      results: [
        { platform: 'github', handle: 'corda', available: true, url: '', checked_at: '', confidence: 'high' },
      ],
    });
    const r = await clearName('corda', { tlds: ['com'], platforms: ['github'] });
    expect(r.domains).toContainEqual({ domain: 'corda.com', available: null, price_first_year: null });
    // Verdict must not read "cleared" off the surviving source alone while
    // the rejected source's requested target is still unchecked.
    expect(r.verdict).toBe('partial');
  });
  it('skips clearance entirely for empty targets (non-domain naming)', async () => {
    const r = await clearName('corda', {});
    expect(r.verdict).toBe('cleared');
    expect(r.domains).toEqual([]);
  });
  it('backfills silently dropped TLDs as unknown (null) instead of omitting them', async () => {
    (searchDomain as jest.Mock).mockResolvedValueOnce({
      results: [{ domain: 'corda.com', available: true, price_first_year: 11.08 }],
      insights: [], next_steps: [],
    });
    const r = await clearName('corda', { tlds: ['com', 'io'] });
    expect(r.domains).toHaveLength(2);
    expect(r.domains).toContainEqual({ domain: 'corda.io', available: null, price_first_year: null });
    expect(r.verdict).toBe('partial'); // com free, io unchecked — cannot claim cleared
  });
  it('returns unknown when the source resolves but no requested check landed', async () => {
    (searchDomain as jest.Mock).mockResolvedValueOnce({ results: [], insights: [], next_steps: [] });
    const r = await clearName('corda', { tlds: ['com'] });
    expect(r.domains).toEqual([{ domain: 'corda.com', available: null, price_first_year: null }]);
    expect(r.verdict).toBe('unknown');
  });
  it('maps social results carrying an error to available null', async () => {
    (executeCheckSocials as jest.Mock).mockResolvedValueOnce({
      results: [
        { platform: 'github', handle: 'corda', available: false, url: '', checked_at: '', confidence: 'low', error: 'rate limited' },
      ],
    });
    const r = await clearName('corda', { platforms: ['github'] });
    expect(r.socials).toEqual([{ platform: 'github', available: null }]);
    expect(r.verdict).toBe('unknown');
  });
  it('premium-available domain is not-free for verdict purposes: com free + ai premium-available => partial', async () => {
    (searchDomain as jest.Mock).mockResolvedValueOnce({
      results: [
        { domain: 'corda.com', available: true, price_first_year: 11.08 },
        { domain: 'corda.ai', available: true, price_first_year: 2999, premium: true },
      ],
      insights: [], next_steps: [],
    });
    const r = await clearName('corda', { tlds: ['com', 'ai'] });
    expect(r.verdict).toBe('partial');
    expect(r.domains).toContainEqual({ domain: 'corda.ai', available: true, price_first_year: 2999, premium: true });
  });
  it('all requested domains premium-available (not-free everywhere) => verdict taken', async () => {
    (searchDomain as jest.Mock).mockResolvedValueOnce({
      results: [
        { domain: 'corda.com', available: true, price_first_year: 2999, premium: true },
        { domain: 'corda.ai', available: true, price_first_year: 3999, premium: true },
      ],
      insights: [], next_steps: [],
    });
    const r = await clearName('corda', { tlds: ['com', 'ai'] });
    expect(r.verdict).toBe('taken');
    expect(r.domains).toEqual([
      { domain: 'corda.com', available: true, price_first_year: 2999, premium: true },
      { domain: 'corda.ai', available: true, price_first_year: 3999, premium: true },
    ]);
  });

  it('suppresses nested source logs when explicitly requested', async () => {
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (searchDomain as jest.Mock).mockImplementationOnce(async (name: string, tlds: string[]) => {
      logger.error('domain source protected trace', { domain: `${name}.${tlds[0]}` });
      return {
        results: [{ domain: `${name}.${tlds[0]}`, available: true, price_first_year: 11.08 }],
        insights: [], next_steps: [],
      };
    });
    (executeCheckSocials as jest.Mock).mockImplementationOnce(async ({ name }: { name: string }) => {
      await Promise.resolve();
      logger.error('social source protected trace', { name });
      return {
        results: [
          { platform: 'github', handle: name, available: true, url: '', checked_at: '', confidence: 'high' },
        ],
      };
    });

    try {
      const report = await clearName(
        'protected-product-name',
        { tlds: ['com'], platforms: ['github'] },
        { logPolicy: 'suppress' },
      );

      expect(report.verdict).toBe('cleared');
      expect(searchDomain).toHaveBeenLastCalledWith(
        'protected-product-name',
        ['com'],
        undefined,
        { cacheResults: false, reportTaken: false },
      );
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
  });

  it('preserves default nested source logging when suppression is not requested', async () => {
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (searchDomain as jest.Mock).mockImplementationOnce(async (name: string, tlds: string[]) => {
      logger.error('domain source default trace', { domain: `${name}.${tlds[0]}` });
      return {
        results: [{ domain: `${name}.${tlds[0]}`, available: true, price_first_year: 11.08 }],
        insights: [], next_steps: [],
      };
    });

    try {
      await clearName('ordinary-product-name', { tlds: ['com'] });

      expect(stderr).toHaveBeenCalledTimes(1);
      expect(stderr.mock.calls.flat().join('\n')).toContain('ordinary-product-name.com');
    } finally {
      stderr.mockRestore();
    }
  });
});
