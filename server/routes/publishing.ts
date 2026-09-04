// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePremium } from "../middleware/requirePremium";
import { db } from "../db";
import { publishingRights } from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../logger.js";

const router = Router();

const splitSchema = z.coerce.number().finite().min(0).max(100).optional();

const insertPublishingSchema = z.object({
  trackTitle: z.string().min(1).max(500),
  iswc: z.string().max(20).optional(),
  isrc: z.string().max(20).optional(),
  upc: z.string().max(20).optional(),
  coWriters: z.unknown().optional(),
  publisherName: z.string().max(500).optional(),
  proName: z.string().max(200).optional(),
  proRegistrationId: z.string().max(200).optional(),
  publishingSplit: splitSchema,
  writerSplit: splitSchema,
  copyrightYear: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  status: z.enum(["pending", "confirmed", "active", "inactive"]).optional(),
  notes: z.string().max(5000).optional(),
});

const workIdSchema = z.string().uuid();

function hasValidSplitTotal(writerSplit: unknown, publishingSplit: unknown) {
  const writer = Number(writerSplit);
  const publisher = Number(publishingSplit);
  return (
    Number.isFinite(writer) &&
    Number.isFinite(publisher) &&
    writer >= 0 &&
    writer <= 100 &&
    publisher >= 0 &&
    publisher <= 100 &&
    Math.abs(writer + publisher - 100) < 1e-9
  );
}

function splitValidationError(res: Parameters<typeof router.post>[1]) {
  return res.status(400).json({
    error:
      "Writer and publisher splits must each be between 0 and 100 and total exactly 100.",
  });
}

router.use(requireAuth, requirePremium);

// GET /api/publishing - list registered works (paginated)
router.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    // Cap offset — an unbounded offset forces Postgres to scan and discard rows,
    // becoming a denial-of-service vector at scale (offset=99999999).
    const rawOffset = parseInt(req.query.offset as string) || 0;
    const offset = Math.min(
      Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
      100_000,
    );
    const works = await db
      .select()
      .from(publishingRights)
      .where(eq(publishingRights.userId, userId))
      .orderBy(desc(publishingRights.registeredAt))
      .limit(limit)
      .offset(offset);
    res.json(works);
  } catch (error) {
    logger.warn(
      { err: error },
      "[Publishing] Failed to fetch registered works:",
    );
    res.status(500).json({ error: "Failed to fetch registered works" });
  }
});

// POST /api/publishing - register new work
router.post("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = insertPublishingSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }
    const { status: _status, ...data } = parsed?.data ?? {};
    const writerSplit = data.writerSplit ?? 50;
    const publishingSplit = data.publishingSplit ?? 50;
    if (!hasValidSplitTotal(writerSplit, publishingSplit)) {
      return splitValidationError(res);
    }
    const [work] = await db
      .insert(publishingRights)
      .values({
        ...data,
        writerSplit,
        publishingSplit,
        userId,
        registeredAt: new Date(),
        status: "pending",
      })
      .returning();
    res.json(work);
  } catch (error) {
    logger.warn({ err: error }, "[Publishing] Failed to register work:");
    res.status(500).json({ error: "Failed to register work" });
  }
});

// PUT /api/publishing/:id - update registration
router.put("/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    if (!workIdSchema.safeParse(id).success) {
      return res.status(400).json({ error: "Invalid work ID" });
    }
    const parsed = insertPublishingSchema?.partial().safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }
    const { status: _status, ...updateData } = parsed?.data ?? {};
    const [existing] = await db
      .select()
      .from(publishingRights)
      .where(
        and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)),
      )
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Work not found" });

    const writerSplit = updateData.writerSplit ?? existing.writerSplit;
    const publishingSplit =
      updateData.publishingSplit ?? existing.publishingSplit;
    if (!hasValidSplitTotal(writerSplit, publishingSplit)) {
      return splitValidationError(res);
    }
    const [updated] = await db
      .update(publishingRights)
      .set(updateData)
      .where(
        and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)),
      )
      .returning();
    if (!updated) return res.status(404).json({ error: "Work not found" });
    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "[Publishing] Failed to update work:");
    res.status(500).json({ error: "Failed to update work" });
  }
});

// DELETE /api/publishing/:id - delete record
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    if (!workIdSchema.safeParse(id).success) {
      return res.status(400).json({ error: "Invalid work ID" });
    }
    const [deleted] = await db
      .delete(publishingRights)
      .where(
        and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)),
      )
      .returning();
    if (!deleted) return res.status(404).json({ error: "Work not found" });
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "[Publishing] Failed to delete record:");
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// GET /api/publishing/stats - aggregate stats via SQL
router.get("/stats", async (req, res) => {
  try {
    const userId = req.user!.id;
    const [stats] = await db
      .select({
        totalWorks: count(),
        pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
        confirmedCount: sql<number>`count(*) filter (where status in ('confirmed', 'active'))`,
        avgPublishingSplit: sql<number>`coalesce(avg(publishing_split), 0)`,
      })
      .from(publishingRights)
      .where(eq(publishingRights.userId, userId));

    res.json({
      totalWorks: Number(stats?.totalWorks),
      pendingCount: Number(stats?.pendingCount),
      confirmedCount: Number(stats?.confirmedCount),
      avgPublishingSplit: Number(stats?.avgPublishingSplit),
    });
  } catch (error) {
    logger.warn(
      { err: error },
      "[Publishing] Failed to fetch publishing stats:",
    );
    res.status(500).json({ error: "Failed to fetch publishing stats" });
  }
});

// GET /api/publishing/:id - get single registered work (after /stats to avoid shadowing)
router.get("/:id", async (req, res) => {
  try {
    const parsedId = workIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: "Invalid work ID" });
    }
    const [work] = await db
      .select()
      .from(publishingRights)
      .where(
        and(
          eq(publishingRights.id, parsedId.data),
          eq(publishingRights.userId, req.user!.id),
        ),
      )
      .limit(1);
    if (!work) return res.status(404).json({ error: "Work not found" });
    res.json(work);
  } catch (error) {
    logger.warn({ err: error }, "[Publishing] Failed to fetch work:");
    res.status(500).json({ error: "Failed to fetch publishing record" });
  }
});

export default router;
