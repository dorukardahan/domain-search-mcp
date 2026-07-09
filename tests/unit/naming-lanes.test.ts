import { LANES, getLane } from '../../src/naming/lanes';

describe('naming lanes', () => {
  it('defines exactly 8 lanes with unique keys', () => {
    expect(LANES).toHaveLength(8);
    expect(new Set(LANES.map((l) => l.key)).size).toBe(8);
  });
  it('every lane has a non-empty prompt fragment and weights summing to 1', () => {
    for (const lane of LANES) {
      expect(lane.promptFragment.length).toBeGreaterThan(20);
      const sum = lane.weights.slop + lane.weights.phon + lane.weights.distinct;
      expect(sum).toBeCloseTo(1, 5);
    }
  });
  it('getLane returns the requested lane', () => {
    expect(getLane('mythic').key).toBe('mythic');
  });
});
