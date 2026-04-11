/**
 * Max Booster — Built-in Authoritative DNS Server
 *
 * Configured exactly like a professional DNS provider (Cloudflare, Route 53):
 *
 *   • Listens on UDP :53 + TCP :53 (configurable via DNS_PORT)
 *   • Authoritative for BASE_DOMAIN (maxboostermusic.com) AND any custom domain
 *     that a user has claimed/pointed here (stored in storefrontDomains table)
 *   • Dual nameservers: ns1 + ns2 both at DNS_SERVER_IP (RFC 2182 compliance)
 *   • Wildcard A records: *.maxboostermusic.com → DNS_SERVER_IP
 *   • Custom domains: resolved to DNS_SERVER_IP once user points NS here
 *   • SOA with proper refresh/retry/expire/minimum per RFC 1912 best-practices
 *   • Non-authoritative queries forwarded upstream (8.8.8.8)
 *
 * To activate for a custom domain (e.g. b-lawzmusicbeats.com):
 *   1. User claims the domain inside Max Booster (StorefrontBuilder)
 *   2. User goes to their registrar and sets nameservers to:
 *        ns1.maxboostermusic.com
 *        ns2.maxboostermusic.com
 *   3. DNS propagates (up to 48 h). The domain then resolves here automatically.
 *
 * Glue records needed at the maxboostermusic.com registrar:
 *   A  ns1.maxboostermusic.com → DNS_SERVER_IP
 *   A  ns2.maxboostermusic.com → DNS_SERVER_IP
 *   NS maxboostermusic.com     → ns1.maxboostermusic.com
 *   NS maxboostermusic.com     → ns2.maxboostermusic.com
 */

import dns2 from 'dns2';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { storefrontDomains } from '@shared/schema';
import { logger } from '../logger.js';

const {
  Packet,
  createServer,
  UDPClient,
} = dns2 as any;

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'maxboostermusic.com').toLowerCase();
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || '34.68.76.67';
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

// ─── DNS record builders ──────────────────────────────────────────────────────

/** SOA record — identical structure to Cloudflare's SOA for custom zones */
function makeSOA(zone: string) {
  return {
    name:       zone,
    type:       Packet.TYPE.SOA,
    class:      Packet.CLASS.IN,
    ttl:        TTL_SOA,
    primary:    `ns1.${BASE_DOMAIN}`,
    admin:      `hostmaster.${BASE_DOMAIN}`,
    serial:     SERIAL,
    refresh:    10800,   // 3 h  (Cloudflare default)
    retry:      3600,    // 1 h
    expiration: 604800,  // 7 days
    minimum:    3600,    // negative-cache TTL (RFC 2308)
  };
}

/** Two NS records (ns1 + ns2) — RFC 2182 requires at least 2 nameservers */
function makeNSRecords(zone: string) {
  return [
    {
      name: zone, type: Packet.TYPE.NS, class: Packet.CLASS.IN,
      ttl: TTL_NS, ns: `ns1.${BASE_DOMAIN}`,
    },
    {
      name: zone, type: Packet.TYPE.NS, class: Packet.CLASS.IN,
      ttl: TTL_NS, ns: `ns2.${BASE_DOMAIN}`,
    },
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
  // For *.maxboostermusic.com → zone is BASE_DOMAIN
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

    case Packet.TYPE.ANY:
      response.answers.push(makeA(name, DNS_SERVER_IP));
      response.answers.push(makeSOA(zone));
      makeNSRecords(zone).forEach(r => response.answers.push(r));
      break;

    case Packet.TYPE.SOA:
      response.answers.push(makeSOA(zone));
      break;

    case Packet.TYPE.NS:
      makeNSRecords(zone).forEach(r => response.answers.push(r));
      // Glue A records so resolvers can find the nameservers without a loop
      response.additionals.push(makeA(`ns1.${BASE_DOMAIN}`, DNS_SERVER_IP));
      response.additionals.push(makeA(`ns2.${BASE_DOMAIN}`, DNS_SERVER_IP));
      break;

    case Packet.TYPE.AAAA:
    case Packet.TYPE.MX:
    case Packet.TYPE.TXT:
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
        logger.info(`[DNS] 📋 NS records: ns1.${BASE_DOMAIN} + ns2.${BASE_DOMAIN} → ${DNS_SERVER_IP}`);
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
