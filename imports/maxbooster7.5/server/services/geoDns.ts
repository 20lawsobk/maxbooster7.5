/**
 * Max Booster — GeoDNS Service
 *
 * Returns geo-targeted A records based on the DNS client's geographic location.
 * Integrates two standards:
 *
 * 1. EDNS Client Subnet (ECS, RFC 7871) — When a query comes through a
 *    centralized resolver like Google (8.8.8.8) or Cloudflare (1.1.1.1),
 *    the resolver embeds the end-user's subnet in OPT option code 8.
 *    We extract this to get the actual client location, not the resolver's.
 *
 * 2. MaxMind GeoLite2 .mmdb — A locally-hosted binary database mapping IP
 *    addresses to country/continent. No external API calls at query time;
 *    the database is read from disk and cached in memory.
 *
 * Region → IP mapping is configured via the REGION_MAP env var (JSON):
 *   REGION_MAP={"NA":"34.111.179.208","EU":"1.2.3.4","AS":"5.6.7.8","default":"34.111.179.208"}
 *
 * Continent codes (MaxMind): AF, AN, AS, EU, NA, OC, SA
 *
 * If GeoDNS is disabled (GEODNS_ENABLED != "true") or the database is not
 * found, falls back to DNS_SERVER_IP transparently.
 */

import path from "path";
import fs from "fs";
import { logger } from "../logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const GEODNS_ENABLED = process.env.GEODNS_ENABLED === "true";
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || "34.111.179.208";

/** Path to the GeoLite2-City.mmdb or GeoLite2-Country.mmdb database file */
const GEODB_PATH =
  process.env.GEODB_PATH ||
  path.join(process.cwd(), "data", "GeoLite2-Country.mmdb");

/**
 * Region map: continent code → server IP.
 * Loaded from REGION_MAP env var (JSON) or falls back to default.
 *
 * Example:
 *   REGION_MAP={"NA":"34.111.0.1","EU":"185.12.0.1","AS":"103.21.0.1","default":"34.111.179.208"}
 */
let regionMap: Record<string, string> = { default: DNS_SERVER_IP };
try {
  if (process.env.REGION_MAP) {
    regionMap = { ...regionMap, ...JSON.parse(process.env.REGION_MAP) };
  }
} catch {
  logger.info(
    "[GeoDNS] Invalid REGION_MAP JSON — using default IP for all regions",
  );
}

// ── MaxMind mmdb reader (lazy-loaded) ─────────────────────────────────────────

let geoReader: Record<string, unknown> | null = null;
let geoReaderLoading: Promise<unknown> | null = null;
/**
 * Monotonically incrementing generation counter.
 * Incremented by reloadGeoReader() before it starts a fresh open().
 * getGeoReader()'s async closure captures the generation at dispatch time and
 * only writes back to `geoReader` if the generation hasn't advanced — ensuring
 * a hot-swap that completes while an initial load is in-flight always wins.
 */
let geoReaderGeneration = 0;

async function getGeoReader(): Promise<unknown> {
  if (geoReader) return geoReader;

  // Deduplicate concurrent load attempts
  if (geoReaderLoading) return geoReaderLoading;

  if (!fs.existsSync(GEODB_PATH)) {
    logger.info(
      `[GeoDNS] Database not found at ${GEODB_PATH}. Run scripts/download-geodb.sh to enable GeoDNS.`,
    );
    return null;
  }

  const myGeneration = geoReaderGeneration;
  geoReaderLoading = (async () => {
    try {
      const { default: maxmind } = await import("maxmind");
      const reader = await maxmind.open(GEODB_PATH);
      // Only write back if no hot-swap happened while we were loading
      if (geoReaderGeneration === myGeneration) {
        geoReader = reader as unknown as Record<string, unknown>;
        logger.info(`[GeoDNS] GeoIP database loaded from ${GEODB_PATH}`);
      }
      return geoReader;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "[GeoDNS] Failed to open GeoIP database",
      );
      geoReaderLoading = null; // allow retry on next request
      return null;
    }
  })();

  return geoReaderLoading;
}

// ── IP classification ─────────────────────────────────────────────────────────

function isPrivateIP(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.20.") ||
    ip.startsWith("172.21.") ||
    ip.startsWith("172.22.") ||
    ip.startsWith("172.23.") ||
    ip.startsWith("172.24.") ||
    ip.startsWith("172.25.") ||
    ip.startsWith("172.26.") ||
    ip.startsWith("172.27.") ||
    ip.startsWith("172.28.") ||
    ip.startsWith("172.29.") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc00:") ||
    ip.startsWith("fd")
  );
}

// ── GeoIP lookup ──────────────────────────────────────────────────────────────

export interface GeoResult {
  continent?: string;
  country?: string;
  ip: string;
}

export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  const reader = await getGeoReader();
  if (!reader) return null;

  try {
    const result = (reader as any).get(ip);
    if (!result) return { ip };

    const continent = result.continent.code as string | undefined;
    const country = result.country.iso_code as string | undefined;
    return { continent, country, ip };
  } catch {
    return { ip };
  }
}

// ── Region selection ──────────────────────────────────────────────────────────

/**
 * Select the best server IP for a given geo result.
 * Priority: country match → continent match → 'default'
 */
export function selectRegionIp(geo: GeoResult): string {
  if (geo.country && regionMap[geo.country]) return regionMap[geo.country];
  if (geo.continent && regionMap[geo.continent])
    return regionMap[geo.continent];
  return regionMap["default"] ?? DNS_SERVER_IP;
}

// ── EDNS Client Subnet (ECS) parsing ─────────────────────────────────────────

export interface EcsInfo {
  ip: string;
  sourcePrefixLen: number;
  family: 1 | 2; // 1=IPv4, 2=IPv6
}

/**
 * Parse EDNS Client Subnet option (RFC 7871) from a raw DNS query buffer.
 *
 * OPT record wire format:
 *   name=0x00 | type=41(2) | class=udp_payload(2) | ttl=extended_rcode(4) | rdlen(2) | rdata
 *
 * RDATA options: option_code(2) + option_len(2) + option_data
 * ECS option code = 8
 * ECS data: family(2) + source_prefix_len(1) + scope_prefix_len(1) + address(variable)
 */
export function parseECS(queryBuf: Buffer): EcsInfo | null {
  try {
    let offset = 12; // skip DNS header

    // Skip question section
    const qdCount = queryBuf.readUInt16BE(4);
    for (let i = 0; i < qdCount; i++) {
      // Skip QNAME
      while (offset < queryBuf.length) {
        const len = queryBuf[offset++];
        if (len === 0) break;
        if ((len & 0xc0) === 0xc0) {
          offset++;
          break;
        } // pointer
        offset += len;
      }
      offset += 4; // QTYPE + QCLASS
    }

    // Skip answer + authority sections (qdCount handled, ancount/nscount from header)
    const anCount = queryBuf.readUInt16BE(6);
    const nsCount = queryBuf.readUInt16BE(8);
    const arCount = queryBuf.readUInt16BE(10);

    // Skip answers (qdCount is question count, not answers - use anCount + nsCount)
    const skipSections = anCount + nsCount;
    for (let i = 0; i < skipSections; i++) {
      offset = skipRR(queryBuf, offset);
      if (offset < 0) return null;
    }

    // Parse additional section looking for OPT record (type 41)
    for (let i = 0; i < arCount; i++) {
      const rrStart = offset;
      // Read name
      const nameResult = skipName(queryBuf, offset);
      if (!nameResult) return null;
      offset = nameResult;
      if (offset + 10 > queryBuf.length) return null;

      const rrType = queryBuf.readUInt16BE(offset);
      offset += 2;
      const qclass = queryBuf.readUInt16BE(offset);
      offset += 2;
      void qclass;
      const ttl = queryBuf.readUInt32BE(offset);
      offset += 4;
      void ttl;
      const rdlen = queryBuf.readUInt16BE(offset);
      offset += 2;
      const rdStart = offset;

      if (rrType === 41) {
        // OPT record
        // Parse RDATA options
        let optOffset = rdStart;
        const rdEnd = rdStart + rdlen;

        while (optOffset + 4 <= rdEnd) {
          const optCode = queryBuf.readUInt16BE(optOffset);
          optOffset += 2;
          const optLen = queryBuf.readUInt16BE(optOffset);
          optOffset += 2;

          if (optCode === 8 && optLen >= 4) {
            // ECS option
            const family = queryBuf.readUInt16BE(optOffset) as 1 | 2;
            const sourcePrefixLen = queryBuf.readUInt8(optOffset + 2);
            // scope prefix = optOffset + 3 (we don't use it for lookup)
            const addrBytes = queryBuf?.slice(optOffset + 4, optOffset + optLen);

            let ip: string;
            if (family === 1 && addrBytes?.length >= 1) {
              // IPv4: pad to 4 bytes
              const padded = Buffer?.alloc(4);
              addrBytes?.copy(padded, 0, 0, Math.min(addrBytes?.length, 4));
              ip = Array.from(padded).join(".");
              return { ip, sourcePrefixLen, family };
            } else if (family === 2 && addrBytes?.length >= 1) {
              // IPv6: pad to 16 bytes
              const padded = Buffer?.alloc(16);
              addrBytes?.copy(padded, 0, 0, Math.min(addrBytes?.length, 16));
              ip = Array.from({ length: 8 }, (_, j) =>
                padded?.readUInt16BE(j * 2).toString(16),
              ).join(":");
              return { ip, sourcePrefixLen, family };
            }
          }

          optOffset += optLen;
        }
      }

      offset = rdStart + rdlen;
      void rrStart;
    }

    return null;
  } catch {
    return null;
  }
}

/** Skip a DNS name at offset (handles pointers), returns new offset or null. */
function skipName(buf: Buffer, offset: number): number | null {
  while (offset < buf?.length) {
    const len = buf[offset];
    if (len === 0) return offset + 1;
    if ((len & 0xc0) === 0xc0) return offset + 2; // pointer
    offset += 1 + len;
  }
  return null;
}

/** Skip a full DNS RR, returns new offset or -1 on error. */
function skipRR(buf: Buffer, offset: number): number {
  const newOffset = skipName(buf, offset);
  if (newOffset === null) return -1;
  if (newOffset + 10 > buf?.length) return -1;
  const rdlen = buf?.readUInt16BE(newOffset + 8);
  return newOffset + 10 + rdlen;
}

// ── Main GeoDNS resolver ──────────────────────────────────────────────────────

/**
 * Resolve the best A record IP for a query, factoring in client geography.
 *
 * @param queryBuf  - raw DNS wire-format query (for ECS extraction)
 * @param srcIp     - source IP of the DNS client (resolver or VPS proxy)
 * @returns The best server IP to use as the A record answer
 */
export async function resolveGeoIP(
  queryBuf: Buffer,
  srcIp?: string,
): Promise<string> {
  if (!GEODNS_ENABLED) return DNS_SERVER_IP;

  // 1. Try EDNS Client Subnet first (more accurate than resolver IP)
  const ecs = parseECS(queryBuf);
  const lookupIp = ecs?.ip ?? srcIp;

  if (!lookupIp || isPrivateIP(lookupIp)) {
    return DNS_SERVER_IP; // Can't geo-route private/local IPs
  }

  // 2. GeoIP lookup
  const geo = await lookupGeo(lookupIp);

  // 3. Select region IP — fall back to default when geo is unavailable
  if (!geo) return DNS_SERVER_IP;
  const selectedIp = selectRegionIp(geo);

  if (selectedIp !== DNS_SERVER_IP) {
    logger.debug(
      {
        ip: lookupIp,
        continent: geo.continent,
        country: geo.country,
        selectedIp,
      },
      "[GeoDNS] Geo-routing query",
    );
  }

  return selectedIp;
}

// ── Hot-swap reload ───────────────────────────────────────────────────────────

/**
 * Reload the GeoIP database from disk without restarting the server.
 * Safe to call while DNS queries are in-flight — the old reader stays alive
 * until the new one is ready; only then is the module-level reference swapped.
 */
export async function reloadGeoReader(): Promise<boolean> {
  if (!fs.existsSync(GEODB_PATH)) {
    logger.warn(`[GeoDNS] reloadGeoReader: file not found at ${GEODB_PATH}`);
    return false;
  }
  // Advance generation BEFORE opening so any concurrent getGeoReader() load
  // in-flight will see the generation mismatch and skip writing back.
  const swapGeneration = ++geoReaderGeneration;
  geoReaderLoading = null; // cancel dedup so getGeoReader() won't wait on stale promise
  try {
    const { default: maxmind } = await import("maxmind");
    const newReader = await maxmind.open(GEODB_PATH);
    // Guard against two concurrent reloadGeoReader() calls racing each other
    if (geoReaderGeneration === swapGeneration) {
      geoReader = newReader as unknown as Record<string, unknown>;
      logger.info(`[GeoDNS] Hot-swap complete — new database loaded from ${GEODB_PATH}`);
      return true;
    } else {
      logger.info("[GeoDNS] Hot-swap superseded by a newer reload — discarding this reader");
      return false;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[GeoDNS] reloadGeoReader: failed to open new database");
    return false;
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getGeoDnsStatus(): {
  enabled: boolean;
  dbLoaded: boolean;
  dbPath: string;
  dbAgeDays: number | null;
  dbModifiedAt: string | null;
  regionMap: Record<string, string>;
} {
  let dbAgeDays: number | null = null;
  let dbModifiedAt: string | null = null;
  try {
    if (fs.existsSync(GEODB_PATH)) {
      const { mtimeMs } = fs.statSync(GEODB_PATH);
      dbModifiedAt = new Date(mtimeMs).toISOString();
      dbAgeDays = Math.floor((Date.now() - mtimeMs) / 86_400_000);
    }
  } catch {
    /* non-critical */
  }
  return {
    enabled: GEODNS_ENABLED,
    dbLoaded: geoReader !== null,
    dbPath: GEODB_PATH,
    dbAgeDays,
    dbModifiedAt,
    regionMap,
  };
}
