import type { DomainResult } from '../../src/types';

jest.mock('../../src/fallbacks/rdap', () => ({
  isRdapAvailable: jest.fn(() => true),
  checkRdap: jest.fn(async (name: string, tld: string): Promise<DomainResult> => ({
    domain: `${name}.${tld}`,
    available: false,
    premium: false,
    price_first_year: null,
    price_renewal: null,
    currency: 'USD',
    privacy_included: false,
    transfer_price: null,
    registrar: 'unknown',
    source: 'rdap',
    checked_at: new Date().toISOString(),
  })),
}));

jest.mock('../../src/fallbacks/whois', () => ({
  isWhoisAvailable: jest.fn(() => false),
  checkWhois: jest.fn(),
}));

jest.mock('../../src/registrars/index', () => ({
  porkbunAdapter: { isEnabled: () => false, search: jest.fn() },
  namecheapAdapter: { isEnabled: () => false, search: jest.fn() },
  godaddyPublicAdapter: { isEnabled: () => false, search: jest.fn() },
}));

jest.mock('../../src/services/pricing-api', () => ({
  fetchPricingQuote: jest.fn(async () => null),
  fetchPricingCompare: jest.fn(async () => null),
}));

jest.mock('../../src/services/negative-cache', () => ({
  reportTakenDomains: jest.fn(),
}));

jest.mock('../../src/aftermarket/sedo', () => ({
  lookupSedoAuction: jest.fn(() => null),
}));

jest.mock('../../src/aftermarket/nameservers', () => ({
  lookupAftermarketByNameserver: jest.fn(async () => null),
}));

import { config } from '../../src/config';
import { searchDomain } from '../../src/services/domain-search';
import { reportTakenDomains } from '../../src/services/negative-cache';
import { domainCache } from '../../src/utils/cache';
import { logger } from '../../src/utils/logger';

describe('searchDomain taken-domain reporting policy', () => {
  const originalNegativeCacheEnabled = config.negativeCache.enabled;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    domainCache.clear();
    config.negativeCache.enabled = true;
    (reportTakenDomains as jest.Mock).mockReset();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    config.negativeCache.enabled = originalNegativeCacheEnabled;
    infoSpy.mockRestore();
  });

  it('does not report a taken domain when reporting is disabled for the search', async () => {
    await searchDomain('protected-candidate', ['com'], undefined, { reportTaken: false });

    expect(reportTakenDomains).not.toHaveBeenCalled();
  });

  it('keeps taken-domain reporting enabled by default', async () => {
    await searchDomain('ordinary-candidate', ['com']);

    expect(reportTakenDomains).toHaveBeenCalledWith([
      expect.objectContaining({ fqdn: 'ordinary-candidate.com', source: 'rdap' }),
    ]);
  });
});
