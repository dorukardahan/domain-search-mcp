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
});
