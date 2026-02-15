import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { autopilotCoordinatorService } from '../services/autopilotCoordinatorService.js';

const router = Router();

const registerPostSchema = z.object({
  autopilotType: z.enum(['social', 'advertising']),
  platform: z.string().min(1),
  scheduledTime: z.string().datetime(),
  content: z.string().optional(),
});

const updatePostSchema = z.object({
  status: z.enum(['scheduled', 'posted', 'failed', 'cancelled']),
  postId: z.string().optional(),
  performance: z.object({
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative(),
    reach: z.number().int().nonnegative(),
    engagementRate: z.number().nonnegative(),
    impressions: z.number().int().nonnegative(),
  }).optional(),
});

const shareInsightSchema = z.object({
  sourceAutopilot: z.enum(['social', 'advertising']),
  insightType: z.enum(['timing', 'content', 'audience', 'platform', 'engagement']),
  data: z.record(z.any()),
});

const scheduleFilterSchema = z.object({
  autopilotType: z.enum(['social', 'advertising']).optional(),
  platform: z.string().optional(),
  status: z.enum(['scheduled', 'posted', 'failed', 'cancelled']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const insightFilterSchema = z.object({
  sourceAutopilot: z.enum(['social', 'advertising']).optional(),
  insightType: z.enum(['timing', 'content', 'audience', 'platform', 'engagement']).optional(),
  limit: z.number().int().positive().optional(),
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = autopilotCoordinatorService.getStatus(userId);
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting coordinator status:', error);
    res.status(500).json({ success: false, error: 'Failed to get coordinator status' });
  }
});

router.get('/schedule', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = scheduleFilterSchema.parse(req.query);
    
    const options: any = {};
    if (parsed.autopilotType) options.autopilotType = parsed.autopilotType;
    if (parsed.platform) options.platform = parsed.platform;
    if (parsed.status) options.status = parsed.status;
    if (parsed.startDate) options.startDate = new Date(parsed.startDate);
    if (parsed.endDate) options.endDate = new Date(parsed.endDate);
    
    const schedule = autopilotCoordinatorService.getCoordinatedSchedule(userId, options);
    
    res.json({
      success: true,
      data: {
        posts: schedule,
        total: schedule.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    logger.error('Error getting coordinated schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to get coordinated schedule' });
  }
});

router.post('/sync', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = autopilotCoordinatorService.syncInsights(userId);
    
    res.json({
      success: true,
      data: {
        socialToAdvertising: result.socialToAdvertising.length,
        advertisingToSocial: result.advertisingToSocial.length,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error syncing insights:', error);
    res.status(500).json({ success: false, error: 'Failed to sync insights' });
  }
});

router.post('/register', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = registerPostSchema.parse(req.body);
    
    const post = autopilotCoordinatorService.registerPost(
      userId,
      parsed.autopilotType,
      parsed.platform,
      new Date(parsed.scheduledTime),
      parsed.content
    );
    
    if (!post) {
      return res.status(409).json({
        success: false,
        error: 'Time slot conflict - posts must be at least 2 hours apart',
      });
    }
    
    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    logger.error('Error registering post:', error);
    res.status(500).json({ success: false, error: 'Failed to register post' });
  }
});

router.put('/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;
    const parsed = updatePostSchema.parse(req.body);
    
    const post = autopilotCoordinatorService.updatePostStatus(
      userId,
      postId,
      parsed.status,
      parsed.postId,
      parsed.performance
    );
    
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    res.json({
      success: true,
      data: post,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    logger.error('Error updating post:', error);
    res.status(500).json({ success: false, error: 'Failed to update post' });
  }
});

router.delete('/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;
    
    const cancelled = autopilotCoordinatorService.cancelPost(userId, postId);
    
    if (!cancelled) {
      return res.status(404).json({ success: false, error: 'Post not found or already processed' });
    }
    
    res.json({
      success: true,
      message: 'Post cancelled successfully',
    });
  } catch (error) {
    logger.error('Error cancelling post:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel post' });
  }
});

router.get('/next-slot', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const autopilotType = (req.query.autopilotType as 'social' | 'advertising') || 'social';
    const platform = (req.query.platform as string) || 'twitter';
    const preferredTime = req.query.preferredTime ? new Date(req.query.preferredTime as string) : undefined;
    
    const slot = autopilotCoordinatorService.getNextAvailableSlot(
      userId,
      autopilotType,
      platform,
      preferredTime
    );
    
    res.json({
      success: true,
      data: slot,
    });
  } catch (error) {
    logger.error('Error getting next slot:', error);
    res.status(500).json({ success: false, error: 'Failed to get next available slot' });
  }
});

router.post('/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = shareInsightSchema.parse(req.body);
    
    const insight = autopilotCoordinatorService.shareInsight(
      userId,
      parsed.sourceAutopilot,
      parsed.insightType,
      parsed.data
    );
    
    res.status(201).json({
      success: true,
      data: insight,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    logger.error('Error sharing insight:', error);
    res.status(500).json({ success: false, error: 'Failed to share insight' });
  }
});

router.get('/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = insightFilterSchema.parse(req.query);
    
    const insights = autopilotCoordinatorService.getSharedInsights(userId, {
      sourceAutopilot: parsed.sourceAutopilot,
      insightType: parsed.insightType,
      limit: parsed.limit,
    });
    
    res.json({
      success: true,
      data: {
        insights,
        total: insights.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    logger.error('Error getting insights:', error);
    res.status(500).json({ success: false, error: 'Failed to get insights' });
  }
});

router.get('/optimal-times/:platform', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params;
    
    const optimalTimes = autopilotCoordinatorService.getOptimalPostingTimes(userId, platform);
    
    res.json({
      success: true,
      data: {
        platform,
        optimalTimes,
      },
    });
  } catch (error) {
    logger.error('Error getting optimal times:', error);
    res.status(500).json({ success: false, error: 'Failed to get optimal posting times' });
  }
});

router.get('/conflicts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date();
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const conflicts = autopilotCoordinatorService.getPostingConflicts(userId, startDate, endDate);
    
    res.json({
      success: true,
      data: {
        conflicts,
        total: conflicts.length,
      },
    });
  } catch (error) {
    logger.error('Error getting conflicts:', error);
    res.status(500).json({ success: false, error: 'Failed to get posting conflicts' });
  }
});

router.get('/performance', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const summary = autopilotCoordinatorService.getPerformanceSummary(userId);
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting performance summary:', error);
    res.status(500).json({ success: false, error: 'Failed to get performance summary' });
  }
});

router.post('/connect', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { autopilotType } = req.body;
    
    if (!autopilotType || !['social', 'advertising'].includes(autopilotType)) {
      return res.status(400).json({ success: false, error: 'Invalid autopilot type' });
    }
    
    autopilotCoordinatorService.connectAutopilot(userId, autopilotType);
    
    res.json({
      success: true,
      message: `${autopilotType} autopilot connected to coordinator`,
    });
  } catch (error) {
    logger.error('Error connecting autopilot:', error);
    res.status(500).json({ success: false, error: 'Failed to connect autopilot' });
  }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { autopilotType } = req.body;
    
    if (!autopilotType || !['social', 'advertising'].includes(autopilotType)) {
      return res.status(400).json({ success: false, error: 'Invalid autopilot type' });
    }
    
    autopilotCoordinatorService.disconnectAutopilot(userId, autopilotType);
    
    res.json({
      success: true,
      message: `${autopilotType} autopilot disconnected from coordinator`,
    });
  } catch (error) {
    logger.error('Error disconnecting autopilot:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect autopilot' });
  }
});

export default router;
