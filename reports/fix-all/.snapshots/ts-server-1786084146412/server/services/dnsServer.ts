/**
 * Max Booster — Built-in Authoritative DNS Server
 *
 * Configured exactly like a professional DNS provider (Cloudflare, Route 53):
 *
 *   • Listens on UDP :53 + TCP :53 (configurable via DNS_PORT)
 *   • Authoritative for BASE_DOMAIN (max-booster?.com) AND any custom domain
 *     that a user has claimed/pointed here (stored in storefrontDomains table)
 *   • Nameservers: ns1.max-booster?.com / ns2?.max-booster?.com
 *   • Wildcard A records: *.max-booster?.com → DNS_SERVER_IP
 *   • Custom domains: resolved to DNS_SERVER_IP once user points NS here
 *   • SOA with proper refresh/retry/expire/minimum per RFC 1912 best-practices
 *   • Non-authoritative queries forwarded upstream (8.8.8.8)
 *
 * To activate for a custom domain (e?.g. mybeats?.com):
 *   1. User claims the domain inside Max Booster (Domain Hub → Find Domain)
 *   2. User goes to their registrar and sets the nameserver to:
 *        ns1?.max-booster?.com  /  ns2?.max-booster?.com
 *   3. DNS propagates (up to 48 h). The domain then resolves here automatically.
 *
 * No glue records or external registrar API required — the built-in DNS is
 * the sole authoritative server for all claimed domains.
 */

import dns2 from "dns2";
import { eq, and } from "drizzle-orm";
import { db } from "../db.js";
import { storefrontDomains, dnsZoneRecords, dnsZones } from "@shared/schema";
import { logger } from "../logger.js";
import { getOrCreateKeys, makeDS, makeDnskeyData, signRRset, zoneSalt, encodeNameWire, nsec3ParamRdata, NSEC3_ITERATIONS, RRTYPE_DNSKEY, RRTYPE_DS } from "./dnssec.js";
import { resolveGeoIP, getGeoDnsStatus } from "./geoDns.js";
import {
  resolveRecursive,
  rrToA,
  TYPE_A as REC_TYPE_A,
} from "./recursiveResolver.js";

// ── Feature flags ─────────────────────────────────────────────────────────────
const DNSSEC_ENABLED = process.env.DNSSEC_ENABLED === "true";

// ── Eager GeoDNS warm-up at module load ───────────────────────────────────────
// Decoupled from startDNSServer so it runs even when port 53 is unavailable.
if (process.env.GEODNS_ENABLED === "true") {
  (async () => {
    try {
      const { lookupGeo } = await import("./geoDns.js");
      const geo = await lookupGeo("8.8.8.8");
      if (geo?.continent || geo?.country) {
        const { logger: _log } = await import("../logger.js");
        _log?.info(
          `[DNS] GeoDNS database warm — 8.8.8.8 → ${geo?.continent ?? "?"}/${geo?.country ?? "?"}`,
        );
      }
    } catch {
      /* mmdb may not exist yet — silently ignored */
    }
  })();
}

const { Packet, createServer, UDPClient } = dns2 as unknown as Record<string, unknown>;

const BASE_DOMAIN = (
  process.env.BASE_DOMAIN || "max-booster.com"
).toLowerCase();
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || "34.111.179.208";
const DNS_PORT = parseInt(process.env.DNS_PORT || "53", 10);
const UPSTREAM_DNS = process.env.UPSTREAM_DNS || "8.8.8.8";

// DoH upstream used when outbound UDP port 53 is blocked (e?.g. in sandboxed envs)
// Cloudflare DoH: https://cloudflare-dns.com/dns-query
// Google DoH:     https://dns.google/dns-query
const DOH_UPSTREAM =
  process.env.DOH_UPSTREAM || "https://cloudflare-dns.com/dns-query";

/**
 * DNS-over-HTTPS fallback resolver.
 * Sends the raw DNS wire-format query to a public DoH endpoint.
 * Returns the parsed dns2 Packet on success, or null on failure.
 * This works even when outbound UDP port 53 is firewalled.
 */
async function dohFallback(queryBuf: Buffer): Promise<any | null> {
  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({
      default: null as typeof import("node-fetch").default | null,
    }));
    const fetchFn = fetch ?? (globalThis as Record<string, unknown>).fetch;
    if (!fetchFn) return null;

    const resp = await fetchFn(DOH_UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        Accept: "application/dns-message",
      },
      body: queryBuf,
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp?.ok) return null;
    const buf = Buffer?.from(await resp?.arrayBuffer());
    return (Packet as any)?.parse(buf);
  } catch {
    return null;
  }
}

// ─── TTL values — match Cloudflare's defaults (RFC 1912 §2.2) ────────────────
const TTL_A = 300; // 5 min A records — fast propagation on IP changes
const TTL_NS = 86400; // 24 h  NS records  (standard across all providers)
const TTL_SOA = 3600; // 1 h   SOA record

// SOA serial — updated on each server start so secondaries detect changes
const SERIAL = parseInt(
  new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01",
  10,
);

// ─── In-memory cache for claimed custom domains (refreshed every 60 s) ───────
let customDomainCache = new Set<string>();
let cacheLastRefreshed = 0;
const CACHE_TTL_MS = 60_000;

// Multi-region metrics
let queryCount = 0;
export const getQueryCount = () => queryCount;

async function refreshCustomDomainCache(): Promise<void> {
  try {
    const rows = await db
      .select({ domain: storefrontDomains.domain })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.status, "active"));
    customDomainCache = new Set(rows.map((r) => r.domain.toLowerCase()));
    cacheLastRefreshed = Date.now();
  } catch (err) {
    logger.warn({ err: err }, "[DNS] Could not refresh custom domain cache:");
  }
}

/** Returns true if the queried name is in a zone we are authoritative for. */
async function isAuthoritative(name: string): Promise<boolean> {
  const n = name.toLowerCase().replace(/\.$/, "");

  // Always authoritative for our base domain and all its subdomains
  if (n === BASE_DOMAIN || n.endsWith(`.${BASE_DOMAIN}`)) return true;

  // For everything else, check the claimed-custom-domain cache (refresh if stale)
  if (Date.now() - cacheLastRefreshed > CACHE_TTL_MS) {
    await refreshCustomDomainCache();
  }
  return customDomainCache.has(n);
}

// ─── Zone-record DB lookup ────────────────────────────────────────────────────

/**
 * resolveFromZoneRecords
 *
 * Looks up actual DNS records stored in dns_zone_records for a given
 * query name + type.  Called for TXT, MX, CNAME, AAAA queries so the
 * built-in DNS server can serve records that artists have configured
 * (e.g. the verification TXT written by storefrontDnsService).
 *
 * Name mapping:
 *   query `example.com`           → zone domain=`example.com`, name=`@`
 *   query `_maxbooster.example.com` → zone domain=`example.com`, name=`_maxbooster`
 *   query `www.example.com`       → zone domain=`example.com`, name=`www`
 */
async function resolveFromZoneRecords(
  qname: string,
  qtype: string,
): Promise<
  Array<{ name: string; value: string; ttl: number; priority?: number }>
> {
  try {
    // Determine the zone domain and relative name
    const rootDomain = extractZoneDomain(qname);
    const namePart =
      qname === rootDomain ? "@" : qname.slice(0, -(rootDomain.length + 1));

    const rows = await db
      .select({
        name: dnsZoneRecords.name,
        value: dnsZoneRecords.value,
        ttl: dnsZoneRecords.ttl,
        priority: dnsZoneRecords.priority,
      })
      .from(dnsZoneRecords)
      .innerJoin(dnsZones, eq(dnsZoneRecords.zoneId, dnsZones.id))
      .where(
        and(
          eq(dnsZones.domain, rootDomain),
          eq(dnsZoneRecords.type, qtype),
          eq(dnsZoneRecords.name, namePart),
        ),
      );

    return rows.map((r) => ({
      name: qname,
      value: r.value,
      ttl: r.ttl ?? 300,
      priority: r.priority ?? undefined,
    }));
  } catch (err) {
    logger.warn({ err, qname, qtype }, "[DNS] resolveFromZoneRecords error");
    return [];
  }
}

/**
 * Extract the zone domain for a query name.
 * Walks from the longest possible zone match (the name itself) up to the root.
 * For *.maxbooster.replit.app names we always return BASE_DOMAIN.
 * For custom domains we return the root domain (last two labels).
 */
function extractZoneDomain(name: string): string {
  if (name === BASE_DOMAIN || name.endsWith(`.${BASE_DOMAIN}`))
    return BASE_DOMAIN;
  // For custom domains: extract root domain (last two labels, e.g. example.com)
  const parts = name.split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return name;
}

// ─── DNS record builders ──────────────────────────────────────────────────────

const PLATFORM_NS = process.env.PLATFORM_NS || `ns1.${BASE_DOMAIN}`;
const PLATFORM_NS2 = process.env.PLATFORM_NS2 || `ns2.${BASE_DOMAIN}`;

/** SOA record — authoritative for all Max Booster zones */
function makeSOA(zone: string) {
  return {
    name: zone,
    type: (Packet as any).TYPE.SOA,
    class: (Packet as any).CLASS.IN,
    ttl: TTL_SOA,
    primary: PLATFORM_NS,
    admin: `hostmaster.${BASE_DOMAIN}`,
    serial: SERIAL,
    refresh: 10800, // 3 h
    retry: 3600, // 1 h
    expiration: 604800, // 7 days
    minimum: 3600, // negative-cache TTL (RFC 2308)
  };
}

/** NS records — both ns1 and ns2 (RFC requires ≥ 2 NS per zone) */
function makeNSRecords(zone: string) {
  return [
    {
      name: zone,
      type: (Packet as any).TYPE.NS,
      class: (Packet as any).CLASS.IN,
      ttl: TTL_NS,
      ns: PLATFORM_NS,
    },
    {
      name: zone,
      type: (Packet as any).TYPE.NS,
      class: (Packet as any).CLASS.IN,
      ttl: TTL_NS,
      ns: PLATFORM_NS2,
    },
  ];
}

function makeA(name: string, ip: string) {
  return {
    name,
    type: (Packet as any).TYPE.A,
    class: (Packet as any).CLASS.IN,
    ttl: TTL_A,
    address: ip,
  };
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(
  request: Record<string, unknown>,
  send: (response: Record<string, unknown>) => void,
): Promise<void> {
  queryCount++;
  const response = (Packet as any).createResponseFromRequest(request);
  response.header.aa = 0; // default: not authoritative

  const questions: Record<string, unknown>[] = request.questions || [];
  if (questions.length === 0) {
    send(response);
    return;
  }

  const question = questions[0];
  const name = ((question.name || "") as any).toLowerCase().replace(/\.$/, "");
  const qtype: number = question.type;

  // Determine the zone root for SOA/NS records
  // For *.maxbooster.replit.app → zone is BASE_DOMAIN
  // For a claimed custom domain (e.g. mybeats.com) → zone is the domain itself
  const isBaseDomainZone =
    name === BASE_DOMAIN || name.endsWith(`.${BASE_DOMAIN}`);
  const auth = await isAuthoritative(name);

  if (!auth) {
    // Non-authoritative — 3-tier resolution cascade (Build 2: Max Booster Public Resolver)
    //   Tier 1: Iterative recursive resolution from 13 IANA root servers (UDP)
    //   Tier 2: DNS-over-HTTPS to Cloudflare (works even when UDP port 53 is firewalled)
    //   Tier 3: UDP forwarding to configured upstream (8.8.8.8 default)
    const rawBuf: Buffer | undefined = (request as Record<string, unknown>)
      ._rawBuffer;

    // ── Tier 1: Recursive resolver (2 s cap — UDP may be firewalled) ────────
    try {
      const result = await Promise.race([
        resolveRecursive(name, qtype),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Tier1 timeout")), 2_000),
        ),
      ]);

      if (result.rcode === 3) {
        response.header.rcode = 3; // NXDOMAIN — authoritative from root
        send(response);
        return;
      }

      if (result.rcode === 0 && result.answers.length > 0) {
        // Got answers — build response
        let fallThrough = false;
        for (const rr of result.answers) {
          if (rr.type === REC_TYPE_A && rr.rdata.length === 4) {
            response.answers.push({
              name: rr.name,
              type: (Packet as any).TYPE.A,
              class: (Packet as any).CLASS.IN,
              ttl: rr.ttl,
              address: rrToA(rr) ?? "0.0.0.0",
            });
          } else {
            fallThrough = true;
            break;
          }
        }
        if (!fallThrough) {
          send(response);
          return;
        }
        // Non-A type — continue to DoH tier below
      }
      // SERVFAIL / empty — fall through to Tier 2
    } catch {
      /* UDP blocked or timeout — fall through to Tier 2 */
    }

    // ── Tier 2: DNS-over-HTTPS fallback (Cloudflare) ────────────────────────
    if (rawBuf) {
      try {
        const dohPacket = await dohFallback(rawBuf);
        if (dohPacket) {
          send(dohPacket);
          return;
        }
      } catch {
        /* DoH failed — fall through to Tier 3 */
      }
    }

    // ── Tier 3: UDP upstream (8.8.8.8) ──────────────────────────────────────
    try {
      const resolve = (UDPClient as any)({ dns: UPSTREAM_DNS });
      const upstream = await resolve(question.name, qtype);
      send(upstream);
    } catch {
      response.header.rcode = 2; // SERVFAIL — all tiers exhausted
      send(response);
    }
    return;
  }

  const zone = isBaseDomainZone ? BASE_DOMAIN : name;
  response.header.aa = 1; // we are authoritative

  switch (qtype) {
    case (Packet as any).TYPE.A: {
      const ip = await resolveGeoIP(
        (request as Record<string, unknown>)._rawBuffer ?? Buffer.alloc(0),
        (request as Record<string, unknown>)._srcIp,
      );
      response.answers.push(makeA(name, ip));
      break;
    }

    case (Packet as any).TYPE.SOA:
      response.answers.push(makeSOA(zone));
      break;

    case (Packet as any).TYPE.NS:
      makeNSRecords(zone).forEach((r) => response.answers.push(r));
      // RFC 1034 §4.3.2 — glue A records in ADDITIONAL to prevent circular lookups
      response.additionals.push(makeA(PLATFORM_NS, DNS_SERVER_IP));
      response.additionals.push(makeA(PLATFORM_NS2, DNS_SERVER_IP));
      break;

    case (Packet as any).TYPE.TXT: {
      const txtRecords = await resolveFromZoneRecords(name, "TXT");
      if (txtRecords.length > 0) {
        for (const r of txtRecords) {
          response.answers.push({
            name: r.name,
            type: (Packet as any).TYPE.TXT,
            class: (Packet as any).CLASS.IN,
            ttl: r.ttl,
            data: r.value,
          });
        }
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case (Packet as any).TYPE.MX: {
      const mxRecords = await resolveFromZoneRecords(name, "MX");
      if (mxRecords.length > 0) {
        for (const r of mxRecords) {
          response.answers.push({
            name: r.name,
            type: (Packet as any).TYPE.MX,
            class: (Packet as any).CLASS.IN,
            ttl: r.ttl,
            priority: r.priority ?? 10,
            exchange: r.value,
          });
        }
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case (Packet as any).TYPE.CNAME: {
      const cnameRecords = await resolveFromZoneRecords(name, "CNAME");
      if (cnameRecords.length > 0) {
        response.answers.push({
          name: cnameRecords[0].name,
          type: (Packet as any).TYPE.CNAME,
          class: (Packet as any).CLASS.IN,
          ttl: cnameRecords[0].ttl,
          domain: cnameRecords[0].value,
        });
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case (Packet as any).TYPE.AAAA: {
      const aaaaRecords = await resolveFromZoneRecords(name, "AAAA");
      if (aaaaRecords.length > 0) {
        for (const r of aaaaRecords) {
          response.answers.push({
            name: r.name,
            type: (Packet as any).TYPE.AAAA,
            class: (Packet as any).CLASS.IN,
            ttl: r.ttl,
            address: r.value,
          });
        }
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case 257: /* CAA */ {
      const caaRecords = await resolveFromZoneRecords(name, "CAA");
      if (caaRecords.length > 0) {
        for (const r of caaRecords) {
          // CAA wire format: flags(1) + tag_length(1) + tag + value
          // We store as: "0 issue \"letsencrypt.org\""
          const parts = r.value.match(/^(\d+)\s+(\w+)\s+"([^"]+)"$/);
          if (parts) {
            response.answers.push({
              name: r.name,
              type: 257,
              class: (Packet as any).CLASS.IN,
              ttl: r.ttl,
              flags: parseInt(parts[1], 10),
              tag: parts[2],
              value: parts[3],
            });
          }
        }
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case (Packet as any).TYPE.ANY:
      // RFC 8482 — respond with a minimal HINFO record to discourage ANY queries.
      // Major resolvers (Cloudflare, Google) follow this approach.
      response.answers.push({
        name,
        type: 13, // HINFO
        class: (Packet as any).CLASS.IN,
        ttl: TTL_A,
        cpu: "ANY obsoleted per RFC 8482",
        os: "",
      });
      break;

    case 48: /* DNSKEY */
    case 43: /* DS */
    case 46: /* RRSIG */
    case 50: /* NSEC3 */
    case 51 /* NSEC3PARAM */:
      // These are handled in processQuery via dns-packet when DNSSEC is enabled.
      // For UDP/TCP server, return SOA in authority (validator will use DoH).
      response.authorities.push(makeSOA(zone));
      break;

    default:
      // NOERROR with empty answers — SOA in authority section (RFC 2308)
      response.authorities.push(makeSOA(zone));
      break;
  }

  send(response);
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

let dnsServer: Record<string, unknown> | null = null;
let running = false;

/**
 * Attempt to start both UDP and TCP DNS servers on DNS_PORT.
 * On EACCES (port < 1024 without privilege), logs a clear warning and skips.
 * On the production VM, port 53 works fine.
 */
export async function startDNSServer(): Promise<void> {
  if (running) return;

  // Pre-check: can we bind this port at all?
  const portAvailable = await checkPortAvailable(DNS_PORT);
  if (!portAvailable) {
    logger.info(
      `[DNS] Port ${DNS_PORT} unavailable (EACCES or already in use) — DNS server not started. In dev: set DNS_PORT=5353.`,
    );
    return;
  }

  return new Promise<void>((resolve) => {
    try {
      const server = (createServer as any)({
        udp: true,
        tcp: true,
        handle: handleRequest,
      });

      let settled = false;
      const settle = (ok: boolean, msg?: string) => {
        if (settled) return;
        settled = true;
        // Remove all error listeners to prevent unhandled-event crashes
        server.removeAllListeners("error");
        if (!ok) {
          // DNS not starting is expected in Replit (no CAP_NET_BIND_SERVICE) — log at INFO.
          if (msg) logger.info(msg.replace("⚠️  ", ""));
          dnsServer = null;
          running = false;
        }
        resolve();
      };

      // Single aggregated error handler — fires for UDP or TCP sub-server errors
      server.on("error", (err: Error, proto?: string) => {
        const code: string = (err as any).code || "";
        if (code === "EACCES") {
          settle(
            false,
            `[DNS] ⚠️  Port ${DNS_PORT} requires elevated privileges (${proto || "unknown"}). DNS server not started.`,
          );
        } else if (code === "EADDRINUSE") {
          settle(
            false,
            `[DNS] ⚠️  Port ${DNS_PORT} already in use (${proto || "unknown"}). DNS server not started.`,
          );
        } else {
          settle(
            false,
            `[DNS] ⚠️  DNS server error (${proto || "unknown"}): ${err.message}`,
          );
        }
      });

      server
        .listen({
          udp: { port: DNS_PORT, address: "0.0.0.0" },
          tcp: { port: DNS_PORT, address: "0.0.0.0" },
        })
        .then(async () => {
          dnsServer = server;
          running = true;
          logger.info(
            `[DNS] ✅ Authoritative nameserver online — ${BASE_DOMAIN} → ${DNS_SERVER_IP} (UDP+TCP :${DNS_PORT})`,
          );
          logger.info(
            `[DNS] 📋 NS records: ${PLATFORM_NS} + ${PLATFORM_NS2} → ${DNS_SERVER_IP}`,
          );
          // Prime cache so first query hits DB immediately, not on first request
          await warmCache();
          settle(true);
        })
        .catch((err: any) => {
          settle(false, `[DNS] ⚠️  listen() rejected: ${err.message}`);
        });
    } catch (err) {
      logger.warn(
        `[DNS] ⚠️  Could not instantiate DNS server: ${(err as Error).message}`,
      );
      resolve();
    }
  });
}

/**
 * Quick TCP probe: attempt to bind the port. Returns true if bindable, false if EACCES/EADDRINUSE.
 * Uses a raw net.Server so we can test without starting the real DNS server.
 */
async function checkPortAvailable(port: number): Promise<boolean> {
  const { createServer: tcpCreate } = await import("net");
  return new Promise<boolean>((resolve) => {
    const probe = tcpCreate();
    probe.once("error", () => {
      probe.removeAllListeners();
      resolve(false);
    });
    probe.listen(port, "0.0.0.0", () => {
      probe.close(() => resolve(true));
    });
  });
}

export async function stopDNSServer(): Promise<void> {
  if (!running || !dnsServer) return;
  try {
    (dnsServer.close as any)();
    running = false;
    logger.info("[DNS] Nameserver stopped.");
  } catch (err) {
    logger.warn({ err }, `[DNS] Error stopping DNS server: ${(err as Error).message}`);
  }
}

export function isDNSRunning(): boolean {
  return running;
}

export function getDNSInfo() {
  return {
    running,
    baseDomain: BASE_DOMAIN,
    serverIp: DNS_SERVER_IP,
    port: DNS_PORT,
    upstream: UPSTREAM_DNS,
    nameservers: [`ns1.${BASE_DOMAIN}`, `ns2.${BASE_DOMAIN}`],
    dnssec: { enabled: DNSSEC_ENABLED },
    geodns: getGeoDnsStatus(),
    customDomainSetup: {
      step1:
        "Log into your domain registrar (GoDaddy, Namecheap, Google Domains, etc.)",
      step2: 'Find "Nameservers" or "DNS Settings" for your domain.',
      step3: 'Change nameserver type to "Custom" and enter:',
      ns1: `ns1.${BASE_DOMAIN}`,
      ns2: `ns2.${BASE_DOMAIN}`,
      step4:
        "Save. DNS propagation takes up to 48 hours (usually under 30 minutes).",
      note: "Once propagated, your domain will automatically point to your Max Booster store.",
    },
  };
}

/** Warm up the custom-domain cache immediately (called from startDNSServer). */
async function warmCache(): Promise<void> {
  await refreshCustomDomainCache();
  logger.info(
    `[DNS] Custom domain cache warmed — ${customDomainCache.size} active domain(s) loaded.`,
  );

  // Eagerly load GeoDNS database so the first real query doesn't pay the I/O cost
  if (process.env.GEODNS_ENABLED === "true") {
    const { lookupGeo } = await import("./geoDns.js");
    lookupGeo("8.8.8.8")
      .then((geo) => {
        if (geo!.continent || geo!.country) {
          logger.info(
            `[DNS] GeoDNS database warm — 8.8.8.8 → ${geo!.continent ?? "?"}/${geo!.country ?? "?"}`,
          );
        }
      })
      .catch(() => {
        /* DB may not be present yet — ignored */
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DNS-over-HTTPS (RFC 8484) gateway
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result returned by processQuery.
 * The HTTP layer needs minTtl to set a correct Cache-Control header per
 * RFC 8484 §5.1, and rcode to decide between max-age and no-store.
 */
export interface DohQueryResult {
  /** Raw DNS wire-format response buffer */
  buffer: Buffer;
  /** Minimum TTL across all RRs in answers + authorities (0 if no RRs) */
  minTtl: number;
  /** DNS RCODE from the response header (0=NOERROR, 2=SERVFAIL, 3=NXDOMAIN) */
  rcode: number;
}

// ── DNS wire-format helpers ───────────────────────────────────────────────────

/** Parse query type from raw DNS wire buffer (question section). */
function parseQueryType(buf: Buffer): number {
  if (buf.length < 12) return 0;
  let offset = 12;
  // Skip QNAME
  while (offset < buf.length) {
    const len = buf[offset++];
    if (len === 0) break;
    if ((len & 0xc0) === 0xc0) {
      offset++;
      break;
    }
    offset += len;
  }
  if (offset + 2 > buf.length) return 0;
  return buf.readUInt16BE(offset);
}

/** Parse query TX ID from wire buffer. */
function parseTxId(buf: Buffer): number {
  return buf.length >= 2 ? buf.readUInt16BE(0) : 0;
}

/** Parse query name from wire buffer (returns lowercase FQDN). */
function parseQueryName(buf: Buffer): string {
  if (buf.length < 12) return "";
  let offset = 12;
  const labels: string[] = [];
  while (offset < buf.length) {
    const len = buf[offset++];
    if (len === 0) break;
    if ((len & 0xc0) === 0xc0) break; // pointer — skip
    labels.push(
      buf
        .slice(offset, offset + len)
        .toString("ascii")
        .toLowerCase(),
    );
    offset += len;
  }
  return labels.join(".");
}

/** Check whether the DO (DNSSEC OK) bit is set in an OPT record. */
function parseDOBit(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const arCount = buf.readUInt16BE(10);
  if (arCount === 0) return false;

  // Scan additional section looking for OPT (type 41)
  let offset = 12;
  const qdCount = buf.readUInt16BE(4);
  const anCount = buf.readUInt16BE(6);
  const nsCount = buf.readUInt16BE(8);

  // Skip question section
  for (let i = 0; i < qdCount; i++) {
    while (offset < buf.length) {
      const len = buf[offset++];
      if (len === 0) break;
      if ((len & 0xc0) === 0xc0) {
        offset++;
        break;
      }
      offset += len;
    }
    offset += 4;
  }
  // Skip answer + authority sections
  const skipCount = anCount + nsCount;
  for (let i = 0; i < skipCount; i++) {
    const noff = skipNameOffset(buf, offset);
    if (noff === -1) return false;
    if (noff + 10 > buf.length) return false;
    const rdlen = buf.readUInt16BE(noff + 8);
    offset = noff + 10 + rdlen;
  }
  // Parse additional section
  for (let i = 0; i < arCount; i++) {
    const noff = skipNameOffset(buf, offset);
    if (noff === -1) return false;
    if (noff + 10 > buf.length) return false;
    const rrType = buf.readUInt16BE(noff);
    const extRcode = buf.readUInt32BE(noff + 4); // TTL field in OPT = extended rcode + flags
    const rdlen = buf.readUInt16BE(noff + 8);
    if (rrType === 41) {
      // DO bit is bit 15 of the second half of TTL field (extended flags)
      return (extRcode & 0x00008000) !== 0;
    }
    offset = noff + 10 + rdlen;
  }
  return false;
}

function skipNameOffset(buf: Buffer, offset: number): number {
  while (offset < buf.length) {
    const len = buf[offset];
    if (len === 0) return offset + 1;
    if ((len & 0xc0) === 0xc0) return offset + 2;
    offset += 1 + len;
  }
  return -1;
}

/** Convert a dns2 answer record's payload to raw RDATA Buffer for DNSSEC signing. */

function expandIPv6Full(addr: string): number[] {
  if (addr.includes("::")) {
    const [left, right] = addr.split("::");
    const l = left ? left.split(":") : [];
    const r = right ? right.split(":") : [];
    const missing = 8 - l.length - r.length;
    const middle = Array(missing).fill("0");
    return [...l, ...middle, ...r].map((g) => parseInt(g || "0", 16));
  }
  return addr.split(":").map((g) => parseInt(g, 16));
}

// Type name map for RRSIG typeCovered field
const TYPE_NAMES: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  43: "DS",
  46: "RRSIG",
  47: "NSEC",
  48: "DNSKEY",
  50: "NSEC3",
  51: "NSEC3PARAM",
  257: "CAA",
};

// Reverse map: string type name → numeric type code (dns-packet uses strings)
const TYPE_NUMS: Record<string, number> = Object.fromEntries(
  Object.entries(TYPE_NAMES).map(([n, s]) => [s, Number(n)]),
);

// ── DNSSEC response builder (dns-packet based) ────────────────────────────────

/**
 * Build a DNSKEY response using dns-packet, bypassing dns2.
 */
async function buildDnskeyResponse(
  queryBuf: Buffer,
  zone: string,
): Promise<DohQueryResult> {
  const dnsPacket = ((await import("dns-packet" as any)) as any).default;
  const txId = parseTxId(queryBuf);
  const qname = parseQueryName(queryBuf);

  // Don't serve DNSKEY if zone doesn't match
  const isAuth = await isAuthoritative(qname);
  if (!isAuth) {
    const buf = dnsPacket.encode({
      type: "response",
      id: txId,
      flags: dnsPacket.AUTHORITATIVE_ANSWER,
      questions: [{ type: "DNSKEY", name: qname, class: "IN" }],
      authorities: [buildSoaForDnsPacket(zone)],
    });
    return { buffer: buf, minTtl: TTL_SOA, rcode: 0 };
  }

  const keys = await getOrCreateKeys(zone);
  if (!keys) {
    return buildServfailResponse(txId);
  }

  const { ksk, zsk } = keys;
  const kskData = makeDnskeyData(ksk);
  const zskData = makeDnskeyData(zsk);

  const dnskeyRdatas: Buffer[] = [
    buildDnskeyRdata(ksk.flags, ksk.publicKeyRaw),
    buildDnskeyRdata(zsk.flags, zsk.publicKeyRaw),
  ];

  // Sign DNSKEY RRset with KSK (per RFC 4035 §2.2)
  const rrsig = signRRset(
    "DNSKEY",
    RRTYPE_DNSKEY,
    zone,
    TTL_NS,
    dnskeyRdatas,
    ksk.privateKeyPem,
    ksk.keyTag,
    zone,
  );

  const answers: Record<string, unknown>[] = [
    { type: "DNSKEY", name: zone, ttl: TTL_NS, data: kskData },
    { type: "DNSKEY", name: zone, ttl: TTL_NS, data: zskData },
    { type: "RRSIG", name: zone, ttl: TTL_NS, data: rrsig },
  ];

  const buf = dnsPacket.encode({
    type: "response",
    id: txId,
    flags: dnsPacket.AUTHORITATIVE_ANSWER | dnsPacket.AUTHENTIC_DATA,
    questions: [{ type: "DNSKEY", name: zone, class: "IN" }],
    answers,
  });

  return { buffer: buf, minTtl: TTL_NS, rcode: 0 };
}

/** Build DNSKEY RDATA buffer: flags(2) + protocol(1)=3 + algorithm(1) + key(N) */
function buildDnskeyRdata(flags: number, publicKeyRaw: Buffer): Buffer {
  const buf = Buffer.alloc(4 + publicKeyRaw.length);
  buf.writeUInt16BE(flags, 0);
  buf.writeUInt8(3, 2); // protocol = 3 (DNSSEC)
  buf.writeUInt8(13, 3); // algorithm = ECDSAP256SHA256
  publicKeyRaw.copy(buf, 4);
  return buf;
}

/**
 * Build a DS response using dns-packet.
 */
async function buildDSResponse(
  queryBuf: Buffer,
  zone: string,
): Promise<DohQueryResult> {
  const dnsPacket = ((await import("dns-packet" as any)) as any).default;
  const txId = parseTxId(queryBuf);
  const qname = parseQueryName(queryBuf);
  const isAuth = await isAuthoritative(qname);

  if (!isAuth) {
    const buf = dnsPacket.encode({
      type: "response",
      id: txId,
      flags: dnsPacket.AUTHORITATIVE_ANSWER,
      questions: [{ type: "DS", name: qname, class: "IN" }],
      authorities: [buildSoaForDnsPacket(zone)],
    });
    return { buffer: buf, minTtl: TTL_SOA, rcode: 0 };
  }

  const keys = await getOrCreateKeys(zone);
  if (!keys) {
    return buildServfailResponse(txId);
  }

  const dsData = makeDS(keys.ksk);

  // Sign DS record with ZSK (DS is a regular zone record, signed by ZSK)
  const dsRdata = buildDSRdata(dsData);
  const rrsig = signRRset(
    "DS",
    RRTYPE_DS,
    zone,
    TTL_NS,
    [dsRdata],
    keys.zsk.privateKeyPem,
    keys.zsk.keyTag,
    zone,
  );

  const buf = dnsPacket.encode({
    type: "response",
    id: txId,
    flags: dnsPacket.AUTHORITATIVE_ANSWER | dnsPacket.AUTHENTIC_DATA,
    questions: [{ type: "DS", name: zone, class: "IN" }],
    answers: [
      { type: "DS", name: zone, ttl: TTL_NS, data: dsData },
      { type: "RRSIG", name: zone, ttl: TTL_NS, data: rrsig },
    ],
  });

  return { buffer: buf, minTtl: TTL_NS, rcode: 0 };
}

/** Build DS RDATA: keyTag(2) + algorithm(1) + digestType(1) + digest(32) */
function buildDSRdata(ds: {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: Buffer;
}): Buffer {
  const buf = Buffer.alloc(4 + ds.digest.length);
  buf.writeUInt16BE(ds.keyTag, 0);
  buf.writeUInt8(ds.algorithm, 2);
  buf.writeUInt8(ds.digestType, 3);
  ds.digest.copy(buf, 4);
  return buf;
}

/**
 * Build an NSEC3PARAM response (used by validators to discover NSEC3 parameters).
 */
async function buildNsec3ParamResponse(
  queryBuf: Buffer,
  zone: string,
): Promise<DohQueryResult> {
  ((await import("dns-packet")).default);
  const txId = parseTxId(queryBuf);
  const salt = zoneSalt(zone);

  const rdata = nsec3ParamRdata(salt, NSEC3_ITERATIONS);
  await getOrCreateKeys(zone);


  // For now return as raw — dns-packet may not support NSEC3PARAM natively
  // So we build the wire format manually
  const buf = buildRawResponse(
    txId,
    zone,
    51 /* NSEC3PARAM */,
    rdata,
    0x8400 /* QR+AA */,
  );
  return { buffer: buf, minTtl: TTL_SOA, rcode: 0 };
}

/** Minimal SOA record for dns-packet format. */
function buildSoaForDnsPacket(zone: string): Record<string, unknown> {
  return {
    type: "SOA",
    name: zone,
    ttl: TTL_SOA,
    data: {
      mname: PLATFORM_NS,
      rname: `hostmaster.${BASE_DOMAIN}`,
      serial: SERIAL,
      refresh: 10800,
      retry: 3600,
      expire: 604800,
      minimum: 3600,
    },
  };
}

/** Build a SERVFAIL response. */
function buildServfailResponse(txId: number): DohQueryResult {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(txId, 0);
  buf.writeUInt16BE(0x8182, 2); // QR=1, AA=1, RCODE=2 (SERVFAIL)
  return { buffer: buf, minTtl: 0, rcode: 2 };
}

/**
 * Build a minimal raw DNS wire response for record types dns-packet doesn't support natively.
 */
function buildRawResponse(
  txId: number,
  ownerName: string,
  rrType: number,
  rdata: Buffer,
  flags: number,
): Buffer {
  const ownerWire = encodeNameWire(ownerName);
  const rrHeader = Buffer.alloc(10);
  rrHeader.writeUInt16BE(rrType, 0);
  rrHeader.writeUInt16BE(1, 2); // CLASS IN
  rrHeader.writeUInt32BE(TTL_SOA, 4); // TTL
  rrHeader.writeUInt16BE(rdata.length, 8);

  const dnsHeader = Buffer.alloc(12);
  dnsHeader.writeUInt16BE(txId, 0);
  dnsHeader.writeUInt16BE(flags, 2);
  dnsHeader.writeUInt16BE(0, 4); // QDCOUNT=0
  dnsHeader.writeUInt16BE(1, 6); // ANCOUNT=1
  dnsHeader.writeUInt16BE(0, 8); // NSCOUNT=0
  dnsHeader.writeUInt16BE(0, 10); // ARCOUNT=0

  return Buffer.concat([dnsHeader, ownerWire, rrHeader, rdata]);
}

/**
 * Add RRSIG records to a dns2 wire response for any answered RRsets.
 * Parses the wire response, signs each answer RRset, and re-encodes.
 */
async function addDNSSECSignatures(
  wireResponse: Buffer,
  zone: string,
  qname: string,
): Promise<Buffer> {
  const dnsPacket = await import("dns-packet");
  let parsed: Record<string, unknown>;
  try {
    parsed = dnsPacket.decode(wireResponse);
  } catch {
    return wireResponse; // Can't parse — return as-is
  }

  const keys = await getOrCreateKeys(zone);
  if (!keys) return wireResponse;

  const { zsk } = keys;
  const rrsigs: Record<string, unknown>[] = [];

  // Group answers by numeric type code
  // dns-packet returns rr.type as a string (e.g. 'A', 'MX') not a number
  const byType = new Map<number, any[]>();
  for (const rr of parsed.answers ?? []) {
    const raw = rr.type;
    const rrTypeNum =
      typeof raw === "number"
        ? raw
        : (TYPE_NUMS[String(raw).toUpperCase()] ?? parseInt(raw, 10));
    if (!isFinite(rrTypeNum) || rrTypeNum <= 0) continue;
    if (!byType.has(rrTypeNum)) byType.set(rrTypeNum, []);
    byType.get(rrTypeNum)!.push(rr);
  }

  for (const [rrTypeNum, rrs] of byType) {
    const rdatas = rrs
      .map((rr: Record<string, unknown>) => {
        // dns-packet decoded records have a 'data' field
        // We need to convert back to rdata buffer for signing
        return rrdataFromDnsPacket(rrTypeNum, rr.data ?? rr);
      })
      .filter((r: Buffer | null) => r !== null) as Buffer[];

    if (rdatas.length === 0) continue;

    const typeName = TYPE_NAMES[rrTypeNum] ?? String(rrTypeNum);
    const ownerName = rrs[0].name ?? qname;
    const ttl = rrs[0].ttl ?? TTL_A;

    try {
      const rrsig = signRRset(
        typeName,
        rrTypeNum,
        ownerName,
        ttl,
        rdatas,
        zsk.privateKeyPem,
        zsk.keyTag,
        zone,
      );
      rrsigs.push({ type: "RRSIG", name: ownerName, ttl, data: rrsig });
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, typeName },
        "[DNSSEC] Failed to sign RRset",
      );
    }
  }

  if (rrsigs.length === 0) return wireResponse;

  // Re-encode with RRSIG records added
  try {
    const newPacket = {
      ...parsed,
      flags: (parsed.flags ?? 0) | dnsPacket.AUTHENTIC_DATA,
      answers: [...(parsed.answers ?? []), ...rrsigs],
    };
    return dnsPacket.encode(newPacket);
  } catch {
    return wireResponse;
  }
}

/** Convert a dns-packet decoded record's data to RDATA buffer for signing. */
function rrdataFromDnsPacket(
  rrType: number,
  data: Record<string, unknown>,
): Buffer | null {
  try {
    switch (rrType) {
      case 1: {
        // A
        const addr = typeof data === "string" ? data : data.address;
        return Buffer.from((addr as any).split(".").map(Number));
      }
      case 28: {
        // AAAA
        const addr = typeof data === "string" ? data : data.address;
        const groups = expandIPv6Full((addr as string));
        const buf = Buffer.alloc(16);
        for (let i = 0; i < 8; i++) buf.writeUInt16BE(groups[i], i * 2);
        return buf;
      }
      case 2:
      case 5: {
        // NS, CNAME
        const name =
          typeof data === "string" ? data : (data.ns ?? data.value ?? "");
        return encodeNameWire((name as string));
      }
      case 6: {
        // SOA
        const mname = encodeNameWire((data.mname ?? data.primary ?? "" as string));
        const rname = encodeNameWire((data.rname ?? data.admin ?? "" as string));
        const rest = Buffer.alloc(20);
        rest.writeUInt32BE((data.serial ?? 0 as number), 0);
        rest.writeUInt32BE((data.refresh ?? 0 as number), 4);
        rest.writeUInt32BE((data.retry ?? 0 as number), 8);
        rest.writeUInt32BE((data.expire ?? 0 as number), 12);
        rest.writeUInt32BE((data.minimum ?? 0 as number), 16);
        return Buffer.concat([mname, rname, rest]);
      }
      case 15: {
        // MX
        const prio = Buffer.alloc(2);
        prio.writeUInt16BE((data.preference ?? data.priority ?? 10 as number), 0);
        const xchg = encodeNameWire((data.exchange ?? data.value ?? "" as string));
        return Buffer.concat([prio, xchg]);
      }
      case 16: {
        // TXT
        const str = Buffer.from(
          typeof data === "string" ? data : (data.data ?? data.value ?? ""),
        );
        const len = Buffer.alloc(1);
        len[0] = Math.min(str.length, 255);
        return Buffer.concat([len, str.slice(0, 255)]);
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * processQuery — DoH entry point.
 *
 * Accepts a raw DNS wire-format query (application/dns-message body),
 * runs it through the same authoritative handleRequest() pipeline used by
 * the UDP/TCP server, and returns a DohQueryResult.
 *
 * DNSSEC: when DNSSEC_ENABLED=true:
 *   - DNSKEY (type 48) queries → served with dns-packet, signed by KSK
 *   - DS     (type 43) queries → served with dns-packet, signed by ZSK
 *   - DO-bit queries           → RRSIG added to answer RRsets
 *
 * GeoDNS: when GEODNS_ENABLED=true:
 *   - A record answer IP is chosen based on client's geographic location
 *   - ECS (EDNS Client Subnet) is parsed from the query for accuracy
 *
 * The VPS proxy (AdGuard dnsproxy or the Node.js fallback) calls:
 *   POST https://max-booster.com/api/dns/query
 *   Content-Type: application/dns-message
 */
export async function processQuery(
  queryBuffer: Buffer,
  srcIp?: string,
): Promise<DohQueryResult> {
  let request: Record<string, unknown>;
  try {
    request = (Packet as any).parse(queryBuffer);
  } catch {
    // Malformed query — return a FORMERR response with zeroed header
    const servfail = Buffer.alloc(12);
    servfail.writeUInt16BE(0, 0);
    servfail.writeUInt16BE(0x8001, 2); // QR=1, RCODE=1 (FORMERR)
    return { buffer: servfail, minTtl: 0, rcode: 1 };
  }

  // Attach raw buffer + source IP to request for GeoDNS use in handleRequest
  (request as Record<string, unknown>)._rawBuffer = queryBuffer;
  (request as Record<string, unknown>)._srcIp = srcIp;

  // ── DNSSEC special query types (served directly, bypass dns2) ──────────────
  if (DNSSEC_ENABLED) {
    const qtype = parseQueryType(queryBuffer);
    const qname = parseQueryName(queryBuffer);
    const isBase = qname === BASE_DOMAIN || qname.endsWith(`.${BASE_DOMAIN}`);
    const zone = isBase ? BASE_DOMAIN : qname.split(".").slice(-2).join(".");

    if (qtype === 48 /* DNSKEY */) {
      try {
        return await buildDnskeyResponse(queryBuffer, zone);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[DNSSEC] DNSKEY response failed");
        return buildServfailResponse(parseTxId(queryBuffer));
      }
    }

    if (qtype === 43 /* DS */) {
      try {
        return await buildDSResponse(queryBuffer, zone);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[DNSSEC] DS response failed");
        return buildServfailResponse(parseTxId(queryBuffer));
      }
    }

    if (qtype === 51 /* NSEC3PARAM */) {
      try {
        return await buildNsec3ParamResponse(queryBuffer, zone);
      } catch (err) {
        logger.warn(
          { err: (err as Error).message },
          "[DNSSEC] NSEC3PARAM response failed",
        );
        return buildServfailResponse(parseTxId(queryBuffer));
      }
    }
  }

  // ── Regular query through dns2 pipeline ───────────────────────────────────
  const dobit = DNSSEC_ENABLED && parseDOBit(queryBuffer);

  return new Promise<DohQueryResult>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("DNS query timed out after 15 s")),
      15_000,
    );

    handleRequest(request, async (response: Record<string, unknown>) => {
      clearTimeout(timeout);
      try {
        // Serialize dns2 response to wire format
        let buffer: Buffer;
        if (typeof response.toBuffer === "function") {
          buffer = Buffer.from(response.toBuffer());
        } else {
          const wrapper = (Packet as any).createResponseFromRequest(request);
          wrapper.header.rcode = (response.header as any).rcode ?? 0;
          wrapper.header.aa = (response.header as any).aa ?? 0;
          wrapper.answers = response.answers || [];
          wrapper.authorities = response.authorities || [];
          wrapper.additionals = response.additionals || [];
          buffer = Buffer.from(wrapper.toBuffer());
          response = wrapper;
        }

        // ── Add DNSSEC RRSIG records when DO bit is set ───────────────────
        if (dobit) {
          try {
            const qname = parseQueryName(queryBuffer);
            const isBase =
              qname === BASE_DOMAIN || qname.endsWith(`.${BASE_DOMAIN}`);
            const zone = isBase
              ? BASE_DOMAIN
              : qname.split(".").slice(-2).join(".");
            buffer = await addDNSSECSignatures(buffer, zone, qname);
          } catch (err) {
            logger.warn(
              { err: (err as Error).message },
              "[DNSSEC] Signature addition failed (continuing without RRSIG)",
            );
          }
        }

        // ── Compute Cache-Control TTL (RFC 8484 §5.1) ────────────────────
        const allRRs: Record<string, unknown>[] = [
          ...(response.answers || []),
          ...(response.authorities || []),
        ];
        const positiveTtls = allRRs
          .map((rr: Record<string, unknown>) =>
            typeof rr.ttl === "number" ? rr?.ttl : 0,
          )
          .filter((t: number) => t > 0);
        const minTtl = positiveTtls?.length > 0 ? Math.min(...positiveTtls) : 0;

        const rcode: number = (response?.header as any)?.rcode ?? 0;

        resolve({ buffer, minTtl, rcode });
      } catch (err) {
        reject(err);
      }
    });
  });
}
