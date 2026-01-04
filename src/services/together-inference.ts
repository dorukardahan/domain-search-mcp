/**
 * Together.ai Inference API client.
 *
 * Cloud-based AI inference using Together.ai's API.
 * Supports Qwen3-14B, Qwen 2.5-72B, and other models.
 *
 * This is the PRIMARY inference provider ($50/month budget).
 * Falls back to local llama.cpp (qwen-inference.ts) if unavailable.
 *
 * @see https://docs.together.ai/reference/chat-completions
 */

import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';
import { CircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';
import type { QwenDomain, QwenContext, QwenSuggestOptions } from './qwen-inference.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Together.ai API base URL.
 */
const TOGETHER_API_URL = 'https://api.together.ai/v1/chat/completions';

/**
 * Available models on Together.ai (sorted by quality).
 *
 * @see https://docs.together.ai/docs/serverless-models
 */
export const TOGETHER_MODELS = {
  // Primary choice based on @alicankiraz0 research (January 2026)
  'qwen3-14b': 'Qwen/Qwen3-14B',
  'qwen3-14b-instruct': 'Qwen/Qwen3-14B-Instruct',

  // Larger alternatives for higher quality
  'qwen2.5-72b': 'Qwen/Qwen2.5-72B-Instruct',
  'qwen2.5-32b': 'Qwen/Qwen2.5-32B-Instruct',

  // Smaller fallbacks
  'qwen2.5-7b': 'Qwen/Qwen2.5-7B-Instruct',

  // Default: best quality-cost balance for domain names
  'default': 'Qwen/Qwen3-14B-Instruct',
} as const;

export type TogetherModelKey = keyof typeof TOGETHER_MODELS;

// ═══════════════════════════════════════════════════════════════════════════
// STYLE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Style-specific prompting configurations for domain name generation.
 * Optimized for chat-based models (system + user message format).
 */
const STYLE_CONFIGS: Record<string, {
  systemPrompt: string;
  techniques: string[];
  constraints: string[];
}> = {
  brandable: {
    systemPrompt: `You are a domain name expert specializing in creating brandable, memorable domain names for startups and tech companies.

Your task is to INVENT new words that sound like real brands. Think: Spotify, Calendly, Shopify, Zapier, Figma.

Key techniques:
- Portmanteau blending (Instagram = Instant + Telegram)
- Modern suffixes: -ly, -ify, -io, -ai, -eo, -va, -ra
- Phonetic spellings (Lyft, Fiverr, Tumblr)
- Consonant clusters that are pronounceable (Stripe, Slack)
- Neologisms - completely new words that sound natural

IMPORTANT: Every name must be PRONOUNCEABLE. Say it out loud before suggesting.`,
    techniques: [
      'Portmanteau blending',
      'Modern tech suffixes',
      'Phonetic spellings',
      'Invented neologisms',
    ],
    constraints: [
      'Must be pronounceable',
      '4-10 characters ideal',
      'No generic descriptive names',
      'Avoid dictionary words',
    ],
  },
  descriptive: {
    systemPrompt: `You are a domain name expert specializing in clear, professional names that immediately convey meaning.

Your task is to create compound words or phrases that describe the product/service.

Key techniques:
- Professional suffixes: -hq, -hub, -base, -stack, -cloud
- Action + object patterns (Dropbox, Mailchimp)
- Industry term + qualifier (Salesforce, Workday)

Focus on clarity and professionalism.`,
    techniques: [
      'Professional compound words',
      'Action + object patterns',
      'Industry terminology',
    ],
    constraints: [
      'Understandable at first glance',
      '5-12 characters',
      'Must relate to service',
    ],
  },
  short: {
    systemPrompt: `You are a domain name expert specializing in ultra-short, punchy names.

Your task is to create names that are 7 characters or LESS.

Key techniques:
- Truncation (removing vowels or syllables)
- Single syllable words
- Acronym-like patterns
- Sound-based (onomatopoeia)

Think: Uber, Lyft, Snap, Zoom, Jira.`,
    techniques: [
      'Truncation',
      'Single syllables',
      'Acronym patterns',
    ],
    constraints: [
      'MAXIMUM 7 characters',
      'MINIMUM 3 characters',
      'Easy to type',
      'One or two syllables',
    ],
  },
  creative: {
    systemPrompt: `You are an experimental domain name creator. Maximum creativity allowed.

Your task is to create unusual, artistic, playful names that stand out.

Key techniques:
- Unusual letter combinations
- Phonetic playfulness
- Onomatopoeia (sounds like what it does)
- Mythological or invented language references
- Reversed words or intentional misspellings

Think: Skype, Twitch, Flickr, Hulu, Etsy, Vimeo.`,
    techniques: [
      'Unusual combinations',
      'Phonetic playfulness',
      'Mythology references',
      'Creative misspellings',
    ],
    constraints: [
      'Can break rules',
      'Must be pronounceable',
      'Should evoke emotion',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Together.ai specific options extending base options.
 */
export interface TogetherSuggestOptions extends QwenSuggestOptions {
  /** Model to use (default: qwen3-14b-instruct) */
  model?: TogetherModelKey;
}

/**
 * Custom error for Together.ai inference failures.
 */
export class TogetherInferenceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TIMEOUT'
      | 'RATE_LIMIT'
      | 'INVALID_RESPONSE'
      | 'SERVER_ERROR'
      | 'NOT_CONFIGURED'
      | 'INSUFFICIENT_CREDITS',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'TogetherInferenceError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Together.ai Inference API client with retry logic and caching.
 */
export class TogetherInferenceClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultModel: string;
  private readonly cache: TtlCache<QwenDomain[]>;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    apiKey: string,
    options: {
      timeoutMs?: number;
      maxRetries?: number;
      cacheTtl?: number;
      defaultModel?: TogetherModelKey;
    } = {},
  ) {
    this.apiKey = apiKey;
    this.timeoutMs = options.timeoutMs || 30000; // 30s for cloud API
    this.maxRetries = options.maxRetries || 2;
    this.defaultModel = TOGETHER_MODELS[options.defaultModel || 'default'];
    this.cache = new TtlCache<QwenDomain[]>(options.cacheTtl || 3600, 1000);

    // Circuit breaker: 5 failures in 60s → open for 30s
    this.circuitBreaker = new CircuitBreaker({
      name: 'together_ai',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      failureWindowMs: 60_000,
      successThreshold: 2,
    });
  }

  /**
   * Generate domain suggestions using Together.ai.
   *
   * Returns suggestions or null if Together.ai is unavailable.
   * Graceful degradation - caller should fall back to local inference.
   */
  async suggest(options: TogetherSuggestOptions): Promise<QwenDomain[] | null> {
    const {
      query,
      style = 'brandable',
      tld = 'com',
      max_suggestions = 10,
      temperature = 0.8,
      context,
      model,
    } = options;

    // Build cache key
    const cacheKey = `together:${query}:${style}:${tld}:${max_suggestions}:${temperature}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Together.ai cache hit', { query, cached_domains: cached.length });
      return cached;
    }

    // Build messages
    const messages = this._buildMessages(query, style, tld, max_suggestions, context);
    const modelId = model ? TOGETHER_MODELS[model] : this.defaultModel;

    try {
      const startTime = Date.now();
      const response = await this.circuitBreaker.execute(() =>
        this._makeRequestWithRetry({
          model: modelId,
          messages,
          max_tokens: this._calculateMaxTokens(max_suggestions, style),
          temperature,
          stop: ['Query:', '\n\nQuery:'],
        })
      );

      const inferenceMs = Date.now() - startTime;

      // Parse domains from response
      const domains = this._parseDomainsFromText(response, tld);

      // Cache successful response
      if (domains.length > 0) {
        this.cache.set(cacheKey, domains);
      }

      logger.info('Together.ai inference success', {
        query,
        model: modelId,
        domains: domains.length,
        inference_ms: inferenceMs,
      });

      return domains;
    } catch (error) {
      // Circuit breaker open - fail fast
      if (error instanceof CircuitOpenError) {
        logger.debug('Together.ai circuit breaker open, skipping', {
          resetAt: new Date(error.resetAt).toISOString(),
        });
        return null;
      }

      if (error instanceof TogetherInferenceError) {
        logger.warn('Together.ai inference failed', {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        });
      } else {
        logger.warn('Together.ai inference error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return null; // Graceful degradation
    }
  }

  /**
   * Build chat messages for Together.ai API.
   */
  private _buildMessages(
    query: string,
    style: string,
    tld: string,
    maxSuggestions: number,
    context?: QwenContext,
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const styleConfig = STYLE_CONFIGS[style] || STYLE_CONFIGS.brandable!;

    // System message with style-specific instructions
    const systemContent = styleConfig!.systemPrompt;

    // Build user message with task details
    const userParts: string[] = [];

    // Add context if provided
    if (context) {
      userParts.push('=== CONTEXT ===');
      if (context.projectName) {
        userParts.push(`Project: ${context.projectName}`);
      }
      if (context.description) {
        userParts.push(`Description: ${context.description}`);
      }
      if (context.industry) {
        userParts.push(`Industry: ${context.industry}`);
      }
      if (context.keywords && context.keywords.length > 0) {
        userParts.push(`Keywords: ${context.keywords.join(', ')}`);
      }
      userParts.push('');
    }

    // Add task
    userParts.push('=== TASK ===');
    userParts.push(`Generate ${maxSuggestions} unique domain names for: "${query}"`);
    userParts.push(`Target TLD: .${tld}`);

    // Length constraints
    const minLen = context?.minLength || 4;
    const maxLen = context?.maxLength || 12;
    userParts.push(`Length: ${minLen}-${maxLen} characters`);
    userParts.push('');

    // Output format
    userParts.push('=== OUTPUT FORMAT ===');
    userParts.push('Return EXACTLY in this format (one per line):');
    userParts.push(`- name.${tld} - Brief reason`);
    userParts.push('');
    userParts.push('Example:');
    userParts.push(`- voxify.${tld} - Blend of "voice" + "-ify", modern feel`);
    userParts.push('');
    userParts.push('Generate now:');

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userParts.join('\n') },
    ];
  }

  /**
   * Calculate max_tokens based on number of suggestions and style.
   *
   * Style-aware token allocation reduces API costs by 20-30%.
   */
  private _calculateMaxTokens(maxSuggestions: number, style: string): number {
    // Token budget per suggestion varies by style complexity
    const tokensPerSuggestion: Record<string, number> = {
      short: 30,       // Ultra-short names, minimal reasons
      brandable: 50,   // Invented names, moderate explanations
      descriptive: 60, // Compound words, detailed reasoning
      creative: 70,    // Wordplay, artistic explanations
    };

    const perSuggestion = tokensPerSuggestion[style] || 50;

    // Reduced base buffer (128 vs 200) since we're style-aware
    // Cap at 1536 tokens (reduced from 2048) for cost efficiency
    return Math.min(128 + maxSuggestions * perSuggestion, 1536);
  }

  /**
   * Parse domain names from model-generated text.
   */
  private _parseDomainsFromText(text: string, defaultTld: string): QwenDomain[] {
    const domains: QwenDomain[] = [];
    const seen = new Set<string>();
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // Match: "- domain.tld — reason" or "- domain.tld - reason"
      const match = line.match(/^[-*•]\s*([a-z0-9-]+)\.([a-z]+)\s*[—\-:]\s*(.+)$/i);
      if (match && match[1] && match[2]) {
        const name = match[1].toLowerCase();
        const tld = match[2].toLowerCase();
        const reason = match[3]?.trim();

        // Deduplicate
        const key = `${name}.${tld}`;
        if (!seen.has(key)) {
          seen.add(key);
          domains.push({ name, tld, reason });
        }
      }
    }

    return domains;
  }

  /**
   * Make HTTP request with timeout and error handling.
   */
  private async _makeRequest(payload: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    max_tokens: number;
    temperature: number;
    stop?: string[];
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(TOGETHER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // Handle non-200 responses
      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');

        // Check for specific error codes
        if (response.status === 429) {
          throw new TogetherInferenceError(
            'Rate limit exceeded',
            'RATE_LIMIT',
            429,
          );
        }

        if (response.status === 402) {
          throw new TogetherInferenceError(
            'Insufficient credits',
            'INSUFFICIENT_CREDITS',
            402,
          );
        }

        throw new TogetherInferenceError(
          `HTTP ${response.status}: ${text}`,
          response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_RESPONSE',
          response.status,
        );
      }

      // Parse OpenAI-compatible response
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
        throw new TogetherInferenceError(
          'Invalid response: no choices',
          'INVALID_RESPONSE',
        );
      }

      const content = json.choices[0]?.message?.content || '';

      logger.debug('Together.ai response', {
        model: payload.model,
        tokens: json.usage?.total_tokens,
        content_length: content.length,
      });

      return content;
    } catch (error) {
      if (error instanceof TogetherInferenceError) {
        throw error;
      }

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TogetherInferenceError(
          `Request timeout after ${this.timeoutMs}ms`,
          'TIMEOUT',
        );
      }

      // Generic error
      throw new TogetherInferenceError(
        error instanceof Error ? error.message : String(error),
        'SERVER_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make request with exponential backoff retry.
   */
  private async _makeRequestWithRetry(payload: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    max_tokens: number;
    temperature: number;
    stop?: string[];
  }): Promise<string> {
    let lastError: TogetherInferenceError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._makeRequest(payload);
      } catch (error) {
        if (!(error instanceof TogetherInferenceError)) {
          throw error;
        }

        lastError = error;

        // Don't retry on 4xx errors (except rate limit)
        if (
          error.statusCode &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.code !== 'RATE_LIMIT'
        ) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s (longer for cloud API)
        const backoffMs = 1000 * Math.pow(2, attempt);
        logger.debug('Together.ai request failed, retrying', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          backoffMs,
          error: error.message,
        });

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError!;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let togetherClient: TogetherInferenceClient | null | undefined = undefined;

/**
 * Get Together.ai client instance (singleton).
 *
 * Returns null if Together.ai is not configured.
 * Caller should fall back to local qwen-inference.ts if null.
 */
export function getTogetherClient(): TogetherInferenceClient | null {
  // Return cached instance
  if (togetherClient !== undefined) {
    return togetherClient;
  }

  // Check if Together.ai is configured
  const apiKey = config.togetherAi?.apiKey;
  if (!config.togetherAi?.enabled || !apiKey) {
    togetherClient = null;
    return null;
  }

  // Create new instance
  togetherClient = new TogetherInferenceClient(apiKey, {
    timeoutMs: config.togetherAi.timeoutMs,
    maxRetries: config.togetherAi.maxRetries,
    defaultModel: config.togetherAi.defaultModel as TogetherModelKey,
    cacheTtl: 3600, // 1 hour cache
  });

  logger.info('Together.ai inference client initialized', {
    model: config.togetherAi.defaultModel || 'qwen3-14b-instruct',
    timeoutMs: config.togetherAi.timeoutMs,
  });

  return togetherClient;
}

/**
 * Check if Together.ai is configured and available.
 */
export function isTogetherConfigured(): boolean {
  return !!(config.togetherAi?.enabled && config.togetherAi.apiKey);
}
