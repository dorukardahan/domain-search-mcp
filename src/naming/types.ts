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
export interface ScoredName {
  name: string; lane: LaneKey | null; total: number; // 0-100
  breakdown: ScoreBreakdown; reasons: string[];
}
