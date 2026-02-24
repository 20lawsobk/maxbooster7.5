import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { artistProgressService } from '../services/artistProgressService';
import { logger } from '../logger';
import { z } from 'zod';

const router = Router();

const historyQuerySchema = z.object({
  days: z.string().transform(Number).pipe(z.number().min(1).max(365)).optional(),
});

router.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching artist progress dashboard for user ${userId}`);

    const dashboardData = await artistProgressService.getDashboardData(userId);

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error: any) {
    logger.error('Error fetching artist progress dashboard:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}));

router.get('/history', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const { days = '30' } = req.query as { days?: string };

    const parsedQuery = historyQuerySchema.parse({ days });
    const daysCount = parsedQuery.days || 30;

    logger.info(`Fetching progress history for user ${userId}, days=${daysCount}`);

    const history = await artistProgressService.getProgressHistory(userId, daysCount);

    res.json({
      success: true,
      data: history,
      meta: {
        days: daysCount,
        count: history.length,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching progress history:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}));

router.get('/milestones', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching career milestones for user ${userId}`);

    const milestones = await artistProgressService.getCareerMilestones(userId);

    res.json({
      success: true,
      data: milestones,
    });
  } catch (error: any) {
    logger.error('Error fetching career milestones:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}));

router.get('/growth-metrics', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching growth metrics for user ${userId}`);

    const growthMetrics = await artistProgressService.calculateGrowthMetrics(userId);

    res.json({
      success: true,
      data: growthMetrics,
    });
  } catch (error: any) {
    logger.error('Error fetching growth metrics:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}));

router.post('/capture-snapshot', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Manually capturing snapshot for user ${userId}`);

    await artistProgressService.captureSnapshot(userId);

    res.json({
      success: true,
      message: 'Snapshot captured successfully',
    });
  } catch (error: any) {
    logger.error('Error capturing snapshot:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}));

export default router;
