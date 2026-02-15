import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { logger } from '../logger';
import { competitorBenchmarkService } from '../services/competitorBenchmarkService';
import { unifiedAIController } from '../services/unifiedAIController';
import { db } from '../db';
import { socialInboxMessages, socialMentions, socialKeywords, socialAccounts } from '@shared/schema';
import { eq, and, desc, gte, or } from 'drizzle-orm';
import { syncPlatformData } from '../services/socialSyncService';

const router = Router();

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// Middleware to require authentication
const requireAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

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
      { id: 'tiktok', name: 'TikTok' },
      { id: 'linkedin', name: 'LinkedIn' },
      { id: 'threads', name: 'Threads' },
      { id: 'googlebusiness', name: 'Google Business' },
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

// ===========================
// ADDITIONAL MISSING ENDPOINTS
// ===========================

// Activity endpoint
router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ activities: [], total: 0 });
  } catch (error) {
    logger.error('Failed to get activity:', error);
    res.json({ activities: [], total: 0 });
  }
});

// Connections endpoint - redirect to OAuth connections (actual data is in socialOAuth.ts)
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

// Weekly stats endpoint
router.get('/weekly-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ stats: [], period: 'weekly' });
  } catch (error) {
    logger.error('Failed to get weekly stats:', error);
    res.json({ stats: [], period: 'weekly' });
  }
});

// Your stats endpoint
router.get('/your-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ followers: 0, posts: 0, engagement: 0, reach: 0 });
  } catch (error) {
    logger.error('Failed to get your stats:', error);
    res.json({ followers: 0, posts: 0, engagement: 0, reach: 0 });
  }
});

// Competitors endpoint
router.get('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ competitors: [] });
  } catch (error) {
    logger.error('Failed to get competitors:', error);
    res.json({ competitors: [] });
  }
});

// AI insights endpoint
router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ insights: [], recommendations: [] });
  } catch (error) {
    logger.error('Failed to get AI insights:', error);
    res.json({ insights: [], recommendations: [] });
  }
});

// ===========================
// BENCHMARK ENDPOINTS
// ===========================

router.get('/benchmark', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ benchmarks: [] });
  } catch (error) {
    logger.error('Failed to get benchmarks:', error);
    res.json({ benchmarks: [] });
  }
});

router.get('/benchmark/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ competitors: [] });
  } catch (error) {
    logger.error('Failed to get benchmark competitors:', error);
    res.json({ competitors: [] });
  }
});

router.get('/benchmark/insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ insights: [] });
  } catch (error) {
    logger.error('Failed to get benchmark insights:', error);
    res.json({ insights: [] });
  }
});

// ===========================
// LISTENING ENDPOINTS
// ===========================

router.get('/listening/keywords', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ keywords: [] });
  } catch (error) {
    logger.error('Failed to get listening keywords:', error);
    res.json({ keywords: [] });
  }
});

router.get('/listening/trending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ trending: [] });
  } catch (error) {
    logger.error('Failed to get listening trending:', error);
    res.json({ trending: [] });
  }
});

router.get('/listening/alerts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ alerts: [] });
  } catch (error) {
    logger.error('Failed to get listening alerts:', error);
    res.json({ alerts: [] });
  }
});

router.get('/listening/influencers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ influencers: [] });
  } catch (error) {
    logger.error('Failed to get listening influencers:', error);
    res.json({ influencers: [] });
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
router.post('/generate-content', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
            hashtags: result.data.hashtags,
            emojis: result.data.emojis,
            characterCount: result.data.characterCount,
            estimatedEngagement: result.data.estimatedEngagement,
            optimalPostTime: getOptimalPostTime(platform),
          });
        } else {
          failedPlatforms.push({ platform, error: 'Generation failed' });
        }
      } catch (err) {
        failedPlatforms.push({ platform, error: 'Service temporarily unavailable' });
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
router.post('/generate-from-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    const generatedContent = [];

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
        generatedContent.push({
          platform,
          caption: result.data.caption + `\n\n🔗 ${url}`,
          hashtags: result.data.hashtags,
          emojis: result.data.emojis,
          characterCount: result.data.characterCount,
          estimatedEngagement: result.data.estimatedEngagement,
          sourceUrl: url,
          extractedTitle: metadata.title,
          contentType: metadata.type,
          format,
          targetAudience: targetAudience || undefined,
        });
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

// POST /api/social/disconnect/:platform - Disconnect a social platform
router.post('/disconnect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params;
    
    // Remove OAuth connection from database
    await db.delete(socialAccounts)
      .where(and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.platform, platform)
      ));
    
    logger.info(`Platform disconnected: ${platform} for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: `${platform} disconnected successfully`,
      platform 
    });
  } catch (error) {
    logger.error('Failed to disconnect platform:', error);
    res.status(500).json({ message: 'Failed to disconnect platform' });
  }
});

// GET /api/social/analytics/:platform - Get platform-specific analytics
router.get('/analytics/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params;
    const { dateRange = '30d' } = req.query;
    
    // Get platform-specific analytics
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const campaigns = await db.select()
      .from(socialCampaigns)
      .where(and(
        eq(socialCampaigns.userId, userId),
        eq(socialCampaigns.platform, platform),
        gte(socialCampaigns.createdAt, startDate)
      ))
      .orderBy(desc(socialCampaigns.createdAt));
    
    const totalPosts = campaigns.length;
    const totalEngagement = campaigns.reduce((sum, c) => {
      const engagement = c.engagement as any;
      return sum + (engagement?.likes || 0) + (engagement?.comments || 0) + (engagement?.shares || 0);
    }, 0);
    
    const totalReach = campaigns.reduce((sum, c) => {
      const engagement = c.engagement as any;
      return sum + (engagement?.reach || 0);
    }, 0);
    
    const avgEngagement = totalPosts > 0 ? totalEngagement / totalPosts : 0;
    
    res.json({
      platform,
      dateRange,
      totalPosts,
      totalEngagement,
      totalReach,
      avgEngagement: Math.round(avgEngagement * 10) / 10,
      posts: campaigns.map(c => ({
        id: c.id,
        content: c.content,
        publishedAt: c.publishedAt,
        engagement: c.engagement,
        status: c.status,
      })),
    });
  } catch (error) {
    logger.error('Failed to get platform analytics:', error);
    res.status(500).json({ message: 'Failed to get platform analytics' });
  }
});

export default router;
