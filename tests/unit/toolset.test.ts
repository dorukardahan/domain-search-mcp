import { getExposedTools, DEFAULT_TOOL_NAMES } from '../../src/toolset';
import {
  nameProjectTool,
  searchDomainTool,
  bulkSearchTool,
  compareRegistrarsTool,
  suggestDomainsTool,
  suggestDomainsSmartTool,
  tldInfoTool,
  checkSocialsTool,
  analyzeProjectTool,
  huntDomainsTool,
  expiringDomainsTool,
  aiHealthTool,
} from '../../src/tools';

const fake = (name: string) => ({ name, description: '', inputSchema: { type: 'object' } });
const ALL = ['name_project', 'search_domain', 'bulk_search', 'check_socials', 'tld_info', 'ai_health',
  'hunt_domains', 'compare_registrars', 'expiring_domains', 'analyze_project', 'suggest_domains', 'suggest_domains_smart',
].map(fake);

describe('getExposedTools', () => {
  it('exposes only the slim set by default', () => {
    const names = getExposedTools(ALL as never, {}).map((t) => t.name);
    expect(names.sort()).toEqual([...DEFAULT_TOOL_NAMES].sort());
  });
  it('exposes everything with ADVANCED_TOOLS=true', () => {
    expect(getExposedTools(ALL as never, { ADVANCED_TOOLS: 'true' })).toHaveLength(ALL.length);
  });
});

describe('getExposedTools with real tool definitions', () => {
  // Same order as the TOOLS array in src/server.ts. Pins the slim default to the
  // REAL tool names: renaming a tool (e.g. ai_health) without updating
  // DEFAULT_TOOL_NAMES would silently shrink the default ListTools below 6.
  const REAL_ALL = [
    nameProjectTool,
    searchDomainTool,
    bulkSearchTool,
    compareRegistrarsTool,
    suggestDomainsTool,
    suggestDomainsSmartTool,
    tldInfoTool,
    checkSocialsTool,
    analyzeProjectTool,
    huntDomainsTool,
    expiringDomainsTool,
    aiHealthTool,
  ];

  it('slim default matches DEFAULT_TOOL_NAMES against real definitions', () => {
    expect(
      getExposedTools(REAL_ALL as never, {})
        .map((t) => t.name)
        .sort(),
    ).toEqual([...DEFAULT_TOOL_NAMES].sort());
  });

  it('ADVANCED_TOOLS=true exposes all 12 real tools', () => {
    expect(getExposedTools(REAL_ALL as never, { ADVANCED_TOOLS: 'true' })).toHaveLength(12);
  });
});
