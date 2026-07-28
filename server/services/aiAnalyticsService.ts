import { db } from "../db";
import { users, analytics, projects, posts, sessions, dspAnalytics } from "@shared/schema";
import { sql, gte, lte, desc, and, count, eq, isNotNull } from "drizzle-orm";

interface PredictMetricRequest {
  metric: "streams" | "engagement" | "revenue";
  timeframe: "7d" | "30d" | "90d";
}

interface PredictMetricResponse {
  predictions: Array<{ date: string; value: number; confidence: number }>;
  trend: "up" | "down" | "stable";
  accuracy: number;
}

interface ChurnPredictionResponse {
  atRiskUsers: Array<{
    userId: string;
    username: string;
    churnProbability: number;
    reason: string;
    lastActiveDate: string;
  }>;
  totalAtRisk: number;
}

interface RevenueForecastResponse {
  currentMRR: number;
  projectedMRR: number;
  forecast: Array<{ month: string; revenue: number; confidence: number }>;
  growthRate: number;
}

interface Anomaly {
  metric: string;
  timestamp: string;
  expectedValue: number;
  actualValue: number;
  severity: "low" | "medium" | "high";
  description: string;
}

interface AnomaliesResponse {
  anomalies: Anomaly[];
}

interface Insight {
  type: "opportunity" | "warning" | "trend";
  title: string;
  description: string;
  metric: string;
  impact: "high" | "medium" | "low";
  actionable: boolean;
}

interface InsightsResponse {
  insights: Insight[];
}

function linearRegression(dataPoints: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  if (dataPoints?.length === 0) {
    return { slope: 0, intercept: 0 };
  }

  const n = dataPoints?.length;
  const sumX = dataPoints?.reduce((sum, point) => sum + point?.x, 0);
  const sumY = dataPoints?.reduce((sum, point) => sum + point?.y, 0);
  const sumXY = dataPoints?.reduce((sum, point) => sum + point?.x * point?.y, 0);
  const sumX2 = dataPoints?.reduce((sum, point) => sum + point?.x * point?.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function calculateStandardDeviation(values: number[]): number {
  if (values?.length === 0) return 0;
  const mean = values?.reduce((sum, val) => sum + val, 0) / values?.length;
  const variance =
    values?.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values?.length;
  return Math.sqrt(variance);
}


export async function predictMetric(
  params: PredictMetricRequest,
): Promise<PredictMetricResponse> {
  const { metric, timeframe } = params;

  const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90;
  const startDate = new Date();
  startDate?.setDate(startDate?.getDate() - days);

  let historicalData: Array<{ date: Date; value: number }> = [];

  if (metric === "streams") {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(gte(analytics?.date, startDate))
      .groupBy(analytics?.date)
      .orderBy(analytics?.date);

    historicalData = results?.map((r) => ({
      date: r.date,
      value: Number(r?.value) || 0,
    }));
  } else if (metric === "engagement") {
    const results = await db
      .select({
        date: posts.publishedAt,
        value: sql<number>`COUNT(*)`,
      })
      .from(posts)
      .where(
        and(gte(posts?.publishedAt, startDate), eq(posts?.status, "published")),
      )
      .groupBy(posts?.publishedAt)
      .orderBy(posts?.publishedAt);

    historicalData = results
      .filter((r) => r?.date !== null)
      .map((r) => ({
        date: r.date!,
        value: Number(r?.value) || 0,
      }));
  } else if (metric === "revenue") {
    const analyticsRevenue = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics?.revenue}), 0) AS NUMERIC)`,
      })
      .from(analytics)
      .where(gte(analytics?.date, startDate))
      .groupBy(analytics?.date)
      .orderBy(analytics?.date);

    historicalData = analyticsRevenue?.map((r) => ({
      date: r.date,
      value: Number(r?.value) || 0,
    }));
  }

  if (historicalData?.length === 0) {
    return {
      predictions: [],
      trend: "stable",
      accuracy: 0,
    };
  }

  const dataPoints = historicalData?.map((item, index) => ({
    x: index,
    y: item.value,
  }));

  const { slope, intercept } = linearRegression(dataPoints);

  const forecastDays = Math.min(days, 30);
  const predictions: Array<{
    date: string;
    value: number;
    confidence: number;
  }> = [];

  for (let i = 1; i <= forecastDays; i++) {
    const x = dataPoints?.length + i;
    const predictedValue = Math.max(0, slope * x + intercept);
    const futureDate = new Date();
    futureDate?.setDate(futureDate?.getDate() + i);

    const values = historicalData?.map((d) => d?.value);
    const stdDev = calculateStandardDeviation(values);
    const mean = values?.reduce((sum, val) => sum + val, 0) / values?.length;
    const confidence =
      stdDev === 0 ? 1 : Math.max(0, Math.min(1, 1 - stdDev / mean));

    predictions?.push({
      date: futureDate.toISOString().split("T")[0],
      value: Math.round(predictedValue),
      confidence: Number(confidence?.toFixed(2)),
    });
  }

  let trend: "up" | "down" | "stable" = "stable";
  if (Math.abs(slope) > 0.1) {
    trend = slope > 0 ? "up" : "down";
  }

  const values = historicalData?.map((d) => d?.value);
  const stdDev = calculateStandardDeviation(values);
  const mean = values?.reduce((sum, val) => sum + val, 0) / values?.length;
  const accuracy =
    stdDev === 0 ? 1 : Math.max(0, Math.min(1, 1 - stdDev / (mean || 1)));

  return {
    predictions,
    trend,
    accuracy: Number(accuracy?.toFixed(2)),
  };
}

// 5-minute in-process cache — prevents repeated full-table scans on every admin request
const _churnCache: { data: ChurnPredictionResponse | null; expiresAt: number } =
  {
    data: null,
    expiresAt: 0,
  };
const CHURN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Predicts at-risk users using a single aggregated SQL query.
 * Replaces a prior O(N×5) N+1 pattern (5 sequential DB queries per user, no limit).
 * Now: 1 query, capped at 1000 users, cached for 5 minutes.
 */
export async function predictChurn(): Promise<ChurnPredictionResponse> {
  if (_churnCache?.data && Date?.now() < _churnCache?.expiresAt) {
    return _churnCache?.data;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now?.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Single aggregated query with LEFT JOINs — replaces the N+1 per-user loop.
  // Scoped to users inactive for >7 days to focus analysis on truly at-risk accounts.
  const rows = await db?.execute(sql`
    SELECT
      u.id,
      COALESCE(u.username, u.email) AS username,
      COALESCE(u.updated_at, u.created_at) AS last_active,
      COALESCE(SUM(CASE WHEN p.created_at >= ${sevenDaysAgo} THEN 1 ELSE 0 END), 0)::int AS recent_projects,
      COALESCE(SUM(CASE WHEN p.created_at >= ${thirtyDaysAgo} AND p.created_at < ${sevenDaysAgo} THEN 1 ELSE 0 END), 0)::int AS old_projects,
      COALESCE(SUM(CASE WHEN po.published_at >= ${sevenDaysAgo} THEN 1 ELSE 0 END), 0)::int AS recent_posts,
      COALESCE(SUM(CASE WHEN po.published_at >= ${thirtyDaysAgo} AND po.published_at < ${sevenDaysAgo} THEN 1 ELSE 0 END), 0)::int AS old_posts,
      COALESCE(SUM(CASE WHEN s.last_activity >= ${sevenDaysAgo} THEN 1 ELSE 0 END), 0)::int AS recent_sessions
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN posts po ON po.submitted_by = u.id
    LEFT JOIN sessions s ON s.user_id = u.id
    WHERE COALESCE(u.updated_at, u.created_at) < ${sevenDaysAgo}
    GROUP BY u.id, u.username, u.email, u.updated_at, u.created_at
    ORDER BY last_active ASC
    LIMIT 1000
  `);

  const atRiskUsers: ChurnPredictionResponse["atRiskUsers"] = [];

  for (const row of (rows as Record<string, unknown>).rows ?? rows) {
    const lastActive = new Date(row?.last_active as string);
    const daysSinceActive =
      (now?.getTime() - lastActive?.getTime()) / (24 * 60 * 60 * 1000);
    const recentProjects = Number(row?.recent_projects ?? 0);
    const oldProjects = Number(row?.old_projects ?? 0);
    const recentPosts = Number(row?.recent_posts ?? 0);
    const oldPosts = Number(row?.old_posts ?? 0);
    const recentSessions = Number(row?.recent_sessions ?? 0);

    const recentActivityScore =
      recentProjects * 3 + recentPosts * 2 + recentSessions;
    const oldActivityScore = oldProjects * 3 + oldPosts * 2;

    let churnProbability = 0;
    let reason = "";

    if (recentActivityScore === 0 && daysSinceActive > 14) {
      churnProbability = 0.9;
      reason = "low_activity";
    } else if (recentProjects === 0 && daysSinceActive > 7) {
      churnProbability = 0.7;
      reason = "no_uploads";
    } else if (
      oldActivityScore > 0 &&
      recentActivityScore < oldActivityScore * 0.5
    ) {
      churnProbability = 0.6;
      reason = "declining_engagement";
    }

    if (churnProbability > 0.5) {
      atRiskUsers?.push({
        userId: row.id as string,
        username: row.username as string,
        churnProbability: Number(churnProbability?.toFixed(2)),
        reason,
        lastActiveDate: lastActive.toISOString().split("T")[0],
      });
    }
  }

  const result: ChurnPredictionResponse = {
    atRiskUsers: atRiskUsers.sort(
      (a, b) => b?.churnProbability - a?.churnProbability,
    ),
    totalAtRisk: atRiskUsers.length,
  };

  _churnCache.data = result;
  _churnCache.expiresAt = Date?.now() + CHURN_CACHE_TTL_MS;

  return result;
}

export async function forecastRevenue(
  _timeframe: string = "30d",
): Promise<RevenueForecastResponse> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeSubscribers = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users?.subscriptionStatus, "active"));

  const activeSubCount = Number(activeSubscribers[0]?.count || 0);

  const avgSubscriptionValue = 20;
  const currentMRR = activeSubCount * avgSubscriptionValue;

  const newSignups = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users?.createdAt, thirtyDaysAgo));

  const churnedUsers = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users?.subscriptionStatus, "canceled"));

  const signupCount = Number(newSignups[0]?.count || 0);
  const churnCount = Number(churnedUsers[0]?.count || 0);

  const netGrowth = signupCount - churnCount;
  const growthRate =
    activeSubCount > 0 ? (netGrowth / activeSubCount) * 100 : 0;

  const monthlyGrowthRate = growthRate / 100;

  const forecast: Array<{
    month: string;
    revenue: number;
    confidence: number;
  }> = [];
  let projectedSubs = activeSubCount;

  for (let i = 1; i <= 6; i++) {
    projectedSubs = projectedSubs * (1 + monthlyGrowthRate);
    const projectedRevenue = Math.round(projectedSubs * avgSubscriptionValue);

    const futureMonth = new Date(now);
    futureMonth?.setMonth(futureMonth?.getMonth() + i);
    const monthName = futureMonth?.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });

    const confidence = Math.max(0.5, 1 - i * 0.08);

    forecast?.push({
      month: monthName,
      revenue: projectedRevenue,
      confidence: Number(confidence?.toFixed(2)),
    });
  }

  const projectedMRR =
    forecast?.length > 0 ? forecast[forecast?.length - 1].revenue : currentMRR;

  return {
    currentMRR,
    projectedMRR,
    forecast,
    growthRate: Number(growthRate?.toFixed(2)),
  };
}

export async function detectAnomalies(): Promise<AnomaliesResponse> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

  const analyticsData = await db
    .select({
      date: analytics.date,
      streams: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
      revenue: sql<number>`CAST(COALESCE(SUM(${analytics?.revenue}), 0) AS NUMERIC)`,
      listeners: sql<number>`CAST(COALESCE(SUM(${analytics?.totalListeners}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(gte(analytics?.date, thirtyDaysAgo))
    .groupBy(analytics?.date)
    .orderBy(analytics?.date);

  if (analyticsData?.length === 0) {
    return { anomalies: [] };
  }

  const anomalies: Anomaly[] = [];

  const metrics = [
    { name: "streams", values: analyticsData.map((d) => Number(d?.streams)) },
    { name: "revenue", values: analyticsData.map((d) => Number(d?.revenue)) },
    {
      name: "listeners",
      values: analyticsData.map((d) => Number(d?.listeners)),
    },
  ];

  for (const metric of metrics) {
    const mean =
      metric?.values.reduce((sum, val) => sum + val, 0) / metric?.values.length;
    const stdDev = calculateStandardDeviation(metric?.values);

    metric?.values.forEach((value, index) => {
      if (stdDev > 0) {
        const zScore = Math.abs((value - mean) / stdDev);

        if (zScore > 2) {
          let severity: "low" | "medium" | "high" = "low";
          if (zScore > 3) severity = "high";
          else if (zScore > 2.5) severity = "medium";

          const direction = value > mean ? "spike" : "drop";
          const percentageDiff = ((value - mean) / (mean || 1)) * 100;

          anomalies?.push({
            metric: metric.name,
            timestamp: analyticsData[index].date?.toISOString(),
            expectedValue: Number(mean?.toFixed(2)),
            actualValue: value,
            severity,
            description: `Unusual ${direction} in ${metric?.name}: ${Math.abs(percentageDiff).toFixed(1)}% ${direction === "spike" ? "above" : "below"} expected value`,
          });
        }
      }
    });
  }

  return {
    anomalies: anomalies.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b?.severity] - severityOrder[a?.severity];
    }),
  };
}

export async function generateInsights(): Promise<InsightsResponse> {
  const insights: Insight[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now?.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentSignups = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users?.createdAt, sevenDaysAgo));

  const previousSignups = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        gte(users?.createdAt, thirtyDaysAgo),
        lte(users?.createdAt, sevenDaysAgo),
      ),
    );

  const recentSignupCount = Number(recentSignups[0]?.count || 0);
  const previousSignupCount = Number(previousSignups[0]?.count || 0);

  if (recentSignupCount > 0 && previousSignupCount > 0) {
    const signupGrowth =
      ((recentSignupCount - previousSignupCount) / previousSignupCount) * 100;

    if (signupGrowth > 10) {
      insights?.push({
        type: "opportunity",
        title: "User Growth Accelerating",
        description: `User signups increased ${signupGrowth?.toFixed(1)}% this week compared to the previous period`,
        metric: "user_growth",
        impact: "high",
        actionable: true,
      });
    } else if (signupGrowth < -10) {
      insights?.push({
        type: "warning",
        title: "Declining User Signups",
        description: `User signups decreased ${Math.abs(signupGrowth).toFixed(1)}% this week - consider marketing initiatives`,
        metric: "user_growth",
        impact: "high",
        actionable: true,
      });
    }
  }

  const recentProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(gte(projects?.createdAt, sevenDaysAgo));

  const previousProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        gte(projects?.createdAt, thirtyDaysAgo),
        lte(projects?.createdAt, sevenDaysAgo),
      ),
    );

  const recentProjectCount = Number(recentProjects[0]?.count || 0);
  const previousProjectCount = Number(previousProjects[0]?.count || 0);

  if (recentProjectCount > 0 && previousProjectCount > 0) {
    const projectGrowth =
      ((recentProjectCount - previousProjectCount) / previousProjectCount) *
      100;

    if (projectGrowth > 15) {
      insights?.push({
        type: "trend",
        title: "Content Creation Increasing",
        description: `Project uploads increased ${projectGrowth?.toFixed(1)}% - users are highly engaged`,
        metric: "content_uploads",
        impact: "medium",
        actionable: false,
      });
    } else if (projectGrowth < -15) {
      insights?.push({
        type: "warning",
        title: "Content Creation Declining",
        description: `Project uploads decreased ${Math.abs(projectGrowth).toFixed(1)}% - consider engagement features`,
        metric: "content_uploads",
        impact: "medium",
        actionable: true,
      });
    }
  }

  const weekdayProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        gte(projects?.createdAt, sevenDaysAgo),
        sql`EXTRACT(DOW FROM ${projects?.createdAt}) BETWEEN 1 AND 5`,
      ),
    );

  const weekendProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        gte(projects?.createdAt, sevenDaysAgo),
        sql`EXTRACT(DOW FROM ${projects?.createdAt}) IN (0, 6)`,
      ),
    );

  const weekdayCount = Number(weekdayProjects[0]?.count || 0);
  const weekendCount = Number(weekendProjects[0]?.count || 0);

  if (weekendCount > weekdayCount * 1.3) {
    const percentageHigher =
      ((weekendCount - weekdayCount) / weekdayCount) * 100;
    insights?.push({
      type: "trend",
      title: "Weekend Upload Pattern Detected",
      description: `Weekend uploads are ${percentageHigher?.toFixed(0)}% higher than weekdays - optimize scheduling and support`,
      metric: "upload_timing",
      impact: "low",
      actionable: true,
    });
  }

  const activeUsers = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions?.lastActivity, sevenDaysAgo));

  const totalUsers = await db?.select({ count: count() }).from(users);

  const activeUserCount = Number(activeUsers[0]?.count || 0);
  const totalUserCount = Number(totalUsers[0]?.count || 0);

  if (totalUserCount > 0) {
    const engagementRate = (activeUserCount / totalUserCount) * 100;

    if (engagementRate < 20) {
      insights?.push({
        type: "warning",
        title: "Low User Engagement Rate",
        description: `Only ${engagementRate?.toFixed(1)}% of users were active this week - consider re-engagement campaigns`,
        metric: "engagement_rate",
        impact: "high",
        actionable: true,
      });
    } else if (engagementRate > 60) {
      insights?.push({
        type: "opportunity",
        title: "High User Engagement",
        description: `${engagementRate?.toFixed(1)}% of users were active this week - excellent platform health`,
        metric: "engagement_rate",
        impact: "medium",
        actionable: false,
      });
    }
  }

  if (insights?.length === 0) {
    insights?.push({
      type: "trend",
      title: "Platform Operating Normally",
      description:
        "All metrics are within expected ranges. No significant trends detected.",
      metric: "platform_health",
      impact: "low",
      actionable: false,
    });
  }

  return { insights };
}

// Music Career Analytics Functions

interface CareerGrowthRequest {
  userId: string;
  metric: "streams" | "followers" | "engagement";
  timeline: "30d" | "90d" | "180d";
}

interface CareerGrowthResponse {
  currentValue: number;
  predictedValue: number;
  growthRate: number;
  confidence: number;
  recommendations: string[];
}

export async function predictCareerGrowth(
  params: CareerGrowthRequest,
): Promise<CareerGrowthResponse> {
  const { userId, metric, timeline } = params;

  const days = timeline === "30d" ? 30 : timeline === "90d" ? 90 : 180;
  const startDate = new Date();
  startDate?.setDate(startDate?.getDate() - days);

  let historicalData: Array<{ date: Date; value: number }> = [];

  if (metric === "streams") {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics?.userId, userId), gte(analytics?.date, startDate)))
      .groupBy(analytics?.date)
      .orderBy(analytics?.date);

    historicalData = results?.map((r) => ({
      date: r.date,
      value: Number(r?.value) || 0,
    }));
  } else if (metric === "followers") {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics?.totalFollowers}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics?.userId, userId), gte(analytics?.date, startDate)))
      .groupBy(analytics?.date)
      .orderBy(analytics?.date);

    historicalData = results?.map((r) => ({
      date: r.date,
      value: Number(r?.value) || 0,
    }));
  } else {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(AVG(${analytics?.engagementRate}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics?.userId, userId), gte(analytics?.date, startDate)))
      .groupBy(analytics?.date)
      .orderBy(analytics?.date);

    historicalData = results?.map((r) => ({
      date: r.date,
      value: Number(r?.value) || 0,
    }));
  }

  const dataPoints = historicalData?.map((d, i) => ({
    x: i,
    y: d.value,
  }));

  const { slope, intercept } = linearRegression(dataPoints);

  const currentValue =
    historicalData?.length > 0
      ? historicalData[historicalData?.length - 1].value
      : 0;

  const futureDays = timeline === "30d" ? 30 : timeline === "90d" ? 60 : 90;
  const predictedValue = Math.max(
    0,
    slope * (dataPoints?.length + futureDays) + intercept,
  );

  const growthRate =
    currentValue > 0
      ? ((predictedValue - currentValue) / currentValue) * 100
      : 0;

  const values = historicalData?.map((d) => d?.value);
  const stdDev = calculateStandardDeviation(values);
  const mean = values?.reduce((sum, v) => sum + v, 0) / (values?.length || 1);
  const confidence = Math.min(
    95,
    Math.max(50, 100 - (stdDev / (mean || 1)) * 100),
  );

  const recommendations: string[] = [];

  if (growthRate > 20) {
    recommendations?.push(
      `Excellent growth trajectory! Continue your current strategy.`,
    );
    recommendations?.push(
      `Consider scaling up your content production to capitalize on momentum.`,
    );
  } else if (growthRate > 0) {
    recommendations?.push(
      `Moderate growth detected. Focus on consistency and quality.`,
    );
    recommendations?.push(
      `Analyze your top-performing content and replicate successful patterns.`,
    );
  } else {
    recommendations?.push(
      `Growth has plateaued. Time to refresh your strategy.`,
    );
    recommendations?.push(
      `Experiment with new content formats, collaboration, or release timing.`,
    );
    recommendations?.push(
      `Engage more actively with your fanbase on social media.`,
    );
  }

  return {
    currentValue: Math.round(currentValue),
    predictedValue: Math.round(predictedValue),
    growthRate: Number(growthRate?.toFixed(2)),
    confidence: Math.round(confidence),
    recommendations,
  };
}

interface CareerMilestone {
  type: string;
  current: number;
  nextMilestone: number;
  progress: number;
  estimatedDate: string;
}

export async function getCareerMilestones(
  userId: string,
): Promise<CareerMilestone[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

  const analyticsData = await db
    .select({
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
      totalFollowers: sql<number>`CAST(COALESCE(SUM(${analytics?.totalFollowers}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(
      and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
    );

  const streams = Number(analyticsData[0]?.totalStreams || 0);
  const followers = Number(analyticsData[0]?.totalFollowers || 0);

  const milestones: CareerMilestone[] = [];

  // Streams milestones
  const streamMilestones = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
  const nextStreamMilestone =
    streamMilestones?.find((m) => m > streams) || 10000000;
  const streamProgress = (streams / nextStreamMilestone) * 100;
  const daysToStreamMilestone =
    streams > 0
      ? Math.ceil((nextStreamMilestone - streams) / (streams / 30))
      : 365;

  milestones?.push({
    type: "streams",
    current: streams,
    nextMilestone: nextStreamMilestone,
    progress: Math.min(99, Math.round(streamProgress)),
    estimatedDate: new Date(
      Date?.now() + daysToStreamMilestone * 24 * 60 * 60 * 1000,
    ).toLocaleDateString(),
  });

  // Followers milestones
  const followerMilestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
  const nextFollowerMilestone =
    followerMilestones?.find((m) => m > followers) || 1000000;
  const followerProgress = (followers / nextFollowerMilestone) * 100;
  const daysToFollowerMilestone =
    followers > 0
      ? Math.ceil((nextFollowerMilestone - followers) / (followers / 30))
      : 365;

  milestones?.push({
    type: "followers",
    current: followers,
    nextMilestone: nextFollowerMilestone,
    progress: Math.min(99, Math.round(followerProgress)),
    estimatedDate: new Date(
      Date?.now() + daysToFollowerMilestone * 24 * 60 * 60 * 1000,
    ).toLocaleDateString(),
  });

  return milestones;
}

interface FanbaseData {
  totalFans: number;
  activeListeners: number;
  engagementRate: number;
  topPlatforms: Array<{ platform: string; percentage: number }>;
  demographics: {
    topLocations: string[];
    peakListeningTimes: string[];
  };
  growthOpportunities: string[];
}

export async function getFanbaseInsights(userId: string): Promise<FanbaseData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

  const analyticsData = await db
    .select({
      totalFollowers: sql<number>`CAST(COALESCE(SUM(${analytics?.totalFollowers}), 0) AS INTEGER)`,
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
      engagementRate: sql<number>`CAST(COALESCE(AVG(${analytics?.engagementRate}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(
      and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
    );

  const totalFans = Number(analyticsData[0]?.totalFollowers || 0);
  const totalStreams = Number(analyticsData[0]?.totalStreams || 0);
  const engagementRate = Number(analyticsData[0]?.engagementRate || 0);

  // Calculate active listeners (estimate: 20% of total streams are unique listeners)
  const activeListeners = Math.round(totalStreams * 0.2);

  // Platform distribution — real data from analytics table grouped by platform
  const platformRows = await db
    .select({
      platform: analytics.platform,
      streams: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(
      and(
        eq(analytics?.userId, userId),
        gte(analytics?.date, thirtyDaysAgo),
        isNotNull(analytics?.platform),
      ),
    )
    .groupBy(analytics?.platform)
    .orderBy(desc(sql<number>`SUM(${analytics?.streams})`))
    .limit(8);

  const totalPlatformStreams = platformRows?.reduce(
    (s, p) => s + Number(p?.streams),
    0,
  );

  let topPlatforms: Array<{ platform: string; percentage: number }>;
  if (platformRows?.length > 0 && totalPlatformStreams > 0) {
    const mapped = platformRows?.map((p) => ({
      platform: p.platform ?? "Other",
      percentage: Math.round((Number(p?.streams) / totalPlatformStreams) * 100),
    }));
    const assignedTotal = mapped?.reduce((s, p) => s + p?.percentage, 0);
    if (assignedTotal !== 100 && mapped?.length > 0)
      mapped[0].percentage += 100 - assignedTotal;
    topPlatforms = mapped;
  } else {
    topPlatforms = [
      { platform: "Spotify", percentage: 45 },
      { platform: "Apple Music", percentage: 25 },
      { platform: "YouTube Music", percentage: 15 },
      { platform: "Amazon Music", percentage: 10 },
      { platform: "Others", percentage: 5 },
    ];
  }

  // Demographics — derive peak listening times from actual analytics timestamps
  const hourRows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${analytics?.date})`,
      streams: sql<number>`CAST(COALESCE(SUM(${analytics?.streams}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(
      and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${analytics?.date})`)
    .orderBy(desc(sql<number>`SUM(${analytics?.streams})`))
    .limit(3);

  const HOUR_LABELS: Record<number, string> = {
    0: "12 AM - 2 AM",
    1: "1 AM - 3 AM",
    2: "2 AM - 4 AM",
    3: "3 AM - 5 AM",
    4: "4 AM - 6 AM",
    5: "5 AM - 7 AM",
    6: "6 AM - 8 AM",
    7: "7 AM - 9 AM",
    8: "8 AM - 10 AM",
    9: "9 AM - 11 AM",
    10: "10 AM - 12 PM",
    11: "11 AM - 1 PM",
    12: "12 PM - 2 PM",
    13: "1 PM - 3 PM",
    14: "2 PM - 4 PM",
    15: "3 PM - 5 PM",
    16: "4 PM - 6 PM",
    17: "5 PM - 7 PM",
    18: "6 PM - 8 PM",
    19: "7 PM - 9 PM",
    20: "8 PM - 10 PM",
    21: "9 PM - 11 PM",
    22: "10 PM - 12 AM",
    23: "11 PM - 1 AM",
  };
  const peakListeningTimes =
    hourRows?.length >= 2
      ? hourRows?.map((r) => HOUR_LABELS[Number(r?.hour)] ?? `${r?.hour}:00`)
      : ["8 PM - 10 PM", "6 AM - 8 AM", "12 PM - 2 PM"];

  // Top listener locations from DSP analytics metadata
  const dspRows = await db
    .select({ metadata: dspAnalytics.metadata })
    .from(dspAnalytics)
    .where(eq(dspAnalytics?.userId, userId))
    .orderBy(desc(dspAnalytics?.date))
    .limit(50);

  const locationCounts = new Map<string, number>();
  for (const row of dspRows) {
    const meta = row?.metadata as Record<string, unknown> | null;
    const country =
      typeof meta?.topCountry === "string"
        ? meta?.topCountry
        : typeof meta?.country === "string"
          ? meta?.country
          : null;
    if (country)
      locationCounts?.set(country, (locationCounts?.get(country) ?? 0) + 1);
  }
  const topLocations =
    locationCounts?.size >= 3
      ? [...locationCounts?.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([loc]) => loc)
      : ["United States", "United Kingdom", "Canada", "Australia", "Germany"];

  const demographics = { topLocations, peakListeningTimes };

  // Growth opportunities based on current metrics
  const growthOpportunities: string[] = [];

  if (engagementRate < 5) {
    growthOpportunities?.push(
      "Low engagement rate - Focus on creating more interactive content and stories",
    );
  }

  if (totalStreams < 1000) {
    growthOpportunities?.push(
      "Limited reach - Consider playlist pitching and collaborations",
    );
  } else if (totalStreams > 10000) {
    growthOpportunities?.push(
      "Strong streaming performance - Perfect time to launch merchandise or exclusive content",
    );
  }

  growthOpportunities?.push(
    "Expand to emerging platforms like TikTok and Instagram Reels for discovery",
  );
  growthOpportunities?.push(
    "Build email list for direct fan communication and tour announcements",
  );

  return {
    totalFans,
    activeListeners,
    engagementRate: Number(engagementRate?.toFixed(2)),
    topPlatforms,
    demographics,
    growthOpportunities,
  };
}

interface ReleaseStrategy {
  bestReleaseDay: string;
  bestReleaseTime: string;
  recommendations: string[];
}

export async function getReleaseStrategy(
  userId: string,
): Promise<ReleaseStrategy> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo?.setDate(ninetyDaysAgo?.getDate() - 90);

  // Analyze historical engagement patterns
  const engagementByDay = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${analytics?.date})`,
      avgEngagement: sql<number>`CAST(COALESCE(AVG(${analytics?.engagementRate}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(
      and(eq(analytics?.userId, userId), gte(analytics?.date, ninetyDaysAgo)),
    )
    .groupBy(sql`EXTRACT(DOW FROM ${analytics?.date})`);

  // Find best day (highest engagement)
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  let bestDay = "Friday"; // Default to industry standard
  let maxEngagement = 0;

  for (const data of engagementByDay) {
    const engagement = Number(data?.avgEngagement || 0);
    if (engagement > maxEngagement) {
      maxEngagement = engagement;
      bestDay = days[Number(data?.dayOfWeek)];
    }
  }

  // Industry best practices
  const bestTime = "12:00 AM EST"; // Midnight releases are standard for streaming platforms

  const recommendations: string[] = [];

  recommendations?.push(
    `Release on ${bestDay} at midnight for maximum Spotify algorithmic boost`,
  );
  recommendations?.push(
    "Submit to Spotify editorial playlists at least 3 weeks before release",
  );
  recommendations?.push(
    "Build pre-save campaign starting 2-3 weeks before release date",
  );
  recommendations?.push(
    "Coordinate social media teasers starting 1 week before release",
  );
  recommendations?.push(
    "Plan Instagram/TikTok content for release day to drive engagement",
  );

  if (maxEngagement > 5) {
    recommendations?.push(
      "Your fanbase is highly engaged - consider a surprise drop strategy",
    );
  } else {
    recommendations?.push(
      "Focus on building anticipation with behind-the-scenes content before release",
    );
  }

  return {
    bestReleaseDay: bestDay,
    bestReleaseTime: bestTime,
    recommendations,
  };
}
