/**
 * Unit Tests for Custom Errors.
 */

import {
  DomainSearchError,
  InvalidDomainError,
  UnsupportedTldError,
  RateLimitError,
  RegistrarApiError,
  AuthenticationError,
  NoSourceAvailableError,
  TimeoutError,
  ConfigurationError,
  wrapError,
} from '../../src/utils/errors';

describe('DomainSearchError', () => {
  it('should create error with all properties', () => {
    const error = new DomainSearchError(
      'TEST_CODE',
      'Technical message',
      'User-friendly message',
      {
        retryable: true,
        suggestedAction: 'Try again',
      },
    );

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Technical message');
    expect(error.userMessage).toBe('User-friendly message');
    expect(error.retryable).toBe(true);
    expect(error.suggestedAction).toBe('Try again');
  });

  it('should convert to JSON correctly', () => {
    const error = new DomainSearchError(
      'TEST_CODE',
      'Technical message',
      'User-friendly message',
      { retryable: false },
    );

    const json = error.toJSON();

    expect(json).toEqual({
      code: 'TEST_CODE',
      message: 'User-friendly message',
      retryable: false,
      suggestedAction: undefined,
    });
  });
});

describe('InvalidDomainError', () => {
  it('should create with domain and reason', () => {
    const error = new InvalidDomainError('my_domain', 'Contains underscore');

    expect(error.code).toBe('INVALID_DOMAIN');
    expect(error.message).toContain('my_domain');
    expect(error.message).toContain('Contains underscore');
    expect(error.retryable).toBe(false);
  });
});

describe('UnsupportedTldError', () => {
  it('should create with TLD and suggestions', () => {
    const error = new UnsupportedTldError('xyz', ['com', 'io', 'dev']);

    expect(error.code).toBe('UNSUPPORTED_TLD');
    expect(error.message).toContain('.xyz');
    expect(error.suggestedAction).toContain('com');
    expect(error.retryable).toBe(false);
  });
});

describe('RateLimitError', () => {
  it('should create with registrar name', () => {
    const error = new RateLimitError('porkbun');

    expect(error.code).toBe('RATE_LIMIT');
    expect(error.message).toContain('porkbun');
    expect(error.retryable).toBe(true);
  });

  it('should include retry-after time', () => {
    const error = new RateLimitError('porkbun', 30);

    expect(error.suggestedAction).toContain('30 seconds');
    expect(error.retryAfter).toBeDefined();
  });
});

describe('RegistrarApiError', () => {
  it('should create with registrar and message', () => {
    const error = new RegistrarApiError('namecheap', 'Connection failed');

    expect(error.code).toBe('REGISTRAR_API_ERROR');
    expect(error.message).toContain('namecheap');
    expect(error.message).toContain('Connection failed');
  });

  it('should be retryable for server errors', () => {
    const error = new RegistrarApiError('porkbun', 'Server error', 503);

    expect(error.retryable).toBe(true);
    expect(error.statusCode).toBe(503);
  });

  it('should not be retryable for client errors', () => {
    const error = new RegistrarApiError('porkbun', 'Bad request', 400);

    expect(error.retryable).toBe(false);
    expect(error.statusCode).toBe(400);
  });
});

describe('AuthenticationError', () => {
  it('should create with registrar name', () => {
    const error = new AuthenticationError('porkbun');

    expect(error.code).toBe('AUTH_ERROR');
    expect(error.message).toContain('porkbun');
    expect(error.suggestedAction).toContain('PORKBUN_API_KEY');
  });
});

describe('NoSourceAvailableError', () => {
  it('should list tried sources', () => {
    const error = new NoSourceAvailableError('example.com', [
      'porkbun',
      'rdap',
      'whois',
    ]);

    expect(error.code).toBe('NO_SOURCE_AVAILABLE');
    expect(error.message).toContain('porkbun');
    expect(error.message).toContain('rdap');
    expect(error.message).toContain('whois');
    expect(error.retryable).toBe(true);
  });
});

describe('TimeoutError', () => {
  it('should include operation and timeout', () => {
    const error = new TimeoutError('API call', 5000);

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toContain('API call');
    expect(error.message).toContain('5000');
    expect(error.retryable).toBe(true);
  });
});

describe('ConfigurationError', () => {
  it('should include missing config and fix', () => {
    const error = new ConfigurationError('API_KEY', 'Add it to .env file');

    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.message).toContain('API_KEY');
    expect(error.suggestedAction).toBe('Add it to .env file');
    expect(error.retryable).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return DomainSearchError as-is', () => {
    const original = new InvalidDomainError('test', 'reason');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should wrap regular Error', () => {
    const original = new Error('Something failed');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(DomainSearchError);
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
    expect(wrapped.message).toBe('Something failed');
  });

  it('should wrap string errors', () => {
    const wrapped = wrapError('String error');

    expect(wrapped).toBeInstanceOf(DomainSearchError);
    expect(wrapped.message).toBe('String error');
  });
});
