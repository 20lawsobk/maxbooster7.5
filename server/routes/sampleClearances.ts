import { Router } from 'express';
import { db } from '../db';
import { sampleClearances, insertSampleClearanceSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(sampleClearances)
      .where(eq(sampleClearances.userId, req.user!.id))
      .orderBy(desc(sampleClearances.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[SampleClearances] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch sample clearances' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(sampleClearances)
      .where(eq(sampleClearances.userId, req.user!.id));
    const total = items.length;
    const cleared = items.filter(i => i.status === 'cleared').length;
    const pending = items.filter(i => ['contacting', 'negotiating', 'in_review'].includes(i.status || '')).length;
    const needed = items.filter(i => i.status === 'needed').length;
    const denied = items.filter(i => i.status === 'denied').length;
    const totalFees = items.filter(i => i.fee).reduce((s, i) => s + (i.fee || 0), 0);
    res.json({ total, cleared, pending, needed, denied, totalFees });
  } catch (error) {
    logger.error('[SampleClearances] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertSampleClearanceSchema.parse({
      ...req.body,
      userId: req.user!.id,
      fee: req.body.fee !== '' && req.body.fee != null ? parseFloat(req.body.fee) : undefined,
      royaltyRate: req.body.royaltyRate !== '' && req.body.royaltyRate != null ? parseFloat(req.body.royaltyRate) : undefined,
    });
    const [item] = await db.insert(sampleClearances).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[SampleClearances] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create sample clearance' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(sampleClearances)
      .where(and(eq(sampleClearances.id, id), eq(sampleClearances.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Sample clearance not found' });
    }

    const data = insertSampleClearanceSchema.partial().parse({
      ...req.body,
      fee: req.body.fee !== '' && req.body.fee != null ? parseFloat(req.body.fee) : undefined,
      royaltyRate: req.body.royaltyRate !== '' && req.body.royaltyRate != null ? parseFloat(req.body.royaltyRate) : undefined,
    });
    const [item] = await db.update(sampleClearances)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(sampleClearances.id, id), eq(sampleClearances.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[SampleClearances] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update sample clearance' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(sampleClearances)
      .where(and(eq(sampleClearances.id, id), eq(sampleClearances.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Sample clearance not found' });
    }

    await db.delete(sampleClearances)
      .where(and(eq(sampleClearances.id, id), eq(sampleClearances.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[SampleClearances] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete sample clearance' });
  }
});

export default router;
