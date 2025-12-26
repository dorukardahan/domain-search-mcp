/**
 * RDAP (Registration Data Access Protocol) Fallback.
 *
 * RFC 7480 - Modern replacement for WHOIS.
 * Provides availability status only (no pricing).
 * Public API - no authentication required.
 */

import axios, { type AxiosError } from 'axios';
import { z } from 'zod';
import type { DomainResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { TimeoutError, RegistrarApiError } from '../utils/errors.js';

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas for RDAP Response Validation (RFC 7483)
// SECURITY: Validate RDAP responses to prevent unexpected data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * vCard array element schema.
 * vCard format: ["property", {}, "type", value]
 */
const VCardPropertySchema = z.tuple([
  z.string(),           // property name (e.g., "fn")
  z.record(z.unknown()), // parameters (usually empty {})
  z.string(),           // type (e.g., "text")
  z.union([z.string(), z.array(z.string())]), // value
]).or(z.array(z.unknown())); // Allow flexible arrays for compatibility

/**
 * Entity schema (registrar, registrant, etc.)
 */
const RdapEntitySchema = z.object({
  roles: z.array(z.string()).optional(),
  vcardArray: z.tuple([
    z.literal('vcard'),
    z.array(VCardPropertySchema),
  ]).optional(),
}).passthrough(); // Allow additional RDAP fields

/**
 * RDAP event schema (registration, expiration, etc.)
 */
const RdapEventSchema = z.object({
  eventAction: z.string(),
  eventDate: z.string(),
}).passthrough();

/**
 * Main RDAP domain response schema.
 */
const RdapDomainResponseSchema = z.object({
  objectClassName: z.string(),
  ldhName: z.string().optional(),
  entities: z.array(RdapEntitySchema).optional(),
  events: z.array(RdapEventSchema).optional(),
}).passthrough(); // Allow additional RDAP fields

/**
 * RDAP bootstrap URLs for different TLDs.
 */
const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

/**
 * Fallback RDAP servers for common TLDs.
 * Expanded to include popular gTLDs and ccTLDs.
 */
const RDAP_SERVERS: Record<string, string> = {
  // Generic TLDs (Verisign)
  com: 'https://rdap.verisign.com/com/v1',
  net: 'https://rdap.verisign.com/net/v1',
  cc: 'https://rdap.verisign.com/cc/v1',
  tv: 'https://rdap.verisign.com/tv/v1',
  name: 'https://rdap.verisign.com/name/v1',

  // Generic TLDs (Other registries)
  org: 'https://rdap.publicinterestregistry.org/rdap/org',
  info: 'https://rdap.afilias.net/rdap/info',
  biz: 'https://rdap.nic.biz',
  xyz: 'https://rdap.nic.xyz',
  club: 'https://rdap.nic.club',
  online: 'https://rdap.nic.online',
  site: 'https://rdap.nic.site',
  tech: 'https://rdap.nic.tech',
  store: 'https://rdap.nic.store',

  // Google TLDs
  dev: 'https://rdap.nic.google/domain',
  app: 'https://rdap.nic.google/domain',
  page: 'https://rdap.nic.google/domain',
  how: 'https://rdap.nic.google/domain',
  new: 'https://rdap.nic.google/domain',

  // Country-code TLDs (ccTLDs)
  io: 'https://rdap.nic.io/domain',
  co: 'https://rdap.nic.co/domain',
  ai: 'https://rdap.nic.ai/domain',
  me: 'https://rdap.nic.me/domain',
  sh: 'https://rdap.nic.sh/domain',
  ac: 'https://rdap.nic.ac/domain',
  gg: 'https://rdap.nic.gg/domain',
  im: 'https://rdap.nic.im/domain',

  // European ccTLDs
  eu: 'https://rdap.eurid.eu/domain',
  de: 'https://rdap.denic.de/domain',
  nl: 'https://rdap.sidn.nl',
  uk: 'https://rdap.nominet.uk/uk',
  ch: 'https://rdap.nic.ch',
  se: 'https://rdap.iis.se/domain',
  fi: 'https://rdap.traficom.fi/domain',
  cz: 'https://rdap.nic.cz',
  pl: 'https://rdap.dns.pl',

  // Other popular ccTLDs
  ca: 'https://rdap.ca.fury.ca/rdap',
  au: 'https://rdap.auda.org.au',
  nz: 'https://rdap.dnc.org.nz',
  jp: 'https://rdap.jprs.jp/rdap',
  kr: 'https://rdap.kisa.or.kr',
  in: 'https://rdap.registry.in',
  br: 'https://rdap.registro.br',

  // Specialty TLDs
  crypto: 'https://rdap.nic.crypto',
  cloud: 'https://rdap.nic.cloud',
  design: 'https://rdap.nic.design',
  agency: 'https://rdap.nic.agency',
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
 * Safely extract registrar name from vCard array.
 * SECURITY: Validates array bounds and types before access.
 */
function extractRegistrarFromVCard(vcardArray: unknown): string | undefined {
  try {
    // vcardArray should be ["vcard", [...properties]]
    if (!Array.isArray(vcardArray) || vcardArray.length < 2) {
      return undefined;
    }

    const properties = vcardArray[1];
    if (!Array.isArray(properties)) {
      return undefined;
    }

    // Find the "fn" (formatted name) property
    for (const prop of properties) {
      if (!Array.isArray(prop) || prop.length < 4) {
        continue;
      }

      const [propName, , , propValue] = prop;

      if (propName === 'fn' && typeof propValue === 'string') {
        return propValue;
      }
    }

    return undefined;
  } catch (error) {
    logger.debug('Failed to extract registrar from vCard', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Parsed RDAP data including availability and registration info.
 */
interface RdapParsedData {
  available: boolean;
  registrar?: string;
  registeredAt?: string;
  expiresAt?: string;
}

/**
 * Parse RDAP response to determine availability and extract dates.
 * SECURITY: Validates response with Zod schema before processing.
 */
function parseRdapResponse(data: unknown): RdapParsedData {
  if (!data || typeof data !== 'object') {
    return { available: false };
  }

  // Validate with Zod schema
  const parseResult = RdapDomainResponseSchema.safeParse(data);
  if (!parseResult.success) {
    logger.debug('RDAP response validation failed', {
      errors: parseResult.error.errors.slice(0, 3), // Limit logged errors
    });
    // Still try to extract basic info even if validation fails
    const record = data as Record<string, unknown>;
    if (record.objectClassName === 'domain') {
      return { available: false };
    }
    return { available: false };
  }

  const validated = parseResult.data;

  // If we got a domain record, it's registered (not available)
  if (validated.objectClassName === 'domain') {
    let registrar: string | undefined;
    let registeredAt: string | undefined;
    let expiresAt: string | undefined;

    // Safely extract registrar info
    if (validated.entities) {
      for (const entity of validated.entities) {
        if (entity.roles?.includes('registrar') && entity.vcardArray) {
          registrar = extractRegistrarFromVCard(entity.vcardArray);
          if (registrar) break;
        }
      }
    }

    // Extract event dates (registration, expiration, last changed)
    if (validated.events) {
      for (const event of validated.events) {
        const action = event.eventAction.toLowerCase();
        if (action === 'registration' || action === 'created') {
          registeredAt = event.eventDate;
        } else if (action === 'expiration') {
          expiresAt = event.eventDate;
        }
      }
    }

    return { available: false, registrar, registeredAt, expiresAt };
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
      return createRdapResult(domain, tld, parsed.available, {
        registeredAt: parsed.registeredAt,
        expiresAt: parsed.expiresAt,
      });
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
 * Calculate days until expiration from an ISO date string.
 */
function calculateDaysUntilExpiration(expiresAt: string): number | undefined {
  try {
    const expirationDate = new Date(expiresAt);
    const now = new Date();
    const diffMs = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return undefined;
  }
}

/**
 * Create a standardized result from RDAP.
 */
function createRdapResult(
  domain: string,
  tld: string,
  available: boolean,
  dates?: { registeredAt?: string; expiresAt?: string },
): DomainResult {
  const result: DomainResult = {
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

  // Add registration and expiration dates if available
  if (dates?.registeredAt) {
    result.registered_at = dates.registeredAt;
  }

  if (dates?.expiresAt) {
    result.expires_at = dates.expiresAt;
    result.days_until_expiration = calculateDaysUntilExpiration(dates.expiresAt);
  }

  return result;
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
