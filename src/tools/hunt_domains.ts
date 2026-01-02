/**
 * hunt_domains Tool - Domain Investment Hunting.
 *
 * Finds valuable domains for investment opportunities:
 * - Scans Sedo auctions for deals
 * - Generates pattern-based candidates
 * - Calculates investment scores
 */

import { z } from 'zod';
import { huntDomains, type HuntDomainsResponse } from '../services/domain-hunter.js';
import { wrapError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Input schema for hunt_domains.
 */
export const huntDomainsSchema = z.object({
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords to search for. Used to match existing domains and generate brandable patterns. " +
      "Examples: ['ai', 'chat'], ['coffee', 'brew'], ['code', 'dev']"
    ),
  tlds: z
    .array(z.string())
    .optional()
    .default(['com', 'io', 'co'])
    .describe("TLDs to search. Defaults to ['com', 'io', 'co']."),
  min_length: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .default(3)
    .describe("Minimum domain name length (2-10). Defaults to 3."),
  max_length: z
    .number()
    .int()
    .min(3)
    .max(20)
    .optional()
    .default(12)
    .describe("Maximum domain name length (3-20). Defaults to 12."),
  include_aftermarket: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include Sedo auction listings. Defaults to true."),
  max_aftermarket_price: z
    .number()
    .min(1)
    .optional()
    .describe("Maximum aftermarket price in USD. No limit if not specified."),
  patterns: z
    .array(z.enum(['short', 'dictionary', 'numeric', 'brandable', 'acronym']))
    .optional()
    .default(['short', 'brandable'])
    .describe(
      "Pattern types to generate. Options: 'short' (3-5 chars), 'dictionary' (common words), " +
      "'numeric' (keyword+number), 'brandable' (keyword variants), 'acronym' (from keywords). " +
      "Defaults to ['short', 'brandable']."
    ),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("Maximum results to return (1-50). Defaults to 20."),
  score_threshold: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(40)
    .describe("Minimum investment score (0-100). Defaults to 40."),
});

export type HuntDomainsInput = z.infer<typeof huntDomainsSchema>;

/**
 * Tool definition for MCP.
 */
export const huntDomainsTool = {
  name: 'hunt_domains',
  description: `Find valuable domains for investment opportunities.

Scans Sedo auctions, generates pattern-based candidates, and calculates investment scores
based on length, TLD value, keyword matches, and pronounceability.

**Investment Score Factors:**
- Length: Shorter = higher score (3-4 chars = +25 points)
- TLD Value: .com = +25, .io/.ai = +15, .co = +12
- Keyword Match: +5 per keyword found in domain
- Pronounceability: Good vowel ratio = +10
- Aftermarket Price: Lower prices get bonus points

**Pattern Types:**
- \`short\`: 3-5 character pronounceable patterns (CVC, CVCV)
- \`dictionary\`: Common words that make good domains
- \`brandable\`: Keyword + modern suffixes (-ly, -ify, -io)
- \`acronym\`: Abbreviations from multiple keywords
- \`numeric\`: Keyword + numbers (7, 24, 365)

**Examples:**
- hunt_domains(keywords=["ai", "chat"]) → Find AI/chat themed domains
- hunt_domains(max_length=5, tlds=["com"]) → Ultra-short .com domains
- hunt_domains(max_aftermarket_price=500) → Sedo auctions under $500
- hunt_domains(patterns=["short"], score_threshold=60) → High-scoring short domains`,
  inputSchema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: "Keywords to search for and incorporate into patterns.",
      },
      tlds: {
        type: 'array',
        items: { type: 'string' },
        description: "TLDs to search. Defaults to ['com', 'io', 'co'].",
      },
      min_length: {
        type: 'number',
        description: "Minimum domain name length. Defaults to 3.",
      },
      max_length: {
        type: 'number',
        description: "Maximum domain name length. Defaults to 12.",
      },
      include_aftermarket: {
        type: 'boolean',
        description: "Include Sedo auctions. Defaults to true.",
      },
      max_aftermarket_price: {
        type: 'number',
        description: "Maximum aftermarket price (USD).",
      },
      patterns: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['short', 'dictionary', 'numeric', 'brandable', 'acronym'],
        },
        description: "Pattern types to generate.",
      },
      max_results: {
        type: 'number',
        description: "Maximum results (1-50). Defaults to 20.",
      },
      score_threshold: {
        type: 'number',
        description: "Minimum investment score (0-100). Defaults to 40.",
      },
    },
  },
};

/**
 * Response format for hunt_domains.
 */
interface HuntDomainsToolResponse {
  results: Array<{
    domain: string;
    tld: string;
    available: boolean;
    investment_score: {
      total: number;
      grade: string;
      factors: {
        length: number;
        tld_value: number;
        keyword_match: number;
        pronounceability: number;
        aftermarket_price?: number;
        pattern?: number;
      };
    };
    source: string;
    pattern?: string;
    aftermarket?: {
      price: number | null;
      currency: string | null;
      auction_end?: string;
      url: string;
    };
  }>;
  summary: {
    total_scanned: number;
    results_count: number;
    grade_distribution: {
      A: number;
      B: number;
      C: number;
      D: number;
      F: number;
    };
  };
  filters_applied: string[];
  insights: string[];
  sources: {
    sedo_auctions: number;
    pattern_generated: number;
  };
}

/**
 * Execute the hunt_domains tool.
 */
export async function executeHuntDomains(
  input: HuntDomainsInput,
): Promise<HuntDomainsToolResponse> {
  try {
    const validated = huntDomainsSchema.parse(input);

    logger.info('Hunting domains', {
      keywords: validated.keywords,
      patterns: validated.patterns,
      tlds: validated.tlds,
    });

    // Execute the hunt
    const huntResult = await huntDomains({
      keywords: validated.keywords,
      tlds: validated.tlds,
      minLength: validated.min_length,
      maxLength: validated.max_length,
      includeAftermarket: validated.include_aftermarket,
      maxAftermarketPrice: validated.max_aftermarket_price,
      patterns: validated.patterns,
      maxResults: validated.max_results,
      scoreThreshold: validated.score_threshold,
    });

    // Calculate grade distribution
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const result of huntResult.results) {
      gradeDistribution[result.investment_score.grade]++;
    }

    // Transform results to response format
    const response: HuntDomainsToolResponse = {
      results: huntResult.results.map(r => ({
        domain: r.domain,
        tld: r.tld,
        available: r.available,
        investment_score: {
          total: r.investment_score.total,
          grade: r.investment_score.grade,
          factors: {
            length: r.investment_score.factors.length,
            tld_value: r.investment_score.factors.tldValue,
            keyword_match: r.investment_score.factors.keywordMatch,
            pronounceability: r.investment_score.factors.pronounceability,
            aftermarket_price: r.investment_score.factors.aftermarketPrice,
            pattern: r.investment_score.factors.pattern,
          },
        },
        source: r.source,
        pattern: r.pattern,
        aftermarket: r.aftermarket ? {
          price: r.aftermarket.price,
          currency: r.aftermarket.currency,
          auction_end: r.aftermarket.auction_end || undefined,
          url: r.aftermarket.url,
        } : undefined,
      })),
      summary: {
        total_scanned: huntResult.total_scanned,
        results_count: huntResult.results.length,
        grade_distribution: gradeDistribution,
      },
      filters_applied: huntResult.filters_applied,
      insights: huntResult.insights,
      sources: huntResult.sources,
    };

    return response;
  } catch (error) {
    throw wrapError(error);
  }
}
