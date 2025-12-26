/**
 * Structured JSON Logger with Secret Masking.
 *
 * - Outputs JSON for easy parsing
 * - Masks API keys and secrets automatically
 * - Includes request IDs for tracing
 */

import { config } from '../config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  [key: string]: unknown;
}

/**
 * Patterns that look like API keys or secrets.
 * These will be masked in log output.
 */
const SECRET_PATTERNS = [
  // Long alphanumeric strings (likely API keys)
  /\b[a-zA-Z0-9]{32,}\b/g,
  // Patterns that look like secrets
  /(?:api[_-]?key|secret|password|token)[\s:="']+[^\s"']+/gi,
];

/**
 * Mask sensitive data in a value.
 */
function maskSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    let masked = value;
    for (const pattern of SECRET_PATTERNS) {
      masked = masked.replace(pattern, '[REDACTED]');
    }
    return masked;
  }

  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }

  if (value && typeof value === 'object') {
    const maskedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Always mask keys that look like secrets
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('token')
      ) {
        maskedObj[key] = '[REDACTED]';
      } else {
        maskedObj[key] = maskSecrets(val);
      }
    }
    return maskedObj;
  }

  return value;
}

/**
 * Log level priority for filtering.
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Should this level be logged?
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel];
}

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Current request context (for tracing).
 */
let currentRequestId: string | undefined;

export function setRequestId(id: string): void {
  currentRequestId = id;
}

export function clearRequestId(): void {
  currentRequestId = undefined;
}

/**
 * Core logging function.
 */
function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (currentRequestId) {
    entry.request_id = currentRequestId;
  }

  // Add and mask additional data
  if (data) {
    const masked = maskSecrets(data) as Record<string, unknown>;
    Object.assign(entry, masked);
  }

  // Output to stderr (MCP servers use stdout for protocol)
  console.error(JSON.stringify(entry));
}

/**
 * Logger instance with convenience methods.
 */
export const logger = {
  debug: (message: string, data?: Record<string, unknown>) =>
    log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) =>
    log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) =>
    log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) =>
    log('error', message, data),

  /**
   * Log an error with stack trace.
   */
  logError: (message: string, error: Error, data?: Record<string, unknown>) => {
    log('error', message, {
      ...data,
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    });
  },
};
