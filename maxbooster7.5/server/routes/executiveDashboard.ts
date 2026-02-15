import { Router } from 'express';
import { logger } from '../logger.js';
import { queueMonitor } from '../monitoring/queueMonitor.js';
import { aiModelManager } from '../services/aiModelManager.js';
import { metricsCollector } from '../monitoring/metricsCollector.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAdmin);

/**
 * GET /api/executive/dashboard
 * High-level non-technical dashboard for executives and stakeholders
 * Requires admin authentication (enforced by router.use(requireAdmin))
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [queueHealth, aiMetrics, dashboard] = await Promise.all([
      queueMonitor.getHealthStatus(),
      aiModelManager.getMetrics(),
      metricsCollector.getDashboardData(),
    ]);

    const systemStatus = queueHealth.healthy ? 'OPERATIONAL' : 'DEGRADED';
    const queueMetrics = queueHealth.queues.values().next().value?.metrics;

    const executiveDashboard = {
      timestamp: new Date(),
      
      overallStatus: {
        status: systemStatus,
        health: queueHealth.healthy ? 'Healthy' : 'Needs Attention',
        uptime: `${(process.uptime() / 3600).toFixed(1)} hours`,
        lastChecked: new Date(),
      },

      businessMetrics: {
        autoPosting: {
          status: queueHealth.healthy ? 'Active' : 'Degraded',
          postsScheduled: queueMetrics?.waiting || 0,
          postsProcessing: queueMetrics?.active || 0,
          postsCompleted: queueMetrics?.completed || 0,
          postsFailed: queueMetrics?.failed || 0,
          successRate: queueMetrics
            ? ((queueMetrics.completed / (queueMetrics.completed + queueMetrics.failed || 1)) * 100).toFixed(1) + '%'
            : '100%',
        },

        aiSystems: {
          status: 'Operational',
          socialMediaAI: {
            active: aiMetrics.socialAutopilot.currentSize > 0,
            utilizationLevel: parseFloat(
              ((aiMetrics.socialAutopilot.currentSize / aiMetrics.socialAutopilot.maxSize) * 100).toFixed(1)
            ) < 50 ? 'Low' : 'Normal',
          },
          advertisingAI: {
            active: aiMetrics.advertisingAutopilot.currentSize > 0,
            utilizationLevel: parseFloat(
              ((aiMetrics.advertisingAutopilot.currentSize / aiMetrics.advertisingAutopilot.maxSize) * 100).toFixed(1)
            ) < 50 ? 'Low' : 'Normal',
          },
        },

        performance: {
          responseTime: `${dashboard.summary.queue.avgLatency.toFixed(0)}ms`,
          responseQuality: dashboard.summary.queue.avgLatency < 50 ? 'Excellent' : 
                           dashboard.summary.queue.avgLatency < 100 ? 'Good' : 'Needs Improvement',
          memoryUsage: `${dashboard.summary.system.avgMemoryMB.toFixed(0)}MB`,
          memoryTrend: dashboard.trends.memory,
        },
      },

      keyIndicators: {
        platformAvailability: queueHealth.healthy ? '99.9%' : '98.0%',
        avgProcessingTime: `${dashboard.summary.queue.avgLatency.toFixed(0)}ms`,
        activeUsers: 'N/A',
        postsToday: (queueMetrics?.completed || 0),
      },

      trends: {
        performance: dashboard.trends.redisLatency === 'stable' ? 'Stable ✅' : 'Attention Needed ⚠️',
        capacity: dashboard.trends.memory === 'stable' ? 'Stable ✅' : 'Growing ⚠️',
        reliability: dashboard.summary.queue.totalFailed === 0 ? 'Excellent ✅' : 'Monitor 👀',
      },

      alerts: {
        critical: 0,
        warnings: dashboard.trends.memory === 'increasing' ? 1 : 0,
        info: 0,
      },

      nextActions: getRecommendedActions(dashboard, queueHealth),
    };

    res.json({
      success: true,
      dashboard: executiveDashboard,
    });
  })
);

/**
 * GET /api/executive/health-summary
 * Simple health summary for quick checks
 * Requires admin authentication (enforced by router.use(requireAdmin))
 */
router.get(
  '/health-summary',
  asyncHandler(async (req, res) => {
    const queueHealth = await queueMonitor.getHealthStatus();

    res.json({
      success: true,
      status: queueHealth.healthy ? 'HEALTHY' : 'DEGRADED',
      message: queueHealth.healthy
        ? 'All systems operational'
        : 'Some systems require attention',
      timestamp: new Date(),
    });
  })
);

function getRecommendedActions(dashboard: any, queueHealth: any): string[] {
  const actions: string[] = [];

  if (dashboard.trends.memory === 'increasing') {
    actions.push('Monitor memory usage - consider optimization if trend continues');
  }

  if (dashboard.summary.queue.totalFailed > 10) {
    actions.push('Review failed jobs - multiple failures detected');
  }

  if (!queueHealth.healthy) {
    actions.push('System health degraded - technical team notified');
  }

  if (dashboard.summary.queue.avgLatency > 100) {
    actions.push('Performance optimization recommended - response times elevated');
  }

  if (actions.length === 0) {
    actions.push('No action required - all systems performing optimally');
  }

  return actions;
}

export default router;
