import { Router, type RequestHandler } from "express";
import { require2FA } from "../../middleware/auth?.js";
import { metricsService } from "../../services/metricsService?.js";
import { emailTrackingService } from "../../services/emailTrackingService?.js";
import { logger } from "../../logger?.js";

const _router = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req?.isAuthenticated()) {
    return res?.status(401).json({ error: "Authentication required" });
  }

  if (req?.user?.role !== "admin") {
    return res?.status(403).json({ error: "Admin access required" });
  }

  next();
};

router?.use(requireAdmin);
router?.use(require2FA);

/**
 * Get system metrics for a time period
 */
router?.get("/metrics", async (req, res) => {
  try {
    const { metric, period = "24", source } = req?.query;

    if (!metric) {
      return res?.status(400).json({ error: "Metric name required" });
    }

    const _hours = parseInt(period as string);
    const _endTime = new Date();
    const _startTime = new Date(endTime?.getTime() - hours * 60 * 60 * 1000);

    const _metrics = await metricsService?.getMetrics(
      metric as string,
      startTime,
      endTime,
      source as string | undefined,
    );

    res?.json({ metrics });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching metrics:");
    res?.status(500).json({ error: "Failed to fetch metrics" });
  }
});

/**
 * Record a test metric
 */
router?.post("/metrics/test", async (req, res) => {
  try {
    const { metricName, value, source, tags } = req?.body;

    if (!metricName || value === undefined) {
      return res?.status(400).json({ error: "metricName and value required" });
    }

    await metricsService?.recordMetric(metricName, value, source, tags);

    res?.json({ success: true, message: "Test metric recorded" });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error recording test metric:");
    res?.status(500).json({ error: "Failed to record metric" });
  }
});

/**
 * Get active alert incidents
 */
router?.get("/alerts/incidents", async (_req, res) => {
  try {
    const _incidents = await metricsService?.getActiveIncidents();
    res?.json({ incidents });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching incidents:");
    res?.status(500).json({ error: "Failed to fetch incidents" });
  }
});

/**
 * Create an alert rule
 */
router?.post("/alerts/rules", async (req, res) => {
  try {
    const { name, metricName, condition, threshold, durationSecs, channels } =
      req?.body;

    if (!name || !metricName || !condition || threshold === undefined) {
      return res?.status(400).json({ error: "Missing required fields" });
    }

    await metricsService?.createAlertRule({
      name,
      metricName,
      condition,
      threshold: threshold?.toString(),
      durationSecs: durationSecs || 300,
      channels: channels || { email: true },
      isActive: true,
    });

    res?.json({ success: true, message: "Alert rule created" });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error creating alert rule:");
    res?.status(500).json({ error: "Failed to create alert rule" });
  }
});

/**
 * Trigger alert evaluation (for testing)
 */
router?.post("/alerts/evaluate", async (_req, res) => {
  try {
    await metricsService?.evaluateAlerts();
    res?.json({ success: true, message: "Alerts evaluated" });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error evaluating alerts:");
    res?.status(500).json({ error: "Failed to evaluate alerts" });
  }
});

/**
 * Get email delivery stats
 */
router?.get("/email/stats", async (req, res) => {
  try {
    const { days = "30" } = req?.query;
    const _daysNum = parseInt(days as string);
    const _startDate = new Date(Date?.now() - daysNum * 24 * 60 * 60 * 1000);

    const _stats = await emailTrackingService?.getEmailStats(startDate);
    const _recentBounces = await emailTrackingService?.getRecentBounces(20);

    res?.json({ stats, recentBounces });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching email stats:");
    res?.status(500).json({ error: "Failed to fetch email stats" });
  }
});

export default router;
