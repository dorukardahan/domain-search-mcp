/**
 * Unit Tests for TTL Cache.
 */

import { TtlCache, domainCacheKey, tldCacheKey, getOrCompute } from '../../src/utils/cache';

describe('TtlCache', () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    cache = new TtlCache<string>(1); // 1 second TTL
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should track cache size', () => {
    expect(cache.size).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);
  });

  it('should delete keys', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    cache.delete('key1');
    expect(cache.has('key1')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should allow custom TTL per entry', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    expect(cache.get('key1')).toBe('value1');

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBeUndefined();
  });
});

describe('Cache Key Generators', () => {
  it('should generate domain cache keys', () => {
    expect(domainCacheKey('vibecoding.com', 'porkbun')).toBe(
      'domain:vibecoding.com:porkbun',
    );
    expect(domainCacheKey('TEST.IO', 'rdap')).toBe('domain:test.io:rdap');
  });

  it('should generate TLD cache keys', () => {
    expect(tldCacheKey('com')).toBe('tld:com');
    expect(tldCacheKey('IO')).toBe('tld:io');
  });
});

describe('getOrCompute', () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    cache = new TtlCache<string>(60);
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should compute and cache value on first call', async () => {
    let computeCount = 0;
    const compute = async () => {
      computeCount++;
      return 'computed';
    };

    const result = await getOrCompute(cache, 'key1', compute);

    expect(result.value).toBe('computed');
    expect(result.fromCache).toBe(false);
    expect(computeCount).toBe(1);
  });

  it('should return cached value on subsequent calls', async () => {
    let computeCount = 0;
    const compute = async () => {
      computeCount++;
      return 'computed';
    };

    await getOrCompute(cache, 'key1', compute);
    const result = await getOrCompute(cache, 'key1', compute);

    expect(result.value).toBe('computed');
    expect(result.fromCache).toBe(true);
    expect(computeCount).toBe(1); // Compute only called once
  });
});
