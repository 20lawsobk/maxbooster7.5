import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { publishingRights } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

const insertPublishingSchema = z.object({
  trackTitle: z.string().min(1).max(500),
  iswc: z.string().max(20).optional(),
  isrc: z.string().max(20).optional(),
  upc: z.string().max(20).optional(),
  coWriters: z.unknown().optional(),
  publisherName: z.string().max(500).optional(),
  proName: z.string().max(200).optional(),
  proRegistrationId: z.string().max(200).optional(),
  publishingSplit: z.string().max(50).optional(),
  writerSplit: z.string().max(50).optional(),
  copyrightYear: z.number().int().min(1800).max(new Date().getFullYear() + 1).optional(),
  status: z.enum(['pending', 'confirmed', 'active', 'inactive']).optional(),
  notes: z.string().max(5000).optional(),
});

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
    logger.error('[Publishing] Failed to fetch registered works:', error);
    res.status(500).json({ error: 'Failed to fetch registered works' });
  }
});

// POST /api/publishing - register new work
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = insertPublishingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    }
    const data = parsed.data;
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
    logger.error('[Publishing] Failed to register work:', error);
    res.status(500).json({ error: 'Failed to register work' });
  }
});

// PUT /api/publishing/:id - update registration
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const parsed = insertPublishingSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    }
    const [updated] = await db
      .update(publishingRights)
      .set(parsed.data)
      .where(and(eq(publishingRights.id, id), eq(publishingRights.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Work not found' });
    res.json(updated);
  } catch (error) {
    logger.error('[Publishing] Failed to update work:', error);
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
    logger.error('[Publishing] Failed to delete record:', error);
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
    logger.error('[Publishing] Failed to fetch publishing stats:', error);
    res.status(500).json({ error: 'Failed to fetch publishing stats' });
  }
});

export default router;
