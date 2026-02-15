import { storage } from '../storage.js';
import { notificationService } from './notificationService.js';
import { loggingService } from './loggingService.js';
import type { InsertAnalyticsAnomaly } from '@shared/schema';
import { queueService } from './queueService.js';
import type { AnalyticsJobData } from './queueService.js';

export interface JobResponse {
  jobId: string;
  status: string;
  statusUrl: string;
}

interface MetricData {
  date: Date;
  value: number;
}

interface AnomalyDetectionResult {
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomalyType: 'spike' | 'drop' | 'unusual_pattern';
  baselineValue: number;
  actualValue: number;
  deviationPercentage: number;
  zScore: number;
}

export class AnalyticsAnomalyService {
  private readonly MIN_DATA_POINTS = 7;
  private readonly SHORT_BASELINE_DAYS = 7;
  private readonly LONG_BASELINE_DAYS = 30;

  calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  calculateZScore(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  determineSeverity(zScore: number): 'low' | 'medium' | 'high' | 'critical' {
    const absZScore = Math.abs(zScore);

    if (absZScore > 5) return 'critical';
    if (absZScore > 4) return 'high';
    if (absZScore > 3) return 'medium';
    if (absZScore > 2) return 'low';

    return 'low';
  }

  determineAnomalyType(
    zScore: number,
    value: number,
    mean: number
  ): 'spike' | 'drop' | 'unusual_pattern' {
    if (zScore > 2) return 'spike';
    if (zScore < -2) return 'drop';
    return 'unusual_pattern';
  }

  async detectAnomaly(
    metricData: MetricData[],
    currentValue: number,
    baselineDays: number = this.SHORT_BASELINE_DAYS
  ): Promise<AnomalyDetectionResult | null> {
    if (metricData.length < this.MIN_DATA_POINTS) {
      return null;
    }

    const values = metricData.map((d) => d.value);
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values, mean);
    const zScore = this.calculateZScore(currentValue, mean, stdDev);

    const absZScore = Math.abs(zScore);
    if (absZScore < 2) {
      return null;
    }

    const severity = this.determineSeverity(zScore);
    const anomalyType = this.determineAnomalyType(zScore, currentValue, mean);
    const deviationPercentage = mean !== 0 ? ((currentValue - mean) / mean) * 100 : 0;

    return {
      isAnomaly: true,
      severity,
      anomalyType,
      baselineValue: mean,
      actualValue: currentValue,
      deviationPercentage,
      zScore,
    };
  }

  async getMetricDataForUser(
    userId: string,
    metricType: 'streams' | 'revenue' | 'listeners' | 'engagement',
    days: number
  ): Promise<MetricData[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analyticsData = await storage.getStreamsAnalytics(userId, days);

    const metricData: MetricData[] = [];

    for (const data of analyticsData) {
      let value = 0;

      switch (metricType) {
        case 'streams':
          value = Number(data.streams) || 0;
          break;
        case 'revenue':
          value = Number(data.revenue) || 0;
          break;
        case 'listeners':
          value = Number(data.streams) / 1.5 || 0;
          break;
        case 'engagement':
          value = Number(data.streams) * 0.8 || 0;
          break;
      }

      metricData.push({
        date: new Date(data.date),
        value,
      });
    }

    return metricData;
  }

  async detectAnomalies(userId: string): Promise<JobResponse> {
    const job = await queueService.addAnalyticsJob('anomaly-detection', {
      userId,
      type: 'anomaly-detection',
      params: { userId },
    });

    return {
      jobId: job.id!,
      status: 'processing',
      statusUrl: `/api/jobs/analytics/${job.id}`,
    };
  }

  async processAnomalyDetection(data: AnalyticsJobData): Promise<{ anomaliesFound: number }> {
    const { userId } = data;

    if (!userId) {
      throw new Error('userId is required for anomaly detection');
    }

    let anomaliesFound = 0;

    try {
      const metricTypes: Array<'streams' | 'revenue' | 'listeners' | 'engagement'> = [
        'streams',
        'revenue',
        'listeners',
        'engagement',
      ];

      for (const metricType of metricTypes) {
        const shortBaselineData = await this.getMetricDataForUser(
          userId,
          metricType,
          this.SHORT_BASELINE_DAYS
        );

        const longBaselineData = await this.getMetricDataForUser(
          userId,
          metricType,
          this.LONG_BASELINE_DAYS
        );

        if (shortBaselineData.length === 0) {
          continue;
        }

        const currentValue = shortBaselineData[shortBaselineData.length - 1]?.value || 0;
        const baselineData =
          longBaselineData.length >= this.MIN_DATA_POINTS
            ? longBaselineData.slice(0, -1)
            : shortBaselineData.slice(0, -1);

        const anomaly = await this.detectAnomaly(
          baselineData,
          currentValue,
          this.LONG_BASELINE_DAYS
        );

        if (anomaly) {
          await this.createAnomalyRecord(userId, metricType, anomaly);
          anomaliesFound++;
        }
      }

      await loggingService.logInfo(
        'anomaly_detection',
        `Anomaly detection completed for user ${userId}`,
        { userId, anomaliesFound },
        userId
      );

      return { anomaliesFound };
    } catch (error: unknown) {
      await loggingService.logError(
        'anomaly_detection',
        `Error detecting anomalies for user ${userId}: ${error.message}`,
        error,
        { userId },
        userId
      );
      throw error;
    }
  }

  async detectAnomaliesForUser(userId: string): Promise<void> {
    try {
      const metricTypes: Array<'streams' | 'revenue' | 'listeners' | 'engagement'> = [
        'streams',
        'revenue',
        'listeners',
        'engagement',
      ];

      for (const metricType of metricTypes) {
        const shortBaselineData = await this.getMetricDataForUser(
          userId,
          metricType,
          this.SHORT_BASELINE_DAYS
        );

        const longBaselineData = await this.getMetricDataForUser(
          userId,
          metricType,
          this.LONG_BASELINE_DAYS
        );

        if (shortBaselineData.length === 0) {
          continue;
        }

        const currentValue = shortBaselineData[shortBaselineData.length - 1]?.value || 0;
        const baselineData =
          longBaselineData.length >= this.MIN_DATA_POINTS
            ? longBaselineData.slice(0, -1)
            : shortBaselineData.slice(0, -1);

        const anomaly = await this.detectAnomaly(
          baselineData,
          currentValue,
          this.LONG_BASELINE_DAYS
        );

        if (anomaly) {
          await this.createAnomalyRecord(userId, metricType, anomaly);
        }
      }

      await loggingService.logInfo(
        'anomaly_detection',
        `Anomaly detection completed for user ${userId}`,
        { userId },
        userId
      );
    } catch (error: unknown) {
      await loggingService.logError(
        'anomaly_detection',
        `Error detecting anomalies for user ${userId}: ${error.message}`,
        error,
        { userId },
        userId
      );
    }
  }

  async createAnomalyRecord(
    userId: string,
    metricType: 'streams' | 'revenue' | 'listeners' | 'engagement',
    anomaly: AnomalyDetectionResult
  ): Promise<void> {
    try {
      const recentAnomalies = await storage.getUnacknowledgedAnomalies(userId);

      const similarAnomaly = recentAnomalies.find(
        (a) =>
          a.metricType === metricType &&
          a.anomalyType === anomaly.anomalyType &&
          new Date(a.detectedAt).getTime() > Date.now() - 60 * 60 * 1000
      );

      if (similarAnomaly) {
        return;
      }

      const anomalyRecord: InsertAnalyticsAnomaly = {
        userId,
        projectId: null,
        metricType,
        anomalyType: anomaly.anomalyType,
        severity: anomaly.severity,
        baselineValue: anomaly.baselineValue.toString(),
        actualValue: anomaly.actualValue.toString(),
        deviationPercentage: anomaly.deviationPercentage.toString(),
        acknowledgedAt: null,
        notificationSent: false,
      };

      const createdAnomaly = await storage.createAnalyticsAnomaly(anomalyRecord);

      if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
        await notificationService.send({
          userId,
          type: 'system',
          title: 'Analytics Anomaly Detected',
          message: `${metricType} ${anomaly.anomalyType}: ${anomaly.deviationPercentage.toFixed(1)}% deviation from baseline`,
          link: `/analytics?tab=anomalies&id=${createdAnomaly.id}`,
          metadata: {
            anomalyId: createdAnomaly.id,
            metricType,
            anomalyType: anomaly.anomalyType,
            severity: anomaly.severity,
            deviationPercentage: anomaly.deviationPercentage,
          },
        });

        await storage.createAnalyticsAnomaly({
          ...anomalyRecord,
          id: createdAnomaly.id,
          notificationSent: true,
        });
      }

      const logMethod =
        anomaly.severity === 'critical' ? loggingService.logError : loggingService.logWarn;
      await logMethod.call(
        loggingService,
        'anomaly_detected',
        `${anomaly.severity} ${metricType} ${anomaly.anomalyType} detected for user ${userId}`,
        {
          userId,
          metricType,
          anomalyType: anomaly.anomalyType,
          severity: anomaly.severity,
          baselineValue: anomaly.baselineValue,
          actualValue: anomaly.actualValue,
          deviationPercentage: anomaly.deviationPercentage,
          zScore: anomaly.zScore,
        },
        userId
      );
    } catch (error: unknown) {
      await loggingService.logError(
        'anomaly_creation',
        `Error creating anomaly record: ${error.message}`,
        error,
        { userId, metricType },
        userId
      );
    }
  }

  async detectAnomaliesForAllUsers(): Promise<void> {
    try {
      const allUsers = await storage.getAllUsers({ page: 1, limit: 1000 });

      for (const user of allUsers.data) {
        await this.detectAnomaliesForUser(user.id);
      }

      await loggingService.logInfo(
        'anomaly_detection',
        `Anomaly detection completed for ${allUsers.data.length} users`,
        { userCount: allUsers.data.length }
      );
    } catch (error: unknown) {
      await loggingService.logError(
        'anomaly_detection',
        `Error in batch anomaly detection: ${error.message}`,
        error,
        {}
      );
    }
  }
}

export const analyticsAnomalyService = new AnalyticsAnomalyService();
