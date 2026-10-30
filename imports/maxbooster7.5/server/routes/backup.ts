import { Router } from "express";
import { databaseBackupService } from "../services/backup/databaseBackupService.js";
import { pdimRecoveryBackupService } from "../services/backup/pdimRecoveryBackupService.js";
import { requireAdmin, requireVerified2FA } from "../middleware/auth.js";
import { csrfProtection, requireCsrfToken } from "../middleware/csrf.js";
import { logger } from "../logger.js";

const router = Router();

// Boot must await databaseBackupService.initialize() after migration readiness.

// Create manual backup (admin only)
router.post("/create", requireAdmin, async (_req, res) => {
  try {
    const backupFile = await databaseBackupService?.createBackup();
    res.json({ success: true, backupFile });
  } catch (error) {
    logger.warn({ err: error }, "[Backup] Failed to create backup:");
    res.status(500).json({ error: "Failed to create backup" });
  }
});

// Start a retained, private PDIM snapshot + independent restore-verification job.
// Snapshot bytes are never returned over HTTP.
router.post(
  "/pdim/create",
  requireAdmin,
  requireVerified2FA,
  csrfProtection,
  async (_req, res) => {
    try {
      const job = await pdimRecoveryBackupService.start();
      res.status(202).json({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "A PDIM recovery backup is already running") {
        res.status(409).json({ error: message });
        return;
      }
      logger.warn("[PDIM Recovery] Could not start operator backup");
      res.status(500).json({ error: "Could not start PDIM recovery backup" });
    }
  },
);

router.get(
  "/pdim/jobs/:jobId",
  requireAdmin,
  requireVerified2FA,
  requireCsrfToken,
  async (req, res) => {
    try {
      const jobId = Array.isArray(req.params.jobId)
        ? req.params.jobId[0]
        : req.params.jobId;
      const job = await pdimRecoveryBackupService.get(jobId);
      if (!job) {
        res.status(404).json({ error: "PDIM recovery backup job not found" });
        return;
      }
      res.json({ job });
    } catch {
      res.status(503).json({ error: "PDIM recovery authority unavailable" });
    }
  },
);

// List all backups (admin only)
router.get("/list", requireAdmin, async (_req, res) => {
  try {
    const backups = await databaseBackupService?.listBackups();
    res.json({ backups });
  } catch (error) {
    logger.warn({ err: error }, "[Backup] Failed to list backups:");
    res.status(500).json({ error: "Failed to list backups" });
  }
});

// Get backup metrics (admin only)
router.get("/metrics", requireAdmin, async (_req, res) => {
  try {
    const metrics = await databaseBackupService.getBackupMetrics();
    res.json(metrics);
  } catch (error) {
    logger.warn({ err: error }, "[Backup] Failed to get backup metrics:");
    res.status(500).json({ error: "Failed to get backup metrics" });
  }
});

export default router;
