/**
 * HTTP/SSE Transport for MCP Server
 *
 * Implements the MCP Streamable HTTP transport specification.
 * Enables web-based clients (ChatGPT, LM Studio, web apps) to connect.
 *
 * Routes:
 * - POST /mcp - JSON-RPC message endpoint
 * - GET /mcp - SSE stream for server-initiated messages
 * - GET /health - Health check endpoint
 * - GET / - Server info
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TransportConfig } from './index.js';
import { generateOpenAPISpec } from '../openapi/generator.js';
import { createApiRouter } from '../api/routes.js';

/**
 * Creates an Express server with MCP HTTP transport.
 *
 * The server uses StreamableHTTPServerTransport which implements
 * the MCP Streamable HTTP specification (2025-06-18).
 *
 * @param mcpServer - The MCP Server instance to connect
 * @param config - Transport configuration (port, host, CORS)
 * @returns Object with Express app, HTTP server, and start/stop functions
 */
export function createHttpTransport(
  mcpServer: Server,
  config: TransportConfig
) {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '4mb' }));

  // CORS configuration
  const corsOptions: cors.CorsOptions = {
    origin: config.corsOrigins || ['*'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Mcp-Session-Id',
      'Last-Event-ID'
    ],
    exposedHeaders: ['Mcp-Session-Id'],
    credentials: true
  };
  app.use(cors(corsOptions));

  // Rate limiting - 100 requests per minute per IP
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  });
  app.use(limiter);

  // Store active transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Mount REST API routes for ChatGPT Actions and other REST clients
  app.use('/api', createApiRouter());

  /**
   * MCP endpoint - handles both POST (messages) and GET (SSE stream)
   */
  app.all('/mcp', async (req: Request, res: Response) => {
    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'GET') {
      // SSE stream request
      if (!sessionId || !transports.has(sessionId)) {
        res.status(400).json({
          error: 'No active session',
          message: 'Establish a session first with POST /mcp'
        });
        return;
      }

      const transport = transports.get(sessionId)!;
      // Cast to IncomingMessage/ServerResponse for MCP SDK compatibility
      await transport.handleRequest(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse
      );
      return;
    }

    if (req.method === 'POST') {
      // Check if this is an initialization request (no session ID needed)
      const body = req.body;
      const isInitRequest =
        body?.method === 'initialize' || !sessionId;

      let transport: StreamableHTTPServerTransport;

      if (isInitRequest && !sessionId) {
        // Create new transport for new session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID()
        });

        // Set up event handlers
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
          }
        };

        transport.onerror = (error) => {
          console.error('[HTTP Transport] Error:', error);
        };

        // Connect MCP server to this transport
        await mcpServer.connect(transport);

        // Store transport by session ID
        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
        }
      } else if (sessionId && transports.has(sessionId)) {
        // Use existing transport
        transport = transports.get(sessionId)!;
      } else {
        // Invalid session
        res.status(404).json({
          error: 'Session not found',
          message: 'Invalid or expired session ID'
        });
        return;
      }

      // Handle the request - cast for MCP SDK compatibility
      await transport.handleRequest(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        req.body
      );
      return;
    }

    // Method not allowed
    res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET', 'POST']
    });
  });

  /**
   * Health check endpoint
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      transport: 'http',
      activeSessions: transports.size,
      uptime: process.uptime()
    });
  });

  /**
   * OpenAPI specification endpoint
   * Used by ChatGPT Actions and other REST API clients
   */
  app.get('/openapi.json', (req: Request, res: Response) => {
    // Determine base URL from request or config
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    try {
      const spec = generateOpenAPISpec(baseUrl);
      res.json(spec);
    } catch (error) {
      console.error('[OpenAPI] Generation failed:', error);
      res.status(500).json({
        error: 'Failed to generate OpenAPI spec',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Server info endpoint
   */
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'domain-search-mcp',
      transport: 'Streamable HTTP',
      endpoints: {
        mcp: '/mcp',
        openapi: '/openapi.json',
        health: '/health'
      },
      docs: 'https://github.com/dorukardahan/domain-search-mcp'
    });
  });

  /**
   * 404 handler
   */
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      message: 'Use /mcp for MCP protocol, /health for health check'
    });
  });

  /**
   * Error handler
   */
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[HTTP Transport] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });

  // Create HTTP server
  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,

    /**
     * Start the HTTP server
     */
    start(): Promise<void> {
      const port = config.port ?? 3000;
      const host = config.host ?? '0.0.0.0';

      return new Promise((resolve, reject) => {
        try {
          server = app.listen(port, host, () => {
            resolve();
          });

          server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
              reject(new Error(`Port ${port} is already in use`));
            } else {
              reject(err);
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    },

    /**
     * Stop the HTTP server and close all transports
     */
    async stop(): Promise<void> {
      // Close all active transports
      for (const transport of transports.values()) {
        await transport.close();
      }
      transports.clear();

      // Close HTTP server
      if (server) {
        return new Promise((resolve, reject) => {
          server!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    },

    /**
     * Get count of active sessions
     */
    getActiveSessionCount(): number {
      return transports.size;
    }
  };
}
