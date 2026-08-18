// @ts-nocheck
/**
 * MaxCore AI HTTP Client — TF-free
 *
 * Standalone module that connects to the MaxCore training server
 * (maxbooster.replit.app).
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
import { config } from "../config/index.js";
import { getMaxcoreOrigin } from "./maxcoreConnector.js";

// Resolved through the shared connector — the single MaxCore contract boundary.
const MC_AI_URL = getMaxcoreOrigin();
const MC_AI_KEY = config.maxcoreGenerationKey;

/** Parse MaxCore's "Circuit breaker open — retry in ~Ns." message → ms to wait. */
function parseCbRetryMs(body: string): number {
  const m = body.match(/retry in\s*~?\s*(\d+)\s*s/i);
  if (m) return Math.min(parseInt(m[1], 10) * 1_000 + 500, 20_000);
  return 12_000; // sensible default when format changes
}

export class MaxCoreAIClient {
  private static _remoteAvailable: boolean | null = null;
  private static _lastCheck = 0;
  /**
   * Optional callback fired once when MaxCore transitions from unreachable
   * back to reachable.  Registered by subsystems (e.g. BeatMoneyLoop) that
   * need to reschedule work when MaxCore recovers.  Single-slot — last
   * registration wins, which is fine since only one loop uses this.
   */
  static onReconnect: (() => void) | null = null;
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
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 2 min`);
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

  /** Always returns true — MaxCore is always running.
   *  Availability probe uses the lightweight model-info GET — it must NEVER
   *  post to a generation endpoint (that queues real AI work on MaxCore). */
  static async isAvailable(): Promise<boolean> {
    if (MC_AI_URL && MC_AI_KEY) {
      const now = Date?.now();
      if (
        MaxCoreAIClient._remoteAvailable === null ||
        now - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL
      ) {
        fetch(`${MC_AI_URL}/api/platform/model/info`, {
          method: "GET",
          headers: MaxCoreAIClient.authHeaders(),
          // 10 s: matches pingMaxCoreHealth timeout (see note there).
          signal: AbortSignal.timeout(10_000),
          redirect: "manual",
        })
          .then((r) => {
            MaxCoreAIClient._remoteAvailable = r?.ok;
            if (MaxCoreAIClient._remoteAvailable)
              logger.info("[MaxCoreAI] Remote server is online ✅");
          })
          .catch(() => {
            MaxCoreAIClient._remoteAvailable = false;
          });
        MaxCoreAIClient._lastCheck = now;
      }
    }
    return true;
  }

  // ── Resilience: bulkhead + circuit breaker ────────────────────────────────
  // Bulkhead: cap concurrent in-flight generation calls so a slow MaxCore
  // can't exhaust the undici connection pool (each call may hold a socket
  // for up to 10 min now that MaxCore has no server-side timeouts).
  private static readonly MAX_CONCURRENT = 8;
  private static _inFlight = 0;
  private static _waiters: Array<() => void> = [];

  private static async acquireSlot(): Promise<boolean> {
    if (MaxCoreAIClient._inFlight < MaxCoreAIClient.MAX_CONCURRENT) {
      MaxCoreAIClient._inFlight++;
      return true;
    }
    // Wait up to 30 s for a slot, then fail fast (surfaces as 503 upstream).
    // NOTE: when a waiter is granted, the releasing side has TRANSFERRED its
    // permit (it did not decrement _inFlight), so the waiter must NOT
    // increment — this keeps the cap exact under races.
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const i = MaxCoreAIClient._waiters.indexOf(grant);
        if (i >= 0) MaxCoreAIClient._waiters.splice(i, 1);
        resolve(false);
      }, 30_000);
      const grant = () => {
        clearTimeout(timer);
        resolve(true);
      };
      MaxCoreAIClient._waiters.push(grant);
    });
  }

  private static releaseSlot(): void {
    const next = MaxCoreAIClient._waiters.shift();
    if (next) {
      // Transfer the permit directly to the waiter — _inFlight stays the same.
      next();
      return;
    }
    MaxCoreAIClient._inFlight = Math.max(0, MaxCoreAIClient._inFlight - 1);
  }

  // Circuit breaker: after CB_THRESHOLD consecutive network failures/timeouts,
  // open for CB_COOLDOWN_MS and fail fast (null → 503 upstream) instead of
  // stacking 10-min hung sockets. One half-open probe closes it on success.
  private static readonly CB_THRESHOLD = 3;
  private static readonly CB_COOLDOWN_MS = 60_000;
  private static _cbFailures = 0;
  private static _cbOpenUntil = 0;
  private static _cbProbing = false;

  private static cbBlocked(): boolean {
    if (Date.now() < MaxCoreAIClient._cbOpenUntil) return true;
    if (MaxCoreAIClient._cbOpenUntil > 0) {
      // Cooldown elapsed → half-open. Allow exactly one probe at a time.
      if (MaxCoreAIClient._cbProbing) return true;
      MaxCoreAIClient._cbProbing = true;
      return false;
    }
    return false;
  }

  /** Call when the probe (or any call) could not complete an HTTP round-trip
   *  for a reason that is NOT a MaxCore network failure (e.g. bulkhead full).
   *  Frees the half-open probe slot without changing breaker state. */
  private static cbAbortProbe(): void {
    MaxCoreAIClient._cbProbing = false;
  }

  /** Any completed upstream HTTP response (regardless of status code) means
   *  MaxCore is reachable — close the breaker and reset the failure streak. */
  private static cbRecordSuccess(): void {
    MaxCoreAIClient._cbFailures = 0;
    MaxCoreAIClient._cbOpenUntil = 0;
    MaxCoreAIClient._cbProbing = false;
  }

  private static cbRecordFailure(path: string): void {
    MaxCoreAIClient._cbFailures++;
    MaxCoreAIClient._cbProbing = false;
    if (MaxCoreAIClient._cbFailures >= MaxCoreAIClient.CB_THRESHOLD) {
      MaxCoreAIClient._cbOpenUntil = Date.now() + MaxCoreAIClient.CB_COOLDOWN_MS;
      logger.warn(
        `[MaxCoreAI] Circuit breaker OPEN after ${MaxCoreAIClient._cbFailures} consecutive failures (last: ${path}) — failing fast for ${MaxCoreAIClient.CB_COOLDOWN_MS / 1000}s`,
      );
      // MaxCore is designed to stay up — a circuit-open is a genuinely unexpected
      // condition.  Report as "warning" (not error) since self-healing is automatic.
      import("../instrument.js")
        .then(({ captureSentryMessage }) => {
          captureSentryMessage(
            "MaxCore circuit breaker opened — unexpected connectivity loss",
            "warning",
            {
              failures: MaxCoreAIClient._cbFailures,
              cooldownMs: MaxCoreAIClient.CB_COOLDOWN_MS,
              lastPath: path,
            },
          );
        })
        .catch(() => { /* instrument not yet loaded — non-fatal */ });
    }
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
        // 10 s: metadata GETs should be fast; 60 s caused hung sockets when
        // the API endpoint was unresponsive (returned 0 bytes).
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
      logger.debug(`[MaxCoreAI] GET ${path} failed: ${(e as Error).message}`);
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
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
      });
      if (!r?.ok || !MaxCoreAIClient.isJson(r)) {
        logger.debug(
          `[MaxCoreAI] poll ${path} → HTTP ${r?.status} (continuing)`,
        );
        return null;
      }
      return (await r?.json()) as T;
    } catch (e) {
      logger.debug(
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
  // MaxCore has no server-side timeouts — allow up to 10 min for generation.
  private static readonly GENERATE_TIMEOUT_MS = 600_000;

  static async generate<T = any>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint?.startsWith("/api/") ? endpoint : `/api${endpoint}`;

    if (MaxCoreAIClient.isEndpointSuppressed(path)) {
      logger.debug(
        `[MaxCoreAI] generate ${path} — skipping (endpoint suppressed)`,
      );
      return null;
    }

    // Circuit breaker: fail fast while MaxCore is known-down.
    if (MaxCoreAIClient.cbBlocked()) {
      logger.debug(`[MaxCoreAI] generate ${path} — circuit open, failing fast`);
      return null;
    }

    // Health-probe fast-fail: if the lightweight ping already confirmed MaxCore
    // is unreachable, don't queue a 600 s hanging socket — return null now.
    // (null → false means "no info yet" → allow through on first call)
    if (MaxCoreAIClient._remoteAvailable === false) {
      logger.debug(`[MaxCoreAI] generate ${path} — health probe says unreachable, skipping`);
      return null;
    }

    // Bulkhead: cap concurrent long-held sockets.
    if (!(await MaxCoreAIClient.acquireSlot())) {
      // Not a MaxCore failure — free the half-open probe slot if we held it.
      MaxCoreAIClient.cbAbortProbe();
      logger.warn(`[MaxCoreAI] generate ${path} — bulkhead full (30 s wait), failing fast`);
      return null;
    }

    try {
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
          logger.debug(
            `[MaxCoreAI] generate ${path} network error: ${(e as Error).message}`,
          );
          return null;
        }
      };

      let result = await attempt();

      // Retry once on 503 circuit-breaker — wait the suggested cooldown then try again
      if (result && result.r.status === 503) {
        const retryMs = parseCbRetryMs(result.text);
        logger.debug(
          `[MaxCoreAI] generate ${path} — 503 circuit-breaker, retrying in ${retryMs}ms`,
        );
        await new Promise((res) => setTimeout(res, retryMs));
        result = await attempt();
      }

      if (!result) {
        MaxCoreAIClient.cbRecordFailure(path);
        return null;
      }

      // Any completed HTTP response (even non-2xx) proves MaxCore is reachable.
      MaxCoreAIClient.cbRecordSuccess();

      const { r, text } = result;

      if (r.ok && MaxCoreAIClient.isJson(r)) {
        try {
          const data = JSON.parse(text);
          MaxCoreAIClient._remoteAvailable = true;
          MaxCoreAIClient._lastCheck = Date.now();
          MaxCoreAIClient._endpointSuppressed.delete(path);
          logger.debug(`[MaxCoreAI] generate ${path} → success`);
          return data as T;
        } catch {
          return null;
        }
      }

      const failReason = `HTTP ${r.status}`;
      logger.debug(
        `[MaxCoreAI] generate ${path} → ${failReason} — returning null`,
      );
      if (r.status === 404 || r.status === 405) {
        MaxCoreAIClient._endpointSuppressed.set(
          path,
          Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS,
        );
      }
      // HTTP error responses mean MaxCore is up (responding) — not a CB event.
      return null;
    } finally {
      MaxCoreAIClient.releaseSlot();
    }
  }

  /**
   * Infer via MaxCore remote server.
   * - 45 s timeout to cover Replit cold-start wake-up.
   * - On 503 with circuit-breaker body, waits the suggested retry delay and
   *   retries once before returning null.
   */
  // MaxCore has no server-side timeouts — allow up to 10 min for inference.
  private static readonly INFER_TIMEOUT_MS = 600_000;

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

    // Circuit breaker: fail fast while MaxCore is known-down.
    if (MaxCoreAIClient.cbBlocked()) {
      logger.debug(`[MaxCoreAI] infer ${path} — circuit open, failing fast`);
      return null;
    }

    // Health-probe fast-fail: avoids queuing a 600 s hanging socket when the
    // lightweight ping already confirmed MaxCore is unreachable.
    if (MaxCoreAIClient._remoteAvailable === false) {
      logger.debug(`[MaxCoreAI] infer ${path} — health probe says unreachable, skipping`);
      return null;
    }

    // Bulkhead: cap concurrent long-held sockets.
    if (!(await MaxCoreAIClient.acquireSlot())) {
      // Not a MaxCore failure — free the half-open probe slot if we held it.
      MaxCoreAIClient.cbAbortProbe();
      logger.warn(`[MaxCoreAI] infer ${path} — bulkhead full (30 s wait), failing fast`);
      return null;
    }

    try {
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

      if (!result) {
        MaxCoreAIClient.cbRecordFailure(path);
        return null;
      }

      // Any completed HTTP response (even non-2xx) proves MaxCore is reachable.
      MaxCoreAIClient.cbRecordSuccess();

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
      // HTTP error responses mean MaxCore is up — not a CB event.
      return null;
    } finally {
      MaxCoreAIClient.releaseSlot();
    }
  }
}

/**
 * Check MaxCore availability using the lightweight model-info endpoint.
 * This is a metadata GET — it never queues AI work on MaxCore's side.
 * Returns true if MaxCore responded with 2xx.
 */
async function pingMaxCoreHealth(): Promise<boolean> {
  if (!MC_AI_URL || !MC_AI_KEY) return false;
  try {
    const r = await fetch(`${MC_AI_URL}/api/platform/model/info`, {
      method: "GET",
      headers: { Authorization: `Bearer ${MC_AI_KEY}` },
      // 10 s: if MaxCore's API is working it responds in <1 s.
      // 60 s was longer than the 55 s poll interval, so timed-out pings were
      // always in-flight, permanently setting _remoteAvailable = false and
      // causing generate/infer to fast-fail even when the server is alive.
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    // r.ok = 2xx status. Also require JSON content-type so a 200 HTML page
    // (MaxCore's SPA catch-all) doesn't register as a healthy API response.
    const ct = r.headers.get("content-type") ?? "";
    return r.ok && (ct.includes("application/json") || ct.includes("text/json"));
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    // Distinguish "API endpoint hangs / timed out" (server up, API broken)
    // from "connection refused" (server fully down).
    if (msg.includes("timed out") || msg.includes("The operation was aborted")) {
      logger.debug("[MaxCoreAI] Health ping: server reachable but API not responding (timeout)");
    }
    return false;
  }
}

/**
 * Liveness monitor for the local MaxCore subsystem (55 s poll).
 * MaxCore runs in-process under supervision — this is NOT a remote keepalive;
 * it only tracks availability across the child's boot/crash-respawn window
 * and fires onReconnect so deferred work (e.g. BeatMoneyLoop) reschedules.
 */
export function startMaxCoreLLMWarmth(): void {
  if (!MC_AI_URL || !MC_AI_KEY) return;

  const WARMTH_INTERVAL_MS = 55_000;
  let _consecutiveFailures = 0;

  const pingWithTracking = () => {
    pingMaxCoreHealth().then((ok) => {
      if (ok) {
        const wasDown = _consecutiveFailures > 0;
        if (wasDown) {
          logger.info(`[MaxCoreAI] ✅ MaxCore reconnected after ${_consecutiveFailures} failed ping(s)`);
        }
        _consecutiveFailures = 0;
        MaxCoreAIClient._remoteAvailable = true;
        MaxCoreAIClient._lastCheck = Date.now();
        // Notify registered subsystems (e.g. BeatMoneyLoop) so they can
        // reschedule work that was deferred while MaxCore was unreachable.
        if (wasDown && MaxCoreAIClient.onReconnect) {
          try { MaxCoreAIClient.onReconnect(); } catch { /* non-fatal */ }
        }
        logger.debug("[MaxCoreAI] Health ping → MaxCore alive ✅");
      } else {
        _consecutiveFailures++;
        // Log first failure immediately, then only every 10th to avoid
        // flooding the console while the local child restarts.
        if (_consecutiveFailures === 1 || _consecutiveFailures % 10 === 0) {
          logger.warn(
            `[MaxCoreAI] Health ping failed (failure #${_consecutiveFailures}) — local MaxCore child not responding (supervisor will respawn it)`,
          );
        }
      }
    });
  };

  // First health check after 5 s
  const firstPing = setTimeout(pingWithTracking, 5_000);
  if (firstPing?.unref) firstPing.unref();

  const t = setInterval(pingWithTracking, WARMTH_INTERVAL_MS);
  if (t?.unref) t.unref();

  logger.info(
    "[MaxCoreAI] Health pinger started — polling /api/platform/model/info every 55s (10s timeout)",
  );
}

if (MC_AI_URL && MC_AI_KEY) {
  logger.info(
    `[MaxCoreAI] Configured — local subsystem: ${MC_AI_URL} | MaxCore is the only AI source`,
  );
  // No wake ping needed: MaxCore is an in-process child whose lifecycle is
  // owned by the local supervisor. The 55s liveness monitor tracks readiness.
} else {
  logger.warn(
    "[MaxCoreAI] No remote URL/key configured — all generate/infer calls will return null",
  );
}
