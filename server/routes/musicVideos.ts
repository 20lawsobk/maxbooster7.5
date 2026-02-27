import { Router } from 'express';
import { db } from '../db';
import { musicVideoProductions, insertMusicVideoProductionSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(musicVideoProductions)
    .where(eq(musicVideoProductions.userId, req.session.userId))
    .orderBy(desc(musicVideoProductions.createdAt));
  res.json(items);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(musicVideoProductions)
    .where(eq(musicVideoProductions.userId, req.session.userId));
  const total = items.length;
  const released = items.filter(i => i.stage === 'released').length;
  const inProduction = items.filter(i => ['filming', 'editing', 'color_grade', 'mastering'].includes(i.stage || '')).length;
  const planned = items.filter(i => ['concept', 'pre_production', 'casting'].includes(i.stage || '')).length;
  const totalViews = items.reduce((s, i) => s + (i.views || 0), 0);
  const totalBudget = items.filter(i => i.budget).reduce((s, i) => s + (i.budget || 0), 0);
  res.json({ total, released, inProduction, planned, totalViews, totalBudget });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertMusicVideoProductionSchema.parse({ ...req.body, userId: req.session.userId });
    const [item] = await db.insert(musicVideoProductions).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(musicVideoProductions)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(musicVideoProductions.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(musicVideoProductions).where(eq(musicVideoProductions.id, req.params.id));
  res.json({ success: true });
});

export default router;
