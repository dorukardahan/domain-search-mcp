#!/usr/bin/env node
/**
 * Domain Search MCP Server.
 *
 * Model Context Protocol server for domain availability search.
 * Supports Porkbun, Namecheap, RDAP, and WHOIS as data sources.
 *
 * Features:
 * - search_domain: Check availability across multiple TLDs
 * - bulk_search: Check many domains at once
 * - compare_registrars: Compare pricing across registrars
 * - suggest_domains: Generate available name variations
 * - suggest_domains_smart: AI-powered domain suggestions with semantic analysis
 * - tld_info: Get TLD information and recommendations
 * - check_socials: Check social handle availability
 *
 * @see https://github.com/yourusername/domain-search-mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { config, getAvailableSources, hasRegistrarApi } from './config.js';
import { logger, generateRequestId, setRequestId, clearRequestId } from './utils/logger.js';
import { wrapError, DomainSearchError } from './utils/errors.js';
import { formatToolResult, formatToolError } from './utils/format.js';
import {
  searchDomainTool,
  executeSearchDomain,
  bulkSearchTool,
  executeBulkSearch,
  compareRegistrarsTool,
  executeCompareRegistrars,
  suggestDomainsTool,
  executeSuggestDomains,
  suggestDomainsSmartTool,
  executeSuggestDomainsSmart,
  tldInfoTool,
  executeTldInfo,
  checkSocialsTool,
  executeCheckSocials,
} from './tools/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server Configuration
// ═══════════════════════════════════════════════════════════════════════════

const SERVER_NAME = 'domain-search-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * All available tools.
 */
const TOOLS: Tool[] = [
  searchDomainTool as Tool,
  bulkSearchTool as Tool,
  compareRegistrarsTool as Tool,
  suggestDomainsTool as Tool,
  suggestDomainsSmartTool as Tool,
  tldInfoTool as Tool,
  checkSocialsTool as Tool,
];

// ═══════════════════════════════════════════════════════════════════════════
// Server Implementation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create and configure the MCP server.
 */
function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const requestId = generateRequestId();

    try {
      setRequestId(requestId);
      logger.info('Tool call started', { tool: name, request_id: requestId });

      const result = await executeToolCall(name, args || {});

      logger.info('Tool call completed', {
        tool: name,
        request_id: requestId,
      });

      return {
        content: [
          {
            type: 'text',
            text: formatToolResult(name, result, config.outputFormat),
          },
        ],
      };
    } catch (error) {
      const wrapped = wrapError(error);

      logger.error('Tool call failed', {
        tool: name,
        request_id: requestId,
        error: wrapped.message,
        code: wrapped.code,
      });

      // Return error as content (MCP pattern)
      return {
        content: [
          {
            type: 'text',
            text: formatToolError(
              {
                code: wrapped.code,
                userMessage: wrapped.userMessage,
                retryable: wrapped.retryable,
                suggestedAction: wrapped.suggestedAction,
              },
              config.outputFormat,
            ),
          },
        ],
        isError: true,
      };
    } finally {
      clearRequestId();
    }
  });

  return server;
}

/**
 * Execute a tool call by name.
 */
async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'search_domain':
      return executeSearchDomain({
        domain_name: args.domain_name as string,
        tlds: args.tlds as string[] | undefined,
        registrars: args.registrars as string[] | undefined,
      });

    case 'bulk_search':
      return executeBulkSearch({
        domains: args.domains as string[],
        tld: (args.tld as string) || 'com',
        registrar: args.registrar as string | undefined,
      });

    case 'compare_registrars':
      return executeCompareRegistrars({
        domain: args.domain as string,
        tld: args.tld as string,
        registrars: args.registrars as string[] | undefined,
      });

    case 'suggest_domains':
      return executeSuggestDomains({
        base_name: args.base_name as string,
        tld: (args.tld as string) || 'com',
        variants: args.variants as
          | Array<'hyphen' | 'numbers' | 'abbreviations' | 'synonyms' | 'prefixes' | 'suffixes'>
          | undefined,
        max_suggestions: (args.max_suggestions as number) || 10,
      });

    case 'suggest_domains_smart':
      return executeSuggestDomainsSmart({
        query: args.query as string,
        tld: (args.tld as string) || 'com',
        industry: args.industry as
          | 'tech' | 'startup' | 'finance' | 'health' | 'food' | 'creative' | 'ecommerce' | 'education' | 'gaming' | 'social'
          | undefined,
        style: (args.style as 'brandable' | 'descriptive' | 'short' | 'creative') || 'brandable',
        max_suggestions: (args.max_suggestions as number) || 15,
        include_premium: (args.include_premium as boolean) || false,
      });

    case 'tld_info':
      return executeTldInfo({
        tld: args.tld as string,
        detailed: (args.detailed as boolean) || false,
      });

    case 'check_socials':
      return executeCheckSocials({
        name: args.name as string,
        platforms: args.platforms as
          | Array<'github' | 'twitter' | 'instagram' | 'linkedin' | 'tiktok'>
          | undefined,
      });

    default:
      throw new DomainSearchError(
        'UNKNOWN_TOOL',
        `Unknown tool: ${name}`,
        `The tool "${name}" is not available.`,
        {
          retryable: false,
          suggestedAction: `Available tools: ${TOOLS.map((t) => t.name).join(', ')}`,
        },
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  // Log startup info
  logger.info('Domain Search MCP starting', {
    version: SERVER_VERSION,
    node_version: process.version,
    sources: getAvailableSources(),
    has_registrar_api: hasRegistrarApi(),
    dry_run: config.dryRun,
  });

  // Warn if no API keys configured
  if (!hasRegistrarApi()) {
    logger.warn(
      'No registrar API keys configured. Falling back to RDAP/WHOIS only.',
    );
    logger.warn(
      'For pricing info, set PRICING_API_BASE_URL (recommended) or add BYOK registrar keys.',
    );
  }

  // Create and start server
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('Domain Search MCP ready', {
    tools: TOOLS.length,
    transport: 'stdio',
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  });
}

// Run the server
main().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
