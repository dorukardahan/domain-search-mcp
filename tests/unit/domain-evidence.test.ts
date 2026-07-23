type ProviderId =
  | 'namecom'
  | 'godaddy'
  | 'porkbun'
  | 'vercel'
  | 'spaceship'
  | 'rdap'
  | 'whois';

type EvidenceLevel =
  | 'registrar_quote'
  | 'registrar_availability'
  | 'registry_signal';

interface Observation {
  provider: ProviderId;
  domain: string;
  evidenceLevel: EvidenceLevel;
  available: boolean | null;
  premium: boolean | null;
  priceFirstYear: number | null;
  priceRenewal: number | null;
  currency: string | null;
  checkedAt: string;
}

interface Resolution {
  domain: string;
  status: 'free' | 'taken' | 'for_sale' | 'unknown';
  primaryProvider: ProviderId | null;
  observations: readonly Observation[];
  conflict: boolean;
}

const { resolveDomainClearance } = require('../../src/lib') as {
  resolveDomainClearance(
    domain: string,
    observations: readonly Observation[],
  ): Resolution;
};

const CHECKED_AT = '2026-07-23T12:00:00.000Z';

function observation(
  overrides: Partial<Observation> = {},
): Observation {
  return {
    provider: 'namecom',
    domain: 'rootnote.com',
    evidenceLevel: 'registrar_quote',
    available: true,
    premium: false,
    priceFirstYear: 12.99,
    priceRenewal: 18.99,
    currency: 'USD',
    checkedAt: CHECKED_AT,
    ...overrides,
  };
}

describe('resolveDomainClearance', () => {
  it('establishes free only from a non-premium registrar quote', () => {
    expect(
      resolveDomainClearance('rootnote.com', [observation()]),
    ).toMatchObject({
      domain: 'rootnote.com',
      status: 'free',
      primaryProvider: 'namecom',
      conflict: false,
    });
  });

  it('keeps a boolean-only positive registrar result unknown', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation({
          provider: 'godaddy',
          evidenceLevel: 'registrar_availability',
          premium: null,
        }),
      ]),
    ).toMatchObject({
      status: 'unknown',
      primaryProvider: null,
      conflict: false,
    });
  });

  it('maps an explicitly premium available result to for sale', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation({
          provider: 'porkbun',
          premium: true,
          priceFirstYear: 2_900,
        }),
      ]),
    ).toMatchObject({
      status: 'for_sale',
      primaryProvider: 'porkbun',
      conflict: false,
    });
  });

  it('lets exact registrar evidence establish taken', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation({
          provider: 'godaddy',
          evidenceLevel: 'registrar_availability',
          available: false,
          premium: null,
          priceFirstYear: null,
          priceRenewal: null,
          currency: null,
        }),
      ]),
    ).toMatchObject({
      status: 'taken',
      primaryProvider: 'godaddy',
      conflict: false,
    });
  });

  it('fails closed when exact providers disagree on purchasability', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation(),
        observation({
          provider: 'godaddy',
          evidenceLevel: 'registrar_availability',
          available: false,
          premium: null,
        }),
      ]),
    ).toMatchObject({
      status: 'unknown',
      primaryProvider: null,
      conflict: true,
    });
  });

  it('fails closed when providers disagree on premium state', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation(),
        observation({
          provider: 'porkbun',
          premium: true,
          priceFirstYear: 2_900,
        }),
      ]),
    ).toMatchObject({
      status: 'unknown',
      primaryProvider: null,
      conflict: true,
    });
  });

  it('keeps all-null and registry-positive evidence unknown', () => {
    const result = resolveDomainClearance('rootnote.com', [
      observation({
        provider: 'rdap',
        evidenceLevel: 'registry_signal',
        available: null,
        premium: null,
      }),
      observation({
        provider: 'whois',
        evidenceLevel: 'registry_signal',
        available: true,
        premium: null,
      }),
    ]);

    expect(result).toMatchObject({
      status: 'unknown',
      primaryProvider: null,
      conflict: false,
    });
    expect(result.observations).toHaveLength(2);
  });

  it('discards evidence for another FQDN or with an invalid timestamp', () => {
    const result = resolveDomainClearance('rootnote.com', [
      observation({ domain: 'other.com' }),
      observation({ provider: 'porkbun', checkedAt: 'not-a-timestamp' }),
    ]);

    expect(result).toEqual({
      domain: 'rootnote.com',
      status: 'unknown',
      primaryProvider: null,
      observations: [],
      conflict: false,
    });
  });

  it('keeps only the newest observation from the same provider', () => {
    const result = resolveDomainClearance('rootnote.com', [
      observation({
        available: false,
        premium: null,
        checkedAt: '2026-07-23T11:00:00.000Z',
      }),
      observation({
        checkedAt: '2026-07-23T12:00:00.000Z',
      }),
    ]);

    expect(result).toMatchObject({
      status: 'free',
      primaryProvider: 'namecom',
      conflict: false,
    });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.checkedAt).toBe(CHECKED_AT);
  });

  it('normalizes case and one trailing dot deterministically', () => {
    const result = resolveDomainClearance('ROOTNOTE.COM.', [
      observation({ domain: 'RootNote.Com.' }),
    ]);

    expect(result.domain).toBe('rootnote.com');
    expect(result.observations[0]?.domain).toBe('rootnote.com');
    expect(result.status).toBe('free');
  });

  it('returns an immutable result and cloned observations', () => {
    const input = observation();
    const result = resolveDomainClearance('rootnote.com', [input]);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.observations)).toBe(true);
    expect(Object.isFrozen(result.observations[0])).toBe(true);
    expect(result.observations[0]).not.toBe(input);
  });
});
