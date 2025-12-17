import { Router } from 'express';
import { logger } from '../logger.js';
import { queueMonitor } from '../monitoring/queueMonitor.js';
import { aiModelManager } from '../services/aiModelManager.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { alertingService } from '../monitoring/alertingService.js';
import { metricsCollector } from '../monitoring/metricsCollector.js';

const router = Router();

/**
 * GET /api/monitoring/queue-metrics
 * Get current queue metrics (latency, stalled jobs, retries)
 */
router.get(
  '/queue-metrics',
  asyncHandler(async (req, res) => {
    const metrics = await queueMonitor.collectAllMetrics();
    const metricsArray = Array.from(metrics.entries()).map(([name, data]) => ({
      queue: name,
      ...data,
    }));

    res.json({
      success: true,
      timestamp: new Date(),
      metrics: metricsArray,
    });
  })
);

/**
 * GET /api/monitoring/queue-metrics/:queueName
 * Get metrics for a specific queue
 */
router.get(
  '/queue-metrics/:queueName',
  asyncHandler(async (req, res) => {
    const { queueName } = req.params;
    const metrics = await queueMonitor.collectMetrics(queueName);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: `Queue '${queueName}' not found or not monitored`,
      });
    }

    res.json({
      success: true,
      metrics,
    });
  })
);

/**
 * GET /api/monitoring/queue-health
 * Get queue health status with alerts
 */
router.get(
  '/queue-health',
  asyncHandler(async (req, res) => {
    const healthStatus = await queueMonitor.getHealthStatus();

    res.json({
      success: true,
      healthy: healthStatus.healthy,
      queues: Array.from(healthStatus.queues.entries()).map(([name, data]) => ({
        name,
        ...data,
      })),
    });
  })
);

/**
 * GET /api/monitoring/ai-models
 * Get AI model cache metrics and telemetry
 */
router.get(
  '/ai-models',
  asyncHandler(async (req, res) => {
    const metrics = aiModelManager.getMetrics();
    const summary = aiModelManager.getTelemetrySummary();
    const cacheStats = aiModelManager.getCacheStats();

    res.json({
      success: true,
      metrics,
      summary,
      cacheStats,
    });
  })
);

/**
 * GET /api/monitoring/system-health
 * Comprehensive system health check including queues and AI models
 */
router.get(
  '/system-health',
  asyncHandler(async (req, res) => {
    const [queueHealth, aiMetrics] = await Promise.all([
      queueMonitor.getHealthStatus(),
      aiModelManager.getMetrics(),
    ]);

    const allQueuesHealthy = queueHealth.healthy;
    const aiModelsHealthy =
      aiMetrics.socialAutopilot.currentSize <= aiMetrics.socialAutopilot.maxSize &&
      aiMetrics.advertisingAutopilot.currentSize <= aiMetrics.advertisingAutopilot.maxSize;

    const systemHealthy = allQueuesHealthy && aiModelsHealthy;

    res.json({
      success: true,
      healthy: systemHealthy,
      status: systemHealthy ? 'healthy' : 'degraded',
      components: {
        queues: {
          healthy: allQueuesHealthy,
          details: Array.from(queueHealth.queues.entries()).map(([name, data]) => ({
            name,
            status: data.status,
          })),
        },
        aiModels: {
          healthy: aiModelsHealthy,
          social: {
            current: aiMetrics.socialAutopilot.currentSize,
            max: aiMetrics.socialAutopilot.maxSize,
            utilizationPercent: (
              (aiMetrics.socialAutopilot.currentSize / aiMetrics.socialAutopilot.maxSize) *
              100
            ).toFixed(1),
          },
          advertising: {
            current: aiMetrics.advertisingAutopilot.currentSize,
            max: aiMetrics.advertisingAutopilot.maxSize,
            utilizationPercent: (
              (aiMetrics.advertisingAutopilot.currentSize /
                aiMetrics.advertisingAutopilot.maxSize) *
              100
            ).toFixed(1),
          },
        },
      },
      timestamp: new Date(),
    });
  })
);

/**
 * POST /api/monitoring/set-thresholds
 * Update alert thresholds for queue monitoring
 * Requires admin access
 */
router.post(
  '/set-thresholds',
  asyncHandler(async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { maxWaitingJobs, maxFailedRate, maxStalledJobs, maxRedisLatency } = req.body;

    queueMonitor.setAlertThresholds({
      maxWaitingJobs,
      maxFailedRate,
      maxStalledJobs,
      maxRedisLatency,
    });

    logger.info('📊 Queue monitoring thresholds updated by admin', {
      adminId: req.user.id,
      thresholds: { maxWaitingJobs, maxFailedRate, maxStalledJobs, maxRedisLatency },
    });

    res.json({
      success: true,
      message: 'Alert thresholds updated successfully',
    });
  })
);

/**
 * GET /api/monitoring/dashboard
 * Get comprehensive metrics dashboard with trends and baseline data
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const dashboardData = metricsCollector.getDashboardData();
    const alertConfig = alertingService.getConfig();

    res.json({
      success: true,
      dashboard: dashboardData,
      alerting: {
        emailEnabled: alertConfig.emailEnabled,
        webhookEnabled: alertConfig.webhookEnabled,
        thresholds: alertConfig.thresholds,
      },
      timestamp: new Date(),
    });
  })
);

/**
 * POST /api/monitoring/baseline/save
 * Save current metrics as baseline for comparison
 * Requires admin access
 */
router.post(
  '/baseline/save',
  asyncHandler(async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { name } = req.body;
    const baselineName = name || 'baseline';
    const filepath = await metricsCollector.saveBaseline(baselineName);

    logger.info('📊 Baseline metrics saved by admin', {
      adminId: req.user.id,
      baselineName,
      filepath,
    });

    res.json({
      success: true,
      message: 'Baseline metrics saved successfully',
      filepath,
    });
  })
);

/**
 * GET /api/monitoring/alerting/config
 * Get current alerting configuration
 */
router.get(
  '/alerting/config',
  asyncHandler(async (req, res) => {
    const config = alertingService.getConfig();

    res.json({
      success: true,
      config: {
        emailEnabled: config.emailEnabled,
        webhookEnabled: config.webhookEnabled,
        recipientCount: config.emailRecipients.length,
        thresholds: config.thresholds,
      },
    });
  })
);

/**
 * POST /api/monitoring/alerting/test
 * Send test alert to verify alerting configuration
 * Requires admin access
 */
router.post(
  '/alerting/test',
  asyncHandler(async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    await alertingService.sendAlert({
      severity: 'info',
      title: 'Test Alert',
      message: 'This is a test alert from Max Booster monitoring system.',
      timestamp: new Date(),
      metadata: { testBy: req.user.email },
    });

    res.json({
      success: true,
      message: 'Test alert sent successfully',
    });
  })
);

export default router;
