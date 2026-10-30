-- Domain Contacts: WHOIS / EPP registrant contact objects
-- One user may have multiple contact profiles (registrant, admin, tech, billing)

CREATE TABLE IF NOT EXISTS domain_contacts (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR NOT NULL,
  contact_type VARCHAR(16) NOT NULL DEFAULT 'registrant',
  name         VARCHAR(256) NOT NULL,
  org          VARCHAR(256),
  email        VARCHAR(256) NOT NULL,
  phone        VARCHAR(32),
  address      JSONB,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_contacts_user_id ON domain_contacts(user_id);

-- Domain Events: immutable event ledger for domain lifecycle audit trail

CREATE TABLE IF NOT EXISTS domain_events (
  id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id  VARCHAR NOT NULL,
  user_id    VARCHAR NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  fqdn       VARCHAR(253) NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_id ON domain_events(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_user_id   ON domain_events(user_id);
