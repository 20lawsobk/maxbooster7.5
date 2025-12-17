import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { logger } from '../logger';

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

// Get platform status - returns empty array when no real data exists
router.get('/platform-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platforms = await storage.getSocialPlatformStatus?.(userId) || [];
    res.json(platforms);
  } catch (error) {
    logger.error('Failed to get platform status:', error);
    res.json([]);
  }
});

// Get inbox messages - returns empty array when no real data exists
router.get('/inbox', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const messages = await storage.getSocialInboxMessages?.(userId) || [];
    res.json(messages);
  } catch (error) {
    logger.error('Failed to get inbox messages:', error);
    res.json([]);
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

// Get competitors - returns empty array when no real data exists
router.get('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await storage.getCompetitors?.(userId) || [];
    res.json(competitors);
  } catch (error) {
    logger.error('Failed to get competitors:', error);
    res.json([]);
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

// Get benchmark competitors - returns empty data when no real data exists
router.get('/benchmark/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await storage.getCompetitors?.(userId) || [];
    const yourBrand = await storage.getUserSocialStats?.(userId) || null;
    res.json({ competitors, yourBrand });
  } catch (error) {
    logger.error('Failed to get benchmark competitors:', error);
    res.json({ competitors: [], yourBrand: null });
  }
});

// Get benchmark insights - returns empty array when no real data exists
router.get('/benchmark/insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getBenchmarkInsights?.(userId) || [];
    res.json(insights);
  } catch (error) {
    logger.error('Failed to get benchmark insights:', error);
    res.json([]);
  }
});

export default router;
