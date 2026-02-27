import { Router } from 'express';
import { db } from '../db';
import { labelSubmissions, insertLabelSubmissionSchema } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(labelSubmissions)
    .where(eq(labelSubmissions.userId, req.session.userId))
    .orderBy(desc(labelSubmissions.createdAt));
  res.json(items);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(labelSubmissions)
    .where(eq(labelSubmissions.userId, req.session.userId));
  const total = items.length;
  const submitted = items.filter(i => i.status === 'submitted').length;
  const responded = items.filter(i => ['accepted', 'rejected', 'declined'].includes(i.status || '')).length;
  const accepted = items.filter(i => i.status === 'accepted').length;
  const pending = items.filter(i => ['submitted', 'under_review', 'following_up'].includes(i.status || '')).length;
  res.json({ total, submitted, responded, accepted, pending, conversionRate: submitted > 0 ? Math.round((accepted / submitted) * 100) : 0 });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertLabelSubmissionSchema.parse({ ...req.body, userId: req.session.userId });
    const [item] = await db.insert(labelSubmissions).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const { id } = req.params;
  const [item] = await db.update(labelSubmissions)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(labelSubmissions.id, id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(labelSubmissions).where(eq(labelSubmissions.id, req.params.id));
  res.json({ success: true });
});

export default router;
