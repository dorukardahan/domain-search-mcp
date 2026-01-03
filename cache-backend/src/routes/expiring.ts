/**
 * Expiring & Dropping Domains Routes
 *
 * GET /api/v1/expiring - Find domains that are about to expire
 * GET /api/v1/dropping - Find domains in drop-catching window (available soon!)
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPool, checkRateLimit } from '../db.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface LifecycleDomain {
  fqdn: string;
  domain_name: string;
  tld: string;
  expires_at: string;
  lifecycle_stage: string;
  lifecycle_info: {
    stage_description: string;
    grace_period_ends_at: string | null;
    redemption_ends_at: string | null;
    estimated_available_at: string | null;
    days_until_available: number | null;
    can_register: boolean;
    action_hint: string;
  };
}

// Lifecycle stage descriptions
const LIFECYCLE_DESCRIPTIONS: Record<string, { description: string; action: string }> = {
  taken: {
    description: 'Domain is actively registered',
    action: 'Wait for expiration or contact owner',
  },
  expiring_soon: {
    description: 'Expiring within 90 days - owner may renew',
    action: 'Monitor closely, prepare for drop catch',
  },
  grace_period: {
    description: 'Expired but owner can renew at normal price (30-45 days)',
    action: 'Wait - high chance owner will renew',
  },
  redemption: {
    description: 'Grace period ended - owner can recover with penalty fee (~$150-200)',
    action: 'Getting interesting - some owners abandon here',
  },
  pending_delete: {
    description: 'Queued for deletion (5 days) - cannot be recovered',
    action: 'Prepare drop catch service! Domain releasing soon',
  },
  dropping_soon: {
    description: 'Should be available for registration NOW',
    action: 'TRY TO REGISTER IMMEDIATELY! Use backorder/drop service',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════════════

const ExpiringQuerySchema = z.object({
  tlds: z.string().optional(),
  days: z.coerce.number().min(1).max(365).optional().default(30),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  offset: z.coerce.number().min(0).optional().default(0),
  keywords: z.string().optional(),
  lifecycle_stage: z.string().optional(), // Filter by specific stage
});

type ExpiringQuery = z.infer<typeof ExpiringQuerySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function buildLifecycleInfo(row: any): LifecycleDomain['lifecycle_info'] {
  const stage = row.lifecycle_stage || 'taken';
  const stageInfo = LIFECYCLE_DESCRIPTIONS[stage] || LIFECYCLE_DESCRIPTIONS['taken'];

  let daysUntilAvailable: number | null = null;
  if (row.estimated_available_at) {
    const availableDate = new Date(row.estimated_available_at);
    const now = new Date();
    const diffMs = availableDate.getTime() - now.getTime();
    daysUntilAvailable = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysUntilAvailable < 0) daysUntilAvailable = 0;
  }

  return {
    stage_description: stageInfo.description,
    grace_period_ends_at: row.grace_period_ends_at?.toISOString() || null,
    redemption_ends_at: row.redemption_ends_at?.toISOString() || null,
    estimated_available_at: row.estimated_available_at?.toISOString() || null,
    days_until_available: daysUntilAvailable,
    can_register: stage === 'dropping_soon',
    action_hint: stageInfo.action,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Route Plugin
// ═══════════════════════════════════════════════════════════════════════════

const expiringRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /expiring - Find domains expiring soon (with lifecycle info)
   */
  fastify.get<{ Querystring: ExpiringQuery }>('/expiring', async (request, reply) => {
    const clientIp = request.ip;
    const remaining = await checkRateLimit(`expiring:${clientIp}`, 60, 60);

    if (remaining < 0) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: 'Maximum 60 requests per minute',
        retry_after: 60,
      });
    }

    const parseResult = ExpiringQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.errors,
      });
    }

    const { tlds, days, limit, offset, keywords, lifecycle_stage } = parseResult.data;
    const pool = getPool();

    try {
      const conditions: string[] = ['expires_at IS NOT NULL'];
      const params: (string | number)[] = [];
      let paramIndex = 1;

      // If lifecycle_stage is specified, filter by that
      if (lifecycle_stage) {
        conditions.push(`lifecycle_stage = $${paramIndex++}`);
        params.push(lifecycle_stage);
      } else {
        // Default: show expiring within X days OR already in post-expiry lifecycle
        conditions.push(`(
          (expires_at > NOW() AND expires_at < NOW() + INTERVAL '${days} days')
          OR lifecycle_stage IN ('grace_period', 'redemption', 'pending_delete', 'dropping_soon')
        )`);
      }

      // TLD filter
      if (tlds) {
        const tldList = tlds.split(',').map((t) => t.trim().toLowerCase());
        if (tldList.length > 0) {
          const tldPlaceholders = tldList.map(() => `$${paramIndex++}`).join(',');
          conditions.push(`tld IN (${tldPlaceholders})`);
          params.push(...tldList);
        }
      }

      // Keyword filter
      if (keywords) {
        const keywordList = keywords.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
        if (keywordList.length > 0) {
          const keywordConditions = keywordList.map(() => `domain_name ILIKE '%' || $${paramIndex++} || '%'`);
          conditions.push(`(${keywordConditions.join(' OR ')})`);
          params.push(...keywordList);
        }
      }

      const whereClause = conditions.join(' AND ');

      // Count
      const countResult = await pool.query(`SELECT COUNT(*) FROM taken_domains WHERE ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      // Data with lifecycle columns
      const dataQuery = `
        SELECT
          fqdn, domain_name, tld, expires_at,
          lifecycle_stage, grace_period_ends_at, redemption_ends_at, estimated_available_at
        FROM taken_domains
        WHERE ${whereClause}
        ORDER BY
          CASE lifecycle_stage
            WHEN 'dropping_soon' THEN 1
            WHEN 'pending_delete' THEN 2
            WHEN 'redemption' THEN 3
            WHEN 'grace_period' THEN 4
            WHEN 'expiring_soon' THEN 5
            ELSE 6
          END,
          expires_at ASC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(limit, offset);

      const dataResult = await pool.query(dataQuery, params);

      const domains: LifecycleDomain[] = dataResult.rows.map((row) => ({
        fqdn: row.fqdn,
        domain_name: row.domain_name,
        tld: row.tld,
        expires_at: row.expires_at.toISOString(),
        lifecycle_stage: row.lifecycle_stage || 'taken',
        lifecycle_info: buildLifecycleInfo(row),
      }));

      reply.header('X-RateLimit-Remaining', Math.max(0, remaining - 1));

      return {
        domains,
        pagination: { total, limit, offset, has_more: offset + domains.length < total },
        filters: {
          tlds: tlds ? tlds.split(',').map((t) => t.trim()) : null,
          days,
          keywords: keywords || null,
          lifecycle_stage: lifecycle_stage || null,
        },
        lifecycle_stages: Object.entries(LIFECYCLE_DESCRIPTIONS).map(([stage, info]) => ({
          stage,
          ...info,
        })),
      };
    } catch (err) {
      fastify.log.error({ err }, 'Failed to query expiring domains');
      return reply.status(500).send({ error: 'Database error', message: 'Failed to query expiring domains' });
    }
  });

  /**
   * GET /dropping - Find domains available for registration NOW
   * (Convenience endpoint for drop catchers)
   */
  fastify.get<{ Querystring: ExpiringQuery }>('/dropping', async (request, reply) => {
    const clientIp = request.ip;
    const remaining = await checkRateLimit(`dropping:${clientIp}`, 60, 60);

    if (remaining < 0) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        retry_after: 60,
      });
    }

    const parseResult = ExpiringQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation error', details: parseResult.error.errors });
    }

    const { tlds, limit, offset, keywords } = parseResult.data;
    const pool = getPool();

    try {
      const conditions: string[] = [
        "lifecycle_stage IN ('pending_delete', 'dropping_soon')",
      ];
      const params: (string | number)[] = [];
      let paramIndex = 1;

      if (tlds) {
        const tldList = tlds.split(',').map((t) => t.trim().toLowerCase());
        const tldPlaceholders = tldList.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`tld IN (${tldPlaceholders})`);
        params.push(...tldList);
      }

      if (keywords) {
        const keywordList = keywords.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
        const keywordConditions = keywordList.map(() => `domain_name ILIKE '%' || $${paramIndex++} || '%'`);
        conditions.push(`(${keywordConditions.join(' OR ')})`);
        params.push(...keywordList);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await pool.query(`SELECT COUNT(*) FROM taken_domains WHERE ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataQuery = `
        SELECT fqdn, domain_name, tld, expires_at, lifecycle_stage,
               grace_period_ends_at, redemption_ends_at, estimated_available_at
        FROM taken_domains
        WHERE ${whereClause}
        ORDER BY estimated_available_at ASC NULLS LAST
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(limit, offset);

      const dataResult = await pool.query(dataQuery, params);

      const domains: LifecycleDomain[] = dataResult.rows.map((row) => ({
        fqdn: row.fqdn,
        domain_name: row.domain_name,
        tld: row.tld,
        expires_at: row.expires_at.toISOString(),
        lifecycle_stage: row.lifecycle_stage,
        lifecycle_info: buildLifecycleInfo(row),
      }));

      reply.header('X-RateLimit-Remaining', Math.max(0, remaining - 1));

      return {
        domains,
        pagination: { total, limit, offset, has_more: offset + domains.length < total },
        message: total > 0
          ? `🔥 ${total} domain(s) dropping soon! Act fast!`
          : 'No domains currently in drop window. Check back later.',
      };
    } catch (err) {
      fastify.log.error({ err }, 'Failed to query dropping domains');
      return reply.status(500).send({ error: 'Database error' });
    }
  });
};

export default expiringRoute;
