/**
 * SSRF-safe outbound URL fetcher — shared utility.
 *
 * Any code that fetches an attacker-influenced URL (URL→content generation,
 * the advanced URL parser, autopilot link enrichment) MUST go through here.
 * Protection is enforced at connect time via a custom DNS lookup wired into
 * the http/https Agents, so it also closes the DNS-rebinding TOCTOU window
 * that a hostname-only pre-flight check would leave open.
 */

import axios, { type AxiosResponse } from "axios";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { lookup as dnsLookup, type LookupAddress } from "dns";
import { isIPv4 as netIsIPv4 } from "net";
import type { LookupFunction } from "net";

const PRIVATE_IPV4_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;

const PRIVATE_IPV6_RE = /^(::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe[89ab][0-9a-f]:|::$)/i;

/**
 * Return true if the given IP literal is private / reserved / loopback.
 * Handles plain IPv4, plain IPv6, bracket-quoted IPv6, and IPv4-mapped IPv6.
 */
export function isReservedIp(raw: string): boolean {
  let addr = raw.toLowerCase();

  if (addr.startsWith("[") && addr.endsWith("]")) {
    addr = addr.slice(1, -1);
  }

  if (addr.startsWith("::ffff:")) {
    const embedded = addr.slice(7);
    if (netIsIPv4(embedded)) {
      return embedded === "0.0.0.0" || PRIVATE_IPV4_RE.test(embedded);
    }
    // Condensed hex IPv4-mapped form — conservatively block.
    return true;
  }

  if (addr === "localhost" || addr === "0.0.0.0") return true;
  if (PRIVATE_IPV4_RE.test(addr)) return true;
  if (PRIVATE_IPV6_RE.test(addr)) return true;
  return false;
}

/** dns.lookup replacement that rejects private/reserved targets at connect time. */
const safeDnsLookup: LookupFunction = (hostname, _options, callback) => {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err, "", 4);
      return;
    }
    const addrs: LookupAddress[] = Array.isArray(addresses)
      ? addresses
      : [{ address: String(addresses), family: 4 }];

    for (const entry of addrs) {
      if (isReservedIp(entry.address)) {
        const ssrfErr = Object.assign(
          new Error(`SSRF blocked: ${entry.address} is a reserved address`),
          { code: "ECONNREFUSED" },
        ) as NodeJS.ErrnoException;
        callback(ssrfErr, "", entry.family);
        return;
      }
    }

    const first = addrs[0];
    callback(null, first.address, first.family);
  });
};

const safeHttpAgent = new HttpAgent({ lookup: safeDnsLookup, keepAlive: false });
const safeHttpsAgent = new HttpsAgent({
  lookup: safeDnsLookup,
  keepAlive: false,
});

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 MaxBooster/1.0";

/**
 * Validate that a string is a fetchable PUBLIC http(s) URL. Throws on any
 * non-http(s) scheme, embedded credentials, or a literal private/reserved host.
 * (The connect-time DNS guard remains the authoritative check for hostnames
 * that resolve to private IPs.)
 */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (u.username || u.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Blocked host");
  }
  if (netIsIPv4(host) && isReservedIp(host)) {
    throw new Error("Blocked host");
  }
  if (host.includes(":") && isReservedIp(host)) {
    throw new Error("Blocked host");
  }
  return u;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch a public URL's text body with SSRF, redirect, size and time bounds.
 * Returns the response even on non-2xx status (caller decides); throws only on
 * network errors, SSRF blocks, or invalid URLs.
 */
export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const u = assertPublicHttpUrl(rawUrl);
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxBytes = opts.maxBytes ?? 1_500_000;

  const res: AxiosResponse<string> = await axios.get(u.href, {
    httpAgent: safeHttpAgent,
    httpsAgent: safeHttpsAgent,
    timeout: timeoutMs,
    maxRedirects: 3,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    responseType: "text",
    decompress: true,
    validateStatus: () => true,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...opts.headers,
    },
    // Re-assert each redirect hop is public (defense-in-depth; the agent's
    // connect-time lookup is the authoritative guard). Also reject credentials
    // embedded in the redirect target — a redirect can introduce userinfo that
    // the initial assertPublicHttpUrl() never saw.
    beforeRedirect: (options: Record<string, unknown>) => {
      if (options.auth) {
        throw new Error("Redirect with embedded credentials is not allowed");
      }
      const proto = String(options.protocol ?? "https:");
      const hostname = String(options.hostname ?? options.host ?? "");
      if (hostname) assertPublicHttpUrl(`${proto}//${hostname}`);
    },
  });

  const contentType = String(res.headers?.["content-type"] ?? "");
  return {
    url: u.href,
    status: res.status,
    contentType,
    body: typeof res.data === "string" ? res.data : String(res.data ?? ""),
  };
}
