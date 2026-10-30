-- Durable registration age/consent evidence for paid account creation.
-- This intentionally uses dedicated tables instead of undeclared runtime-only
-- columns on users so schema state is explicit, reviewable, and portable.

CREATE TABLE IF NOT EXISTS registration_consents (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birthdate date NOT NULL,
  age_verified boolean NOT NULL DEFAULT false,
  tos_accepted_at timestamp NOT NULL,
  tos_version text NOT NULL,
  privacy_accepted_at timestamp NOT NULL,
  privacy_version text NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT registration_consents_age_verified_check CHECK (age_verified = true)
);

CREATE TABLE IF NOT EXISTS consent_logs (
  id bigserial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  action text NOT NULL,
  version text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT consent_logs_type_check CHECK (
    consent_type IN ('tos', 'privacy', 'marketing', 'cookies')
  ),
  CONSTRAINT consent_logs_action_check CHECK (
    action IN ('accepted', 'rejected', 'withdrawn')
  )
);

CREATE INDEX IF NOT EXISTS consent_logs_user_created_idx
  ON consent_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consent_logs_type_created_idx
  ON consent_logs(consent_type, created_at DESC);
