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

/**
 * Load and validate configuration from environment.
 */
export function loadConfig(): Config {
  const env = process.env;

  // Check for API keys
  const hasPorkbun = !!(env.PORKBUN_API_KEY && env.PORKBUN_API_SECRET);
  const hasNamecheap = !!(env.NAMECHEAP_API_KEY && env.NAMECHEAP_API_USER);
  const hasPricingApi = !!env.PRICING_API_BASE_URL;

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
      baseUrl: env.PRICING_API_BASE_URL,
      enabled: hasPricingApi,
      timeoutMs: parseIntWithDefault(env.PRICING_API_TIMEOUT_MS, 2500),
      maxQuotesPerSearch: parseIntWithDefault(env.PRICING_API_MAX_QUOTES_SEARCH, 0),
      maxQuotesPerBulk: parseIntWithDefault(env.PRICING_API_MAX_QUOTES_BULK, 0),
      concurrency: parseIntWithDefault(env.PRICING_API_CONCURRENCY, 4),
      token: env.PRICING_API_TOKEN,
    },
    logLevel: (env.LOG_LEVEL as Config['logLevel']) || 'info',
    cache: {
      availabilityTtl: parseIntWithDefault(env.CACHE_TTL_AVAILABILITY, 60),
      pricingTtl: parseIntWithDefault(env.CACHE_TTL_PRICING, 3600),
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
  if (config.pricingApi.enabled) sources.push('pricing_api');
  if (config.porkbun.enabled) sources.push('porkbun');
  if (config.namecheap.enabled) sources.push('namecheap');
  sources.push('rdap', 'whois'); // Always available as fallbacks
  sources.push('godaddy_signal'); // GoDaddy public endpoint for premium/auction signals
  return sources;
}
