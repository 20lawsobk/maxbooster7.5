import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { careerCoachService } from '../services/careerCoachService';
import { logger } from '../logger';
import { z } from 'zod';

const router = Router();

const createGoalSchema = z.object({
  goalType: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  targetValue: z.number().positive(),
  unit: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

router.get('/recommendations', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Fetching career coach recommendations for user ${userId}`);

  let recommendations = await careerCoachService.getActiveRecommendations(userId);
  
  if (recommendations.length === 0) {
    recommendations = await careerCoachService.generateDailyRecommendations(userId);
  }

  res.json({
    success: true,
    data: {
      recommendations,
      dailyTip: recommendations[0] || null,
      totalActive: recommendations.length,
      lastAnalyzed: new Date().toISOString(),
    },
  });
}));

router.post('/dismiss/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const recommendationId = req.params.id;

  logger.info(`Dismissing recommendation ${recommendationId} for user ${userId}`);

  const success = await careerCoachService.dismissRecommendation(userId, recommendationId);

  if (!success) {
    return res.status(404).json({
      success: false,
      message: 'Recommendation not found',
    });
  }

  res.json({
    success: true,
    message: 'Recommendation dismissed',
  });
}));

router.post('/complete/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const recommendationId = req.params.id;

  logger.info(`Completing recommendation ${recommendationId} for user ${userId}`);

  const success = await careerCoachService.completeRecommendation(userId, recommendationId);

  if (!success) {
    return res.status(404).json({
      success: false,
      message: 'Recommendation not found',
    });
  }

  res.json({
    success: true,
    message: 'Recommendation marked as completed',
  });
}));

router.get('/goals', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Fetching career goals for user ${userId}`);

  const goals = await careerCoachService.getGoals(userId);

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  res.json({
    success: true,
    data: {
      goals,
      summary: {
        total: goals.length,
        active: activeGoals.length,
        completed: completedGoals.length,
      },
    },
  });
}));

router.post('/goals', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Creating career goal for user ${userId}`);

  const validation = createGoalSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid goal data',
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { deadline, ...goalData } = validation.data;

  const goal = await careerCoachService.createGoal(userId, {
    ...goalData,
    deadline: deadline ? new Date(deadline) : undefined,
  });

  res.status(201).json({
    success: true,
    data: goal,
  });
}));

router.post('/goals/smart', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { type = 'streams' } = req.body;

  logger.info(`Creating SMART goal (type: ${type}) for user ${userId}`);

  const goal = await careerCoachService.createSmartGoal(userId, type);

  if (!goal) {
    return res.status(400).json({
      success: false,
      message: 'Could not generate goal suggestion',
    });
  }

  res.status(201).json({
    success: true,
    data: goal,
  });
}));

router.patch('/goals/:id/progress', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const goalId = req.params.id;
  const { currentValue } = req.body;

  if (typeof currentValue !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'currentValue must be a number',
    });
  }

  logger.info(`Updating goal ${goalId} progress to ${currentValue} for user ${userId}`);

  const goal = await careerCoachService.updateGoalProgress(userId, goalId, currentValue);

  if (!goal) {
    return res.status(404).json({
      success: false,
      message: 'Goal not found',
    });
  }

  res.json({
    success: true,
    data: goal,
  });
}));

router.get('/analyze', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Analyzing career gaps for user ${userId}`);

  const gaps = await careerCoachService.analyzeCareerGaps(userId);

  res.json({
    success: true,
    data: {
      gaps,
      analyzedAt: new Date().toISOString(),
    },
  });
}));

export default router;
