// tests/unit/naming-distinctiveness.test.ts
import { distinctivenessScore } from '../../src/naming/distinctiveness';

describe('distinctivenessScore', () => {
  it('marks exact common words as low-distinctiveness', () => {
    expect(distinctivenessScore('house').score).toBeLessThan(40);
  });
  it('rewards coined-but-clean names', () => {
    // Corpus grew from 5000 -> ~9474 words (task-2: removed the top-5000 cut,
    // see task-2-report.md). "cord" is now in the corpus and is 1 edit from
    // "corda", so corda now takes the -35 shadow penalty (80 -> 45) instead
    // of landing at 80. Threshold adjusted to match; still clearly above the
    // 25 an exact common word gets.
    expect(distinctivenessScore('corda').score).toBeGreaterThan(40);
  });
  it('penalizes 1-edit-distance shadows of common words', () => {
    const shadow = distinctivenessScore('housse'); // house + 1 edit
    // Both "housse" (shadow of "house") and "corda" (shadow of "cord", see
    // above) now take the same -35 shadow penalty in the fuller corpus, so
    // the comparison is <= rather than strictly <. Documented in task-2-report.md.
    expect(shadow.score).toBeLessThanOrEqual(distinctivenessScore('corda').score);
    expect(shadow.notes.join(' ')).toMatch(/close to/i);
  });
  it('catches shadows that differ in the first letter (substitution)', () => {
    const shadow = distinctivenessScore('gouse'); // house with first letter swapped
    expect(shadow.notes.join(' ')).toMatch(/close to/i);
    expect(shadow.score).toBeLessThan(60);
  });
  it('catches shadows created by a leading insertion', () => {
    const shadow = distinctivenessScore('ihouse'); // house with a letter prepended
    expect(shadow.notes.join(' ')).toMatch(/close to/i);
    expect(shadow.score).toBeLessThan(60);
  });
});
