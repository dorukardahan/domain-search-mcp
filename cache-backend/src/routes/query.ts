/**
 * Query Taken Domains Route
 *
 * POST /api/v1/query
 * Check if domains are known to be taken.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPool, getCachedTakenBatch, checkRateLimit } from '../db.js';

// ═══════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════

const QueryRequestSchema = z.object({
  domains: z.array(z.string().min(3).max(255)).min(1).max(500),
  include_expiry: z.boolean().optional().default(false),
});

type QueryRequest = z.infer<typeof QueryRequestSchema>;

interface TakenDomain {
  fqdn: string;
  expires_at?: string;
  days_until_expiration?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Route Plugin
// ═══════════════════════════════════════════════════════════════════════════

const queryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: QueryRequest }>('/query', async (request, reply) => {
    // Rate limiting: 100 requests per minute per IP
    const clientIp = request.ip;
    const remaining = await checkRateLimit(`query:${clientIp}`, 100, 60);

    if (remaining < 0) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: 'Maximum 100 requests per minute',
        retry_after: 60,
      });
    }

    // Validate request body
    const parseResult = QueryRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.errors,
      });
    }

    const { domains, include_expiry } = parseResult.data;
    const normalizedDomains = domains.map((d) => d.toLowerCase());

    // First check Redis cache for fast results
    const cachedResults = await getCachedTakenBatch(normalizedDomains);
    const taken: TakenDomain[] = [];
    const unknown: string[] = [];
    const toQueryDb: string[] = [];

    for (const domain of normalizedDomains) {
      const cached = cachedResults.get(domain);
      if (cached) {
        // Skip expired domains - they might be available now!
        if (cached.expires_at) {
          const expiryDate = new Date(cached.expires_at);
          const now = new Date();
          if (expiryDate <= now) {
            // Expired - treat as unknown (might be available)
            unknown.push(domain);
            continue;
          }
        }
        const result: TakenDomain = { fqdn: domain };
        if (include_expiry && cached.expires_at) {
          result.expires_at = cached.expires_at;
          const expiryDate = new Date(cached.expires_at);
          const now = new Date();
          const diffMs = expiryDate.getTime() - now.getTime();
          result.days_until_expiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }
        taken.push(result);
      } else {
        toQueryDb.push(domain);
      }
    }

    // Query database for domains not in cache
    // Exclude expired domains (status = 'expired' OR expires_at <= NOW())
    if (toQueryDb.length > 0) {
      const pool = getPool();
      try {
        const placeholders = toQueryDb.map((_, i) => `$${i + 1}`).join(',');
        const query = `
          SELECT fqdn, expires_at, status
          FROM taken_domains
          WHERE LOWER(fqdn) IN (${placeholders})
            AND status != 'expired'
            AND (expires_at IS NULL OR expires_at > NOW())
        `;

        const result = await pool.query(query, toQueryDb);
        const dbResults = new Map(result.rows.map((row) => [row.fqdn.toLowerCase(), row]));

        for (const domain of toQueryDb) {
          const row = dbResults.get(domain);
          if (row) {
            const takenDomain: TakenDomain = { fqdn: domain };
            if (include_expiry && row.expires_at) {
              takenDomain.expires_at = row.expires_at.toISOString();
              const expiryDate = new Date(row.expires_at);
              const now = new Date();
              const diffMs = expiryDate.getTime() - now.getTime();
              takenDomain.days_until_expiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            }
            taken.push(takenDomain);
          } else {
            unknown.push(domain);
          }
        }
      } catch (err) {
        fastify.log.error({ err }, 'Database query failed');
        // On DB error, mark all DB queries as unknown
        unknown.push(...toQueryDb);
      }
    }

    // Set rate limit header
    reply.header('X-RateLimit-Remaining', Math.max(0, remaining - 1));

    return {
      taken,
      unknown,
      stats: {
        total_queried: domains.length,
        taken_count: taken.length,
        unknown_count: unknown.length,
        cache_hits: cachedResults.size,
      },
    };
  });
};

export default queryRoute;
