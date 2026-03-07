import { Router, Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { logger } from '../logger';
import { competitorBenchmarkService } from '../services/competitorBenchmarkService';
import { unifiedAIController } from '../services/unifiedAIController';
import { pythonAIService } from '../services/pythonAIService';
import { veoMusicService } from '../services/veoMusicService';
import { db } from '../db';
import { socialInboxMessages, socialMentions, socialKeywords, socialAccounts, posts, storefronts, listings } from '@shared/schema';
import { eq, and, desc, gte, or } from 'drizzle-orm';
import { syncPlatformData } from '../services/socialSyncService';
import { requireAuth, requireAuthOnly } from '../middleware/auth.js';
import { notificationService } from '../services/notificationService.js';
import { generateVideo as generateVideoFFmpeg } from '../services/videoGeneratorService.js';
import { audioUpload, artworkUpload } from '../middleware/uploadHandler.js';
import {
  analyzeUrl, analyzeAudio, analyzeImage,
  urlToContentSeed, audioToContentSeed, imageToContentSeed,
} from '../services/mediaAnalyzerService.js';

const router = Router();

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
    res.json([]);
  }
});

router.post('/schedule-post', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, content, mediaUrls, scheduledAt } = req.body;

    if (!platform || !content) {
      return res.status(400).json({ message: 'Platform and content are required' });
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
    res.status(500).json({ message: 'Failed to schedule post' });
  }
});

router.post('/calendar/:postId/publish', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;

    const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
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
    res.status(500).json({ message: 'Failed to publish post' });
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
  }
});

// Get AI insights - returns empty array when no real data exists
router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getSocialAIInsights?.(userId) || [];
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
      .where(eq(socialAccounts.userId, userId));
    
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
      if (conn.isActive && conn.createdAt) {
        const lastSync = new Date(conn.createdAt).getTime();
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
          lastSync: primaryConn?.createdAt?.toISOString() || '',
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
        lastSync: conn?.createdAt?.toISOString() || '',
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
    res.json([]);
  }
});

router.post('/sync-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId));

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
    res.status(500).json({ message: 'Failed to sync all platforms' });
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
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
    res.json([]);
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
    res.json({ yourBrand: { mentions: 0, percentage: 0, reach: 0, sentiment: 0 }, competitors: [], industryTotal: 0 });
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
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

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
      .where(eq(socialInboxMessages.userId, userId));

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
      );

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
    res.json([]);
  } catch (error) {
    logger.error('Failed to get reply templates:', error);
    res.json([]);
  }
});

// Get team members for assignment - returns empty array when no team exists
router.get('/inbox/team', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    logger.error('Failed to get team members:', error);
    res.json([]);
  }
});

// Connections endpoint - returns OAuth connections
router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId));
    
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
    res.json([]);
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

    const pyAvailable = await pythonAIService.isAvailable();

    if (pyAvailable) {
      const pyResult = await pythonAIService.generateMultiPlatform({
        platforms,
        topic: topic || 'music',
        tone: validTones.includes(tone) ? tone : 'energetic',
        goal: 'growth',
      });

      if (pyResult.success && pyResult.data?.generated_content) {
        for (const item of pyResult.data.generated_content) {
          generatedContent.push({
            platform: item.platform,
            caption: item.caption,
            content: item.content,
            hashtags: item.hashtags,
            hook: item.hook,
            body: item.body,
            cta: item.cta,
            optimalPostTime: getOptimalPostTime(item.platform),
            source: 'python_ai_model',
          });
        }
      }
    }

    if (generatedContent.length === 0) {
      for (const platform of platforms) {
        if (!validPlatforms.includes(platform)) continue;

        try {
          const result = await unifiedAIController.generateContent({
            tone: validTones.includes(tone) ? tone : 'energetic',
            platform,
            topic: topic || 'music',
            contentType: contentTypeMap[contentType] || 'engagement',
            includeHashtags: true,
            includeEmojis: true,
          });

          if (result.success && result.data) {
            generatedContent.push({
              platform,
              caption: result.data.caption,
              content: result.data.caption,
              hashtags: result.data.hashtags,
              emojis: result.data.emojis,
              characterCount: result.data.characterCount,
              estimatedEngagement: result.data.estimatedEngagement,
              optimalPostTime: getOptimalPostTime(platform),
              source: 'unified_ai',
            });
          } else {
            failedPlatforms.push({ platform, error: 'Generation failed' });
          }
        } catch (err) {
          failedPlatforms.push({ platform, error: 'Service temporarily unavailable' });
        }
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
      return res.status(400).json({ message: 'URL is required' });
    }

    // Fetch and analyze the URL
    const metadata = await extractUrlMetadata(url);
    
    // Build topic from extracted metadata
    let topic = metadata.title || metadata.description || 'check this out';
    
    // Enhance topic based on content type
    const typeMessages: Record<string, string> = {
      'music': `${topic} - stream now`,
      'video': `${topic} - watch now`,
      'article': `${topic} - read more`,
      'product': `${topic} - shop now`,
      'event': `${topic} - get tickets`,
      'social': `${topic} - follow for more`,
      'website': topic,
      'podcast': `${topic} - listen now`,
      'livestream': `${topic} - tune in live`,
      'crowdfunding': `${topic} - support now`,
      'merch': `${topic} - grab yours`,
      'playlist': `${topic} - add to your library`,
      'nft': `${topic} - collect now`,
      'press': `${topic} - read the feature`,
      'portfolio': `${topic} - explore more`,
      'collaboration': `${topic} - check out our collab`,
      'education': `${topic} - learn more`,
    };
    
    topic = typeMessages[metadata.type] || topic;

    const topicWithAudience = targetAudience 
      ? `${topic} (targeting: ${targetAudience})` 
      : topic;

    const formatPrefix = format !== 'text' ? `[${format.toUpperCase()} content] ` : '';

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];
    const generatedContent: any[] = [];

    const pyAvailable = await pythonAIService.isAvailable();

    if (pyAvailable) {
      const pyResult = await pythonAIService.generateMultiPlatform({
        platforms,
        topic: topicWithAudience.substring(0, 150),
        tone: validTones.includes(tone) ? tone : 'energetic',
        goal: 'growth',
        format,
        url,
        targetAudience: targetAudience || undefined,
      });

      if (pyResult.success && pyResult.data?.generated_content) {
        for (const item of pyResult.data.generated_content) {
          const captionText = item.content.includes(url) ? item.content : item.content + `\n\n🔗 ${url}`;
          generatedContent.push({
            platform: item.platform,
            caption: captionText,
            content: captionText,
            hashtags: item.hashtags,
            hook: item.hook,
            body: item.body,
            cta: item.cta,
            sourceUrl: url,
            extractedTitle: metadata.title,
            contentType: metadata.type,
            format,
            targetAudience: targetAudience || undefined,
            source: 'python_ai_model',
          });
        }
      }
    }

    if (generatedContent.length === 0) {
      for (const platform of platforms) {
        if (!validPlatforms.includes(platform)) continue;

        const result = await unifiedAIController.generateContent({
          tone: validTones.includes(tone) ? tone : 'energetic',
          platform,
          topic: (formatPrefix + topicWithAudience).substring(0, 150),
          contentType: metadata.contentType,
          includeHashtags: true,
          includeEmojis: true,
        });

        if (result.success && result.data) {
          const captionText = result.data.caption + `\n\n🔗 ${url}`;
          generatedContent.push({
            platform,
            caption: captionText,
            content: captionText,
            hashtags: result.data.hashtags,
            emojis: result.data.emojis,
            characterCount: result.data.characterCount,
            estimatedEngagement: result.data.estimatedEngagement,
            sourceUrl: url,
            extractedTitle: metadata.title,
            contentType: metadata.type,
            format,
            targetAudience: targetAudience || undefined,
            source: 'unified_ai',
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
        title: metadata.title,
        description: metadata.description?.substring(0, 200),
        type: metadata.type,
      },
    });
  } catch (error) {
    logger.error('Failed to generate content from URL:', error);
    res.status(500).json({ message: 'Failed to generate content from URL' });
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
    res.json([]);
  }
});

// GET /api/social/analytics - Get social analytics
router.get('/analytics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, period = '30d' } = req.query;
    
    const analytics = {
      period,
      platform: platform || 'all',
      metrics: {
        totalFollowers: 0,
        followersGrowth: 0,
        totalEngagement: 0,
        engagementRate: 0,
        totalReach: 0,
        totalImpressions: 0,
        postsPublished: 0,
        topPerformingPost: null,
      },
      platformBreakdown: [],
      dailyMetrics: [],
      topPosts: [],
    };
    
    res.json(analytics);
  } catch (error) {
    logger.error('Failed to get social analytics:', error);
    res.status(500).json({ message: 'Failed to get analytics' });
  }
});

router.post('/generate-video', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      hook, body, cta, platform, aspect_ratio, template,
      duration, bg_color, text_color, accent_color,
      artist_name, topic, goal, tone, quality,
    } = req.body;

    const pyAvailable = await pythonAIService.isAvailable();

    if (pyAvailable) {
      logger.info('[VideoGen] Python AI service available — starting server-side job');
      const jobResult = await pythonAIService.startVideoJob({
        hook, body, cta, topic,
        platform: platform || 'tiktok',
        aspect_ratio,
        template: template || 'cinematic_promo',
        duration: duration || 10,
        artist_name,
        goal: goal || 'growth',
        tone: tone || 'energetic',
        quality: quality || 'cinematic',
      });

      if (jobResult.success && jobResult.data?.job_id) {
        const jobId = jobResult.data.job_id;
        logger.info(`[VideoGen] Polling job ${jobId} server-side (avoids multi-replica routing)`);
        const maxAttempts = 90;
        let jobFailed = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusResult = await pythonAIService.getVideoJobStatus(jobId);
          if (statusResult.success && statusResult.data) {
            const d = statusResult.data;
            if (d.status === 'done' && d.success && d.url) {
              logger.info(`[VideoGen] Python job done in ~${(attempt + 1) * 2}s`);
              return res.json(d);
            }
            if (d.status === 'error') {
              logger.warn('[VideoGen] Python job failed, falling back to FFmpeg:', d.error);
              jobFailed = true;
              break;
            }
          }
        }
        if (!jobFailed) {
          logger.warn('[VideoGen] Python job timed out server-side, falling back to FFmpeg');
        }
      }
    }

    logger.info('[VideoGen] Using synchronous FFmpeg generator');
    const result = await generateVideoFFmpeg({
      topic: topic || hook || body || 'new music',
      platform: platform || 'tiktok',
      template: template || 'cinematic_promo',
      aspect_ratio,
      duration: duration || 10,
      tone: tone || 'energetic',
      goal: goal || 'growth',
      artist_name,
      quality: quality || 'cinematic',
      hook,
      body,
      cta,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Video generation failed' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to generate video:', error);
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.get('/video-job/:jobId', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;
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

    // Generate a rich visual spec from URL context
    const specResult = await pythonAIService.generateVisualSpec({
      topic:         enrichedTopic || topic,
      platform:      platform || 'instagram',
      tone:          tone || 'energetic',
      artist:        resolvedArtist || '',
      track:         resolvedTrack || '',
      genre:         genre || '',
      thumbnail_url: thumbnail_url || '',
      keywords:      Array.isArray(keywords) ? keywords : [],
      description:   description || urlDescription || '',
    });

    if (!specResult.success) {
      return res.status(500).json({
        success: false,
        message: specResult.error || 'Visual spec generation failed',
      });
    }

    res.json({ success: true, visual_spec: specResult.data, image_url: null, ...specResult.data });
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

    // Auto-generate social content from the extracted data
    const content = await unifiedAIController.generateContent({
      type:       'social_post',
      platform:   platform || 'instagram',
      topic:      seed.topic,
      tone:       seed.tone || 'default',
      genre:      seed.genre,
      artistName: seed.artist,
      trackTitle: seed.track,
    });

    const videoConfig = {
      topic:    seed.topic,
      genre:    seed.genre || 'hip-hop',
      tone:     seed.tone  || 'energetic',
      platform: platform   || 'tiktok',
      duration: 15,
      artist_name: seed.artist || '',
      hook:     seed.track
        ? `${seed.track}${seed.artist ? ` — ${seed.artist}` : ''}`
        : seed.topic.slice(0, 60),
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
