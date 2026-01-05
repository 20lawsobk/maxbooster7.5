import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { revenueForecastService } from '../services/revenueForecastService';
import { logger } from '../logger';
import { z } from 'zod';

const router = Router();

const generateForecastSchema = z.object({
  months: z.number().min(1).max(24).optional().default(12),
});

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Fetching stored forecasts for user ${userId}`);

  const forecasts = await revenueForecastService.getStoredForecasts(userId);

  res.json({
    success: true,
    data: forecasts,
  });
}));

router.get('/projections', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Getting revenue projections for user ${userId}`);

  const projections = await revenueForecastService.getRevenueProjections(userId);

  res.json({
    success: true,
    data: projections,
  });
}));

router.get('/accuracy', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Fetching forecast accuracy for user ${userId}`);

  const accuracy = await revenueForecastService.compareToActual(userId);

  res.json({
    success: true,
    data: accuracy,
  });
}));

router.get('/rate', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  logger.info(`Calculating stream-to-revenue rate for user ${userId}`);

  const rate = await revenueForecastService.calculateStreamToRevenueRate(userId);

  res.json({
    success: true,
    data: {
      rate,
      description: `$${(rate * 1000).toFixed(2)} per 1,000 streams`,
    },
  });
}));

router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { months } = generateForecastSchema.parse(req.body);

  logger.info(`Generating ${months}-month forecast for user ${userId}`);

  const forecast = await revenueForecastService.generateForecast(userId, months);

  res.json({
    success: true,
    data: forecast,
    message: `Successfully generated ${months}-month revenue forecast`,
  });
}));

export default router;
