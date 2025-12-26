/**
 * Namecheap Registrar Adapter.
 *
 * Namecheap uses an XML-based API.
 * API Docs: https://www.namecheap.com/support/api/intro/
 *
 * Note: Namecheap requires IP whitelisting for API access.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { z } from 'zod';
import { RegistrarAdapter } from './base.js';
import type { DomainResult, TLDInfo } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  AuthenticationError,
  RateLimitError,
  RegistrarApiError,
} from '../utils/errors.js';

const NAMECHEAP_API_BASE = 'https://api.namecheap.com/xml.response';
const NAMECHEAP_SANDBOX_BASE = 'https://api.sandbox.namecheap.com/xml.response';

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas for Parsed XML Validation
// SECURITY: Validate parsed XML data to ensure expected structure
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schema for parsed domain check result.
 */
const NamecheapCheckResultSchema = z.object({
  available: z.boolean(),
  premium: z.boolean(),
  price: z.number().optional(),
  renewalPrice: z.number().optional(),
});

type NamecheapCheckResult = z.infer<typeof NamecheapCheckResultSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// XML Parsing Utilities (Internal - hardcoded tags only)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Allowed XML tags for parsing.
 * SECURITY: Only these hardcoded tags can be parsed to prevent injection.
 */
const ALLOWED_XML_TAGS = new Set([
  'Error',
  'Errors',
  'DomainCheckResult',
] as const);

const ALLOWED_XML_ATTRS = new Set([
  'Count',
  'Available',
  'IsPremiumName',
  'PremiumRegistrationPrice',
  'PremiumRenewalPrice',
] as const);

/**
 * Parse XML response to extract domain info.
 * Simple regex-based parsing since we don't want xml2js dependency.
 *
 * SECURITY: Only parses allowed tags defined in ALLOWED_XML_TAGS.
 */
function parseXmlValue(xml: string, tag: string): string | undefined {
  if (!ALLOWED_XML_TAGS.has(tag as typeof ALLOWED_XML_TAGS extends Set<infer T> ? T : never)) {
    logger.warn('Attempted to parse disallowed XML tag', { tag });
    return undefined;
  }
  // Escape special regex chars in tag name for safety
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Reason: tag parameter is validated against ALLOWED_XML_TAGS whitelist above, not user input
  const regex = new RegExp(`<${escapedTag}>([^<]*)</${escapedTag}>`, 'i'); // nosemgrep: detect-non-literal-regexp
  const match = xml.match(regex);
  return match?.[1];
}

function parseXmlAttribute(xml: string, tag: string, attr: string): string | undefined {
  if (!ALLOWED_XML_TAGS.has(tag as typeof ALLOWED_XML_TAGS extends Set<infer T> ? T : never)) {
    logger.warn('Attempted to parse disallowed XML tag', { tag });
    return undefined;
  }
  if (!ALLOWED_XML_ATTRS.has(attr as typeof ALLOWED_XML_ATTRS extends Set<infer T> ? T : never)) {
    logger.warn('Attempted to parse disallowed XML attribute', { attr });
    return undefined;
  }
  // Escape special regex chars for safety
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Reason: tag/attr parameters are validated against ALLOWED_XML_TAGS/ATTRS whitelists above, not user input
  const regex = new RegExp(`<${escapedTag}[^>]*${escapedAttr}="([^"]*)"`, 'i'); // nosemgrep: detect-non-literal-regexp
  const match = xml.match(regex);
  return match?.[1];
}

function parseXmlBool(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

/**
 * Namecheap adapter implementation.
 */
export class NamecheapAdapter extends RegistrarAdapter {
  readonly name = 'Namecheap';
  readonly id = 'namecheap';

  private readonly client: AxiosInstance;
  private readonly apiKey?: string;
  private readonly apiUser?: string;
  private readonly useSandbox: boolean;

  constructor() {
    // Namecheap has stricter rate limits, ~20/min is safe
    super(20);

    this.apiKey = config.namecheap.apiKey;
    this.apiUser = config.namecheap.apiUser;
    this.useSandbox = false; // Set to true for testing

    const baseURL = this.useSandbox ? NAMECHEAP_SANDBOX_BASE : NAMECHEAP_API_BASE;

    this.client = axios.create({
      baseURL,
      timeout: this.timeoutMs,
    });
  }

  /**
   * Check if Namecheap API is enabled.
   */
  isEnabled(): boolean {
    return config.namecheap.enabled;
  }

  /**
   * Search for domain availability.
   */
  async search(domain: string, tld: string): Promise<DomainResult> {
    if (!this.isEnabled()) {
      throw new AuthenticationError(
        'namecheap',
        'API credentials not configured',
      );
    }

    const fullDomain = `${domain}.${tld}`;
    logger.debug('Namecheap search', { domain: fullDomain });

    try {
      const result = await this.retryWithBackoff(async () => {
        const response = await this.client.get('', {
          params: {
            ApiUser: this.apiUser,
            ApiKey: this.apiKey,
            UserName: this.apiUser,
            ClientIp: this.getClientIp(),
            Command: 'namecheap.domains.check',
            DomainList: fullDomain,
          },
        });

        return this.parseCheckResponse(response.data, fullDomain);
      }, `check ${fullDomain}`);

      return this.createResult(domain, tld, {
        available: result.available,
        premium: result.premium,
        price_first_year: result.price,
        price_renewal: result.renewalPrice,
        privacy_included: false, // Namecheap charges for privacy
        source: 'namecheap_api',
        premium_reason: result.premium ? 'Premium domain' : undefined,
      });
    } catch (error) {
      this.handleApiError(error, fullDomain);
      throw error;
    }
  }

  /**
   * Parse the check response XML.
   * SECURITY: Validates parsed result with Zod schema.
   */
  private parseCheckResponse(
    xml: string,
    domain: string,
  ): NamecheapCheckResult {
    // Check for API errors
    const errorCount = parseXmlAttribute(xml, 'Errors', 'Count');
    if (errorCount && parseInt(errorCount, 10) > 0) {
      const errorMsg = parseXmlValue(xml, 'Error') || 'Unknown API error';

      if (errorMsg.includes('IP not whitelisted')) {
        throw new AuthenticationError('namecheap', 'IP not whitelisted. Add your IP in Namecheap dashboard.');
      }

      throw new RegistrarApiError(this.name, errorMsg);
    }

    // Parse domain result
    const available = parseXmlAttribute(xml, 'DomainCheckResult', 'Available');
    const isPremium = parseXmlAttribute(xml, 'DomainCheckResult', 'IsPremiumName');
    const premiumPrice = parseXmlAttribute(xml, 'DomainCheckResult', 'PremiumRegistrationPrice');
    const premiumRenewal = parseXmlAttribute(xml, 'DomainCheckResult', 'PremiumRenewalPrice');

    const rawResult = {
      available: parseXmlBool(available),
      premium: parseXmlBool(isPremium),
      price: premiumPrice ? parseFloat(premiumPrice) : undefined,
      renewalPrice: premiumRenewal ? parseFloat(premiumRenewal) : undefined,
    };

    // Validate parsed result with Zod
    const parseResult = NamecheapCheckResultSchema.safeParse(rawResult);
    if (!parseResult.success) {
      logger.warn('Namecheap API response validation failed', {
        domain,
        errors: parseResult.error.errors,
      });
      throw new RegistrarApiError(
        this.name,
        'Invalid API response format',
      );
    }

    return parseResult.data;
  }

  /**
   * Get TLD information.
   */
  async getTldInfo(tld: string): Promise<TLDInfo | null> {
    // Namecheap doesn't have a great TLD info endpoint
    // Return basic info based on known data
    return {
      tld,
      description: `${tld.toUpperCase()} domain`,
      typical_use: this.getTldUseCase(tld),
      price_range: {
        min: 8.88,
        max: 15.98,
        currency: 'USD',
      },
      renewal_price_typical: 12.98,
      restrictions: [],
      popularity: this.getTldPopularity(tld),
      category: this.getTldCategory(tld),
    };
  }

  /**
   * Get client IP for API requests.
   * Namecheap requires this for all API calls.
   *
   * SECURITY: We no longer call external services (ipify.org) to get IP.
   * The IP must be configured via NAMECHEAP_CLIENT_IP environment variable.
   * This prevents unintended IP disclosure to third parties.
   */
  private getClientIp(): string {
    const clientIp = config.namecheap.clientIp;

    if (!clientIp) {
      throw new AuthenticationError(
        'namecheap',
        'NAMECHEAP_CLIENT_IP not configured. Add your whitelisted IP to .env file.',
      );
    }

    // Basic IP format validation (IPv4 or IPv6)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (!ipv4Pattern.test(clientIp) && !ipv6Pattern.test(clientIp)) {
      throw new AuthenticationError(
        'namecheap',
        `Invalid NAMECHEAP_CLIENT_IP format: "${clientIp}". Must be a valid IPv4 or IPv6 address.`,
      );
    }

    return clientIp;
  }

  /**
   * Handle API errors with user-friendly messages.
   */
  private handleApiError(error: unknown, domain: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        const status = axiosError.response.status;

        if (status === 401 || status === 403) {
          throw new AuthenticationError('namecheap', 'Invalid API credentials');
        }

        if (status === 429) {
          throw new RateLimitError('namecheap');
        }

        throw new RegistrarApiError(
          this.name,
          `HTTP ${status}: ${axiosError.message}`,
          status,
          error,
        );
      }

      if (axiosError.code === 'ECONNABORTED') {
        throw new RegistrarApiError(
          this.name,
          `Request timed out for ${domain}`,
          undefined,
          error,
        );
      }
    }

    throw new RegistrarApiError(
      this.name,
      error instanceof Error ? error.message : 'Unknown error',
      undefined,
      error instanceof Error ? error : undefined,
    );
  }

  /**
   * Get typical use case for a TLD.
   */
  private getTldUseCase(tld: string): string {
    const useCases: Record<string, string> = {
      com: 'General commercial websites',
      io: 'Tech startups and SaaS products',
      dev: 'Developer tools and portfolios',
      app: 'Mobile and web applications',
      co: 'Companies and startups',
      net: 'Network services and utilities',
      org: 'Non-profit organizations',
    };
    return useCases[tld] || 'General purpose';
  }

  /**
   * Get TLD popularity rating.
   */
  private getTldPopularity(tld: string): 'high' | 'medium' | 'low' {
    const highPopularity = ['com', 'net', 'org', 'io', 'co'];
    const mediumPopularity = ['dev', 'app', 'ai', 'me'];

    if (highPopularity.includes(tld)) return 'high';
    if (mediumPopularity.includes(tld)) return 'medium';
    return 'low';
  }

  /**
   * Get TLD category.
   */
  private getTldCategory(tld: string): TLDInfo['category'] {
    const countryTlds = ['uk', 'de', 'fr', 'jp', 'cn', 'au', 'ca', 'us'];
    const sponsoredTlds = ['edu', 'gov', 'mil'];
    const newTlds = ['io', 'dev', 'app', 'ai', 'xyz', 'tech', 'cloud'];

    if (countryTlds.includes(tld)) return 'country';
    if (sponsoredTlds.includes(tld)) return 'sponsored';
    if (newTlds.includes(tld)) return 'new';
    return 'generic';
  }
}

/**
 * Singleton instance.
 */
export const namecheapAdapter = new NamecheapAdapter();
