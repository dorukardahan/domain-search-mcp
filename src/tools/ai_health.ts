/**
 * ai_health Tool - AI Service Health Check.
 *
 * Check the health and status of all AI inference services.
 * Useful for diagnosing suggestion quality issues and monitoring.
 */

import { z } from 'zod';
import { config } from '../config.js';
import { getAllCircuitStates } from '../utils/circuit-breaker.js';
import { getAllAdaptiveStates } from '../utils/adaptive-concurrency.js';
import { getMetricsSummary } from '../utils/metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input schema for ai_health.
 */
export const aiHealthSchema = z.object({
  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include detailed metrics and circuit breaker states.'),
});

export type AiHealthInput = z.infer<typeof aiHealthSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Tool Definition
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tool definition for MCP.
 */
export const aiHealthTool = {
  name: 'ai_health',
  description: `Check health status of AI inference services.

Returns status of:
- VPS Qwen (self-hosted llama.cpp)
- Together.ai (cloud fallback)
- Semantic Engine (offline, always available)
- Circuit breaker states
- Adaptive concurrency limits

Use when:
- AI suggestions are slow or failing
- Diagnosing which AI source is being used
- Monitoring inference infrastructure`,
  inputSchema: {
    type: 'object',
    properties: {
      verbose: {
        type: 'boolean',
        description: 'Include detailed metrics and circuit breaker states.',
        default: false,
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceStatus {
  name: string;
  configured: boolean;
  status: 'healthy' | 'degraded' | 'unavailable' | 'unchecked';
  message?: string;
  details?: Record<string, unknown>;
}

interface AiHealthResponse {
  overall_status: 'healthy' | 'degraded' | 'unavailable';
  services: ServiceStatus[];
  active_source: string;
  circuit_breakers?: Array<ReturnType<typeof getAllCircuitStates>[number]>;
  adaptive_limiters?: Array<ReturnType<typeof getAllAdaptiveStates>[number]>;
  metrics_summary?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check health of a URL endpoint.
 */
async function checkUrlHealth(
  url: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute the ai_health tool.
 */
export async function executeAiHealth(
  args: AiHealthInput
): Promise<AiHealthResponse> {
  const services: ServiceStatus[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // VPS Qwen (llama.cpp)
  // ─────────────────────────────────────────────────────────────────────────
  const qwenUrl = config.qwenInference?.endpoint;
  if (qwenUrl && config.qwenInference?.enabled) {
    // Try to reach the health endpoint
    const healthUrl = qwenUrl.replace(/\/v1\/?$/, '/health').replace(/\/+$/, '');
    const health = await checkUrlHealth(healthUrl, 3000);

    // Check circuit breaker state
    const circuitStates = getAllCircuitStates();
    const qwenCircuit = circuitStates.find(c => c.name === 'qwen_inference');

    let status: ServiceStatus['status'] = 'unchecked';
    let message: string | undefined;

    if (qwenCircuit?.state === 'open') {
      status = 'unavailable';
      message = 'Circuit breaker OPEN - service temporarily blocked';
    } else if (qwenCircuit?.state === 'half_open') {
      status = 'degraded';
      message = 'Circuit breaker HALF_OPEN - testing recovery';
    } else if (health.ok) {
      status = 'healthy';
      message = `Responding in ${health.latencyMs}ms`;
    } else {
      status = 'unavailable';
      message = health.error || 'Health check failed';
    }

    services.push({
      name: 'VPS Qwen (llama.cpp)',
      configured: true,
      status,
      message,
      details: args.verbose
        ? {
            url: qwenUrl,
            health_latency_ms: health.latencyMs,
            circuit_state: qwenCircuit?.state || 'unknown',
            recent_failures: qwenCircuit?.failures || 0,
          }
        : undefined,
    });
  } else {
    services.push({
      name: 'VPS Qwen (llama.cpp)',
      configured: false,
      status: 'unavailable',
      message: 'Not configured (set QWEN_API_URL)',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Together.ai
  // ─────────────────────────────────────────────────────────────────────────
  const togetherEnabled = config.togetherAi?.enabled;
  if (togetherEnabled) {
    // Check circuit breaker state
    const circuitStates = getAllCircuitStates();
    const togetherCircuit = circuitStates.find(c => c.name === 'together_inference');

    let status: ServiceStatus['status'] = 'healthy';
    let message = 'API key configured';

    if (togetherCircuit?.state === 'open') {
      status = 'unavailable';
      message = 'Circuit breaker OPEN - service temporarily blocked';
    } else if (togetherCircuit?.state === 'half_open') {
      status = 'degraded';
      message = 'Circuit breaker HALF_OPEN - testing recovery';
    }

    services.push({
      name: 'Together.ai',
      configured: true,
      status,
      message,
      details: args.verbose
        ? {
            circuit_state: togetherCircuit?.state || 'closed',
            recent_failures: togetherCircuit?.failures || 0,
          }
        : undefined,
    });
  } else {
    services.push({
      name: 'Together.ai',
      configured: false,
      status: 'unavailable',
      message: 'Not configured (set TOGETHER_API_KEY)',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Semantic Engine (offline, always available)
  // ─────────────────────────────────────────────────────────────────────────
  services.push({
    name: 'Semantic Engine',
    configured: true,
    status: 'healthy',
    message: 'Always available (offline, rule-based)',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Determine overall status and active source
  // ─────────────────────────────────────────────────────────────────────────
  const healthyServices = services.filter(s => s.status === 'healthy');
  const degradedServices = services.filter(s => s.status === 'degraded');

  let overall_status: AiHealthResponse['overall_status'];
  if (healthyServices.length >= 2) {
    overall_status = 'healthy';
  } else if (healthyServices.length >= 1 || degradedServices.length >= 1) {
    overall_status = 'degraded';
  } else {
    overall_status = 'unavailable';
  }

  // Determine which source will be used (priority order)
  let active_source = 'Semantic Engine (fallback)';
  const qwenService = services.find(s => s.name.includes('Qwen'));
  const togetherService = services.find(s => s.name.includes('Together'));

  if (qwenService?.status === 'healthy') {
    active_source = 'VPS Qwen (primary)';
  } else if (togetherService?.status === 'healthy') {
    active_source = 'Together.ai (fallback)';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build response
  // ─────────────────────────────────────────────────────────────────────────
  const response: AiHealthResponse = {
    overall_status,
    services,
    active_source,
  };

  if (args.verbose) {
    response.circuit_breakers = getAllCircuitStates();
    response.adaptive_limiters = getAllAdaptiveStates();

    // Add relevant metrics
    const metrics = getMetricsSummary();
    response.metrics_summary = {
      qwen_latency: metrics.histograms?.['circuit_qwen_inference_latency'],
      together_latency: metrics.histograms?.['circuit_together_inference_latency'],
      ai_counters: Object.entries(metrics.counters)
        .filter(([key]) => key.includes('circuit_') || key.includes('adaptive_'))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
    };
  }

  return response;
}
