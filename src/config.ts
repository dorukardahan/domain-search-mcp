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
 * - localhost/loopback and private ranges (unless allowLocalhost is set)
 * - Link-local addresses (169.254.x)
 * - File URLs and other non-HTTP schemes
 * - Plain HTTP on public hosts (HTTPS required; loopback/private may use HTTP)
 *
 * @param url - URL to validate
 * @param allowLocalhost - Allow loopback/private hosts. Set for operator-configured
 *   backend endpoints (QWEN_INFERENCE_ENDPOINT, PRICING_API_BASE_URL,
 *   NEGATIVE_CACHE_URL) that commonly run on the same machine or LAN.
 */
function validateExternalUrl(
  url: string | undefined,
  allowLocalhost: boolean = false,
): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);

    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }

    const hostname = parsed.hostname.toLowerCase();

    // P1 FIX: Block suspicious hostname patterns (DNS rebinding mitigation)
    // Hostnames that look like they might resolve to internal IPs
    const suspiciousPatterns = [
      /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\./, // IP-like prefix
      /\.internal$/i,
      /\.local$/i,
      /\.localhost$/i,
      /\.corp$/i,
      /\.home$/i,
      /\.lan$/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(hostname)) {
        return undefined;
      }
    }

    // Block internal/private addresses
    const forbiddenHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];
    if (forbiddenHosts.includes(hostname) && !allowLocalhost) {
      return undefined;
    }

    // Block private network ranges (RFC1918 + link-local + IPv6 ULA/link-local).
    // Exception: when allowLocalhost is set, private ranges are permitted so
    // self-hosted LAN endpoints (e.g. 192.168.x) stay usable.
    const privateRanges = [
      /^10\./,                          // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,                     // 192.168.0.0/16
      /^169\.254\./,                     // Link-local
      /^fc00:/i,                         // IPv6 unique local
      /^fe80:/i,                         // IPv6 link-local
      /^fd[0-9a-f]{2}:/i,               // IPv6 unique local (fd00::/8)
    ];

    const isPrivate = privateRanges.some((range) => range.test(hostname));
    if (isPrivate && !allowLocalhost) {
      return undefined;
    }

    // P2 FIX: Require HTTPS for public hosts. Plain HTTP is allowed only for
    // loopback (localhost/127.0.0.1) and private/RFC1918 endpoints — e.g. a
    // self-hosted inference server at http://127.0.0.1:8070. Public hosts must
    // use HTTPS; there is no hardcoded HTTP allowlist.
    const isLoopback = forbiddenHosts.includes(hostname);
    if (parsed.protocol === 'http:' && !isLoopback && !isPrivate) {
      return undefined;
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

  // SECURITY: Validate external URLs to prevent SSRF.
  // allowLocalhost=true: the pricing backend is operator-configured and commonly
  // runs next to the MCP server (e.g. http://127.0.0.1:3003); public hosts still
  // require HTTPS to pass validation.
  const pricingApiUrl = validateExternalUrl(env.PRICING_API_BASE_URL, true);

  // Qwen inference endpoint - opt-in only, from QWEN_INFERENCE_ENDPOINT.
  // No default endpoint: AI suggestions require the user to point at their own
  // inference server. allowLocalhost=true so loopback/private (RFC1918) hosts are
  // usable for self-hosted setups; public hosts must use HTTPS to pass validation.
  const qwenEndpoint = validateExternalUrl(env.QWEN_INFERENCE_ENDPOINT, true);
  const hasPricingApi = !!pricingApiUrl;
  const hasQwen = !!qwenEndpoint;

  // Together.ai cloud inference (deprecated - kept for backward compatibility)
  const hasTogetherAi = !!env.TOGETHER_API_KEY;

  // SECURITY: Validate negative cache URL to prevent SSRF.
  // allowLocalhost=true for the same self-hosted reason as the pricing backend.
  const negativeCacheUrl = validateExternalUrl(env.NEGATIVE_CACHE_URL, true);
  const hasNegativeCache = parseBool(env.NEGATIVE_CACHE_ENABLED, false) && !!negativeCacheUrl;

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
      concurrency: parseIntWithDefault(env.PRICING_API_CONCURRENCY, 8),
      token: env.PRICING_API_TOKEN,
    },
    qwenInference: {
      endpoint: qwenEndpoint, // SSRF-validated URL
      apiKey: env.QWEN_API_KEY,
      enabled: hasQwen,
      timeoutMs: parseIntWithDefault(env.QWEN_TIMEOUT_MS, 15000),
      maxRetries: parseIntWithDefault(env.QWEN_MAX_RETRIES, 2),
    },
    togetherAi: {
      apiKey: env.TOGETHER_API_KEY,
      enabled: hasTogetherAi,
      timeoutMs: parseIntWithDefault(env.TOGETHER_TIMEOUT_MS, 30000),
      maxRetries: parseIntWithDefault(env.TOGETHER_MAX_RETRIES, 2),
      defaultModel: env.TOGETHER_DEFAULT_MODEL || 'qwen3-14b-instruct',
    },
    // OpenRouter removed - using our VPS for zero-config AI suggestions
    logLevel: (env.LOG_LEVEL as Config['logLevel']) || 'info',
    cache: {
      availabilityTtl: parseIntWithDefault(env.CACHE_TTL_AVAILABILITY, 60),
      pricingTtl: parseIntWithDefault(env.CACHE_TTL_PRICING, 3600),
      sedoTtl: parseIntWithDefault(env.CACHE_TTL_SEDO, 3600),
      redisUrl: env.REDIS_URL, // Optional: redis://[:password@]host:port
    },
    rateLimitPerMinute: parseIntWithDefault(env.RATE_LIMIT_PER_MINUTE, 60),
    bulkConcurrency: parseIntWithDefault(env.BULK_CONCURRENCY, 5),
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
    negativeCache: {
      enabled: hasNegativeCache,
      baseUrl: negativeCacheUrl, // SSRF-validated URL
      token: env.NEGATIVE_CACHE_TOKEN,
      timeoutMs: parseIntWithDefault(env.NEGATIVE_CACHE_TIMEOUT_MS, 2000),
      reportBatchSize: parseIntWithDefault(env.NEGATIVE_CACHE_BATCH_SIZE, 50),
      reportDebounceMs: parseIntWithDefault(env.NEGATIVE_CACHE_DEBOUNCE_MS, 5000),
      localCacheTtl: parseIntWithDefault(env.NEGATIVE_CACHE_LOCAL_TTL, 3600),
      concurrency: parseIntWithDefault(env.NEGATIVE_CACHE_CONCURRENCY, 2),
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
  if (config.negativeCache.enabled) sources.push('negative_cache');
  if (config.qwenInference?.enabled) sources.push('qwen_inference'); // AI suggestions (opt-in via QWEN_INFERENCE_ENDPOINT)
  if (config.togetherAi?.enabled) sources.push('together_ai'); // Deprecated BYOK
  if (config.pricingApi.enabled) sources.push('pricing_api');
  if (config.porkbun.enabled) sources.push('porkbun');
  if (config.namecheap.enabled) sources.push('namecheap');
  sources.push('rdap', 'whois'); // Always available as fallbacks
  return sources;
}
