/**
 * MaxCore AI HTTP Client — TF-free
 *
 * Standalone module that connects to the MaxCore training server
 * (secure-ai-forge.replit.app) and the always-available MaxCore Local Engine.
 *
 * Intentionally has ZERO TensorFlow dependencies so it can be imported by any
 * module (e.g. advancedVideoRendererService) without pulling in native bindings.
 */

import { logger } from '../logger.js';
import { maxcoreLocalInfer } from './maxcoreLocalEngine.js';

const MC_AI_URL = process.env.AI_SERVER_URL || '';
const MC_AI_KEY = process.env.AI_SERVER_KEY || '';

export class MaxCoreAIClient {
  private static _remoteAvailable: boolean | null = null;
  private static _lastCheck = 0;
  private static readonly CHECK_TTL = 30_000;

  private static _endpointSuppressed = new Map<string, number>();
  // Cold-starts resolve in well under 2 minutes (warmth pinger fires every 90s).
  // Using 2 min instead of 10 min means a transient deployment hiccup un-suppresses
  // quickly rather than routing to local engine for the next 10 minutes.
  private static readonly ENDPOINT_SUPPRESS_MS = 2 * 60_000;

  private static isEndpointSuppressed(path: string): boolean {
    const suppressedUntil = MaxCoreAIClient._endpointSuppressed.get(path) ?? 0;
    return Date.now() < suppressedUntil;
  }

  private static suppressEndpoint(path: string): void {
    MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 2 min — local engine active`);
  }

  private static isJson(r: Response): boolean {
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') || ct.includes('text/json');
  }

  /** Always returns true — MaxCore Local Engine guarantees availability. */
  static async isAvailable(): Promise<boolean> {
    if (MC_AI_URL && MC_AI_KEY) {
      const now = Date.now();
      if (MaxCoreAIClient._remoteAvailable === null || now - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL) {
        fetch(`${MC_AI_URL}/api/health`, {
          headers: { 'X-API-Key': MC_AI_KEY, 'Authorization': `Bearer ${MC_AI_KEY}` },
          signal: AbortSignal.timeout(4000),
        }).then(r => {
          MaxCoreAIClient._remoteAvailable = r.ok && MaxCoreAIClient.isJson(r);
          if (MaxCoreAIClient._remoteAvailable) logger.info('[MaxCoreAI] Remote server is online ✅');
        }).catch(() => {
          MaxCoreAIClient._remoteAvailable = false;
        });
        MaxCoreAIClient._lastCheck = now;
      }
    }
    return true;
  }

  static async get<T = any>(endpoint: string): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
    if (MaxCoreAIClient.isEndpointSuppressed(path)) return null;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method: 'GET',
        headers: { 'X-API-Key': MC_AI_KEY, 'Authorization': `Bearer ${MC_AI_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok || !MaxCoreAIClient.isJson(r)) {
        MaxCoreAIClient.suppressEndpoint(path);
        return null;
      }
      return await r.json() as T;
    } catch (e: any) {
      logger.debug(`[MaxCoreAI] GET ${path} failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Call MaxCore's generation endpoint with retry + back-off.
   * Up to MAX_GENERATE_ATTEMPTS remote attempts. Permanent failures (404, non-JSON)
   * suppress the endpoint for 2 min. Transient failures (network, 5xx) retry
   * with exponential back-off + jitter so a single hiccup never kills a topic.
   * Falls back to the MaxCore Local Engine if remote is unavailable or exhausted.
   */
  private static readonly MAX_GENERATE_ATTEMPTS = 3;
  private static readonly GENERATE_BACKOFF_BASE  = 1_500;  // ms
  private static readonly GENERATE_BACKOFF_MAX   = 8_000;  // ms

  static async generate<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;

    // No remote configured, or endpoint in suppress window → go straight to local engine
    if (!MC_AI_URL || !MC_AI_KEY || MaxCoreAIClient.isEndpointSuppressed(path)) {
      try {
        const localResult = await maxcoreLocalInfer(body as any);
        return localResult as unknown as T;
      } catch {
        return null;
      }
    }

    for (let attempt = 0; attempt < MaxCoreAIClient.MAX_GENERATE_ATTEMPTS; attempt++) {
      try {
        const r = await fetch(`${MC_AI_URL}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'X-API-Key':     MC_AI_KEY,
            'Authorization': `Bearer ${MC_AI_KEY}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });

        const isJson = MaxCoreAIClient.isJson(r);

        // Permanent failure — do not retry
        if (r.status === 404 || !isJson) {
          MaxCoreAIClient.suppressEndpoint(path);
          return null;
        }

        if (r.ok) {
          const data = await r.json();
          logger.debug(`[MaxCoreAI] generate ${path} → success`);
          return data as T;
        }

        // 5xx or other transient failure — retry
        logger.debug(`[MaxCoreAI] generate ${path} attempt ${attempt + 1} → ${r.status}`);
      } catch (e: any) {
        // Network error / timeout — retry
        logger.debug(`[MaxCoreAI] generate ${path} attempt ${attempt + 1} failed: ${e.message}`);
      }

      if (attempt < MaxCoreAIClient.MAX_GENERATE_ATTEMPTS - 1) {
        const ceiling = Math.min(
          MaxCoreAIClient.GENERATE_BACKOFF_MAX,
          MaxCoreAIClient.GENERATE_BACKOFF_BASE * Math.pow(2, attempt)
        );
        await new Promise(res => setTimeout(res, Math.random() * ceiling));
      }
    }

    logger.warn(`[MaxCoreAI] generate ${path} — all ${MaxCoreAIClient.MAX_GENERATE_ATTEMPTS} remote attempts failed — falling back to local engine`);
    try {
      const localResult = await maxcoreLocalInfer(body as any);
      logger.debug(`[MaxCoreAI] generate local engine fallback (confidence=${localResult.confidence})`);
      return localResult as unknown as T;
    } catch (localErr: any) {
      logger.error(`[MaxCoreAI] generate local engine fallback error: ${localErr.message}`);
      return null;
    }
  }

  // Timeout for infer() remote attempts — set above the 12-15s cold-start
  // window so a freshly-warming LLM can respond before we give up.
  private static readonly INFER_TIMEOUT_MS  = 18_000;
  private static readonly INFER_MAX_RETRIES = 2;   // transient failures get 2 extra tries
  private static readonly INFER_BACKOFF_BASE = 800; // ms

  /**
   * Infer via MaxCore.
   * Priority:
   *   1. Remote training server (secure-ai-forge.replit.app) — when online
   *      Up to INFER_MAX_RETRIES retries for transient failures (5xx, network)
   *      before falling through to the local engine.
   *   2. MaxCore Local Engine — always succeeds, zero-latency fallback
   */
  static async infer<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    // If the remote was previously marked unavailable, clear that after the TTL so
    // transient startup failures (e.g. MaxCore waking up) don't permanently block calls.
    if (MaxCoreAIClient._remoteAvailable === false &&
        Date.now() - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL) {
      MaxCoreAIClient._remoteAvailable = null;
    }

    if (MC_AI_URL && MC_AI_KEY && MaxCoreAIClient._remoteAvailable !== false) {
      const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
      if (!MaxCoreAIClient.isEndpointSuppressed(path)) {
        for (let attempt = 0; attempt <= MaxCoreAIClient.INFER_MAX_RETRIES; attempt++) {
          try {
            const r = await fetch(`${MC_AI_URL}${path}`, {
              method: 'POST',
              headers: {
                'Content-Type':  'application/json',
                'X-API-Key':     MC_AI_KEY,
                'Authorization': `Bearer ${MC_AI_KEY}`,
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(MaxCoreAIClient.INFER_TIMEOUT_MS),
            });
            const isJson = MaxCoreAIClient.isJson(r);

            // Permanent failure — suppress and fall to local engine immediately.
            // 404 means the endpoint doesn't exist at all on this deployment;
            // non-JSON means the server returned an HTML error page.
            if (r.status === 404 || !isJson) {
              MaxCoreAIClient.suppressEndpoint(path);
              break; // exit retry loop → fall through to local engine
            }

            if (r.ok) {
              const data = await r.json();
              logger.debug(`[MaxCoreAI] Remote ${path} → success (attempt ${attempt + 1})`);
              return data as T;
            }

            // Transient server error (5xx, 429, etc.) — retry with back-off
            logger.debug(`[MaxCoreAI] Remote ${path} attempt ${attempt + 1} → ${r.status} (transient)`);
          } catch (e: any) {
            // Network error or timeout — retry
            logger.debug(`[MaxCoreAI] Remote ${path} attempt ${attempt + 1} failed: ${e.message}`);
          }

          // Back-off before next attempt (not after the last one)
          if (attempt < MaxCoreAIClient.INFER_MAX_RETRIES) {
            const delay = Math.random() * MaxCoreAIClient.INFER_BACKOFF_BASE * Math.pow(2, attempt);
            await new Promise(res => setTimeout(res, delay));
          }
        }
        logger.debug(`[MaxCoreAI] Remote ${path} all attempts exhausted — routing to local engine`);
      }
    }

    try {
      const localResult = await maxcoreLocalInfer(body as any);
      logger.debug(`[MaxCoreAI] Local engine produced response (confidence=${localResult.confidence})`);
      return localResult as unknown as T;
    } catch (localErr: any) {
      logger.error(`[MaxCoreAI] Local engine error: ${localErr.message}`);
      return null;
    }
  }
}

/**
 * Keep MaxCore's LLM warm by sending a lightweight generate request on a
 * regular heartbeat.  Without this, the model goes cold after ~2 minutes of
 * inactivity, causing the first real request to pay a 12-15s warm-up penalty
 * that risks timeouts under load.
 *
 * Call once at startup.  The interval is unref'd so it does not prevent exit.
 */
export function startMaxCoreLLMWarmth(): void {
  if (!MC_AI_URL || !MC_AI_KEY) return;

  const WARMTH_INTERVAL_MS = 90_000;   // 90 s — safely under the ~2 min idle window
  const WARMTH_TOPIC       = 'music artist brand new release';
  const WARMTH_PLATFORM    = 'instagram';

  const ping = () => {
    // Fire-and-forget — we do not await or process the response.
    // The sole purpose is to keep the LLM execution path hot.
    fetch(`${MC_AI_URL}/api/generate/content`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     MC_AI_KEY,
        'Authorization': `Bearer ${MC_AI_KEY}`,
      },
      body:   JSON.stringify({ topic: WARMTH_TOPIC, platform: WARMTH_PLATFORM }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {});  // silence errors — warmth pings are best-effort
  };

  // Send one ping immediately so the LLM is warm before the calibrator fires.
  ping();

  const t = setInterval(ping, WARMTH_INTERVAL_MS);
  if (t.unref) t.unref();   // don't block process exit
  logger.info('[MaxCoreAI] LLM warmth pinger started — pinging every 90s to prevent cold-start latency');
}

if (MC_AI_URL && MC_AI_KEY) {
  logger.info(`[MaxCoreAI] Configured — remote: ${MC_AI_URL} | local engine: always active`);
} else {
  logger.info('[MaxCoreAI] No remote URL set — MaxCore Local Engine active as primary');
}
