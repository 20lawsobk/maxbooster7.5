import { Router, raw as expressRaw } from "express";
import { db, pool } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../logger.js";
import {
  processQuery,
  getDNSInfo,
  getQueryCount,
  type DohQueryResult,
} from "../services/dnsServer.js";
import {
  dnsRecordCache,
  dnsTemplates,
  dnsProviderCredentials,
  storefronts,
} from "@shared/schema";
import {
  getProvider,
  getSupportedProviders,
  validateDnsRecord,
  SUPPORTED_RECORD_TYPES,
  TTL_PRESETS,
  type DnsRecord,
} from "../services/dnsProviderService";

const router = Router();

const recordSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"]),
  name: z.string().min(1).max(253),
  value: z.string().min(1),
  ttl: z.number().int().min(1).max(604800).default(3600),
  priority: z.number().int().min(0).max(65535).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  weight: z.number().int().min(0).max(65535).optional(),
  protocol: z.string().optional(),
  service: z.string().optional(),
});

const credentialsSchema = z.object({
  provider: z.enum(["godaddy", "cloudflare"]),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  domain: z.string().min(1),
});

async function getStorefrontForUser(storefrontId: string, userId: string) {
  const [sf] = await db
    .select()
    .from(storefronts)
    .where(
      and(eq(storefronts.id, storefrontId), eq(storefronts.userId, userId)),
    )
    .limit(1);
  return sf;
}

async function getCredentials(userId: string, domain: string) {
  const [cred] = await db
    .select()
    .from(dnsProviderCredentials)
    .where(
      and(
        eq(dnsProviderCredentials.userId, userId),
        eq(dnsProviderCredentials.domain, domain),
      ),
    )
    .limit(1);
  return cred;
}

function extractRootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return domain;
}

function domainBelongsToStorefront(
  domain: string,
  storefront: { customDomain: string | null },
): boolean {
  if (!storefront.customDomain) return false;
  const reqRoot = extractRootDomain(domain);
  const sfRoot = extractRootDomain(storefront.customDomain);
  return reqRoot === sfRoot;
}

// ── DNS-over-HTTPS (DoH) — RFC 8484 ──────────────────────────────────────────
// Called by the VPS proxy (ns1/ns2.max-booster.com via AdGuard dnsproxy).
// Accepts DNS wire-format queries, returns DNS wire-format responses.
// No authentication — DNS queries are public by design.

/**
 * RFC 8484 §5.1 — Set Cache-Control on DoH responses.
 *
 * NOERROR with answers → max-age = min TTL of all answer/authority RRs
 * NOERROR with no answers (NODATA) → max-age = SOA minimum (we use 60 s floor)
 * NXDOMAIN (rcode 3) → max-age = SOA minimum TTL
 * SERVFAIL / FORMERR → no-store (don't cache error responses)
 */
function dohCacheControl(result: DohQueryResult): string {
  if (result.rcode === 2 || result.rcode === 1) {
    // SERVFAIL (2) or FORMERR (1) — never cache errors
    return "no-store";
  }
  if (result.minTtl > 0) {
    // NOERROR or NXDOMAIN with a known TTL
    return `max-age=${result.minTtl}`;
  }
  // Fallback: NXDOMAIN or NODATA without a computable TTL — short positive cache
  return "max-age=60";
}

/**
 * GET /api/dns/info
 * Returns the current DNS server status and nameserver configuration.
 */
router.get("/info", (_req, res) => {
  res.json(getDNSInfo());
});

/**
 * GET /api/dns/health
 * Returns health status, region, and metrics for multi-region monitoring.
 */
router.get("/health", (_req, res) => {
  const info = getDNSInfo();
  res.json({
    ok: true,
    region: process.env.REGION_NAME || "default",
    uptime: process.uptime(),
    queryCount: getQueryCount(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

/**
 * POST /api/dns/resolve  — Max Booster Public Recursive Resolver (Build 2)
 * RFC 8484 DNS-over-HTTPS endpoint backed by the full iterative resolver.
 * Resolves ANY domain from root — not just max-booster.com zones.
 * This is what makes the platform a full public DNS resolver (like 8.8.8.8).
 *
 * No authentication required — DNS is a public protocol.
 * Rate-limited at the global rate limiter level.
 */
router.post(
  "/resolve",
  expressRaw({ type: "application/dns-message", limit: "64kb" }),
  async (req, res) => {
    try {
      const body: Buffer = Buffer.isBuffer(req.body)
        ? req.body
        : req.body instanceof Uint8Array
          ? Buffer.from(req.body)
          : Buffer.from(req.body as string, "base64");

      if (body.length < 12) {
        return res.status(400).send("Malformed DNS message");
      }

      // Forward to the authoritative DoH endpoint which now has the recursive resolver
      const result = await processQuery(body, "0.0.0.0");

      const cacheHeader = dohCacheControl(result);
      res
        .set("Content-Type", "application/dns-message")
        .set("Cache-Control", cacheHeader)
        .status(200)
        .send(result.buffer);
    } catch (err) {
      logger.warn({ err: err.message }, "[DNS] /resolve error");
      res.status(500).send("Internal resolver error");
    }
  },
);

/**
 * GET /api/dns/resolver/status — Public resolver cache + stats
 */
router.get("/resolver/status", (_req, res) => {
  import("../services/recursiveResolver.js")
    .then(({ getCacheStats }) => {
      res.json({
        ok: true,
        cache: getCacheStats(),
        version: "1.0.0",
        type: "iterative-from-root",
        roots: 13,
      });
    })
    .catch(() => {
      res.status(503).json({ ok: false, error: "Resolver module not loaded" });
    });
});

/**
 * POST /api/dns/query
 * RFC 8484 DNS-over-HTTPS — POST method.
 * Body: raw DNS wire format (Content-Type: application/dns-message)
 * Response: raw DNS wire format (Content-Type: application/dns-message)
 */
router.post(
  "/query",
  expressRaw({ type: "application/dns-message", limit: "64kb" }),
  async (req, res) => {
    try {
      let body: Buffer;

      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (req.body instanceof Uint8Array) {
        body = Buffer.from(req.body);
      } else if (typeof req.body === "string") {
        // Fallback: some clients send base64-encoded body
        body = Buffer.from(req.body, "base64");
      } else {
        return res.status(400).send("Expected application/dns-message body");
      }

      if (body.length < 12) {
        return res.status(400).send("DNS message too short (< 12 bytes)");
      }

      const srcIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req.ip;
      const result = await processQuery(body, srcIp);
      res.set("Content-Type", "application/dns-message");
      res.set("Cache-Control", dohCacheControl(result));
      res.send(result.buffer);
    } catch (err) {
      logger.warn({ err }, "[DoH] POST /api/dns/query error");
      res.status(500).set("Cache-Control", "no-store").send("DNS query failed");
    }
  },
);

/**
 * GET /api/dns/query?dns=<base64url>
 * RFC 8484 DNS-over-HTTPS — GET method (base64url, no padding).
 */
router.get("/query", async (req, res) => {
  try {
    const dnsParam = req.query.dns as string;
    if (!dnsParam) return res.status(400).send("Missing ?dns= parameter");

    // RFC 8484 §4.1 — base64url (RFC 4648 §5), padding is optional
    const padded = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
    const body = Buffer.from(padded, "base64");
    if (body.length < 12)
      return res.status(400).send("DNS message too short (< 12 bytes)");

    const result = await processQuery(body);
    res.set("Content-Type", "application/dns-message");
    res.set("Cache-Control", dohCacheControl(result));
    res.send(result.buffer);
  } catch (err) {
    logger.warn({ err }, "[DoH] GET /api/dns/query error");
    res.status(500).set("Cache-Control", "no-store").send("DNS query failed");
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/providers", (req, res) => {
  if (!req.isAuthenticated())
    return res.status(401).json({ error: "Unauthorized" });
  res.json({
    providers: getSupportedProviders(),
    recordTypes: SUPPORTED_RECORD_TYPES,
    ttlPresets: TTL_PRESETS,
  });
});

router.post("/:storefrontId/credentials", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });

    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });

    const { provider: providerName, apiKey, apiSecret, domain } = parsed.data;
    const provider = getProvider(providerName);

    const valid = await provider.verifyCredentials(domain, {
      apiKey,
      apiSecret,
    });
    if (!valid)
      return res
        .status(400)
        .json({
          error: "Invalid credentials. Check your API key/secret and domain.",
        });

    const existing = await getCredentials(userId, domain);
    if (existing) {
      await db
        .update(dnsProviderCredentials)
        .set({
          provider: providerName,
          credentials: { apiKey, apiSecret },
          isVerified: true,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dnsProviderCredentials.id, existing.id));
    } else {
      await db.insert(dnsProviderCredentials).values({
        userId,
        provider: providerName,
        domain,
        credentials: { apiKey, apiSecret },
        isVerified: true,
        lastUsedAt: new Date(),
      });
    }

    res.json({ success: true, provider: providerName, domain, verified: true });
  } catch (error: unknown) {
    logger.warn("Error saving DNS credentials", { error });
    res.status(500).json({ error: "Failed to save credentials" });
  }
});

router.get("/:storefrontId/credentials", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });

    const creds = await db
      .select({
        id: dnsProviderCredentials.id,
        provider: dnsProviderCredentials.provider,
        domain: dnsProviderCredentials.domain,
        isVerified: dnsProviderCredentials.isVerified,
        lastUsedAt: dnsProviderCredentials.lastUsedAt,
        createdAt: dnsProviderCredentials.createdAt,
      })
      .from(dnsProviderCredentials)
      .where(eq(dnsProviderCredentials.userId, userId));

    res.json({ credentials: creds });
  } catch (error: unknown) {
    logger.warn("Error fetching DNS credentials", { error });
    res.status(500).json({ error: "Failed to fetch credentials" });
  }
});

router.delete("/:storefrontId/credentials/:credentialId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId, credentialId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });

    const [cred] = await db
      .select()
      .from(dnsProviderCredentials)
      .where(
        and(
          eq(dnsProviderCredentials.id, credentialId),
          eq(dnsProviderCredentials.userId, userId),
        ),
      )
      .limit(1);
    if (!cred) return res.status(404).json({ error: "Credential not found" });

    await db
      .delete(dnsProviderCredentials)
      .where(eq(dnsProviderCredentials.id, credentialId));
    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn("Error deleting DNS credential", { error });
    res.status(500).json({ error: "Failed to delete credential" });
  }
});

router.get("/:storefrontId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const domain = req.query.domain as string;
    const refresh = req.query.refresh === "true";

    if (!domain)
      return res.status(400).json({ error: "Domain query parameter required" });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });
    if (!domainBelongsToStorefront(domain, storefront))
      return res
        .status(403)
        .json({ error: "Domain does not belong to this storefront" });

    if (refresh) {
      const cred = await getCredentials(userId, domain);
      if (!cred)
        return res
          .status(400)
          .json({
            error:
              "No credentials saved for this domain. Connect your DNS provider first.",
          });

      const provider = getProvider(cred.provider);
      const credentials = cred.credentials as {
        apiKey: string;
        apiSecret: string;
      };
      const liveRecords = await provider.listRecords(domain, credentials);

      await db
        .delete(dnsRecordCache)
        .where(
          and(
            eq(dnsRecordCache.storefrontId, storefrontId),
            eq(dnsRecordCache.domain, domain),
          ),
        );

      if (liveRecords.length > 0) {
        await db.insert(dnsRecordCache).values(
          liveRecords.map((r) => ({
            storefrontId,
            domain,
            provider: cred.provider,
            recordType: r.type,
            name: r.name,
            value: r.value,
            ttl: r.ttl,
            priority: r.priority ?? null,
            isLocal: false,
            lastSyncedAt: new Date(),
          })),
        );
      }

      await db
        .update(dnsProviderCredentials)
        .set({ lastUsedAt: new Date() })
        .where(eq(dnsProviderCredentials.id, cred.id));

      res.json({
        records: liveRecords,
        source: "live",
        syncedAt: new Date().toISOString(),
      });
    } else {
      const cached = await db
        .select()
        .from(dnsRecordCache)
        .where(
          and(
            eq(dnsRecordCache.storefrontId, storefrontId),
            eq(dnsRecordCache.domain, domain),
          ),
        )
        .limit(50);

      const records: DnsRecord[] = cached.map((r) => ({
        type: r.recordType,
        name: r.name,
        value: r.value,
        ttl: r.ttl ?? 3600,
        priority: r.priority ?? undefined,
      }));

      const lastSync = cached.length > 0 ? cached[0].lastSyncedAt : null;
      res.json({
        records,
        source: "cache",
        syncedAt: lastSync?.toISOString() ?? null,
      });
    }
  } catch (error: unknown) {
    logger.warn("Error fetching DNS records", { error });
    res.status(500).json({ error: "Failed to fetch DNS records" });
  }
});

router.post("/:storefrontId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain } = req.body;

    if (!domain) return res.status(400).json({ error: "Domain is required" });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });
    if (!domainBelongsToStorefront(domain, storefront))
      return res
        .status(403)
        .json({ error: "Domain does not belong to this storefront" });

    const parsed = recordSchema.safeParse(req.body.record);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid record", details: parsed.error.issues });

    const record = parsed.data as DnsRecord;
    const validationError = validateDnsRecord(record);
    if (validationError)
      return res.status(400).json({ error: validationError });

    const cred = await getCredentials(userId, domain);
    if (!cred)
      return res
        .status(400)
        .json({ error: "No credentials saved for this domain" });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as {
      apiKey: string;
      apiSecret: string;
    };
    await provider.addRecord(domain, record, credentials);

    await db.insert(dnsRecordCache).values({
      storefrontId,
      domain,
      provider: cred.provider,
      recordType: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority ?? null,
      isLocal: false,
      lastSyncedAt: new Date(),
    });

    res.json({ success: true, record });
  } catch (error: unknown) {
    logger.warn("Error adding DNS record", { error });
    res.status(500).json({ error: "Failed to add DNS record" });
  }
});

router.put("/:storefrontId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, record: recordData, originalName, originalType } = req.body;

    if (!domain || !originalName || !originalType) {
      return res
        .status(400)
        .json({ error: "Domain, originalName, and originalType are required" });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });
    if (!domainBelongsToStorefront(domain, storefront))
      return res
        .status(403)
        .json({ error: "Domain does not belong to this storefront" });

    const parsed = recordSchema.safeParse(recordData);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid record", details: parsed.error.issues });

    const record = parsed.data as DnsRecord;
    const validationError = validateDnsRecord(record);
    if (validationError)
      return res.status(400).json({ error: validationError });

    const cred = await getCredentials(userId, domain);
    if (!cred)
      return res
        .status(400)
        .json({ error: "No credentials saved for this domain" });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as {
      apiKey: string;
      apiSecret: string;
    };
    await provider.updateRecord(
      domain,
      record,
      originalName,
      originalType,
      credentials,
    );

    await db
      .delete(dnsRecordCache)
      .where(
        and(
          eq(dnsRecordCache.storefrontId, storefrontId),
          eq(dnsRecordCache.domain, domain),
          eq(dnsRecordCache.name, originalName),
          eq(dnsRecordCache.recordType, originalType),
        ),
      );
    await db.insert(dnsRecordCache).values({
      storefrontId,
      domain,
      provider: cred.provider,
      recordType: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority ?? null,
      isLocal: false,
      lastSyncedAt: new Date(),
    });

    res.json({ success: true, record });
  } catch (error: unknown) {
    logger.warn("Error updating DNS record", { error });
    res.status(500).json({ error: "Failed to update DNS record" });
  }
});

router.delete("/:storefrontId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, recordType, recordName } = req.body;

    if (!domain || !recordType || !recordName) {
      return res
        .status(400)
        .json({ error: "Domain, recordType, and recordName are required" });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });
    if (!domainBelongsToStorefront(domain, storefront))
      return res
        .status(403)
        .json({ error: "Domain does not belong to this storefront" });

    const cred = await getCredentials(userId, domain);
    if (!cred)
      return res
        .status(400)
        .json({ error: "No credentials saved for this domain" });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as {
      apiKey: string;
      apiSecret: string;
    };
    await provider.deleteRecord(domain, recordType, recordName, credentials);

    await db
      .delete(dnsRecordCache)
      .where(
        and(
          eq(dnsRecordCache.storefrontId, storefrontId),
          eq(dnsRecordCache.domain, domain),
          eq(dnsRecordCache.name, recordName),
          eq(dnsRecordCache.recordType, recordType),
        ),
      );

    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn("Error deleting DNS record", { error });
    res.status(500).json({ error: "Failed to delete DNS record" });
  }
});

router.post("/:storefrontId/records/batch", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, records: recordsData } = req.body;

    if (!domain || !Array.isArray(recordsData) || recordsData.length === 0) {
      return res
        .status(400)
        .json({ error: "Domain and records array required" });
    }
    if (recordsData.length > 50) {
      return res.status(400).json({ error: "Maximum 50 records per batch" });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });
    if (!domainBelongsToStorefront(domain, storefront))
      return res
        .status(403)
        .json({ error: "Domain does not belong to this storefront" });

    const records: DnsRecord[] = [];
    for (const rd of recordsData) {
      const parsed = recordSchema.safeParse(rd);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            error: "Invalid record in batch",
            details: parsed.error.issues,
          });
      const record = parsed.data as DnsRecord;
      const err = validateDnsRecord(record);
      if (err)
        return res
          .status(400)
          .json({ error: `Validation error in batch: ${err}` });
      records.push(record);
    }

    const cred = await getCredentials(userId, domain);
    if (!cred)
      return res
        .status(400)
        .json({ error: "No credentials saved for this domain" });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as {
      apiKey: string;
      apiSecret: string;
    };
    await provider.batchUpsertRecords(domain, records, credentials);

    await db
      .delete(dnsRecordCache)
      .where(
        and(
          eq(dnsRecordCache.storefrontId, storefrontId),
          eq(dnsRecordCache.domain, domain),
        ),
      );
    await db.insert(dnsRecordCache).values(
      records.map((r) => ({
        storefrontId,
        domain,
        provider: cred.provider,
        recordType: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        isLocal: false,
        lastSyncedAt: new Date(),
      })),
    );

    res.json({ success: true, count: records.length });
  } catch (error: unknown) {
    logger.warn("Error in batch DNS operation", { error });
    res.status(500).json({ error: "Batch operation failed" });
  }
});

router.get("/:storefrontId/templates", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const templates = await db
      .select()
      .from(dnsTemplates)
      .where(eq(dnsTemplates.userId, userId))
      .limit(50);

    res.json({ templates });
  } catch (error: unknown) {
    logger.warn("Error fetching DNS templates", { error });
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/:storefrontId/templates", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { name, description, records } = req.body;

    if (!name || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "Name and records array required" });
    }

    const [template] = await db
      .insert(dnsTemplates)
      .values({
        userId,
        name,
        description: description || null,
        records,
      })
      .returning();

    res.json({ success: true, template });
  } catch (error: unknown) {
    logger.warn("Error creating DNS template", { error });
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.delete("/:storefrontId/templates/:templateId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { templateId } = req.params;

    const [tmpl] = await db
      .select()
      .from(dnsTemplates)
      .where(
        and(eq(dnsTemplates.id, templateId), eq(dnsTemplates.userId, userId)),
      )
      .limit(1);
    if (!tmpl) return res.status(404).json({ error: "Template not found" });

    await db.delete(dnsTemplates).where(eq(dnsTemplates.id, templateId));
    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn("Error deleting DNS template", { error });
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.post("/:storefrontId/templates/:templateId/apply", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;
    const { storefrontId, templateId } = req.params;
    const { domain } = req.body;

    if (!domain) return res.status(400).json({ error: "Domain is required" });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront)
      return res.status(404).json({ error: "Storefront not found" });

    const [tmpl] = await db
      .select()
      .from(dnsTemplates)
      .where(
        and(eq(dnsTemplates.id, templateId), eq(dnsTemplates.userId, userId)),
      )
      .limit(1);
    if (!tmpl) return res.status(404).json({ error: "Template not found" });

    const templateRecords = tmpl.records as DnsRecord[];
    const cred = await getCredentials(userId, domain);
    if (!cred)
      return res
        .status(400)
        .json({ error: "No credentials saved for this domain" });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as {
      apiKey: string;
      apiSecret: string;
    };
    await provider.batchUpsertRecords(domain, templateRecords, credentials);

    await db
      .delete(dnsRecordCache)
      .where(
        and(
          eq(dnsRecordCache.storefrontId, storefrontId),
          eq(dnsRecordCache.domain, domain),
        ),
      );
    await db.insert(dnsRecordCache).values(
      templateRecords.map((r) => ({
        storefrontId,
        domain,
        provider: cred.provider,
        recordType: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        isLocal: false,
        lastSyncedAt: new Date(),
      })),
    );

    res.json({ success: true, recordsApplied: templateRecords.length });
  } catch (error: unknown) {
    logger.warn("Error applying DNS template", { error });
    res.status(500).json({ error: "Failed to apply template" });
  }
});

// ── Internal zone sync endpoint (for dns-node ZONE_SYNC_URL) ─────────────────

const DNS_SYNC_SECRET = process.env.DNS_SYNC_SECRET || "";

/**
 * GET /api/dns/zone/:domain
 *
 * Returns the full zone as JSON in the format dns-node/zone.ts expects
 * (ZoneData: { domain, serial, records[] }).
 * Used as ZONE_SYNC_URL on the GCP dns-node instances so they hot-reload
 * zone data from PostgreSQL without a restart.
 *
 * Protected by X-DNS-Sync-Secret header when DNS_SYNC_SECRET is set.
 * No auth required otherwise — zone data is public DNS information.
 */
router.get("/zone/:domain", async (req, res) => {
  if (DNS_SYNC_SECRET) {
    const provided = req.headers["x-dns-sync-secret"];
    if (provided !== DNS_SYNC_SECRET) {
      return res
        .status(401)
        .json({ error: "Invalid or missing X-DNS-Sync-Secret" });
    }
  }

  const { domain } = req.params;
  if (!domain || !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(domain)) {
    return res.status(400).json({ error: "Invalid domain name" });
  }

  try {
    const zoneRes = await pool.query<{ id: string; serial: string }>(
      `SELECT id,
              EXTRACT(EPOCH FROM COALESCE(updated_at, created_at))::bigint AS serial
       FROM   dns_zones
       WHERE  domain = $1 AND status = 'active'`,
      [domain],
    );
    if (!zoneRes.rows[0]) {
      return res
        .status(404)
        .json({ error: `Zone '${domain}' not found or inactive` });
    }

    const { id: zoneId, serial } = zoneRes.rows[0];

    const recRes = await pool.query<{
      type: string;
      name: string;
      value: string;
      ttl: number;
      priority: number | null;
    }>(
      `SELECT type, name, value, COALESCE(ttl, 3600) AS ttl, priority
       FROM   dns_zone_records
       WHERE  zone_id = $1
       ORDER  BY type, name`,
      [zoneId],
    );

    const records = recRes.rows.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl,
      ...(r.priority !== null ? { priority: r.priority } : {}),
    }));

    res.set("Cache-Control", "no-store");
    res.json({ domain, serial: parseInt(serial, 10), records });
  } catch (err) {
    logger.error({ err }, "[dns/zone-sync] Error fetching zone");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: provision wildcard cert ────────────────────────────────────────────

/**
 * POST /api/dns/provision-wildcard
 *
 * Triggers ACME DNS-01 certificate issuance for *.max-booster.com.
 * Requires the zone to be authoritative (NS records pointing to this app's
 * DNS server) before calling — otherwise DNS-01 validation will fail.
 *
 * Admin-only.
 */
router.post("/provision-wildcard", async (req, res) => {
  if (!req.isAuthenticated() || !(req.user as any)?.isAdmin) {
    return res.status(403).json({ error: "Admin required" });
  }
  try {
    const { provisionCertificate } = await import("../services/acmeClient.js");
    const [wildcardResult, rootResult] = await Promise.all([
      provisionCertificate("*.max-booster.com"),
      provisionCertificate("max-booster.com"),
    ]);
    res.json({ ok: true, wildcard: wildcardResult, root: rootResult });
  } catch (err) {
    logger.error({ err }, "[dns] provision-wildcard error");
    res.status(500).json({ error: "Cert provisioning failed" });
  }
});

// ── Admin: activate DNS-PERSIST-01 validation ─────────────────────────────────

/**
 * POST /api/dns/activate-persist-validation
 *
 * Writes the _validation-persist TXT record that pre-authorizes wildcard cert
 * renewals under the DNS-PERSIST-01 ACME challenge type (IETF draft
 * draft-ietf-acme-dns-persist-01, Let's Encrypt production rollout: late 2026).
 *
 * Once set, the wildcard cert can renew without any further DNS updates.
 * Call once after first successful ACME account registration.
 *
 * Admin-only.
 */
router.post("/activate-persist-validation", async (req, res) => {
  if (!req.isAuthenticated() || !(req.user as any)?.isAdmin) {
    return res.status(403).json({ error: "Admin required" });
  }
  try {
    const { activateAcmePersistValidation } = await import(
      "../services/acmeClient.js"
    );
    const result = await activateAcmePersistValidation("max-booster.com");
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[dns] activate-persist-validation error");
    res
      .status(500)
      .json({ error: "Failed to activate DNS-PERSIST-01 validation" });
  }
});

export default router;
