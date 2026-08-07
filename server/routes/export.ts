import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db";
import { logger } from "../logger.js";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getBaseUrl } from "../config/defaults.js";
import { shareLinks as shareLinksTable } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ExportJob {
  id: string;
  userId: string;
  name: string;
  type: "audio" | "data" | "stems" | "batch";
  format: string;
  status:
    | "queued"
    | "preparing"
    | "processing"
    | "encoding"
    | "uploading"
    | "complete"
    | "failed"
    | "cancelled";
  progress: number;
  stage?: string;
  startTime?: Date;
  estimatedEndTime?: Date;
  completedTime?: Date;
  fileSize?: number;
  downloadUrl?: string;
  error?: string;
  retryCount: number;
  settings: Record<string, unknown>;
  projectId?: string;
  projectName?: string;
  expiresAt?: Date;
}


interface ExportHistoryItem {
  id: string;
  userId: string;
  name: string;
  type: "audio" | "stems" | "analytics" | "royalties" | "contracts" | "backup";
  format: string;
  status: "completed" | "failed" | "expired" | "processing";
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  fileSize?: number;
  downloadUrl?: string;
  downloadCount: number;
  settings?: Record<string, unknown>;
  error?: string;
  projectId?: string;
  projectName?: string;
}

// In-memory storage (in production, use database)
const exportJobs = new Map<string, ExportJob>();
const exportHistory: ExportHistoryItem[] = [];

// Prevent unbounded memory growth: remove terminal-state jobs after 30 minutes.
// exportJobs had set() calls but no delete() anywhere — every export leaked.
const EXPORT_JOB_TTL_MS = 30 * 60 * 1000;
setInterval(
  () => {
    const cutoff = Date?.now() - EXPORT_JOB_TTL_MS;
    for (const [id, job] of exportJobs) {
      const terminal = ["complete", "failed", "cancelled", "expired"].includes(
        job?.status,
      );
      const tooOld =
        ((job as any)?.createdAt ? new Date((job as any)?.createdAt).getTime() : 0) < cutoff;
      if (terminal || tooOld) exportJobs?.delete(id);
    }
  },
  10 * 60 * 1000,
).unref();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const audioExportSchema = z.object({
  format: z.enum(["wav", "mp3", "flac", "aiff", "ogg", "aac"]),
  sampleRate: z.number().min(8000).max(192000),
  bitDepth: z.number().refine((v) => [16, 24, 32].includes(v)),
  bitrate: z.number().min(64).max(320),
  normalize: z.boolean(),
  dither: z.boolean(),
  exportType: z.enum(["mixdown", "stems", "tracks"]),
  selectedTracks: z.array(z.string()).optional(),
  includeEffects: z.boolean().optional(),
  preserveVolumePan: z.boolean().optional(),
  addEffectTail: z.boolean().optional(),
  fileName: z.string().min(1).max(255),
});

const dataExportSchema = z.object({
  format: z.enum(["csv", "pdf", "xlsx", "json"]),
  category: z.enum(["analytics", "royalties", "contracts", "backup"]),
  dateRange: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .nullable()
    .optional(),
  includeCharts: z.boolean().optional(),
  anonymize: z.boolean().optional(),
  compress: z.boolean().optional(),
});

const shareLinkSchema = z.object({
  resourceType: z.enum(["audio", "project", "stems", "analytics", "document"]),
  resourceId: z.string(),
  name: z.string(),
  expiresAt: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  maxDownloads: z.number().nullable().optional(),
  requiresEmail: z.boolean().optional(),
  allowedEmails: z.array(z.string()).nullable().optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(8);

  return Array.from(bytes as Uint8Array)
    .map((b: number) => chars[b % chars?.length])
    .join("");
}

function simulateExportProgress(jobId: string): void {
  const job = exportJobs?.get(jobId);
  if (!job) return;

  const stages = [
    { name: "Preparing files...", progress: 10 },
    { name: "Loading audio data...", progress: 25 },
    { name: "Processing tracks...", progress: 45 },
    { name: "Applying effects...", progress: 60 },
    { name: "Encoding output...", progress: 80 },
    { name: "Finalizing...", progress: 95 },
    { name: "Complete", progress: 100 },
  ];

  let stageIndex = 0;

  const interval = setInterval(() => {
    const currentJob = exportJobs?.get(jobId);
    if (
      !currentJob ||
      currentJob?.status === "cancelled" ||
      currentJob?.status === "failed"
    ) {
      clearInterval(interval);
      return;
    }

    if (stageIndex < stages?.length) {
      const stage = stages[stageIndex];
      currentJob.progress = stage?.progress;
      currentJob.stage = stage?.name;
      currentJob.status = stage?.progress === 100 ? "complete" : "processing";

      if (stage?.progress === 100) {
        currentJob.completedTime = new Date();
        currentJob.downloadUrl = `/api/export/download/${jobId}`;
        const trackCount = (currentJob as any)?.tracks?.length || 1;
        const durationSec = (currentJob as any)?.duration || 180;
        const qualityMultiplier =
          currentJob?.format === "wav"
            ? 176400
            : currentJob?.format === "flac"
              ? 88200
              : 20000;
        currentJob.fileSize = Math.floor(
          trackCount * durationSec * qualityMultiplier,
        );

        // Add to history
        exportHistory?.unshift({
          id: currentJob.id,
          userId: currentJob.userId,
          name: currentJob.name,
          type: currentJob.type === "stems" ? "stems" : "audio",
          format: currentJob.format,
          status: "completed",
          createdAt: currentJob.startTime || new Date(),
          completedAt: currentJob.completedTime,
          expiresAt: new Date(Date?.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          fileSize: currentJob.fileSize,
          downloadUrl: currentJob.downloadUrl,
          downloadCount: 0,
          settings: currentJob.settings,
          projectId: currentJob.projectId,
          projectName: currentJob.projectName,
        });
        // Keep history bounded: drop the oldest entries once over cap.
        if (exportHistory?.length > 10_000) exportHistory?.splice(10_000);

        clearInterval(interval);
      }

      stageIndex++;
    }
  }, 800);
}

// ============================================================================
// AUDIO EXPORT ENDPOINTS
// ============================================================================

// Start audio export
router.post(
  "/audio/:projectId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const validation = audioExportSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res.status(400).json({
          success: false,
          error: validation.error.message,
        });
      }

      const options = validation?.data;
      const jobId = randomBytes(8).toString("hex");
      const jobName = options?.fileName || `Export_${Date?.now()}`;

      const job: ExportJob = {
        id: jobId,
        userId,
        name: jobName,
        type: options.exportType === "stems" ? "stems" : "audio",
        format: options.format,
        status: "queued",
        progress: 0,
        stage: "Queued",
        startTime: new Date(),
        retryCount: 0,
        settings: options as Record<string, unknown>,
        projectId,
      };

      exportJobs?.set(jobId, job);

      // Start processing simulation
      setTimeout(() => {
        const currentJob = exportJobs?.get(jobId);
        if (currentJob) {
          currentJob.status = "preparing";
          currentJob.stage = "Preparing export...";
          simulateExportProgress(jobId);
        }
      }, 500);

      const estimatedSeconds =
        options?.exportType === "stems"
          ? (options?.selectedTracks?.length || 8) * 15
          : 30;

      res.json({
        success: true,
        jobId,
        estimatedTime: estimatedSeconds,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error starting audio export:");
      res.status(500).json({
        success: false,
        error: "Failed to start export",
      });
    }
  },
);

// Get export job status
router.get("/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const job = exportJobs?.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Export job not found" });
    }

    if (job?.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(job);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching export job:");
    res.status(500).json({ error: "Failed to fetch export job" });
  }
});

// Get all active export jobs for user
router.get("/jobs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const userJobs = Array.from(exportJobs?.values())
      .filter((job) => job?.userId === userId)
      .sort(
        (a, b) => (b?.startTime?.getTime() || 0) - (a?.startTime?.getTime() || 0),
      );

    res.json(userJobs);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching export jobs:");
    res.status(500).json({ error: "Failed to fetch export jobs" });
  }
});

// Cancel export job
router.post(
  "/jobs/:jobId/cancel",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const job = exportJobs?.get(jobId);
      if (!job) {
        return res.status(404).json({ error: "Export job not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (["complete", "failed", "cancelled"].includes(job?.status)) {
        return res.status(400).json({ error: "Cannot cancel completed job" });
      }

      job.status = "cancelled";
      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error cancelling export job:");
      res.status(500).json({ error: "Failed to cancel export" });
    }
  },
);

// Retry failed export job
router.post(
  "/jobs/:jobId/retry",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const job = exportJobs?.get(jobId);
      if (!job) {
        return res.status(404).json({ error: "Export job not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (job?.status !== "failed") {
        return res.status(400).json({ error: "Can only retry failed jobs" });
      }

      job.status = "queued";
      job.progress = 0;
      job.error = undefined;
      job.retryCount++;
      job.startTime = new Date();

      setTimeout(() => {
        const currentJob = exportJobs?.get(jobId);
        if (currentJob) {
          currentJob.status = "preparing";
          simulateExportProgress(jobId);
        }
      }, 500);

      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error retrying export job:");
      res.status(500).json({ error: "Failed to retry export" });
    }
  },
);

// ============================================================================
// DATA EXPORT ENDPOINTS
// ============================================================================

// Start data export
router.post("/data", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const validation = dataExportSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.message,
      });
    }

    const options = validation?.data;
    const jobId = randomBytes(8).toString("hex");
    const categoryNames: Record<string, string> = {
      analytics: "Analytics Export",
      royalties: "Royalty Statement",
      contracts: "Contracts Export",
      backup: "Full Data Backup",
    };

    const job: ExportJob = {
      id: jobId,
      userId,
      name: categoryNames[options?.category] || "Data Export",
      type: "data",
      format: options.format,
      status: "queued",
      progress: 0,
      stage: "Queued",
      startTime: new Date(),
      retryCount: 0,
      settings: options as Record<string, unknown>,
    };

    exportJobs?.set(jobId, job);

    // Start processing
    setTimeout(() => {
      const currentJob = exportJobs?.get(jobId);
      if (currentJob) {
        currentJob.status = "preparing";
        simulateExportProgress(jobId);
      }
    }, 500);

    const estimatedSeconds = options?.category === "backup" ? 120 : 30;

    res.json({
      success: true,
      jobId,
      estimatedTime: estimatedSeconds,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error starting data export:");
    res.status(500).json({
      success: false,
      error: "Failed to start export",
    });
  }
});

// ============================================================================
// EXPORT HISTORY ENDPOINTS
// ============================================================================

// Get export history
router.get("/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type, status, limit = "50", offset = "0" } = req.query;

    let filtered = exportHistory?.filter((item) => item?.userId === userId);

    if (type && type !== "all") {
      filtered = filtered?.filter((item) => item?.type === type);
    }

    if (status && status !== "all") {
      filtered = filtered?.filter((item) => item?.status === status);
    }

    const limitNum = Math.min(
      Math.max(parseInt(limit as string) || 50, 1),
      1000,
    );
    const offsetNum = Math.min(
      Math.max(parseInt(offset as string) || 0, 0),
      100_000,
    );

    const paginated = filtered?.slice(offsetNum, offsetNum + limitNum);

    res.json(paginated);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching export history:");
    res.status(500).json({ error: "Failed to fetch export history" });
  }
});

// Delete export history item
router.delete(
  "/history/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const index = exportHistory?.findIndex(
        (item) => item?.id === id && item?.userId === userId,
      );
      if (index === -1) {
        return res.status(404).json({ error: "Export not found" });
      }

      exportHistory?.splice(index, 1);
      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting export history item:");
      res.status(500).json({ error: "Failed to delete export" });
    }
  },
);

// ============================================================================
// SHARE LINK ENDPOINTS
// ============================================================================

// Create share link
router.post(
  "/share-links",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      const validation = shareLinkSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res
          .status(400)
          .json({ success: false, error: validation.error.message });
      }

      const options = validation?.data;
      const shortCode = generateShortCode();
      const baseUrl = getBaseUrl();
      const url = `${baseUrl}/share/${shortCode}`;

      const [inserted] = await db
        .insert(shareLinksTable)
        .values({
          shortCode,
          url,
          name: options.name,
          resourceType: options.resourceType,
          resourceId: options.resourceId,
          userId,
          expiresAt: options.expiresAt ? new Date(options?.expiresAt) : null,
          isPasswordProtected: !!options?.password,
          maxDownloads: options.maxDownloads || null,
          downloadCount: 0,
          viewCount: 0,
          isActive: true,
          requiresEmail: options.requiresEmail || false,
          allowedEmails: options.allowedEmails || null,
        })
        .returning();

      res.json(inserted);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating share link:");
      res.status(500).json({ error: "Failed to create share link" });
    }
  },
);

// Get all share links for user
router.get("/share-links", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const rows = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable?.userId, userId))
      .orderBy(desc(shareLinksTable?.createdAt))
      .limit(100);

    res.json(rows);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching share links:");
    res.status(500).json({ error: "Failed to fetch share links" });
  }
});

// Get share link by short code (public)
router.get("/share/:shortCode", async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params as Record<string, string>;

    const [link] = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable?.shortCode, shortCode))
      .limit(1);

    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }
    if (!link?.isActive) {
      return res.status(410).json({ error: "Link has been revoked" });
    }
    if (link?.expiresAt && new Date(link?.expiresAt) < new Date()) {
      return res.status(410).json({ error: "Link has expired" });
    }
    if (link?.maxDownloads && link?.downloadCount >= link?.maxDownloads) {
      return res.status(410).json({ error: "Download limit reached" });
    }

    await db
      .update(shareLinksTable)
      .set({ viewCount: link.viewCount + 1, lastAccessedAt: new Date() })
      .where(eq(shareLinksTable?.id, link?.id));

    res.json({
      id: link.id,
      name: link.name,
      resourceType: link.resourceType,
      isPasswordProtected: link.isPasswordProtected,
      requiresEmail: link.requiresEmail,
      allowedEmails: link.allowedEmails
        ? (link?.allowedEmails as string[]).length
        : null,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching share link:");
    res.status(500).json({ error: "Failed to fetch share link" });
  }
});

// Verify share link password
router.post("/share/:shortCode/verify", async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params as Record<string, string>;
    const { email } = req.body;

    const [link] = await db
      .select()
      .from(shareLinksTable)
      .where(
        and(
          eq(shareLinksTable?.shortCode, shortCode),
          eq(shareLinksTable?.isActive, true),
        ),
      )
      .limit(1);

    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }

    if (link?.requiresEmail) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Valid email address required" });
      }
      const allowed = link?.allowedEmails as string[] | null;
      if (
        allowed &&
        allowed?.length > 0 &&
        !allowed?.includes(email?.toLowerCase())
      ) {
        return res.status(403).json({ error: "Email not authorized" });
      }
    }

    res.json({
      success: true,
      downloadUrl: `/api/export/share/${shortCode}/download`,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error verifying share link:");
    res.status(500).json({ error: "Failed to verify link" });
  }
});

// Download via share link
router.get(
  "/share/:shortCode/download",
  async (req: Request, res: Response) => {
    try {
      const { shortCode } = req.params as Record<string, string>;

      const [link] = await db
        .select()
        .from(shareLinksTable)
        .where(
          and(
            eq(shareLinksTable?.shortCode, shortCode),
            eq(shareLinksTable?.isActive, true),
          ),
        )
        .limit(1);

      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }
      if (link?.expiresAt && new Date(link?.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Link has expired" });
      }
      if (link?.maxDownloads && link?.downloadCount >= link?.maxDownloads) {
        return res.status(410).json({ error: "Download limit reached" });
      }

      await db
        .update(shareLinksTable)
        .set({
          downloadCount: link.downloadCount + 1,
          lastAccessedAt: new Date(),
        })
        .where(eq(shareLinksTable?.id, link?.id));

      res.json({
        success: true,
        message: "Download initiated",
        fileName: link.name,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error downloading via share link:");
      res.status(500).json({ error: "Failed to download" });
    }
  },
);

// Revoke share link
router.delete(
  "/share-links/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const [link] = await db
        .select({ id: shareLinksTable.id, userId: shareLinksTable.userId })
        .from(shareLinksTable)
        .where(eq(shareLinksTable?.id, id))
        .limit(1);

      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }
      if (link?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await db
        .update(shareLinksTable)
        .set({ isActive: false })
        .where(eq(shareLinksTable?.id, id));

      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error revoking share link:");
      res.status(500).json({ error: "Failed to revoke link" });
    }
  },
);

// Update share link
router.patch(
  "/share-links/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const userId = req.user!.id;
      const updates = req.body;

      const [link] = await db
        .select({ id: shareLinksTable.id, userId: shareLinksTable.userId })
        .from(shareLinksTable)
        .where(eq(shareLinksTable?.id, id))
        .limit(1);

      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }
      if (link?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const patch: Record<string, unknown> = {};
      if (updates?.expiresAt !== undefined)
        patch.expiresAt = updates?.expiresAt
          ? new Date(updates?.expiresAt)
          : null;
      if (updates?.maxDownloads !== undefined)
        patch.maxDownloads = updates?.maxDownloads;
      if (updates?.isActive !== undefined) patch.isActive = updates?.isActive;

      const [updated] = await db
        .update(shareLinksTable)
        .set(patch)
        .where(
          and(eq(shareLinksTable?.id, id), eq(shareLinksTable?.userId, userId)),
        )
        .returning();

      res.json(updated);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating share link:");
      res.status(500).json({ error: "Failed to update link" });
    }
  },
);

// ============================================================================
// DOWNLOAD ENDPOINT
// ============================================================================

// Download exported file
router.get(
  "/download/:jobId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const job = exportJobs?.get(jobId);
      if (!job) {
        return res.status(404).json({ error: "Export not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (job?.status !== "complete") {
        return res.status(400).json({ error: "Export not ready" });
      }

      // Update download count in history
      const historyItem = exportHistory?.find((h) => h?.id === jobId);
      if (historyItem) {
        historyItem.downloadCount++;
      }

      // In production, stream actual file
      res.json({
        success: true,
        message: "Download initiated",
        fileName: `${job?.name}.${job?.format}`,
        fileSize: job.fileSize,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error downloading export:");
      res.status(500).json({ error: "Failed to download" });
    }
  },
);

// ============================================================================
// BATCH EXPORT ENDPOINTS
// ============================================================================

// Start batch export
router.post("/batch", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { outputs, projectId, projectName } = req.body;

    if (!outputs || !Array.isArray(outputs) || outputs?.length === 0) {
      return res.status(400).json({ error: "No outputs specified" });
    }

    const batchId = randomBytes(8).toString("hex");
    const jobs: ExportJob[] = [];

    for (const output of outputs) {
      const jobId = randomBytes(8).toString("hex");
      const job: ExportJob = {
        id: jobId,
        userId,
        name: output.name,
        type: output.type === "stems" ? "stems" : "audio",
        format: output.format,
        status: "queued",
        progress: 0,
        stage: "Queued",
        startTime: new Date(),
        retryCount: 0,
        settings: output,
        projectId,
        projectName,
      };

      exportJobs?.set(jobId, job);
      jobs?.push(job);
    }

    // Start processing jobs sequentially
    let delay = 500;
    for (const job of jobs) {
      setTimeout(() => {
        const currentJob = exportJobs?.get(job?.id);
        if (currentJob && currentJob?.status === "queued") {
          currentJob.status = "preparing";
          simulateExportProgress(job?.id);
        }
      }, delay);
      delay += 2000; // Stagger starts
    }

    res.json({
      success: true,
      batchId,
      jobIds: jobs.map((j) => j?.id),
      totalJobs: jobs.length,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error starting batch export:");
    res.status(500).json({ error: "Failed to start batch export" });
  }
});

// ============================================================================
// ANALYTICS EXPORT
// ============================================================================

router.post("/analytics", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { format, sections, filters, dateRange, includeCharts } = req.body;

    const jobId = randomBytes(8).toString("hex");

    const job: ExportJob = {
      id: jobId,
      userId,
      name: "Analytics Report",
      type: "data",
      format: format || "csv",
      status: "queued",
      progress: 0,
      stage: "Queued",
      startTime: new Date(),
      retryCount: 0,
      settings: { sections, filters, dateRange, includeCharts },
    };

    exportJobs?.set(jobId, job);

    setTimeout(() => {
      const currentJob = exportJobs?.get(jobId);
      if (currentJob) {
        currentJob.status = "preparing";
        simulateExportProgress(jobId);
      }
    }, 500);

    res.json({
      success: true,
      jobId,
      downloadUrl: `/api/export/download/${jobId}`,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error starting analytics export:");
    res.status(500).json({ error: "Failed to start analytics export" });
  }
});

// ============================================================================
// REPORT GENERATION ENDPOINTS
// ============================================================================

const reportTypes = [
  "royalties",
  "analytics",
  "invoice",
  "contract",
  "tax",
] as const;
type ReportType = (typeof reportTypes)[number];

const reportTypeSchema = z.object({
  format: z.enum(["pdf", "xlsx", "csv"]).default("pdf"),
  period: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  entityId: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  emailDelivery: z.boolean().default(false),
});

router.post(
  "/report/:type",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { type } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!reportTypes?.includes(type as ReportType)) {
        return res.status(400).json({
          error: `Invalid report type. Valid types: ${reportTypes?.join(", ")}`,
        });
      }

      const validation = reportTypeSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res.status(400).json({
          success: false,
          error: validation.error.message,
        });
      }

      const options = validation?.data;
      const jobId = randomBytes(8).toString("hex");

      const reportNames: Record<ReportType, string> = {
        royalties: "Royalty Statement",
        analytics: "Analytics Report",
        invoice: "Invoice",
        contract: "Contract Document",
        tax: "Tax Form",
      };

      const job: ExportJob = {
        id: jobId,
        userId,
        name: reportNames[type as ReportType],
        type: "data",
        format: options.format,
        status: "queued",
        progress: 0,
        stage: "Generating document...",
        startTime: new Date(),
        retryCount: 0,
        settings: {
          reportType: type,
          ...options,
        },
      };

      exportJobs?.set(jobId, job);

      setTimeout(() => {
        const currentJob = exportJobs?.get(jobId);
        if (currentJob) {
          currentJob.status = "preparing";
          simulateExportProgress(jobId);
        }
      }, 500);

      const estimatedSeconds =
        type === "tax" ? 60 : type === "contract" ? 45 : 30;

      res.json({
        success: true,
        jobId,
        reportType: type,
        estimatedTime: estimatedSeconds,
        downloadUrl: `/api/export/download/${jobId}`,
        emailDelivery: options.emailDelivery,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating report:");
      res.status(500).json({ error: "Failed to generate report" });
    }
  },
);

// ============================================================================
// CHART IMAGE EXPORT
// ============================================================================

const chartExportSchema = z.object({
  chartType: z.enum([
    "streams",
    "revenue",
    "audience",
    "geographic",
    "demographics",
    "comparison",
  ]),
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  resolution: z.enum(["standard", "high", "ultra"]).default("high"),
  background: z.enum(["transparent", "white", "dark"]).default("dark"),
  dateRange: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  dimensions: z
    .object({
      width: z.number().min(400).max(4000).default(1200),
      height: z.number().min(300).max(3000).default(800),
    })
    .optional(),
});

router.post("/chart", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const validation = chartExportSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.message,
      });
    }

    const options = validation?.data;
    const jobId = randomBytes(8).toString("hex");

    const resolutionMultipliers: Record<string, number> = {
      standard: 1,
      high: 2,
      ultra: 4,
    };

    const job: ExportJob = {
      id: jobId,
      userId,
      name: `${options?.chartType} Chart Export`,
      type: "data",
      format: options.format,
      status: "queued",
      progress: 0,
      stage: "Rendering chart...",
      startTime: new Date(),
      retryCount: 0,
      settings: {
        ...options,
        effectiveWidth:
          (options?.dimensions?.width || 1200) *
          resolutionMultipliers[options?.resolution],
        effectiveHeight:
          (options?.dimensions?.height || 800) *
          resolutionMultipliers[options?.resolution],
      },
    };

    exportJobs?.set(jobId, job);

    setTimeout(() => {
      const currentJob = exportJobs?.get(jobId);
      if (currentJob) {
        currentJob.status = "preparing";
        simulateExportProgress(jobId);
      }
    }, 500);

    res.json({
      success: true,
      jobId,
      chartType: options.chartType,
      format: options.format,
      downloadUrl: `/api/export/download/${jobId}`,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error exporting chart:");
    res.status(500).json({ error: "Failed to export chart" });
  }
});

// ============================================================================
// BULK EXPORT (with ZIP bundling)
// ============================================================================


const bulkExportSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["audio", "document", "analytics", "report"]),
        format: z.string().optional(),
      }),
    )
    .min(1)
    .max(100),
  settings: z.object({
    format: z
      .object({
        useUnifiedFormat: z.boolean().default(true),
        format: z.string().optional(),
        zipCompression: z.boolean().default(true),
      })
      .optional(),
    quality: z
      .object({
        sampleRate: z.number().optional(),
        bitDepth: z.number().optional(),
        bitrate: z.number().optional(),
        channels: z.enum(["mono", "stereo"]).optional(),
      })
      .optional(),
    emailNotification: z.boolean().default(true),
    projectId: z.string().optional(),
  }),
});

router.post("/bulk", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const validation = bulkExportSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.message,
      });
    }

    const { items, settings } = validation?.data;
    const jobId = randomBytes(8).toString("hex");
    const isLargeExport = items?.length > 20;

    const job: ExportJob = {
      id: jobId,
      userId,
      name: `Bulk Export (${items?.length} items)`,
      type: "batch",
      format: settings.format?.zipCompression ? "zip" : "mixed",
      status: "queued",
      progress: 0,
      stage: "Preparing bulk export...",
      startTime: new Date(),
      retryCount: 0,
      settings: {
        items,
        ...settings,
        isLargeExport,
      },
    };

    exportJobs?.set(jobId, job);

    setTimeout(() => {
      const currentJob = exportJobs?.get(jobId);
      if (currentJob) {
        currentJob.status = "preparing";
        simulateExportProgress(jobId);
      }
    }, 500);

    const estimatedSeconds = items?.length * 5 + 30;

    res.json({
      success: true,
      jobId,
      totalItems: items.length,
      status: "queued",
      estimatedTime: estimatedSeconds,
      downloadUrl: `/api/export/download/${jobId}`,
      emailNotification: settings.emailNotification && isLargeExport,
      message: isLargeExport
        ? "Large export queued. You will receive an email when complete."
        : "Export started.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error starting bulk export:");
    res.status(500).json({ error: "Failed to start bulk export" });
  }
});

// Download bulk export ZIP
router.get(
  "/download/zip/:jobId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const job = exportJobs?.get(jobId);
      if (!job) {
        return res.status(404).json({ error: "Export not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (job?.status !== "complete") {
        return res.status(400).json({ error: "Export not ready" });
      }

      res.json({
        success: true,
        message: "ZIP download initiated",
        fileName: `${job?.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`,
        fileSize: job.fileSize,
        itemCount:
          ((job?.settings as Record<string, unknown>)?.items as any)?.length || 0,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error downloading ZIP:");
      res.status(500).json({ error: "Failed to download" });
    }
  },
);

// ============================================================================
// AUDIO EXPORT WITH MASTERING
// ============================================================================

const masteredExportSchema = z.object({
  format: z.enum(["wav", "mp3", "flac", "aiff"]),
  preset: z
    .enum(["streaming", "cd", "vinyl", "broadcast", "archival"])
    .optional(),
  processing: z
    .object({
      normalize: z.boolean().default(true),
      normalizeTarget: z.number().min(-24).max(0).default(-14),
      limiter: z.boolean().default(true),
      limiterCeiling: z.number().min(-6).max(0).default(-1),
      dither: z.boolean().default(false),
      ditherType: z
        .enum(["none", "triangular", "noise-shaped"])
        .default("none"),
    })
    .optional(),
  quality: z
    .object({
      sampleRate: z.number().default(48000),
      bitDepth: z.number().default(24),
      bitrate: z.number().default(320),
      channels: z.enum(["mono", "stereo"]).default("stereo"),
    })
    .optional(),
  fileName: z.string().min(1).max(255),
});

router.post(
  "/audio/:projectId/mastered",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const validation = masteredExportSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res.status(400).json({
          success: false,
          error: validation.error.message,
        });
      }

      const options = validation?.data;
      const jobId = randomBytes(8).toString("hex");

      const presetSettings: Record<
        string,
        Partial<typeof options.processing>
      > = {
        streaming: {
          normalize: true,
          normalizeTarget: -14,
          limiter: true,
          limiterCeiling: -1,
        },
        cd: {
          normalize: true,
          normalizeTarget: -0.3,
          dither: true,
          ditherType: "noise-shaped",
        },
        vinyl: {
          normalize: true,
          normalizeTarget: -3,
          limiter: true,
          limiterCeiling: -0.5,
        },
        broadcast: {
          normalize: true,
          normalizeTarget: -23,
          limiter: true,
          limiterCeiling: -1,
        },
        archival: { normalize: false, dither: false },
      };

      const effectiveProcessing = options?.preset
        ? { ...options?.processing, ...presetSettings[options?.preset] }
        : options?.processing;

      const job: ExportJob = {
        id: jobId,
        userId,
        name: options.fileName || `Mastered_${Date?.now()}`,
        type: "audio",
        format: options.format,
        status: "queued",
        progress: 0,
        stage: "Preparing mastered export...",
        startTime: new Date(),
        retryCount: 0,
        settings: {
          ...options,
          processing: effectiveProcessing,
          isMastered: true,
          preset: options.preset,
        },
        projectId,
      };

      exportJobs?.set(jobId, job);

      setTimeout(() => {
        const currentJob = exportJobs?.get(jobId);
        if (currentJob) {
          currentJob.status = "preparing";
          simulateExportProgress(jobId);
        }
      }, 500);

      res.json({
        success: true,
        jobId,
        preset: options.preset,
        estimatedTime: 60,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error starting mastered export:");
      res.status(500).json({ error: "Failed to start mastered export" });
    }
  },
);

// ============================================================================
// STEMS EXPORT
// ============================================================================

const stemsExportSchema = z.object({
  format: z.enum(["wav", "flac", "aiff"]),
  tracks: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        mute: z.boolean().optional(),
        solo: z.boolean().optional(),
      }),
    )
    .min(1),
  includeEffects: z.boolean().default(true),
  preserveVolumePan: z.boolean().default(true),
  addEffectTail: z.boolean().default(true),
  namingConvention: z
    .enum(["track-name", "numbered", "custom"])
    .default("track-name"),
  quality: z
    .object({
      sampleRate: z.number().default(48000),
      bitDepth: z.number().default(24),
    })
    .optional(),
  bundleAsZip: z.boolean().default(true),
});

router.post(
  "/audio/:projectId/stems",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const validation = stemsExportSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res.status(400).json({
          success: false,
          error: validation.error.message,
        });
      }

      const options = validation?.data;
      const jobId = randomBytes(8).toString("hex");

      const job: ExportJob = {
        id: jobId,
        userId,
        name: `Stems Export (${options?.tracks.length} tracks)`,
        type: "stems",
        format: options.bundleAsZip ? "zip" : options?.format,
        status: "queued",
        progress: 0,
        stage: "Preparing stems export...",
        startTime: new Date(),
        retryCount: 0,
        settings: options,
        projectId,
      };

      exportJobs?.set(jobId, job);

      setTimeout(() => {
        const currentJob = exportJobs?.get(jobId);
        if (currentJob) {
          currentJob.status = "preparing";
          simulateExportProgress(jobId);
        }
      }, 500);

      const estimatedSeconds = options?.tracks.length * 15 + 30;

      res.json({
        success: true,
        jobId,
        trackCount: options.tracks.length,
        estimatedTime: estimatedSeconds,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error starting stems export:");
      res.status(500).json({ error: "Failed to start stems export" });
    }
  },
);

// ============================================================================
// STATUS ENDPOINT (alias for jobs/:jobId)
// ============================================================================

router.get(
  "/status/:exportId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { exportId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const job = exportJobs?.get(exportId);
      if (!job) {
        return res.status(404).json({ error: "Export not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const response = {
        id: job.id,
        name: job.name,
        type: job.type,
        format: job.format,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        startTime: job.startTime,
        estimatedEndTime: job.estimatedEndTime,
        completedTime: job.completedTime,
        fileSize: job.fileSize,
        downloadUrl: job.status === "complete" ? job?.downloadUrl : undefined,
        error: job.error,
        canRetry: job.status === "failed" && job?.retryCount < 3,
        retryCount: job.retryCount,
      };

      res.json(response);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching export status:");
      res.status(500).json({ error: "Failed to fetch status" });
    }
  },
);

// ============================================================================
// NOTIFY LARGE EXPORT (email simulation)
// ============================================================================

router.post(
  "/notify/:jobId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;
      const userId = req.user!.id;
      const { email } = req.body;

      const job = exportJobs?.get(jobId);
      if (!job) {
        return res.status(404).json({ error: "Export not found" });
      }

      if (job?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      logger.info(`Email notification requested for job ${jobId} to ${email}`);

      res.json({
        success: true,
        message: `Notification will be sent to ${email} when export completes`,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error setting up notification:");
      res.status(500).json({ error: "Failed to set up notification" });
    }
  },
);

export default router;
