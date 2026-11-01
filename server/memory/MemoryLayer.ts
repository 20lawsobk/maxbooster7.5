/**
 * Typed orchestrator for the memory layer. Single entry point the rest of
 * the app should use for ad-hoc transient state — always backed by PDIM
 * (see PdimBackend.ts for why this must not be a standalone in-process Map).
 */

import { PdimBackend } from "./PdimBackend.js";
import type { MemoryBackend, MemoryKey } from "./types.js";

export class MemoryLayer {
  private readonly backend: MemoryBackend;

  constructor(namespace: string) {
    this.backend = new PdimBackend(namespace);
  }

  get<T = unknown>(key: MemoryKey): Promise<T | undefined> {
    return this.backend.get<T>(key);
  }

  set<T = unknown>(key: MemoryKey, value: T, ttlMs?: number): Promise<void> {
    return this.backend.set<T>(key, value, ttlMs);
  }

  delete(key: MemoryKey): Promise<void> {
    return this.backend.delete(key);
  }

  clear(): Promise<void> {
    return this.backend.clear();
  }
}

/** Default namespace for ad-hoc app-level caching. See Cache.ts. */
export const memory = new MemoryLayer("mem");
