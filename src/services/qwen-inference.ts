/**
 * Qwen Inference API client.
 *
 * Optional AI-powered domain suggestions using fine-tuned Qwen 2.5-7B model.
 * Falls back gracefully if endpoint is not configured or unavailable.
 *
 * This MCP does NOT require Qwen to function - it's an optional enhancement
 * for self-hosted users who deploy the inference server on their VPS.
 */

import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Domain suggestion from Qwen model.
 */
export const QwenDomainSchema = z.object({
  name: z.string().min(1),
  tld: z.string().min(1),
  reason: z.string().optional(),
});

export type QwenDomain = z.infer<typeof QwenDomainSchema>;

/**
 * Request payload to Qwen inference API.
 */
export const QwenRequestSchema = z.object({
  prompt: z.string().min(10).max(1000),
  style: z.enum(['brandable', 'descriptive', 'short', 'creative']).optional(),
  max_tokens: z.number().int().min(128).max(1024).optional(),
  temperature: z.number().min(0.1).max(1.5).optional(),
});

export type QwenRequest = z.infer<typeof QwenRequestSchema>;

/**
 * Response from Qwen inference API.
 */
export const QwenResponseSchema = z.object({
  domains: z.array(QwenDomainSchema),
  raw_response: z.string(),
  inference_time_ms: z.number(),
  cached: z.boolean(),
});

export type QwenResponse = z.infer<typeof QwenResponseSchema>;

/**
 * Options for Qwen suggestion request.
 */
export interface QwenSuggestOptions {
  query: string;
  style?: 'brandable' | 'descriptive' | 'short' | 'creative';
  tld?: string;
  max_suggestions?: number;
  temperature?: number;
}

/**
 * Custom error for Qwen inference failures.
 */
export class QwenInferenceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TIMEOUT'
      | 'CONNECTION_REFUSED'
      | 'INVALID_RESPONSE'
      | 'SERVER_ERROR'
      | 'NOT_CONFIGURED',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'QwenInferenceError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Qwen Inference API client with retry logic and caching.
 */
export class QwenInferenceClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cache: TtlCache<QwenResponse>;

  constructor(
    endpoint: string,
    options: {
      apiKey?: string;
      timeoutMs?: number;
      maxRetries?: number;
      cacheTtl?: number;
    } = {},
  ) {
    this.endpoint = endpoint.replace(/\/+$/, ''); // Remove trailing slash
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 15000;
    this.maxRetries = options.maxRetries || 2;
    this.cache = new TtlCache<QwenResponse>(options.cacheTtl || 3600, 100);
  }

  /**
   * Generate domain suggestions using Qwen model.
   *
   * Returns suggestions or null if Qwen is unavailable.
   * Graceful degradation - caller should fall back to other sources.
   */
  async suggest(options: QwenSuggestOptions): Promise<QwenDomain[] | null> {
    const { query, style = 'brandable', tld = 'com', max_suggestions = 10, temperature = 0.7 } = options;

    // Build prompt
    const prompt = this._buildPrompt(query, style, tld, max_suggestions);

    // Check cache first
    const cacheKey = `${prompt}:${temperature}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Qwen cache hit', { query, cached_domains: cached.domains.length });
      return cached.domains;
    }

    // Make request with retry
    try {
      const response = await this._makeRequestWithRetry({
        prompt,
        style,
        max_tokens: this._calculateMaxTokens(max_suggestions),
        temperature,
      });

      // Validate response
      const validated = QwenResponseSchema.safeParse(response);
      if (!validated.success) {
        logger.warn('Qwen returned invalid response format', {
          error: validated.error.message,
        });
        return null;
      }

      // Cache successful response
      this.cache.set(cacheKey, validated.data);

      logger.info('Qwen inference success', {
        query,
        domains: validated.data.domains.length,
        inference_ms: validated.data.inference_time_ms,
        cached: validated.data.cached,
      });

      return validated.data.domains;
    } catch (error) {
      if (error instanceof QwenInferenceError) {
        logger.warn('Qwen inference failed', {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        });
      } else {
        logger.warn('Qwen inference error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return null; // Graceful degradation
    }
  }

  /**
   * Build prompt for Qwen model based on style and context.
   *
   * Uses the structured format the model was fine-tuned on.
   */
  private _buildPrompt(
    query: string,
    style: string,
    tld: string,
    maxSuggestions: number,
  ): string {
    return `Query: ${query}
Style: ${style}
TLD: ${tld}
Count: ${maxSuggestions}

Domains:`;
  }

  /**
   * Calculate max_tokens based on number of suggestions.
   */
  private _calculateMaxTokens(maxSuggestions: number): number {
    // ~50 tokens per suggestion (name + tld + reason)
    return Math.min(128 + maxSuggestions * 50, 1024);
  }

  /**
   * Parse domain names from model-generated text.
   *
   * Matches the fine-tuned model's output format:
   * - domain.tld — Reason
   * - domain.tld - Reason
   */
  private _parseDomainsFromText(text: string): QwenDomain[] {
    const domains: QwenDomain[] = [];
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // Match: "- domain.tld — reason" or "- domain.tld - reason"
      const match = line.match(/^[-*]\s*([a-z0-9-]+)\.([a-z]+)\s*[—\-:]\s*(.+)$/i);
      if (match && match[1] && match[2]) {
        const name = match[1];
        const tld = match[2];
        const reason = match[3];
        domains.push({
          name: name.toLowerCase(),
          tld: tld.toLowerCase(),
          reason: reason?.trim(),
        });
      }
    }

    return domains;
  }

  /**
   * Make HTTP request with timeout and error handling.
   */
  private async _makeRequest(payload: QwenRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // llama.cpp uses OpenAI-compatible /v1/completions endpoint
      const llamaPayload = {
        prompt: payload.prompt,
        max_tokens: payload.max_tokens || 512,
        temperature: payload.temperature || 0.7,
        stop: ['Query:', '\n\nQuery:'], // Stop when model starts new query
      };

      const response = await fetch(`${this.endpoint}/v1/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(llamaPayload),
        signal: controller.signal,
      });

      // Handle non-200 responses
      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new QwenInferenceError(
          `HTTP ${response.status}: ${text}`,
          response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_RESPONSE',
          response.status,
        );
      }

      // Parse llama.cpp OpenAI-compatible response
      const json = (await response.json()) as {
        choices?: Array<{ text?: string }>;
        timings?: { predicted_ms?: number };
      };

      // Extract generated text from llama.cpp response
      if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
        throw new QwenInferenceError(
          'Invalid llama.cpp response: no choices',
          'INVALID_RESPONSE',
        );
      }

      const generatedText = json.choices[0]?.text || '';
      const inferenceTimeMs = json.timings?.predicted_ms || 0;

      // Parse domains from generated text
      const domains = this._parseDomainsFromText(generatedText);

      // Return in expected QwenResponse format
      return {
        domains,
        raw_response: generatedText,
        inference_time_ms: inferenceTimeMs,
        cached: false,
      };
    } catch (error) {
      if (error instanceof QwenInferenceError) {
        throw error;
      }

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new QwenInferenceError(
          `Request timeout after ${this.timeoutMs}ms`,
          'TIMEOUT',
        );
      }

      // Handle connection refused
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new QwenInferenceError(
          'Connection refused - inference server may be down',
          'CONNECTION_REFUSED',
        );
      }

      // Generic error
      throw new QwenInferenceError(
        error instanceof Error ? error.message : String(error),
        'SERVER_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make request with exponential backoff retry.
   *
   * Retries on 5xx errors and timeouts, no retry on 4xx errors.
   */
  private async _makeRequestWithRetry(payload: QwenRequest): Promise<unknown> {
    let lastError: QwenInferenceError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._makeRequest(payload);
      } catch (error) {
        if (!(error instanceof QwenInferenceError)) {
          throw error;
        }

        lastError = error;

        // Don't retry on 4xx errors (bad request)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries) {
          break;
        }

        // Exponential backoff: 500ms, 1000ms, 2000ms
        const backoffMs = 500 * Math.pow(2, attempt);
        logger.debug('Qwen request failed, retrying', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          backoffMs,
          error: error.message,
        });

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    // All retries exhausted
    throw lastError!;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let qwenClient: QwenInferenceClient | null | undefined = undefined;

/**
 * Get Qwen client instance (singleton).
 *
 * Returns null if Qwen is not configured - caller should fall back to other sources.
 */
export function getQwenClient(): QwenInferenceClient | null {
  // Return cached instance
  if (qwenClient !== undefined) {
    return qwenClient;
  }

  // Check if Qwen is configured
  if (!config.qwenInference?.enabled || !config.qwenInference.endpoint) {
    qwenClient = null;
    return null;
  }

  // Create new instance
  qwenClient = new QwenInferenceClient(config.qwenInference.endpoint, {
    apiKey: config.qwenInference.apiKey,
    timeoutMs: config.qwenInference.timeoutMs,
    maxRetries: config.qwenInference.maxRetries,
    cacheTtl: 3600, // 1 hour cache
  });

  logger.info('Qwen inference client initialized', {
    endpoint: config.qwenInference.endpoint,
    timeoutMs: config.qwenInference.timeoutMs,
    maxRetries: config.qwenInference.maxRetries,
  });

  return qwenClient;
}
