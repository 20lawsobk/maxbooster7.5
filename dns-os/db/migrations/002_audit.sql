-- dns-os: Phase 2 — Audit log + zone-serial bump function
-- Run after 001_init.sql

-- ─── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID,
  zone_id    UUID,
  actor      TEXT,                       -- API key prefix or 'system'
  action     TEXT NOT NULL,              -- 'create_zone','delete_record',etc.
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_zone   ON audit_log(zone_id,   created_at DESC);

-- ─── Atomic serial bump ──────────────────────────────────────────────────────
-- Call: SELECT bump_zone_serial('<zone_id>');
-- Returns the new serial value. Safe for concurrent writers.
CREATE OR REPLACE FUNCTION bump_zone_serial(p_zone_id UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_serial BIGINT;
BEGIN
  UPDATE zones
  SET serial = serial + 1, updated_at = now()
  WHERE id = p_zone_id
  RETURNING serial INTO v_serial;
  RETURN v_serial;
END;
$$;
