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
