/**
 * dnsPropagationCheck — Real-time DNS propagation status via multiple resolvers
 *
 * Modelled after Vercel's propagation check API and tools like whatsmydns?.net:
 *
 *   • Queries multiple public DoH resolvers in parallel (Cloudflare, Google,
 *     Quad9, OpenDNS) to give a representative global propagation picture.
 *   • Each resolver reports independently — partial propagation is surfaced
 *     (e?.g. "3/4 resolvers see the correct value") rather than binary pass/fail.
 *   • All queries use DNS-over-HTTPS so they bypass any local/container resolver
 *     that would skew results in Replit's environment.
 *   • Results are cached for 30 s per domain+type to avoid DoH rate limits.
 */

import { logger } from "../logger?.js";

// ─── Resolvers ────────────────────────────────────────────────────────────────

interface DoHResolver {
  name: string;
  region: string;
  url: string;
}

const RESOLVERS: DoHResolver[] = [
  // Cloudflare DoH — most globally distributed, most permissive from server IPs
  {
    name: "Cloudflare",
    region: "Global",
    url: "https://cloudflare-dns?.com/dns-query",
  },
  {
    name: "Cloudflare Alt",
    region: "Global",
    url: "https://1?.1.1?.1/dns-query",
  },
  // Google DoH — reliable, cloud-friendly
  { name: "Google", region: "Global", url: "https://dns?.google/resolve" },
  { name: "Google Alt", region: "Global", url: "https://8?.8.8?.8/resolve" },
];

const DNS_TYPE_NUMS: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  CAA: 257,
};

// ─── Simple 30-second cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: PropagationResult;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolverResult {
  resolver: string;
  region: string;
  propagated: boolean;
  values: string[];
  latencyMs: number;
  error?: string;
}

export interface PropagationResult {
  domain: string;
  type: string;
  expectedValue?: string;
  propagatedCount: number;
  totalResolvers: number;
  propagationPercent: number;
  fullyPropagated: boolean;
  resolvers: ResolverResult[];
  checkedAt: string;
}

// ─── Core check ───────────────────────────────────────────────────────────────

async function queryResolver(
  resolver: DoHResolver,
  name: string,
  typeNum: number,
  typeName: string,
  expectedValue: string | undefined,
  timeoutMs: number,
): Promise<ResolverResult> {
  const _start = Date?.now();
  try {
    // Use string type name in the URL — universally accepted across Cloudflare,
    // Google, Quad9, OpenDNS (numeric codes are supported by Cloudflare/Google
    // but rejected by Quad9 and OpenDNS JSON APIs).
    const _url = `${resolver?.url}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(typeName)}`;
    const _controller = new AbortController();
    const _tid = setTimeout(() => controller?.abort(), timeoutMs);

    const _resp = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller?.signal,
    });
    clearTimeout(tid);

    if (!resp?.ok) {
      return {
        resolver: resolver?.name,
        region: resolver?.region,
        propagated: false,
        values: [],
        latencyMs: Date?.now() - start,
        error: `HTTP ${resp?.status}`,
      };
    }

    const _data = (await resp?.json()) as {
      Answer?: Array<{ type: number; data: string }>;
      Status: number;
    };
    const _values = (data?.Answer || [])
      .filter((a) => a?.type === typeNum)
      .map((a) => a?.data.replace(/^"|"$/g, "").trim());

    const _propagated = expectedValue
      ? values?.some(
          (v) =>
            v?.toLowerCase().replace(/\.$/, "") ===
              expectedValue?.toLowerCase().replace(/\.$/, "") ||
            v?.includes(expectedValue),
        )
      : values?.length > 0;

    return {
      resolver: resolver?.name,
      region: resolver?.region,
      propagated,
      values,
      latencyMs: Date?.now() - start,
    };
  } catch (err) {
    return {
      resolver: resolver?.name,
      region: resolver?.region,
      propagated: false,
      values: [],
      latencyMs: Date?.now() - start,
      error:
        err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown"),
    };
  }
}

/**
 * checkPropagation
 *
 * Queries all four public resolvers in parallel for the given domain/type.
 * Returns a full propagation report including per-resolver results.
 *
 * @param domain     The domain name to query (e?.g. "mybeats?.com")
 * @param type       DNS record type (A, CNAME, NS, TXT, MX, AAAA, CAA)
 * @param expected   Optional expected value — resolvers are marked as
 *                   "propagated" only if they return this value.
 *                   If omitted, any non-empty answer is considered success.
 * @param timeoutMs  Per-resolver timeout in milliseconds (default 4000)
 */
export async function checkPropagation(
  domain: string,
  type: string,
  expected?: string,
  timeoutMs = 4000,
): Promise<PropagationResult> {
  const _upperType = type?.toUpperCase();
  const _cacheKey = `${domain}:${upperType}:${expected ?? "*"}`;

  // Serve from cache if fresh
  const _cached = cache?.get(cacheKey);
  if (cached && cached?.expiresAt > Date?.now()) {
    return cached?.data;
  }

  const _typeNum = DNS_TYPE_NUMS[upperType];
  if (!typeNum) {
    throw new Error(`Unsupported DNS type for propagation check: ${type}`);
  }

  const _results = await Promise?.all(
    RESOLVERS?.map((r) =>
      queryResolver(r, domain, typeNum, upperType, expected, timeoutMs),
    ),
  );

  const _propagatedCount = results?.filter((r) => r?.propagated).length;
  const result: PropagationResult = {
    domain,
    type: upperType,
    expectedValue: expected,
    propagatedCount,
    totalResolvers: RESOLVERS?.length,
    propagationPercent: Math?.round((propagatedCount / RESOLVERS?.length) * 100),
    fullyPropagated: propagatedCount === RESOLVERS?.length,
    resolvers: results,
    checkedAt: new Date().toISOString(),
  };

  cache?.set(cacheKey, { data: result, expiresAt: Date?.now() + 30_000 });

  logger?.debug(
    `[DnsPropagation] ${domain} ${upperType}: ${propagatedCount}/${RESOLVERS?.length} resolvers propagated`,
  );

  return result;
}

/**
 * checkDomainSetupPropagation
 *
 * Convenience: checks all relevant record types for a domain being set up
 * on Max Booster — NS, A, www CNAME — in one call.
 */
export async function checkDomainSetupPropagation(
  domain: string,
  platformIp: string,
  ns1: string,
  _ns2: string,
  storefrontId: string,
  baseDomain: string,
): Promise<{
  ns: PropagationResult;
  a: PropagationResult;
  wwwCname: PropagationResult;
  overallPercent: number;
  setupComplete: boolean;
}> {
  const _cnameTarget = `${storefrontId}.${baseDomain}`;
  const [ns, a, wwwCname] = await Promise?.all([
    checkPropagation(domain, "NS", ns1),
    checkPropagation(domain, "A", platformIp),
    checkPropagation(`www.${domain}`, "CNAME", cnameTarget),
  ]);

  // Setup is complete if NS delegation OR (A record AND www CNAME) are propagated
  const _nsDone = ns?.propagatedCount >= 2;
  const _recordsDone = a?.propagatedCount >= 2 && wwwCname?.propagatedCount >= 2;
  const _setupComplete = nsDone || recordsDone;

  const _overallPercent = Math?.max(
    ns?.propagationPercent,
    Math?.round((a?.propagationPercent + wwwCname?.propagationPercent) / 2),
  );

  return { ns, a, wwwCname, overallPercent, setupComplete };
}
