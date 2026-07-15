/**
 * executeBulkSearch must surface checks that failed (rate limit / timeout /
 * all sources exhausted) as errors rather than silently dropping them or
 * miscounting them as "taken". The service layer is mocked so these assertions
 * are deterministic and hit no network.
 */
jest.mock('../../src/services/domain-search.js', () => ({
  bulkSearchDomains: jest.fn(),
}));

import { executeBulkSearch } from '../../src/tools/bulk_search';
import { bulkSearchDomains } from '../../src/services/domain-search.js';
import type { DomainResult } from '../../src/types';

const mockBulk = bulkSearchDomains as jest.MockedFunction<
  typeof bulkSearchDomains
>;

function makeResult(domain: string, over: Partial<DomainResult>): DomainResult {
  return {
    domain,
    available: false,
    premium: false,
    price_first_year: null,
    price_renewal: null,
    currency: 'USD',
    privacy_included: false,
    transfer_price: null,
    registrar: 'unknown',
    source: 'rdap',
    checked_at: '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('executeBulkSearch - failure surfacing', () => {
  afterEach(() => mockBulk.mockReset());

  it('counts errored domains separately from available and taken', async () => {
    mockBulk.mockResolvedValue([
      makeResult('good.com', { available: true }),
      makeResult('taken.com', { available: false }),
      makeResult('oops.com', { source: 'error', error: 'rate limit' }),
    ]);

    const res = await executeBulkSearch({
      domains: ['good', 'taken', 'oops'],
      tld: 'com',
    });

    expect(res.summary).toEqual({
      total: 3,
      available: 1,
      taken: 1,
      errors: 1,
    });
    // The failed check must NOT inflate the "taken" count.
    expect(res.results).toHaveLength(3);
    expect(
      res.insights.some(
        (i) => i.includes('could not be checked') && i.includes('oops.com'),
      ),
    ).toBe(true);
  });

  it('does not drop domains: every input is represented in the output', async () => {
    mockBulk.mockResolvedValue([
      makeResult('a.com', { source: 'error', error: 'timeout' }),
      makeResult('b.com', { source: 'error', error: 'timeout' }),
    ]);

    const res = await executeBulkSearch({ domains: ['a', 'b'], tld: 'com' });

    expect(res.summary.errors).toBe(2);
    expect(res.summary.taken).toBe(0);
    expect(res.results).toHaveLength(2);
  });
});
