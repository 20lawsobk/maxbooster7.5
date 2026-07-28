/**
 * Max Booster — MaxCore Service Interface (Self-Confinement Layer)
 *
 * Thin wrapper over the maxcoreClient that reads credentials from the
 * unified `config` object instead of process.env directly.
 * Provides the canonical `callMaxcore` function defined in the
 * self-confinement spec.
 */

import { config } from "../config/index.js";
import { logger } from "../logger.js";

export interface MaxcoreResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

/**
 * POST to a MaxCore endpoint.
 *
 * @param endpoint - Path relative to MAXCORE_URL, e.g. "/api/generate/content"
 * @param payload  - JSON body to send
 */
export async function callMaxcore<T = unknown>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<MaxcoreResponse<T>> {
  const url = `${config.maxcoreUrl}${endpoint}`;
  const key = config.maxcoreAdminKey;

  if (!config.maxcoreUrl) {
    throw new Error("[MaxCore] MAXCORE_URL / AI_SERVER_URL is not configured");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ url, status: res.status, body: text }, "[MaxCore] non-2xx response");
    throw new Error(`[MaxCore] ${res.status} ${res.statusText}: ${text}`);
  }

  const data = (await res.json()) as T;
  return { data, status: res.status, ok: true };
}

/**
 * GET from a MaxCore endpoint.
 */
export async function getMaxcore<T = unknown>(
  endpoint: string,
): Promise<MaxcoreResponse<T>> {
  const url = `${config.maxcoreUrl}${endpoint}`;
  const key = config.maxcoreAdminKey;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`[MaxCore] GET ${endpoint} → ${res.status}`);
  }

  const data = (await res.json()) as T;
  return { data, status: res.status, ok: true };
}

/** Ping MaxCore — returns true if reachable. */
export async function pingMaxcore(): Promise<boolean> {
  try {
    const res = await fetch(`${config.maxcoreUrl}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
