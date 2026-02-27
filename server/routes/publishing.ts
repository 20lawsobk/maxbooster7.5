import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { publishingRights } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// GET /api/publishing - list registered works
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const works = await db
      .select()
      .from(publishingRights)
      .where(eq(publishingRights.userId, userId))
      .orderBy(desc(publishingRights.registeredAt));
    res.json(works);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch registered works' });
  }
});

const insertPublishingSchema = z.object({
  trackTitle: z.string().min(1),
  iswc: z.string().optional(),
  isrc: z.string().optional(),
  upc: z.string().optional(),
  coWriters: z.any().optional(),
  publisherName: z.string().optional(),
  proName: z.string().optional(),
  proRegistrationId: z.string().optional(),
  publishingSplit: z.string().optional(),
  writerSplit: z.string().optional(),
  copyrightYear: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/publishing - register new work
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = insertPublishingSchema.parse(req.body);
    const [work] = await db
      .insert(publishingRights)
      .values({
        ...data,
        userId,
        registeredAt: new Date(),
        status: data.status || 'pending',
      })
      .returning();
    res.json(work);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to register work' });
  }
});

// PUT /api/publishing/:id - update registration
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const data = insertPublishingSchema.partial().parse(req.body);
    const [updated] = await db
      .update(publishingRights)
      .set(data)
      .where(and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Work not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update work' });
  }
});

// DELETE /api/publishing/:id - delete record
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const [deleted] = await db
      .delete(publishingRights)
      .where(and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Work not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// GET /api/publishing/stats - total works, pending registration, confirmed, splits breakdown
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const works = await db
      .select()
      .from(publishingRights)
      .where(eq(publishingRights.userId, userId));
    
    const stats = {
      totalWorks: works.length,
      pendingCount: works.filter(w => w.status === 'pending').length,
      confirmedCount: works.filter(w => w.status === 'confirmed' || w.status === 'active').length,
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch publishing stats' });
  }
});

export default router;
