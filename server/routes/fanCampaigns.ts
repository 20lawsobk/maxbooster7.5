import { Router } from 'express';
import { db } from '../db';
import { fanCampaigns, insertFanCampaignSchema, fanSubscribers } from '@shared/schema';
import { and, eq, desc, count, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { z } from 'zod';
import { queryCache, createCacheKey } from '../lib/queryCache.js';
import { parsePaginationParams } from '../middleware/pagination.js';

const router = Router();
const CACHE_TTL = 60;

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
    const { limit, offset } = parsePaginationParams(req);
    const campaigns = await db.select().from(fanCampaigns)
      .where(eq(fanCampaigns.userId, req.user!.id))
      .orderBy(desc(fanCampaigns.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(campaigns);
  } catch (error) {
    logger.error('[FanCampaigns] Failed to list campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey('stats:fanCampaigns', userId);

    const stats = await queryCache.getOrCompute(cacheKey, async () => {
      const [campaignTotals] = await db.select({
        totalCampaigns: count(),
        sent: sql<number>`count(*) filter (where status = 'sent')`,
        totalRecipients: sql<number>`coalesce(sum(recipient_count), 0)`,
        totalOpens: sql<number>`coalesce(sum(open_count), 0)`,
      }).from(fanCampaigns).where(eq(fanCampaigns.userId, userId));

      const [subscriberCount] = await db.select({ total: count() })
        .from(fanSubscribers)
        .where(eq(fanSubscribers.userId, userId))
        .limit(1);

      const totalCampaigns = Number(campaignTotals.totalCampaigns);
      const sentCount = Number(campaignTotals.sent);
      const totalRecipients = Number(campaignTotals.totalRecipients);
      const totalOpens = Number(campaignTotals.totalOpens);
      const totalSubscribers = Number(subscriberCount.total);
      const avgOpenRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0;

      return { totalCampaigns, sent: sentCount, totalSubscribers, avgOpenRate };
    }, CACHE_TTL);

    res.json(stats);
  } catch (error) {
    logger.error('[FanCampaigns] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch campaign stats' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertFanCampaignSchema.parse({ ...req.body, userId: req.user!.id });
    const [campaign] = await db.insert(fanCampaigns).values(data).returning();
    await queryCache.invalidate(createCacheKey('stats:fanCampaigns', req.user!.id));
    res.status(201).json(campaign);
  } catch (error: unknown) {
    logger.error('[FanCampaigns] Failed to create campaign:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
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

    await queryCache.invalidate(createCacheKey('stats:fanCampaigns', userId));
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

    const [recipientCountRow] = await db.select({ total: count() })
      .from(fanSubscribers)
      .where(eq(fanSubscribers.userId, userId))
      .limit(1);
    const recipientCount = Number(recipientCountRow.total);

    const [campaign] = await db.update(fanCampaigns)
      .set({ status: 'sent', sentAt: new Date(), recipientCount, updatedAt: new Date() })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .returning();

    await queryCache.invalidate(createCacheKey('stats:fanCampaigns', userId));
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

    await queryCache.invalidate(createCacheKey('stats:fanCampaigns', userId));
    res.json({ success: true });
  } catch (error) {
    logger.error('[FanCampaigns] Failed to delete campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

export default router;
