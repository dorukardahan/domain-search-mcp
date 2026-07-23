export const DOMAIN_CLEARANCE_PROVIDER_IDS = [
  'namecom',
  'namecheap',
  'godaddy',
  'porkbun',
  'vercel',
  'spaceship',
  'rdap',
  'whois',
] as const;

export type DomainClearanceProviderId =
  (typeof DOMAIN_CLEARANCE_PROVIDER_IDS)[number];

export type DomainEvidenceLevel =
  | 'registrar_quote'
  | 'registrar_availability'
  | 'registry_signal';

export interface DomainClearanceObservation {
  provider: DomainClearanceProviderId;
  domain: string;
  evidenceLevel: DomainEvidenceLevel;
  available: boolean | null;
  premium: boolean | null;
  priceFirstYear: number | null;
  priceRenewal: number | null;
  currency: string | null;
  checkedAt: string;
}

export interface ResolvedDomainClearance {
  domain: string;
  status: 'free' | 'taken' | 'for_sale' | 'unknown';
  primaryProvider: DomainClearanceProviderId | null;
  observations: readonly Readonly<DomainClearanceObservation>[];
  conflict: boolean;
}

const PROVIDER_IDS = new Set<string>(DOMAIN_CLEARANCE_PROVIDER_IDS);
const EVIDENCE_LEVELS = new Set<string>([
  'registrar_quote',
  'registrar_availability',
  'registry_signal',
]);

function normalizeDomain(domain: string): string {
  return domain.trim().toLocaleLowerCase('en-US').replace(/\.$/u, '');
}

function isCanonicalUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value
  );
}

function isValidObservation(
  observation: DomainClearanceObservation,
  domain: string,
): boolean {
  return (
    PROVIDER_IDS.has(observation.provider) &&
    EVIDENCE_LEVELS.has(observation.evidenceLevel) &&
    normalizeDomain(observation.domain) === domain &&
    isCanonicalUtcTimestamp(observation.checkedAt)
  );
}

function immutableObservation(
  observation: DomainClearanceObservation,
  domain: string,
): Readonly<DomainClearanceObservation> {
  return Object.freeze({
    provider: observation.provider,
    domain,
    evidenceLevel: observation.evidenceLevel,
    available: observation.available,
    premium: observation.premium,
    priceFirstYear: observation.priceFirstYear,
    priceRenewal: observation.priceRenewal,
    currency: observation.currency,
    checkedAt: observation.checkedAt,
  });
}

function newestByProvider(
  domain: string,
  observations: readonly DomainClearanceObservation[],
): readonly Readonly<DomainClearanceObservation>[] {
  const newest = new Map<
    DomainClearanceProviderId,
    {
      checkedAtMs: number;
      observations: Map<string, Readonly<DomainClearanceObservation>>;
    }
  >();

  for (const observation of observations) {
    if (!isValidObservation(observation, domain)) continue;
    const immutable = immutableObservation(observation, domain);
    const current = newest.get(immutable.provider);
    const checkedAtMs = Date.parse(immutable.checkedAt);
    const signature = JSON.stringify(immutable);

    if (!current || checkedAtMs > current.checkedAtMs) {
      newest.set(immutable.provider, {
        checkedAtMs,
        observations: new Map([[signature, immutable]]),
      });
    } else if (checkedAtMs === current.checkedAtMs) {
      current.observations.set(signature, immutable);
    }
  }

  return Object.freeze(
    [...newest.values()]
      .flatMap(({ observations: tied }) => [...tied.values()])
      .sort((left, right) => {
        const providerDifference = left.provider.localeCompare(
          right.provider,
          'en-US',
        );
        return (
          providerDifference ||
          JSON.stringify(left).localeCompare(
            JSON.stringify(right),
            'en-US',
          )
        );
      }),
  );
}

function newestProvider(
  observations: readonly Readonly<DomainClearanceObservation>[],
): DomainClearanceProviderId | null {
  const newest = [...observations].sort((left, right) => {
    const timeDifference =
      Date.parse(right.checkedAt) - Date.parse(left.checkedAt);
    return (
      timeDifference ||
      left.provider.localeCompare(right.provider, 'en-US')
    );
  })[0];
  return newest?.provider ?? null;
}

export function resolveDomainClearance(
  requestedDomain: string,
  input: readonly DomainClearanceObservation[],
): Readonly<ResolvedDomainClearance> {
  const domain = normalizeDomain(requestedDomain);
  const observations = newestByProvider(domain, input);
  const registrarObservations = observations.filter(
    ({ evidenceLevel }) => evidenceLevel !== 'registry_signal',
  );
  const taken = registrarObservations.filter(
    ({ available }) => available === false,
  );
  const positive = registrarObservations.filter(
    ({ available }) => available === true,
  );
  const free = registrarObservations.filter(
    ({ evidenceLevel, available, premium }) =>
      evidenceLevel === 'registrar_quote' &&
      available === true &&
      premium === false,
  );
  const forSale = registrarObservations.filter(
    ({ available, premium }) => available === true && premium === true,
  );
  const conflict =
    (taken.length > 0 && positive.length > 0) ||
    (free.length > 0 && forSale.length > 0);

  let status: ResolvedDomainClearance['status'] = 'unknown';
  let primaryProvider: DomainClearanceProviderId | null = null;
  if (!conflict && forSale.length > 0) {
    status = 'for_sale';
    primaryProvider = newestProvider(forSale);
  } else if (!conflict && free.length > 0) {
    status = 'free';
    primaryProvider = newestProvider(free);
  } else if (!conflict && taken.length > 0) {
    status = 'taken';
    primaryProvider = newestProvider(taken);
  }

  return Object.freeze({
    domain,
    status,
    primaryProvider,
    observations,
    conflict,
  });
}
