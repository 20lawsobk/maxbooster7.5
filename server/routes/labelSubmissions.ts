import { Router } from 'express';
import { db } from '../db';
import { labelSubmissions, insertLabelSubmissionSchema } from '@shared/schema';
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
    const items = await db.select().from(labelSubmissions)
      .where(eq(labelSubmissions.userId, req.user!.id))
      .orderBy(desc(labelSubmissions.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(items);
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch label submissions' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey('stats:labelSubmissions', userId);

    const stats = await queryCache.getOrCompute(cacheKey, async () => {
      const [totals] = await db.select({
        total: count(),
        submitted: sql<number>`count(*) filter (where status = 'submitted')`,
        accepted: sql<number>`count(*) filter (where status = 'accepted')`,
        responded: sql<number>`count(*) filter (where status in ('accepted','rejected','declined'))`,
        pending: sql<number>`count(*) filter (where status in ('submitted','under_review','following_up'))`,
      }).from(labelSubmissions).where(eq(labelSubmissions.userId, userId));

      const total = Number(totals.total);
      const submitted = Number(totals.submitted);
      const accepted = Number(totals.accepted);
      const responded = Number(totals.responded);
      const pending = Number(totals.pending);
      return {
        total,
        submitted,
        responded,
        accepted,
        pending,
        conversionRate: submitted > 0 ? Math.round((accepted / submitted) * 100) : 0,
      };
    }, CACHE_TTL);

    res.json(stats);
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertLabelSubmissionSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(labelSubmissions).values(data).returning();
    await queryCache.invalidate(createCacheKey('stats:labelSubmissions', req.user!.id));
    res.status(201).json(item);
  } catch (error: unknown) {
    logger.error('[LabelSubmissions] Failed to create:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
    }
    res.status(500).json({ error: 'Failed to create label submission' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(labelSubmissions)
      .where(and(eq(labelSubmissions.id, id), eq(labelSubmissions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const data = insertLabelSubmissionSchema.partial().parse(req.body);
    const [item] = await db.update(labelSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(labelSubmissions.id, id), eq(labelSubmissions.userId, userId)))
      .returning();
    await queryCache.invalidate(createCacheKey('stats:labelSubmissions', userId));
    res.json(item);
  } catch (error: unknown) {
    logger.error('[LabelSubmissions] Failed to update:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
    }
    res.status(500).json({ error: 'Failed to update label submission' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(labelSubmissions)
      .where(and(eq(labelSubmissions.id, id), eq(labelSubmissions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    await db.delete(labelSubmissions)
      .where(and(eq(labelSubmissions.id, id), eq(labelSubmissions.userId, userId)));
    await queryCache.invalidate(createCacheKey('stats:labelSubmissions', userId));
    res.json({ success: true });
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete label submission' });
  }
});

export default router;
