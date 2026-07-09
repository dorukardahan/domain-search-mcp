import { phonaestheticScore, countSyllables } from '../../src/naming/phonaesthetics';

describe('countSyllables', () => {
  it.each([['ember', 2], ['latch', 1], ['fable', 2], ['corda', 2]])('%s -> %i', (w, n) => {
    expect(countSyllables(w)).toBe(n);
  });
});

describe('phonaestheticScore', () => {
  it('scores pronounceable 1-3 syllable names above 60', () => {
    for (const name of ['Ember', 'Latch', 'Wombat', 'Corda']) {
      expect(phonaestheticScore(name).score).toBeGreaterThan(60);
    }
  });
  it('punishes unpronounceable clusters and extreme length', () => {
    expect(phonaestheticScore('Xkrztq').score).toBeLessThan(40);
    expect(phonaestheticScore('Supercalifragilisticname').score).toBeLessThan(50);
  });
  it('notes typo risk for ambiguous letter shapes', () => {
    const { notes } = phonaestheticScore('Kornrn');
    expect(notes.join(' ')).toMatch(/typo|confus/i);
  });
});
