/**
 * Report Taken Domains Route
 *
 * POST /api/v1/report
 * Accepts batch reports of taken domains from MCP clients.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPool, getRedis, cacheTaken, checkRateLimit } from '../db.js';

// ═══════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════

const DomainReportSchema = z.object({
  fqdn: z.string().min(3).max(255).toLowerCase(),
  expires_at: z.string().datetime().optional(),
  registered_at: z.string().datetime().optional(),
  source: z.string().max(50).optional(),
});

const ReportRequestSchema = z.object({
  domains: z.array(DomainReportSchema).min(1).max(100),
});

type ReportRequest = z.infer<typeof ReportRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Route Plugin
// ═══════════════════════════════════════════════════════════════════════════

const reportRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ReportRequest }>('/report', async (request, reply) => {
    // Rate limiting: 1000 domains per minute per IP
    const clientIp = request.ip;
    const remaining = await checkRateLimit(`report:${clientIp}`, 1000, 60);

    if (remaining < 0) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: 'Maximum 1000 domains per minute',
        retry_after: 60,
      });
    }

    // Validate request body
    const parseResult = ReportRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.errors,
      });
    }

    const { domains } = parseResult.data;
    const pool = getPool();

    let accepted = 0;
    let rejected = 0;

    // Process domains in batch
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const domain of domains) {
        try {
          // Parse FQDN into domain_name and tld
          const parts = domain.fqdn.split('.');
          if (parts.length < 2) {
            rejected++;
            continue;
          }

          const tld = parts.pop()!;
          const domainName = parts.join('.');

          // Upsert domain record
          await client.query(
            `INSERT INTO taken_domains (fqdn, domain_name, tld, expires_at, registered_at, last_source)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (fqdn) DO UPDATE SET
               expires_at = COALESCE(EXCLUDED.expires_at, taken_domains.expires_at),
               registered_at = COALESCE(EXCLUDED.registered_at, taken_domains.registered_at),
               last_confirmed_at = NOW(),
               report_count = taken_domains.report_count + 1,
               last_source = COALESCE(EXCLUDED.last_source, taken_domains.last_source)`,
            [
              domain.fqdn,
              domainName,
              tld,
              domain.expires_at || null,
              domain.registered_at || null,
              domain.source || null,
            ]
          );

          // Update Redis cache
          await cacheTaken(domain.fqdn, domain.expires_at);
          accepted++;
        } catch (err) {
          fastify.log.warn({ err, fqdn: domain.fqdn }, 'Failed to insert domain');
          rejected++;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error({ err }, 'Transaction failed');
      return reply.status(500).send({
        error: 'Database error',
        message: 'Failed to process domains',
      });
    } finally {
      client.release();
    }

    // Set rate limit header
    reply.header('X-RateLimit-Remaining', Math.max(0, remaining - domains.length));

    return {
      accepted,
      rejected,
      total: domains.length,
    };
  });
};

export default reportRoute;
