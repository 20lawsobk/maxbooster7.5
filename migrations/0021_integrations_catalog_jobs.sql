-- Additive only. PENDING operator review/application to the shared Neon database.
-- No backfill: historical eligibility must be approved before enqueuing old profiles.
CREATE TABLE IF NOT EXISTS integration_catalog_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id varchar NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_owner uuid,
  lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  error text,
  UNIQUE(profile_id)
);
CREATE INDEX IF NOT EXISTS integration_catalog_jobs_claim_idx
  ON integration_catalog_jobs(state, available_at, lease_until);

CREATE TABLE IF NOT EXISTS integration_catalog_transfers (
  id text PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_catalog_transfers_user_idx
  ON integration_catalog_transfers(user_id, updated_at DESC);