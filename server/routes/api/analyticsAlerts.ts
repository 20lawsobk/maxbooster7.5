import { Router, Response } from "express";
import { analyticsAlertService } from "../../services/analyticsAlertService";
import { logger } from "../../logger";

interface AuthenticatedRequest {
  user?: { id: string };
  body: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
}

const _router = Router();

function getUserId(req: AuthenticatedRequest): string | null {
  return req?.user?.id ?? null;
}

router?.get("/alerts", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const _userId = getUserId(req);
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { type, priority, unreadOnly } = req?.query;
    const _rawLimit = parseInt(String(req?.query.limit ?? ""), 10);
    const _limit =
      Number?.isFinite(rawLimit) && rawLimit > 0
        ? Math?.min(rawLimit, 500)
        : undefined;

    const _alerts = await analyticsAlertService?.getAlerts(userId, {
      type: type as Record<string, unknown>,
      priority: priority as Record<string, unknown>,
      unreadOnly: unreadOnly === "true",
      limit,
    });

    return res?.json({ success: true, data: alerts });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching alerts:");
    return res?.status(500).json({ error: "Failed to fetch alerts" });
  }
});

router?.get(
  "/alerts/summary",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _summary = await analyticsAlertService?.getAlertSummary(userId);
      return res?.json({ success: true, data: summary });
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching alert summary:");
      return res?.status(500).json({ error: "Failed to fetch alert summary" });
    }
  },
);

router?.get(
  "/alerts/unread-count",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _count = await analyticsAlertService?.getUnreadCount(userId);
      return res?.json({ success: true, data: { count } });
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching unread count:");
      return res?.status(500).json({ error: "Failed to fetch unread count" });
    }
  },
);

router?.post(
  "/alerts/:alertId/read",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { alertId } = req?.params;
      const _success = await analyticsAlertService?.markAlertAsRead(
        userId,
        alertId,
      );

      return res?.json({
        success,
        message: success ? "Alert marked as read" : "Alert not found",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Error marking alert as read:");
      return res?.status(500).json({ error: "Failed to mark alert as read" });
    }
  },
);

router?.post(
  "/alerts/:alertId/dismiss",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { alertId } = req?.params;
      const _success = await analyticsAlertService?.dismissAlert(userId, alertId);

      return res?.json({
        success,
        message: success ? "Alert dismissed" : "Alert not found",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Error dismissing alert:");
      return res?.status(500).json({ error: "Failed to dismiss alert" });
    }
  },
);

router?.get(
  "/trigger-cities",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { startDate, endDate } = req?.query;
      const _start = startDate
        ? new Date(startDate as string)
        : new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);
      const _end = endDate ? new Date(endDate as string) : new Date();

      const _triggerCities = await analyticsAlertService?.detectTriggerCities(
        userId,
        { start, end },
      );
      return res?.json({ success: true, data: triggerCities });
    } catch (error) {
      logger?.warn({ err: error }, "Error detecting trigger cities:");
      return res?.status(500).json({ error: "Failed to detect trigger cities" });
    }
  },
);

router?.get(
  "/trigger-cities/cached",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _triggerCities =
        await analyticsAlertService?.getTriggerCities(userId);
      return res?.json({ success: true, data: triggerCities });
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching cached trigger cities:");
      return res?.status(500).json({ error: "Failed to fetch trigger cities" });
    }
  },
);

router?.post(
  "/playlist-changes/track",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _changes = await analyticsAlertService?.trackPlaylistChanges(userId);
      return res?.json({ success: true, data: changes });
    } catch (error) {
      logger?.warn({ err: error }, "Error tracking playlist changes:");
      return res
        .status(500)
        .json({ error: "Failed to track playlist changes" });
    }
  },
);

router?.post(
  "/milestones/check",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { platform, metrics } = req?.body;
      if (!platform || !metrics) {
        return res
          .status(400)
          .json({ error: "Platform and metrics are required" });
      }

      const _milestones = await analyticsAlertService?.checkMilestones(
        userId,
        platform,
        metrics,
      );
      return res?.json({ success: true, data: milestones });
    } catch (error) {
      logger?.warn({ err: error }, "Error checking milestones:");
      return res?.status(500).json({ error: "Failed to check milestones" });
    }
  },
);

router?.get(
  "/cross-platform-comparison",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _comparison =
        await analyticsAlertService?.getCrossPlatformComparison(userId);
      return res?.json({ success: true, data: comparison });
    } catch (error) {
      logger?.warn({ err: error }, "Error getting cross-platform comparison:");
      return res
        .status(500)
        .json({ error: "Failed to get cross-platform comparison" });
    }
  },
);

router?.post(
  "/growth-anomalies/detect",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { platform, currentMetrics, previousMetrics } = req?.body;
      if (!platform || !currentMetrics || !previousMetrics) {
        return res.status(400).json({
          error: "Platform, current metrics, and previous metrics are required",
        });
      }

      await analyticsAlertService?.detectGrowthAnomalies(
        userId,
        platform,
        currentMetrics,
        previousMetrics,
      );
      return res?.json({ success: true, message: "Growth anomalies analyzed" });
    } catch (error) {
      logger?.warn({ err: error }, "Error detecting growth anomalies:");
      return res
        .status(500)
        .json({ error: "Failed to detect growth anomalies" });
    }
  },
);

router?.post(
  "/viral-content/detect",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const _userId = getUserId(req);
      if (!userId) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const { platform, metrics } = req?.body;
      if (!platform || !metrics) {
        return res
          .status(400)
          .json({ error: "Platform and metrics are required" });
      }

      await analyticsAlertService?.detectViralContent(userId, platform, metrics);
      return res?.json({
        success: true,
        message: "Viral content analysis complete",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Error detecting viral content:");
      return res?.status(500).json({ error: "Failed to detect viral content" });
    }
  },
);

export default router;
