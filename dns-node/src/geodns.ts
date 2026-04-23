/**
 * dns-node — GeoDNS engine.
 *
 * Resolves DNS queries to geographically appropriate server IPs using:
 *   1. EDNS Client Subnet (RFC 7871) — extract real client IP from OPT option 8
 *   2. MaxMind GeoLite2-Country.mmdb — map IP → continent code
 *   3. REGION_MAP env var — map continent code → server IP
 *
 * Falls back to DNS_SERVER_IP when:
 *   - GEODNS_ENABLED != "true"
 *   - mmdb not found
 *   - IP is private / loopback
 *   - Continent not in region map
 */

import fs   from 'node:fs';
import path from 'node:path';

// ── Config ─────────────────────────────────────────────────────────────────

const GEODNS_ENABLED = process.env.GEODNS_ENABLED === 'true';
const DNS_SERVER_IP  = process.env.DNS_SERVER_IP  || '34.117.33.233';
const GEODB_PATH     = process.env.GEODB_PATH     ||
  path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');

let regionMap: Record<string, string> = { default: DNS_SERVER_IP };
try {
  if (process.env.REGION_MAP) {
    regionMap = { ...regionMap, ...JSON.parse(process.env.REGION_MAP) };
  }
} catch {
  console.warn('[GeoDNS] Invalid REGION_MAP JSON — using single IP for all regions');
}

// ── mmdb reader (lazy-loaded) ──────────────────────────────────────────────

let reader: any   = null;
let loading: Promise<any> | null = null;

async function getReader(): Promise<any> {
  if (reader) return reader;
  if (loading) return loading;

  if (!fs.existsSync(GEODB_PATH)) {
    console.info(`[GeoDNS] Database not found at ${GEODB_PATH}. GeoDNS disabled.`);
    return null;
  }

  loading = (async () => {
    try {
      const { default: maxmind } = await import('maxmind');
      reader = await maxmind.open(GEODB_PATH);
      console.info(`[GeoDNS] Loaded ${GEODB_PATH}`);
      return reader;
    } catch (err: any) {
      console.warn(`[GeoDNS] Failed to open mmdb: ${err.message}`);
      loading = null;
      return null;
    }
  })();

  return loading;
}

// ── IP helpers ─────────────────────────────────────────────────────────────

function isPrivate(ip: string): boolean {
  return (
    ip === '127.0.0.1'       ||
    ip === '::1'             ||
    ip.startsWith('10.')     ||
    ip.startsWith('192.168.')||
    ip.startsWith('172.') ||
    ip.startsWith('fc00:')   ||
    ip.startsWith('fe80:')
  );
}

// ── Lookup ─────────────────────────────────────────────────────────────────

export interface GeoResult {
  continent: string;
  country:   string;
  ip:        string;
}

export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  if (!GEODNS_ENABLED || isPrivate(ip)) return null;

  const r = await getReader();
  if (!r) return null;

  try {
    const record  = r.get(ip);
    const continent = record?.continent?.code      ?? 'default';
    const country   = record?.country?.iso_code    ?? '';
    return { continent, country, ip };
  } catch {
    return null;
  }
}

// ── Region IP selection ────────────────────────────────────────────────────

export function selectRegionIp(geo: GeoResult | null): string {
  if (!geo) return regionMap.default ?? DNS_SERVER_IP;
  return regionMap[geo.continent] ?? regionMap.default ?? DNS_SERVER_IP;
}

/** Resolve a geo-targeted IP for a given client IP address. */
export async function resolveGeoIP(clientIp: string): Promise<string> {
  if (!GEODNS_ENABLED) return DNS_SERVER_IP;
  const geo = await lookupGeo(clientIp);
  return selectRegionIp(geo);
}

/** Warm the database on startup. */
export async function warmGeoDb(): Promise<void> {
  if (!GEODNS_ENABLED) return;
  const r = await getReader();
  if (r) {
    const testGeo = await lookupGeo('8.8.8.8');
    console.info(`[GeoDNS] Warm — 8.8.8.8 → ${testGeo?.continent ?? 'n/a'}`);
  }
}

export function isGeoDnsEnabled(): boolean { return GEODNS_ENABLED; }
