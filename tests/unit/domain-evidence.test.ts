import type {
  DomainClearanceObservation as Observation,
  ResolvedDomainClearance as Resolution,
} from '../../src/lib';

const { resolveDomainClearance } = require('../../src/lib') as typeof import(
  '../../src/lib'
);

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

  it('accepts exact evidence from the existing Namecheap adapter', () => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation({ provider: 'namecheap' }),
      ]),
    ).toMatchObject({
      status: 'free',
      primaryProvider: 'namecheap',
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

  it.each([
    '2026-02-30T12:00:00.000Z',
    'July 23, 2026 12:00:00',
    '2026-07-23T12:00:00Z',
    '2026-07-23T14:00:00.000+02:00',
  ])('discards non-canonical or impossible timestamp %s', (checkedAt) => {
    expect(
      resolveDomainClearance('rootnote.com', [
        observation({ checkedAt }),
      ]),
    ).toEqual({
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

  it('fails closed independent of input order for tied provider evidence', () => {
    const free = observation();
    const taken = observation({
      available: false,
      premium: null,
      priceFirstYear: null,
      priceRenewal: null,
      currency: null,
    });

    const forward: Resolution = resolveDomainClearance(
      'rootnote.com',
      [free, taken],
    );
    const reversed = resolveDomainClearance('rootnote.com', [taken, free]);

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      status: 'unknown',
      primaryProvider: null,
      conflict: true,
    });
    expect(forward.observations).toHaveLength(2);
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
