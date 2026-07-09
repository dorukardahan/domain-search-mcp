// tests/unit/naming-distinctiveness.test.ts
import { distinctivenessScore } from '../../src/naming/distinctiveness';

describe('distinctivenessScore', () => {
  it('marks exact common words as low-distinctiveness', () => {
    expect(distinctivenessScore('house').score).toBeLessThan(40);
  });
  it('rewards coined-but-clean names', () => {
    expect(distinctivenessScore('corda').score).toBeGreaterThan(60);
  });
  it('penalizes 1-edit-distance shadows of common words', () => {
    const shadow = distinctivenessScore('housse'); // house + 1 edit
    expect(shadow.score).toBeLessThan(distinctivenessScore('corda').score);
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
