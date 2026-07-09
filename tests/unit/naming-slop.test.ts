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

  // Real dictionary words must not draw slop AFFIX penalties (mythic
  // landmine: Zenith, Phoenix, Matrix, Synergy, Metaphor previously scored
  // 55 via zen-/-ix/syn-/meta- affixes). The waiver checks the broad
  // real-word dictionary data/english-words.json (hermitdave/FrequencyWords
  // en_50k), NOT the 10k common-words list distinctiveness uses. All five
  // names are verified members of the generated 50k corpus (task-2
  // amendment; see task-2-report.md).
  it.each(['Zenith', 'Phoenix', 'Matrix', 'Synergy', 'Metaphor'])(
    'waives affix penalty for real dictionary word %s (penalty === 0)',
    (name) => {
      expect(slopPenalty(name).penalty).toBe(0);
    },
  );

  it.each(['Zenlab', 'Metacore', 'Novastack'])(
    'does not waive penalty for non-corpus coinage %s (unaffected by waiver)',
    (name) => {
      expect(slopPenalty(name).penalty).toBeGreaterThan(0);
    },
  );
});
