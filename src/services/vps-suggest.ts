/**
 * VPS Suggest Service
 *
 * Calls VPS backend for AI-powered domain suggestions.
 * All API keys (Together.ai) are stored on VPS, not in MCP.
 * This allows npm package users to get AI suggestions without any API keys.
 */

import { config } from '../config.js';

export interface VpsSuggestion {
  name: string;
  tld: string;
  reason?: string;
}

export interface VpsSuggestResponse {
  suggestions: VpsSuggestion[];
  model: string;
  source: 'together_ai';
  cached: boolean;
}

export interface VpsSuggestRequest {
  query: string;
  style?: 'brandable' | 'descriptive' | 'short' | 'creative';
  tld?: string;
  max_suggestions?: number;
  industry?: string;
  temperature?: number;
}

/**
 * Check if VPS suggest API is configured (PRICING_API_BASE_URL is set)
 */
export function isVpsSuggestConfigured(): boolean {
  return config.pricingApi.enabled && !!config.pricingApi.baseUrl;
}

/**
 * Fetch AI-powered domain suggestions from VPS backend
 */
export async function fetchVpsSuggestions(
  request: VpsSuggestRequest
): Promise<VpsSuggestResponse | null> {
  if (!config.pricingApi.enabled || !config.pricingApi.baseUrl) {
    return null;
  }

  const baseUrl = config.pricingApi.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/suggest`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.pricingApi.token
          ? { Authorization: `Bearer ${config.pricingApi.token}` }
          : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`VPS suggest error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as VpsSuggestResponse;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('VPS suggest request timed out');
    } else {
      console.error('VPS suggest request failed:', error);
    }
    return null;
  }
}

/**
 * Check VPS suggest API health
 */
export async function checkVpsSuggestHealth(): Promise<{
  ok: boolean;
  together_configured?: boolean;
  default_model?: string;
}> {
  if (!config.pricingApi.enabled || !config.pricingApi.baseUrl) {
    return { ok: false };
  }

  const baseUrl = config.pricingApi.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/suggest/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { ok: false };
    }

    return (await response.json()) as {
      ok: boolean;
      together_configured?: boolean;
      default_model?: string;
    };
  } catch {
    return { ok: false };
  }
}
