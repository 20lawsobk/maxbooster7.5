import { requireUUIDParam } from "../middleware/requestValidation.js";
import { Router } from "express";
import { db } from "../db";
import {
  musicVideoProductions,
  insertMusicVideoProductionSchema,
} from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { queryCache, createCacheKey } from "../lib/queryCache.js";
import { parsePaginationParams } from "../middleware/pagination.js";
import {
  getDiffusionTrainingStatus,
  trainDiffusionModel,
  generateDiffusionFrames,
} from "../services/diffusionVideoService.js";

const router = Router();
const CACHE_TTL = 300;

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const items = await db
      .select()
      .from(musicVideoProductions)
      .where(eq(musicVideoProductions?.userId, req.user!.id))
      .orderBy(desc(musicVideoProductions?.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(items);
  } catch (error) {
    logger.warn({ err: error }, "[MusicVideos] Failed to list:");
    res.status(500).json({ error: "Failed to fetch music video productions" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey("stats:musicVideos", userId);

    const stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            released: sql<number>`count(*) filter (where stage = 'released')`,
            inProduction: sql<number>`count(*) filter (where stage in ('filming','editing','color_grade','mastering'))`,
            planned: sql<number>`count(*) filter (where stage in ('concept','pre_production','casting'))`,
            totalViews: sql<number>`coalesce(sum(views), 0)`,
            totalBudget: sql<number>`coalesce(sum(budget), 0)`,
          })
          .from(musicVideoProductions)
          .where(eq(musicVideoProductions?.userId, userId));

        return {
          total: Number(totals?.total),
          released: Number(totals?.released),
          inProduction: Number(totals?.inProduction),
          planned: Number(totals?.planned),
          totalViews: Number(totals?.totalViews),
          totalBudget: Number(totals?.totalBudget),
        };
      },
      CACHE_TTL,
    );

    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, "[MusicVideos] Failed to fetch stats:");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const data = insertMusicVideoProductionSchema?.parse({
      ...req.body,
      userId: req.user!.id,
      budget:
        req.body.budget !== "" && req.body.budget != null
          ? parseFloat(req.body.budget)
          : undefined,
    });
    const [item] = await db
      .insert(musicVideoProductions)
      .values(data)
      .returning();
    await queryCache?.invalidate(
      createCacheKey("stats:musicVideos", req.user!.id),
    );
    res.status(201).json(item);
  } catch (error: unknown) {
    logger.warn({ err: error }, "[MusicVideos] Failed to create:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as unknown as Record<string, unknown>).flatten(),
        });
    }
    res.status(500).json({ error: "Failed to create music video production" });
  }
});

router?.put("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db
      .select()
      .from(musicVideoProductions)
      .where(
        and(
          eq(musicVideoProductions?.id, id),
          eq(musicVideoProductions?.userId, userId),
        ),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res
        .status(404)
        .json({ error: "Music video production not found" });
    }

    const data = insertMusicVideoProductionSchema?.partial().parse({
      ...req.body,
      budget:
        req.body.budget !== "" && req.body.budget != null
          ? parseFloat(req.body.budget)
          : undefined,
    });
    const [item] = await db
      .update(musicVideoProductions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(musicVideoProductions?.id, id),
          eq(musicVideoProductions?.userId, userId),
        ),
      )
      .returning();
    await queryCache?.invalidate(createCacheKey("stats:musicVideos", userId));
    res.json(item);
  } catch (error: unknown) {
    logger.warn({ err: error }, "[MusicVideos] Failed to update:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as unknown as Record<string, unknown>).flatten(),
        });
    }
    res.status(500).json({ error: "Failed to update music video production" });
  }
});

router?.delete("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db
      .select()
      .from(musicVideoProductions)
      .where(
        and(
          eq(musicVideoProductions?.id, id),
          eq(musicVideoProductions?.userId, userId),
        ),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res
        .status(404)
        .json({ error: "Music video production not found" });
    }

    await db
      .delete(musicVideoProductions)
      .where(
        and(
          eq(musicVideoProductions?.id, id),
          eq(musicVideoProductions?.userId, userId),
        ),
      );
    await queryCache?.invalidate(createCacheKey("stats:musicVideos", userId));
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "[MusicVideos] Failed to delete:");
    res.status(500).json({ error: "Failed to delete music video production" });
  }
});

// GET /:id - get single music video production (after /stats to avoid route shadowing)
router?.get("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(musicVideoProductions)
      .where(
        and(
          eq(musicVideoProductions?.id, req.params.id),
          eq(musicVideoProductions?.userId, req.user!.id),
        ),
      )
      .limit(1);
    if (!item)
      return res
        .status(404)
        .json({ error: "Music video production not found" });
    res.json(item);
  } catch (error) {
    logger.warn({ err: error }, "[MusicVideos] Failed to fetch production:");
    res.status(500).json({ error: "Failed to fetch music video production" });
  }
});

// ── In-house Diffusion Video Engine endpoints ─────────────────────────────

router?.get("/diffusion/status", requireAuth, async (_req, res) => {
  try {
    const status = getDiffusionTrainingStatus();
    res.json({
      ...status,
      message: status.trained
        ? `Neural model trained — ${status?.epochs} epochs, loss ${status?.finalLoss?.toFixed(4)}, ${status?.weightsSizeKB} KB`
        : "Model not trained. POST /diffusion/train to train from scratch.",
    });
  } catch (err) {
    logger.warn({ err: err }, "[Diffusion] Status error:");
    res.status(500).json({ error: "Failed to get diffusion model status" });
  }
});

router?.post("/diffusion/train", requireAuth, async (req, res) => {
  // tier: 'quick' (~19min) | 'medium' (~76min) | 'deep' (~190min, Veo-level depth)
  const { tier = "quick", nSamples, nEpochs } = req.body ?? {};

  const tierDefaults: Record<string, { n: number; e: number; eta: string }> = {
    quick: { n: 300, e: 10, eta: "~28 min" },
    medium: { n: 600, e: 20, eta: "~110 min" },
    deep: { n: 1000, e: 30, eta: "~275 min" },
  };
  const cfg = tierDefaults[tier] ?? tierDefaults?.quick;
  const finalSamples = nSamples ?? cfg?.n;
  const finalEpochs = nEpochs ?? cfg?.e;

  logger.info(
    `[Diffusion] Training started: tier=${tier} ${finalSamples} samples × ${finalEpochs} epochs`,
  );

  res.json({
    message: `Training started (tier='${tier}'): ${finalSamples} samples × ${finalEpochs} epochs (${cfg?.eta} on CPU).`,
    note: "Poll GET /api/music-videos/diffusion/status to check when done.",
    tier,
    nSamples: finalSamples,
    nEpochs: finalEpochs,
    estimatedTime: cfg.eta,
    architecture: {
      parameters: "1.2M",
      channels: [32, 64, 96],
      attention: true,
      residualBlocks: true,
      emaWeights: true,
      cosineSchedule: true,
      perceptualLoss: true,
    },
  });

  const logs: string[] = [];

  trainDiffusionModel({
    tier: tier as "quick" | "medium" | "deep",
    nSamples: nSamples ?? undefined,
    nEpochs: nEpochs ?? undefined,
    onLog: (line) => {
      logs?.push(line);
      logger.info(`[Diffusion:train] ${line}`);
    },
  })
    .then((status) => {
      logger.info(
        `[Diffusion] Training complete. loss=${status?.finalLoss?.toFixed(4)}`,
      );
    })
    .catch((err) => {
      logger.warn({ err: err }, "[Diffusion] Training failed:");
    });
});

router?.post("/diffusion/generate", requireAuth, async (req, res) => {
  try {
    const {
      prompt = "",
      genre = "hip-hop",
      nFrames = 15,
      fps = 30,
      frameSize = 512,
      guidanceScale = 5.0,
    } = req.body ?? {};

    const status = getDiffusionTrainingStatus();
    if (!status?.trained) {
      return res.status(400).json({
        error: "Diffusion model not trained yet.",
        hint: "POST /api/music-videos/diffusion/train first.",
      });
    }

    logger.info(
      `[Diffusion] Generating: prompt="${prompt}" genre=${genre} frames=${nFrames}`,
    );

    const result = await generateDiffusionFrames({
      prompt,
      genre,
      nFrames,
      fps,
      frameSize,
      guidanceScale,
    });

    res.json({
      framePaths: result.framePaths,
      frameCount: result.frameCount,
      elapsedMs: result.elapsedMs,
      modelMeta: result.modelMeta,
      message: `Generated ${result?.frameCount} frames in ${(result?.elapsedMs / 1000).toFixed(1)}s`,
    });
  } catch (err) {
    logger.warn({ err: err }, "[Diffusion] Generate error:");
    res
      .status(500)
      .json({ error: "Diffusion generation failed", details: String(err) });
  }
});

// ── Background self-training control endpoints ─────────────────────────────

router?.get("/diffusion/background/status", requireAuth, async (_req, res) => {
  try {
    const { getBackgroundStatus } = await import(
      "../services/diffusionBackgroundTrainer.js"
    );
    res.json(getBackgroundStatus());
  } catch {
    res.json({ running: false, error: "Background trainer not loaded" });
  }
});

router?.post("/diffusion/background/start", requireAuth, async (_req, res) => {
  try {
    const { startBackgroundTraining, getBackgroundStatus } = await import(
      "../services/diffusionBackgroundTrainer.js"
    );
    startBackgroundTraining();
    res.json({
      message: "Background self-training started",
      status: getBackgroundStatus(),
    });
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Could not start background trainer",
        details: String(err),
      });
  }
});

router?.post("/diffusion/background/stop", requireAuth, async (req, res) => {
  try {
    const { force } = req.body ?? {};
    const {
      stopBackgroundTraining,
      forceStopBackgroundTraining,
      getBackgroundStatus,
    } = await import("../services/diffusionBackgroundTrainer.js");
    if (force) {
      forceStopBackgroundTraining();
    } else {
      stopBackgroundTraining();
    }
    res.json({
      message: force
        ? "Background training force-stopped"
        : "Background training will stop after current session",
      status: getBackgroundStatus(),
    });
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Could not stop background trainer",
        details: String(err),
      });
  }
});

export default router;
