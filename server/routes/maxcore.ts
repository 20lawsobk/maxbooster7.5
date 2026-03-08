import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

const router = Router();

const PEER = process.env.PEER_TRAINING_NODE || "http://localhost:8000";
const TIMEOUT_MS = 12_000;

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.user || (req.user as any).role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.use(requireAdmin);

async function peer(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts: RequestInit = {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${PEER}${path}`, opts);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    const offline = err.name === "AbortError" || err.code === "ECONNREFUSED";
    return {
      ok: false,
      status: offline ? 503 : 500,
      data: { error: offline ? "MaxCore machine is offline or unreachable" : String(err) },
    };
  } finally {
    clearTimeout(timer);
  }
}

function send(res: Response, result: { ok: boolean; status: number; data: unknown }) {
  res.status(result.ok ? 200 : result.status).json(result.data);
}

// ── Status & diagnostics ──────────────────────────────────────────────────────

router.get("/status", async (_req, res) => {
  const result = await peer("GET", "/control/status");
  if (!result.ok) {
    const health = await peer("GET", "/health");
    return send(res, health.ok ? health : result);
  }
  send(res, result);
});

router.get("/health", async (_req, res) => {
  send(res, await peer("GET", "/health"));
});

router.get("/logs", async (req, res) => {
  const n = Math.min(Number(req.query.n) || 300, 1000);
  send(res, await peer("GET", `/control/logs?n=${n}`));
});

router.delete("/logs", async (_req, res) => {
  send(res, await peer("DELETE", "/control/logs"));
});

// ── Training control ──────────────────────────────────────────────────────────

router.get("/train/status", async (_req, res) => {
  send(res, await peer("GET", "/train/status"));
});

router.post("/train/start", async (_req, res) => {
  logger.info("[MaxCore] Remote train/start triggered");
  send(res, await peer("POST", "/train/start"));
});

router.post("/train/stop", async (_req, res) => {
  logger.info("[MaxCore] Remote train/stop triggered");
  send(res, await peer("POST", "/train/stop"));
});

router.post("/train/trigger-session", async (_req, res) => {
  logger.info("[MaxCore] Remote trigger-session triggered");
  send(res, await peer("POST", "/control/trigger-session"));
});

router.post("/train/set-phase", async (req, res) => {
  const phase = Number(req.body?.phase);
  if (!phase || phase < 1 || phase > 4) {
    return res.status(400).json({ error: "phase must be 1–4" });
  }
  logger.info(`[MaxCore] Remote set-phase to ${phase}`);
  send(res, await peer("POST", "/control/set-phase", { phase }));
});

// ── Models ────────────────────────────────────────────────────────────────────

router.get("/models", async (_req, res) => {
  send(res, await peer("GET", "/models/list"));
});

// ── Datasets ──────────────────────────────────────────────────────────────────

router.get("/datasets", async (_req, res) => {
  send(res, await peer("GET", "/datasets/list"));
});

router.get("/datasets/manifest", async (_req, res) => {
  send(res, await peer("GET", "/datasets/manifest"));
});

// ── Knowledge ─────────────────────────────────────────────────────────────────

router.get("/curriculum", async (_req, res) => {
  send(res, await peer("GET", "/knowledge/curriculum"));
});

router.get("/loss-history", async (_req, res) => {
  send(res, await peer("GET", "/knowledge/loss-history"));
});

router.get("/sessions", async (_req, res) => {
  send(res, await peer("GET", "/knowledge/sessions"));
});

// ── Machine lifecycle ─────────────────────────────────────────────────────────

router.post("/restart", async (_req, res) => {
  logger.warn("[MaxCore] Remote RESTART triggered by admin");
  send(res, await peer("POST", "/control/restart", undefined, 5_000));
});

router.post("/shutdown", async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== "SHUTDOWN") {
    return res
      .status(400)
      .json({ error: 'Send { "confirm": "SHUTDOWN" } to confirm this action' });
  }
  logger.warn("[MaxCore] Remote SHUTDOWN triggered by admin");
  send(res, await peer("POST", "/control/shutdown", undefined, 5_000));
});

export default router;
