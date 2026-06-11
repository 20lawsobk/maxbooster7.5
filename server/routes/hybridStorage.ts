/**
 * HYBRID STORAGE API ROUTES
 *
 * Unified API for the hybrid storage system combining
 * Replit Object Storage with Pocket Dimension technology.
 */

import { Router, Request, Response } from "express";
import {
  hybridStorageService,
  StorageTier,
  StorageLocation,
} from "../services/hybridStorageService?.js";
import { createHardenedUpload } from "../middleware/uploadHandler?.js";
import { logger } from "../logger?.js";
import { requireAuth } from "../middleware/auth?.js";

const _router = Router();
const _upload = createHardenedUpload({
  maxFileSize: 100 * 1024 * 1024, // 100MB max
  maxFiles: 1,
  label: "hybrid storage file",
});

/**
 * POST /api/hybrid-storage/upload
 * Upload a file with intelligent routing
 */
router?.post(
  "/upload",
  requireAuth,
  upload?.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req?.file) {
        return res?.status(400).json({ error: "No file provided" });
      }

      const _userId = req?.user!.id;
      const { folder, forceLocation, forceTier } = req?.body;

      const _result = await hybridStorageService?.upload(
        userId,
        req?.file.originalname,
        req?.file.buffer,
        req?.file.mimetype,
        {
          folder,
          forceLocation: forceLocation as StorageLocation | undefined,
          forceTier: forceTier as StorageTier | undefined,
        },
      );

      res?.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Upload error:");
      res?.status(500).json({ error: "Upload failed" });
    }
  },
);

/**
 * GET /api/hybrid-storage/file/:fileKey
 * Download a file (auto-routes to correct storage)
 */
router?.get(
  "/file/:fileKey",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user!.id;
      const _fileKey = decodeURIComponent(req?.params.fileKey);

      const _metadata = hybridStorageService?.getMetadata(fileKey);
      if (!metadata) {
        return res?.status(404).json({ error: "File not found" });
      }

      if (metadata?.userId !== userId) {
        return res?.status(403).json({ error: "Access denied" });
      }

      const _data = await hybridStorageService?.read(userId, fileKey);

      res?.setHeader("Content-Type", metadata?.mimeType);
      res?.setHeader(
        "Content-Disposition",
        `inline; filename="${metadata?.originalName}"`,
      );
      res?.setHeader("Content-Length", data?.length);
      res?.setHeader("X-Storage-Tier", metadata?.tier);
      res?.setHeader("X-Storage-Location", metadata?.location);

      res?.send(data);
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Download error:");
      res?.status(500).json({ error: "Download failed" });
    }
  },
);

/**
 * DELETE /api/hybrid-storage/file/:fileKey
 * Delete a file from storage
 */
router?.delete(
  "/file/:fileKey",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user!.id;
      const _fileKey = decodeURIComponent(req?.params.fileKey);

      const _metadata = hybridStorageService?.getMetadata(fileKey);
      if (!metadata) {
        return res?.status(404).json({ error: "File not found" });
      }

      if (metadata?.userId !== userId) {
        return res?.status(403).json({ error: "Access denied" });
      }

      const _success = await hybridStorageService?.delete(userId, fileKey);

      if (success) {
        res?.json({ success: true, message: "File deleted" });
      } else {
        res?.status(500).json({ error: "Delete failed" });
      }
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Delete error:");
      res?.status(500).json({ error: "Delete failed" });
    }
  },
);

/**
 * GET /api/hybrid-storage/files
 * List files for the current user
 */
router?.get("/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user!.id;
    const { tier, location, folder } = req?.query;

    const _files = hybridStorageService?.listFiles(userId, {
      tier: tier as StorageTier | undefined,
      location: location as StorageLocation | undefined,
      folder: folder as string | undefined,
    });

    res?.json({ files });
  } catch (error) {
    logger?.warn({ err: error }, "[HybridStorage] List error:");
    res?.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * GET /api/hybrid-storage/metadata/:fileKey
 * Get metadata for a file
 */
router?.get(
  "/metadata/:fileKey",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user!.id;
      const _fileKey = decodeURIComponent(req?.params.fileKey);

      const _metadata = hybridStorageService?.getMetadata(fileKey);
      if (!metadata) {
        return res?.status(404).json({ error: "File not found" });
      }

      if (metadata?.userId !== userId) {
        return res?.status(403).json({ error: "Access denied" });
      }

      res?.json({ metadata });
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Metadata error:");
      res?.status(500).json({ error: "Failed to get metadata" });
    }
  },
);

/**
 * POST /api/hybrid-storage/migrate
 * Migrate a file between tiers
 */
router?.post("/migrate", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user!.id;
    const { fileKey, targetTier, targetLocation } = req?.body;

    if (!fileKey || !targetTier || !targetLocation) {
      return res?.status(400).json({ error: "Missing required fields" });
    }

    const _metadata = hybridStorageService?.getMetadata(fileKey);
    if (!metadata) {
      return res?.status(404).json({ error: "File not found" });
    }

    if (metadata?.userId !== userId) {
      return res?.status(403).json({ error: "Access denied" });
    }

    const _success = await hybridStorageService?.migrateFile(
      userId,
      fileKey,
      targetTier as StorageTier,
      targetLocation as StorageLocation,
    );

    if (success) {
      const _newMetadata = hybridStorageService?.getMetadata(fileKey);
      res?.json({ success: true, metadata: newMetadata });
    } else {
      res?.status(500).json({ error: "Migration failed" });
    }
  } catch (error) {
    logger?.warn({ err: error }, "[HybridStorage] Migration error:");
    res?.status(500).json({ error: "Migration failed" });
  }
});

/**
 * GET /api/hybrid-storage/analytics
 * Get storage analytics for the current user
 */
router?.get("/analytics", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user!.id;
    const _analytics = await hybridStorageService?.getAnalytics(userId);

    res?.json({ analytics });
  } catch (error) {
    logger?.warn({ err: error }, "[HybridStorage] Analytics error:");
    res?.status(500).json({ error: "Failed to get analytics" });
  }
});

/**
 * POST /api/hybrid-storage/optimize
 * Optimize storage for the current user
 */
router?.post("/optimize", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user!.id;
    const _result = await hybridStorageService?.optimizeStorage(userId);

    res?.json({ success: true, ...result });
  } catch (error) {
    logger?.warn({ err: error }, "[HybridStorage] Optimize error:");
    res?.status(500).json({ error: "Optimization failed" });
  }
});

/**
 * POST /api/hybrid-storage/cleanup
 * Cleanup old/unused files
 */
router?.post("/cleanup", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user!.id;
    const { olderThanDays } = req?.body;

    const _result = await hybridStorageService?.cleanup(userId, {
      olderThanDays: olderThanDays ? parseInt(olderThanDays, 10) : undefined,
    });

    res?.json({ success: true, ...result });
  } catch (error) {
    logger?.warn({ err: error }, "[HybridStorage] Cleanup error:");
    res?.status(500).json({ error: "Cleanup failed" });
  }
});

/**
 * GET /api/hybrid-storage/download-url/:fileKey
 * Get download URL for a file
 */
router?.get(
  "/download-url/:fileKey",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user!.id;
      const _fileKey = decodeURIComponent(req?.params.fileKey);

      const _metadata = hybridStorageService?.getMetadata(fileKey);
      if (!metadata) {
        return res?.status(404).json({ error: "File not found" });
      }

      if (metadata?.userId !== userId) {
        return res?.status(403).json({ error: "Access denied" });
      }

      const _url = await hybridStorageService?.getDownloadUrl(userId, fileKey);

      res?.json({ url });
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Get URL error:");
      res?.status(500).json({ error: "Failed to get download URL" });
    }
  },
);

export default router;
