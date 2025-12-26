/**
 * Unit Tests for Tools.
 */

import {
  searchDomainSchema,
  bulkSearchSchema,
  compareRegistrarsSchema,
  suggestDomainsSchema,
  tldInfoSchema,
  checkSocialsSchema,
} from '../../src/tools';

describe('searchDomainSchema', () => {
  it('should accept valid input with domain only', () => {
    const result = searchDomainSchema.parse({
      domain_name: 'vibecoding',
    });

    expect(result.domain_name).toBe('vibecoding');
    expect(result.tlds).toBeUndefined();
    expect(result.registrars).toBeUndefined();
  });

  it('should accept valid input with all fields', () => {
    const result = searchDomainSchema.parse({
      domain_name: 'vibecoding',
      tlds: ['com', 'io', 'dev'],
      registrars: ['porkbun'],
    });

    expect(result.domain_name).toBe('vibecoding');
    expect(result.tlds).toEqual(['com', 'io', 'dev']);
    expect(result.registrars).toEqual(['porkbun']);
  });

  it('should reject empty domain name', () => {
    expect(() =>
      searchDomainSchema.parse({ domain_name: '' }),
    ).toThrow();
  });

  it('should reject domain name too long', () => {
    expect(() =>
      searchDomainSchema.parse({ domain_name: 'a'.repeat(64) }),
    ).toThrow();
  });
});

describe('bulkSearchSchema', () => {
  it('should accept valid input', () => {
    const result = bulkSearchSchema.parse({
      domains: ['vibecoding', 'myapp', 'coolstartup'],
      tld: 'com',
    });

    expect(result.domains).toHaveLength(3);
    expect(result.tld).toBe('com');
  });

  it('should use default TLD', () => {
    const result = bulkSearchSchema.parse({
      domains: ['vibecoding'],
    });

    expect(result.tld).toBe('com');
  });

  it('should reject empty domains array', () => {
    expect(() =>
      bulkSearchSchema.parse({ domains: [] }),
    ).toThrow();
  });

  it('should reject too many domains', () => {
    const domains = Array.from({ length: 101 }, (_, i) => `domain${i}`);
    expect(() =>
      bulkSearchSchema.parse({ domains }),
    ).toThrow();
  });
});

describe('compareRegistrarsSchema', () => {
  it('should accept valid input', () => {
    const result = compareRegistrarsSchema.parse({
      domain: 'vibecoding',
      tld: 'com',
    });

    expect(result.domain).toBe('vibecoding');
    expect(result.tld).toBe('com');
  });

  it('should accept specific registrars', () => {
    const result = compareRegistrarsSchema.parse({
      domain: 'vibecoding',
      tld: 'com',
      registrars: ['porkbun', 'namecheap'],
    });

    expect(result.registrars).toEqual(['porkbun', 'namecheap']);
  });
});

describe('suggestDomainsSchema', () => {
  it('should accept valid input', () => {
    const result = suggestDomainsSchema.parse({
      base_name: 'vibecoding',
    });

    expect(result.base_name).toBe('vibecoding');
    expect(result.tld).toBe('com');
    expect(result.max_suggestions).toBe(10);
  });

  it('should accept custom options', () => {
    const result = suggestDomainsSchema.parse({
      base_name: 'vibecoding',
      tld: 'io',
      variants: ['hyphen', 'prefixes'],
      max_suggestions: 20,
    });

    expect(result.tld).toBe('io');
    expect(result.variants).toEqual(['hyphen', 'prefixes']);
    expect(result.max_suggestions).toBe(20);
  });

  it('should reject invalid max_suggestions', () => {
    expect(() =>
      suggestDomainsSchema.parse({
        base_name: 'vibecoding',
        max_suggestions: 100,
      }),
    ).toThrow();
  });
});

describe('tldInfoSchema', () => {
  it('should accept valid TLD', () => {
    const result = tldInfoSchema.parse({
      tld: 'com',
    });

    expect(result.tld).toBe('com');
    expect(result.detailed).toBe(false);
  });

  it('should accept detailed flag', () => {
    const result = tldInfoSchema.parse({
      tld: 'io',
      detailed: true,
    });

    expect(result.detailed).toBe(true);
  });

  it('should reject TLD too short', () => {
    expect(() =>
      tldInfoSchema.parse({ tld: 'a' }),
    ).toThrow();
  });
});

describe('checkSocialsSchema', () => {
  it('should accept valid input', () => {
    const result = checkSocialsSchema.parse({
      name: 'vibecoding',
    });

    expect(result.name).toBe('vibecoding');
    expect(result.platforms).toBeUndefined();
  });

  it('should accept specific platforms', () => {
    const result = checkSocialsSchema.parse({
      name: 'vibecoding',
      platforms: ['github', 'twitter'],
    });

    expect(result.platforms).toEqual(['github', 'twitter']);
  });

  it('should reject invalid platform', () => {
    expect(() =>
      checkSocialsSchema.parse({
        name: 'vibecoding',
        platforms: ['invalid'],
      }),
    ).toThrow();
  });

  it('should reject name too long', () => {
    expect(() =>
      checkSocialsSchema.parse({
        name: 'a'.repeat(31),
      }),
    ).toThrow();
  });
});
