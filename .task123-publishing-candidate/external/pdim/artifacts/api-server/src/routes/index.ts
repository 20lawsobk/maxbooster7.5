import { Router, type Request, type Response, type IRouter } from "express";
import healthRouter from "./health.js";
import redisRouter from "./redis.js";
import datasetsRouter from "./datasets.js";
import monitorRouter from "./monitor.js";
import fabricRouter from "./fabric.js";
import { autoPushService } from "../auto-push/service.js";

const router: IRouter = Router();

router.get("/", (_req: Request, res: Response) => {
  res.redirect(process.env["PDIM_APP_URL"] || "https://maxbooster.replit.app/");
});

// ── AutoPush status — enriched with live agent-store stats ────────────────
// Cache the response for 1 second so rapid dashboard polls (every 2 s) don't
// hammer liveStats() + HGETALL on every single request.

let _autopushCache: { ts: number; body: object } | null = null;
const AUTOPUSH_CACHE_TTL_MS = 1_000;

router.get("/autopush/status", (_req: Request, res: Response) => {
  const now = Date.now();
  if (_autopushCache && now - _autopushCache.ts < AUTOPUSH_CACHE_TTL_MS) {
    res.json(_autopushCache.body);
    return;
  }

  const progress = autoPushService.progress;
  const stats = autoPushService.liveStats();
  const { chunkIndex, totalChunks } = progress;

  const gbPushed = stats?.pushedGB ?? null;
  const totalGB = stats?.totalGB ?? null;
  const chunksRemaining = stats?.chunksRemaining ?? null;
  const chunksPerSec = stats?.chunksPerSec ?? null;
  const etaSeconds = stats?.etaSeconds ?? null;
  const status =
    stats?.status ??
    (autoPushService.running
      ? "running"
      : chunkIndex >= totalChunks
        ? "complete"
        : "idle");

  const body = {
    running: autoPushService.running,
    ...progress,
    status,
    gbPushed,
    totalGB,
    chunksRemaining: chunksRemaining !== null ? Number(chunksRemaining) : null,
    chunksPerSec: chunksPerSec !== null ? Number(chunksPerSec) : null,
    etaSeconds: etaSeconds !== null ? Number(etaSeconds) : null,
    // Honesty: these counts describe dataset chunk *descriptors* (metadata)
    // streamed agent→training, not bytes stored on this workspace.
    mode: "logical-manifest-stream",
    note: "Logical dataset manifest pipeline (chunk descriptors), not stored bytes. See GET /api/fabric/capacity for real stored usage.",
  };

  _autopushCache = { ts: now, body };
  res.json(body);
});

// ── AutoPush restart — resets progress and re-runs the full transfer ──────

router.post("/autopush/restart", async (_req: Request, res: Response) => {
  try {
    await autoPushService.restart();
    res.json({
      ok: true,
      message: "AutoPush restarted — replaying all chunks from 0",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.use(healthRouter);
router.use("/redis/instances", redisRouter);
router.use("/datasets", datasetsRouter);
router.use("/monitor", monitorRouter);
router.use("/fabric", fabricRouter);

export default router;
