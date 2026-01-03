/**
 * expiring_domains Tool - Find Domains About to Expire.
 *
 * Queries the federated negative cache for domains approaching
 * their expiration date. Useful for domain investors watching
 * specific domains or looking for opportunities.
 */

import { z } from 'zod';
import { getExpiringDomains, type ExpiringDomain } from '../services/negative-cache.js';
import { config } from '../config.js';
import { wrapError } from '../utils/errors.js';

/**
 * Input schema for expiring_domains.
 */
export const expiringDomainsSchema = z.object({
  tlds: z
    .array(z.string())
    .optional()
    .describe("Filter by TLDs (e.g., ['com', 'io']). Omit to search all TLDs."),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .default(30)
    .describe("Find domains expiring within this many days. Defaults to 30."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe("Maximum results to return (1-100). Defaults to 25."),
  keywords: z
    .string()
    .optional()
    .describe("Filter by keywords in domain name (e.g., 'tech' to find tech-related domains)."),
});

export type ExpiringDomainsInput = z.infer<typeof expiringDomainsSchema>;

/**
 * Tool definition for MCP.
 */
export const expiringDomainsTool = {
  name: 'expiring_domains',
  description: `Find domains that are about to expire and may become available soon.

Monitors the federated negative cache for domains approaching their expiration date.
Useful for domain investors and those watching specific domains.

Requires NEGATIVE_CACHE_URL to be configured.

Examples:
- expiring_domains(days=30) → Domains expiring in the next 30 days
- expiring_domains(tlds=["com"], days=7) → .com domains expiring within a week
- expiring_domains(keywords="ai") → AI-related domains expiring soon`,
  inputSchema: {
    type: 'object',
    properties: {
      tlds: {
        type: 'array',
        items: { type: 'string' },
        description: "Filter by TLDs (e.g., ['com', 'io']). Omit to search all TLDs.",
      },
      days: {
        type: 'number',
        description: "Find domains expiring within this many days. Defaults to 30.",
      },
      limit: {
        type: 'number',
        description: "Maximum results to return (1-100). Defaults to 25.",
      },
      keywords: {
        type: 'string',
        description: "Filter by keywords in domain name.",
      },
    },
    required: [],
  },
};

/**
 * Response format for expiring domains.
 */
interface ExpiringDomainsResponse {
  domains: Array<{
    domain: string;
    expires_at: string;
    days_until_expiration: number;
    tld: string;
  }>;
  total: number;
  filters: {
    tlds: string[] | null;
    days: number;
    keywords: string | null;
  };
  insights: string[];
  enabled: boolean;
}

/**
 * Execute the expiring_domains tool.
 */
export async function executeExpiringDomains(
  input: ExpiringDomainsInput,
): Promise<ExpiringDomainsResponse> {
  try {
    const { tlds, days, limit, keywords } = expiringDomainsSchema.parse(input);

    // Check if negative cache is enabled
    if (!config.negativeCache.enabled) {
      return {
        domains: [],
        total: 0,
        filters: {
          tlds: tlds || null,
          days,
          keywords: keywords || null,
        },
        insights: [
          '⚠️ Federated negative cache is not enabled.',
          '💡 Set NEGATIVE_CACHE_ENABLED=true and NEGATIVE_CACHE_URL to use this feature.',
        ],
        enabled: false,
      };
    }

    // Query the backend
    const result = await getExpiringDomains({
      tlds,
      days,
      limit,
      keywords,
    });

    // Transform results
    const domains = result.domains.map(d => ({
      domain: d.fqdn,
      expires_at: d.expires_at,
      days_until_expiration: d.days_until_expiration,
      tld: d.fqdn.split('.').pop() || '',
    }));

    // Generate insights
    const insights: string[] = [];

    if (domains.length > 0) {
      insights.push(`🔍 Found ${domains.length} domain${domains.length > 1 ? 's' : ''} expiring within ${days} days`);

      // Group by urgency
      const urgent = domains.filter(d => d.days_until_expiration <= 7);
      const soon = domains.filter(d => d.days_until_expiration > 7 && d.days_until_expiration <= 14);

      if (urgent.length > 0) {
        insights.push(`🔴 ${urgent.length} domain${urgent.length > 1 ? 's' : ''} expire within 7 days!`);
      }
      if (soon.length > 0) {
        insights.push(`🟡 ${soon.length} domain${soon.length > 1 ? 's' : ''} expire within 14 days`);
      }

      // TLD distribution
      const tldCounts = new Map<string, number>();
      for (const d of domains) {
        tldCounts.set(d.tld, (tldCounts.get(d.tld) || 0) + 1);
      }
      if (tldCounts.size > 1) {
        const tldStr = Array.from(tldCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tld, count]) => `.${tld}: ${count}`)
          .join(', ');
        insights.push(`📊 TLD distribution: ${tldStr}`);
      }
    } else {
      insights.push(`❌ No domains found expiring within ${days} days`);
      if (tlds && tlds.length > 0) {
        insights.push(`💡 Try expanding your TLD filter or increasing the days parameter`);
      }
    }

    if (result.total > domains.length) {
      insights.push(`📑 Showing ${domains.length} of ${result.total} total results. Increase limit for more.`);
    }

    return {
      domains,
      total: result.total,
      filters: {
        tlds: tlds || null,
        days,
        keywords: keywords || null,
      },
      insights,
      enabled: true,
    };
  } catch (error) {
    throw wrapError(error);
  }
}
