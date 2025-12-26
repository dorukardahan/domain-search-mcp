/**
 * RDAP (Registration Data Access Protocol) Fallback.
 *
 * RFC 7480 - Modern replacement for WHOIS.
 * Provides availability status only (no pricing).
 * Public API - no authentication required.
 */

import axios, { type AxiosError } from 'axios';
import type { DomainResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { TimeoutError, RegistrarApiError } from '../utils/errors.js';

/**
 * RDAP bootstrap URLs for different TLDs.
 */
const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

/**
 * Fallback RDAP servers for common TLDs.
 */
const RDAP_SERVERS: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1',
  net: 'https://rdap.verisign.com/net/v1',
  org: 'https://rdap.publicinterestregistry.org/rdap/org',
  io: 'https://rdap.nic.io/domain',
  dev: 'https://rdap.nic.google/domain',
  app: 'https://rdap.nic.google/domain',
  co: 'https://rdap.nic.co/domain',
  ai: 'https://rdap.nic.ai/domain',
};

/**
 * Cache for RDAP server lookups.
 */
let rdapServerCache: Record<string, string> | null = null;

/**
 * Get the RDAP server URL for a TLD.
 */
async function getRdapServer(tld: string): Promise<string | null> {
  // Check hardcoded servers first
  if (RDAP_SERVERS[tld]) {
    return RDAP_SERVERS[tld];
  }

  // Try to fetch from IANA bootstrap
  try {
    if (!rdapServerCache) {
      const response = await axios.get<{
        services: [string[], string[]][];
      }>(RDAP_BOOTSTRAP, { timeout: 5000 });

      rdapServerCache = {};
      for (const [tlds, servers] of response.data.services) {
        for (const t of tlds) {
          rdapServerCache[t] = servers[0] || '';
        }
      }
    }

    return rdapServerCache[tld] || null;
  } catch {
    logger.debug('Failed to fetch RDAP bootstrap', { tld });
    return null;
  }
}

/**
 * Parse RDAP response to determine availability.
 */
function parseRdapResponse(data: unknown): {
  available: boolean;
  registrar?: string;
} {
  if (!data || typeof data !== 'object') {
    return { available: false };
  }

  const record = data as Record<string, unknown>;

  // If we got a domain record, it's registered (not available)
  if (record.objectClassName === 'domain') {
    // Extract registrar info if available
    const entities = record.entities as Array<{
      roles?: string[];
      vcardArray?: [string, Array<[string, object, string, string]>];
    }> | undefined;

    let registrar: string | undefined;
    if (entities) {
      for (const entity of entities) {
        if (entity.roles?.includes('registrar') && entity.vcardArray) {
          // Extract FN (formatted name) from vCard
          const vcard = entity.vcardArray[1];
          const fn = vcard?.find((v) => v[0] === 'fn');
          if (fn) {
            registrar = fn[3] as string;
          }
        }
      }
    }

    return { available: false, registrar };
  }

  return { available: false };
}

/**
 * Check domain availability using RDAP.
 */
export async function checkRdap(
  domain: string,
  tld: string,
): Promise<DomainResult> {
  const fullDomain = `${domain}.${tld}`;
  logger.debug('RDAP check', { domain: fullDomain });

  const server = await getRdapServer(tld);
  if (!server) {
    throw new RegistrarApiError('rdap', `No RDAP server found for .${tld}`);
  }

  const url = `${server}/domain/${fullDomain}`;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        Accept: 'application/rdap+json',
      },
      // Don't throw on 404 - that means available
      validateStatus: (status) => status < 500,
    });

    // 404 = domain not found = available
    if (response.status === 404) {
      return createRdapResult(domain, tld, true);
    }

    // 200 = domain found = not available
    if (response.status === 200) {
      const parsed = parseRdapResponse(response.data);
      return createRdapResult(domain, tld, parsed.available);
    }

    throw new RegistrarApiError(
      'rdap',
      `Unexpected response: HTTP ${response.status}`,
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNABORTED') {
        throw new TimeoutError('RDAP lookup', 10000);
      }

      // 404 = available
      if (axiosError.response?.status === 404) {
        return createRdapResult(domain, tld, true);
      }

      throw new RegistrarApiError(
        'rdap',
        axiosError.message,
        axiosError.response?.status,
        error,
      );
    }

    throw new RegistrarApiError(
      'rdap',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

/**
 * Create a standardized result from RDAP.
 */
function createRdapResult(
  domain: string,
  tld: string,
  available: boolean,
): DomainResult {
  return {
    domain: `${domain}.${tld}`,
    available,
    premium: false, // RDAP doesn't tell us about premium status
    price_first_year: null, // RDAP doesn't provide pricing
    price_renewal: null,
    currency: 'USD',
    privacy_included: false,
    transfer_price: null,
    registrar: 'unknown',
    source: 'rdap',
    checked_at: new Date().toISOString(),
  };
}

/**
 * Check if RDAP is available for a TLD (synchronous check).
 * Uses hardcoded servers only for quick check.
 */
export function isRdapAvailable(tld: string): boolean {
  // Use hardcoded servers for sync check
  // The async bootstrap will be tried during actual lookup
  return RDAP_SERVERS[tld] !== undefined;
}
