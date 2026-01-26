/**
 * GoDaddy Public Endpoint Adapter.
 *
 * Uses GoDaddy's public endpoint for domain availability checks.
 * No API key or reseller account required!
 *
 * Endpoint: https://api.godaddy.com/v1/domains/mcp
 * Protocol: JSON-RPC 2.0 over HTTP (SSE response)
 *
 * Features:
 * - Free availability checking (no auth)
 * - Bulk checking up to 1000 domains
 * - Premium/auction domain detection
 * - Domain name suggestions (domains_suggest tool)
 *
 * Limitations:
 * - No pricing information (use with pricing-api backend)
 * - Conservative rate limit (30 req/min, undocumented by GoDaddy)
 *
 * Integration:
 * - Positioned after RDAP in source chain (RDAP → GoDaddy → WHOIS)
 * - Provides premium/auction detection that RDAP lacks
 * - Circuit breaker protected for resilience
 */

import { z } from 'zod';
import { RegistrarAdapter } from './base.js';
import type { DomainResult, TLDInfo } from '../types.js';
import { logger } from '../utils/logger.js';
import { RegistrarApiError } from '../utils/errors.js';
import { CircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';

/**
 * GoDaddy public endpoint.
 */
const GODADDY_PUBLIC_ENDPOINT = 'https://api.godaddy.com/v1/domains/mcp';

/**
 * Timeout for GoDaddy requests (ms).
 * Increased from 900ms to 5000ms to match other adapters and handle slow responses.
 */
const GODADDY_TIMEOUT_MS = 5000;

/**
 * Circuit breaker for GoDaddy endpoint.
 * Opens after 5 failures within 60s, resets after 30s cooldown.
 */
const godaddyCircuitBreaker = new CircuitBreaker({
  name: 'godaddy-public',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  failureWindowMs: 60_000,
  successThreshold: 2,
});

/**
 * JSON-RPC request ID counter.
 */
let jsonRpcId = 1;

/**
 * Response schema for GoDaddy JSON-RPC tool call.
 */
const GoDaddyRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number(),
  result: z.object({
    content: z.array(z.object({
      type: z.string(),
      text: z.string(),
    })),
    isError: z.boolean().optional(),
  }).optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
  }).optional(),
});

/**
 * Parse availability from GoDaddy public endpoint text response.
 * The response is markdown-formatted text with different formats for single vs bulk queries.
 */
export interface ParsedAvailability {
  available: boolean;
  premium: boolean;
  auction: boolean;
}

/**
 * Parsed suggestion from GoDaddy's domains_suggest response.
 */
export interface GodaddySuggestion {
  domain: string;
  available: boolean;
  premium: boolean;
  auction: boolean;
}

/**
 * Parse suggestions from GoDaddy public domains_suggest response.
 * Response format varies but typically includes categorized domain lists.
 */
export function parseSuggestResponse(text: string): GodaddySuggestion[] {
  const suggestions: GodaddySuggestion[] = [];
  const seenDomains = new Set<string>();

  // Helper to add a suggestion without duplicates
  const addSuggestion = (domain: string, available: boolean, premium: boolean, auction: boolean) => {
    const normalized = domain.toLowerCase().trim();
    // Validate it looks like a domain (has at least one dot)
    if (normalized.includes('.') && !seenDomains.has(normalized)) {
      seenDomains.add(normalized);
      suggestions.push({ domain: normalized, available, premium, auction });
    }
  };

  // ==== SECTION-BASED PARSING ====
  // GoDaddy groups suggestions by category with emojis

  // ✅ Available/Standard domains
  const availableMatch = text.match(/✅\s*\*\*(?:AVAILABLE|STANDARD)[^]*?(?=(?:💎|🔨|⚠️|❌|\*\*[A-Z])|$)/gi);
  if (availableMatch) {
    for (const section of availableMatch) {
      // Extract domain names (word.tld format)
      const domainMatches = section.match(/\b[a-z0-9][-a-z0-9]*\.[a-z]{2,}\b/gi);
      if (domainMatches) {
        for (const domain of domainMatches) {
          addSuggestion(domain, true, false, false);
        }
      }
    }
  }

  // 💎 Premium domains
  const premiumMatch = text.match(/💎\s*\*\*PREMIUM[^]*?(?=(?:✅|🔨|⚠️|❌|\*\*[A-Z])|$)/gi);
  if (premiumMatch) {
    for (const section of premiumMatch) {
      const domainMatches = section.match(/\b[a-z0-9][-a-z0-9]*\.[a-z]{2,}\b/gi);
      if (domainMatches) {
        for (const domain of domainMatches) {
          addSuggestion(domain, true, true, false);
        }
      }
    }
  }

  // 🔨 Auction domains
  const auctionMatch = text.match(/🔨\s*\*\*AUCTION[^]*?(?=(?:✅|💎|⚠️|❌|\*\*[A-Z])|$)/gi);
  if (auctionMatch) {
    for (const section of auctionMatch) {
      const domainMatches = section.match(/\b[a-z0-9][-a-z0-9]*\.[a-z]{2,}\b/gi);
      if (domainMatches) {
        for (const domain of domainMatches) {
          addSuggestion(domain, true, false, true);
        }
      }
    }
  }

  // ==== FALLBACK: Line-by-line extraction ====
  // If section parsing didn't find much, try line-by-line
  if (suggestions.length < 3) {
    const lines = text.split('\n');
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Skip header lines
      if (lowerLine.includes('**') && !lowerLine.includes('.')) continue;

      // Extract any domain-like patterns
      const domainMatches = line.match(/\b[a-z0-9][-a-z0-9]*\.[a-z]{2,}\b/gi);
      if (domainMatches) {
        for (const domain of domainMatches) {
          // Determine type from context
          const isPremium = lowerLine.includes('premium') || lowerLine.includes('💎');
          const isAuction = lowerLine.includes('auction') || lowerLine.includes('🔨');
          const isUnavailable = lowerLine.includes('❌') || lowerLine.includes('unavailable');

          addSuggestion(domain, !isUnavailable, isPremium, isAuction);
        }
      }
    }
  }

  return suggestions;
}

export function parseAvailabilityResponse(text: string, domain: string): ParsedAvailability {
  const normalizedDomain = domain.toLowerCase();
  const normalizedText = text.toLowerCase();

  // Default: unavailable
  const result: ParsedAvailability = {
    available: false,
    premium: false,
    auction: false,
  };

  // ==== SINGLE DOMAIN FORMAT ====
  // Format: "STATUS: ✅ AVAILABLE" or "AVAILABILITY: Standard registration available"
  if (normalizedText.includes('status:') || normalizedText.includes('availability:')) {
    // Check for explicit availability indicators
    if (
      normalizedText.includes('status: ✅ available') ||
      normalizedText.includes('✅ available') ||
      normalizedText.includes('standard registration available') ||
      normalizedText.includes('purchasable: yes')
    ) {
      result.available = true;

      // Check if premium
      if (normalizedText.includes('type: premium') || normalizedText.includes('premium domain')) {
        result.premium = true;
      }
      // Check if auction
      if (normalizedText.includes('type: auction') || normalizedText.includes('auction domain')) {
        result.auction = true;
      }
      return result;
    }

    // Explicit unavailable
    if (
      normalizedText.includes('status: ❌') ||
      normalizedText.includes('not available') ||
      normalizedText.includes('already registered') ||
      normalizedText.includes('purchasable: no')
    ) {
      result.available = false;
      return result;
    }
  }

  // ==== BULK DOMAIN FORMAT ====
  // Check if domain appears in available section
  // GoDaddy formats: "✅ **AVAILABLE DOMAINS" or "✅ **STANDARD SUGGESTIONS"
  const availableMatch = text.match(/✅\s*\*\*(?:AVAILABLE|STANDARD)[^]*?(?=(?:💎|⚠️|❌|\*\*[A-Z])|$)/i);
  if (availableMatch && availableMatch[0].toLowerCase().includes(normalizedDomain)) {
    result.available = true;
    return result;
  }

  // Check premium section
  // GoDaddy format: "💎 **PREMIUM DOMAINS"
  const premiumMatch = text.match(/💎\s*\*\*PREMIUM[^]*?(?=(?:⚠️|❌|\*\*[A-Z])|$)/i);
  if (premiumMatch && premiumMatch[0].toLowerCase().includes(normalizedDomain)) {
    result.available = true;
    result.premium = true;
    return result;
  }

  // Check auction section
  // GoDaddy format: "🔨 **AUCTION DOMAINS" or similar
  const auctionMatch = text.match(/🔨\s*\*\*AUCTION[^]*?(?=(?:💎|⚠️|❌|\*\*[A-Z])|$)/i);
  if (auctionMatch && auctionMatch[0].toLowerCase().includes(normalizedDomain)) {
    result.available = true;
    result.auction = true;
    return result;
  }

  // Check unavailable section
  // GoDaddy format: "❌ **UNAVAILABLE DOMAINS"
  const unavailableMatch = text.match(/❌\s*\*\*UNAVAILABLE[^]*?(?=(?:💎|⚠️|\*\*[A-Z])|$)/i);
  if (unavailableMatch && unavailableMatch[0].toLowerCase().includes(normalizedDomain)) {
    result.available = false;
    return result;
  }

  // ==== FALLBACK: LINE-BY-LINE ANALYSIS ====
  const lines = text.split('\n');
  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Check for domain-specific lines or general status
    if (lowerLine.includes(normalizedDomain) || lowerLine.includes('status') || lowerLine.includes('available')) {
      // Premium indicators
      if (lowerLine.includes('premium')) {
        result.available = true;
        result.premium = true;
        return result;
      }
      // Auction indicators
      if (lowerLine.includes('auction')) {
        result.available = true;
        result.auction = true;
        return result;
      }
      // Available indicators (must check before unavailable since "unavailable" contains "available")
      if (
        (lowerLine.includes('✅') && lowerLine.includes('available')) ||
        lowerLine.includes('register at') ||
        lowerLine.includes('can be registered')
      ) {
        result.available = true;
        return result;
      }
      // Unavailable indicators
      if (lowerLine.includes('❌') || lowerLine.includes('unavailable') || lowerLine.includes('not available')) {
        result.available = false;
        return result;
      }
    }
  }

  return result;
}

/**
 * GoDaddy public endpoint adapter.
 *
 * Uses GoDaddy's public endpoint - no authentication required!
 * Provides premium/auction detection that RDAP lacks.
 *
 * Rate limit: 30 req/min (conservative, undocumented by GoDaddy)
 * Timeout: 5000ms
 * Circuit breaker: Opens after 5 failures, resets after 30s
 */
export class GodaddyPublicAdapter extends RegistrarAdapter {
  readonly name = 'GoDaddy';
  readonly id = 'godaddy';

  /**
   * Override base class timeout to use our constant.
   */
  protected override readonly timeoutMs = GODADDY_TIMEOUT_MS;

  constructor() {
    // Conservative rate limit - GoDaddy doesn't document their limits
    // Using 30/min to be safe (they say "excessive requests may be throttled")
    super(30);
  }

  /**
   * Check if GoDaddy public endpoint is enabled.
   * Always enabled since no API key needed!
   *
   * Note: Will return false if circuit breaker is open (temporary).
   */
  isEnabled(): boolean {
    // Check if circuit breaker allows requests
    return godaddyCircuitBreaker.isAllowingRequests();
  }

  /**
   * Search for domain availability using GoDaddy public endpoint.
   */
  async search(domain: string, tld: string): Promise<DomainResult> {
    const fullDomain = `${domain}.${tld}`;

    return this.retryWithBackoff(async () => {
      const text = await this.callPublicTool('domains_check_availability', {
        domains: fullDomain,
      });

      const parsed = parseAvailabilityResponse(text, fullDomain);

      return this.createResult(domain, tld, {
        available: parsed.available,
        premium: parsed.premium,
        price_first_year: null, // GoDaddy public endpoint doesn't provide pricing
        price_renewal: null,
        privacy_included: false, // Unknown
        source: 'godaddy_api',
        premium_reason: parsed.premium
          ? 'Premium domain (GoDaddy)'
          : parsed.auction
          ? 'Auction domain (GoDaddy)'
          : undefined,
      });
    }, `check ${fullDomain}`);
  }

  /**
   * Bulk check multiple domains at once.
   * GoDaddy public endpoint supports up to 1000 domains per request.
   */
  async bulkSearch(domains: string[]): Promise<Map<string, ParsedAvailability>> {
    const results = new Map<string, ParsedAvailability>();

    // GoDaddy accepts comma-separated domains
    const domainList = domains.join(', ');

    const text = await this.retryWithBackoff(async () => {
      return this.callPublicTool('domains_check_availability', {
        domains: domainList,
      });
    }, `bulk check (${domains.length} domains)`);

    // Parse results for each domain
    for (const domain of domains) {
      const parsed = parseAvailabilityResponse(text, domain);
      results.set(domain.toLowerCase(), parsed);
    }

    return results;
  }

  /**
   * Get TLD info - not supported by GoDaddy public endpoint.
   */
  async getTldInfo(_tld: string): Promise<TLDInfo | null> {
    return null;
  }

  /**
   * Get domain suggestions from GoDaddy public endpoint.
   * Uses their domains_suggest tool for suggestion results.
   *
   * @param query - Keywords or business description (e.g., "sustainable fashion")
   * @param options - Optional parameters for suggestion customization
   * @returns Array of suggested domains with availability info
   */
  async suggestDomains(
    query: string,
    options: {
      tlds?: string[];
      limit?: number;
    } = {},
  ): Promise<GodaddySuggestion[]> {
    const { tlds, limit = 50 } = options;

    return this.retryWithBackoff(async () => {
      // Build the query - GoDaddy accepts natural language
      let fullQuery = query;
      if (tlds && tlds.length > 0) {
        fullQuery = `${query} (prefer .${tlds.join(', .')})`;
      }

      const text = await this.callPublicTool('domains_suggest', {
        query: fullQuery,
      });

      logger.debug('GoDaddy domains_suggest raw response', {
        query: fullQuery,
        response_length: text.length,
        preview: text.substring(0, 500),
      });

      const suggestions = parseSuggestResponse(text);

      // Filter by TLD if specified
      let filtered = suggestions;
      if (tlds && tlds.length > 0) {
        const tldSet = new Set(tlds.map(t => t.toLowerCase()));
        filtered = suggestions.filter(s => {
          const parts = s.domain.split('.');
          const tld = parts[parts.length - 1];
          return tld && tldSet.has(tld);
        });
      }

      // Limit results
      return filtered.slice(0, limit);
    }, `suggest domains for "${query}"`);
  }

  /**
   * Call a GoDaddy public JSON-RPC tool.
   *
   * Wrapped with circuit breaker for resilience against GoDaddy outages.
   */
  private async callPublicTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const requestId = jsonRpcId++;

    const payload = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
      id: requestId,
    };

    logger.debug('GoDaddy public request', {
      tool: toolName,
      args,
      request_id: requestId,
    });

    // Wrap the actual API call with circuit breaker
    return godaddyCircuitBreaker.execute(async () => {
      const response = await this.withTimeout(
        fetch(GODADDY_PUBLIC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          },
          body: JSON.stringify(payload),
        }),
        `GoDaddy public ${toolName}`,
        GODADDY_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new RegistrarApiError(
          'GoDaddy',
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      // Response is SSE format: "event: message\ndata: {...}"
      const rawText = await response.text();

      // Extract JSON from SSE format
      const dataMatch = rawText.match(/data:\s*(\{.*\})/s);
      if (!dataMatch) {
        throw new RegistrarApiError(
          'GoDaddy',
          'Invalid response format - expected SSE',
        );
      }

      const jsonStr = dataMatch[1];
      const parsed = JSON.parse(jsonStr!);

      // Validate response
      const validated = GoDaddyRpcResponseSchema.parse(parsed);

      if (validated.error) {
        throw new RegistrarApiError(
          'GoDaddy',
          `RPC Error ${validated.error.code}: ${validated.error.message}`,
        );
      }

      if (!validated.result || validated.result.isError) {
        throw new RegistrarApiError(
          'GoDaddy',
          'Tool call returned error',
        );
      }

      // Extract text content
      const textContent = validated.result.content.find(c => c.type === 'text');
      if (!textContent) {
        throw new RegistrarApiError(
          'GoDaddy',
          'No text content in response',
        );
      }

      logger.debug('GoDaddy public response', {
        request_id: requestId,
        text_length: textContent.text.length,
      });

      return textContent.text;
    }); // End of circuit breaker execute block
  }
}

/**
 * Get the circuit breaker state for monitoring.
 */
export function getGodaddyCircuitState() {
  return godaddyCircuitBreaker.getState();
}

/**
 * Reset the GoDaddy circuit breaker (for testing/admin).
 */
export function resetGodaddyCircuit() {
  godaddyCircuitBreaker.reset();
}

/**
 * Singleton instance.
 */
export const godaddyPublicAdapter = new GodaddyPublicAdapter();
