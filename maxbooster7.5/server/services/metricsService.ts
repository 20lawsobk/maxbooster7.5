import { db } from '../db.js';
import {
  systemMetrics,
  alertRules,
  alertIncidents,
  type InsertSystemMetric,
  type InsertAlertRule,
  type InsertAlertIncident,
} from '@shared/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

export class MetricsService {
  /**
   * Record a system metric (batched by minute buckets)
   */
  async recordMetric(
    metricName: string,
    value: number,
    source: string = 'server',
    tags: Record<string, any> = {}
  ): Promise<void> {
    try {
      const now = new Date();
      const bucketStart = new Date(Math.floor(now.getTime() / 60000) * 60000);

      await db
        .insert(systemMetrics)
        .values({
          metricName,
          source,
          tags,
          bucketStart,
          resolutionSecs: 60,
          avgValue: value.toString(),
          minValue: value.toString(),
          maxValue: value.toString(),
          sampleCount: 1,
        })
        .onConflictDoUpdate({
          target: [
            systemMetrics.metricName,
            systemMetrics.source,
            systemMetrics.bucketStart,
            systemMetrics.resolutionSecs,
          ],
          set: {
            avgValue: sql`((${systemMetrics.avgValue}::numeric * ${systemMetrics.sampleCount}::numeric + ${value}::numeric) / (${systemMetrics.sampleCount}::numeric + 1))::text`,
            minValue: sql`LEAST(${systemMetrics.minValue}::numeric, ${value}::numeric)::text`,
            maxValue: sql`GREATEST(${systemMetrics.maxValue}::numeric, ${value}::numeric)::text`,
            sampleCount: sql`${systemMetrics.sampleCount} + 1`,
          },
        });
    } catch (error: unknown) {
      logger.error('Failed to record metric:', error);
    }
  }

  /**
   * Get metrics for a time period
   */
  async getMetrics(
    metricName: string,
    startTime: Date,
    endTime: Date,
    source?: string
  ): Promise<Array<{ bucketStart: Date; avgValue: number; minValue: number; maxValue: number }>> {
    try {
      const conditions = [
        eq(systemMetrics.metricName, metricName),
        gte(systemMetrics.bucketStart, startTime),
        lte(systemMetrics.bucketStart, endTime),
      ];

      if (source) {
        conditions.push(eq(systemMetrics.source, source));
      }

      const results = await db
        .select({
          bucketStart: systemMetrics.bucketStart,
          avgValue: systemMetrics.avgValue,
          minValue: systemMetrics.minValue,
          maxValue: systemMetrics.maxValue,
        })
        .from(systemMetrics)
        .where(and(...conditions))
        .orderBy(systemMetrics.bucketStart);

      return results.map((r) => ({
        bucketStart: r.bucketStart!,
        avgValue: parseFloat(r.avgValue || '0'),
        minValue: parseFloat(r.minValue || '0'),
        maxValue: parseFloat(r.maxValue || '0'),
      }));
    } catch (error: unknown) {
      logger.error('Failed to get metrics:', error);
      return [];
    }
  }

  /**
   * Create an alert rule
   */
  async createAlertRule(data: InsertAlertRule): Promise<void> {
    try {
      await db.insert(alertRules).values(data);
    } catch (error: unknown) {
      logger.error('Failed to create alert rule:', error);
      throw error;
    }
  }

  /**
   * Evaluate alert rules and trigger incidents
   */
  async evaluateAlerts(): Promise<void> {
    try {
      const activeRules = await db.select().from(alertRules).where(eq(alertRules.isActive, true));

      for (const rule of activeRules) {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (rule.durationSecs || 300) * 1000);

        const metrics = await this.getMetrics(rule.metricName, startTime, endTime);

        if (metrics.length === 0) continue;

        const latestValue = metrics[metrics.length - 1].avgValue;
        const threshold = parseFloat(rule.threshold || '0');
        let shouldTrigger = false;

        switch (rule.condition) {
          case 'gt':
            shouldTrigger = latestValue > threshold;
            break;
          case 'lt':
            shouldTrigger = latestValue < threshold;
            break;
          case 'outside':
            shouldTrigger = Math.abs(latestValue) > threshold;
            break;
          case 'inside':
            shouldTrigger = Math.abs(latestValue) < threshold;
            break;
        }

        if (shouldTrigger) {
          const existingIncidents = await db
            .select()
            .from(alertIncidents)
            .where(and(eq(alertIncidents.ruleId, rule.id), eq(alertIncidents.status, 'triggered')))
            .limit(1);

          if (existingIncidents.length === 0) {
            await db.insert(alertIncidents).values({
              ruleId: rule.id,
              status: 'triggered',
              context: {
                metricName: rule.metricName,
                value: latestValue,
                threshold,
                condition: rule.condition,
              },
            });

            logger.info(
              `Alert triggered: ${rule.name} (${latestValue} ${rule.condition} ${threshold})`
            );
          }
        } else {
          await db
            .update(alertIncidents)
            .set({
              status: 'resolved',
              resolvedAt: new Date(),
            })
            .where(and(eq(alertIncidents.ruleId, rule.id), eq(alertIncidents.status, 'triggered')));
        }
      }
    } catch (error: unknown) {
      logger.error('Failed to evaluate alerts:', error);
    }
  }

  /**
   * Get active alert incidents
   */
  async getActiveIncidents(): Promise<any[]> {
    try {
      const incidents = await db
        .select({
          incident: alertIncidents,
          rule: alertRules,
        })
        .from(alertIncidents)
        .innerJoin(alertRules, eq(alertIncidents.ruleId, alertRules.id))
        .where(eq(alertIncidents.status, 'triggered'))
        .orderBy(desc(alertIncidents.triggeredAt));

      return incidents;
    } catch (error: unknown) {
      logger.error('Failed to get active incidents:', error);
      return [];
    }
  }
}

export const metricsService = new MetricsService();
