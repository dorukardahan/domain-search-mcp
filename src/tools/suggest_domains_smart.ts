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
import { godaddyPublicAdapter, type GodaddySuggestion } from '../registrars/index.js';
import { logger } from '../utils/logger.js';
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
Combines our semantic engine with GoDaddy's AI suggestions for maximum coverage.

Features:
- Dual-source suggestions: Our semantic engine + GoDaddy AI
- Understands natural language queries ("coffee shop in seattle")
- Auto-detects industry for contextual suggestions
- Generates portmanteau/blended names (instagram = instant + telegram)
- Applies modern naming patterns (ly, ify, io, hub, etc.)
- Filters premium domains by default
- Pre-verified availability via GoDaddy

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
  source: 'semantic_engine' | 'godaddy_suggest' | 'both';
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
  sources: {
    semantic_engine: number;
    godaddy_suggest: number;
    merged: number;
  };
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

    // Track source statistics
    const sourceStats = {
      semantic_engine: 0,
      godaddy_suggest: 0,
      merged: 0,
    };

    // ========================================
    // STEP 1: Generate suggestions from BOTH sources in parallel
    // ========================================

    // Source 1: Our semantic engine
    const semanticSuggestions = generateSmartSuggestions(normalizedQuery, {
      maxSuggestions: max_suggestions * 3,
      includePortmanteau: style === 'creative' || style === 'brandable',
      includeSynonyms: style !== 'short',
      includeIndustryTerms: !!detectedIndustry,
      industry: detectedIndustry || undefined,
    });
    sourceStats.semantic_engine = semanticSuggestions.length;

    // Source 2: GoDaddy's AI suggestions (parallel call)
    let godaddySuggestions: GodaddySuggestion[] = [];
    try {
      godaddySuggestions = await godaddyPublicAdapter.suggestDomains(query, {
        tlds: [tld],
        limit: max_suggestions * 2,
      });
      sourceStats.godaddy_suggest = godaddySuggestions.length;
      logger.debug('GoDaddy suggestions received', {
        count: godaddySuggestions.length,
        sample: godaddySuggestions.slice(0, 3).map(s => s.domain),
      });
    } catch (error) {
      // GoDaddy might fail - continue with just semantic suggestions
      logger.warn('GoDaddy suggestions failed, using semantic engine only', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    // ========================================
    // STEP 2: Merge and deduplicate suggestions
    // ========================================

    // Track which domains came from which source
    const domainSources = new Map<string, 'semantic_engine' | 'godaddy_suggest' | 'both'>();

    // Add semantic suggestions (need availability check)
    const styledSuggestions = applyStyleFilter(semanticSuggestions, style, normalizedQuery);
    for (const name of styledSuggestions) {
      const fullDomain = `${name}.${tld}`.toLowerCase();
      domainSources.set(fullDomain, 'semantic_engine');
    }

    // Add GoDaddy suggestions (already have availability)
    for (const gs of godaddySuggestions) {
      const fullDomain = gs.domain.toLowerCase();
      if (domainSources.has(fullDomain)) {
        domainSources.set(fullDomain, 'both'); // Found in both sources
        sourceStats.merged++;
      } else {
        domainSources.set(fullDomain, 'godaddy_suggest');
      }
    }

    // ========================================
    // STEP 3: Check availability for semantic suggestions
    // (GoDaddy suggestions already have availability info)
    // ========================================

    const available: SmartSuggestion[] = [];
    const premium: SmartSuggestion[] = [];
    let unavailableCount = 0;
    let totalChecked = 0;

    // First, add pre-checked GoDaddy suggestions (no API call needed!)
    for (const gs of godaddySuggestions) {
      const fullDomain = gs.domain.toLowerCase();
      const source = domainSources.get(fullDomain) || 'godaddy_suggest';
      const name = fullDomain.replace(`.${tld}`, '');

      const suggestion: SmartSuggestion = {
        domain: fullDomain,
        available: gs.available,
        price_first_year: null, // GoDaddy doesn't provide pricing
        price_renewal: null,
        registrar: 'godaddy',
        premium: gs.premium,
        premium_detected: gs.premium,
        privacy_included: false,
        score: scoreDomainName(name, normalizedQuery),
        category: !gs.available
          ? 'unavailable'
          : gs.premium
          ? 'premium'
          : gs.auction
          ? 'auction'
          : 'standard',
        source,
      };

      if (!gs.available) {
        unavailableCount++;
      } else if (gs.premium || gs.auction) {
        if (include_premium) {
          premium.push(suggestion);
        }
      } else {
        available.push(suggestion);
      }
    }

    // Then, check semantic suggestions that weren't in GoDaddy results
    const semanticOnlyCandidates = styledSuggestions
      .filter(name => {
        const fullDomain = `${name}.${tld}`.toLowerCase();
        return domainSources.get(fullDomain) === 'semantic_engine';
      })
      .slice(0, max_suggestions); // Limit API calls

    const BATCH_SIZE = 5;
    for (let i = 0; i < semanticOnlyCandidates.length; i += BATCH_SIZE) {
      const batch = semanticOnlyCandidates.slice(i, i + BATCH_SIZE);
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

      for (const { name, result } of batchResults) {
        totalChecked++;
        if (!result) {
          unavailableCount++;
          continue;
        }

        const isPremiumDomain = result.premium || isPremiumPrice(tld, result.price_first_year);
        const fullDomain = `${name}.${tld}`.toLowerCase();

        const suggestion: SmartSuggestion = {
          domain: fullDomain,
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
            : isPremiumDomain
            ? 'premium'
            : 'standard',
          source: 'semantic_engine',
        };

        if (!result.available) {
          unavailableCount++;
        } else if (isPremiumDomain) {
          if (include_premium) {
            premium.push(suggestion);
          }
        } else {
          available.push(suggestion);
        }
      }

      // Early exit if we have enough available
      if (available.length >= max_suggestions && !include_premium) {
        break;
      }
    }

    // ========================================
    // STEP 4: Sort and finalize results
    // ========================================

    // Sort by score, prefer 'both' source items (validated by multiple sources)
    available.sort((a, b) => {
      // Boost 'both' source items
      const aBoost = a.source === 'both' ? 2 : 0;
      const bBoost = b.source === 'both' ? 2 : 0;
      return (b.score + bBoost) - (a.score + aBoost);
    });
    premium.sort((a, b) => b.score - a.score);

    // Limit results
    const finalAvailable = available.slice(0, max_suggestions);
    const finalPremium = include_premium ? premium.slice(0, Math.floor(max_suggestions / 2)) : [];

    // ========================================
    // STEP 5: Generate insights
    // ========================================

    const insights: string[] = [];

    // Source info
    insights.push(`🔍 Sources: Semantic Engine (${sourceStats.semantic_engine}) + GoDaddy AI (${sourceStats.godaddy_suggest})`);
    if (sourceStats.merged > 0) {
      insights.push(`🔗 ${sourceStats.merged} suggestions found in both sources`);
    }

    if (detectedIndustry) {
      insights.push(`🎯 Detected industry: ${detectedIndustry}`);
    }

    if (detectedWords.length > 1) {
      insights.push(`📝 Parsed keywords: ${detectedWords.join(', ')}`);
    }

    if (finalAvailable.length > 0) {
      insights.push(`✅ Found ${finalAvailable.length} available domain${finalAvailable.length > 1 ? 's' : ''}`);
      const best = finalAvailable[0]!;
      const priceStr = best.price_first_year !== null ? `$${best.price_first_year}/yr` : 'via ' + best.registrar;
      const sourceStr = best.source === 'both' ? ' (verified by both sources)' : '';
      insights.push(`⭐ Top pick: ${best.domain} (${priceStr})${sourceStr}`);
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
      sources: sourceStats,
      total_checked: totalChecked + godaddySuggestions.length,
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
