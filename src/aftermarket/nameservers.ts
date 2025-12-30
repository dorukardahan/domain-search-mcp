/**
 * Aftermarket detection via nameserver fingerprints.
 *
 * Uses public DNS NS records to detect common parking/marketplace hosts.
 * This is ToS-safe and does not require API keys.
 */

import { resolveNs } from 'node:dns/promises';
import type { DomainResult } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';

type AftermarketListing = DomainResult['aftermarket'];

type NsFingerprint = {
  source: string;
  type: 'aftermarket' | 'auction' | 'premium';
  nameservers: string[];
  url?: (domain: string) => string;
  note?: string;
};

const NS_TIMEOUT_MS = config.aftermarket.nsTimeoutMs;
const nsCache = new TtlCache<AftermarketListing | null>(
  config.aftermarket.nsCacheTtl,
);

const NS_FINGERPRINTS: NsFingerprint[] = [
  {
    source: 'sedo',
    type: 'aftermarket',
    nameservers: ['ns1.sedoparking.com', 'ns2.sedoparking.com'],
    url: (domain) =>
      `https://sedo.com/search/?keyword=${encodeURIComponent(domain)}`,
    note: 'Nameserver indicates Sedo parking. Verify listing on Sedo.',
  },
  {
    source: 'dan',
    type: 'aftermarket',
    nameservers: ['ns1.dan.com', 'ns2.dan.com'],
    url: (domain) => `https://dan.com/buy-domain/${encodeURIComponent(domain)}`,
    note: 'Nameserver indicates Dan parking. Verify listing on Dan.',
  },
  {
    source: 'afternic',
    type: 'aftermarket',
    nameservers: ['ns1.afternic.com', 'ns2.afternic.com'],
    url: (domain) =>
      `https://www.afternic.com/forsale/${encodeURIComponent(domain)}`,
    note: 'Nameserver indicates Afternic parking. Verify listing on Afternic.',
  },
];

async function resolveNsWithTimeout(domain: string): Promise<string[]> {
  const timeout = new Promise<string[]>((_, reject) => {
    setTimeout(() => reject(new Error('ns_timeout')), NS_TIMEOUT_MS);
  });

  return Promise.race([resolveNs(domain), timeout]);
}

export async function lookupAftermarketByNameserver(
  domain: string,
): Promise<AftermarketListing | null> {
  if (!config.aftermarket.nsEnabled) {
    return null;
  }

  const key = domain.toLowerCase();
  const cached = nsCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const nameservers = (await resolveNsWithTimeout(domain)).map((ns) =>
      ns.toLowerCase(),
    );

    for (const fingerprint of NS_FINGERPRINTS) {
      const matches = fingerprint.nameservers.every((ns) =>
        nameservers.includes(ns),
      );
      if (!matches) {
        continue;
      }

      const listing: AftermarketListing = {
        type: fingerprint.type,
        price: null,
        currency: null,
        source: fingerprint.source,
        url: fingerprint.url ? fingerprint.url(domain) : undefined,
        note: fingerprint.note,
      };

      nsCache.set(key, listing);
      return listing;
    }
  } catch (error) {
    logger.debug('Nameserver aftermarket lookup failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  nsCache.set(key, null);
  return null;
}
