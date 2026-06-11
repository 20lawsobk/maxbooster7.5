import { requireUUIDParam } from "../middleware/requestValidation.js";
import { Router } from "express";
import { db } from "../db";
import { labelSubmissions, insertLabelSubmissionSchema } from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { queryCache, createCacheKey } from "../lib/queryCache.js";
import { parsePaginationParams } from "../middleware/pagination.js";
import { z } from "zod";

const _router = Router();
const _CACHE_TTL = 300;

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const _items = await db
      .select()
      .from(labelSubmissions)
      .where(eq(labelSubmissions?.userId, req?.user!.id))
      .orderBy(desc(labelSubmissions?.createdAt))
      .limit(limit)
      .offset(offset);
    res?.json(items);
  } catch (error) {
    logger?.warn({ err: error }, "[LabelSubmissions] Failed to list:");
    res?.status(500).json({ error: "Failed to fetch label submissions" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _cacheKey = createCacheKey("stats:labelSubmissions", userId);

    const _stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            submitted: sql<number>`count(*) filter (where status = 'submitted')`,
            accepted: sql<number>`count(*) filter (where status = 'accepted')`,
            responded: sql<number>`count(*) filter (where status in ('accepted','rejected','declined'))`,
            pending: sql<number>`count(*) filter (where status in ('submitted','under_review','following_up'))`,
          })
          .from(labelSubmissions)
          .where(eq(labelSubmissions?.userId, userId));

        const _total = Number(totals?.total);
        const _submitted = Number(totals?.submitted);
        const _accepted = Number(totals?.accepted);
        const _responded = Number(totals?.responded);
        const _pending = Number(totals?.pending);
        return {
          total,
          submitted,
          responded,
          accepted,
          pending,
          conversionRate:
            submitted > 0 ? Math?.round((accepted / submitted) * 100) : 0,
        };
      },
      CACHE_TTL,
    );

    res?.json(stats);
  } catch (error) {
    logger?.warn({ err: error }, "[LabelSubmissions] Failed to fetch stats:");
    res?.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.get("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(labelSubmissions)
      .where(
        and(
          eq(labelSubmissions?.id, req?.params.id),
          eq(labelSubmissions?.userId, req?.user!.id),
        ),
      )
      .limit(1);
    if (!item) return res?.status(404).json({ error: "Submission not found" });
    res?.json(item);
  } catch (error) {
    logger?.warn(
      { err: error },
      "[LabelSubmissions] Failed to fetch submission:",
    );
    res?.status(500).json({ error: "Failed to fetch label submission" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const _data = insertLabelSubmissionSchema?.parse({
      ...req?.body,
      userId: req?.user!.id,
    });
    const [item] = await db?.insert(labelSubmissions).values(data).returning();
    await queryCache?.invalidate(
      createCacheKey("stats:labelSubmissions", req?.user!.id),
    );
    res?.status(201).json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[LabelSubmissions] Failed to create:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to create label submission" });
  }
});

router?.put("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(labelSubmissions)
      .where(
        and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Submission not found" });
    }

    const _parsed = insertLabelSubmissionSchema?.partial().parse(req?.body);
    const { status: _status, userId: _userId, ...data } = parsed;
    const [item] = await db
      .update(labelSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
      )
      .returning();
    await queryCache?.invalidate(
      createCacheKey("stats:labelSubmissions", userId),
    );
    res?.json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[LabelSubmissions] Failed to update:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update label submission" });
  }
});

// PATCH /api/label-submissions/:id/status - quick status update
router?.patch(
  "/:id/status",
  requireAuth,
  requireUUIDParam("id"),
  async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const { id } = req?.params;
      const _statusSchema = z?.object({
        status: z?.enum([
          "draft",
          "submitted",
          "under_review",
          "following_up",
          "accepted",
          "rejected",
          "declined",
        ]),
        responseNote: z?.string().max(2000).optional(),
        responseAt: z?.string().datetime().optional(),
      });
      const { status, responseNote, responseAt } = statusSchema?.parse(req?.body);

      const setFields: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };
      if (responseNote !== undefined) setFields.responseNote = responseNote;
      if (responseAt !== undefined) setFields.responseAt = new Date(responseAt);
      else if (["accepted", "rejected", "declined"].includes(status)) {
        setFields.responseAt = new Date();
      }

      const [item] = await db
        .update(labelSubmissions)
        .set(setFields)
        .where(
          and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
        )
        .returning();

      if (!item) return res?.status(404).json({ error: "Submission not found" });
      await queryCache?.invalidate(
        createCacheKey("stats:labelSubmissions", userId),
      );
      res?.json(item);
    } catch (error: unknown) {
      logger?.warn(
        { err: error },
        "[LabelSubmissions] Failed to update status:",
      );
      if (error instanceof Error && error?.name === "ZodError") {
        return res
          .status(400)
          .json({
            error: "Validation error",
            details: (error as Record<string, unknown>).flatten(),
          });
      }
      res?.status(500).json({ error: "Failed to update submission status" });
    }
  },
);

// POST /api/label-submissions/:id/followup - log a follow-up attempt
router?.post(
  "/:id/followup",
  requireAuth,
  requireUUIDParam("id"),
  async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const { id } = req?.params;
      const _followupSchema = z?.object({
        nextFollowUpAt: z?.string().datetime().optional(),
        notes: z?.string().max(2000).optional(),
      });
      const { nextFollowUpAt, notes } = followupSchema?.parse(req?.body);

      const setFields: Record<string, unknown> = {
        status: "following_up",
        updatedAt: new Date(),
      };
      if (nextFollowUpAt !== undefined)
        setFields.followUpAt = new Date(nextFollowUpAt);
      if (notes !== undefined) setFields.notes = notes;

      const [item] = await db
        .update(labelSubmissions)
        .set(setFields)
        .where(
          and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
        )
        .returning();

      if (!item) return res?.status(404).json({ error: "Submission not found" });
      await queryCache?.invalidate(
        createCacheKey("stats:labelSubmissions", userId),
      );
      res?.json({ success: true, submission: item });
    } catch (error: unknown) {
      logger?.warn(
        { err: error },
        "[LabelSubmissions] Failed to log follow-up:",
      );
      if (error instanceof Error && error?.name === "ZodError") {
        return res
          .status(400)
          .json({
            error: "Validation error",
            details: (error as Record<string, unknown>).flatten(),
          });
      }
      res?.status(500).json({ error: "Failed to log follow-up" });
    }
  },
);

router?.delete("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(labelSubmissions)
      .where(
        and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Submission not found" });
    }

    await db
      .delete(labelSubmissions)
      .where(
        and(eq(labelSubmissions?.id, id), eq(labelSubmissions?.userId, userId)),
      );
    await queryCache?.invalidate(
      createCacheKey("stats:labelSubmissions", userId),
    );
    res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "[LabelSubmissions] Failed to delete:");
    res?.status(500).json({ error: "Failed to delete label submission" });
  }
});

export default router;
