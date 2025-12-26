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

  /** Any restrictions on this TLD (e.g., "Requires ID verification") */
  tld_restrictions?: string[];

  /** Quality score 0-10 (factors: price, privacy, renewal) */
  score?: number;
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
  | 'cache';

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
  | 'tiktok';

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
    enabled: boolean;
  };

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Cache TTLs in seconds
  cache: {
    availabilityTtl: number;
    pricingTtl: number;
  };

  // Rate limiting
  rateLimitPerMinute: number;

  // TLD restrictions
  allowedTlds: string[];
  denyTlds: string[];

  // Development
  dryRun: boolean;
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
