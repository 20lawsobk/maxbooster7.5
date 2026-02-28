import { Router } from 'express';
import { db } from '../db';
import { sampleClearances, insertSampleClearanceSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(sampleClearances)
    .where(eq(sampleClearances.userId, req.session.userId))
    .orderBy(desc(sampleClearances.createdAt));
  res.json(items);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(sampleClearances)
    .where(eq(sampleClearances.userId, req.session.userId));
  const total = items.length;
  const cleared = items.filter(i => i.status === 'cleared').length;
  const pending = items.filter(i => ['contacting', 'negotiating', 'in_review'].includes(i.status || '')).length;
  const needed = items.filter(i => i.status === 'needed').length;
  const denied = items.filter(i => i.status === 'denied').length;
  const totalFees = items.filter(i => i.fee).reduce((s, i) => s + (i.fee || 0), 0);
  res.json({ total, cleared, pending, needed, denied, totalFees });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertSampleClearanceSchema.parse({
      ...req.body,
      userId: req.session.userId,
      fee: req.body.fee !== '' && req.body.fee != null ? parseFloat(req.body.fee) : undefined,
      royaltyRate: req.body.royaltyRate !== '' && req.body.royaltyRate != null ? parseFloat(req.body.royaltyRate) : undefined,
    });
    const [item] = await db.insert(sampleClearances).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(sampleClearances)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(sampleClearances.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(sampleClearances).where(eq(sampleClearances.id, req.params.id));
  res.json({ success: true });
});

export default router;
