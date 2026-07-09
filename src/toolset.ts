import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * All 12 tools are exposed by default (matches v1.11.0 behavior). Set
 * SLIM_TOOLS=true to opt into this 6-tool slim profile, which keeps
 * client tool-selection sharp for simpler integrations.
 *
 * ADVANCED_TOOLS=true is a deprecated alias (predates SLIM_TOOLS) that
 * forces full exposure and overrides SLIM_TOOLS. Kept as a harmless
 * backward-compat no-op since the default is already full.
 */
export const SLIM_TOOL_NAMES = [
  'name_project', 'search_domain', 'bulk_search', 'check_socials', 'tld_info', 'ai_health',
] as const;

export function getExposedTools(allTools: Tool[], env: NodeJS.ProcessEnv): Tool[] {
  if (env.ADVANCED_TOOLS === 'true') return allTools;
  if (env.SLIM_TOOLS === 'true') {
    return allTools.filter((t) => (SLIM_TOOL_NAMES as readonly string[]).includes(t.name));
  }
  return allTools;
}
