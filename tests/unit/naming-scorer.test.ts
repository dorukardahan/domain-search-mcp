import { scoreName } from '../../src/naming/scorer';

const SLOP = ['Nexify', 'Quantix', 'Novaflow', 'Techify'];
const GOOD = ['Latch', 'Ember', 'Corda', 'Wombat'];

describe('scoreName golden set', () => {
  it.each(SLOP)('slop name %s scores below 40', (n) => {
    expect(scoreName(n).total).toBeLessThan(40);
  });
  it.each(GOOD)('good name %s scores above 60', (n) => {
    expect(scoreName(n).total).toBeGreaterThan(60);
  });
  it('produces a breakdown and human-readable reasons', () => {
    const s = scoreName('Nexify', 'invented');
    expect(s.lane).toBe('invented');
    expect(s.breakdown.slop).toBeLessThan(50);
    expect(s.reasons.length).toBeGreaterThan(0);
  });
});
