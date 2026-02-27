import { Router } from 'express';
import { db } from '../db';
import { radioPitches, insertRadioPitchSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(radioPitches)
    .where(eq(radioPitches.userId, req.session.userId))
    .orderBy(desc(radioPitches.createdAt));
  res.json(items);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(radioPitches)
    .where(eq(radioPitches.userId, req.session.userId));
  const total = items.length;
  const radio = items.filter(i => i.targetType === 'radio').length;
  const blog = items.filter(i => i.targetType === 'blog').length;
  const dj = items.filter(i => i.targetType === 'dj').length;
  const podcast = items.filter(i => i.targetType === 'podcast').length;
  const features = items.filter(i => i.status === 'featured').length;
  const pending = items.filter(i => ['submitted', 'under_review'].includes(i.status || '')).length;
  res.json({ total, radio, blog, dj, podcast, features, pending });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertRadioPitchSchema.parse({ ...req.body, userId: req.session.userId });
    const [item] = await db.insert(radioPitches).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(radioPitches)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(radioPitches.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(radioPitches).where(eq(radioPitches.id, req.params.id));
  res.json({ success: true });
});

export default router;
