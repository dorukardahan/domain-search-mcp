/**
 * Aftermarket regression suite: "we will never tell a user a parked domain
 * is free again."
 *
 * Pins the full verdict.ai incident chain end to end, with everything
 * external mocked:
 *   godaddy adapter (available:true/premium reported optimistically)
 *     -> gateGodaddyAvailability NS ground-truth gate (Task 1, src/fallbacks/godaddy-ns-gate.ts)
 *     -> searchDomain (src/services/domain-search.ts)
 *     -> clearName verdict (Task 2, src/naming/clearance.ts)
 *     -> formatToolResult name_project badge rendering (Task 3, src/utils/format.ts)
 *
 * No src/ changes here - this only pins existing behavior. If any assertion
 * below goes RED against current code, that is a gap left by Tasks 1-3, not
 * something to patch in this file.
 */

import { resolveNs } from 'node:dns/promises';
import type { DomainResult } from '../../src/types';

jest.mock('node:dns/promises', () => ({
  resolveNs: jest.fn(),
}));

// RDAP is disabled for every TLD in this suite so the (mocked) GoDaddy
// public-endpoint source is always the one that resolves the domain -
// this is the exact source the verdict.ai incident came through.
jest.mock('../../src/fallbacks/rdap', () => ({
  isRdapAvailable: jest.fn(() => false),
  checkRdap: jest.fn(),
}));

// Pricing backend is irrelevant to this regression and must never make a
// real network call from a test run.
jest.mock('../../src/services/pricing-api', () => ({
  fetchPricingQuote: jest.fn(async () => null),
  fetchPricingCompare: jest.fn(async () => null),
}));

// Federated negative-cache reporting is fire-and-forget (debounced setTimeout
// + real fetch) in the real module - stub it out so a taken-domain result
// never schedules a background network call during tests.
jest.mock('../../src/services/negative-cache', () => ({
  reportTakenDomains: jest.fn(),
}));

// Porkbun/Namecheap are stubbed to no-ops (returns undefined -> searchSingleDomain
// falls through to the next source) so this suite behaves the same regardless
// of which BYOK keys happen to be configured in the local .env. GoDaddy's
// search/isEnabled are the only real levers each test pulls.
jest.mock('../../src/registrars/index', () => ({
  porkbunAdapter: { isEnabled: () => false, search: jest.fn() },
  namecheapAdapter: { isEnabled: () => false, search: jest.fn() },
  godaddyPublicAdapter: {
    isEnabled: jest.fn(() => true),
    search: jest.fn(),
  },
}));

import { searchDomain } from '../../src/services/domain-search';
import { clearName } from '../../src/naming/clearance';
import { formatToolResult } from '../../src/utils/format';
import { domainCache } from '../../src/utils/cache';
import { isRdapAvailable } from '../../src/fallbacks/rdap';
import { godaddyPublicAdapter } from '../../src/registrars/index';
import { logger } from '../../src/utils/logger';

const mockedResolveNs = resolveNs as jest.Mock;
const mockedIsRdapAvailable = isRdapAvailable as jest.Mock;
const mockedGodaddySearch = godaddyPublicAdapter.search as jest.Mock;
const mockedGodaddyIsEnabled = godaddyPublicAdapter.isEnabled as jest.Mock;

function makeGodaddyResult(
  domain: string,
  overrides: Partial<DomainResult> = {},
): DomainResult {
  return {
    domain,
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

describe('aftermarket regression: parked/aftermarket domains can never render as FREE', () => {
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    domainCache.clear();
    mockedResolveNs.mockReset();
    mockedGodaddySearch.mockReset();
    mockedIsRdapAvailable.mockReset().mockReturnValue(false);
    mockedGodaddyIsEnabled.mockReset().mockReturnValue(true);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('(1) parked domain: godaddy available+premium, live afternic NS -> never free at any layer', async () => {
    mockedResolveNs.mockResolvedValueOnce(['ns1.afternic.com', 'ns2.afternic.com']);
    mockedGodaddySearch.mockResolvedValueOnce(
      makeGodaddyResult('verdict.ai', { premium: true }),
    );

    // Layer 1: searchDomain - the NS gate must have already flipped this to
    // not-free before it leaves the service.
    const searchResult = await searchDomain('verdict', ['ai']);
    const entry = searchResult.results.find((r) => r.domain === 'verdict.ai');
    expect(entry).toBeDefined();
    expect(entry!.available).toBe(false);
    expect(entry!.premium).toBe(true);
    expect(entry!.aftermarket?.note?.toLowerCase()).toContain('aftermarket');
    // Nothing in this search response may read as free.
    expect(searchResult.results.every((r) => r.available !== true)).toBe(true);

    // Layer 2: clearName - same gated result (served from cache), verdict
    // must never read "cleared".
    const report = await clearName('verdict', { tlds: ['ai'] });
    expect(report.verdict).not.toBe('cleared');
    expect(report.verdict).toBe('taken');
    const clearanceEntry = report.domains.find((d) => d.domain === 'verdict.ai');
    expect(clearanceEntry).toBeDefined();
    expect(clearanceEntry!.available).toBe(false);
    expect(clearanceEntry!.premium).toBe(true);

    // Layer 3: rendered badge must never show the free checkmark for .ai.
    const formatted = formatToolResult(
      'name_project',
      {
        phase: 2,
        shortlist: [
          {
            name: 'verdict',
            total: 80,
            reasons: [],
            clearance: {
              verdict: report.verdict,
              domains: report.domains,
              socials: report.socials,
            },
          },
        ],
      },
      'table',
    );
    expect(formatted).not.toContain('ai✓');
    expect(formatted).toMatch(/ai[✗$]/);
  });

  it('(2) genuinely free ccTLD: godaddy available, no premium, NXDOMAIN NS -> stays free end to end', async () => {
    const err = Object.assign(new Error('queryNs ENOTFOUND freebrand.cc'), {
      code: 'ENOTFOUND',
    });
    mockedResolveNs.mockRejectedValueOnce(err);
    mockedGodaddySearch.mockResolvedValueOnce(
      makeGodaddyResult('freebrand.cc', { premium: false }),
    );

    const searchResult = await searchDomain('freebrand', ['cc']);
    const entry = searchResult.results.find((r) => r.domain === 'freebrand.cc');
    expect(entry).toBeDefined();
    expect(entry!.available).toBe(true);
    expect(entry!.premium).toBe(false);
    expect(entry!.aftermarket).toBeUndefined();

    const report = await clearName('freebrand', { tlds: ['cc'] });
    expect(report.verdict).toBe('cleared');
    const clearanceEntry = report.domains.find((d) => d.domain === 'freebrand.cc');
    expect(clearanceEntry).toBeDefined();
    expect(clearanceEntry!.available).toBe(true);
    expect(clearanceEntry!.premium).toBeFalsy();

    const formatted = formatToolResult(
      'name_project',
      {
        phase: 2,
        shortlist: [
          {
            name: 'freebrand',
            total: 80,
            reasons: [],
            clearance: {
              verdict: report.verdict,
              domains: report.domains,
              socials: report.socials,
            },
          },
        ],
      },
      'table',
    );
    expect(formatted).toContain('cc✓');
  });

  it('(3) availabilityMark edge (folded in from CA3 review): available:null + premium:true renders ? - never $', () => {
    const formatted = formatToolResult(
      'name_project',
      {
        phase: 2,
        shortlist: [
          {
            name: 'edgecase',
            total: 50,
            reasons: [],
            clearance: {
              verdict: 'unknown',
              domains: [{ domain: 'edgecase.ai', available: null, premium: true }],
              socials: [],
            },
          },
        ],
      },
      'table',
    );

    expect(formatted).toContain('ai?');
    expect(formatted).not.toContain('ai$');
    expect(formatted).not.toContain('ai✓');
  });
});
