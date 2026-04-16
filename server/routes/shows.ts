import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import { shows, setlists } from "@shared/schema";
import { eq, and, gte, lt, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const safeDate = z.string().refine(
  (val) => !isNaN(new Date(val).getTime()),
  { message: "Invalid date format" }
).transform((val) => new Date(val));

const createShowSchema = z.object({
  name: z.string().min(1).max(200),
  venue: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(2).optional().default("US"),
  date: safeDate,
  endTime: z.string().optional().refine(
    (val) => !val || !isNaN(new Date(val).getTime()),
    { message: "Invalid end time format" }
  ).transform((val) => val ? new Date(val) : undefined),
  ticketUrl: z.string().url().optional().or(z.literal("")),
  capacity: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
  isPublic: z.boolean().optional().default(true),
  status: z.enum(["upcoming", "completed", "cancelled"]).optional().default("upcoming"),
});

const createSetlistSchema = z.object({
  name: z.string().min(1).max(200),
  showId: z.string().optional(),
  tracks: z.array(z.object({
    title: z.string().min(1).max(200),
    duration: z.string().optional(),
    key: z.string().optional(),
    bpm: z.number().int().min(1).max(400).optional(),
    notes: z.string().max(500).optional(),
  })).default([]),
  totalDuration: z.number().min(0).optional().default(0),
});

// GET /api/shows - list shows with optional filters
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const filter = req.query.filter as string | undefined;

  const now = new Date();
  const conditions = [eq(shows.userId, userId)];

  if (filter === "upcoming") {
    conditions.push(gte(shows.date, now));
  } else if (filter === "past") {
    conditions.push(lt(shows.date, now));
  }

  const userShows = await db.select()
    .from(shows)
    .where(and(...conditions))
    .orderBy(filter === "upcoming" ? asc(shows.date) : desc(shows.date))
    .limit(limit)
    .offset(offset);

  res.json(userShows);
}));

// POST /api/shows - create show
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = createShowSchema.parse(req.body);

  const [newShow] = await db.insert(shows)
    .values({ ...data, userId })
    .returning();

  res.status(201).json(newShow);
}));

// PUT /api/shows/:id - update show
router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;
  const data = createShowSchema.partial().parse(req.body);

  const [updatedShow] = await db.update(shows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();

  if (!updatedShow) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json(updatedShow);
}));

// PATCH /api/shows/:id - partial update show (alias for PUT to support both methods)
router.patch("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;
  const data = createShowSchema.partial().parse(req.body);

  const [updatedShow] = await db.update(shows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();

  if (!updatedShow) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json(updatedShow);
}));

// DELETE /api/shows/:id - delete show
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const [deletedShow] = await db.delete(shows)
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();

  if (!deletedShow) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json({ error: "Show deleted successfully" });
}));

// PATCH /api/shows/:id/attendance - record post-show actual attendance and revenue
router.patch("/:id/attendance", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const parsed = z.object({
    ticketsSold: z.number().int().min(0),
    revenue: z.number().min(0),
    status: z.enum(["upcoming", "completed", "cancelled"]).optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
  }

  const [updated] = await db.update(shows)
    .set({
      ticketsSold: parsed.data.ticketsSold,
      revenue: parsed.data.revenue,
      ...(parsed.data.status ? { status: parsed.data.status } : { status: "completed" }),
      updatedAt: new Date(),
    })
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json(updated);
}));

// PATCH /api/shows/:id/status - update show status
router.patch("/:id/status", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const parsed = z.object({
    status: z.enum(["upcoming", "completed", "cancelled"]),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
  }

  const [updated] = await db.update(shows)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json(updated);
}));

// GET /api/shows/stats - show performance summary (single query with conditional aggregation)
router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const [stats] = await db.select({
    totalShows: sql<number>`count(*)`,
    totalRevenue: sql<number>`coalesce(sum(${shows.revenue}), 0)`,
    avgTicketsSold: sql<number>`coalesce(avg(${shows.ticketsSold}), 0)`,
    upcomingCount: sql<number>`count(*) filter (where ${shows.date} >= now())`,
    pastCount: sql<number>`count(*) filter (where ${shows.date} < now())`,
    pastRevenue: sql<number>`coalesce(sum(${shows.revenue}) filter (where ${shows.date} < now()), 0)`,
    avgCapacityFill: sql<number>`coalesce(avg(case when ${shows.capacity} > 0 then ${shows.ticketsSold}::float / ${shows.capacity} * 100 else null end), 0)`,
  })
    .from(shows)
    .where(eq(shows.userId, userId));

  res.json({
    totalShows: Number(stats?.totalShows ?? 0),
    totalRevenue: Number(stats?.totalRevenue ?? 0),
    avgTicketsSold: Number(stats?.avgTicketsSold ?? 0),
    upcomingCount: Number(stats?.upcomingCount ?? 0),
    pastCount: Number(stats?.pastCount ?? 0),
    pastRevenue: Number(stats?.pastRevenue ?? 0),
    avgCapacityFill: Math.round(Number(stats?.avgCapacityFill ?? 0)),
  });
}));

// GET /api/shows/:id - get single show (must come after /stats)
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const [show] = await db.select()
    .from(shows)
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .limit(1);

  if (!show) {
    return res.status(404).json({ error: "Show not found" });
  }

  res.json(show);
}));

// GET /api/shows/setlists - list all setlists for user
router.get("/setlists", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const userSetlists = await db.select()
    .from(setlists)
    .where(eq(setlists.userId, userId))
    .orderBy(desc(setlists.updatedAt));
  res.json(userSetlists);
}));

// GET /api/shows/:id/setlist - get setlist for a show
router.get("/:id/setlist", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const [showSetlist] = await db.select()
    .from(setlists)
    .where(and(eq(setlists.showId, showId), eq(setlists.userId, userId)))
    .limit(1);

  res.json(showSetlist || null);
}));

// POST /api/shows/setlists - create setlist
router.post("/setlists", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = createSetlistSchema.parse(req.body);

  const [newSetlist] = await db.insert(setlists)
    .values({ ...data, userId })
    .returning();

  res.status(201).json(newSetlist);
}));

// PUT /api/shows/setlists/:id - update setlist
router.put("/setlists/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const setlistId = req.params.id;
  const data = createSetlistSchema.partial().parse(req.body);

  const [updatedSetlist] = await db.update(setlists)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(setlists.id, setlistId), eq(setlists.userId, userId)))
    .returning();

  if (!updatedSetlist) {
    return res.status(404).json({ error: "Setlist not found" });
  }

  res.json(updatedSetlist);
}));

// DELETE /api/shows/setlists/:id - delete setlist
router.delete("/setlists/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const setlistId = req.params.id;

  const [deletedSetlist] = await db.delete(setlists)
    .where(and(eq(setlists.id, setlistId), eq(setlists.userId, userId)))
    .returning();

  if (!deletedSetlist) {
    return res.status(404).json({ error: "Setlist not found" });
  }

  res.json({ error: "Setlist deleted successfully" });
}));

export default router;
