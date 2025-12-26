/**
 * Unit Tests for TLD Info Tool.
 */

import { executeTldInfo } from '../../src/tools/tld_info';

describe('executeTldInfo', () => {
  it('should return info for common TLDs', async () => {
    const result = await executeTldInfo({ tld: 'com', detailed: false });

    expect(result.tld).toBe('com');
    expect(result.description).toContain('Commercial');
    expect(result.popularity).toBe('high');
    expect(result.category).toBe('generic');
    expect(result.price_range).toBeDefined();
    expect(result.insights).toBeInstanceOf(Array);
    expect(result.recommendation).toBeDefined();
  });

  it('should return info for tech TLDs', async () => {
    const result = await executeTldInfo({ tld: 'io', detailed: false });

    expect(result.tld).toBe('io');
    expect(result.description).toContain('tech');
    expect(result.popularity).toBe('high');
  });

  it('should return info for dev TLD with restrictions', async () => {
    const result = await executeTldInfo({ tld: 'dev', detailed: false });

    expect(result.tld).toBe('dev');
    expect(result.restrictions).toContain('Requires HTTPS (HSTS preloaded)');
  });

  it('should normalize TLD input', async () => {
    const result = await executeTldInfo({ tld: '.COM', detailed: false });

    expect(result.tld).toBe('com');
  });

  it('should return generic info for unknown TLDs', async () => {
    const result = await executeTldInfo({ tld: 'xyz', detailed: false });

    expect(result.tld).toBe('xyz');
    expect(result.insights).toBeInstanceOf(Array);
  });

  it('should include price insights for cheap TLDs', async () => {
    const result = await executeTldInfo({ tld: 'xyz', detailed: false });

    const hasPriceInsight = result.insights.some((i) =>
      i.includes('Budget') || i.includes('$'),
    );
    expect(hasPriceInsight).toBe(true);
  });

  it('should include recommendations', async () => {
    const result = await executeTldInfo({ tld: 'ai', detailed: false });

    expect(result.recommendation).toContain('AI');
  });
});
