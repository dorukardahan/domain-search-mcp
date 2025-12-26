/**
 * tld_info Tool - TLD Information.
 *
 * Get information about a Top Level Domain (TLD).
 * Includes pricing, restrictions, and recommendations.
 */

import { z } from 'zod';
import type { TLDInfo } from '../types.js';
import { validateTld } from '../utils/validators.js';
import { wrapError } from '../utils/errors.js';
import { tldCache, tldCacheKey } from '../utils/cache.js';

/**
 * Input schema for tld_info.
 */
export const tldInfoSchema = z.object({
  tld: z
    .string()
    .min(2)
    .max(63)
    .describe("The TLD to get information about (e.g., 'com', 'io', 'dev')."),
  detailed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include detailed information. Defaults to false."),
});

export type TldInfoInput = z.infer<typeof tldInfoSchema>;

/**
 * Tool definition for MCP.
 */
export const tldInfoTool = {
  name: 'tld_info',
  description: `Get information about a Top Level Domain (TLD).

Returns:
- Description and typical use case
- Price range
- Any special restrictions
- Popularity and recommendations

Example:
- tld_info("io") → info about .io domains`,
  inputSchema: {
    type: 'object',
    properties: {
      tld: {
        type: 'string',
        description: "The TLD to get info about (e.g., 'com', 'io', 'dev').",
      },
      detailed: {
        type: 'boolean',
        description: "Include detailed information. Defaults to false.",
      },
    },
    required: ['tld'],
  },
};

/**
 * Static TLD database.
 */
const TLD_DATABASE: Record<string, TLDInfo> = {
  com: {
    tld: 'com',
    description: 'Commercial - the most recognized TLD worldwide',
    typical_use: 'Businesses, commercial websites, general purpose',
    price_range: { min: 8.88, max: 15.99, currency: 'USD' },
    renewal_price_typical: 12.99,
    restrictions: [],
    popularity: 'high',
    category: 'generic',
  },
  io: {
    tld: 'io',
    description: 'British Indian Ocean Territory - popular with tech startups',
    typical_use: 'Tech startups, SaaS products, developer tools',
    price_range: { min: 29.88, max: 59.99, currency: 'USD' },
    renewal_price_typical: 44.99,
    restrictions: [],
    popularity: 'high',
    category: 'country',
  },
  dev: {
    tld: 'dev',
    description: 'Developer - for software developers and their projects',
    typical_use: 'Developer portfolios, tools, documentation sites',
    price_range: { min: 10.18, max: 19.99, currency: 'USD' },
    renewal_price_typical: 14.99,
    restrictions: ['Requires HTTPS (HSTS preloaded)'],
    popularity: 'medium',
    category: 'new',
  },
  app: {
    tld: 'app',
    description: 'Application - for mobile and web applications',
    typical_use: 'Mobile apps, web applications, software products',
    price_range: { min: 11.18, max: 19.99, currency: 'USD' },
    renewal_price_typical: 14.99,
    restrictions: ['Requires HTTPS (HSTS preloaded)'],
    popularity: 'medium',
    category: 'new',
  },
  co: {
    tld: 'co',
    description: 'Colombia / Company - popular alternative to .com',
    typical_use: 'Companies, startups, short URLs',
    price_range: { min: 9.48, max: 29.99, currency: 'USD' },
    renewal_price_typical: 24.99,
    restrictions: [],
    popularity: 'high',
    category: 'country',
  },
  net: {
    tld: 'net',
    description: 'Network - originally for network providers',
    typical_use: 'Technology companies, network services, ISPs',
    price_range: { min: 9.88, max: 14.99, currency: 'USD' },
    renewal_price_typical: 12.99,
    restrictions: [],
    popularity: 'high',
    category: 'generic',
  },
  org: {
    tld: 'org',
    description: 'Organization - for non-profits and communities',
    typical_use: 'Non-profit organizations, open source projects, communities',
    price_range: { min: 9.88, max: 14.99, currency: 'USD' },
    renewal_price_typical: 12.99,
    restrictions: [],
    popularity: 'high',
    category: 'generic',
  },
  ai: {
    tld: 'ai',
    description: 'Anguilla / Artificial Intelligence - trending for AI projects',
    typical_use: 'AI/ML projects, tech startups, research',
    price_range: { min: 49.88, max: 99.99, currency: 'USD' },
    renewal_price_typical: 79.99,
    restrictions: [],
    popularity: 'medium',
    category: 'country',
  },
  xyz: {
    tld: 'xyz',
    description: 'XYZ - for the next generation of internet users',
    typical_use: 'Creative projects, personal sites, unconventional brands',
    price_range: { min: 1.99, max: 12.99, currency: 'USD' },
    renewal_price_typical: 12.99,
    restrictions: [],
    popularity: 'medium',
    category: 'new',
  },
  me: {
    tld: 'me',
    description: 'Montenegro - popular for personal brands',
    typical_use: 'Personal websites, portfolios, URL shorteners',
    price_range: { min: 9.88, max: 19.99, currency: 'USD' },
    renewal_price_typical: 17.99,
    restrictions: [],
    popularity: 'medium',
    category: 'country',
  },
  sh: {
    tld: 'sh',
    description: 'Saint Helena - popular with developers (shell scripts)',
    typical_use: 'Developer tools, CLI applications, tech projects',
    price_range: { min: 29.88, max: 49.99, currency: 'USD' },
    renewal_price_typical: 44.99,
    restrictions: [],
    popularity: 'low',
    category: 'country',
  },
  cc: {
    tld: 'cc',
    description: 'Cocos Islands - often used as "Creative Commons"',
    typical_use: 'Creative projects, alternative to .com',
    price_range: { min: 9.88, max: 24.99, currency: 'USD' },
    renewal_price_typical: 19.99,
    restrictions: [],
    popularity: 'low',
    category: 'country',
  },
};

/**
 * Response format for TLD info.
 */
interface TldInfoResponse extends TLDInfo {
  insights: string[];
  recommendation: string;
}

/**
 * Execute the tld_info tool.
 */
export async function executeTldInfo(
  input: TldInfoInput,
): Promise<TldInfoResponse> {
  try {
    const { tld, detailed } = tldInfoSchema.parse(input);
    const normalizedTld = validateTld(tld);

    // Check cache
    const cacheKey = tldCacheKey(normalizedTld);
    const cached = tldCache.get(cacheKey);
    if (cached) {
      return formatResponse(cached, detailed);
    }

    // Look up in database
    const info = TLD_DATABASE[normalizedTld];

    if (!info) {
      // Return generic info for unknown TLDs
      const genericInfo: TLDInfo = {
        tld: normalizedTld,
        description: `${normalizedTld.toUpperCase()} domain extension`,
        typical_use: 'General purpose',
        price_range: { min: 10, max: 50, currency: 'USD' },
        renewal_price_typical: 20,
        restrictions: ['Check registrar for specific restrictions'],
        popularity: 'low',
        category: 'generic',
      };

      return formatResponse(genericInfo, detailed);
    }

    // Cache the result
    tldCache.set(cacheKey, info);

    return formatResponse(info, detailed);
  } catch (error) {
    throw wrapError(error);
  }
}

/**
 * Format the response with insights.
 */
function formatResponse(info: TLDInfo, detailed: boolean): TldInfoResponse {
  const insights: string[] = [];
  let recommendation = '';

  // Generate insights
  if (info.popularity === 'high') {
    insights.push(`✅ .${info.tld} is highly recognized and trusted`);
  } else if (info.popularity === 'medium') {
    insights.push(`💡 .${info.tld} is gaining popularity in specific niches`);
  } else {
    insights.push(`⚠️ .${info.tld} is less common - may need more brand building`);
  }

  if (info.restrictions.length > 0) {
    insights.push(`⚠️ Special requirements: ${info.restrictions.join(', ')}`);
  }

  if (info.price_range.min <= 10) {
    insights.push(`💰 Budget-friendly starting at $${info.price_range.min}/year`);
  } else if (info.price_range.min >= 40) {
    insights.push(`💸 Premium pricing starting at $${info.price_range.min}/year`);
  }

  // Generate recommendation
  switch (info.tld) {
    case 'com':
      recommendation = 'Best for mainstream businesses and maximum recognition';
      break;
    case 'io':
      recommendation = 'Perfect for tech startups and SaaS products';
      break;
    case 'dev':
      recommendation = 'Ideal for developers and tech portfolios (requires HTTPS)';
      break;
    case 'app':
      recommendation = 'Great for mobile/web applications (requires HTTPS)';
      break;
    case 'ai':
      recommendation = 'Trending choice for AI/ML projects, but pricey';
      break;
    default:
      recommendation = `Good choice for ${info.typical_use.toLowerCase()}`;
  }

  return {
    ...info,
    insights,
    recommendation,
  };
}
