-- ============================================================
-- Feature Events Table Partitioning Script
-- ============================================================
-- Run this ONCE manually in production when the feature_events
-- table approaches 50M+ rows. It converts the table to monthly
-- range partitioning by created_at, which keeps query plans
-- tight and allows old partitions to be detached/archived.
--
-- IMPORTANT: Run during a maintenance window with no writes.
-- This is a DBA-level migration, NOT run by db:push.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/partition-feature-events.sql
-- ============================================================

BEGIN;

-- 1. Rename the existing table to a staging name
ALTER TABLE feature_events RENAME TO feature_events_old;

-- 2. Create the new partitioned parent (no rows stored here directly)
CREATE TABLE feature_events (
  id          SERIAL,
  user_id     INTEGER NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  action      VARCHAR(50) NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 3. Seed partitions for the next 24 months
-- Adjust the date range as needed for your go-live timeline
DO $$
DECLARE
  start_date DATE := DATE_TRUNC('month', NOW())::DATE;
  i INTEGER;
  part_name TEXT;
  part_start TEXT;
  part_end TEXT;
BEGIN
  FOR i IN 0..23 LOOP
    part_name  := 'feature_events_' || TO_CHAR(start_date + (i * INTERVAL '1 month'), 'YYYY_MM');
    part_start := TO_CHAR(start_date + (i * INTERVAL '1 month'), 'YYYY-MM-DD');
    part_end   := TO_CHAR(start_date + ((i + 1) * INTERVAL '1 month'), 'YYYY-MM-DD');
    EXECUTE FORMAT(
      'CREATE TABLE %I PARTITION OF feature_events FOR VALUES FROM (%L) TO (%L)',
      part_name, part_start, part_end
    );
  END LOOP;
END;
$$;

-- 4. Re-create indexes on the partitioned table (PostgreSQL propagates to partitions)
CREATE INDEX ON feature_events (user_id, feature_name);
CREATE INDEX ON feature_events (created_at);
CREATE INDEX ON feature_events (user_id);

-- 5. Migrate data from old table (takes time — run with statement_timeout = 0)
INSERT INTO feature_events (id, user_id, feature_name, action, metadata, created_at)
SELECT id, user_id, feature_name, action, metadata, created_at
FROM feature_events_old;

-- 6. Drop old table after confirming row counts match
-- SELECT COUNT(*) FROM feature_events_old;
-- SELECT COUNT(*) FROM feature_events;
-- DROP TABLE feature_events_old;

COMMIT;

-- ============================================================
-- customer_health_scores — add created_at range partitioning
-- when that table also approaches 50M+ rows (one row per user
-- per recompute cycle). Run a similar migration on that table.
-- ============================================================
