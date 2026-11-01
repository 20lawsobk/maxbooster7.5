/**
 * Max Booster — MaxCore Service Interface (Self-Confinement Layer)
 *
 * Thin wrapper over the maxcoreClient that reads credentials from the
 * unified `config` object instead of process.env directly.
 * Provides the canonical `callMaxcore` function defined in the
 * self-confinement spec.
 */

import { logger } from "../logger.js";
import {
  getMaxcoreGenerationHeaders,
  isMaxcoreJson,
  maxcoreUrl,
} from "./maxcoreConnector.js";

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
  const url = maxcoreUrl(endpoint);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getMaxcoreGenerationHeaders(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ url, status: res.status, body: text }, "[MaxCore] non-2xx response");
    throw new Error(`[MaxCore] ${res.status} ${res.statusText}: ${text}`);
  }

  if (!isMaxcoreJson(res)) {
    throw new Error(`[MaxCore] ${res.status} returned a non-JSON response`);
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
  const url = maxcoreUrl(endpoint);

  const res = await fetch(url, {
    headers: getMaxcoreGenerationHeaders(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`[MaxCore] GET ${endpoint} → ${res.status}`);
  }

  if (!isMaxcoreJson(res)) {
    throw new Error(`[MaxCore] GET ${endpoint} returned a non-JSON response`);
  }
  const data = (await res.json()) as T;
  return { data, status: res.status, ok: true };
}

/** Ping MaxCore — returns true if reachable. */
export async function pingMaxcore(): Promise<boolean> {
  try {
    const res = await fetch(maxcoreUrl("/health"), {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
