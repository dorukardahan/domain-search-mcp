-- ═══════════════════════════════════════════════════════════════════════════
-- Domain Cache Backend - PostgreSQL Schema
-- ═══════════════════════════════════════════════════════════════════════════

-- Main table for tracking taken domains
CREATE TABLE IF NOT EXISTS taken_domains (
    id BIGSERIAL PRIMARY KEY,
    fqdn VARCHAR(255) NOT NULL UNIQUE,
    domain_name VARCHAR(63) NOT NULL,
    tld VARCHAR(63) NOT NULL,
    expires_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ,
    first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_count INT NOT NULL DEFAULT 1,
    last_source VARCHAR(50),
    status VARCHAR(20) DEFAULT 'taken' CHECK (status IN ('taken', 'expiring_soon', 'expired'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_taken_domains_fqdn ON taken_domains(fqdn);
CREATE INDEX IF NOT EXISTS idx_taken_domains_tld ON taken_domains(tld);
CREATE INDEX IF NOT EXISTS idx_taken_domains_expires ON taken_domains(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taken_domains_status ON taken_domains(status);
CREATE INDEX IF NOT EXISTS idx_taken_domains_last_confirmed ON taken_domains(last_confirmed_at);

-- Materialized view for fast expiring queries (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS expiring_soon AS
SELECT
    fqdn,
    domain_name,
    tld,
    expires_at,
    EXTRACT(EPOCH FROM (expires_at - NOW())) / 86400 AS days_until_expiration
FROM taken_domains
WHERE expires_at IS NOT NULL
  AND expires_at > NOW()
  AND expires_at < NOW() + INTERVAL '90 days'
ORDER BY expires_at ASC;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_expiring_soon_days ON expiring_soon(days_until_expiration);
CREATE INDEX IF NOT EXISTS idx_expiring_soon_tld ON expiring_soon(tld);

-- Function to update status based on expiry dates
CREATE OR REPLACE FUNCTION update_domain_statuses() RETURNS void AS $$
BEGIN
    -- Mark domains as expiring_soon (within 90 days)
    UPDATE taken_domains
    SET status = 'expiring_soon'
    WHERE expires_at IS NOT NULL
      AND expires_at > NOW()
      AND expires_at < NOW() + INTERVAL '90 days'
      AND status = 'taken';

    -- Mark domains as expired
    UPDATE taken_domains
    SET status = 'expired'
    WHERE expires_at IS NOT NULL
      AND expires_at <= NOW()
      AND status != 'expired';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old entries
CREATE OR REPLACE FUNCTION cleanup_old_domains() RETURNS void AS $$
BEGIN
    -- Remove old unconfirmed entries (7 days, single report)
    DELETE FROM taken_domains
    WHERE last_confirmed_at < NOW() - INTERVAL '7 days'
      AND report_count = 1;

    -- Remove domains expired more than 30 days ago
    DELETE FROM taken_domains
    WHERE status = 'expired'
      AND expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON taken_domains TO domain_cache_user;
-- GRANT SELECT ON expiring_soon TO domain_cache_user;
