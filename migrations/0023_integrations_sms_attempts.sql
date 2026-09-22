-- PENDING operator review/application. No live changes performed.
CREATE TABLE IF NOT EXISTS integration_sms_attempts (
  operation_key text PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('started','accepted','delivered','failed','unknown')),
  provider_id text UNIQUE,
  provider_status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);