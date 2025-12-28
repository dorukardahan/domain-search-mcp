/**
 * suggest_domains Tool - Domain Name Suggestions.
 *
 * Generate and check variations of a base domain name.
 * Helps find available alternatives when the primary name is taken.
 */

import { z } from 'zod';
import { searchDomain } from '../services/domain-search.js';
import { validateDomainName } from '../utils/validators.js';
import { wrapError } from '../utils/errors.js';
import type { DomainResult } from '../types.js';

/**
 * Input schema for suggest_domains.
 */
export const suggestDomainsSchema = z.object({
  base_name: z
    .string()
    .min(1)
    .describe("The base domain name to generate variations from (e.g., 'vibecoding')."),
  tld: z
    .string()
    .optional()
    .default('com')
    .describe("TLD to check suggestions against (e.g., 'com'). Defaults to 'com'."),
  variants: z
    .array(z.enum(['hyphen', 'numbers', 'abbreviations', 'synonyms', 'prefixes', 'suffixes']))
    .optional()
    .describe(
      "Types of variations to generate. Defaults to all types.",
    ),
  max_suggestions: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of suggestions to return (1-50). Defaults to 10."),
});

export type SuggestDomainsInput = z.infer<typeof suggestDomainsSchema>;

/**
 * Tool definition for MCP.
 */
export const suggestDomainsTool = {
  name: 'suggest_domains',
  description: `Generate and check availability of domain name variations.

Creates variations like:
- Hyphenated: vibe-coding
- With numbers: vibecoding1, vibecoding2
- Prefixes: getvibecoding, tryvibecoding
- Suffixes: vibecodingapp, vibecodinghq

Returns only available suggestions, ranked by quality.

Example:
- suggest_domains("vibecoding") → finds available variations`,
  inputSchema: {
    type: 'object',
    properties: {
      base_name: {
        type: 'string',
        description: "The base domain name to generate variations from.",
      },
      tld: {
        type: 'string',
        description: "TLD to check (e.g., 'com'). Defaults to 'com'.",
      },
      variants: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['hyphen', 'numbers', 'abbreviations', 'synonyms', 'prefixes', 'suffixes'],
        },
        description: "Types of variations to generate. Defaults to all.",
      },
      max_suggestions: {
        type: 'number',
        description: "Maximum suggestions to return (1-50). Defaults to 10.",
      },
    },
    required: ['base_name'],
  },
};

/**
 * Generate domain name variations.
 */
function generateVariations(
  baseName: string,
  variantTypes: string[],
): string[] {
  const variations = new Set<string>();

  // Always include the original
  variations.add(baseName);

  if (variantTypes.includes('hyphen') || variantTypes.length === 0) {
    // Add hyphens at word boundaries (heuristic: before capital letters or common words)
    const hyphenated = baseName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    if (hyphenated !== baseName) {
      variations.add(hyphenated);
    }

    // Try hyphen in the middle
    if (baseName.length >= 6) {
      const mid = Math.floor(baseName.length / 2);
      variations.add(baseName.slice(0, mid) + '-' + baseName.slice(mid));
    }
  }

  if (variantTypes.includes('numbers') || variantTypes.length === 0) {
    // Add numbers
    for (let i = 1; i <= 3; i++) {
      variations.add(`${baseName}${i}`);
    }
    variations.add(`${baseName}io`);
    variations.add(`${baseName}app`);
  }

  if (variantTypes.includes('prefixes') || variantTypes.length === 0) {
    const prefixes = ['get', 'try', 'use', 'my', 'the', 'go', 'hey', 'hi'];
    for (const prefix of prefixes) {
      variations.add(`${prefix}${baseName}`);
    }
  }

  if (variantTypes.includes('suffixes') || variantTypes.length === 0) {
    const suffixes = ['app', 'hq', 'io', 'labs', 'dev', 'ai', 'hub', 'now'];
    for (const suffix of suffixes) {
      variations.add(`${baseName}${suffix}`);
    }
  }

  if (variantTypes.includes('abbreviations') || variantTypes.length === 0) {
    // Remove vowels (except first letter)
    const abbreviated = baseName[0] + baseName.slice(1).replace(/[aeiou]/gi, '');
    if (abbreviated.length >= 3 && abbreviated !== baseName) {
      variations.add(abbreviated);
    }
  }

  return Array.from(variations);
}

/**
 * Score a domain suggestion.
 * Higher score = better suggestion.
 */
function scoreSuggestion(
  original: string,
  suggestion: string,
  result: DomainResult,
): number {
  let score = 50; // Base score

  // Prefer shorter names
  score -= suggestion.length;

  // Prefer exact match
  if (suggestion === original) score += 20;

  // Prefer no hyphens
  if (!suggestion.includes('-')) score += 5;

  // Prefer no numbers
  if (!/\d/.test(suggestion)) score += 5;

  // Prefer cheaper prices
  if (result.price_first_year !== null) {
    if (result.price_first_year <= 10) score += 10;
    else if (result.price_first_year <= 15) score += 5;
  }

  // Penalize premiums
  if (result.premium) score -= 20;

  // Bonus for privacy included
  if (result.privacy_included) score += 5;

  return score;
}

/**
 * Response format for suggestions.
 */
interface SuggestDomainsResponse {
  base_name: string;
  tld: string;
  total_checked: number;
  available_count: number;
  suggestions: Array<{
    domain: string;
    price_first_year: number | null;
    registrar: string;
    score: number;
  }>;
  insights: string[];
}

/**
 * Execute the suggest_domains tool.
 */
export async function executeSuggestDomains(
  input: SuggestDomainsInput,
): Promise<SuggestDomainsResponse> {
  try {
    const { base_name, tld, variants, max_suggestions } =
      suggestDomainsSchema.parse(input);

    const normalizedBase = validateDomainName(base_name);
    const variantTypes = variants || [];

    // Generate variations
    const variations = generateVariations(normalizedBase, variantTypes);

    // Limit to max + some buffer for unavailable ones
    const toCheck = variations.slice(0, max_suggestions * 2);

    // Check availability for all variations
    const results: Array<{ name: string; result: DomainResult | null }> = [];

    for (const name of toCheck) {
      try {
        const response = await searchDomain(name, [tld], undefined, {
          pricing: { enabled: false, maxQuotes: 0 },
          includeGodaddySignals: false,
        });
        const result = response.results.find((r) => r.domain === `${name}.${tld}`);
        results.push({ name, result: result || null });
      } catch {
        results.push({ name, result: null });
      }
    }

    // Filter to available and score them
    const available = results
      .filter((r) => r.result?.available)
      .map((r) => ({
        name: r.name,
        result: r.result!,
        score: scoreSuggestion(normalizedBase, r.name, r.result!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, max_suggestions);

    const insights: string[] = [];

    if (available.length > 0) {
      insights.push(
        `✅ Found ${available.length} available variation${available.length > 1 ? 's' : ''}`,
      );

      const best = available[0]!;
      insights.push(
        `⭐ Top suggestion: ${best.name}.${tld} ($${best.result.price_first_year ?? 'unknown'}/year)`,
      );
    } else {
      insights.push(
        `❌ No available variations found for ${normalizedBase}.${tld}`,
      );
      insights.push(
        '💡 Try a different TLD or modify the base name more significantly',
      );
    }

    return {
      base_name: normalizedBase,
      tld,
      total_checked: toCheck.length,
      available_count: available.length,
      suggestions: available.map((a) => ({
        domain: `${a.name}.${tld}`,
        price_first_year: a.result.price_first_year,
        registrar: a.result.registrar,
        score: a.score,
      })),
      insights,
    };
  } catch (error) {
    throw wrapError(error);
  }
}
