-- AUTHORED ONLY for reviewed application; no live application authorized.
-- Exact additive digest DDL from closure-integrations.md.
CREATE TABLE IF NOT EXISTS integration_notification_digest (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  due_at timestamptz NOT NULL,
  state text NOT NULL CHECK
    (state IN ('pending','started','accepted','rejected','unknown','suppressed')),
  owner uuid,
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_notification_digest_due
  ON integration_notification_digest (due_at,id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS integration_notification_digest_owner
  ON integration_notification_digest (owner) WHERE owner IS NOT NULL;
CREATE INDEX IF NOT EXISTS integration_notification_digest_user_due
  ON integration_notification_digest (user_id,due_at) WHERE state='pending';