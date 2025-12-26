/**
 * Premium Domain Analyzer.
 *
 * Analyzes WHY a domain is premium and provides actionable insights.
 * Premium domains are typically short, dictionary words, or popular keywords.
 */

import type { DomainResult } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════
// Premium Reason Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Common dictionary words that command premium prices.
 * Based on analysis of premium domain sales.
 */
const PREMIUM_KEYWORDS = new Set([
  // Tech
  'ai', 'app', 'api', 'cloud', 'data', 'dev', 'tech', 'code', 'web', 'net',
  'cyber', 'crypto', 'nft', 'meta', 'virtual', 'digital', 'smart', 'auto',
  // Business
  'buy', 'sell', 'shop', 'store', 'pay', 'cash', 'bank', 'money', 'invest',
  'trade', 'market', 'biz', 'pro', 'corp', 'inc', 'llc', 'hq', 'hub',
  // Health/Life
  'health', 'fit', 'life', 'care', 'med', 'doc', 'bio', 'eco', 'green',
  // Media
  'tv', 'fm', 'news', 'media', 'live', 'stream', 'video', 'music', 'art',
  // Generic valuable
  'best', 'top', 'prime', 'elite', 'ultra', 'super', 'mega', 'max', 'plus',
  'one', 'first', 'go', 'get', 'my', 'the', 'now', 'new', 'next', 'hot',
]);

/**
 * TLDs known for having many premium domains.
 */
const PREMIUM_HEAVY_TLDS = new Set([
  'io', 'ai', 'co', 'app', 'dev', 'xyz', 'club', 'online', 'site', 'tech',
]);

/**
 * Numeric patterns that are often premium.
 */
const PREMIUM_NUMBER_PATTERNS = [
  /^\d{1,3}$/, // 1-3 digit numbers (1, 99, 123)
  /^(\d)\1+$/, // Repeating digits (111, 888)
  /^12345?$/, // Sequential (123, 1234)
  /^2[0-9]{3}$/, // Years (2024, 2025)
];

/**
 * Analyze why a domain might be premium.
 */
export function analyzePremiumReason(domain: string): string[] {
  const reasons: string[] = [];
  const name = domain.split('.')[0]!.toLowerCase();
  const tld = domain.split('.').pop()!.toLowerCase();

  // Length-based premium
  if (name.length === 1) {
    reasons.push('Single character domain (extremely rare)');
  } else if (name.length === 2) {
    reasons.push('Two-character domain (very rare)');
  } else if (name.length === 3) {
    reasons.push('Three-character domain (short and memorable)');
  } else if (name.length === 4) {
    reasons.push('Four-character domain (concise)');
  }

  // Dictionary word check
  if (PREMIUM_KEYWORDS.has(name)) {
    reasons.push(`Popular keyword "${name}"`);
  }

  // Numeric patterns
  for (const pattern of PREMIUM_NUMBER_PATTERNS) {
    if (pattern.test(name)) {
      reasons.push('Valuable numeric pattern');
      break;
    }
  }

  // All letters same (aaa, bbb)
  if (/^(.)\1+$/.test(name) && name.length <= 4) {
    reasons.push('Repeating character pattern');
  }

  // Premium-heavy TLD
  if (PREMIUM_HEAVY_TLDS.has(tld)) {
    reasons.push(`High-demand .${tld} extension`);
  }

  // Acronym-style (all caps letters, 2-4 chars)
  if (/^[a-z]{2,4}$/.test(name) && name.toUpperCase() === name.toUpperCase()) {
    const couldBeAcronym = name.length <= 4 && !PREMIUM_KEYWORDS.has(name);
    if (couldBeAcronym && reasons.length === 0) {
      reasons.push('Potential acronym/initials');
    }
  }

  return reasons;
}

// ═══════════════════════════════════════════════════════════════════════════
// Premium Insights Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard TLD pricing for comparison (approximate first-year prices).
 */
const STANDARD_TLD_PRICES: Record<string, number> = {
  com: 10,
  net: 12,
  org: 12,
  io: 40,
  co: 25,
  dev: 12,
  app: 14,
  ai: 80,
  xyz: 3,
  me: 8,
  info: 5,
  tech: 8,
  cloud: 10,
};

/**
 * Generate detailed premium insights for a domain result.
 */
export function generatePremiumInsight(result: DomainResult): string | null {
  if (!result.premium || !result.available) {
    return null;
  }

  const domain = result.domain;
  const tld = domain.split('.').pop()!;
  const reasons = analyzePremiumReason(domain);
  const standardPrice = STANDARD_TLD_PRICES[tld] || 15;

  const parts: string[] = [];

  // Price markup insight
  if (result.price_first_year !== null) {
    const markup = result.price_first_year / standardPrice;
    if (markup >= 100) {
      parts.push(`💎 ${domain} is priced at $${result.price_first_year} (${Math.round(markup)}x standard .${tld} pricing)`);
    } else if (markup >= 10) {
      parts.push(`💰 ${domain} is priced at $${result.price_first_year} (${Math.round(markup)}x standard pricing)`);
    } else {
      parts.push(`⚠️ ${domain} is a premium domain at $${result.price_first_year}`);
    }
  } else {
    parts.push(`⚠️ ${domain} is marked as premium (price varies)`);
  }

  // Why it's premium
  if (reasons.length > 0) {
    parts.push(`Why premium: ${reasons.join(', ')}`);
  }

  return parts.join(' — ');
}

/**
 * Suggest alternatives when a domain is premium.
 */
export function suggestPremiumAlternatives(domain: string): string[] {
  const name = domain.split('.')[0]!;
  const tld = domain.split('.').pop()!;
  const suggestions: string[] = [];

  // Prefix/suffix variations
  const prefixes = ['get', 'try', 'use', 'my', 'the', 'go'];
  const suffixes = ['app', 'hq', 'io', 'now', 'hub', 'labs'];

  // Add a prefix
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]!;
  suggestions.push(`${prefix}${name}.${tld}`);

  // Add a suffix
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]!;
  suggestions.push(`${name}${suffix}.${tld}`);

  // Try alternative TLDs (cheaper ones)
  const cheaperTlds = ['co', 'dev', 'app', 'me', 'xyz'].filter(t => t !== tld);
  if (cheaperTlds.length > 0) {
    suggestions.push(`${name}.${cheaperTlds[0]}`);
  }

  // Double the last letter (creative variation)
  if (name.length >= 3) {
    const doubled = name + name[name.length - 1];
    suggestions.push(`${doubled}.${tld}`);
  }

  return suggestions.slice(0, 3); // Max 3 suggestions
}

// ═══════════════════════════════════════════════════════════════════════════
// Domain Score Calculation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate a quality score for a domain result.
 * Score factors:
 * - Price competitiveness (vs standard pricing)
 * - WHOIS privacy included
 * - Renewal price reasonableness
 * - Premium status (negative factor)
 */
export function calculateDomainScore(result: DomainResult): number {
  if (!result.available) return 0;

  let score = 5; // Base score

  const tld = result.domain.split('.').pop()!;
  const standardPrice = STANDARD_TLD_PRICES[tld] || 15;

  // Price factor (0-3 points)
  if (result.price_first_year !== null) {
    const priceRatio = result.price_first_year / standardPrice;
    if (priceRatio <= 0.5) score += 3; // Great deal
    else if (priceRatio <= 1.0) score += 2; // Good price
    else if (priceRatio <= 2.0) score += 1; // Fair
    else if (priceRatio > 5) score -= 2; // Expensive
  }

  // Privacy included (+1 point)
  if (result.privacy_included) {
    score += 1;
  }

  // Renewal price check (+1 point if reasonable)
  if (result.price_renewal !== null && result.price_first_year !== null) {
    const renewalRatio = result.price_renewal / result.price_first_year;
    if (renewalRatio <= 1.5) score += 1; // Renewal is reasonable
  }

  // Premium penalty (-1 point)
  if (result.premium) {
    score -= 1;
  }

  // TLD popularity bonus
  if (['com', 'io', 'dev', 'app', 'co'].includes(tld)) {
    score += 0.5;
  }

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Generate insights summary for multiple premium domains.
 */
export function generatePremiumSummary(results: DomainResult[]): string[] {
  const premiums = results.filter(r => r.premium && r.available);
  if (premiums.length === 0) return [];

  const insights: string[] = [];

  // Count by reason
  const allReasons = premiums.flatMap(r => analyzePremiumReason(r.domain));
  const reasonCounts = allReasons.reduce((acc, reason) => {
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Most common reason
  const topReason = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (topReason) {
    insights.push(`💎 Premium domains detected: ${topReason[0]}`);
  }

  // Total premium price vs standard
  const totalPremiumCost = premiums
    .filter(p => p.price_first_year !== null)
    .reduce((sum, p) => sum + (p.price_first_year || 0), 0);

  const totalStandardCost = premiums
    .reduce((sum, p) => {
      const tld = p.domain.split('.').pop()!;
      return sum + (STANDARD_TLD_PRICES[tld] || 15);
    }, 0);

  if (totalPremiumCost > 0 && totalPremiumCost > totalStandardCost * 2) {
    insights.push(
      `💡 Premium pricing is ${Math.round(totalPremiumCost / totalStandardCost)}x standard — consider name variations`
    );
  }

  // Suggest alternatives if all are premium
  if (premiums.length === results.filter(r => r.available).length && premiums.length > 0) {
    const alternatives = suggestPremiumAlternatives(premiums[0]!.domain);
    if (alternatives.length > 0) {
      insights.push(`💡 Try: ${alternatives.join(', ')}`);
    }
  }

  return insights;
}
