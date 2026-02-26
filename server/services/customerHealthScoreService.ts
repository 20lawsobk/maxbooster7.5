/**
 * CUSTOMER HEALTH SCORE SERVICE
 *
 * Computes a 0–100 score per user that predicts churn risk.
 * Research shows retained users average 4.4 logins/day vs 0.3 for churning users.
 *
 * Score components (weighted):
 *   Login frequency   (30%) — how recently and often the user logs in
 *   Feature adoption  (25%) — how many distinct features they've used
 *   Engagement depth  (25%) — session count and activity
 *   Payment health    (20%) — subscription status and payment history
 *
 * Risk levels:
 *   healthy   (70–100) — no action needed
 *   at_risk   (40–69)  — trigger proactive outreach
 *   churning  (0–39)   — urgent intervention required
 */

import { db } from '../db.js';
import { customerHealthScores, sessions, featureEvents, users, subscriptions } from '@shared/schema';
import { eq, and, gte, count, countDistinct, desc, gt, asc } from 'drizzle-orm';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';
import { Queue } from 'bullmq';

export type RiskLevel = 'healthy' | 'at_risk' | 'churning';

export interface HealthScoreResult {
  score: number;
  riskLevel: RiskLevel;
  loginFrequencyScore: number;
  featureAdoptionScore: number;
  engagementScore: number;
  paymentHealthScore: number;
  daysSinceLastLogin: number;
  featuresUsed: number;
  totalSessions: number;
}

class CustomerHealthScoreService {
  async computeAndStore(userId: string): Promise<HealthScoreResult> {
    const result = await this.compute(userId);
    await this.store(userId, result);
    return result;
  }

  async compute(userId: string): Promise<HealthScoreResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [lastSessionRow] = await db
      .select({ lastActivity: sessions.lastActivity })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastActivity))
      .limit(1);

    const daysSinceLastLogin = lastSessionRow?.lastActivity
      ? Math.floor((now.getTime() - lastSessionRow.lastActivity.getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    const [sessionCountRow] = await db
      .select({ count: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gte(sessions.createdAt!, thirtyDaysAgo)));

    const totalSessions = Number(sessionCountRow?.count ?? 0);

    const [featureCountRow] = await db
      .select({ distinct: countDistinct(featureEvents.featureName) })
      .from(featureEvents)
      .where(and(eq(featureEvents.userId, userId), gte(featureEvents.createdAt!, ninetyDaysAgo)));

    const featuresUsed = Number(featureCountRow?.distinct ?? 0);

    const [subscriptionRow] = await db
      .select({ status: subscriptions.status, plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const userRow = await db
      .select({ subscriptionStatus: users.subscriptionStatus, subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const subStatus = subscriptionRow?.status ?? userRow[0]?.subscriptionStatus ?? 'free';

    const loginFrequencyScore = this.computeLoginScore(daysSinceLastLogin, totalSessions);
    const featureAdoptionScore = this.computeFeatureScore(featuresUsed);
    const engagementScore = this.computeEngagementScore(totalSessions, daysSinceLastLogin);
    const paymentHealthScore = this.computePaymentScore(subStatus);

    const score = Math.round(
      loginFrequencyScore * 0.30 +
      featureAdoptionScore * 0.25 +
      engagementScore * 0.25 +
      paymentHealthScore * 0.20
    );

    const riskLevel: RiskLevel = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'churning';

    return {
      score,
      riskLevel,
      loginFrequencyScore,
      featureAdoptionScore,
      engagementScore,
      paymentHealthScore,
      daysSinceLastLogin,
      featuresUsed,
      totalSessions,
    };
  }

  private computeLoginScore(daysSinceLastLogin: number, sessionsLast30Days: number): number {
    let recencyScore = 0;
    if (daysSinceLastLogin <= 1) recencyScore = 100;
    else if (daysSinceLastLogin <= 3) recencyScore = 90;
    else if (daysSinceLastLogin <= 7) recencyScore = 75;
    else if (daysSinceLastLogin <= 14) recencyScore = 50;
    else if (daysSinceLastLogin <= 30) recencyScore = 25;
    else recencyScore = 0;

    const frequencyScore = Math.min(100, sessionsLast30Days * 5);
    return Math.round((recencyScore + frequencyScore) / 2);
  }

  private computeFeatureScore(featuresUsed: number): number {
    if (featuresUsed >= 10) return 100;
    if (featuresUsed >= 7) return 85;
    if (featuresUsed >= 5) return 70;
    if (featuresUsed >= 3) return 50;
    if (featuresUsed >= 1) return 30;
    return 0;
  }

  private computeEngagementScore(sessions30d: number, daysSinceLastLogin: number): number {
    if (daysSinceLastLogin > 30) return 0;
    if (sessions30d >= 20) return 100;
    if (sessions30d >= 10) return 80;
    if (sessions30d >= 5) return 60;
    if (sessions30d >= 2) return 40;
    if (sessions30d >= 1) return 20;
    return 0;
  }

  private computePaymentScore(status: string): number {
    switch (status) {
      case 'active':
      case 'trialing': return 100;
      case 'past_due': return 30;
      case 'unpaid': return 10;
      case 'canceled':
      case 'cancelled': return 0;
      default: return 50;
    }
  }

  private async store(userId: string, result: HealthScoreResult): Promise<void> {
    try {
      await db
        .insert(customerHealthScores)
        .values({
          userId,
          score: result.score,
          riskLevel: result.riskLevel,
          loginFrequencyScore: result.loginFrequencyScore,
          featureAdoptionScore: result.featureAdoptionScore,
          engagementScore: result.engagementScore,
          paymentHealthScore: result.paymentHealthScore,
          daysSinceLastLogin: result.daysSinceLastLogin,
          featuresUsed: result.featuresUsed,
          totalSessions: result.totalSessions,
          computedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: customerHealthScores.userId,
          set: {
            score: result.score,
            riskLevel: result.riskLevel,
            loginFrequencyScore: result.loginFrequencyScore,
            featureAdoptionScore: result.featureAdoptionScore,
            engagementScore: result.engagementScore,
            paymentHealthScore: result.paymentHealthScore,
            daysSinceLastLogin: result.daysSinceLastLogin,
            featuresUsed: result.featuresUsed,
            totalSessions: result.totalSessions,
            computedAt: new Date(),
          },
        });
    } catch (err) {
      logger.error('[HealthScore] Failed to store health score:', err);
    }
  }

  async batchCompute(limit = 500): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis) {
        const queue = new Queue('retention-jobs', { connection: redis });
        await queue.add('health-score-batch', { cursor: 0, batchSize: 100 });
        logger.info('[HealthScore] Enqueued batch compute job via BullMQ');
        return;
      }

      const allUsers = await db.select({ id: users.id }).from(users).limit(limit);
      const results = await Promise.allSettled(
        allUsers.map((u) => this.computeAndStore(u.id))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      logger.info(`[HealthScore] Batch complete: ${allUsers.length - failed} updated, ${failed} failed`);
    } catch (err) {
      logger.error('[HealthScore] Batch compute failed:', err);
    }
  }

  async batchComputePaged(cursor: number | string, batchSize: number): Promise<string | null> {
    try {
      // Drizzle handles string vs number ID mapping, but let's assume it's string based on schema varchar(id)
      const batch = await db
        .select({ id: users.id })
        .from(users)
        .where(gt(users.id, String(cursor)))
        .orderBy(asc(users.id))
        .limit(batchSize);

      if (batch.length === 0) return null;

      for (const u of batch) {
        await this.computeAndStore(u.id);
      }

      const lastId = batch[batch.length - 1].id;
      return lastId;
    } catch (err) {
      logger.error('[HealthScore] Batch compute paged failed:', err);
      throw err;
    }
  }
}

export const customerHealthScoreService = new CustomerHealthScoreService();
