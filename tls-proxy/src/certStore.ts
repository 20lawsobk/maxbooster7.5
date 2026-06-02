/**
 * tls-proxy — Certificate Store
 *
 * Loads TLS certificates from the Max Booster PostgreSQL database
 * (storefront_hosts table) and builds tls.SecureContext objects.
 *
 * The private key is stored AES-256-GCM encrypted using the same scheme
 * as server/services/acmeClient.ts (iv:tag:ciphertext, all hex-encoded).
 *
 * In-memory cache with 5-minute TTL per hostname.
 * Wildcard cert (*.max-booster.com) is pre-loaded on startup and refreshed
 * every 4 minutes so renewals take effect without a restart.
 */

import tls from "node:tls";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
    ? false
    : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
});

const BASE_DOMAIN = process.env.BASE_DOMAIN || "max-booster.com";
export const WILDCARD_HOST = `*.${BASE_DOMAIN}`;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

// ── SecureContext cache ────────────────────────────────────────────────────────

interface CachedCtx {
  ctx: tls.SecureContext;
  expiresAt: number;
}

const ctxCache = new Map<string, CachedCtx>();

// ── Key decryption (AES-256-GCM — matches acmeClient.ts) ──────────────────────

let _encKey: Buffer | null = null;

async function getEncryptionKey(): Promise<Buffer> {
  if (_encKey) return _encKey;

  // 1. Env override (64 hex chars = 32 bytes)
  const envKey = process.env.ACME_KEY_ENCRYPTION_KEY;
  if (envKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
      throw new Error(
        "[certStore] ACME_KEY_ENCRYPTION_KEY must be 64 hex chars (32 bytes)",
      );
    }
    _encKey = Buffer.from(envKey, "hex");
    return _encKey;
  }

  // 2. Load from platform_settings
  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = 'acme_key_encryption_key'`,
  );
  const hex = rows[0]?.value;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "[certStore] acme_key_encryption_key not found or malformed in platform_settings",
    );
  }
  _encKey = Buffer.from(hex, "hex");
  return _encKey;
}

async function decryptStoredKey(blob: string): Promise<string> {
  const parts = blob.split(":");
  if (parts.length !== 3)
    throw new Error("[certStore] malformed encrypted key payload");
  const [ivHex, tagHex, encHex] = parts;
  const key = await getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let dec = decipher.update(encHex, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

// ── Database cert lookup ───────────────────────────────────────────────────────

interface CertRow {
  cert_pem: string;
  cert_key_encrypted: string;
  cert_chain_pem: string | null;
}

async function loadCertFromDB(host: string): Promise<tls.SecureContext | null> {
  const { rows } = await pool.query<CertRow>(
    `SELECT cert_pem, cert_key_encrypted, cert_chain_pem
     FROM   storefront_hosts
     WHERE  host = ANY($1::text[])
       AND  cert_status = 'issued'
       AND  cert_pem IS NOT NULL
       AND  cert_key_encrypted IS NOT NULL
     ORDER BY (host = $2) DESC
     LIMIT 1`,
    [[host, WILDCARD_HOST], host],
  );
  if (!rows[0]) return null;

  const keyPem = await decryptStoredKey(rows[0].cert_key_encrypted);
  return tls.createSecureContext({
    key: keyPem,
    cert: rows[0].cert_pem,
    ca: rows[0].cert_chain_pem ?? undefined,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadSecureContext(
  servername: string,
): Promise<tls.SecureContext> {
  const host = servername.toLowerCase();

  const cached = ctxCache.get(host);
  if (cached && Date.now() < cached.expiresAt) return cached.ctx;

  const ctx = await loadCertFromDB(host);
  if (ctx) {
    ctxCache.set(host, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
    return ctx;
  }

  // Explicit wildcard fallback
  const wildcardCached = ctxCache.get(WILDCARD_HOST);
  if (wildcardCached && Date.now() < wildcardCached.expiresAt)
    return wildcardCached.ctx;

  const wildcardCtx = await loadCertFromDB(WILDCARD_HOST);
  if (wildcardCtx) {
    ctxCache.set(WILDCARD_HOST, {
      ctx: wildcardCtx,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return wildcardCtx;
  }

  throw new Error(
    `[certStore] No issued TLS cert available for ${host} or ${WILDCARD_HOST}`,
  );
}

export async function prefetchWildcardCert(): Promise<void> {
  console.log(`[certStore] Pre-loading wildcard cert for ${WILDCARD_HOST}`);
  try {
    const ctx = await loadCertFromDB(WILDCARD_HOST);
    if (ctx) {
      ctxCache.set(WILDCARD_HOST, {
        ctx,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      console.log(`[certStore] Wildcard cert loaded`);
    } else {
      console.warn(
        `[certStore] No wildcard cert found — ACME provisioning may not have run yet`,
      );
      console.warn(
        `[certStore] Run: curl -X POST https://max-booster.com/api/dns/provision-wildcard`,
      );
    }
  } catch (err) {
    console.warn(
      `[certStore] Failed to pre-load wildcard cert:`,
      (err as Error).message,
    );
  }
}

export function startCertRefresh(): void {
  setInterval(async () => {
    try {
      const ctx = await loadCertFromDB(WILDCARD_HOST);
      if (ctx) {
        ctxCache.set(WILDCARD_HOST, {
          ctx,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      // Also invalidate recently-expired cache entries so custom domain certs refresh
      const now = Date.now();
      for (const [host, entry] of ctxCache) {
        if (now >= entry.expiresAt) ctxCache.delete(host);
      }
    } catch {
      /* ignore — will retry next interval */
    }
  }, REFRESH_INTERVAL_MS);
}

export function getCacheStats(): { size: number; hosts: string[] } {
  return {
    size: ctxCache.size,
    hosts: Array.from(ctxCache.keys()),
  };
}
