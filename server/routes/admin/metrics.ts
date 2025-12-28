/**
 * Admin Metrics Routes
 * 
 * System metrics and monitoring endpoints for admin dashboard.
 */

import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { metricsService } from '../../services/metricsService.js';
import { emailTrackingService } from '../../services/emailTrackingService.js';
import { logger } from '../../logger.js';

const router = Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

/**
 * Get system metrics for a time period
 */
router.get('/metrics', async (req, res) => {
  try {
    const { metric, period = '24', source } = req.query;

    if (!metric) {
      return res.status(400).json({ error: 'Metric name required' });
    }

    const hours = parseInt(period as string);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const metrics = await metricsService.getMetrics(
      metric as string,
      startTime,
      endTime,
      source as string | undefined
    );

    res.json({ metrics });
  } catch (error: unknown) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * Record a test metric
 */
router.post('/metrics/test', async (req, res) => {
  try {
    const { metricName, value, source, tags } = req.body;

    if (!metricName || value === undefined) {
      return res.status(400).json({ error: 'metricName and value required' });
    }

    await metricsService.recordMetric(metricName, value, source, tags);

    res.json({ success: true, message: 'Test metric recorded' });
  } catch (error: unknown) {
    logger.error('Error recording test metric:', error);
    res.status(500).json({ error: 'Failed to record metric' });
  }
});

/**
 * Get active alert incidents
 */
router.get('/alerts/incidents', async (req, res) => {
  try {
    const incidents = await metricsService.getActiveIncidents();
    res.json({ incidents });
  } catch (error: unknown) {
    logger.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

/**
 * Create an alert rule
 */
router.post('/alerts/rules', async (req, res) => {
  try {
    const { name, metricName, condition, threshold, durationSecs, channels } = req.body;

    if (!name || !metricName || !condition || threshold === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await metricsService.createAlertRule({
      name,
      metricName,
      condition,
      threshold: threshold.toString(),
      durationSecs: durationSecs || 300,
      channels: channels || { email: true },
      isActive: true,
    });

    res.json({ success: true, message: 'Alert rule created' });
  } catch (error: unknown) {
    logger.error('Error creating alert rule:', error);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

/**
 * Trigger alert evaluation (for testing)
 */
router.post('/alerts/evaluate', async (req, res) => {
  try {
    await metricsService.evaluateAlerts();
    res.json({ success: true, message: 'Alerts evaluated' });
  } catch (error: unknown) {
    logger.error('Error evaluating alerts:', error);
    res.status(500).json({ error: 'Failed to evaluate alerts' });
  }
});

/**
 * Get email delivery stats
 */
router.get('/email/stats', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string);
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

    const stats = await emailTrackingService.getEmailStats(startDate);
    const recentBounces = await emailTrackingService.getRecentBounces(20);

    res.json({ stats, recentBounces });
  } catch (error: unknown) {
    logger.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Failed to fetch email stats' });
  }
});

export default router;
