/**
 * Shared MaxCore transport contract.
 *
 * This module deliberately contains no artist workflow logic. It is the one
 * place Max Booster resolves the trusted MaxCore origin, service credentials,
 * and response media locations before higher-level callers consume them.
 */
import { config } from "../config/index.js";

const MEDIA_URL_KEYS = /(^|_)(url|href)$|_(url|path)$/i;
const RELATIVE_MEDIA = /^\/(uploads|media|static|files|outputs)\//i;

export type MaxcoreAuthScope = "generation" | "admin";

export function getMaxcoreOrigin(): string {
  // Deployments have historically set the URL as either the root origin or
  // the "/api" form — normalize to the root origin so every caller appends
  // paths consistently.
  return config.maxcoreUrl.replace(/\/+$/, "").replace(/\/api$/, "");
}

/**
 * Historical alias. MaxCore now runs as a local subsystem by default, so the
 * origin always resolves (loopback in local mode, MAXCORE_URL in remote
 * mode). The old hardcoded external deployment default has been removed —
 * an unconfigured remote mode yields "" and callers fail explicit.
 */
export function getMaxcoreOriginOrDefault(): string {
  return getMaxcoreOrigin();
}

export function getMaxcoreGenerationKey(): string {
  return config.maxcoreGenerationKey;
}

export function getMaxcoreGenerationHeaders(): Record<string, string> {
  const key = config.maxcoreGenerationKey;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export function getMaxcoreAdminHeaders(): Record<string, string> {
  const key = config.maxcoreAdminKey;
  // The deployed MaxCore generation surface uses Bearer credentials. The
  // imported administrative API is explicitly X-Admin-Key scoped, so never
  // combine the two schemes on a request.
  return key ? { "X-Admin-Key": key } : {};
}

export function getMaxcoreHeaders(
  scope: MaxcoreAuthScope = "generation",
): Record<string, string> {
  return scope === "admin"
    ? getMaxcoreAdminHeaders()
    : getMaxcoreGenerationHeaders();
}

export function normalizeMaxcorePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function maxcoreUrl(path: string): string {
  const origin = getMaxcoreOrigin();
  if (!origin) throw new Error("[MaxCore] MAXCORE_URL / AI_SERVER_URL is not configured");
  return `${origin}${normalizeMaxcorePath(path)}`;
}

/**
 * Rewrites server-relative media references returned by MaxCore so browser
 * clients never accidentally resolve them against the Max Booster UDS origin.
 *
 * In local mode, MaxCore's origin is a loopback address (http://127.0.0.1:PORT)
 * that only the Node server can reach — a browser can never load it directly,
 * and even if it could, http:// loopback URLs are blocked by the app's CSP
 * img-src/media-src ("https:" only). So local-mode media is rewritten to a
 * same-origin proxy path (`/api/maxcore-media/...`, see maxcoreProxy.ts) that
 * streams the bytes through the Node server instead. Remote MaxCore mode
 * keeps the historical behavior of pointing straight at MaxCore's own
 * (public, https) origin, since the browser can reach that directly.
 */
export function absolutizeMaxcoreMediaUrls(value: unknown): unknown {
  const origin = getMaxcoreOrigin();
  const useProxyPath = config.maxcoreLocal.enabled;
  if (Array.isArray(value)) return value.map(absolutizeMaxcoreMediaUrls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        typeof nested === "string" &&
        origin &&
        MEDIA_URL_KEYS.test(key) &&
        RELATIVE_MEDIA.test(nested)
          ? useProxyPath
            ? `/api/maxcore-media${nested}`
            : `${origin}${nested}`
          : absolutizeMaxcoreMediaUrls(nested);
    }
    return out;
  }
  return value;
}

/**
 * Guards the public /api/maxcore-media proxy: only paths matching the same
 * media prefixes absolutizeMaxcoreMediaUrls rewrites (uploads/media/static/
 * files/outputs) are ever forwarded upstream, and any `..` traversal segment
 * (raw or percent-encoded) is rejected outright.
 */
export function isAllowedMaxcoreMediaPath(subPath: string): boolean {
  if (!subPath) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(subPath);
  } catch {
    return false;
  }
  if (decoded.includes("..") || decoded.includes("\0")) return false;
  return RELATIVE_MEDIA.test(decoded);
}

export function isMaxcoreJson(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") || contentType.includes("text/json");
}