/**
 * check_socials Tool - Social Handle Availability.
 *
 * Check if a username is available across social platforms.
 * Helps ensure consistent branding across domain and socials.
 */

import { z } from 'zod';
import axios from 'axios';
import type { SocialPlatform, SocialHandleResult } from '../types.js';
import { wrapError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Input schema for check_socials.
 */
export const checkSocialsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(30)
    .describe("The username/handle to check (e.g., 'vibecoding')."),
  platforms: z
    .array(z.enum(['github', 'twitter', 'instagram', 'linkedin', 'tiktok']))
    .optional()
    .describe(
      "Platforms to check. Defaults to ['github', 'twitter', 'instagram'].",
    ),
});

export type CheckSocialsInput = z.infer<typeof checkSocialsSchema>;

/**
 * Tool definition for MCP.
 */
export const checkSocialsTool = {
  name: 'check_socials',
  description: `Check if a username is available on social media platforms.

Supports: GitHub, Twitter/X, Instagram, LinkedIn, TikTok

Returns availability status with confidence level (some platforms
can't be checked reliably without authentication).

Example:
- check_socials("vibecoding") → checks GitHub, Twitter, Instagram`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "The username/handle to check.",
      },
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['github', 'twitter', 'instagram', 'linkedin', 'tiktok'],
        },
        description:
          "Platforms to check. Defaults to ['github', 'twitter', 'instagram'].",
      },
    },
    required: ['name'],
  },
};

/**
 * Platform check configuration.
 */
interface PlatformConfig {
  checkUrl: (username: string) => string;
  profileUrl: (username: string) => string;
  confidence: 'high' | 'medium' | 'low';
  checkMethod: 'head' | 'get';
}

const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  github: {
    checkUrl: (u) => `https://api.github.com/users/${u}`,
    profileUrl: (u) => `https://github.com/${u}`,
    confidence: 'high',
    checkMethod: 'get',
  },
  twitter: {
    // Twitter API requires auth, so we use a workaround
    checkUrl: (u) => `https://twitter.com/${u}`,
    profileUrl: (u) => `https://twitter.com/${u}`,
    confidence: 'medium',
    checkMethod: 'head',
  },
  instagram: {
    checkUrl: (u) => `https://www.instagram.com/${u}/`,
    profileUrl: (u) => `https://instagram.com/${u}`,
    confidence: 'low', // Instagram blocks automated checks
    checkMethod: 'head',
  },
  linkedin: {
    checkUrl: (u) => `https://www.linkedin.com/in/${u}`,
    profileUrl: (u) => `https://linkedin.com/in/${u}`,
    confidence: 'low', // LinkedIn blocks automated checks
    checkMethod: 'head',
  },
  tiktok: {
    checkUrl: (u) => `https://www.tiktok.com/@${u}`,
    profileUrl: (u) => `https://tiktok.com/@${u}`,
    confidence: 'low',
    checkMethod: 'head',
  },
};

/**
 * Check a single platform.
 */
async function checkPlatform(
  username: string,
  platform: SocialPlatform,
): Promise<SocialHandleResult> {
  const config = PLATFORM_CONFIGS[platform];
  const url = config.checkUrl(username);

  try {
    if (platform === 'github') {
      // GitHub has a public API
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: () => true, // Don't throw on any status
        headers: {
          'User-Agent': 'Domain-Search-MCP/1.0',
        },
      });

      return {
        platform,
        handle: username,
        available: response.status === 404,
        url: config.profileUrl(username),
        checked_at: new Date().toISOString(),
        confidence: 'high',
      };
    }

    // For other platforms, try a HEAD request
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      maxRedirects: 0,
    });

    // 404 = available, 200/301/302 = taken
    const available = response.status === 404;

    return {
      platform,
      handle: username,
      available,
      url: config.profileUrl(username),
      checked_at: new Date().toISOString(),
      confidence: config.confidence,
    };
  } catch (error) {
    logger.debug(`Failed to check ${platform}`, {
      username,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return uncertain result on error
    return {
      platform,
      handle: username,
      available: false, // Assume taken if we can't check
      url: config.profileUrl(username),
      checked_at: new Date().toISOString(),
      confidence: 'low',
    };
  }
}

/**
 * Response format for social checks.
 */
interface CheckSocialsResponse {
  name: string;
  results: SocialHandleResult[];
  summary: {
    available: number;
    taken: number;
    uncertain: number;
  };
  insights: string[];
}

/**
 * Execute the check_socials tool.
 */
export async function executeCheckSocials(
  input: CheckSocialsInput,
): Promise<CheckSocialsResponse> {
  try {
    const { name, platforms } = checkSocialsSchema.parse(input);

    const platformsToCheck: SocialPlatform[] = platforms || [
      'github',
      'twitter',
      'instagram',
    ];

    // Normalize username
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');

    // Check all platforms in parallel
    const results = await Promise.all(
      platformsToCheck.map((p) => checkPlatform(normalizedName, p)),
    );

    // Calculate summary
    const available = results.filter(
      (r) => r.available && r.confidence !== 'low',
    );
    const taken = results.filter((r) => !r.available && r.confidence !== 'low');
    const uncertain = results.filter((r) => r.confidence === 'low');

    // Generate insights
    const insights: string[] = [];

    if (available.length > 0) {
      insights.push(
        `✅ ${normalizedName} is available on: ${available.map((r) => r.platform).join(', ')}`,
      );
    }

    if (taken.length > 0) {
      insights.push(
        `❌ ${normalizedName} is taken on: ${taken.map((r) => r.platform).join(', ')}`,
      );
    }

    if (uncertain.length > 0) {
      insights.push(
        `⚠️ Could not reliably check: ${uncertain.map((r) => r.platform).join(', ')} (check manually)`,
      );
    }

    // Branding consistency advice
    const allAvailable = results.every((r) => r.available);
    const allTaken = results.every((r) => !r.available);

    if (allAvailable) {
      insights.push(`🎉 Great news! "${normalizedName}" is available everywhere`);
    } else if (allTaken) {
      insights.push(
        `💡 Consider variations: ${normalizedName}hq, ${normalizedName}app, get${normalizedName}`,
      );
    } else {
      insights.push(
        '💡 For consistent branding, consider a name available on all platforms',
      );
    }

    return {
      name: normalizedName,
      results,
      summary: {
        available: available.length,
        taken: taken.length,
        uncertain: uncertain.length,
      },
      insights,
    };
  } catch (error) {
    throw wrapError(error);
  }
}
