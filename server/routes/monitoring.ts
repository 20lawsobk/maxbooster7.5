import { Router } from "express";
import { logger } from "../logger.js";
import { queueMonitor } from "../monitoring/queueMonitor.js";
import { aiModelManager } from "../services/aiModelManager.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { alertingService } from "../monitoring/alertingService.js";
import { metricsCollector } from "../monitoring/metricsCollector.js";
import { requireAdmin, require2FA } from "../middleware/auth.js";
import { getMaxCoreModelStateSnapshot } from "../services/maxcoreSync.js";

const router = Router();

router.use(requireAdmin);
router.use(require2FA);

router.get(
  "/queue-metrics",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const metrics = await queueMonitor?.collectAllMetrics();
      const metricsArray = Array.from(metrics?.entries()).map(
        ([name, data]) => ({
          queue: name,
          ...data,
        }),
      );

      res.json({
        success: true,
        timestamp: new Date(),
        metrics: metricsArray,
      });
    } catch (error) {
      logger.warn("Error in queue-metrics:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/queue-metrics/:queueName",
  asyncHandler(async (req: any, res: any) => {
    try {
      const { queueName } = req.params;
      const metrics = await queueMonitor?.collectMetrics(queueName);

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
    } catch (error) {
      logger.warn("Error in queue-metrics by name:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/queue-health",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const healthStatus = await queueMonitor?.getHealthStatus();

      res.json({
        success: true,
        healthy: healthStatus.healthy,
        queues: Array.from(healthStatus?.queues.entries()).map(
          ([name, data]) => ({
            name,
            ...data,
          }),
        ),
      });
    } catch (error) {
      logger.warn("Error in queue-health:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/ai-models",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const metrics = aiModelManager?.getMetrics();
      const summary = aiModelManager?.getTelemetrySummary();
      const cacheStats = aiModelManager?.getCacheStats();

      res.json({
        success: true,
        metrics,
        summary,
        cacheStats,
      });
    } catch (error) {
      logger.warn("Error in ai-models:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/system-health",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const queueHealth = await queueMonitor?.getHealthStatus();
      const maxCoreSnapshot = getMaxCoreModelStateSnapshot();
      const socialState = maxCoreSnapshot?.states.social_base;
      const advertisingState = maxCoreSnapshot?.states.advertising_base;

      const summarizeModelState = (
        state: Record<string, unknown> | undefined,
        expectedDomain: string,
      ) => {
        const weights =
          state?.weights && typeof state.weights === "object"
            ? (state.weights as Record<string, unknown>)
            : undefined;
        const contractValid =
          state?.domain === expectedDomain &&
          typeof state.version === "string" &&
          typeof state.session_count === "number" &&
          typeof weights?.ready === "boolean";
        if (!contractValid) {
          return {
            available: false,
            healthy: false,
            status: "unavailable",
          };
        }
        const ready = weights.ready === true;
        return {
          available: true,
          healthy: ready,
          status: ready ? "ready" : "not_ready",
          version: state.version,
          sessionCount: state.session_count,
        };
      };

      const social = summarizeModelState(socialState, "social");
      const advertising = summarizeModelState(
        advertisingState,
        "advertising",
      );
      const allQueuesHealthy = queueHealth?.healthy === true;
      const aiModelsHealthy = social.healthy && advertising.healthy;

      const systemHealthy = allQueuesHealthy && aiModelsHealthy;

      res.json({
        success: true,
        healthy: systemHealthy,
        status: systemHealthy ? "healthy" : "degraded",
        components: {
          queues: {
            healthy: allQueuesHealthy,
            details: Array.from(queueHealth?.queues.entries()).map(
              ([name, data]) => ({
                name,
                status: data.status,
              }),
            ),
          },
          aiModels: {
            healthy: aiModelsHealthy,
            authority: "maxcore",
            syncedAt: maxCoreSnapshot?.syncedAt ?? null,
            social,
            advertising,
          },
        },
        timestamp: new Date(),
      });
    } catch (error) {
      logger.warn("Error in system-health:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/set-thresholds",
  asyncHandler(async (req: any, res: any) => {
    try {
      const { maxWaitingJobs, maxFailedRate, maxStalledJobs, maxRedisLatency } =
        req.body;

      queueMonitor?.setAlertThresholds({
        maxWaitingJobs,
        maxFailedRate,
        maxStalledJobs,
        maxRedisLatency,
      });

      logger.info({
        adminId: req.user.id,
        thresholds: {
          maxWaitingJobs,
          maxFailedRate,
          maxStalledJobs,
          maxRedisLatency,
        },
      }, "📊 Queue monitoring thresholds updated by admin");

      res.json({
        success: true,
        message: "Alert thresholds updated successfully",
      });
    } catch (error) {
      logger.warn("Error in set-thresholds:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/dashboard",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const dashboardData = metricsCollector?.getDashboardData();
      const alertConfig = alertingService?.getConfig();

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
    } catch (error) {
      logger.warn("Error in monitoring dashboard:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/baseline/save",
  asyncHandler(async (req: any, res: any) => {
    try {
      const { name } = req.body;
      const baselineName = name || "baseline";
      const filepath = await metricsCollector?.saveBaseline(baselineName);

      logger.info({
        adminId: req.user.id,
        baselineName,
        filepath,
      }, "📊 Baseline metrics saved by admin");

      res.json({
        success: true,
        message: "Baseline metrics saved successfully",
        filepath,
      });
    } catch (error) {
      logger.warn("Error in baseline save:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/alerting/config",
  asyncHandler(async (_req: any, res: any) => {
    try {
      const config = alertingService?.getConfig();

      res.json({
        success: true,
        config: {
          emailEnabled: config.emailEnabled,
          webhookEnabled: config.webhookEnabled,
          recipientCount: config.emailRecipients.length,
          thresholds: config.thresholds,
        },
      });
    } catch (error) {
      logger.warn("Error in alerting config:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/alerting/test",
  asyncHandler(async (req: any, res: any) => {
    try {
      await alertingService?.sendAlert({
        severity: "info",
        title: "Test Alert",
        message: "This is a test alert from Max Booster monitoring system.",
        timestamp: new Date(),
        metadata: { testBy: req.user.email },
      });

      res.json({
        success: true,
        message: "Test alert sent successfully",
      });
    } catch (error) {
      logger.warn("Error in alerting test:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

export default router;
