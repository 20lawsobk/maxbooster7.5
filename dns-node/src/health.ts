/**
 * dns-node — Minimal HTTP Health + Metrics Server.
 *
 * Pure node:http, no Express, no frameworks.
 *
 * Routes:
 *   GET  /health        → { ok, role, port, domain, uptime, queries, version }
 *   GET  /metrics       → plain-text Prometheus-style metrics
 *   POST /reload        → reload zone from disk (for CI/CD push)
 *   GET  /zone          → dump current compiled zone as JSON (for zone sync)
 *   GET  /ds-record     → DS record details (paste into registrar panel)
 *
 * BGP route hook (when ANYCAST0_IF env var is set):
 *   If consecutive health failures ≥ BGP_FAIL_THRESHOLD → ip link set anycast0 down
 *   On recovery → ip link set anycast0 up
 */

import http       from 'node:http';
import { execSync } from 'node:child_process';
import { getQueryCount, getUptimeSeconds, isDnsRunning } from './server.js';
import { reloadZone, getDomain } from './zone.js';
import { getDSRecord, getKsk, getZsk } from './dnssec.js';

// ── Config ─────────────────────────────────────────────────────────────────

const HEALTH_PORT      = parseInt(process.env.HEALTH_PORT   || '5380');
const HEALTH_HOST      = process.env.HEALTH_HOST             || '0.0.0.0';
const ROLE             = process.env.DNS_SERVER_ROLE          || 'ns1';
const DNS_PORT         = parseInt(process.env.DNS_PORT        || '5353');
const VERSION          = '3.0.0';
const BGP_IF           = process.env.ANYCAST0_IF              || 'anycast0';
const BGP_FAIL_THRESH  = parseInt(process.env.BGP_FAIL_THRESH || '3');
const BGP_ENABLED      = process.env.BGP_ENABLED              === 'true';

// ── State ──────────────────────────────────────────────────────────────────

let consecutiveFailures = 0;
let bgpRouteActive      = true;

// ── BGP route management ───────────────────────────────────────────────────

function setAnycastRoute(up: boolean): void {
  if (!BGP_ENABLED) return;
  try {
    execSync(`ip link set ${BGP_IF} ${up ? 'up' : 'down'}`, { timeout: 5000 });
    bgpRouteActive = up;
    console.log(`[BGP] anycast0 ${up ? 'UP' : 'DOWN'} — route ${up ? 'advertised' : 'withdrawn'}`);
  } catch {
    // Not running as root / interface doesn't exist — expected in dev
  }
}

function checkBgpHealth(healthy: boolean): void {
  if (!BGP_ENABLED) return;
  if (healthy) {
    if (!bgpRouteActive) {
      consecutiveFailures = 0;
      setAnycastRoute(true);
    }
  } else {
    consecutiveFailures++;
    if (consecutiveFailures >= BGP_FAIL_THRESH && bgpRouteActive) {
      console.warn(`[BGP] ${BGP_FAIL_THRESH} consecutive failures — withdrawing anycast route`);
      setAnycastRoute(false);
    }
  }
}

// ── Request handler ────────────────────────────────────────────────────────

function respond(res: http.ServerResponse, status: number, body: string, ct = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': ct, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url    = new URL(req.url ?? '/', `http://localhost`);
  const method = req.method ?? 'GET';

  // ── GET /health ────────────────────────────────────────────────────────────
  if (url.pathname === '/health' && method === 'GET') {
    const ok      = isDnsRunning();
    checkBgpHealth(ok);

    respond(res, ok ? 200 : 503, JSON.stringify({
      ok,
      role:    ROLE,
      port:    DNS_PORT,
      domain:  getDomain(),
      uptime:  Math.floor(getUptimeSeconds()),
      queries: getQueryCount(),
      version: VERSION,
      bgp:     BGP_ENABLED ? { active: bgpRouteActive, failures: consecutiveFailures } : undefined,
    }));
    return;
  }

  // ── GET /metrics ───────────────────────────────────────────────────────────
  if (url.pathname === '/metrics' && method === 'GET') {
    const lines = [
      `# HELP dns_queries_total Total DNS queries handled`,
      `# TYPE dns_queries_total counter`,
      `dns_queries_total{role="${ROLE}"} ${getQueryCount()}`,
      `# HELP dns_uptime_seconds DNS server uptime in seconds`,
      `# TYPE dns_uptime_seconds gauge`,
      `dns_uptime_seconds{role="${ROLE}"} ${getUptimeSeconds().toFixed(2)}`,
      `# HELP dns_server_up 1 if DNS server is running`,
      `# TYPE dns_server_up gauge`,
      `dns_server_up{role="${ROLE}"} ${isDnsRunning() ? 1 : 0}`,
    ];
    respond(res, 200, lines.join('\n'), 'text/plain');
    return;
  }

  // ── POST /reload ───────────────────────────────────────────────────────────
  if (url.pathname === '/reload' && method === 'POST') {
    try {
      reloadZone();
      respond(res, 200, JSON.stringify({ ok: true, message: 'Zone reloaded from disk' }));
    } catch (err: any) {
      respond(res, 500, JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // ── GET /ds-record ─────────────────────────────────────────────────────────
  if (url.pathname === '/ds-record' && method === 'GET') {
    const ksk = getKsk();
    const zsk = getZsk();
    const ds  = getDSRecord(getDomain());

    if (!ksk || !ds) {
      respond(res, 503, JSON.stringify({ ok: false, error: 'DNSSEC not initialized' }));
      return;
    }

    respond(res, 200, JSON.stringify({
      ok: true,
      kskTag: ksk.keyTag,
      zskTag: zsk?.keyTag,
      dsRecord: {
        keyTag:     ksk.keyTag,
        algorithm:  ksk.algorithm,
        digestType: 2,
        digest:     ds.rdata.slice(4).toString('hex'),
      },
      registrarFormat: `${getDomain()} IN DS ${ksk.keyTag} ${ksk.algorithm} 2 ${ds.rdata.slice(4).toString('hex')}`,
    }));
    return;
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  respond(res, 404, JSON.stringify({ error: 'Not found' }));
}

// ── Start ──────────────────────────────────────────────────────────────────

export function startHealthServer(): void {
  const server = http.createServer(handler);
  server.listen(HEALTH_PORT, HEALTH_HOST, () => {
    console.log(`[Health] HTTP server on ${HEALTH_HOST}:${HEALTH_PORT} (role=${ROLE})`);
  });
  server.on('error', (err) => {
    console.error(`[Health] Server error: ${err.message}`);
  });
}
