/**
 * Pricing API client (backend).
 *
 * This MCP does NOT ship registrar secrets. Pricing is retrieved from a
 * centralized backend (Vercel) that owns the registrar API keys.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { AdaptiveConcurrencyLimiter } from '../utils/adaptive-concurrency.js';
import { TtlCache } from '../utils/cache.js';
import type { PricingStatus } from '../types.js';

export type PricingQuote = {
  registrar: string;
  available: boolean | null;
  premium: boolean | null;
  price_first_year: number | null;
  price_renewal: number | null;
  price_transfer: number | null;
  currency: string | null;
  quote_status: PricingStatus;
  message?: string;
};

export type PricingQuoteResponse = {
  domain: string;
  quotes: PricingQuote[];
  best_first_year: { registrar: string; price: number; currency: string | null } | null;
  best_renewal: { registrar: string; price: number; currency: string | null } | null;
  best_transfer: { registrar: string; price: number; currency: string | null } | null;
  quote_status: PricingStatus;
  message?: string;
};

export type PricingCompareEntry = {
  registrar: string;
  domain: string;
  price_first_year: number | null;
  price_renewal: number | null;
  price_transfer: number | null;
  currency: string | null;
  source: 'catalog' | 'live';
  quote_status: PricingStatus;
  available?: boolean | null;
  premium?: boolean | null;
  message?: string;
};

export type PricingCompareResponse = {
  domain: string;
  comparisons: PricingCompareEntry[];
  best_first_year: { registrar: string; price: number; currency: string | null } | null;
  best_renewal: { registrar: string; price: number; currency: string | null } | null;
};

const pricingLimiter = new AdaptiveConcurrencyLimiter({
  name: 'pricing_api',
  minConcurrency: 2,
  maxConcurrency: config.pricingApi.concurrency * 2, // Allow scaling up to 2x config
  initialConcurrency: config.pricingApi.concurrency,
  errorThreshold: 0.1,            // 10% error rate triggers decrease
  latencyThresholdMs: 3000,       // Pricing API can be slow, 3s threshold
  windowMs: 60_000,               // 1 minute window (less traffic than RDAP)
  minSamples: 10,                 // Need 10 samples before adjusting
  evaluationIntervalMs: 15_000,   // Evaluate every 15 seconds
});
const pricingCache = new TtlCache<PricingQuoteResponse>(
  config.cache.pricingTtl,
  5000,
);

function normalizeBaseUrl(baseUrl?: string): string | null {
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.pricingApi.token) {
    headers.Authorization = `Bearer ${config.pricingApi.token}`;
  }
  return headers;
}

async function fetchJson(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let json: unknown | null = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPricingQuote(
  fqdn: string,
): Promise<PricingQuoteResponse | null> {
  if (!config.pricingApi.enabled) return null;
  const baseUrl = normalizeBaseUrl(config.pricingApi.baseUrl);
  if (!baseUrl) return null;

  const cacheKey = `quote:${fqdn.toLowerCase()}`;
  const cached = pricingCache.get(cacheKey);
  if (cached) return cached;

  return pricingLimiter.run(async () => {
    try {
      const { ok, json } = await fetchJson(
        `${baseUrl}/api/quote`,
        { fqdn },
        config.pricingApi.timeoutMs,
      );

      if (!json || typeof json !== 'object') {
        return null;
      }

      const payload = json as PricingQuoteResponse;
      if (payload.domain) {
        pricingCache.set(cacheKey, payload);
      }

      if (!ok) {
        logger.debug('Pricing API returned non-200', { fqdn, status: payload.quote_status });
      }

      return payload;
    } catch (error) {
      logger.warn('Pricing API quote failed', {
        fqdn,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });
}

export async function fetchPricingCompare(
  domain: string,
  tld: string,
  registrars?: string[],
): Promise<PricingCompareResponse | null> {
  if (!config.pricingApi.enabled) return null;
  const baseUrl = normalizeBaseUrl(config.pricingApi.baseUrl);
  if (!baseUrl) return null;

  return pricingLimiter.run(async () => {
    try {
      const { json } = await fetchJson(
        `${baseUrl}/api/compare`,
        {
          domain,
          tld,
          registrars: registrars && registrars.length > 0 ? registrars : undefined,
        },
        config.pricingApi.timeoutMs,
      );

      if (!json || typeof json !== 'object') {
        return null;
      }

      return json as PricingCompareResponse;
    } catch (error) {
      logger.warn('Pricing API compare failed', {
        domain: `${domain}.${tld}`,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });
}
