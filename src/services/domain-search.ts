/**
 * Domain Search Service.
 *
 * Orchestrates domain availability checks across multiple sources:
 * 1. Porkbun (if configured - has pricing)
 * 2. Namecheap (if configured - has pricing)
 * 3. RDAP (primary public source)
 * 4. WHOIS (last resort)
 * 5. GoDaddy public endpoint (premium/auction signal only for search_domain)
 *
 * Handles:
 * - Smart source selection based on availability and configuration
 * - Graceful fallback on failures
 * - Caching for performance
 * - Insights generation for vibecoding UX
 */

import type { DomainResult, SearchResponse } from '../types.js';
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
import { domainCache, domainCacheKey } from '../utils/cache.js';
import { ConcurrencyLimiter } from '../utils/concurrency.js';
import {
  porkbunAdapter,
  namecheapAdapter,
  godaddyPublicAdapter,
  type ParsedAvailability,
} from '../registrars/index.js';
import { checkRdap, isRdapAvailable } from '../fallbacks/rdap.js';
import { checkWhois, isWhoisAvailable } from '../fallbacks/whois.js';
import { fetchPricingQuote, fetchPricingCompare } from './pricing-api.js';
import type {
  PricingQuoteResponse,
  PricingQuote,
  PricingCompareResponse,
  PricingCompareEntry,
} from './pricing-api.js';
import {
  generatePremiumInsight,
  generatePremiumSummary,
  calculateDomainScore,
  analyzePremiumReason,
  suggestPremiumAlternatives,
} from '../utils/premium-analyzer.js';
import type { PricingStatus, PricingSource } from '../types.js';
import { lookupSedoAuction } from '../aftermarket/sedo.js';
import { lookupAftermarketByNameserver } from '../aftermarket/nameservers.js';

const SEARCH_TLD_CONCURRENCY = 10;
const BULK_CONCURRENCY = 20;
const CACHE_TTL_AVAILABLE_MS = config.cache.availabilityTtl * 1000;
const CACHE_TTL_TAKEN_MS = config.cache.availabilityTtl * 2000;

type PricingOptions = {
  enabled: boolean;
  maxQuotes: number;
};

type PricingBudget = {
  enabled: boolean;
  take: () => boolean;
};

type SearchOptions = {
  pricing?: PricingOptions;
  includeGodaddySignals?: boolean;
};


function createPricingBudget(options?: PricingOptions): PricingBudget {
  const enabled = options?.enabled ?? config.pricingApi.enabled;
  const maxQuotes = options?.maxQuotes ?? config.pricingApi.maxQuotesPerSearch;
  const unlimited = enabled && maxQuotes <= 0;
  let remaining = enabled ? Math.max(0, maxQuotes) : 0;
  return {
    enabled,
    take: () => {
      if (!enabled) return false;
      if (unlimited) return true;
      if (remaining <= 0) return false;
      remaining -= 1;
      return true;
    },
  };
}

function buildRegistrarPriceUrl(
  registrar: string | undefined,
  domain: string,
): string | null {
  const normalized = registrar ? registrar.toLowerCase() : 'unknown';
  switch (normalized) {
    case 'porkbun':
      return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
    case 'namecheap':
      return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
    case 'godaddy':
    case 'unknown':
      return `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`;
    default:
      return `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`;
  }
}

function buildAftermarketUrl(domain: string): string {
  return `https://auctions.godaddy.com/trpSearchResults.aspx?domain=${encodeURIComponent(domain)}`;
}

async function applyAftermarketFallback(result: DomainResult): Promise<void> {
  if (result.available || result.aftermarket) {
    return;
  }

  const sedoListing = await lookupSedoAuction(result.domain);
  if (sedoListing) {
    result.aftermarket = {
      type: 'auction',
      price: sedoListing.price,
      currency: sedoListing.currency,
      source: sedoListing.source,
      url: sedoListing.url,
      note: 'Listed in Sedo auctions feed. Verify details at the marketplace link.',
    };
    return;
  }

  const nsListing = await lookupAftermarketByNameserver(result.domain);
  if (nsListing) {
    result.aftermarket = nsListing;
    return;
  }

  result.aftermarket = {
    type: 'aftermarket',
    price: null,
    currency: null,
    source: 'fallback',
    url: buildAftermarketUrl(result.domain),
    note: 'Domain is taken. Check aftermarket listings at the marketplace link.',
  };
}

function applyPricingMetadata(result: DomainResult): void {
  if (!result.price_check_url) {
    if (
      config.pricingApi.enabled &&
      (!result.registrar || result.registrar === 'unknown')
    ) {
      result.price_check_url =
        buildRegistrarPriceUrl('porkbun', result.domain) || undefined;
    } else {
      result.price_check_url =
        buildRegistrarPriceUrl(result.registrar, result.domain) || undefined;
    }
  }

  if (result.price_note) {
    return;
  }

  if (result.pricing_status === 'catalog_only') {
    result.price_note = 'Estimated price from catalog. Verify via price_check_url.';
    return;
  }

  if (result.pricing_status === 'not_available') {
    result.price_note =
      'Live price unavailable (rate-limited or not configured). Verify via price_check_url.';
    return;
  }

  if (result.pricing_status === 'not_configured') {
    result.price_note = 'Pricing backend not configured. Verify via price_check_url.';
    return;
  }

  if (result.pricing_status === 'error') {
    result.price_note = 'Price check failed. Verify via price_check_url.';
    return;
  }

  if (result.pricing_status === 'partial') {
    result.price_note = 'Partial price data. Verify via price_check_url.';
    return;
  }

  if (result.pricing_status === 'ok') {
    result.price_note = 'Live price quote. Verify via price_check_url.';
    return;
  }

  result.price_note = 'Verify pricing via price_check_url.';
}

/**
 * Search for domain availability across multiple TLDs.
 */
export async function searchDomain(
  domainName: string,
  tlds: string[] = ['com', 'io', 'dev'],
  preferredRegistrars?: string[],
  options?: SearchOptions,
): Promise<SearchResponse> {
  const startTime = Date.now();
  const normalizedDomain = validateDomainName(domainName);
  const normalizedTlds = validateTlds(tlds);
  const includeGodaddySignals = options?.includeGodaddySignals ?? true;
  const pricingBudget = createPricingBudget(options?.pricing);

  logger.info('Domain search started', {
    domain: normalizedDomain,
    tlds: normalizedTlds,
  });

  // Search each TLD
  const results: DomainResult[] = [];
  const errors: string[] = [];
  let fromCache = false;

  // OPTIMIZATION: Run GoDaddy signals and main TLD searches in PARALLEL
  // GoDaddy signal lookup should not block the main search
  const fullDomains = normalizedTlds.map((tld) =>
    buildDomain(normalizedDomain, tld),
  );

  // Start GoDaddy lookup (non-blocking)
  const godaddyPromise = includeGodaddySignals
    ? godaddyPublicAdapter.bulkSearch(fullDomains).catch((error) => {
        logger.debug('GoDaddy signal lookup failed', {
          domain: normalizedDomain,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    : Promise.resolve(null);

  // Run TLD checks with concurrency limits (parallel with GoDaddy)
  const limiter = new ConcurrencyLimiter(SEARCH_TLD_CONCURRENCY);
  const tldSearchPromise = Promise.all(
    normalizedTlds.map((tld) =>
      limiter.run(async () => {
        try {
          // Note: godaddySignals will be null during initial search
          // We merge signals after both complete
          const result = await searchSingleDomain(
            normalizedDomain,
            tld,
            preferredRegistrars,
            null, // GoDaddy signals applied post-hoc
            pricingBudget,
          );
          if (result.fromCache) fromCache = true;
          return { success: true as const, tld, result: result.result };
        } catch (error) {
          const wrapped = wrapError(error);
          return { success: false as const, tld, error: wrapped };
        }
      }),
    ),
  );

  // Wait for both to complete in parallel
  const [godaddySignals, outcomes] = await Promise.all([
    godaddyPromise,
    tldSearchPromise,
  ]);

  for (const outcome of outcomes) {
    if (outcome.success) {
      // Apply GoDaddy signals post-hoc (from parallel lookup)
      if (godaddySignals) {
        const signal = godaddySignals.get(outcome.result.domain.toLowerCase());
        if (signal) {
          applyGodaddySignal(outcome.result, signal);
        }
      }
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
  godaddySignals?: Map<string, ParsedAvailability> | null,
  pricingBudget?: PricingBudget,
): Promise<{ result: DomainResult; fromCache: boolean }> {
  const fullDomain = buildDomain(domain, tld);
  const triedSources: string[] = [];

  // Check cache first
  for (const source of [
    'porkbun_api',
    'namecheap_api',
    'godaddy_api',
    'rdap',
    'whois',
  ] as const) {
    const cacheKey = domainCacheKey(fullDomain, source);
    const cached = domainCache.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { domain: fullDomain, source });
      return { result: cached, fromCache: true };
    }
  }

  // Build source priority
  const sources = buildSourcePriority(tld, preferredRegistrars);
  const godaddySignal = godaddySignals?.get(fullDomain.toLowerCase());

  // Try each source
  for (const source of sources) {
    triedSources.push(source);

    try {
      const result = await trySource(domain, tld, source);
      if (result) {
        applyGodaddySignal(result, godaddySignal);
        await applyPricingQuote(result, pricingBudget);
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
        const cacheKey = domainCacheKey(fullDomain, result.source);
        const ttlMs = result.available ? CACHE_TTL_AVAILABLE_MS : CACHE_TTL_TAKEN_MS;
        domainCache.set(cacheKey, result, ttlMs);
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

  if (godaddySignal) {
    const fallbackResult: DomainResult = {
      domain: fullDomain,
      available: godaddySignal.available,
      premium: godaddySignal.premium,
      price_first_year: null,
      price_renewal: null,
      currency: 'USD',
      privacy_included: false,
      transfer_price: null,
      registrar: 'godaddy',
      source: 'godaddy_api',
      checked_at: new Date().toISOString(),
      premium_reason: godaddySignal.premium
        ? 'Premium domain (GoDaddy)'
        : godaddySignal.auction
        ? 'Auction domain (GoDaddy)'
        : undefined,
    };

    if (godaddySignal.premium || godaddySignal.auction) {
      fallbackResult.aftermarket = {
        type: godaddySignal.auction ? 'auction' : 'premium',
        price: null,
        currency: null,
        source: 'godaddy_signal',
        url: buildAftermarketUrl(fallbackResult.domain),
        note: 'Aftermarket/auction detected. Verify price at the marketplace link.',
      };
    }

    applyPricingMetadata(fallbackResult);
    await applyAftermarketFallback(fallbackResult);

    const cacheKey = domainCacheKey(fullDomain, fallbackResult.source);
    const ttlMs = fallbackResult.available ? CACHE_TTL_AVAILABLE_MS : CACHE_TTL_TAKEN_MS;
    domainCache.set(cacheKey, fallbackResult, ttlMs);
    return { result: fallbackResult, fromCache: false };
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
 * 4. RDAP (free, no pricing)
 * 5. WHOIS (slowest fallback)
 */
function buildSourcePriority(
  tld: string,
  preferredRegistrars?: string[],
): string[] {
  const sources: string[] = [];
  const allowLocalRegistrars = !config.pricingApi.enabled;

  // Add preferred registrars first
  if (allowLocalRegistrars && preferredRegistrars && preferredRegistrars.length > 0) {
    for (const registrar of preferredRegistrars) {
      if (registrar === 'porkbun' && config.porkbun.enabled) {
        sources.push('porkbun');
      } else if (registrar === 'namecheap' && config.namecheap.enabled) {
        sources.push('namecheap');
      }
    }
  } else if (allowLocalRegistrars) {
    // Default priority: Porkbun first (best API with pricing), then Namecheap
    if (config.porkbun.enabled) sources.push('porkbun');
    if (config.namecheap.enabled) sources.push('namecheap');
  }

  // Always add fallbacks
  if (isRdapAvailable(tld)) sources.push('rdap');
  if (isWhoisAvailable(tld)) sources.push('whois');

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
      return godaddyPublicAdapter.search(domain, tld);

    case 'rdap':
      return checkRdap(domain, tld);

    case 'whois':
      return checkWhois(domain, tld);

    default:
      logger.warn(`Unknown source: ${source}`);
      return null;
  }
}

function applyGodaddySignal(
  result: DomainResult,
  signal?: ParsedAvailability | null,
): void {
  if (!signal) {
    return;
  }

  if (result.source !== 'rdap' && result.source !== 'whois') {
    return;
  }

  if (signal.premium || signal.auction) {
    if (signal.premium) {
      result.premium = true;
      result.premium_reason = result.premium_reason || 'Premium domain (GoDaddy)';
    }
    result.aftermarket = {
      type: signal.auction ? 'auction' : 'premium',
      price: null,
      currency: null,
      source: 'godaddy_signal',
      url: buildAftermarketUrl(result.domain),
      note: 'Aftermarket/auction detected. Verify price at the marketplace link.',
    };
  }
}

function pickBestQuote(
  quotes: PricingQuote[],
  best: { registrar: string } | null,
): PricingQuote | null {
  if (best) {
    const matched = quotes.find((q) => q.registrar === best.registrar);
    if (matched) return matched;
  }

  return (
    quotes.find((q) => q.price_first_year !== null) ||
    quotes.find((q) => q.price_renewal !== null) ||
    quotes[0] ||
    null
  );
}

function compareEntryToResult(entry: PricingCompareEntry): DomainResult {
  const result: DomainResult = {
    domain: entry.domain,
    available: entry.available ?? true,
    premium: entry.premium ?? false,
    price_first_year: entry.price_first_year,
    price_renewal: entry.price_renewal,
    currency: entry.currency ?? 'USD',
    privacy_included: false,
    transfer_price: entry.price_transfer,
    registrar: entry.registrar,
    source: entry.source === 'catalog' ? 'catalog' : 'pricing_api',
    pricing_source: entry.source === 'catalog' ? 'catalog' : 'pricing_api',
    pricing_status: entry.quote_status,
    checked_at: new Date().toISOString(),
    premium_reason: entry.premium ? 'Premium domain' : undefined,
  };

  if (result.premium && result.price_first_year !== null) {
    result.aftermarket = {
      type: 'premium',
      price: result.price_first_year,
      currency: result.currency ?? null,
      source: entry.source === 'catalog' ? 'catalog' : 'pricing_api',
      url: buildRegistrarPriceUrl(result.registrar, result.domain) || undefined,
      note: 'Premium pricing detected. Verify at registrar checkout.',
    };
  }

  applyPricingMetadata(result);
  return result;
}

function mergePricing(
  result: DomainResult,
  payload: PricingQuoteResponse,
): void {
  result.pricing_status = payload.quote_status as PricingStatus;
  result.pricing_source =
    payload.quote_status === 'catalog_only' ? 'catalog' : 'pricing_api';

  const quotes = payload.quotes || [];
  const bestFirst = payload.best_first_year;
  const selected = pickBestQuote(quotes, bestFirst);

  if (bestFirst) {
    result.price_first_year = bestFirst.price;
    result.registrar = bestFirst.registrar;
    if (bestFirst.currency) {
      result.currency = bestFirst.currency;
    }
  } else if (selected && selected.price_first_year !== null) {
    result.price_first_year = selected.price_first_year;
    result.registrar = selected.registrar;
    if (selected.currency) {
      result.currency = selected.currency;
    }
  }

  if (selected) {
    result.price_renewal = selected.price_renewal ?? result.price_renewal;
    result.transfer_price = selected.price_transfer ?? result.transfer_price;
    if (!result.registrar) {
      result.registrar = selected.registrar;
    }
  }

  const hasPremium = quotes.some((q) => q.premium === true);
  if (hasPremium) {
    result.premium = true;
    if (!result.premium_reason) {
      result.premium_reason = 'Premium domain';
    }
    if (!result.aftermarket) {
      result.aftermarket = {
        type: 'premium',
        price: result.price_first_year,
        currency: result.currency ?? null,
        source: 'pricing_api',
        url: buildRegistrarPriceUrl(result.registrar, result.domain) || undefined,
        note: 'Premium pricing detected. Verify at registrar checkout.',
      };
    }
  }

  const hasAnyPrice =
    result.price_first_year !== null ||
    result.price_renewal !== null ||
    result.transfer_price !== null;
  if (!hasAnyPrice && result.pricing_status === 'ok') {
    result.pricing_status = 'partial';
  }

  applyPricingMetadata(result);
}

async function applyPricingQuote(
  result: DomainResult,
  pricingBudget?: PricingBudget,
): Promise<void> {
  if (result.source === 'porkbun_api' || result.source === 'namecheap_api') {
    result.pricing_source = result.source as PricingSource;
    result.pricing_status = result.price_first_year !== null ? 'ok' : 'partial';
    applyPricingMetadata(result);
    await applyAftermarketFallback(result);
    return;
  }

  if (!pricingBudget?.enabled) {
    result.pricing_status = 'not_configured';
    applyPricingMetadata(result);
    await applyAftermarketFallback(result);
    return;
  }

  if (!result.available) {
    result.pricing_status = 'not_available';
    applyPricingMetadata(result);
    await applyAftermarketFallback(result);
    return;
  }

  if (!pricingBudget.take()) {
    result.pricing_status = 'not_available';
    applyPricingMetadata(result);
    await applyAftermarketFallback(result);
    return;
  }

  const payload = await fetchPricingQuote(result.domain);
  if (!payload) {
    result.pricing_status = 'error';
    applyPricingMetadata(result);
    await applyAftermarketFallback(result);
    return;
  }

  mergePricing(result, payload);
  await applyAftermarketFallback(result);
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

    if (best.price_check_url) {
      nextSteps.push(
        `Verify pricing for ${best.domain}: ${best.price_check_url}`,
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
  maxConcurrent: number = BULK_CONCURRENCY,
): Promise<DomainResult[]> {
  const startTime = Date.now();
  const results: DomainResult[] = [];
  const pricingBudget = createPricingBudget({
    enabled: config.pricingApi.enabled,
    maxQuotes: config.pricingApi.maxQuotesPerBulk,
  });

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
          null,
          pricingBudget,
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
  registrars: string[] = ['porkbun'],
): Promise<{
  comparisons: DomainResult[];
  best_first_year: { registrar: string; price: number } | null;
  best_renewal: { registrar: string; price: number } | null;
  recommendation: string;
}> {
  const normalizedDomain = validateDomainName(domain);
  const comparisons: DomainResult[] = [];

  const normalizedRegistrars = registrars.map((r) => r.toLowerCase());

  if (config.pricingApi.enabled) {
    const response = await fetchPricingCompare(
      normalizedDomain,
      tld,
      normalizedRegistrars.length > 0 ? normalizedRegistrars : undefined,
    );

    if (response) {
      for (const entry of response.comparisons) {
        comparisons.push(compareEntryToResult(entry));
      }

      const bestFirst = response.best_first_year
        ? {
            registrar: response.best_first_year.registrar,
            price: response.best_first_year.price,
          }
        : null;
      const bestRenewal = response.best_renewal
        ? {
            registrar: response.best_renewal.registrar,
            price: response.best_renewal.price,
          }
        : null;

      let recommendation = 'Could not compare registrars';
      if (bestFirst && bestRenewal) {
        if (bestFirst.registrar === bestRenewal.registrar) {
          recommendation = `${bestFirst.registrar} offers the best price for both first year ($${bestFirst.price}) and renewal ($${bestRenewal.price})`;
        } else {
          recommendation = `${bestFirst.registrar} for first year ($${bestFirst.price}), ${bestRenewal.registrar} for renewal ($${bestRenewal.price})`;
        }
      } else if (bestFirst) {
        recommendation = `${bestFirst.registrar} has the best first year price: $${bestFirst.price}`;
      }

      return {
        comparisons,
        best_first_year: bestFirst,
        best_renewal: bestRenewal,
        recommendation,
      };
    }
  }

  // Fallback: local registrar adapters (BYOK)
  for (const registrar of normalizedRegistrars) {
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
