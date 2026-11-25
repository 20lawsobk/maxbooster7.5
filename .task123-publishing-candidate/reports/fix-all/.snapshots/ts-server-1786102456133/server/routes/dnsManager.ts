import { Router } from "express";
import { pool } from "../db.js";
import { z } from "zod";
import { logger } from "../logger.js";

const router = Router();

const BASE_DOMAIN = process.env.BASE_DOMAIN || "max-booster.com";
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || "34.68.76.67";
const NS1 = process.env.NS1 || `ns1.${BASE_DOMAIN}`;
const NS2 = process.env.NS2 || `ns2.${BASE_DOMAIN}`;

const DOMAIN_LIMIT = 2;

/**
 * Returns the total number of custom domains a user has across both paths:
 *  - DNS zones (Bring Your Own Domain / NS delegation)
 *  - Platform subdomain claims (Find Domain / Claim Free)
 */
async function getUserDomainUsage(
  userId: string,
): Promise<{ zones: number; claimed: number; total: number }> {
  // Count DISTINCT domain names across both sources so the same domain
  // (e?.g. max-booster?.com appearing in both dns_zones and storefront_domains)
  // is only counted once.
  const uniqueResult = await pool?.query(
    `SELECT COUNT(DISTINCT domain)::int AS n FROM (
       SELECT domain FROM dns_zones WHERE user_id = $1
       UNION
       SELECT sd.domain
       FROM storefront_domains sd
       JOIN storefronts s ON s.id = sd.storefront_id
       WHERE s.user_id = $1 AND sd.type = 'platform_subdomain'
     ) combined`,
    [userId],
  );
  const total = (uniqueResult as any)?.rows[0]?.n ?? 0;
  // zones/claimed kept for informational breakdown (not used for quota)
  const [zonesResult] = await Promise?.all([
    pool.query("SELECT COUNT(*)::int AS n FROM dns_zones WHERE user_id = $1", [
      userId,
    ]),
  ]);
  const zones = (zonesResult as any)?.rows[0]?.n ?? 0;
  return { zones, claimed: 0, total };
}

/** Returns true if the user has an active subscription (or is an admin). */
async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const result = await pool?.query(
    `SELECT subscription_status, role FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const user = (result as any)?.rows[0];
  if (!user) return false;
  if (user?.role === "admin") return true;
  return ["active", "trialing"].includes(user?.subscription_status ?? "");
}

const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
] as const;

const recordSchema = z.object({
  type: z.enum(RECORD_TYPES),
  name: z.string().min(1).max(253),
  value: z.string().min(1),
  ttl: z.number().int().min(60).max(604800).default(3600),
  priority: z.number().int().min(0).max(65535).optional(),
  weight: z.number().int().min(0).max(65535).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  tag: z.string().optional(),
});

function validateRecord(r: z.infer<typeof recordSchema>): string | null {
  switch (r?.type) {
    case "A": {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4?.test(r?.value)) return "A record must be a valid IPv4 address";
      if (
        r?.value
          .split(".")
          .map(Number)
          .some((p) => p > 255)
      )
        return "Invalid IPv4 address";
      break;
    }
    case "AAAA": {
      const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::$/;
      if (!ipv6?.test(r?.value))
        return "AAAA record must be a valid IPv6 address";
      break;
    }
    case "CNAME": {
      const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.?$/;
      if (!hostname?.test(r?.value)) return "CNAME must be a valid hostname";
      break;
    }
    case "MX":
      if (r?.priority === undefined) return "MX records require a priority";
      break;
    case "TXT":
      if (r?.value.length > 4096) return "TXT record too long (max 4096 chars)";
      break;
    case "SRV":
      if (r?.priority === undefined) return "SRV records require priority";
      if (r?.weight === undefined) return "SRV records require weight";
      if (r?.port === undefined) return "SRV records require port";
      break;
    case "CAA":
      if (!r?.tag)
        return "CAA records require a tag (issue, issuewild, or iodef)";
      break;
  }
  return null;
}

function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "") // strip http:// or https://
    .replace(/\/.*$/, "") // strip trailing slash and any path
    .replace(/\.$/, ""); // strip trailing FQDN dot
}

function mapZone(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    status: row.status,
    isVerified: row.is_verified,
    verificationToken: row.verification_token,
    nameserver1: row.nameserver1,
    nameserver2: row.nameserver2,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: Record<string, unknown>) {
  return {
    id: row.id,
    zoneId: row.zone_id,
    userId: row.user_id,
    domain: row.domain,
    type: row.type,
    name: row.name,
    value: row.value,
    ttl: row.ttl,
    priority: row.priority,
    weight: row.weight,
    port: row.port,
    tag: row.tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/dns-manager/usage
 * Returns domain usage and limit for the logged-in user.
 */
router.get("/usage", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = (req.user as unknown as Record<string, unknown>).id;
    const [usage, hasSubscription] = await Promise?.all([
      getUserDomainUsage((userId as string)),
      userHasActiveSubscription((userId as string)),
    ]);
    res.json({
      limit: DOMAIN_LIMIT,
      used: usage.total,
      zones: usage.zones,
      claimed: usage.claimed,
      remaining: Math.max(0, DOMAIN_LIMIT - usage?.total),
      hasSubscription,
    });
  } catch (err) {
    logger.warn("[DNS Manager] Usage error: " + ((err as any)?.message ?? String(err)));
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

router.get("/info", (_req, res) => {
  res.json({
    nameservers: [NS1, NS2],
    serverIp: DNS_SERVER_IP,
    baseDomain: BASE_DOMAIN,
    recordTypes: RECORD_TYPES,
    instructions: [
      `Step 1: Add your domain and copy the verification TXT record`,
      `Step 2: Log into your registrar (wherever you bought your domain)`,
      `Step 3: Change your domain's nameservers to:`,
      `   Primary:   ${NS1}`,
      `   Secondary: ${NS2}`,
      `Step 4: Wait for propagation (usually 1-48 hours)`,
      `Step 5: Your domain will show "Active" when resolved through Max Booster`,
    ],
  });
});

router.get("/zones", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const result = await pool.query(
      "SELECT * FROM dns_zones WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );

    res.json({ zones: (result as any).rows.map(mapZone) });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error listing zones: " + ((err as Error).message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to list zones" });
  }
});

router.post("/zones", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = (req.user as unknown as Record<string, unknown>).id;

    const schema = z.object({
      domain: z.string().min(3),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });

    const domain = normalizeDomain(parsed.data.domain);

    // Subscription required
    const hasSubscription = await userHasActiveSubscription((userId as string));
    if (!hasSubscription) {
      return res.status(403).json({
        error:
          "An active Max Booster subscription is required to add custom domains.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    // Enforce 2-domain limit (across DNS zones + platform domain claims)
    const usage = await getUserDomainUsage((userId as string));
    if (usage.total >= DOMAIN_LIMIT) {
      return res.status(403).json({
        error: `Domain limit reached. Your subscription includes up to ${DOMAIN_LIMIT} custom domains. Remove an existing domain to add a new one.`,
        code: "DOMAIN_LIMIT_REACHED",
        limit: DOMAIN_LIMIT,
        used: usage.total,
      });
    }

    const existing = await pool.query(
      "SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1",
      [domain],
    );
    if ((existing as any).rows.length > 0)
      return res
        .status(409)
        .json({ error: "Domain already registered in the system" });

    const insertZone = await pool.query(
      `INSERT INTO dns_zones (user_id, domain, status, notes)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [userId, domain, parsed.data.notes ?? null],
    );
    const zone = mapZone((insertZone as any).rows[0]);

    await pool.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl) VALUES
       ($1, $2, $3, 'NS',  '@', $4, 3600),
       ($1, $2, $3, 'SOA', '@', $5, 3600)`,
      [
        zone.id,
        userId,
        domain,
        NS1,
        `${NS1} hostmaster.${BASE_DOMAIN} 1 3600 900 604800 300`,
      ],
    );

    res.json({ success: true, zone });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error creating zone: " + ((err as Error).message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to create zone" });
  }
});

router.post("/zones/:zoneId/verify", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any).rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any).rows[0]);

    // Max Booster-registered domains are pre-verified — subscription payment is the
    // authorization. No TXT record or NS delegation check required.
    const maxBoosterOwned = await pool.query(
      `SELECT id FROM claimed_domains WHERE domain = $1 AND registrar_name = 'maxbooster' LIMIT 1`,
      [zone.domain],
    );
    if ((maxBoosterOwned as any).rows.length > 0) {
      await pool.query(
        "UPDATE dns_zones SET is_verified = true, status = $1, updated_at = NOW() WHERE id = $2",
        ["active", zone.id],
      );
      return res.json({
        verified: true,
        status: "active",
        method: "maxbooster_registered",
      });
    }

    // Use DoH (Cloudflare + Google) — system resolver fails in Replit/cloud environments
    let nsResolved = false;
    let txtResolved = false;

    const DOH_ENDPOINTS = [
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent((zone.domain as string | number | boolean))}&type=NS`,
      `https://dns.google/resolve?name=${encodeURIComponent((zone.domain as string | number | boolean))}&type=NS`,
    ];
    const TXT_ENDPOINTS = [
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent((zone.domain as string | number | boolean))}&type=TXT`,
      `https://dns.google/resolve?name=${encodeURIComponent((zone.domain as string | number | boolean))}&type=TXT`,
    ];

    const token = zone.verificationToken ?? "";

    // Check NS delegation
    for (const url of DOH_ENDPOINTS) {
      try {
        const r = await fetch(url, {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(5000),
        });
        const d: Record<string, unknown> = (await r.json()) as Record<
          string,
          unknown
        >;
        const answers: unknown[] = d.Answer ?? [];
        if (
          answers.some(
            (a: Record<string, unknown>) =>
              typeof a.data === "string" &&
              (a.data.includes(NS1) || a.data.includes(BASE_DOMAIN)),
          )
        ) {
          nsResolved = true;
          break;
        }
      } catch {
        /* try next */
      }
    }

    // Check TXT verification token
    if (!nsResolved && token) {
      for (const url of TXT_ENDPOINTS) {
        try {
          const r = await fetch(url, {
            headers: { Accept: "application/dns-json" },
            signal: AbortSignal.timeout(5000),
          });
          const d: Record<string, unknown> = (await r.json()) as Record<
            string,
            unknown
          >;
          const answers: unknown[] = d.Answer ?? [];
          if (
            answers.some(
              (a: Record<string, unknown>) =>
                typeof a.data === "string" && a.data.includes((token as string)),
            )
          ) {
            txtResolved = true;
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    const resolved = nsResolved || txtResolved;
    const method = nsResolved ? "ns" : txtResolved ? "txt" : null;

    if (resolved) {
      await pool.query(
        "UPDATE dns_zones SET is_verified = true, status = $1, updated_at = NOW() WHERE id = $2",
        ["active", zone.id],
      );
      return res.json({ verified: true, status: "active", method });
    }

    res.json({
      verified: false,
      message: `NS delegation not detected. Make sure your registrar's nameserver is set to ${NS1}, or add TXT record: maxbooster-verify=${token}`,
    });
  } catch (err) {
    logger.warn("[DNS Manager] Verify error: " + ((err as any)?.message ?? String(err)));
    res.status(500).json({ error: "Verification check failed" });
  }
});

router.delete("/zones/:zoneId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT id FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zoneId = (zoneResult as any)?.rows[0].id;

    await pool.query("DELETE FROM dns_zone_records WHERE zone_id = $1", [
      zoneId,
    ]);
    await pool.query("DELETE FROM dns_zones WHERE id = $1", [zoneId]);

    res.json({ success: true });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error deleting zone: " + ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to delete zone" });
  }
});

router.get("/zones/:zoneId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any)?.rows[0]);

    const records = await pool?.query(
      "SELECT * FROM dns_zone_records WHERE zone_id = $1 ORDER BY type, name LIMIT 500",
      [zone?.id],
    );

    res.json({ records: (records as any).rows.map(mapRecord), zone });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error fetching records: " + ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

router.post("/zones/:zoneId/records", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any)?.rows[0]);

    const parsed = recordSchema?.safeParse(req.body);
    if (!parsed?.success)
      return res
        .status(400)
        .json({ error: "Invalid record", details: parsed.error.issues });

    const validErr = validateRecord(parsed?.data);
    if (validErr) return res.status(400).json({ error: validErr });

    const result = await pool?.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl, priority, weight, port, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        zone?.id,
        userId,
        zone?.domain,
        parsed?.data.type,
        parsed?.data.name,
        parsed?.data.value,
        parsed?.data.ttl,
        parsed?.data.priority ?? null,
        parsed?.data.weight ?? null,
        parsed?.data.port ?? null,
        parsed?.data.tag ?? null,
      ],
    );

    res.json({ success: true, record: mapRecord((result as any)?.rows[0]) });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error adding record: " + ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to add record" });
  }
});

router.put("/zones/:zoneId/records/:recordId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });

    const parsed = recordSchema?.safeParse(req.body);
    if (!parsed?.success)
      return res
        .status(400)
        .json({ error: "Invalid record", details: parsed.error.issues });

    const validErr = validateRecord(parsed?.data);
    if (validErr) return res.status(400).json({ error: validErr });

    const result = await pool?.query(
      `UPDATE dns_zone_records
       SET type=$1, name=$2, value=$3, ttl=$4, priority=$5, weight=$6, port=$7, tag=$8, updated_at=NOW()
       WHERE id=$9 AND user_id=$10
       RETURNING *`,
      [
        parsed?.data.type,
        parsed?.data.name,
        parsed?.data.value,
        parsed?.data.ttl,
        parsed?.data.priority ?? null,
        parsed?.data.weight ?? null,
        parsed?.data.port ?? null,
        parsed?.data.tag ?? null,
        req.params.recordId,
        userId,
      ],
    );

    if ((result as any)?.rows.length === 0)
      return res.status(404).json({ error: "Record not found" });
    res.json({ success: true, record: mapRecord((result as any)?.rows[0]) });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error updating record: " + ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to update record" });
  }
});

router.delete("/zones/:zoneId/records/:recordId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT id FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });

    await pool?.query(
      "DELETE FROM dns_zone_records WHERE id = $1 AND user_id = $2",
      [req.params.recordId, userId],
    );

    res.json({ success: true });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error deleting record: " + ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to delete record" });
  }
});

router.post("/zones/:zoneId/records/batch", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any)?.rows[0]);

    const { records } = req.body;
    if (!Array.isArray(records) || records?.length === 0)
      return res.status(400).json({ error: "Records array required" });
    if (records?.length > 100)
      return res.status(400).json({ error: "Max 100 records per batch" });

    const validated: z.infer<typeof recordSchema>[] = [];
    for (const r of records) {
      const parsed = recordSchema?.safeParse(r);
      if (!parsed?.success)
        return res
          .status(400)
          .json({
            error: "Invalid record in batch",
            details: parsed.error.issues,
          });
      const validErr = validateRecord(parsed?.data);
      if (validErr) return res.status(400).json({ error: validErr });
      validated?.push(parsed?.data);
    }

    for (const r of validated) {
      await pool?.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl, priority, weight, port, tag)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          zone?.id,
          userId,
          zone?.domain,
          r?.type,
          r?.name,
          r?.value,
          r?.ttl,
          r?.priority ?? null,
          r?.weight ?? null,
          r?.port ?? null,
          r?.tag ?? null,
        ],
      );
    }

    res.json({ success: true, count: validated.length });
  } catch (err) {
    logger.warn(
      "[DNS Manager] Error batch adding records: " +
        ((err as any)?.message ?? String(err)),
    );
    res.status(500).json({ error: "Failed to batch add records" });
  }
});

// ── Storefront URL linking ─────────────────────────────────────────────────────

/**
 * GET /api/dns-manager/zones/:zoneId/storefront-link
 * Return the storefront currently linked to this zone as its custom URL.
 */
router.get("/zones/:zoneId/storefront-link", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT id, domain, is_verified, status FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = (zoneResult as any)?.rows[0];

    const linkResult = await pool?.query(
      `SELECT sd.storefront_id, sd.status, s.name, s.slug
       FROM storefront_domains sd
       JOIN storefronts s ON s.id = sd.storefront_id
       WHERE sd.domain = $1 AND sd.type = 'custom_domain' AND s.user_id = $2
       LIMIT 1`,
      [zone?.domain, userId],
    );

    const link = (linkResult as any)?.rows[0] ?? null;
    return res.json({
      zone: {
        id: zone.id,
        domain: zone.domain,
        isVerified: zone.is_verified,
        status: zone.status,
      },
      linked: link
        ? {
            storefrontId: link.storefront_id,
            storefrontName: link.name,
            storefrontSlug: link.slug,
            status: link.status,
          }
        : null,
    });
  } catch (err) {
    logger.warn({ err }, "[DNS Manager] storefront-link GET error");
    return res.status(500).json({ error: "Failed to fetch storefront link" });
  }
});

/**
 * POST /api/dns-manager/zones/:zoneId/use-as-storefront
 * Body: { storefrontId: string }
 *
 * Sets the zone's domain as the custom URL for the given storefront.
 * Requires the zone to be verified (is_verified = true).
 */
router.post("/zones/:zoneId/use-as-storefront", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const { storefrontId } = req.body;
    if (!storefrontId || typeof storefrontId !== "string") {
      return res.status(400).json({ error: "storefrontId is required" });
    }

    // Verify zone belongs to user
    const zoneResult = await pool.query(
      "SELECT id, domain, is_verified, status FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any).rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = (zoneResult as any).rows[0];

    if (!zone.is_verified) {
      return res.status(422).json({
        error:
          "Ownership of this transferred domain must be verified first. Go to the Setup Guide tab, add the TXT verification record at your current registrar, then click Check Verification.",
        code: "TRANSFER_VERIFICATION_REQUIRED",
      });
    }

    // Verify storefront belongs to user
    const sfResult = await pool.query(
      "SELECT id, name, slug FROM storefronts WHERE id = $1 AND user_id = $2 LIMIT 1",
      [storefrontId, userId],
    );
    if ((sfResult as any).rows.length === 0)
      return res.status(404).json({ error: "Storefront not found" });
    const sf = (sfResult as any).rows[0];

    // Clear any existing custom_domain links for this storefront (one at a time)
    await pool.query(
      `DELETE FROM storefront_domains WHERE storefront_id = $1 AND type = 'custom_domain'`,
      [storefrontId],
    );

    // Clear any existing link for this domain (in case it was linked to a different storefront)
    await pool.query(`DELETE FROM storefront_domains WHERE domain = $1`, [
      zone.domain,
    ]);

    // Insert new link
    await pool.query(
      `INSERT INTO storefront_domains (storefront_id, domain, type, status, is_primary, dns_zone_id)
       VALUES ($1, $2, 'custom_domain', 'active', true, $3)`,
      [storefrontId, zone.domain, zone.id],
    );

    // Upsert storefront_hosts so the edge router picks it up (root domain)
    await pool.query(
      `INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
       VALUES ($1, $2, 'pending', NOW(), NOW())
       ON CONFLICT (host) DO UPDATE SET storefront_id = EXCLUDED.storefront_id, updated_at = NOW()`,
      [zone.domain, storefrontId],
    );

    // Also add www. variant for root domains (no subdomain prefix)
    const isRootDomain =
      !zone.domain.startsWith("www.") && zone.domain.split(".").length === 2;
    if (isRootDomain) {
      await pool.query(
        `INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
         VALUES ($1, $2, 'pending', NOW(), NOW())
         ON CONFLICT (host) DO UPDATE SET storefront_id = EXCLUDED.storefront_id, updated_at = NOW()`,
        [`www.${zone.domain}`, storefrontId],
      );
    }

    // Update the storefront's customDomain field
    await pool?.query(
      `UPDATE storefronts SET custom_domain = $1, is_custom_domain_active = true, updated_at = NOW() WHERE id = $2`,
      [zone?.domain, storefrontId],
    );

    logger.info(
      `[DNS Manager] Zone ${zone?.domain} linked as storefront URL for ${storefrontId}`,
    );
    return res.json({
      success: true,
      domain: zone.domain,
      url: `https://${zone.domain}`,
      storefrontId,
      storefrontName: sf.name,
      storefrontSlug: sf.slug,
    });
  } catch (err) {
    logger.warn({ err }, "[DNS Manager] use-as-storefront POST error");
    return res
      .status(500)
      .json({ error: "Failed to link domain as storefront URL" });
  }
});

/**
 * GET /api/dns-manager/zones/:zoneId/export
 * Export all DNS records for this zone as a BIND-format zone file.
 * Returns { zoneText, filename } so the client can trigger a download.
 */
router.get("/zones/:zoneId/export", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any)?.rows[0]);

    const recordsResult = await pool?.query(
      "SELECT * FROM dns_zone_records WHERE zone_id = $1 ORDER BY type, name",
      [zone?.id],
    );
    const records: ReturnType<typeof mapRecord>[] =
      (recordsResult as any)?.rows.map(mapRecord);

    const now = new Date();
    const serial = now?.toISOString().slice(0, 10).replace(/-/g, "") + "01";
    const origin = zone?.domain.endsWith(".") ? zone?.domain : `${zone?.domain}.`;

    function fqdn(name: string): string {
      if (name === "@" || name === "") return "@";
      if (name?.endsWith(".")) return name;
      return name?.includes(".") && !name?.endsWith((zone?.domain as string))
        ? `${name}.`
        : name;
    }

    function fqdnVal(val: string, type: string): string {
      if (["NS", "CNAME", "MX", "SRV"].includes(type)) {
        return val?.endsWith(".") ? val : `${val}.`;
      }
      if (type === "TXT") return `"${val.replace(/"/g, '\\"')}"`;
      return val;
    }

    const lines: string[] = [
      `; Zone file for ${zone?.domain}`,
      `; Exported from Max Booster on ${now?.toUTCString()}`,
      `; `,
      `; Import this at Cloudflare, Route 53, Namecheap, or any BIND-compatible provider.`,
      `; Replace or remove the NS records below with your new provider's nameservers.`,
      ``,
      `$ORIGIN ${origin}`,
      `$TTL 3600`,
      ``,
      `@   IN  SOA   ${NS1}. hostmaster.${BASE_DOMAIN}. (`,
      `              ${serial} ; Serial`,
      `              3600       ; Refresh`,
      `              900        ; Retry`,
      `              604800     ; Expire`,
      `              300 )      ; Minimum TTL`,
      ``,
      `; Name servers — replace with your new provider's NS records`,
      `@   IN  NS    ${NS1}.`,
      `@   IN  NS    ${NS2}.`,
      ``,
      `; ── Your DNS records ─────────────────────────────────────────────────────`,
    ];

    const userRecords = records?.filter((r) => !["SOA", "NS"].includes((r?.type as string)));
    for (const r of userRecords) {
      const name = fqdn((r?.name as string)).padEnd(24);
      const ttlStr = String(r?.ttl ?? 3600).padEnd(8);
      const typeStr = r?.type.padEnd(6);
      let valueStr = fqdnVal((r?.value as string), (r?.type as string));

      if (r?.type === "MX" && r?.priority !== undefined) {
        valueStr = `${r?.priority} ${valueStr}`;
      } else if (r?.type === "SRV" && r?.priority !== undefined) {
        valueStr = `${r?.priority} ${r?.weight ?? 0} ${r?.port ?? 0} ${valueStr}`;
      } else if (r?.type === "CAA" && r?.tag) {
        valueStr = `0 ${r?.tag} "${r.value}"`;
      }

      lines?.push(`${name} ${ttlStr} IN  ${typeStr} ${valueStr}`);
    }

    const zoneText = lines?.join("\n") + "\n";
    const filename = `${zone?.domain.replace(/\./g, "_")}zone.txt`;

    res.json({
      zoneText,
      filename,
      domain: zone.domain,
      recordCount: userRecords.length,
    });
  } catch (err) {
    logger.warn({ err }, "[DNS Manager] export error");
    res.status(500).json({ error: "Failed to export zone" });
  }
});

/**
 * POST /api/dns-manager/zones/:zoneId/transfer-out
 * Remove this zone from Max Booster DNS hosting entirely.
 * Cleans up all records and storefront links.
 * Returns the zone file export before deletion so the client has a final copy.
 */
router.post("/zones/:zoneId/transfer-out", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool?.query(
      "SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any)?.rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = mapZone((zoneResult as any)?.rows[0]);

    // Clean up storefront links before deleting the zone
    const linkResult = await pool?.query(
      `SELECT storefront_id FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain' LIMIT 1`,
      [zone?.domain],
    );
    const linkedStorefrontId = (linkResult as any)?.rows[0]?.storefront_id ?? null;

    await pool?.query(
      `DELETE FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain'`,
      [zone?.domain],
    );
    await pool?.query(
      `DELETE FROM storefront_hosts WHERE host = $1 OR host = $2`,
      [zone?.domain, `www.${zone?.domain}`],
    );

    if (linkedStorefrontId) {
      await pool?.query(
        `UPDATE storefronts SET custom_domain = NULL, is_custom_domain_active = false, updated_at = NOW()
         WHERE id = $1 AND custom_domain = $2`,
        [linkedStorefrontId, zone?.domain],
      );
    }

    // Delete all DNS records, then the zone itself
    await pool.query("DELETE FROM dns_zone_records WHERE zone_id = $1", [
      zone?.id,
    ]);
    await pool.query("DELETE FROM dns_zones WHERE id = $1", [zone?.id]);

    logger.info(
      `[DNS Manager] Zone ${zone?.domain} transferred out by user ${userId}`,
    );
    res.json({ success: true, domain: zone.domain });
  } catch (err) {
    logger.warn({ err }, "[DNS Manager] transfer-out error");
    res.status(500).json({ error: "Failed to transfer out domain" });
  }
});

/**
 * DELETE /api/dns-manager/zones/:zoneId/use-as-storefront
 * Remove the link between this zone's domain and any storefront.
 */
router.delete("/zones/:zoneId/use-as-storefront", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      "SELECT id, domain FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, userId],
    );
    if ((zoneResult as any).rows.length === 0)
      return res.status(404).json({ error: "Zone not found" });
    const zone = (zoneResult as any).rows[0];

    // Find the linked storefront so we can clear its customDomain field
    const linkResult = await pool.query(
      `SELECT storefront_id FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain' LIMIT 1`,
      [zone.domain],
    );
    const linkedStorefrontId = (linkResult as any).rows[0].storefront_id ?? null;

    // Remove storefront_domains entry
    await pool.query(
      `DELETE FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain'`,
      [zone?.domain],
    );

    // Remove storefront_hosts entries (root domain and www variant)
    await pool?.query(
      `DELETE FROM storefront_hosts WHERE host = $1 OR host = $2`,
      [zone?.domain, `www.${zone?.domain}`],
    );

    // Clear customDomain on the storefront if it matches
    if (linkedStorefrontId) {
      await pool?.query(
        `UPDATE storefronts SET custom_domain = NULL, is_custom_domain_active = false, updated_at = NOW()
         WHERE id = $1 AND custom_domain = $2`,
        [linkedStorefrontId, zone?.domain],
      );
    }

    logger.info(
      `[DNS Manager] Storefront URL link removed for zone ${zone?.domain}`,
    );
    return res.json({ success: true });
  } catch (err) {
    logger.warn({ err }, "[DNS Manager] use-as-storefront DELETE error");
    return res.status(500).json({ error: "Failed to unlink storefront URL" });
  }
});

export default router;
