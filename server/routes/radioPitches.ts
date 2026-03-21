import { Router } from 'express';
import { db } from '../db';
import { radioPitches, insertRadioPitchSchema } from '@shared/schema';
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
    const items = await db.select().from(radioPitches)
      .where(eq(radioPitches.userId, req.user!.id))
      .orderBy(desc(radioPitches.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(items);
  } catch (error) {
    logger.error('[RadioPitches] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch radio pitches' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey('stats:radioPitches', userId);

    const stats = await queryCache.getOrCompute(cacheKey, async () => {
      const [totals] = await db.select({
        total: count(),
        radio: sql<number>`count(*) filter (where target_type = 'radio')`,
        blog: sql<number>`count(*) filter (where target_type = 'blog')`,
        dj: sql<number>`count(*) filter (where target_type = 'dj')`,
        podcast: sql<number>`count(*) filter (where target_type = 'podcast')`,
        features: sql<number>`count(*) filter (where status = 'featured')`,
        pending: sql<number>`count(*) filter (where status in ('submitted','under_review'))`,
      }).from(radioPitches).where(eq(radioPitches.userId, userId));

      return {
        total: Number(totals.total),
        radio: Number(totals.radio),
        blog: Number(totals.blog),
        dj: Number(totals.dj),
        podcast: Number(totals.podcast),
        features: Number(totals.features),
        pending: Number(totals.pending),
      };
    }, CACHE_TTL);

    res.json(stats);
  } catch (error) {
    logger.error('[RadioPitches] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [item] = await db.select().from(radioPitches)
      .where(and(eq(radioPitches.id, req.params.id), eq(radioPitches.userId, req.user!.id)))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Radio pitch not found' });
    res.json(item);
  } catch (error) {
    logger.error('[RadioPitches] Failed to fetch radio pitch:', error);
    res.status(500).json({ error: 'Failed to fetch radio pitch' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertRadioPitchSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(radioPitches).values(data).returning();
    await queryCache.invalidate(createCacheKey('stats:radioPitches', req.user!.id));
    res.status(201).json(item);
  } catch (error: unknown) {
    logger.error('[RadioPitches] Failed to create:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
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

    const parsed = insertRadioPitchSchema.partial().parse(req.body);
    const { status: _status, userId: _userId, ...data } = parsed;
    const [item] = await db.update(radioPitches)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(radioPitches.id, id), eq(radioPitches.userId, userId)))
      .returning();
    await queryCache.invalidate(createCacheKey('stats:radioPitches', userId));
    res.json(item);
  } catch (error: unknown) {
    logger.error('[RadioPitches] Failed to update:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
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
    await queryCache.invalidate(createCacheKey('stats:radioPitches', userId));
    res.json({ success: true });
  } catch (error) {
    logger.error('[RadioPitches] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete radio pitch' });
  }
});

export default router;
