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

  const domains = domainsRes?.results.map((r) => ({
    domain: r.domain, available: r.available ?? null, price_first_year: r.price_first_year ?? null,
  })) ?? [];
  const socials = socialsRes?.results.map((s) => ({ platform: s.platform, available: s.available ?? null })) ?? [];

  const checks = [...domains.map((d) => d.available), ...socials.map((s) => s.available)];
  let verdict: ClearanceReport['verdict'];
  if (failed && checks.length === 0) verdict = 'unknown';
  else if (checks.length === 0) verdict = 'cleared';           // nothing requested
  else if (checks.every((c) => c === true)) verdict = 'cleared';
  else if (checks.every((c) => c === false)) verdict = 'taken';
  else verdict = 'partial';

  return { name, verdict, domains, socials };
}
