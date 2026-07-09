export type LaneKey =
  | 'literal' | 'evocative' | 'invented' | 'compound'
  | 'mythic' | 'playful' | 'premium' | 'weird';
export interface ScoreWeights { slop: number; phon: number; distinct: number; } // sums to 1
export interface NamingLane {
  key: LaneKey; label: string;
  promptFragment: string;   // injected into phase-1 generation instructions
  weights: ScoreWeights;
}
export interface ScoreBreakdown { slop: number; phonaesthetics: number; distinctiveness: number; }
// Coarse readability band for `total` - a bare 0-100 number reads as false
// precision, so every score also carries a band: >=70 strong, 40-69 middling,
// <40 weak (thresholds live as named constants in scorer.ts).
export type ScoreBand = 'strong' | 'middling' | 'weak';
export interface ScoredName {
  name: string; lane: LaneKey | null; total: number; // 0-100
  band: ScoreBand;
  breakdown: ScoreBreakdown; reasons: string[];
}
