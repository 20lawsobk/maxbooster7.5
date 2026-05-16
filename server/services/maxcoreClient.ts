/**
 * MaxCore AI HTTP Client — TF-free
 *
 * Standalone module that connects to the MaxCore training server
 * (secure-ai-forge.replit.app).
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

  // Suppress only stable named endpoints (e.g. /api/generate/content) that
  // return 404 or non-JSON — never unique per-job poll paths.
  private static _endpointSuppressed = new Map<string, number>();
  private static readonly ENDPOINT_SUPPRESS_MS = 2 * 60_000;

  private static isEndpointSuppressed(path: string): boolean {
    const suppressedUntil = MaxCoreAIClient._endpointSuppressed.get(path) ?? 0;
    return Date.now() < suppressedUntil;
  }

  private static suppressEndpoint(path: string): void {
    MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 2 min`);
  }

  private static isJson(r: Response): boolean {
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') || ct.includes('text/json');
  }

  private static authHeaders(): Record<string, string> {
    return {
      'X-API-Key':     MC_AI_KEY,
      'Authorization': `Bearer ${MC_AI_KEY}`,
    };
  }

  /** Always returns true — MaxCore is always running. */
  static async isAvailable(): Promise<boolean> {
    if (MC_AI_URL && MC_AI_KEY) {
      const now = Date.now();
      if (MaxCoreAIClient._remoteAvailable === null || now - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL) {
        fetch(`${MC_AI_URL}/api/health`, {
          headers: MaxCoreAIClient.authHeaders(),
          signal:  AbortSignal.timeout(4000),
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

  /**
   * GET a stable named endpoint (suppression applies on permanent failures).
   * Do NOT use this for per-job poll paths — use poll() instead.
   */
  static async get<T = any>(endpoint: string): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
    if (MaxCoreAIClient.isEndpointSuppressed(path)) return null;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method:  'GET',
        headers: MaxCoreAIClient.authHeaders(),
        signal:  AbortSignal.timeout(8000),
      });
      if (!r.ok || !MaxCoreAIClient.isJson(r)) {
        MaxCoreAIClient.suppressEndpoint(path);
        return null;
      }
      return await r.json() as T;
    } catch (e) {
      logger.debug(`[MaxCoreAI] GET ${path} failed: ${e.message}`);
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
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method:  'GET',
        headers: MaxCoreAIClient.authHeaders(),
        signal:  AbortSignal.timeout(15_000),
      });
      if (!r.ok || !MaxCoreAIClient.isJson(r)) {
        // Not suppressed — log at debug and let caller continue polling
        logger.debug(`[MaxCoreAI] poll ${path} → HTTP ${r.status} (continuing)`);
        return null;
      }
      return await r.json() as T;
    } catch (e) {
      logger.debug(`[MaxCoreAI] poll ${path} network error (continuing): ${e.message}`);
      return null;
    }
  }

  /**
   * Call MaxCore's generation endpoint — single attempt, no retries.
   * MaxCore is always running; if it returns an error it is temporarily busy
   * (e.g. 504 under diffusion training load).  The caller's local fallback
   * handles the null return, so there is nothing to retry.
   */
  // 60 s covers MaxCore generation latency under diffusion training load
  // (~16 s warm, up to ~50 s when the training loop is active).
  private static readonly GENERATE_TIMEOUT_MS = 60_000;

  static async generate<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;

    // Short-circuit when this endpoint recently returned an error — prevents
    // concurrent callers (e.g. score-calibrator + autopilot burst) from all
    // hammering MaxCore at the same moment.
    if (MaxCoreAIClient.isEndpointSuppressed(path)) {
      logger.debug(`[MaxCoreAI] generate ${path} — skipping (endpoint suppressed)`);
      return null;
    }

    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...MaxCoreAIClient.authHeaders() },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(MaxCoreAIClient.GENERATE_TIMEOUT_MS),
      });

      if (r.ok && MaxCoreAIClient.isJson(r)) {
        const data = await r.json();
        MaxCoreAIClient._endpointSuppressed.delete(path);
        logger.debug(`[MaxCoreAI] generate ${path} → success`);
        return data as T;
      }

      const failReason = `HTTP ${r.status} (content-type: ${r.headers.get('content-type') ?? 'none'})`;
      logger.debug(`[MaxCoreAI] generate ${path} → ${failReason} — local fallback`);
      MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
      return null;
    } catch (e) {
      logger.debug(`[MaxCoreAI] generate ${path} failed: ${(e as Error).message} — local fallback`);
      return null;
    }
  }

  /**
   * Infer via MaxCore remote server — single attempt, no retries.
   * MaxCore is always running; if it returns an error it is temporarily busy
   * (e.g. 504 under diffusion training load).  The caller's local fallback
   * handles the null return immediately — no retry needed.
   * Timeout is deliberately generous (60 s) so video-job submissions and other
   * heavy operations complete even under diffusion training load.
   */
  private static readonly INFER_TIMEOUT_MS = 60_000;

  static async infer<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;

    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;

    // Short-circuit within this process when the endpoint recently returned an
    // error — prevents concurrent autopilot requests from all hammering MaxCore
    // at the same moment and gets the Tier-3 local fallback faster.
    if (MaxCoreAIClient.isEndpointSuppressed(path)) {
      logger.debug(`[MaxCoreAI] infer ${path} — skipping (endpoint suppressed, using fallback)`);
      return null;
    }

    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...MaxCoreAIClient.authHeaders() },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(MaxCoreAIClient.INFER_TIMEOUT_MS),
      });

      if (r.ok && MaxCoreAIClient.isJson(r)) {
        const data = await r.json();
        logger.debug(`[MaxCoreAI] infer ${path} → success`);
        MaxCoreAIClient._remoteAvailable = true;
        MaxCoreAIClient._endpointSuppressed.delete(path);
        return data as T;
      }

      const failReason = `HTTP ${r.status} (content-type: ${r.headers.get('content-type') ?? 'none'})`;
      logger.debug(`[MaxCoreAI] infer ${path} → ${failReason} — local fallback`);
      MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
      return null;
    } catch (e) {
      logger.debug(`[MaxCoreAI] infer ${path} failed: ${(e as Error).message} — local fallback`);
      return null;
    }
  }
}

/**
 * Keep MaxCore's LLM warm by sending a lightweight generate request on a
 * regular heartbeat so the first real request never pays a cold-start penalty.
 */
export function startMaxCoreLLMWarmth(): void {
  if (!MC_AI_URL || !MC_AI_KEY) return;

  const WARMTH_INTERVAL_MS = 90_000;

  const ping = () => {
    fetch(`${MC_AI_URL}/api/generate/content`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     MC_AI_KEY,
        'Authorization': `Bearer ${MC_AI_KEY}`,
      },
      body:   JSON.stringify({ topic: 'music artist brand new release', platform: 'instagram', tone: 'energetic' }),
      // Match the generate() timeout so warmth pings actually complete when
      // MaxCore is busy with the diffusion training loop.
      signal: AbortSignal.timeout(MaxCoreAIClient.GENERATE_TIMEOUT_MS),
    }).catch(() => {});
  };

  // Delay the first ping by 120 s — the ScoreCalibrator fires 5 sequential
  // generate calls at t=+15 s (each ~16 s) and finishes around t=+100 s.
  // Delaying keeps the warmth ping from piling onto those in-flight requests
  // and causing cold-start timeouts on the single-threaded MaxCore LLM.
  const firstPing = setTimeout(ping, 120_000);
  if (firstPing.unref) firstPing.unref();
  const t = setInterval(ping, WARMTH_INTERVAL_MS);
  if (t.unref) t.unref();
  logger.info('[MaxCoreAI] LLM warmth pinger started — pinging every 90s to prevent cold-start latency');
}

if (MC_AI_URL && MC_AI_KEY) {
  logger.info(`[MaxCoreAI] Configured — remote: ${MC_AI_URL} | MaxCore is the only source (no local fallback)`);
} else {
  logger.warn('[MaxCoreAI] No remote URL/key configured — all generate/infer calls will return null');
}
