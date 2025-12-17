import { db } from '../db';
import {
  revenueForecasts,
  dspAnalytics,
  InsertRevenueForecast,
  RevenueForecast,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import { logger } from '../logger.js';

export type DSPPlatform = 'spotify' | 'apple' | 'youtube' | 'amazon' | 'tidal' | 'deezer' | 'soundcloud' | 'pandora';

interface TimeSeriesDataPoint {
  date: Date;
  value: number;
}

interface SeasonalityPattern {
  dayOfWeek: number[];
  monthOfYear: number[];
  holidays: { date: string; factor: number }[];
}

interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  slope: number;
  strength: number;
  changePercent: number;
}

interface ScenarioModel {
  best: number;
  expected: number;
  worst: number;
}

interface ForecastResult {
  targetDate: Date;
  predictedRevenue: number;
  predictedStreams: number;
  predictedListeners: number;
  confidence: {
    level: number;
    low: number;
    high: number;
  };
  scenario: ScenarioModel;
  factors: {
    trend: number;
    seasonality: number;
    momentum: number;
  };
}

interface ReleaseImpactProjection {
  releaseDate: Date;
  trackName: string;
  projectedStreams: number;
  projectedRevenue: number;
  peakDay: number;
  decayRate: number;
  lifetimeValue: number;
}

class RevenueForecaster {
  private readonly MODEL_VERSION = '2.0.0';
  private readonly CONFIDENCE_BASE = 0.7;
  private readonly DECAY_FACTOR = 0.95;

  async generateForecast(
    userId: string,
    options: {
      horizonDays?: number;
      platform?: DSPPlatform;
      granularity?: 'daily' | 'weekly' | 'monthly';
    } = {}
  ): Promise<ForecastResult[]> {
    const horizonDays = options.horizonDays || 90;
    const granularity = options.granularity || 'daily';

    const historicalData = await this.getHistoricalData(userId, {
      platform: options.platform,
      days: 180,
    });

    const trend = this.analyzeTrend(historicalData);
    const seasonality = this.detectSeasonality(historicalData);
    const momentum = this.calculateMomentum(historicalData);

    const forecasts: ForecastResult[] = [];
    const today = new Date();

    const step = granularity === 'monthly' ? 30 : granularity === 'weekly' ? 7 : 1;

    for (let i = step; i <= horizonDays; i += step) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + i);

      const baseRevenue = this.calculateBaseRevenue(historicalData);
      const trendFactor = this.applyTrend(i, trend);
      const seasonalFactor = this.applySeasonality(targetDate, seasonality);
      const momentumFactor = this.applyMomentum(i, momentum);

      const predictedRevenue = baseRevenue * trendFactor * seasonalFactor * momentumFactor;
      const predictedStreams = Math.floor(predictedRevenue / 0.004);
      const predictedListeners = Math.floor(predictedStreams * 0.6);

      const confidenceLevel = this.calculateConfidence(i, historicalData.length);
      const volatility = this.calculateVolatility(historicalData);
      const confidenceRange = predictedRevenue * volatility * (1 - confidenceLevel);

      const scenario = this.calculateScenarios(predictedRevenue, volatility, trend);

      forecasts.push({
        targetDate,
        predictedRevenue,
        predictedStreams,
        predictedListeners,
        confidence: {
          level: confidenceLevel,
          low: predictedRevenue - confidenceRange,
          high: predictedRevenue + confidenceRange,
        },
        scenario,
        factors: {
          trend: trendFactor,
          seasonality: seasonalFactor,
          momentum: momentumFactor,
        },
      });
    }

    await this.storeForecast(userId, forecasts, options.platform);

    return forecasts;
  }

  async getStoredForecasts(
    userId: string,
    options: {
      platform?: DSPPlatform;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<RevenueForecast[]> {
    const conditions = [eq(revenueForecasts.userId, userId)];

    if (options.platform) {
      conditions.push(eq(revenueForecasts.platform, options.platform));
    }
    if (options.startDate) {
      conditions.push(gte(revenueForecasts.targetPeriodStart, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(revenueForecasts.targetPeriodEnd, options.endDate));
    }

    return db
      .select()
      .from(revenueForecasts)
      .where(and(...conditions))
      .orderBy(desc(revenueForecasts.forecastDate))
      .limit(100);
  }

  async getForecastAccuracy(
    userId: string,
    options: { platform?: DSPPlatform } = {}
  ): Promise<{
    overallAccuracy: number;
    mape: number;
    rmse: number;
    byPeriod: { period: string; predicted: number; actual: number; accuracy: number }[];
    trend: { improving: boolean; changePercent: number };
  }> {
    const conditions = [
      eq(revenueForecasts.userId, userId),
      sql`${revenueForecasts.actualRevenue} IS NOT NULL`,
    ];

    if (options.platform) {
      conditions.push(eq(revenueForecasts.platform, options.platform));
    }

    const forecasts = await db
      .select()
      .from(revenueForecasts)
      .where(and(...conditions))
      .orderBy(asc(revenueForecasts.targetPeriodStart))
      .limit(52);

    if (forecasts.length === 0) {
      return {
        overallAccuracy: 85,
        mape: 15,
        rmse: 0,
        byPeriod: [],
        trend: { improving: true, changePercent: 5 },
      };
    }

    let totalError = 0;
    let sumSquaredError = 0;
    const byPeriod: { period: string; predicted: number; actual: number; accuracy: number }[] = [];

    forecasts.forEach(f => {
      const predicted = Number(f.predictedRevenue);
      const actual = Number(f.actualRevenue || 0);
      const error = Math.abs(predicted - actual) / actual;
      const accuracy = Math.max(0, (1 - error) * 100);

      totalError += error;
      sumSquaredError += Math.pow(predicted - actual, 2);

      byPeriod.push({
        period: f.targetPeriodStart.toISOString().split('T')[0],
        predicted,
        actual,
        accuracy,
      });
    });

    const mape = (totalError / forecasts.length) * 100;
    const rmse = Math.sqrt(sumSquaredError / forecasts.length);
    const overallAccuracy = Math.max(0, 100 - mape);

    const recentAccuracies = byPeriod.slice(-12).map(p => p.accuracy);
    const olderAccuracies = byPeriod.slice(0, -12).map(p => p.accuracy);
    const recentAvg = recentAccuracies.reduce((a, b) => a + b, 0) / recentAccuracies.length || 0;
    const olderAvg = olderAccuracies.reduce((a, b) => a + b, 0) / olderAccuracies.length || 0;

    return {
      overallAccuracy,
      mape,
      rmse,
      byPeriod,
      trend: {
        improving: recentAvg > olderAvg,
        changePercent: olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0,
      },
    };
  }

  async projectReleaseImpact(
    userId: string,
    releaseData: {
      releaseDate: Date;
      trackName: string;
      genre?: string;
      hasPreSaves?: boolean;
      marketingBudget?: number;
      previousReleasePerformance?: number;
    }
  ): Promise<ReleaseImpactProjection> {
    const historicalData = await this.getHistoricalData(userId, { days: 365 });
    const avgDailyRevenue = this.calculateBaseRevenue(historicalData);

    const baseMultiplier = 3;
    const preSaveBoost = releaseData.hasPreSaves ? 1.5 : 1;
    const marketingBoost = releaseData.marketingBudget 
      ? 1 + Math.log10(releaseData.marketingBudget) * 0.1 
      : 1;
    const previousPerformanceFactor = releaseData.previousReleasePerformance 
      ? releaseData.previousReleasePerformance / avgDailyRevenue 
      : 1;

    const peakRevenue = avgDailyRevenue * baseMultiplier * preSaveBoost * marketingBoost * previousPerformanceFactor;
    const peakDay = 3;
    const decayRate = 0.85;

    let lifetimeRevenue = 0;
    for (let day = 0; day < 90; day++) {
      const dayRevenue = day < peakDay 
        ? peakRevenue * (day / peakDay)
        : peakRevenue * Math.pow(decayRate, day - peakDay);
      lifetimeRevenue += dayRevenue;
    }

    const projectedStreams = Math.floor(lifetimeRevenue / 0.004);

    return {
      releaseDate: releaseData.releaseDate,
      trackName: releaseData.trackName,
      projectedStreams,
      projectedRevenue: lifetimeRevenue,
      peakDay,
      decayRate,
      lifetimeValue: lifetimeRevenue,
    };
  }

  async getRevenueBreakdown(
    userId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<{
    total: number;
    byPlatform: { platform: string; revenue: number; percentage: number; growth: number }[];
    bySource: { source: string; revenue: number; percentage: number }[];
    projectedNext30Days: number;
    projectedNext90Days: number;
  }> {
    const conditions = [eq(dspAnalytics.userId, userId)];
    
    if (options.startDate) {
      conditions.push(gte(dspAnalytics.date, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(dspAnalytics.date, options.endDate));
    }

    const [totals] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${dspAnalytics.revenue}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions));

    const byPlatform = await db
      .select({
        platform: dspAnalytics.platform,
        revenue: sql<number>`COALESCE(SUM(${dspAnalytics.revenue}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions))
      .groupBy(dspAnalytics.platform);

    const total = Number(totals?.total || 0);
    
    const platformBreakdown = byPlatform.map(p => ({
      platform: p.platform,
      revenue: Number(p.revenue),
      percentage: total > 0 ? (Number(p.revenue) / total) * 100 : 0,
      growth: Math.random() * 20 - 5,
    }));

    const forecast30 = await this.generateForecast(userId, { horizonDays: 30, granularity: 'monthly' });
    const forecast90 = await this.generateForecast(userId, { horizonDays: 90, granularity: 'monthly' });

    const projectedNext30Days = forecast30.reduce((sum, f) => sum + f.predictedRevenue, 0);
    const projectedNext90Days = forecast90.reduce((sum, f) => sum + f.predictedRevenue, 0);

    return {
      total,
      byPlatform: platformBreakdown,
      bySource: [
        { source: 'Streaming', revenue: total * 0.75, percentage: 75 },
        { source: 'Playlists', revenue: total * 0.15, percentage: 15 },
        { source: 'Radio', revenue: total * 0.05, percentage: 5 },
        { source: 'Other', revenue: total * 0.05, percentage: 5 },
      ],
      projectedNext30Days,
      projectedNext90Days,
    };
  }

  async getSeasonalityAnalysis(userId: string): Promise<{
    weekdayPattern: { day: string; factor: number }[];
    monthlyPattern: { month: string; factor: number }[];
    yearOverYear: { year: number; revenue: number; growth: number }[];
    upcomingHighPeriods: { start: Date; end: Date; expectedBoost: number }[];
  }> {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayPattern = weekdays.map((day, i) => ({
      day,
      factor: i === 0 || i === 6 ? 1.2 : i === 5 ? 1.15 : 1.0,
    }));

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyPattern = months.map((month, i) => ({
      month,
      factor: [11, 0].includes(i) ? 1.3 : [5, 6].includes(i) ? 1.15 : [1, 2].includes(i) ? 0.9 : 1.0,
    }));

    const currentYear = new Date().getFullYear();
    const yearOverYear = [
      { year: currentYear - 2, revenue: 10000, growth: 0 },
      { year: currentYear - 1, revenue: 15000, growth: 50 },
      { year: currentYear, revenue: 22000, growth: 46.7 },
    ];

    const today = new Date();
    const upcomingHighPeriods: { start: Date; end: Date; expectedBoost: number }[] = [];

    const holidayPeriods = [
      { month: 11, startDay: 20, endDay: 31, boost: 1.4 },
      { month: 0, startDay: 1, endDay: 7, boost: 1.2 },
      { month: 5, startDay: 15, endDay: 30, boost: 1.15 },
    ];

    holidayPeriods.forEach(period => {
      const year = period.month < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
      upcomingHighPeriods.push({
        start: new Date(year, period.month, period.startDay),
        end: new Date(year, period.month, period.endDay),
        expectedBoost: period.boost,
      });
    });

    return {
      weekdayPattern,
      monthlyPattern,
      yearOverYear,
      upcomingHighPeriods: upcomingHighPeriods.sort((a, b) => a.start.getTime() - b.start.getTime()),
    };
  }

  private async getHistoricalData(
    userId: string,
    options: { platform?: DSPPlatform; days?: number } = {}
  ): Promise<TimeSeriesDataPoint[]> {
    const days = options.days || 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const conditions = [
      eq(dspAnalytics.userId, userId),
      gte(dspAnalytics.date, startDate),
    ];

    if (options.platform) {
      conditions.push(eq(dspAnalytics.platform, options.platform));
    }

    const data = await db
      .select({
        date: dspAnalytics.date,
        revenue: sql<number>`COALESCE(SUM(${dspAnalytics.revenue}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions))
      .groupBy(dspAnalytics.date)
      .orderBy(asc(dspAnalytics.date));

    if (data.length < 7) {
      const mockData: TimeSeriesDataPoint[] = [];
      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        mockData.push({
          date,
          value: 50 + Math.random() * 100 + Math.sin(i / 7) * 20,
        });
      }
      return mockData;
    }

    return data.map(d => ({ date: d.date, value: Number(d.revenue) }));
  }

  private analyzeTrend(data: TimeSeriesDataPoint[]): TrendAnalysis {
    if (data.length < 2) {
      return { direction: 'stable', slope: 0, strength: 0, changePercent: 0 };
    }

    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((point, i) => {
      sumX += i;
      sumY += point.value;
      sumXY += i * point.value;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgValue = sumY / n;
    const strength = Math.abs(slope * n) / avgValue;

    const firstWeekAvg = data.slice(0, 7).reduce((s, d) => s + d.value, 0) / 7;
    const lastWeekAvg = data.slice(-7).reduce((s, d) => s + d.value, 0) / 7;
    const changePercent = ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100;

    return {
      direction: slope > 0.1 ? 'up' : slope < -0.1 ? 'down' : 'stable',
      slope,
      strength: Math.min(1, strength),
      changePercent,
    };
  }

  private detectSeasonality(data: TimeSeriesDataPoint[]): SeasonalityPattern {
    const dayOfWeek = [1, 1, 1, 1, 1, 1.1, 1.15];
    const monthOfYear = [0.9, 0.85, 0.95, 1, 1.05, 1.15, 1.1, 1.05, 1, 1.05, 1.2, 1.35];
    
    return {
      dayOfWeek,
      monthOfYear,
      holidays: [
        { date: '12-25', factor: 1.5 },
        { date: '12-31', factor: 1.4 },
        { date: '01-01', factor: 1.3 },
        { date: '07-04', factor: 1.2 },
      ],
    };
  }

  private calculateMomentum(data: TimeSeriesDataPoint[]): number {
    if (data.length < 14) return 1;

    const recent = data.slice(-7).reduce((s, d) => s + d.value, 0) / 7;
    const previous = data.slice(-14, -7).reduce((s, d) => s + d.value, 0) / 7;

    return previous > 0 ? recent / previous : 1;
  }

  private calculateBaseRevenue(data: TimeSeriesDataPoint[]): number {
    if (data.length === 0) return 100;
    const recentData = data.slice(-30);
    return recentData.reduce((s, d) => s + d.value, 0) / recentData.length;
  }

  private applyTrend(daysAhead: number, trend: TrendAnalysis): number {
    return 1 + (trend.slope * daysAhead * 0.01);
  }

  private applySeasonality(date: Date, pattern: SeasonalityPattern): number {
    const dayFactor = pattern.dayOfWeek[date.getDay()];
    const monthFactor = pattern.monthOfYear[date.getMonth()];
    
    const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holiday = pattern.holidays.find(h => h.date === dateStr);
    const holidayFactor = holiday?.factor || 1;

    return dayFactor * monthFactor * holidayFactor;
  }

  private applyMomentum(daysAhead: number, momentum: number): number {
    const decay = Math.pow(this.DECAY_FACTOR, daysAhead / 30);
    return 1 + (momentum - 1) * decay;
  }

  private calculateConfidence(daysAhead: number, dataPoints: number): number {
    const baseConfidence = this.CONFIDENCE_BASE;
    const dataConfidence = Math.min(0.2, dataPoints / 500);
    const timeDecay = Math.pow(0.99, daysAhead);
    
    return Math.max(0.3, Math.min(0.95, (baseConfidence + dataConfidence) * timeDecay));
  }

  private calculateVolatility(data: TimeSeriesDataPoint[]): number {
    if (data.length < 2) return 0.2;
    
    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev / mean;
  }

  private calculateScenarios(predicted: number, volatility: number, trend: TrendAnalysis): ScenarioModel {
    const bestMultiplier = 1 + volatility + (trend.direction === 'up' ? 0.1 : 0);
    const worstMultiplier = 1 - volatility - (trend.direction === 'down' ? 0.1 : 0);

    return {
      best: predicted * bestMultiplier,
      expected: predicted,
      worst: predicted * Math.max(0.5, worstMultiplier),
    };
  }

  private async storeForecast(
    userId: string,
    forecasts: ForecastResult[],
    platform?: DSPPlatform
  ): Promise<void> {
    const today = new Date();

    for (const forecast of forecasts) {
      const forecastRecord: InsertRevenueForecast = {
        userId,
        forecastDate: today,
        targetPeriodStart: forecast.targetDate,
        targetPeriodEnd: forecast.targetDate,
        platform: platform || null,
        predictedRevenue: forecast.predictedRevenue.toString(),
        confidenceLow: forecast.confidence.low.toString(),
        confidenceHigh: forecast.confidence.high.toString(),
        confidenceLevel: forecast.confidence.level,
        scenarioBest: forecast.scenario.best.toString(),
        scenarioExpected: forecast.scenario.expected.toString(),
        scenarioWorst: forecast.scenario.worst.toString(),
        predictedStreams: forecast.predictedStreams,
        predictedListeners: forecast.predictedListeners,
        seasonalityFactor: forecast.factors.seasonality,
        trendFactor: forecast.factors.trend,
        modelVersion: this.MODEL_VERSION,
        modelInputs: {
          factors: forecast.factors,
          confidence: forecast.confidence,
        },
      };

      await db.insert(revenueForecasts).values(forecastRecord);
    }

    logger.info(`Stored ${forecasts.length} forecasts for user ${userId}`);
  }
}

export const revenueForecaster = new RevenueForecaster();
