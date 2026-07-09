/**
 * Unit tests for configuration loading.
 *
 * Focus: the Qwen inference endpoint is opt-in (no hardcoded default) and the
 * SSRF URL validator requires HTTPS for public hosts while allowing plain HTTP
 * for loopback/private (RFC1918) self-hosted inference endpoints.
 *
 * dotenv is mocked so a developer's local .env cannot pollute these assertions.
 */

// Prevent .env from loading into process.env during tests.
jest.mock('dotenv', () => ({ config: jest.fn() }));

import { loadConfig } from '../../src/config';

const QWEN_ENV = 'QWEN_INFERENCE_ENDPOINT';

describe('loadConfig - Qwen inference endpoint (opt-in, no default)', () => {
  const original = process.env[QWEN_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[QWEN_ENV];
    else process.env[QWEN_ENV] = original;
  });

  it('is disabled with no endpoint when QWEN_INFERENCE_ENDPOINT is unset', () => {
    delete process.env[QWEN_ENV];
    const cfg = loadConfig();
    expect(cfg.qwenInference?.enabled).toBe(false);
    expect(cfg.qwenInference?.endpoint).toBeUndefined();
  });

  it('enables and keeps a public HTTPS endpoint', () => {
    process.env[QWEN_ENV] = 'https://inference.example.com';
    const cfg = loadConfig();
    expect(cfg.qwenInference?.enabled).toBe(true);
    expect(cfg.qwenInference?.endpoint).toBe('https://inference.example.com');
  });

  it('rejects a public HTTP endpoint (HTTPS required for public hosts)', () => {
    process.env[QWEN_ENV] = 'http://inference.example.com';
    const cfg = loadConfig();
    expect(cfg.qwenInference?.enabled).toBe(false);
    expect(cfg.qwenInference?.endpoint).toBeUndefined();
  });

  it('accepts a loopback HTTP endpoint (the 127.0.0.1:8070 deployment case)', () => {
    process.env[QWEN_ENV] = 'http://127.0.0.1:8070';
    const cfg = loadConfig();
    expect(cfg.qwenInference?.enabled).toBe(true);
    expect(cfg.qwenInference?.endpoint).toBe('http://127.0.0.1:8070');
  });

  it('accepts a private/RFC1918 HTTP endpoint for self-hosted LAN inference', () => {
    process.env[QWEN_ENV] = 'http://192.168.1.50:8000';
    const cfg = loadConfig();
    expect(cfg.qwenInference?.enabled).toBe(true);
    expect(cfg.qwenInference?.endpoint).toBe('http://192.168.1.50:8000');
  });

  it('never falls back to a hardcoded default endpoint (dead-IP regression guard)', () => {
    delete process.env[QWEN_ENV];
    const cfg = loadConfig();
    // No default endpoint of any kind — the cancelled VPS default is gone.
    expect(cfg.qwenInference?.endpoint).toBeUndefined();
    expect(cfg.qwenInference?.enabled).toBe(false);
  });
});

describe('loadConfig - pricing API and negative cache URLs (self-host friendly)', () => {
  const PRICING_ENV = 'PRICING_API_BASE_URL';
  const NC_URL_ENV = 'NEGATIVE_CACHE_URL';
  const NC_ENABLED_ENV = 'NEGATIVE_CACHE_ENABLED';
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [PRICING_ENV, NC_URL_ENV, NC_ENABLED_ENV]) {
      originals[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [PRICING_ENV, NC_URL_ENV, NC_ENABLED_ENV]) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  });

  it('accepts a loopback HTTP pricing backend (the 127.0.0.1:3003 deployment case)', () => {
    process.env[PRICING_ENV] = 'http://127.0.0.1:3003';
    const cfg = loadConfig();
    expect(cfg.pricingApi?.enabled).toBe(true);
    expect(cfg.pricingApi?.baseUrl).toBe('http://127.0.0.1:3003');
  });

  it('accepts a private/RFC1918 HTTP pricing backend for self-hosted setups', () => {
    process.env[PRICING_ENV] = 'http://192.168.1.20:3003';
    const cfg = loadConfig();
    expect(cfg.pricingApi?.enabled).toBe(true);
    expect(cfg.pricingApi?.baseUrl).toBe('http://192.168.1.20:3003');
  });

  it('rejects a public HTTP pricing backend (HTTPS required for public hosts)', () => {
    process.env[PRICING_ENV] = 'http://pricing.example.com';
    const cfg = loadConfig();
    expect(cfg.pricingApi?.enabled).toBe(false);
    expect(cfg.pricingApi?.baseUrl).toBeUndefined();
  });

  it('accepts a loopback HTTP negative cache backend when enabled', () => {
    process.env[NC_ENABLED_ENV] = 'true';
    process.env[NC_URL_ENV] = 'http://127.0.0.1:3000';
    const cfg = loadConfig();
    expect(cfg.negativeCache?.enabled).toBe(true);
    expect(cfg.negativeCache?.baseUrl).toBe('http://127.0.0.1:3000');
  });

  it('rejects a public HTTP negative cache backend even when enabled', () => {
    process.env[NC_ENABLED_ENV] = 'true';
    process.env[NC_URL_ENV] = 'http://cache.example.com';
    const cfg = loadConfig();
    expect(cfg.negativeCache?.enabled).toBe(false);
    expect(cfg.negativeCache?.baseUrl).toBeUndefined();
  });
});

describe('getAvailableSources - qwen_inference listing', () => {
  const original = process.env[QWEN_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[QWEN_ENV];
    else process.env[QWEN_ENV] = original;
    jest.resetModules();
  });

  it('omits qwen_inference when no endpoint is configured', () => {
    delete process.env[QWEN_ENV];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAvailableSources } = require('../../src/config');
    expect(getAvailableSources()).not.toContain('qwen_inference');
  });

  it('lists qwen_inference only when the endpoint is enabled', () => {
    process.env[QWEN_ENV] = 'http://127.0.0.1:8070';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAvailableSources } = require('../../src/config');
    expect(getAvailableSources()).toContain('qwen_inference');
  });
});
