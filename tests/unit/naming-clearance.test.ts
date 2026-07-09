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
});
