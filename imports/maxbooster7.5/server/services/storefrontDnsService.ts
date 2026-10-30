/**
 * storefrontDnsService — Domain lifecycle management
 *
 * Modelled after Vercel and Netlify's proven patterns:
 *
 *  Verification methods (in order of preference):
 *    1. NS check   — did the user delegate nameservers to Max Booster?
 *       (authoritative path — Vercel's "Nameservers" method)
 *    2. CNAME check — does the subdomain/www CNAME point to our platform?
 *       (Vercel's "CNAME Record" method)
 *    3. A check    — does the apex domain A record point to our IP?
 *       (Vercel's "A Record" method)
 *    4. TXT check  — verification token at _maxbooster.<domain>
 *       (Netlify's TXT ownership verification)
 *
 *  All checks use Cloudflare DNS-over-HTTPS (1.1.1.1/dns-query) as the
 *  external resolver — exactly what Vercel uses — instead of the system
 *  resolver (which returns localhost records in dev/Replit environments).
 *
 *  CAA records (like Vercel):
 *    After activation, CAA records are auto-written into the zone so
 *    Let's Encrypt can issue certificates without extra configuration.
 *
 *  Domain health monitor (like Netlify's continuous health checks):
 *    Active domains are re-checked every 12 hours. A domain that fails
 *    health checks 3 times is flagged `health_degraded` but kept active
 *    so the user can fix DNS without losing their storefront routing.
 */

import { pool } from "../db.js";
import { logger } from "../logger.js";
import crypto from "crypto";
import type { QueryResult } from "pg";

/**
 * Typed wrapper around pool.query.
 * InstrumentedPool.query returns Promise<unknown> to avoid coupling the pool
 * implementation to pg types; at runtime it always returns a pg QueryResult.
 * This cast is justified by that runtime contract.
 */
async function poolQuery<T extends Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query(text, values) as Promise<QueryResult<T>>;
}

const BASE_DOMAIN = (
  process.env.BASE_DOMAIN || "max-booster.com"
).toLowerCase();
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || "34.111.179.208";
const NS1 = `ns1.${BASE_DOMAIN}`;
const NS2 = `ns2.${BASE_DOMAIN}`;
const NS_ALT1 = process.env.NS1_HOST || NS1;
const NS_ALT2 = process.env.NS2_HOST || NS2;

/** Cloudflare DoH endpoint — same resolver Vercel uses for external checks. */
const DOH_URL = "https://cloudflare-dns.com/dns-query";
/** Google DoH as fallback */
const DOH_FALLBACK_URL = "https://dns.google/dns-query";

// ─── DoH resolver ─────────────────────────────────────────────────────────────

type DoHType = "A" | "AAAA" | "CNAME" | "NS" | "TXT" | "CAA" | "MX";

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

const DNS_TYPE_MAP: Record<DoHType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  CAA: 257,
};

/**
 * Resolve a DNS query using DNS-over-HTTPS.
 * Falls back from Cloudflare to Google if the first resolver fails.
 * This is the same pattern Vercel uses to check domain propagation.
 */
async function dohResolve(
  name: string,
  type: DoHType,
  timeoutMs = 5000,
): Promise<string[]> {
  const typeNum = DNS_TYPE_MAP[type];

  async function query(baseUrl: string): Promise<string[]> {
    const url = `${baseUrl}?name=${encodeURIComponent(name)}&type=${typeNum}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!resp.ok) return [];
      const data = (await resp.json()) as {
        Answer?: DoHAnswer[];
        Status: number;
      };
      if (data.Status !== 0 || !data.Answer) return [];
      return data.Answer.filter((a) => a.type === typeNum).map((a) =>
        a.data.replace(/^"|"$/g, "").trim(),
      );
    } catch {
      clearTimeout(tid);
      return [];
    }
  }

  const results = await query(DOH_URL);
  if (results.length > 0) return results;
  return query(DOH_FALLBACK_URL);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateVerificationToken(): string {
  return `mb-verify-${crypto.randomBytes(16).toString("hex")}`;
}

function normaliseDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function isApexDomain(domain: string): boolean {
  const parts = domain.split(".");
  return parts.length === 2;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AttachDomainResult {
  storefrontDomainId: string;
  dnsZoneId: string;
  domain: string;
  verificationToken: string;
  nameservers: { ns1: string; ns2: string };
  instructions: DomainSetupInstructions;
}

export interface DomainSetupInstructions {
  /** Recommended: full NS delegation (Vercel nameserver method) */
  method_ns: {
    label: string;
    ns1: string;
    ns2: string;
    note: string;
  };
  /** Alternative: CNAME for www subdomain (Vercel CNAME method) */
  method_cname: {
    label: string;
    host: string;
    pointsTo: string;
    note: string;
  };
  /** Alternative: A record for apex (Vercel A record method) */
  method_a: {
    label: string;
    host: string;
    pointsTo: string;
    note: string;
  };
  /** Verification: TXT record (Netlify ownership verification) */
  method_txt: {
    label: string;
    host: string;
    value: string;
    note: string;
  };
}

export type VerificationStatus = "verified" | "pending" | "failed";

export type VerificationMethod = "ns" | "cname" | "a" | "txt" | null;

// ─── Verification logic (multi-method) ────────────────────────────────────────

/**
 * Check all four verification methods via DoH.
 * Returns the method that succeeded, or null if none did.
 *
 * Order mirrors Vercel's preference: NS → CNAME → A → TXT.
 */
async function checkVerificationMethods(
  domain: string,
  token: string,
  storefrontId: string,
): Promise<VerificationMethod> {
  const apex = isApexDomain(domain);

  // ── Method 1: NS delegation ───────────────────────────────────────────────
  // User pointed their registrar's nameservers to ns1/ns2.maxbooster.replit.app
  try {
    const nsRecords = await dohResolve(domain, "NS");
    const ourNs = [NS_ALT1, NS_ALT2, NS1, NS2].map((n) => n.toLowerCase());
    const hasOurNs = nsRecords.some((ns) =>
      ourNs.includes(ns.toLowerCase().replace(/\.$/, "")),
    );
    if (hasOurNs) {
      logger.info(
        `[storefrontDns] Domain ${domain} verified via NS delegation`,
      );
      return "ns";
    }
  } catch {
    /* continue */
  }

  // ── Method 2: CNAME (www subdomain) ──────────────────────────────────────
  // User set www.domain.com CNAME → {slug}.maxbooster.replit.app
  try {
    const cnameTarget = `${storefrontId}.${BASE_DOMAIN}`;
    const wwwDomain = `www.${domain}`;
    const cnameRecords = await dohResolve(wwwDomain, "CNAME");
    const hasOurCname = cnameRecords.some(
      (c) =>
        c.toLowerCase().replace(/\.$/, "") === cnameTarget.toLowerCase() ||
        c.toLowerCase().replace(/\.$/, "").endsWith(`.${BASE_DOMAIN}`),
    );
    if (hasOurCname) {
      logger.info(`[storefrontDns] Domain ${domain} verified via CNAME (www)`);
      return "cname";
    }
  } catch {
    /* continue */
  }

  // ── Method 3: A record (apex domain points to our IP) ────────────────────
  // User set @ A record → DNS_SERVER_IP
  if (apex) {
    try {
      const aRecords = await dohResolve(domain, "A");
      if (aRecords.includes(DNS_SERVER_IP)) {
        logger.info(`[storefrontDns] Domain ${domain} verified via A record`);
        return "a";
      }
    } catch {
      /* continue */
    }
  }

  // ── Method 4: TXT verification token ────────────────────────────────────
  // User added TXT record: _maxbooster.domain.com = <token>
  // Also check root TXT (some providers put it at @)
  try {
    const txtHost = `_maxbooster.${domain}`;
    const [tokenTxt, rootTxt] = await Promise.all([
      dohResolve(txtHost, "TXT"),
      dohResolve(domain, "TXT"),
    ]);
    const allTxt = [...tokenTxt, ...rootTxt];
    if (allTxt.some((t) => t.includes(token))) {
      logger.info(`[storefrontDns] Domain ${domain} verified via TXT token`);
      return "txt";
    }
  } catch {
    /* continue */
  }

  return null;
}

// ─── Domain health check ──────────────────────────────────────────────────────

/**
 * Verify an active domain is still resolving to our platform.
 * Called by the health monitor every 12 hours (like Netlify's continuous checks).
 * Returns true if healthy.
 */
export async function checkDomainHealth(domain: string): Promise<boolean> {
  const apex = isApexDomain(domain);

  // Check A record for apex
  if (apex) {
    try {
      const aRecords = await dohResolve(domain, "A");
      if (aRecords?.includes(DNS_SERVER_IP)) return true;
    } catch {
      /* continue */
    }
  }

  // Check NS delegation
  try {
    const nsRecords = await dohResolve(domain, "NS");
    const ourNs = [NS1, NS2, NS_ALT1, NS_ALT2].map((n) => n?.toLowerCase());
    if (
      nsRecords?.some((ns) =>
        ourNs?.includes(ns?.toLowerCase().replace(/\.$/, "")),
      )
    )
      return true;
  } catch {
    /* continue */
  }

  // Check CNAME for www
  try {
    const cnameRecords = await dohResolve(`www.${domain}`, "CNAME");
    if (
      cnameRecords?.some((c) =>
        c?.toLowerCase().replace(/\.$/, "").endsWith(`.${BASE_DOMAIN}`),
      )
    )
      return true;
  } catch {
    /* continue */
  }

  return false;
}

// ─── CAA record provisioning ──────────────────────────────────────────────────

/**
 * Auto-provision CAA records in the zone after domain verification.
 * Matches Vercel's behaviour: always adds CAA records so Let's Encrypt
 * can issue certificates for the domain.
 */
async function provisionCaaRecords(
  zoneId: string,
  userId: string,
  domain: string,
): Promise<void> {
  const caaRecords = [
    { value: '0 issue "letsencrypt.org"', note: "Let's Encrypt DV" },
    { value: '0 issue "pki.goog"', note: "Google Trust Services" },
    { value: '0 issuewild "letsencrypt.org"', note: "Let's Encrypt wildcard" },
    {
      value: `0 iodef "mailto:admin@${BASE_DOMAIN}"`,
      note: "CAA violation reports",
    },
  ];

  for (const caa of caaRecords) {
    await pool?.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'CAA','@',$4,3600)
       ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, caa?.value],
    );
  }

  logger.info({ domain, zoneId }, "[storefrontDns] CAA records provisioned");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * attachDomainToStorefront
 *
 * Creates a DNS zone with default records, stores verification token, and
 * returns setup instructions for all four verification methods.
 *
 * Modelled after Vercel's domain-add flow:
 *   - Immediately shows NS/CNAME/A/TXT options (not just NS)
 *   - Uses idempotent upsert so re-claiming a failed domain works cleanly
 */
export async function attachDomainToStorefront(
  storefrontId: string,
  userId: string,
  rawDomain: string,
): Promise<AttachDomainResult> {
  const domain = normaliseDomain(rawDomain);
  const verificationToken = generateVerificationToken();
  const cnameTarget = `${storefrontId}.${BASE_DOMAIN}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Check for existing storefront_domains claim ────────────────────────
    const { rows: existing } = await client.query<{
      id: string;
      status: string;
      storefront_id: string;
    }>(
      `SELECT id, status, storefront_id FROM storefront_domains WHERE domain = $1`,
      [domain],
    );
    if (existing.length > 0) {
      const ex = existing[0];
      if (ex.status === "active") {
        throw new Error(
          `Domain '${domain}' is already active on another storefront.`,
        );
      }
      // Only allow overwriting a pending/failed claim from the same storefront (idempotent re-attach).
      // A pending claim owned by a different storefront (different tenant) must not be silently deleted.
      if (ex.storefront_id !== storefrontId) {
        throw new Error(
          `Domain '${domain}' is already being set up by another account.`,
        );
      }
      await client.query(`DELETE FROM storefront_domains WHERE id = $1`, [
        ex.id,
      ]);
    }

    // ── Guard dns_zones against cross-tenant zone seizure ─────────────────
    // If a dns_zones row already exists for this domain owned by a different user, reject.
    const { rows: existingZones } = await client.query<{ user_id: string }>(
      `SELECT user_id FROM dns_zones WHERE domain = $1`,
      [domain],
    );
    if (existingZones.length > 0 && existingZones[0].user_id !== userId) {
      throw new Error(
        `Domain '${domain}' DNS zone is already owned by another account.`,
      );
    }

    // ── Create dns_zones row ───────────────────────────────────────────────
    const {
      rows: [zone],
    } = await client.query<{ id: string }>(
      `INSERT INTO dns_zones (user_id, domain, status, verification_token, nameserver1, nameserver2)
       VALUES ($1, $2, 'pending', $3, $4, $5)
       ON CONFLICT (domain) DO UPDATE
         SET status = 'pending',
             verification_token = EXCLUDED.verification_token, updated_at = now()
       RETURNING id`,
      [userId, domain, verificationToken, NS_ALT1, NS_ALT2],
    );
    const zoneId = zone.id;

    // ── Default DNS records (written once; user can add more later) ────────
    // NS records (both nameservers)
    for (const ns of [NS_ALT1, NS_ALT2]) {
      await client.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
         VALUES ($1,$2,$3,'NS','@',$4,86400) ON CONFLICT DO NOTHING`,
        [zoneId, userId, domain, ns],
      );
    }

    // Verification TXT at root (@) and at _maxbooster prefix
    for (const name of ["@", `_maxbooster`]) {
      await client.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
         VALUES ($1,$2,$3,'TXT',$4,$5,300) ON CONFLICT DO NOTHING`,
        [zoneId, userId, domain, name, verificationToken],
      );
    }

    // Default A record → platform edge IP (for A-record verification method)
    await client.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'A','@',$4,300) ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, DNS_SERVER_IP],
    );

    // www CNAME → storefrontId.max-booster.com (for CNAME verification)
    await client.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl)
       VALUES ($1,$2,$3,'CNAME','www',$4,300) ON CONFLICT DO NOTHING`,
      [zoneId, userId, domain, cnameTarget],
    );

    // Bump zone serial
    await client.query(
      `UPDATE dns_zones SET updated_at = now() WHERE id = $1`,
      [zoneId],
    );

    // ── storefront_domains row ─────────────────────────────────────────────
    const {
      rows: [sd],
    } = await client.query<{ id: string }>(
      `INSERT INTO storefront_domains
         (storefront_id, domain, type, status, verification_token, dns_zone_id)
       VALUES ($1,$2,'custom_domain','pending',$3,$4)
       RETURNING id`,
      [storefrontId, domain, verificationToken, zoneId],
    );

    await client.query("COMMIT");
    logger.info(
      { storefrontId, domain, zoneId },
      "[storefrontDns] domain attached",
    );

    const instructions: DomainSetupInstructions = {
      method_ns: {
        label:
          "Recommended — Full DNS delegation (fastest, enables wildcard SSL)",
        ns1: NS_ALT1,
        ns2: NS_ALT2,
        note: "Log into your registrar → Find Nameservers → Change to Custom → Enter both NS values. Propagates in 15–48 hours.",
      },
      method_cname: {
        label: "Alternative — CNAME for www subdomain",
        host: `www.${domain}`,
        pointsTo: cnameTarget,
        note: "Add a CNAME record at your DNS provider. Works immediately once DNS propagates (~5 min).",
      },
      method_a: {
        label: "Alternative — A record for apex domain",
        host: "@",
        pointsTo: DNS_SERVER_IP,
        note: "Add an A record at your DNS provider pointing to our IP. Works immediately once DNS propagates.",
      },
      method_txt: {
        label: "Ownership verification — TXT record",
        host: `_maxbooster.${domain}`,
        value: verificationToken,
        note: "Add this TXT record alongside your existing DNS setup to prove domain ownership.",
      },
    };

    return {
      storefrontDomainId: sd.id,
      dnsZoneId: zoneId,
      domain,
      verificationToken,
      nameservers: { ns1: NS_ALT1, ns2: NS_ALT2 },
      instructions,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * verifyStorefrontDomain
 *
 * Checks all four verification methods using Cloudflare DoH.
 * On success: activates domain, provisions CAA records, triggers cert.
 * On repeated failure: marks as verification_failed after 7 days.
 */
export async function verifyStorefrontDomain(
  storefrontDomainId: string,
): Promise<VerificationStatus> {
  const { rows } = await poolQuery<{
    domain: string;
    verification_token: string;
    verification_failures: number;
    status: string;
    dns_zone_id: string | null;
    storefront_id: string;
  }>(
    `SELECT domain, verification_token, verification_failures, status, dns_zone_id, storefront_id
     FROM storefront_domains WHERE id = $1`,
    [storefrontDomainId],
  );

  if (!rows[0]) return "failed";
  const {
    domain,
    verification_token,
    verification_failures,
    status,
    dns_zone_id,
    storefront_id,
  } = rows[0];

  if (status === "active") return "verified";

  const method = await checkVerificationMethods(
    domain,
    verification_token,
    storefront_id,
  );

  if (method) {
    await activateStorefrontDomain(
      storefrontDomainId,
      domain,
      dns_zone_id,
      storefront_id,
      method,
    );
    return "verified";
  }

  // Failure counting — 7-day patience window (10_080 checks at 1/min)
  const newFailures = verification_failures + 1;
  const MAX_FAILURES = 10_080;
  const newStatus =
    newFailures >= MAX_FAILURES ? "verification_failed" : status;

  await pool.query(
    `UPDATE storefront_domains
     SET verification_failures = $1, status = $2, updated_at = now()
     WHERE id = $3`,
    [newFailures, newStatus, storefrontDomainId],
  );

  return newFailures >= MAX_FAILURES ? "failed" : "pending";
}

/**
 * activateStorefrontDomain
 *
 * - Sets domain/zone status → active
 * - Writes storefront_hosts for edge routing
 * - Provisions CAA records (Vercel-style automatic CAA)
 * - Triggers TLS certificate issuance
 */
async function activateStorefrontDomain(
  storefrontDomainId: string,
  domain: string,
  dnsZoneId: string | null,
  storefrontId: string,
  method: VerificationMethod,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE storefront_domains
       SET status = 'active', verified_at = now(), verification_failures = 0,
           updated_at = now()
       WHERE id = $1`,
      [storefrontDomainId],
    );

    if (dnsZoneId) {
      await client.query(
        `UPDATE dns_zones
         SET status = 'active', is_verified = true, updated_at = now()
         WHERE id = $1`,
        [dnsZoneId],
      );
    }

    // Write storefront_hosts so edge routing picks this up immediately
    const hosts: string[] = [domain];
    if (!domain.startsWith("www.") && isApexDomain(domain)) {
      hosts.push(`www.${domain}`);
    }
    for (const host of hosts) {
      await client.query(
        `INSERT INTO storefront_hosts (host, storefront_id, cert_status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (host) DO UPDATE
           SET storefront_id = EXCLUDED.storefront_id, updated_at = now()`,
        [host, storefrontId],
      );
    }

    await client.query(
      `UPDATE storefronts
       SET custom_domain = $1, is_custom_domain_active = true, updated_at = now()
       WHERE id = $2`,
      [domain, storefrontId],
    );

    await client.query("COMMIT");

    logger.info(
      { storefrontDomainId, domain, method },
      "[storefrontDns] domain activated",
    );

    // Post-activation: provision CAA records (async, non-blocking)
    if (dnsZoneId) {
      const userId = (
        await poolQuery<{ user_id: string }>(
          `SELECT user_id FROM dns_zones WHERE id = $1`,
          [dnsZoneId],
        )
      ).rows[0].user_id;
      if (userId) {
        provisionCaaRecords(dnsZoneId, userId, domain).catch((err) => {
          logger.warn(
            { err, domain },
            "[storefrontDns] CAA provisioning failed (non-fatal)",
          );
        });
      }
    }

    // Trigger TLS cert issuance (async, non-blocking)
    for (const host of hosts) {
      provisionCertificateForHost(host).catch((err) => {
        logger.warn(
          { err, host },
          "[storefrontDns] cert provisioning failed (non-fatal)",
        );
      });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * provisionCertificateForHost
 *
 * Triggers Let's Encrypt DNS-01 cert issuance for the host.
 * Gate-kept by ACME_ENABLED env var.
 */
export async function provisionCertificateForHost(host: string): Promise<void> {
  await pool?.query(
    `UPDATE storefront_hosts SET cert_status = 'pending', updated_at = now() WHERE host = $1`,
    [host],
  );
  const { provisionCertificate } = await import("./acmeClient.js");
  const result = await provisionCertificate(host);
  logger.info({ host, result }, "[storefrontDns] cert provisioning result");
}

/**
 * detachDomainFromStorefront
 *
 * Removes domain claim, DNS zone, and host routing entries.
 */
export async function detachDomainFromStorefront(
  storefrontDomainId: string,
): Promise<void> {
  const client = await pool?.connect();
  try {
    await client?.query("BEGIN");
    const { rows } = (await client?.query<{
      domain: string;
      dns_zone_id: string | null;
      storefront_id: string;
    }>(
      `SELECT domain, dns_zone_id, storefront_id FROM storefront_domains WHERE id = $1`,
      [storefrontDomainId],
    )) ?? {};
    if (!rows[0]) {
      await client?.query("ROLLBACK");
      return;
    }
    const { domain, dns_zone_id, storefront_id } = rows[0];

    await client.query(`DELETE FROM storefront_domains WHERE id = $1`, [
      storefrontDomainId,
    ]);
    await client?.query(
      `DELETE FROM storefront_hosts WHERE host = $1 OR host = $2`,
      [domain, `www.${domain}`],
    );
    if (dns_zone_id) {
      await client.query(`DELETE FROM dns_zones WHERE id = $1`, [dns_zone_id]);
    }
    await client?.query(
      `UPDATE storefronts SET custom_domain = NULL, is_custom_domain_active = false, updated_at = now()
       WHERE id = $1 AND custom_domain = $2`,
      [storefront_id, domain],
    );

    await client?.query("COMMIT");
    logger.info(
      { storefrontDomainId, domain },
      "[storefrontDns] domain detached",
    );
  } catch (err) {
    await client?.query("ROLLBACK");
    throw err;
  } finally {
    client?.release();
  }
}

/**
 * lookupStorefrontByHost
 *
 * Used by the host-based router middleware to map an incoming Host header
 * to a storefront ID.
 */
export async function lookupStorefrontByHost(
  host: string,
): Promise<string | null> {
  const { rows } = await poolQuery<{ storefront_id: string }>(
    `SELECT storefront_id FROM storefront_hosts WHERE host = $1`,
    [host?.toLowerCase().replace(/:\d+$/, "")],
  );
  return rows[0]?.storefront_id ?? null;
}

/**
 * getDomainStatus
 *
 * Returns a rich status object for the domain including DNS propagation
 * state, cert status, and health check result.
 */
export async function getDomainStatus(storefrontDomainId: string): Promise<{
  domain: string;
  status: string;
  verificationMethod: string | null;
  certStatus: string | null;
  healthOk: boolean | null;
  nameservers: { ns1: string; ns2: string };
  instructions?: DomainSetupInstructions;
}> {
  const { rows } = await poolQuery<{
    domain: string;
    status: string;
    storefront_id: string;
    verification_token: string;
    dns_zone_id: string | null;
  }>(
    `SELECT domain, status, storefront_id, verification_token, dns_zone_id
     FROM storefront_domains WHERE id = $1`,
    [storefrontDomainId],
  );
  if (!rows[0]) throw new Error("Domain not found");
  const { domain, status, storefront_id, verification_token } =
    rows[0];

  const certRow = (
    await poolQuery<{ cert_status: string }>(
      `SELECT cert_status FROM storefront_hosts WHERE host = $1`,
      [domain],
    )
  ).rows[0];

  let healthOk: boolean | null = null;
  if (status === "active") {
    healthOk = await checkDomainHealth(domain);
  }

  const cnameTarget = `${storefront_id}.${BASE_DOMAIN}`;
  const instructions: DomainSetupInstructions = {
    method_ns: {
      label: "Recommended — Full DNS delegation",
      ns1: NS_ALT1,
      ns2: NS_ALT2,
      note: "Change your registrar nameservers to these two values.",
    },
    method_cname: {
      label: "Alternative — CNAME for www",
      host: `www.${domain}`,
      pointsTo: cnameTarget,
      note: "Add a CNAME record at your DNS provider.",
    },
    method_a: {
      label: "Alternative — A record for apex",
      host: "@",
      pointsTo: DNS_SERVER_IP,
      note: "Add an A record pointing to our IP.",
    },
    method_txt: {
      label: "Verification — TXT record",
      host: `_maxbooster.${domain}`,
      value: verification_token,
      note: "Prove domain ownership without changing your primary DNS setup.",
    },
  };

  return {
    domain,
    status,
    verificationMethod: null,
    certStatus: certRow.cert_status ?? null,
    healthOk,
    nameservers: { ns1: NS_ALT1, ns2: NS_ALT2 },
    ...(status !== "active" ? { instructions } : {}),
  };
}

/**
 * runDomainHealthSweep
 *
 * Called by the health monitor every 12 hours (like Netlify's continuous
 * domain health checks). Re-checks all active domains. Domains that fail
 * 3+ consecutive health checks are flagged 'health_degraded'.
 */
export async function runDomainHealthSweep(): Promise<{
  checked: number;
  degraded: number;
}> {
  const { rows } = await poolQuery<{
    id: string;
    domain: string;
    health_failures: number;
  }>(
    `SELECT sd.id, sd.domain,
            COALESCE((sd.metadata->>'healthFailures')::int, 0) AS health_failures
     FROM storefront_domains sd
     WHERE sd.status = 'active'
     LIMIT 500`,
  );

  let checked = 0;
  let degraded = 0;
  for (const row of rows) {
    checked++;
    const healthy = await checkDomainHealth(row.domain).catch(() => false);
    const failures = healthy ? 0 : row.health_failures + 1;
    const newStatus = failures >= 3 ? "health_degraded" : "active";

    if (failures !== row.health_failures) {
      await pool
        .query(
          `UPDATE storefront_domains
         SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{healthFailures}', $1::text::jsonb),
             status = $2, updated_at = now()
         WHERE id = $3`,
          [String(failures), newStatus, row?.id],
        )
        .catch((err) => {
          logger.warn(
            { err, domain: row.domain },
            "[storefrontDns] health sweep update failed",
          );
        });
    }
    if (newStatus === "health_degraded") {
      degraded++;
      logger.warn(
        `[storefrontDns] Domain ${row?.domain} health degraded (${failures} consecutive failures)`,
      );
    }
  }
  logger.info(
    `[storefrontDns] Health sweep complete — ${checked} checked, ${degraded} degraded`,
  );
  return { checked, degraded };
}
