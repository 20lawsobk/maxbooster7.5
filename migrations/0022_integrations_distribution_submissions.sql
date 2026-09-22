-- PENDING operator review/application. No runtime DDL; no existing data modified.
CREATE TABLE IF NOT EXISTS integration_distribution_submissions (
  provider text NOT NULL CHECK(provider IN ('labelgrid','toolost')),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id varchar NOT NULL,
  payload_hash text NOT NULL,
  owner uuid NOT NULL UNIQUE,
  state text NOT NULL CHECK(state IN ('started','completed','unknown')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,user_id,release_id)
);