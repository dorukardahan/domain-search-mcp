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
import * as net from 'net';
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
  ac: 'whois.nic.ac',
};

/**
 * TLDs where web-based WHOIS APIs are UNRELIABLE.
 * For these TLDs, we use native TCP WHOIS instead.
 *
 * Known issues:
 * - .ai: who.is and whoisjson.com return "not found" for registered domains
 * - .io/.sh/.ac: Same registry, same issue
 */
const NATIVE_WHOIS_REQUIRED_TLDS = new Set(['ai', 'io', 'sh', 'ac']);

const WHOIS_TIMEOUT_MS = parseInt(process.env.WHOIS_TIMEOUT_MS || '2000', 10);
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
 * Patterns to extract expiration date from WHOIS response.
 * Multiple formats used by different registrars.
 */
const EXPIRY_PATTERNS = [
  /Registry Expiry Date:\s*(.+)/i,
  /Registrar Registration Expiration Date:\s*(.+)/i,
  /Expir(?:y|ation|es)[^:]*Date:\s*(.+)/i,
  /paid-till:\s*(.+)/i,
  /Renewal Date:\s*(.+)/i,
  /Expiration Date:\s*(.+)/i,
  /Expires:\s*(.+)/i,
  /Expires On:\s*(.+)/i,
  /Valid Until:\s*(.+)/i,
];

/**
 * Patterns to extract registration/creation date from WHOIS response.
 */
const CREATION_PATTERNS = [
  /Creation Date:\s*(.+)/i,
  /Created Date:\s*(.+)/i,
  /Created On:\s*(.+)/i,
  /Created:\s*(.+)/i,
  /Registration Date:\s*(.+)/i,
  /Registered:\s*(.+)/i,
  /Domain Registration Date:\s*(.+)/i,
];

/**
 * Parse a date string to ISO 8601 format.
 * Handles various formats from different registrars.
 */
function parseWhoisDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;

  // Clean up the string
  const cleaned = dateStr.trim().replace(/\s+/g, ' ');

  // Try parsing with Date constructor (handles ISO 8601 and many common formats)
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // Try parsing DD.MM.YYYY format (common in European registrars)
  const euMatch = cleaned.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    const parsed = new Date(`${year}-${month}-${day}`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Try parsing YYYY.MM.DD format
  const dotMatch = cleaned.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dotMatch) {
    const [, year, month, day] = dotMatch;
    const parsed = new Date(`${year}-${month}-${day}`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return undefined;
}

/**
 * Parse result containing availability and optional dates.
 */
interface WhoisParseResult {
  available: boolean;
  expires_at?: string;
  registered_at?: string;
}

/**
 * Parse WHOIS response to determine availability and extract dates.
 */
function parseWhoisResponse(response: string): WhoisParseResult {
  const text = response.toLowerCase();

  // Check for "available" patterns first
  for (const pattern of AVAILABLE_PATTERNS) {
    if (pattern.test(text)) {
      return { available: true };
    }
  }

  // Check for "registered" patterns
  let isRegistered = false;
  for (const pattern of REGISTERED_PATTERNS) {
    if (pattern.test(text)) {
      isRegistered = true;
      break;
    }
  }

  // If registered, try to extract dates
  let expires_at: string | undefined;
  let registered_at: string | undefined;

  if (isRegistered) {
    // Extract expiry date
    for (const pattern of EXPIRY_PATTERNS) {
      const match = response.match(pattern);
      if (match && match[1]) {
        expires_at = parseWhoisDate(match[1]);
        if (expires_at) break;
      }
    }

    // Extract creation date
    for (const pattern of CREATION_PATTERNS) {
      const match = response.match(pattern);
      if (match && match[1]) {
        registered_at = parseWhoisDate(match[1]);
        if (registered_at) break;
      }
    }
  }

  // If no clear indication, assume not available (safer)
  return {
    available: !isRegistered && false, // Default to not available
    expires_at,
    registered_at,
  };
}

/**
 * Native TCP WHOIS lookup for TLDs with unreliable web APIs.
 *
 * Connects directly to the authoritative WHOIS server (port 43).
 * More reliable than web APIs for TLDs like .ai, .io, .sh, .ac.
 */
async function nativeTcpWhoisLookup(
  domain: string,
  whoisServer: string,
  timeoutMs: number = WHOIS_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    // Set timeout
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      // WHOIS protocol: send domain name followed by CRLF
      socket.write(`${domain}\r\n`);
    });

    socket.on('data', (data: Buffer) => {
      response += data.toString('utf-8');
    });

    socket.on('end', () => {
      resolve(response);
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`WHOIS TCP error: ${err.message}`));
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('WHOIS TCP timeout'));
    });

    // Connect to WHOIS server on port 43
    socket.connect(43, whoisServer);
  });
}

/**
 * Check domain availability using native TCP WHOIS.
 * Used for TLDs with unreliable web APIs (e.g., .ai, .io, .sh, .ac).
 */
async function checkNativeWhois(
  domain: string,
  tld: string,
): Promise<WhoisParseResult> {
  const fullDomain = `${domain}.${tld}`;
  const whoisServer = WHOIS_SERVERS[tld];

  if (!whoisServer) {
    throw new Error(`No WHOIS server configured for .${tld}`);
  }

  logger.debug('Native WHOIS TCP lookup', { domain: fullDomain, server: whoisServer });

  try {
    const response = await nativeTcpWhoisLookup(fullDomain, whoisServer);
    return parseWhoisResponse(response);
  } catch (error) {
    logger.debug('Native WHOIS lookup failed', {
      domain: fullDomain,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check domain availability using WHOIS.
 *
 * For TLDs with unreliable web APIs (e.g., .ai, .io, .sh, .ac),
 * we use native TCP WHOIS. For others, we use web-based lookups.
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
      // For TLDs with unreliable web APIs, use native TCP WHOIS first
      if (NATIVE_WHOIS_REQUIRED_TLDS.has(tld)) {
        try {
          const parseResult = await checkNativeWhois(domain, tld);
          return createWhoisResult(domain, tld, parseResult);
        } catch (error) {
          logger.debug('Native WHOIS failed, falling back to web APIs', {
            domain: fullDomain,
            error: error instanceof Error ? error.message : String(error),
          });
          // Fall through to web-based lookup
        }
      }

      // Use a public WHOIS API service
      // There are several options; we'll try a few
      const apis = [
        {
          url: `https://whoisjson.com/api/v1/whois`,
          params: { domain: fullDomain },
          parser: (data: Record<string, unknown>) => {
            // Check for API errors first (e.g., missing API key)
            // These should not be treated as valid responses
            if (data.statusCode === 403 || data.statusCode === 401 || data.error) {
              throw new Error('WHOIS API requires authentication');
            }
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
            let parseResult: WhoisParseResult;

            if (typeof response.data === 'string') {
              parseResult = parseWhoisResponse(response.data);
            } else {
              const available = api.parser(response.data as Record<string, unknown>);
              parseResult = { available };
            }

            return createWhoisResult(domain, tld, parseResult);
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
        const parseResult = await textBasedWhoisCheck(fullDomain, tld);
        return createWhoisResult(domain, tld, parseResult);
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
): Promise<WhoisParseResult> {
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
      html.includes('not found') ||
      html.includes('No WHOIS data was found') ||
      html.includes('domain doesn\'t exist') ||
      html.includes('No data found')
    ) {
      return { available: true };
    }

    // Check for registered indicators (both old and new who.is format)
    const isRegistered =
      html.includes('Registrar:') ||
      html.includes('Creation Date:') ||
      html.includes('Name Server:') ||
      html.includes('is registered') ||
      html.includes('"Registrar"') ||
      html.includes('"registrar"') ||
      html.includes('Registrar Information') ||
      html.includes('Important Dates');

    if (isRegistered) {
      // Try to extract dates from HTML content
      let expires_at: string | undefined;
      let registered_at: string | undefined;

      // Extract expiry date from who.is HTML
      for (const pattern of EXPIRY_PATTERNS) {
        const match = html.match(pattern);
        if (match && match[1]) {
          expires_at = parseWhoisDate(match[1]);
          if (expires_at) break;
        }
      }

      // Extract creation date from who.is HTML
      for (const pattern of CREATION_PATTERNS) {
        const match = html.match(pattern);
        if (match && match[1]) {
          registered_at = parseWhoisDate(match[1]);
          if (registered_at) break;
        }
      }

      return { available: false, expires_at, registered_at };
    }

    // Default to not available
    return { available: false };
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
  parseResult: WhoisParseResult,
): DomainResult {
  const { available, expires_at, registered_at } = parseResult;

  // Calculate days until expiration if we have an expiry date
  let days_until_expiration: number | undefined;
  if (expires_at) {
    const expiryDate = new Date(expires_at);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    days_until_expiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

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
    expires_at,
    registered_at,
    days_until_expiration,
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
