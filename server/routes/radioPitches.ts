import { Router } from 'express';
import { db } from '../db';
import { radioPitches, insertRadioPitchSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(radioPitches)
      .where(eq(radioPitches.userId, req.user!.id))
      .orderBy(desc(radioPitches.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[RadioPitches] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch radio pitches' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(radioPitches)
      .where(eq(radioPitches.userId, req.user!.id));
    const total = items.length;
    const radio = items.filter(i => i.targetType === 'radio').length;
    const blog = items.filter(i => i.targetType === 'blog').length;
    const dj = items.filter(i => i.targetType === 'dj').length;
    const podcast = items.filter(i => i.targetType === 'podcast').length;
    const features = items.filter(i => i.status === 'featured').length;
    const pending = items.filter(i => ['submitted', 'under_review'].includes(i.status || '')).length;
    res.json({ total, radio, blog, dj, podcast, features, pending });
  } catch (error) {
    logger.error('[RadioPitches] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertRadioPitchSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(radioPitches).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[RadioPitches] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create radio pitch' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(radioPitches)
      .where(and(eq(radioPitches.id, id), eq(radioPitches.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Radio pitch not found' });
    }

    const data = insertRadioPitchSchema.partial().parse(req.body);
    const [item] = await db.update(radioPitches)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(radioPitches.id, id), eq(radioPitches.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[RadioPitches] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update radio pitch' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(radioPitches)
      .where(and(eq(radioPitches.id, id), eq(radioPitches.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Radio pitch not found' });
    }

    await db.delete(radioPitches)
      .where(and(eq(radioPitches.id, id), eq(radioPitches.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[RadioPitches] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete radio pitch' });
  }
});

export default router;
