/**
 * MaxCore AI HTTP Client — TF-free
 *
 * Standalone module that connects to the MaxCore training server
 * (secure-ai-forge.replit.app).
 *
 * Intentionally has ZERO TensorFlow dependencies so it can be imported by any
 * module (e.g. advancedVideoRendererService) without pulling in native bindings.
 *
 * Reliability strategy:
 *   1. Immediate wake ping on import — fires a request the moment the app starts
 *      so MaxCore finishes waking before the first user request arrives.
 *   2. Warmth pinger — keeps the Replit project awake every 55 s (well under
 *      the ~5 min inactivity sleep threshold).
 *   3. 503 retry — MaxCore exposes its own circuit-breaker; when it reports
 *      "retry in ~Ns" we honour that delay and retry once before giving up.
 *   4. Cold-start timeout — 45 s covers the Replit wake-up window (~30-60 s).
 */

import { logger } from "../logger.js";

const MC_AI_URL = process?.env.AI_SERVER_URL || "";
// AI_SERVER_KEY is the active generation credential; MAXCORE_ADMIN_KEY is the admin credential
const MC_AI_KEY =
  process?.env.AI_SERVER_KEY || process?.env.MAXCORE_ADMIN_KEY || "";

/** Parse MaxCore's "Circuit breaker open — retry in ~Ns." message → ms to wait. */
function parseCbRetryMs(body: string): number {
  const m = body.match(/retry in\s*~?\s*(\d+)\s*s/i);
  if (m) return Math.min(parseInt(m[1], 10) * 1_000 + 500, 20_000);
  return 12_000; // sensible default when format changes
}

export class MaxCoreAIClient {
  private static _remoteAvailable: boolean | null = null;
  private static _lastCheck = 0;
  private static readonly CHECK_TTL = 30_000;

  // Suppress only stable named endpoints (e.g. /api/generate/content) that
  // return 404 or non-JSON — never unique per-job poll paths.
  private static _endpointSuppressed = new Map<string, number>();
  private static readonly ENDPOINT_SUPPRESS_MS = 2 * 60_000;

  private static isEndpointSuppressed(path: string): boolean {
    const suppressedUntil = MaxCoreAIClient._endpointSuppressed.get(path) ?? 0;
    return Date.now() < suppressedUntil;
  }

  private static suppressEndpoint(path: string): void {
    MaxCoreAIClient._endpointSuppressed.set(
      path,
      Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS,
    );
    logger?.debug(`[MaxCoreAI] remote ${path} suppressed for 2 min`);
  }

  private static isJson(r: Response): boolean {
    const ct = r?.headers.get("content-type") || "";
    return ct?.includes("application/json") || ct?.includes("text/json");
  }

  private static authHeaders(): Record<string, string> {
    // MaxCore validates X-API-Key / X-Admin-Key BEFORE Authorization and rejects
    // the generation credential on those header schemes with 401 "Invalid or
    // inactive API key". Sending them alongside the (valid) Bearer token makes
    // MaxCore 401 every generation/inference call. Bearer alone is the only
    // scheme the generation key authenticates under, so send ONLY that.
    return {
      Authorization: `Bearer ${MC_AI_KEY}`,
    };
  }

  /** Always returns true — MaxCore is always running. */
  static async isAvailable(): Promise<boolean> {
    if (MC_AI_URL && MC_AI_KEY) {
      const now = Date?.now();
      if (
        MaxCoreAIClient._remoteAvailable === null ||
        now - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL
      ) {
        fetch(`${MC_AI_URL}/api/generate/content`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...MaxCoreAIClient.authHeaders(),
          },
          body: JSON.stringify({
            topic: "music artist brand",
            platform: "instagram",
            tone: "energetic",
          }),
          signal: AbortSignal.timeout(45_000),
          redirect: "manual",
        })
          .then((r) => {
            MaxCoreAIClient._remoteAvailable = r?.ok && MaxCoreAIClient.isJson(r);
            if (MaxCoreAIClient._remoteAvailable)
              logger?.info("[MaxCoreAI] Remote server is online ✅");
          })
          .catch(() => {
            MaxCoreAIClient._remoteAvailable = false;
          });
        MaxCoreAIClient._lastCheck = now;
      }
    }
    return true;
  }

  /**
   * GET a stable named endpoint (suppression applies on permanent failures).
   * Do NOT use this for per-job poll paths — use poll() instead.
   */
  static async get<T = any>(endpoint: string): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;
    const path = endpoint?.startsWith("/api/") ? endpoint : `/api${endpoint}`;
    if (MaxCoreAIClient.isEndpointSuppressed(path)) return null;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method: "GET",
        headers: MaxCoreAIClient.authHeaders(),
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
      if (!r?.ok || !MaxCoreAIClient.isJson(r)) {
        if (r?.status === 404 || r?.status === 405) {
          MaxCoreAIClient.suppressEndpoint(path);
        }
        return null;
      }
      return (await r?.json()) as T;
    } catch (e) {
      logger?.debug(`[MaxCoreAI] GET ${path} failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Poll a per-job status endpoint — NO endpoint suppression, longer timeout.
   * Use for video-job/<jobId> and any other unique-path polling loops.
   * Returns null on any network/HTTP error so the caller can simply continue.
   */
  static async poll<T = any>(endpoint: string): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;
    const path = endpoint.startsWith("/api/") ? endpoint : `/api${endpoint}`;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method: "GET",
        headers: MaxCoreAIClient.authHeaders(),
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
      });
      if (!r?.ok || !MaxCoreAIClient.isJson(r)) {
        logger?.debug(
          `[MaxCoreAI] poll ${path} → HTTP ${r?.status} (continuing)`,
        );
        return null;
      }
      return (await r?.json()) as T;
    } catch (e) {
      logger?.debug(
        `[MaxCoreAI] poll ${path} network error (continuing): ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Call MaxCore's generation endpoint.
   * - 45 s timeout to cover Replit cold-start wake-up (observed ~30-60 s).
   * - On 503 with circuit-breaker body, waits the suggested retry delay and
   *   retries once before returning null.
   */
  private static readonly GENERATE_TIMEOUT_MS = 45_000;

  static async generate<T = any>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint?.startsWith("/api/") ? endpoint : `/api${endpoint}`;

    if (MaxCoreAIClient.isEndpointSuppressed(path)) {
      logger?.debug(
        `[MaxCoreAI] generate ${path} — skipping (endpoint suppressed)`,
      );
      return null;
    }

    const attempt = async (): Promise<{ r: Response; text: string } | null> => {
      try {
        const r = await fetch(`${MC_AI_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...MaxCoreAIClient.authHeaders(),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(MaxCoreAIClient.GENERATE_TIMEOUT_MS),
          redirect: "manual",
        });
        const text = await r.text();
        return { r, text };
      } catch (e) {
        logger?.debug(
          `[MaxCoreAI] generate ${path} network error: ${(e as Error).message}`,
        );
        return null;
      }
    };

    let result = await attempt();

    // Retry once on 503 circuit-breaker — wait the suggested cooldown then try again
    if (result && result.r.status === 503) {
      const retryMs = parseCbRetryMs(result.text);
      logger?.debug(
        `[MaxCoreAI] generate ${path} — 503 circuit-breaker, retrying in ${retryMs}ms`,
      );
      await new Promise((res) => setTimeout(res, retryMs));
      result = await attempt();
    }

    if (!result) return null;

    const { r, text } = result;

    if (r.ok && MaxCoreAIClient.isJson(r)) {
      try {
        const data = JSON.parse(text);
        MaxCoreAIClient._remoteAvailable = true;
        MaxCoreAIClient._lastCheck = Date.now();
        MaxCoreAIClient._endpointSuppressed.delete(path);
        logger?.debug(`[MaxCoreAI] generate ${path} → success`);
        return data as T;
      } catch {
        return null;
      }
    }

    const failReason = `HTTP ${r.status}`;
    logger?.debug(
      `[MaxCoreAI] generate ${path} → ${failReason} — returning null`,
    );
    if (r.status === 404 || r.status === 405) {
      MaxCoreAIClient._endpointSuppressed.set(
        path,
        Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS,
      );
    }
    return null;
  }

  /**
   * Infer via MaxCore remote server.
   * - 45 s timeout to cover Replit cold-start wake-up.
   * - On 503 with circuit-breaker body, waits the suggested retry delay and
   *   retries once before returning null.
   */
  private static readonly INFER_TIMEOUT_MS = 45_000;

  static async infer<T = any>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint.startsWith("/api/") ? endpoint : `/api${endpoint}`;

    if (MaxCoreAIClient.isEndpointSuppressed(path)) {
      logger.debug(
        `[MaxCoreAI] infer ${path} — skipping (endpoint suppressed, using fallback)`,
      );
      return null;
    }

    const attempt = async (): Promise<{ r: Response; text: string } | null> => {
      try {
        const r = await fetch(`${MC_AI_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...MaxCoreAIClient.authHeaders(),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(MaxCoreAIClient.INFER_TIMEOUT_MS),
          redirect: "manual",
        });
        const text = await r.text();
        return { r, text };
      } catch (e) {
        logger.debug(
          `[MaxCoreAI] infer ${path} network error: ${(e as Error).message}`,
        );
        return null;
      }
    };

    let result = await attempt();

    // Retry once on 503 circuit-breaker — wait the suggested cooldown then try again
    if (result && result.r.status === 503) {
      const retryMs = parseCbRetryMs(result.text);
      logger.debug(
        `[MaxCoreAI] infer ${path} — 503 circuit-breaker, retrying in ${retryMs}ms`,
      );
      await new Promise((res) => setTimeout(res, retryMs));
      result = await attempt();
    }

    if (!result) return null;

    const { r, text } = result;

    if (r.ok && MaxCoreAIClient.isJson(r)) {
      try {
        const data = JSON.parse(text);
        logger.debug(`[MaxCoreAI] infer ${path} → success`);
        MaxCoreAIClient._remoteAvailable = true;
        MaxCoreAIClient._endpointSuppressed.delete(path);
        return data as T;
      } catch {
        return null;
      }
    }

    const failReason = `HTTP ${r.status}`;
    logger.debug(
      `[MaxCoreAI] infer ${path} → ${failReason} — returning null`,
    );
    if (r.status === 404 || r.status === 405) {
      MaxCoreAIClient._endpointSuppressed.set(
        path,
        Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS,
      );
    }
    return null;
  }
}

/**
 * Fire an immediate wake request to MaxCore so the Replit project finishes
 * booting before the first real user request arrives. Fire-and-forget — we
 * don't need the result, we just want to trigger the wake.
 */
function wakeMaxCore(): void {
  if (!MC_AI_URL || !MC_AI_KEY) return;
  fetch(`${MC_AI_URL}/api/generate/content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MC_AI_KEY}`,
    },
    body: JSON.stringify({
      topic: "music artist brand new release",
      platform: "instagram",
      tone: "energetic",
    }),
    signal: AbortSignal.timeout(60_000),
    redirect: "manual",
  })
    .then((r) => {
      if (r.ok) {
        MaxCoreAIClient._remoteAvailable = true;
        MaxCoreAIClient._lastCheck = Date.now();
        logger?.info("[MaxCoreAI] Wake ping succeeded — MaxCore is ready ✅");
      } else {
        logger?.warn(`[MaxCoreAI] Wake ping → HTTP ${r.status} — MaxCore AI model not yet ready`);
      }
    })
    .catch((e) => {
      logger?.warn(`[MaxCoreAI] Wake ping timed out or failed: ${e.message}`);
    });
}

/**
 * Keep MaxCore's LLM warm by sending a lightweight generate request every
 * 55 s — well under Replit's ~5 min inactivity sleep threshold.
 */
export function startMaxCoreLLMWarmth(): void {
  if (!MC_AI_URL || !MC_AI_KEY) return;

  const WARMTH_INTERVAL_MS = 55_000;

  const ping = () => {
    fetch(`${MC_AI_URL}/api/generate/content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MC_AI_KEY}`,
      },
      body: JSON.stringify({
        topic: "music artist brand new release",
        platform: "instagram",
        tone: "energetic",
      }),
      signal: AbortSignal.timeout(45_000),
      redirect: "manual",
    })
      .then((r) => {
        if (r?.ok) {
          MaxCoreAIClient._remoteAvailable = true;
          MaxCoreAIClient._lastCheck = Date.now();
          logger?.debug("[MaxCoreAI] Warmth ping → MaxCore alive ✅");
        } else {
          logger?.debug(`[MaxCoreAI] Warmth ping → HTTP ${r.status}`);
        }
      })
      .catch((e) => {
        logger?.debug(`[MaxCoreAI] Warmth ping failed: ${e.message}`);
      });
  };

  // Track consecutive failures so we log at WARN when MaxCore stays down
  let _consecutiveFailures = 0;

  const pingWithTracking = () => {
    fetch(`${MC_AI_URL}/api/generate/content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MC_AI_KEY}`,
      },
      body: JSON.stringify({
        topic: "music artist brand new release",
        platform: "instagram",
        tone: "energetic",
      }),
      signal: AbortSignal.timeout(45_000),
      redirect: "manual",
    })
      .then((r) => {
        if (r?.ok) {
          if (_consecutiveFailures > 0) {
            logger?.info(
              `[MaxCoreAI] ✅ MaxCore reconnected after ${_consecutiveFailures} failed warmth ping(s)`,
            );
          }
          _consecutiveFailures = 0;
          MaxCoreAIClient._remoteAvailable = true;
          MaxCoreAIClient._lastCheck = Date.now();
          logger?.debug("[MaxCoreAI] Warmth ping → MaxCore alive ✅");
        } else {
          _consecutiveFailures++;
          logger?.warn(
            `[MaxCoreAI] Warmth ping → HTTP ${r.status} (MaxCore AI model unavailable, failure #${_consecutiveFailures})`,
          );
        }
      })
      .catch((e) => {
        _consecutiveFailures++;
        logger?.warn(
          `[MaxCoreAI] Warmth ping → network error (failure #${_consecutiveFailures}): ${e.message}`,
        );
      });
  };

  // First warmth ping after 5 s — by then the wake ping is already in-flight
  // and the initial calibration run hasn't started yet.
  const firstPing = setTimeout(pingWithTracking, 5_000);
  if (firstPing?.unref) firstPing.unref();

  const t = setInterval(pingWithTracking, WARMTH_INTERVAL_MS);
  if (t?.unref) t.unref();

  logger?.info(
    "[MaxCoreAI] LLM warmth pinger started — pinging every 55s to prevent cold-start latency",
  );
}

if (MC_AI_URL && MC_AI_KEY) {
  logger?.info(
    `[MaxCoreAI] Configured — remote: ${MC_AI_URL} | MaxCore is the only AI source`,
  );
  // Fire an immediate wake request so MaxCore is ready before users arrive
  wakeMaxCore();
} else {
  logger?.warn(
    "[MaxCoreAI] No remote URL/key configured — all generate/infer calls will return null",
  );
}
