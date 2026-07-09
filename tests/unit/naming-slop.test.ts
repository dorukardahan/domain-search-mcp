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
  // 55 via zen-/-ix/syn-/meta- affixes). The waiver is corpus-membership
  // based (task-2): only Phoenix and Matrix are verified members of the
  // regenerated data/common-words.json (built from
  // google-10000-english-no-swears, full filtered list, no top-5000 cut).
  // Zenith, Synergy, and Metaphor are genuinely absent from that source
  // list (confirmed against the raw downloaded file) and are NOT
  // hand-injected per task instructions -- see task-2-report.md for the
  // full gap writeup.
  it.each(['Phoenix', 'Matrix'])(
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
