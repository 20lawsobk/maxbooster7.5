import { db } from '../db';
import { users, analytics, projects, posts, orders, sessions } from '@shared/schema';
import { sql, gte, lte, desc, and, count, sum, avg, eq } from 'drizzle-orm';

interface PredictMetricRequest {
  metric: 'streams' | 'engagement' | 'revenue';
  timeframe: '7d' | '30d' | '90d';
}

interface PredictMetricResponse {
  predictions: Array<{ date: string; value: number; confidence: number }>;
  trend: 'up' | 'down' | 'stable';
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
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface AnomaliesResponse {
  anomalies: Anomaly[];
}

interface Insight {
  type: 'opportunity' | 'warning' | 'trend';
  title: string;
  description: string;
  metric: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
}

interface InsightsResponse {
  insights: Insight[];
}

/**
 * TODO: Add function documentation
 */
function linearRegression(dataPoints: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  if (dataPoints.length === 0) {
    return { slope: 0, intercept: 0 };
  }

  const n = dataPoints.length;
  const sumX = dataPoints.reduce((sum, point) => sum + point.x, 0);
  const sumY = dataPoints.reduce((sum, point) => sum + point.y, 0);
  const sumXY = dataPoints.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumX2 = dataPoints.reduce((sum, point) => sum + point.x * point.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * TODO: Add function documentation
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * TODO: Add function documentation
 */
function calculateMovingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowValues = values.slice(start, i + 1);
    const avg = windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;
    result.push(avg);
  }
  return result;
}

/**
 * TODO: Add function documentation
 */
export async function predictMetric(params: PredictMetricRequest): Promise<PredictMetricResponse> {
  const { metric, timeframe } = params;

  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let historicalData: Array<{ date: Date; value: number }> = [];

  if (metric === 'streams') {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(gte(analytics.date, startDate))
      .groupBy(analytics.date)
      .orderBy(analytics.date);

    historicalData = results.map((r) => ({
      date: r.date,
      value: Number(r.value) || 0,
    }));
  } else if (metric === 'engagement') {
    const results = await db
      .select({
        date: posts.publishedAt,
        value: sql<number>`COUNT(*)`,
      })
      .from(posts)
      .where(and(gte(posts.publishedAt, startDate), eq(posts.status, 'published')))
      .groupBy(posts.publishedAt)
      .orderBy(posts.publishedAt);

    historicalData = results
      .filter((r) => r.date !== null)
      .map((r) => ({
        date: r.date!,
        value: Number(r.value) || 0,
      }));
  } else if (metric === 'revenue') {
    const analyticsRevenue = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics.totalRevenue}), 0) AS NUMERIC)`,
      })
      .from(analytics)
      .where(gte(analytics.date, startDate))
      .groupBy(analytics.date)
      .orderBy(analytics.date);

    historicalData = analyticsRevenue.map((r) => ({
      date: r.date,
      value: Number(r.value) || 0,
    }));
  }

  if (historicalData.length === 0) {
    return {
      predictions: [],
      trend: 'stable',
      accuracy: 0,
    };
  }

  const dataPoints = historicalData.map((item, index) => ({
    x: index,
    y: item.value,
  }));

  const { slope, intercept } = linearRegression(dataPoints);

  const forecastDays = Math.min(days, 30);
  const predictions: Array<{ date: string; value: number; confidence: number }> = [];

  for (let i = 1; i <= forecastDays; i++) {
    const x = dataPoints.length + i;
    const predictedValue = Math.max(0, slope * x + intercept);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i);

    const values = historicalData.map((d) => d.value);
    const stdDev = calculateStandardDeviation(values);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const confidence = stdDev === 0 ? 1 : Math.max(0, Math.min(1, 1 - stdDev / mean));

    predictions.push({
      date: futureDate.toISOString().split('T')[0],
      value: Math.round(predictedValue),
      confidence: Number(confidence.toFixed(2)),
    });
  }

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (Math.abs(slope) > 0.1) {
    trend = slope > 0 ? 'up' : 'down';
  }

  const values = historicalData.map((d) => d.value);
  const stdDev = calculateStandardDeviation(values);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const accuracy = stdDev === 0 ? 1 : Math.max(0, Math.min(1, 1 - stdDev / (mean || 1)));

  return {
    predictions,
    trend,
    accuracy: Number(accuracy.toFixed(2)),
  };
}

/**
 * TODO: Add function documentation
 */
export async function predictChurn(): Promise<ChurnPredictionResponse> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const allUsers = await db.select().from(users);

  const atRiskUsers: ChurnPredictionResponse['atRiskUsers'] = [];

  for (const user of allUsers) {
    const recentProjects = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.userId, user.id), gte(projects.createdAt, sevenDaysAgo)));

    const oldProjects = await db
      .select({ count: count() })
      .from(projects)
      .where(
        and(
          eq(projects.userId, user.id),
          gte(projects.createdAt, thirtyDaysAgo),
          lte(projects.createdAt, sevenDaysAgo)
        )
      );

    const recentPosts = await db
      .select({ count: count() })
      .from(posts)
      .where(and(eq(posts.submittedBy, user.id), gte(posts.publishedAt, sevenDaysAgo)));

    const oldPosts = await db
      .select({ count: count() })
      .from(posts)
      .where(
        and(
          eq(posts.submittedBy, user.id),
          gte(posts.publishedAt, thirtyDaysAgo),
          lte(posts.publishedAt, sevenDaysAgo)
        )
      );

    const recentSessions = await db
      .select({ count: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gte(sessions.lastActivity, sevenDaysAgo)));

    const recentProjectCount = Number(recentProjects[0]?.count || 0);
    const oldProjectCount = Number(oldProjects[0]?.count || 0);
    const recentPostCount = Number(recentPosts[0]?.count || 0);
    const oldPostCount = Number(oldPosts[0]?.count || 0);
    const recentSessionCount = Number(recentSessions[0]?.count || 0);

    const recentActivityScore = recentProjectCount * 3 + recentPostCount * 2 + recentSessionCount;
    const oldActivityScore = oldProjectCount * 3 + oldPostCount * 2;

    const lastActive = user.updatedAt || user.createdAt;
    const daysSinceActive = (now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000);

    let churnProbability = 0;
    let reason = '';

    if (recentActivityScore === 0 && daysSinceActive > 14) {
      churnProbability = 0.9;
      reason = 'low_activity';
    } else if (recentProjectCount === 0 && daysSinceActive > 7) {
      churnProbability = 0.7;
      reason = 'no_uploads';
    } else if (oldActivityScore > 0 && recentActivityScore < oldActivityScore * 0.5) {
      churnProbability = 0.6;
      reason = 'declining_engagement';
    }

    if (churnProbability > 0.5) {
      atRiskUsers.push({
        userId: user.id,
        username: user.username || user.email,
        churnProbability: Number(churnProbability.toFixed(2)),
        reason,
        lastActiveDate: lastActive.toISOString().split('T')[0],
      });
    }
  }

  return {
    atRiskUsers: atRiskUsers.sort((a, b) => b.churnProbability - a.churnProbability),
    totalAtRisk: atRiskUsers.length,
  };
}

/**
 * TODO: Add function documentation
 */
export async function forecastRevenue(timeframe: string = '30d'): Promise<RevenueForecastResponse> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeSubscribers = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.subscriptionStatus, 'active'));

  const activeSubCount = Number(activeSubscribers[0]?.count || 0);

  const avgSubscriptionValue = 20;
  const currentMRR = activeSubCount * avgSubscriptionValue;

  const newSignups = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, thirtyDaysAgo));

  const churnedUsers = await db
    .select({ count: count() })
    .from(users)
    .where(and(eq(users.subscriptionStatus, 'canceled'), gte(users.updatedAt, thirtyDaysAgo)));

  const signupCount = Number(newSignups[0]?.count || 0);
  const churnCount = Number(churnedUsers[0]?.count || 0);

  const netGrowth = signupCount - churnCount;
  const growthRate = activeSubCount > 0 ? (netGrowth / activeSubCount) * 100 : 0;

  const monthlyGrowthRate = growthRate / 100;

  const forecast: Array<{ month: string; revenue: number; confidence: number }> = [];
  let projectedSubs = activeSubCount;

  for (let i = 1; i <= 6; i++) {
    projectedSubs = projectedSubs * (1 + monthlyGrowthRate);
    const projectedRevenue = Math.round(projectedSubs * avgSubscriptionValue);

    const futureMonth = new Date(now);
    futureMonth.setMonth(futureMonth.getMonth() + i);
    const monthName = futureMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

    const confidence = Math.max(0.5, 1 - i * 0.08);

    forecast.push({
      month: monthName,
      revenue: projectedRevenue,
      confidence: Number(confidence.toFixed(2)),
    });
  }

  const projectedMRR = forecast.length > 0 ? forecast[forecast.length - 1].revenue : currentMRR;

  return {
    currentMRR,
    projectedMRR,
    forecast,
    growthRate: Number(growthRate.toFixed(2)),
  };
}

/**
 * TODO: Add function documentation
 */
export async function detectAnomalies(): Promise<AnomaliesResponse> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const analyticsData = await db
    .select({
      date: analytics.date,
      streams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      revenue: sql<number>`CAST(COALESCE(SUM(${analytics.totalRevenue}), 0) AS NUMERIC)`,
      listeners: sql<number>`CAST(COALESCE(SUM(${analytics.totalListeners}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(gte(analytics.date, thirtyDaysAgo))
    .groupBy(analytics.date)
    .orderBy(analytics.date);

  if (analyticsData.length === 0) {
    return { anomalies: [] };
  }

  const anomalies: Anomaly[] = [];

  const metrics = [
    { name: 'streams', values: analyticsData.map((d) => Number(d.streams)) },
    { name: 'revenue', values: analyticsData.map((d) => Number(d.revenue)) },
    { name: 'listeners', values: analyticsData.map((d) => Number(d.listeners)) },
  ];

  for (const metric of metrics) {
    const mean = metric.values.reduce((sum, val) => sum + val, 0) / metric.values.length;
    const stdDev = calculateStandardDeviation(metric.values);

    metric.values.forEach((value, index) => {
      if (stdDev > 0) {
        const zScore = Math.abs((value - mean) / stdDev);

        if (zScore > 2) {
          let severity: 'low' | 'medium' | 'high' = 'low';
          if (zScore > 3) severity = 'high';
          else if (zScore > 2.5) severity = 'medium';

          const direction = value > mean ? 'spike' : 'drop';
          const percentageDiff = ((value - mean) / (mean || 1)) * 100;

          anomalies.push({
            metric: metric.name,
            timestamp: analyticsData[index].date.toISOString(),
            expectedValue: Number(mean.toFixed(2)),
            actualValue: value,
            severity,
            description: `Unusual ${direction} in ${metric.name}: ${Math.abs(percentageDiff).toFixed(1)}% ${direction === 'spike' ? 'above' : 'below'} expected value`,
          });
        }
      }
    });
  }

  return {
    anomalies: anomalies.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    }),
  };
}

/**
 * TODO: Add function documentation
 */
export async function generateInsights(): Promise<InsightsResponse> {
  const insights: Insight[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentSignups = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, sevenDaysAgo));

  const previousSignups = await db
    .select({ count: count() })
    .from(users)
    .where(and(gte(users.createdAt, thirtyDaysAgo), lte(users.createdAt, sevenDaysAgo)));

  const recentSignupCount = Number(recentSignups[0]?.count || 0);
  const previousSignupCount = Number(previousSignups[0]?.count || 0);

  if (recentSignupCount > 0 && previousSignupCount > 0) {
    const signupGrowth = ((recentSignupCount - previousSignupCount) / previousSignupCount) * 100;

    if (signupGrowth > 10) {
      insights.push({
        type: 'opportunity',
        title: 'User Growth Accelerating',
        description: `User signups increased ${signupGrowth.toFixed(1)}% this week compared to the previous period`,
        metric: 'user_growth',
        impact: 'high',
        actionable: true,
      });
    } else if (signupGrowth < -10) {
      insights.push({
        type: 'warning',
        title: 'Declining User Signups',
        description: `User signups decreased ${Math.abs(signupGrowth).toFixed(1)}% this week - consider marketing initiatives`,
        metric: 'user_growth',
        impact: 'high',
        actionable: true,
      });
    }
  }

  const recentProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(gte(projects.createdAt, sevenDaysAgo));

  const previousProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(and(gte(projects.createdAt, thirtyDaysAgo), lte(projects.createdAt, sevenDaysAgo)));

  const recentProjectCount = Number(recentProjects[0]?.count || 0);
  const previousProjectCount = Number(previousProjects[0]?.count || 0);

  if (recentProjectCount > 0 && previousProjectCount > 0) {
    const projectGrowth =
      ((recentProjectCount - previousProjectCount) / previousProjectCount) * 100;

    if (projectGrowth > 15) {
      insights.push({
        type: 'trend',
        title: 'Content Creation Increasing',
        description: `Project uploads increased ${projectGrowth.toFixed(1)}% - users are highly engaged`,
        metric: 'content_uploads',
        impact: 'medium',
        actionable: false,
      });
    } else if (projectGrowth < -15) {
      insights.push({
        type: 'warning',
        title: 'Content Creation Declining',
        description: `Project uploads decreased ${Math.abs(projectGrowth).toFixed(1)}% - consider engagement features`,
        metric: 'content_uploads',
        impact: 'medium',
        actionable: true,
      });
    }
  }

  const weekdayProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        gte(projects.createdAt, sevenDaysAgo),
        sql`EXTRACT(DOW FROM ${projects.createdAt}) BETWEEN 1 AND 5`
      )
    );

  const weekendProjects = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        gte(projects.createdAt, sevenDaysAgo),
        sql`EXTRACT(DOW FROM ${projects.createdAt}) IN (0, 6)`
      )
    );

  const weekdayCount = Number(weekdayProjects[0]?.count || 0);
  const weekendCount = Number(weekendProjects[0]?.count || 0);

  if (weekendCount > weekdayCount * 1.3) {
    const percentageHigher = ((weekendCount - weekdayCount) / weekdayCount) * 100;
    insights.push({
      type: 'trend',
      title: 'Weekend Upload Pattern Detected',
      description: `Weekend uploads are ${percentageHigher.toFixed(0)}% higher than weekdays - optimize scheduling and support`,
      metric: 'upload_timing',
      impact: 'low',
      actionable: true,
    });
  }

  const activeUsers = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions.lastActivity, sevenDaysAgo));

  const totalUsers = await db.select({ count: count() }).from(users);

  const activeUserCount = Number(activeUsers[0]?.count || 0);
  const totalUserCount = Number(totalUsers[0]?.count || 0);

  if (totalUserCount > 0) {
    const engagementRate = (activeUserCount / totalUserCount) * 100;

    if (engagementRate < 20) {
      insights.push({
        type: 'warning',
        title: 'Low User Engagement Rate',
        description: `Only ${engagementRate.toFixed(1)}% of users were active this week - consider re-engagement campaigns`,
        metric: 'engagement_rate',
        impact: 'high',
        actionable: true,
      });
    } else if (engagementRate > 60) {
      insights.push({
        type: 'opportunity',
        title: 'High User Engagement',
        description: `${engagementRate.toFixed(1)}% of users were active this week - excellent platform health`,
        metric: 'engagement_rate',
        impact: 'medium',
        actionable: false,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      type: 'trend',
      title: 'Platform Operating Normally',
      description: 'All metrics are within expected ranges. No significant trends detected.',
      metric: 'platform_health',
      impact: 'low',
      actionable: false,
    });
  }

  return { insights };
}

// Music Career Analytics Functions

interface CareerGrowthRequest {
  userId: string;
  metric: 'streams' | 'followers' | 'engagement';
  timeline: '30d' | '90d' | '180d';
}

interface CareerGrowthResponse {
  currentValue: number;
  predictedValue: number;
  growthRate: number;
  confidence: number;
  recommendations: string[];
}

/**
 * TODO: Add function documentation
 */
export async function predictCareerGrowth(
  params: CareerGrowthRequest
): Promise<CareerGrowthResponse> {
  const { userId, metric, timeline } = params;

  const days = timeline === '30d' ? 30 : timeline === '90d' ? 90 : 180;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let historicalData: Array<{ date: Date; value: number }> = [];

  if (metric === 'streams') {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)))
      .groupBy(analytics.date)
      .orderBy(analytics.date);

    historicalData = results.map((r) => ({
      date: r.date,
      value: Number(r.value) || 0,
    }));
  } else if (metric === 'followers') {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(SUM(${analytics.totalFollowers}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)))
      .groupBy(analytics.date)
      .orderBy(analytics.date);

    historicalData = results.map((r) => ({
      date: r.date,
      value: Number(r.value) || 0,
    }));
  } else {
    const results = await db
      .select({
        date: analytics.date,
        value: sql<number>`CAST(COALESCE(AVG(${analytics.engagementRate}), 0) AS INTEGER)`,
      })
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)))
      .groupBy(analytics.date)
      .orderBy(analytics.date);

    historicalData = results.map((r) => ({
      date: r.date,
      value: Number(r.value) || 0,
    }));
  }

  const dataPoints = historicalData.map((d, i) => ({
    x: i,
    y: d.value,
  }));

  const { slope, intercept } = linearRegression(dataPoints);

  const currentValue =
    historicalData.length > 0 ? historicalData[historicalData.length - 1].value : 0;

  const futureDays = timeline === '30d' ? 30 : timeline === '90d' ? 60 : 90;
  const predictedValue = Math.max(0, slope * (dataPoints.length + futureDays) + intercept);

  const growthRate = currentValue > 0 ? ((predictedValue - currentValue) / currentValue) * 100 : 0;

  const values = historicalData.map((d) => d.value);
  const stdDev = calculateStandardDeviation(values);
  const mean = values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
  const confidence = Math.min(95, Math.max(50, 100 - (stdDev / (mean || 1)) * 100));

  const recommendations: string[] = [];

  if (growthRate > 20) {
    recommendations.push(`Excellent growth trajectory! Continue your current strategy.`);
    recommendations.push(`Consider scaling up your content production to capitalize on momentum.`);
  } else if (growthRate > 0) {
    recommendations.push(`Moderate growth detected. Focus on consistency and quality.`);
    recommendations.push(`Analyze your top-performing content and replicate successful patterns.`);
  } else {
    recommendations.push(`Growth has plateaued. Time to refresh your strategy.`);
    recommendations.push(`Experiment with new content formats, collaboration, or release timing.`);
    recommendations.push(`Engage more actively with your fanbase on social media.`);
  }

  return {
    currentValue: Math.round(currentValue),
    predictedValue: Math.round(predictedValue),
    growthRate: Number(growthRate.toFixed(2)),
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

/**
 * TODO: Add function documentation
 */
export async function getCareerMilestones(userId: string): Promise<CareerMilestone[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const analyticsData = await db
    .select({
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      totalFollowers: sql<number>`CAST(COALESCE(SUM(${analytics.totalFollowers}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)));

  const streams = Number(analyticsData[0]?.totalStreams || 0);
  const followers = Number(analyticsData[0]?.totalFollowers || 0);

  const milestones: CareerMilestone[] = [];

  // Streams milestones
  const streamMilestones = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
  const nextStreamMilestone = streamMilestones.find((m) => m > streams) || 10000000;
  const streamProgress = (streams / nextStreamMilestone) * 100;
  const daysToStreamMilestone =
    streams > 0 ? Math.ceil((nextStreamMilestone - streams) / (streams / 30)) : 365;

  milestones.push({
    type: 'streams',
    current: streams,
    nextMilestone: nextStreamMilestone,
    progress: Math.min(99, Math.round(streamProgress)),
    estimatedDate: new Date(
      Date.now() + daysToStreamMilestone * 24 * 60 * 60 * 1000
    ).toLocaleDateString(),
  });

  // Followers milestones
  const followerMilestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
  const nextFollowerMilestone = followerMilestones.find((m) => m > followers) || 1000000;
  const followerProgress = (followers / nextFollowerMilestone) * 100;
  const daysToFollowerMilestone =
    followers > 0 ? Math.ceil((nextFollowerMilestone - followers) / (followers / 30)) : 365;

  milestones.push({
    type: 'followers',
    current: followers,
    nextMilestone: nextFollowerMilestone,
    progress: Math.min(99, Math.round(followerProgress)),
    estimatedDate: new Date(
      Date.now() + daysToFollowerMilestone * 24 * 60 * 60 * 1000
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

/**
 * TODO: Add function documentation
 */
export async function getFanbaseInsights(userId: string): Promise<FanbaseData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const analyticsData = await db
    .select({
      totalFollowers: sql<number>`CAST(COALESCE(SUM(${analytics.totalFollowers}), 0) AS INTEGER)`,
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      engagementRate: sql<number>`CAST(COALESCE(AVG(${analytics.engagementRate}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)));

  const totalFans = Number(analyticsData[0]?.totalFollowers || 0);
  const totalStreams = Number(analyticsData[0]?.totalStreams || 0);
  const engagementRate = Number(analyticsData[0]?.engagementRate || 0);

  // Calculate active listeners (estimate: 20% of total streams are unique listeners)
  const activeListeners = Math.round(totalStreams * 0.2);

  // Platform distribution (simulated data based on industry averages)
  const topPlatforms = [
    { platform: 'Spotify', percentage: 45 },
    { platform: 'Apple Music', percentage: 25 },
    { platform: 'YouTube Music', percentage: 15 },
    { platform: 'Amazon Music', percentage: 10 },
    { platform: 'Others', percentage: 5 },
  ];

  // Demographics (simulated - would come from platform APIs in production)
  const demographics = {
    topLocations: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany'],
    peakListeningTimes: ['8 PM - 10 PM', '6 AM - 8 AM', '12 PM - 2 PM'],
  };

  // Growth opportunities based on current metrics
  const growthOpportunities: string[] = [];

  if (engagementRate < 5) {
    growthOpportunities.push(
      'Low engagement rate - Focus on creating more interactive content and stories'
    );
  }

  if (totalStreams < 1000) {
    growthOpportunities.push('Limited reach - Consider playlist pitching and collaborations');
  } else if (totalStreams > 10000) {
    growthOpportunities.push(
      'Strong streaming performance - Perfect time to launch merchandise or exclusive content'
    );
  }

  growthOpportunities.push(
    'Expand to emerging platforms like TikTok and Instagram Reels for discovery'
  );
  growthOpportunities.push('Build email list for direct fan communication and tour announcements');

  return {
    totalFans,
    activeListeners,
    engagementRate: Number(engagementRate.toFixed(2)),
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

/**
 * TODO: Add function documentation
 */
export async function getReleaseStrategy(userId: string): Promise<ReleaseStrategy> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Analyze historical engagement patterns
  const engagementByDay = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${analytics.date})`,
      avgEngagement: sql<number>`CAST(COALESCE(AVG(${analytics.engagementRate}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(and(eq(analytics.userId, userId), gte(analytics.date, ninetyDaysAgo)))
    .groupBy(sql`EXTRACT(DOW FROM ${analytics.date})`);

  // Find best day (highest engagement)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay = 'Friday'; // Default to industry standard
  let maxEngagement = 0;

  for (const data of engagementByDay) {
    const engagement = Number(data.avgEngagement || 0);
    if (engagement > maxEngagement) {
      maxEngagement = engagement;
      bestDay = days[Number(data.dayOfWeek)];
    }
  }

  // Industry best practices
  const bestTime = '12:00 AM EST'; // Midnight releases are standard for streaming platforms

  const recommendations: string[] = [];

  recommendations.push(`Release on ${bestDay} at midnight for maximum Spotify algorithmic boost`);
  recommendations.push('Submit to Spotify editorial playlists at least 3 weeks before release');
  recommendations.push('Build pre-save campaign starting 2-3 weeks before release date');
  recommendations.push('Coordinate social media teasers starting 1 week before release');
  recommendations.push('Plan Instagram/TikTok content for release day to drive engagement');

  if (maxEngagement > 5) {
    recommendations.push('Your fanbase is highly engaged - consider a surprise drop strategy');
  } else {
    recommendations.push(
      'Focus on building anticipation with behind-the-scenes content before release'
    );
  }

  return {
    bestReleaseDay: bestDay,
    bestReleaseTime: bestTime,
    recommendations,
  };
}
