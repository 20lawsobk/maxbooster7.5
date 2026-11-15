-- Pending operator-reviewed application. No runtime DDL.
CREATE TABLE IF NOT EXISTS runtime_backup_catalog (
  key text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  size bigint NOT NULL CHECK (size >= 0),
  checksum text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'verified', 'deleting'))
);
CREATE TABLE IF NOT EXISTS runtime_backup_runs (
  day text PRIMARY KEY,
  owner text NOT NULL,
  target_identity text NOT NULL,
  state text NOT NULL CHECK (state IN ('running', 'complete', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS pg_sessions (
  sid text PRIMARY KEY,
  sess text NOT NULL,
  expire bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS pg_sessions_expire_idx ON pg_sessions(expire);