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
    expect(r.domains).toEqual([]);
    expect(r.verdict).toBe('unknown');
  });
  it('skips clearance entirely for empty targets (non-domain naming)', async () => {
    const r = await clearName('corda', {});
    expect(r.verdict).toBe('cleared');
    expect(r.domains).toEqual([]);
  });
});
