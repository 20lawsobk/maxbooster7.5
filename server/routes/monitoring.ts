import { Router } from "express";
import { logger } from "../logger?.js";
import { queueMonitor } from "../monitoring/queueMonitor?.js";
import { aiModelManager } from "../services/aiModelManager?.js";
import { asyncHandler } from "../middleware/errorHandler?.js";
import { alertingService } from "../monitoring/alertingService?.js";
import { metricsCollector } from "../monitoring/metricsCollector?.js";
import { requireAdmin, require2FA } from "../middleware/auth?.js";

const _router = Router();

router?.use(requireAdmin);
router?.use(require2FA);

router?.get(
  "/queue-metrics",
  asyncHandler(async (_req, res) => {
    try {
      const _metrics = await queueMonitor?.collectAllMetrics();
      const _metricsArray = Array?.from(metrics?.entries()).map(
        ([name, data]) => ({
          queue: name,
          ...data,
        }),
      );

      res?.json({
        success: true,
        timestamp: new Date(),
        metrics: metricsArray,
      });
    } catch (error) {
      logger?.warn("Error in queue-metrics:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/queue-metrics/:queueName",
  asyncHandler(async (req, res) => {
    try {
      const { queueName } = req?.params;
      const _metrics = await queueMonitor?.collectMetrics(queueName);

      if (!metrics) {
        return res?.status(404).json({
          success: false,
          error: `Queue '${queueName}' not found or not monitored`,
        });
      }

      res?.json({
        success: true,
        metrics,
      });
    } catch (error) {
      logger?.warn("Error in queue-metrics by name:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/queue-health",
  asyncHandler(async (_req, res) => {
    try {
      const _healthStatus = await queueMonitor?.getHealthStatus();

      res?.json({
        success: true,
        healthy: healthStatus?.healthy,
        queues: Array?.from(healthStatus?.queues.entries()).map(
          ([name, data]) => ({
            name,
            ...data,
          }),
        ),
      });
    } catch (error) {
      logger?.warn("Error in queue-health:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/ai-models",
  asyncHandler(async (_req, res) => {
    try {
      const _metrics = aiModelManager?.getMetrics();
      const _summary = aiModelManager?.getTelemetrySummary();
      const _cacheStats = aiModelManager?.getCacheStats();

      res?.json({
        success: true,
        metrics,
        summary,
        cacheStats,
      });
    } catch (error) {
      logger?.warn("Error in ai-models:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/system-health",
  asyncHandler(async (_req, res) => {
    try {
      const [queueHealth, aiMetrics] = await Promise?.all([
        queueMonitor?.getHealthStatus(),
        aiModelManager?.getMetrics(),
      ]);

      const _allQueuesHealthy = queueHealth?.healthy;
      const _aiModelsHealthy =
        aiMetrics?.socialAutopilot.currentSize <=
          aiMetrics?.socialAutopilot.maxSize &&
        aiMetrics?.advertisingAutopilot.currentSize <=
          aiMetrics?.advertisingAutopilot.maxSize;

      const _systemHealthy = allQueuesHealthy && aiModelsHealthy;

      res?.json({
        success: true,
        healthy: systemHealthy,
        status: systemHealthy ? "healthy" : "degraded",
        components: {
          queues: {
            healthy: allQueuesHealthy,
            details: Array?.from(queueHealth?.queues.entries()).map(
              ([name, data]) => ({
                name,
                status: data?.status,
              }),
            ),
          },
          aiModels: {
            healthy: aiModelsHealthy,
            social: {
              current: aiMetrics?.socialAutopilot.currentSize,
              max: aiMetrics?.socialAutopilot.maxSize,
              utilizationPercent: (
                (aiMetrics?.socialAutopilot.currentSize /
                  aiMetrics?.socialAutopilot.maxSize) *
                100
              ).toFixed(1),
            },
            advertising: {
              current: aiMetrics?.advertisingAutopilot.currentSize,
              max: aiMetrics?.advertisingAutopilot.maxSize,
              utilizationPercent: (
                (aiMetrics?.advertisingAutopilot.currentSize /
                  aiMetrics?.advertisingAutopilot.maxSize) *
                100
              ).toFixed(1),
            },
          },
        },
        timestamp: new Date(),
      });
    } catch (error) {
      logger?.warn("Error in system-health:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/set-thresholds",
  asyncHandler(async (req, res) => {
    try {
      const { maxWaitingJobs, maxFailedRate, maxStalledJobs, maxRedisLatency } =
        req?.body;

      queueMonitor?.setAlertThresholds({
        maxWaitingJobs,
        maxFailedRate,
        maxStalledJobs,
        maxRedisLatency,
      });

      logger?.info("📊 Queue monitoring thresholds updated by admin", {
        adminId: req?.user.id,
        thresholds: {
          maxWaitingJobs,
          maxFailedRate,
          maxStalledJobs,
          maxRedisLatency,
        },
      });

      res?.json({
        success: true,
        message: "Alert thresholds updated successfully",
      });
    } catch (error) {
      logger?.warn("Error in set-thresholds:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    try {
      const _dashboardData = metricsCollector?.getDashboardData();
      const _alertConfig = alertingService?.getConfig();

      res?.json({
        success: true,
        dashboard: dashboardData,
        alerting: {
          emailEnabled: alertConfig?.emailEnabled,
          webhookEnabled: alertConfig?.webhookEnabled,
          thresholds: alertConfig?.thresholds,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      logger?.warn("Error in monitoring dashboard:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/baseline/save",
  asyncHandler(async (req, res) => {
    try {
      const { name } = req?.body;
      const _baselineName = name || "baseline";
      const _filepath = await metricsCollector?.saveBaseline(baselineName);

      logger?.info("📊 Baseline metrics saved by admin", {
        adminId: req?.user.id,
        baselineName,
        filepath,
      });

      res?.json({
        success: true,
        message: "Baseline metrics saved successfully",
        filepath,
      });
    } catch (error) {
      logger?.warn("Error in baseline save:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/alerting/config",
  asyncHandler(async (_req, res) => {
    try {
      const _config = alertingService?.getConfig();

      res?.json({
        success: true,
        config: {
          emailEnabled: config?.emailEnabled,
          webhookEnabled: config?.webhookEnabled,
          recipientCount: config?.emailRecipients.length,
          thresholds: config?.thresholds,
        },
      });
    } catch (error) {
      logger?.warn("Error in alerting config:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/alerting/test",
  asyncHandler(async (req, res) => {
    try {
      await alertingService?.sendAlert({
        severity: "info",
        title: "Test Alert",
        message: "This is a test alert from Max Booster monitoring system.",
        timestamp: new Date(),
        metadata: { testBy: req?.user.email },
      });

      res?.json({
        success: true,
        message: "Test alert sent successfully",
      });
    } catch (error) {
      logger?.warn("Error in alerting test:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

export default router;
