-- dns-os: Phase 3 — Seed max-booster.com zone into main app tables
-- Run against the same Neon PostgreSQL database as the main app.
--
-- This seeds the authoritative zone for max-booster.com so that:
--   • dns-os reads SOA / NS / A / wildcard / TXT records from dns_zones + dns_zone_records
--   • ACME DNS-01 challenges (_acme-challenge TXT) written by acmeClient.ts are served
--   • DNS-PERSIST-01 validation record is pre-created for Let's Encrypt
--   • All artist storefronts at *.max-booster.com resolve to 34.117.33.233 (GCP TLS proxy)
--
-- Uses user_id 'system' — no FK constraint on dns_zones.user_id.
-- Safe to re-run (all inserts use ON CONFLICT DO NOTHING).

-- ─── 1. Create the max-booster.com zone ──────────────────────────────────────

INSERT INTO dns_zones (id, user_id, domain, status, is_verified, nameserver1, nameserver2, notes)
VALUES (
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'active',
  true,
  'ns1.max-booster.com',
  'ns2.max-booster.com',
  'Platform root zone — managed by Max Booster DNS infrastructure'
)
ON CONFLICT (domain) DO UPDATE
  SET status = 'active',
      is_verified = true,
      nameserver1 = 'ns1.max-booster.com',
      nameserver2 = 'ns2.max-booster.com',
      updated_at = now();

-- ─── 2. Helper variable for the zone id ──────────────────────────────────────
-- All record inserts below reference the zone id.
-- Zone id: 'system-max-booster-zone-00000000'

-- ─── 3. Seed DNS records ──────────────────────────────────────────────────────

-- SOA record (required for authoritative responses)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-soa-max-booster-00000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'SOA',
  '@',
  'ns1.max-booster.com. hostmaster.max-booster.com. 2026051201 3600 900 604800 60',
  3600
)
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- NS records (authoritative nameservers)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-ns1-max-booster-00000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'NS',
  '@',
  'ns1.max-booster.com.',
  3600
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-ns2-max-booster-00000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'NS',
  '@',
  'ns2.max-booster.com.',
  3600
)
ON CONFLICT (id) DO NOTHING;

-- Glue A records (ns1 and ns2 within the same zone — needed for glue)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-a-ns1-max-booster-0000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'A',
  'ns1',
  '34.117.33.233',
  3600
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-a-ns2-max-booster-0000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'A',
  'ns2',
  '34.117.33.233',
  3600
)
ON CONFLICT (id) DO NOTHING;

-- Root A record (max-booster.com itself → GCP TLS proxy)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-a-root-max-booster-000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'A',
  '@',
  '34.117.33.233',
  60
)
ON CONFLICT (id) DO UPDATE SET value = '34.117.33.233', updated_at = now();

-- Wildcard A record (*.max-booster.com → GCP TLS proxy)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-a-wildcard-max-booster-00',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'A',
  '*',
  '34.117.33.233',
  60
)
ON CONFLICT (id) DO UPDATE SET value = '34.117.33.233', updated_at = now();

-- CAA record (restrict cert issuance to Let's Encrypt only)
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl, tag)
VALUES (
  'system-caa-max-booster-00000000',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'CAA',
  '@',
  'letsencrypt.org',
  3600,
  'issue'
)
ON CONFLICT (id) DO NOTHING;

-- DNS-PERSIST-01 validation record (RFC draft-ietf-acme-dns-persist-01)
-- Pre-created here with a placeholder accounturi.
-- Run server/services/acmeClient.ts activateAcmePersistValidation() to populate
-- the real account URI after the first successful ACME account registration.
INSERT INTO dns_zone_records (id, zone_id, user_id, domain, type, name, value, ttl)
VALUES (
  'system-txt-persist-max-booster-0',
  'system-max-booster-zone-00000000',
  'system',
  'max-booster.com',
  'TXT',
  '_validation-persist',
  'letsencrypt.org; accounturi=PLACEHOLDER; policy=wildcard',
  3600
)
ON CONFLICT (id) DO NOTHING;

-- Storefront host entry so ACME renewal can issue the wildcard cert
INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
VALUES ('*.max-booster.com', 'platform-wildcard', 'pending', now(), now())
ON CONFLICT (host) DO NOTHING;

INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
VALUES ('max-booster.com', 'platform-root', 'pending', now(), now())
ON CONFLICT (host) DO NOTHING;
