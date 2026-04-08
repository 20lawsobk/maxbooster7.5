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
  try {
    const userId = req.user!.id;

    logger.info(`Fetching stored forecasts for user ${userId}`);

    const forecasts = await revenueForecastService.getStoredForecasts(userId);

    res.json({
      success: true,
      data: forecasts,
    });
  } catch (error: any) {
    logger.warn('Error fetching stored forecasts:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/projections', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Getting revenue projections for user ${userId}`);

    const projections = await revenueForecastService.getRevenueProjections(userId);

    res.json({
      success: true,
      data: projections,
    });
  } catch (error: any) {
    logger.warn('Error getting revenue projections:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/accuracy', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching forecast accuracy for user ${userId}`);

    const accuracy = await revenueForecastService.compareToActual(userId);

    res.json({
      success: true,
      data: accuracy,
    });
  } catch (error: any) {
    logger.warn('Error fetching forecast accuracy:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/rate', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (error: any) {
    logger.warn('Error calculating stream-to-revenue rate:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const { months } = generateForecastSchema.parse(req.body);

    logger.info(`Generating ${months}-month forecast for user ${userId}`);

    const forecast = await revenueForecastService.generateForecast(userId, months);

    res.json({
      success: true,
      data: forecast,
      message: `Successfully generated ${months}-month revenue forecast`,
    });
  } catch (error: any) {
    logger.warn('Error generating forecast:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const deleted = await revenueForecastService.deleteForecastById(userId, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Forecast not found or does not belong to you' });
    }

    res.json({ success: true, message: 'Forecast deleted' });
  } catch (error: any) {
    logger.warn('Error deleting forecast:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

export default router;
