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
  private static readonly ENDPOINT_SUPPRESS_MS = 10 * 60_000;

  private static isEndpointSuppressed(path: string): boolean {
    const suppressedUntil = MaxCoreAIClient._endpointSuppressed.get(path) ?? 0;
    return Date.now() < suppressedUntil;
  }

  private static suppressEndpoint(path: string): void {
    MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 10 min — local engine active`);
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
   * Infer via MaxCore.
   * Priority:
   *   1. Remote training server (secure-ai-forge.replit.app) — when online
   *   2. MaxCore Local Engine — always succeeds, zero-latency fallback
   */
  static async infer<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    if (MC_AI_URL && MC_AI_KEY && MaxCoreAIClient._remoteAvailable !== false) {
      const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
      if (!MaxCoreAIClient.isEndpointSuppressed(path)) {
        try {
          const r = await fetch(`${MC_AI_URL}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'X-API-Key':     MC_AI_KEY,
              'Authorization': `Bearer ${MC_AI_KEY}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12000),
          });
          const isJson = MaxCoreAIClient.isJson(r);
          if (r.status === 404 || !isJson) {
            MaxCoreAIClient.suppressEndpoint(path);
          } else if (r.ok) {
            const data = await r.json();
            logger.debug(`[MaxCoreAI] Remote ${path} → success`);
            return data as T;
          } else {
            const errBody = await r.json().catch(() => null) as any;
            logger.debug(`[MaxCoreAI] Remote ${path} ${r.status}: ${errBody?.error ?? 'unavailable'} — routing to local engine`);
          }
        } catch (e: any) {
          logger.debug(`[MaxCoreAI] Remote ${path} unreachable (${e.message}) — routing to local engine`);
        }
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

if (MC_AI_URL && MC_AI_KEY) {
  logger.info(`[MaxCoreAI] Configured — remote: ${MC_AI_URL} | local engine: always active`);
} else {
  logger.info('[MaxCoreAI] No remote URL set — MaxCore Local Engine active as primary');
}
