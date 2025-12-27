/**
 * suggest_domains_smart Tool - AI-like Domain Name Suggestions.
 *
 * Advanced domain suggestion engine using semantic analysis,
 * synonym expansion, industry detection, and creative algorithms.
 * No external AI dependencies - fully native implementation.
 */

import { z } from 'zod';
import { searchDomain } from '../services/domain-search.js';
import { validateDomainName } from '../utils/validators.js';
import { wrapError } from '../utils/errors.js';
import {
  generateSmartSuggestions,
  segmentWords,
  detectIndustry,
  scoreDomainName,
  getSynonyms,
  getIndustryTerms,
} from '../utils/semantic-engine.js';
import type { DomainResult } from '../types.js';

/**
 * Premium price thresholds by TLD (first year price in USD).
 * If price exceeds threshold, domain is marked as premium.
 */
const PREMIUM_THRESHOLDS: Record<string, number> = {
  com: 15,
  net: 15,
  org: 15,
  io: 50,
  co: 35,
  ai: 80,
  dev: 20,
  app: 20,
  xyz: 15,
  tech: 50,
  default: 30,
};

/**
 * Detect if a domain is premium based on price.
 */
function isPremiumPrice(tld: string, price: number | null): boolean {
  if (price === null) return false;
  const threshold = PREMIUM_THRESHOLDS[tld] || PREMIUM_THRESHOLDS.default!;
  return price > threshold;
}

/**
 * Input schema for suggest_domains_smart.
 */
export const suggestDomainsSmartSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Search query - can be keywords, business description, or domain name. " +
      "Examples: 'coffee shop seattle', 'ai startup', 'vibecoding'"
    ),
  tld: z
    .string()
    .optional()
    .default('com')
    .describe("Primary TLD to check. Defaults to 'com'."),
  industry: z
    .enum(['tech', 'startup', 'finance', 'health', 'food', 'creative', 'ecommerce', 'education', 'gaming', 'social'])
    .optional()
    .describe("Industry context for better suggestions. Auto-detected if not provided."),
  style: z
    .enum(['brandable', 'descriptive', 'short', 'creative'])
    .optional()
    .default('brandable')
    .describe(
      "Suggestion style: 'brandable' (unique names), 'descriptive' (keyword-based), " +
      "'short' (minimal length), 'creative' (playful combinations)."
    ),
  max_suggestions: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(15)
    .describe("Maximum suggestions to return (1-50). Defaults to 15."),
  include_premium: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include premium-priced domains in results. Defaults to false."),
});

export type SuggestDomainsSmartInput = z.infer<typeof suggestDomainsSmartSchema>;

/**
 * Tool definition for MCP.
 */
export const suggestDomainsSmartTool = {
  name: 'suggest_domains_smart',
  description: `AI-powered domain name suggestion engine.

Generate creative, brandable domain names from keywords or business descriptions.
Uses semantic analysis, synonym expansion, and industry-specific vocabulary.

Features:
- Understands natural language queries ("coffee shop in seattle")
- Auto-detects industry for contextual suggestions
- Generates portmanteau/blended names (instagram = instant + telegram)
- Applies modern naming patterns (ly, ify, io, hub, etc.)
- Filters premium domains by default

Examples:
- suggest_domains_smart("ai customer service") → AI-themed suggestions
- suggest_domains_smart("organic coffee", industry="food") → Food-focused names
- suggest_domains_smart("vibecoding", style="short") → Minimal length names`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "Keywords, business description, or base domain name.",
      },
      tld: {
        type: 'string',
        description: "TLD to check (e.g., 'com'). Defaults to 'com'.",
      },
      industry: {
        type: 'string',
        enum: ['tech', 'startup', 'finance', 'health', 'food', 'creative', 'ecommerce', 'education', 'gaming', 'social'],
        description: "Industry for contextual suggestions. Auto-detected if omitted.",
      },
      style: {
        type: 'string',
        enum: ['brandable', 'descriptive', 'short', 'creative'],
        description: "Suggestion style preference.",
      },
      max_suggestions: {
        type: 'number',
        description: "Maximum suggestions to return (1-50). Defaults to 15.",
      },
      include_premium: {
        type: 'boolean',
        description: "Include premium domains. Defaults to false.",
      },
    },
    required: ['query'],
  },
};

/**
 * Apply style-specific filtering and scoring adjustments.
 */
function applyStyleFilter(
  suggestions: string[],
  style: string,
  originalQuery: string,
): string[] {
  switch (style) {
    case 'short':
      return suggestions
        .filter(s => s.length <= 8)
        .sort((a, b) => a.length - b.length);

    case 'descriptive':
      // Prefer suggestions that contain original words
      const words = segmentWords(originalQuery);
      return suggestions.sort((a, b) => {
        const aMatches = words.filter(w => a.includes(w)).length;
        const bMatches = words.filter(w => b.includes(w)).length;
        return bMatches - aMatches;
      });

    case 'creative':
      // Prefer longer, more unique combinations
      return suggestions
        .filter(s => s.length >= 6)
        .sort((a, b) => {
          const aScore = a.length + (a.match(/[aeiouy]/g)?.length || 0) * 2;
          const bScore = b.length + (b.match(/[aeiouy]/g)?.length || 0) * 2;
          return bScore - aScore;
        });

    case 'brandable':
    default:
      // Balanced approach - pronounceable, medium length
      return suggestions.sort((a, b) => {
        const aScore = scoreDomainName(a, originalQuery);
        const bScore = scoreDomainName(b, originalQuery);
        return bScore - aScore;
      });
  }
}

/**
 * Suggestion result with extended metadata.
 */
interface SmartSuggestion {
  domain: string;
  available: boolean;
  price_first_year: number | null;
  price_renewal: number | null;
  registrar: string;
  premium: boolean;
  premium_detected: boolean; // Our detection based on price
  privacy_included: boolean;
  score: number;
  category: 'standard' | 'premium' | 'auction' | 'unavailable';
}

/**
 * Response format for smart suggestions.
 */
interface SuggestDomainsSmartResponse {
  query: string;
  detected_words: string[];
  detected_industry: string | null;
  tld: string;
  style: string;
  total_generated: number;
  total_checked: number;
  results: {
    available: SmartSuggestion[];
    premium: SmartSuggestion[];
    unavailable_count: number;
  };
  insights: string[];
  related_terms: string[];
}

/**
 * Execute the suggest_domains_smart tool.
 */
export async function executeSuggestDomainsSmart(
  input: SuggestDomainsSmartInput,
): Promise<SuggestDomainsSmartResponse> {
  try {
    const { query, tld, industry, style, max_suggestions, include_premium } =
      suggestDomainsSmartSchema.parse(input);

    // Normalize and analyze input
    const normalizedQuery = query.toLowerCase().trim();
    const detectedWords = segmentWords(normalizedQuery);
    const detectedIndustry = industry || detectIndustry(detectedWords);

    // Generate smart suggestions
    const rawSuggestions = generateSmartSuggestions(normalizedQuery, {
      maxSuggestions: max_suggestions * 4, // Generate extra for filtering
      includePortmanteau: style === 'creative' || style === 'brandable',
      includeSynonyms: style !== 'short',
      includeIndustryTerms: !!detectedIndustry,
      industry: detectedIndustry || undefined,
    });

    // Apply style filter
    const styledSuggestions = applyStyleFilter(rawSuggestions, style, normalizedQuery);

    // Limit candidates for availability check
    const candidates = styledSuggestions.slice(0, max_suggestions * 2);

    // Check availability in parallel batches
    const BATCH_SIZE = 5;
    const results: Array<{ name: string; result: DomainResult | null }> = [];

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (name) => {
          try {
            const response = await searchDomain(name, [tld]);
            const result = response.results.find((r) => r.domain === `${name}.${tld}`);
            return { name, result: result || null };
          } catch {
            return { name, result: null };
          }
        }),
      );
      results.push(...batchResults);

      // Early exit if we have enough available
      const availableCount = results.filter(r => r.result?.available && !r.result?.premium).length;
      if (availableCount >= max_suggestions && !include_premium) {
        break;
      }
    }

    // Categorize results
    const available: SmartSuggestion[] = [];
    const premium: SmartSuggestion[] = [];
    let unavailableCount = 0;

    for (const { name, result } of results) {
      if (!result) {
        unavailableCount++;
        continue;
      }

      const isPremium = result.premium || isPremiumPrice(tld, result.price_first_year);

      const suggestion: SmartSuggestion = {
        domain: `${name}.${tld}`,
        available: result.available,
        price_first_year: result.price_first_year,
        price_renewal: result.price_renewal,
        registrar: result.registrar,
        premium: result.premium || false,
        premium_detected: isPremiumPrice(tld, result.price_first_year),
        privacy_included: result.privacy_included || false,
        score: scoreDomainName(name, normalizedQuery),
        category: !result.available
          ? 'unavailable'
          : isPremium
          ? 'premium'
          : 'standard',
      };

      if (!result.available) {
        unavailableCount++;
      } else if (isPremium) {
        premium.push(suggestion);
      } else {
        available.push(suggestion);
      }
    }

    // Sort by score
    available.sort((a, b) => b.score - a.score);
    premium.sort((a, b) => b.score - a.score);

    // Limit results
    const finalAvailable = available.slice(0, max_suggestions);
    const finalPremium = include_premium ? premium.slice(0, Math.floor(max_suggestions / 2)) : [];

    // Generate insights
    const insights: string[] = [];

    if (detectedIndustry) {
      insights.push(`🎯 Detected industry: ${detectedIndustry}`);
    }

    if (detectedWords.length > 1) {
      insights.push(`📝 Parsed keywords: ${detectedWords.join(', ')}`);
    }

    if (finalAvailable.length > 0) {
      insights.push(`✅ Found ${finalAvailable.length} available domain${finalAvailable.length > 1 ? 's' : ''}`);
      const best = finalAvailable[0]!;
      const priceStr = best.price_first_year !== null ? `$${best.price_first_year}/yr` : 'price unknown';
      insights.push(`⭐ Top pick: ${best.domain} (${priceStr})`);
    } else {
      insights.push(`❌ No standard-priced domains available`);
    }

    if (premium.length > 0) {
      insights.push(`💎 ${premium.length} premium domain${premium.length > 1 ? 's' : ''} available`);
    }

    if (finalAvailable.length < 3) {
      insights.push(`💡 Try different keywords or a different TLD (.io, .co, .dev)`);
    }

    // Get related terms for user reference
    const relatedTerms: string[] = [];
    for (const word of detectedWords.slice(0, 3)) {
      const synonyms = getSynonyms(word);
      relatedTerms.push(...synonyms.slice(0, 2));
    }
    if (detectedIndustry) {
      const industryTerms = getIndustryTerms(detectedIndustry);
      relatedTerms.push(...industryTerms.slice(0, 4));
    }

    return {
      query: normalizedQuery,
      detected_words: detectedWords,
      detected_industry: detectedIndustry,
      tld,
      style,
      total_generated: rawSuggestions.length,
      total_checked: results.length,
      results: {
        available: finalAvailable,
        premium: finalPremium,
        unavailable_count: unavailableCount,
      },
      insights,
      related_terms: [...new Set(relatedTerms)].slice(0, 10),
    };
  } catch (error) {
    throw wrapError(error);
  }
}
