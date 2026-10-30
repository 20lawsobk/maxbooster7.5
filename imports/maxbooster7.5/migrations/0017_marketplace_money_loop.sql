-- =============================================================================
-- 0017: Marketplace money loop
-- Reconciles revenue_events to support marketplace beat sales and adds
-- supporting royalty-calculation tables (recoupment, split contracts, DSP
-- rates, exchange rates).
-- =============================================================================

-- ── revenue_events ────────────────────────────────────────────────────────────
-- The baseline migration created this table for DSP streaming revenue with:
--   project_id  uuid NOT NULL  (FK → projects)
--   source      revenue_source enum NOT NULL
--   amount      numeric(10,2)
--   currency    varchar(10) DEFAULT 'USD' NOT NULL
--   raw_amount, description, created_at
-- We evolve it here to also record marketplace beat-sale events.

-- 1. Drop indexes that reference columns we will alter or drop.
DROP INDEX IF EXISTS "revenue_events_project_created_at_idx";
DROP INDEX IF EXISTS "revenue_events_source_idx";
DROP INDEX IF EXISTS "revenue_events_project_id_idx";

-- 2. Drop the FK that enforces project_id → projects (beat IDs are not projects).
ALTER TABLE "revenue_events"
  DROP CONSTRAINT IF EXISTS "revenue_events_project_id_projects_id_fk";

-- 3. project_id: uuid NOT NULL  →  varchar nullable
ALTER TABLE "revenue_events" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "revenue_events"
  ALTER COLUMN "project_id" TYPE varchar USING "project_id"::text;

-- 4. source: revenue_source enum  →  plain text  (accepts "marketplace")
ALTER TABLE "revenue_events"
  ALTER COLUMN "source" TYPE text USING "source"::text;

-- 5. amount: numeric(10,2)  →  real
ALTER TABLE "revenue_events"
  ALTER COLUMN "amount" TYPE real USING "amount"::real;

-- 6. currency: varchar(10) NOT NULL DEFAULT 'USD'  →  text nullable DEFAULT 'usd'
ALTER TABLE "revenue_events"
  ALTER COLUMN "currency" TYPE text USING "currency"::text;
ALTER TABLE "revenue_events" ALTER COLUMN "currency" DROP NOT NULL;
ALTER TABLE "revenue_events" ALTER COLUMN "currency" SET DEFAULT 'usd';

-- 7. Drop legacy columns not used by application code.
ALTER TABLE "revenue_events" DROP COLUMN IF EXISTS "raw_amount";
ALTER TABLE "revenue_events" DROP COLUMN IF EXISTS "description";
ALTER TABLE "revenue_events" DROP COLUMN IF EXISTS "created_at";

-- 8. Add marketplace-specific columns (all nullable for backward compatibility).
ALTER TABLE "revenue_events" ADD COLUMN IF NOT EXISTS "user_id"    varchar;
ALTER TABLE "revenue_events" ADD COLUMN IF NOT EXISTS "listing_id" varchar;
ALTER TABLE "revenue_events" ADD COLUMN IF NOT EXISTS "order_id"   varchar;

-- 9. Unique constraint on order_id: prevents double-booking on payment retries.
--    NULL values are excluded from uniqueness in PostgreSQL, so historical
--    streaming events (order_id IS NULL) are unaffected.
ALTER TABLE "revenue_events"
  DROP CONSTRAINT IF EXISTS "revenue_events_order_id_unique";
ALTER TABLE "revenue_events"
  ADD CONSTRAINT "revenue_events_order_id_unique" UNIQUE ("order_id");

-- 10. Rebuild / create indexes for the new query patterns.
CREATE INDEX IF NOT EXISTS "revenue_events_project_id_idx"
  ON "revenue_events" ("project_id");
CREATE INDEX IF NOT EXISTS "revenue_events_user_id_occurred_at_idx"
  ON "revenue_events" ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "revenue_events_source_occurred_at_idx"
  ON "revenue_events" ("source", "occurred_at");

-- ── project_royalty_splits ────────────────────────────────────────────────────
-- Drop the FK constraints so beat UUIDs (not in projects table) can be stored.
ALTER TABLE "project_royalty_splits"
  DROP CONSTRAINT IF EXISTS "project_royalty_splits_project_id_projects_id_fk";
ALTER TABLE "project_royalty_splits"
  DROP CONSTRAINT IF EXISTS "project_royalty_splits_collaborator_id_users_id_fk";
ALTER TABLE "project_royalty_splits" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "project_royalty_splits"
  ALTER COLUMN "project_id" TYPE varchar USING "project_id"::text;

-- ── recoupment_accounts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recoupment_accounts" (
  "id"                varchar      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"           varchar      NOT NULL,
  "release_id"        varchar,
  "total_advance"     real         DEFAULT 0,
  "recouped_amount"   real         DEFAULT 0,
  "remaining_balance" text         DEFAULT '0',
  "recoupment_rate"   text         DEFAULT '100',
  "is_active"         boolean      DEFAULT true,
  "priority"          integer      DEFAULT 1,
  "fully_recouped_at" timestamp,
  "created_at"        timestamp    DEFAULT now(),
  "updated_at"        timestamp    DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "recoupment_accounts_user_id_active_idx"
  ON "recoupment_accounts" ("user_id", "is_active");

-- ── split_contracts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "split_contracts" (
  "id"         varchar   PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "release_id" varchar   NOT NULL,
  "status"     text      DEFAULT 'active',
  "participants" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "split_contracts_release_id_status_idx"
  ON "split_contracts" ("release_id", "status");

-- ── dsp_rates ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dsp_rates" (
  "id"             varchar   PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dsp_name"       text      NOT NULL,
  "dsp_slug"       text      NOT NULL,
  "territory"      text      NOT NULL DEFAULT 'GLOBAL',
  "rate_per_stream" text     NOT NULL,
  "currency"       text      DEFAULT 'USD',
  "effective_from" timestamp NOT NULL,
  "effective_to"   timestamp,
  "created_at"     timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dsp_rates_slug_territory_idx"
  ON "dsp_rates" ("dsp_slug", "territory");

-- ── exchange_rates ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id"            varchar   PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_currency" text      NOT NULL,
  "to_currency"   text      NOT NULL,
  "rate"          text      NOT NULL,
  "rate_date"     timestamp NOT NULL,
  "created_at"    timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exchange_rates_pair_date_idx"
  ON "exchange_rates" ("from_currency", "to_currency", "rate_date");
