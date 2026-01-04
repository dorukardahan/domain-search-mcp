/**
 * OpenRouter Inference API client.
 *
 * Cloud-based AI inference using OpenRouter's aggregated API.
 * 10x cheaper than Together.ai for the same models.
 *
 * This is the FALLBACK inference provider when local model fails.
 * Primary: Local fine-tuned Qwen 7B-DPO (qwen-inference.ts)
 *
 * Pricing (per 1M tokens):
 * - Qwen 2.5-72B: $0.12 input, $0.39 output
 * - Qwen 2.5-7B:  $0.04 input, $0.10 output
 *
 * @see https://openrouter.ai/docs
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/cache.js';
import type { QwenDomain, QwenContext, QwenSuggestOptions } from './qwen-inference.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OpenRouter API base URL.
 */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Available models on OpenRouter (with pricing per 1M tokens).
 */
export const OPENROUTER_MODELS = {
  // Best quality - Qwen 2.5-72B ($0.12/$0.39)
  'qwen2.5-72b': 'qwen/qwen-2.5-72b-instruct',

  // Good balance - Qwen 2.5-7B ($0.04/$0.10)
  'qwen2.5-7b': 'qwen/qwen-2.5-7b-instruct',

  // Vision models
  'qwen2.5-vl-72b': 'qwen/qwen2.5-vl-72b-instruct',

  // Coder specialized
  'qwen2.5-coder-7b': 'qwen/qwen2.5-coder-7b-instruct',

  // Default: Best quality for fallback
  'default': 'qwen/qwen-2.5-72b-instruct',
} as const;

export type OpenRouterModelKey = keyof typeof OPENROUTER_MODELS;

// ═══════════════════════════════════════════════════════════════════════════
// STYLE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Style-specific prompting configurations for domain name generation.
 */
const STYLE_CONFIGS: Record<string, {
  systemPrompt: string;
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
  },
  descriptive: {
    systemPrompt: `You are a domain name expert specializing in clear, professional names that immediately convey meaning.

Your task is to create compound words or phrases that describe the product/service.

Key techniques:
- Professional suffixes: -hq, -hub, -base, -stack, -cloud
- Action + object patterns (Dropbox, Mailchimp)
- Industry term + qualifier (Salesforce, Workday)

Focus on clarity and professionalism.`,
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
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OpenRouter specific options.
 */
export interface OpenRouterSuggestOptions extends QwenSuggestOptions {
  /** Model to use (default: qwen2.5-72b) */
  model?: OpenRouterModelKey;
}

/**
 * Custom error for OpenRouter inference failures.
 */
export class OpenRouterInferenceError extends Error {
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
    this.name = 'OpenRouterInferenceError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OpenRouter Inference API client with retry logic and caching.
 */
export class OpenRouterInferenceClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultModel: string;
  private readonly cache: TtlCache<QwenDomain[]>;
  private readonly siteUrl?: string;
  private readonly siteName?: string;

  constructor(
    apiKey: string,
    options: {
      timeoutMs?: number;
      maxRetries?: number;
      cacheTtl?: number;
      defaultModel?: OpenRouterModelKey;
      siteUrl?: string;
      siteName?: string;
    } = {},
  ) {
    this.apiKey = apiKey;
    this.timeoutMs = options.timeoutMs || 30000;
    this.maxRetries = options.maxRetries || 2;
    this.defaultModel = OPENROUTER_MODELS[options.defaultModel || 'default'];
    this.cache = new TtlCache<QwenDomain[]>(options.cacheTtl || 3600, 500);
    this.siteUrl = options.siteUrl;
    this.siteName = options.siteName;
  }

  /**
   * Generate domain suggestions using OpenRouter.
   */
  async suggest(options: OpenRouterSuggestOptions): Promise<QwenDomain[] | null> {
    const {
      query,
      style = 'brandable',
      tld = 'com',
      max_suggestions = 10,
      temperature = 0.8,
      context,
      model,
    } = options;

    // Check cache
    const cacheKey = `openrouter:${query}:${style}:${tld}:${max_suggestions}:${temperature}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('OpenRouter cache hit', { query, cached_domains: cached.length });
      return cached;
    }

    // Build messages
    const messages = this._buildMessages(query, style, tld, max_suggestions, context);
    const modelId = model ? OPENROUTER_MODELS[model] : this.defaultModel;

    try {
      const startTime = Date.now();
      const response = await this._makeRequestWithRetry({
        model: modelId,
        messages,
        max_tokens: this._calculateMaxTokens(max_suggestions),
        temperature,
      });

      const inferenceMs = Date.now() - startTime;

      // Parse domains from response
      const domains = this._parseDomainsFromText(response, tld);

      // Cache successful response
      if (domains.length > 0) {
        this.cache.set(cacheKey, domains);
      }

      logger.info('OpenRouter inference success', {
        query,
        model: modelId,
        domains: domains.length,
        inference_ms: inferenceMs,
      });

      return domains;
    } catch (error) {
      if (error instanceof OpenRouterInferenceError) {
        logger.warn('OpenRouter inference failed', {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        });
      } else {
        logger.warn('OpenRouter inference error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return null;
    }
  }

  /**
   * Build chat messages for OpenRouter API.
   */
  private _buildMessages(
    query: string,
    style: string,
    tld: string,
    maxSuggestions: number,
    context?: QwenContext,
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const styleConfig = STYLE_CONFIGS[style] || STYLE_CONFIGS.brandable!;

    const userParts: string[] = [];

    // Add context if provided
    if (context) {
      userParts.push('=== CONTEXT ===');
      if (context.projectName) userParts.push(`Project: ${context.projectName}`);
      if (context.description) userParts.push(`Description: ${context.description}`);
      if (context.industry) userParts.push(`Industry: ${context.industry}`);
      if (context.keywords?.length) userParts.push(`Keywords: ${context.keywords.join(', ')}`);
      userParts.push('');
    }

    // Task
    userParts.push('=== TASK ===');
    userParts.push(`Generate ${maxSuggestions} unique domain names for: "${query}"`);
    userParts.push(`Target TLD: .${tld}`);

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
      { role: 'system', content: styleConfig!.systemPrompt },
      { role: 'user', content: userParts.join('\n') },
    ];
  }

  private _calculateMaxTokens(maxSuggestions: number): number {
    return Math.min(200 + maxSuggestions * 50, 2048);
  }

  private _parseDomainsFromText(text: string, defaultTld: string): QwenDomain[] {
    const domains: QwenDomain[] = [];
    const seen = new Set<string>();
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const match = line.match(/^[-*•]\s*([a-z0-9-]+)\.([a-z]+)\s*[—\-:]\s*(.+)$/i);
      if (match && match[1] && match[2]) {
        const name = match[1].toLowerCase();
        const tld = match[2].toLowerCase();
        const reason = match[3]?.trim();

        const key = `${name}.${tld}`;
        if (!seen.has(key)) {
          seen.add(key);
          domains.push({ name, tld, reason });
        }
      }
    }

    return domains;
  }

  private async _makeRequest(payload: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    max_tokens: number;
    temperature: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      };

      // Optional OpenRouter headers for ranking/analytics
      if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
      if (this.siteName) headers['X-Title'] = this.siteName;

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');

        if (response.status === 429) {
          throw new OpenRouterInferenceError('Rate limit exceeded', 'RATE_LIMIT', 429);
        }
        if (response.status === 402) {
          throw new OpenRouterInferenceError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402);
        }

        throw new OpenRouterInferenceError(
          `HTTP ${response.status}: ${text}`,
          response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_RESPONSE',
          response.status,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      if (!json.choices?.length) {
        throw new OpenRouterInferenceError('Invalid response: no choices', 'INVALID_RESPONSE');
      }

      const content = json.choices[0]?.message?.content || '';

      logger.debug('OpenRouter response', {
        model: payload.model,
        tokens: json.usage?.total_tokens,
        content_length: content.length,
      });

      return content;
    } catch (error) {
      if (error instanceof OpenRouterInferenceError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenRouterInferenceError(`Request timeout after ${this.timeoutMs}ms`, 'TIMEOUT');
      }

      throw new OpenRouterInferenceError(
        error instanceof Error ? error.message : String(error),
        'SERVER_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async _makeRequestWithRetry(payload: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    max_tokens: number;
    temperature: number;
  }): Promise<string> {
    let lastError: OpenRouterInferenceError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._makeRequest(payload);
      } catch (error) {
        if (!(error instanceof OpenRouterInferenceError)) throw error;

        lastError = error;

        // Don't retry on 4xx errors (except rate limit)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && error.code !== 'RATE_LIMIT') {
          throw error;
        }

        if (attempt === this.maxRetries) break;

        const backoffMs = 1000 * Math.pow(2, attempt);
        logger.debug('OpenRouter request failed, retrying', {
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

let openRouterClient: OpenRouterInferenceClient | null | undefined = undefined;

/**
 * Get OpenRouter client instance (singleton).
 */
export function getOpenRouterClient(): OpenRouterInferenceClient | null {
  if (openRouterClient !== undefined) {
    return openRouterClient;
  }

  const apiKey = config.openRouter?.apiKey;
  if (!config.openRouter?.enabled || !apiKey) {
    openRouterClient = null;
    return null;
  }

  openRouterClient = new OpenRouterInferenceClient(apiKey, {
    timeoutMs: config.openRouter.timeoutMs,
    maxRetries: config.openRouter.maxRetries,
    defaultModel: config.openRouter.defaultModel as OpenRouterModelKey,
    siteUrl: config.openRouter.siteUrl,
    siteName: config.openRouter.siteName,
    cacheTtl: 3600,
  });

  logger.info('OpenRouter inference client initialized', {
    model: config.openRouter.defaultModel || 'qwen2.5-72b',
    timeoutMs: config.openRouter.timeoutMs,
  });

  return openRouterClient;
}

/**
 * Check if OpenRouter is configured and available.
 */
export function isOpenRouterConfigured(): boolean {
  return !!(config.openRouter?.enabled && config.openRouter.apiKey);
}
