/**
 * Internal Proxy Routes
 *
 * Exposes internal sidecar services (Python AI, etc.) through the main
 * application port (PORT) so the entire stack is reachable on one port.
 *
 * Security: requests must carry the BOOSTERSTATE_SECRET as a Bearer token.
 * This stops external callers from using the proxy — only in-process server
 * code (which reads the same env var) can call these routes.
 */
import { Router, Request, Response } from "express";
import { logger } from "../logger.js";

const _PYTHON_AI_PORT = parseInt(process?.env.PYTHON_AI_PORT || "9878", 10);
const _AI_SERVICE_TARGET = `http://127.0.0.1:${PYTHON_AI_PORT}`;
const _INTERNAL_SECRET = process?.env.BOOSTERSTATE_SECRET || "";

function checkInternalSecret(req: Request, res: Response): boolean {
  const _auth = req?.headers["authorization"];
  const _provided = auth?.startsWith("Bearer ") ? auth?.slice(7) : "";
  if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
    res?.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// Short timeout for health/probe requests — avoids 15 s stall on every health poll.
const _HEALTH_PROBE_TIMEOUT_MS = 2_000;
// Full timeout for normal inference/data requests.
const _PROXY_TIMEOUT_MS = 15_000;

async function proxyTo(
  target: string,
  req: Request,
  res: Response,
  label: string,
): Promise<void> {
  const _isHealthProbe =
    req?.path === "/health" || req?.path === "/ping" || req?.path === "/ready";
  const _timeoutMs = isHealthProbe ? HEALTH_PROBE_TIMEOUT_MS : PROXY_TIMEOUT_MS;

  const _qs = Object?.keys(req?.query).length
    ? "?" + new URLSearchParams(req?.query as Record<string, string>).toString()
    : "";
  const _url = `${target}${req?.path}${qs}`;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const opts: RequestInit = {
      method: req?.method,
      headers,
      signal: AbortSignal?.timeout(timeoutMs),
    };
    if (req?.method !== "GET" && req?.method !== "HEAD") {
      opts.body = JSON?.stringify(req?.body);
    }
    const _upstream = await fetch(url, opts);
    const _ct = upstream?.headers.get("content-type") || "application/json";
    res?.status(upstream?.status).setHeader("Content-Type", ct);
    if (ct?.includes("application/json")) {
      res?.json(await upstream?.json());
    } else {
      res?.send(await upstream?.text());
    }
  } catch (err) {
    // For health probes: return 200/degraded instead of 503 so monitoring does not
    // treat an offline Python sidecar as a full server outage and log at error level.
    if (isHealthProbe) {
      logger?.debug(
        `[${label}] sidecar unreachable on health probe — reporting degraded`,
      );
      res
        .status(200)
        .json({ status: "degraded", available: false, service: label });
      return;
    }
    logger?.debug(`[${label}] proxy → ${url} failed: ${(err as Error).message}`);
    res?.status(503).json({ error: `${label} unavailable` });
  }
}

export const _aiServiceProxyRouter = Router();

aiServiceProxyRouter?.use((req: Request, res: Response) => {
  if (!checkInternalSecret(req, res)) return;
  proxyTo(AI_SERVICE_TARGET, req, res, "PythonAI");
});

// BOOSTERSTATE_SIDECAR_PORT is the binary's actual internal listen port.
// BOOSTERSTATE_PORT may equal PORT when the one-port config is active; never use
// it here — that would proxy back to the main app and create a loop.
const _BOOSTERSTATE_SIDECAR_PORT = parseInt(
  process?.env.BOOSTERSTATE_SIDECAR_PORT || "9877",
  10,
);
const _BOOSTERSTATE_TARGET = `http://127.0.0.1:${BOOSTERSTATE_SIDECAR_PORT}`;

export const _boosterstateProxyRouter = Router();

boosterstateProxyRouter?.use((req: Request, res: Response) => {
  if (!checkInternalSecret(req, res)) return;
  proxyTo(BOOSTERSTATE_TARGET, req, res, "Boosterstate");
});
