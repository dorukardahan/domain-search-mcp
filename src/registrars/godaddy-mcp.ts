/**
 * GoDaddy MCP Adapter.
 *
 * Uses GoDaddy's public MCP endpoint for domain availability checks.
 * No API key or reseller account required!
 *
 * Endpoint: https://api.godaddy.com/v1/domains/mcp
 * Protocol: JSON-RPC 2.0 over HTTP (Streamable HTTP transport)
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
 * GoDaddy MCP endpoint.
 */
const GODADDY_MCP_ENDPOINT = 'https://api.godaddy.com/v1/domains/mcp';

/**
 * JSON-RPC request ID counter.
 */
let jsonRpcId = 1;

/**
 * Response schema for MCP tool call.
 */
const McpResponseSchema = z.object({
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
 * Parse availability from GoDaddy MCP text response.
 * The response is markdown-formatted text with different formats for single vs bulk queries.
 */
interface ParsedAvailability {
  available: boolean;
  premium: boolean;
  auction: boolean;
}

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
 * GoDaddy MCP Adapter.
 *
 * Uses GoDaddy's public MCP endpoint - no authentication required!
 */
export class GodaddyMcpAdapter extends RegistrarAdapter {
  readonly name = 'GoDaddy';
  readonly id = 'godaddy';

  constructor() {
    // Conservative rate limit - GoDaddy doesn't document their limits
    // Using 30/min to be safe (they say "excessive requests may be throttled")
    super(30);
  }

  /**
   * Check if GoDaddy MCP is enabled.
   * Always enabled since no API key needed!
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Search for domain availability using GoDaddy MCP.
   */
  async search(domain: string, tld: string): Promise<DomainResult> {
    const fullDomain = `${domain}.${tld}`;

    return this.retryWithBackoff(async () => {
      const text = await this.callMcpTool('domains_check_availability', {
        domains: fullDomain,
      });

      const parsed = parseAvailabilityResponse(text, fullDomain);

      return this.createResult(domain, tld, {
        available: parsed.available,
        premium: parsed.premium,
        price_first_year: null, // GoDaddy MCP doesn't provide pricing
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
   * GoDaddy MCP supports up to 1000 domains per request!
   */
  async bulkSearch(domains: string[]): Promise<Map<string, ParsedAvailability>> {
    const results = new Map<string, ParsedAvailability>();

    // GoDaddy accepts comma-separated domains
    const domainList = domains.join(', ');

    const text = await this.callMcpTool('domains_check_availability', {
      domains: domainList,
    });

    // Parse results for each domain
    for (const domain of domains) {
      const parsed = parseAvailabilityResponse(text, domain);
      results.set(domain.toLowerCase(), parsed);
    }

    return results;
  }

  /**
   * Get TLD info - not supported by GoDaddy MCP.
   */
  async getTldInfo(_tld: string): Promise<TLDInfo | null> {
    return null;
  }

  /**
   * Call a GoDaddy MCP tool via JSON-RPC.
   */
  private async callMcpTool(
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

    logger.debug('GoDaddy MCP request', {
      tool: toolName,
      args,
      request_id: requestId,
    });

    try {
      const response = await this.withTimeout(
        fetch(GODADDY_MCP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          },
          body: JSON.stringify(payload),
        }),
        `GoDaddy MCP ${toolName}`,
        15000, // 15 second timeout
      );

      if (!response.ok) {
        throw new RegistrarApiError(
          'GoDaddy MCP',
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      // Response is SSE format: "event: message\ndata: {...}"
      const rawText = await response.text();

      // Extract JSON from SSE format
      const dataMatch = rawText.match(/data:\s*(\{.*\})/s);
      if (!dataMatch) {
        throw new RegistrarApiError(
          'GoDaddy MCP',
          'Invalid response format - expected SSE',
        );
      }

      const jsonStr = dataMatch[1];
      const parsed = JSON.parse(jsonStr!);

      // Validate response
      const validated = McpResponseSchema.parse(parsed);

      if (validated.error) {
        throw new RegistrarApiError(
          'GoDaddy MCP',
          `RPC Error ${validated.error.code}: ${validated.error.message}`,
        );
      }

      if (!validated.result || validated.result.isError) {
        throw new RegistrarApiError(
          'GoDaddy MCP',
          'Tool call returned error',
        );
      }

      // Extract text content
      const textContent = validated.result.content.find(c => c.type === 'text');
      if (!textContent) {
        throw new RegistrarApiError(
          'GoDaddy MCP',
          'No text content in response',
        );
      }

      logger.debug('GoDaddy MCP response', {
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
        throw new RegistrarApiError('GoDaddy MCP', error.message);
      }

      throw new RegistrarApiError('GoDaddy MCP', 'Unknown network error');
    }
  }
}

/**
 * Singleton instance.
 */
export const godaddyMcpAdapter = new GodaddyMcpAdapter();
