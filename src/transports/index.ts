/**
 * Transport Abstraction Layer
 *
 * Provides runtime selection between stdio and HTTP transports.
 * This enables the MCP server to work with:
 * - Claude Desktop, Cursor, VS Code (stdio)
 * - ChatGPT, web clients, LM Studio (HTTP/SSE)
 */

export type TransportType = 'stdio' | 'http';

export interface TransportConfig {
  type: TransportType;
  port?: number;
  host?: string;
  corsOrigins?: string[];
}

/**
 * Determines transport configuration from CLI args and environment variables.
 *
 * Priority order:
 * 1. CLI flag: --http or --stdio
 * 2. Environment variable: MCP_TRANSPORT
 * 3. Default: stdio (backward compatible)
 *
 * @example
 * ```bash
 * # stdio (default)
 * npx domain-search-mcp
 *
 * # HTTP mode via CLI flag
 * npx domain-search-mcp --http
 *
 * # HTTP mode via env
 * MCP_TRANSPORT=http MCP_PORT=3001 npx domain-search-mcp
 * ```
 */
export function getTransportConfig(): TransportConfig {
  const args = process.argv.slice(2);

  // Check for explicit --stdio flag (highest priority for stdio)
  if (args.includes('--stdio')) {
    return { type: 'stdio' };
  }

  // Check for --http flag or --port flag
  const httpFlagIndex = args.indexOf('--http');
  const portFlagIndex = args.indexOf('--port');

  let portFromFlag: number | undefined;
  if (portFlagIndex !== -1) {
    const portArg = args[portFlagIndex + 1];
    if (portArg) {
      portFromFlag = parseInt(portArg, 10);
    }
  }

  // Determine if HTTP mode is requested
  const isHttpMode =
    httpFlagIndex !== -1 ||
    portFlagIndex !== -1 ||
    process.env.MCP_TRANSPORT === 'http';

  if (isHttpMode) {
    const port = portFromFlag || parseInt(process.env.MCP_PORT || '3000', 10);
    const host = process.env.MCP_HOST || '0.0.0.0';

    // Parse CORS origins from env (comma-separated)
    let corsOrigins: string[] = ['*'];
    if (process.env.CORS_ORIGINS) {
      corsOrigins = process.env.CORS_ORIGINS.split(',').map(s => s.trim());
    }

    return {
      type: 'http',
      port,
      host,
      corsOrigins
    };
  }

  // Default to stdio for backward compatibility
  return { type: 'stdio' };
}

/**
 * Logs transport configuration in a human-readable format.
 * Used for server startup messages.
 */
export function formatTransportInfo(config: TransportConfig): string {
  if (config.type === 'stdio') {
    return 'stdio (standard I/O)';
  }
  return `HTTP/SSE on ${config.host}:${config.port}`;
}
