import { parseSedoLine, parseSedoFeed } from '../../src/aftermarket/sedo';

describe('parseSedoLine', () => {
  it('parses a valid Sedo feed line', () => {
    const line = 'example.com;1700000000;1700003600;99.5;USD;';
    const result = parseSedoLine(line);

    expect(result).not.toBeNull();
    expect(result?.domain).toBe('example.com');
    expect(result?.price).toBe(99.5);
    expect(result?.currency).toBe('USD');
    expect(result?.auction_end).toMatch(/T/);
    expect(result?.url).toContain('sedo.com');
  });

  it('returns null for invalid lines', () => {
    expect(parseSedoLine('')).toBeNull();
    expect(parseSedoLine('invalid')).toBeNull();
  });
});

describe('parseSedoFeed', () => {
  it('builds an index from multiple lines', () => {
    const feed = [
      'alpha.com;1700000000;1700003600;50;USD;',
      'beta.net;1700000000;1700003600;;EUR;',
      '',
    ].join('\n');

    const index = parseSedoFeed(feed);
    expect(index.get('alpha.com')?.price).toBe(50);
    expect(index.get('beta.net')?.price).toBeNull();
  });
});
