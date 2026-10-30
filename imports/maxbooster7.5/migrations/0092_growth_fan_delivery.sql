-- Pending application. No historical consent or delivery is inferred.
CREATE TABLE IF NOT EXISTS growth_fan_permissions (
  artist_id text NOT NULL,
  email text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','consented','suppressed')),
  token_hash text,
  token_expires_at timestamptz,
  consent_at timestamptz,
  suppressed_at timestamptz,
  PRIMARY KEY (artist_id,email)
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_fan_token_idx ON growth_fan_permissions(token_hash);
CREATE TABLE IF NOT EXISTS growth_fan_commands (
  id text PRIMARY KEY,
  artist_id text NOT NULL,
  command_key text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist_id,command_key)
);
CREATE TABLE IF NOT EXISTS growth_fan_recipients (
  command_id text NOT NULL REFERENCES growth_fan_commands(id),
  email text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','sending','accepted','unknown','suppressed','delivered','bounced','complained')),
  unsubscribe_hash text NOT NULL UNIQUE,
  unsubscribe_token text NOT NULL,
  attempted_at timestamptz,
  completed_at timestamptz,
  provider_message_id text,
  outcome_reason text,
  PRIMARY KEY (command_id,email)
);
CREATE INDEX IF NOT EXISTS growth_fan_pending_idx ON growth_fan_recipients(command_id,state);
CREATE INDEX IF NOT EXISTS growth_fan_receipt_idx ON growth_fan_recipients(provider_message_id);
CREATE TABLE IF NOT EXISTS growth_fan_provider_events (
  event_id text PRIMARY KEY,
  provider_message_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_fan_event_receipt_idx ON growth_fan_provider_events(provider_message_id);