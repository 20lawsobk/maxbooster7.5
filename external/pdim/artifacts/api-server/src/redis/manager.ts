// ============================================================================
// REDIS INSTANCE MANAGER
// Manages lifecycle of RedisStore instances and their DB records.
// ============================================================================

import { randomBytes } from "crypto";
import { db, redisInstances } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RedisStore } from "./store.js";

// System instances that must always exist (IDs and tokens come from env)
const SYSTEM_INSTANCES = [
  {
    id: "22c8e6d237afe8ae41541f87",
    name: "max-booster-agent",
    tokenEnv: "AGENT_TOKEN",
  },
  {
    id: "f26378c8b4faf9f237a0f816",
    name: "max-booster-training",
    tokenEnv: "TRAINING_API_KEY",
  },
];

function generateId(): string {
  return randomBytes(12).toString("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// PDIM now runs inside Max Booster; connection URLs point at the local
// instance by default. Override with PDIM_PUBLIC_HOST if it is ever exposed
// on a public host again.
const PRODUCTION_HOST =
  process.env["PDIM_PUBLIC_HOST"] ??
  `127.0.0.1:${process.env["PORT"] ?? "5556"}`;
const HTTP_SCHEME = PRODUCTION_HOST.startsWith("127.0.0.1") ? "http" : "https";

export function buildConnectionUrl(token: string, instanceId: string): string {
  return `pdim://${token}@${PRODUCTION_HOST}/api/redis/instances/${instanceId}`;
}

export function buildHttpUrl(instanceId: string): string {
  return `${HTTP_SCHEME}://${PRODUCTION_HOST}/api/redis/instances/${instanceId}`;
}

class RedisManager {
  private stores: Map<string, RedisStore> = new Map();
  private tokenIndex: Map<string, string> = new Map();

  async bootstrapSystemInstances(): Promise<void> {
    for (const { id, name, tokenEnv } of SYSTEM_INSTANCES) {
      const token = process.env[tokenEnv];
      if (!token) {
        console.warn(
          `[RedisManager] Bootstrap: env var ${tokenEnv} not set — skipping ${name}`,
        );
        continue;
      }
      await db
        .insert(redisInstances)
        .values({
          id,
          name,
          token,
          pocketId: id,
          maxKeys: 0,
          keyCount: 0,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: redisInstances.id,
          set: { token },
        });
    }
    console.log("[RedisManager] System instances bootstrapped.");
  }

  async initialize(): Promise<void> {
    const rows = await db.select().from(redisInstances);
    await Promise.all(
      rows.map(async (row) => {
        if (!row.isActive) return;
        try {
          const store = new RedisStore(row.id, row.name);
          await store.load();
          this.stores.set(row.id, store);
          this.tokenIndex.set(row.token, row.id);
        } catch (err) {
          console.warn(
            `[RedisManager] Failed to warm up instance ${row.id} (${row.name}):`,
            err,
          );
        }
      }),
    );
    console.log(`[RedisManager] Warmed up ${this.stores.size} instance(s).`);
  }

  async createInstance(
    name: string,
    maxKeys = 0,
  ): Promise<{
    id: string;
    name: string;
    token: string;
    connectionUrl: string;
    httpUrl: string;
    createdAt: Date;
  }> {
    const id = generateId();
    const token = generateToken();

    const [row] = await db
      .insert(redisInstances)
      .values({
        id,
        name,
        token,
        pocketId: id,
        maxKeys,
        keyCount: 0,
        isActive: true,
      })
      .returning();

    if (!row) throw new Error("Failed to create redis instance record");

    const store = new RedisStore(id, name);
    await store.load();
    this.stores.set(id, store);
    this.tokenIndex.set(token, id);

    return {
      id: row.id,
      name: row.name,
      token: row.token,
      connectionUrl: buildConnectionUrl(row.token, row.id),
      httpUrl: buildHttpUrl(row.id),
      createdAt: row.createdAt,
    };
  }

  /** Inflight deduplication: prevents two concurrent callers from loading the same store twice. */
  private inflightLoads = new Map<string, Promise<RedisStore | null>>();

  async getStore(instanceId: string): Promise<RedisStore | null> {
    const existing = this.stores.get(instanceId);
    if (existing) return existing;

    // If a load is already in flight for this id, wait for it instead of starting another.
    const inFlight = this.inflightLoads.get(instanceId);
    if (inFlight) return inFlight;

    const load = (async (): Promise<RedisStore | null> => {
      const [row] = await db
        .select()
        .from(redisInstances)
        .where(eq(redisInstances.id, instanceId))
        .limit(1);

      if (!row || !row.isActive) return null;

      const store = new RedisStore(instanceId, row.name);
      await store.load();
      this.stores.set(instanceId, store);
      this.tokenIndex.set(row.token, instanceId);
      return store;
    })();

    this.inflightLoads.set(instanceId, load);
    try {
      return await load;
    } finally {
      this.inflightLoads.delete(instanceId);
    }
  }

  resolveToken(token: string): string | undefined {
    return this.tokenIndex.get(token);
  }

  /** Return every active instance id→token pair (used by StayAliveService at boot). */
  listInstanceTokens(): Array<{ id: string; token: string }> {
    const out: Array<{ id: string; token: string }> = [];
    for (const [token, id] of this.tokenIndex) {
      out.push({ id, token });
    }
    return out;
  }

  async validateToken(instanceId: string, token: string): Promise<boolean> {
    const cached = this.tokenIndex.get(token);
    if (cached) return cached === instanceId;

    const [row] = await db
      .select({ id: redisInstances.id, token: redisInstances.token })
      .from(redisInstances)
      .where(eq(redisInstances.id, instanceId))
      .limit(1);

    if (!row) return false;
    this.tokenIndex.set(row.token, row.id);
    return row.token === token;
  }

  async listInstances(): Promise<
    Array<{
      id: string;
      name: string;
      httpUrl: string;
      tokenHint: string;
      isActive: boolean;
      keyCount: number;
      createdAt: Date;
      lastUsedAt: Date;
    }>
  > {
    const rows = await db.select().from(redisInstances);
    return rows.map((r) => {
      const store = this.stores.get(r.id);
      const liveKeyCount = store ? store.getStats().keyCount : r.keyCount;
      return {
        id: r.id,
        name: r.name,
        httpUrl: buildHttpUrl(r.id),
        tokenHint: `${r.token.slice(0, 8)}...${r.token.slice(-4)}`,
        isActive: r.isActive,
        keyCount: liveKeyCount,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
      };
    });
  }

  async deleteInstance(instanceId: string): Promise<boolean> {
    const store = this.stores.get(instanceId);
    if (store) {
      await store.close();
      this.stores.delete(instanceId);
    }

    const [row] = await db
      .select({ token: redisInstances.token })
      .from(redisInstances)
      .where(eq(redisInstances.id, instanceId))
      .limit(1);

    if (row) this.tokenIndex.delete(row.token);

    const result = await db
      .delete(redisInstances)
      .where(eq(redisInstances.id, instanceId))
      .returning();
    return result.length > 0;
  }

  // ── Debounced touch ────────────────────────────────────────────────────────
  // At high request rates, calling db.update() on every exec/pipeline request
  // saturates the database connection with identical writes.  Instead we track
  // the last flush time per instance and only write to the DB at most once every
  // TOUCH_DEBOUNCE_MS milliseconds.  The in-memory store is always up-to-date;
  // only the DB record (used for monitoring/dashboard) is debounced.
  private readonly _lastTouch = new Map<string, number>();
  private readonly TOUCH_DEBOUNCE_MS = 30_000; // flush at most once per 30 s

  touchInstance(instanceId: string): void {
    const now = Date.now();
    const last = this._lastTouch.get(instanceId) ?? 0;
    if (now - last < this.TOUCH_DEBOUNCE_MS) return;
    this._lastTouch.set(instanceId, now);

    const store = this.stores.get(instanceId);
    const keyCount = store ? store.getStats().keyCount : undefined;
    db.update(redisInstances)
      .set({
        lastUsedAt: new Date(),
        ...(keyCount !== undefined ? { keyCount } : {}),
      })
      .where(eq(redisInstances.id, instanceId))
      .catch((err: unknown) => {
        console.warn(
          `[RedisManager] touchInstance DB write failed for ${instanceId}:`,
          err,
        );
      });
  }

  async flushAll(): Promise<void> {
    for (const store of this.stores.values()) {
      await store.close();
    }
    this.stores.clear();
    this.tokenIndex.clear();
  }
}

export const redisManager = new RedisManager();
