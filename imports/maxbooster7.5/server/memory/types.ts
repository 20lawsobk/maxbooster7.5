/**
 * Typed contract for the memory layer.
 *
 * This module intentionally has ZERO storage logic of its own — it only
 * defines the shape every backend must satisfy. The only backend today is
 * `PdimBackend`, which delegates to the app's existing PDIM client
 * (server/lib/pdimClient.ts). That client is already:
 *   - shared across every cluster worker (an in-process `Map` would not be),
 *   - persisted to disk (survives restarts/redeploys),
 *   - the same store already backing sessions, rate limiting, and BullMQ.
 *
 * Do not add a second, unconnected in-memory store here. See
 * .agents/memory/pocket-elastic-compute.md for why "logical" memory-layer
 * abstractions must not duplicate the actual storage substrate.
 */

export type MemoryKey = string;

export interface MemoryBackend {
  get<T = unknown>(key: MemoryKey): Promise<T | undefined>;
  set<T = unknown>(key: MemoryKey, value: T, ttlMs?: number): Promise<void>;
  delete(key: MemoryKey): Promise<void>;
  /** Delete every key this backend's namespace owns. Use sparingly. */
  clear(): Promise<void>;
}
