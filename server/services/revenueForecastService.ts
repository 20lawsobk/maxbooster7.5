import { db } from '../db';
import { analytics, revenueForecasts } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import { logger } from '../logger.js';

interface ForecastResult {
  period: string;
  months: number;
  projectedStreams: number;
  projectedRevenue: number;
  projectedRoyalties: number;
  confidence: number;
  confidenceLow: number;
  confidenceHigh: number;
  growthRate: number;
  seasonalityFactor: number;
}

interface MonthlyProjection {
  month: string;
  date: Date;
  projectedStreams: number;
  projectedRevenue: number;
  projectedRoyalties: number;
  confidence: number;
  confidenceLow: number;
  confidenceHigh: number;
  isHistorical: boolean;
}

interface RevenueProjections {
  threeMonth: ForecastResult;
  sixMonth: ForecastResult;
  twelveMonth: ForecastResult;
  monthlyBreakdown: MonthlyProjection[];
  currentRate: number;
  goalProgress: {
    currentMonthly: number;
    projectedMonthly: number;
    daysToGoal: number | null;
    goalAmount: number;
  };
  tips: string[];
}

interface AccuracyMetrics {
  overallAccuracy: number;
  mape: number;
  recentForecasts: {
    period: string;
    predicted: number;
    actual: number;
    accuracy: number;
  }[];
  trend: 'improving' | 'stable' | 'declining';
}

const SEASONALITY_FACTORS: Record<number, number> = {
  0: 0.95,  // January - post-holiday dip
  1: 0.90,  // February - lowest
  2: 0.92,  // March
  3: 0.95,  // April
  4: 0.98,  // May
  5: 0.92,  // June - summer dip starts
  6: 0.88,  // July - summer dip
  7: 0.90,  // August - summer dip
  8: 0.98,  // September - back to school
  9: 1.05,  // October - Q4 boost starts
  10: 1.15, // November - Q4 boost
  11: 1.25, // December - holiday peak
};

class RevenueForecastService {
  private readonly AVERAGE_STREAM_RATE = 0.004;
  private readonly ROYALTY_PERCENTAGE = 0.70;
  private readonly BASE_CONFIDENCE = 0.75;

  async generateForecast(userId: string, months: number): Promise<ForecastResult> {
    logger.info(`Generating ${months}-month forecast for user ${userId}`);

    const historicalData = await this.getHistoricalData(userId);
    const streamToRevenueRate = await this.calculateStreamToRevenueRate(userId);
    const growthRate = this.calculateGrowthRate(historicalData);
    const dataConsistency = this.calculateDataConsistency(historicalData);

    const baseMonthlyStreams = this.calculateAverageMonthlyStreams(historicalData);
    const baseMonthlyRevenue = baseMonthlyStreams * streamToRevenueRate;

    let totalStreams = 0;
    let totalRevenue = 0;
    const today = new Date();

    for (let i = 1; i <= months; i++) {
      const futureMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const seasonalFactor = SEASONALITY_FACTORS[futureMonth.getMonth()];
      const growthFactor = Math.pow(1 + growthRate, i / 12);

      const monthStreams = baseMonthlyStreams * seasonalFactor * growthFactor;
      const monthRevenue = monthStreams * streamToRevenueRate;

      totalStreams += monthStreams;
      totalRevenue += monthRevenue;
    }

    const projectedRoyalties = totalRevenue * this.ROYALTY_PERCENTAGE;
    const confidence = this.calculateConfidence(months, dataConsistency, historicalData.length);
    const volatility = this.calculateVolatility(historicalData);

    const confidenceRange = totalRevenue * volatility * (1 - confidence);

    const result: ForecastResult = {
      period: `${months} months`,
      months,
      projectedStreams: Math.round(totalStreams),
      projectedRevenue: Math.round(totalRevenue * 100) / 100,
      projectedRoyalties: Math.round(projectedRoyalties * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      confidenceLow: Math.max(0, Math.round((totalRevenue - confidenceRange) * 100) / 100),
      confidenceHigh: Math.round((totalRevenue + confidenceRange) * 100) / 100,
      growthRate: Math.round(growthRate * 10000) / 100,
      seasonalityFactor: this.getAverageSeasonalityFactor(months),
    };

    await this.storeForecast(userId, result);

    return result;
  }

  async calculateStreamToRevenueRate(userId: string): Promise<number> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const data = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, sixMonthsAgo)
        )
      );

    const { totalStreams, totalRevenue } = data[0] || { totalStreams: 0, totalRevenue: 0 };

    if (Number(totalStreams) === 0) {
      return this.AVERAGE_STREAM_RATE;
    }

    const rate = Number(totalRevenue) / Number(totalStreams);
    return Math.max(0.001, Math.min(0.01, rate || this.AVERAGE_STREAM_RATE));
  }

  async getRevenueProjections(userId: string): Promise<RevenueProjections> {
    const [threeMonth, sixMonth, twelveMonth] = await Promise.all([
      this.generateForecast(userId, 3),
      this.generateForecast(userId, 6),
      this.generateForecast(userId, 12),
    ]);

    const monthlyBreakdown = await this.generateMonthlyBreakdown(userId, 12);
    const currentRate = await this.calculateStreamToRevenueRate(userId);
    const currentMonthly = await this.getCurrentMonthlyRevenue(userId);

    const goalAmount = 1000;
    const projectedMonthly = twelveMonth.projectedRevenue / 12;
    let daysToGoal: number | null = null;

    if (projectedMonthly > currentMonthly && projectedMonthly >= goalAmount) {
      const monthsToGoal = Math.log(goalAmount / currentMonthly) / Math.log(projectedMonthly / currentMonthly);
      daysToGoal = Math.ceil(monthsToGoal * 30);
    }

    const tips = this.generateTips(currentMonthly, projectedMonthly, threeMonth.growthRate);

    return {
      threeMonth,
      sixMonth,
      twelveMonth,
      monthlyBreakdown,
      currentRate,
      goalProgress: {
        currentMonthly: Math.round(currentMonthly * 100) / 100,
        projectedMonthly: Math.round(projectedMonthly * 100) / 100,
        daysToGoal,
        goalAmount,
      },
      tips,
    };
  }

  async compareToActual(userId: string): Promise<AccuracyMetrics> {
    const forecasts = await db
      .select()
      .from(revenueForecasts)
      .where(
        and(
          eq(revenueForecasts.userId, userId),
          sql`${revenueForecasts.actualRevenue} IS NOT NULL`
        )
      )
      .orderBy(desc(revenueForecasts.createdAt))
      .limit(12);

    if (forecasts.length === 0) {
      return {
        overallAccuracy: 85,
        mape: 15,
        recentForecasts: [],
        trend: 'stable',
      };
    }

    let totalError = 0;
    const recentForecasts: { period: string; predicted: number; actual: number; accuracy: number }[] = [];

    forecasts.forEach(f => {
      const predicted = Number(f.projectedRevenue || f.predictedRevenue || 0);
      const actual = Number(f.actualRevenue || 0);
      
      if (actual > 0) {
        const error = Math.abs(predicted - actual) / actual;
        const accuracy = Math.max(0, (1 - error) * 100);
        totalError += error;

        recentForecasts.push({
          period: f.period,
          predicted: Math.round(predicted * 100) / 100,
          actual: Math.round(actual * 100) / 100,
          accuracy: Math.round(accuracy * 100) / 100,
        });
      }
    });

    const mape = recentForecasts.length > 0 ? (totalError / recentForecasts.length) * 100 : 15;
    const overallAccuracy = Math.max(0, 100 - mape);

    const recentAccuracies = recentForecasts.slice(0, 6).map(f => f.accuracy);
    const olderAccuracies = recentForecasts.slice(6).map(f => f.accuracy);
    
    const recentAvg = recentAccuracies.length > 0 
      ? recentAccuracies.reduce((a, b) => a + b, 0) / recentAccuracies.length 
      : 0;
    const olderAvg = olderAccuracies.length > 0 
      ? olderAccuracies.reduce((a, b) => a + b, 0) / olderAccuracies.length 
      : recentAvg;

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentAvg > olderAvg + 5) trend = 'improving';
    else if (recentAvg < olderAvg - 5) trend = 'declining';

    return {
      overallAccuracy: Math.round(overallAccuracy * 100) / 100,
      mape: Math.round(mape * 100) / 100,
      recentForecasts,
      trend,
    };
  }

  async getStoredForecasts(userId: string, limit = 10) {
    return db
      .select()
      .from(revenueForecasts)
      .where(eq(revenueForecasts.userId, userId))
      .orderBy(desc(revenueForecasts.createdAt))
      .limit(limit);
  }

  private async getHistoricalData(userId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const data = await db
      .select({
        date: analytics.date,
        streams: analytics.streams,
        revenue: analytics.revenue,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, sixMonthsAgo)
        )
      )
      .orderBy(asc(analytics.date));

    return data.map(d => ({
      date: d.date,
      streams: Number(d.streams || 0),
      revenue: Number(d.revenue || 0),
    }));
  }

  private calculateGrowthRate(data: { streams: number; revenue: number; date: Date }[]) {
    if (data.length < 2) return 0.05;

    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));

    const firstAvg = firstHalf.reduce((s, d) => s + d.revenue, 0) / firstHalf.length || 1;
    const secondAvg = secondHalf.reduce((s, d) => s + d.revenue, 0) / secondHalf.length || 1;

    const growthRate = (secondAvg - firstAvg) / firstAvg;
    return Math.max(-0.5, Math.min(1, growthRate));
  }

  private calculateAverageMonthlyStreams(data: { streams: number }[]) {
    if (data.length === 0) return 1000;
    const total = data.reduce((s, d) => s + d.streams, 0);
    const monthsOfData = Math.max(1, data.length / 30);
    return total / monthsOfData;
  }

  private calculateDataConsistency(data: { revenue: number }[]) {
    if (data.length < 7) return 0.5;

    const values = data.map(d => d.revenue);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;

    return Math.max(0.3, 1 - cv);
  }

  private calculateVolatility(data: { revenue: number }[]) {
    if (data.length < 2) return 0.3;

    const values = data.map(d => d.revenue);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? Math.min(0.5, stdDev / mean) : 0.3;
  }

  private calculateConfidence(months: number, consistency: number, dataPoints: number) {
    const baseConfidence = this.BASE_CONFIDENCE;
    const dataBonus = Math.min(0.15, dataPoints / 1000);
    const consistencyBonus = consistency * 0.1;
    const timeDecay = Math.pow(0.98, months);

    return Math.max(0.4, Math.min(0.95, (baseConfidence + dataBonus + consistencyBonus) * timeDecay));
  }

  private getAverageSeasonalityFactor(months: number) {
    const today = new Date();
    let total = 0;
    
    for (let i = 1; i <= months; i++) {
      const futureMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
      total += SEASONALITY_FACTORS[futureMonth.getMonth()];
    }
    
    return Math.round((total / months) * 100) / 100;
  }

  private async generateMonthlyBreakdown(userId: string, months: number): Promise<MonthlyProjection[]> {
    const historicalData = await this.getHistoricalData(userId);
    const streamToRevenueRate = await this.calculateStreamToRevenueRate(userId);
    const growthRate = this.calculateGrowthRate(historicalData);
    const dataConsistency = this.calculateDataConsistency(historicalData);
    const volatility = this.calculateVolatility(historicalData);

    const baseMonthlyStreams = this.calculateAverageMonthlyStreams(historicalData);
    const today = new Date();
    const result: MonthlyProjection[] = [];

    const monthlyHistorical = this.aggregateByMonth(historicalData);
    for (const [monthKey, data] of Object.entries(monthlyHistorical)) {
      result.push({
        month: monthKey,
        date: new Date(monthKey + '-01'),
        projectedStreams: data.streams,
        projectedRevenue: data.revenue,
        projectedRoyalties: data.revenue * this.ROYALTY_PERCENTAGE,
        confidence: 1,
        confidenceLow: data.revenue,
        confidenceHigh: data.revenue,
        isHistorical: true,
      });
    }

    for (let i = 0; i <= months; i++) {
      const futureDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const monthKey = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (result.some(r => r.month === monthKey)) continue;

      const seasonalFactor = SEASONALITY_FACTORS[futureDate.getMonth()];
      const growthFactor = Math.pow(1 + growthRate, i / 12);
      const confidence = this.calculateConfidence(i, dataConsistency, historicalData.length);

      const monthStreams = Math.round(baseMonthlyStreams * seasonalFactor * growthFactor);
      const monthRevenue = monthStreams * streamToRevenueRate;
      const confidenceRange = monthRevenue * volatility * (1 - confidence);

      result.push({
        month: monthKey,
        date: futureDate,
        projectedStreams: monthStreams,
        projectedRevenue: Math.round(monthRevenue * 100) / 100,
        projectedRoyalties: Math.round(monthRevenue * this.ROYALTY_PERCENTAGE * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        confidenceLow: Math.max(0, Math.round((monthRevenue - confidenceRange) * 100) / 100),
        confidenceHigh: Math.round((monthRevenue + confidenceRange) * 100) / 100,
        isHistorical: false,
      });
    }

    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private aggregateByMonth(data: { date: Date; streams: number; revenue: number }[]) {
    const monthly: Record<string, { streams: number; revenue: number }> = {};

    data.forEach(d => {
      const monthKey = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[monthKey]) {
        monthly[monthKey] = { streams: 0, revenue: 0 };
      }
      monthly[monthKey].streams += d.streams;
      monthly[monthKey].revenue += d.revenue;
    });

    return monthly;
  }

  private async getCurrentMonthlyRevenue(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const data = await db
      .select({
        total: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, thirtyDaysAgo)
        )
      );

    return Number(data[0]?.total || 0);
  }

  private generateTips(currentMonthly: number, projectedMonthly: number, growthRate: number): string[] {
    const tips: string[] = [];

    if (growthRate < 0) {
      tips.push('🎯 Focus on playlist placement to boost your stream count');
      tips.push('📱 Increase social media engagement to drive more listeners');
    }

    if (currentMonthly < 100) {
      tips.push('🎵 Release music more consistently - aim for monthly releases');
      tips.push('🤝 Collaborate with other artists to reach new audiences');
    } else if (currentMonthly < 500) {
      tips.push('📊 Analyze your top performing tracks and create similar content');
      tips.push('🌍 Expand to more streaming platforms');
    } else {
      tips.push('💎 Consider exclusive content for superfans');
      tips.push('🎤 Explore live performance opportunities');
    }

    tips.push('🔄 Keep your release schedule consistent for algorithm favor');
    tips.push('📈 Engage with playlist curators in your genre');

    return tips.slice(0, 5);
  }

  private async storeForecast(userId: string, forecast: ForecastResult) {
    await db.insert(revenueForecasts).values({
      userId,
      forecastDate: new Date(),
      forecastType: 'projection',
      period: forecast.period,
      projectedStreams: forecast.projectedStreams,
      projectedRevenue: forecast.projectedRevenue,
      projectedRoyalties: forecast.projectedRoyalties,
      confidence: forecast.confidence,
      confidenceLow: forecast.confidenceLow,
      confidenceHigh: forecast.confidenceHigh,
      methodology: 'ml-trend-seasonality',
      factors: {
        growthRate: forecast.growthRate,
        seasonalityFactor: forecast.seasonalityFactor,
        months: forecast.months,
      },
    });
  }
}

export const revenueForecastService = new RevenueForecastService();
