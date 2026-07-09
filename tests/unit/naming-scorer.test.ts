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

const SINGLE_AFFIX_SLOP = ['Zenlab', 'Metacore', 'Novastack'];

describe('scoreName single-affix slop regression', () => {
  it.each(SINGLE_AFFIX_SLOP)('single-affix slop name %s lands below 60 (midfield, not good)', (n) => {
    expect(scoreName(n).total).toBeLessThan(60);
  });
  it.each(SINGLE_AFFIX_SLOP)('%s is not praised for clean pronunciation despite slop hits', (n) => {
    expect(scoreName(n).reasons).not.toContain('clean pronunciation and typing');
  });
});

// Real-word waiver golden set (task-2 + amendment): the waiver checks the
// broad data/english-words.json dictionary (hermitdave/FrequencyWords
// en_50k); all five names are verified members of that generated corpus
// (see task-2-report.md). Zenlab/Metacore/Novastack are coinages, not
// corpus words, so they must stay midfield (< 60) unaffected by the waiver.
const REAL_WORD_WAIVER = ['Zenith', 'Phoenix', 'Matrix', 'Synergy', 'Metaphor'];

describe('scoreName real-word waiver', () => {
  it.each(REAL_WORD_WAIVER)('real dictionary word %s scores above 60 (affix penalty waived)', (n) => {
    expect(scoreName(n).total).toBeGreaterThan(60);
  });
  it.each(SINGLE_AFFIX_SLOP)('non-corpus coinage %s stays below 60 (waiver does not apply)', (n) => {
    expect(scoreName(n).total).toBeLessThan(60);
  });
});
