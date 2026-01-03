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
 *
 * Limitations:
 * - No pricing information
 * - Rate limits not documented (be conservative)
 */

import { z } from 'zod';
import { RegistrarAdapter, RateLimiter } from './base.js';
import type { DomainResult, TLDInfo } from '../types.js';
import { logger } from '../utils/logger.js';
import { RegistrarApiError } from '../utils/errors.js';

/**
 * GoDaddy public endpoint.
 */
const GODADDY_PUBLIC_ENDPOINT = 'https://api.godaddy.com/v1/domains/mcp';
const GODADDY_TIMEOUT_MS = 3000; // Increased from 900ms - GoDaddy signal is critical for accuracy

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
 * Domain pattern for extraction (simple, non-backtracking).
 * Matches: word.tld format like "example.com"
 */
const DOMAIN_PATTERN = /\b[a-z0-9][-a-z0-9]{0,61}[a-z0-9]?\.[a-z]{2,10}\b/gi;

/**
 * Section type for state machine parsing.
 */
type SectionType = 'available' | 'premium' | 'auction' | 'unavailable' | null;

/**
 * Detect section type from a line (ReDoS-safe).
 * Uses simple string includes instead of complex regex.
 */
function detectSectionType(line: string): SectionType | 'continue' {
  // Check for section headers (emoji + keyword pattern)
  if (line.includes('✅') && (line.includes('AVAILABLE') || line.includes('STANDARD'))) {
    return 'available';
  }
  if (line.includes('💎') && line.includes('PREMIUM')) {
    return 'premium';
  }
  if (line.includes('🔨') && line.includes('AUCTION')) {
    return 'auction';
  }
  if (line.includes('❌') && line.includes('UNAVAILABLE')) {
    return 'unavailable';
  }
  return 'continue'; // Not a section header, continue in current section
}

/**
 * Parse suggestions from GoDaddy public domains_suggest response.
 * Uses ReDoS-safe line-by-line state machine parsing.
 */
function parseSuggestResponse(text: string): GodaddySuggestion[] {
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

  // ==== LINE-BY-LINE STATE MACHINE (ReDoS-safe) ====
  // Process each line, tracking current section
  const lines = text.split('\n');
  let currentSection: SectionType = null;

  for (const line of lines) {
    // Check for section transition
    const sectionDetect = detectSectionType(line);
    if (sectionDetect !== 'continue') {
      currentSection = sectionDetect;
      continue; // Section header line, move to next
    }

    // Skip if we're in unavailable section or no section yet
    if (currentSection === 'unavailable' || currentSection === null) {
      continue;
    }

    // Extract domains from this line (simple pattern, no backtracking risk)
    const domainMatches = line.match(DOMAIN_PATTERN);
    if (domainMatches) {
      for (const domain of domainMatches) {
        addSuggestion(
          domain,
          true, // available (we skip unavailable section)
          currentSection === 'premium',
          currentSection === 'auction',
        );
      }
    }
  }

  // ==== FALLBACK: Line-by-line context detection ====
  // If state machine found nothing, try per-line context clues
  if (suggestions.length < 3) {
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Skip header lines (contain ** but no domain-like content)
      if (lowerLine.includes('**') && !lowerLine.includes('.')) continue;

      // Extract any domain-like patterns
      const domainMatches = line.match(DOMAIN_PATTERN);
      if (domainMatches) {
        for (const domain of domainMatches) {
          // Determine type from line context
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

/**
 * Parse availability response using ReDoS-safe line-by-line parsing.
 * Uses state machine approach instead of complex regex with lookaheads.
 */
function parseAvailabilityResponse(text: string, domain: string): ParsedAvailability {
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

  // ==== BULK DOMAIN FORMAT (ReDoS-safe line-by-line) ====
  // Use state machine to track which section we're in
  const lines = text.split('\n');
  let currentSection: SectionType = null;

  for (const line of lines) {
    // Check for section transition
    const sectionDetect = detectSectionType(line);
    if (sectionDetect !== 'continue') {
      currentSection = sectionDetect;
      continue;
    }

    // Check if this line contains our domain
    if (line.toLowerCase().includes(normalizedDomain)) {
      switch (currentSection) {
        case 'available':
          result.available = true;
          return result;
        case 'premium':
          result.available = true;
          result.premium = true;
          return result;
        case 'auction':
          result.available = true;
          result.auction = true;
          return result;
        case 'unavailable':
          result.available = false;
          return result;
        default:
          // Domain found but not in a known section, continue checking
          break;
      }
    }
  }

  // ==== FALLBACK: LINE-BY-LINE CONTEXT ANALYSIS ====
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
 */
export class GodaddyPublicAdapter extends RegistrarAdapter {
  readonly name = 'GoDaddy';
  readonly id = 'godaddy';

  constructor() {
    // Conservative rate limit - GoDaddy doesn't document their limits
    // Using 30/min to be safe (they say "excessive requests may be throttled")
    super(30);
  }

  /**
   * Check if GoDaddy public endpoint is enabled.
   * Always enabled since no API key needed!
   */
  isEnabled(): boolean {
    return true;
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

    try {
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
    } catch (error) {
      if (error instanceof RegistrarApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          throw error;
        }
        throw new RegistrarApiError('GoDaddy', error.message);
      }

      throw new RegistrarApiError('GoDaddy', 'Unknown network error');
    }
  }
}

/**
 * Singleton instance.
 */
export const godaddyPublicAdapter = new GodaddyPublicAdapter();
