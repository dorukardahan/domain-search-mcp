/**
 * Configuration loader for Domain Search MCP.
 *
 * Loads environment variables with sensible defaults.
 * The server works without any API keys (falls back to RDAP/WHOIS).
 */

import { config as loadDotenv } from 'dotenv';
import type { Config } from './types.js';

// Load .env file if present
loadDotenv();

/**
 * Parse a comma-separated string into an array.
 */
function parseList(value: string | undefined, defaults: string[]): string[] {
  if (!value) return defaults;
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Parse an integer with a fallback default.
 */
function parseIntWithDefault(
  value: string | undefined,
  defaultValue: number,
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a boolean from environment variable.
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseOutputFormat(
  value: string | undefined,
): Config['outputFormat'] {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'json' || normalized === 'both' || normalized === 'table') {
    return normalized;
  }
  return 'table';
}

/**
 * SECURITY: Validate external URLs to prevent SSRF attacks.
 *
 * Blocks:
 * - localhost and loopback addresses
 * - Private network ranges (10.x, 172.16-31.x, 192.168.x)
 * - Link-local addresses (169.254.x)
 * - File URLs and other non-HTTP schemes
 *
 * Only allows HTTPS URLs to external hosts.
 */
function validateExternalUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);

    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }

    // Block internal/private addresses
    const hostname = parsed.hostname.toLowerCase();
    const forbiddenHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    if (forbiddenHosts.includes(hostname)) {
      return undefined;
    }

    // Block private network ranges
    const privateRanges = [
      /^10\./,                          // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,                     // 192.168.0.0/16
      /^169\.254\./,                     // Link-local
      /^fc00:/i,                         // IPv6 unique local
      /^fe80:/i,                         // IPv6 link-local
    ];

    for (const range of privateRanges) {
      if (range.test(hostname)) {
        return undefined;
      }
    }

    return url;
  } catch {
    // Invalid URL
    return undefined;
  }
}

/**
 * Load and validate configuration from environment.
 */
export function loadConfig(): Config {
  const env = process.env;

  // Check for API keys
  const hasPorkbun = !!(env.PORKBUN_API_KEY && env.PORKBUN_API_SECRET);
  const hasNamecheap = !!(env.NAMECHEAP_API_KEY && env.NAMECHEAP_API_USER);

  // SECURITY: Validate external URLs to prevent SSRF
  const pricingApiUrl = validateExternalUrl(env.PRICING_API_BASE_URL);
  const qwenEndpoint = validateExternalUrl(env.QWEN_INFERENCE_ENDPOINT);
  const hasPricingApi = !!pricingApiUrl;
  const hasQwen = !!qwenEndpoint;

  const config: Config = {
    porkbun: {
      apiKey: env.PORKBUN_API_KEY,
      apiSecret: env.PORKBUN_API_SECRET,
      enabled: hasPorkbun,
    },
    namecheap: {
      apiKey: env.NAMECHEAP_API_KEY,
      apiUser: env.NAMECHEAP_API_USER,
      clientIp: env.NAMECHEAP_CLIENT_IP,
      enabled: hasNamecheap,
    },
    pricingApi: {
      baseUrl: pricingApiUrl, // SSRF-validated URL
      enabled: hasPricingApi,
      timeoutMs: parseIntWithDefault(env.PRICING_API_TIMEOUT_MS, 2500),
      maxQuotesPerSearch: parseIntWithDefault(env.PRICING_API_MAX_QUOTES_SEARCH, 0),
      maxQuotesPerBulk: parseIntWithDefault(env.PRICING_API_MAX_QUOTES_BULK, 0),
      concurrency: parseIntWithDefault(env.PRICING_API_CONCURRENCY, 4),
      token: env.PRICING_API_TOKEN,
    },
    qwenInference: {
      endpoint: qwenEndpoint, // SSRF-validated URL
      apiKey: env.QWEN_API_KEY,
      enabled: hasQwen,
      timeoutMs: parseIntWithDefault(env.QWEN_TIMEOUT_MS, 15000),
      maxRetries: parseIntWithDefault(env.QWEN_MAX_RETRIES, 2),
    },
    logLevel: (env.LOG_LEVEL as Config['logLevel']) || 'info',
    cache: {
      availabilityTtl: parseIntWithDefault(env.CACHE_TTL_AVAILABILITY, 60),
      pricingTtl: parseIntWithDefault(env.CACHE_TTL_PRICING, 3600),
      sedoTtl: parseIntWithDefault(env.CACHE_TTL_SEDO, 3600),
    },
    rateLimitPerMinute: parseIntWithDefault(env.RATE_LIMIT_PER_MINUTE, 60),
    allowedTlds: parseList(env.ALLOWED_TLDS, [
      'com',
      'io',
      'dev',
      'app',
      'co',
      'net',
      'org',
      'xyz',
      'ai',
      'sh',
      'me',
      'cc',
    ]),
    denyTlds: parseList(env.DENY_TLDS, [
      'localhost',
      'internal',
      'test',
      'local',
    ]),
    dryRun: parseBool(env.DRY_RUN, false),
    outputFormat: parseOutputFormat(env.OUTPUT_FORMAT),
    aftermarket: {
      sedoEnabled: parseBool(env.SEDO_FEED_ENABLED, true),
      sedoFeedUrl:
        env.SEDO_FEED_URL || 'https://sedo.com/txt/auctions_us.txt',
      nsEnabled: parseBool(env.AFTERMARKET_NS_ENABLED, true),
      nsCacheTtl: parseIntWithDefault(
        env.CACHE_TTL_AFTERMARKET_NS,
        parseIntWithDefault(env.CACHE_TTL_AVAILABILITY, 60),
      ),
      nsTimeoutMs: parseIntWithDefault(env.AFTERMARKET_NS_TIMEOUT_MS, 1500),
    },
  };

  return config;
}

/**
 * Global config instance.
 * Loaded once at startup.
 */
export const config = loadConfig();

/**
 * Check if any registrar APIs are configured.
 */
export function hasRegistrarApi(): boolean {
  return config.pricingApi.enabled || config.porkbun.enabled || config.namecheap.enabled;
}

/**
 * Get a summary of available data sources.
 */
export function getAvailableSources(): string[] {
  const sources: string[] = [];
  if (config.qwenInference?.enabled) sources.push('qwen_inference');
  if (config.pricingApi.enabled) sources.push('pricing_api');
  if (config.porkbun.enabled) sources.push('porkbun');
  if (config.namecheap.enabled) sources.push('namecheap');
  sources.push('rdap', 'whois'); // Always available as fallbacks
  sources.push('godaddy_signal'); // GoDaddy public endpoint for premium/auction signals
  return sources;
}
