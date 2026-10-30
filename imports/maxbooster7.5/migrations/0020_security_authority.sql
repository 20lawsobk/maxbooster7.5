-- PENDING operator application. Existing cookies without generation require login again.
CREATE TABLE IF NOT EXISTS auth_session_epochs (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0)
);
-- Per-active-factor replay watermark, shared by every pod and auth entrypoint.
ALTER TABLE auth_session_epochs ADD COLUMN IF NOT EXISTS last_totp_step bigint;
ALTER TABLE auth_session_epochs ADD COLUMN IF NOT EXISTS last_totp_secret_hash text;

-- Intentionally no FK: erasure evidence must survive eventual account removal.
-- No email, passwords, tokens or provider credentials in this queue.
CREATE TABLE IF NOT EXISTS account_erasure_requests (
  user_id varchar PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now() + interval '30 days',
  status text NOT NULL DEFAULT 'pending_policy'
    CHECK (status IN ('pending_policy', 'cancelled', 'processing', 'completed')),
  policy_version text,
  completed_at timestamptz
);