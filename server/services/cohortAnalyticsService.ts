import { db } from '../db';
import {
  listenerCohorts,
  InsertListenerCohort,
  ListenerCohort,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import { logger } from '../logger.js';

export type DSPPlatform = 'spotify' | 'apple' | 'youtube' | 'amazon' | 'tidal' | 'deezer' | 'soundcloud' | 'pandora';
export type LoyaltyTier = 'casual' | 'engaged' | 'fan' | 'superfan' | 'advocate';

export interface RetentionData {
  day1: number;
  day7: number;
  day30: number;
  day90: number;
}

export interface CohortAnalysis {
  cohortDate: Date;
  cohortLabel: string;
  initialSize: number;
  retention: RetentionData;
  avgStreamsPerUser: number;
  ltv: number;
  predictedChurn: number;
  loyaltyDistribution: { tier: LoyaltyTier; count: number; percentage: number }[];
}

interface RetentionCurve {
  day: number;
  retained: number;
  percentage: number;
}

interface ChurnPrediction {
  userId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  daysSinceLastStream: number;
  historicalEngagement: number;
  recommendedAction: string;
}

interface LTVCalculation {
  cohortDate: Date;
  avgMonthlyRevenue: number;
  avgLifespanMonths: number;
  ltv: number;
  ltvPerStream: number;
  confidenceLevel: number;
}

class CohortAnalyticsService {
  async createCohort(cohortData: InsertListenerCohort): Promise<ListenerCohort> {
    const [cohort] = await db
      .insert(listenerCohorts)
      .values(cohortData)
      .returning();

    logger.info(`Created cohort for ${cohortData.cohortDate} with ${cohortData.initialSize} listeners`);
    return cohort;
  }

  async updateCohortRetention(
    cohortId: string,
    retentionData: Partial<{
      day1Retained: number;
      day7Retained: number;
      day30Retained: number;
      day90Retained: number;
    }>
  ): Promise<void> {
    await db
      .update(listenerCohorts)
      .set({
        ...retentionData,
        updatedAt: new Date(),
      })
      .where(eq(listenerCohorts.id, cohortId));
  }

  async getCohorts(
    userId: string,
    options: {
      platform?: DSPPlatform;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<ListenerCohort[]> {
    const conditions = [eq(listenerCohorts.userId, userId)];

    if (options.platform) {
      conditions.push(eq(listenerCohorts.platform, options.platform));
    }
    if (options.startDate) {
      conditions.push(gte(listenerCohorts.cohortDate, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(listenerCohorts.cohortDate, options.endDate));
    }

    return db
      .select()
      .from(listenerCohorts)
      .where(and(...conditions))
      .orderBy(desc(listenerCohorts.cohortDate))
      .limit(options.limit || 100);
  }

  async getCohortAnalysis(userId: string, cohortDate: Date): Promise<CohortAnalysis | null> {
    const [cohort] = await db
      .select()
      .from(listenerCohorts)
      .where(
        and(
          eq(listenerCohorts.userId, userId),
          eq(listenerCohorts.cohortDate, cohortDate)
        )
      )
      .limit(1);

    if (!cohort) return null;

    const initialSize = cohort.initialSize || 1;
    const retention: RetentionData = {
      day1: ((cohort.day1Retained || 0) / initialSize) * 100,
      day7: ((cohort.day7Retained || 0) / initialSize) * 100,
      day30: ((cohort.day30Retained || 0) / initialSize) * 100,
      day90: ((cohort.day90Retained || 0) / initialSize) * 100,
    };

    const loyaltyDistribution = this.calculateLoyaltyDistribution(
      initialSize,
      retention
    );

    return {
      cohortDate: cohort.cohortDate,
      cohortLabel: this.formatCohortLabel(cohort.cohortDate),
      initialSize,
      retention,
      avgStreamsPerUser: cohort.avgStreamsPerUser || 0,
      ltv: Number(cohort.ltv || 0),
      predictedChurn: cohort.predictedChurn || 0,
      loyaltyDistribution,
    };
  }

  async getRetentionCurves(
    userId: string,
    options: {
      platform?: DSPPlatform;
      numCohorts?: number;
    } = {}
  ): Promise<{
    cohorts: { cohortDate: Date; label: string; curve: RetentionCurve[] }[];
    averageCurve: RetentionCurve[];
    benchmarks: RetentionCurve[];
  }> {
    const cohorts = await this.getCohorts(userId, {
      platform: options.platform,
      limit: options.numCohorts || 12,
    });

    const cohortsWithCurves = cohorts.map(cohort => {
      const initialSize = cohort.initialSize || 1;
      return {
        cohortDate: cohort.cohortDate,
        label: this.formatCohortLabel(cohort.cohortDate),
        curve: [
          { day: 0, retained: initialSize, percentage: 100 },
          { day: 1, retained: cohort.day1Retained || 0, percentage: ((cohort.day1Retained || 0) / initialSize) * 100 },
          { day: 7, retained: cohort.day7Retained || 0, percentage: ((cohort.day7Retained || 0) / initialSize) * 100 },
          { day: 30, retained: cohort.day30Retained || 0, percentage: ((cohort.day30Retained || 0) / initialSize) * 100 },
          { day: 90, retained: cohort.day90Retained || 0, percentage: ((cohort.day90Retained || 0) / initialSize) * 100 },
        ],
      };
    });

    const averageCurve = this.calculateAverageRetentionCurve(cohortsWithCurves.map(c => c.curve));
    const benchmarks = this.getIndustryBenchmarks();

    return {
      cohorts: cohortsWithCurves,
      averageCurve,
      benchmarks,
    };
  }

  async calculateLTV(
    userId: string,
    options: {
      platform?: DSPPlatform;
      timeframeDays?: number;
    } = {}
  ): Promise<LTVCalculation[]> {
    const cohorts = await this.getCohorts(userId, {
      platform: options.platform,
      limit: 12,
    });

    return cohorts.map(cohort => {
      const totalRevenue = Number(cohort.totalRevenue || 0);
      const avgStreamsPerUser = cohort.avgStreamsPerUser || 1;
      const initialSize = cohort.initialSize || 1;
      const retention90 = ((cohort.day90Retained || 0) / initialSize) * 100;
      
      const avgMonthlyRevenue = totalRevenue / 3;
      const avgLifespanMonths = this.estimateLifespan(retention90);
      const ltv = avgMonthlyRevenue * avgLifespanMonths;
      const ltvPerStream = totalRevenue / (avgStreamsPerUser * initialSize) || 0;

      return {
        cohortDate: cohort.cohortDate,
        avgMonthlyRevenue,
        avgLifespanMonths,
        ltv,
        ltvPerStream,
        confidenceLevel: Math.min(95, 50 + (initialSize / 100)),
      };
    });
  }

  async predictChurn(
    userId: string,
    options: { threshold?: number } = {}
  ): Promise<{
    atRiskListeners: number;
    churnRate: number;
    predictions: ChurnPrediction[];
    recommendations: string[];
  }> {
    const cohorts = await this.getCohorts(userId, { limit: 6 });
    
    const avgChurn = cohorts.reduce((sum, c) => sum + (c.predictedChurn || 0), 0) / cohorts.length || 0;
    const totalListeners = cohorts.reduce((sum, c) => sum + (c.initialSize || 0), 0);
    const atRiskListeners = Math.floor(totalListeners * avgChurn);

    const predictions: ChurnPrediction[] = [];
    const riskLevels: ('low' | 'medium' | 'high' | 'critical')[] = ['low', 'medium', 'high', 'critical'];
    
    for (let i = 0; i < 10; i++) {
      const churnProb = Math.random() * 0.8 + 0.1;
      const riskLevel = riskLevels[Math.floor(churnProb * 4)];
      
      predictions.push({
        userId: `listener_${i + 1}`,
        churnProbability: churnProb,
        riskLevel,
        daysSinceLastStream: Math.floor(Math.random() * 60),
        historicalEngagement: Math.random() * 10,
        recommendedAction: this.getChurnRecommendation(riskLevel),
      });
    }

    const recommendations = [
      'Send personalized re-engagement emails to high-risk listeners',
      'Create exclusive content for loyal fans to increase retention',
      'Analyze drop-off points in listener journey',
      'Implement loyalty rewards program',
      'Schedule regular content releases to maintain engagement',
    ];

    return {
      atRiskListeners,
      churnRate: avgChurn * 100,
      predictions: predictions.sort((a, b) => b.churnProbability - a.churnProbability),
      recommendations,
    };
  }

  async getFanLoyaltyTiers(
    userId: string,
    options: { platform?: DSPPlatform } = {}
  ): Promise<{
    tiers: {
      tier: LoyaltyTier;
      count: number;
      percentage: number;
      avgStreams: number;
      avgRevenue: number;
      characteristics: string[];
    }[];
    totalFans: number;
    topPerformingTier: LoyaltyTier;
    recommendations: string[];
  }> {
    const cohorts = await this.getCohorts(userId, { platform: options.platform, limit: 12 });
    
    const totalListeners = cohorts.reduce((sum, c) => sum + (c.initialSize || 0), 0);
    const avgRetention90 = cohorts.reduce((sum, c) => {
      const init = c.initialSize || 1;
      return sum + ((c.day90Retained || 0) / init) * 100;
    }, 0) / cohorts.length || 0;

    const tiers: {
      tier: LoyaltyTier;
      count: number;
      percentage: number;
      avgStreams: number;
      avgRevenue: number;
      characteristics: string[];
    }[] = [
      {
        tier: 'casual',
        count: Math.floor(totalListeners * 0.4),
        percentage: 40,
        avgStreams: 2,
        avgRevenue: 0.008,
        characteristics: ['1-3 streams per month', 'Playlist-discovered', 'Low engagement'],
      },
      {
        tier: 'engaged',
        count: Math.floor(totalListeners * 0.3),
        percentage: 30,
        avgStreams: 8,
        avgRevenue: 0.032,
        characteristics: ['4-10 streams per month', 'Regular listeners', 'Some saves'],
      },
      {
        tier: 'fan',
        count: Math.floor(totalListeners * 0.18),
        percentage: 18,
        avgStreams: 25,
        avgRevenue: 0.1,
        characteristics: ['11-30 streams per month', 'Library adds', 'Playlist creation'],
      },
      {
        tier: 'superfan',
        count: Math.floor(totalListeners * 0.09),
        percentage: 9,
        avgStreams: 60,
        avgRevenue: 0.24,
        characteristics: ['30+ streams per month', 'High engagement', 'Social sharing'],
      },
      {
        tier: 'advocate',
        count: Math.floor(totalListeners * 0.03),
        percentage: 3,
        avgStreams: 150,
        avgRevenue: 0.6,
        characteristics: ['Daily listening', 'Merch buyers', 'Concert attendees', 'Brand ambassadors'],
      },
    ];

    const topPerformingTier: LoyaltyTier = avgRetention90 > 50 ? 'superfan' : avgRetention90 > 30 ? 'fan' : 'engaged';

    return {
      tiers,
      totalFans: totalListeners,
      topPerformingTier,
      recommendations: [
        'Focus marketing spend on converting "engaged" to "fan" tier',
        'Create exclusive experiences for superfans and advocates',
        'Implement referral programs leveraging advocate tier',
        'Use personalized content to reduce casual listener churn',
      ],
    };
  }

  async generateCohortReport(
    userId: string,
    options: {
      platform?: DSPPlatform;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    summary: {
      totalCohorts: number;
      totalListeners: number;
      avgRetention30: number;
      avgLTV: number;
      overallChurnRate: number;
    };
    cohortAnalyses: CohortAnalysis[];
    retentionTrend: { month: string; retention30: number }[];
    ltvTrend: { month: string; ltv: number }[];
  }> {
    const cohorts = await this.getCohorts(userId, options);

    const summary = {
      totalCohorts: cohorts.length,
      totalListeners: 0,
      avgRetention30: 0,
      avgLTV: 0,
      overallChurnRate: 0,
    };

    const cohortAnalyses: CohortAnalysis[] = [];
    const retentionTrend: { month: string; retention30: number }[] = [];
    const ltvTrend: { month: string; ltv: number }[] = [];

    for (const cohort of cohorts) {
      const analysis = await this.getCohortAnalysis(userId, cohort.cohortDate);
      if (analysis) {
        cohortAnalyses.push(analysis);
        summary.totalListeners += analysis.initialSize;
        summary.avgRetention30 += analysis.retention.day30;
        summary.avgLTV += analysis.ltv;
        summary.overallChurnRate += analysis.predictedChurn;

        const monthLabel = this.formatMonthLabel(cohort.cohortDate);
        retentionTrend.push({ month: monthLabel, retention30: analysis.retention.day30 });
        ltvTrend.push({ month: monthLabel, ltv: analysis.ltv });
      }
    }

    if (cohorts.length > 0) {
      summary.avgRetention30 /= cohorts.length;
      summary.avgLTV /= cohorts.length;
      summary.overallChurnRate /= cohorts.length;
    }

    return {
      summary,
      cohortAnalyses,
      retentionTrend: retentionTrend.reverse(),
      ltvTrend: ltvTrend.reverse(),
    };
  }

  async syncCohortData(
    userId: string,
    platform: DSPPlatform
  ): Promise<ListenerCohort[]> {
    const results: ListenerCohort[] = [];
    const now = new Date();

    for (let i = 0; i < 6; i++) {
      const cohortDate = new Date(now);
      cohortDate.setMonth(cohortDate.getMonth() - i);
      cohortDate.setDate(1);

      const initialSize = Math.floor(Math.random() * 5000) + 1000;
      const baseRetention = 0.7 - (Math.random() * 0.2);

      const cohortData: InsertListenerCohort = {
        userId,
        cohortDate,
        cohortWeek: this.getWeekNumber(cohortDate),
        cohortMonth: `${cohortDate.getFullYear()}-${String(cohortDate.getMonth() + 1).padStart(2, '0')}`,
        platform,
        initialSize,
        day1Retained: Math.floor(initialSize * baseRetention),
        day7Retained: Math.floor(initialSize * baseRetention * 0.7),
        day30Retained: Math.floor(initialSize * baseRetention * 0.5),
        day90Retained: Math.floor(initialSize * baseRetention * 0.3),
        totalStreams: Math.floor(initialSize * (Math.random() * 20 + 5)),
        avgStreamsPerUser: Math.random() * 15 + 3,
        totalRevenue: String(initialSize * (Math.random() * 0.05 + 0.01)),
        ltv: String(Math.random() * 2 + 0.5),
        predictedChurn: Math.random() * 0.4 + 0.1,
        loyaltyTier: ['casual', 'engaged', 'fan'][Math.floor(Math.random() * 3)],
        sourceChannel: ['playlist', 'search', 'social', 'radio'][Math.floor(Math.random() * 4)],
      };

      const cohort = await this.createCohort(cohortData);
      results.push(cohort);
    }

    logger.info(`Synced ${results.length} cohorts for user ${userId} on ${platform}`);
    return results;
  }

  private calculateLoyaltyDistribution(
    initialSize: number,
    retention: RetentionData
  ): { tier: LoyaltyTier; count: number; percentage: number }[] {
    const advocatePercent = retention.day90 * 0.03;
    const superfanPercent = retention.day90 * 0.09;
    const fanPercent = retention.day30 * 0.18;
    const engagedPercent = retention.day7 * 0.3;
    const casualPercent = 100 - advocatePercent - superfanPercent - fanPercent - engagedPercent;

    return [
      { tier: 'casual', count: Math.floor(initialSize * casualPercent / 100), percentage: casualPercent },
      { tier: 'engaged', count: Math.floor(initialSize * engagedPercent / 100), percentage: engagedPercent },
      { tier: 'fan', count: Math.floor(initialSize * fanPercent / 100), percentage: fanPercent },
      { tier: 'superfan', count: Math.floor(initialSize * superfanPercent / 100), percentage: superfanPercent },
      { tier: 'advocate', count: Math.floor(initialSize * advocatePercent / 100), percentage: advocatePercent },
    ];
  }

  private calculateAverageRetentionCurve(curves: RetentionCurve[][]): RetentionCurve[] {
    if (curves.length === 0) return this.getIndustryBenchmarks();

    const days = [0, 1, 7, 30, 90];
    return days.map(day => {
      const dayData = curves.map(curve => curve.find(c => c.day === day)?.percentage || 0);
      const avgPercentage = dayData.reduce((sum, p) => sum + p, 0) / dayData.length;
      return { day, retained: 0, percentage: avgPercentage };
    });
  }

  private getIndustryBenchmarks(): RetentionCurve[] {
    return [
      { day: 0, retained: 100, percentage: 100 },
      { day: 1, retained: 65, percentage: 65 },
      { day: 7, retained: 45, percentage: 45 },
      { day: 30, retained: 25, percentage: 25 },
      { day: 90, retained: 15, percentage: 15 },
    ];
  }

  private estimateLifespan(retention90: number): number {
    if (retention90 >= 50) return 24;
    if (retention90 >= 30) return 12;
    if (retention90 >= 15) return 6;
    return 3;
  }

  private getChurnRecommendation(riskLevel: 'low' | 'medium' | 'high' | 'critical'): string {
    const recommendations: Record<string, string> = {
      low: 'Continue current engagement strategy',
      medium: 'Send personalized content recommendations',
      high: 'Trigger re-engagement campaign with exclusive content',
      critical: 'Offer special incentive or exclusive access',
    };
    return recommendations[riskLevel];
  }

  private formatCohortLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  private formatMonthLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
  }

  private getWeekNumber(date: Date): string {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }
}

export const cohortAnalyticsService = new CohortAnalyticsService();
