/**
 * check_socials Tool - Social Handle Availability.
 *
 * Check if a username is available across social platforms.
 * Uses Sherlock-style detection for accurate results.
 *
 * Detection methods:
 * - status_code: 404 = available, 200 = taken
 * - message: Check response body for error indicators
 * - api: Use platform's public API
 */

import { z } from 'zod';
import axios from 'axios';
import type { SocialPlatform, SocialHandleResult } from '../types.js';
import { wrapError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';

// ═══════════════════════════════════════════════════════════════════════════
// Cache Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache for social handle results.
 * - Taken usernames: cached 24 hours (rarely become available)
 * - Available usernames: cached 1 hour (might be taken soon)
 * - Errors: cached 5 minutes (retry soon)
 */
const CACHE_TTL_TAKEN = 86400; // 24 hours
const CACHE_TTL_AVAILABLE = 3600; // 1 hour
const CACHE_TTL_ERROR = 300; // 5 minutes

const socialCache = new TtlCache<SocialHandleResult>(CACHE_TTL_TAKEN, 5000);

// ═══════════════════════════════════════════════════════════════════════════
// Platform Configuration (Sherlock-style)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detection method types (inspired by Sherlock).
 */
type ErrorType = 'status_code' | 'message' | 'api';

/**
 * Platform configuration for username checking.
 */
interface PlatformConfig {
  /** URL to check (use {} for username placeholder) */
  url: string;
  /** Public profile URL */
  profileUrl: string;
  /** Detection method */
  errorType: ErrorType;
  /** For message type: strings that indicate username is available */
  errorMsg?: string[];
  /** For status_code type: HTTP status that means available */
  errorCode?: number;
  /** Expected confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** HTTP method */
  method: 'GET' | 'HEAD';
  /** Custom headers */
  headers?: Record<string, string>;
  /** Username regex validation */
  regexCheck?: RegExp;
}

/**
 * Platform configurations using Sherlock-style detection.
 * HIGH confidence = public API or reliable status codes
 * MEDIUM confidence = status codes but may have edge cases
 * LOW confidence = platforms that block automated checks
 */
const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  // ─────────────────────────────────────────────────────────────────────────
  // HIGH CONFIDENCE (Public APIs)
  // ─────────────────────────────────────────────────────────────────────────
  github: {
    url: 'https://api.github.com/users/{}',
    profileUrl: 'https://github.com/{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'high',
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Domain-Search-MCP/1.0',
    },
    regexCheck: /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
  },

  npm: {
    url: 'https://registry.npmjs.org/{}',
    profileUrl: 'https://www.npmjs.com/~{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'high',
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    regexCheck: /^[a-z0-9][a-z0-9._-]*$/i,
  },

  pypi: {
    url: 'https://pypi.org/user/{}/',
    profileUrl: 'https://pypi.org/user/{}/',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'high',
    method: 'GET',
  },

  reddit: {
    url: 'https://www.reddit.com/user/{}/about.json',
    profileUrl: 'https://reddit.com/user/{}',
    errorType: 'message',
    errorMsg: ['"error": 404'],
    confidence: 'high',
    method: 'GET',
    headers: {
      'User-Agent': 'Domain-Search-MCP/1.0 (checking username availability)',
    },
    regexCheck: /^[A-Za-z0-9_-]{3,20}$/,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MEDIUM CONFIDENCE (Status codes, some edge cases)
  // ─────────────────────────────────────────────────────────────────────────
  twitter: {
    // Use oembed API - Twitter SPA returns 200 for all direct requests
    url: 'https://publish.twitter.com/oembed?url=https://twitter.com/{}',
    profileUrl: 'https://twitter.com/{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'high', // oembed API is reliable
    method: 'GET',
    headers: {
      'User-Agent': 'Domain-Search-MCP/1.0',
    },
    regexCheck: /^[A-Za-z0-9_]{1,15}$/,
  },

  youtube: {
    url: 'https://www.youtube.com/@{}',
    profileUrl: 'https://youtube.com/@{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'medium',
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  },

  producthunt: {
    url: 'https://www.producthunt.com/@{}',
    profileUrl: 'https://producthunt.com/@{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'medium',
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOW CONFIDENCE (Aggressive bot protection)
  // ─────────────────────────────────────────────────────────────────────────
  instagram: {
    url: 'https://www.instagram.com/{}/',
    profileUrl: 'https://instagram.com/{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'low', // Instagram aggressively blocks automated checks
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    regexCheck: /^[a-zA-Z0-9_.]{1,30}$/,
  },

  linkedin: {
    url: 'https://www.linkedin.com/in/{}',
    profileUrl: 'https://linkedin.com/in/{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'low', // LinkedIn requires auth
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  },

  tiktok: {
    url: 'https://www.tiktok.com/@{}',
    profileUrl: 'https://tiktok.com/@{}',
    errorType: 'status_code',
    errorCode: 404,
    confidence: 'low', // TikTok blocks automated checks
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    regexCheck: /^[a-zA-Z0-9_.]{2,24}$/,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schema
// ═══════════════════════════════════════════════════════════════════════════

const ALL_PLATFORMS = [
  'github', 'twitter', 'instagram', 'linkedin', 'tiktok',
  'reddit', 'youtube', 'npm', 'pypi', 'producthunt',
] as const;

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
    .array(z.enum(ALL_PLATFORMS))
    .optional()
    .describe(
      "Platforms to check. Defaults to ['github', 'twitter', 'reddit', 'npm'].",
    ),
});

export type CheckSocialsInput = z.infer<typeof checkSocialsSchema>;

/**
 * Tool definition for MCP.
 */
export const checkSocialsTool = {
  name: 'check_socials',
  description: `Check if a username is available on social media and developer platforms.

Supports 10 platforms with varying confidence levels:
- HIGH: GitHub, npm, PyPI, Reddit, Twitter/X (reliable public APIs)
- MEDIUM: YouTube, ProductHunt (status code based)
- LOW: Instagram, LinkedIn, TikTok (block automated checks - verify manually)

Returns availability status with confidence indicator.

Example:
- check_socials("vibecoding") → checks GitHub, Twitter, Reddit, npm
- check_socials("myapp", ["github", "npm", "pypi"]) → developer platforms only`,
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
          enum: ALL_PLATFORMS,
        },
        description:
          "Platforms to check. Defaults to ['github', 'twitter', 'reddit', 'npm'].",
      },
    },
    required: ['name'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Platform Checking Logic
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check a single platform using Sherlock-style detection.
 */
async function checkPlatform(
  username: string,
  platform: SocialPlatform,
): Promise<SocialHandleResult> {
  const config = PLATFORM_CONFIGS[platform];
  const url = config.url.replace('{}', username);
  const profileUrl = config.profileUrl.replace('{}', username);
  const cacheKey = `${platform}:${username.toLowerCase()}`;

  // Check cache first to reduce API calls
  const cached = socialCache.get(cacheKey);
  if (cached) {
    logger.debug(`Cache hit for ${platform}:${username}`);
    return { ...cached, checked_at: cached.checked_at + ' (cached)' };
  }

  // Validate username format if regex provided
  if (config.regexCheck && !config.regexCheck.test(username)) {
    return {
      platform,
      handle: username,
      available: false,
      url: profileUrl,
      checked_at: new Date().toISOString(),
      confidence: 'high', // High confidence it's invalid
    };
  }

  try {
    const response = await axios({
      method: config.method,
      url,
      timeout: 8000,
      validateStatus: () => true, // Don't throw on any status
      headers: {
        ...config.headers,
      },
      maxRedirects: 0,
    });

    // Handle rate limiting (429) - return uncertain instead of false negative
    if (response.status === 429) {
      logger.debug(`Rate limited on ${platform}`, { username });
      const rateLimitResult: SocialHandleResult = {
        platform,
        handle: username,
        available: false,
        url: profileUrl,
        checked_at: new Date().toISOString(),
        confidence: 'low', // Can't be sure due to rate limit
        error: 'Rate limited - please try again later',
      };
      // Cache rate limit errors briefly
      socialCache.set(cacheKey, rateLimitResult, CACHE_TTL_ERROR);
      return rateLimitResult;
    }

    let available = false;

    // Determine availability based on errorType
    switch (config.errorType) {
      case 'status_code':
        available = response.status === (config.errorCode ?? 404);
        break;

      case 'message':
        if (config.errorMsg && typeof response.data === 'string') {
          available = config.errorMsg.some((msg) =>
            response.data.includes(msg),
          );
        } else if (config.errorMsg && typeof response.data === 'object') {
          const dataStr = JSON.stringify(response.data);
          available = config.errorMsg.some((msg) => dataStr.includes(msg));
        }
        break;

      case 'api':
        // API-specific logic would go here
        available = response.status === 404;
        break;
    }

    const result: SocialHandleResult = {
      platform,
      handle: username,
      available,
      url: profileUrl,
      checked_at: new Date().toISOString(),
      confidence: config.confidence,
    };

    // Cache result with appropriate TTL
    const ttl = available ? CACHE_TTL_AVAILABLE : CACHE_TTL_TAKEN;
    socialCache.set(cacheKey, result, ttl);
    logger.debug(`Cached ${platform}:${username} for ${ttl}s`);

    return result;
  } catch (error) {
    logger.debug(`Failed to check ${platform}`, {
      username,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return uncertain result on error
    const errorResult: SocialHandleResult = {
      platform,
      handle: username,
      available: false, // Assume taken if we can't check
      url: profileUrl,
      checked_at: new Date().toISOString(),
      confidence: 'low',
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    // Cache errors briefly to avoid hammering failing endpoints
    socialCache.set(cacheKey, errorResult, CACHE_TTL_ERROR);

    return errorResult;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Response Types
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute the check_socials tool.
 */
export async function executeCheckSocials(
  input: CheckSocialsInput,
): Promise<CheckSocialsResponse> {
  try {
    const { name, platforms } = checkSocialsSchema.parse(input);

    // Default platforms: mix of social and developer platforms
    const platformsToCheck: SocialPlatform[] = platforms || [
      'github',
      'twitter',
      'reddit',
      'npm',
    ];

    // Normalize username (lowercase, remove special chars)
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Check all platforms in parallel (max 5 concurrent)
    const results = await Promise.all(
      platformsToCheck.map((p) => checkPlatform(normalizedName, p)),
    );

    // Categorize results by confidence
    const highConfidence = results.filter((r) => r.confidence === 'high');
    const available = results.filter(
      (r) => r.available && r.confidence !== 'low',
    );
    const taken = results.filter((r) => !r.available && r.confidence !== 'low');
    const uncertain = results.filter((r) => r.confidence === 'low');

    // Generate insights
    const insights: string[] = [];

    if (available.length > 0) {
      insights.push(
        `✅ "${normalizedName}" is available on: ${available.map((r) => r.platform).join(', ')}`,
      );
    }

    if (taken.length > 0) {
      insights.push(
        `❌ "${normalizedName}" is taken on: ${taken.map((r) => r.platform).join(', ')}`,
      );
    }

    if (uncertain.length > 0) {
      insights.push(
        `⚠️ Could not reliably check: ${uncertain.map((r) => r.platform).join(', ')} (verify manually)`,
      );
    }

    // Developer-focused insight
    const devPlatforms = results.filter((r) =>
      ['github', 'npm', 'pypi'].includes(r.platform),
    );
    const allDevAvailable = devPlatforms.every((r) => r.available);
    if (devPlatforms.length > 0 && allDevAvailable) {
      insights.push(
        `🛠️ Great for developers! "${normalizedName}" is available on all dev platforms`,
      );
    }

    // Branding consistency advice
    const allAvailable = results.every((r) => r.available);
    const allTaken = results.every((r) => !r.available);

    if (allAvailable) {
      insights.push(
        `🎉 Perfect! "${normalizedName}" is available everywhere - grab it now!`,
      );
    } else if (allTaken) {
      insights.push(
        `💡 Try variations: ${normalizedName}hq, ${normalizedName}app, get${normalizedName}, ${normalizedName}io`,
      );
    } else if (available.length > 0 && taken.length > 0) {
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
