import { logger } from '../logger.js';

const BASE_URL = `http://127.0.0.1:${process.env.BOOSTERSTATE_PORT || 9877}`;

let warnedOnce = false;

function logWarnOnce(msg: string) {
  if (!warnedOnce) {
    logger.warn(msg);
    warnedOnce = true;
  }
}

async function post(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`boosterstate ${path} returned ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export class BoosterStateClient {
  private _isOpen = false;

  get isOpen(): boolean {
    return this._isOpen;
  }

  async connect(): Promise<void> {
    try {
      const res = await fetch(`${BASE_URL}/ping`);
      if (res.ok) {
        this._isOpen = true;
        logger.info('✅ BoosterState client connected');
      }
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      this._isOpen = false;
    }
  }

  async ping(): Promise<string> {
    try {
      const res = await fetch(`${BASE_URL}/ping`);
      return await res.text();
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 'PONG';
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const data = await post('/kv/get', { key });
      return data.value ?? null;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await post('/kv/set', { key, value });
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
    }
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    try {
      await post('/kv/set', { key, value, ttl_secs: ttl });
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
    }
  }

  async del(...keys: (string | string[])[]): Promise<number> {
    const flatKeys: string[] = [];
    for (const k of keys) {
      if (Array.isArray(k)) {
        flatKeys.push(...k);
      } else {
        flatKeys.push(k);
      }
    }
    try {
      const data = await post('/kv/del', { keys: flatKeys });
      return data.deleted ?? 0;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 0;
    }
  }

  async exists(key: string): Promise<number> {
    try {
      const data = await post('/kv/exists', { key });
      return data.exists ? 1 : 0;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 0;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const data = await post('/kv/incr', { key });
      return data.value ?? 0;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await post('/kv/expire', { key, seconds });
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const data = await post('/kv/keys', { pattern });
      return data.keys ?? [];
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return [];
    }
  }

  async zAdd(key: string, member: { score: number; value: string }): Promise<void> {
    try {
      await post('/zset/add', { key, score: member.score, value: member.value });
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
    }
  }

  async zCard(key: string): Promise<number> {
    try {
      const data = await post('/zset/card', { key });
      return data.count ?? 0;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 0;
    }
  }

  async zRange(key: string, start: number, end: number, options?: { REV?: boolean }): Promise<string[]> {
    try {
      const data = await post('/zset/range', {
        key,
        start,
        end,
        rev: options?.REV ?? false,
      });
      return data.values ?? [];
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return [];
    }
  }

  async zRemRangeByScore(key: string, min: string | number, max: string | number): Promise<number> {
    try {
      const data = await post('/zset/rem-range-by-score', {
        key,
        min: String(min),
        max: String(max),
      });
      return data.removed ?? 0;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return 0;
    }
  }

  async queuePush(queue: string, data: any, priority?: number): Promise<string | null> {
    try {
      const result = await post('/queue/push', { queue, data, priority });
      return result.id ?? null;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return null;
    }
  }

  async queuePop(queue: string): Promise<{ id: string; data: any } | null> {
    try {
      const result = await post('/queue/pop', { queue });
      return result.item ?? null;
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return null;
    }
  }

  async rateTake(
    key: string,
    tokens: number,
    capacity?: number,
    refillPerSec?: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const body: Record<string, any> = { key, tokens };
      if (capacity !== undefined) body.capacity = capacity;
      if (refillPerSec !== undefined) body.refill_per_sec = refillPerSec;
      const data = await post('/rate/take', body);
      return { allowed: data.allowed ?? true, remaining: data.remaining ?? 0 };
    } catch {
      logWarnOnce('⚠️ BoosterState server unavailable - using graceful fallbacks');
      return { allowed: true, remaining: 0 };
    }
  }

  async quit(): Promise<void> {
    this._isOpen = false;
  }
}

let singleton: BoosterStateClient | null = null;
let initPromise: Promise<BoosterStateClient | null> | null = null;

export async function getBoosterStateClient(): Promise<BoosterStateClient | null> {
  if (singleton && singleton.isOpen) {
    return singleton;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const client = new BoosterStateClient();
      await client.connect();
      if (client.isOpen) {
        singleton = client;
        return client;
      }
      return null;
    } catch {
      logWarnOnce('⚠️ BoosterState client initialization failed');
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function isBoosterStateHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function shutdownBoosterState(): Promise<void> {
  if (singleton) {
    await singleton.quit();
    singleton = null;
  }
  logger.info('✅ BoosterState client shut down');
}
