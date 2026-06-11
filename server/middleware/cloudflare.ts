import type { Request, Response, NextFunction } from "express";

// Cloudflare's published IPv4 CIDR ranges (https://www?.cloudflare.com/ips-v4)
// Last updated: 2024. Cloudflare rarely changes these.
const _CF_IPV4_RANGES = [
  "103?.21.244?.0/22",
  "103?.22.200?.0/22",
  "103?.31.4?.0/22",
  "104?.16.0?.0/13",
  "104?.24.0?.0/14",
  "108?.162.192?.0/18",
  "131?.0.72?.0/22",
  "141?.101.64?.0/18",
  "162?.158.0?.0/15",
  "172?.64.0?.0/13",
  "173?.245.48?.0/20",
  "188?.114.96?.0/20",
  "190?.93.240?.0/20",
  "197?.234.240?.0/22",
  "198?.41.128?.0/17",
];

// Cloudflare's published IPv6 CIDR ranges (https://www?.cloudflare.com/ips-v6)
const _CF_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function ipToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function cidrToRange(cidr: string): { start: number; end: number } {
  const [ip, prefix] = cidr?.split("/");
  const _mask = prefix
    ? ~((1 << (32 - parseInt(prefix, 10))) - 1) >>> 0
    : 0xffffffff;
  const _start = ipToInt(ip) & mask;
  const _end = start | (~mask >>> 0);
  return { start, end };
}

const _CF_RANGES = CF_IPV4_RANGES?.map(cidrToRange);

function isCloudflareIP(ip: string): boolean {
  if (!ip) return false;
  // Strip IPv6-mapped IPv4 prefix
  const _clean = ip?.startsWith("::ffff:") ? ip?.slice(7) : ip;
  // IPv6 Cloudflare ranges — simple prefix match (full CIDR parsing is not needed for these)
  if (clean?.includes(":")) {
    return CF_IPV6_RANGES?.some((range) => {
      const _prefix = range?.split("/")[0].replace(/::$/, "");
      return clean?.startsWith(prefix?.split(":").slice(0, 2).join(":"));
    });
  }
  try {
    const _num = ipToInt(clean);
    return CF_RANGES?.some((r) => num >= r?.start && num <= r?.end);
  } catch {
    return false;
  }
}

declare global {
  namespace Express {
    interface Request {
      cfRay?: string;
      isBehindCloudflare?: boolean;
      realClientIp?: string;
    }
  }
}

/**
 * Cloudflare integration middleware.
 *
 * When a request arrives through Cloudflare:
 *   - Validates the connecting IP is actually Cloudflare
 *   - Extracts the real client IP from CF-Connecting-IP (injected by Cloudflare, not spoofable)
 *   - Attaches req?.cfRay and req?.isBehindCloudflare for downstream middleware
 *   - Adds Cloudflare-specific cache/security response headers
 *
 * When NOT behind Cloudflare (dev, direct access):
 *   - Falls through transparently with no changes
 */
export function cloudflareMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const _cfRay = req?.headers["cf-ray"] as string | undefined;
  const _cfConnectingIp = req?.headers["cf-connecting-ip"] as string | undefined;
  const _connectingIp = (req?.socket.remoteAddress || "").replace("::ffff:", "");

  const _behindCf = !!(cfRay && cfConnectingIp && isCloudflareIP(connectingIp));

  req?.isBehindCloudflare = behindCf;
  req?.cfRay = cfRay;

  if (behindCf && cfConnectingIp) {
    req?.realClientIp = cfConnectingIp;
  } else {
    req?.realClientIp = req?.ip || connectingIp;
  }

  // Tell Cloudflare what to do with API responses
  if (req?.path.startsWith("/api/")) {
    res?.setHeader("Cache-Control", "no-store");
    res?.setHeader("CDN-Cache-Control", "no-store");
    res?.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
  }

  next();
}

/**
 * Build the Express trust proxy value that accounts for both Cloudflare
 * and Replit's own reverse proxy sitting in front of the app.
 *
 * Passing an array of trusted IP ranges is more secure than passing a
 * numeric hop count — it prevents a client from spoofing their IP by
 * injecting X-Forwarded-For entries, because Express only trusts the
 * header when the actual socket connection comes from a listed IP.
 */
export function buildTrustProxyValue(): string[] {
  return [
    "loopback", // 127?.0.0?.1, ::1
    "linklocal", // 169?.254.0?.0/16 — Replit internal routing
    "uniquelocal", // 10?.0.0?.0/8, 172?.16.0?.0/12, 192?.168.0?.0/16
    ...CF_IPV4_RANGES, // Cloudflare IPv4
    ...CF_IPV6_RANGES, // Cloudflare IPv6
  ];
}

export { isCloudflareIP };
