import { Router } from 'express';
import { db } from '../db';
import { musicVideoProductions, insertMusicVideoProductionSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(musicVideoProductions)
      .where(eq(musicVideoProductions.userId, req.user!.id))
      .orderBy(desc(musicVideoProductions.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[MusicVideos] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch music video productions' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(musicVideoProductions)
      .where(eq(musicVideoProductions.userId, req.user!.id));
    const total = items.length;
    const released = items.filter(i => i.stage === 'released').length;
    const inProduction = items.filter(i => ['filming', 'editing', 'color_grade', 'mastering'].includes(i.stage || '')).length;
    const planned = items.filter(i => ['concept', 'pre_production', 'casting'].includes(i.stage || '')).length;
    const totalViews = items.reduce((s, i) => s + (i.views || 0), 0);
    const totalBudget = items.filter(i => i.budget).reduce((s, i) => s + (i.budget || 0), 0);
    res.json({ total, released, inProduction, planned, totalViews, totalBudget });
  } catch (error) {
    logger.error('[MusicVideos] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertMusicVideoProductionSchema.parse({
      ...req.body,
      userId: req.user!.id,
      budget: req.body.budget !== '' && req.body.budget != null ? parseFloat(req.body.budget) : undefined,
    });
    const [item] = await db.insert(musicVideoProductions).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[MusicVideos] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create music video production' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(musicVideoProductions)
      .where(and(eq(musicVideoProductions.id, id), eq(musicVideoProductions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Music video production not found' });
    }

    const data = insertMusicVideoProductionSchema.partial().parse({
      ...req.body,
      budget: req.body.budget !== '' && req.body.budget != null ? parseFloat(req.body.budget) : undefined,
    });
    const [item] = await db.update(musicVideoProductions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(musicVideoProductions.id, id), eq(musicVideoProductions.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[MusicVideos] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update music video production' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(musicVideoProductions)
      .where(and(eq(musicVideoProductions.id, id), eq(musicVideoProductions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Music video production not found' });
    }

    await db.delete(musicVideoProductions)
      .where(and(eq(musicVideoProductions.id, id), eq(musicVideoProductions.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[MusicVideos] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete music video production' });
  }
});

export default router;
