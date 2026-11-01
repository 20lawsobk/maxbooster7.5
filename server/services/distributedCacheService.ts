/**
 * Minimal cache-recovery adapter for self-healing services.
 *
 * PDIM owns the durable cache. The only process-local cache managed by this
 * service is intentionally bounded and stores best-effort recovery data.
 * Eviction must therefore be safe to call during memory or filesystem
 * pressure, even when PDIM is unavailable.
 */

const MAX_LOCAL_ENTRIES = 1_000;
const localEntries = new Map<string, { value: unknown; expiresAt: number }>();

function purgeExpired(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of localEntries) {
    if (entry.expiresAt <= now) {
      localEntries.delete(key);
      removed++;
    }
  }
  return removed;
}

export const distributedCache = {
  evictExpired(): number {
    return purgeExpired();
  },

  flush(): number {
    const removed = localEntries.size;
    localEntries.clear();
    return removed;
  },

  get<T>(key: string): T | undefined {
    const entry = localEntries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      localEntries.delete(key);
      return undefined;
    }
    return entry.value as T;
  },

  set(key: string, value: unknown, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Cache TTL must be a positive finite number");
    }
    purgeExpired();
    if (!localEntries.has(key) && localEntries.size >= MAX_LOCAL_ENTRIES) {
      const oldest = localEntries.keys().next().value;
      if (oldest !== undefined) localEntries.delete(oldest);
    }
    localEntries.set(key, { value, expiresAt: Date.now() + ttlMs });
  },
};