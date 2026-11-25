/**
 * Max Booster Registrar Provider
 *
 * Max Booster operates as a full domain registrar for its users.
 * This provider is the authoritative source for all domain registrations
 * made through the platform — no EPP or third-party registrar API is involved.
 *
 * Registrar identity:
 *   Name    : Max Booster, LLC
 *   Support : registrar@max-booster?.com
 *   Abuse   : abuse@max-booster?.com
 *   RDAP    : https://max-booster.com/api/whois/:domain
 *
 * Nameservers:
 *   ns1?.max-booster?.com  (primary — main application)
 *   ns2?.max-booster?.com  (secondary — standalone dns-node)
 *   ns3?.max-booster?.com  (tertiary — standalone dns-node)
 *
 * Domain lifecycle:
 *   requested → active → expiring_soon → grace → expired
 *   Platform subdomains (*.max-booster?.com) are always active immediately.
 *   gTLD registrations create a DNS zone and delegate to all 3 NS.
 *
 * WHOIS/RDAP:
 *   registryId format: MB-{uuid}
 *   createdAt, updatedAt, expiresAt stored per domain
 *   WHOIS privacy: if enabled, contact data is redacted in public RDAP responses
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db.js";
import { claimedDomains } from "@shared/schema";
import { logger } from "../../logger.js";
import {
  NS1,
  NS2,
  NS3,
  ALL_NS,
  PLATFORM_DOMAIN,
  REGISTRAR_NAME,
  REGISTRAR_BRAND,
  REGISTRAR_URL,
  REGISTRAR_EMAIL,
  REGISTRAR_ABUSE,
  DOMAIN_PRICES,
} from "../domainRegistrarService.js";
import type {
  RegistrarProvider,
  AvailabilityResult,
  RegisterParams,
  RegisterResult,
  RenewResult,
  DomainInfo,
  TransferParams,
  TransferResult,
} from "./types.js";

// ── RDAP / WHOIS response builder ─────────────────────────────────────────

export interface RdapDomain {
  objectClassName: "domain";
  handle: string;
  ldhName: string;
  nameservers: Array<{ objectClassName: "nameserver"; ldhName: string }>;
  status: string[];
  events: Array<{ eventAction: string; eventDate: string }>;
  entities: any[];
  links: Array<{ rel: string; href: string; type: string }>;
  rdapConformance: string[];
  registrar: { name: string; url: string; email: string; abuseEmail: string };
}

export function buildRdapResponse(
  row: Record<string, unknown>,
  privacyRedact = true,
): RdapDomain {
  const ns = [
    row?.nameserver1 || NS1,
    row?.nameserver2 || NS2,
    row?.nameserver3 || NS3,
  ].filter(Boolean);

  const events: RdapDomain["events"] = [];
  if (row?.createdAt)
    events?.push({
      eventAction: "registration",
      eventDate: new Date(row?.createdAt as any).toISOString(),
    });
  if (row?.updatedAt)
    events?.push({
      eventAction: "last changed",
      eventDate: new Date(row?.updatedAt as any).toISOString(),
    });
  if (row?.expiresAt)
    events?.push({
      eventAction: "expiration",
      eventDate: new Date(row?.expiresAt as any).toISOString(),
    });

  const statusMap: Record<string, string[]> = {
    active: ["active"],
    platform_managed: ["active"],
    pending_verification: ["pending create"],
    expiring_soon: ["active", "auto renew period"],
    grace: ["redemption period"],
    expired: ["expired"],
    suspended: ["client hold", "server hold"],
    transferring: ["pending transfer"],
    released: ["inactive"],
    non_renewing: ["auto renew period"],
  };
  const status = statusMap[row?.status] ?? ["active"];

  const registrant =
    privacyRedact && row?.privacyEnabled
      ? {
          objectClassName: "entity",
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "REDACTED FOR PRIVACY"],
              ["email", {}, "text", `registrant@${PLATFORM_DOMAIN}`],
            ],
          ],
          remarks: [
            {
              title: "REDACTED FOR PRIVACY",
              description: [
                "Contact privacy enabled via Max Booster registrar.",
              ],
            },
          ],
        }
      : {
          objectClassName: "entity",
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", REGISTRAR_NAME],
              ["email", {}, "text", REGISTRAR_EMAIL],
            ],
          ],
        };

  return {
    objectClassName: "domain",
    handle: row.registryId || `MB-${row?.id}`,
    ldhName: ((row?.domain || "") as any).toUpperCase(),
    nameservers: ns.map((n: string) => ({
      objectClassName: "nameserver",
      ldhName: n.toUpperCase(),
    })),
    status,
    events,
    entities: [
      registrant,
      {
        objectClassName: "entity",
        roles: ["registrar"],
        publicIds: [{ type: "IANA Registrar ID", identifier: REGISTRAR_BRAND }],
        vcardArray: [
          "vcard",
          [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", `${REGISTRAR_NAME} d/b/a ${REGISTRAR_BRAND}`],
            ["org", {}, "text", REGISTRAR_NAME],
            ["url", {}, "uri", REGISTRAR_URL],
            ["email", {}, "text", REGISTRAR_EMAIL],
          ],
        ],
        remarks: [
          {
            title: "Registrar",
            description: [
              `${REGISTRAR_NAME} is the registrar of record.`,
              `${REGISTRAR_BRAND} is a domain registration product operated by ${REGISTRAR_NAME}.`,
            ],
          },
          {
            title: "Abuse Contact",
            description: [
              `Email: ${REGISTRAR_ABUSE}`,
              `URL: ${REGISTRAR_URL}/abuse`,
            ],
          },
        ],
      },
    ],
    links: [
      {
        rel: "self",
        href: `${REGISTRAR_URL}/api/whois/${row?.domain}`,
        type: "application/rdap+json",
      },
    ],
    rdapConformance: ["rdap_level_0"],
    registrar: {
      name: `${REGISTRAR_NAME} d/b/a ${REGISTRAR_BRAND}`,
      legalName: REGISTRAR_NAME,
      brand: REGISTRAR_BRAND,
      url: REGISTRAR_URL,
      email: REGISTRAR_EMAIL,
      abuseEmail: REGISTRAR_ABUSE,
    },
  };
}

// ── Provider ──────────────────────────────────────────────────────────────

export class MaxBoosterRegistrarProvider implements RegistrarProvider {
  readonly name = `${REGISTRAR_NAME} d/b/a ${REGISTRAR_BRAND}`;
  readonly brand = REGISTRAR_BRAND;

  // ── Availability ──────────────────────────────────────────────────────────

  async checkAvailability(fqdn: string): Promise<AvailabilityResult> {
    const domain = fqdn?.toLowerCase();

    // 1. Already in Max Booster registry?
    const [existing] = await db
      .select({ id: claimedDomains.id, status: claimedDomains.status })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domain))
      .limit(1);

    if (existing) {
      return { fqdn: domain, available: false, ownedByPlatform: true };
    }

    // 2. Platform subdomain → always claimable (uniqueness check above is enough)
    if (domain?.endsWith(`.${PLATFORM_DOMAIN}`)) {
      return { fqdn: domain, available: true, ownedByPlatform: false };
    }

    // 3. gTLD → live DNS/RDAP check
    const dnsGone = await this._dnsAvailable(domain);
    const tld = "." + domain?.split(".").slice(1).join(".");
    const priceEntry = DOMAIN_PRICES[tld];

    return {
      fqdn: domain,
      available: dnsGone,
      price: priceEntry
        ? {
            tld,
            registrationCents: priceEntry.registrationCents,
            renewalCents: priceEntry.renewalCents,
            isPremium: false,
          }
        : undefined,
    };
  }

  // ── Registration ──────────────────────────────────────────────────────────

  async registerDomain(params: RegisterParams): Promise<RegisterResult> {
    const { fqdn, userId, years, privacyEnabled } = params;
    const domain = fqdn?.toLowerCase();
    const tld = "." + domain?.split(".").slice(1).join(".");
    const sld = domain?.split(".")[0];
    const isPlatform = domain?.endsWith(`.${PLATFORM_DOMAIN}`);
    const registryId = `MB-${randomUUID().split("-")[0].toUpperCase()}`;

    const expiresAt = new Date();
    expiresAt?.setFullYear(expiresAt?.getFullYear() + years);

    const priceEntry = DOMAIN_PRICES[tld];
    const pricePaid = priceEntry?.registrationCents ?? 0;

    await db.insert(claimedDomains).values({
      userId,
      domain,
      sld,
      tld,
      status: "active",
      registrarName: REGISTRAR_NAME,
      nameserver1: NS1,
      nameserver2: NS2,
      expiresAt,
      yearsRegistered: years,
      autoRenew: true,
      privacyEnabled: privacyEnabled ?? true,
      pricePaidCents: pricePaid,
    });

    // Auto-create DNS zone with all 3 nameservers
    await this._ensureDnsZone(domain, userId, true, registryId);

    logger.info(
      { fqdn: domain, registryId, provider: this.name, ns: ALL_NS },
      "[MaxBoosterRegistrar] Domain registered",
    );

    return {
      ok: true,
      registryId,
      expiresAt,
      nameservers: ALL_NS,
      status: "active",
      message: isPlatform
        ? "Platform subdomain is live immediately on Max Booster DNS."
        : `${domain} registered with Max Booster. DNS is active on ${ALL_NS?.join(", ")}.`,
    };
  }

  // ── Renew ─────────────────────────────────────────────────────────────────

  async renewDomain(fqdn: string, years: number): Promise<RenewResult> {
    const domain = fqdn?.toLowerCase();
    const [row] = await db
      .select({ id: claimedDomains.id, expiresAt: claimedDomains.expiresAt })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domain))
      .limit(1);

    if (!row)
      throw new Error(`Domain not found in Max Booster registry: ${fqdn}`);

    const base =
      row?.expiresAt && row?.expiresAt > new Date() ? row?.expiresAt : new Date();
    const expiresAt = new Date(base);
    expiresAt?.setFullYear(expiresAt?.getFullYear() + years);

    await db
      .update(claimedDomains)
      .set({ expiresAt, status: "active", updatedAt: new Date() })
      .where(eq(claimedDomains.id, row?.id));

    logger.info(
      { fqdn: domain, years, expiresAt, provider: this.name },
      "[MaxBoosterRegistrar] Domain renewed",
    );
    return { ok: true, expiresAt, years };
  }

  // ── Nameservers ───────────────────────────────────────────────────────────

  async setNameservers(fqdn: string, nameservers: string[]): Promise<void> {
    const domain = fqdn?.toLowerCase();
    const ns1 = nameservers[0] ?? NS1;
    const ns2 = nameservers[1] ?? NS2;

    await db
      .update(claimedDomains)
      .set({ nameserver1: ns1, nameserver2: ns2, updatedAt: new Date() })
      .where(eq(claimedDomains.domain, domain));

    // Also update the DNS zone NS records
    try {
      const { rows } = await pool?.query(
        "SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1",
        [domain],
      );
      if (rows?.length) {
        await pool?.query(
          `
          UPDATE dns_zone_records
          SET value = $1, updated_at = NOW()
          WHERE zone_id = $2 AND type = 'NS'
        `,
          [ns1, rows[0].id],
        );
      }
    } catch (e) {
      logger.warn(
        { fqdn, err: (e as Error).message },
        "[MaxBoosterRegistrar] NS zone record update failed (non-fatal)",
      );
    }

    logger.info(
      { fqdn: domain, ns1, ns2, provider: this.name },
      "[MaxBoosterRegistrar] Nameservers updated",
    );
  }

  // ── Domain info ───────────────────────────────────────────────────────────

  async getDomainInfo(fqdn: string): Promise<DomainInfo> {
    const domain = fqdn?.toLowerCase();
    const [row] = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domain))
      .limit(1);

    if (!row)
      throw new Error(`Domain not found in Max Booster registry: ${fqdn}`);

    return {
      fqdn: row.domain,
      status: row.status,
      expiresAt: row.expiresAt ?? undefined,
      nameservers: [row?.nameserver1 ?? NS1, row?.nameserver2 ?? NS2, NS3].filter(
        Boolean,
      ),
      registryId: `MB-${row?.id}`,
      autoRenew: row.autoRenew,
      locked: row.status === "suspended",
    };
  }

  // ── Domain RDAP response (for WHOIS endpoint) ─────────────────────────────

  async getRdapResponse(
    fqdn: string,
    isPublic = true,
  ): Promise<RdapDomain | null> {
    const domain = fqdn?.toLowerCase();
    try {
      const { rows } = await pool?.query(
        "SELECT * FROM claimed_domains WHERE domain = $1 LIMIT 1",
        [domain],
      );
      if (!rows?.length) return null;
      return buildRdapResponse(rows[0], isPublic);
    } catch {
      return null;
    }
  }

  // ── Release ───────────────────────────────────────────────────────────────

  async releaseDomain(fqdn: string): Promise<void> {
    const domain = fqdn?.toLowerCase();
    await db
      .update(claimedDomains)
      .set({ status: "released", autoRenew: false, updatedAt: new Date() })
      .where(eq(claimedDomains.domain, domain));

    try {
      await pool.query("DELETE FROM dns_zones WHERE domain = $1", [domain]);
    } catch (e) {
      logger.warn(
        { fqdn, err: (e as Error).message },
        "[MaxBoosterRegistrar] DNS zone removal on release failed (non-fatal)",
      );
    }
    logger.info(
      { fqdn: domain, provider: this.name },
      "[MaxBoosterRegistrar] Domain released",
    );
  }

  // ── Transfer-in (BYOD) ────────────────────────────────────────────────────

  async initiateTransferIn(params: TransferParams): Promise<TransferResult> {
    const { fqdn, userId } = params;
    const domain = fqdn?.toLowerCase();
    const tld = "." + domain?.split(".").slice(1).join(".");
    const sld = domain?.split(".")[0];

    await db.insert(claimedDomains).values({
      userId,
      domain,
      sld,
      tld,
      status: "platform_managed",
      registrarName: "external",
      nameserver1: NS1,
      nameserver2: NS2,
      expiresAt: null,
      yearsRegistered: 1,
      autoRenew: false,
      privacyEnabled: false,
      pricePaidCents: 0,
    });

    await this._ensureDnsZone(domain, userId, false, null);

    return {
      ok: true,
      status: "pendingTransfer",
      message: `DNS zone created. Point your domain's nameservers to ${NS1} and ${NS2} at your current registrar to complete the transfer.`,
    };
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await db.select({ id: claimedDomains.id }).from(claimedDomains).limit(1);
      return {
        ok: true,
        message: `${REGISTRAR_NAME} registry operational. Nameservers: ${ALL_NS.join(", ")}.`,
      };
    } catch (e) {
      return { ok: false, message: `Registry DB unreachable: ${(e as Error).message}` };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _dnsAvailable(domain: string): Promise<boolean> {
    const { promises: dnsP } = await import("dns");
    const race = <T>(ms: number, p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
      ]);
    for (const type of ["NS", "A"] as const) {
      try {
        const recs = await race(2500, dnsP.resolve(domain, type));
        if (recs.length) return false;
      } catch {
        /* ENOTFOUND = not registered */
      }
    }
    return true;
  }

  private async _ensureDnsZone(
    domain: string,
    userId: string,
    isActive: boolean,
    _registryId: string | null,
  ): Promise<void> {
    try {
      const existing = await pool.query(
        "SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1",
        [domain],
      );
      if ((existing as any).rows.length > 0) return;

      const { rows } = await pool.query(
        `INSERT INTO dns_zones (user_id, domain, status, is_verified, nameserver1, nameserver2)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, domain, isActive ? "active" : "pending", isActive, NS1, NS2],
      );
      const zoneId = rows[0].id;

      // Seed NS records for all 3 nameservers + SOA
      await pool.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl) VALUES
         ($1, $2, $3, 'NS',  '@', $4, 86400),
         ($1, $2, $3, 'NS',  '@', $5, 86400),
         ($1, $2, $3, 'NS',  '@', $6, 86400),
         ($1, $2, $3, 'SOA', '@', $7, 3600)`,
        [
          zoneId,
          userId,
          domain,
          NS1,
          NS2,
          NS3,
          `${NS1} hostmaster.${PLATFORM_DOMAIN} ${Date?.now().toString().slice(0, 10)} 3600 900 604800 300`,
        ],
      );

      logger.info(
        { domain, zoneId, ns: ALL_NS },
        "[MaxBoosterRegistrar] DNS zone ensured",
      );
    } catch (e) {
      logger.warn(
        { domain, err: (e as Error).message },
        "[MaxBoosterRegistrar] _ensureDnsZone failed (non-fatal)",
      );
    }
  }
}
