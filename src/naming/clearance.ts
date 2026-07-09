import { searchDomain } from '../services/domain-search.js';
import { executeCheckSocials } from '../tools/check_socials.js';
import { logger } from '../utils/logger.js';

export interface ClearanceTargets { tlds?: string[]; platforms?: string[]; }
export interface ClearanceReport {
  name: string;
  verdict: 'cleared' | 'partial' | 'taken' | 'unknown';
  domains: { domain: string; available: boolean | null; price_first_year: number | null }[];
  socials: { platform: string; available: boolean | null }[];
}

export async function clearName(name: string, targets: ClearanceTargets = {}): Promise<ClearanceReport> {
  const wantDomains = !!targets.tlds?.length;
  const wantSocials = !!targets.platforms?.length;
  let failed = false;

  const [domainsRes, socialsRes] = await Promise.all([
    wantDomains
      ? searchDomain(name, targets.tlds).catch((e) => { failed = true; logger.warn('clearance: domain check failed', { error: String(e) }); return null; })
      : Promise.resolve(null),
    wantSocials
      ? executeCheckSocials({ name, platforms: targets.platforms as never }).catch((e) => { failed = true; logger.warn('clearance: socials check failed', { error: String(e) }); return null; })
      : Promise.resolve(null),
  ]);

  const domains: ClearanceReport['domains'] = domainsRes?.results.map((r) => ({
    domain: r.domain, available: r.available ?? null, price_first_year: r.price_first_year ?? null,
  })) ?? [];
  // searchDomain swallows per-TLD failures (failed TLDs are omitted from results,
  // the promise still resolves). Backfill every requested-but-missing TLD as
  // unknown so silently unchecked surfaces can never read as cleared. Gate on
  // wantDomains alone (not on domainsRes) - a wholesale-rejected source also
  // resolves to null above, and its requested targets must still surface as
  // unchecked rather than vanish (which would let the verdict read "cleared"
  // off the surviving source alone).
  if (wantDomains) {
    const seen = new Set(domains.map((d) => d.domain.toLowerCase()));
    for (const tld of targets.tlds ?? []) {
      const fqdn = `${name}.${tld}`;
      if (!seen.has(fqdn.toLowerCase())) {
        domains.push({ domain: fqdn, available: null, price_first_year: null });
      }
    }
  }

  // Same degradation for socials: a result carrying an error is an unchecked
  // surface (its boolean is a guess, e.g. "assume taken"), and per-platform
  // failures may be dropped from results entirely. Gate on wantSocials alone
  // for the same reason as the domains backfill above.
  const socials: ClearanceReport['socials'] = socialsRes?.results.map((s) => ({
    platform: s.platform, available: s.error ? null : (s.available ?? null),
  })) ?? [];
  if (wantSocials) {
    const seen = new Set(socials.map((s) => s.platform));
    for (const platform of targets.platforms ?? []) {
      if (!seen.has(platform)) socials.push({ platform, available: null });
    }
  }

  const checks = [...domains.map((d) => d.available), ...socials.map((s) => s.available)];
  let verdict: ClearanceReport['verdict'];
  if (failed && checks.length === 0) verdict = 'unknown';
  else if (checks.length === 0) verdict = 'cleared';           // nothing requested
  else if (checks.every((c) => c === null)) verdict = 'unknown'; // nothing actually checked
  else if (checks.every((c) => c === true)) verdict = 'cleared';
  else if (checks.every((c) => c === false)) verdict = 'taken';
  else verdict = 'partial';

  return { name, verdict, domains, socials };
}
