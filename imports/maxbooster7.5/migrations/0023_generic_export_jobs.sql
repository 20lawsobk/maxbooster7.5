-- CG-2: pending operator application; never applied by readiness repair.
CREATE TABLE IF NOT EXISTS generic_export_jobs (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  format text NOT NULL,
  project_id varchar,
  settings jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  artifact jsonb,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS generic_export_jobs_user_created_idx ON generic_export_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generic_export_jobs_status_idx ON generic_export_jobs(status, updated_at);