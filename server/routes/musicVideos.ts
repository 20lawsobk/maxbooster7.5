import { Router } from 'express';
import { db } from '../db';
import { musicVideoProductions, insertMusicVideoProductionSchema } from '@shared/schema';
import { and, eq, desc, count, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { queryCache, createCacheKey } from '../lib/queryCache.js';
import { parsePaginationParams } from '../middleware/pagination.js';

const router = Router();
const CACHE_TTL = 300;

router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const items = await db.select().from(musicVideoProductions)
      .where(eq(musicVideoProductions.userId, req.user!.id))
      .orderBy(desc(musicVideoProductions.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(items);
  } catch (error) {
    logger.error('[MusicVideos] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch music video productions' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey('stats:musicVideos', userId);

    const stats = await queryCache.getOrCompute(cacheKey, async () => {
      const [totals] = await db.select({
        total: count(),
        released: sql<number>`count(*) filter (where stage = 'released')`,
        inProduction: sql<number>`count(*) filter (where stage in ('filming','editing','color_grade','mastering'))`,
        planned: sql<number>`count(*) filter (where stage in ('concept','pre_production','casting'))`,
        totalViews: sql<number>`coalesce(sum(views), 0)`,
        totalBudget: sql<number>`coalesce(sum(budget), 0)`,
      }).from(musicVideoProductions).where(eq(musicVideoProductions.userId, userId));

      return {
        total: Number(totals.total),
        released: Number(totals.released),
        inProduction: Number(totals.inProduction),
        planned: Number(totals.planned),
        totalViews: Number(totals.totalViews),
        totalBudget: Number(totals.totalBudget),
      };
    }, CACHE_TTL);

    res.json(stats);
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
    await queryCache.invalidate(createCacheKey('stats:musicVideos', req.user!.id));
    res.status(201).json(item);
  } catch (error: unknown) {
    logger.error('[MusicVideos] Failed to create:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
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
    await queryCache.invalidate(createCacheKey('stats:musicVideos', userId));
    res.json(item);
  } catch (error: unknown) {
    logger.error('[MusicVideos] Failed to update:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
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
    await queryCache.invalidate(createCacheKey('stats:musicVideos', userId));
    res.json({ success: true });
  } catch (error) {
    logger.error('[MusicVideos] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete music video production' });
  }
});

export default router;
