import { slopPenalty } from '../../src/naming/slop-filter';

describe('slopPenalty', () => {
  it.each(['Nexify', 'Novaflow', 'Techify', 'Quantix', 'SynergyLabs', 'AetherForge'])(
    'flags classic AI-slop name %s with penalty >= 50',
    (name) => {
      const { penalty, hits } = slopPenalty(name);
      expect(penalty).toBeGreaterThanOrEqual(50);
      expect(hits.length).toBeGreaterThan(0);
    },
  );
  it.each(['Latch', 'Ember', 'Wombat', 'Corda'])('leaves clean name %s at penalty < 20', (name) => {
    expect(slopPenalty(name).penalty).toBeLessThan(20);
  });
  it('reports which patterns hit', () => {
    expect(slopPenalty('Nexify').hits.join(' ')).toMatch(/prefix|suffix/i);
  });
  it.each(['Dubai', 'Latex', 'Rolex', 'Complex'])(
    'does not false-positive on real word %s (penalty < 20)',
    (name) => {
      expect(slopPenalty(name).penalty).toBeLessThan(20);
    },
  );
});
