/**
 * Porkbun Registrar Adapter.
 *
 * Porkbun offers competitive pricing and a JSON API.
 * API Docs: https://porkbun.com/api/json/v3/documentation
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

const PORKBUN_API_BASE = 'https://api.porkbun.com/api/json/v3';

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas for API Response Validation
// SECURITY: Validate all external API responses to prevent unexpected data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base response schema - all Porkbun responses have this structure.
 */
const PorkbunBaseResponseSchema = z.object({
  status: z.enum(['SUCCESS', 'ERROR']),
  message: z.string().optional(),
});

/**
 * Domain availability check response schema.
 */
const PorkbunCheckResponseSchema = PorkbunBaseResponseSchema.extend({
  avail: z.number().optional(),  // 1 = available, 0 = taken
  premium: z.number().optional(), // 1 = premium
  yourPrice: z.string().optional(),
  retailPrice: z.string().optional(),
});

/**
 * Pricing response schema for a single TLD.
 */
const PorkbunTldPricingSchema = z.object({
  registration: z.string(),
  renewal: z.string(),
  transfer: z.string(),
  coupons: z.object({
    registration: z.object({
      code: z.string(),
      max_per_user: z.number(),
      first_year_only: z.string(),
      type: z.string(),
      amount: z.number(),
    }).optional(),
  }).optional(),
});

/**
 * Full pricing response schema.
 */
const PorkbunPricingResponseSchema = PorkbunBaseResponseSchema.extend({
  pricing: z.record(z.string(), PorkbunTldPricingSchema).optional(),
});

// Type inference from schemas
type PorkbunBaseResponse = z.infer<typeof PorkbunBaseResponseSchema>;
type PorkbunCheckResponse = z.infer<typeof PorkbunCheckResponseSchema>;
type PorkbunPricingResponse = z.infer<typeof PorkbunPricingResponseSchema>;

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
   * SECURITY: Validates API response with Zod schema.
   */
  private async checkAvailability(
    domain: string,
    tld: string,
  ): Promise<{ available: boolean; premium: boolean; price?: number }> {
    const result = await this.retryWithBackoff(async () => {
      const response = await this.client.post(
        '/domain/check',
        {
          apikey: this.apiKey,
          secretapikey: this.apiSecret,
          domain: `${domain}.${tld}`,
        },
      );

      // Validate response with Zod schema
      const parseResult = PorkbunCheckResponseSchema.safeParse(response.data);
      if (!parseResult.success) {
        logger.warn('Porkbun API response validation failed', {
          domain: `${domain}.${tld}`,
          errors: parseResult.error.errors,
        });
        throw new RegistrarApiError(
          this.name,
          'Invalid API response format',
        );
      }

      const validated = parseResult.data;

      if (validated.status !== 'SUCCESS') {
        throw new RegistrarApiError(
          this.name,
          validated.message || 'Unknown error',
        );
      }

      return validated;
    }, `check ${domain}.${tld}`);

    return {
      available: result.avail === 1,
      premium: result.premium === 1,
      price: result.yourPrice ? parseFloat(result.yourPrice) : undefined,
    };
  }

  /**
   * Get pricing for a TLD.
   * SECURITY: Validates API response with Zod schema.
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
        const response = await this.client.post(
          '/pricing/get',
          {
            apikey: this.apiKey,
            secretapikey: this.apiSecret,
          },
        );

        // Validate response with Zod schema
        const parseResult = PorkbunPricingResponseSchema.safeParse(response.data);
        if (!parseResult.success) {
          logger.warn('Porkbun pricing API response validation failed', {
            errors: parseResult.error.errors,
          });
          throw new RegistrarApiError(
            this.name,
            'Invalid pricing API response format',
          );
        }

        const validated = parseResult.data;

        if (validated.status !== 'SUCCESS') {
          throw new RegistrarApiError(
            this.name,
            validated.message || 'Failed to get pricing',
          );
        }

        return validated.pricing;
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
