import { slopPenalty } from './slop-filter.js';
import { phonaestheticScore } from './phonaesthetics.js';
import { distinctivenessScore } from './distinctiveness.js';
import { getLane } from './lanes.js';
import type { LaneKey, ScoredName, ScoreWeights } from './types.js';

// Calibrated against the golden set (tests/unit/naming-scorer.test.ts): AI-slop
// coinages (Nexify, Quantix, Novaflow, Techify) are pronounceable and not
// dictionary-adjacent, so phon/distinct alone score them ~100/~80 - the slop
// signal must dominate the default blend. With slop-filter's 55-point affix
// penalties: pair-hit slop lands ~27 (<40), single-affix slop lands ~59
// (midfield, <60), clean real-word names (Latch, Ember, Corda, Wombat)
// land 92-97 (>60).
const DEFAULT_WEIGHTS: ScoreWeights = { slop: 0.7, phon: 0.15, distinct: 0.15 };

export function scoreName(name: string, lane?: LaneKey): ScoredName {
  const w = lane ? getLane(lane).weights : DEFAULT_WEIGHTS;
  const slop = slopPenalty(name);
  const phon = phonaestheticScore(name);
  const distinct = distinctivenessScore(name);

  const slopScore = 100 - slop.penalty;
  const total = Math.round(slopScore * w.slop + phon.score * w.phon + distinct.score * w.distinct);

  const reasons: string[] = [];
  if (slop.hits.length === 0) reasons.push('no AI-slop patterns');
  else reasons.push(...slop.hits.map((h) => `slop: ${h}`));
  reasons.push(...phon.notes, ...distinct.notes);
  if (total >= 60 && phon.notes.length === 0 && slop.hits.length === 0) reasons.push('clean pronunciation and typing');

  return {
    name, lane: lane ?? null, total,
    breakdown: { slop: slopScore, phonaesthetics: phon.score, distinctiveness: distinct.score },
    reasons,
  };
}
