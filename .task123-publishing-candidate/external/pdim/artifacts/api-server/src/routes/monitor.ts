/**
 * MONITOR ROUTES
 *
 * Real-time server health, auto-fix status, and chain diagnostics.
 * In cluster mode, primary-side stats are fetched via IPC so workers
 * return accurate data without having local copies of the state.
 *
 * GET  /api/monitor/health          – full health snapshot
 * GET  /api/monitor/events          – recent health/fix event log
 * POST /api/monitor/probe           – trigger immediate probe cycle
 * POST /api/monitor/compact         – GC all PDIM pockets (reclaim disk space)
 * GET  /api/monitor/scale           – rate-limiter, backpressure, Lua pool, store stats
 * POST /api/monitor/evict           – manual LRU eviction across all stores
 * GET  /api/monitor/layers/:layer   – status for a single layer
 */

import cluster from "cluster";
import { Router, type Request, type Response } from "express";
import { healthMonitor } from "../services/serverHealthMonitor.js";
import { stayAliveService } from "../services/stayAliveService.js";
import { pocketManager } from "../pocket-dimension/index.js";
import { getRateLimitStats } from "../middlewares/rateLimit.js";
import { getBackpressureStats } from "../middlewares/backpressure.js";
import { luaPool } from "../workers/lua-pool.js";
import { redisManager } from "../redis/manager.js";
import { ipcBridge } from "../cluster/ipc-bridge.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function isPrimaryOwned(): boolean {
  return cluster.isWorker;
}

async function primaryCall<T>(
  kind: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  return ipcBridge.call<T>({ kind, ...extra } as Parameters<
    typeof ipcBridge.call
  >[0]);
}

// ── Health snapshot ────────────────────────────────────────────────────────

router.get("/health", async (_req: Request, res: Response) => {
  try {
    const snapshot = isPrimaryOwned()
      ? await primaryCall("getHealthSnapshot")
      : healthMonitor.getSnapshot();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Health event log ───────────────────────────────────────────────────────

router.get("/events", async (req: Request, res: Response) => {
  const limit = Math.min(Number((req.query as any).limit ?? 50), 200);
  try {
    const events = isPrimaryOwned()
      ? await primaryCall<unknown[]>("getHealthHistory", { limit })
      : healthMonitor.getHistory(limit);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Force probe ────────────────────────────────────────────────────────────

router.post("/probe", async (_req: Request, res: Response) => {
  try {
    const snapshot = isPrimaryOwned()
      ? await primaryCall("forceProbe")
      : await healthMonitor.forceProbe();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Single layer status ────────────────────────────────────────────────────

router.get("/layers/:layer", async (req: Request, res: Response) => {
  const layerKey = req.params["layer"] as string;
  try {
    const snapshot = isPrimaryOwned()
      ? await primaryCall<{ layers: Record<string, unknown> }>(
          "getHealthSnapshot",
        )
      : healthMonitor.getSnapshot();
    const layer = (snapshot as { layers: Record<string, unknown> }).layers?.[
      layerKey
    ];
    if (!layer) {
      res.status(404).json({ error: "Unknown layer" });
      return;
    }
    res.json({ layer: layerKey, ...(layer as object) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Compact PDIM pockets ───────────────────────────────────────────────────

router.post("/compact", async (_req: Request, res: Response) => {
  try {
    if (isPrimaryOwned()) {
      const results = await primaryCall<Record<string, number>>("compact");
      const totalFreed = Object.values(results)
        .filter((v) => v >= 0)
        .reduce((a, b) => a + b, 0);
      res.json({
        pockets: Object.keys(results).length,
        totalOrphanedChunksDeleted: totalFreed,
        results,
      });
      return;
    }

    const pocketIds = pocketManager.listPockets();
    const results: Record<string, number> = {};
    for (const pid of pocketIds) {
      try {
        const pocket = await pocketManager.openPocket(pid);
        results[pid] = await pocket.compact();
      } catch {
        results[pid] = -1;
      }
    }
    const totalFreed = Object.values(results)
      .filter((v) => v >= 0)
      .reduce((a, b) => a + b, 0);
    res.json({
      pockets: pocketIds.length,
      totalOrphanedChunksDeleted: totalFreed,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Scale stats ────────────────────────────────────────────────────────────

router.get("/scale", async (_req: Request, res: Response) => {
  try {
    // Rate-limit and backpressure stats are per-worker middleware counters
    const rateLimit = getRateLimitStats();
    const backpressure = getBackpressureStats();

    // Lua pool and store key counts live in the primary
    const primaryStats = isPrimaryOwned()
      ? await primaryCall<{ luaPool: object; stores: object[] }>(
          "getScaleStats",
        )
      : {
          luaPool: {
            ready: luaPool.isReady,
            activeConcurrency: luaPool.activeConcurrency,
            workerThreads: Number(process.env["LUA_WORKER_THREADS"] ?? 2),
          },
          stores: (await redisManager.listInstances()).map((i) => ({
            instanceId: i.id,
            instanceName: i.name,
            keyCount: i.keyCount,
          })),
        };

    res.json({
      rateLimit,
      backpressure,
      luaPool: (primaryStats as any).luaPool,
      stores: (primaryStats as any).stores,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Manual LRU eviction ────────────────────────────────────────────────────

router.post("/evict", async (req: Request, res: Response) => {
  try {
    const count = Number((req.body as any)?.count ?? 0);

    const results = isPrimaryOwned()
      ? await primaryCall<Record<string, number>>("evict", { count })
      : await (async () => {
          const out: Record<string, number> = {};
          const instances = await redisManager.listInstances();
          for (const { id } of instances) {
            const store = await redisManager.getStore(id);
            if (!store) {
              out[id] = 0;
              continue;
            }
            const n =
              count > 0
                ? count
                : Math.floor((store.getStats().keyCount ?? 0) * 0.1);
            out[id] = store.evictLRU(Math.max(n, 1));
          }
          return out;
        })();

    const totalEvicted = Object.values(results).reduce((a, b) => a + b, 0);
    res.json({ totalEvicted, results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Stay-alive status ──────────────────────────────────────────────────────

router.get("/stay-alive", (_req: Request, res: Response) => {
  res.json({
    running: stayAliveService.isRunning(),
    ...stayAliveService.stats,
  });
});

export default router;
