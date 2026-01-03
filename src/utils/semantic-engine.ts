/**
 * Semantic Engine for AI-like Domain Suggestions.
 *
 * Provides intelligent domain name generation without external AI dependencies.
 * Uses linguistic algorithms, word databases, and pattern matching.
 */

import { config } from '../config.js';
import { queryTakenDomains } from '../services/negative-cache.js';

/**
 * Common word synonyms for domain name variations.
 */
const SYNONYMS: Record<string, string[]> = {
  // Tech terms
  app: ['application', 'software', 'tool', 'platform', 'service'],
  tech: ['technology', 'digital', 'cyber', 'smart', 'intelligent'],
  code: ['coding', 'dev', 'developer', 'programming', 'software'],
  dev: ['developer', 'development', 'code', 'build', 'create'],
  web: ['online', 'internet', 'digital', 'cloud', 'net'],
  cloud: ['sky', 'air', 'vapor', 'hosted', 'saas'],
  data: ['info', 'analytics', 'metrics', 'insights', 'stats'],
  ai: ['intelligent', 'smart', 'ml', 'brain', 'neural', 'cognitive'],
  api: ['connect', 'integrate', 'link', 'bridge', 'hub'],

  // Business terms
  shop: ['store', 'market', 'mart', 'outlet', 'bazaar', 'emporium'],
  buy: ['purchase', 'get', 'acquire', 'order', 'shop'],
  sell: ['trade', 'market', 'vend', 'deal', 'offer'],
  pay: ['payment', 'checkout', 'billing', 'invoice', 'finance'],
  money: ['cash', 'funds', 'finance', 'capital', 'wealth'],
  business: ['biz', 'enterprise', 'company', 'corp', 'venture'],

  // Action terms
  get: ['grab', 'fetch', 'obtain', 'acquire', 'access'],
  find: ['search', 'discover', 'locate', 'seek', 'explore'],
  make: ['create', 'build', 'craft', 'forge', 'generate'],
  send: ['deliver', 'ship', 'dispatch', 'transmit', 'share'],
  connect: ['link', 'join', 'unite', 'bridge', 'sync'],

  // Descriptive terms
  fast: ['quick', 'rapid', 'swift', 'speedy', 'instant', 'turbo'],
  smart: ['clever', 'intelligent', 'bright', 'wise', 'genius'],
  easy: ['simple', 'effortless', 'smooth', 'breeze', 'snap'],
  free: ['gratis', 'open', 'libre', 'zero', 'complimentary'],
  pro: ['professional', 'expert', 'premium', 'elite', 'master'],

  // Size/Scale
  big: ['large', 'mega', 'giant', 'huge', 'vast', 'grand'],
  small: ['mini', 'tiny', 'micro', 'little', 'compact', 'lite'],

  // Quality
  best: ['top', 'prime', 'premier', 'superior', 'ultimate', 'optimal'],
  good: ['great', 'awesome', 'excellent', 'superb', 'stellar'],
  new: ['fresh', 'novel', 'modern', 'next', 'neo', 'latest'],

  // Food & Lifestyle
  food: ['eats', 'cuisine', 'kitchen', 'chef', 'meal', 'dish'],
  coffee: ['cafe', 'brew', 'bean', 'roast', 'espresso', 'java'],
  health: ['wellness', 'fit', 'vital', 'care', 'med', 'life'],
  home: ['house', 'living', 'nest', 'haven', 'dwelling', 'abode'],

  // Creative
  design: ['creative', 'art', 'studio', 'craft', 'pixel', 'visual'],
  media: ['content', 'channel', 'stream', 'broadcast', 'press'],
  photo: ['image', 'pic', 'snap', 'shot', 'lens', 'capture'],
  video: ['film', 'motion', 'clip', 'reel', 'stream', 'watch'],
  music: ['audio', 'sound', 'tune', 'beat', 'melody', 'sonic'],

  // Social
  social: ['community', 'network', 'connect', 'share', 'together'],
  team: ['crew', 'squad', 'group', 'tribe', 'collective', 'guild'],
  chat: ['talk', 'message', 'speak', 'convo', 'discuss', 'voice'],

  // Nature
  green: ['eco', 'earth', 'nature', 'leaf', 'organic', 'bio'],
  blue: ['ocean', 'sky', 'azure', 'aqua', 'marine', 'wave'],
  sun: ['solar', 'bright', 'light', 'ray', 'shine', 'glow'],
  star: ['stellar', 'astro', 'cosmic', 'nova', 'galaxy', 'orbit'],
};

/**
 * Industry-specific vocabulary for contextual suggestions.
 */
const INDUSTRY_TERMS: Record<string, string[]> = {
  tech: [
    'stack', 'node', 'byte', 'pixel', 'logic', 'algo', 'kernel', 'cache',
    'sync', 'async', 'stream', 'flux', 'vector', 'tensor', 'quantum', 'cyber',
  ],
  startup: [
    'launch', 'venture', 'scale', 'pivot', 'disrupt', 'iterate', 'mvp', 'seed',
    'growth', 'unicorn', 'rocket', 'boost', 'accelerate', 'incubate',
  ],
  finance: [
    'capital', 'wealth', 'invest', 'fund', 'equity', 'asset', 'profit', 'yield',
    'trade', 'market', 'stock', 'bond', 'crypto', 'defi', 'fintech',
  ],
  health: [
    'vital', 'wellness', 'care', 'heal', 'med', 'clinic', 'therapy', 'fit',
    'nutrition', 'balance', 'mind', 'body', 'pulse', 'life', 'cure',
  ],
  food: [
    'kitchen', 'chef', 'bistro', 'grill', 'bake', 'fresh', 'organic', 'farm',
    'harvest', 'plate', 'taste', 'flavor', 'spice', 'savory', 'delish',
  ],
  creative: [
    'studio', 'canvas', 'palette', 'brush', 'ink', 'craft', 'artisan', 'muse',
    'vision', 'imagine', 'dream', 'inspire', 'spark', 'bloom', 'hue',
  ],
  ecommerce: [
    'cart', 'checkout', 'order', 'ship', 'deal', 'offer', 'sale', 'mart',
    'bazaar', 'outlet', 'depot', 'warehouse', 'supply', 'merchant',
  ],
  education: [
    'learn', 'teach', 'course', 'class', 'academy', 'scholar', 'study', 'tutor',
    'mentor', 'skill', 'knowledge', 'wisdom', 'genius', 'brain', 'mind',
  ],
  gaming: [
    'play', 'game', 'quest', 'level', 'arena', 'battle', 'guild', 'raid',
    'loot', 'spawn', 'realm', 'world', 'epic', 'legend', 'hero',
  ],
  social: [
    'connect', 'share', 'follow', 'friend', 'community', 'tribe', 'circle',
    'network', 'gather', 'meetup', 'hangout', 'squad', 'crew', 'vibe',
  ],
};

/**
 * Modern domain naming patterns and suffixes.
 */
const MODERN_SUFFIXES = [
  'ly', 'ify', 'io', 'ai', 'app', 'hq', 'labs', 'hub', 'now', 'go',
  'up', 'me', 'co', 'so', 'to', 'it', 'os', 'js', 'py', 'dev',
  'cloud', 'base', 'stack', 'flow', 'space', 'zone', 'spot', 'pad',
  'box', 'kit', 'way', 'path', 'link', 'sync', 'dash', 'tap', 'pop',
];

/**
 * Modern domain naming prefixes.
 */
const MODERN_PREFIXES = [
  'get', 'try', 'use', 'go', 'hey', 'hi', 'my', 'our', 'the', 'be',
  'on', 'in', 'up', 'do', 'we', 'all', 'one', 'super', 'ultra', 'mega',
  'hyper', 'meta', 'neo', 'pro', 'open', 'true', 'real', 'next', 'ever',
];

/**
 * Word segmentation - detect words in concatenated strings.
 * Uses a dictionary-based approach with common words.
 */
const COMMON_WORDS = new Set([
  // Tech
  'app', 'api', 'web', 'dev', 'code', 'tech', 'data', 'cloud', 'ai', 'ml',
  'bot', 'net', 'hub', 'lab', 'labs', 'io', 'bit', 'byte', 'node', 'stack',
  'soft', 'ware', 'software', 'cyber', 'auto', 'smart', 'intel', 'assist',
  // Actions
  'get', 'set', 'put', 'run', 'go', 'do', 'make', 'find', 'buy', 'pay',
  'send', 'sync', 'link', 'chat', 'call', 'meet', 'play', 'work', 'ship',
  'build', 'create', 'start', 'launch', 'grow', 'scale', 'track', 'save',
  // Descriptors
  'big', 'fast', 'easy', 'free', 'new', 'hot', 'cool', 'top', 'best', 'pro',
  'smart', 'super', 'ultra', 'mega', 'mini', 'lite', 'plus', 'prime', 'max',
  'quick', 'rapid', 'swift', 'safe', 'secure', 'clean', 'clear', 'fresh',
  // Business
  'shop', 'store', 'mart', 'deal', 'sale', 'cash', 'pay', 'bill', 'trade',
  'biz', 'corp', 'inc', 'co', 'company', 'brand', 'agency', 'firm',
  // General
  'my', 'our', 'the', 'one', 'all', 'now', 'here', 'next', 'just', 'only',
  'vibe', 'flow', 'wave', 'spark', 'boost', 'dash', 'snap', 'pop', 'buzz',
  'zone', 'spot', 'point', 'base', 'core', 'edge', 'peak', 'rise', 'up',
  // Longer common words
  'hello', 'world', 'cloud', 'space', 'time', 'team', 'group', 'social',
  'media', 'video', 'photo', 'audio', 'music', 'sound', 'voice', 'chat',
  'market', 'money', 'health', 'food', 'home', 'life', 'love', 'star',
  'coding', 'design', 'studio', 'creative', 'digital', 'mobile', 'online',
  // Food & Beverage
  'coffee', 'cafe', 'brew', 'bean', 'tea', 'juice', 'pizza', 'burger', 'taco',
  'chef', 'cook', 'kitchen', 'bakery', 'grill', 'diner', 'bistro', 'eatery',
  // Common compound parts
  'assistant', 'manager', 'finder', 'maker', 'builder', 'tracker', 'planner',
  // Crypto / tracking specific
  'chain', 'block', 'onchain', 'alert', 'alerts', 'signal', 'signals', 'whale',
  'wallet', 'oracle', 'monitor', 'tracker', 'scan', 'pulse', 'beacon', 'sentry',
]);

/**
 * Stopwords to ignore when generating suggestions.
 */
const STOPWORDS = new Set([
  'and', 'with', 'for', 'the', 'of', 'in', 'on', 'to', 'from', 'by',
  'a', 'an', 'or', 'project', 'codename', 'name', 'domain',
]);

/**
 * Short tokens allowed as meaningful words.
 */
const SHORT_ALLOW = new Set(['ai', 'io', 'ml', 'vr', 'xr', 'nft', 'defi', 'dao', 'dex', 'id', 'gm']);

const INDUSTRY_TERM_SET = new Set(
  Object.values(INDUSTRY_TERMS).flat(),
);

function filterSuggestionWords(words: string[]): string[] {
  const unique = new Set<string>();
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (!normalized || STOPWORDS.has(normalized)) continue;

    const isShortAllowed = SHORT_ALLOW.has(normalized);
    const isMeaningful =
      COMMON_WORDS.has(normalized) ||
      Object.prototype.hasOwnProperty.call(SYNONYMS, normalized) ||
      INDUSTRY_TERM_SET.has(normalized);

    if (!isShortAllowed && normalized.length < 3) continue;
    if (!isMeaningful && normalized.length < 4) continue;

    unique.add(normalized);
  }
  return [...unique];
}

/**
 * Attempt to segment a concatenated string into words.
 */
export function segmentWords(input: string): string[] {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  const result: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0) {
    let found = false;

    // Try longest match first (up to 12 chars)
    for (let len = Math.min(12, remaining.length); len >= 2; len--) {
      const candidate = remaining.slice(0, len);
      if (COMMON_WORDS.has(candidate)) {
        result.push(candidate);
        remaining = remaining.slice(len);
        found = true;
        break;
      }
    }

    // If no word found, take single char and continue
    if (!found) {
      // Try to find a word starting from next position
      let skipCount = 1;
      for (let skip = 1; skip < Math.min(4, remaining.length); skip++) {
        const subRemaining = remaining.slice(skip);
        for (let len = Math.min(12, subRemaining.length); len >= 2; len--) {
          if (COMMON_WORDS.has(subRemaining.slice(0, len))) {
            skipCount = skip;
            break;
          }
        }
      }

      // Add the prefix as a potential word fragment
      const fragment = remaining.slice(0, skipCount);
      if (fragment.length >= 2) {
        result.push(fragment);
      }
      remaining = remaining.slice(skipCount);
    }
  }

  return result;
}

/**
 * Get synonyms for a word.
 */
export function getSynonyms(word: string): string[] {
  const normalized = word.toLowerCase();
  return SYNONYMS[normalized] || [];
}

/**
 * Get industry-specific terms.
 */
export function getIndustryTerms(industry: string): string[] {
  const normalized = industry.toLowerCase();
  return INDUSTRY_TERMS[normalized] || [];
}

/**
 * Detect likely industry from keywords.
 */
export function detectIndustry(words: string[]): string | null {
  const wordSet = new Set(words.map(w => w.toLowerCase()));

  const industryIndicators: Record<string, string[]> = {
    tech: ['app', 'code', 'coding', 'dev', 'tech', 'software', 'api', 'web', 'cloud', 'ai', 'data', 'cyber', 'digital'],
    startup: ['launch', 'venture', 'startup', 'founder', 'scale', 'growth', 'mvp', 'disrupt'],
    finance: ['pay', 'money', 'bank', 'invest', 'trade', 'crypto', 'fund', 'capital', 'finance', 'fintech'],
    health: ['health', 'fit', 'wellness', 'med', 'care', 'clinic', 'therapy', 'vital', 'nutrition'],
    food: ['food', 'eat', 'coffee', 'kitchen', 'chef', 'restaurant', 'cafe', 'bistro', 'brew', 'cook'],
    creative: ['design', 'art', 'studio', 'creative', 'photo', 'video', 'media', 'pixel', 'visual'],
    ecommerce: ['shop', 'store', 'buy', 'sell', 'cart', 'order', 'deal', 'market', 'commerce'],
    education: ['learn', 'teach', 'course', 'academy', 'school', 'tutor', 'study', 'edu', 'skill'],
    gaming: ['game', 'play', 'quest', 'arena', 'guild', 'level', 'gamer', 'esport'],
    social: ['social', 'connect', 'share', 'community', 'network', 'friend', 'chat', 'vibe'],
  };

  for (const [industry, indicators] of Object.entries(industryIndicators)) {
    for (const indicator of indicators) {
      if (wordSet.has(indicator)) {
        return industry;
      }
    }
  }

  return null;
}

/**
 * Generate portmanteau (blended word) from two words.
 */
export function generatePortmanteau(word1: string, word2: string): string[] {
  const results: string[] = [];

  // Overlap blend: find common letter sequence
  for (let i = 1; i < Math.min(word1.length, 4); i++) {
    const suffix = word1.slice(-i);
    if (word2.toLowerCase().startsWith(suffix.toLowerCase())) {
      results.push(word1 + word2.slice(i));
    }
  }

  // Truncation blend: first part + second part
  if (word1.length >= 3 && word2.length >= 3) {
    const blend1 = word1.slice(0, Math.ceil(word1.length * 0.6)) + word2.slice(Math.floor(word2.length * 0.4));
    const blend2 = word1.slice(0, Math.ceil(word1.length * 0.5)) + word2.slice(Math.floor(word2.length * 0.5));
    results.push(blend1, blend2);
  }

  return [...new Set(results)].filter(r => r.length >= 4 && r.length <= 15);
}

/**
 * Generate creative domain name suggestions.
 */
export interface SmartSuggestionOptions {
  maxSuggestions?: number;
  includePortmanteau?: boolean;
  includeSynonyms?: boolean;
  includeIndustryTerms?: boolean;
  industry?: string;
}

export function generateSmartSuggestions(
  input: string,
  options: SmartSuggestionOptions = {},
): string[] {
  const {
    maxSuggestions = 50,
    includePortmanteau = true,
    includeSynonyms = true,
    includeIndustryTerms = true,
    industry,
  } = options;

  const suggestions = new Set<string>();
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Add original
  suggestions.add(normalized);

  // Segment into words and filter low-quality fragments
  const rawWords = segmentWords(normalized);
  const words = filterSuggestionWords(rawWords);
  const fallbackWords =
    words.length > 0
      ? words
      : rawWords.filter((word) => word.length >= 4 && !STOPWORDS.has(word));

  // Detect or use provided industry
  const detectedIndustry = industry || detectIndustry(fallbackWords);

  // 1. Modern prefix variations
  for (const prefix of MODERN_PREFIXES.slice(0, 15)) {
    suggestions.add(prefix + normalized);
    for (const word of fallbackWords) {
      if (word.length >= 3) {
        suggestions.add(prefix + word);
      }
    }
  }

  // 2. Modern suffix variations
  for (const suffix of MODERN_SUFFIXES.slice(0, 15)) {
    suggestions.add(normalized + suffix);
    for (const word of fallbackWords) {
      if (word.length >= 3) {
        suggestions.add(word + suffix);
      }
    }
  }

  // 3. Synonym-based suggestions
  if (includeSynonyms) {
    for (const word of fallbackWords) {
      const synonyms = getSynonyms(word);
      for (const synonym of synonyms.slice(0, 3)) {
        // Replace word with synonym
        const newName = words.map(w => w === word ? synonym : w).join('');
        suggestions.add(newName);

        // Add prefix/suffix to synonym
        suggestions.add('get' + synonym);
        suggestions.add(synonym + 'hub');
        suggestions.add(synonym + 'app');
      }
    }
  }

  // 4. Industry-specific suggestions
  if (includeIndustryTerms && detectedIndustry) {
    const industryTerms = getIndustryTerms(detectedIndustry);
    for (const term of industryTerms.slice(0, 8)) {
      suggestions.add(normalized + term);
      suggestions.add(term + normalized);
      for (const word of fallbackWords) {
        if (word.length >= 3) {
          suggestions.add(word + term);
          suggestions.add(term + word);
        }
      }
    }
  }

  // 5. Portmanteau suggestions
  if (includePortmanteau && fallbackWords.length >= 2) {
    for (let i = 0; i < fallbackWords.length - 1; i++) {
      const blends = generatePortmanteau(fallbackWords[i]!, fallbackWords[i + 1]!);
      for (const blend of blends) {
        suggestions.add(blend);
      }
    }
  }

  // 6. Word reordering
  if (fallbackWords.length >= 2) {
    suggestions.add(fallbackWords.slice().reverse().join(''));
  }

  // 7. Abbreviation suggestions
  if (fallbackWords.length >= 2) {
    // First letters
    const initials = fallbackWords.map(w => w[0]).join('');
    if (initials.length >= 2) {
      suggestions.add(initials + 'hub');
      suggestions.add(initials + 'app');
      suggestions.add('go' + initials);
    }
  }

  // 8. Vowel removal (modern style)
  const noVowels = normalized.replace(/[aeiou]/g, '');
  if (noVowels.length >= 3 && noVowels !== normalized) {
    suggestions.add(noVowels);
    suggestions.add(noVowels + 'io');
    suggestions.add(noVowels + 'app');
  }

  // 9. Double letter simplification
  const simplified = normalized.replace(/(.)\1+/g, '$1');
  if (simplified !== normalized && simplified.length >= 3) {
    suggestions.add(simplified);
  }

  // 10. Creative endings
  const creativeEndings = ['ster', 'ery', 'ful', 'ness', 'ize', 'able'];
  for (const ending of creativeEndings) {
    if (!normalized.endsWith(ending)) {
      suggestions.add(normalized + ending);
    }
  }

  // Filter and return
  return Array.from(suggestions)
    .filter(s => s.length >= 3 && s.length <= 20 && /^[a-z0-9]+$/.test(s))
    .slice(0, maxSuggestions);
}

/**
 * Score a domain name based on quality metrics.
 */
export function scoreDomainName(name: string, originalInput: string): number {
  let score = 50;

  // Length preference (shorter is better, but not too short)
  if (name.length <= 6) score += 15;
  else if (name.length <= 8) score += 10;
  else if (name.length <= 10) score += 5;
  else if (name.length > 15) score -= 10;

  // Exact match bonus
  if (name === originalInput.toLowerCase().replace(/[^a-z0-9]/g, '')) {
    score += 20;
  }

  // Pronounceability (alternating consonants and vowels is good)
  const vowels = (name.match(/[aeiou]/g) || []).length;
  const ratio = vowels / name.length;
  if (ratio >= 0.25 && ratio <= 0.5) score += 10;

  // No triple letters
  if (/(.)\1\1/.test(name)) score -= 10;

  // Starts with common word bonus
  if (COMMON_WORDS.has(name.slice(0, 3)) || COMMON_WORDS.has(name.slice(0, 4))) {
    score += 5;
  }

  // Modern suffix bonus
  for (const suffix of ['io', 'ai', 'ly', 'ify', 'app', 'hub']) {
    if (name.endsWith(suffix)) {
      score += 5;
      break;
    }
  }

  // No numbers (usually cleaner)
  if (!/\d/.test(name)) score += 5;

  return score;
}

/**
 * Filter out known-taken domains from suggestions.
 *
 * Uses the federated negative cache to remove suggestions
 * that are already known to be registered.
 *
 * @param suggestions Array of domain name suggestions (without TLD)
 * @param tld The TLD to check against
 * @returns Filtered array with known-taken domains removed
 */
export async function filterKnownTakenSuggestions(
  suggestions: string[],
  tld: string,
): Promise<string[]> {
  if (!config.negativeCache.enabled || suggestions.length === 0) {
    return suggestions;
  }

  // Build FQDNs and query the negative cache
  const fqdns = suggestions.map(s => `${s}.${tld}`);
  const result = await queryTakenDomains(fqdns);

  // Filter out domains that are known to be taken
  if (result.taken.size === 0) {
    return suggestions;
  }

  return suggestions.filter(s => !result.taken.has(`${s}.${tld}`.toLowerCase()));
}

export { MODERN_SUFFIXES, MODERN_PREFIXES, INDUSTRY_TERMS, SYNONYMS };
