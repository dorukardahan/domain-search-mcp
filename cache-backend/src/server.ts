/**
 * Domain Cache Backend Server
 *
 * Federated negative cache API for domain-search-mcp.
 * Aggregates taken domain reports from all MCP clients.
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getPool, getRedis, closePool, closeRedis } from './db.js';
import reportRoute from './routes/report.js';
import queryRoute from './routes/query.js';
import expiringRoute from './routes/expiring.js';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const API_TOKEN = process.env.API_TOKEN;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ═══════════════════════════════════════════════════════════════════════════
// Server Setup
// ═══════════════════════════════════════════════════════════════════════════

const fastify = Fastify({
  logger: {
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
  },
  trustProxy: true, // For accurate client IP behind nginx
});

// ═══════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════

// CORS
await fastify.register(cors, {
  origin: true, // Allow all origins (MCP clients)
  methods: ['GET', 'POST'],
});

// Global rate limiting (safety net)
await fastify.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
  redis: getRedis(),
});

// Bearer token authentication (optional)
if (API_TOKEN) {
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health' || request.url === '/api/v1/health') {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);
    if (token !== API_TOKEN) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Invalid API token',
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════════════════

fastify.get('/health', async () => {
  const pool = getPool();
  const redis = getRedis();

  try {
    // Check PostgreSQL
    await pool.query('SELECT 1');

    // Check Redis
    await redis.ping();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: 'connected',
        redis: 'connected',
      },
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════════════════

// Register API routes under /api/v1
await fastify.register(
  async (api) => {
    api.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));
    await api.register(reportRoute);
    await api.register(queryRoute);
    await api.register(expiringRoute);
  },
  { prefix: '/api/v1' }
);

// ═══════════════════════════════════════════════════════════════════════════
// Stats Endpoint
// ═══════════════════════════════════════════════════════════════════════════

fastify.get('/api/v1/stats', async () => {
  const pool = getPool();

  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_domains,
        COUNT(CASE WHEN status = 'taken' THEN 1 END) AS taken_count,
        COUNT(CASE WHEN status = 'expiring_soon' THEN 1 END) AS expiring_soon_count,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) AS expired_count,
        COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) AS with_expiry_date,
        MIN(first_reported_at) AS oldest_entry,
        MAX(last_confirmed_at) AS newest_entry
      FROM taken_domains
    `);

    const tldStats = await pool.query(`
      SELECT tld, COUNT(*) AS count
      FROM taken_domains
      GROUP BY tld
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      domains: {
        total: parseInt(stats.rows[0].total_domains, 10),
        by_status: {
          taken: parseInt(stats.rows[0].taken_count, 10),
          expiring_soon: parseInt(stats.rows[0].expiring_soon_count, 10),
          expired: parseInt(stats.rows[0].expired_count, 10),
        },
        with_expiry_date: parseInt(stats.rows[0].with_expiry_date, 10),
      },
      top_tlds: tldStats.rows.map((row) => ({
        tld: row.tld,
        count: parseInt(row.count, 10),
      })),
      timeline: {
        oldest_entry: stats.rows[0].oldest_entry?.toISOString() || null,
        newest_entry: stats.rows[0].newest_entry?.toISOString() || null,
      },
    };
  } catch (err) {
    fastify.log.error({ err }, 'Failed to get stats');
    throw err;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════════════

const shutdown = async () => {
  fastify.log.info('Shutting down gracefully...');

  await fastify.close();
  await closeRedis();
  await closePool();

  fastify.log.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ═══════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Domain Cache Backend running on http://${HOST}:${PORT}`);
  fastify.log.info(`Environment: ${NODE_ENV}`);
  if (API_TOKEN) {
    fastify.log.info('Bearer token authentication enabled');
  }
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
