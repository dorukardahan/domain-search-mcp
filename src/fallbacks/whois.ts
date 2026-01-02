/**
 * WHOIS Fallback (RFC 3912).
 *
 * Legacy protocol for domain lookup.
 * Public, no authentication required.
 * Slower than RDAP - use as last resort.
 *
 * Note: We use a public WHOIS API to avoid raw TCP connections
 * which aren't well-supported in all Node.js environments.
 */

import axios, { type AxiosError } from 'axios';
import type { DomainResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { TimeoutError, RegistrarApiError } from '../utils/errors.js';
import { ConcurrencyLimiter, KeyedLimiter } from '../utils/concurrency.js';

/**
 * WHOIS server mappings for common TLDs.
 */
const WHOIS_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  io: 'whois.nic.io',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  co: 'whois.nic.co',
  ai: 'whois.nic.ai',
  me: 'whois.nic.me',
  cc: 'ccwhois.verisign-grs.com',
  xyz: 'whois.nic.xyz',
  sh: 'whois.nic.sh',
};

const WHOIS_TIMEOUT_MS = 1500;
const WHOIS_GLOBAL_CONCURRENCY = 2;
const WHOIS_HOST_CONCURRENCY = 1;
const whoisGlobalLimiter = new ConcurrencyLimiter(WHOIS_GLOBAL_CONCURRENCY);
const whoisHostLimiter = new KeyedLimiter(WHOIS_HOST_CONCURRENCY);

/**
 * Patterns that indicate a domain is NOT available.
 */
const REGISTERED_PATTERNS = [
  /domain name:/i,
  /registrant:/i,
  /creation date:/i,
  /name server:/i,
  /status:\s*(?:active|ok|registered)/i,
];

/**
 * Patterns that indicate a domain IS available.
 */
const AVAILABLE_PATTERNS = [
  /no match/i,
  /not found/i,
  /no data found/i,
  /no entries found/i,
  /no object found/i,
  /domain not found/i,
  /no whois server/i,
  /available for registration/i,
  /is free/i,
  /status:\s*free/i,
];

/**
 * Parse WHOIS response to determine availability.
 */
function parseWhoisResponse(response: string): boolean {
  const text = response.toLowerCase();

  // Check for "available" patterns first
  for (const pattern of AVAILABLE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check for "registered" patterns
  for (const pattern of REGISTERED_PATTERNS) {
    if (pattern.test(text)) {
      return false;
    }
  }

  // If no clear indication, assume not available (safer)
  return false;
}

/**
 * Check domain availability using a public WHOIS API.
 *
 * We use a web-based WHOIS lookup to avoid TCP connection issues.
 * This is more reliable across different environments.
 */
export async function checkWhois(
  domain: string,
  tld: string,
): Promise<DomainResult> {
  const fullDomain = `${domain}.${tld}`;
  logger.debug('WHOIS check', { domain: fullDomain });

  const serverKey = getWhoisServer(tld) ?? `tld:${tld}`;

  return whoisGlobalLimiter.run(() =>
    whoisHostLimiter.run(serverKey, async () => {
      // Use a public WHOIS API service
      // There are several options; we'll try a few
      const apis = [
        {
          url: `https://whoisjson.com/api/v1/whois`,
          params: { domain: fullDomain },
          parser: (data: Record<string, unknown>) => {
            // If we get domain data, it's registered
            if (data.domain_name || data.registrar || data.creation_date || data.name_servers) {
              return false; // registered
            }
            // Check for explicit "not found" messages
            const status = String(data.status || '').toLowerCase();
            const message = String(data.message || '').toLowerCase();
            if (
              status.includes('not found') ||
              status.includes('available') ||
              message.includes('not found') ||
              message.includes('no match')
            ) {
              return true; // available
            }
            // IMPORTANT: If unclear, assume NOT available (fail-safe)
            // This prevents false positives
            return false;
          },
        },
      ];

      // Try each API in order
      for (const api of apis) {
        try {
          const response = await axios.get(api.url, {
            params: api.params,
            timeout: WHOIS_TIMEOUT_MS,
            headers: {
              Accept: 'application/json',
            },
            validateStatus: () => true, // Don't throw on any status
          });

          if (response.status === 200 && response.data) {
            // Try to parse the response
            let available: boolean;

            if (typeof response.data === 'string') {
              available = parseWhoisResponse(response.data);
            } else {
              available = api.parser(response.data as Record<string, unknown>);
            }

            return createWhoisResult(domain, tld, available);
          }
        } catch (error) {
          logger.debug('WHOIS API failed, trying next', {
            api: api.url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // If all APIs fail, try a simple text-based WHOIS lookup
      try {
        const available = await textBasedWhoisCheck(fullDomain, tld);
        return createWhoisResult(domain, tld, available);
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          throw new TimeoutError('WHOIS lookup', WHOIS_TIMEOUT_MS);
        }

        throw new RegistrarApiError(
          'whois',
          error instanceof Error ? error.message : 'All WHOIS lookups failed',
        );
      }
    }),
  );
}

/**
 * Simple text-based WHOIS check using a web proxy.
 */
async function textBasedWhoisCheck(
  fullDomain: string,
  tld: string,
): Promise<boolean> {
  // Try who.is web service
  try {
    const response = await axios.get(`https://who.is/whois/${fullDomain}`, {
      timeout: WHOIS_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Domain-Search-MCP/1.0',
      },
    });

    const html = response.data as string;

    // Check for "not registered" indicators in the page
    if (
      html.includes('is available for registration') ||
      html.includes('No match for') ||
      html.includes('not found')
    ) {
      return true;
    }

    // Check for registered indicators (both old and new who.is format)
    if (
      html.includes('Registrar:') ||
      html.includes('Creation Date:') ||
      html.includes('Name Server:') ||
      html.includes('is registered') ||
      html.includes('"Registrar"') ||
      html.includes('"registrar"') ||
      html.includes('Registrar Information') ||
      html.includes('Important Dates')
    ) {
      return false;
    }

    // Default to not available
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNABORTED') {
        throw new Error('timeout');
      }
    }

    throw error;
  }
}

/**
 * Create a standardized result from WHOIS.
 */
function createWhoisResult(
  domain: string,
  tld: string,
  available: boolean,
): DomainResult {
  return {
    domain: `${domain}.${tld}`,
    available,
    premium: false, // WHOIS doesn't tell us about premium status
    price_first_year: null, // WHOIS doesn't provide pricing
    price_renewal: null,
    currency: 'USD',
    privacy_included: false,
    transfer_price: null,
    registrar: 'unknown',
    source: 'whois',
    checked_at: new Date().toISOString(),
  };
}

/**
 * Get WHOIS server for a TLD.
 */
export function getWhoisServer(tld: string): string | null {
  return WHOIS_SERVERS[tld] || null;
}

/**
 * Check if WHOIS is available for a TLD.
 */
export function isWhoisAvailable(tld: string): boolean {
  return WHOIS_SERVERS[tld] !== undefined;
}
