import { Router } from 'express';
import { db } from '../../../db';
import { analytics, projects, releases, users } from '@shared/schema';
import { eq, and, desc, sql, gte, lte, between } from 'drizzle-orm';
import { apiKeyService, ApiKeyRequest } from '../../../services/apiKeyService';
import { logger } from '../../../logger.js';

const router = Router();

// Apply API key authentication, rate limiting, and usage tracking to all routes
router.use(apiKeyService.validateApiKey);
router.use(apiKeyService.rateLimitApiKey);
router.use(apiKeyService.trackApiUsage);

/**
 * GET /api/v1/analytics/platforms
 * List all connected platforms for the authenticated user
 */
router.get('/platforms', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Get user's connected platform tokens
    const [user] = await db
      .select({
        spotify: users.facebookToken,
        appleMusic: users.instagramToken,
        youtube: users.youtubeToken,
        soundcloud: users.tiktokToken,
        facebook: users.facebookToken,
        instagram: users.instagramToken,
        twitter: users.twitterToken,
        tiktok: users.tiktokToken,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Build list of connected platforms
    const platforms = [];
    if (user.spotify) platforms.push({ name: 'Spotify', status: 'connected' });
    if (user.appleMusic) platforms.push({ name: 'Apple Music', status: 'connected' });
    if (user.youtube) platforms.push({ name: 'YouTube', status: 'connected' });
    if (user.soundcloud) platforms.push({ name: 'SoundCloud', status: 'connected' });
    if (user.facebook) platforms.push({ name: 'Facebook', status: 'connected' });
    if (user.instagram) platforms.push({ name: 'Instagram', status: 'connected' });
    if (user.twitter) platforms.push({ name: 'Twitter', status: 'connected' });
    if (user.tiktok) platforms.push({ name: 'TikTok', status: 'connected' });

    return res.json({
      success: true,
      platforms,
      totalConnected: platforms.length,
    });
  } catch (error: unknown) {
    logger.error('Error fetching platforms:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch platforms' });
  }
});

/**
 * GET /api/v1/analytics/streams/:artistId?
 * Get streaming statistics across all platforms
 * Query params: startDate, endDate, platform, timeRange
 */
router.get('/streams/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { startDate, endDate, platform, timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Calculate date range
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - (parseInt(timeRange as string) || 30) * 24 * 60 * 60 * 1000);

    // Build query conditions
    const conditions = [
      eq(analytics.userId, artistId as string),
      gte(analytics.date, start),
      lte(analytics.date, end),
    ];

    if (platform) {
      conditions.push(eq(analytics.platform, platform as string));
    }

    // Get streaming data
    const streamData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(and(...conditions))
      .groupBy(sql`DATE(${analytics.date})`, analytics.platform)
      .orderBy(sql`DATE(${analytics.date})`);

    // Calculate totals
    const [totals] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(and(...conditions));

    // Group by platform
    const byPlatform = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(and(...conditions))
      .groupBy(analytics.platform)
      .orderBy(desc(sql`COALESCE(SUM(${analytics.streams}), 0)`));

    return res.json({
      success: true,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      totals: {
        streams: totals?.totalStreams || 0,
        revenue: parseFloat(totals?.totalRevenue?.toString() || '0'),
        listeners: totals?.totalListeners || 0,
      },
      byPlatform,
      timeline: streamData,
    });
  } catch (error: unknown) {
    logger.error('Error fetching stream data:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch stream data' });
  }
});

/**
 * GET /api/v1/analytics/engagement/:artistId?
 * Get engagement metrics (likes, shares, comments, etc.)
 */
router.get('/engagement/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { startDate, endDate, timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Calculate date range
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - (parseInt(timeRange as string) || 30) * 24 * 60 * 60 * 1000);

    // Get engagement data from platformData JSONB field
    const engagementData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        platform: analytics.platform,
        platformData: analytics.platformData,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, artistId as string),
          gte(analytics.date, start),
          lte(analytics.date, end)
        )
      )
      .orderBy(sql`DATE(${analytics.date})`);

    // Aggregate engagement metrics
    const engagement = engagementData.map((row) => {
      const data = (row.platformData as any) || {};
      return {
        date: row.date,
        platform: row.platform,
        likes: data.likes || 0,
        shares: data.shares || 0,
        comments: data.comments || 0,
        saves: data.saves || 0,
        engagement_rate: data.engagement_rate || 0,
      };
    });

    // Calculate totals
    const totals = engagement.reduce(
      (acc, curr) => ({
        likes: acc.likes + curr.likes,
        shares: acc.shares + curr.shares,
        comments: acc.comments + curr.comments,
        saves: acc.saves + curr.saves,
      }),
      { likes: 0, shares: 0, comments: 0, saves: 0 }
    );

    return res.json({
      success: true,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      totals,
      timeline: engagement,
    });
  } catch (error: unknown) {
    logger.error('Error fetching engagement data:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch engagement data' });
  }
});

/**
 * GET /api/v1/analytics/demographics/:artistId?
 * Get audience demographics (age, gender, location)
 */
router.get('/demographics/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { startDate, endDate, timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Calculate date range
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - (parseInt(timeRange as string) || 30) * 24 * 60 * 60 * 1000);

    // Get audience data from audienceData JSONB field
    const audienceData = await db
      .select({
        audienceData: analytics.audienceData,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, artistId as string),
          gte(analytics.date, start),
          lte(analytics.date, end)
        )
      )
      .orderBy(desc(analytics.date))
      .limit(1);

    const demographics = (audienceData[0]?.audienceData as any) || {
      age: [],
      gender: [],
      location: [],
    };

    return res.json({
      success: true,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      demographics: {
        age: demographics.age || [],
        gender: demographics.gender || [],
        location: demographics.location || [],
        topCities: demographics.topCities || [],
        topCountries: demographics.topCountries || [],
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching demographics data:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch demographics data' });
  }
});

/**
 * GET /api/v1/analytics/playlists/:artistId?
 * Get playlist placement data
 */
router.get('/playlists/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { startDate, endDate, timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Calculate date range
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - (parseInt(timeRange as string) || 30) * 24 * 60 * 60 * 1000);

    // Get playlist data from platformData JSONB field
    const playlistData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        platform: analytics.platform,
        platformData: analytics.platformData,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, artistId as string),
          gte(analytics.date, start),
          lte(analytics.date, end)
        )
      )
      .orderBy(desc(sql`DATE(${analytics.date})`));

    // Extract playlist information
    const playlists = playlistData.flatMap((row) => {
      const data = (row.platformData as any) || {};
      return (data.playlists || []).map((playlist: unknown) => ({
        date: row.date,
        platform: row.platform,
        playlistName: playlist.name,
        playlistId: playlist.id,
        followers: playlist.followers || 0,
        streams: playlist.streams || 0,
        position: playlist.position || null,
      }));
    });

    // Calculate total playlist placements
    const totalPlacements = playlists.length;
    const totalFollowers = playlists.reduce((sum, p) => sum + p.followers, 0);

    return res.json({
      success: true,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        totalPlacements,
        totalFollowers,
        avgFollowers: totalPlacements > 0 ? Math.round(totalFollowers / totalPlacements) : 0,
      },
      playlists: playlists.slice(0, 50), // Limit to top 50
    });
  } catch (error: unknown) {
    logger.error('Error fetching playlist data:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch playlist data' });
  }
});

/**
 * GET /api/v1/analytics/tracks/:artistId?
 * Get track performance data
 */
router.get('/tracks/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { limit = '50', sortBy = 'streams' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Get all projects/tracks for the user
    const tracks = await db
      .select({
        id: projects.id,
        title: projects.title,
        genre: projects.genre,
        streams: projects.streams,
        revenue: projects.revenue,
        playCount: projects.playCount,
        likeCount: projects.likeCount,
        artworkUrl: projects.artworkUrl,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.userId, artistId as string))
      .orderBy(desc(sortBy === 'revenue' ? projects.revenue : projects.streams))
      .limit(parseInt(limit as string));

    return res.json({
      success: true,
      total: tracks.length,
      tracks,
    });
  } catch (error: unknown) {
    logger.error('Error fetching track data:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch track data' });
  }
});

/**
 * GET /api/v1/analytics/summary/:artistId?
 * Get complete analytics summary
 */
router.get('/summary/:artistId?', async (req: ApiKeyRequest, res) => {
  try {
    const userId = req.apiKey?.userId;
    const artistId = req.params.artistId || userId;
    const { timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    // Calculate date range
    const end = new Date();
    const start = new Date(
      end.getTime() - (parseInt(timeRange as string) || 30) * 24 * 60 * 60 * 1000
    );

    // Get aggregated analytics
    const [summary] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        avgStreamsPerDay: sql<number>`COALESCE(AVG(${analytics.streams}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, artistId as string),
          gte(analytics.date, start),
          lte(analytics.date, end)
        )
      );

    // Get platform breakdown
    const platforms = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, artistId as string),
          gte(analytics.date, start),
          lte(analytics.date, end)
        )
      )
      .groupBy(analytics.platform);

    return res.json({
      success: true,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        totalStreams: summary?.totalStreams || 0,
        totalRevenue: parseFloat(summary?.totalRevenue?.toString() || '0'),
        totalListeners: summary?.totalListeners || 0,
        avgStreamsPerDay: Math.round(summary?.avgStreamsPerDay || 0),
      },
      platforms,
    });
  } catch (error: unknown) {
    logger.error('Error fetching analytics summary:', error);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to fetch analytics summary' });
  }
});

export default router;
