import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/** Slim default keeps client tool-selection sharp; ADVANCED_TOOLS=true restores all. */
export const DEFAULT_TOOL_NAMES = [
  'name_project', 'search_domain', 'bulk_search', 'check_socials', 'tld_info', 'ai_health',
] as const;

export function getExposedTools(allTools: Tool[], env: NodeJS.ProcessEnv): Tool[] {
  if (env.ADVANCED_TOOLS === 'true') return allTools;
  return allTools.filter((t) => (DEFAULT_TOOL_NAMES as readonly string[]).includes(t.name));
}
