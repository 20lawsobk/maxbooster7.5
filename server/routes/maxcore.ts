import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

const RAW_PEER   = process.env.PEER_TRAINING_NODE || process.env.MBS_AI_TRAINING_URL || "";
const TIMEOUT_MS = 12_000;
const MBS_KEY    = process.env.MBS_AI_TRAINING_KEY || '';

// ── PDIM peer detection ───────────────────────────────────────────────────────
// Accepts pdim://TOKEN@host/path  →  uses PDIM exec endpoint as command bus.

interface PdimPeer { type: "pdim"; execUrl: string; token: string; }
interface HttpPeer { type: "http"; baseUrl: string; }
type PeerCfg = PdimPeer | HttpPeer;

function parsePeer(raw: string): PeerCfg {
  if (raw.startsWith("pdim://")) {
    try {
      const withoutScheme = raw.slice("pdim://".length);
      const atIdx = withoutScheme.indexOf("@");
      const token  = withoutScheme.slice(0, atIdx);
      const rest   = withoutScheme.slice(atIdx + 1);
      const execUrl = `https://${rest}/exec`;
      return { type: "pdim", execUrl, token };
    } catch {
      // fall through to http fallback
    }
  }
  const base = raw || "http://localhost:8000";
  return { type: "http", baseUrl: base };
}

const PEER_CFG: PeerCfg = parsePeer(RAW_PEER);

logger.info(`[MaxCore] Peer mode: ${PEER_CFG.type} — ${PEER_CFG.type === "pdim" ? PEER_CFG.execUrl : (PEER_CFG as HttpPeer).baseUrl}`);

// ── PDIM exec helper ──────────────────────────────────────────────────────────

async function pdimExec(cfg: PdimPeer, cmd: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(cfg.execUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ cmd, args }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`PDIM exec HTTP ${res.status}`);
  const json = await res.json() as any;
  return json.result ?? json;
}

// ── PDIM-based RPC ────────────────────────────────────────────────────────────
// Commands are pushed as JSON objects to the `maxcore:rpc:in` list.
// MaxCore pops them, executes, and writes the result to `maxcore:rpc:out:<reqId>`.

async function pdimRpc(
  cfg: PdimPeer,
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs = TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const reqId = crypto.randomUUID();
  const ts    = Date.now();
  const job   = JSON.stringify({ action, reqId, ts, ...payload });
  try {
    await pdimExec(cfg, "LPUSH", ["maxcore:rpc:in", job]);
    // Wait for MaxCore to write its response
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const raw = await pdimExec(cfg, "GET", [`maxcore:rpc:out:${reqId}`]) as string | null;
      if (raw) {
        try { await pdimExec(cfg, "DEL", [`maxcore:rpc:out:${reqId}`]); } catch {}
        const parsed = JSON.parse(raw) as any;
        return { ok: parsed.ok !== false, status: parsed.status ?? 200, data: parsed.data ?? parsed };
      }
      await new Promise(r => setTimeout(r, 500));
    }
    // No response within timeout — command was queued but not yet acknowledged
    return { ok: true, status: 202, data: { queued: true, action, reqId, detail: "Command queued — MaxCore will process it on next cycle" } };
  } catch (err: any) {
    logger.error(`[MaxCore] PDIM RPC error for ${action}: ${err.message}`);
    return { ok: false, status: 503, data: { error: String(err.message) } };
  }
}

// ── HTTP-based peer ───────────────────────────────────────────────────────────

async function httpPeer(
  method: string,
  p: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const cfg = PEER_CFG as HttpPeer;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (MBS_KEY) headers["Authorization"] = `Bearer ${MBS_KEY}`;
    const opts: RequestInit = { method, signal: controller.signal, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${cfg.baseUrl}${p}`, opts);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    const offline = err.name === "AbortError" || err.code === "ECONNREFUSED";
    return { ok: false, status: offline ? 503 : 500, data: { error: offline ? "MaxCore machine is offline or unreachable" : String(err) } };
  } finally {
    clearTimeout(timer);
  }
}

// ── Unified peer() ────────────────────────────────────────────────────────────

async function peer(
  method: string,
  p: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (PEER_CFG.type === "pdim") {
    // Convert REST-style calls to PDIM RPC actions
    const action = `${method.toUpperCase()}:${p}`;
    return pdimRpc(PEER_CFG, action, body ? { body } : {}, timeoutMs);
  }
  return httpPeer(method, p, body, timeoutMs);
}

function send(res: Response, result: { ok: boolean; status: number; data: unknown }) {
  res.status(result.ok ? 200 : result.status).json(result.data);
}

// ── Auth guard ────────────────────────────────────────────────────────────────

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
  if (PEER_CFG.type === "pdim") {
    try {
      const pong = await pdimExec(PEER_CFG, "PING", []);
      return res.json({ ok: true, mode: "pdim", ping: pong });
    } catch (err: any) {
      return res.status(503).json({ ok: false, error: String(err.message) });
    }
  }
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
  const ts  = Date.now();
  const job = {
    id:      `sess-${ts}`,
    action:  "start-7tb-download",
    source:  "maxbooster",
    api_key: MBS_KEY,
    bytes:   7_696_581_394_432,
    ts,
  };
  try {
    await mainPdimPush("mbs:training:session", job);
    await mainPdimPush("mbs:downloads", job);
    logger.info("[MaxCore] trigger-session pushed directly to main PDIM");
    return res.json({ ok: true, detail: "Session pushed directly to PDIM", keys: ["mbs:training:session", "mbs:downloads"] });
  } catch (err: any) {
    logger.error(`[MaxCore] trigger-session PDIM push failed: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
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
    return res.status(400).json({ error: 'Send { "confirm": "SHUTDOWN" } to confirm this action' });
  }
  logger.warn("[MaxCore] Remote SHUTDOWN triggered by admin");
  send(res, await peer("POST", "/control/shutdown", undefined, 5_000));
});

// ── Main PDIM direct push helper ──────────────────────────────────────────────
// Pushes download/training jobs directly to the main PDIM instance so that
// the MaxCore training server can pull them on its own schedule.

const MAIN_PDIM_EXEC  = process.env.PDIM_HTTP_EXEC_URL || "";
const MAIN_PDIM_TOKEN = process.env.PDIM_BEARER_TOKEN   || "";

async function mainPdimPush(key: string, payload: Record<string, unknown>): Promise<void> {
  if (!MAIN_PDIM_EXEC || !MAIN_PDIM_TOKEN) {
    throw new Error("PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN not configured");
  }
  const res = await fetch(MAIN_PDIM_EXEC, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MAIN_PDIM_TOKEN}`,
    },
    body: JSON.stringify({ cmd: "RPUSH", args: [key, JSON.stringify(payload)] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Main PDIM push HTTP ${res.status}`);
}

// ── Downloader supervisor control ─────────────────────────────────────────────

const ROOT_DIR      = path.resolve(process.cwd());
const CTRL_DIR      = path.join(ROOT_DIR, "control");
const DL_STOP_FLAG  = path.join(CTRL_DIR, "downloader.stop");
const MC_STOP_FLAG  = path.join(CTRL_DIR, "maxcore.stop");

function ensureCtrl() {
  try { fs.mkdirSync(CTRL_DIR, { recursive: true }); } catch {}
}

router.get("/downloader/status", (_req, res) => {
  ensureCtrl();
  const stopped = fs.existsSync(DL_STOP_FLAG);
  res.json({ stopped, flag: DL_STOP_FLAG, peerMode: PEER_CFG.type });
});

router.post("/downloader/stop", (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== "STOP") {
    return res.status(400).json({ error: 'Send { "confirm": "STOP" } to confirm' });
  }
  ensureCtrl();
  fs.writeFileSync(DL_STOP_FLAG, new Date().toISOString());
  logger.warn("[MaxCore] Dataset Downloader STOP flag written by admin");
  res.json({ ok: true, detail: "Downloader will stop after current dataset completes" });
});

router.post("/downloader/start", async (_req, res) => {
  ensureCtrl();
  try { fs.unlinkSync(DL_STOP_FLAG); } catch {}
  logger.info("[MaxCore] Dataset Downloader stop flag cleared");

  const ts  = Date.now();
  const job = {
    id:      `dl-${ts}`,
    action:  "downloader:start",
    source:  "maxbooster",
    api_key: MBS_KEY,
    bytes:   7_696_581_394_432,
    ts,
  };

  try {
    await mainPdimPush("mbs:downloads", job);
    await mainPdimPush("mbs:training:session", { ...job, action: "start-7tb-download" });
    logger.info("[MaxCore] downloader:start pushed directly to main PDIM (mbs:downloads, mbs:training:session)");
    res.json({ ok: true, detail: "Download job pushed directly to PDIM", keys: ["mbs:downloads", "mbs:training:session"] });
  } catch (err: any) {
    logger.error(`[MaxCore] Failed to push to main PDIM: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/maxcore/stop", (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== "STOP") {
    return res.status(400).json({ error: 'Send { "confirm": "STOP" } to confirm' });
  }
  ensureCtrl();
  fs.writeFileSync(MC_STOP_FLAG, new Date().toISOString());
  logger.warn("[MaxCore] MaxCore Server STOP flag written by admin");
  res.json({ ok: true, detail: "MaxCore supervisor will stop after current child exits" });
});

router.post("/maxcore/start", (_req, res) => {
  ensureCtrl();
  try { fs.unlinkSync(MC_STOP_FLAG); } catch {}
  logger.info("[MaxCore] MaxCore stop flag cleared — supervisor will restart server");
  res.json({ ok: true, detail: "Stop flag removed. Supervisor will restart MaxCore on its next loop" });
});

export default router;
