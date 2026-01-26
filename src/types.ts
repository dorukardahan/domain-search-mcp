/**
 * Domain Search MCP - Core Type Definitions
 *
 * These types define the data structures used throughout the MCP server.
 * They're designed for clarity and self-documentation.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete information about a domain's availability and pricing.
 * This is the primary output type for domain searches.
 */
export interface DomainResult {
  /** Full domain name including TLD (e.g., "vibecoding.com") */
  domain: string;

  /** Whether the domain is available for registration */
  available: boolean;

  /** Is this a premium/reserved domain with special pricing? */
  premium: boolean;

  /** First year registration price in the specified currency */
  price_first_year: number | null;

  /** Annual renewal price after first year */
  price_renewal: number | null;

  /** Link to verify pricing at the registrar checkout/search page */
  price_check_url?: string;

  /** Notes about pricing accuracy or verification */
  price_note?: string;

  /** Where pricing data came from (if any) */
  pricing_source?: PricingSource;

  /** Pricing fetch status for backend/catalog quotes */
  pricing_status?: PricingStatus;

  /** Currency code (e.g., "USD", "EUR") */
  currency: string;

  /** Is WHOIS privacy protection included for free? */
  privacy_included: boolean;

  /** Cost to transfer domain to this registrar */
  transfer_price: number | null;

  /** Registrar name (e.g., "porkbun", "namecheap") */
  registrar: string;

  /** Data source used for this result */
  source: DataSource;

  /** ISO 8601 timestamp of when this was checked */
  checked_at: string;

  /** If premium, explains why (e.g., "Popular keyword") */
  premium_reason?: string;

  /** Aftermarket or auction details when detected */
  aftermarket?: {
    type: 'auction' | 'aftermarket' | 'premium';
    price: number | null;
    currency: string | null;
    source: string;
    url?: string;
    note?: string;
  };

  /** Any restrictions on this TLD (e.g., "Requires ID verification") */
  tld_restrictions?: string[];

  /** Quality score 0-10 (factors: price, privacy, renewal) */
  score?: number;

  /** Domain registration date (ISO 8601) - for taken domains */
  registered_at?: string;

  /** Domain expiration date (ISO 8601) - for taken domains */
  expires_at?: string;

  /** Days until expiration (calculated) */
  days_until_expiration?: number;
}

/**
 * Where the domain data came from.
 * Order matters: earlier sources are preferred.
 */
export type DataSource =
  | 'porkbun_api'
  | 'namecheap_api'
  | 'godaddy_api'
  | 'rdap'
  | 'whois'
  | 'pricing_api'
  | 'catalog'
  | 'cache';

/**
 * Pricing data origin (can differ from availability source).
 */
export type PricingSource =
  | 'porkbun_api'
  | 'namecheap_api'
  | 'pricing_api'
  | 'catalog';

/**
 * Pricing status returned by the backend.
 */
export type PricingStatus =
  | 'ok'
  | 'partial'
  | 'not_configured'
  | 'error'
  | 'catalog_only'
  | 'not_available';

/**
 * Complete response from a domain search operation.
 * Includes results plus human-readable insights.
 */
export interface SearchResponse {
  /** Array of domain results */
  results: DomainResult[];

  /** Human-readable insights about the results */
  insights: string[];

  /** Suggested next actions */
  next_steps: string[];

  /** Was this served from cache? */
  from_cache: boolean;

  /** Total time taken in milliseconds */
  duration_ms: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TLD INFORMATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Information about a Top Level Domain (TLD).
 */
export interface TLDInfo {
  /** The TLD extension without dot (e.g., "com", "io") */
  tld: string;

  /** Human-readable description */
  description: string;

  /** Typical use case */
  typical_use: string;

  /** Price range for first year registration */
  price_range: {
    min: number;
    max: number;
    currency: string;
  };

  /** Typical renewal price */
  renewal_price_typical: number;

  /** Are there special restrictions? */
  restrictions: string[];

  /** Is this TLD popular/recommended? */
  popularity: 'high' | 'medium' | 'low';

  /** Category of the TLD */
  category: 'generic' | 'country' | 'sponsored' | 'new';
}

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL HANDLE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Platforms supported for social handle checking.
 */
export type SocialPlatform =
  | 'github'
  | 'twitter'
  | 'instagram'
  | 'linkedin'
  | 'tiktok'
  | 'reddit'
  | 'youtube'
  | 'npm'
  | 'pypi'
  | 'producthunt';

/**
 * Result of checking a social handle.
 */
export interface SocialHandleResult {
  platform: SocialPlatform;
  handle: string;
  available: boolean;
  url: string;
  checked_at: string;
  /** Some platforms can't be reliably checked */
  confidence: 'high' | 'medium' | 'low';
  /** Error message if check failed (rate limit, timeout, etc.) */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRAR COMPARISON TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Comparison result across multiple registrars.
 */
export interface RegistrarComparison {
  domain: string;
  comparisons: DomainResult[];
  best_first_year: {
    registrar: string;
    price: number;
    currency: string;
  } | null;
  best_renewal: {
    registrar: string;
    price: number;
    currency: string;
  } | null;
  recommendation: string;
  checked_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Server configuration loaded from environment variables.
 */
export interface Config {
  // API Keys (optional - server works without them)
  porkbun: {
    apiKey?: string;
    apiSecret?: string;
    enabled: boolean;
  };
  namecheap: {
    apiKey?: string;
    apiUser?: string;
    clientIp?: string;
    enabled: boolean;
  };

  pricingApi: {
    baseUrl?: string;
    enabled: boolean;
    timeoutMs: number;
    maxQuotesPerSearch: number;
    maxQuotesPerBulk: number;
    concurrency: number;
    token?: string;
  };

  // Qwen inference (optional local AI-powered suggestions via llama.cpp)
  qwenInference?: {
    endpoint?: string;
    apiKey?: string;
    enabled: boolean;
    timeoutMs: number;
    maxRetries: number;
  };

  // Together.ai inference (deprecated - kept for backward compatibility)
  togetherAi?: {
    apiKey?: string;
    enabled: boolean;
    timeoutMs: number;
    maxRetries: number;
    /** Default model (e.g., 'qwen3-14b-instruct', 'qwen2.5-72b') */
    defaultModel?: string;
  };

  // OpenRouter removed - using VPS inference for zero-config experience

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Cache TTLs in seconds
  cache: {
    availabilityTtl: number;
    pricingTtl: number;
    sedoTtl: number;
    /** Optional Redis URL for distributed caching (redis://[:password@]host:port) */
    redisUrl?: string;
  };

  // Rate limiting
  rateLimitPerMinute: number;

  // TLD restrictions
  allowedTlds: string[];
  denyTlds: string[];

  // Development
  dryRun: boolean;

  // Output format for tool results
  outputFormat: 'table' | 'json' | 'both';

  // Aftermarket data sources
  aftermarket: {
    sedoEnabled: boolean;
    sedoFeedUrl: string;
    nsEnabled: boolean;
    nsCacheTtl: number;
    nsTimeoutMs: number;
  };

  // Federated negative cache (taken domains)
  negativeCache: {
    /** Enable federated cache reporting and querying */
    enabled: boolean;
    /** Backend API base URL (SSRF-validated) */
    baseUrl?: string;
    /** Bearer token for API authentication */
    token?: string;
    /** Request timeout in milliseconds */
    timeoutMs: number;
    /** Batch size for reporting taken domains */
    reportBatchSize: number;
    /** Debounce time for batching reports (ms) */
    reportDebounceMs: number;
    /** Local query cache TTL in seconds */
    localCacheTtl: number;
    /** Max concurrent API requests */
    concurrency: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured error with user-friendly message.
 */
export interface DomainError {
  code: string;
  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  suggestedAction?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchDomainInput {
  domain_name: string;
  tlds?: string[];
  registrars?: string[];
}

export interface BulkSearchInput {
  domains: string[];
  tld: string;
  registrar?: string;
}

export interface CompareRegistrarsInput {
  domain: string;
  tld: string;
  registrars?: string[];
}

export interface SuggestDomainsInput {
  base_name: string;
  tld?: string;
  variants?: ('hyphen' | 'numbers' | 'abbreviations' | 'synonyms')[];
  max_suggestions?: number;
}

export interface TldInfoInput {
  tld: string;
  detailed?: boolean;
}

export interface CheckSocialsInput {
  name: string;
  platforms?: SocialPlatform[];
}
