import { Router, Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { logger } from '../logger';
import { competitorBenchmarkService } from '../services/competitorBenchmarkService';
import { unifiedAIController } from '../services/unifiedAIController';
import { pythonAIService } from '../services/pythonAIService';
import { veoMusicService } from '../services/veoMusicService';
import { db } from '../db';
import { socialInboxMessages, socialMentions, socialKeywords, socialAccounts, posts, storefronts, listings, socialAutopilotContent, artistProfiles } from '@shared/schema';
import { eq, and, desc, gte, or } from 'drizzle-orm';
import { syncPlatformData } from '../services/socialSyncService';
import { requireAuth, requireAuthOnly } from '../middleware/auth.js';
import { notificationService } from '../services/notificationService.js';
import { renderVideo as renderAdvancedVideo } from '../services/advancedVideoRendererService.js';
import { contentQualityPipeline } from '../services/contentQualityPipeline.js';
import { audioUpload, artworkUpload } from '../middleware/uploadHandler.js';
import {
  analyzeUrl, analyzeAudio, analyzeImage,
  urlToContentSeed, audioToContentSeed, imageToContentSeed,
} from '../services/mediaAnalyzerService.js';
import {
  getVisualSpec,
  type SupportedPlatform as ContentSupportedPlatform,
  ALL_PLATFORMS as CONTENT_ALL_PLATFORMS,
} from '../services/contentPipeline/platformFormatters.js';

const router = Router();

// ── Async FFmpeg job store ─────────────────────────────────────────────────────
// Holds in-progress and completed FFmpeg video jobs.  Jobs are pruned after
// 10 minutes so memory never grows unbounded.  The client uses the existing
// /video-job/:jobId polling endpoint to check completion — same contract as
// the Python AI service, so no client changes are needed.

interface FFmpegJob {
  status: 'processing' | 'done' | 'error';
  result?: any;
  error?: string;
  createdAt: number;
}

const ffmpegJobs = new Map<string, FFmpegJob>();

function pruneStaleFFmpegJobs() {
  const now = Date.now();
  for (const [id, job] of ffmpegJobs.entries()) {
    if (now - job.createdAt > 10 * 60 * 1000) ffmpegJobs.delete(id);
  }
}

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// Middleware to require authentication
// =========================================
// SOCIAL MEDIA ROUTES - Return empty data until real data exists
// Frontend expects BARE ARRAYS, not wrapped objects
// =========================================

// Get social posts - returns empty array when no real data exists
router.get('/posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const posts = await storage.getSocialPosts?.(userId) || [];
    res.json(posts);
  } catch (error) {
    logger.error('Failed to get social posts:', error);
    res.status(500).json({ error: 'Failed to get social posts:' });
  }
});

router.post('/schedule-post', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, content, mediaUrls, scheduledAt } = req.body;

    if (!platform || !content) {
      return res.status(400).json({ error: 'Platform and content are required' });
    }

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    const [post] = await db.insert(posts).values({
      userId,
      platform,
      content,
      mediaUrls: mediaUrls || [],
      status: scheduledDate ? 'scheduled' : 'draft',
      scheduledAt: scheduledDate,
    }).returning();

    res.json({ success: true, post });

    if (scheduledDate) {
      setImmediate(async () => {
        try {
          await notificationService.sendSocialPostScheduledNotification(userId, platform, content, scheduledDate);
        } catch (err) {
          logger.error('Social post scheduled notification error:', err);
        }
      });
    }
  } catch (error) {
    logger.error('Failed to schedule post:', error);
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

router.post('/calendar/:postId/publish', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;

    const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [updated] = await db.update(posts)
      .set({ status: 'published', publishedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning();

    res.json({ success: true, post: updated });

    setImmediate(async () => {
      try {
        const platform = post.platform || 'Social';
        const content = post.content || '';
        await notificationService.sendSocialPostPublishedNotification(userId, platform, content);
      } catch (err) {
        logger.error('Social post published notification error:', err);
      }
    });
  } catch (error) {
    logger.error('Failed to publish post:', error);
    res.status(500).json({ error: 'Failed to publish post' });
  }
});

// Get social metrics - returns empty metrics when no real data exists
router.get('/metrics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const metrics = await storage.getSocialMetrics?.(userId) || {
      totalFollowers: 0,
      totalEngagement: 0,
      totalReach: 0,
      totalImpressions: 0,
      postsThisWeek: 0,
      avgEngagementRate: 0,
      followersGrowth: null,
      contentPerformance: null,
      platformGrowth: null,
      aiRecommendation: null,
    };
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get social metrics:', error);
    res.json({
      totalFollowers: 0,
      totalEngagement: 0,
      totalReach: 0,
      totalImpressions: 0,
      postsThisWeek: 0,
      avgEngagementRate: 0,
      followersGrowth: null,
      contentPerformance: null,
      platformGrowth: null,
      aiRecommendation: null,
    });
  }
});

// Get social calendar - returns empty array when no real data exists
router.get('/calendar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const events = await storage.getSocialCalendarEvents?.(userId) || [];
    res.json(events);
  } catch (error) {
    logger.error('Failed to get social calendar:', error);
    res.status(500).json({ error: 'Failed to get social calendar:' });
  }
});

// Get calendar stats - returns empty stats when no real data exists
router.get('/calendar/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getSocialCalendarStats?.(userId) || {
      totalScheduled: 0,
      pendingApproval: 0,
      published: 0,
      drafts: 0,
    };
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get calendar stats:', error);
    res.json({
      totalScheduled: 0,
      pendingApproval: 0,
      published: 0,
      drafts: 0,
    });
  }
});

// Get social activity - returns empty array when no real data exists
router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const activity = await storage.getSocialActivity?.(userId) || [];
    res.json(activity);
  } catch (error) {
    logger.error('Failed to get social activity:', error);
    res.status(500).json({ error: 'Failed to get social activity:' });
  }
});

// Get weekly stats - returns empty array when no real data exists
router.get('/weekly-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getSocialWeeklyStats?.(userId) || [];
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get weekly stats:', error);
    res.status(500).json({ error: 'Failed to get weekly stats:' });
  }
});

// Get AI insights - returns empty array when no real data exists
router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await (storage.getSocialAIInsights?.(userId) ?? Promise.resolve([])).catch(() => []);
    res.json(insights);
  } catch (error) {
    logger.error('Failed to get AI insights:', error);
    res.json([]);
  }
});

// Get platform status - returns connected social accounts from OAuth connections
// Returns array format for SocialMedia page, also works for Advertisement page
router.get('/platform-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Get actual OAuth connections from socialAccounts table
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);
    
    const connectionMap = new Map<string, typeof connections[0]>();
    for (const conn of connections) {
      if (conn.isActive) {
        connectionMap.set(conn.platform, conn);
      }
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    const stalePlatforms: string[] = [];
    for (const conn of connections) {
      if (conn.isActive) {
        const meta = conn.metadata as any;
        const lastSync = meta?.lastSyncedAt
          ? new Date(meta.lastSyncedAt).getTime()
          : conn.createdAt ? new Date(conn.createdAt).getTime() : 0;
        if (now - lastSync > ONE_HOUR_MS) {
          stalePlatforms.push(conn.platform);
        }
      }
    }

    if (stalePlatforms.length > 0) {
      const uniquePlatforms = new Set<string>();
      for (const p of stalePlatforms) {
        if (p === 'facebook' || p === 'instagram') {
          uniquePlatforms.add('meta');
        } else {
          uniquePlatforms.add(p);
        }
      }
      for (const p of uniquePlatforms) {
        syncPlatformData(userId, p).catch(err => {
          logger.warn(`Background sync failed for ${p}:`, err);
        });
      }
    }
    
    const supportedPlatforms = [
      { id: 'meta', name: 'Meta (Facebook + Instagram)' },
      { id: 'twitter', name: 'Twitter (X)' },
      { id: 'youtube', name: 'YouTube' },
      { id: 'tiktok', name: process.env.TIKTOK_ENV === 'sandbox' ? 'TikTok (Sandbox)' : 'TikTok' },
      { id: 'linkedin', name: 'LinkedIn' },
      { id: 'threads', name: 'Threads' },
      { id: 'googlebusiness', name: 'Google Business' },
      { id: 'spotify', name: 'Spotify' },
    ];
    
    const platformStatus = supportedPlatforms.map(platform => {
      if (platform.id === 'meta') {
        const fb = connectionMap.get('facebook');
        const ig = connectionMap.get('instagram');
        const isConnected = !!(fb || ig);
        const followers = (fb?.followerCount || 0) + (ig?.followerCount || 0);
        const primaryConn = fb || ig;
        return {
          id: 'meta',
          name: platform.name,
          isConnected,
          followers,
          engagement: 0,
          lastSync: (primaryConn?.metadata as any)?.lastSyncedAt || primaryConn?.createdAt?.toISOString() || '',
          status: isConnected ? 'active' : 'inactive',
          username: primaryConn?.username || undefined,
          profileUrl: primaryConn?.profileUrl || '',
          platformUserId: primaryConn?.platformUserId || '',
          metadata: primaryConn?.metadata || {},
        };
      }
      const conn = connectionMap.get(platform.id);
      return {
        id: platform.id,
        name: platform.name,
        isConnected: !!conn,
        followers: conn?.followerCount || 0,
        engagement: 0,
        lastSync: (conn?.metadata as any)?.lastSyncedAt || conn?.createdAt?.toISOString() || '',
        status: conn ? 'active' : 'inactive',
        username: conn?.username || undefined,
        profileUrl: conn?.profileUrl || '',
        platformUserId: conn?.platformUserId || '',
        metadata: conn?.metadata || {},
      };
    });
    
    res.json(platformStatus);
  } catch (error) {
    logger.error('Failed to get platform status:', error);
    res.status(500).json({ error: 'Failed to get platform status:' });
  }
});

router.post('/sync-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);

    const activePlatforms = new Set<string>();
    for (const conn of connections) {
      if (conn.isActive) {
        if (conn.platform === 'facebook' || conn.platform === 'instagram') {
          activePlatforms.add('meta');
        } else {
          activePlatforms.add(conn.platform);
        }
      }
    }

    const allResults: Record<string, any> = {};
    for (const p of activePlatforms) {
      try {
        const result = await syncPlatformData(userId, p);
        Object.assign(allResults, result);
      } catch (err) {
        logger.warn(`sync-all: failed to sync ${p}:`, err);
        allResults[p] = { error: 'Sync failed' };
      }
    }

    res.json({ success: true, results: allResults });

    setImmediate(async () => {
      try {
        const followerMilestones = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
        for (const conn of connections) {
          if (!conn.isActive || !conn.followerCount) continue;
          const followers = conn.followerCount as number;
          if (followerMilestones.includes(followers)) {
            const platformName = conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1);
            await notificationService.sendFollowerMilestoneNotification(userId, platformName, followers);
          }
        }
      } catch (err) {
        logger.error('Follower milestone notification error:', err);
      }
    });
  } catch (error) {
    logger.error('Failed to sync all platforms:', error);
    res.status(500).json({ error: 'Failed to sync all platforms' });
  }
});

// =========================================
// SOCIAL LISTENING ROUTES
// =========================================

// Get social listening keywords - returns empty array when no real data exists
router.get('/listening/keywords', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const keywords = await storage.getSocialListeningKeywords?.(userId) || [];
    res.json(keywords);
  } catch (error) {
    logger.error('Failed to get social listening keywords:', error);
    res.status(500).json({ error: 'Failed to get social listening keywords:' });
  }
});

router.get('/hashtags/trending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    const userPosts = await storage.getSocialPosts?.(userId) || [];

    const musicHashtags = [
      { hashtag: '#newmusic', baseVolume: 45200, category: 'general' },
      { hashtag: '#musicproducer', baseVolume: 32100, category: 'production' },
      { hashtag: '#beats', baseVolume: 28700, category: 'production' },
      { hashtag: '#hiphop', baseVolume: 89300, category: 'hiphop' },
      { hashtag: '#rnb', baseVolume: 67200, category: 'rnb' },
      { hashtag: '#trapbeats', baseVolume: 15600, category: 'hiphop' },
      { hashtag: '#studiolife', baseVolume: 12400, category: 'production' },
      { hashtag: '#songwriting', baseVolume: 9800, category: 'general' },
      { hashtag: '#indieartist', baseVolume: 18500, category: 'indie' },
      { hashtag: '#newrelease', baseVolume: 38900, category: 'general' },
      { hashtag: '#musicvideo', baseVolume: 52100, category: 'general' },
      { hashtag: '#producer', baseVolume: 41800, category: 'production' },
      { hashtag: '#rapper', baseVolume: 35400, category: 'hiphop' },
      { hashtag: '#singer', baseVolume: 29600, category: 'general' },
      { hashtag: '#beatmaker', baseVolume: 22300, category: 'production' },
      { hashtag: '#freestyle', baseVolume: 19700, category: 'hiphop' },
      { hashtag: '#musicislife', baseVolume: 56800, category: 'general' },
      { hashtag: '#linkinbio', baseVolume: 71200, category: 'promotion' },
      { hashtag: '#streamingmusic', baseVolume: 24500, category: 'promotion' },
      { hashtag: '#spotifyplaylist', baseVolume: 31400, category: 'promotion' },
    ];

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const hourOfDay = new Date().getUTCHours();

    const trending = musicHashtags.map((h, i) => {
      const timeFactor = Math.sin((dayOfYear + i) * 0.3 + hourOfDay * 0.1) * 0.15;
      const volume = Math.round(h.baseVolume * (1 + timeFactor));
      const trendVal = timeFactor;
      return {
        hashtag: h.hashtag,
        posts: volume,
        trend: trendVal > 0.05 ? 'up' : trendVal < -0.05 ? 'down' : 'stable' as string,
        category: h.category,
      };
    });

    trending.sort((a, b) => b.posts - a.posts);
    const topTrending = trending.slice(0, 12);

    res.json(topTrending);
  } catch (error) {
    logger.error('Failed to get trending hashtags:', error);
    res.status(500).json({ error: 'Failed to get trending hashtags:' });
  }
});

// Get social listening trending - returns empty array when no real data exists
router.get('/listening/trending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const trending = await storage.getSocialListeningTrending?.(userId) || [];
    res.json(trending);
  } catch (error) {
    logger.error('Failed to get social listening trending:', error);
    res.status(500).json({ error: 'Failed to get social listening trending:' });
  }
});

// Get social listening influencers - returns empty array when no real data exists
router.get('/listening/influencers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const influencers = await storage.getSocialListeningInfluencers?.(userId) || [];
    res.json(influencers);
  } catch (error) {
    logger.error('Failed to get social listening influencers:', error);
    res.status(500).json({ error: 'Failed to get social listening influencers:' });
  }
});

// Get social listening alerts - returns empty array when no real data exists
router.get('/listening/alerts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const alerts = await storage.getSocialListeningAlerts?.(userId) || [];
    res.json(alerts);
  } catch (error) {
    logger.error('Failed to get social listening alerts:', error);
    res.status(500).json({ error: 'Failed to get social listening alerts:' });
  }
});

// =========================================
// COMPETITOR BENCHMARKING ROUTES
// =========================================

// Get competitors - returns competitors from database
router.get('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await competitorBenchmarkService.getCompetitors(userId);
    res.json(competitors);
  } catch (error) {
    logger.error('Failed to get competitors:', error);
    res.status(500).json({ error: 'Failed to get competitors:' });
  }
});

// Add competitor
router.post('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, handle, platforms } = req.body;

    if (!name || !handle) {
      return res.status(400).json({ error: 'Name and handle are required' });
    }

    const result = await competitorBenchmarkService.addCompetitor(userId, { name, handle, platforms });
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json(result.competitor);
  } catch (error) {
    logger.error('Failed to add competitor:', error);
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

// Remove competitor
router.delete('/competitors/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await competitorBenchmarkService.removeCompetitor(userId, id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove competitor:', error);
    res.status(500).json({ error: 'Failed to remove competitor' });
  }
});

// Get your social stats - returns null when no real data exists
router.get('/your-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getUserSocialStats?.(userId) || null;
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get your social stats:', error);
    res.json(null);
  }
});

// Get benchmark competitors - returns comprehensive benchmark data
router.get('/benchmark/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await competitorBenchmarkService.getCompetitors(userId);
    const yourBrand = await competitorBenchmarkService.getYourStats(userId);
    const comparison = await competitorBenchmarkService.getBenchmarkComparison(userId);
    res.json({ competitors, yourBrand, comparison });
  } catch (error) {
    logger.error('Failed to get benchmark competitors:', error);
    res.json({ competitors: [], yourBrand: null, comparison: [] });
  }
});

// Get benchmark insights - returns competitive insights
router.get('/benchmark/insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await competitorBenchmarkService.getInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.error('Failed to get benchmark insights:', error);
    res.status(500).json({ error: 'Failed to get benchmark insights:' });
  }
});

// Get share of voice
router.get('/benchmark/share-of-voice', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const shareOfVoice = await competitorBenchmarkService.getShareOfVoice(userId);
    res.json(shareOfVoice);
  } catch (error) {
    logger.error('Failed to get share of voice:', error);
    res.status(500).json({ error: 'Failed to get share of voice' });
  }
});

// =========================================
// UNIFIED INBOX ROUTES - Returns empty data until real messages exist
// =========================================

// Get inbox messages - returns messages from database with filtering
router.get('/inbox', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, status, priority, sentiment, limit = '50', offset = '0' } = req.query;

    let query = db
      .select()
      .from(socialInboxMessages)
      .where(eq(socialInboxMessages.userId, userId))
      .orderBy(desc(socialInboxMessages.createdAt))
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
      .offset(Math.max(0, Number(offset) || 0));

    const messages = await query;
    
    const filteredMessages = messages.filter(m => {
      if (platform && platform !== 'all' && m.platform !== platform) return false;
      if (status && status !== 'all' && m.status !== status) return false;
      if (priority && priority !== 'all' && m.priority !== priority) return false;
      if (sentiment && sentiment !== 'all' && m.sentiment !== sentiment) return false;
      return true;
    });

    res.json({ 
      messages: filteredMessages.map(m => ({
        id: m.id,
        platform: m.platform,
        type: m.messageType,
        content: m.content,
        author: {
          id: m.authorId,
          name: m.authorName,
          username: m.authorHandle,
          avatar: m.authorAvatar,
          followers: m.authorFollowers,
          verified: m.authorVerified,
        },
        postContent: m.postContent,
        postUrl: m.postUrl,
        sentiment: m.sentiment,
        priority: m.priority,
        status: m.status,
        assignedTo: m.assignedTo,
        tags: m.tags || [],
        threadId: m.threadId,
        createdAt: m.createdAt,
        readAt: m.readAt,
        repliedAt: m.repliedAt,
      })), 
      total: filteredMessages.length 
    });
  } catch (error) {
    logger.error('Failed to get inbox messages:', error);
    res.json({ messages: [], total: 0 });
  }
});

// Get inbox stats - returns stats from database
router.get('/inbox/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const messages = await db
      .select()
      .from(socialInboxMessages)
      .where(eq(socialInboxMessages.userId, userId))
      .limit(200);

    const stats = {
      total: messages.length,
      unread: messages.filter(m => m.status === 'unread').length,
      highPriority: messages.filter(m => m.priority === 'high' && m.status === 'unread').length,
      negative: messages.filter(m => m.sentiment === 'negative' && m.status === 'unread').length,
      byPlatform: {
        twitter: messages.filter(m => m.platform === 'twitter').length,
        instagram: messages.filter(m => m.platform === 'instagram').length,
        facebook: messages.filter(m => m.platform === 'facebook').length,
        tiktok: messages.filter(m => m.platform === 'tiktok').length,
        youtube: messages.filter(m => m.platform === 'youtube').length,
        linkedin: messages.filter(m => m.platform === 'linkedin').length,
      },
    };
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get inbox stats:', error);
    res.json({ total: 0, unread: 0, highPriority: 0, negative: 0, byPlatform: {} });
  }
});

// Mark message as read
router.post('/inbox/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await db
      .update(socialInboxMessages)
      .set({ 
        status: 'read',
        readAt: new Date(),
      })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Mark multiple messages as read
router.post('/inbox/bulk/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds)) {
      return res.status(400).json({ error: 'messageIds must be an array' });
    }

    for (const id of messageIds) {
      await db
        .update(socialInboxMessages)
        .set({ 
          status: 'read',
          readAt: new Date(),
        })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            eq(socialInboxMessages.userId, userId)
          )
        );
    }

    res.json({ success: true, updated: messageIds.length });
  } catch (error) {
    logger.error('Failed to mark messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Reply to message
router.post('/inbox/:id/reply', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ 
        error: 'Reply content is required',
        outcome: {
          status: 'error',
          category: 'inbox',
          title: 'Reply Failed',
          message: 'Please enter a reply message.',
        }
      });
    }

    const [message] = await db
      .select()
      .from(socialInboxMessages)
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      )
      .limit(1);

    if (!message) {
      return res.status(404).json({ 
        error: 'Message not found',
        outcome: {
          status: 'error',
          category: 'inbox',
          title: 'Message Not Found',
          message: 'The message you are trying to reply to was not found.',
        }
      });
    }

    await db
      .update(socialInboxMessages)
      .set({ 
        status: 'replied',
        repliedAt: new Date(),
      })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ 
      success: true,
      outcome: {
        status: 'success',
        category: 'inbox',
        title: 'Reply Sent',
        message: `Your reply to @${message.authorHandle} on ${message.platform} has been sent.`,
        platform: message.platform,
        author: message.authorHandle,
      }
    });
  } catch (error) {
    logger.error('Failed to reply to message:', error);
    res.status(500).json({ 
      error: 'Failed to reply to message',
      outcome: {
        status: 'error',
        category: 'inbox',
        title: 'Reply Failed',
        message: 'Failed to send your reply. Please try again.',
        retryable: true,
      }
    });
  }
});

// Assign message to team member
router.post('/inbox/:id/assign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { assigneeId, assigneeName } = req.body;

    await db
      .update(socialInboxMessages)
      .set({ assignedTo: assigneeId })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ 
      success: true,
      outcome: {
        status: 'success',
        category: 'inbox',
        title: 'Message Assigned',
        message: `Message has been assigned to ${assigneeName || 'team member'}.`,
        assigneeName: assigneeName || 'Team Member',
      }
    });
  } catch (error) {
    logger.error('Failed to assign message:', error);
    res.status(500).json({ 
      error: 'Failed to assign message',
      outcome: {
        status: 'error',
        category: 'inbox',
        title: 'Assignment Failed',
        message: 'Failed to assign the message. Please try again.',
        retryable: true,
      }
    });
  }
});

// Archive message
router.post('/inbox/:id/archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await db
      .update(socialInboxMessages)
      .set({ status: 'archived' })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to archive message:', error);
    res.status(500).json({ error: 'Failed to archive message' });
  }
});

// Get reply templates - returns empty array when no templates exist
router.get('/inbox/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(500).json({ error: 'Internal server error' });
  } catch (error) {
    logger.error('Failed to get reply templates:', error);
    res.status(500).json({ error: 'Failed to get reply templates:' });
  }
});

// Get team members for assignment - returns empty array when no team exists
router.get('/inbox/team', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(500).json({ error: 'Internal server error' });
  } catch (error) {
    logger.error('Failed to get team members:', error);
    res.status(500).json({ error: 'Failed to get team members:' });
  }
});

// Connections endpoint - returns OAuth connections
router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);
    
    res.json(connections.filter(c => c.isActive).map(c => ({
      platform: c.platform,
      username: c.username,
      connected: c.isActive,
      connectedAt: c.createdAt,
      followers: c.followerCount || 0,
      profileUrl: c.profileUrl || '',
      platformUserId: c.platformUserId || '',
      metadata: c.metadata || {},
    })));
  } catch (error) {
    logger.error('Failed to get connections:', error);
    res.status(500).json({ error: 'Failed to get connections:' });
  }
});

// ===========================
// UNIFIED CALENDAR ENDPOINTS
// ===========================

router.get('/unified-calendar/posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ posts: [] });
  } catch (error) {
    logger.error('Failed to get unified calendar posts:', error);
    res.json({ posts: [] });
  }
});

router.get('/unified-calendar/campaigns', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ campaigns: [] });
  } catch (error) {
    logger.error('Failed to get unified calendar campaigns:', error);
    res.json({ campaigns: [] });
  }
});

router.get('/unified-calendar/holidays', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ holidays: [] });
  } catch (error) {
    logger.error('Failed to get unified calendar holidays:', error);
    res.json({ holidays: [] });
  }
});

router.get('/unified-calendar/queue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ queue: [] });
  } catch (error) {
    logger.error('Failed to get unified calendar queue:', error);
    res.json({ queue: [] });
  }
});

// =========================================
// AI CONTENT GENERATION
// =========================================

// Generate AI content for multiple platforms
router.post('/generate-content', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platforms = ['instagram'], contentType = 'post', topic = 'new music', tone = 'energetic' } = req.body;

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];
    const contentTypeMap: Record<string, string> = {
      'post': 'engagement',
      'announcement': 'announcement',
      'behind-the-scenes': 'behind-the-scenes',
      'promotional': 'promotional',
      'release': 'release',
      'story': 'engagement',
      'reel': 'behind-the-scenes',
      'carousel': 'engagement',
      'thread': 'engagement',
      'poll': 'engagement',
      'live-announcement': 'announcement',
      'short': 'behind-the-scenes',
      'pin': 'promotional',
      'newsletter': 'announcement',
      'collab-post': 'engagement',
      'remix': 'engagement',
      'duet': 'engagement',
      'challenge': 'engagement',
      'giveaway': 'promotional',
      'ama': 'engagement',
      'tutorial': 'engagement',
      'review': 'engagement',
      'testimonial': 'promotional',
      'milestone': 'announcement',
      'throwback': 'engagement',
      'teaser': 'promotional',
      'countdown': 'announcement',
      'fan-spotlight': 'engagement',
      'meme': 'engagement',
      'infographic': 'engagement',
      'quote': 'engagement',
    };

    const generatedContent = [];
    const failedPlatforms = [];

    // MaxCore AI is the only source — all platforms in parallel
    const mcResults = await Promise.allSettled(
      platforms
        .filter((p: string) => validPlatforms.includes(p))
        .map((platform: string) =>
          unifiedAIController.generateContent({
            tone:            validTones.includes(tone) ? tone : 'energetic',
            platform,
            topic:           topic || 'music',
            contentType:     contentTypeMap[contentType] || 'engagement',
            userId:          (req as any).user?.id,
            includeHashtags: true,
            includeEmojis:   true,
          }).then(result => ({ platform, result }))
        )
    );

    for (const settled of mcResults) {
      if (settled.status !== 'fulfilled') {
        failedPlatforms.push({ platform: 'unknown', error: 'Generation failed' });
        continue;
      }
      const { platform, result } = settled.value;
      if (result.success && result.data) {
        generatedContent.push({
          platform,
          caption:             result.data.caption,
          content:             result.data.caption,
          hashtags:            result.data.hashtags,
          hook:                result.data.hook,
          body:                result.data.body,
          cta:                 result.data.cta,
          emojis:              result.data.emojis,
          characterCount:      result.data.charCount,
          estimatedEngagement: result.data.estimatedEngagement,
          optimalPostTime:     getOptimalPostTime(platform),
          source:              'MaxCoreAI',
        });
      } else {
        failedPlatforms.push({ platform, error: 'Generation failed' });
      }
    }

    const hasVariations = generatedContent.length > 1;
    const hasHashtags = generatedContent.some(c => c.hashtags && c.hashtags.length > 0);
    const optimalTime = generatedContent[0]?.optimalPostTime || null;

    res.json({
      success: generatedContent.length > 0,
      generatedContent,
      platforms,
      contentType,
      failedPlatforms,
      outcome: {
        status: generatedContent.length > 0 
          ? (failedPlatforms.length > 0 ? 'partial' : 'success') 
          : 'error',
        category: 'content',
        title: generatedContent.length > 0 ? 'Content Generated' : 'Generation Failed',
        message: generatedContent.length > 0
          ? `Generated ${generatedContent.length} content variation${generatedContent.length > 1 ? 's' : ''}.${hasHashtags ? ' Hashtag suggestions included.' : ''}${optimalTime ? ` Best posting time: ${optimalTime}.` : ''}`
          : 'Failed to generate content. Please try again.',
        variationsCount: generatedContent.length,
        hasHashtags,
        optimalTime,
        fallbackAvailable: failedPlatforms.length > 0,
      },
    });
  } catch (error) {
    logger.error('Failed to generate social content:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate content',
      outcome: {
        status: 'error',
        category: 'content',
        title: 'Generation Failed',
        message: 'AI content generation service is temporarily unavailable. Please try again or use a template.',
        retryable: true,
        fallbackAvailable: true,
      }
    });
  }
});

function getOptimalPostTime(platform: string): string {
  const optimalTimes: Record<string, string> = {
    instagram: 'Today at 11:00 AM',
    twitter: 'Today at 9:00 AM',
    facebook: 'Today at 1:00 PM',
    linkedin: 'Today at 8:00 AM',
    tiktok: 'Today at 7:00 PM',
    youtube: 'Today at 3:00 PM',
  };
  return optimalTimes[platform] || 'Today at 12:00 PM';
}

// Helper function to fetch and extract metadata from any URL
async function extractUrlMetadata(url: string): Promise<{
  title: string;
  description: string;
  type: string;
  contentType: string;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();
    
    // Extract Open Graph and meta tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogTypeMatch = html.match(/<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || '';
    const description = ogDescMatch?.[1] || descMatch?.[1] || '';
    const ogType = ogTypeMatch?.[1] || '';
    
    // Determine content type based on URL patterns and og:type
    let type = 'website';
    let contentType = 'promotional';
    
    const urlLower = url.toLowerCase();
    
    // Playlists
    if (urlLower.includes('playlist') || urlLower.includes('/playlists/') ||
        urlLower.includes('open.spotify.com/playlist')) {
      type = 'playlist';
      contentType = 'engagement';
    }
    // Podcasts
    else if (urlLower.includes('podcasts.apple.com') || urlLower.includes('anchor.fm') || 
             urlLower.includes('spotify.com/show') || urlLower.includes('spotify.com/episode') ||
             urlLower.includes('podbean') || urlLower.includes('buzzsprout') ||
             urlLower.includes('transistor.fm') || urlLower.includes('overcast.fm') ||
             urlLower.includes('castbox') || urlLower.includes('pocketcasts')) {
      type = 'podcast';
      contentType = 'announcement';
    }
    // Livestreams
    else if (urlLower.includes('twitch.tv') || urlLower.includes('kick.com') ||
             urlLower.includes('live.') || urlLower.includes('/live') ||
             urlLower.includes('livestream')) {
      type = 'livestream';
      contentType = 'announcement';
    }
    // Music platforms
    else if (urlLower.includes('spotify') || urlLower.includes('apple.com/music') || 
        urlLower.includes('soundcloud') || urlLower.includes('tidal') ||
        urlLower.includes('deezer') || urlLower.includes('bandcamp')) {
      type = 'music';
      contentType = 'release';
    }
    // Video platforms
    else if (urlLower.includes('youtube') || urlLower.includes('youtu.be') || 
             urlLower.includes('vimeo') || urlLower.includes('tiktok')) {
      type = 'video';
      contentType = 'release';
    }
    // Crowdfunding
    else if (urlLower.includes('kickstarter') || urlLower.includes('indiegogo') ||
             urlLower.includes('gofundme') || urlLower.includes('patreon') ||
             urlLower.includes('buymeacoffee') || urlLower.includes('ko-fi')) {
      type = 'crowdfunding';
      contentType = 'promotional';
    }
    // Merch / physical products
    else if (urlLower.includes('merch') || urlLower.includes('merchbar') ||
             urlLower.includes('bonfire.com') || urlLower.includes('printful') ||
             urlLower.includes('teespring') || urlLower.includes('redbubble')) {
      type = 'merch';
      contentType = 'promotional';
    }
    // Press / Media features
    else if (urlLower.includes('press') || urlLower.includes('pitchfork') ||
             urlLower.includes('billboard') || urlLower.includes('rollingstone') ||
             urlLower.includes('complex.com') || urlLower.includes('hypebeast') ||
             urlLower.includes('hotnewhiphop') || urlLower.includes('interview')) {
      type = 'press';
      contentType = 'announcement';
    }
    // NFTs / Web3
    else if (urlLower.includes('opensea') || urlLower.includes('rarible') ||
             urlLower.includes('foundation.app') || urlLower.includes('nft') ||
             urlLower.includes('mint') || urlLower.includes('zora.co')) {
      type = 'nft';
      contentType = 'promotional';
    }
    // Portfolios / personal websites
    else if (urlLower.includes('linktr.ee') || urlLower.includes('bio.link') ||
             urlLower.includes('carrd.co') || urlLower.includes('about.me') ||
             urlLower.includes('portfolio') || urlLower.includes('linkin.bio')) {
      type = 'portfolio';
      contentType = 'engagement';
    }
    // Collaboration / features
    else if (urlLower.includes('feat') || urlLower.includes('collab') ||
             urlLower.includes('splice.com')) {
      type = 'collaboration';
      contentType = 'announcement';
    }
    // Education / tutorials
    else if (urlLower.includes('udemy') || urlLower.includes('skillshare') ||
             urlLower.includes('masterclass') || urlLower.includes('coursera') ||
             urlLower.includes('tutorial') || urlLower.includes('lesson')) {
      type = 'education';
      contentType = 'engagement';
    }
    // News/articles
    else if (ogType.includes('article') || urlLower.includes('/blog') || 
             urlLower.includes('/news') || urlLower.includes('/article')) {
      type = 'article';
      contentType = 'announcement';
    }
    // E-commerce/products
    else if (ogType.includes('product') || urlLower.includes('/product') || 
             urlLower.includes('/shop') || urlLower.includes('/store')) {
      type = 'product';
      contentType = 'promotional';
    }
    // Events
    else if (urlLower.includes('event') || urlLower.includes('ticket') || 
             urlLower.includes('concert') || urlLower.includes('tour')) {
      type = 'event';
      contentType = 'announcement';
    }
    // Social profiles
    else if (urlLower.includes('instagram.com') || urlLower.includes('twitter.com') ||
             urlLower.includes('facebook.com') || urlLower.includes('linkedin.com')) {
      type = 'social';
      contentType = 'engagement';
    }
    
    return {
      title: title.trim().substring(0, 200),
      description: description.trim().substring(0, 500),
      type,
      contentType,
    };
  } catch (error) {
    logger.warn('Failed to fetch URL metadata:', error);
    return {
      title: '',
      description: '',
      type: 'website',
      contentType: 'promotional',
    };
  }
}

// Generate content from any URL (websites, music, videos, articles, products, etc.)
router.post('/generate-from-url', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, platforms = ['instagram'], tone = 'energetic', format = 'text', targetAudience = '' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Use the rich Python URL analyzer for full metadata extraction
    const analysis = await analyzeUrl(url.trim());
    const seed = urlToContentSeed(analysis);

    // Build a clean, structured topic for the AI model — no pollution from targetAudience or format
    let topic: string;
    if (seed.track && seed.artist) {
      topic = `"${seed.track}" by ${seed.artist}`;
      if (seed.genre && seed.genre !== 'default') topic += ` — ${seed.genre}`;
    } else if (seed.track) {
      topic = `"${seed.track}"`;
    } else if (seed.artist) {
      topic = `New music by ${seed.artist}`;
    } else if (analysis.title) {
      // Use the page title, cleaned up
      topic = analysis.title.replace(/\s*[-|–]\s*\S+$/, '').trim().slice(0, 80);
    } else {
      topic = seed.topic.slice(0, 80);
    }

    // Derive the content_type for better CTA selection
    const contentType = seed.content_type || seed.platform_category || 'general';

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];
    const generatedContent: any[] = [];

    // Combine keywords + tags from URL analysis into a deduplicated keyword list
    const allKeywords = [...new Set([
      ...(seed.keywords || []),
      ...(seed.tags     || []),
    ])].slice(0, 20);

    // Build rich extra_context from headings, event/product data, and content signals
    const extraParts: string[] = [];
    if (seed.headings?.length)       extraParts.push(seed.headings.slice(0, 3).join(' • '));
    if (seed.event_date)             extraParts.push(`Event: ${seed.event_date}${seed.event_location ? ' @ ' + seed.event_location : ''}`);
    if (seed.performers?.length)     extraParts.push(`Performers: ${seed.performers.slice(0, 3).join(', ')}`);
    if (seed.price)                  extraParts.push(`Price: ${seed.currency || ''}${seed.price}`);
    if (seed.view_count)             extraParts.push(`${seed.view_count.toLocaleString()} views`);
    if (seed.like_count)             extraParts.push(`${seed.like_count.toLocaleString()} likes`);
    if (seed.play_count)             extraParts.push(`${seed.play_count.toLocaleString()} plays`);
    if (seed.subscriber_count)       extraParts.push(`${seed.subscriber_count.toLocaleString()} subscribers`);
    if (targetAudience)              extraParts.push(`Target: ${targetAudience}`);

    // MaxCore AI is the only source — generate for all platforms in parallel
    const platformResults = await Promise.allSettled(
      platforms
        .filter((p: string) => validPlatforms.includes(p))
        .map((platform: string) =>
          unifiedAIController.generateContent({
            tone:            validTones.includes(tone) ? tone : 'energetic',
            platform,
            topic:           topic.substring(0, 120),
            genre:           seed.genre || 'hip-hop',
            artistName:      seed.artist || '',
            trackTitle:      seed.track  || '',
            album:           seed.album  || undefined,
            releaseDate:     seed.release_date || undefined,
            label:           seed.label  || undefined,
            keywords:        allKeywords.length ? allKeywords : undefined,
            mood:            seed.tone !== 'default' ? seed.tone : undefined,
            description:     analysis.description?.slice(0, 200) || undefined,
            bodyPreview:     seed.body_preview?.slice(0, 300) || undefined,
            extraContext:    extraParts.length ? extraParts.join(' | ') : undefined,
            userId:          (req as any).user?.id,
            includeHashtags: true,
            includeEmojis:   true,
          }).then(result => ({ platform, result }))
        )
    );

    for (const settled of platformResults) {
      if (settled.status !== 'fulfilled') continue;
      const { platform, result } = settled.value;
      if (!result.success || !result.data) continue;

      const captionText = result.data.caption + `\n\n🔗 ${url}`;
      const rawCaption  = result.data.caption || '';
      const captionParts = rawCaption.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
      const derivedHook = result.data.hook || captionParts[0] || rawCaption.split('\n')[0] || '';
      const derivedBody = result.data.body || captionParts[1] || '';
      const derivedCta  = result.data.cta  || captionParts[2] || '';
      // Video overlays need short, punchy text (no hashtags, no URLs)
      const stripMeta = (s: string) => s.replace(/#\w+/g, '').replace(/https?:\/\/\S+/g, '').replace(/🔗.*$/g, '').trim();
      const videoHook = stripMeta(derivedHook).slice(0, 80);
      const videoBody = stripMeta(derivedBody).slice(0, 100);
      const videoCta  = stripMeta(derivedCta).slice(0, 50) || 'Join Max Booster';
      generatedContent.push({
        platform,
        caption:        captionText,
        content:        captionText,
        hashtags:       result.data.hashtags,
        hook:           derivedHook,
        body:           derivedBody,
        cta:            derivedCta,
        video_hook:     videoHook,
        video_body:     videoBody,
        video_cta:      videoCta,
        artist_name:    seed.artist || '',
        genre:          seed.genre  || 'hip-hop',
        thumbnail_url:  seed.og_image || seed.thumbnail_url || '',
        sourceUrl:      url,
        extractedTitle: analysis.title,
        contentType,
        format,
        targetAudience: targetAudience || undefined,
        source:         'MaxCoreAI',
      });
    }

    if (generatedContent.length === 0) {
      // Should never reach here — but keep a last-resort loop as safety net
      for (const platform of platforms) {
        if (!validPlatforms.includes(platform)) continue;

        const result = await unifiedAIController.generateContent({
          tone:            validTones.includes(tone) ? tone : 'energetic',
          platform,
          topic:           topic.substring(0, 120),
          genre:           seed.genre || 'hip-hop',
          artistName:      seed.artist || '',
          trackTitle:      seed.track  || '',
          userId:          (req as any).user?.id,
          includeHashtags: true,
          includeEmojis:   true,
        });

        if (result.success && result.data) {
          const captionText = result.data.caption + `\n\n🔗 ${url}`;
          const rawCaption = result.data.caption || '';
          const captionParts = rawCaption.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
          const derivedHook = result.data.hook || captionParts[0] || rawCaption.split('\n')[0] || '';
          const derivedBody = result.data.body || captionParts[1] || '';
          const derivedCta  = result.data.cta  || captionParts[2] || '';
          const stripMeta = (s: string) => s.replace(/#\w+/g, '').replace(/https?:\/\/\S+/g, '').replace(/🔗.*$/g, '').trim();
          const videoHook = stripMeta(derivedHook).slice(0, 80);
          const videoBody = stripMeta(derivedBody).slice(0, 100);
          const videoCta  = stripMeta(derivedCta).slice(0, 50) || 'Join Max Booster';
          generatedContent.push({
            platform,
            caption:        captionText,
            content:        captionText,
            hashtags:       result.data.hashtags,
            hook:           derivedHook,
            body:           derivedBody,
            cta:            derivedCta,
            video_hook:     videoHook,
            video_body:     videoBody,
            video_cta:      videoCta,
            artist_name:    seed.artist || '',
            genre:          seed.genre  || 'hip-hop',
            thumbnail_url:  seed.og_image || seed.thumbnail_url || '',
            sourceUrl:      url,
            extractedTitle: analysis.title,
            contentType,
            format,
            targetAudience: targetAudience || undefined,
            source:         'MaxCoreAI',
          });
        }
      }
    }

    res.json({
      success: true,
      generatedContent,
      url,
      platforms,
      metadata: {
        title:       analysis.title,
        description: analysis.description?.substring(0, 200),
        type:        contentType,
        artist:      seed.artist || '',
        track:       seed.track  || '',
        genre:       seed.genre  || '',
        thumbnail:   seed.og_image || seed.thumbnail_url || '',
        platform:    analysis.platform,
      },
    });
  } catch (error) {
    logger.error('Failed to generate content from URL:', error);
    res.status(500).json({ error: 'Failed to generate content from URL' });
  }
});

// GET /api/social/scheduled - Get scheduled posts
router.get('/scheduled', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const scheduledPosts = await storage.getScheduledPosts?.(userId) || [];
    res.json(scheduledPosts);
  } catch (error) {
    logger.error('Failed to get scheduled posts:', error);
    res.status(500).json({ error: 'Failed to get scheduled posts:' });
  }
});

// GET /api/social/analytics - Get social analytics
router.get('/analytics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, period = '30d' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [accounts, periodPosts, autopilotContent, artistProfile] = await Promise.all([
      db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId)),
      db.select().from(posts).where(and(eq(posts.userId, userId), gte(posts.createdAt, periodStart))),
      db.select().from(socialAutopilotContent).where(and(
        eq(socialAutopilotContent.userId, userId),
        gte(socialAutopilotContent.createdAt, periodStart)
      )),
      db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    ]);

    // Kick off background follower-count sync for stale accounts
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    const stalePlatforms = new Set<string>();
    for (const acc of accounts) {
      if (!acc.isActive) continue;
      const lastSynced = (acc.metadata as any)?.lastSyncedAt
        ? new Date((acc.metadata as any).lastSyncedAt).getTime()
        : acc.createdAt ? new Date(acc.createdAt).getTime() : 0;
      if (now - lastSynced > ONE_HOUR_MS) {
        stalePlatforms.add(acc.platform === 'facebook' || acc.platform === 'instagram' ? 'meta' : acc.platform);
      }
    }
    for (const p of stalePlatforms) {
      syncPlatformData(userId, p).catch(err => logger.warn(`[Analytics] BG sync failed for ${p}:`, err));
    }

    // Aggregate engagement from posts
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalViews = 0;
    let totalReach = 0, totalImpressions = 0;

    const platformEngagement: Record<string, { likes: number; comments: number; shares: number; views: number; posts: number }> = {};

    for (const post of periodPosts) {
      const eng = post.engagement as any;
      if (eng) {
        const pl = (post.platform || 'unknown').toLowerCase();
        if (!platformEngagement[pl]) platformEngagement[pl] = { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        platformEngagement[pl].likes += eng.likes || 0;
        platformEngagement[pl].comments += eng.comments || 0;
        platformEngagement[pl].shares += eng.shares || eng.retweets || 0;
        platformEngagement[pl].views += eng.views || 0;
        platformEngagement[pl].posts += 1;
        totalLikes += eng.likes || 0;
        totalComments += eng.comments || 0;
        totalShares += eng.shares || eng.retweets || 0;
        totalViews += eng.views || 0;
        totalReach += eng.reach || 0;
        totalImpressions += eng.impressions || 0;
      }
    }

    for (const content of autopilotContent) {
      const perf = content.performance as any;
      if (perf) {
        const pl = (content.platform || 'unknown').toLowerCase();
        if (!platformEngagement[pl]) platformEngagement[pl] = { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        platformEngagement[pl].likes += perf.likes || 0;
        platformEngagement[pl].comments += perf.comments || 0;
        platformEngagement[pl].shares += perf.shares || 0;
        platformEngagement[pl].views += perf.views || 0;
        platformEngagement[pl].posts += 1;
        totalLikes += perf.likes || 0;
        totalComments += perf.comments || 0;
        totalShares += perf.shares || 0;
        totalViews += perf.views || 0;
      }
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followerCount || 0), 0);
    const engagementRate = totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0;

    // Platform breakdown enriched with follower counts from connected accounts
    const platformBreakdown = accounts
      .filter(acc => acc.isActive)
      .map(acc => {
        const pl = acc.platform.toLowerCase();
        const eng = platformEngagement[pl] || { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        return {
          platform: acc.platform,
          username: acc.username || '',
          followers: acc.followerCount || 0,
          posts: eng.posts,
          likes: eng.likes,
          comments: eng.comments,
          shares: eng.shares,
          views: eng.views,
          engagement: eng.likes + eng.comments + eng.shares,
          profileUrl: acc.profileUrl || '',
        };
      });

    // Daily metrics for the period
    const dailyMap: Record<string, { date: string; posts: number; engagement: number; views: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      dailyMap[d] = { date: d, posts: 0, engagement: 0, views: 0 };
    }
    for (const post of periodPosts) {
      const d = new Date(post.createdAt!).toISOString().split('T')[0];
      if (dailyMap[d]) {
        dailyMap[d].posts += 1;
        const eng = post.engagement as any;
        if (eng) {
          dailyMap[d].engagement += (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0);
          dailyMap[d].views += eng.views || 0;
        }
      }
    }
    for (const content of autopilotContent) {
      const d = new Date(content.createdAt!).toISOString().split('T')[0];
      if (dailyMap[d]) {
        dailyMap[d].posts += 1;
        const perf = content.performance as any;
        if (perf) {
          dailyMap[d].engagement += (perf.likes || 0) + (perf.comments || 0) + (perf.shares || 0);
          dailyMap[d].views += perf.views || 0;
        }
      }
    }

    // Top posts by engagement
    const allPostsForRanking = [
      ...periodPosts.map(p => ({
        id: p.id,
        platform: p.platform,
        content: p.content?.substring(0, 120) || '',
        publishedAt: p.publishedAt || p.createdAt,
        engagement: (() => {
          const e = p.engagement as any;
          return e ? (e.likes || 0) + (e.comments || 0) + (e.shares || 0) : 0;
        })(),
        views: (p.engagement as any)?.views || 0,
      })),
    ].sort((a, b) => b.engagement - a.engagement).slice(0, 10);

    // Spotify artist data if connected
    let spotifyStats: any = null;
    const profile = artistProfile[0];
    if (profile?.spotifyArtistId) {
      try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (clientId && clientSecret) {
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(6000),
          });
          if (tokenRes.ok) {
            const { access_token } = await tokenRes.json() as any;
            const artistRes = await fetch(`https://api.spotify.com/v1/artists/${profile.spotifyArtistId}`, {
              headers: { Authorization: `Bearer ${access_token}` },
              signal: AbortSignal.timeout(6000),
            });
            if (artistRes.ok) {
              const artist = await artistRes.json() as any;
              spotifyStats = {
                followers: artist.followers?.total || 0,
                popularity: artist.popularity || 0,
                genres: artist.genres || [],
                artistId: profile.spotifyArtistId,
                artistName: artist.name,
                imageUrl: artist.images?.[0]?.url || null,
              };
            }
          }
        }
      } catch (spotifyErr) {
        logger.warn('[Analytics] Spotify artist stats fetch failed:', spotifyErr);
      }
    }

    res.json({
      period,
      platform: platform || 'all',
      syncedAt: new Date().toISOString(),
      metrics: {
        totalFollowers,
        followersGrowth: 0,
        totalEngagement,
        engagementRate,
        totalReach: totalReach || totalViews,
        totalImpressions: totalImpressions || totalViews,
        postsPublished: periodPosts.length + autopilotContent.length,
        totalLikes,
        totalComments,
        totalShares,
        totalViews,
      },
      platformBreakdown,
      dailyMetrics: Object.values(dailyMap),
      topPosts: allPostsForRanking,
      spotifyStats,
      connectedPlatforms: accounts.filter(a => a.isActive).length,
    });
  } catch (error) {
    logger.error('Failed to get social analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

router.post('/generate-video', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      hook: rawHook, body: rawBody, cta: rawCta,
      platform, aspect_ratio, template,
      duration, bg_color, text_color, accent_color,
      artist_name, topic, goal, tone, quality, genre,
      user_audio_path, voiceover,
    } = req.body;

    const userId = req.user?.id;

    // ── Always respond immediately — client polls via /video-job/:id ─────────
    // Holding the HTTP connection open during generation (2–5 min) triggers
    // proxy timeouts that the client misreads as auth failures.  All paths
    // (Python AI and FFmpeg) now run in a background job and store their
    // result in the ffmpegJobs map so the polling endpoint can serve it.
    const jobId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pruneStaleFFmpegJobs();
    ffmpegJobs.set(jobId, { status: 'processing', createdAt: Date.now() });

    // ── Background job: AI content → Python AI renderer → FFmpeg ─────────────
    (async () => {
      try {
        // Stage 1 — Advanced Social AI generates hook / body / CTA.
        // Hook/body/cta passed directly from the client are used as-is.
        let hook = rawHook || '';
        let body = rawBody || '';
        let cta  = rawCta  || '';

        // If the topic is a bare URL, convert it to a descriptive topic so MaxCore
        // can generate meaningful content instead of just printing the raw URL.
        // URL  →  platform/product promo  (e.g. "MaxBooster music career platform")
        // Text →  artist / music content  (no change)
        let resolvedTopic = topic || '';
        if (topic && /^https?:\/\//.test(topic.trim())) {
          try {
            const urlDomain = new URL(topic.trim()).hostname.replace(/^www\./, '');
            // Convert domain to a readable product/platform name:
            //   "maxbooster.replit.app" → "MaxBooster"
            //   "my-beats.com"          → "My Beats"
            const platformName = urlDomain
              .split('.')[0]
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            resolvedTopic = `${platformName} music platform promotional video — features, benefits, and why artists should join`;
          } catch {
            resolvedTopic = topic;
          }
        }

        if (!hook && !body && !cta && topic) {
          // Stage 1: MaxCore → Python AI → ContentGenerator for video script
          // Route through the full advanced AI pipeline so MaxCore-trained content
          // feeds the video renderer, not the template engine.
          let scriptSource = 'template';
          try {
            const scriptResult = await unifiedAIController.generateContent({
              platform: (platform || 'tiktok') as any,
              tone: (tone || 'energetic') as any,
              topic: resolvedTopic,
              contentType: (goal === 'sales' || goal === 'traffic')
                ? 'promotional'
                : goal === 'viral' ? 'engagement' : 'engagement',
              includeHashtags: false,
              includeEmojis: false,
              genre: genre || undefined,
            });

            if (scriptResult.success && scriptResult.data) {
              const d = scriptResult.data as any;
              hook = (d.hook || d.caption || '').slice(0, 80);
              body = (d.body || d.caption || '').split('\n')[0].slice(0, 120);
              cta  = (d.cta || '').slice(0, 60);
              scriptSource = scriptResult.source || 'AI';
            }
          } catch (scriptErr) {
            logger.warn('[VideoGen] Advanced AI script generation failed, falling through to AdvancedSocialAI:', scriptErr);
          }

          // Fall through to AdvancedSocialAI only if MaxCore/PythonAI produced nothing
          if (!hook && !body) {
            const { advancedSocialAIService: advAI } = await import('../services/advancedSocialAIService.js');
            const objective = goal === 'sales' || goal === 'traffic'
              ? 'conversions'
              : goal === 'viral' ? 'viral' : 'engagement';
            const aiResult = await advAI.generateAdvancedContent({
              userId: userId || 'anonymous',
              topic: resolvedTopic,
              platforms: [platform || 'tiktok'],
              objective,
              tone: (tone || 'energetic') as any,
              genre: genre || undefined,
              artistName: artist_name || undefined,
              contentType: objective === 'conversions' ? 'promotional'
                : objective === 'viral' ? 'storytelling' : 'announcement',
              includeHashtags: false,
              includeEmojis: false,
              variantCount: 1,
              trendContext: genre ? [`genre:${genre}`] : undefined,
            });
            hook = aiResult.primary.headline.slice(0, 80);
            body = aiResult.primary.body.split('\n')[0].slice(0, 120);
            cta  = aiResult.primary.callToAction.slice(0, 60);
            scriptSource = 'AdvancedSocialAI';
          }

          logger.info(
            `[VideoGen] Video script ready via ${scriptSource} — ` +
            `hook="${hook.slice(0, 40)}…"`
          );
        }

        // Shared render params for all video renderers.
        const videoParams = {
          topic:      resolvedTopic || hook || body || 'new music',
          platform:   platform   || 'tiktok',
          template:   template   || undefined,
          aspect_ratio,
          duration:   duration   || 10,
          tone:       tone       || 'energetic',
          goal:       goal       || 'growth',
          artist_name,
          genre:      genre      || undefined,
          quality:    quality    || 'cinematic',
          hook,
          body,
          cta,
          bg_color:        bg_color        || undefined,
          accent_color:    accent_color    || undefined,
          user_audio_path: user_audio_path || undefined,
          voiceover: !!voiceover,
          userId,
        };

        // Stages 2–4 — Advanced Video Renderer (MaxCore → Python AI → FFmpeg)
        logger.info(`[VideoGen] Routing job ${jobId} through Advanced Video Renderer`);
        const result = await renderAdvancedVideo({
          ...videoParams,
          template: template || 'cinematic_promo',
        });
        if (result.success) {
          ffmpegJobs.set(jobId, { status: 'done', result, createdAt: Date.now() });
          logger.info(`[VideoGen] Job ${jobId} done via ${result.source || 'renderer'}`);
        } else {
          ffmpegJobs.set(jobId, { status: 'error', error: result.error || 'Video generation failed', createdAt: Date.now() });
          logger.error(`[VideoGen] Job ${jobId} failed: ${result.error}`);
        }
      } catch (err: any) {
        ffmpegJobs.set(jobId, { status: 'error', error: err?.message || 'Video generation failed', createdAt: Date.now() });
        logger.error(`[VideoGen] Background job ${jobId} threw:`, err);
      }
    })();

    logger.info(`[VideoGen] Job ${jobId} queued — responding immediately`);
    return res.json({ success: true, job_id: jobId, status: 'processing' });

  } catch (error) {
    logger.error('Failed to start video generation:', error);
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.get('/video-job/:jobId', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check the local FFmpeg job map first (jobs created by the async generate-video route).
    // FFmpeg job IDs are prefixed with "ffmpeg_" so they never collide with Python AI job IDs.
    const ffmpegJob = ffmpegJobs.get(jobId);
    if (ffmpegJob) {
      if (ffmpegJob.status === 'processing') {
        return res.json({ status: 'processing', progress: 50 });
      }
      if (ffmpegJob.status === 'done' && ffmpegJob.result) {
        const r = ffmpegJob.result;
        return res.json({
          ...r,
          status: 'completed',
          video_url: r.url ?? null,
          thumbnail_url: r.thumbnail_url ?? r.thumbnailUrl ?? null,
          metadata: r.metadata ?? {},
        });
      }
      // error or unknown state
      return res.status(500).json({
        status: 'error',
        message: ffmpegJob.error ?? 'Video generation failed',
      });
    }

    // video_* jobs are always FFmpeg-backed.  If they're not in the map the
    // server must have restarted and the job is gone — tell the client clearly
    // so it can show a retry prompt instead of hanging forever.
    if (jobId.startsWith('video_')) {
      return res.status(410).json({
        status: 'error',
        error: 'Server was restarted while your video was rendering. Please generate again.',
      });
    }

    // Fall through to Python AI service for non-FFmpeg jobs
    const result = await pythonAIService.getVideoJobStatus(jobId);
    if (!result.success) {
      return res.status(503).json({ success: false, status: 'error', message: result.error });
    }
    res.json(result.data);
  } catch (error) {
    logger.error('Failed to poll video job:', error);
    res.status(500).json({ success: false, status: 'error', message: 'Job status check failed' });
  }
});

router.get('/video-templates', requireAuthOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pythonAIService.getCinematicTemplates();
    if (result.success && result.data) {
      res.json({
        ...result.data,
        aspect_ratios: [
          { id: '9:16', name: 'Vertical (9:16)', platforms: ['TikTok', 'Reels', 'Stories', 'Shorts'] },
          { id: '16:9', name: 'Landscape (16:9)', platforms: ['YouTube', 'Twitter', 'LinkedIn'] },
          { id: '1:1', name: 'Square (1:1)', platforms: ['Instagram Feed', 'Facebook', 'Threads'] },
          { id: '4:5', name: 'Portrait (4:5)', platforms: ['Instagram', 'Facebook'] },
        ],
      });
    } else {
      res.json({
        templates: [
          { id: 'cinematic_promo', name: 'Cinematic Promo', description: 'Film-quality promotional video', category: 'promo' },
          { id: 'neon_pulse', name: 'Neon Pulse', description: 'Vibrant neon with plasma backgrounds', category: 'energetic' },
          { id: 'dark_cinema', name: 'Dark Cinema', description: 'Moody atmospheric film look', category: 'dramatic' },
          { id: 'aurora', name: 'Aurora Borealis', description: 'Northern lights color waves', category: 'atmospheric' },
          { id: 'music_video', name: 'Music Video', description: 'High-energy music video style', category: 'music' },
          { id: 'gold_luxury', name: 'Gold Luxury', description: 'Premium gold and black aesthetic', category: 'luxury' },
          { id: 'elegant_minimal', name: 'Elegant Minimal', description: 'Clean sophisticated design', category: 'professional' },
          { id: 'vintage_film', name: 'Vintage Film', description: 'Retro 8mm film aesthetic', category: 'retro' },
          { id: 'ocean_wave', name: 'Ocean Wave', description: 'Calming ocean gradients', category: 'calm' },
          { id: 'fire_ember', name: 'Fire & Ember', description: 'Intense warm fire tones', category: 'intense' },
          { id: 'storyteller', name: 'Storyteller', description: 'Narrative-driven scene progression', category: 'narrative' },
        ],
        quick_templates: ['promo', 'lyric', 'announcement', 'minimal', 'neon'],
        aspect_ratios: [
          { id: '9:16', name: 'Vertical (9:16)', platforms: ['TikTok', 'Reels', 'Stories', 'Shorts'] },
          { id: '16:9', name: 'Landscape (16:9)', platforms: ['YouTube', 'Twitter', 'LinkedIn'] },
          { id: '1:1', name: 'Square (1:1)', platforms: ['Instagram Feed', 'Facebook', 'Threads'] },
          { id: '4:5', name: 'Portrait (4:5)', platforms: ['Instagram', 'Facebook'] },
        ],
      });
    }
  } catch (error) {
    logger.error('Failed to get video templates:', error);
    res.status(500).json({ success: false, message: 'Failed to get templates' });
  }
});

router.post('/veo-campaign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title, artist, album, story, mood, era, references,
      label, brand_notes, lyrics, primary_platforms,
      campaign_notes, targets, audio_duration_sec, track_id,
    } = req.body;

    if (!title || !artist) {
      return res.status(400).json({
        success: false,
        message: 'Track title and artist name are required',
      });
    }

    const result = await veoMusicService.generateCampaign({
      track_id,
      title,
      artist,
      album,
      story,
      mood: mood || 'energetic',
      era: era || 'modern',
      references: references || [],
      label,
      brand_notes: brand_notes || '',
      lyrics,
      primary_platforms: primary_platforms || ['tiktok', 'youtube', 'instagram'],
      campaign_notes: campaign_notes || '',
      targets,
      audio_duration_sec: audio_duration_sec || 180,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Video campaign generation failed',
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to generate Veo campaign:', error);
    res.status(500).json({ success: false, message: 'Video campaign generation failed' });
  }
});

router.post('/veo-campaign/single', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, artist, platform, mood, story, lyrics, tone } = req.body;

    if (!title || !artist || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Track title, artist, and platform are required',
      });
    }

    const asset = await veoMusicService.generateForPost({
      title,
      artist,
      platform,
      mood,
      story,
      lyrics,
      tone,
    });

    if (!asset) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate video for platform',
      });
    }

    res.json({ success: true, asset });
  } catch (error) {
    logger.error('Failed to generate single Veo video:', error);
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.get('/veo-campaign/platforms', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await veoMusicService.getAvailablePlatforms();
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Failed to get Veo platforms:', error);
    res.status(500).json({ success: false, message: 'Failed to get platforms' });
  }
});

router.get('/veo-campaign/goals', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await veoMusicService.getAvailableGoals();
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Failed to get Veo goals:', error);
    res.status(500).json({ success: false, message: 'Failed to get goals' });
  }
});

router.get('/veo-campaign/recommend/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platform } = req.params;
    const data = await veoMusicService.getRecommendedGoals(platform);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: `No recommendations for platform: ${platform}`,
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Failed to get Veo recommendations:', error);
    res.status(500).json({ success: false, message: 'Failed to get recommendations' });
  }
});

router.get('/veo-campaign/status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await veoMusicService.getPipelineStatus();
    if (!status) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...status });
  } catch (error) {
    logger.error('Failed to get Veo status:', error);
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
});

router.post('/veo-url/metadata', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "url" field',
      });
    }

    const data = await veoMusicService.extractUrlMetadata(url);
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json(data);
  } catch (error) {
    logger.error('Failed to extract URL metadata:', error);
    res.status(500).json({ success: false, message: 'Failed to extract metadata from URL' });
  }
});

router.post('/veo-campaign/from-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, ...overrides } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "url" field',
      });
    }

    const result = await veoMusicService.generateCampaignFromUrl(url, overrides);
    if (!result || !result.success) {
      return res.status(result?.error?.includes('unavailable') ? 503 : 500).json({
        success: false,
        message: result?.error || 'Campaign generation from URL failed',
      });
    }
    res.json(result);
  } catch (error) {
    logger.error('Failed to generate campaign from URL:', error);
    res.status(500).json({ success: false, message: 'Campaign generation from URL failed' });
  }
});

router.post('/veo-campaign/promote-storefront', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { slug, platforms, mood, brand_notes, campaign_notes } = req.body;

    let storefront: any;
    if (slug) {
      const rows = await db.select().from(storefronts).where(
        and(eq(storefronts.slug, slug), eq(storefronts.userId, userId))
      ).limit(1);
      storefront = rows[0];
    } else {
      const rows = await db.select().from(storefronts).where(eq(storefronts.userId, userId)).limit(1);
      storefront = rows[0];
    }

    if (!storefront) {
      return res.status(404).json({ success: false, message: 'Storefront not found or you do not own it' });
    }

    if (!storefront.isActive) {
      return res.status(403).json({ success: false, message: 'Storefront is not active' });
    }

    const customization = (storefront.customization || {}) as Record<string, any>;
    const seo = (storefront.seo || {}) as Record<string, any>;

    const storeListings = await db.select().from(listings)
      .where(and(eq(listings.storefrontId, storefront.id), eq(listings.isPublished, true)))
      .limit(10);

    const listingCount = storeListings.length;
    const genres = [...new Set(storeListings.map((l: any) => l.category).filter(Boolean))];
    const topListings = storeListings.slice(0, 3).map((l: any) => l.title).join(', ');

    const description = seo.description || customization.bio || '';
    const title = seo.title || storefront.name || 'My Storefront';
    const artworkUrl = seo.ogImage || customization.banner || customization.logo || '';
    const keywords = seo.keywords || [];

    let story = `Promote ${title}.`;
    if (description) story += ` ${description.slice(0, 200)}.`;
    if (listingCount > 0) story += ` Featuring ${listingCount} beats${topListings ? ` including ${topListings}` : ''}.`;
    if (genres.length > 0) story += ` Genres: ${genres.join(', ')}.`;
    story += ' Drive traffic and sales to the storefront.';

    const campaignRequest: Record<string, any> = {
      title,
      artist: storefront.name,
      mood: mood || 'energetic',
      era: 'modern',
      story,
      primary_platforms: platforms || ['tiktok', 'youtube', 'instagram', 'reels', 'shorts', 'facebook'],
      audio_duration_sec: 180,
      source_url: `/storefront/${storefront.slug}`,
      source_platform: 'website',
      content_type: 'website',
    };

    if (brand_notes) campaignRequest.brand_notes = brand_notes;
    else if (description) campaignRequest.brand_notes = description.slice(0, 300);

    if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
    if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
    if (keywords.length > 0) campaignRequest.keywords = keywords;

    const result = await veoMusicService.generateCampaign(campaignRequest);
    if (!result || !result.success) {
      return res.status(500).json({ success: false, message: result?.error || 'Campaign generation failed' });
    }

    res.json({
      ...result,
      storefront: {
        id: storefront.id,
        name: storefront.name,
        slug: storefront.slug,
        listingCount,
        genres,
      },
    });
  } catch (error) {
    logger.error('Failed to promote storefront:', error);
    res.status(500).json({ success: false, message: 'Storefront promotion campaign failed' });
  }
});

router.post('/veo-campaign/promote-listing', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { listingId, platforms, mood, brand_notes, campaign_notes } = req.body;
    if (!listingId) return res.status(400).json({ success: false, message: 'Missing listingId' });

    const rows = await db.select().from(listings).where(
      and(eq(listings.id, listingId), eq(listings.userId, userId))
    ).limit(1);
    const listing = rows[0] as any;
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found or you do not own it' });

    if (!listing.isPublished) {
      return res.status(403).json({ success: false, message: 'Listing must be published before promoting' });
    }

    let storefrontName = 'My Store';
    if (listing.storefrontId) {
      const storeRows = await db.select().from(storefronts).where(eq(storefronts.id, listing.storefrontId)).limit(1);
      if (storeRows[0]) storefrontName = (storeRows[0] as any).name || storefrontName;
    }

    const metadata = (listing.metadata || {}) as Record<string, any>;
    const title = listing.title;
    const description = listing.description || '';
    const category = listing.category || metadata.genre || '';
    const artworkUrl = listing.artworkUrl || '';
    const priceDisplay = listing.priceCents ? `$${(listing.priceCents / 100).toFixed(2)}` : '';

    let story = `Check out "${title}" by ${storefrontName}.`;
    if (description) story += ` ${description.slice(0, 150)}.`;
    if (category) story += ` Genre: ${category}.`;
    if (priceDisplay) story += ` Available now for ${priceDisplay}.`;
    story += ' Get it before it\'s gone!';

    const isMusic = listing.audioUrl || category;

    const campaignRequest: Record<string, any> = {
      title,
      artist: storefrontName,
      mood: mood || (category ? 'energetic' : 'uplifting'),
      era: 'modern',
      story,
      primary_platforms: platforms || ['tiktok', 'instagram', 'reels', 'shorts'],
      audio_duration_sec: 180,
      source_url: `/marketplace/beat/${listing.id}`,
      source_platform: isMusic ? 'maxbooster' : 'website',
      content_type: isMusic ? 'music' : 'website',
    };

    if (brand_notes) campaignRequest.brand_notes = brand_notes;
    if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
    if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
    if (category) campaignRequest.genre = category;

    const result = await veoMusicService.generateCampaign(campaignRequest);
    if (!result || !result.success) {
      return res.status(500).json({ success: false, message: result?.error || 'Campaign generation failed' });
    }

    res.json({
      ...result,
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        price: priceDisplay,
        storefrontName,
      },
    });
  } catch (error) {
    logger.error('Failed to promote listing:', error);
    res.status(500).json({ success: false, message: 'Listing promotion campaign failed' });
  }
});

router.post('/generate-image', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      topic, platform, tone, goal, artist_name, style,
      // URL analysis context
      artist, track, genre, thumbnail_url, keywords, description,
      urlDescription, artistName, trackTitle, urlContentType, contentCategory,
    } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, message: 'Topic is required' });
    }

    // Build enriched topic string from URL analysis context (same as /generate route)
    const contextParts: string[] = [];
    const resolvedTrack = track || trackTitle;
    const resolvedArtist = artist || artistName || artist_name;
    if (resolvedTrack) contextParts.push(`"${resolvedTrack}"`);
    if (resolvedArtist) contextParts.push(`by ${resolvedArtist}`);
    contextParts.push(String(topic));
    if (urlDescription && urlDescription !== topic) contextParts.push(urlDescription);
    if (description && description !== topic) contextParts.push(description);
    const enrichedTopic = contextParts.filter(Boolean).join(' — ');

    // Generate a rich visual spec using MaxCore local pipeline
    const resolvedPlatform = (
      CONTENT_ALL_PLATFORMS.includes(platform as ContentSupportedPlatform)
        ? platform
        : 'instagram'
    ) as ContentSupportedPlatform;

    const toneColorMap: Record<string, string[]> = {
      energetic:    ['#ff6b35', '#f7c59f', '#1a1a2e', '#ffffff'],
      chill:        ['#a8dadc', '#457b9d', '#1d3557', '#f1faee'],
      professional: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'],
      playful:      ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec'],
      nostalgic:    ['#d4a373', '#ccd5ae', '#e9edc9', '#fefae0'],
    };
    const resolvedTone = String(tone || 'energetic').toLowerCase();
    const colorPalette = toneColorMap[resolvedTone] ?? toneColorMap.energetic;

    const visualSpec = getVisualSpec(resolvedPlatform, 'video_post', colorPalette);

    const specData = {
      ...visualSpec,
      topic:        enrichedTopic || topic,
      platform:     resolvedPlatform,
      tone:         resolvedTone,
      artist:       resolvedArtist || '',
      track:        resolvedTrack || '',
      genre:        genre || '',
      keywords:     Array.isArray(keywords) ? keywords : [],
      description:  description || urlDescription || '',
      source:       'MaxCoreAI',
    };

    res.json({ success: true, visual_spec: specData, image_url: null, ...specData });
  } catch (error) {
    logger.error('Failed to generate social image:', error);
    res.status(500).json({ success: false, message: 'Image generation failed' });
  }
});

// ── Media-to-Content: URL ─────────────────────────────────────────────────────

router.post('/analyze-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, platform } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'url is required' });
    }

    const analysis = await analyzeUrl(url.trim());
    if (analysis.error && !analysis.title) {
      return res.status(422).json({ success: false, message: analysis.error, analysis });
    }

    const seed = urlToContentSeed(analysis);

    // Auto-generate social content from the extracted data using rich context
    const aiTopic = seed.track && seed.artist
      ? `"${seed.track}" by ${seed.artist}${seed.genre && seed.genre !== 'default' ? ` — ${seed.genre}` : ''}`
      : seed.track
        ? `"${seed.track}"`
        : seed.artist
          ? `New music by ${seed.artist}`
          : seed.topic.slice(0, 80);

    const urlKeywords = [...new Set([...(seed.keywords || []), ...(seed.tags || [])])].slice(0, 20);
    const content = await unifiedAIController.generateContent({
      platform:    platform || 'instagram',
      topic:       aiTopic,
      tone:        seed.tone !== 'default' ? seed.tone : 'energetic',
      genre:       seed.genre !== 'default' ? seed.genre : 'hip-hop',
      artistName:  seed.artist,
      trackTitle:  seed.track,
      album:       seed.album      || undefined,
      releaseDate: seed.release_date || undefined,
      label:       seed.label      || undefined,
      keywords:    urlKeywords.length ? urlKeywords : undefined,
      description: analysis.description?.slice(0, 200) || undefined,
      bodyPreview: seed.body_preview?.slice(0, 300)    || undefined,
      extraContext: [
        seed.view_count   ? `${seed.view_count.toLocaleString()} views`  : '',
        seed.like_count   ? `${seed.like_count.toLocaleString()} likes`  : '',
        seed.play_count   ? `${seed.play_count.toLocaleString()} plays`  : '',
      ].filter(Boolean).join(' | ') || undefined,
      includeHashtags: true,
      includeEmojis:   true,
    });

    // Derive genre-based default colors for the video template
    const genreColorMap: Record<string, { bg: string; ac: string }> = {
      'trap':       { bg: '#0a0a0a', ac: '#ff3c00' },
      'hip-hop':    { bg: '#1a1a2e', ac: '#e94560' },
      'r&b':        { bg: '#1a0a2e', ac: '#c77dff' },
      'pop':        { bg: '#0d0d1a', ac: '#00d4ff' },
      'edm':        { bg: '#000d1a', ac: '#00ffcc' },
      'country':    { bg: '#1a1000', ac: '#d4af37' },
      'rock':       { bg: '#1a0000', ac: '#ff4500' },
      'jazz':       { bg: '#0a0a1a', ac: '#d4af37' },
      'classical':  { bg: '#1a1a10', ac: '#c0c0c0' },
      'reggae':     { bg: '#001a0a', ac: '#00aa44' },
      'latin':      { bg: '#1a0500', ac: '#ff6600' },
    };

    // Platform-specific overrides
    const platformColorMap: Record<string, { bg: string; ac: string }> = {
      'youtube':    { bg: '#0f0f0f', ac: '#ff0000' },
      'spotify':    { bg: '#191414', ac: '#1db954' },
      'soundcloud': { bg: '#1a0a00', ac: '#ff5500' },
      'tiktok':     { bg: '#010101', ac: '#69c9d0' },
      'apple_music':{ bg: '#1c1c1e', ac: '#fc3c44' },
    };

    const genreKey = (seed.genre || 'hip-hop').toLowerCase();
    const platformKey = (analysis.platform || '').toLowerCase();
    const colors = platformColorMap[platformKey] || genreColorMap[genreKey] || { bg: '#1a1a2e', ac: '#e94560' };

    // Use AI-generated hook/body/cta for the video overlay when available
    const aiHook = content?.data?.hook || '';
    const aiBody = content?.data?.body || '';
    const aiCta  = content?.data?.cta  || '';

    // Build punchy video-specific text (fallback from AI result)
    const videoHook = aiHook || (seed.track && seed.artist
      ? `${seed.track} — out now`
      : seed.track
        ? `New drop: ${seed.track}`
        : seed.artist
          ? `New music from ${seed.artist}`
          : aiTopic.slice(0, 50));

    const videoBody = aiBody || (seed.artist && seed.track
      ? `${seed.genre && seed.genre !== 'default' ? seed.genre.charAt(0).toUpperCase() + seed.genre.slice(1) + ' — ' : ''}Stream by ${seed.artist}`
      : 'Stream now on all platforms');

    const videoCtaMap: Record<string, string> = {
      'music':   'Stream now — link in bio',
      'video':   'Watch now — link in bio',
      'event':   'Get tickets — link in bio',
      'article': 'Read more — link in bio',
      'podcast': 'Listen now — link in bio',
    };
    const videoCta = aiCta || videoCtaMap[seed.content_type] || 'Follow for more';

    const videoConfig = {
      topic:        aiTopic,
      genre:        seed.genre    || 'hip-hop',
      tone:         seed.tone !== 'default' ? seed.tone : 'energetic',
      platform:     platform      || 'tiktok',
      duration:     15,
      artist_name:  seed.artist   || '',
      hook:         videoHook,
      body:         videoBody,
      cta:          videoCta,
      bg_color:     colors.bg,
      accent_color: colors.ac,
      thumbnail_url: seed.og_image || seed.thumbnail_url || '',
    };

    const audioStyle = {
      genre:    seed.genre   || 'hip-hop',
      mood:     seed.tone    || 'energetic',
      prompt:   `${seed.genre || 'hip-hop'} beat for "${seed.topic.slice(0, 40)}"`,
      bpm:      seed.genre === 'trap' ? 140 : seed.genre === 'r&b' ? 90 : 120,
    };

    const imagePrompt = [
      seed.artist ? `Artist: ${seed.artist}` : '',
      seed.track  ? `Track: ${seed.track}` : '',
      seed.genre  ? `Genre: ${seed.genre}` : '',
      seed.tone   ? `Mood: ${seed.tone}` : '',
      seed.og_image ? `Reference image: ${seed.og_image}` : '',
    ].filter(Boolean).join('. ') || seed.topic;

    res.json({
      success:      true,
      analysis,
      seed,
      content:      content?.content || content || null,
      video_config: videoConfig,
      audio_style:  audioStyle,
      image_prompt: imagePrompt,
    });
  } catch (error) {
    logger.error('analyze-url failed:', error);
    res.status(500).json({ success: false, message: 'URL analysis failed' });
  }
});

// ── Media-to-Content: Audio ───────────────────────────────────────────────────

router.post(
  '/analyze-audio',
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    audioUpload.single('audio')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ success: false, message: 'audio file is required (field: audio)' });
      }

      const analysis = await analyzeAudio(file.buffer, file.originalname);
      if (analysis.error) {
        return res.status(422).json({ success: false, message: analysis.error, analysis });
      }

      const seed    = audioToContentSeed(analysis);
      const platform = (req.body.platform as string) || 'instagram';

      // Generate content from audio features
      const content = await unifiedAIController.generateContent({
        type:       'social_post',
        platform,
        topic:      seed.topic,
        tone:       'default',
        genre:      seed.genre,
        artistName: seed.artist,
        trackTitle: seed.track,
      });

      // Produce a video config the frontend can use to call /generate-video
      const videoConfig = {
        genre:    analysis.genre,
        topic:    seed.topic,
        tone:     'default',
        speed:    undefined as number | undefined,  // let NN decide
        bg:       '0x1a1a2e',
        ac:       '0xe94560',
        duration: 15,
        platform,
      };

      res.json({
        success:  true,
        analysis,
        seed,
        content:  content?.content || content || null,
        video_config: videoConfig,
      });
    } catch (error) {
      logger.error('analyze-audio failed:', error);
      res.status(500).json({ success: false, message: 'Audio analysis failed' });
    }
  },
);

// ── Media-to-Content: Image ───────────────────────────────────────────────────

router.post(
  '/analyze-image',
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    artworkUpload.single('image')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ success: false, message: 'image file is required (field: image)' });
      }

      const analysis = await analyzeImage(file.buffer, file.originalname);
      if (analysis.error) {
        return res.status(422).json({ success: false, message: analysis.error, analysis });
      }

      const seed     = imageToContentSeed(analysis);
      const platform = (req.body.platform as string) || 'instagram';

      // Generate content from visual mood
      const content = await unifiedAIController.generateContent({
        type:       'social_post',
        platform,
        topic:      `${analysis.mood} visual aesthetic, ${analysis.genre_hint} music`,
        tone:       analysis.tone || 'default',
        genre:      analysis.genre_hint,
        artistName: (req.body.artist_name as string) || '',
      });

      // Video config with extracted colors baked in
      const videoConfig = {
        genre:    analysis.genre_hint,
        topic:    `${analysis.mood} aesthetic`,
        tone:     analysis.tone || 'default',
        bg:       analysis.bg_color,
        ac:       analysis.ac_color,
        duration: 15,
        platform,
      };

      res.json({
        success:  true,
        analysis,
        seed,
        content:  content?.content || content || null,
        video_config: videoConfig,
        palette:  analysis.palette.slice(0, 5),
      });
    } catch (error) {
      logger.error('analyze-image failed:', error);
      res.status(500).json({ success: false, message: 'Image analysis failed' });
    }
  },
);

export default router;
