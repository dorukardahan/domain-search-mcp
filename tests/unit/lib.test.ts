// tests/unit/lib.test.ts
/** Library entry must expose engine functions without booting the server. */
describe('library entry (src/lib)', () => {
  it('exposes searchDomain and executeCheckSocials', () => {
    const lib = require('../../src/lib');
    expect(typeof lib.searchDomain).toBe('function');
    expect(typeof lib.executeCheckSocials).toBe('function');
  });

  it('exposes the naming engine', () => {
    const lib = require('../../src/lib');
    expect(typeof lib.scoreName).toBe('function');
    expect(typeof lib.clearName).toBe('function');
    expect(Array.isArray(lib.LANES)).toBe(true);
  });
});
