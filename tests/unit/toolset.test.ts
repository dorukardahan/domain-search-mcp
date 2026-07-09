import { getExposedTools, SLIM_TOOL_NAMES } from '../../src/toolset';
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
  it('exposes all tools by default (v1.11.0 behavior restored)', () => {
    expect(getExposedTools(ALL as never, {})).toHaveLength(ALL.length);
  });

  it('exposes only the slim set with SLIM_TOOLS=true', () => {
    const names = getExposedTools(ALL as never, { SLIM_TOOLS: 'true' }).map((t) => t.name);
    expect(names.sort()).toEqual([...SLIM_TOOL_NAMES].sort());
  });

  it('SLIM_TOOLS=true + ADVANCED_TOOLS=true: deprecated ADVANCED_TOOLS alias overrides slim and forces full exposure', () => {
    expect(
      getExposedTools(ALL as never, { SLIM_TOOLS: 'true', ADVANCED_TOOLS: 'true' }),
    ).toHaveLength(ALL.length);
  });
});

describe('getExposedTools with real tool definitions', () => {
  // Same order as the TOOLS array in src/server.ts. Pins the default and slim
  // behavior to the REAL tool names: renaming a tool (e.g. ai_health) without
  // updating SLIM_TOOL_NAMES would silently shrink the slim profile below 6,
  // or a regression here would silently shrink the default ListTools below 12.
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

  it('default exposes all 12 real tools', () => {
    expect(getExposedTools(REAL_ALL as never, {})).toHaveLength(12);
  });

  it('SLIM_TOOLS=true matches SLIM_TOOL_NAMES against real definitions', () => {
    expect(
      getExposedTools(REAL_ALL as never, { SLIM_TOOLS: 'true' })
        .map((t) => t.name)
        .sort(),
    ).toEqual([...SLIM_TOOL_NAMES].sort());
  });

  it('SLIM_TOOLS=true + ADVANCED_TOOLS=true exposes all 12 real tools', () => {
    expect(
      getExposedTools(REAL_ALL as never, { SLIM_TOOLS: 'true', ADVANCED_TOOLS: 'true' }),
    ).toHaveLength(12);
  });
});
