/**
 * Sedo public auctions feed integration (no auth).
 *
 * Feed format (semicolon-separated):
 * domain;auction_start;auction_end;price;currency;...;
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';

export type SedoAuctionListing = {
  domain: string;
  price: number | null;
  currency: string | null;
  auction_end?: string | null;
  source: 'sedo_feed';
  url: string;
};

type SedoIndex = Map<string, SedoAuctionListing>;

const FEED_CACHE_KEY = 'sedo:auctions';
const feedCache = new TtlCache<SedoIndex>(config.cache.sedoTtl, 2);

function normalizeCurrency(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned === 'US') return 'USD';
  if (cleaned.length === 3) return cleaned;
  return null;
}

function buildSedoSearchUrl(domain: string): string {
  return `https://sedo.com/search/?keyword=${encodeURIComponent(domain)}`;
}

export function parseSedoLine(line: string): SedoAuctionListing | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(';');
  if (parts.length < 5) return null;

  const domain = parts[0]?.trim().toLowerCase();
  if (!domain) return null;

  const priceRaw = parts[3]?.trim();
  const price = priceRaw ? Number(priceRaw) : NaN;
  const currency = normalizeCurrency(parts[4]?.trim() || '');
  const endTs = parts[2] ? Number(parts[2]) : NaN;
  const auctionEnd = Number.isFinite(endTs)
    ? new Date(endTs * 1000).toISOString()
    : null;

  return {
    domain,
    price: Number.isFinite(price) ? price : null,
    currency,
    auction_end: auctionEnd,
    source: 'sedo_feed',
    url: buildSedoSearchUrl(domain),
  };
}

export function parseSedoFeed(text: string): SedoIndex {
  const index: SedoIndex = new Map();
  for (const line of text.split('\n')) {
    const listing = parseSedoLine(line);
    if (listing) {
      index.set(listing.domain, listing);
    }
  }
  return index;
}

async function fetchSedoFeed(): Promise<SedoIndex> {
  const cached = feedCache.get(FEED_CACHE_KEY);
  if (cached) return cached;

  const url =
    config.aftermarket.sedoFeedUrl || 'https://sedo.com/txt/auctions_us.txt';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Sedo feed HTTP ${response.status}`);
    }
    const text = await response.text();
    const index = parseSedoFeed(text);
    feedCache.set(FEED_CACHE_KEY, index);
    return index;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupSedoAuction(
  domain: string,
): Promise<SedoAuctionListing | null> {
  if (!config.aftermarket.sedoEnabled) return null;

  try {
    const index = await fetchSedoFeed();
    return index.get(domain.toLowerCase()) ?? null;
  } catch (error) {
    logger.debug('Sedo feed lookup failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
