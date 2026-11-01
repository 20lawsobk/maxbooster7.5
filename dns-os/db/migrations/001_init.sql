-- dns-os: Phase 1 — Core schema
-- Run: psql $DATABASE_URL -f db/migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  api_key    TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── DNS Zones ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       CITEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','disabled')),
  serial     BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_zones_tenant ON zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zones_name   ON zones(name);

-- ─── DNS Records ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS records (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id    UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name       CITEXT NOT NULL,           -- '@', 'www', 'mail', '_acme-challenge'
  type       TEXT NOT NULL,             -- A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
  ttl        INTEGER NOT NULL DEFAULT 3600 CHECK (ttl >= 60 AND ttl <= 604800),
  priority   INTEGER,                   -- MX / SRV
  weight     INTEGER,                   -- SRV
  port       INTEGER,                   -- SRV
  data       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_zone_name_type
  ON records(zone_id, name, type);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER zones_updated_at   BEFORE UPDATE ON zones   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER records_updated_at BEFORE UPDATE ON records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
