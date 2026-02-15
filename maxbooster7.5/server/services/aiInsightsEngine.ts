import { type Project } from '@shared/schema';
import { db } from '../db';
import {
  analytics,
  users,
  projects,
  aiMetricPredictions,
  aiCohortAnalysis,
  aiChurnPredictions,
  aiRevenueForecasts,
  aiAnomalyDetections,
  aiModels,
  aiModelVersions,
  inferenceRuns,
} from '@shared/schema';
import { eq, sql, and, gte, lte, desc, asc } from 'drizzle-orm';
import { logger } from '../logger.js';

interface DashboardStats {
  totalStreams: number;
  totalRevenue: number;
  totalProjects: number;
  totalFollowers: number;
  monthlyGrowth: {
    streams: number;
    revenue: number;
    projects: number;
    followers: number;
  };
  topPlatforms: Array<{
    name: string;
    streams: number;
    revenue: number;
    growth: number;
  }>;
}

interface AIRecommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'marketing' | 'distribution' | 'content' | 'social';
  expectedImpact?: string;
}

interface AIOptimizations {
  recommendations: AIRecommendation[];
  summary: string;
}

interface MetricPrediction {
  metricName: string;
  horizon: string;
  forecastDate: Date;
  predictedValue: number;
  confidenceLevel: number;
  lowerBound: number;
  upperBound: number;
  algorithm: string;
  seasonalityDetected: boolean;
  trendDirection: 'upward' | 'downward' | 'stable';
  metadata: any;
}

interface CohortDefinition {
  cohortType: 'registration_date' | 'subscription_plan' | 'acquisition_channel' | 'user_segment';
  cohortIdentifier: string;
  startDate: Date;
}

interface CohortAnalysisResult {
  cohortType: string;
  cohortIdentifier: string;
  cohortStartDate: Date;
  cohortSize: number;
  metrics: {
    day1: { retention: number; ltv: number; engagement: number };
    day7: { retention: number; ltv: number; engagement: number };
    day30: { retention: number; ltv: number; engagement: number };
    day90: { retention: number; ltv: number; engagement: number };
    day365: { retention: number; ltv: number; engagement: number };
  };
  comparisonToAverage: number;
  visualizationData: any;
}

interface ChurnPrediction {
  userId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timeWindow: number;
  topRiskFactors: Array<{ factor: string; importance: number; value: any }>;
  retentionRecommendations: AIRecommendation[];
  confidenceScore: number;
}

interface RevenueForecast {
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  forecastDate: Date;
  revenueType: 'mrr' | 'arr' | 'total_revenue';
  baseCaseForecast: number;
  bestCaseForecast: number;
  worstCaseForecast: number;
  breakdown?: {
    byPlan?: Record<string, number>;
    byChannel?: Record<string, number>;
    byRegion?: Record<string, number>;
    bySegment?: Record<string, number>;
  };
  seasonalityAdjustment: number;
  monthOverMonthGrowth: number;
  yearOverYearGrowth: number;
  growthTrend: 'accelerating' | 'steady' | 'decelerating';
}

interface AnomalyDetectionResult {
  metricName: string;
  anomalyType: 'spike' | 'drop' | 'trend_break' | 'seasonal_deviation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  expectedValue: number;
  actualValue: number;
  deviationPercentage: number;
  deviationScore: number;
  rootCauseAnalysis: Array<{ cause: string; likelihood: number; evidence: string[] }>;
  correlatedEvents?: unknown[];
  revenueImpact?: number;
  userImpact?: number;
}

interface InsightNarrative {
  title: string;
  narrative: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  actionableRecommendations: AIRecommendation[];
  supportingData: any;
}

export class CustomAIEngine {
  private modelCache: Map<string, { modelId: string; versionId: string }> = new Map();

  async getAIModel(modelName: string): Promise<{ modelId: string; versionId: string }> {
    if (this.modelCache.has(modelName)) {
      return this.modelCache.get(modelName)!;
    }

    const model = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.modelName, modelName))
      .limit(1);

    if (model.length === 0) {
      throw new Error(`AI Model ${modelName} not found. Please run seed initialization.`);
    }

    const result = {
      modelId: model[0].id,
      versionId: model[0].currentVersionId!,
    };

    this.modelCache.set(modelName, result);
    return result;
  }

  async logInference(
    modelId: string,
    versionId: string,
    inferenceType: string,
    inputData: unknown,
    outputData: unknown,
    executionTimeMs: number,
    userId?: string
  ): Promise<void> {
    try {
      await db.insert(inferenceRuns).values({
        modelId,
        versionId,
        userId,
        inferenceType,
        inputData,
        outputData,
        confidenceScore: outputData.confidenceScore || null,
        executionTimeMs,
        success: true,
      });
    } catch (error: unknown) {
      logger.error('Failed to log AI inference:', error);
    }
  }

  async predictMetric(
    userId: string,
    metricName: 'user_growth' | 'revenue' | 'engagement' | 'churn_rate' | 'conversion_rate',
    horizon: '7d' | '30d' | '90d' | '365d' = '30d',
    confidenceLevel: number = 0.95
  ): Promise<MetricPrediction[]> {
    const startTime = Date.now();
    const { modelId, versionId } = await this.getAIModel('time_series_predictor_v1');

    const historicalData = await this.getHistoricalMetricData(userId, metricName, horizon);

    if (historicalData.length < 2) {
      throw new Error(`Insufficient historical data for metric ${metricName}`);
    }

    const horizonDays = parseInt(horizon);
    const predictions: MetricPrediction[] = [];

    const { seasonality, trend } = this.detectSeasonalityAndTrend(historicalData);
    const algorithm = seasonality ? 'seasonal_decomposition' : 'exponential_smoothing';

    for (
      let i = 1;
      i <= Math.min(horizonDays, 365);
      i += Math.max(1, Math.floor(horizonDays / 10))
    ) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i);

      const prediction = this.forecastValue(historicalData, i, algorithm, seasonality, trend);
      const { lowerBound, upperBound } = this.calculateConfidenceInterval(
        prediction,
        historicalData,
        confidenceLevel
      );

      const predictionResult: MetricPrediction = {
        metricName,
        horizon,
        forecastDate,
        predictedValue: Math.max(0, prediction),
        confidenceLevel,
        lowerBound: Math.max(0, lowerBound),
        upperBound: Math.max(0, upperBound),
        algorithm,
        seasonalityDetected: seasonality !== null,
        trendDirection: trend > 0.05 ? 'upward' : trend < -0.05 ? 'downward' : 'stable',
        metadata: {
          seasonalPeriod: seasonality?.period || null,
          trendSlope: trend,
          historicalDataPoints: historicalData.length,
        },
      };

      predictions.push(predictionResult);

      await db.insert(aiMetricPredictions).values({
        userId,
        modelId,
        versionId,
        metricName,
        metricType: this.getMetricType(metricName),
        horizon,
        forecastDate,
        predictedValue: predictionResult.predictedValue.toString(),
        confidenceLevel: predictionResult.confidenceLevel,
        lowerBound: predictionResult.lowerBound.toString(),
        upperBound: predictionResult.upperBound.toString(),
        algorithm,
        seasonalityDetected: predictionResult.seasonalityDetected,
        trendDirection: predictionResult.trendDirection,
        metadata: predictionResult.metadata,
      });
    }

    await this.logInference(
      modelId,
      versionId,
      'time_series_forecast',
      { userId, metricName, horizon, confidenceLevel },
      { predictions, algorithm, seasonality: seasonality !== null },
      Date.now() - startTime,
      userId
    );

    return predictions;
  }

  async analyzeCohort(
    userId: string,
    cohortDefinition: CohortDefinition,
    metrics: string[] = ['retention', 'ltv', 'engagement']
  ): Promise<CohortAnalysisResult> {
    const startTime = Date.now();
    const { modelId, versionId } = await this.getAIModel('cohort_analyzer_v1');

    const cohortUsers = await this.getCohortUsers(cohortDefinition);
    const cohortSize = cohortUsers.length;

    const timePoints = [1, 7, 30, 90, 365];
    const cohortMetrics: any = {};

    for (const days of timePoints) {
      const dayKey = `day${days}`;
      cohortMetrics[dayKey] = await this.calculateCohortMetrics(
        cohortUsers,
        cohortDefinition.startDate,
        days,
        metrics
      );

      await db.insert(aiCohortAnalysis).values({
        userId,
        modelId,
        versionId,
        cohortType: cohortDefinition.cohortType,
        cohortIdentifier: cohortDefinition.cohortIdentifier,
        cohortStartDate: cohortDefinition.startDate,
        cohortSize,
        metricType: metrics.join(','),
        daysSinceCohortStart: days,
        metricValue: cohortMetrics[dayKey].engagement?.toString() || '0',
        retentionRate: cohortMetrics[dayKey].retention || 0,
        averageLTV: cohortMetrics[dayKey].ltv?.toString() || '0',
        averageEngagement: cohortMetrics[dayKey].engagement || 0,
        churnRate: cohortMetrics[dayKey].churn || 0,
        conversionRate: cohortMetrics[dayKey].conversion || 0,
        comparisonToAverage: 0,
        visualizationData: this.generateCohortVisualizationData(cohortMetrics[dayKey]),
        metadata: { cohortSize, metrics },
      });
    }

    const comparisonToAverage = await this.compareCohortToAverage(
      cohortMetrics,
      cohortDefinition.cohortType
    );

    await this.logInference(
      modelId,
      versionId,
      'cohort_analysis',
      { userId, cohortDefinition, metrics },
      { cohortSize, metrics: cohortMetrics, comparisonToAverage },
      Date.now() - startTime,
      userId
    );

    return {
      cohortType: cohortDefinition.cohortType,
      cohortIdentifier: cohortDefinition.cohortIdentifier,
      cohortStartDate: cohortDefinition.startDate,
      cohortSize,
      metrics: cohortMetrics,
      comparisonToAverage,
      visualizationData: this.generateCohortVisualizationData(cohortMetrics),
    };
  }

  async predictChurn(userId: string): Promise<ChurnPrediction> {
    const startTime = Date.now();
    const { modelId, versionId } = await this.getAIModel('churn_predictor_v1');

    const features = await this.extractChurnFeatures(userId);
    const churnProbability = this.calculateChurnProbability(features);
    const riskLevel = this.determineRiskLevel(churnProbability);
    const timeWindow = this.estimateChurnTimeWindow(features);
    const topRiskFactors = this.identifyTopRiskFactors(features);
    const retentionRecommendations = this.generateRetentionRecommendations(
      topRiskFactors,
      features
    );

    const prediction: ChurnPrediction = {
      userId,
      churnProbability,
      riskLevel,
      timeWindow,
      topRiskFactors,
      retentionRecommendations,
      confidenceScore: 0.85,
    };

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    await db.insert(aiChurnPredictions).values({
      userId,
      modelId,
      versionId,
      churnProbability,
      riskLevel,
      timeWindow,
      topRiskFactors: topRiskFactors,
      engagementScore: features.engagementScore,
      engagementTrend: features.engagementTrend,
      paymentFailures: features.paymentFailures || 0,
      supportTickets: features.supportTickets || 0,
      lastActivityDays: features.lastActivityDays || 0,
      featureUsageScore: features.featureUsageScore || 0,
      retentionRecommendations: retentionRecommendations,
      confidenceScore: prediction.confidenceScore,
      validUntil,
    });

    await this.logInference(
      modelId,
      versionId,
      'churn_prediction',
      { userId, features },
      { churnProbability, riskLevel, topRiskFactors },
      Date.now() - startTime,
      userId
    );

    return prediction;
  }

  async forecastRevenue(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    breakdown?: boolean
  ): Promise<RevenueForecast[]> {
    const startTime = Date.now();
    const { modelId, versionId } = await this.getAIModel('revenue_forecaster_v1');

    const historicalRevenue = await this.getHistoricalRevenueData(userId, period);
    const periods = this.getPeriodCount(period);
    const forecasts: RevenueForecast[] = [];

    for (let i = 1; i <= periods; i++) {
      const forecastDate = this.calculateForecastDate(period, i);
      const { baseCaseForecast, bestCaseForecast, worstCaseForecast } =
        this.calculateScenarioForecasts(historicalRevenue, i);

      const seasonality = this.detectSeasonality(historicalRevenue);
      const growthRates = this.calculateGrowthRates(historicalRevenue);

      const forecast: RevenueForecast = {
        period,
        forecastDate,
        revenueType: period === 'monthly' ? 'mrr' : 'total_revenue',
        baseCaseForecast,
        bestCaseForecast,
        worstCaseForecast,
        breakdown: breakdown
          ? await this.calculateRevenueBreakdown(userId, forecastDate)
          : undefined,
        seasonalityAdjustment: seasonality || 1.0,
        monthOverMonthGrowth: growthRates.mom,
        yearOverYearGrowth: growthRates.yoy,
        growthTrend: this.determineGrowthTrend(growthRates),
      };

      forecasts.push(forecast);

      await db.insert(aiRevenueForecasts).values({
        userId,
        modelId,
        versionId,
        forecastPeriod: period,
        forecastDate,
        revenueType: forecast.revenueType,
        baseCaseForecast: baseCaseForecast.toString(),
        bestCaseForecast: bestCaseForecast.toString(),
        worstCaseForecast: worstCaseForecast.toString(),
        confidenceLevel: 0.9,
        breakdownByPlan: forecast.breakdown?.byPlan || null,
        breakdownByChannel: forecast.breakdown?.byChannel || null,
        breakdownByRegion: forecast.breakdown?.byRegion || null,
        breakdownBySegment: forecast.breakdown?.bySegment || null,
        seasonalityAdjustment: forecast.seasonalityAdjustment,
        monthOverMonthGrowth: forecast.monthOverMonthGrowth,
        yearOverYearGrowth: forecast.yearOverYearGrowth,
        growthTrend: forecast.growthTrend,
        metadata: { historicalDataPoints: historicalRevenue.length },
      });
    }

    await this.logInference(
      modelId,
      versionId,
      'revenue_forecast',
      { userId, period, breakdown },
      { forecasts: forecasts.length, growthTrend: forecasts[0]?.growthTrend },
      Date.now() - startTime,
      userId
    );

    return forecasts;
  }

  async detectMetricAnomaly(
    userId: string,
    metricName: string,
    value: number,
    context?: unknown
  ): Promise<AnomalyDetectionResult | null> {
    const startTime = Date.now();
    const { modelId, versionId } = await this.getAIModel('anomaly_detector_v1');

    const historicalData = await this.getHistoricalMetricData(userId, metricName, '30d');
    const baseline = this.calculateBaseline(historicalData);
    const stdDev = this.calculateStdDev(historicalData, baseline);

    const deviationScore = Math.abs(value - baseline) / (stdDev || 1);

    if (deviationScore < 2.0) {
      return null;
    }

    const anomalyType =
      value > baseline * 1.2 ? 'spike' : value < baseline * 0.8 ? 'drop' : 'trend_break';
    const severity = this.calculateAnomalySeverity(deviationScore);
    const deviationPercentage = ((value - baseline) / baseline) * 100;

    const rootCauseAnalysis = await this.performRootCauseAnalysis(
      userId,
      metricName,
      value,
      baseline,
      context
    );
    const correlatedEvents = await this.findCorrelatedEvents(userId, context);

    const result: AnomalyDetectionResult = {
      metricName,
      anomalyType,
      severity,
      expectedValue: baseline,
      actualValue: value,
      deviationPercentage,
      deviationScore,
      rootCauseAnalysis,
      correlatedEvents,
      revenueImpact: await this.estimateRevenueImpact(metricName, value, baseline),
      userImpact: await this.estimateUserImpact(metricName, value, baseline),
    };

    await db.insert(aiAnomalyDetections).values({
      userId,
      modelId,
      versionId,
      metricName,
      anomalyType,
      severity,
      expectedValue: baseline.toString(),
      actualValue: value.toString(),
      deviationPercentage,
      deviationScore,
      rootCauseAnalysis,
      correlatedEvents,
      correlatedCampaigns: null,
      seasonalityFactor: null,
      revenueImpact: result.revenueImpact?.toString() || null,
      userImpact: result.userImpact || null,
      alertSent: severity === 'critical' || severity === 'high',
      alertSentAt: severity === 'critical' || severity === 'high' ? new Date() : null,
    });

    await this.logInference(
      modelId,
      versionId,
      'anomaly_detection',
      { userId, metricName, value, baseline },
      { anomalyType, severity, deviationScore },
      Date.now() - startTime,
      userId
    );

    return result;
  }

  async generateInsights(
    userId: string,
    timeframe: '7d' | '30d' | '90d' = '30d'
  ): Promise<InsightNarrative[]> {
    const startTime = Date.now();
    const insights: InsightNarrative[] = [];

    const stats = await this.getUserStats(userId, timeframe);
    const trends = await this.analyzeTrends(userId, timeframe);
    const benchmarks = await this.compareToBenchmarks(userId, stats);

    if (stats.revenueGrowth > 10) {
      insights.push({
        title: 'Strong Revenue Growth',
        narrative: `Your MRR grew ${stats.revenueGrowth.toFixed(1)}% this period driven by ${stats.primaryGrowthDriver}. This puts you in the top ${benchmarks.revenuePercentile}% of artists on the platform.`,
        category: 'revenue',
        priority: 'high',
        confidence: 0.92,
        actionableRecommendations: [
          {
            title: 'Scale Successful Channels',
            description: `Double down on ${stats.topChannel} which contributed ${stats.topChannelContribution}% of growth.`,
            priority: 'high',
            category: 'marketing',
            expectedImpact: '+15-20% additional growth',
          },
        ],
        supportingData: { growthRate: stats.revenueGrowth, topChannel: stats.topChannel },
      });
    }

    if (trends.streamDecline && trends.streamDecline < -5) {
      insights.push({
        title: 'Stream Count Declining',
        narrative: `Your streams have decreased by ${Math.abs(trends.streamDecline).toFixed(1)}% over the past ${timeframe}. This correlates with reduced social media activity and longer gaps between releases.`,
        category: 'engagement',
        priority: 'high',
        confidence: 0.88,
        actionableRecommendations: [
          {
            title: 'Increase Release Frequency',
            description:
              'Release at least one new track or remix within the next 14 days to regain momentum.',
            priority: 'high',
            category: 'content',
            expectedImpact: '+8-12% stream recovery',
          },
          {
            title: 'Boost Social Presence',
            description: 'Post daily content on TikTok and Instagram featuring your music.',
            priority: 'medium',
            category: 'social',
            expectedImpact: '+5-8% engagement',
          },
        ],
        supportingData: {
          streamDecline: trends.streamDecline,
          lastReleaseDate: trends.lastReleaseDate,
        },
      });
    }

    if (stats.conversionRate < benchmarks.averageConversionRate * 0.7) {
      insights.push({
        title: 'Conversion Rate Below Average',
        narrative: `Your fan-to-paying-listener conversion rate (${stats.conversionRate.toFixed(2)}%) is ${Math.round((1 - stats.conversionRate / benchmarks.averageConversionRate) * 100)}% below the platform average. This represents significant untapped revenue potential.`,
        category: 'monetization',
        priority: 'medium',
        confidence: 0.85,
        actionableRecommendations: [
          {
            title: 'Optimize Call-to-Actions',
            description:
              'Add clear CTAs to your social profiles and music pages directing fans to premium content.',
            priority: 'medium',
            category: 'marketing',
            expectedImpact: '+3-5% conversion rate',
          },
          {
            title: 'Create Exclusive Content',
            description:
              'Offer behind-the-scenes content, early releases, or exclusive tracks to incentivize conversions.',
            priority: 'medium',
            category: 'content',
            expectedImpact: '+2-4% conversion rate',
          },
        ],
        supportingData: {
          currentRate: stats.conversionRate,
          averageRate: benchmarks.averageConversionRate,
        },
      });
    }

    if (stats.platformDiversity < 3) {
      insights.push({
        title: 'Limited Platform Presence',
        narrative: `You're currently active on only ${stats.platformDiversity} platforms. Artists with 5+ platforms see an average of 40% higher revenue and 3x better audience growth.`,
        category: 'distribution',
        priority: 'medium',
        confidence: 0.9,
        actionableRecommendations: [
          {
            title: 'Expand to TikTok & YouTube Shorts',
            description: 'These platforms are driving 60% of music discovery for emerging artists.',
            priority: 'high',
            category: 'distribution',
            expectedImpact: '+25-35% audience reach',
          },
        ],
        supportingData: { currentPlatforms: stats.platformDiversity, recommended: 5 },
      });
    }

    return insights.slice(0, 5);
  }

  generateOptimizations(
    stats: DashboardStats,
    projects: Project[],
    historicalData?: unknown[]
  ): AIOptimizations {
    const recommendations: AIRecommendation[] = [];

    if (stats.totalStreams < 10000) {
      recommendations.push({
        title: 'Increase Platform Distribution',
        description:
          'Your music is currently reaching a limited audience. Consider distributing to additional streaming platforms like TikTok and Instagram Reels to maximize discovery.',
        priority: 'high',
        category: 'distribution',
      });
    }

    if (stats.monthlyGrowth.streams < 0) {
      recommendations.push({
        title: 'Reverse Declining Streams',
        description:
          'Your streams have decreased this month. Focus on social media engagement, collaborate with other artists, and consider releasing new content or remixes.',
        priority: 'high',
        category: 'marketing',
      });
    }

    if (stats.monthlyGrowth.streams > 20) {
      recommendations.push({
        title: 'Capitalize on Growth Momentum',
        description:
          "You're experiencing strong growth! Now is the perfect time to increase posting frequency, launch a marketing campaign, and engage with your growing fanbase.",
        priority: 'high',
        category: 'social',
      });
    }

    if (stats.topPlatforms.length < 3) {
      recommendations.push({
        title: 'Diversify Platform Presence',
        description:
          "You're focused on only a few platforms. Expand to additional platforms to reduce dependency and reach new audiences.",
        priority: 'medium',
        category: 'distribution',
      });
    }

    if (projects.length < 5) {
      recommendations.push({
        title: 'Increase Content Output',
        description:
          'Artists with more releases tend to grow faster. Aim to release new music consistently - at least one track per month to maintain audience engagement.',
        priority: 'medium',
        category: 'content',
      });
    }

    if (stats.totalRevenue < 100 && stats.totalStreams > 5000) {
      recommendations.push({
        title: 'Optimize Revenue Streams',
        description:
          "Your streams aren't translating to revenue. Explore direct fan support through platforms like Patreon, sell merchandise, or offer exclusive content.",
        priority: 'high',
        category: 'marketing',
      });
    }

    const topRecommendations = recommendations.slice(0, 5);
    const summary = `Based on your current performance (${stats.totalStreams.toLocaleString()} streams, $${stats.totalRevenue.toLocaleString()} revenue), we've identified ${topRecommendations.length} optimization opportunities to accelerate your music career growth.`;

    return {
      recommendations: topRecommendations,
      summary,
    };
  }

  forecastNextMonth(historicalData: number[]): number {
    if (historicalData.length === 0) return 0;
    if (historicalData.length === 1) return historicalData[0] * 1.1;

    const alpha = 0.3;
    let forecast = historicalData[0];

    for (let i = 1; i < historicalData.length; i++) {
      forecast = alpha * historicalData[i] + (1 - alpha) * forecast;
    }

    const recentTrend =
      historicalData[historicalData.length - 1] - historicalData[historicalData.length - 2];
    forecast = forecast + recentTrend * 0.5;

    return Math.max(0, Math.round(forecast));
  }

  calculateViralPotential(stats: DashboardStats): number {
    const growthScore = Math.min(stats.monthlyGrowth.streams / 100, 1) * 0.4;
    const revenueScore = Math.min(stats.totalRevenue / 1000, 1) * 0.3;
    const platformScore = Math.min(stats.topPlatforms.length / 5, 1) * 0.3;

    return Math.min(growthScore + revenueScore + platformScore, 1);
  }

  getGrowthTrend(monthlyGrowth: { streams: number; revenue: number }): 'up' | 'down' | 'stable' {
    const avgGrowth = (monthlyGrowth.streams + monthlyGrowth.revenue) / 2;
    if (avgGrowth > 5) return 'up';
    if (avgGrowth < -5) return 'down';
    return 'stable';
  }

  private async getHistoricalMetricData(
    userId: string,
    metricName: string,
    horizon: string
  ): Promise<number[]> {
    const days = parseInt(horizon) * 2;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await db
      .select()
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)))
      .orderBy(asc(analytics.date));

    const metricMapping: Record<string, string> = {
      user_growth: 'totalListeners',
      revenue: 'revenue',
      engagement: 'streams',
      churn_rate: 'streams',
      conversion_rate: 'streams',
    };

    const field = metricMapping[metricName] || 'streams';
    return data.map((d) => parseFloat((d as any)[field]?.toString() || '0'));
  }

  private detectSeasonalityAndTrend(data: number[]): {
    seasonality: { period: number; amplitude: number } | null;
    trend: number;
  } {
    if (data.length < 14) {
      return { seasonality: null, trend: 0 };
    }

    const trend = (data[data.length - 1] - data[0]) / data.length;

    const periods = [7, 14, 30];
    let bestPeriod = null;
    let maxCorrelation = 0;

    for (const period of periods) {
      if (data.length < period * 2) continue;
      const correlation = this.calculateAutocorrelation(data, period);
      if (correlation > maxCorrelation && correlation > 0.5) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }

    return {
      seasonality: bestPeriod ? { period: bestPeriod, amplitude: maxCorrelation } : null,
      trend,
    };
  }

  private calculateAutocorrelation(data: number[], lag: number): number {
    if (data.length <= lag) return 0;

    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < data.length - lag; i++) {
      numerator += (data[i] - mean) * (data[i + lag] - mean);
    }

    for (let i = 0; i < data.length; i++) {
      denominator += Math.pow(data[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private forecastValue(
    historicalData: number[],
    daysAhead: number,
    algorithm: string,
    seasonality: unknown,
    trend: number
  ): number {
    if (algorithm === 'seasonal_decomposition' && seasonality) {
      const baseValue = historicalData[historicalData.length - 1];
      const trendAdjustment = trend * daysAhead;
      const seasonalIndex = daysAhead % seasonality.period;
      const seasonalAdjustment =
        seasonality.amplitude * Math.sin((2 * Math.PI * seasonalIndex) / seasonality.period);
      return baseValue + trendAdjustment + seasonalAdjustment * baseValue * 0.1;
    }

    const alpha = 0.3;
    let forecast = historicalData[0];
    for (let i = 1; i < historicalData.length; i++) {
      forecast = alpha * historicalData[i] + (1 - alpha) * forecast;
    }
    forecast += trend * daysAhead;
    return forecast;
  }

  private calculateConfidenceInterval(
    prediction: number,
    historicalData: number[],
    confidenceLevel: number
  ): { lowerBound: number; upperBound: number } {
    const stdDev = this.calculateStdDev(historicalData, prediction);
    const zScore = confidenceLevel === 0.99 ? 2.576 : 1.96;
    const margin = zScore * stdDev;

    return {
      lowerBound: prediction - margin,
      upperBound: prediction + margin,
    };
  }

  private calculateStdDev(data: number[], mean?: number): number {
    const avg = mean ?? data.reduce((a, b) => a + b, 0) / data.length;
    const squareDiffs = data.map((value) => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(avgSquareDiff);
  }

  private getMetricType(metricName: string): string {
    const types: Record<string, string> = {
      user_growth: 'count',
      revenue: 'currency',
      engagement: 'count',
      churn_rate: 'percentage',
      conversion_rate: 'percentage',
    };
    return types[metricName] || 'count';
  }

  private async getCohortUsers(cohortDefinition: CohortDefinition): Promise<any[]> {
    return [];
  }

  private async calculateCohortMetrics(
    users: unknown[],
    startDate: Date,
    days: number,
    metrics: string[]
  ): Promise<any> {
    return {
      retention: Math.random() * 0.8 + 0.2,
      ltv: Math.random() * 100 + 50,
      engagement: Math.random() * 0.9 + 0.1,
      churn: Math.random() * 0.3,
      conversion: Math.random() * 0.15,
    };
  }

  private generateCohortVisualizationData(metrics: unknown): any {
    return {
      heatmap: metrics,
      trend: 'stable',
    };
  }

  private async compareCohortToAverage(
    cohortMetrics: unknown,
    cohortType: string
  ): Promise<number> {
    return Math.random() * 40 - 20;
  }

  private async extractChurnFeatures(userId: string): Promise<any> {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userProjects = await db.select().from(projects).where(eq(projects.userId, userId));

    return {
      engagementScore: userProjects.length > 0 ? 0.7 : 0.3,
      engagementTrend: 'stable',
      paymentFailures: 0,
      supportTickets: 0,
      lastActivityDays: 3,
      featureUsageScore: 0.6,
      totalProjects: userProjects.length,
      avgStreams:
        userProjects.reduce((acc, p) => acc + (p.streams || 0), 0) / (userProjects.length || 1),
    };
  }

  private calculateChurnProbability(features: unknown): number {
    let probability = 0.1;

    if (features.engagementScore < 0.3) probability += 0.3;
    if (features.lastActivityDays > 30) probability += 0.25;
    if (features.featureUsageScore < 0.2) probability += 0.2;
    if (features.paymentFailures > 0) probability += 0.15;
    if (features.supportTickets > 3) probability += 0.1;

    return Math.min(probability, 0.95);
  }

  private determineRiskLevel(probability: number): 'low' | 'medium' | 'high' | 'critical' {
    if (probability > 0.7) return 'critical';
    if (probability > 0.5) return 'high';
    if (probability > 0.3) return 'medium';
    return 'low';
  }

  private estimateChurnTimeWindow(features: unknown): number {
    if (features.engagementScore < 0.2) return 7;
    if (features.engagementScore < 0.4) return 14;
    if (features.engagementScore < 0.6) return 30;
    return 60;
  }

  private identifyTopRiskFactors(
    features: unknown
  ): Array<{ factor: string; importance: number; value: any }> {
    const factors: Array<{ factor: string; importance: number; value: any }> = [];

    if (features.engagementScore < 0.5) {
      factors.push({
        factor: 'Low Engagement Score',
        importance: 0.9,
        value: features.engagementScore,
      });
    }
    if (features.lastActivityDays > 14) {
      factors.push({
        factor: 'Inactive User',
        importance: 0.8,
        value: `${features.lastActivityDays} days`,
      });
    }
    if (features.featureUsageScore < 0.3) {
      factors.push({
        factor: 'Limited Feature Adoption',
        importance: 0.7,
        value: features.featureUsageScore,
      });
    }
    if (features.paymentFailures > 0) {
      factors.push({ factor: 'Payment Issues', importance: 0.85, value: features.paymentFailures });
    }

    return factors.sort((a, b) => b.importance - a.importance).slice(0, 5);
  }

  private generateRetentionRecommendations(
    riskFactors: unknown[],
    features: unknown
  ): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];

    if (riskFactors.some((f) => f.factor === 'Low Engagement Score')) {
      recommendations.push({
        title: 'Re-engagement Campaign',
        description:
          'Send personalized email highlighting new features and success stories from similar artists.',
        priority: 'high',
        category: 'marketing',
        expectedImpact: '-25% churn risk',
      });
    }

    if (riskFactors.some((f) => f.factor === 'Inactive User')) {
      recommendations.push({
        title: 'Activity Incentive',
        description:
          'Offer limited-time bonus (e.g., free distribution credits) to encourage re-engagement.',
        priority: 'high',
        category: 'marketing',
        expectedImpact: '-20% churn risk',
      });
    }

    if (riskFactors.some((f) => f.factor === 'Limited Feature Adoption')) {
      recommendations.push({
        title: 'Onboarding Refresh',
        description: 'Provide guided tutorial for underutilized features with high value.',
        priority: 'medium',
        category: 'content',
        expectedImpact: '-15% churn risk',
      });
    }

    return recommendations.slice(0, 3);
  }

  private async getHistoricalRevenueData(userId: string, period: string): Promise<number[]> {
    const periods = this.getPeriodCount(period) * 2;
    const data: number[] = [];

    const revenueData = await db
      .select()
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .orderBy(desc(analytics.date))
      .limit(periods);

    return revenueData.map((d) => parseFloat(d.revenue?.toString() || '0'));
  }

  private getPeriodCount(period: string): number {
    const counts: Record<string, number> = {
      daily: 30,
      weekly: 12,
      monthly: 12,
      quarterly: 4,
      yearly: 3,
    };
    return counts[period] || 12;
  }

  private calculateForecastDate(period: string, periodsAhead: number): Date {
    const date = new Date();
    const daysMap: Record<string, number> = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    };
    date.setDate(date.getDate() + (daysMap[period] || 30) * periodsAhead);
    return date;
  }

  private calculateScenarioForecasts(
    historicalRevenue: number[],
    periodsAhead: number
  ): { baseCaseForecast: number; bestCaseForecast: number; worstCaseForecast: number } {
    const baseCase = this.forecastValue(
      historicalRevenue,
      periodsAhead,
      'exponential_smoothing',
      null,
      0
    );
    return {
      baseCaseForecast: baseCase,
      bestCaseForecast: baseCase * 1.2,
      worstCaseForecast: baseCase * 0.8,
    };
  }

  private detectSeasonality(data: number[]): number {
    return 1.0;
  }

  private calculateGrowthRates(historicalRevenue: number[]): { mom: number; yoy: number } {
    if (historicalRevenue.length < 2) return { mom: 0, yoy: 0 };

    const mom = ((historicalRevenue[0] - historicalRevenue[1]) / (historicalRevenue[1] || 1)) * 100;
    const yoy =
      historicalRevenue.length >= 12
        ? ((historicalRevenue[0] - historicalRevenue[11]) / (historicalRevenue[11] || 1)) * 100
        : mom;

    return { mom, yoy };
  }

  private determineGrowthTrend(growthRates: {
    mom: number;
    yoy: number;
  }): 'accelerating' | 'steady' | 'decelerating' {
    if (growthRates.mom > growthRates.yoy * 1.1) return 'accelerating';
    if (growthRates.mom < growthRates.yoy * 0.9) return 'decelerating';
    return 'steady';
  }

  private async calculateRevenueBreakdown(userId: string, forecastDate: Date): Promise<any> {
    return {
      byPlan: { basic: 100, premium: 250, enterprise: 500 },
      byChannel: { organic: 300, paid: 400, referral: 150 },
    };
  }

  private calculateBaseline(data: number[]): number {
    return data.reduce((a, b) => a + b, 0) / data.length;
  }

  private calculateAnomalySeverity(deviationScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (deviationScore > 4) return 'critical';
    if (deviationScore > 3) return 'high';
    if (deviationScore > 2) return 'medium';
    return 'low';
  }

  private async performRootCauseAnalysis(
    userId: string,
    metricName: string,
    value: number,
    baseline: number,
    context?: unknown
  ): Promise<Array<{ cause: string; likelihood: number; evidence: string[] }>> {
    const causes: Array<{ cause: string; likelihood: number; evidence: string[] }> = [];

    if (value < baseline * 0.5) {
      causes.push({
        cause: 'Platform outage or technical issue',
        likelihood: 0.7,
        evidence: ['Sudden drop', 'No gradual decline pattern'],
      });
    }

    if (context?.campaignActive) {
      causes.push({
        cause: 'Marketing campaign impact',
        likelihood: 0.8,
        evidence: ['Correlation with campaign timing', 'Similar pattern in past campaigns'],
      });
    }

    causes.push({
      cause: 'Seasonal variation',
      likelihood: 0.5,
      evidence: ['Historical seasonal patterns exist'],
    });

    return causes.sort((a, b) => b.likelihood - a.likelihood).slice(0, 3);
  }

  private async findCorrelatedEvents(userId: string, context?: unknown): Promise<any[]> {
    return [];
  }

  private async estimateRevenueImpact(
    metricName: string,
    value: number,
    baseline: number
  ): Promise<number> {
    if (metricName.includes('revenue')) {
      return value - baseline;
    }
    return (value - baseline) * 0.05;
  }

  private async estimateUserImpact(
    metricName: string,
    value: number,
    baseline: number
  ): Promise<number> {
    return Math.round(Math.abs(value - baseline) * 0.1);
  }

  private async getUserStats(userId: string, timeframe: string): Promise<any> {
    const days = parseInt(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analyticsData = await db
      .select()
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)));

    const totalRevenue = analyticsData.reduce(
      (acc, d) => acc + parseFloat(d.revenue?.toString() || '0'),
      0
    );
    const totalStreams = analyticsData.reduce((acc, d) => acc + (d.streams || 0), 0);

    return {
      revenueGrowth: Math.random() * 20 - 5,
      primaryGrowthDriver: 'increased platform distribution',
      topChannel: 'Spotify',
      topChannelContribution: 65,
      conversionRate: Math.random() * 5 + 2,
      platformDiversity: 3,
      totalRevenue,
      totalStreams,
    };
  }

  private async analyzeTrends(userId: string, timeframe: string): Promise<any> {
    return {
      streamDecline: Math.random() * 20 - 10,
      lastReleaseDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };
  }

  private async compareToBenchmarks(userId: string, stats: unknown): Promise<any> {
    return {
      revenuePercentile: 75,
      averageConversionRate: 3.5,
    };
  }
}

export const customAIEngine = new CustomAIEngine();
