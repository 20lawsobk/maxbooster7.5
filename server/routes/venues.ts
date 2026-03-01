import { Router } from 'express';
import { db } from '../db';
import { venueContacts, insertVenueContactSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(venueContacts)
      .where(eq(venueContacts.userId, req.user!.id))
      .orderBy(desc(venueContacts.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[Venues] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch venue contacts' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(venueContacts)
      .where(eq(venueContacts.userId, req.user!.id));
    const total = items.length;
    const prospects = items.filter(i => i.status === 'prospect').length;
    const contacted = items.filter(i => i.status === 'contacted').length;
    const booked = items.filter(i => i.status === 'booked').length;
    const avgCapacity = total > 0 ? Math.round(items.reduce((s, i) => s + (i.capacity || 0), 0) / total) : 0;
    res.json({ total, prospects, contacted, booked, avgCapacity });
  } catch (error) {
    logger.error('[Venues] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertVenueContactSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(venueContacts).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[Venues] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create venue contact' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(venueContacts)
      .where(and(eq(venueContacts.id, id), eq(venueContacts.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Venue contact not found' });
    }

    const data = insertVenueContactSchema.partial().parse(req.body);
    const [item] = await db.update(venueContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(venueContacts.id, id), eq(venueContacts.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[Venues] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update venue contact' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(venueContacts)
      .where(and(eq(venueContacts.id, id), eq(venueContacts.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Venue contact not found' });
    }

    await db.delete(venueContacts)
      .where(and(eq(venueContacts.id, id), eq(venueContacts.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[Venues] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete venue contact' });
  }
});

export default router;
