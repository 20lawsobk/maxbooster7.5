import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import { shows, setlists } from "@shared/schema";
import { eq, and, gte, lt, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Zod schemas for validation
const createShowSchema = z.object({
  name: z.string().min(1),
  venue: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional().default("US"),
  date: z.string().transform((val) => new Date(val)),
  endTime: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  ticketUrl: z.string().optional(),
  capacity: z.number().optional(),
  notes: z.string().optional(),
  isPublic: z.boolean().optional().default(true),
});

const createSetlistSchema = z.object({
  name: z.string().min(1),
  showId: z.string().optional(),
  tracks: z.array(z.object({
    title: z.string(),
    duration: z.string().optional(),
    key: z.string().optional(),
    bpm: z.number().optional(),
    notes: z.string().optional(),
  })).default([]),
  totalDuration: z.number().optional().default(0),
});

// GET /api/shows - list all shows (paginated)
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const userShows = await db.select()
    .from(shows)
    .where(eq(shows.userId, userId))
    .orderBy(desc(shows.date))
    .limit(limit)
    .offset(offset);

  res.json(userShows);
}));

// POST /api/shows - create show
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = createShowSchema.parse(req.body);
  
  const [newShow] = await db.insert(shows)
    .values({
      ...data,
      userId,
    })
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
    return res.status(404).json({ message: "Show not found" });
  }
  
  res.json(updatedShow);
}));

// DELETE /api/shows/:id - delete/cancel show
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;
  
  const [deletedShow] = await db.delete(shows)
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .returning();
    
  if (!deletedShow) {
    return res.status(404).json({ message: "Show not found" });
  }
  
  res.json({ message: "Show deleted successfully" });
}));

// GET /api/shows/stats - total shows, total revenue, avg attendance
router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  const [stats] = await db.select({
    totalShows: sql<number>`count(*)`,
    totalRevenue: sql<number>`sum(${shows.revenue})`,
    avgTicketsSold: sql<number>`avg(${shows.ticketsSold})`,
  })
  .from(shows)
  .where(eq(shows.userId, userId));
  
  res.json({
    totalShows: Number(stats?.totalShows || 0),
    totalRevenue: Number(stats?.totalRevenue || 0),
    avgTicketsSold: Number(stats?.avgTicketsSold || 0),
  });
}));

// GET /api/shows/:id - get single show (must come after /stats to avoid route shadowing)
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const showId = req.params.id;

  const [show] = await db.select()
    .from(shows)
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .limit(1);

  if (!show) {
    return res.status(404).json({ message: "Show not found" });
  }

  res.json(show);
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

// POST /api/setlists - create setlist
router.post("/setlists", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = createSetlistSchema.parse(req.body);
  
  const [newSetlist] = await db.insert(setlists)
    .values({
      ...data,
      userId,
    })
    .returning();
    
  res.status(201).json(newSetlist);
}));

// PUT /api/setlists/:id - update setlist
router.put("/setlists/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const setlistId = req.params.id;
  const data = createSetlistSchema.partial().parse(req.body);
  
  const [updatedSetlist] = await db.update(setlists)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(setlists.id, setlistId), eq(setlists.userId, userId)))
    .returning();
    
  if (!updatedSetlist) {
    return res.status(404).json({ message: "Setlist not found" });
  }
  
  res.json(updatedSetlist);
}));

// DELETE /api/setlists/:id - delete setlist
router.delete("/setlists/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const setlistId = req.params.id;
  
  const [deletedSetlist] = await db.delete(setlists)
    .where(and(eq(setlists.id, setlistId), eq(setlists.userId, userId)))
    .returning();
    
  if (!deletedSetlist) {
    return res.status(404).json({ message: "Setlist not found" });
  }
  
  res.json({ message: "Setlist deleted successfully" });
}));

export default router;
