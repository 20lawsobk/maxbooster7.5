/**
 * Typed convenience API for ad-hoc TTL caching, backed by PDIM via
 * MemoryLayer. Use this for one-off cached values in new code; it does not
 * replace the existing route-level API response cache
 * (server/middleware/apiCache.ts) or the query cache
 * (server/lib/queryCache.ts) — both already do this for their specific use
 * cases and should keep using their own namespaces.
 */

import { memory } from "./MemoryLayer.js";

export async function cacheGet<T = unknown>(key: string): Promise<T | undefined> {
  return memory.get<T>(key);
}

export async function cacheSet<T = unknown>(
  key: string,
  value: T,
  ttlMs?: number,
): Promise<void> {
  await memory.set<T>(key, value, ttlMs);
}

export async function cacheDelete(key: string): Promise<void> {
  await memory.delete(key);
}
