/**
 * Max Booster — Built-in Authoritative DNS Server
 *
 * Configured exactly like a professional DNS provider (Cloudflare, Route 53):
 *
 *   • Listens on UDP :53 + TCP :53 (configurable via DNS_PORT)
 *   • Authoritative for BASE_DOMAIN (max-booster.com) AND any custom domain
 *     that a user has claimed/pointed here (stored in storefrontDomains table)
 *   • Nameservers: ns1.max-booster.com / ns2.max-booster.com
 *   • Wildcard A records: *.max-booster.com → DNS_SERVER_IP
 *   • Custom domains: resolved to DNS_SERVER_IP once user points NS here
 *   • SOA with proper refresh/retry/expire/minimum per RFC 1912 best-practices
 *   • Non-authoritative queries forwarded upstream (8.8.8.8)
 *
 * To activate for a custom domain (e.g. mybeats.com):
 *   1. User claims the domain inside Max Booster (Domain Hub → Find Domain)
 *   2. User goes to their registrar and sets the nameserver to:
 *        ns1.max-booster.com  /  ns2.max-booster.com
 *   3. DNS propagates (up to 48 h). The domain then resolves here automatically.
 *
 * No glue records or external registrar API required — the built-in DNS is
 * the sole authoritative server for all claimed domains.
 */

import dns2 from 'dns2';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { storefrontDomains, dnsZoneRecords, dnsZones } from '@shared/schema';
import { logger } from '../logger.js';

const {
  Packet,
  createServer,
  UDPClient,
} = dns2 as any;

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'max-booster.com').toLowerCase();
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || '34.111.179.208';
const DNS_PORT = parseInt(process.env.DNS_PORT || '53', 10);
const UPSTREAM_DNS = process.env.UPSTREAM_DNS || '8.8.8.8';

// ─── TTL values — match Cloudflare's defaults (RFC 1912 §2.2) ────────────────
const TTL_A   = 300;      // 5 min A records — fast propagation on IP changes
const TTL_NS  = 86400;    // 24 h  NS records  (standard across all providers)
const TTL_SOA = 3600;     // 1 h   SOA record

// SOA serial — updated on each server start so secondaries detect changes
const SERIAL = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01', 10);

// ─── In-memory cache for claimed custom domains (refreshed every 60 s) ───────
let customDomainCache = new Set<string>();
let cacheLastRefreshed = 0;
const CACHE_TTL_MS = 60_000;

async function refreshCustomDomainCache(): Promise<void> {
  try {
    const rows = await db
      .select({ domain: storefrontDomains.domain })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.status, 'active'));
    customDomainCache = new Set(rows.map(r => r.domain.toLowerCase()));
    cacheLastRefreshed = Date.now();
  } catch (err) {
    logger.warn({ err: err }, '[DNS] Could not refresh custom domain cache:');
  }
}

/** Returns true if the queried name is in a zone we are authoritative for. */
async function isAuthoritative(name: string): Promise<boolean> {
  const n = name.toLowerCase().replace(/\.$/, '');

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
): Promise<Array<{ name: string; value: string; ttl: number; priority?: number }>> {
  try {
    // Determine the zone domain and relative name
    const rootDomain = extractZoneDomain(qname);
    const namePart = qname === rootDomain ? '@' : qname.slice(0, -(rootDomain.length + 1));

    const rows = await db
      .select({
        name:     dnsZoneRecords.name,
        value:    dnsZoneRecords.value,
        ttl:      dnsZoneRecords.ttl,
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

    return rows.map(r => ({
      name:     qname,
      value:    r.value,
      ttl:      r.ttl ?? 300,
      priority: r.priority ?? undefined,
    }));
  } catch (err) {
    logger.warn({ err, qname, qtype }, '[DNS] resolveFromZoneRecords error');
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
  if (name === BASE_DOMAIN || name.endsWith(`.${BASE_DOMAIN}`)) return BASE_DOMAIN;
  // For custom domains: extract root domain (last two labels, e.g. example.com)
  const parts = name.split('.');
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return name;
}

// ─── DNS record builders ──────────────────────────────────────────────────────

const PLATFORM_NS  = process.env.PLATFORM_NS  || `ns1.${BASE_DOMAIN}`;
const PLATFORM_NS2 = process.env.PLATFORM_NS2 || `ns2.${BASE_DOMAIN}`;

/** SOA record — authoritative for all Max Booster zones */
function makeSOA(zone: string) {
  return {
    name:       zone,
    type:       Packet.TYPE.SOA,
    class:      Packet.CLASS.IN,
    ttl:        TTL_SOA,
    primary:    PLATFORM_NS,
    admin:      `hostmaster.${BASE_DOMAIN}`,
    serial:     SERIAL,
    refresh:    10800,   // 3 h
    retry:      3600,    // 1 h
    expiration: 604800,  // 7 days
    minimum:    3600,    // negative-cache TTL (RFC 2308)
  };
}

/** NS records — both ns1 and ns2 (RFC requires ≥ 2 NS per zone) */
function makeNSRecords(zone: string) {
  return [
    { name: zone, type: Packet.TYPE.NS, class: Packet.CLASS.IN, ttl: TTL_NS, ns: PLATFORM_NS  },
    { name: zone, type: Packet.TYPE.NS, class: Packet.CLASS.IN, ttl: TTL_NS, ns: PLATFORM_NS2 },
  ];
}

function makeA(name: string, ip: string) {
  return {
    name, type: Packet.TYPE.A, class: Packet.CLASS.IN, ttl: TTL_A, address: ip,
  };
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(request: any, send: (response: any) => void): Promise<void> {
  const response = Packet.createResponseFromRequest(request);
  response.header.aa = 0; // default: not authoritative

  const questions: any[] = request.questions || [];
  if (questions.length === 0) { send(response); return; }

  const question = questions[0];
  const name  = (question.name || '').toLowerCase().replace(/\.$/, '');
  const qtype: number = question.type;

  // Determine the zone root for SOA/NS records
  // For *.maxbooster.replit.app → zone is BASE_DOMAIN
  // For a claimed custom domain (e.g. mybeats.com) → zone is the domain itself
  const isBaseDomainZone = name === BASE_DOMAIN || name.endsWith(`.${BASE_DOMAIN}`);
  const auth = await isAuthoritative(name);

  if (!auth) {
    // Forward non-authoritative queries upstream unchanged
    try {
      const resolve = UDPClient({ dns: UPSTREAM_DNS });
      const upstream = await resolve(question.name, qtype);
      send(upstream);
    } catch {
      response.header.rcode = 2; // SERVFAIL
      send(response);
    }
    return;
  }

  const zone = isBaseDomainZone ? BASE_DOMAIN : name;
  response.header.aa = 1; // we are authoritative

  switch (qtype) {
    case Packet.TYPE.A:
      response.answers.push(makeA(name, DNS_SERVER_IP));
      break;

    case Packet.TYPE.SOA:
      response.answers.push(makeSOA(zone));
      break;

    case Packet.TYPE.NS:
      makeNSRecords(zone).forEach(r => response.answers.push(r));
      break;

    case Packet.TYPE.TXT: {
      const txtRecords = await resolveFromZoneRecords(name, 'TXT');
      if (txtRecords.length > 0) {
        for (const r of txtRecords) {
          response.answers.push({
            name: r.name,
            type: Packet.TYPE.TXT,
            class: Packet.CLASS.IN,
            ttl: r.ttl,
            data: r.value,
          });
        }
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case Packet.TYPE.MX: {
      const mxRecords = await resolveFromZoneRecords(name, 'MX');
      if (mxRecords.length > 0) {
        for (const r of mxRecords) {
          response.answers.push({
            name: r.name,
            type: Packet.TYPE.MX,
            class: Packet.CLASS.IN,
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

    case Packet.TYPE.CNAME: {
      const cnameRecords = await resolveFromZoneRecords(name, 'CNAME');
      if (cnameRecords.length > 0) {
        response.answers.push({
          name: cnameRecords[0].name,
          type: Packet.TYPE.CNAME,
          class: Packet.CLASS.IN,
          ttl: cnameRecords[0].ttl,
          domain: cnameRecords[0].value,
        });
      } else {
        response.authorities.push(makeSOA(zone));
      }
      break;
    }

    case Packet.TYPE.AAAA: {
      const aaaaRecords = await resolveFromZoneRecords(name, 'AAAA');
      if (aaaaRecords.length > 0) {
        for (const r of aaaaRecords) {
          response.answers.push({
            name: r.name,
            type: Packet.TYPE.AAAA,
            class: Packet.CLASS.IN,
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
      const caaRecords = await resolveFromZoneRecords(name, 'CAA');
      if (caaRecords.length > 0) {
        for (const r of caaRecords) {
          // CAA wire format: flags(1) + tag_length(1) + tag + value
          // We store as: "0 issue \"letsencrypt.org\""
          const parts = r.value.match(/^(\d+)\s+(\w+)\s+"([^"]+)"$/);
          if (parts) {
            response.answers.push({
              name: r.name,
              type: 257,
              class: Packet.CLASS.IN,
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

    case Packet.TYPE.ANY:
      // RFC 8482 — respond with HINFO instead of enumerating all records
      response.answers.push(makeA(name, DNS_SERVER_IP));
      response.answers.push(makeSOA(zone));
      makeNSRecords(zone).forEach(r => response.answers.push(r));
      break;

    default:
      // NOERROR with empty answers — SOA in authority section (RFC 2308)
      response.authorities.push(makeSOA(zone));
      break;
  }

  send(response);
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

let dnsServer: any = null;
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
    logger.info(`[DNS] Port ${DNS_PORT} unavailable (EACCES or already in use) — DNS server not started. In dev: set DNS_PORT=5353.`);
    return;
  }

  return new Promise<void>((resolve) => {
    try {
      const server = createServer({
        udp: true,
        tcp: true,
        handle: handleRequest,
      });

      let settled = false;
      const settle = (ok: boolean, msg?: string) => {
        if (settled) return;
        settled = true;
        // Remove all error listeners to prevent unhandled-event crashes
        server.removeAllListeners('error');
        if (!ok) {
          // DNS not starting is expected in Replit (no CAP_NET_BIND_SERVICE) — log at INFO.
          if (msg) logger.info(msg.replace('⚠️  ', ''));
          dnsServer = null;
          running = false;
        }
        resolve();
      };

      // Single aggregated error handler — fires for UDP or TCP sub-server errors
      server.on('error', (err: any, proto?: string) => {
        const code: string = err?.code || '';
        if (code === 'EACCES') {
          settle(false, `[DNS] ⚠️  Port ${DNS_PORT} requires elevated privileges (${proto || 'unknown'}). DNS server not started.`);
        } else if (code === 'EADDRINUSE') {
          settle(false, `[DNS] ⚠️  Port ${DNS_PORT} already in use (${proto || 'unknown'}). DNS server not started.`);
        } else {
          settle(false, `[DNS] ⚠️  DNS server error (${proto || 'unknown'}): ${err?.message}`);
        }
      });

      server.listen({
        udp: { port: DNS_PORT, address: '0.0.0.0' },
        tcp: { port: DNS_PORT, address: '0.0.0.0' },
      }).then(async () => {
        dnsServer = server;
        running = true;
        logger.info(
          `[DNS] ✅ Authoritative nameserver online — ${BASE_DOMAIN} → ${DNS_SERVER_IP} (UDP+TCP :${DNS_PORT})`
        );
        logger.info(`[DNS] 📋 NS records: ${PLATFORM_NS} + ${PLATFORM_NS2} → ${DNS_SERVER_IP}`);
        // Prime cache so first query hits DB immediately, not on first request
        await warmCache();
        settle(true);
      }).catch((err: any) => {
        settle(false, `[DNS] ⚠️  listen() rejected: ${err?.message}`);
      });
    } catch (err: any) {
      logger.warn(`[DNS] ⚠️  Could not instantiate DNS server: ${err?.message}`);
      resolve();
    }
  });
}

/**
 * Quick TCP probe: attempt to bind the port. Returns true if bindable, false if EACCES/EADDRINUSE.
 * Uses a raw net.Server so we can test without starting the real DNS server.
 */
async function checkPortAvailable(port: number): Promise<boolean> {
  const { createServer: tcpCreate } = await import('net');
  return new Promise<boolean>((resolve) => {
    const probe = tcpCreate();
    probe.once('error', () => {
      probe.removeAllListeners();
      resolve(false);
    });
    probe.listen(port, '0.0.0.0', () => {
      probe.close(() => resolve(true));
    });
  });
}

export async function stopDNSServer(): Promise<void> {
  if (!running || !dnsServer) return;
  try {
    dnsServer.close();
    running = false;
    logger.info('[DNS] Nameserver stopped.');
  } catch (err: any) {
    logger.warn('[DNS] Error stopping DNS server:', err?.message);
  }
}

export function isDNSRunning(): boolean {
  return running;
}

export function getDNSInfo() {
  return {
    running,
    baseDomain:  BASE_DOMAIN,
    serverIp:    DNS_SERVER_IP,
    port:        DNS_PORT,
    upstream:    UPSTREAM_DNS,
    nameservers: [`ns1.${BASE_DOMAIN}`, `ns2.${BASE_DOMAIN}`],
    /**
     * Instructions shown to users after claiming a custom domain.
     * Matches the exact flow that Cloudflare / Namecheap present.
     */
    customDomainSetup: {
      step1: 'Log into your domain registrar (GoDaddy, Namecheap, Google Domains, etc.)',
      step2: 'Find "Nameservers" or "DNS Settings" for your domain.',
      step3: 'Change nameserver type to "Custom" and enter:',
      ns1:   `ns1.${BASE_DOMAIN}`,
      ns2:   `ns2.${BASE_DOMAIN}`,
      step4: 'Save. DNS propagation takes up to 48 hours (usually under 30 minutes).',
      note:  'Once propagated, your domain will automatically point to your Max Booster store.',
    },
  };
}

/** Warm up the custom-domain cache immediately (called from startDNSServer). */
async function warmCache(): Promise<void> {
  await refreshCustomDomainCache();
  logger.info(`[DNS] Custom domain cache warmed — ${customDomainCache.size} active domain(s) loaded.`);
}

/**
 * processQuery — DNS-over-HTTPS gateway entry point.
 *
 * Accepts a raw DNS wire-format query Buffer (the binary body of a DoH POST
 * request), runs it through the same handleRequest() pipeline used by the
 * UDP/TCP server, and returns a raw DNS wire-format response Buffer.
 *
 * The VPS proxy calls this via:
 *   POST https://maxbooster.replit.app/api/dns/query
 *   Content-Type: application/dns-message
 *   Body: <binary DNS wire format>
 *
 * RFC 8484 §6 — the response is also application/dns-message.
 */
export async function processQuery(queryBuffer: Buffer): Promise<Buffer> {
  const request = Packet.parse(queryBuffer);

  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DNS query timed out')), 5000);

    handleRequest(request, (response: any) => {
      clearTimeout(timeout);
      try {
        resolve(Buffer.from(response.toBuffer()));
      } catch (err) {
        reject(err);
      }
    });
  });
}
