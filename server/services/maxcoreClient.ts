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
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 2 min — calls will return null until un-suppressed`);
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
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;

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

        if (r.ok && MaxCoreAIClient.isJson(r)) {
          const data = await r.json();
          logger.debug(`[MaxCoreAI] generate ${path} → success (attempt ${attempt + 1})`);
          return data as T;
        }

        logger.debug(`[MaxCoreAI] generate ${path} attempt ${attempt + 1} → HTTP ${r.status}`);
      } catch (e: any) {
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

    logger.error(`[MaxCoreAI] generate ${path} — all ${MaxCoreAIClient.MAX_GENERATE_ATTEMPTS} attempts failed (transient network issue)`);
    return null;
  }

  // Timeout for infer() remote attempts — set above the 12-15s cold-start
  // window so a freshly-warming LLM can respond before we give up.
  private static readonly INFER_TIMEOUT_MS  = 18_000;
  private static readonly INFER_MAX_RETRIES = 2;   // transient failures get 2 extra tries
  private static readonly INFER_BACKOFF_BASE = 800; // ms

  /**
   * Infer via MaxCore remote server.
   * MaxCore is always running — no availability gate, no endpoint suppression.
   * Up to INFER_MAX_RETRIES retries with exponential back-off for transient
   * network hiccups (never an availability issue).
   */
  static async infer<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;

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

        if (r.ok && MaxCoreAIClient.isJson(r)) {
          const data = await r.json();
          logger.debug(`[MaxCoreAI] infer ${path} → success (attempt ${attempt + 1})`);
          // Update remote available state on success
          MaxCoreAIClient._remoteAvailable = true;
          return data as T;
        }

        // Non-success HTTP status — retry for 5xx, log for others
        logger.debug(`[MaxCoreAI] infer ${path} attempt ${attempt + 1} → HTTP ${r.status}`);
      } catch (e: any) {
        // Network error or timeout — retry
        logger.debug(`[MaxCoreAI] infer ${path} attempt ${attempt + 1} failed: ${e.message}`);
      }

      if (attempt < MaxCoreAIClient.INFER_MAX_RETRIES) {
        const delay = Math.random() * MaxCoreAIClient.INFER_BACKOFF_BASE * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
      }
    }

    logger.error(`[MaxCoreAI] infer ${path} — all ${MaxCoreAIClient.INFER_MAX_RETRIES + 1} attempts failed (transient network issue)`);
    return null;
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
  logger.info(`[MaxCoreAI] Configured — remote: ${MC_AI_URL} | MaxCore is the only source (no local fallback)`);
} else {
  logger.warn('[MaxCoreAI] No remote URL/key configured — all generate/infer calls will return null');
}
