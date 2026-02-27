import { Router } from 'express';
import { db } from '../db';
import { venueContacts, insertVenueContactSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(venueContacts)
    .where(eq(venueContacts.userId, req.session.userId))
    .orderBy(desc(venueContacts.createdAt));
  res.json(items);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(venueContacts)
    .where(eq(venueContacts.userId, req.session.userId));
  const total = items.length;
  const prospects = items.filter(i => i.status === 'prospect').length;
  const contacted = items.filter(i => i.status === 'contacted').length;
  const booked = items.filter(i => i.status === 'booked').length;
  const avgCapacity = total > 0 ? Math.round(items.reduce((s, i) => s + (i.capacity || 0), 0) / total) : 0;
  res.json({ total, prospects, contacted, booked, avgCapacity });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertVenueContactSchema.parse({ ...req.body, userId: req.session.userId });
    const [item] = await db.insert(venueContacts).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(venueContacts)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(venueContacts.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(venueContacts).where(eq(venueContacts.id, req.params.id));
  res.json({ success: true });
});

export default router;
