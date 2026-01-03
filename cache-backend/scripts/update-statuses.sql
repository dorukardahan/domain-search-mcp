-- Update domain statuses and lifecycle stages
-- Runs every 6 hours via cron

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Calculate lifecycle dates for domains with expiry info
-- ═══════════════════════════════════════════════════════════════════════════

-- Set grace period (expires + 45 days), redemption (expires + 75 days), available (expires + 80 days)
UPDATE taken_domains
SET
  grace_period_ends_at = expires_at + INTERVAL '45 days',
  redemption_ends_at = expires_at + INTERVAL '75 days',
  estimated_available_at = expires_at + INTERVAL '80 days'
WHERE expires_at IS NOT NULL
  AND grace_period_ends_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Update lifecycle stages based on current date
--    NOTE: Order matters! Most advanced stage first (dropping_soon → taken)
--    This ensures domains "catch up" to their correct stage even if they
--    were added after expiring.
-- ═══════════════════════════════════════════════════════════════════════════

-- STAGE 6: Available date reached → dropping_soon (can be registered!)
-- Must come FIRST so domains past available date get set correctly
UPDATE taken_domains
SET status = 'expired', lifecycle_stage = 'dropping_soon'
WHERE estimated_available_at IS NOT NULL
  AND NOW() >= estimated_available_at
  AND lifecycle_stage != 'dropping_soon';

-- STAGE 5: Redemption ended but not yet available → pending_delete (5 days before available)
UPDATE taken_domains
SET status = 'expired', lifecycle_stage = 'pending_delete'
WHERE redemption_ends_at IS NOT NULL
  AND estimated_available_at IS NOT NULL
  AND NOW() >= redemption_ends_at
  AND NOW() < estimated_available_at
  AND lifecycle_stage NOT IN ('pending_delete', 'dropping_soon');

-- STAGE 4: Grace period ended but still in redemption → redemption
UPDATE taken_domains
SET status = 'expired', lifecycle_stage = 'redemption'
WHERE grace_period_ends_at IS NOT NULL
  AND redemption_ends_at IS NOT NULL
  AND NOW() >= grace_period_ends_at
  AND NOW() < redemption_ends_at
  AND lifecycle_stage NOT IN ('redemption', 'pending_delete', 'dropping_soon');

-- STAGE 3: Just expired, still in grace period → grace_period
UPDATE taken_domains
SET status = 'expired', lifecycle_stage = 'grace_period'
WHERE expires_at IS NOT NULL
  AND grace_period_ends_at IS NOT NULL
  AND expires_at <= NOW()
  AND NOW() < grace_period_ends_at
  AND lifecycle_stage NOT IN ('grace_period', 'redemption', 'pending_delete', 'dropping_soon');

-- STAGE 2: Active domains expiring within 90 days → expiring_soon
UPDATE taken_domains
SET status = 'expiring_soon', lifecycle_stage = 'expiring_soon'
WHERE expires_at IS NOT NULL
  AND expires_at > NOW()
  AND expires_at < NOW() + INTERVAL '90 days'
  AND lifecycle_stage NOT IN ('expiring_soon', 'grace_period', 'redemption', 'pending_delete', 'dropping_soon');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Cleanup: Remove domains that have been "dropping_soon" for 7+ days
--    (They were either registered by someone or renewed by owner)
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM taken_domains
WHERE lifecycle_stage = 'dropping_soon'
  AND estimated_available_at < NOW() - INTERVAL '7 days';

-- Remove stale entries (single report, not confirmed in 14 days)
DELETE FROM taken_domains
WHERE last_confirmed_at < NOW() - INTERVAL '14 days'
  AND report_count = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Show summary
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  lifecycle_stage,
  COUNT(*) as count,
  MIN(expires_at) as earliest_expiry,
  MAX(expires_at) as latest_expiry
FROM taken_domains
WHERE lifecycle_stage IS NOT NULL
GROUP BY lifecycle_stage
ORDER BY
  CASE lifecycle_stage
    WHEN 'taken' THEN 1
    WHEN 'expiring_soon' THEN 2
    WHEN 'grace_period' THEN 3
    WHEN 'redemption' THEN 4
    WHEN 'pending_delete' THEN 5
    WHEN 'dropping_soon' THEN 6
  END;
