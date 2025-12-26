/**
 * Porkbun Registrar Adapter.
 *
 * Porkbun offers competitive pricing and a JSON API.
 * API Docs: https://porkbun.com/api/json/v3/documentation
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

const PORKBUN_API_BASE = 'https://api.porkbun.com/api/json/v3';

/**
 * Porkbun API response types.
 */
interface PorkbunBaseResponse {
  status: 'SUCCESS' | 'ERROR';
  message?: string;
}

interface PorkbunPricingResponse extends PorkbunBaseResponse {
  pricing?: Record<
    string,
    {
      registration: string;
      renewal: string;
      transfer: string;
      coupons?: {
        registration?: {
          code: string;
          max_per_user: number;
          first_year_only: string;
          type: string;
          amount: number;
        };
      };
    }
  >;
}

interface PorkbunCheckResponse extends PorkbunBaseResponse {
  avail?: number; // 1 = available, 0 = taken
  premium?: number; // 1 = premium
  yourPrice?: string;
  retailPrice?: string;
}

/**
 * Porkbun adapter implementation.
 */
export class PorkbunAdapter extends RegistrarAdapter {
  readonly name = 'Porkbun';
  readonly id = 'porkbun';

  private readonly client: AxiosInstance;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private pricingCache: Record<string, { registration: number; renewal: number; transfer: number }> = {};

  constructor() {
    // Porkbun has generous rate limits, ~60/min is safe
    super(60);

    this.apiKey = config.porkbun.apiKey;
    this.apiSecret = config.porkbun.apiSecret;

    this.client = axios.create({
      baseURL: PORKBUN_API_BASE,
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if Porkbun API is enabled.
   */
  isEnabled(): boolean {
    return config.porkbun.enabled;
  }

  /**
   * Search for domain availability.
   */
  async search(domain: string, tld: string): Promise<DomainResult> {
    if (!this.isEnabled()) {
      throw new AuthenticationError(
        'porkbun',
        'API credentials not configured',
      );
    }

    const fullDomain = `${domain}.${tld}`;
    logger.debug('Porkbun search', { domain: fullDomain });

    try {
      // First, try to get pricing (this is cached)
      const pricing = await this.getPricing(tld);

      // Then check availability
      const availability = await this.checkAvailability(domain, tld);

      return this.createResult(domain, tld, {
        available: availability.available,
        premium: availability.premium,
        price_first_year: availability.price ?? pricing?.registration ?? null,
        price_renewal: pricing?.renewal ?? null,
        transfer_price: pricing?.transfer ?? null,
        privacy_included: true, // Porkbun includes WHOIS privacy
        source: 'porkbun_api',
        premium_reason: availability.premium ? 'Premium domain' : undefined,
      });
    } catch (error) {
      this.handleApiError(error, fullDomain);
      throw error; // Re-throw if not handled
    }
  }

  /**
   * Check domain availability.
   */
  private async checkAvailability(
    domain: string,
    tld: string,
  ): Promise<{ available: boolean; premium: boolean; price?: number }> {
    const result = await this.retryWithBackoff(async () => {
      const response = await this.client.post<PorkbunCheckResponse>(
        '/domain/check',
        {
          apikey: this.apiKey,
          secretapikey: this.apiSecret,
          domain: `${domain}.${tld}`,
        },
      );

      if (response.data.status !== 'SUCCESS') {
        throw new RegistrarApiError(
          this.name,
          response.data.message || 'Unknown error',
        );
      }

      return response.data;
    }, `check ${domain}.${tld}`);

    return {
      available: result.avail === 1,
      premium: result.premium === 1,
      price: result.yourPrice ? parseFloat(result.yourPrice) : undefined,
    };
  }

  /**
   * Get pricing for a TLD.
   */
  private async getPricing(
    tld: string,
  ): Promise<{ registration: number; renewal: number; transfer: number } | null> {
    // Check cache first
    if (this.pricingCache[tld]) {
      return this.pricingCache[tld];
    }

    try {
      const result = await this.retryWithBackoff(async () => {
        const response = await this.client.post<PorkbunPricingResponse>(
          '/pricing/get',
          {
            apikey: this.apiKey,
            secretapikey: this.apiSecret,
          },
        );

        if (response.data.status !== 'SUCCESS') {
          throw new RegistrarApiError(
            this.name,
            response.data.message || 'Failed to get pricing',
          );
        }

        return response.data.pricing;
      }, 'get pricing');

      if (result) {
        // Cache all TLD pricing
        for (const [tldKey, prices] of Object.entries(result)) {
          this.pricingCache[tldKey] = {
            registration: parseFloat(prices.registration),
            renewal: parseFloat(prices.renewal),
            transfer: parseFloat(prices.transfer),
          };
        }
      }

      return this.pricingCache[tld] || null;
    } catch (error) {
      logger.warn('Failed to get Porkbun pricing', {
        tld,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get TLD information.
   */
  async getTldInfo(tld: string): Promise<TLDInfo | null> {
    const pricing = await this.getPricing(tld);
    if (!pricing) return null;

    return {
      tld,
      description: `${tld.toUpperCase()} domain`,
      typical_use: this.getTldUseCase(tld),
      price_range: {
        min: pricing.registration,
        max: pricing.registration,
        currency: 'USD',
      },
      renewal_price_typical: pricing.renewal,
      restrictions: [],
      popularity: this.getTldPopularity(tld),
      category: this.getTldCategory(tld),
    };
  }

  /**
   * Handle API errors with user-friendly messages.
   */
  private handleApiError(error: unknown, domain: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<PorkbunBaseResponse>;

      if (axiosError.response) {
        const status = axiosError.response.status;
        const message =
          axiosError.response.data?.message || axiosError.message;

        if (status === 401 || status === 403) {
          throw new AuthenticationError('porkbun', message);
        }

        if (status === 429) {
          const retryAfter = axiosError.response.headers['retry-after'];
          throw new RateLimitError(
            'porkbun',
            retryAfter ? parseInt(retryAfter, 10) : undefined,
          );
        }

        throw new RegistrarApiError(this.name, message, status, error);
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
      ai: 'AI and machine learning projects',
      xyz: 'Creative and unconventional projects',
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
export const porkbunAdapter = new PorkbunAdapter();
