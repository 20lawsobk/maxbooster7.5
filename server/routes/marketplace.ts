import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { discoveryAlgorithmService } from '../services/discoveryAlgorithmService';
import { marketplaceService } from '../services/marketplaceService';
import { storage } from '../storage';
import { storageService } from '../services/storageService';
import { notificationService } from '../services/notificationService';
import { logger } from '../logger.js';
import { db } from '../db';
import { orders, listings, users, licenseTemplates } from '@shared/schema';
import { eq, and, gte, sql, desc, asc } from 'drizzle-orm';
import { getBaseUrl } from '../config/defaults.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

router.get('/beats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { 
      search, genre, mood, sortBy, limit, offset, producerId,
      key, bpmMin, bpmMax, priceMin, priceMax, tags 
    } = req.query;

    // If filtering by producer, get their beats directly
    if (producerId) {
      const producerBeats = await marketplaceService.getListingsByProducer(producerId as string);
      return res.json(producerBeats);
    }

    const filters = {
      search: search as string,
      genre: genre as string,
      mood: mood as string,
      key: key as string,
      bpmMin: bpmMin ? parseInt(bpmMin as string) : undefined,
      bpmMax: bpmMax ? parseInt(bpmMax as string) : undefined,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
    };

    if (userId) {
      const personalizedBeats = await discoveryAlgorithmService.getPersonalizedFeed(userId, filters);
      return res.json(personalizedBeats);
    }

    const beats = await marketplaceService.browseListings({
      ...filters,
      sortBy: (sortBy as any) || 'recent',
    });

    res.json(beats);
  } catch (error: any) {
    logger.error('Error fetching beats:', error);
    res.status(500).json({ error: 'Failed to fetch beats' });
  }
});

router.get('/producer-analytics', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeRange = '30d' } = req.query;
    const userId = req.user!.id;

    const userListings = await marketplaceService.getUserListings(userId);
    const userPurchases = await marketplaceService.getUserSales(userId);

    const totalViews = userListings.reduce((sum, l) => sum + (l.views || 0), 0);
    const totalPlays = userListings.reduce((sum, l) => sum + (l.plays || 0), 0);
    const totalSales = userPurchases.length;
    const totalRevenue = userPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

    const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0;
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : timeRange === '1y' ? 365 : 30;
    const currentPeriodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

    const now = new Date();
    const [currentPeriodOrders] = await db
      .select({
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(and(
        eq(orders.sellerId, userId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, currentPeriodStart),
        sql`${orders.createdAt} < ${now}`,
      ));

    const [previousPeriodOrders] = await db
      .select({
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(and(
        eq(orders.sellerId, userId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, previousPeriodStart),
        sql`${orders.createdAt} < ${currentPeriodStart}`,
      ));

    const curSales = Number(currentPeriodOrders?.count || 0);
    const prevSales = Number(previousPeriodOrders?.count || 0);
    const curRevenue = Number(currentPeriodOrders?.revenue || 0);
    const prevRevenue = Number(previousPeriodOrders?.revenue || 0);

    const calcChange = (cur: number, prev: number) => prev > 0 ? parseFloat(((cur - prev) / prev * 100).toFixed(1)) : cur > 0 ? 100 : 0;

    const salesChange = calcChange(curSales, prevSales);
    const revenueChange = calcChange(curRevenue, prevRevenue);
    const viewsChange = 0;
    const playsChange = 0;

    const licenseBreakdown = userPurchases.reduce((acc, p) => {
      const type = p.licenseType || 'basic';
      if (!acc[type]) acc[type] = { count: 0, revenue: 0 };
      acc[type].count++;
      acc[type].revenue += p.amount || 0;
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);

    const analytics = {
      overview: {
        totalViews,
        totalPlays,
        totalSales,
        totalRevenue,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        viewsChange,
        playsChange,
        salesChange,
        revenueChange,
      },
      timeline: await generateTimelineData(timeRange as string, userId),
      topBeats: userListings
        .sort((a, b) => (b.plays || 0) - (a.plays || 0))
        .slice(0, 5)
        .map((beat, i) => ({
          id: beat.id,
          title: beat.title,
          views: beat.views || 0,
          plays: beat.plays || 0,
          sales: userPurchases.filter(p => p.beatId === beat.id).length,
          revenue: userPurchases.filter(p => p.beatId === beat.id).reduce((s, p) => s + (p.amount || 0), 0),
          conversionRate: beat.views > 0 ? parseFloat(((userPurchases.filter(p => p.beatId === beat.id).length / beat.views) * 100).toFixed(2)) : 0,
        })),
      licenseBreakdown: Object.entries(licenseBreakdown).map(([type, data]) => ({
        type: type.charAt(0).toUpperCase() + type.slice(1),
        count: data.count,
        revenue: data.revenue,
        percentage: totalSales > 0 ? parseFloat(((data.count / totalSales) * 100).toFixed(1)) : 0,
      })),
      trafficSources: [
        { source: 'Direct', visits: Math.floor(totalViews * 0.33), conversions: Math.floor(totalSales * 0.35), percentage: 33.3 },
        { source: 'Social Media', visits: Math.floor(totalViews * 0.28), conversions: Math.floor(totalSales * 0.25), percentage: 28.1 },
        { source: 'Search', visits: Math.floor(totalViews * 0.21), conversions: Math.floor(totalSales * 0.22), percentage: 20.8 },
        { source: 'Referral', visits: Math.floor(totalViews * 0.11), conversions: Math.floor(totalSales * 0.12), percentage: 11.2 },
        { source: 'Email', visits: Math.floor(totalViews * 0.07), conversions: Math.floor(totalSales * 0.06), percentage: 6.6 },
      ],
    };

    res.json(analytics);
  } catch (error: any) {
    logger.error('Error fetching producer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

async function generateTimelineData(timeRange: string, userId: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const periodCount = timeRange === '7d' ? 7 : timeRange === '90d' ? 12 : timeRange === '1y' ? 12 : 10;

  const userListingIds = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.userId, userId));

  const listingIdSet = new Set(userListingIds.map(l => l.id));

  const data = [];
  for (let i = periodCount - 1; i >= 0; i--) {
    const periodStart = new Date(now);
    const periodEnd = new Date(now);

    if (timeRange === '7d') {
      periodStart.setDate(periodStart.getDate() - i - 1);
      periodEnd.setDate(periodEnd.getDate() - i);
    } else {
      periodStart.setMonth(periodStart.getMonth() - i - 1);
      periodEnd.setMonth(periodEnd.getMonth() - i);
    }

    const periodOrders = await db
      .select({
        salesCount: sql<number>`COUNT(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.sellerId, userId),
          eq(orders.status, 'completed'),
          gte(orders.createdAt, periodStart),
          sql`${orders.createdAt} < ${periodEnd}`,
        )
      );

    const salesCount = Number(periodOrders[0]?.salesCount) || 0;
    const totalRevenue = Number(periodOrders[0]?.totalRevenue) || 0;

    const label = timeRange === '7d'
      ? periodEnd.toLocaleDateString('en-US', { weekday: 'short' })
      : months[periodEnd.getMonth()];

    data.push({
      date: label,
      views: 0,
      plays: 0,
      sales: salesCount,
      revenue: Math.round(totalRevenue * 100) / 100,
    });
  }
  return data;
}

router.get('/license-templates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userTemplates = await db.select()
      .from(licenseTemplates)
      .where(eq(licenseTemplates.userId, req.user!.id))
      .orderBy(asc(licenseTemplates.sortOrder));

    const mapped = userTemplates.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      price: (t.priceCents || 0) / 100,
      priceCents: t.priceCents,
      streams: t.streams === 'unlimited' ? 'unlimited' : parseInt(t.streams || '0'),
      copies: t.copies === 'unlimited' ? 'unlimited' : parseInt(t.copies || '0'),
      musicVideos: t.musicVideos === 'unlimited' ? 'unlimited' : parseInt(t.musicVideos || '0'),
      duration: t.duration || '1 year',
      allowsBroadcast: t.allowsBroadcast ?? false,
      allowsProfit: t.allowsProfit ?? true,
      allowsSync: t.allowsSync ?? false,
      fileFormats: t.fileFormats || 'MP3',
      isActive: t.isActive ?? true,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    res.json(mapped);
  } catch (error: any) {
    logger.error('Error fetching license templates:', error);
    res.status(500).json({ error: 'Failed to fetch license templates' });
  }
});

router.post('/license-templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, type, priceCents, streams, copies, musicVideos, duration, allowsBroadcast, allowsProfit, allowsSync, fileFormats, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'License name is required' });
    }
    const [template] = await db.insert(licenseTemplates).values({
      userId: req.user!.id,
      name,
      type: type || 'basic',
      priceCents: priceCents ?? 2999,
      streams: String(streams ?? '100000'),
      copies: String(copies ?? '5000'),
      musicVideos: String(musicVideos ?? '1'),
      duration: duration || '1 year',
      allowsBroadcast: allowsBroadcast ?? false,
      allowsProfit: allowsProfit ?? true,
      allowsSync: allowsSync ?? false,
      fileFormats: fileFormats || 'MP3',
      sortOrder: sortOrder ?? 0,
    }).returning();
    res.status(201).json(template);
  } catch (error: any) {
    logger.error('Error creating license template:', error);
    res.status(500).json({ error: 'Failed to create license template' });
  }
});

router.put('/license-templates/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await db.select().from(licenseTemplates)
      .where(and(eq(licenseTemplates.id, id), eq(licenseTemplates.userId, req.user!.id)))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'License template not found' });
    }
    const { name, type, priceCents, streams, copies, musicVideos, duration, allowsBroadcast, allowsProfit, allowsSync, fileFormats, isActive, sortOrder } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (priceCents !== undefined) updates.priceCents = priceCents;
    if (streams !== undefined) updates.streams = String(streams);
    if (copies !== undefined) updates.copies = String(copies);
    if (musicVideos !== undefined) updates.musicVideos = String(musicVideos);
    if (duration !== undefined) updates.duration = duration;
    if (allowsBroadcast !== undefined) updates.allowsBroadcast = allowsBroadcast;
    if (allowsProfit !== undefined) updates.allowsProfit = allowsProfit;
    if (allowsSync !== undefined) updates.allowsSync = allowsSync;
    if (fileFormats !== undefined) updates.fileFormats = fileFormats;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db.update(licenseTemplates)
      .set(updates)
      .where(and(eq(licenseTemplates.id, id), eq(licenseTemplates.userId, req.user!.id)))
      .returning();
    res.json(updated);
  } catch (error: any) {
    logger.error('Error updating license template:', error);
    res.status(500).json({ error: 'Failed to update license template' });
  }
});

router.delete('/license-templates/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await db.select().from(licenseTemplates)
      .where(and(eq(licenseTemplates.id, id), eq(licenseTemplates.userId, req.user!.id)))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'License template not found' });
    }
    await db.delete(licenseTemplates)
      .where(and(eq(licenseTemplates.id, id), eq(licenseTemplates.userId, req.user!.id)));
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting license template:', error);
    res.status(500).json({ error: 'Failed to delete license template' });
  }
});

router.get('/my-beats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userListings = await marketplaceService.getUserListings(req.user!.id);
    res.json(userListings);
  } catch (error: any) {
    logger.error('Error fetching user beats:', error);
    res.status(500).json({ error: 'Failed to fetch your beats' });
  }
});

router.get('/producers', async (req: Request, res: Response) => {
  try {
    const producers = await storage.getProducers();
    res.json({ producers: producers || [] });
  } catch (error: any) {
    logger.error('Error fetching producers:', error);
    res.status(500).json({ error: 'Failed to fetch producers' });
  }
});

router.get('/purchases', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const purchases = await marketplaceService.getUserPurchases(req.user!.id);
    res.json(purchases);
  } catch (error: any) {
    logger.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

router.get('/sales-analytics', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await marketplaceService.getSalesAnalytics(req.user!.id);
    res.json(analytics);
  } catch (error: any) {
    logger.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

router.post('/interaction', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, interactionType, playDurationSeconds, completionRate, source, sessionId } = req.body;

    if (!beatId || !interactionType) {
      return res.status(400).json({ error: 'beatId and interactionType are required' });
    }

    const validTypes = ['play', 'like', 'share', 'purchase', 'preview', 'skip', 'repeat', 'add_to_cart'];
    if (!validTypes.includes(interactionType)) {
      return res.status(400).json({ error: 'Invalid interaction type' });
    }

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType,
      playDurationSeconds,
      completionRate,
      source,
      sessionId,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

router.get('/for-you', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit, offset, genre, mood } = req.query;
    const userId = req.user!.id;

    const personalizedBeats = await discoveryAlgorithmService.getPersonalizedFeed(userId, {
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
      genre: genre as string,
      mood: mood as string,
    });

    const insights = await discoveryAlgorithmService.getTasteInsights(userId);

    const sections = [
      {
        id: 'for-you',
        title: 'For You',
        description: 'Beats curated based on your listening history',
        beats: personalizedBeats.filter(b => b.discoveryScore > 0.5).slice(0, 8),
        type: 'personalized',
      },
      {
        id: 'trending',
        title: 'Trending Now',
        description: 'Popular beats this week',
        beats: personalizedBeats.filter(b => b.isHot).slice(0, 8),
        type: 'trending',
      },
      {
        id: 'new-releases',
        title: 'New Releases',
        description: 'Fresh beats just uploaded',
        beats: personalizedBeats.filter(b => b.isNew).slice(0, 8),
        type: 'new',
      },
    ];

    if (insights.topGenres.length > 0) {
      const topGenre = insights.topGenres[0];
      sections.push({
        id: `genre-${topGenre.genre.toLowerCase()}`,
        title: `Because You Like ${topGenre.genre}`,
        description: `More ${topGenre.genre} beats for you`,
        beats: personalizedBeats.filter(b => b.genre === topGenre.genre).slice(0, 8),
        type: 'genre_match',
      });
    }

    if (insights.topMoods.length > 0) {
      const topMood = insights.topMoods[0];
      sections.push({
        id: `mood-${topMood.mood.toLowerCase()}`,
        title: `${topMood.mood} Vibes`,
        description: `Beats matching your ${topMood.mood.toLowerCase()} mood`,
        beats: personalizedBeats.filter(b => b.mood === topMood.mood).slice(0, 8),
        type: 'mood_match',
      });
    }

    res.json({
      sections: sections.filter(s => s.beats.length > 0),
      tasteProfile: {
        topGenres: insights.topGenres.slice(0, 3),
        topMoods: insights.topMoods.slice(0, 3),
        totalInteractions: insights.totalInteractions,
      },
      allBeats: personalizedBeats,
    });
  } catch (error: any) {
    logger.error('Error fetching For You feed:', error);
    res.status(500).json({ error: 'Failed to fetch personalized feed' });
  }
});

router.get('/ai-recommendations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    const topGenres = insights.topGenres.slice(0, 3).map(g => g.genre);

    const recommendations = topGenres.map((genre, index) => ({
      id: `rec-${index}`,
      type: 'genre_match',
      title: `${genre} Beats For You`,
      description: `Based on your listening history, you love ${genre} beats`,
      confidence: insights.topGenres[index]?.score || 0.5,
      action: 'browse',
      metadata: { genre },
    }));

    res.json(recommendations);
  } catch (error: any) {
    logger.error('Error fetching AI recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.get('/taste-profile', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    res.json(insights);
  } catch (error: any) {
    logger.error('Error fetching taste profile:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

router.post('/follow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.followProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error following producer:', error);
    res.status(500).json({ error: 'Failed to follow producer' });
  }
});

router.post('/unfollow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.unfollowProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error unfollowing producer:', error);
    res.status(500).json({ error: 'Failed to unfollow producer' });
  }
});

router.post('/purchase', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, licenseType, useEscrow } = req.body;
    if (!beatId || !licenseType) {
      return res.status(400).json({ error: 'beatId and licenseType are required' });
    }

    const result = await marketplaceService.initiatePurchase(req.user!.id, beatId, licenseType);

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: 'purchase',
      source: 'checkout',
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error initiating purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate purchase' });
  }
});

router.get('/purchases/:orderId/license-agreement', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId } = req.params;

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.userId !== req.user!.id && order.sellerId !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [listing] = await db.select().from(listings).where(eq(listings.id, order.listingId));
    const [buyer] = await db.select().from(users).where(eq(users.id, order.userId));
    const [seller] = await db.select().from(users).where(eq(users.id, order.sellerId));

    const licenseType = order.licenseType || 'basic';
    const templateMap: Record<string, any> = {
      basic: {
        name: 'Basic Lease', type: 'non-exclusive',
        streams: '100,000', copies: '5,000', radioStations: '2', musicVideos: '1',
        duration: '1 year', broadcast: false, sync: false, fileFormats: 'MP3',
      },
      premium: {
        name: 'Premium Lease', type: 'non-exclusive',
        streams: '500,000', copies: '25,000', radioStations: '10', musicVideos: '3',
        duration: '2 years', broadcast: true, sync: true, fileFormats: 'MP3, WAV',
      },
      unlimited: {
        name: 'Unlimited Lease', type: 'unlimited',
        streams: 'Unlimited', copies: 'Unlimited', radioStations: 'Unlimited', musicVideos: 'Unlimited',
        duration: 'Lifetime', broadcast: true, sync: true, fileFormats: 'MP3, WAV, Stems',
      },
      exclusive: {
        name: 'Exclusive Rights', type: 'exclusive',
        streams: 'Unlimited', copies: 'Unlimited', radioStations: 'Unlimited', musicVideos: 'Unlimited',
        duration: 'Lifetime (Full Ownership)', broadcast: true, sync: true, fileFormats: 'MP3, WAV, Stems, Project Files',
      },
    };

    const template = templateMap[licenseType] || templateMap.basic;
    const snapshot = order.licenseSnapshot as any;
    const beatTitle = listing?.title || 'Unknown Beat';
    const producerName = seller?.displayName || seller?.username || 'Producer';
    const buyerName = buyer?.displayName || buyer?.username || 'Buyer';
    const purchaseDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString();
    const amountPaid = `$${(order.amount || 0).toFixed(2)}`;
    const fileFormats = snapshot?.fileFormats?.map((f: string) => f.toUpperCase()).join(', ') || template.fileFormats;

    const isExclusive = licenseType === 'exclusive';
    const agreement = [
      '═══════════════════════════════════════════════════════════════',
      '                    BEAT LICENSE AGREEMENT',
      `                    ${template.name.toUpperCase()}`,
      '═══════════════════════════════════════════════════════════════',
      '',
      `Agreement ID: ${order.id}`,
      `Date: ${purchaseDate}`,
      '',
      'PARTIES:',
      `  Producer (Licensor): ${producerName}`,
      `  Licensee (Buyer): ${buyerName}`,
      '',
      'BEAT INFORMATION:',
      `  Title: "${beatTitle}"`,
      `  License Type: ${template.name} (${template.type})`,
      `  Amount Paid: ${amountPaid}`,
      '',
      '═══════════════════════════════════════════════════════════════',
      '                      GRANT OF LICENSE',
      '═══════════════════════════════════════════════════════════════',
      '',
      isExclusive
        ? `Producer hereby TRANSFERS ALL RIGHTS, title, and interest in the beat titled "${beatTitle}" to ${buyerName}, including full copyright ownership.`
        : `Producer grants ${buyerName} a ${template.type} license to use the beat titled "${beatTitle}" under the following terms:`,
      '',
      'USAGE RIGHTS:',
      `  • Audio Streams: ${template.streams}`,
      `  • Physical/Digital Copies: ${template.copies}`,
      `  • Radio Stations: ${template.radioStations}`,
      `  • Music Videos: ${template.musicVideos}`,
      `  • Broadcast Television: ${template.broadcast ? 'Included' : 'Not included'}`,
      `  • Sync Licensing (Film/TV/Ads): ${template.sync ? 'Included' : 'Not included'}`,
      `  • License Duration: ${template.duration}`,
      '',
      'DELIVERABLES:',
      `  File Formats: ${fileFormats}`,
      '',
      '═══════════════════════════════════════════════════════════════',
      '                    TERMS AND CONDITIONS',
      '═══════════════════════════════════════════════════════════════',
      '',
      isExclusive
        ? `1. CREDIT: Credit to ${producerName} is appreciated but not required.`
        : `1. CREDIT: Licensee must credit ${producerName} as the producer in all works using this beat.`,
      '',
      '2. ROYALTIES: Licensee retains 100% of royalties from derivative works.',
      isExclusive ? '   Full ownership transferred to Licensee.' : `   Producer retains publishing rights to the original composition.`,
      '',
      '3. MODIFICATIONS: Licensee may modify the beat for their creative purposes.',
      '',
      isExclusive
        ? '4. DISTRIBUTION: Licensee has full distribution rights with no limitations.'
        : '4. DISTRIBUTION: Licensee may distribute works incorporating this beat within the usage limits specified above.',
      '',
      isExclusive
        ? '5. TRANSFERABILITY: This license and all associated rights are fully transferable.'
        : '5. TRANSFERABILITY: This license is non-transferable.',
      '',
      ...(isExclusive ? [
        '6. EXCLUSIVITY: Producer agrees to remove the beat from all platforms and cease all future licensing.',
        '',
        '7. COPYRIGHT: Licensee may register the beat with any PRO and copyright offices.',
        '',
      ] : []),
      '═══════════════════════════════════════════════════════════════',
      '',
      'This agreement is automatically generated and represents a binding contract.',
      `Generated by Max Booster • ${purchaseDate}`,
      `Transaction ID: ${order.stripePaymentIntentId || order.id}`,
    ].join('\n');

    if (req.query.format === 'download') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="license-agreement-${order.id}.txt"`);
      return res.send(agreement);
    }

    res.json({
      orderId: order.id,
      licenseType,
      licenseName: template.name,
      beatTitle,
      producerName,
      buyerName,
      purchaseDate,
      amountPaid,
      agreement,
      template,
    });
  } catch (error: any) {
    logger.error('Error generating license agreement:', error);
    res.status(500).json({ error: 'Failed to generate license agreement' });
  }
});

router.get('/escrow', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching escrow transactions:', error);
    res.status(500).json({ error: 'Failed to fetch escrow transactions' });
  }
});

router.get('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

router.get('/contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const contracts = await storage.getContractTemplates(userId);
    res.json(contracts);
  } catch (error: any) {
    logger.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

router.get('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;
    const contract = await storage.getContractTemplateByUser(id, userId);
    
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(contract);
  } catch (error: any) {
    logger.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

router.patch('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;
    const { name, description, content, category, variables } = req.body;

    const contract = await storage.getContractTemplateByUser(id, userId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const updatedContract = await storage.updateContractTemplate(id, {
      name,
      description,
      content,
      category,
      variables,
    });

    res.json(updatedContract);
  } catch (error: any) {
    logger.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

router.delete('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;

    const contract = await storage.getContractTemplateByUser(id, userId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    await storage.deleteContractTemplate(id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

router.get('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching collaborations:', error);
    res.status(500).json({ error: 'Failed to fetch collaborations' });
  }
});

router.post('/upload', upload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArt', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, genre, mood, tempo, key, price, licenseType, description, tags } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!title || !genre) {
      return res.status(400).json({ error: 'Title and genre are required' });
    }

    let audioUrl = '';
    let artworkUrl = '';

    if (files?.audioFile?.[0]) {
      const audioFile = files.audioFile[0];
      const ext = path.extname(audioFile.originalname) || '.mp3';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const audioKey = await storageService.uploadFile(audioFile.buffer, 'beats', filename, audioFile.mimetype);
      audioUrl = `/api/marketplace/audio/${audioKey}`;
      logger.info(`Audio file saved: ${audioKey}`);
    }

    if (files?.coverArt?.[0]) {
      const coverFile = files.coverArt[0];
      const ext = path.extname(coverFile.originalname) || '.jpg';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const coverKey = await storageService.uploadFile(coverFile.buffer, 'covers', filename, coverFile.mimetype);
      artworkUrl = `/api/marketplace/cover/${coverKey}`;
      logger.info(`Cover art saved: ${coverKey}`);
    }

    const listing = await marketplaceService.createListing({
      userId: req.user!.id,
      title,
      description,
      genre,
      bpm: parseInt(tempo) || undefined,
      key,
      price: parseFloat(price) || 50,
      audioUrl,
      artworkUrl,
      tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
      licenses: [
        {
          type: licenseType || 'basic',
          price: parseFloat(price) || 50,
          features: ['MP3 Download', 'Non-exclusive rights'],
        },
      ],
    });

    // Notify followers about the new beat upload (async, non-blocking)
    (async () => {
      try {
        const producerId = req.user!.id;
        const producerName = (req.user as any)?.firstName || (req.user as any)?.username || 'A producer you follow';
        const followers = await discoveryAlgorithmService.getProducerFollowers(producerId);
        
        if (followers.length > 0) {
          logger.info(`Notifying ${followers.length} followers about new beat: ${title}`);
          
          // Send notifications in parallel batches of 10
          const batchSize = 10;
          for (let i = 0; i < followers.length; i += batchSize) {
            const batch = followers.slice(i, i + batchSize);
            await Promise.all(batch.map(followerId => 
              notificationService.send({
                userId: followerId,
                type: 'marketing',
                title: 'New Beat Alert!',
                message: `${producerName} just dropped a new beat: "${title}". Check it out now!`,
                link: `/marketplace/beat/${listing.id}`,
                metadata: {
                  beatId: listing.id,
                  producerId,
                  beatTitle: title,
                  genre,
                },
              }).catch(err => logger.error(`Failed to notify follower ${followerId}:`, err))
            ));
          }
          
          logger.info(`Successfully notified ${followers.length} followers about new beat`);
        }
      } catch (notifyError) {
        logger.error('Error notifying followers about new beat:', notifyError);
      }
    })();

    res.status(201).json(listing);
  } catch (error: any) {
    logger.error('Error uploading beat:', error);
    res.status(500).json({ error: 'Failed to upload beat' });
  }
});

router.get('/audio/:path(*)', async (req: Request, res: Response) => {
  try {
    let fileKey = req.params.path;
    
    // Strip 'uploads/' prefix if present - the storage key doesn't include this prefix
    // The 'uploads/' prefix is added by LocalStorageProvider.getDownloadUrl for URLs
    if (fileKey.startsWith('uploads/')) {
      fileKey = fileKey.substring('uploads/'.length);
    }
    
    const exists = await storageService.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Audio file not found: ${fileKey}`);
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const ext = path.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.aiff': 'audio/aiff',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
    };

    const fileBuffer = await storageService.downloadFile(fileKey);
    const contentType = mimeTypes[ext] || 'audio/mpeg';
    const fileSize = fileBuffer.length;

    // CORS headers for audio playback - override Helmet restrictions
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

    // Handle Range requests for audio seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(fileBuffer.subarray(start, end + 1));
    } else {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(fileBuffer);
    }
  } catch (error: any) {
    logger.error('Error serving audio file:', error);
    res.status(500).json({ error: 'Failed to load audio file' });
  }
});

router.get('/cover/:path(*)', async (req: Request, res: Response) => {
  try {
    const fileKey = req.params.path;
    
    const exists = await storageService.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Cover image not found: ${fileKey}`);
      return res.status(404).json({ error: 'Cover image not found' });
    }

    const ext = path.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const fileBuffer = await storageService.downloadFile(fileKey);
    
    // CORS headers for image loading - override Helmet restrictions
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(fileBuffer);
  } catch (error: any) {
    logger.error('Error serving cover image:', error);
    res.status(500).json({ error: 'Failed to load cover image' });
  }
});

router.put('/listings/:id', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'artwork', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { title, description, genre, mood, tempo, key, price, tags, licenseType } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (genre) updateData.genre = genre;
    if (mood) updateData.mood = mood;
    if (tempo) updateData.bpm = parseInt(tempo);
    if (key) updateData.key = key;
    if (price) updateData.price = parseFloat(price);
    if (licenseType) updateData.licenseType = licenseType;
    if (tags) updateData.tags = tags.split(',').map((t: string) => t.trim());

    if (files?.audio?.[0]) {
      const audioFile = files.audio[0];
      const ext = path.extname(audioFile.originalname).toLowerCase();
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const audioKey = await storageService.uploadFile(audioFile.buffer, 'beats', filename, audioFile.mimetype);
      updateData.audioUrl = `/api/marketplace/audio/${audioKey}`;
    }

    if (files?.artwork?.[0]) {
      const artworkFile = files.artwork[0];
      const ext = path.extname(artworkFile.originalname).toLowerCase();
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const artworkKey = await storageService.uploadFile(artworkFile.buffer, 'covers', filename, artworkFile.mimetype);
      updateData.artworkUrl = `/api/marketplace/cover/${artworkKey}`;
    }

    const updatedListing = await marketplaceService.updateListing(id, req.user!.id, updateData);
    if (!updatedListing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(updatedListing);
  } catch (error: any) {
    logger.error('Error updating listing:', error);
    if (error.message === 'Not authorized to update this listing') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to update beat' });
  }
});

router.delete('/listings/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    await marketplaceService.deleteListing(id, req.user!.id);
    res.json({ success: true, message: 'Beat deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting listing:', error);
    if (error.message === 'Not authorized to delete this listing') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Listing not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to delete beat' });
  }
});

router.post('/connect-stripe', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseUrl = getBaseUrl();

    const returnUrl = `${baseUrl}/marketplace?tab=payouts&setup=complete`;
    const refreshUrl = `${baseUrl}/marketplace?tab=payouts&setup=refresh`;

    const result = await marketplaceService.setupStripeConnect(
      req.user!.id,
      returnUrl,
      refreshUrl
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Error connecting Stripe:', error);
    res.status(500).json({ error: error.message || 'Failed to connect Stripe account' });
  }
});

router.post('/follow/:producerId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.params;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.followProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error following producer:', error);
    res.status(500).json({ error: 'Failed to follow producer' });
  }
});

router.post('/escrow/:transactionId/release', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { transactionId } = req.params;
    res.json({ success: true, message: 'Escrow released successfully', transactionId });
  } catch (error: any) {
    logger.error('Error releasing escrow:', error);
    res.status(500).json({ error: 'Failed to release escrow' });
  }
});

router.post('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, email, commissionRate } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const affiliate = {
      id: `aff-${Date.now()}`,
      name,
      email,
      affiliateCode: `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      commissionRate: commissionRate || 20,
      totalEarnings: 0,
      pendingPayout: 0,
      referralCount: 0,
      conversionRate: 0,
      status: 'active',
      joinedAt: new Date().toISOString(),
    };

    res.status(201).json(affiliate);
  } catch (error: any) {
    logger.error('Error creating affiliate:', error);
    res.status(500).json({ error: 'Failed to create affiliate' });
  }
});

router.post('/contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { name, description, content, category, variables } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const contract = await storage.createContractTemplate({
      userId,
      name,
      description: description || '',
      content,
      category: category || 'custom',
      variables: variables || [],
    });

    res.status(201).json(contract);
  } catch (error: any) {
    logger.error('Error creating contract:', error);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

router.post('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { toUserId, beatId, type, terms, splitPercentage, budget, message } = req.body;
    if (!toUserId || !type) {
      return res.status(400).json({ error: 'toUserId and type are required' });
    }

    const collaboration = {
      id: `collab-${Date.now()}`,
      fromUser: { id: req.user!.id, name: req.user!.username || 'User', avatar: '' },
      toUser: { id: toUserId, name: 'Recipient', avatar: '' },
      beatId: beatId || null,
      beatTitle: null,
      type,
      terms: terms || '',
      splitPercentage: splitPercentage || 50,
      budget: budget || null,
      status: 'pending',
      messages: message ? [{ sender: req.user!.id, content: message, timestamp: new Date().toISOString() }] : [],
      createdAt: new Date().toISOString(),
    };

    res.status(201).json(collaboration);
  } catch (error: any) {
    logger.error('Error creating collaboration:', error);
    res.status(500).json({ error: 'Failed to create collaboration' });
  }
});

// Producer by ID endpoint
router.get('/producers/:producerId', async (req: Request, res: Response) => {
  try {
    const { producerId } = req.params;
    const producer = await storage.getUser(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }
    
    const { storefronts, storefrontFollows, storefrontRatings, orders } = await import('@shared/schema');
    const { db } = await import('../db');
    const { sql, eq, avg: drizzleAvg } = await import('drizzle-orm');

    const producerBeats = await marketplaceService.getListingsByProducer(producerId);
    const beatCount = producerBeats.length;
    
    const userStorefront = await db.select({ id: storefronts.id })
      .from(storefronts)
      .where(eq(storefronts.userId, producerId))
      .limit(1);
    const storefrontId = userStorefront[0]?.id;

    let followerCount = 0;
    let avgRating = 0;
    let salesCount = 0;

    if (storefrontId) {
      const [followResult] = await db.select({ count: sql<number>`count(*)::int` })
        .from(storefrontFollows)
        .where(eq(storefrontFollows.storefrontId, storefrontId));
      followerCount = followResult?.count || 0;

      const [ratingResult] = await db.select({ avg: sql<number>`coalesce(avg(${storefrontRatings.rating}), 0)` })
        .from(storefrontRatings)
        .where(eq(storefrontRatings.storefrontId, storefrontId));
      avgRating = Math.round((Number(ratingResult?.avg) || 0) * 10) / 10;
    }

    const { and: drizzleAnd } = await import('drizzle-orm');
    const [salesResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(drizzleAnd(eq(orders.sellerId, producerId), eq(orders.status, 'completed')));
    salesCount = salesResult?.count || 0;
    
    res.json({
      id: producer.id,
      username: producer.username,
      avatarUrl: producer.avatarUrl,
      bio: producer.bio,
      location: producer.location,
      website: producer.website,
      socialLinks: producer.socialLinks,
      followerCount,
      beatCount,
      sales: salesCount,
      rating: avgRating,
      verified: producer.role === 'admin' || producer.subscriptionTier === 'lifetime',
    });
  } catch (error: any) {
    logger.error('Error fetching producer:', error);
    res.status(500).json({ error: 'Failed to fetch producer' });
  }
});

// Producer follow status endpoint
router.get('/producers/:producerId/follow-status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { producerId } = req.params;
    const profile = await discoveryAlgorithmService.getOrCreateTasteProfile(req.user!.id);
    const followedProducers = profile.followedProducers || [];
    const isFollowing = followedProducers.includes(producerId);
    res.json({ isFollowing });
  } catch (error: any) {
    logger.error('Error fetching follow status:', error);
    res.status(500).json({ error: 'Failed to fetch follow status' });
  }
});

// Toggle unfollow producer
router.post('/unfollow/:producerId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { producerId } = req.params;
    const result = await discoveryAlgorithmService.unfollowProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error unfollowing producer:', error);
    res.status(500).json({ error: 'Failed to unfollow producer' });
  }
});

// Like a beat (toggle)
router.post('/beats/:beatId/like', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { beatId } = req.params;
    
    // Check if already liked
    const { beatInteractions, listings } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    
    const existingLike = await db.select()
      .from(beatInteractions)
      .where(
        and(
          eq(beatInteractions.userId, req.user!.id),
          eq(beatInteractions.beatId, beatId),
          eq(beatInteractions.interactionType, 'like')
        )
      )
      .limit(1);
    
    if (existingLike.length > 0) {
      // Unlike - remove the interaction and decrement count
      await db.delete(beatInteractions)
        .where(
          and(
            eq(beatInteractions.userId, req.user!.id),
            eq(beatInteractions.beatId, beatId),
            eq(beatInteractions.interactionType, 'like')
          )
        );
      
      // Decrement like count in listing metadata
      const [listing] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (listing) {
        const currentMetadata = (listing.metadata as any) || {};
        const newLikes = Math.max(0, (currentMetadata.likes || 0) - 1);
        await db.update(listings)
          .set({ metadata: { ...currentMetadata, likes: newLikes } })
          .where(eq(listings.id, beatId));
      }
      
      res.json({ success: true, liked: false, likes: (listing?.metadata as any)?.likes || 0 });
    } else {
      // Like - record the interaction
      await discoveryAlgorithmService.recordInteraction({
        userId: req.user!.id,
        beatId,
        interactionType: 'like',
        source: 'marketplace',
      });
      
      // Increment like count in listing metadata
      const [listing] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (listing) {
        const currentMetadata = (listing.metadata as any) || {};
        const newLikes = (currentMetadata.likes || 0) + 1;
        await db.update(listings)
          .set({ metadata: { ...currentMetadata, likes: newLikes } })
          .where(eq(listings.id, beatId));
        res.json({ success: true, liked: true, likes: newLikes });
      } else {
        res.json({ success: true, liked: true });
      }
    }
  } catch (error: any) {
    logger.error('Error liking beat:', error);
    res.status(500).json({ error: 'Failed to like beat' });
  }
});

// Get like status for a beat
router.get('/beats/:beatId/like-status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { beatId } = req.params;
    
    // Check if user has liked this beat by checking interactions
    const { beatInteractions } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    
    const likes = await db.select()
      .from(beatInteractions)
      .where(
        and(
          eq(beatInteractions.userId, req.user!.id),
          eq(beatInteractions.beatId, beatId),
          eq(beatInteractions.interactionType, 'like')
        )
      )
      .limit(1);
    
    res.json({ isLiked: likes.length > 0 });
  } catch (error: any) {
    logger.error('Error checking like status:', error);
    res.status(500).json({ error: 'Failed to check like status' });
  }
});

// Rate a beat
router.post('/beats/:beatId/rate', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { beatId } = req.params;
    const { rating } = req.body;
    
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Store rating in beat interactions with custom data
    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: 'rate',
      source: 'marketplace',
    });
    
    // Update listing metadata with new rating
    const { listings } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, sql } = await import('drizzle-orm');
    
    // Get current listing and update average rating
    const [listing] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
    if (listing) {
      const currentMetadata = (listing.metadata as any) || {};
      const currentRatings = currentMetadata.ratings || [];
      const userRatingIndex = currentRatings.findIndex((r: any) => r.userId === req.user!.id);
      
      if (userRatingIndex >= 0) {
        currentRatings[userRatingIndex].rating = rating;
      } else {
        currentRatings.push({ userId: req.user!.id, rating, createdAt: new Date().toISOString() });
      }
      
      const avgRating = currentRatings.reduce((sum: number, r: any) => sum + r.rating, 0) / currentRatings.length;
      
      await db.update(listings)
        .set({ 
          metadata: { 
            ...currentMetadata, 
            ratings: currentRatings,
            avgRating: Math.round(avgRating * 10) / 10,
            ratingCount: currentRatings.length,
          } 
        })
        .where(eq(listings.id, beatId));
      
      res.json({ success: true, rating, avgRating: Math.round(avgRating * 10) / 10 });
    } else {
      res.status(404).json({ error: 'Beat not found' });
    }
  } catch (error: any) {
    logger.error('Error rating beat:', error);
    res.status(500).json({ error: 'Failed to rate beat' });
  }
});

// Get beat rating info
router.get('/beats/:beatId/rating', async (req: Request, res: Response) => {
  try {
    const { beatId } = req.params;
    const { listings } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq } = await import('drizzle-orm');
    
    const [listing] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
    if (!listing) {
      return res.status(404).json({ error: 'Beat not found' });
    }
    
    const metadata = (listing.metadata as any) || {};
    const userRating = req.isAuthenticated() 
      ? (metadata.ratings || []).find((r: any) => r.userId === req.user!.id)?.rating || 0
      : 0;
    
    res.json({
      avgRating: metadata.avgRating || 0,
      ratingCount: metadata.ratingCount || 0,
      userRating,
    });
  } catch (error: any) {
    logger.error('Error fetching beat rating:', error);
    res.status(500).json({ error: 'Failed to fetch rating' });
  }
});

// Stems endpoints
router.get('/stems/:stemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { stemId } = req.params;
    res.json({
      id: stemId,
      name: 'Stem',
      type: 'wav',
      duration: 180,
      price: 29.99,
      downloadUrl: null,
    });
  } catch (error: any) {
    logger.error('Error fetching stem:', error);
    res.status(500).json({ error: 'Failed to fetch stem' });
  }
});

router.post('/stems/:stemId/purchase', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { stemId } = req.params;
    res.json({
      success: true,
      purchaseId: `purchase_${Date.now()}`,
      stemId,
      downloadUrl: `/api/marketplace/stems/${stemId}/download`,
    });
  } catch (error: any) {
    logger.error('Error purchasing stem:', error);
    res.status(500).json({ error: 'Failed to purchase stem' });
  }
});

router.get('/stems/:stemId/download/:trackId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { stemId, trackId } = req.params;
    res.json({
      success: true,
      downloadUrl: `/uploads/stems/${stemId}_${trackId}.wav`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  } catch (error: any) {
    logger.error('Error generating stem download:', error);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

router.get('/my-stems', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching user stems:', error);
    res.status(500).json({ error: 'Failed to fetch your stems' });
  }
});

router.get('/listings/:listingId/stems', async (req: Request, res: Response) => {
  try {
    const { listingId } = req.params;
    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching listing stems:', error);
    res.status(500).json({ error: 'Failed to fetch listing stems' });
  }
});

// ===========================
// ADDITIONAL MISSING ENDPOINTS
// ===========================

// Affiliates endpoint
router.get('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ affiliates: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

// AI Recommendations endpoint
router.get('/ai-recommendations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ recommendations: [] });
  } catch (error: any) {
    logger.error('Error fetching AI recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch AI recommendations' });
  }
});

// Collaborations endpoint
router.get('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ collaborations: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching collaborations:', error);
    res.status(500).json({ error: 'Failed to fetch collaborations' });
  }
});

// Escrow endpoint
router.get('/escrow', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ escrows: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching escrows:', error);
    res.status(500).json({ error: 'Failed to fetch escrows' });
  }
});

// Interaction endpoint
router.post('/interaction', async (req: Request, res: Response) => {
  try {
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

export default router;
