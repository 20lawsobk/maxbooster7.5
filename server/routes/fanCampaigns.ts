import { Router } from 'express';
import { db } from '../db';
import { fanCampaigns, insertFanCampaignSchema, fanSubscribers } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const campaigns = await db.select().from(fanCampaigns)
    .where(eq(fanCampaigns.userId, req.session.userId))
    .orderBy(desc(fanCampaigns.createdAt));
  res.json(campaigns);
});

router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const campaigns = await db.select().from(fanCampaigns)
    .where(eq(fanCampaigns.userId, req.session.userId));
  const subscribers = await db.select().from(fanSubscribers)
    .where(eq(fanSubscribers.userId, req.session.userId));
  const totalCampaigns = campaigns.length;
  const sent = campaigns.filter(c => c.status === 'sent').length;
  const totalSubscribers = subscribers.length;
  const totalRecipients = campaigns.reduce((s, c) => s + (c.recipientCount || 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.openCount || 0), 0);
  const avgOpenRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0;
  res.json({ totalCampaigns, sent, totalSubscribers, avgOpenRate });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertFanCampaignSchema.parse({ ...req.body, userId: req.session.userId });
    const [campaign] = await db.insert(fanCampaigns).values(data).returning();
    res.json(campaign);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [campaign] = await db.update(fanCampaigns)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(fanCampaigns.id, req.params.id))
    .returning();
  res.json(campaign);
});

router.post('/:id/send', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const subscribers = await db.select().from(fanSubscribers)
    .where(eq(fanSubscribers.userId, req.session.userId));
  const recipientCount = subscribers.length;
  const [campaign] = await db.update(fanCampaigns)
    .set({ status: 'sent', sentAt: new Date(), recipientCount, updatedAt: new Date() })
    .where(eq(fanCampaigns.id, req.params.id))
    .returning();
  res.json({ success: true, recipientCount, campaign });
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(fanCampaigns).where(eq(fanCampaigns.id, req.params.id));
  res.json({ success: true });
});

export default router;
