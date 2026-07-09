import { getExposedTools, DEFAULT_TOOL_NAMES } from '../../src/toolset';

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
