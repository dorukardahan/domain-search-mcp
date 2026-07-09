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
 * - suggest_domains_smart: AI-powered domain suggestions with Qwen 2.5-7B
 * - tld_info: Get TLD information and recommendations
 * - check_socials: Check social handle availability
 * - analyze_project: Extract context from projects for domain suggestions
 * - hunt_domains: Find valuable domains for investment
 * - expiring_domains: Find domains about to expire (federated cache)
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

import { getTransportConfig, formatTransportInfo, parseCliAction } from './transports/index.js';
import { createHttpTransport } from './transports/http.js';
import { getExposedTools } from './toolset.js';
import { setTransport } from './runtime-context.js';

import { config, getAvailableSources, hasRegistrarApi } from './config.js';
import { getServerVersion } from './utils/version.js';
import { logger, generateRequestId, setRequestId, clearRequestId } from './utils/logger.js';
import { wrapError, DomainSearchError } from './utils/errors.js';
import { formatToolResult, formatToolError } from './utils/format.js';
import { prewarmRdapBootstrap } from './fallbacks/rdap.js';
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
  analyzeProjectTool,
  executeAnalyzeProject,
  huntDomainsTool,
  executeHuntDomains,
  expiringDomainsTool,
  executeExpiringDomains,
  aiHealthTool,
  executeAiHealth,
  nameProjectTool,
  executeNameProject,
} from './tools/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server Configuration
// ═══════════════════════════════════════════════════════════════════════════

const SERVER_NAME = 'domain-search-mcp';
// Resolved from package.json at runtime so it never drifts from the published version.
const SERVER_VERSION = getServerVersion();
const REPO_URL = 'https://github.com/dorukardahan/domain-search-mcp';

/**
 * All available tools.
 */
const TOOLS: Tool[] = [
  nameProjectTool as Tool,
  searchDomainTool as Tool,
  bulkSearchTool as Tool,
  compareRegistrarsTool as Tool,
  suggestDomainsTool as Tool,
  suggestDomainsSmartTool as Tool,
  tldInfoTool as Tool,
  checkSocialsTool as Tool,
  analyzeProjectTool as Tool,
  huntDomainsTool as Tool,
  expiringDomainsTool as Tool,
  aiHealthTool as Tool,
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
  // All 12 tools are advertised by default; SLIM_TOOLS=true opts into the 6-tool
  // slim profile (ADVANCED_TOOLS=true is a deprecated alias that forces full
  // exposure and overrides SLIM_TOOLS). executeToolCall below still accepts
  // every tool by name regardless, for backward compatibility.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getExposedTools(TOOLS, process.env) };
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
 *
 * SECURITY: Each executor internally validates input with Zod schemas.
 * We pass raw args directly to let Zod handle type coercion and validation,
 * which prevents type confusion attacks where e.g. a string is passed
 * instead of an array.
 */
async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // All executors internally use Zod schemas for validation.
  // Passing raw args ensures proper type coercion and error messages.
  switch (name) {
    case 'search_domain':
      return executeSearchDomain(args as Parameters<typeof executeSearchDomain>[0]);

    case 'bulk_search':
      return executeBulkSearch(args as Parameters<typeof executeBulkSearch>[0]);

    case 'compare_registrars':
      return executeCompareRegistrars(args as Parameters<typeof executeCompareRegistrars>[0]);

    case 'suggest_domains':
      return executeSuggestDomains(args as Parameters<typeof executeSuggestDomains>[0]);

    case 'suggest_domains_smart':
      return executeSuggestDomainsSmart(args as Parameters<typeof executeSuggestDomainsSmart>[0]);

    case 'tld_info':
      return executeTldInfo(args as Parameters<typeof executeTldInfo>[0]);

    case 'check_socials':
      return executeCheckSocials(args as Parameters<typeof executeCheckSocials>[0]);

    case 'analyze_project':
      return executeAnalyzeProject(args as Parameters<typeof executeAnalyzeProject>[0]);

    case 'hunt_domains':
      return executeHuntDomains(args as Parameters<typeof executeHuntDomains>[0]);

    case 'expiring_domains':
      return executeExpiringDomains(args as Parameters<typeof executeExpiringDomains>[0]);

    case 'ai_health':
      return executeAiHealth(args as Parameters<typeof executeAiHealth>[0]);

    case 'name_project':
      return executeNameProject(args as Parameters<typeof executeNameProject>[0]);

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
// CLI (handled before the server boots or reads stdin)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Print usage/help to stdout.
 */
function printHelp(): void {
  const lines = [
    `domain-search-mcp v${SERVER_VERSION}`,
    '',
    'Zero-config domain availability MCP server for Claude, ChatGPT, and other',
    'MCP clients. Availability is checked locally via RDAP/WHOIS; optional live',
    'pricing and AI suggestions are added when the matching endpoints are set.',
    '',
    'Usage:',
    '  domain-search-mcp [--stdio | --http [--port <n>]]',
    '  domain-search-mcp --help | --version',
    '',
    'Tools:',
    ...TOOLS.map((t) => `  ${t.name}`),
    '',
    'Transport flags:',
    '  --stdio         Use stdio transport (default; Claude Desktop, Cursor, VS Code)',
    '  --http          Use HTTP/SSE transport (ChatGPT, web clients, LM Studio)',
    '  --port <n>      HTTP port (implies --http; default 3000)',
    '',
    'Key environment variables:',
    '  PRICING_API_BASE_URL       Backend URL for live pricing (recommended)',
    '  QWEN_INFERENCE_ENDPOINT    Your own AI inference endpoint for suggestions',
    '  PORKBUN_API_KEY            BYOK Porkbun pricing (with PORKBUN_API_SECRET)',
    '  NAMECHEAP_API_KEY          BYOK Namecheap pricing (with NAMECHEAP_API_USER)',
    '  MCP_TRANSPORT / MCP_PORT / MCP_HOST   Transport configuration via env',
    '',
    `Repository: ${REPO_URL}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * Handle --help/-h and --version/-v before any server/stdin work.
 * Exits the process when a flag is handled; returns otherwise.
 */
function handleCliFlags(): void {
  const action = parseCliAction(process.argv.slice(2));

  if (action === 'help') {
    printHelp();
    process.exit(0);
  }

  if (action === 'version') {
    process.stdout.write(`${SERVER_VERSION}\n`);
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  // Handle informational CLI flags first — never block on stdin for --help/--version.
  handleCliFlags();

  // Get transport configuration from CLI args and env vars
  const transportConfig = getTransportConfig();

  // Record the active transport (stdio or http) so tools like name_project can
  // gate server-side filesystem access when reachable by a remote HTTP caller.
  setTransport(transportConfig.type);

  // Log startup info
  logger.info('Domain Search MCP starting', {
    version: SERVER_VERSION,
    node_version: process.version,
    transport: transportConfig.type,
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

  // Create MCP server
  const server = createServer();

  // Pre-warm RDAP bootstrap cache in background (eliminates 5s cold-start latency)
  prewarmRdapBootstrap().catch((err) => {
    logger.debug('RDAP pre-warm failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Variable to hold HTTP transport for cleanup
  let httpTransport: ReturnType<typeof createHttpTransport> | null = null;

  // Connect based on transport type
  if (transportConfig.type === 'http') {
    // HTTP/SSE transport for web clients (ChatGPT, LM Studio, etc.)
    httpTransport = createHttpTransport(server, transportConfig);
    await httpTransport.start();

    logger.info('Domain Search MCP ready', {
      tools: TOOLS.length,
      transport: formatTransportInfo(transportConfig),
      port: transportConfig.port,
      host: transportConfig.host,
    });

    // Log helpful URLs
    const baseUrl = `http://${transportConfig.host === '0.0.0.0' ? 'localhost' : transportConfig.host}:${transportConfig.port}`;
    logger.info(`MCP endpoint: ${baseUrl}/mcp`);
    logger.info(`Health check: ${baseUrl}/health`);
  } else {
    // Stdio transport for Claude Desktop, Cursor, VS Code (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Domain Search MCP ready', {
      tools: TOOLS.length,
      transport: 'stdio',
    });
  }

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);

    if (httpTransport) {
      await httpTransport.stop();
    }
    await server.close();

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run the server
main().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
