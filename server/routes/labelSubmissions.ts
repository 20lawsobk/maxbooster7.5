import { Router } from 'express';
import { db } from '../db';
import { labelSubmissions, insertLabelSubmissionSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(labelSubmissions)
      .where(eq(labelSubmissions.userId, req.user!.id))
      .orderBy(desc(labelSubmissions.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch label submissions' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(labelSubmissions)
      .where(eq(labelSubmissions.userId, req.user!.id));
    const total = items.length;
    const submitted = items.filter(i => i.status === 'submitted').length;
    const responded = items.filter(i => ['accepted', 'rejected', 'declined'].includes(i.status || '')).length;
    const accepted = items.filter(i => i.status === 'accepted').length;
    const pending = items.filter(i => ['submitted', 'under_review', 'following_up'].includes(i.status || '')).length;
    res.json({ total, submitted, responded, accepted, pending, conversionRate: submitted > 0 ? Math.round((accepted / submitted) * 100) : 0 });
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertLabelSubmissionSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(labelSubmissions).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[LabelSubmissions] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
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
    res.json(item);
  } catch (error: any) {
    logger.error('[LabelSubmissions] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
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
    res.json({ success: true });
  } catch (error) {
    logger.error('[LabelSubmissions] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete label submission' });
  }
});

export default router;
