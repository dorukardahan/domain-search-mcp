/**
 * Custom Error Classes for Domain Search MCP.
 *
 * These errors are designed to be:
 * 1. User-friendly (clear messages for non-developers)
 * 2. Actionable (suggest what to do next)
 * 3. Informative (include context for debugging)
 */

/**
 * Base error class for all domain search errors.
 */
export class DomainSearchError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** User-friendly message */
  readonly userMessage: string;
  /** Can this operation be retried? */
  readonly retryable: boolean;
  /** Suggested action for the user */
  readonly suggestedAction?: string;

  constructor(
    code: string,
    message: string,
    userMessage: string,
    options?: {
      retryable?: boolean;
      suggestedAction?: string;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'DomainSearchError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = options?.retryable ?? false;
    this.suggestedAction = options?.suggestedAction;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Convert to a plain object for JSON responses.
   */
  toJSON(): object {
    return {
      code: this.code,
      message: this.userMessage,
      retryable: this.retryable,
      suggestedAction: this.suggestedAction,
    };
  }
}

/**
 * Error when a domain name is invalid.
 */
export class InvalidDomainError extends DomainSearchError {
  constructor(domain: string, reason: string) {
    super(
      'INVALID_DOMAIN',
      `Invalid domain: ${domain} - ${reason}`,
      `The domain "${domain}" is not valid: ${reason}`,
      {
        retryable: false,
        suggestedAction:
          'Check the domain name for typos or invalid characters.',
      },
    );
    this.name = 'InvalidDomainError';
  }
}

/**
 * Error when a TLD is not supported.
 */
export class UnsupportedTldError extends DomainSearchError {
  constructor(tld: string, availableTlds: string[]) {
    const suggestion =
      availableTlds.length > 0
        ? `Try one of these: ${availableTlds.slice(0, 5).join(', ')}`
        : 'Contact support for TLD availability.';

    super(
      'UNSUPPORTED_TLD',
      `TLD not supported: .${tld}`,
      `The TLD ".${tld}" is not supported for searching.`,
      {
        retryable: false,
        suggestedAction: suggestion,
      },
    );
    this.name = 'UnsupportedTldError';
  }
}

/**
 * Error when an API rate limit is hit.
 */
export class RateLimitError extends DomainSearchError {
  /** When to retry (Unix timestamp) */
  readonly retryAfter?: number;

  constructor(registrar: string, retryAfterSeconds?: number) {
    super(
      'RATE_LIMIT',
      `Rate limit hit for ${registrar}`,
      `Too many requests to ${registrar}. Please slow down.`,
      {
        retryable: true,
        suggestedAction: retryAfterSeconds
          ? `Wait ${retryAfterSeconds} seconds before trying again.`
          : 'Wait a moment and try again, or check fewer domains at once.',
      },
    );
    this.name = 'RateLimitError';
    if (retryAfterSeconds) {
      this.retryAfter = Date.now() + retryAfterSeconds * 1000;
    }
  }
}

/**
 * Error when a registrar API fails.
 */
export class RegistrarApiError extends DomainSearchError {
  /** HTTP status code if available */
  readonly statusCode?: number;

  constructor(
    registrar: string,
    message: string,
    statusCode?: number,
    cause?: Error,
  ) {
    const isServerError = statusCode !== undefined && statusCode >= 500;

    super(
      'REGISTRAR_API_ERROR',
      `${registrar} API error: ${message}`,
      isServerError
        ? `${registrar} is experiencing issues. We'll try another source.`
        : `Could not check with ${registrar}: ${message}`,
      {
        retryable: isServerError,
        suggestedAction: isServerError
          ? 'The system will automatically try alternative sources.'
          : `Check your ${registrar} API configuration.`,
        cause,
      },
    );
    this.name = 'RegistrarApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Error when API credentials are missing or invalid.
 */
export class AuthenticationError extends DomainSearchError {
  constructor(registrar: string, reason?: string) {
    super(
      'AUTH_ERROR',
      `Authentication failed for ${registrar}: ${reason || 'Invalid credentials'}`,
      `Could not authenticate with ${registrar}.`,
      {
        retryable: false,
        suggestedAction: `Check your ${registrar.toUpperCase()}_API_KEY and ${registrar.toUpperCase()}_API_SECRET in your .env file.`,
      },
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Error when no data source is available.
 */
export class NoSourceAvailableError extends DomainSearchError {
  constructor(domain: string, triedSources: string[]) {
    super(
      'NO_SOURCE_AVAILABLE',
      `No source available for ${domain}. Tried: ${triedSources.join(', ')}`,
      `Could not check availability for "${domain}". All sources failed.`,
      {
        retryable: true,
        suggestedAction:
          'Try again in a few minutes, or check the domain manually at a registrar website.',
      },
    );
    this.name = 'NoSourceAvailableError';
  }
}

/**
 * Error when a network request times out.
 */
export class TimeoutError extends DomainSearchError {
  constructor(operation: string, timeoutMs: number) {
    super(
      'TIMEOUT',
      `Operation timed out: ${operation} (${timeoutMs}ms)`,
      `The request took too long to complete.`,
      {
        retryable: true,
        suggestedAction: 'Try again - this might be a temporary network issue.',
      },
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Error when a required configuration is missing.
 */
export class ConfigurationError extends DomainSearchError {
  constructor(missing: string, howToFix: string) {
    super(
      'CONFIG_ERROR',
      `Missing configuration: ${missing}`,
      `Server configuration is incomplete.`,
      {
        retryable: false,
        suggestedAction: howToFix,
      },
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * Convert any error to a DomainSearchError.
 */
export function wrapError(error: unknown): DomainSearchError {
  if (error instanceof DomainSearchError) {
    return error;
  }

  if (error instanceof Error) {
    return new DomainSearchError(
      'UNKNOWN_ERROR',
      error.message,
      'An unexpected error occurred.',
      {
        retryable: true,
        suggestedAction: 'Try again or contact support if the issue persists.',
        cause: error,
      },
    );
  }

  return new DomainSearchError(
    'UNKNOWN_ERROR',
    String(error),
    'An unexpected error occurred.',
    {
      retryable: true,
      suggestedAction: 'Try again or contact support if the issue persists.',
    },
  );
}
