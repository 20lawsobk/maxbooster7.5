import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { syncSubmissions } from '@shared/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parsePaginationParams } from '../middleware/pagination.js';

const router = Router();

const insertSyncSchema = z.object({
  trackTitle: z.string().min(1),
  artistName: z.string().min(1),
  genre: z.string().optional(),
  mood: z.string().optional(),
  bpm: z.number().optional(),
  duration: z.number().optional(),
  description: z.string().optional(),
  usageType: z.string().optional(),
  isExclusive: z.boolean().default(false),
  price: z.string().optional(),
  previewUrl: z.string().optional(),
  submissionTarget: z.string().optional(),
});

// GET /api/sync-licensing - list user's sync catalog (paginated)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const catalog = await db
      .select()
      .from(syncSubmissions)
      .where(eq(syncSubmissions.userId, req.user!.id))
      .orderBy(desc(syncSubmissions.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync catalog' });
  }
});

// GET /api/sync-licensing/stats - aggregate stats via SQL (no full-table JS scan)
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [stats] = await db.select({
      totalTracks: count(),
      licensedCount: sql<number>`count(*) filter (where status = 'licensed')`,
      pendingCount: sql<number>`count(*) filter (where status in ('under_review', 'submitted'))`,
      revenue: sql<number>`coalesce(sum(license_fee), 0)`,
    })
      .from(syncSubmissions)
      .where(eq(syncSubmissions.userId, userId));

    res.json({
      totalTracks: Number(stats.totalTracks),
      licensedCount: Number(stats.licensedCount),
      pendingCount: Number(stats.pendingCount),
      revenue: Number(stats.revenue),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync stats' });
  }
});

// GET /api/sync-licensing/:id - get single listing
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(syncSubmissions)
      .where(and(eq(syncSubmissions.id, req.params.id), eq(syncSubmissions.userId, req.user!.id)))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Listing not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// POST /api/sync-licensing - add track to sync catalog
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = insertSyncSchema.parse(req.body);
    const [submission] = await db
      .insert(syncSubmissions)
      .values({
        ...data,
        userId,
        status: 'available',
      })
      .returning();
    res.status(201).json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add to sync catalog' });
  }
});

// PUT /api/sync-licensing/:id - update listing
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const data = insertSyncSchema.partial().parse(req.body);
    const [updated] = await db
      .update(syncSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(syncSubmissions.id, id), eq(syncSubmissions.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Listing not found' });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// DELETE /api/sync-licensing/:id - remove from catalog
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const [deleted] = await db
      .delete(syncSubmissions)
      .where(and(eq(syncSubmissions.id, id), eq(syncSubmissions.userId, userId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Listing not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from catalog' });
  }
});

export default router;
