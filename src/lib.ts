/**
 * Library entry point. Import surface for programmatic consumers
 * (e.g. the web app backend). Importing this file must have no side
 * effects: no transport boot, no stdin reads.
 */
export { searchDomain } from './services/domain-search.js';
export { executeCheckSocials, checkSocialsSchema } from './tools/check_socials.js';
export { executeBulkSearch } from './tools/bulk_search.js';
export type {
  DomainResult,
  SearchResponse,
  SocialHandleResult,
  SocialPlatform,
} from './types.js';
export { scoreName } from './naming/scorer.js';
export { CLEARANCE_LOG_POLICY_VERSION, clearName } from './naming/clearance.js';
export type { ClearanceOptions, ClearanceReport, ClearanceTargets } from './naming/clearance.js';
export { LANES, getLane } from './naming/lanes.js';
export { slopPenalty } from './naming/slop-filter.js';
export { phonaestheticScore } from './naming/phonaesthetics.js';
export { distinctivenessScore } from './naming/distinctiveness.js';
export type { LaneKey, NamingLane, ScoredName, ScoreBand, ScoreBreakdown, ScoreWeights } from './naming/types.js';
