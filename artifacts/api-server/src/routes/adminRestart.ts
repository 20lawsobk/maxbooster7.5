/**
 * adminRestart.ts
 *
 * POST /api/admin/force-restart
 *
 * Authenticated restart endpoint used by the dev-side auto-resolver when it
 * detects the production server is alive at the OS level but health-failing
 * (deadlocked, hung GC, etc.).  Requires Bearer = SESSION_SECRET so it cannot
 * be called by unauthenticated parties.
 *
 * What it does:
 *   • In a cluster worker: exits with code 1 so the primary respawns it.
 *     All workers restart one-by-one as each gets its own request or as the
 *     resolver calls this endpoint N times.
 *   • In a single-process mode (no cluster): exits with code 1 so the
 *     watchdog shell script restarts the whole server.
 *
 * The primary process itself is unaffected by a single worker exit, which is
 * the safe path — Python lifecycle and keepalive stay alive while workers
 * cycle.  The watchdog.sh handles the case where the primary itself dies.
 */

import { Router, type IRouter } from "express";
import cluster from "cluster";

const router: IRouter = Router();

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

router.post("/admin/force-restart", (req, res) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!SESSION_SECRET || token !== SESSION_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // ── Acknowledge before exiting ─────────────────────────────────────────────
  res.json({
    ok: true,
    pid: process.pid,
    isWorker: cluster.isWorker,
    message: "Restarting this worker — watchdog will respawn if primary also exits",
  });

  // Give Express time to flush the response, then exit.
  // cluster primary's exit handler (in index.ts) calls cluster.fork() to
  // replace this worker immediately.  If the primary itself is hung, the
  // watchdog shell script at the OS level handles the full restart.
  setTimeout(() => {
    console.log(
      `[AdminRestart] Force-restart triggered via /api/admin/force-restart — pid=${process.pid}`,
    );
    process.exit(1);
  }, 200);
});

export default router;
