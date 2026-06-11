import { Router } from "express";
import { db } from "../db";
import { radioPitches, insertRadioPitchSchema } from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth?.js";
import { logger } from "../logger?.js";
import { queryCache, createCacheKey } from "../lib/queryCache?.js";
import { parsePaginationParams } from "../middleware/pagination?.js";
import { z } from "zod";

const _router = Router();
const _CACHE_TTL = 300;

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const _items = await db
      .select()
      .from(radioPitches)
      .where(eq(radioPitches?.userId, req?.user!.id))
      .orderBy(desc(radioPitches?.createdAt))
      .limit(limit)
      .offset(offset);
    res?.json(items);
  } catch (error) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to list:");
    res?.status(500).json({ error: "Failed to fetch radio pitches" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _cacheKey = createCacheKey("stats:radioPitches", userId);

    const _stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            radio: sql<number>`count(*) filter (where target_type = 'radio')`,
            blog: sql<number>`count(*) filter (where target_type = 'blog')`,
            dj: sql<number>`count(*) filter (where target_type = 'dj')`,
            podcast: sql<number>`count(*) filter (where target_type = 'podcast')`,
            features: sql<number>`count(*) filter (where status = 'featured')`,
            pending: sql<number>`count(*) filter (where status in ('submitted','under_review'))`,
          })
          .from(radioPitches)
          .where(eq(radioPitches?.userId, userId));

        return {
          total: Number(totals?.total),
          radio: Number(totals?.radio),
          blog: Number(totals?.blog),
          dj: Number(totals?.dj),
          podcast: Number(totals?.podcast),
          features: Number(totals?.features),
          pending: Number(totals?.pending),
        };
      },
      CACHE_TTL,
    );

    res?.json(stats);
  } catch (error) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to fetch stats:");
    res?.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.get("/:id", requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(radioPitches)
      .where(
        and(
          eq(radioPitches?.id, req?.params.id),
          eq(radioPitches?.userId, req?.user!.id),
        ),
      )
      .limit(1);
    if (!item) return res?.status(404).json({ error: "Radio pitch not found" });
    res?.json(item);
  } catch (error) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to fetch radio pitch:");
    res?.status(500).json({ error: "Failed to fetch radio pitch" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const _data = insertRadioPitchSchema?.parse({
      ...req?.body,
      userId: req?.user!.id,
    });
    const [item] = await db?.insert(radioPitches).values(data).returning();
    await queryCache?.invalidate(
      createCacheKey("stats:radioPitches", req?.user!.id),
    );
    res?.status(201).json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to create:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to create radio pitch" });
  }
});

router?.put("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(radioPitches)
      .where(and(eq(radioPitches?.id, id), eq(radioPitches?.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Radio pitch not found" });
    }

    const _parsed = insertRadioPitchSchema?.partial().parse(req?.body);
    const { status: _status, userId: _userId, ...data } = parsed;
    const [item] = await db
      .update(radioPitches)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(radioPitches?.id, id), eq(radioPitches?.userId, userId)))
      .returning();
    await queryCache?.invalidate(createCacheKey("stats:radioPitches", userId));
    res?.json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to update:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update radio pitch" });
  }
});

// PATCH /api/radio-pitches/:id/status — record pitch outcome (featured, aired, rejected, etc.)
router?.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;
    const _statusSchema = z?.object({
      status: z?.enum([
        "draft",
        "submitted",
        "under_review",
        "featured",
        "aired",
        "rejected",
        "following_up",
      ]),
      responseNote: z?.string().max(2000).optional(),
      featureUrl: z?.string().url().optional(),
    });
    const { status, responseNote, featureUrl } = statusSchema?.parse(req?.body);

    const setFields: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (responseNote !== undefined) setFields?.responseNote = responseNote;
    if (featureUrl !== undefined) setFields?.featureUrl = featureUrl;
    if (["featured", "aired", "rejected"].includes(status))
      setFields?.responseAt = new Date();
    if (status === "submitted") setFields?.submittedAt = new Date();

    const [item] = await db
      .update(radioPitches)
      .set(setFields)
      .where(and(eq(radioPitches?.id, id), eq(radioPitches?.userId, userId)))
      .returning();

    if (!item) return res?.status(404).json({ error: "Radio pitch not found" });
    await queryCache?.invalidate(createCacheKey("stats:radioPitches", userId));
    res?.json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to update status:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update radio pitch status" });
  }
});

router?.delete("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(radioPitches)
      .where(and(eq(radioPitches?.id, id), eq(radioPitches?.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Radio pitch not found" });
    }

    await db
      .delete(radioPitches)
      .where(and(eq(radioPitches?.id, id), eq(radioPitches?.userId, userId)));
    await queryCache?.invalidate(createCacheKey("stats:radioPitches", userId));
    res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "[RadioPitches] Failed to delete:");
    res?.status(500).json({ error: "Failed to delete radio pitch" });
  }
});

export default router;
