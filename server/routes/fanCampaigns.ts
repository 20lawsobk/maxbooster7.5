import { Router } from 'express';
import { db } from '../db';
import { fanCampaigns, insertFanCampaignSchema, fanSubscribers } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { z } from 'zod';

const router = Router();

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(100_000).optional(),
  campaignType: z.enum(['newsletter', 'announcement', 'promotion', 'event']).optional(),
  status: z.enum(['draft', 'scheduled', 'sent', 'cancelled']).optional(),
  segmentFilter: z.record(z.unknown()).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const campaigns = await db.select().from(fanCampaigns)
      .where(eq(fanCampaigns.userId, req.user!.id))
      .orderBy(desc(fanCampaigns.createdAt));
    res.json(campaigns);
  } catch (error) {
    logger.error('[FanCampaigns] Failed to list campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db.select().from(fanCampaigns)
      .where(eq(fanCampaigns.userId, userId));
    const subscribers = await db.select().from(fanSubscribers)
      .where(eq(fanSubscribers.userId, userId));

    const totalCampaigns = campaigns.length;
    const sent = campaigns.filter(c => c.status === 'sent').length;
    const totalSubscribers = subscribers.length;
    const totalRecipients = campaigns.reduce((s, c) => s + (c.recipientCount || 0), 0);
    const totalOpens = campaigns.reduce((s, c) => s + (c.openCount || 0), 0);
    const avgOpenRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0;
    res.json({ totalCampaigns, sent, totalSubscribers, avgOpenRate });
  } catch (error) {
    logger.error('[FanCampaigns] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch campaign stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertFanCampaignSchema.parse({ ...req.body, userId: req.user!.id });
    const [campaign] = await db.insert(fanCampaigns).values(data).returning();
    res.status(201).json(campaign);
  } catch (error: any) {
    logger.error('[FanCampaigns] Failed to create campaign:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (existing[0].status === 'sent') {
      return res.status(400).json({ error: 'Cannot modify a sent campaign' });
    }

    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const [campaign] = await db.update(fanCampaigns)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .returning();

    res.json(campaign);
  } catch (error) {
    logger.error('[FanCampaigns] Failed to update campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.post('/:id/send', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (existing[0].status === 'sent') {
      return res.status(400).json({ error: 'Campaign already sent' });
    }

    const subscribers = await db.select().from(fanSubscribers)
      .where(eq(fanSubscribers.userId, userId));
    const recipientCount = subscribers.length;

    const [campaign] = await db.update(fanCampaigns)
      .set({ status: 'sent', sentAt: new Date(), recipientCount, updatedAt: new Date() })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .returning();

    res.json({ success: true, recipientCount, campaign });
  } catch (error) {
    logger.error('[FanCampaigns] Failed to send campaign:', error);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await db.delete(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    logger.error('[FanCampaigns] Failed to delete campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

export default router;
