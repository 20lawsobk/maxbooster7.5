import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, inArray, sql, desc, isNull } from "drizzle-orm";
import {
  analytics,
  batchTemplates,
  distroReleases,
  posts,
  userStorageFiles,
  listings,
  beats,
  studioTracks,
  stemExports,
} from "@shared/schema";
import { logger } from "../logger.js";

const router = Router();

interface BatchRequest {
  ids: string[];
  data?: Record<string, any>;
}

interface BatchResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
}

function createBatchResult(
  successIds: string[],
  failures: Array<{ id: string; error: string }>,
  totalRequested: number,
): BatchResult {
  return {
    success: successIds,
    failed: failures,
    totalRequested,
    totalSucceeded: successIds.length,
    totalFailed: failures.length,
  };
}

router?.post("/releases/submit", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled0 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(distroReleases)
          .set({ status: "pending" })
          .where(
            and(eq(distroReleases?.id, id), eq(distroReleases?.artistId, userId)),
          )
          .returning({ id: distroReleases.id });
        if (result?.length === 0)
          throw new Error("Release not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled0?.length; _i++) {
      const r = _settled0[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to submit release",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch release submit error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/releases/takedown", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled1 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(distroReleases)
          .set({ status: "takedown" })
          .where(
            and(eq(distroReleases?.id, id), eq(distroReleases?.artistId, userId)),
          )
          .returning({ id: distroReleases.id });
        if (result?.length === 0)
          throw new Error("Release not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled1?.length; _i++) {
      const r = _settled1[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to takedown release",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch release takedown error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/releases/update", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const allowedUpdate: Record<string, unknown> = {};
    if (data?.title && typeof data?.title === "string")
      allowedUpdate.title = data?.title;
    if (data?.status && typeof data?.status === "string")
      allowedUpdate.status = data?.status;
    if (data?.artworkUrl && typeof data?.artworkUrl === "string")
      allowedUpdate.artworkUrl = data?.artworkUrl;

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled2 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(distroReleases)
          .set(allowedUpdate)
          .where(
            and(eq(distroReleases?.id, id), eq(distroReleases?.artistId, userId)),
          )
          .returning({ id: distroReleases.id });
        if (result?.length === 0)
          throw new Error("Release not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled2?.length; _i++) {
      const r = _settled2[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to update release",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch release update error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/releases/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled3 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(distroReleases)
          .set({ status: "deleted" })
          .where(
            and(eq(distroReleases?.id, id), eq(distroReleases?.artistId, userId)),
          )
          .returning({ id: distroReleases.id });
        if (result?.length === 0)
          throw new Error("Release not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled3?.length; _i++) {
      const r = _settled3[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete release",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch release delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/posts/schedule", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const scheduledAt = data?.scheduledTime
      ? new Date(data?.scheduledTime)
      : new Date();
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled4 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(posts)
          .set({ scheduledAt, status: "scheduled" })
          .where(and(eq(posts?.id, id), eq(posts?.userId, userId)))
          .returning({ id: posts.id });
        if (result?.length === 0)
          throw new Error("Post not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled4?.length; _i++) {
      const r = _settled4[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to schedule post",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch post schedule error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/posts/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled5 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .delete(posts)
          .where(and(eq(posts?.id, id), eq(posts?.userId, userId)))
          .returning({ id: posts.id });
        if (result?.length === 0)
          throw new Error("Post not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled5?.length; _i++) {
      const r = _settled5[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete post",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch post delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/posts/update", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const allowedUpdate: Record<string, unknown> = {};
    if (data?.content && typeof data?.content === "string")
      allowedUpdate.content = data?.content;
    if (data?.status && typeof data?.status === "string")
      allowedUpdate.status = data?.status;
    if (data?.scheduledAt)
      allowedUpdate.scheduledAt = new Date(data?.scheduledAt as string);

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled6 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(posts)
          .set(allowedUpdate)
          .where(and(eq(posts?.id, id), eq(posts?.userId, userId)))
          .returning({ id: posts.id });
        if (result?.length === 0)
          throw new Error("Post not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled6?.length; _i++) {
      const r = _settled6[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to update post",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch post update error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/files/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled7 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(userStorageFiles)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(userStorageFiles?.id, id),
              eq(userStorageFiles?.userId, userId),
            ),
          )
          .returning({ id: userStorageFiles.id });
        if (result?.length === 0)
          throw new Error("File not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled7?.length; _i++) {
      const r = _settled7[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete file",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch file delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/files/move", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const targetFolder = typeof data?.folder === "string" ? data?.folder : "/";
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled8 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(userStorageFiles)
          .set({ folder: targetFolder })
          .where(
            and(
              eq(userStorageFiles?.id, id),
              eq(userStorageFiles?.userId, userId),
            ),
          )
          .returning({ id: userStorageFiles.id });
        if (result?.length === 0)
          throw new Error("File not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled8?.length; _i++) {
      const r = _settled8[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to move file",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch file move error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/files/download", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled9 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const [file] = await db
          .select({ id: userStorageFiles.id })
          .from(userStorageFiles)
          .where(
            and(
              eq(userStorageFiles?.id, id),
              eq(userStorageFiles?.userId, userId),
              isNull(userStorageFiles?.deletedAt),
            ),
          )
          .limit(1);
        if (!file) throw new Error("File not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled9?.length; _i++) {
      const r = _settled9[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to prepare download",
        });
    }

    const downloadUrl =
      successIds?.length > 0
        ? `/api/files/bulk-download?ids=${successIds?.join(",")}`
        : null;

    res.json({
      ...createBatchResult(successIds, failures, ids?.length),
      downloadUrl,
    });
  } catch (error) {
    logger.warn("Batch file download error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/files/update", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const allowedUpdate: Record<string, unknown> = {};
    if (data?.isPublic !== undefined)
      allowedUpdate.isPublic = Boolean(data?.isPublic);
    if (data?.metadata && typeof data?.metadata === "object")
      allowedUpdate.metadata = data?.metadata;
    if (data?.folder && typeof data?.folder === "string")
      allowedUpdate.folder = data?.folder;

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled10 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(userStorageFiles)
          .set(allowedUpdate)
          .where(
            and(
              eq(userStorageFiles?.id, id),
              eq(userStorageFiles?.userId, userId),
            ),
          )
          .returning({ id: userStorageFiles.id });
        if (result?.length === 0)
          throw new Error("File not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled10?.length; _i++) {
      const r = _settled10[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to update file",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch file update error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/marketplace/update", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const allowedUpdate: Record<string, unknown> = {};
    if (data?.title && typeof data?.title === "string")
      allowedUpdate.title = data?.title;
    if (data?.description && typeof data?.description === "string")
      allowedUpdate.description = data?.description;
    if (typeof data?.isPublished === "boolean")
      allowedUpdate.isPublished = data?.isPublished;
    if (data?.priceCents !== undefined)
      allowedUpdate.priceCents = Number(data?.priceCents);

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled11 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(listings)
          .set(allowedUpdate)
          .where(and(eq(listings?.id, id), eq(listings?.userId, userId)))
          .returning({ id: listings.id });
        if (result?.length === 0)
          throw new Error("Listing not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled11?.length; _i++) {
      const r = _settled11[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to update listing",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch marketplace update error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/marketplace/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled12 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(listings)
          .set({ isPublished: false })
          .where(and(eq(listings?.id, id), eq(listings?.userId, userId)))
          .returning({ id: listings.id });
        if (result?.length === 0)
          throw new Error("Listing not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled12?.length; _i++) {
      const r = _settled12[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete listing",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch marketplace delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/analytics/export", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;

    const rows = await db
      .select({
        id: analytics.id,
        platform: analytics.platform,
        date: analytics.date,
        streams: analytics.streams,
        revenue: analytics.revenue,
        totalListeners: analytics.totalListeners,
        followers: analytics.followers,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), inArray(analytics?.platform, ids)),
      )
      .orderBy(desc(analytics?.date));

    const exportId = `export_${Date?.now()}`;

    batchJobs?.set(exportId, {
      status: "completed",
      processed: rows.length,
      total: rows.length,
      success: rows.length,
      failed: 0,
      failures: [],
      startTime: Date.now(),
      exportData: rows as unknown as Record<string, unknown>[],
    });

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      exportId,
      downloadUrl: `/api/batch/analytics/export/${exportId}/download`,
    });
  } catch (error) {
    logger.warn("Batch analytics export error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.get(
  "/analytics/export/:exportId/download",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { exportId } = req.params;
      const job = batchJobs?.get(exportId);

      if (!job || !job?.exportData) {
        return res.status(404).json({ error: "Export not found or expired" });
      }

      const rows = job?.exportData;
      const headers = [
        "id",
        "platform",
        "date",
        "streams",
        "revenue",
        "totalListeners",
        "followers",
      ];
      const csvLines = [
        headers?.join(","),
        ...rows?.map((r) =>
          headers
            .map((h) => {
              const val = r[h];
              if (val === null || val === undefined) return "";
              if (val instanceof Date) return val?.toISOString();
              return String(val).replace(/,/g, ";");
            })
            .join(","),
        ),
      ];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="analytics-export-${exportId}.csv"`,
      );
      res.send(csvLines?.join("\n"));
    } catch (error) {
      logger.warn("Analytics export download error:", error?.message || error);
      res.status(500).json({ error: "Failed to process request" });
    }
  },
);

router?.post("/analytics/compare", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;

    const analyticsData = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .groupBy(analytics?.platform);

    const analyticsMap = new Map(analyticsData?.map((a) => [a?.platform, a]));

    const comparisonData = ids?.map((id) => {
      const data = analyticsMap?.get(id);
      const streamCount = Number(data?.streams) || 0;
      const rev = Number(data?.revenue) || 0;
      const listeners = Number(data?.listeners) || 0;
      const engagement =
        streamCount > 0 && listeners > 0
          ? Math.round((streamCount / listeners) * 100) / 100
          : 0;
      return { id, streams: streamCount, revenue: rev, engagement };
    });

    const succeeded = comparisonData?.map((d) => d?.id);

    res.json({
      success: succeeded,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: succeeded.length,
      totalFailed: 0,
      comparisonData,
    });
  } catch (error) {
    logger.warn("Batch analytics compare error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

const batchJobs: Map<
  string,
  {
    status: string;
    processed: number;
    total: number;
    success: number;
    failed: number;
    failures: Array<{ id: string; error: string }>;
    currentItem?: string;
    startTime: number;
    exportData?: Record<string, unknown>[];
  }
> = new Map();

// Prevent unbounded memory growth: evict jobs that are done or older than 30 min.
// Without this, every batch/analytics export leaks a Map entry forever.
const BATCH_JOB_TTL_MS = 30 * 60 * 1000;
setInterval(
  () => {
    const cutoff = Date?.now() - BATCH_JOB_TTL_MS;
    for (const [id, job] of batchJobs) {
      if (
        job?.startTime < cutoff ||
        ["completed", "failed", "error", "cancelled"].includes(job?.status)
      ) {
        batchJobs?.delete(id);
      }
    }
  },
  10 * 60 * 1000,
).unref();

router?.post("/tracks/move", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const targetProjectId =
      typeof data?.targetProjectId === "string" ? data?.targetProjectId : null;
    const newOrder = typeof data?.order === "number" ? data?.order : null;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled13 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const updatePayload: Record<string, unknown> = {};
        if (targetProjectId) updatePayload.projectId = targetProjectId;
        if (newOrder !== null) updatePayload.order = newOrder;
        if (Object.keys(updatePayload).length === 0) return id;
        const result = await db
          .update(studioTracks)
          .set(updatePayload)
          .where(eq(studioTracks?.id, id))
          .returning({ id: studioTracks.id });
        if (result?.length === 0) throw new Error("Track not found");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled13?.length; _i++) {
      const r = _settled13[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to move track",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch track move error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/tracks/tag", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const tags = Array.isArray(data?.tags) ? data?.tags : [];
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled14 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const [existing] = await db
          .select({ metadata: studioTracks.metadata })
          .from(studioTracks)
          .where(eq(studioTracks?.id, id))
          .limit(1);
        if (!existing) throw new Error("Track not found");
        const existingMeta =
          (existing?.metadata as Record<string, unknown>) || {};
        await db
          .update(studioTracks)
          .set({ metadata: { ...existingMeta, tags } })
          .where(eq(studioTracks?.id, id));
        return id;
      }),
    );
    for (let _i = 0; _i < _settled14?.length; _i++) {
      const r = _settled14[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to tag track",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch track tag error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/tracks/export", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const format = typeof data?.format === "string" ? data?.format : "wav";
    const bitDepth = typeof data?.bitDepth === "number" ? data?.bitDepth : 24;
    const sampleRate =
      typeof data?.sampleRate === "number" ? data?.sampleRate : 44100;

    const [firstTrack] = await db
      .select({ projectId: studioTracks.projectId })
      .from(studioTracks)
      .where(eq(studioTracks?.id, ids[0]))
      .limit(1);

    if (!firstTrack) {
      return res.status(404).json({ error: "Track not found" });
    }

    const [exportRecord] = await db
      .insert(stemExports)
      .values({
        projectId: firstTrack.projectId,
        userId,
        name: `Batch export ${new Date().toISOString()}`,
        format,
        bitDepth,
        sampleRate,
        trackIds: ids,
        status: "pending",
      })
      .returning();

    batchJobs?.set(exportRecord?.id, {
      status: "processing",
      processed: 0,
      total: ids.length,
      success: 0,
      failed: 0,
      failures: [],
      startTime: Date.now(),
    });

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      exportId: exportRecord.id,
      jobId: exportRecord.id,
    });
  } catch (error) {
    logger.warn("Batch track export error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/tracks/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled15 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .delete(studioTracks)
          .where(eq(studioTracks?.id, id))
          .returning({ id: studioTracks.id });
        if (result?.length === 0) throw new Error("Track not found");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled15?.length; _i++) {
      const r = _settled15[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete track",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch track delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/beats/update", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const allowedUpdate: Record<string, unknown> = {};
    if (data?.title && typeof data?.title === "string")
      allowedUpdate.title = data?.title;
    if (data?.description && typeof data?.description === "string")
      allowedUpdate.description = data?.description;
    if (data?.price !== undefined) allowedUpdate.price = Number(data?.price);
    if (data?.genre && typeof data?.genre === "string")
      allowedUpdate.genre = data?.genre;
    if (typeof data?.isPublished === "boolean")
      allowedUpdate.isPublished = data?.isPublished;

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled16 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(beats)
          .set(allowedUpdate)
          .where(and(eq(beats?.id, id), eq(beats?.userId, userId)))
          .returning({ id: beats.id });
        if (result?.length === 0)
          throw new Error("Beat not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled16?.length; _i++) {
      const r = _settled16[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to update beat",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch beat update error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/beats/delete", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled17 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(beats)
          .set({ isPublished: false })
          .where(and(eq(beats?.id, id), eq(beats?.userId, userId)))
          .returning({ id: beats.id });
        if (result?.length === 0)
          throw new Error("Beat not found or access denied");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled17?.length; _i++) {
      const r = _settled17[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to delete beat",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch beat delete error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/posts/approve", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids?.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const userId = req.user!.id;
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    const _settled18 = await Promise?.allSettled(
      ids?.map(async (id) => {
        const result = await db
          .update(posts)
          .set({
            approvalStatus: "approved",
            reviewedBy: userId,
            reviewedAt: new Date(),
          })
          .where(eq(posts?.id, id))
          .returning({ id: posts.id });
        if (result?.length === 0) throw new Error("Post not found");
        return id;
      }),
    );
    for (let _i = 0; _i < _settled18?.length; _i++) {
      const r = _settled18[_i];
      if (r?.status === "fulfilled") successIds?.push(r?.value);
      else
        failures?.push({
          id: ids[_i],
          error: r.reason?.message || "Failed to approve post",
        });
    }

    res.json(createBatchResult(successIds, failures, ids?.length));
  } catch (error) {
    logger.warn("Batch post approve error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.get("/progress/:jobId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { jobId } = req.params;
    const job = batchJobs?.get(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({
      jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      success: job.success,
      failed: job.failed,
      failures: job.failures,
      currentItem: job.currentItem,
      elapsedMs: Date.now() - job?.startTime,
    });
  } catch (error) {
    logger.warn("Get batch progress error:", error?.message || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.get("/templates", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;
    const resource = req.query.resource as string | undefined;

    const conditions = [eq(batchTemplates?.userId, userId)];
    if (resource) {
      conditions?.push(eq(batchTemplates?.resource, resource));
    }

    const rows = await db
      .select()
      .from(batchTemplates)
      .where(and(...conditions))
      .orderBy(desc(batchTemplates?.updatedAt))
      .limit(200);

    res.json({ templates: rows });
  } catch (error) {
    logger.warn({ err: error }, "Get templates error:");
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/templates", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;
    const { name, description, resource, action, configuration } = req.body;

    if (!name || !resource || !configuration) {
      return res
        .status(400)
        .json({ error: "Name, resource, and configuration are required" });
    }

    const [inserted] = await db
      .insert(batchTemplates)
      .values({
        userId,
        name,
        description: description || null,
        resource,
        action: action || "bulk_operation",
        configuration,
      })
      .returning();

    res.json(inserted);
  } catch (error) {
    logger.warn({ err: error }, "Create template error:");
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const [existing] = await db
      .select({ id: batchTemplates.id, userId: batchTemplates.userId })
      .from(batchTemplates)
      .where(eq(batchTemplates?.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (existing?.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, description, resource, action, configuration, isFavorite } =
      req.body;

    const [updated] = await db
      .update(batchTemplates)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(resource !== undefined && { resource }),
        ...(action !== undefined && { action }),
        ...(configuration !== undefined && { configuration }),
        ...(isFavorite !== undefined && { isFavorite }),
        updatedAt: new Date(),
      })
      .where(and(eq(batchTemplates?.id, id), eq(batchTemplates?.userId, userId)))
      .returning();

    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "Update template error:");
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const [deleted] = await db
      .delete(batchTemplates)
      .where(and(eq(batchTemplates?.id, id), eq(batchTemplates?.userId, userId)))
      .returning({ id: batchTemplates.id });

    if (!deleted) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    logger.warn({ err: error }, "Delete template error:");
    res.status(500).json({ error: "Failed to process request" });
  }
});

router?.post("/templates/:id/share", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { email } = req.body;
    const userId = req.user.id;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email address is required" });
    }

    const [original] = await db
      .select()
      .from(batchTemplates)
      .where(and(eq(batchTemplates?.id, id), eq(batchTemplates?.userId, userId)))
      .limit(1);

    if (!original) {
      return res.status(404).json({ error: "Template not found" });
    }

    const [sharedCopy] = await db
      .insert(batchTemplates)
      .values({
        userId,
        name: original.name,
        description: original.description,
        resource: original.resource,
        action: original.action,
        configuration: original.configuration as Record<string, unknown>,
        isShared: true,
        sharedBy: req.user.email || req.user.username,
        usageCount: 0,
      })
      .returning();

    res.json({
      success: true,
      message: "Template shared successfully",
      sharedTemplate: sharedCopy,
    });
  } catch (error) {
    logger.warn({ err: error }, "Share template error:");
    res.status(500).json({ error: "Failed to process request" });
  }
});

export default router;
