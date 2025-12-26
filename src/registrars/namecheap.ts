/**
 * Namecheap Registrar Adapter.
 *
 * Namecheap uses an XML-based API.
 * API Docs: https://www.namecheap.com/support/api/intro/
 *
 * Note: Namecheap requires IP whitelisting for API access.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
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

/**
 * Parse XML response to extract domain info.
 * Simple regex-based parsing since we don't want xml2js dependency.
 */
function parseXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[1];
}

function parseXmlAttribute(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
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
            ClientIp: await this.getClientIp(),
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
   */
  private parseCheckResponse(
    xml: string,
    domain: string,
  ): {
    available: boolean;
    premium: boolean;
    price?: number;
    renewalPrice?: number;
  } {
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

    return {
      available: parseXmlBool(available),
      premium: parseXmlBool(isPremium),
      price: premiumPrice ? parseFloat(premiumPrice) : undefined,
      renewalPrice: premiumRenewal ? parseFloat(premiumRenewal) : undefined,
    };
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
   */
  private async getClientIp(): Promise<string> {
    try {
      const response = await axios.get('https://api.ipify.org?format=json', {
        timeout: 5000,
      });
      return response.data.ip;
    } catch {
      // Fallback to localhost for local development
      return '127.0.0.1';
    }
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
