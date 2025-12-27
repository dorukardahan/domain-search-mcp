/**
 * Domain Search Service.
 *
 * Orchestrates domain availability checks across multiple sources:
 * 1. Porkbun (primary, if configured - has pricing)
 * 2. Namecheap (secondary, if configured - has pricing)
 * 3. GoDaddy MCP (always available - no auth, no pricing, great availability data)
 * 4. RDAP (fallback, always available)
 * 5. WHOIS (last resort, always available)
 *
 * Handles:
 * - Smart source selection based on availability and configuration
 * - Graceful fallback on failures
 * - Caching for performance
 * - Insights generation for vibecoding UX
 */

import type { DomainResult, SearchResponse, DataSource } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  NoSourceAvailableError,
  wrapError,
  DomainSearchError,
} from '../utils/errors.js';
import {
  validateDomainName,
  validateTlds,
  buildDomain,
} from '../utils/validators.js';
import { domainCache, domainCacheKey, getOrCompute } from '../utils/cache.js';
import { porkbunAdapter, namecheapAdapter, godaddyMcpAdapter } from '../registrars/index.js';
import { checkRdap, isRdapAvailable } from '../fallbacks/rdap.js';
import { checkWhois, isWhoisAvailable } from '../fallbacks/whois.js';
import {
  generatePremiumInsight,
  generatePremiumSummary,
  calculateDomainScore,
  analyzePremiumReason,
  suggestPremiumAlternatives,
} from '../utils/premium-analyzer.js';

/**
 * Search for domain availability across multiple TLDs.
 */
export async function searchDomain(
  domainName: string,
  tlds: string[] = ['com', 'io', 'dev'],
  preferredRegistrars?: string[],
): Promise<SearchResponse> {
  const startTime = Date.now();
  const normalizedDomain = validateDomainName(domainName);
  const normalizedTlds = validateTlds(tlds);

  logger.info('Domain search started', {
    domain: normalizedDomain,
    tlds: normalizedTlds,
  });

  // Search each TLD
  const results: DomainResult[] = [];
  const errors: string[] = [];
  let fromCache = false;

  // Run TLD checks in parallel
  const promises = normalizedTlds.map(async (tld) => {
    try {
      const result = await searchSingleDomain(
        normalizedDomain,
        tld,
        preferredRegistrars,
      );
      if (result.fromCache) fromCache = true;
      return { success: true as const, tld, result: result.result };
    } catch (error) {
      const wrapped = wrapError(error);
      return { success: false as const, tld, error: wrapped };
    }
  });

  const outcomes = await Promise.all(promises);

  for (const outcome of outcomes) {
    if (outcome.success) {
      results.push(outcome.result);
    } else {
      errors.push(`${outcome.tld}: ${outcome.error.userMessage}`);
      logger.warn(`Failed to check .${outcome.tld}`, {
        domain: normalizedDomain,
        error: outcome.error.message,
      });
    }
  }

  // Generate insights and next steps
  const insights = generateInsights(results, errors);
  const nextSteps = generateNextSteps(results);

  const duration = Date.now() - startTime;
  logger.info('Domain search completed', {
    domain: normalizedDomain,
    results_count: results.length,
    errors_count: errors.length,
    duration_ms: duration,
    from_cache: fromCache,
  });

  return {
    results,
    insights,
    next_steps: nextSteps,
    from_cache: fromCache,
    duration_ms: duration,
  };
}

/**
 * Search a single domain with fallback chain.
 */
async function searchSingleDomain(
  domain: string,
  tld: string,
  preferredRegistrars?: string[],
): Promise<{ result: DomainResult; fromCache: boolean }> {
  const fullDomain = buildDomain(domain, tld);
  const triedSources: string[] = [];

  // Check cache first
  for (const source of ['porkbun', 'namecheap', 'godaddy', 'rdap', 'whois'] as const) {
    const cacheKey = domainCacheKey(fullDomain, source);
    const cached = domainCache.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { domain: fullDomain, source });
      return { result: cached, fromCache: true };
    }
  }

  // Build source priority
  const sources = buildSourcePriority(tld, preferredRegistrars);

  // Try each source
  for (const source of sources) {
    triedSources.push(source);

    try {
      const result = await trySource(domain, tld, source);
      if (result) {
        // Calculate quality score
        result.score = calculateDomainScore(result);

        // Enhance premium_reason with analysis
        if (result.premium && !result.premium_reason) {
          const reasons = analyzePremiumReason(result.domain);
          result.premium_reason = reasons.length > 0
            ? reasons.join(', ')
            : 'Premium domain';
        }

        // Cache the result
        const cacheKey = domainCacheKey(fullDomain, source);
        domainCache.set(cacheKey, result);
        return { result, fromCache: false };
      }
    } catch (error) {
      const wrapped = wrapError(error);
      logger.debug(`Source ${source} failed, trying next`, {
        domain: fullDomain,
        error: wrapped.message,
        retryable: wrapped.retryable,
      });

      // If it's not retryable, skip similar sources
      if (!wrapped.retryable && source === 'porkbun') {
        // Skip other registrar APIs, go straight to fallbacks
        continue;
      }
    }
  }

  // All sources failed
  throw new NoSourceAvailableError(fullDomain, triedSources);
}

/**
 * Build the priority list of sources to try.
 *
 * Priority order:
 * 1. Preferred registrars (if specified)
 * 2. Porkbun (has pricing, best API)
 * 3. Namecheap (has pricing)
 * 4. GoDaddy MCP (free, no pricing but good availability data)
 * 5. RDAP (free, no pricing)
 * 6. WHOIS (slowest fallback)
 */
function buildSourcePriority(
  tld: string,
  preferredRegistrars?: string[],
): string[] {
  const sources: string[] = [];

  // Add preferred registrars first
  if (preferredRegistrars && preferredRegistrars.length > 0) {
    for (const registrar of preferredRegistrars) {
      if (registrar === 'porkbun' && config.porkbun.enabled) {
        sources.push('porkbun');
      } else if (registrar === 'namecheap' && config.namecheap.enabled) {
        sources.push('namecheap');
      } else if (registrar === 'godaddy') {
        sources.push('godaddy');
      }
    }
  } else {
    // Default priority: Porkbun first (best API with pricing), then Namecheap, then GoDaddy
    if (config.porkbun.enabled) sources.push('porkbun');
    if (config.namecheap.enabled) sources.push('namecheap');
    // GoDaddy MCP is always available (no auth needed)
    sources.push('godaddy');
  }

  // Always add fallbacks
  if (isRdapAvailable(tld)) sources.push('rdap');
  if (isWhoisAvailable(tld)) sources.push('whois');

  // If no registrar APIs, GoDaddy MCP and RDAP should be first
  if (sources.length === 0) {
    sources.push('godaddy', 'rdap', 'whois');
  }

  return sources;
}

/**
 * Try a specific source for domain lookup.
 */
async function trySource(
  domain: string,
  tld: string,
  source: string,
): Promise<DomainResult | null> {
  switch (source) {
    case 'porkbun':
      return porkbunAdapter.search(domain, tld);

    case 'namecheap':
      return namecheapAdapter.search(domain, tld);

    case 'godaddy':
      return godaddyMcpAdapter.search(domain, tld);

    case 'rdap':
      return checkRdap(domain, tld);

    case 'whois':
      return checkWhois(domain, tld);

    default:
      logger.warn(`Unknown source: ${source}`);
      return null;
  }
}

/**
 * Generate human-readable insights about the results.
 */
function generateInsights(
  results: DomainResult[],
  errors: string[],
): string[] {
  const insights: string[] = [];

  // Available domains summary
  const available = results.filter((r) => r.available);
  const taken = results.filter((r) => !r.available);

  if (available.length > 0) {
    const cheapest = available.reduce(
      (min, r) =>
        r.price_first_year !== null &&
        (min === null || r.price_first_year < min.price_first_year!)
          ? r
          : min,
      null as DomainResult | null,
    );

    if (cheapest && cheapest.price_first_year !== null) {
      insights.push(
        `✅ ${available.length} domain${available.length > 1 ? 's' : ''} available! Best price: ${cheapest.domain} at $${cheapest.price_first_year}/year (${cheapest.registrar})`,
      );
    } else {
      insights.push(
        `✅ ${available.length} domain${available.length > 1 ? 's' : ''} available!`,
      );
    }
  }

  if (taken.length > 0) {
    insights.push(
      `❌ ${taken.length} domain${taken.length > 1 ? 's' : ''} already taken`,
    );
  }

  // TLD-specific advice
  for (const result of results) {
    if (result.available) {
      const tld = result.domain.split('.').pop()!;
      const advice = getTldAdvice(tld, result);
      if (advice) {
        insights.push(advice);
      }
    }
  }

  // Premium insights (enhanced with analyzer)
  const premiums = results.filter((r) => r.premium && r.available);
  if (premiums.length > 0) {
    // Add detailed insight for each premium domain
    for (const premium of premiums) {
      const premiumInsight = generatePremiumInsight(premium);
      if (premiumInsight) {
        insights.push(premiumInsight);
      }
    }

    // Add summary insights (alternatives, pricing context)
    const summaryInsights = generatePremiumSummary(results);
    insights.push(...summaryInsights);
  }

  // Privacy insight
  const withPrivacy = results.filter(
    (r) => r.available && r.privacy_included,
  );
  if (withPrivacy.length > 0) {
    insights.push(
      `🔒 ${withPrivacy.length} option${withPrivacy.length > 1 ? 's' : ''} include free WHOIS privacy`,
    );
  }

  // Expiration insights for taken domains
  const takenWithExpiration = results.filter(
    (r) => !r.available && r.expires_at && r.days_until_expiration !== undefined,
  );

  for (const domain of takenWithExpiration) {
    if (domain.days_until_expiration !== undefined) {
      if (domain.days_until_expiration <= 0) {
        insights.push(
          `🕐 ${domain.domain} has EXPIRED — may become available soon!`,
        );
      } else if (domain.days_until_expiration <= 30) {
        insights.push(
          `🕐 ${domain.domain} expires in ${domain.days_until_expiration} days — watch for availability`,
        );
      } else if (domain.days_until_expiration <= 90) {
        insights.push(
          `📅 ${domain.domain} expires in ${Math.round(domain.days_until_expiration / 30)} months`,
        );
      }
    }
  }

  // Error summary
  if (errors.length > 0) {
    insights.push(`⚠️ Could not check some TLDs: ${errors.join(', ')}`);
  }

  return insights;
}

/**
 * Get TLD-specific advice.
 */
function getTldAdvice(tld: string, result: DomainResult): string | null {
  const advice: Record<string, string> = {
    com: '💡 .com is the classic, universal choice — trusted worldwide',
    io: '💡 .io is popular with tech startups and SaaS products',
    dev: '💡 .dev signals developer/tech credibility (requires HTTPS)',
    app: '💡 .app is perfect for mobile/web applications (requires HTTPS)',
    co: '💡 .co is a popular alternative to .com for companies',
    ai: '💡 .ai is trending for AI/ML projects',
    sh: '💡 .sh is popular with developers (shell scripts!)',
  };

  return advice[tld] || null;
}

/**
 * Generate suggested next steps.
 */
function generateNextSteps(results: DomainResult[]): string[] {
  const nextSteps: string[] = [];
  const available = results.filter((r) => r.available);
  const taken = results.filter((r) => !r.available);
  const premiumAvailable = available.filter((r) => r.premium);
  const nonPremiumAvailable = available.filter((r) => !r.premium);

  if (available.length > 0) {
    // Check other TLDs
    const checkedTlds = new Set(results.map((r) => r.domain.split('.').pop()));
    const suggestedTlds = ['com', 'io', 'dev', 'app', 'co', 'ai'].filter(
      (t) => !checkedTlds.has(t),
    );
    if (suggestedTlds.length > 0) {
      nextSteps.push(
        `Check other TLDs: ${suggestedTlds.slice(0, 3).join(', ')}`,
      );
    }

    // Premium-specific advice
    if (premiumAvailable.length > 0 && nonPremiumAvailable.length === 0) {
      // All available domains are premium
      const firstPremium = premiumAvailable[0]!;
      const alternatives = suggestPremiumAlternatives(firstPremium.domain);
      if (alternatives.length > 0) {
        nextSteps.push(
          `Consider alternatives to avoid premium pricing: ${alternatives.join(', ')}`,
        );
      }
    }

    // Compare registrars
    if (available.length === 1 && !available[0]!.price_first_year) {
      nextSteps.push('Compare prices across registrars for better deals');
    }

    // Check social handles
    nextSteps.push('Check social handle availability (GitHub, X, npm)');
  }

  if (taken.length > 0 && available.length === 0) {
    nextSteps.push('Try name variations (add prefixes, suffixes, or hyphens)');
    nextSteps.push('Check different TLDs for availability');
  }

  if (available.length > 0) {
    // Prefer non-premium for registration suggestion
    const best = nonPremiumAvailable.length > 0
      ? nonPremiumAvailable.reduce((a, b) =>
          (a.price_first_year || Infinity) < (b.price_first_year || Infinity) ? a : b
        )
      : available[0]!;

    if (best.premium && best.price_first_year && best.price_first_year > 100) {
      nextSteps.push(
        `${best.domain} is premium ($${best.price_first_year}) — consider if it fits your budget`,
      );
    } else {
      nextSteps.push(
        `Register ${best.domain} at ${best.registrar} to secure it`,
      );
    }
  }

  return nextSteps;
}

/**
 * Bulk search for multiple domains.
 */
export async function bulkSearchDomains(
  domains: string[],
  tld: string = 'com',
  registrar?: string,
  maxConcurrent: number = 5,
): Promise<DomainResult[]> {
  const startTime = Date.now();
  const results: DomainResult[] = [];

  logger.info('Bulk search started', {
    count: domains.length,
    tld,
    registrar,
  });

  // Process in batches
  for (let i = 0; i < domains.length; i += maxConcurrent) {
    const batch = domains.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (domain) => {
      try {
        const normalizedDomain = validateDomainName(domain);
        const { result } = await searchSingleDomain(
          normalizedDomain,
          tld,
          registrar ? [registrar] : undefined,
        );
        return result;
      } catch (error) {
        logger.warn(`Failed to check ${domain}.${tld}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  const duration = Date.now() - startTime;
  logger.info('Bulk search completed', {
    checked: domains.length,
    results: results.length,
    duration_ms: duration,
  });

  return results;
}

/**
 * Compare pricing across registrars.
 */
export async function compareRegistrars(
  domain: string,
  tld: string,
  registrars: string[] = ['porkbun', 'namecheap'],
): Promise<{
  comparisons: DomainResult[];
  best_first_year: { registrar: string; price: number } | null;
  best_renewal: { registrar: string; price: number } | null;
  recommendation: string;
}> {
  const normalizedDomain = validateDomainName(domain);
  const comparisons: DomainResult[] = [];

  // Check each registrar
  for (const registrar of registrars) {
    try {
      const { result } = await searchSingleDomain(normalizedDomain, tld, [
        registrar,
      ]);
      comparisons.push(result);
    } catch (error) {
      logger.warn(`Registrar ${registrar} comparison failed`, {
        domain: `${normalizedDomain}.${tld}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Find best prices
  let bestFirstYear: { registrar: string; price: number } | null = null;
  let bestRenewal: { registrar: string; price: number } | null = null;

  for (const result of comparisons) {
    if (result.available && result.price_first_year !== null) {
      if (!bestFirstYear || result.price_first_year < bestFirstYear.price) {
        bestFirstYear = {
          registrar: result.registrar,
          price: result.price_first_year,
        };
      }
    }
    if (result.available && result.price_renewal !== null) {
      if (!bestRenewal || result.price_renewal < bestRenewal.price) {
        bestRenewal = {
          registrar: result.registrar,
          price: result.price_renewal,
        };
      }
    }
  }

  // Generate recommendation
  let recommendation = 'Could not compare registrars';
  if (bestFirstYear && bestRenewal) {
    if (bestFirstYear.registrar === bestRenewal.registrar) {
      recommendation = `${bestFirstYear.registrar} offers the best price for both first year ($${bestFirstYear.price}) and renewal ($${bestRenewal.price})`;
    } else {
      recommendation = `${bestFirstYear.registrar} for first year ($${bestFirstYear.price}), ${bestRenewal.registrar} for renewal ($${bestRenewal.price})`;
    }
  } else if (bestFirstYear) {
    recommendation = `${bestFirstYear.registrar} has the best first year price: $${bestFirstYear.price}`;
  }

  return {
    comparisons,
    best_first_year: bestFirstYear,
    best_renewal: bestRenewal,
    recommendation,
  };
}
