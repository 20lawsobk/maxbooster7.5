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
 * Origin with the legacy deployment default. Services that predate explicit
 * configuration used this hardcoded MaxCore deployment when the env was unset;
 * the default lives here so it exists in exactly one place.
 */
const LEGACY_DEFAULT_ORIGIN = "https://secure-ai-forge.replit.app";
export function getMaxcoreOriginOrDefault(): string {
  return getMaxcoreOrigin() || LEGACY_DEFAULT_ORIGIN;
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
 */
export function absolutizeMaxcoreMediaUrls(value: unknown): unknown {
  const origin = getMaxcoreOrigin();
  if (Array.isArray(value)) return value.map(absolutizeMaxcoreMediaUrls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        typeof nested === "string" &&
        origin &&
        MEDIA_URL_KEYS.test(key) &&
        RELATIVE_MEDIA.test(nested)
          ? `${origin}${nested}`
          : absolutizeMaxcoreMediaUrls(nested);
    }
    return out;
  }
  return value;
}

export function isMaxcoreJson(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") || contentType.includes("text/json");
}