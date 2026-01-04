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
  filterKnownTakenSuggestions,
} from '../utils/semantic-engine.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { DomainResult } from '../types.js';
import { getQwenClient, type QwenContext } from '../services/qwen-inference.js';
import {
  getTogetherClient,
  isTogetherConfigured,
} from '../services/together-inference.js';
import { checkRateLimit, inferenceRateLimiter } from '../utils/rate-limiter.js';

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
    .coerce
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
  project_context: z
    .object({
      name: z.string().optional().describe("Project name"),
      description: z.string().optional().describe("Project description"),
      keywords: z.array(z.string()).optional().describe("Keywords to incorporate"),
      industry: z.string().optional().describe("Industry context"),
      repository_url: z.string().optional().describe("Repository URL if applicable"),
    })
    .optional()
    .describe(
      "Optional project context for more relevant suggestions. " +
      "Use analyze_project tool to extract this automatically from a codebase."
    ),
});

export type SuggestDomainsSmartInput = z.infer<typeof suggestDomainsSmartSchema>;

/**
 * Tool definition for MCP.
 */
export const suggestDomainsSmartTool = {
  name: 'suggest_domains_smart',
  description: `AI-powered domain name suggestion engine.

Generate creative, brandable domain names from keywords or business descriptions.
Combines multiple intelligent sources for maximum coverage and quality.

Features:
- ZERO-CONFIG: Works out of the box with our fine-tuned Qwen 7B-DPO model
- Domain-specialized fine-tuned model for higher quality suggestions
- Understands natural language queries ("coffee shop in seattle")
- Auto-detects industry for contextual suggestions
- Generates portmanteau/blended names (instagram = instant + telegram)
- Applies modern naming patterns (ly, ify, io, hub, etc.)
- Filters premium domains by default
- Availability verified via Porkbun/RDAP
- Graceful fallback: Fine-tuned Qwen → Semantic engine

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
      project_context: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "Project name" },
          description: { type: 'string', description: "Project description" },
          keywords: { type: 'array', items: { type: 'string' }, description: "Keywords" },
          industry: { type: 'string', description: "Industry context" },
          repository_url: { type: 'string', description: "Repository URL" },
        },
        description: "Project context from analyze_project for better suggestions.",
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
  source: 'qwen_inference' | 'together_ai' | 'semantic_engine';
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
    qwen_inference: number;
    together_ai: number;
    semantic_engine: number;
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
    const { query, tld, industry, style, max_suggestions, include_premium, project_context } =
      suggestDomainsSmartSchema.parse(input);

    // Normalize and analyze input
    const normalizedQuery = query.toLowerCase().trim();
    const detectedWords = segmentWords(normalizedQuery);
    const detectedIndustry = industry || project_context?.industry || detectIndustry(detectedWords);

    // Build Qwen context from project_context if provided
    const qwenContext: QwenContext | undefined = project_context ? {
      projectName: project_context.name,
      description: project_context.description,
      industry: project_context.industry || detectedIndustry || undefined,
      keywords: project_context.keywords,
      repositoryUrl: project_context.repository_url,
    } : undefined;

    // Track source statistics
    const sourceStats = {
      qwen_inference: 0,
      together_ai: 0,
      semantic_engine: 0,
    };

    // ========================================
    // STEP 1: Generate suggestions from ALL sources in parallel
    // ========================================

    // AI Source Priority (January 2026 - Zero-Config Design):
    // 1. PRIMARY: VPS fine-tuned Qwen 7B-DPO (llama-server:8000) - FREE, domain-specialized
    // 2. FALLBACK: Together.ai (deprecated BYOK) - only if user configured
    // 3. ALWAYS: Semantic engine (rule-based, offline)

    // P3 FIX: Rate limit AI inference calls
    checkRateLimit(inferenceRateLimiter, 'suggest_domains_smart', 'AI domain suggestions');

    let aiSuggestions: Array<{ name: string; tld: string; reason?: string }> = [];
    let aiSource: 'qwen_inference' | 'together_ai' | null = null;

    // PRIMARY: VPS fine-tuned Qwen 7B-DPO (domain-specialized model)
    // This is the default - works without any user configuration!
    const qwenClient = getQwenClient();
    if (qwenClient) {
      try {
        const qwenResults = await qwenClient.suggest({
          query: normalizedQuery,
          style,
          tld,
          max_suggestions: max_suggestions * 2,
          temperature: style === 'creative' ? 0.9 : 0.7,
          context: qwenContext,
        });

        if (qwenResults && qwenResults.length > 0) {
          aiSuggestions = qwenResults;
          aiSource = 'qwen_inference';
          sourceStats.qwen_inference = qwenResults.length;
          logger.debug('VPS fine-tuned Qwen 7B-DPO suggestions received (PRIMARY)', {
            count: qwenResults.length,
            sample: qwenResults.slice(0, 3).map(s => s.name),
          });
        }
      } catch (error) {
        logger.warn('VPS Qwen failed, trying Together.ai fallback', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    // FALLBACK: Together.ai (deprecated BYOK - for users who configured it)
    if (aiSuggestions.length === 0 && isTogetherConfigured()) {
      try {
        const togetherClient = getTogetherClient();
        if (togetherClient) {
          const togetherResults = await togetherClient.suggest({
            query: normalizedQuery,
            style,
            tld,
            max_suggestions: max_suggestions * 2,
            temperature: style === 'creative' ? 0.9 : 0.7,
            context: qwenContext,
          });

          if (togetherResults && togetherResults.length > 0) {
            aiSuggestions = togetherResults;
            aiSource = 'together_ai';
            sourceStats.together_ai = togetherResults.length;
            logger.debug('Together.ai suggestions received (deprecated BYOK fallback)', {
              count: togetherResults.length,
              sample: togetherResults.slice(0, 3).map(s => s.name),
            });
          }
        }
      } catch (error) {
        logger.warn('All AI sources failed, using semantic engine only', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    // Source 1: Our semantic engine
    const semanticSuggestions = generateSmartSuggestions(normalizedQuery, {
      maxSuggestions: max_suggestions * 3,
      includePortmanteau: style === 'creative' || style === 'brandable',
      includeSynonyms: style !== 'short',
      includeIndustryTerms: !!detectedIndustry,
      industry: detectedIndustry || undefined,
    });
    sourceStats.semantic_engine = semanticSuggestions.length;

    // ========================================
    // STEP 2: Merge and deduplicate suggestions
    // ========================================

    // Track which domains came from which source
    const domainSources = new Map<string, 'qwen_inference' | 'together_ai' | 'semantic_engine'>();

    // Add AI suggestions first (highest priority - VPS Qwen → Together.ai)
    for (const ais of aiSuggestions) {
      const fullDomain = `${ais.name}.${ais.tld}`.toLowerCase();
      domainSources.set(fullDomain, aiSource || 'semantic_engine');
    }

    // Add semantic suggestions
    const styledSuggestions = applyStyleFilter(semanticSuggestions, style, normalizedQuery);
    for (const name of styledSuggestions) {
      const fullDomain = `${name}.${tld}`.toLowerCase();
      // Don't override AI suggestions
      if (!domainSources.has(fullDomain)) {
        domainSources.set(fullDomain, 'semantic_engine');
      }
    }

    // ========================================
    // STEP 3: Check availability for all suggestions via Porkbun/RDAP
    // ========================================

    const available: SmartSuggestion[] = [];
    const premium: SmartSuggestion[] = [];
    let unavailableCount = 0;
    let totalChecked = 0;

    // Build candidate list from all sources
    let candidates = styledSuggestions.slice(0, max_suggestions * 2); // Get extra for pre-filtering

    // Pre-filter known-taken domains from federated negative cache
    if (config.negativeCache.enabled && candidates.length > 0) {
      const beforeCount = candidates.length;
      candidates = await filterKnownTakenSuggestions(candidates, tld);
      const filtered = beforeCount - candidates.length;
      if (filtered > 0) {
        logger.debug('Smart suggestions pre-filter', {
          before: beforeCount,
          after: candidates.length,
          filtered,
        });
      }
    }

    // Limit after pre-filtering
    candidates = candidates.slice(0, max_suggestions);

    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (name) => {
          try {
            const response = await searchDomain(name, [tld], undefined, {
              pricing: { enabled: false, maxQuotes: 0 },
            });
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
          source: domainSources.get(fullDomain) || 'semantic_engine',
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

    // Sort by score (higher is better)
    available.sort((a, b) => b.score - a.score);
    premium.sort((a, b) => b.score - a.score);

    // Limit results
    const finalAvailable = available.slice(0, max_suggestions);
    const finalPremium = include_premium ? premium.slice(0, Math.floor(max_suggestions / 2)) : [];

    // ========================================
    // STEP 5: Generate insights
    // ========================================

    const insights: string[] = [];

    // Source info - AI provider attribution
    if (sourceStats.qwen_inference > 0) {
      insights.push(`🤖 ${sourceStats.qwen_inference} AI suggestions from fine-tuned Qwen 7B-DPO`);
    } else if (sourceStats.together_ai > 0) {
      insights.push(`🤖 ${sourceStats.together_ai} AI suggestions from Together.ai`);
    }
    insights.push(`🔍 Semantic Engine generated ${sourceStats.semantic_engine} suggestions`);

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
      sources: sourceStats,
      total_checked: totalChecked,
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
