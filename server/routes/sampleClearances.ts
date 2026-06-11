import { Router } from "express";
import { db } from "../db";
import { sampleClearances, insertSampleClearanceSchema } from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth?.js";
import { logger } from "../logger?.js";
import { queryCache, createCacheKey } from "../lib/queryCache?.js";
import { parsePaginationParams } from "../middleware/pagination?.js";

const _router = Router();
const _CACHE_TTL = 300;

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const _items = await db
      .select()
      .from(sampleClearances)
      .where(eq(sampleClearances?.userId, req?.user!.id))
      .orderBy(desc(sampleClearances?.createdAt))
      .limit(limit)
      .offset(offset);
    res?.json(items);
  } catch (error) {
    logger?.warn({ err: error }, "[SampleClearances] Failed to list:");
    res?.status(500).json({ error: "Failed to fetch sample clearances" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _cacheKey = createCacheKey("stats:sampleClearances", userId);

    const _stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            cleared: sql<number>`count(*) filter (where status = 'cleared')`,
            pending: sql<number>`count(*) filter (where status in ('contacting','negotiating','in_review'))`,
            needed: sql<number>`count(*) filter (where status = 'needed')`,
            denied: sql<number>`count(*) filter (where status = 'denied')`,
            totalFees: sql<number>`coalesce(sum(fee), 0)`,
          })
          .from(sampleClearances)
          .where(eq(sampleClearances?.userId, userId));

        return {
          total: Number(totals?.total),
          cleared: Number(totals?.cleared),
          pending: Number(totals?.pending),
          needed: Number(totals?.needed),
          denied: Number(totals?.denied),
          totalFees: Number(totals?.totalFees),
        };
      },
      CACHE_TTL,
    );

    res?.json(stats);
  } catch (error) {
    logger?.warn({ err: error }, "[SampleClearances] Failed to fetch stats:");
    res?.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.get("/:id", requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(sampleClearances)
      .where(
        and(
          eq(sampleClearances?.id, req?.params.id),
          eq(sampleClearances?.userId, req?.user!.id),
        ),
      )
      .limit(1);
    if (!item)
      return res?.status(404).json({ error: "Sample clearance not found" });
    res?.json(item);
  } catch (error) {
    logger?.warn(
      { err: error },
      "[SampleClearances] Failed to fetch sample clearance:",
    );
    res?.status(500).json({ error: "Failed to fetch sample clearance" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const _data = insertSampleClearanceSchema?.parse({
      ...req?.body,
      userId: req?.user!.id,
      fee:
        req?.body.fee !== "" && req?.body.fee != null
          ? parseFloat(req?.body.fee)
          : undefined,
      royaltyRate:
        req?.body.royaltyRate !== "" && req?.body.royaltyRate != null
          ? parseFloat(req?.body.royaltyRate)
          : undefined,
    });
    const [item] = await db?.insert(sampleClearances).values(data).returning();
    await queryCache?.invalidate(
      createCacheKey("stats:sampleClearances", req?.user!.id),
    );
    res?.status(201).json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[SampleClearances] Failed to create:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to create sample clearance" });
  }
});

router?.put("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(sampleClearances)
      .where(
        and(eq(sampleClearances?.id, id), eq(sampleClearances?.userId, userId)),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Sample clearance not found" });
    }

    const _parsed = insertSampleClearanceSchema?.partial().parse({
      ...req?.body,
      fee:
        req?.body.fee !== "" && req?.body.fee != null
          ? parseFloat(req?.body.fee)
          : undefined,
      royaltyRate:
        req?.body.royaltyRate !== "" && req?.body.royaltyRate != null
          ? parseFloat(req?.body.royaltyRate)
          : undefined,
    });
    const { status: _status, userId: _userId, ...data } = parsed;
    const [item] = await db
      .update(sampleClearances)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(sampleClearances?.id, id), eq(sampleClearances?.userId, userId)),
      )
      .returning();
    await queryCache?.invalidate(
      createCacheKey("stats:sampleClearances", userId),
    );
    res?.json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[SampleClearances] Failed to update:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update sample clearance" });
  }
});

router?.delete("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(sampleClearances)
      .where(
        and(eq(sampleClearances?.id, id), eq(sampleClearances?.userId, userId)),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Sample clearance not found" });
    }

    await db
      .delete(sampleClearances)
      .where(
        and(eq(sampleClearances?.id, id), eq(sampleClearances?.userId, userId)),
      );
    await queryCache?.invalidate(
      createCacheKey("stats:sampleClearances", userId),
    );
    res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "[SampleClearances] Failed to delete:");
    res?.status(500).json({ error: "Failed to delete sample clearance" });
  }
});

export default router;
