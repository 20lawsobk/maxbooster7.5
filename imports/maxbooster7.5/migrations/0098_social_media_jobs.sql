BEGIN;
CREATE TABLE IF NOT EXISTS social_media_jobs (
  id varchar PRIMARY KEY,
  family text NOT NULL,
  owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processing',
  result jsonb,
  error text,
  lease_token varchar NOT NULL,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_media_jobs_owner_idx ON social_media_jobs(owner_id,family,created_at);
CREATE INDEX IF NOT EXISTS social_media_jobs_lease_idx ON social_media_jobs(status,lease_expires_at);
CREATE INDEX IF NOT EXISTS social_media_jobs_updated_idx ON social_media_jobs(updated_at);
COMMIT;
