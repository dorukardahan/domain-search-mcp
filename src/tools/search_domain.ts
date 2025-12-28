/**
 * search_domain Tool - Primary Domain Search.
 *
 * This is the main entry point for domain availability checks.
 * Designed for magic first moment: works with zero configuration.
 */

import { z } from 'zod';
import type { SearchResponse } from '../types.js';
import { searchDomain } from '../services/domain-search.js';
import { wrapError } from '../utils/errors.js';

/**
 * Input schema for search_domain.
 */
export const searchDomainSchema = z.object({
  domain_name: z
    .string()
    .min(1)
    .max(63)
    .describe(
      "The domain name you want to check (e.g., 'vibecoding', 'myapp'). Don't include the extension (.com, .io, etc.)",
    ),
  tlds: z
    .array(z.string())
    .optional()
    .describe(
      "TLD extensions to check (e.g., ['com', 'io', 'dev']). Defaults to ['com', 'io', 'dev'] if not specified.",
    ),
  registrars: z
    .array(z.string())
    .optional()
    .describe(
      "Optional: specific registrars to check (BYOK only; ignored when Pricing API is configured).",
    ),
});

export type SearchDomainInput = z.infer<typeof searchDomainSchema>;

/**
 * Tool definition for MCP.
 */
export const searchDomainTool = {
  name: 'search_domain',
  description: `Search for domain availability and pricing across multiple TLDs.

Returns:
- Availability status for each domain
- Pricing (first year and renewal) when Pricing API is configured
- Whether WHOIS privacy is included
- Human-readable insights and next steps

Examples:
- search_domain("vibecoding") → checks vibecoding.com, .io, .dev
- search_domain("myapp", ["com", "io"]) → checks specific TLDs`,
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description:
          "The domain name to search (e.g., 'vibecoding'). No extension needed.",
      },
      tlds: {
        type: 'array',
        items: { type: 'string' },
        description:
          "TLD extensions to check (e.g., ['com', 'io', 'dev']). Defaults to ['com', 'io', 'dev'].",
      },
      registrars: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Optional: specific registrars to check. Leave empty to auto-select.",
      },
    },
    required: ['domain_name'],
  },
};

/**
 * Execute the search_domain tool.
 */
export async function executeSearchDomain(
  input: SearchDomainInput,
): Promise<SearchResponse> {
  try {
    const { domain_name, tlds, registrars } = searchDomainSchema.parse(input);
    return await searchDomain(domain_name, tlds, registrars);
  } catch (error) {
    throw wrapError(error);
  }
}
