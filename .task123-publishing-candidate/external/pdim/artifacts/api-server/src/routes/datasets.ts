/**
 * DATASET ROUTES
 *
 * Endpoints for discovering and downloading public music & social media datasets.
 *
 * GET  /api/datasets                    – list discovered datasets (filterable)
 * POST /api/datasets/discover           – run a discovery sweep right now
 * GET  /api/datasets/discover/status    – scheduler status + last run stats
 * POST /api/datasets/discover/start     – start auto-discovery scheduler
 * POST /api/datasets/discover/stop      – stop auto-discovery scheduler
 * POST /api/datasets/download           – queue one dataset for download
 * POST /api/datasets/download/auto      – auto-queue all new undiscovered datasets
 * GET  /api/datasets/download/progress  – live progress for active downloads
 * GET  /api/datasets/download/history   – completed/failed download log
 */

import { Router, type Request, type Response } from "express";
import { datasetDiscovery } from "../services/datasetDiscoveryService.js";
import { datasetDownloader } from "../services/datasetDownloadService.js";
import { logger } from "../logger.js";

const router = Router();

// ── Discovery ─────────────────────────────────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { category, source, downloaded, queued, limit } =
      _req.query as Record<string, string>;
    const datasets = await datasetDiscovery.list({
      category,
      source,
      downloaded:
        downloaded === "true"
          ? true
          : downloaded === "false"
            ? false
            : undefined,
      queued: queued === "true" ? true : queued === "false" ? false : undefined,
      limit: limit ? Number(limit) : 100,
    });
    res.json({ total: datasets.length, datasets });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post(
  "/discover",
  async (_req: Request, res: Response): Promise<void> => {
    if (datasetDiscovery.running) {
      res.status(409).json({ error: "Discovery sweep already in progress" });
      return;
    }
    res.json({
      message: "Discovery sweep started — check /discover/status for results",
    });
    datasetDiscovery
      .discover()
      .catch((e) => logger.error("[DatasetDiscovery] sweep error:", e));
  },
);

router.get("/discover/status", (_req: Request, res: Response) => {
  res.json({
    running: datasetDiscovery.running,
    schedulerActive: datasetDiscovery.isSchedulerRunning(),
    lastRun: datasetDiscovery.lastRun,
    lastFoundCount: datasetDiscovery.lastFoundCount,
    stats: datasetDiscovery.stats,
  });
});

router.post("/discover/start", (req: Request, res: Response) => {
  const intervalHours = Number((req.body as any)?.intervalHours ?? 6);
  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
  datasetDiscovery.startScheduler(intervalMs);
  res.json({
    message: `Auto-discovery scheduler started (every ${intervalHours}h)`,
    intervalMs,
  });
});

router.post("/discover/stop", (_req: Request, res: Response) => {
  datasetDiscovery.stopScheduler();
  res.json({ message: "Auto-discovery scheduler stopped" });
});

// ── Downloads ─────────────────────────────────────────────────────────────

router.post("/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.body as { datasetId?: number };
    if (!datasetId) {
      res.status(400).json({ error: "datasetId required" });
      return;
    }
    const downloadId = await datasetDownloader.enqueue(Number(datasetId));
    res.json({
      message: "Dataset queued for download",
      downloadId,
      progress: `/api/datasets/download/progress`,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/download/auto", async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const downloadIds = await datasetDownloader.autoDownloadNew({
      category: body.category,
      maxDatasets: body.maxDatasets ? Number(body.maxDatasets) : 10,
      minLikes: body.minLikes ? Number(body.minLikes) : undefined,
      sources: body.sources,
    });
    res.json({
      message: `${downloadIds.length} dataset(s) queued for download`,
      downloadIds,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/download/progress", (_req: Request, res: Response) => {
  res.json({ downloads: datasetDownloader.getActiveProgress() });
});

router.get("/download/progress/:id", (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const progress = datasetDownloader.getProgress(id);
  if (!progress) {
    res.status(404).json({ error: "Download not found" });
    return;
  }
  res.json(progress);
});

router.get("/download/history", async (_req: Request, res: Response) => {
  try {
    const history = await datasetDownloader.listDownloads(100);
    res.json({ total: history.length, downloads: history });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
