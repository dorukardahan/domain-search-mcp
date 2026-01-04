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
// STYLE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Style-specific prompting configurations for domain name generation.
 * Each style guides the model to use different naming techniques.
 */
const STYLE_PROMPTS: Record<string, {
  description: string;
  techniques: string[];
  examples: string[];
  constraints: string[];
}> = {
  brandable: {
    description: 'Create memorable invented words that sound like real brands',
    techniques: [
      'Portmanteau blending (Instagram = Instant + Telegram)',
      'Modern suffixes: -ly, -ify, -io, -ai, -eo, -va, -ra',
      'Phonetic spellings (Lyft, Fiverr, Tumblr)',
      'Consonant clusters that are pronounceable (Spotify, Stripe)',
      'Neologisms - completely new words that sound natural',
      'Letter substitution (K for C, X for Ex, Z for S)',
    ],
    examples: [
      'spotify - blend of "spot" + made-up suffix',
      'calendly - "calendar" + trendy "-ly" suffix',
      'shopify - "shop" + tech suffix "-ify"',
      'zapier - invented word from "zap" concept',
      'airtable - compound of "air" + "table"',
      'notion - single real word reimagined',
      'figma - invented word, short and punchy',
      'vercel - invented, sounds like "versatile"',
    ],
    constraints: [
      'MUST be pronounceable (say it out loud test)',
      'Length: 4-10 characters ideal',
      'NO generic descriptive names like "fastapp" or "quickdata"',
      'AVOID real dictionary words unless reimagined',
    ],
  },
  descriptive: {
    description: 'Clear, professional names that convey meaning immediately',
    techniques: [
      'Compound words that describe the product',
      'Professional suffixes: -hq, -hub, -base, -stack, -cloud',
      'Action + object patterns (Dropbox, Mailchimp)',
      'Industry term + qualifier (Salesforce, Workday)',
    ],
    examples: [
      'dropbox - action + container',
      'mailchimp - service + mascot',
      'hubspot - central + location',
      'zendesk - philosophy + workspace',
      'basecamp - foundation + project term',
    ],
    constraints: [
      'Should be understandable at first glance',
      'Length: 5-12 characters',
      'Must relate to the product/service',
    ],
  },
  short: {
    description: 'Ultra-short, punchy names (4-7 characters max)',
    techniques: [
      'Truncation (removing vowels or syllables)',
      'Single syllable words',
      'Acronym-like patterns',
      'Sound-based (onomatopoeia)',
      'Prefix/suffix removal',
    ],
    examples: [
      'uber - short, powerful',
      'lyft - phonetic spelling, short',
      'snap - one syllable, action',
      'zoom - one syllable, energy',
      'trello - invented, compact',
      'asana - borrowed word, elegant',
      'jira - short, distinctive',
    ],
    constraints: [
      'MAXIMUM 7 characters',
      'MINIMUM 3 characters',
      'Must be easy to type and remember',
      'One or two syllables preferred',
    ],
  },
  creative: {
    description: 'Maximum experimentation - wordplay, unusual sounds, artistic names',
    techniques: [
      'Unusual letter combinations',
      'Phonetic playfulness',
      'Onomatopoeia (sounds like what it does)',
      'Mythological or invented language references',
      'Reversed words or misspellings',
      'Sound symbolism (sharp sounds for speed, soft for comfort)',
    ],
    examples: [
      'skype - sky + type blended',
      'twitch - evocative action word',
      'flickr - vowel removal style',
      'tumblr - vowel removal style',
      'hulu - completely invented, playful',
      'etsy - invented, crafty feel',
      'vimeo - anagram of "movie"',
    ],
    constraints: [
      'Can break conventional rules',
      'Must still be pronounceable',
      'Should evoke emotion or imagery',
    ],
  },
};

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
 * Project or idea context for more relevant domain suggestions.
 */
export interface QwenContext {
  /** Project or business description */
  description?: string;
  /** Detected or specified industry */
  industry?: string;
  /** Keywords to blend or incorporate */
  keywords?: string[];
  /** Inspiration words for the brand */
  brandWords?: string[];
  /** Minimum domain name length */
  minLength?: number;
  /** Maximum domain name length */
  maxLength?: number;
  /** Project name (if analyzing a codebase) */
  projectName?: string;
  /** Repository URL (for context) */
  repositoryUrl?: string;
}

/**
 * Options for Qwen suggestion request.
 */
export interface QwenSuggestOptions {
  query: string;
  style?: 'brandable' | 'descriptive' | 'short' | 'creative';
  tld?: string;
  max_suggestions?: number;
  temperature?: number;
  /** Additional context for more relevant suggestions */
  context?: QwenContext;
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
    this.cache = new TtlCache<QwenResponse>(options.cacheTtl || 3600, 500);
  }

  /**
   * Generate domain suggestions using Qwen model.
   *
   * Returns suggestions or null if Qwen is unavailable.
   * Graceful degradation - caller should fall back to other sources.
   */
  async suggest(options: QwenSuggestOptions): Promise<QwenDomain[] | null> {
    const { query, style = 'brandable', tld = 'com', max_suggestions = 10, temperature = 0.7, context } = options;

    // Build enhanced prompt with context
    const prompt = this._buildPrompt(query, style, tld, max_suggestions, context);

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
        max_tokens: this._calculateMaxTokens(max_suggestions, style),
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
   * Build comprehensive prompt for Qwen model based on style and context.
   *
   * Uses structured blocks to guide the model toward generating
   * truly inventive, brandable domain names.
   */
  private _buildPrompt(
    query: string,
    style: string,
    tld: string,
    maxSuggestions: number,
    context?: QwenContext,
  ): string {
    const styleConfig = STYLE_PROMPTS[style] || STYLE_PROMPTS.brandable;

    // Build the prompt in structured blocks
    const blocks: string[] = [];

    // System block - explains the task and techniques
    blocks.push(this._buildSystemBlock(styleConfig));

    // Context block - project/idea specific information
    if (context) {
      blocks.push(this._buildContextBlock(context));
    }

    // Task block - the actual request
    blocks.push(this._buildTaskBlock(query, tld, maxSuggestions, context));

    // Format block - specifies output format
    blocks.push(this._buildFormatBlock(tld));

    return blocks.join('\n\n');
  }

  /**
   * Build the system instruction block explaining techniques and style.
   */
  private _buildSystemBlock(styleConfig: typeof STYLE_PROMPTS.brandable): string {
    const lines: string[] = [
      '=== DOMAIN NAME GENERATION ===',
      '',
      `Style: ${styleConfig?.description || 'Create memorable, brandable domain names'}`,
      '',
      'TECHNIQUES TO USE:',
    ];

    const techniques = styleConfig?.techniques || [];
    for (const technique of techniques) {
      lines.push(`• ${technique}`);
    }

    lines.push('', 'EXAMPLE NAMES (for inspiration, NOT to copy):');
    const examples = styleConfig?.examples || [];
    for (const example of examples.slice(0, 5)) {
      lines.push(`• ${example}`);
    }

    lines.push('', 'CONSTRAINTS:');
    const constraints = styleConfig?.constraints || [];
    for (const constraint of constraints) {
      lines.push(`• ${constraint}`);
    }

    return lines.join('\n');
  }

  /**
   * Build the context block from project/idea information.
   */
  private _buildContextBlock(context: QwenContext): string {
    const lines: string[] = ['=== CONTEXT ==='];

    if (context.projectName) {
      lines.push(`Project Name: ${context.projectName}`);
    }

    if (context.description) {
      lines.push(`Description: ${context.description}`);
    }

    if (context.industry) {
      lines.push(`Industry: ${context.industry}`);
    }

    if (context.keywords && context.keywords.length > 0) {
      lines.push(`Keywords to incorporate: ${context.keywords.join(', ')}`);
    }

    if (context.brandWords && context.brandWords.length > 0) {
      lines.push(`Brand inspiration words: ${context.brandWords.join(', ')}`);
    }

    const minLen = context.minLength || 4;
    const maxLen = context.maxLength || 12;
    lines.push(`Length requirement: ${minLen}-${maxLen} characters`);

    return lines.join('\n');
  }

  /**
   * Build the task block specifying what to generate.
   */
  private _buildTaskBlock(
    query: string,
    tld: string,
    count: number,
    context?: QwenContext,
  ): string {
    const lines: string[] = [
      '=== TASK ===',
      `Generate ${count} unique, INVENTED domain names for: "${query}"`,
      `Target TLD: .${tld}`,
      '',
      'IMPORTANT RULES:',
      '1. INVENT NEW WORDS - do not use common dictionary words directly',
      '2. Each name must be UNIQUE and CREATIVE',
      '3. Names must be PRONOUNCEABLE (read it aloud)',
      '4. NO generic patterns like "fastX", "quickY", "proZ"',
      '5. Think like a startup founder naming their company',
    ];

    // Add context-specific guidance
    if (context?.keywords && context.keywords.length > 0) {
      lines.push(`6. Try to BLEND or TRANSFORM these keywords: ${context.keywords.slice(0, 3).join(', ')}`);
    }

    if (context?.industry) {
      lines.push(`7. Names should feel appropriate for the ${context.industry} industry`);
    }

    return lines.join('\n');
  }

  /**
   * Build the output format specification block.
   */
  private _buildFormatBlock(tld: string): string {
    return `=== OUTPUT FORMAT ===
Return EXACTLY in this format (one domain per line):
- name.${tld} - Brief reason why this name works

Example output:
- voxify.${tld} - Blend of "voice" + "-ify", modern tech feel
- zestora.${tld} - Invented word, energetic "zest" + melodic ending

Domains:`;
  }

  /**
   * Calculate max_tokens based on number of suggestions and style.
   *
   * Token requirements vary by style:
   * - short: ~30 tokens (4-7 char names, brief reasons)
   * - brandable: ~50 tokens (invented names, medium reasons)
   * - descriptive: ~60 tokens (compound words, detailed reasons)
   * - creative: ~70 tokens (wordplay, artistic explanations)
   *
   * Style-aware calculation reduces costs by 20-30% on average.
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

    // Reduced base buffer (128 vs 256) since we're style-aware
    // Cap at 1536 tokens (reduced from 2048) for cost efficiency
    return Math.min(128 + maxSuggestions * perSuggestion, 1536);
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
