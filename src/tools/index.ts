/**
 * Tool Exports.
 */

export {
  searchDomainTool,
  searchDomainSchema,
  executeSearchDomain,
  type SearchDomainInput,
} from './search_domain.js';

export {
  bulkSearchTool,
  bulkSearchSchema,
  executeBulkSearch,
  type BulkSearchInput,
} from './bulk_search.js';

export {
  compareRegistrarsTool,
  compareRegistrarsSchema,
  executeCompareRegistrars,
  type CompareRegistrarsInput,
} from './compare_registrars.js';

export {
  suggestDomainsTool,
  suggestDomainsSchema,
  executeSuggestDomains,
  type SuggestDomainsInput,
} from './suggest_domains.js';

export {
  suggestDomainsSmartTool,
  suggestDomainsSmartSchema,
  executeSuggestDomainsSmart,
  type SuggestDomainsSmartInput,
} from './suggest_domains_smart.js';

export {
  tldInfoTool,
  tldInfoSchema,
  executeTldInfo,
  type TldInfoInput,
} from './tld_info.js';

export {
  checkSocialsTool,
  checkSocialsSchema,
  executeCheckSocials,
  type CheckSocialsInput,
} from './check_socials.js';
