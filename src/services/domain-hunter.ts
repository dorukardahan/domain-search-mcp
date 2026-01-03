/**
 * Domain Hunter Service
 *
 * Finds valuable domains for investment opportunities:
 * - Pattern-based generation (short, dictionary, brandable, acronym)
 * - Sedo auction filtering
 * - Investment scoring algorithm
 */

import { searchDomain } from './domain-search.js';
import { parseSedoFeed, type SedoAuctionListing } from '../aftermarket/sedo.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { scoreDomainName } from '../utils/semantic-engine.js';
import { queryTakenDomains } from './negative-cache.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pattern types for domain generation.
 */
export type HuntPattern = 'short' | 'dictionary' | 'numeric' | 'brandable' | 'acronym';

/**
 * Criteria for hunting domains.
 */
export interface HuntCriteria {
  /** Keywords to search for */
  keywords?: string[];
  /** TLDs to check */
  tlds?: string[];
  /** Minimum domain name length */
  minLength?: number;
  /** Maximum domain name length */
  maxLength?: number;
  /** Include Sedo auctions */
  includeAftermarket?: boolean;
  /** Maximum aftermarket price (USD) */
  maxAftermarketPrice?: number;
  /** Pattern types to generate */
  patterns?: HuntPattern[];
  /** Maximum results to return */
  maxResults?: number;
  /** Minimum investment score (0-100) */
  scoreThreshold?: number;
}

/**
 * Investment score breakdown.
 */
export interface InvestmentScore {
  /** Overall score (0-100) */
  total: number;
  /** Score factors */
  factors: {
    length: number;
    tldValue: number;
    keywordMatch: number;
    pronounceability: number;
    aftermarketPrice?: number;
    pattern?: number;
  };
  /** Grade (A-F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/**
 * A hunted domain result.
 */
export interface HuntedDomain {
  domain: string;
  tld: string;
  available: boolean;
  /** Investment score details */
  investment_score: InvestmentScore;
  /** Source of the domain */
  source: 'pattern_generated' | 'sedo_auction';
  /** Aftermarket info if from Sedo */
  aftermarket?: {
    price: number | null;
    currency: string | null;
    auction_end?: string | null;
    url: string;
  };
  /** Pattern used to generate (if applicable) */
  pattern?: HuntPattern;
}

/**
 * Hunt domains response.
 */
export interface HuntDomainsResponse {
  results: HuntedDomain[];
  total_scanned: number;
  filters_applied: string[];
  insights: string[];
  sources: {
    sedo_auctions: number;
    pattern_generated: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Short domain patterns (3-5 letters).
 */
const SHORT_PATTERNS = [
  // 3-letter patterns: consonant-vowel-consonant
  ...generateCVCPatterns(3),
  // 4-letter patterns
  ...generateCVCPatterns(4),
  // 5-letter memorable patterns
  ...generateCVCPatterns(5),
];

/**
 * Generate consonant-vowel-consonant patterns.
 */
function generateCVCPatterns(length: number): string[] {
  const consonants = 'bcdfghjklmnprstvwxyz'.split('');
  const vowels = 'aeiou'.split('');
  const patterns: string[] = [];

  if (length === 3) {
    // CVC pattern
    for (const c1 of consonants.slice(0, 10)) {
      for (const v of vowels) {
        for (const c2 of consonants.slice(0, 10)) {
          patterns.push(c1 + v + c2);
        }
      }
    }
  } else if (length === 4) {
    // CVCV or CVCC patterns
    for (const c1 of consonants.slice(0, 8)) {
      for (const v1 of vowels) {
        for (const c2 of consonants.slice(0, 8)) {
          for (const v2 of vowels) {
            patterns.push(c1 + v1 + c2 + v2);
          }
        }
      }
    }
  } else if (length === 5) {
    // CVCVC patterns
    for (const c1 of consonants.slice(0, 5)) {
      for (const v1 of vowels.slice(0, 3)) {
        for (const c2 of consonants.slice(0, 5)) {
          for (const v2 of vowels.slice(0, 3)) {
            for (const c3 of consonants.slice(0, 5)) {
              patterns.push(c1 + v1 + c2 + v2 + c3);
            }
          }
        }
      }
    }
  }

  return patterns.slice(0, 500); // Limit to prevent explosion
}

/**
 * Common dictionary words that make good domains.
 */
const DICTIONARY_WORDS = [
  // Tech
  'pixel', 'stack', 'cloud', 'spark', 'swift', 'logic', 'cipher', 'vector',
  'nexus', 'prism', 'pulse', 'radar', 'signal', 'orbit', 'surge', 'core',
  // Business
  'prime', 'apex', 'elite', 'summit', 'vertex', 'titan', 'atlas', 'beacon',
  'bridge', 'forge', 'vault', 'scale', 'lever', 'pivot', 'sprint', 'launch',
  // Creative
  'muse', 'dream', 'vivid', 'bloom', 'spark', 'flame', 'storm', 'wave',
  'echo', 'nova', 'zen', 'flux', 'aura', 'halo', 'glow', 'blaze',
];

/**
 * Generate brandable patterns from keywords.
 */
function generateBrandablePatterns(keywords: string[]): string[] {
  const patterns: string[] = [];
  const suffixes = ['ly', 'ify', 'io', 'ai', 'eo', 'va', 'ra', 'co', 'go'];
  const prefixes = ['go', 'my', 'get', 'try', 'hi', 'up', 'on', 'be'];

  for (const keyword of keywords) {
    if (keyword.length < 3) continue;

    // Add suffixes
    for (const suffix of suffixes) {
      patterns.push(keyword + suffix);
    }

    // Add prefixes
    for (const prefix of prefixes) {
      patterns.push(prefix + keyword);
    }

    // Truncate + suffix (like flickr, tumblr)
    if (keyword.length > 4) {
      const truncated = keyword.slice(0, -1);
      patterns.push(truncated + 'r');
      patterns.push(truncated + 'o');
    }

    // Remove vowels (flickr style)
    const noVowels = keyword.replace(/[aeiou]/g, '');
    if (noVowels.length >= 3 && noVowels !== keyword) {
      patterns.push(noVowels);
    }
  }

  return patterns;
}

/**
 * Generate acronym patterns from keywords.
 */
function generateAcronymPatterns(keywords: string[]): string[] {
  const patterns: string[] = [];

  if (keywords.length >= 2) {
    // First letters of each keyword
    const acronym = keywords.map(k => k[0]).join('');
    if (acronym.length >= 2 && acronym.length <= 5) {
      patterns.push(acronym);
      patterns.push(acronym + 'hq');
      patterns.push(acronym + 'io');
      patterns.push(acronym + 'ai');
      patterns.push('go' + acronym);
    }
  }

  return patterns;
}

/**
 * Generate numeric patterns (short + numbers).
 */
function generateNumericPatterns(keywords: string[]): string[] {
  const patterns: string[] = [];
  const numbers = ['1', '2', '3', '4', '5', '7', '8', '9', '10', '24', '365'];

  for (const keyword of keywords) {
    if (keyword.length < 2 || keyword.length > 6) continue;

    for (const num of numbers) {
      patterns.push(keyword + num);
      patterns.push(num + keyword);
    }
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════
// INVESTMENT SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TLD value scores.
 */
const TLD_VALUES: Record<string, number> = {
  com: 25,
  io: 15,
  ai: 15,
  co: 12,
  net: 10,
  org: 8,
  dev: 8,
  app: 8,
  xyz: 5,
};

/**
 * Calculate investment score for a domain.
 */
export function calculateInvestmentScore(
  domain: string,
  tld: string,
  keywords: string[] = [],
  aftermarketPrice?: number,
  pattern?: HuntPattern,
): InvestmentScore {
  const factors = {
    length: 0,
    tldValue: 0,
    keywordMatch: 0,
    pronounceability: 0,
    aftermarketPrice: undefined as number | undefined,
    pattern: undefined as number | undefined,
  };

  // Length scoring (shorter = better)
  const nameLength = domain.replace(`.${tld}`, '').length;
  if (nameLength <= 3) factors.length = 25;
  else if (nameLength <= 4) factors.length = 20;
  else if (nameLength <= 5) factors.length = 15;
  else if (nameLength <= 6) factors.length = 10;
  else if (nameLength <= 8) factors.length = 5;
  else factors.length = 0;

  // TLD value
  factors.tldValue = TLD_VALUES[tld] || 5;

  // Keyword match
  const name = domain.replace(`.${tld}`, '').toLowerCase();
  for (const keyword of keywords) {
    if (name.includes(keyword.toLowerCase())) {
      factors.keywordMatch += 5;
    }
  }
  factors.keywordMatch = Math.min(factors.keywordMatch, 15);

  // Pronounceability (vowel ratio check)
  const vowels = (name.match(/[aeiou]/g) || []).length;
  const vowelRatio = vowels / name.length;
  if (vowelRatio >= 0.25 && vowelRatio <= 0.5) {
    factors.pronounceability = 10;
  } else if (vowelRatio >= 0.2 && vowelRatio <= 0.6) {
    factors.pronounceability = 5;
  }

  // Aftermarket price bonus (cheaper = better deal)
  if (aftermarketPrice !== undefined) {
    if (aftermarketPrice <= 50) factors.aftermarketPrice = 15;
    else if (aftermarketPrice <= 100) factors.aftermarketPrice = 12;
    else if (aftermarketPrice <= 250) factors.aftermarketPrice = 8;
    else if (aftermarketPrice <= 500) factors.aftermarketPrice = 5;
    else factors.aftermarketPrice = 0;
  }

  // Pattern bonus
  if (pattern) {
    switch (pattern) {
      case 'short':
        factors.pattern = 10;
        break;
      case 'dictionary':
        factors.pattern = 8;
        break;
      case 'brandable':
        factors.pattern = 6;
        break;
      case 'acronym':
        factors.pattern = 4;
        break;
      case 'numeric':
        factors.pattern = 2;
        break;
    }
  }

  // Calculate total
  const total = Object.values(factors).reduce<number>((sum, val) => sum + (val || 0), 0);

  // Normalize to 0-100 scale
  const normalizedTotal = Math.min(100, total);

  // Calculate grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (normalizedTotal >= 70) grade = 'A';
  else if (normalizedTotal >= 55) grade = 'B';
  else if (normalizedTotal >= 40) grade = 'C';
  else if (normalizedTotal >= 25) grade = 'D';
  else grade = 'F';

  return {
    total: normalizedTotal,
    factors,
    grade,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HUNTING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hunt for valuable domains.
 */
export async function huntDomains(criteria: HuntCriteria): Promise<HuntDomainsResponse> {
  const {
    keywords = [],
    tlds = ['com', 'io', 'co'],
    minLength = 3,
    maxLength = 12,
    includeAftermarket = true,
    maxAftermarketPrice,
    patterns = ['short', 'brandable'],
    maxResults = 20,
    scoreThreshold = 40,
  } = criteria;

  const results: HuntedDomain[] = [];
  const filtersApplied: string[] = [];
  const insights: string[] = [];
  const sources = { sedo_auctions: 0, pattern_generated: 0 };
  let totalScanned = 0;

  // Build filter description
  filtersApplied.push(`Length: ${minLength}-${maxLength} chars`);
  filtersApplied.push(`TLDs: ${tlds.join(', ')}`);
  filtersApplied.push(`Patterns: ${patterns.join(', ')}`);
  if (maxAftermarketPrice) {
    filtersApplied.push(`Max aftermarket price: $${maxAftermarketPrice}`);
  }
  filtersApplied.push(`Min score: ${scoreThreshold}`);

  // ========================================
  // Step 1: Fetch Sedo auctions if enabled
  // ========================================
  if (includeAftermarket && config.aftermarket.sedoEnabled) {
    try {
      const feedUrl = config.aftermarket.sedoFeedUrl || 'https://sedo.com/txt/auctions_us.txt';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(feedUrl, { signal: controller.signal });
        if (response.ok) {
          const text = await response.text();
          const sedoIndex = parseSedoFeed(text);

          // Filter Sedo listings
          for (const [domain, listing] of sedoIndex) {
            const parts = domain.split('.');
            if (parts.length < 2) continue;

            const name = parts.slice(0, -1).join('.');
            const tld = parts[parts.length - 1]!;

            // Apply filters
            if (!tlds.includes(tld)) continue;
            if (name.length < minLength || name.length > maxLength) continue;
            if (maxAftermarketPrice && listing.price && listing.price > maxAftermarketPrice) continue;

            // Check keyword match
            const hasKeywordMatch = keywords.length === 0 ||
              keywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()));
            if (!hasKeywordMatch && keywords.length > 0) continue;

            // Calculate score
            const score = calculateInvestmentScore(
              domain,
              tld,
              keywords,
              listing.price || undefined,
            );

            if (score.total < scoreThreshold) continue;

            totalScanned++;
            sources.sedo_auctions++;

            results.push({
              domain,
              tld,
              available: true, // Sedo auctions are available for purchase
              investment_score: score,
              source: 'sedo_auction',
              aftermarket: {
                price: listing.price,
                currency: listing.currency,
                auction_end: listing.auction_end || undefined,
                url: listing.url,
              },
            });
          }

          insights.push(`Scanned ${sedoIndex.size} Sedo auctions`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      logger.warn('Failed to fetch Sedo auctions', {
        error: error instanceof Error ? error.message : String(error),
      });
      insights.push('Sedo auction feed unavailable');
    }
  }

  // ========================================
  // Step 2: Generate pattern candidates
  // ========================================
  const candidates: Array<{ name: string; pattern: HuntPattern }> = [];

  // Generate based on patterns
  if (patterns.includes('short')) {
    const shortPatterns = SHORT_PATTERNS
      .filter(p => p.length >= minLength && p.length <= maxLength)
      .slice(0, 100); // Limit
    for (const name of shortPatterns) {
      candidates.push({ name, pattern: 'short' });
    }
  }

  if (patterns.includes('dictionary')) {
    const dictWords = DICTIONARY_WORDS.filter(
      w => w.length >= minLength && w.length <= maxLength
    );
    for (const name of dictWords) {
      candidates.push({ name, pattern: 'dictionary' });
    }
  }

  if (patterns.includes('brandable') && keywords.length > 0) {
    const brandablePatterns = generateBrandablePatterns(keywords)
      .filter(p => p.length >= minLength && p.length <= maxLength)
      .slice(0, 50);
    for (const name of brandablePatterns) {
      candidates.push({ name, pattern: 'brandable' });
    }
  }

  if (patterns.includes('acronym') && keywords.length >= 2) {
    const acronymPatterns = generateAcronymPatterns(keywords)
      .filter(p => p.length >= minLength && p.length <= maxLength);
    for (const name of acronymPatterns) {
      candidates.push({ name, pattern: 'acronym' });
    }
  }

  if (patterns.includes('numeric') && keywords.length > 0) {
    const numericPatterns = generateNumericPatterns(keywords)
      .filter(p => p.length >= minLength && p.length <= maxLength)
      .slice(0, 30);
    for (const name of numericPatterns) {
      candidates.push({ name, pattern: 'numeric' });
    }
  }

  insights.push(`Generated ${candidates.length} pattern candidates`);

  // ========================================
  // Step 3: Check availability for top candidates
  // ========================================
  // Pre-score candidates and pick best ones to check
  const scoredCandidates = candidates.map(c => ({
    ...c,
    preScore: calculateInvestmentScore(
      `${c.name}.${tlds[0]}`,
      tlds[0]!,
      keywords,
      undefined,
      c.pattern,
    ).total,
  }));

  scoredCandidates.sort((a, b) => b.preScore - a.preScore);

  // Check top candidates (limit API calls)
  let toCheck = scoredCandidates.slice(0, Math.min(50, maxResults * 3));

  // Pre-filter known-taken domains from federated negative cache
  if (config.negativeCache.enabled && toCheck.length > 0) {
    const fqdns = toCheck.flatMap(({ name }) =>
      tlds.map(tld => `${name}.${tld}`)
    );

    try {
      const takenResult = await queryTakenDomains(fqdns);

      if (takenResult.taken.size > 0) {
        const beforeCount = toCheck.length;
        // Keep candidates where at least one TLD is not known-taken
        toCheck = toCheck.filter(({ name }) =>
          !tlds.every(tld => takenResult.taken.has(`${name}.${tld}`.toLowerCase()))
        );

        const filtered = beforeCount - toCheck.length;
        if (filtered > 0) {
          insights.push(`Pre-filtered ${filtered} known-taken domains`);
          logger.debug('Domain hunter pre-filter', {
            before: beforeCount,
            after: toCheck.length,
            filtered,
          });
        }
      }
    } catch (error) {
      logger.debug('Negative cache query failed, continuing without pre-filter', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // SECURITY: Reduced from 5 to 3 to prevent rate limit exhaustion
  // With 3 TLDs per candidate: 3 × 3 = 9 concurrent requests (safe threshold)
  const BATCH_SIZE = 3;
  for (let i = 0; i < toCheck.length && results.length < maxResults; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ name, pattern }) => {
        // Check across all TLDs
        for (const tld of tlds) {
          if (results.length >= maxResults) return;

          try {
            const response = await searchDomain(name, [tld], undefined, {
              pricing: { enabled: false, maxQuotes: 0 },
              includeGodaddySignals: false,
            });

            const result = response.results.find(r => r.domain === `${name}.${tld}`);
            if (!result) continue;

            totalScanned++;

            if (result.available) {
              const score = calculateInvestmentScore(
                `${name}.${tld}`,
                tld,
                keywords,
                undefined,
                pattern,
              );

              if (score.total >= scoreThreshold) {
                sources.pattern_generated++;
                results.push({
                  domain: `${name}.${tld}`,
                  tld,
                  available: true,
                  investment_score: score,
                  source: 'pattern_generated',
                  pattern,
                });
              }
            }
          } catch {
            // Ignore individual failures
          }
        }
      }),
    );
  }

  // ========================================
  // Step 4: Sort and finalize
  // ========================================
  results.sort((a, b) => b.investment_score.total - a.investment_score.total);
  const finalResults = results.slice(0, maxResults);

  // Generate insights
  if (finalResults.length > 0) {
    const bestDomain = finalResults[0]!;
    insights.push(`Best find: ${bestDomain.domain} (Score: ${bestDomain.investment_score.total}, Grade: ${bestDomain.investment_score.grade})`);

    const gradeA = finalResults.filter(r => r.investment_score.grade === 'A').length;
    if (gradeA > 0) {
      insights.push(`Found ${gradeA} Grade-A investment opportunities`);
    }
  } else {
    insights.push('No domains matched your criteria. Try adjusting filters.');
  }

  return {
    results: finalResults,
    total_scanned: totalScanned,
    filters_applied: filtersApplied,
    insights,
    sources,
  };
}
