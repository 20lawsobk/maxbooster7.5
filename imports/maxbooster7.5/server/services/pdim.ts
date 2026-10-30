/**
 * Max Booster — PDIM Service Interface (Self-Confinement Layer)
 *
 * Thin wrapper over the existing pdimClient that reads credentials
 * from the unified `config` object. Provides the canonical `callPdim`
 * function defined in the self-confinement spec.
 */

import { config } from "../config/index.js";
import { logger } from "../logger.js";

export interface PdimResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

/**
 * POST to a PDIM / Pocket Dimension endpoint.
 *
 * @param endpoint - Path relative to PDIM_EXEC_URL
 * @param payload  - JSON body to send
 */
export async function callPdim<T = unknown>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<PdimResponse<T>> {
  const baseUrl = config.pdimUrl;
  const token = config.pdimToken;

  if (!baseUrl) {
    throw new Error("[PDIM] PDIM_EXEC_URL is not configured");
  }

  const url = endpoint ? `${baseUrl}${endpoint}` : baseUrl;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ url, status: res.status, body: text }, "[PDIM] non-2xx response");
    throw new Error(`[PDIM] ${res.status} ${res.statusText}: ${text}`);
  }

  const data = (await res.json()) as T;
  return { data, status: res.status, ok: true };
}

/** Ping PDIM — returns true if reachable. */
export async function pingPdim(): Promise<boolean> {
  try {
    const res = await fetch(config.pdimUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.pdimToken}`,
      },
      body: JSON.stringify({ command: "PING" }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
