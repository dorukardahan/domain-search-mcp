/**
 * compare_registrars Tool - Price Comparison.
 *
 * Compare pricing across multiple registrars for a specific domain.
 * Helps find the best deal.
 */

import { z } from 'zod';
import { compareRegistrars } from '../services/domain-search.js';
import { validateDomainName, validateTld } from '../utils/validators.js';
import { wrapError } from '../utils/errors.js';
import type { DomainResult } from '../types.js';

/**
 * Input schema for compare_registrars.
 */
export const compareRegistrarsSchema = z.object({
  domain: z
    .string()
    .min(1)
    .describe("The domain name to compare (e.g., 'vibecoding')."),
  tld: z
    .string()
    .describe("The TLD extension (e.g., 'com', 'io')."),
  registrars: z
    .array(z.string())
    .optional()
    .describe(
      "Registrars to compare (e.g., ['porkbun', 'namecheap']). Defaults to all available.",
    ),
});

export type CompareRegistrarsInput = z.infer<typeof compareRegistrarsSchema>;

/**
 * Tool definition for MCP.
 */
export const compareRegistrarsTool = {
  name: 'compare_registrars',
  description: `Compare domain pricing across multiple registrars.

Checks the same domain at different registrars to find:
- Best first year price
- Best renewal price
- Overall recommendation

Returns pricing comparison and a recommendation.

Example:
- compare_registrars("vibecoding", "com") → compares Porkbun vs Namecheap`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: "The domain name to compare (without extension).",
      },
      tld: {
        type: 'string',
        description: "The TLD extension (e.g., 'com', 'io').",
      },
      registrars: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Registrars to compare. Defaults to ['porkbun', 'namecheap'].",
      },
    },
    required: ['domain', 'tld'],
  },
};

/**
 * Response format for registrar comparison.
 */
interface CompareRegistrarsResponse {
  domain: string;
  what_happened: string;
  comparison_count: number;
  comparisons: DomainResult[];
  best_first_year: {
    registrar: string;
    price: number;
    currency: string;
  } | null;
  best_renewal: {
    registrar: string;
    price: number;
    currency: string;
  } | null;
  recommendation: string;
  insights: string[];
}

/**
 * Execute the compare_registrars tool.
 */
export async function executeCompareRegistrars(
  input: CompareRegistrarsInput,
): Promise<CompareRegistrarsResponse> {
  try {
    const { domain, tld, registrars } = compareRegistrarsSchema.parse(input);

    const normalizedDomain = validateDomainName(domain);
    const normalizedTld = validateTld(tld);
    const fullDomain = `${normalizedDomain}.${normalizedTld}`;

    const result = await compareRegistrars(
      normalizedDomain,
      normalizedTld,
      registrars,
    );

    const insights: string[] = [];

    // Generate insights
    if (result.best_first_year && result.best_renewal) {
      if (result.best_first_year.registrar === result.best_renewal.registrar) {
        insights.push(
          `✅ ${result.best_first_year.registrar} wins on both first year and renewal`,
        );
      } else {
        insights.push(
          `💡 Split strategy: ${result.best_first_year.registrar} for year 1, consider transfer to ${result.best_renewal.registrar} later`,
        );
      }
    }

    // Check for privacy inclusion
    const withPrivacy = result.comparisons.filter((r) => r.privacy_included);
    if (withPrivacy.length > 0) {
      insights.push(
        `🔒 ${withPrivacy.map((r) => r.registrar).join(', ')} include free WHOIS privacy`,
      );
    }

    // Premium warning
    const premiums = result.comparisons.filter((r) => r.premium);
    if (premiums.length > 0) {
      insights.push(
        `⚠️ This is a premium domain at: ${premiums.map((r) => r.registrar).join(', ')}`,
      );
    }

    return {
      domain: fullDomain,
      what_happened: `Compared pricing across ${result.comparisons.length} registrars`,
      comparison_count: result.comparisons.length,
      comparisons: result.comparisons,
      best_first_year: result.best_first_year
        ? { ...result.best_first_year, currency: 'USD' }
        : null,
      best_renewal: result.best_renewal
        ? { ...result.best_renewal, currency: 'USD' }
        : null,
      recommendation: result.recommendation,
      insights,
    };
  } catch (error) {
    throw wrapError(error);
  }
}
