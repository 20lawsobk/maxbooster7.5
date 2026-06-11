import { requireUUIDParam } from "../middleware/requestValidation.js";
import { Router } from "express";
import { db } from "../db";
import { venueContacts, insertVenueContactSchema } from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { queryCache, createCacheKey } from "../lib/queryCache.js";
import { parsePaginationParams } from "../middleware/pagination.js";

const router = Router();
const CACHE_TTL = 300;

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const items = await db
      .select()
      .from(venueContacts)
      .where(eq(venueContacts?.userId, req?.user!.id))
      .orderBy(desc(venueContacts?.createdAt))
      .limit(limit)
      .offset(offset);
    res?.json(items);
  } catch (error) {
    logger?.warn({ err: error }, "[Venues] Failed to list:");
    res?.status(500).json({ error: "Failed to fetch venue contacts" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req?.user!.id;
    const cacheKey = createCacheKey("stats:venues", userId);

    const stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            prospects: sql<number>`count(*) filter (where status = 'prospect')`,
            contacted: sql<number>`count(*) filter (where status = 'contacted')`,
            booked: sql<number>`count(*) filter (where status = 'booked')`,
            declined: sql<number>`count(*) filter (where status = 'declined')`,
            totalCapacity: sql<number>`coalesce(sum(capacity), 0)`,
          })
          .from(venueContacts)
          .where(eq(venueContacts?.userId, userId));

        const total = Number(totals?.total);
        const totalCapacity = Number(totals?.totalCapacity);
        return {
          total,
          prospects: Number(totals?.prospects),
          contacted: Number(totals?.contacted),
          booked: Number(totals?.booked),
          declined: Number(totals?.declined),
          avgCapacity: total > 0 ? Math?.round(totalCapacity / total) : 0,
        };
      },
      CACHE_TTL,
    );

    res?.json(stats);
  } catch (error) {
    logger?.warn({ err: error }, "[Venues] Failed to fetch stats:");
    res?.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.get("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(venueContacts)
      .where(
        and(
          eq(venueContacts?.id, req?.params.id),
          eq(venueContacts?.userId, req?.user!.id),
        ),
      )
      .limit(1);
    if (!item)
      return res?.status(404).json({ error: "Venue contact not found" });
    res?.json(item);
  } catch (error) {
    logger?.warn({ err: error }, "[Venues] Failed to fetch venue contact:");
    res?.status(500).json({ error: "Failed to fetch venue contact" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const data = insertVenueContactSchema?.parse({
      ...req?.body,
      userId: req.user!.id,
    });
    const [item] = await db?.insert(venueContacts).values(data).returning();
    await queryCache?.invalidate(createCacheKey("stats:venues", req?.user!.id));
    res?.status(201).json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[Venues] Failed to create:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to create venue contact" });
  }
});

router?.put("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req?.user!.id;
    const { id } = req?.params;

    const existing = await db
      .select()
      .from(venueContacts)
      .where(and(eq(venueContacts?.id, id), eq(venueContacts?.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Venue contact not found" });
    }

    const data = insertVenueContactSchema?.partial().parse(req?.body);
    const [item] = await db
      .update(venueContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(venueContacts?.id, id), eq(venueContacts?.userId, userId)))
      .returning();
    await queryCache?.invalidate(createCacheKey("stats:venues", userId));
    res?.json(item);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[Venues] Failed to update:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update venue contact" });
  }
});

router?.delete("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req?.user!.id;
    const { id } = req?.params;

    const existing = await db
      .select()
      .from(venueContacts)
      .where(and(eq(venueContacts?.id, id), eq(venueContacts?.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Venue contact not found" });
    }

    await db
      .delete(venueContacts)
      .where(and(eq(venueContacts?.id, id), eq(venueContacts?.userId, userId)));
    await queryCache?.invalidate(createCacheKey("stats:venues", userId));
    res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "[Venues] Failed to delete:");
    res?.status(500).json({ error: "Failed to delete venue contact" });
  }
});

export default router;
