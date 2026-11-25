import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Give the local DNS child and its parent one per-process credential when
 * local zone sync is enabled. Cluster primaries call this before forking so
 * every worker and the child inherit the same value. An operator-provided
 * secret always takes precedence.
 */
export function ensureDnsSyncSecret(): string | undefined {
  const configured = process.env.DNS_SYNC_SECRET;
  if (configured) return configured;
  if (process.env.DNS_NODE_LOCAL !== "1") return undefined;

  const generated = randomBytes(32).toString("base64url");
  process.env.DNS_SYNC_SECRET = generated;
  return generated;
}

export function isDnsZoneSyncRequest(method: string, routePath: string): boolean {
  return method.toUpperCase() === "GET" &&
    /^\/api\/dns\/zone\/[a-z0-9][a-z0-9.-]{0,252}$/i.test(routePath);
}

export function hasValidDnsSyncSecret(
  provided: string | undefined,
  expected = ensureDnsSyncSecret(),
): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes);
}
