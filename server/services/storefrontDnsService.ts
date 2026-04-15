/**
 * storefrontDnsService — Phase 3/4 integration layer
 *
 * Bridges the Max Booster storefront system with the built-in authoritative
 * DNS provider (dns_zones / dns_zone_records tables + dnsServer.ts).
 *
 * Responsibilities:
 *   1. attachDomainToStorefront() — creates zone + default records, links them
 *   2. verifyStorefrontDomain()  — checks TXT propagation for one domain
 *   3. activateStorefrontDomain() — promotes status to 'active', writes storefront_hosts
 *   4. provisionCertificateForHost() — placeholder for ACME HTTP-01 / DNS-01
 *   5. detachDomainFromStorefront() — tears down zone + host rows
 */

import { pool } from '../db.js';
import { logger } from '../logger.js';
import dns from 'dns';
import crypto from 'crypto';

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'maxbooster.replit.app').toLowerCase();
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || '34.111.179.208';
const NS1 = `ns1.${BASE_DOMAIN}`;
const NS2 = `ns2.${BASE_DOMAIN}`;

const dnsResolve = dns.promises.resolve;

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateVerificationToken(): string {
  return `mb-verify-${crypto.randomBytes(16).toString('hex')}`;
}

function normaliseDomain(d: string): string {
  return d.toLowerCase().trim().replace(/\.$/, '');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AttachDomainResult {
  storefrontDomainId: string;
  dnsZoneId: string;
  domain: string;
  verificationToken: string;
  nameservers: { ns1: string; ns2: string };
  instructions: string;
}

/**
 * attachDomainToStorefront
 *
 * Flow:
 *   1. Validate domain not already claimed
 *   2. Create dns_zones row (status='pending')
 *   3. Add default records: SOA info (NS), verification TXT, A record
 *   4. Bump zone serial
 *   5. Upsert storefront_domains row linking to the zone
 *
 * Returns everything the UI needs to show the "point your NS here" screen.
 */
export async function attachDomainToStorefront(
  storefrontId: string,
  userId: string,
  rawDomain: string,
): Promise<AttachDomainResult> {
  const domain = normaliseDomain(rawDomain);
  const verificationToken = generateVerificationToken();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Check for existing claim ───────────────────────────────────────
    const { rows: existing } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM storefront_domains WHERE domain = $1`,
      [domain],
    );
    if (existing.length > 0) {
      const ex = existing[0];
      if (ex.status === 'active') {
        throw new Error(`Domain '${domain}' is already active on another storefront.`);
      }
      // If pending/failed allow re-claim (idempotent re-issue)
      await client.query(`DELETE FROM storefront_domains WHERE id = $1`, [ex.id]);
    }

    // ── 2. Create dns_zones row ───────────────────────────────────────────
    const { rows: [zone] } = await client.query<{ id: string }>(
      `INSERT INTO dns_zones (user_id, domain, status, verification_token, nameserver1, nameserver2)
       VALUES ($1, $2, 'pending', $3, $4, $5)
       ON CONFLICT (domain) DO UPDATE
         SET user_id            = EXCLUDED.user_id,
             status             = 'pending',
             verification_token = EXCLUDED.verification_token,
             updated_at         = now()
       RETURNING id`,
      [userId, domain, verificationToken, NS1, NS2],
    );
    const zoneId = zone.id;

    // ── 3. Add default records ────────────────────────────────────────────
    // NS records (so dig can find your nameservers)
    for (const ns of [NS1, NS2]) {
      await client.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
         VALUES ($1,$2,$3,'NS','@',$4,86400)
         ON CONFLICT DO NOTHING`,
        [zoneId, userId, domain, ns],
      );
    }

    // Verification TXT
    await client.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'TXT','@',$4,300)
       ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, verificationToken],
    );

    // Default A record → platform edge IP
    await client.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'A','@',$4,300)
       ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, DNS_SERVER_IP],
    );

    // www CNAME → root
    await client.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'CNAME','www',$4,300)
       ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, domain],
    );

    // ── 4. Bump zone serial ───────────────────────────────────────────────
    await client.query(
      `UPDATE dns_zones SET updated_at = now() WHERE id = $1`,
      [zoneId],
    );

    // ── 5. Upsert storefront_domains ──────────────────────────────────────
    const { rows: [sd] } = await client.query<{ id: string }>(
      `INSERT INTO storefront_domains
         (storefront_id, domain, type, status, verification_token, dns_zone_id)
       VALUES ($1,$2,'custom_domain','pending',$3,$4)
       RETURNING id`,
      [storefrontId, domain, verificationToken, zoneId],
    );

    await client.query('COMMIT');

    logger.info({ storefrontId, domain, zoneId }, '[storefrontDns] domain attached');

    return {
      storefrontDomainId: sd.id,
      dnsZoneId: zoneId,
      domain,
      verificationToken,
      nameservers: { ns1: NS1, ns2: NS2 },
      instructions: `Point your registrar's nameservers to:\n  NS1: ${NS1}\n  NS2: ${NS2}\n\nOnce propagated (up to 48 h), Max Booster will verify automatically.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * verifyStorefrontDomain
 *
 * Checks whether the verification TXT record is visible via public DNS.
 * Called by the background worker; also callable on-demand from a route.
 *
 * Returns: 'verified' | 'pending' | 'failed'
 */
export async function verifyStorefrontDomain(
  storefrontDomainId: string,
): Promise<'verified' | 'pending' | 'failed'> {
  const { rows } = await pool.query<{
    domain: string;
    verification_token: string;
    verification_failures: number;
    status: string;
    dns_zone_id: string | null;
  }>(
    `SELECT domain, verification_token, verification_failures, status, dns_zone_id
     FROM storefront_domains WHERE id = $1`,
    [storefrontDomainId],
  );

  if (!rows[0]) return 'failed';
  const { domain, verification_token, verification_failures, status, dns_zone_id } = rows[0];

  if (status === 'active') return 'verified';

  let txtRecords: string[] = [];
  try {
    const records = await Promise.race<string[][]>([
      dnsResolve(domain, 'TXT') as Promise<string[][]>,
      new Promise<string[][]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    txtRecords = (records as unknown as string[][]).flat();
  } catch {
    // DNS not yet propagated or domain doesn't resolve — keep pending
  }

  const verified = txtRecords.some(t => t.includes(verification_token));

  if (verified) {
    await activateStorefrontDomain(storefrontDomainId, domain, dns_zone_id);
    return 'verified';
  }

  // Increment failure counter; mark as 'verification_failed' after 7 days (~10_080 min → 10_080 polls at 1/min)
  const newFailures = verification_failures + 1;
  const MAX_FAILURES = 10_080; // 7 days at 1 check/minute
  const newStatus = newFailures >= MAX_FAILURES ? 'verification_failed' : status;

  await pool.query(
    `UPDATE storefront_domains
     SET verification_failures = $1, status = $2, updated_at = now()
     WHERE id = $3`,
    [newFailures, newStatus, storefrontDomainId],
  );

  return newFailures >= MAX_FAILURES ? 'failed' : 'pending';
}

/**
 * activateStorefrontDomain
 *
 * Called when verification passes.
 * Sets domain status → 'active', zone status → 'active', writes storefront_hosts row.
 */
async function activateStorefrontDomain(
  storefrontDomainId: string,
  domain: string,
  dnsZoneId: string | null,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE storefront_domains
       SET status = 'active', verified_at = now(), verification_failures = 0, updated_at = now()
       WHERE id = $1`,
      [storefrontDomainId],
    );

    if (dnsZoneId) {
      await client.query(
        `UPDATE dns_zones SET status = 'active', is_verified = true, updated_at = now()
         WHERE id = $1`,
        [dnsZoneId],
      );
    }

    // Write storefront_hosts projection row
    const { rows } = await client.query<{ storefront_id: string }>(
      `SELECT storefront_id FROM storefront_domains WHERE id = $1`,
      [storefrontDomainId],
    );
    if (rows[0]) {
      await client.query(
        `INSERT INTO storefront_hosts (host, storefront_id, cert_status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (host) DO UPDATE
           SET storefront_id = EXCLUDED.storefront_id,
               updated_at    = now()`,
        [domain, rows[0].storefront_id],
      );

      // Also add 'www.' variant if it's a root domain (no subdomain)
      if (!domain.startsWith('www.') && domain.split('.').length === 2) {
        await client.query(
          `INSERT INTO storefront_hosts (host, storefront_id, cert_status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (host) DO UPDATE
             SET storefront_id = EXCLUDED.storefront_id,
                 updated_at    = now()`,
          [`www.${domain}`, rows[0].storefront_id],
        );
      }
    }

    await client.query('COMMIT');
    logger.info({ storefrontDomainId, domain }, '[storefrontDns] domain activated');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * provisionCertificateForHost
 *
 * Placeholder for ACME HTTP-01 / DNS-01 certificate provisioning.
 * DNS-01 is possible because Max Booster controls the zone — it can write
 * _acme-challenge.<domain> TXT records directly via dns_zone_records.
 *
 * Integration point: wire in node-acme-client or certbot-dns when ready.
 */
export async function provisionCertificateForHost(host: string): Promise<void> {
  logger.info({ host }, '[storefrontDns] cert provisioning requested (not yet implemented)');

  await pool.query(
    `UPDATE storefront_hosts SET cert_status = 'pending', updated_at = now()
     WHERE host = $1`,
    [host],
  );

  // TODO: call ACME client here:
  //   1. Create _acme-challenge.<host> TXT record via dns_zone_records
  //   2. Wait for ACME server to verify
  //   3. Receive certificate + private key
  //   4. Store in secrets manager / Vault
  //   5. Update cert_status = 'issued', cert_issued_at, cert_expires_at
}

/**
 * detachDomainFromStorefront
 *
 * Removes domain claim, DNS zone, and host routing entry.
 */
export async function detachDomainFromStorefront(storefrontDomainId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ domain: string; dns_zone_id: string | null }>(
      `SELECT domain, dns_zone_id FROM storefront_domains WHERE id = $1`,
      [storefrontDomainId],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return;
    }
    const { domain, dns_zone_id } = rows[0];

    await client.query(`DELETE FROM storefront_domains WHERE id = $1`, [storefrontDomainId]);
    await client.query(`DELETE FROM storefront_hosts WHERE host = $1 OR host = $2`, [domain, `www.${domain}`]);

    if (dns_zone_id) {
      await client.query(`DELETE FROM dns_zones WHERE id = $1`, [dns_zone_id]);
    }

    await client.query('COMMIT');
    logger.info({ storefrontDomainId, domain }, '[storefrontDns] domain detached');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * lookupStorefrontByHost
 *
 * Used by the host-based router middleware to map an incoming request's
 * Host header → storefront ID.
 */
export async function lookupStorefrontByHost(host: string): Promise<string | null> {
  const { rows } = await pool.query<{ storefront_id: string }>(
    `SELECT storefront_id FROM storefront_hosts WHERE host = $1`,
    [host.toLowerCase().replace(/:\d+$/, '')],
  );
  return rows[0]?.storefront_id ?? null;
}
