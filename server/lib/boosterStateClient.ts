/**
 * BoosterState Client
 *
 * HTTP client for the BoosterState sidecar — a built-in Max Booster component
 * providing KV, queue, sorted-set, and token-bucket rate-limiting services.
 *
 * BoosterState is always available when Max Booster is running.
 * All methods throw on failure — no silent degradation.
 */

import { logger } from "../logger.js";

const BASE_URL = `http://127.0.0.1:${process.env.PORT || 5000}/api/boosterstate`;

function authHeaders(): Record<string, string> {
  const secret = process.env.BOOSTERSTATE_SECRET;
  if (secret) {
    return { Authorization: `Bearer ${secret}` };
  }
  return {};
}

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000), // 10 s — internal service hang must not hold event loop
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`BoosterState ${path} returned ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export class BoosterStateClient {
  get isOpen(): boolean {
    return true;
  }

  async connect(): Promise<void> {
    const res = await fetch(`${BASE_URL}/ping`, {
      signal: AbortSignal.timeout(5_000),
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`BoosterState ping returned ${res.status}`);
    }
    logger.info("✅ BoosterState client connected");
  }

  async ping(): Promise<string> {
    const res = await fetch(`${BASE_URL}/ping`, {
      signal: AbortSignal.timeout(5_000),
      headers: authHeaders(),
    });
    return await res.text();
  }

  async get(key: string): Promise<string | null> {
    const data = await post("/kv/get", { key });
    return data?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await post("/kv/set", { key, value });
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    await post("/kv/set", { key, value, ttl_secs: ttl });
  }

  async setEx(key: string, ttl: number, value: string): Promise<void> {
    return this.setex(key, ttl, value);
  }

  async del(...keys: (string | string[])[]): Promise<number> {
    const flatKeys: string[] = [];
    for (const k of keys) {
      if (Array.isArray(k)) {
        flatKeys?.push(...k);
      } else {
        flatKeys?.push(k);
      }
    }
    const data = await post("/kv/del", { keys: flatKeys });
    return data?.deleted ?? 0;
  }

  async exists(key: string): Promise<number> {
    const data = await post("/kv/exists", { key });
    return data?.exists ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const data = await post("/kv/incr", { key });
    return data?.value ?? 0;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await post("/kv/expire", { key, seconds });
  }

  async keys(pattern: string): Promise<string[]> {
    const data = await post("/kv/keys", { pattern });
    return data?.keys ?? [];
  }

  async zAdd(
    key: string,
    member: { score: number; value: string },
  ): Promise<void> {
    await post("/zset/add", { key, score: member.score, value: member.value });
  }

  async zCard(key: string): Promise<number> {
    const data = await post("/zset/card", { key });
    return data?.count ?? 0;
  }

  async zRange(
    key: string,
    start: number,
    end: number,
    options?: { REV?: boolean },
  ): Promise<string[]> {
    const data = await post("/zset/range", {
      key,
      start,
      end,
      rev: options.REV ?? false,
    });
    return data?.values ?? [];
  }

  async zRemRangeByScore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<number> {
    const data = await post("/zset/rem-range-by-score", {
      key,
      min: String(min),
      max: String(max),
    });
    return data?.removed ?? 0;
  }

  async queuePush(
    queue: string,
    data: Record<string, unknown>,
    priority?: number,
  ): Promise<string | null> {
    const result = await post("/queue/push", { queue, data, priority });
    return result?.id ?? null;
  }

  async queuePop(
    queue: string,
  ): Promise<{ id: string; data: Record<string, unknown> } | null> {
    const result = await post("/queue/pop", { queue });
    return result?.item ?? null;
  }

  async rateTake(
    key: string,
    tokens: number,
    capacity?: number,
    refillPerSec?: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const body: Record<string, any> = { key, tokens };
    if (capacity !== undefined) body.capacity = capacity;
    if (refillPerSec !== undefined) body.refill_per_sec = refillPerSec;
    const data = await post("/rate/take", body);
    return { allowed: data.allowed ?? true, remaining: data.remaining ?? 0 };
  }

  async quit(): Promise<void> {
    // BoosterState is built-in — no teardown needed
  }
}

let singleton: BoosterStateClient | null = null;

export async function getBoosterStateClient(): Promise<BoosterStateClient> {
  if (singleton) {
    return singleton;
  }

  const client = new BoosterStateClient();
  await client?.connect();
  singleton = client;
  return client;
}

export async function isBoosterStateHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
      headers: authHeaders(),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  }
}

export async function shutdownBoosterState(): Promise<void> {
  singleton = null;
  logger.info("✅ BoosterState client shut down");
}
