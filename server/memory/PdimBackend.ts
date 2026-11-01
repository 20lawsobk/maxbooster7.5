/**
 * PDIM-backed implementation of MemoryBackend.
 *
 * Delegates every operation to the app's existing PDIM client
 * (server/lib/pdimClient.ts) rather than holding its own state. This keeps
 * the memory layer's data:
 *   - consistent across all cluster workers (PDIM is a shared exec server,
 *     not a per-process object),
 *   - durable across restarts (PDIM persists to disk / a remote instance),
 *   - subject to the same AIMD rate limiting / circuit breaker / retry
 *     behavior as every other PDIM consumer, instead of a second bespoke
 *     retry path.
 *
 * All values are JSON-serialized; PDIM's underlying protocol is
 * string-only (it speaks the Redis command surface).
 */

import { getPdimClient } from "../lib/pdimClient.js";
import type { MemoryBackend, MemoryKey } from "./types.js";

export class PdimBackend implements MemoryBackend {
  constructor(private readonly namespace: string) {}

  private ns(key: MemoryKey): string {
    return `${this.namespace}:${key}`;
  }

  async get<T = unknown>(key: MemoryKey): Promise<T | undefined> {
    const raw = await getPdimClient().get(this.ns(key));
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Value wasn't JSON (shouldn't happen for keys written through this
      // backend) — surface as a miss rather than throwing on read.
      return undefined;
    }
  }

  async set<T = unknown>(
    key: MemoryKey,
    value: T,
    ttlMs?: number,
  ): Promise<void> {
    const payload = JSON.stringify(value);
    const fullKey = this.ns(key);
    if (ttlMs && ttlMs > 0) {
      await getPdimClient().set(fullKey, payload, "PX", ttlMs);
    } else {
      await getPdimClient().set(fullKey, payload);
    }
  }

  async delete(key: MemoryKey): Promise<void> {
    await getPdimClient().del(this.ns(key));
  }

  async clear(): Promise<void> {
    const client = getPdimClient();
    const keys = await client.keys(`${this.namespace}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}
