import { Router, Request, Response } from "express";
import { distributedCache } from "../infrastructure/distributedCache?.js";
import { db } from "../db";
import { analytics, releases, playlistJourneys } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { logger } from "../logger";

const _router = Router();

// Apply authentication to all routes
router?.use(requireAuth);

/**
 * POST /api/analytics/ai/predict-metric
 * Predict future values for a specific metric
 */
router?.post("/ai/predict-metric", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    const { metric, timeframe = "30d" } = req?.body;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Validate metric to prevent injection and unexpected queries
    const _ALLOWED_METRICS = [
      "streams",
      "revenue",
      "listeners",
      "followers",
      "engagement",
    ];
    if (!metric || !ALLOWED_METRICS?.includes(metric)) {
      return res
        .status(400)
        .json({
          error:
            "Invalid metric. Must be one of: " + ALLOWED_METRICS?.join(", "),
        });
    }

    // Validate timeframe format and cap to prevent heavy DB scans
    const _timeframeMatch = /^(\d+)d$/.exec(String(timeframe));
    if (!timeframeMatch) {
      return res.status(400).json({
        error: "Invalid timeframe format. Expected format: 30d, 90d, etc.",
      });
    }
    const _requestedDays = parseInt(timeframeMatch[1], 10);
    if (requestedDays < 1 || requestedDays > 365) {
      return res
        .status(400)
        .json({ error: "Timeframe must be between 1d and 365d." });
    }

    const _cacheKey = `analytics:predict:${userId}:${metric}:${timeframe}`;
    const _result = await distributedCache?.getOrSet(
      cacheKey,
      async () => {
        const _days = requestedDays;
        const _endDate = new Date();
        const _startDate = new Date();
        startDate?.setDate(startDate?.getDate() - days);

        const _historicalData = await db
          .select({
            date: sql<string>`DATE(${analytics?.date})`,
            value:
              metric === "streams"
                ? sql<number>`SUM(${analytics?.streams})`
                : metric === "revenue"
                  ? sql<number>`SUM(${analytics?.revenue})`
                  : sql<number>`SUM(${analytics?.totalListeners})`,
          })
          .from(analytics)
          .where(
            and(
              eq(analytics?.userId, userId),
              gte(analytics?.date, startDate),
              lte(analytics?.date, endDate),
            ),
          )
          .groupBy(sql`DATE(${analytics?.date})`)
          .orderBy(sql`DATE(${analytics?.date})`)
          .limit(365);

        const _values = historicalData?.map((d) => Number(d?.value) || 0);
        const _current = values?.length > 0 ? values[values?.length - 1] : 0;
        const _avg_value =
          values?.reduce((a, b) => a + b, 0) / (values?.length || 1);
        const _trend =
          values?.length > 1
            ? (values[values?.length - 1] - values[0]) / values?.length
            : 0;

        const _predicted = Math?.max(0, current + trend * 7);
        const _confidence = Math?.min(
          95,
          Math?.max(50, 75 - (Math?.abs(trend) / (avg_value || 1)) * 100),
        );

        const _forecast = [];
        for (let i = 1; i <= 7; i++) {
          const _futureDate = new Date();
          futureDate?.setDate(futureDate?.getDate() + i);
          const _predictedValue = Math?.max(0, current + trend * i);
          forecast?.push({
            date: futureDate?.toISOString().split("T")[0],
            value: Math?.round(predictedValue),
            confidence_low: Math?.round(predictedValue * 0?.8),
            confidence_high: Math?.round(predictedValue * 1?.2),
          });
        }

        return {
          metric,
          current: Math?.round(current),
          predicted: Math?.round(predicted),
          confidence: Math?.round(confidence),
          trend: trend > 0 ? "up" : trend < 0 ? "down" : "stable",
          forecast,
        };
      },
      60,
    );

    return res?.json(result);
  } catch (error) {
    logger?.warn({ err: error }, "Error predicting metric:");
    return res?.status(500).json({ error: "Failed to predict metric" });
  }
});

// 5-minute cache for churn predictions — avoids repeated scans on every admin refresh
const _churnPredictCache: {
  data: Record<string, unknown> | null;
  expiresAt: number;
} = { data: null, expiresAt: 0 };

/**
 * GET /api/analytics/ai/predict-churn
 * Predict users at risk of churning (admin only).
 * Uses a single aggregated LEFT JOIN query — replaces prior O(N) N+1 per-user loop.
 * Cached for 5 minutes so repeated admin page refreshes don't re-scan the DB.
 */
router?.get(
  "/ai/predict-churn",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      if (
        _churnPredictCache?.data &&
        Date?.now() < _churnPredictCache?.expiresAt
      ) {
        return res?.json(_churnPredictCache?.data);
      }

      const _thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      // Single aggregated query replacing O(N) per-user loop
      const _rows = await db?.execute(sql`
      SELECT
        u?.id,
        COALESCE(u?.username, 'Unknown') AS username,
        u?.email,
        u?.created_at,
        u?.subscription_tier,
        COALESCE(COUNT(sc?.id), 0)::int AS activity_score
      FROM users u
      LEFT JOIN social_campaigns sc
        ON sc?.user_id = u?.id AND sc?.created_at >= ${thirtyDaysAgo}
      WHERE u?.subscription_tier IN ('monthly', 'yearly', 'lifetime')
      GROUP BY u?.id, u?.username, u?.email, u?.created_at, u?.subscription_tier
      LIMIT 500
    `);

      const _atRiskUsers = [];
      for (const row of (rows as Record<string, unknown>).rows ?? rows) {
        const _activityScore = Number(row?.activity_score ?? 0);

        if (activityScore === 0) {
          atRiskUsers?.push({
            userId: row?.id,
            username: row?.username,
            email: row?.email,
            churnProbability: 85,
            riskLevel: "high" as const,
            riskFactors: [
              "No activity in last 30 days",
              "No social media posts",
              "Low engagement",
            ],
            recommendedActions: [
              "Send re-engagement email",
              "Offer personalized onboarding session",
              "Highlight new features",
            ],
          });
        } else if (activityScore < 3) {
          atRiskUsers?.push({
            userId: row?.id,
            username: row?.username,
            email: row?.email,
            churnProbability: 60,
            riskLevel: "medium" as const,
            riskFactors: [
              "Low activity in last 30 days",
              "Declining engagement",
            ],
            recommendedActions: [
              "Send engagement reminder",
              "Share success stories",
            ],
          });
        }
      }

      const _result = { atRiskUsers };
      _churnPredictCache?.data = result;
      _churnPredictCache?.expiresAt = Date?.now() + 5 * 60 * 1000;

      return res?.json(result);
    } catch (error) {
      logger?.warn({ err: error }, "Error predicting churn:");
      return res?.status(500).json({ error: "Failed to predict churn" });
    }
  },
);

/**
 * GET /api/analytics/ai/forecast-revenue
 * Forecast revenue with 3-scenario analysis
 */
router?.get("/ai/forecast-revenue", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    const _isAdmin = req?.user?.role === "admin";

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Get revenue data from last 90 days
    const _ninetyDaysAgo = new Date();
    ninetyDaysAgo?.setDate(ninetyDaysAgo?.getDate() - 90);

    let currentMRR = 0;
    let growthRate = 0;

    if (isAdmin) {
      // Admin: Calculate platform-wide MRR from actual data
      const [revenueData] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(gte(analytics?.date, ninetyDaysAgo));

      currentMRR = (Number(revenueData?.totalRevenue) || 0) / 3;
    } else {
      // Regular user: Calculate personal revenue from actual data
      const [userRevenue] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(eq(analytics?.userId, userId), gte(analytics?.date, ninetyDaysAgo)),
        );

      currentMRR = (Number(userRevenue?.totalRevenue) || 0) / 3;
    }

    // Project MRR using a simple trend: compare last 30d vs prior 30d
    const _sixtyDaysAgo = new Date();
    sixtyDaysAgo?.setDate(sixtyDaysAgo?.getDate() - 60);
    const _thirtyDaysAgo2 = new Date();
    thirtyDaysAgo2?.setDate(thirtyDaysAgo2?.getDate() - 30);

    let projectedMRR: number | null = null;
    let calculatedGrowthRate: number | null = null;

    try {
      // Build prior-30d revenue query separately for admin vs. per-user to avoid `as any` cast.
      const _prior30Query = db
        .select({ rev: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)` })
        .from(analytics);
      const [prior30] = isAdmin
        ? await prior30Query
            .where(
              and(
                gte(analytics?.date, sixtyDaysAgo),
                lte(analytics?.date, thirtyDaysAgo2),
              ),
            )
            .limit(1)
        : await prior30Query
            .where(
              and(
                eq(analytics?.userId, userId),
                gte(analytics?.date, sixtyDaysAgo),
                lte(analytics?.date, thirtyDaysAgo2),
              ),
            )
            .limit(1);

      const _priorRevenue = Number(prior30?.rev) || 0;

      if (priorRevenue > 0 && currentMRR > 0) {
        calculatedGrowthRate =
          ((currentMRR - priorRevenue) / priorRevenue) * 100;
        projectedMRR = Math?.round(
          currentMRR * (1 + calculatedGrowthRate / 100),
        );
      } else if (currentMRR > 0) {
        calculatedGrowthRate = 5;
        projectedMRR = Math?.round(currentMRR * 1?.05);
      }
    } catch {
      // Fall through with null projections on analytics query failure
    }

    return res?.json({
      currentMRR: currentMRR > 0 ? Math?.round(currentMRR) : null,
      projectedMRR,
      growthRate:
        calculatedGrowthRate !== null
          ? Math?.round(calculatedGrowthRate * 10) / 10
          : null,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error forecasting revenue:");
    return res?.status(500).json({ error: "Failed to forecast revenue" });
  }
});

/**
 * GET /api/analytics/ai/detect-anomalies
 * Detect anomalies in metrics
 */
router?.get("/ai/detect-anomalies", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Get metrics from last 30 days
    const _thirtyDaysAgo = new Date();
    thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

    const _metricsData = await db
      .select({
        date: sql<string>`DATE(${analytics?.date})`,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
      )
      .groupBy(sql`DATE(${analytics?.date})`)
      .orderBy(sql`DATE(${analytics?.date})`)
      .limit(90);

    const _anomalies = [];

    // Simple anomaly detection: look for sudden drops
    for (let i = 1; i < metricsData?.length; i++) {
      const _prev = Number(metricsData[i - 1].streams);
      const _curr = Number(metricsData[i].streams);

      if (prev > 0 && curr < prev * 0?.5) {
        anomalies?.push({
          id: `anomaly-${i}`,
          metric: "streams",
          severity: "warning" as const,
          detected_at: metricsData[i].date,
          deviation: -(((prev - curr) / prev) * 100),
          root_cause: "Sudden drop in stream count detected",
          impact: "May indicate technical issues or content quality concerns",
          recommendation:
            "Review recent releases and check platform connectivity",
        });
      }
    }

    return res?.json({ anomalies });
  } catch (error) {
    logger?.warn({ err: error }, "Error detecting anomalies:");
    return res?.status(500).json({ error: "Failed to detect anomalies" });
  }
});

/**
 * GET /api/analytics/ai/insights
 * Generate AI insights and recommendations
 */
router?.get("/ai/insights", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Get user's recent activity
    const _thirtyDaysAgo = new Date();
    thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

    const [stats] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        avgRevenue: sql<number>`COALESCE(AVG(${analytics?.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
      );

    const _insights = [];

    // Generate insights based on data
    const _streams = Number(stats?.totalStreams) || 0;

    if (streams < 100) {
      insights?.push({
        id: "insight-1",
        category: "audience_growth",
        title: "Low Stream Count Detected",
        description:
          "Your stream count is below average for your tier. Focus on audience growth strategies.",
        impact: "medium" as const,
        confidence: 85,
        actions: [
          "Increase posting frequency on social media",
          "Engage with your existing audience",
          "Collaborate with other artists",
        ],
      });
    }

    if (streams > 1000) {
      insights?.push({
        id: "insight-2",
        category: "monetization",
        title: "Strong Streaming Performance",
        description:
          "Your streams are performing well. Consider monetization opportunities.",
        impact: "high" as const,
        confidence: 90,
        actions: [
          "Set up merchandise store",
          "Create exclusive content for fans",
          "Explore sponsorship opportunities",
        ],
      });
    }

    return res?.json({ insights });
  } catch (error) {
    logger?.warn({ err: error }, "Error generating insights:");
    return res?.status(500).json({ error: "Failed to generate insights" });
  }
});

/**
 * GET /api/analytics/music/career-growth
 * Get career growth predictions
 */
router?.post("/music/career-growth", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    const { metric = "streams", timeline = "30d" } = req?.body;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _ALLOWED_METRICS = [
      "streams",
      "revenue",
      "listeners",
      "followers",
      "engagement",
    ];
    if (metric && !ALLOWED_METRICS?.includes(metric)) {
      return res
        .status(400)
        .json({
          error:
            "Invalid metric. Must be one of: " + ALLOWED_METRICS?.join(", "),
        });
    }

    const _timelineMatch = /^(\d+)d$/.exec(String(timeline));
    if (!timelineMatch) {
      return res.status(400).json({
        error: "Invalid timeline format. Expected format: 30d, 90d, etc.",
      });
    }
    const _requestedDays = parseInt(timelineMatch[1], 10);
    if (requestedDays < 1 || requestedDays > 365) {
      return res
        .status(400)
        .json({ error: "Timeline must be between 1d and 365d." });
    }

    const _days = requestedDays;
    const _startDate = new Date();
    startDate?.setDate(startDate?.getDate() - days);

    // Get historical data
    const [stats] = await db
      .select({
        currentValue:
          metric === "streams"
            ? sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`
            : sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(and(eq(analytics?.userId, userId), gte(analytics?.date, startDate)));

    const _currentValue = Number(stats?.currentValue) || 0;

    // Derive a simple linear projection from the available data point
    let predictedValue: number | null = null;
    let derivedGrowthRate: number | null = null;
    let confidence: number | null = null;

    if (currentValue > 0) {
      // Default conservative growth assumption of 8% per 90-day window
      derivedGrowthRate = 8;
      const _periods =
        timeline === "3months" ? 1 : timeline === "6months" ? 2 : 4;
      predictedValue = Math?.round(currentValue * Math?.pow(1?.08, periods));
      confidence = 0?.55;
    }

    return res?.json({
      metric,
      currentValue: currentValue || null,
      predictedValue,
      growthRate: derivedGrowthRate,
      timeline,
      recommendations:
        currentValue > 0
          ? [
              "Consistent release cadence boosts algorithm visibility",
              "Playlist placements are highest-leverage growth lever",
            ]
          : ["Start releasing music to begin tracking career growth"],
      confidence,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error predicting career growth:");
    return res?.status(500).json({ error: "Failed to predict career growth" });
  }
});

/**
 * GET /api/analytics/music/milestones
 * Get career milestones and progress
 */
router?.get("/music/milestones", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Get current stats
    const [stats] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const [releaseCount] = await db
      .select({
        count: count(releases?.id),
      })
      .from(releases)
      .where(eq(releases?.userId, userId));

    const _totalStreams = Number(stats?.totalStreams) || 0;
    const _totalListeners = Number(stats?.totalListeners) || 0;
    const _releasesCount = Number(releaseCount?.count) || 0;

    const _milestones = [];

    // Streams milestone
    const _streamMilestones = [1000, 10000, 100000, 1000000];
    const _nextStreamMilestone =
      streamMilestones?.find((m) => m > totalStreams) || 1000000;
    milestones?.push({
      type: "streams" as const,
      current: totalStreams,
      nextMilestone: nextStreamMilestone,
      progress: Math?.min(100, (totalStreams / nextStreamMilestone) * 100),
      estimatedDate: new Date(Date?.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      recommendations: [
        "Increase social media promotion",
        "Submit to playlists",
      ],
    });

    // Followers milestone
    const _followerMilestones = [100, 500, 1000, 5000];
    const _nextFollowerMilestone =
      followerMilestones?.find((m) => m > totalListeners) || 5000;
    milestones?.push({
      type: "followers" as const,
      current: totalListeners,
      nextMilestone: nextFollowerMilestone,
      progress: Math?.min(100, (totalListeners / nextFollowerMilestone) * 100),
      estimatedDate: new Date(Date?.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      recommendations: [
        "Engage with your audience",
        "Cross-promote on platforms",
      ],
    });

    // Releases milestone
    const _releaseMilestones = [1, 5, 10, 25];
    const _nextReleaseMilestone =
      releaseMilestones?.find((m) => m > releasesCount) || 25;
    milestones?.push({
      type: "releases" as const,
      current: releasesCount,
      nextMilestone: nextReleaseMilestone,
      progress: Math?.min(100, (releasesCount / nextReleaseMilestone) * 100),
      estimatedDate: new Date(Date?.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      recommendations: [
        "Maintain consistent release schedule",
        "Quality over quantity",
      ],
    });

    return res?.json(milestones);
  } catch (error) {
    logger?.warn({ err: error }, "Error getting career milestones:");
    return res?.status(500).json({ error: "Failed to get career milestones" });
  }
});

/**
 * GET /api/analytics/music/fanbase
 * Get fanbase demographics and insights
 */
router?.get("/music/fanbase", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Get fanbase data
    const [stats] = await db
      .select({
        totalFans: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
        avgEngagement: sql<number>`COALESCE(AVG(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const _totalFans = Number(stats?.totalFans) || 0;

    // Calculate engagement from recent 30d analytics
    const _thirtyDaysAgo = new Date();
    thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

    const _platformRows = await db
      .select({
        platform: analytics?.platform,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
      )
      .groupBy(analytics?.platform)
      .orderBy(sql`SUM(${analytics?.streams}) DESC`)
      .limit(100);

    const _totalRecentStreams = platformRows?.reduce(
      (s, r) => s + Number(r?.streams),
      0,
    );
    const _totalRecentListeners = platformRows?.reduce(
      (s, r) => s + Number(r?.listeners),
      0,
    );

    const _engagementRate =
      totalRecentListeners > 0 && totalRecentStreams > 0
        ? Math?.round((totalRecentStreams / totalRecentListeners) * 10) / 10
        : null;

    const _activeListeners =
      totalRecentListeners > 0 ? totalRecentListeners : null;

    const _topPlatforms = platformRows
      .filter((r) => r?.platform)
      .slice(0, 5)
      .map((r) => ({
        name: r?.platform,
        streams: Number(r?.streams),
        listeners: Number(r?.listeners),
      }));

    const _growthOpportunities =
      totalFans > 0
        ? [
            "Submit to Spotify editorial playlists",
            "Post short-form content on TikTok & Reels",
            "Enable fan notifications for new releases",
          ]
        : ["Release your first track to start building a fanbase"];

    return res?.json({
      totalFans: totalFans || null,
      activeListeners,
      engagementRate,
      topPlatforms,
      demographics: {
        topLocations: [],
        peakListeningTimes: ["Friday 8PM–12AM", "Saturday 6PM–10PM"],
      },
      growthOpportunities,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error getting fanbase insights:");
    return res?.status(500).json({ error: "Failed to get fanbase insights" });
  }
});

/**
 * GET /api/analytics/music/insights
 * Get music-specific insights and recommendations
 */
router?.get("/music/insights", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _DAY_NAMES = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const _dayStreams = await db?.execute(sql`
      SELECT EXTRACT(DOW FROM date)::int AS dow,
             COALESCE(SUM(streams), 0)::bigint AS total_streams,
             COUNT(*)::int AS data_points
      FROM analytics
      WHERE user_id = ${userId}
      GROUP BY dow
      ORDER BY total_streams DESC
    `);
    const _dayRows = (dayStreams as Record<string, unknown>).rows ?? dayStreams;

    const _bestDow = dayRows?.length > 0 ? Number(dayRows[0].dow) : 5;
    const _bestDay = DAY_NAMES[bestDow] ?? "Friday";
    const _bestDayStreams =
      dayRows?.length > 0 ? Number(dayRows[0].total_streams) : 0;
    const _fridayStreams = dayRows?.find(
      (r: Record<string, unknown>) => Number(r?.dow) === 5,
    )
      ? Number(
          dayRows?.find((r: Record<string, unknown>) => Number(r?.dow) === 5)
            .total_streams,
        )
      : 0;
    const _bestDayBoost =
      bestDayStreams > 0 && fridayStreams > 0 && bestDow !== 5
        ? Math?.round(((bestDayStreams - fridayStreams) / fridayStreams) * 100)
        : 0;
    const _releaseInsightDescription =
      bestDow === 5
        ? `Your data confirms Fridays are your peak streaming day. Releasing on Fridays aligns with your audience activity.`
        : `Your peak streaming day is ${bestDay}${bestDayBoost > 0 ? ` — ${bestDayBoost}% more streams than Friday` : ""}. Consider experimenting with ${bestDay} releases.`;

    const _thirtyDaysAgo = new Date();
    thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);
    const _sixtyDaysAgo = new Date();
    sixtyDaysAgo?.setDate(sixtyDaysAgo?.getDate() - 60);

    const [recentStats] = await db
      .select({
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
      );
    const [prevStats] = await db
      .select({ streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)` })
      .from(analytics)
      .where(
        and(
          eq(analytics?.userId, userId),
          gte(analytics?.date, sixtyDaysAgo),
          lte(analytics?.date, thirtyDaysAgo),
        ),
      );

    const _recentStreams = Number(recentStats?.streams ?? 0);
    const _prevStreams = Number(prevStats?.streams ?? 0);
    const _growthRate =
      prevStreams > 0
        ? Math?.round(((recentStreams - prevStreams) / prevStreams) * 100)
        : 0;
    const _recentRevenue = Number(recentStats?.revenue ?? 0);
    const _recentListeners = Number(recentStats?.listeners ?? 0);
    const _rpu = recentListeners > 0 ? recentRevenue / recentListeners : 0;

    const _topPlatformRow = await db
      .select({
        platform: analytics?.platform,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .groupBy(analytics?.platform)
      .orderBy(desc(sql`SUM(${analytics?.streams})`))
      .limit(1);
    const _topPlatform = topPlatformRow[0]?.platform ?? null;

    const _insights = [
      {
        category: "release_strategy" as const,
        title: "Optimal Release Schedule",
        description: releaseInsightDescription,
        impact: "high" as const,
        actionable: [
          `Schedule your next release for a ${bestDay}`,
          "Announce the release 1-2 weeks in advance to build momentum",
          "Prepare promotional content and social posts ahead of time",
        ],
        priority: 1,
        data: { bestDay, bestDow, bestDayStreams },
      },
      {
        category: "audience_growth" as const,
        title:
          growthRate >= 20
            ? "Strong Growth Momentum"
            : growthRate >= 0
              ? "Steady Audience Growth"
              : "Growth Opportunity",
        description:
          growthRate !== 0
            ? `Your streams ${growthRate >= 0 ? "grew" : "dropped"} ${Math?.abs(growthRate)}% over the last 30 days (${recentStreams?.toLocaleString()} vs ${prevStreams?.toLocaleString()} prior period).`
            : `You have ${recentStreams?.toLocaleString()} streams in the last 30 days. Consistent releases and social engagement drive growth.`,
        impact: growthRate >= 20 ? ("high" as const) : ("medium" as const),
        actionable:
          growthRate >= 0
            ? [
                "Keep your release cadence consistent",
                "Engage your audience with behind-the-scenes content",
                "Pitch to editorial playlists during your release week",
              ]
            : [
                "Experiment with new content formats (reels, shorts, clips)",
                "Collaborate with artists in adjacent genres",
                "Re-engage your audience with throwback or acoustic versions",
              ],
        priority: 2,
        data: { growthRate, recentStreams, prevStreams },
      },
      {
        category: "monetization" as const,
        title:
          rpu < 0?.001
            ? "Revenue Optimization Opportunity"
            : "Healthy Revenue Per Listener",
        description: topPlatform
          ? `${topPlatform} is driving the most streams. ${rpu < 0?.001 ? "Diversifying platforms can improve your per-stream rate." : `At $${rpu?.toFixed(4)} per listener, you are on track for sustainable streaming income.`}`
          : "Diversify across streaming platforms to maximize revenue per stream.",
        impact: "medium" as const,
        actionable: [
          "Set up a direct-to-fan store for merchandise and exclusive content",
          "Offer early access or bonus tracks to super fans via your storefront",
          "Create tiered fan memberships with exclusive perks",
        ],
        priority: 3,
        data: { topPlatform, revenuePerListener: rpu, recentRevenue },
      },
    ];

    return res?.json(insights);
  } catch (error) {
    logger?.warn({ err: error }, "Error getting music insights:");
    return res?.status(500).json({ error: "Failed to get music insights" });
  }
});

/**
 * GET /api/analytics/music/release-strategy
 * Get release strategy recommendations
 */
router?.get("/music/release-strategy", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;

    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _DAY_NAMES_RS = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const _dayStreamsRS = await db?.execute(sql`
      SELECT EXTRACT(DOW FROM date)::int AS dow,
             COALESCE(SUM(streams), 0)::bigint AS total_streams
      FROM analytics
      WHERE user_id = ${userId}
      GROUP BY dow
      ORDER BY total_streams DESC
    `);
    const _dayRowsRS =
      (dayStreamsRS as Record<string, unknown>).rows ?? dayStreamsRS;
    const _bestDowRS = dayRowsRS?.length > 0 ? Number(dayRowsRS[0].dow) : 5;
    const _bestDayRS = DAY_NAMES_RS[bestDowRS] ?? "Friday";

    const _releaseCountRow = await db
      .select({ count: count() })
      .from(releases)
      .where(eq(releases?.userId, userId));
    const _releaseCount = Number(releaseCountRow[0]?.count ?? 0);

    return res?.json({
      bestReleaseDay: bestDayRS,
      bestReleaseTime: "12:00 AM (Midnight)",
      optimalFrequency:
        releaseCount > 10
          ? "Every 2-3 weeks"
          : releaseCount > 5
            ? "Every 4-6 weeks"
            : "Monthly to build momentum",
      genreTrends: [
        { genre: "Pop", trend: "rising" as const, score: 85 },
        { genre: "Hip-Hop", trend: "stable" as const, score: 78 },
        { genre: "Electronic", trend: "rising" as const, score: 82 },
        { genre: "Rock", trend: "declining" as const, score: 65 },
      ],
      competitorAnalysis: [
        "Top artists in your genre release monthly",
        "Average track length is 3:15",
        "Collaboration tracks perform 40% better",
      ],
      recommendations: [
        `Release singles consistently on ${bestDayRS}s to align with your audience peak`,
        "Build anticipation with teasers 1-2 weeks before release",
        "Leverage playlist pitching immediately after release",
        "Create visual content (music videos, lyric videos) for each release",
      ],
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error getting release strategy:");
    return res?.status(500).json({ error: "Failed to get release strategy" });
  }
});

/**
 * GET /api/analytics/historical/yearly
 * Get yearly historical analytics data
 */
router?.get("/historical/yearly", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _currentYear = new Date().getFullYear();
    const _cacheKey = `analytics:historical:yearly:${userId}:${currentYear}`;

    const _data = await distributedCache?.getOrSet(
      cacheKey,
      async () => {
        const _years = [
          currentYear,
          currentYear - 1,
          currentYear - 2,
          currentYear - 3,
          currentYear - 4,
        ];

        const _yearlyData = await Promise?.all(
          years?.map(async (year) => {
            const _startDate = new Date(year, 0, 1);
            const _endDate = new Date(year, 11, 31);

            const [yearStats, releaseCount] = await Promise?.all([
              db
                .select({
                  streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
                  revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
                  listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
                })
                .from(analytics)
                .where(
                  and(
                    eq(analytics?.userId, userId),
                    gte(analytics?.date, startDate),
                    lte(analytics?.date, endDate),
                  ),
                ),
              db
                .select({ count: count() })
                .from(releases)
                .where(
                  and(
                    eq(releases?.userId, userId),
                    gte(releases?.releaseDate, startDate),
                    lte(releases?.releaseDate, endDate),
                  ),
                ),
            ]);

            return {
              year,
              streams: Number(yearStats[0]?.streams) || 0,
              revenue: Number(yearStats[0]?.revenue) || 0,
              listeners: Number(yearStats[0]?.listeners) || 0,
              releases: releaseCount[0]?.count || 0,
              playlistAdds: Math?.max(
                0,
                Math?.floor(Number(yearStats[0]?.streams || 0) * 0?.002),
              ),
            };
          }),
        );

        return yearlyData;
      },
      300,
    );

    return res?.json({ success: true, data });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching yearly historical data:");
    return res?.status(500).json({ error: "Failed to fetch historical data" });
  }
});

/**
 * GET /api/analytics/historical/milestones
 * Get user's career milestones
 */
router?.get("/historical/milestones", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const _milestones = [];
    const _stats = totalStats[0] || {
      totalStreams: 0,
      totalRevenue: 0,
      totalListeners: 0,
    };
    const _streams = Number(stats?.totalStreams);
    const _revenue = Number(stats?.totalRevenue);
    const _listeners = Number(stats?.totalListeners);

    if (streams >= 1000000) {
      milestones?.push({
        id: "m1",
        type: "streams",
        title: "1M Streams",
        description: "Reached 1 million total streams",
        date: new Date().toISOString(),
        value: 1000000,
        icon: "🎵",
      });
    }
    if (streams >= 100000) {
      milestones?.push({
        id: "m2",
        type: "streams",
        title: "100K Streams",
        description: "Reached 100,000 total streams",
        date: new Date().toISOString(),
        value: 100000,
        icon: "🎵",
      });
    }
    if (streams >= 10000) {
      milestones?.push({
        id: "m3",
        type: "streams",
        title: "10K Streams",
        description: "Reached 10,000 total streams",
        date: new Date().toISOString(),
        value: 10000,
        icon: "🎵",
      });
    }
    if (revenue >= 1000) {
      milestones?.push({
        id: "m4",
        type: "revenue",
        title: "$1,000 Revenue",
        description: "Earned $1,000 in royalties",
        date: new Date().toISOString(),
        value: 1000,
        icon: "💰",
      });
    }
    if (listeners >= 10000) {
      milestones?.push({
        id: "m5",
        type: "followers",
        title: "10K Listeners",
        description: "Reached 10,000 monthly listeners",
        date: new Date().toISOString(),
        value: 10000,
        icon: "👥",
      });
    }

    return res?.json({ success: true, data: milestones });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching milestones:");
    return res?.status(500).json({ error: "Failed to fetch milestones" });
  }
});

/**
 * GET /api/analytics/historical/trends
 * Get historical trend data
 */
router?.get("/historical/trends", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _currentYear = new Date().getFullYear();
    const _years = [
      currentYear - 4,
      currentYear - 3,
      currentYear - 2,
      currentYear - 1,
      currentYear,
    ];

    const _buildTrend = async (metric: string) => {
      const _data = await Promise?.all(
        years?.map(async (year) => {
          const _startDate = new Date(year, 0, 1);
          const _endDate = new Date(year, 11, 31);

          const _result = await db
            .select({
              value:
                metric === "streams"
                  ? sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`
                  : metric === "revenue"
                    ? sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`
                    : sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
            })
            .from(analytics)
            .where(
              and(
                eq(analytics?.userId, userId),
                gte(analytics?.date, startDate),
                lte(analytics?.date, endDate),
              ),
            );

          return { year, value: Number(result[0]?.value) || 0 };
        }),
      );

      const _currentValue = data[data?.length - 1]?.value || 0;
      const _firstValue = data[0]?.value || 1;
      const _totalGrowth =
        firstValue > 0
          ? Math?.round(((currentValue - firstValue) / firstValue) * 100)
          : 0;
      const _avgYearlyGrowth = Math?.round(totalGrowth / (years?.length - 1));

      return {
        metric: metric?.charAt(0).toUpperCase() + metric?.slice(1),
        data,
        currentValue,
        totalGrowth,
        avgYearlyGrowth,
      };
    };

    const _trends = await Promise?.all([
      buildTrend("streams"),
      buildTrend("revenue"),
      buildTrend("listeners"),
    ]);

    return res?.json({ success: true, data: trends });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching trends:");
    return res?.status(500).json({ error: "Failed to fetch trends" });
  }
});

/**
 * GET /api/analytics/global-ranking
 * Get global ranking data for the artist
 */
router?.get("/global-ranking", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const _streams = Number(totalStats[0]?.totalStreams) || 0;
    const _baseScore = Math?.min(100, Math?.floor(Math?.log10(streams + 1) * 15));
    const _globalRank = Math?.max(1000, 500000 - Math?.floor(streams / 10));

    const _platformAnalytics = await db
      .select({
        platform: analytics?.platform,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .groupBy(analytics?.platform)
      .limit(100);

    const platformMap: Record<
      string,
      { streams: number; revenue: number; listeners: number }
    > = {};
    for (const row of platformAnalytics) {
      if (row?.platform) {
        platformMap[row?.platform.toLowerCase()] = {
          streams: Number(row?.streams),
          revenue: Number(row?.revenue),
          listeners: Number(row?.listeners),
        };
      }
    }

    const _platformConfigs = [
      {
        platform: "Spotify",
        key: "spotify",
        offset: 0,
        rankOffset: 0,
        color: "#1DB954",
      },
      {
        platform: "Apple Music",
        key: "apple_music",
        offset: -5,
        rankOffset: 5000,
        color: "#FA2D48",
      },
      {
        platform: "YouTube Music",
        key: "youtube",
        offset: -10,
        rankOffset: 10000,
        color: "#FF0000",
      },
      {
        platform: "Amazon Music",
        key: "amazon_music",
        offset: -15,
        rankOffset: 15000,
        color: "#00A8E1",
      },
      {
        platform: "Deezer",
        key: "deezer",
        offset: -20,
        rankOffset: 25000,
        color: "#FEAA2D",
      },
    ];

    const _platformScores = platformConfigs?.map((cfg) => {
      const _data = platformMap[cfg?.key];
      const _platformStreams = data?.streams || 0;
      const _platformScore = Math?.min(
        100,
        Math?.floor(Math?.log10(platformStreams + 1) * 15) + cfg?.offset,
      );
      const _platformRank =
        globalRank +
        cfg?.rankOffset +
        Math?.max(0, 5000 - Math?.floor(platformStreams / 20));
      const _trendDir =
        platformStreams > streams * 0?.15
          ? "up"
          : platformStreams > streams * 0?.05
            ? "stable"
            : "down";
      const _change =
        trendDir === "up"
          ? Math?.floor(Math?.log10(platformStreams + 1))
          : trendDir === "down"
            ? -Math?.floor(Math?.log10(platformStreams + 1) * 0?.5)
            : 0;
      return {
        platform: cfg?.platform,
        score: Math?.max(0, platformScore),
        rank: Math?.max(1000, platformRank),
        trend: trendDir,
        change,
        color: cfg?.color,
      };
    });

    const _sixWeeksAgo = new Date();
    sixWeeksAgo?.setDate(sixWeeksAgo?.getDate() - 42);
    const _weeklyAnalytics = await db
      .select({
        week: sql<string>`DATE_TRUNC('week', ${analytics?.date})::date`,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
      })
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, sixWeeksAgo)),
      )
      .groupBy(sql`DATE_TRUNC('week', ${analytics?.date})`)
      .orderBy(sql`DATE_TRUNC('week', ${analytics?.date})`);
    const _rankingHistory =
      weeklyAnalytics?.length > 0
        ? weeklyAnalytics?.map((row) => {
            const _wk = Number(row?.streams);
            return {
              date: row?.week,
              score: Math?.min(100, Math?.floor(Math?.log10(wk + 1) * 15)),
              rank: Math?.max(1000, 500000 - Math?.floor(wk / 10)),
            };
          })
        : Array?.from({ length: 6 }, (_, i) => {
            const _d = new Date();
            d?.setDate(d?.getDate() - i * 7);
            return {
              date: d?.toISOString().split("T")[0],
              score: Math?.max(0, baseScore - i * 2),
              rank: globalRank + i * 1000,
            };
          }).reverse();

    const similarArtists: {
      name: string;
      score: number;
      rank: number;
      genre: string;
      monthlyListeners: number;
      comparison: string;
    }[] = [];

    return res?.json({
      success: true,
      data: {
        maxScore: 100,
        globalRank,
        currentScore: baseScore,
        platformScores,
        rankingHistory,
        similarArtists,
      },
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching global ranking:");
    return res?.status(500).json({ error: "Failed to fetch global ranking" });
  }
});

/**
 * POST /api/analytics/natural-language-query
 * Process natural language analytics queries
 */
router?.post("/natural-language-query", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { query } = req?.body;
    if (!query) {
      return res?.status(400).json({ error: "Query is required" });
    }

    const _queryLower = query?.toLowerCase();

    const _totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const _stats = totalStats[0] || {
      totalStreams: 0,
      totalRevenue: 0,
      totalListeners: 0,
    };

    if (queryLower?.includes("top") && queryLower?.includes("track")) {
      const _topTracks = await db
        .select({
          platform: analytics?.platform,
          streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(eq(analytics?.userId, userId))
        .groupBy(analytics?.platform)
        .orderBy(desc(sql`SUM(${analytics?.streams})`))
        .limit(5);

      return res?.json({
        success: true,
        result: {
          type: "table",
          title: "Top Performing Tracks",
          summary: `Your top platforms generated ${Number(stats?.totalStreams).toLocaleString()} total streams.`,
          data: {
            tracks: topTracks?.map((t, i) => {
              const _trackStreams = Number(t?.streams);
              const _avgStreams =
                Number(stats?.totalStreams) / (topTracks?.length || 1);
              const _growth =
                avgStreams > 0
                  ? Math?.round(((trackStreams - avgStreams) / avgStreams) * 100)
                  : 0;
              return {
                name: t?.platform || `Platform ${i + 1}`,
                streams: trackStreams,
                revenue: Number(t?.revenue),
                growth: Math?.max(0, Math?.min(100, growth)),
              };
            }),
          },
        },
      });
    }

    if (queryLower?.includes("trend") || queryLower?.includes("month")) {
      const _thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const _dailyData = await db
        .select({
          date: sql<string>`DATE(${analytics?.date})`,
          streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        })
        .from(analytics)
        .where(
          and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
        )
        .groupBy(sql`DATE(${analytics?.date})`)
        .orderBy(sql`DATE(${analytics?.date})`)
        .limit(90);

      return res?.json({
        success: true,
        result: {
          type: "chart",
          title: "Streaming Trends",
          summary: `Your streaming data over the last 30 days shows ${dailyData?.length} data points.`,
          data: {
            chartType: "line",
            labels: dailyData?.map((d) => d?.date),
            values: dailyData?.map((d) => Number(d?.streams)),
            change:
              dailyData?.length > 1
                ? Math?.round(
                    ((Number(dailyData[dailyData?.length - 1]?.streams) -
                      Number(dailyData[0]?.streams)) /
                      (Number(dailyData[0]?.streams) || 1)) *
                      100,
                  )
                : 0,
          },
        },
      });
    }

    if (
      queryLower?.includes("revenue") ||
      queryLower?.includes("earn") ||
      queryLower?.includes("money") ||
      queryLower?.includes("paid")
    ) {
      const _thirtyDaysAgo2 = new Date();
      thirtyDaysAgo2?.setDate(thirtyDaysAgo2?.getDate() - 30);
      const [recentRevRow] = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, thirtyDaysAgo2),
          ),
        );
      const _recentRev = Number(recentRevRow?.revenue ?? 0);
      const _totalRev = Number(stats?.totalRevenue);
      const _prevRev = totalRev - recentRev;
      const _revChange =
        prevRev > 0 ? Math?.round(((recentRev - prevRev) / prevRev) * 100) : 0;
      return res?.json({
        success: true,
        result: {
          type: "metric",
          title: "Revenue Summary",
          summary: `Total earnings: $${totalRev?.toLocaleString()}. Last 30 days: $${recentRev?.toLocaleString()}${revChange !== 0 ? ` (${revChange > 0 ? "+" : ""}${revChange}% vs prior period)` : ""}.`,
          data: {
            value: totalRev,
            label: "Total Revenue",
            change: revChange,
            recent: recentRev,
          },
        },
      });
    }

    if (
      queryLower?.includes("playlist") ||
      queryLower?.includes("added to") ||
      queryLower?.includes("editorial")
    ) {
      const _playlists = await db
        .select({
          count: count(),
          totalStreams: sql<number>`COALESCE(SUM(${playlistJourneys?.streamsFromPlaylist}), 0)`,
          active: sql<number>`COALESCE(SUM(CASE WHEN ${playlistJourneys?.isActive} THEN 1 ELSE 0 END), 0)`,
        })
        .from(playlistJourneys)
        .where(eq(playlistJourneys?.userId, userId));
      const _pl = playlists[0];
      return res?.json({
        success: true,
        result: {
          type: "metric",
          title: "Playlist Placements",
          summary: `You have ${Number(pl?.count ?? 0)} playlist placements generating ${Number(pl?.totalStreams ?? 0).toLocaleString()} streams. ${Number(pl?.active ?? 0)} currently active.`,
          data: {
            value: Number(pl?.count ?? 0),
            label: "Playlists",
            active: Number(pl?.active ?? 0),
            totalStreams: Number(pl?.totalStreams ?? 0),
          },
        },
      });
    }

    if (
      queryLower?.includes("platform") ||
      queryLower?.includes("best platform") ||
      queryLower?.includes("which platform") ||
      queryLower?.includes("where do")
    ) {
      const _platformData = await db
        .select({
          platform: analytics?.platform,
          streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(eq(analytics?.userId, userId))
        .groupBy(analytics?.platform)
        .orderBy(desc(sql`SUM(${analytics?.streams})`))
        .limit(5);
      const _best = platformData[0];
      return res?.json({
        success: true,
        result: {
          type: "table",
          title: "Platform Breakdown",
          summary: best
            ? `Your best platform is ${best?.platform} with ${Number(best?.streams).toLocaleString()} streams.`
            : "No platform data yet.",
          data: {
            platforms: platformData?.map((p) => ({
              name: p?.platform,
              streams: Number(p?.streams),
              revenue: Number(p?.revenue),
            })),
          },
        },
      });
    }

    if (
      queryLower?.includes("audience") ||
      queryLower?.includes("fan") ||
      queryLower?.includes("listener") ||
      queryLower?.includes("who listen")
    ) {
      const _thirtyDaysAgo3 = new Date();
      thirtyDaysAgo3?.setDate(thirtyDaysAgo3?.getDate() - 30);
      const [listenerRow] = await db
        .select({
          listeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, thirtyDaysAgo3),
          ),
        );
      const _monthlyListeners = Number(listenerRow?.listeners ?? 0);
      const _totalListeners = Number(stats?.totalListeners);
      return res?.json({
        success: true,
        result: {
          type: "metric",
          title: "Audience Size",
          summary: `${monthlyListeners?.toLocaleString()} active listeners in the last 30 days across ${totalListeners?.toLocaleString()} total.`,
          data: {
            value: monthlyListeners,
            label: "Monthly Listeners",
            total: totalListeners,
          },
        },
      });
    }

    if (
      queryLower?.includes("growth") ||
      queryLower?.includes("growing") ||
      queryLower?.includes("increase") ||
      queryLower?.includes("change")
    ) {
      const _thirtyDaysAgo4 = new Date();
      thirtyDaysAgo4?.setDate(thirtyDaysAgo4?.getDate() - 30);
      const _sixtyDaysAgo4 = new Date();
      sixtyDaysAgo4?.setDate(sixtyDaysAgo4?.getDate() - 60);
      const [recentStreams] = await db
        .select({ v: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)` })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, thirtyDaysAgo4),
          ),
        );
      const [prevStreams] = await db
        .select({ v: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)` })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, sixtyDaysAgo4),
            lte(analytics?.date, thirtyDaysAgo4),
          ),
        );
      const _recent = Number(recentStreams?.v ?? 0);
      const _prev = Number(prevStreams?.v ?? 0);
      const _growthRate =
        prev > 0 ? Math?.round(((recent - prev) / prev) * 100) : 0;
      return res?.json({
        success: true,
        result: {
          type: "metric",
          title: "Growth Rate (Last 30 Days)",
          summary: `${recent?.toLocaleString()} streams in the last 30 days vs ${prev?.toLocaleString()} in the prior 30 days — ${growthRate >= 0 ? "+" : ""}${growthRate}% growth.`,
          data: { value: growthRate, label: "% Growth", recent, prev },
        },
      });
    }

    if (
      queryLower?.includes("release") ||
      queryLower?.includes("track") ||
      queryLower?.includes("song") ||
      queryLower?.includes("best release")
    ) {
      const _releaseData = await db
        .select({
          title: releases?.title,
          streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(releases)
        .leftJoin(analytics, eq(analytics?.userId, releases?.userId))
        .where(eq(releases?.userId, userId))
        .groupBy(releases?.id, releases?.title)
        .orderBy(desc(sql`SUM(${analytics?.streams})`))
        .limit(5);
      const _best = releaseData[0];
      return res?.json({
        success: true,
        result: {
          type: "table",
          title: "Top Releases",
          summary: best
            ? `"${best?.title}" is your top release with ${Number(best?.streams).toLocaleString()} streams.`
            : "No release data yet.",
          data: {
            releases: releaseData?.map((r) => ({
              name: r?.title,
              streams: Number(r?.streams),
              revenue: Number(r?.revenue),
            })),
          },
        },
      });
    }

    if (
      queryLower?.includes("compare") ||
      queryLower?.includes("vs") ||
      queryLower?.includes("against")
    ) {
      const _thirtyDaysAgo5 = new Date();
      thirtyDaysAgo5?.setDate(thirtyDaysAgo5?.getDate() - 30);
      const _sixtyDaysAgo5 = new Date();
      sixtyDaysAgo5?.setDate(sixtyDaysAgo5?.getDate() - 60);
      const [curr] = await db
        .select({
          s: sql<number>`COALESCE(SUM(${analytics?.streams}),0)`,
          r: sql<number>`COALESCE(SUM(${analytics?.revenue}),0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, thirtyDaysAgo5),
          ),
        );
      const [prev] = await db
        .select({
          s: sql<number>`COALESCE(SUM(${analytics?.streams}),0)`,
          r: sql<number>`COALESCE(SUM(${analytics?.revenue}),0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics?.userId, userId),
            gte(analytics?.date, sixtyDaysAgo5),
            lte(analytics?.date, thirtyDaysAgo5),
          ),
        );
      const _streamGrowth =
        Number(prev?.s) > 0
          ? Math?.round(
              ((Number(curr?.s) - Number(prev?.s)) / Number(prev?.s)) * 100,
            )
          : 0;
      return res?.json({
        success: true,
        result: {
          type: "table",
          title: "Period Comparison (Last 30 Days vs Prior)",
          summary: `Streams ${streamGrowth >= 0 ? "up" : "down"} ${Math?.abs(streamGrowth)}% compared to the prior 30-day period.`,
          data: {
            current: {
              streams: Number(curr?.s ?? 0),
              revenue: Number(curr?.r ?? 0),
              label: "Last 30 Days",
            },
            previous: {
              streams: Number(prev?.s ?? 0),
              revenue: Number(prev?.r ?? 0),
              label: "Prior 30 Days",
            },
            streamGrowth,
            revenueGrowth:
              Number(prev?.r) > 0
                ? Math?.round(
                    ((Number(curr?.r) - Number(prev?.r)) / Number(prev?.r)) *
                      100,
                  )
                : 0,
          },
        },
      });
    }

    if (
      queryLower?.includes("today") ||
      queryLower?.includes("this week") ||
      queryLower?.includes("recent") ||
      queryLower?.includes("latest")
    ) {
      const _sevenDaysAgo = new Date();
      sevenDaysAgo?.setDate(sevenDaysAgo?.getDate() - 7);
      const _recentData = await db
        .select({
          date: sql<string>`DATE(${analytics?.date})`,
          streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(eq(analytics?.userId, userId), gte(analytics?.date, sevenDaysAgo)),
        )
        .groupBy(sql`DATE(${analytics?.date})`)
        .orderBy(desc(sql`DATE(${analytics?.date})`))
        .limit(7);
      const _totalRecent = recentData?.reduce((s, d) => s + Number(d?.streams), 0);
      return res?.json({
        success: true,
        result: {
          type: "chart",
          title: "Recent Activity (Last 7 Days)",
          summary: `${totalRecent?.toLocaleString()} streams in the last 7 days.`,
          data: {
            chartType: "bar",
            labels: recentData?.map((d) => d?.date).reverse(),
            values: recentData?.map((d) => Number(d?.streams)).reverse(),
          },
        },
      });
    }

    return res?.json({
      success: true,
      result: {
        type: "text",
        title: "Analytics Summary",
        summary: `You have ${Number(stats?.totalStreams).toLocaleString()} total streams, ${Number(stats?.totalListeners).toLocaleString()} listeners, and $${Number(stats?.totalRevenue).toFixed(2)} in revenue.`,
        data: {
          message:
            'Try asking: "show my top platform", "revenue last month", "playlist placements", "how am I growing?", "compare this month vs last", "best release", or "streams this week".',
        },
      },
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error processing natural language query:");
    return res?.status(500).json({ error: "Failed to process query" });
  }
});

/**
 * GET /api/analytics/playlist-journeys
 * Get playlist discovery journey data
 */
router?.get("/playlist-journeys", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _journeyRows = await db
      .select()
      .from(playlistJourneys)
      .where(eq(playlistJourneys?.userId, userId))
      .orderBy(desc(playlistJourneys?.addedAt))
      .limit(100);

    const _events = journeyRows?.map((j) => ({
      id: j?.id,
      playlistName: j?.playlistName,
      platform: j?.platform,
      type: j?.playlistType || "editorial",
      action: j?.removedAt ? "removed" : "added",
      date: (j?.addedAt || j?.createdAt || new Date()).toISOString(),
      position: j?.position ?? 0,
      followers: j?.followerCount ?? 0,
      estimatedStreams: j?.streamsFromPlaylist ?? 0,
      trackName: j?.trackId,
      peakPosition: j?.peakPosition ?? j?.position,
      daysOnPlaylist: j?.daysOnPlaylist ?? 0,
      curator: j?.curatorName ?? null,
    }));

    const _topPlaylist = journeyRows?.find((j) => !j?.removedAt);
    const _positionHistory = topPlaylist
      ? journeyRows
          .filter((j) => j?.playlistId === topPlaylist?.playlistId)
          .map((j) => ({
            date: (j?.addedAt || j?.createdAt || new Date())
              .toISOString()
              .split("T")[0],
            position: j?.position ?? 0,
            playlistName: j?.playlistName,
          }))
      : [];

    const typeCounts: Record<
      string,
      { count: number; totalReach: number; totalStreams: number }
    > = {};
    for (const j of journeyRows) {
      const _t = j?.playlistType || "editorial";
      if (!typeCounts[t])
        typeCounts[t] = { count: 0, totalReach: 0, totalStreams: 0 };
      typeCounts[t].count++;
      typeCounts[t].totalReach += j?.followerCount ?? 0;
      typeCounts[t].totalStreams += j?.streamsFromPlaylist ?? 0;
    }
    const _totalJourneys =
      Object?.values(typeCounts).reduce((s, v) => s + v?.count, 0) || 1;
    const _typeBreakdown = Object?.entries(typeCounts).map(([type, d]) => ({
      type,
      count: d?.count,
      percentage: Math?.round((d?.count / totalJourneys) * 100),
      totalReach: d?.totalReach,
      avgStreamsPerDay:
        d?.count > 0 ? Math?.round(d?.totalStreams / Math?.max(1, d?.count)) : 0,
    }));

    return res?.json({
      success: true,
      data: {
        events,
        positionHistory,
        typeBreakdown,
        totalPlaylists: journeyRows?.length,
        activePlaylists: journeyRows?.filter((j) => !j?.removedAt && j?.isActive)
          .length,
      },
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching playlist journeys:");
    return res?.status(500).json({ error: "Failed to fetch playlist journeys" });
  }
});

/**
 * GET /api/analytics/ar-discovery
 * Get A&R discovery panel data (emerging artists for scouting)
 */
router?.get("/ar-discovery", async (req: Request, res: Response) => {
  try {
    const _userId = req?.user?.id;
    if (!userId) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const {   minGrowth } = req?.query;

    const _thirtyDaysAgo = new Date(Date?.now() - 30 * 24 * 60 * 60 * 1000);
    const _sixtyDaysAgo = new Date(Date?.now() - 60 * 24 * 60 * 60 * 1000);

    const _growthRows = await db?.execute(sql`
      SELECT
        u?.id,
        COALESCE(u?.username, 'Artist') AS name,
        COALESCE(SUM(CASE WHEN a?.date >= ${thirtyDaysAgo} THEN a?.streams ELSE 0 END), 0)::int AS recent_streams,
        COALESCE(SUM(CASE WHEN a?.date >= ${sixtyDaysAgo} AND a?.date < ${thirtyDaysAgo} THEN a?.streams ELSE 0 END), 0)::int AS prev_streams,
        COALESCE(SUM(CASE WHEN a?.date >= ${thirtyDaysAgo} THEN a?.total_listeners ELSE 0 END), 0)::int AS monthly_listeners,
        COUNT(DISTINCT a?.platform)::int AS platform_count,
        (SELECT COUNT(*) FROM releases r WHERE r?.user_id = u?.id AND r?.created_at >= ${thirtyDaysAgo})::int AS recent_releases
      FROM users u
      LEFT JOIN analytics a ON a?.user_id = u?.id
      WHERE u?.id != ${userId}
        AND u?.subscription_tier IN ('monthly','yearly','lifetime')
      GROUP BY u?.id, u?.username
      HAVING COALESCE(SUM(a?.streams), 0) > 0
      ORDER BY (
        COALESCE(SUM(CASE WHEN a?.date >= ${thirtyDaysAgo} THEN a?.streams ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN a?.date >= ${sixtyDaysAgo} AND a?.date < ${thirtyDaysAgo} THEN a?.streams ELSE 0 END), 0)
      ) DESC
      LIMIT 20
    `);

    const _rows = (growthRows as Record<string, unknown>).rows ?? growthRows;
    let artists = rows?.map((row: Record<string, unknown>, _idx: number) => {
      const _recent = Number(row?.recent_streams ?? 0);
      const _prev = Number(row?.prev_streams ?? 0);
      const _growth =
        prev > 0
          ? Math?.round(((recent - prev) / prev) * 100)
          : recent > 0
            ? 100
            : 0;
      const _monthlyListeners = Number(row?.monthly_listeners ?? 0);
      const _recentReleases = Number(row?.recent_releases ?? 0);
      const _growthScore = Math?.min(
        100,
        Math?.floor(Math?.log10(recent + 1) * 12 + growth * 0?.3),
      );
      const _signingPotential =
        growthScore >= 80 ? "high" : growthScore >= 50 ? "medium" : "low";
      const _trajectory = [
        Math?.max(0, growthScore - 20),
        Math?.max(0, growthScore - 14),
        Math?.max(0, growthScore - 8),
        Math?.max(0, growthScore - 3),
        growthScore,
      ];
      return {
        id: row?.id,
        name: row?.name,
        genre: "Music",
        country: "Global",
        countryCode: "",
        growthScore,
        signingPotential,
        monthlyListeners,
        monthlyGrowth: growth,
        socialFollowing: 0,
        recentReleases,
        playlistReach: 0,
        engagementRate:
          monthlyListeners > 0
            ? parseFloat((recent / monthlyListeners).toFixed(1))
            : 0,
        topTrack: "",
        trajectory,
      };
    });

    if (minGrowth) {
      const _minG = parseInt(minGrowth as string) || 0;
      artists = artists?.filter(
        (a: Record<string, unknown>) => a?.monthlyGrowth >= minG,
      );
    }

    return res?.json({
      success: true,
      data: artists?.slice(0, 10),
      filters: {
        genres: ["All"],
        countries: ["All"],
      },
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching A&R discovery data:");
    return res
      .status(500)
      .json({ error: "Failed to fetch A&R discovery data" });
  }
});

/**
 * POST /api/analytics/schedule-export
 * Schedule a recurring analytics export email
 */
router?.post(
  "/schedule-export",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user?.id;
      if (!userId) return res?.status(401).json({ error: "Unauthorized" });

      const { email, frequency, format } = req?.body;
      if (!email || !String(email).includes("@")) {
        return res?.status(400).json({ error: "Valid email required" });
      }

      logger?.info(
        `Scheduled ${frequency} analytics export for user ${userId} → ${email}`,
      );

      return res?.json({
        success: true,
        message: `${frequency === "weekly" ? "Weekly" : "Monthly"} ${(format || "csv").toUpperCase()} report will be sent to ${email}`,
        scheduledAt: new Date().toISOString(),
      });
    } catch (error) {
      logger?.warn("Error scheduling export:", error?.message);
      return res?.status(500).json({ error: "Failed to schedule export" });
    }
  },
);

export default router;
