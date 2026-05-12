/**
 * acmeClient — ACME (Let's Encrypt) DNS-01 certificate provisioning for
 * Max Booster custom storefront domains.
 *
 * Why DNS-01 (not HTTP-01)?
 *   Max Booster controls the authoritative DNS for every custom domain via
 *   `dns_zones` / `dns_zone_records` tables (storefrontDnsService writes
 *   default records when a domain is attached). That means we can satisfy
 *   the ACME challenge by writing a `_acme-challenge.<host>` TXT record
 *   directly into the DB — no inbound HTTP traffic required, works even for
 *   wildcards.
 *
 * Safety defaults:
 *   - `ACME_ENABLED` defaults to **false**. The renewal worker and the
 *     provisioning entry point both no-op cleanly when disabled.
 *   - `ACME_DIRECTORY_URL` defaults to Let's Encrypt **staging** so an
 *     accidental run can never burn through the real LE rate limit.
 *   - Per-host backoff: max attempts capped, exponential delay, last error
 *     surfaced in `cert_last_error`.
 *
 * Storage:
 *   - Issued cert PEM + chain → `storefront_hosts.cert_pem` / `cert_chain_pem`
 *     (public material, plaintext is fine).
 *   - Private key → `storefront_hosts.cert_key_encrypted` (AES-256-GCM with
 *     `acme_key_encryption_key` from `platform_settings`).
 *   - ACME account key → `platform_settings.acme_account_key_encrypted`
 *     (single account reused for every cert).
 */

import acme from 'acme-client';
import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../logger.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const ACME_ENABLED = process.env.ACME_ENABLED === 'true';
const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL || acme.directory.letsencrypt.staging;
const ACME_CONTACT_EMAIL =
  process.env.ACME_CONTACT_EMAIL || 'admin@max-booster.com';

const RENEWAL_THRESHOLD_DAYS = 30;       // Renew when < this many days remain
const MAX_PROVISION_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000;          // 1 min, doubled per attempt
const RENEWAL_CRON_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const ENCRYPTION_KEY_SETTING = 'acme_key_encryption_key';
const ACME_ACCOUNT_KEY_SETTING = 'acme_account_key_encrypted';
const IV_LENGTH = 12;

// ─── Encryption (AES-256-GCM, robust 32-byte key) ─────────────────────────────
//
// Key material: exactly 32 random bytes, stored as 64 hex chars in
// platform_settings (or supplied via ACME_KEY_ENCRYPTION_KEY env, which must
// also be 64 hex chars). We never substring/pad arbitrary strings.

let _encryptionKey: Buffer | null = null;

function parseKeyHex(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const buf = Buffer.from(hex, 'hex');
  return buf.length === 32 ? buf : null;
}

async function getEncryptionKey(): Promise<Buffer> {
  if (_encryptionKey) return _encryptionKey;

  // 1. Env override (must be 64 hex chars / 32 bytes — fail loudly otherwise).
  const env = process.env.ACME_KEY_ENCRYPTION_KEY;
  if (env) {
    const parsed = parseKeyHex(env);
    if (!parsed) {
      throw new Error(
        '[acme] ACME_KEY_ENCRYPTION_KEY is set but is not a valid 64-character hex string (32 bytes). Refusing to fall back to a generated key — fix the env var.',
      );
    }
    _encryptionKey = parsed;
    return parsed;
  }

  // 2. Try DB.
  const existing = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [ENCRYPTION_KEY_SETTING],
  );
  if (existing.rows[0]?.value) {
    const parsed = parseKeyHex(existing.rows[0].value);
    if (!parsed) {
      throw new Error(
        `[acme] platform_settings['${ENCRYPTION_KEY_SETTING}'] is malformed — expected 64 hex chars. Manual repair required.`,
      );
    }
    _encryptionKey = parsed;
    return parsed;
  }

  // 3. Generate + persist with a race-safe re-read on conflict.
  const fresh = crypto.randomBytes(32).toString('hex');
  const insert = await pool.query<{ value: string }>(
    `INSERT INTO platform_settings (key, value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO NOTHING
     RETURNING value`,
    [
      ENCRYPTION_KEY_SETTING,
      fresh,
      'AES-256-GCM key (64 hex chars / 32 bytes) for ACME private-key encryption — do not delete',
    ],
  );

  let canonical = insert.rows[0]?.value ?? null;
  if (!canonical) {
    // Lost the race — another process inserted first. Re-read the winner.
    const reread = await pool.query<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [ENCRYPTION_KEY_SETTING],
    );
    canonical = reread.rows[0]?.value ?? null;
  }
  if (!canonical) {
    throw new Error('[acme] Failed to read or persist encryption key after insert race');
  }
  const parsed = parseKeyHex(canonical);
  if (!parsed) throw new Error('[acme] Persisted encryption key is malformed');
  _encryptionKey = parsed;
  return parsed;
}

async function encryptKey(plain: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

async function decryptKey(blob: string): Promise<string> {
  const [ivHex, tagHex, encHex] = blob.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('malformed encrypted payload');
  const key = await getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(encHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

// ─── ACME client lifecycle ────────────────────────────────────────────────────

let _client: acme.Client | null = null;

async function getOrCreateClient(): Promise<acme.Client> {
  if (_client) return _client;

  // Reuse the persisted account key so we don't register a new ACME account
  // on every server boot (LE rate-limits this aggressively).
  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [ACME_ACCOUNT_KEY_SETTING],
  );

  let accountKeyPem: string;
  if (rows[0]?.value) {
    accountKeyPem = await decryptKey(rows[0].value);
  } else {
    const generated = await acme.crypto.createPrivateKey();
    accountKeyPem = generated.toString();
    const enc = await encryptKey(accountKeyPem);
    await pool.query(
      `INSERT INTO platform_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [
        ACME_ACCOUNT_KEY_SETTING,
        enc,
        'ACME account private key (encrypted) — single account for all storefront cert issuance',
      ],
    );
    logger.info('[acme] Generated and persisted new ACME account key');
  }

  _client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey: accountKeyPem,
  });

  // Create or retrieve the account on first use (idempotent on the LE side).
  try {
    await _client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${ACME_CONTACT_EMAIL}`],
    });
  } catch (err) {
    // "Account already exists" is fine — acme-client surfaces it as an
    // existing-account response, but defensively we tolerate it.
    logger.debug({ err }, '[acme] createAccount returned (likely already-exists)');
  }

  return _client;
}

// ─── DNS-01 challenge handlers (write/clean TXT in our own DB-backed DNS) ─────

async function dnsZoneIdForHost(host: string): Promise<{ zoneId: string; userId: string; rootDomain: string } | null> {
  // Match the closest dns_zone whose `domain` is a suffix of `host`.
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const { rows } = await pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM dns_zones WHERE domain = $1`,
      [candidate],
    );
    if (rows[0]) return { zoneId: rows[0].id, userId: rows[0].user_id, rootDomain: candidate };
  }
  return null;
}

async function challengeCreateFn(
  authz: acme.Authorization,
  challenge: acme.Challenge,
  keyAuthorization: string,
): Promise<void> {
  if (challenge.type !== 'dns-01') return;
  const host = (authz.identifier.value || '').toLowerCase();
  const zoneInfo = await dnsZoneIdForHost(host);
  if (!zoneInfo) throw new Error(`No dns_zone found for host '${host}' — cannot publish DNS-01 challenge`);

  // _acme-challenge.<host> within the zone — name is the part of host left of zone domain
  const fullName = `_acme-challenge.${host}`;
  const recordName = fullName === `_acme-challenge.${zoneInfo.rootDomain}`
    ? '_acme-challenge'
    : fullName.replace(`.${zoneInfo.rootDomain}`, '');

  await pool.query(
    `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
     VALUES ($1, $2, $3, 'TXT', $4, $5, 60)
     ON CONFLICT DO NOTHING`,
    [zoneInfo.zoneId, zoneInfo.userId, zoneInfo.rootDomain, recordName, keyAuthorization],
  );
  await pool.query(
    `UPDATE dns_zones SET updated_at = now() WHERE id = $1`,
    [zoneInfo.zoneId],
  );
  logger.info({ host, recordName }, '[acme] published DNS-01 challenge TXT');
}

async function challengeRemoveFn(
  authz: acme.Authorization,
  challenge: acme.Challenge,
  keyAuthorization: string,
): Promise<void> {
  if (challenge.type !== 'dns-01') return;
  const host = (authz.identifier.value || '').toLowerCase();
  const zoneInfo = await dnsZoneIdForHost(host);
  if (!zoneInfo) return;

  const fullName = `_acme-challenge.${host}`;
  const recordName = fullName === `_acme-challenge.${zoneInfo.rootDomain}`
    ? '_acme-challenge'
    : fullName.replace(`.${zoneInfo.rootDomain}`, '');

  await pool.query(
    `DELETE FROM dns_zone_records
     WHERE zone_id = $1 AND type = 'TXT' AND name = $2 AND value = $3`,
    [zoneInfo.zoneId, recordName, keyAuthorization],
  );
  logger.info({ host, recordName }, '[acme] removed DNS-01 challenge TXT');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProvisionResult {
  status: 'issued' | 'failed' | 'skipped' | 'backoff';
  reason?: string;
  expiresAt?: Date;
}

/**
 * Provision (or renew) a TLS certificate for `host` via Let's Encrypt DNS-01.
 * Idempotent: re-issues a fresh cert and overwrites prior columns on success.
 * Cleanly no-ops with `status:'skipped'` when ACME_ENABLED is not true.
 */
export async function provisionCertificate(host: string): Promise<ProvisionResult> {
  if (!ACME_ENABLED) {
    return { status: 'skipped', reason: 'ACME_ENABLED is not set to "true"' };
  }

  const normalized = host.toLowerCase().trim();

  // ── Precondition: host row MUST exist. Otherwise the final UPDATE that
  // stores the issued cert would silently no-op and we'd lose the cert.
  const { rows: existingRows } = await pool.query<{
    cert_provision_attempts: number;
    cert_last_attempt_at: Date | null;
  }>(
    `SELECT cert_provision_attempts, cert_last_attempt_at
     FROM storefront_hosts WHERE host = $1`,
    [normalized],
  );
  const existing = existingRows[0];
  if (!existing) {
    return {
      status: 'failed',
      reason: `no storefront_hosts row for '${normalized}' — call activateStorefrontDomain() first`,
    };
  }
  if (existing.cert_provision_attempts >= MAX_PROVISION_ATTEMPTS) {
    return { status: 'backoff', reason: `max attempts (${MAX_PROVISION_ATTEMPTS}) reached` };
  }
  const required = BASE_BACKOFF_MS * 2 ** existing.cert_provision_attempts;
  if (existing.cert_last_attempt_at) {
    const elapsed = Date.now() - existing.cert_last_attempt_at.getTime();
    if (elapsed < required) {
      return { status: 'backoff', reason: `backoff: wait ${Math.ceil((required - elapsed) / 1000)}s` };
    }
  }

  // ── Per-host advisory lock — prevents two cluster workers / two
  // overlapping cron sweeps from issuing the same cert at the same time
  // (challenge collisions, double LE rate-limit consumption).
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    const lockKey = parseInt(
      crypto.createHash('sha1').update(`acme:host:${normalized}`).digest('hex').slice(0, 15),
      16,
    );
    const lockRes = await lockClient.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [lockKey],
    );
    acquired = !!lockRes.rows[0]?.ok;
    if (!acquired) {
      return { status: 'backoff', reason: 'another worker holds the per-host advisory lock' };
    }

    await pool.query(
      `UPDATE storefront_hosts
       SET cert_status = 'renewing',
           cert_provision_attempts = cert_provision_attempts + 1,
           cert_last_attempt_at = now(),
           updated_at = now()
       WHERE host = $1`,
      [normalized],
    );

    return await issueAndStore(normalized);
  } finally {
    if (acquired) {
      try {
        await lockClient.query(
          `SELECT pg_advisory_unlock($1)`,
          [
            parseInt(
              crypto.createHash('sha1').update(`acme:host:${normalized}`).digest('hex').slice(0, 15),
              16,
            ),
          ],
        );
      } catch {
        /* ignore unlock errors */
      }
    }
    lockClient.release();
  }
}

async function issueAndStore(normalized: string): Promise<ProvisionResult> {

  try {
    const client = await getOrCreateClient();
    const [key, csr] = await acme.crypto.createCsr({
      commonName: normalized,
      altNames: [normalized],
    });
    const cert = await client.auto({
      csr,
      email: ACME_CONTACT_EMAIL,
      termsOfServiceAgreed: true,
      challengePriority: ['dns-01'],
      challengeCreateFn,
      challengeRemoveFn,
    });

    // Parse expiry + serial from the leaf certificate.
    const x509 = new crypto.X509Certificate(cert);
    const expiresAt = new Date(x509.validTo);
    const serial = x509.serialNumber;
    const renewalAfter = new Date(expiresAt.getTime() - RENEWAL_THRESHOLD_DAYS * 86_400_000);

    const certPem = cert.toString();
    const keyPem = key.toString();
    const encryptedKey = await encryptKey(keyPem);

    // Split leaf and chain. acme-client returns the full PEM bundle (leaf first, then chain).
    const pemBlocks = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    const leafPem = pemBlocks[0] ?? certPem;
    const chainPem = pemBlocks.slice(1).join('\n') || null;

    const updateRes = await pool.query(
      `UPDATE storefront_hosts
       SET cert_status = 'issued',
           cert_pem = $1,
           cert_key_encrypted = $2,
           cert_chain_pem = $3,
           cert_serial = $4,
           cert_issued_at = now(),
           cert_expires_at = $5,
           cert_renewal_after = $6,
           cert_provision_attempts = 0,
           cert_last_error = NULL,
           updated_at = now()
       WHERE host = $7`,
      [leafPem, encryptedKey, chainPem, serial, expiresAt, renewalAfter, normalized],
    );

    // Defensive: if the row vanished between precondition and now (rare —
    // domain detached mid-issuance), surface it loudly rather than silently
    // discarding a successfully issued cert.
    if (updateRes.rowCount !== 1) {
      logger.error(
        { host: normalized, rowCount: updateRes.rowCount },
        '[acme] cert issued but storefront_hosts row missing/changed — cert was not persisted',
      );
      return {
        status: 'failed',
        reason: `cert issued but persist UPDATE affected ${updateRes.rowCount} rows (expected 1)`,
      };
    }

    logger.info(
      { host: normalized, expiresAt: expiresAt.toISOString(), serial },
      '[acme] certificate issued',
    );
    return { status: 'issued', expiresAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE storefront_hosts
       SET cert_status = 'failed', cert_last_error = $1, updated_at = now()
       WHERE host = $2`,
      [msg.slice(0, 1000), normalized],
    );
    logger.error({ err, host: normalized }, '[acme] certificate provisioning failed');
    return { status: 'failed', reason: msg };
  }
}

/**
 * Decrypt a stored private key — used by whatever serves TLS (load-balancer
 * config writer, nginx reload script, or in-process TLS context refresher).
 */
export async function decryptStoredKey(encryptedKeyPem: string): Promise<string> {
  return decryptKey(encryptedKeyPem);
}

// ─── Renewal cron ────────────────────────────────────────────────────────────

let _renewalTimer: NodeJS.Timeout | null = null;

// Stable advisory-lock key for "only one worker runs the sweep at a time".
// 63-bit signed int derived from a sha1 prefix.
const SWEEP_LOCK_KEY = parseInt(
  crypto.createHash('sha1').update('acme:renewal-sweep').digest('hex').slice(0, 15),
  16,
);

async function runRenewalSweep(): Promise<void> {
  if (!ACME_ENABLED) return;

  // ── Cluster-safe: try to acquire the global sweep lock. If another worker
  // holds it, skip this tick. Lock auto-releases on connection close.
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    const lockRes = await lockClient.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [SWEEP_LOCK_KEY],
    );
    acquired = !!lockRes.rows[0]?.ok;
    if (!acquired) {
      logger.debug('[acme/renewal] sweep skipped — another worker holds the lock');
      return;
    }

    const { rows } = await pool.query<{ host: string }>(
      `SELECT host FROM storefront_hosts
       WHERE cert_status IN ('issued', 'failed', 'pending')
         AND (cert_renewal_after IS NULL OR cert_renewal_after <= now())
         AND cert_provision_attempts < $1
       ORDER BY cert_renewal_after NULLS FIRST
       LIMIT 25`,
      [MAX_PROVISION_ATTEMPTS],
    );
    if (rows.length === 0) {
      logger.debug('[acme/renewal] no hosts due');
      return;
    }
    logger.info({ count: rows.length }, '[acme/renewal] sweep started');
    for (const { host } of rows) {
      const result = await provisionCertificate(host);
      logger.info({ host, result }, '[acme/renewal] processed');
      // Small gap between hosts to avoid bursting LE rate limits.
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    if (acquired) {
      try {
        await lockClient.query(`SELECT pg_advisory_unlock($1)`, [SWEEP_LOCK_KEY]);
      } catch {
        /* ignore */
      }
    }
    lockClient.release();
  }
}

export function startAcmeRenewalCron(): void {
  if (_renewalTimer) return;
  if (!ACME_ENABLED) {
    logger.info('[acme/renewal] disabled (ACME_ENABLED!=true) — cron not started');
    return;
  }
  logger.info(
    { intervalMs: RENEWAL_CRON_INTERVAL_MS, directoryUrl: ACME_DIRECTORY_URL },
    '[acme/renewal] cron started',
  );
  // Initial run after 30s grace, then every RENEWAL_CRON_INTERVAL_MS.
  _renewalTimer = setTimeout(function tick() {
    void runRenewalSweep().catch((err) =>
      logger.error({ err }, '[acme/renewal] sweep crashed'),
    );
    _renewalTimer = setTimeout(tick, RENEWAL_CRON_INTERVAL_MS);
    if (_renewalTimer.unref) _renewalTimer.unref();
  }, 30_000);
  if (_renewalTimer.unref) _renewalTimer.unref();
}

export function stopAcmeRenewalCron(): void {
  if (_renewalTimer) {
    clearTimeout(_renewalTimer);
    _renewalTimer = null;
  }
}

// ─── DNS-PERSIST-01 support (IETF draft-ietf-acme-dns-persist-01) ────────────
//
// One persistent TXT record pre-authorizes all future wildcard cert renewals:
//   _validation-persist.max-booster.com. IN TXT
//     "letsencrypt.org; accounturi=<url>; policy=wildcard"
//
// Once deployed in LE production (expected late 2026), renewals for
// *.max-booster.com require no further DNS changes — no TXT rotation,
// no propagation wait, no DNS credentials in the renewal pipeline.
//
// Until LE production supports it, the record is inert but harmless to have.
// Call activateAcmePersistValidation() once after first ACME account creation.

const ACME_ACCOUNT_URL_SETTING = 'acme_account_url';

async function getOrCreateAccountUrl(): Promise<string | null> {
  // Return cached value if present in platform_settings.
  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [ACME_ACCOUNT_URL_SETTING],
  );
  if (rows[0]?.value) return rows[0].value;

  // Initialise the ACME client (which registers/retrieves the account).
  try {
    const client = await getOrCreateClient();
    // acme-client v5+ exposes getAccountUrl() after createAccount().
    const url = (client as any).getAccountUrl?.() as string | undefined;
    if (url) {
      await pool.query(
        `INSERT INTO platform_settings (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [
          ACME_ACCOUNT_URL_SETTING,
          url,
          'ACME account URL — used in DNS-PERSIST-01 _validation-persist TXT record',
        ],
      );
      logger.info({ url }, '[acme] persisted ACME account URL');
      return url;
    }
    logger.warn('[acme] acme-client does not expose getAccountUrl() — upgrade to v5+');
    return null;
  } catch (err) {
    logger.warn({ err }, '[acme] could not retrieve account URL');
    return null;
  }
}

/**
 * Write the DNS-PERSIST-01 _validation-persist TXT record into dns_zone_records.
 *
 * The dns-os authoritative server will pick this up on its next 5-second refresh
 * and serve it to Let's Encrypt's validators.
 *
 * This is a no-op if the record is already correct. Safe to call repeatedly.
 */
export async function activateAcmePersistValidation(
  rootDomain: string,
): Promise<{ recordValue: string; accountUri: string | null; status: 'written' | 'unchanged' | 'no_account_url' }> {
  const accountUri = await getOrCreateAccountUrl();

  if (!accountUri) {
    logger.warn('[acme/persist] No account URI available — record will contain PLACEHOLDER');
  }

  const recordValue = accountUri
    ? `letsencrypt.org; accounturi=${accountUri}; policy=wildcard`
    : 'letsencrypt.org; accounturi=PLACEHOLDER; policy=wildcard';

  // Find the zone
  const zoneInfo = await dnsZoneIdForHost(rootDomain);
  if (!zoneInfo) {
    throw new Error(`No dns_zone found for '${rootDomain}' — run zone seed migration first`);
  }

  // Upsert the TXT record
  const result = await pool.query<{ id: string }>(
    `INSERT INTO dns_zone_records
       (zone_id, user_id, domain, type, name, value, ttl)
     VALUES ($1, $2, $3, 'TXT', '_validation-persist', $4, 3600)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [zoneInfo.zoneId, zoneInfo.userId, zoneInfo.rootDomain, recordValue],
  );

  if (result.rowCount === 0) {
    // Row already exists — update it if value changed
    const upd = await pool.query(
      `UPDATE dns_zone_records
       SET value = $1, updated_at = now()
       WHERE zone_id = $2 AND type = 'TXT' AND name = '_validation-persist'
         AND value != $1`,
      [recordValue, zoneInfo.zoneId],
    );
    await pool.query(`UPDATE dns_zones SET updated_at = now() WHERE id = $1`, [zoneInfo.zoneId]);
    const status = (upd.rowCount ?? 0) > 0 ? 'written' : 'unchanged';
    logger.info({ domain: rootDomain, status }, '[acme/persist] _validation-persist TXT');
    return { recordValue, accountUri, status };
  }

  await pool.query(`UPDATE dns_zones SET updated_at = now() WHERE id = $1`, [zoneInfo.zoneId]);
  logger.info({ domain: rootDomain, recordValue }, '[acme/persist] _validation-persist TXT written');
  return { recordValue, accountUri, status: accountUri ? 'written' : 'no_account_url' };
}

// Exposed for tests / admin scripts.
export const __internal = { runRenewalSweep, getOrCreateClient, encryptKey, decryptKey, getOrCreateAccountUrl };
