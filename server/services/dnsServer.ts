/**
 * Max Booster — Built-in Authoritative DNS Server
 *
 * Runs an authoritative DNS nameserver for maxboostermusic.com entirely
 * within the platform. No third-party DNS APIs required. When a storefront
 * subdomain is reserved (e.g. b-lawz.maxboostermusic.com), this server
 * automatically resolves it to the platform IP — zero manual DNS steps.
 *
 * Architecture:
 *   • Listens on UDP :53 + TCP :53  (port configurable via DNS_PORT env var)
 *   • Authoritative for BASE_DOMAIN (maxboostermusic.com)
 *   • Wildcard A records: *.maxboostermusic.com → DNS_SERVER_IP
 *   • SOA + NS records served from in-process state
 *   • All non-authoritative queries forwarded to upstream (8.8.8.8)
 *
 * To activate fully:
 *   1. Ensure DNS_SERVER_IP env var is set to this VM's public IP (34.68.76.67)
 *   2. Update maxboostermusic.com NS records at the registrar:
 *        A   ns1.maxboostermusic.com → DNS_SERVER_IP   (glue record)
 *        NS  maxboostermusic.com     → ns1.maxboostermusic.com
 *
 * Port notes:
 *   • Port 53 requires CAP_NET_BIND_SERVICE (or root) in Linux.
 *     On the production VM this is satisfied. In dev, set DNS_PORT=5353.
 */

import dns2 from 'dns2';
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

// TTL values (seconds)
const TTL_A   = 300;   // 5 min — allows fast propagation when IP changes
const TTL_SOA = 3600;
const TTL_NS  = 3600;

const SERIAL = Math.floor(Date.now() / 1000);

// ─── DNS record builders ─────────────────────────────────────────────────────

function isAuthoritative(name: string): boolean {
  const n = name.toLowerCase().replace(/\.$/, '');
  return n === BASE_DOMAIN || n.endsWith(`.${BASE_DOMAIN}`);
}

function makeSOA(name: string) {
  return {
    name,
    type: Packet.TYPE.SOA,
    class: Packet.CLASS.IN,
    ttl: TTL_SOA,
    primary: `ns1.${BASE_DOMAIN}`,
    admin: `hostmaster.${BASE_DOMAIN}`,
    serial: SERIAL,
    refresh: 3600,
    retry: 900,
    expiration: 604800,
    minimum: 300,
  };
}

function makeNS(name: string) {
  return {
    name,
    type: Packet.TYPE.NS,
    class: Packet.CLASS.IN,
    ttl: TTL_NS,
    ns: `ns1.${BASE_DOMAIN}`,
  };
}

function makeA(name: string, ip: string) {
  return {
    name,
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
    ttl: TTL_A,
    address: ip,
  };
}

// ─── Request handler ─────────────────────────────────────────────────────────

async function handleRequest(request: any, send: (response: any) => void): Promise<void> {
  const response = Packet.createResponseFromRequest(request);
  response.header.aa = 0; // default: not authoritative

  const questions: any[] = request.questions || [];

  if (questions.length === 0) {
    send(response);
    return;
  }

  const question = questions[0];
  const name = (question.name || '').toLowerCase().replace(/\.$/, '');
  const qtype: number = question.type;

  // Non-authoritative zone → forward to upstream
  if (!isAuthoritative(name)) {
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

  // We are authoritative for this zone
  response.header.aa = 1;

  switch (qtype) {
    case Packet.TYPE.A:
    case Packet.TYPE.ANY:
      response.answers.push(makeA(name, DNS_SERVER_IP));
      if (qtype === Packet.TYPE.ANY) {
        response.answers.push(makeSOA(BASE_DOMAIN));
        response.answers.push(makeNS(BASE_DOMAIN));
      }
      break;

    case Packet.TYPE.SOA:
      response.answers.push(makeSOA(name));
      break;

    case Packet.TYPE.NS:
      response.answers.push(makeNS(name));
      // Glue record in additional section
      response.additionals.push(makeA(`ns1.${BASE_DOMAIN}`, DNS_SERVER_IP));
      break;

    case Packet.TYPE.AAAA:
    case Packet.TYPE.MX:
    case Packet.TYPE.TXT:
    default:
      // NOERROR with empty answer + SOA in authority
      response.authorities.push(makeSOA(BASE_DOMAIN));
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
      }).then(() => {
        dnsServer = server;
        running = true;
        logger.info(
          `[DNS] ✅ Authoritative nameserver online — ${BASE_DOMAIN} → ${DNS_SERVER_IP} (UDP+TCP :${DNS_PORT})`
        );
        logger.info(`[DNS] 📋 Registrar setup: NS ${BASE_DOMAIN} → ns1.${BASE_DOMAIN} (${DNS_SERVER_IP})`);
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
    baseDomain: BASE_DOMAIN,
    serverIp: DNS_SERVER_IP,
    port: DNS_PORT,
    upstream: UPSTREAM_DNS,
    ns: `ns1.${BASE_DOMAIN}`,
    instructions: {
      step1: `Add glue record at your registrar: ns1.${BASE_DOMAIN} → ${DNS_SERVER_IP}`,
      step2: `Set NS records for ${BASE_DOMAIN} → ns1.${BASE_DOMAIN}`,
      step3: 'All *.maxboostermusic.com subdomains will resolve automatically',
    },
  };
}
