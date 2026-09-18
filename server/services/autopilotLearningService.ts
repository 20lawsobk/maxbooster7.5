import { db } from "../db.js";
import { autopilotLearningData, autopilotInsights } from "@shared/schema";
import { eq, and, desc, gte, sql, avg, count } from "drizzle-orm";
import { logger } from "../logger.js";
import { pushTrainingFeedback } from "./maxcoreSync.js";
import { maxCoreControlTransport } from "./maxcoreControlTransport.js";

const CURRICULUM_TRIGGER_ENGAGEMENT_THRESHOLD = 3.0;

export interface PostData {
  platform: string;
  contentType?: string;
  hookType?: string;
  hashtags?: string[];
  contentText?: string;
  mediaType?: string;
  postId?: string;
  postedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AnalyticsData {
  impressions?: number;
  clicks?: number;
  shares?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  reach?: number;
  engagementRate?: number;
}

export interface LearningInsight {
  type: string;
  platform?: string;
  data: Record<string, any>;
  confidence: number;
  priority: number;
}

export interface Recommendation {
  id: string;
  type: "timing" | "content" | "hashtags" | "hook" | "platform" | "general";
  title: string;
  description: string;
  confidence: number;
  priority: number;
  actionable: boolean;
  suggestedAction?: string;
  data?: Record<string, any>;
}

export interface PerformancePattern {
  pattern: string;
  description: string;
  frequency: number;
  avgEngagement: number;
  confidence: number;
}

interface MaxCoreAutopilotResult {
  success: boolean;
  model_powered: boolean;
  analysis: {
    avg_engagement_rate: number;
    top_style_tags: string[];
    best_content_type: string;
    data_points: number;
  };
  recommendations: {
    next_topics: Array<Record<string, unknown>>;
    best_posting_times: string[];
    content_type: string;
    style_focus: string[];
  };
}

class AutopilotLearningService {
  private async requestMaxCoreAutopilot(
    userId: string,
  ): Promise<MaxCoreAutopilotResult> {
    const recent = await db
      .select()
      .from(autopilotLearningData)
      .where(eq(autopilotLearningData.userId, userId))
      .orderBy(desc(autopilotLearningData.createdAt))
      .limit(50);
    const platform = recent[0]?.platform || "instagram";
    const result = await maxCoreControlTransport.request<MaxCoreAutopilotResult>(
      "/platform/social/autopilot",
      {
        method: "POST",
        authScope: "generation",
        userId,
        timeoutMs: 600_000,
        body: {
          user_id: userId,
          platform,
          target_metric: "engagement",
          recent_posts: recent.map((row) => ({
            content_type: row.contentType ?? "post",
            style_tags: row.hookType ? [row.hookType] : [],
            engagement_rate: row.engagementRate ?? 0,
            posted_at: row.createdAt,
          })),
        },
      },
    );
    if (
      !result?.success ||
      !result.analysis ||
      !result.recommendations ||
      !Array.isArray(result.recommendations.next_topics) ||
      !Array.isArray(result.recommendations.best_posting_times)
    ) {
      throw new Error(
        "MaxCore social autopilot returned an invalid response contract",
      );
    }
    return result;
  }

  async recordPerformance(
    userId: string,
    postData: PostData,
    analytics: AnalyticsData,
  ): Promise<string> {
    try {
      const postedAt = postData?.postedAt || new Date();
      const postingHour = postedAt?.getHours();
      const postingDayOfWeek = postedAt?.getDay();

      const engagementRate = this.calculateEngagementScore(analytics);

      const [record] = await db
        .insert(autopilotLearningData)
        .values({
          userId,
          platform: postData.platform,
          contentType: postData.contentType || null,
          hookType: postData.hookType || null,
          postingHour,
          postingDayOfWeek,
          engagementRate,
          impressions: analytics.impressions || 0,
          clicks: analytics.clicks || 0,
          shares: analytics.shares || 0,
          likes: analytics.likes || 0,
          comments: analytics.comments || 0,
          saves: analytics.saves || 0,
          reach: analytics.reach || 0,
          hashtags: postData.hashtags || [],
          contentText: postData.contentText || null,
          mediaType: postData.mediaType || null,
          postId: postData.postId || null,
          metadata: postData.metadata || {},
        })
        .returning();

      logger.info(
        `Recorded performance for user ${userId} on ${postData?.platform}`,
      );

      await this.updateInsightsIfNeeded(userId, postData?.platform);

      if (engagementRate >= CURRICULUM_TRIGGER_ENGAGEMENT_THRESHOLD) {
        this.dispatchCurriculumSessionAsync(engagementRate, postData).catch(
          (err) =>
            logger.warn(
              { err: err },
              "[AutopilotLearning] CurriculumTrainer dispatch skipped:",
            ),
        );
      }

      return record?.id;
    } catch (error) {
      logger.warn({ err: error }, "Failed to record performance:");
      throw error;
    }
  }

  calculateEngagementScore(analytics: AnalyticsData): number {
    const impressions = analytics?.impressions || 1;
    const totalEngagements =
      (analytics?.likes || 0) +
      (analytics?.comments || 0) * 2 +
      (analytics?.shares || 0) * 3 +
      (analytics?.saves || 0) * 2 +
      (analytics?.clicks || 0);

    const engagementRate = (totalEngagements / impressions) * 100;
    return Math.round(engagementRate * 100) / 100;
  }

  async getOptimalPostingTimes(
    userId: string,
    platform: string,
  ): Promise<{ hour: number; dayOfWeek: number; avgEngagement: number }[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const results = await db
        .select({
          hour: autopilotLearningData.postingHour,
          dayOfWeek: autopilotLearningData.postingDayOfWeek,
          avgEngagement: avg(autopilotLearningData.engagementRate),
          postCount: count(),
        })
        .from(autopilotLearningData)
        .where(
          and(
            eq(autopilotLearningData.userId, userId),
            eq(autopilotLearningData.platform, platform),
            gte(autopilotLearningData.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(
          autopilotLearningData.postingHour,
          autopilotLearningData.postingDayOfWeek,
        )
        .orderBy(desc(avg(autopilotLearningData.engagementRate)));

      return results
        .filter((r) => r?.hour !== null && r?.dayOfWeek !== null)
        .map((r) => ({
          hour: r.hour!,
          dayOfWeek: r.dayOfWeek!,
          avgEngagement: parseFloat(String(r?.avgEngagement)) || 0,
        }));
    } catch (error) {
      logger.warn({ err: error }, "Failed to get optimal posting times:");
      return [];
    }
  }

  async getTopPerformingContentTypes(
    userId: string,
    platform?: string,
  ): Promise<{ contentType: string; avgEngagement: number; count: number }[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const conditions = [
        eq(autopilotLearningData.userId, userId),
        gte(autopilotLearningData.createdAt, thirtyDaysAgo),
      ];

      if (platform) {
        conditions?.push(eq(autopilotLearningData.platform, platform));
      }

      const results = await db
        .select({
          contentType: autopilotLearningData.contentType,
          avgEngagement: avg(autopilotLearningData.engagementRate),
          count: count(),
        })
        .from(autopilotLearningData)
        .where(and(...conditions))
        .groupBy(autopilotLearningData.contentType)
        .orderBy(desc(avg(autopilotLearningData.engagementRate)));

      return results
        .filter((r) => r?.contentType)
        .map((r) => ({
          contentType: r.contentType!,
          avgEngagement: parseFloat(String(r?.avgEngagement)) || 0,
          count: Number(r?.count),
        }));
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to get top performing content types:",
      );
      return [];
    }
  }

  // ── Engagement Feedback Loop ───────────────────────────────────────────────
  // Returns per-artist content pattern weights derived from real post performance.
  // These weights are passed to ContentGenerator to bias beam search candidate
  // selection toward patterns that have historically driven higher engagement
  // for this specific artist and platform.
  //
  // Return format: { 'curiosity gap': 1.6, 'release': 1.2, 'organic': 1.0 }
  // A weight of 1.0 = baseline. >1.0 = this hook type outperforms average.
  async getContentPatternWeights(
    userId: string,
    platform?: string,
  ): Promise<Record<string, number>> {
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo?.setDate(sixtyDaysAgo?.getDate() - 60);

      const conditions = [
        eq(autopilotLearningData.userId, userId),
        gte(autopilotLearningData.createdAt, sixtyDaysAgo),
        ...(platform ? [eq(autopilotLearningData.platform, platform)] : []),
      ];

      const rows = await db
        .select({
          hookType: autopilotLearningData.hookType,
          avgEngagement: avg(autopilotLearningData.engagementRate),
          postCount: count(),
        })
        .from(autopilotLearningData)
        .where(and(...conditions))
        .groupBy(autopilotLearningData.hookType)
        .orderBy(desc(avg(autopilotLearningData.engagementRate)));

      const populated = rows?.filter(
        (r) => r?.hookType && Number(r?.postCount) >= 2,
      );
      if (populated?.length === 0) return {};

      const engagements = populated?.map(
        (r) => parseFloat(String(r?.avgEngagement)) || 0,
      );
      const globalAvg =
        engagements?.reduce((a, b) => a + b, 0) / engagements?.length || 1;

      const weights: Record<string, number> = {};
      for (const row of populated) {
        const eng = parseFloat(String(row?.avgEngagement)) || 0;
        const relativeWeight = globalAvg > 0 ? eng / globalAvg : 1.0;
        weights[row.hookType!] = Math.max(0.5, Math.min(2.5, relativeWeight));
      }

      return weights;
    } catch (error) {
      logger.warn({ err: error }, "Failed to get content pattern weights:");
      return {};
    }
  }

  async getRecommendations(userId: string): Promise<Recommendation[]> {
    const result = await this.requestMaxCoreAutopilot(userId);
    const recommendations: Recommendation[] = [];
    const bestTimes = result.recommendations.best_posting_times ?? [];
    if (bestTimes.length) {
      recommendations.push({
        id: `maxcore-timing-${Date.now()}`,
        type: "timing",
        title: "MaxCore Posting Time",
        description: `MaxCore recommends: ${bestTimes.join(", ")}`,
        confidence: result.model_powered ? 1 : 0,
        priority: 1,
        actionable: true,
        suggestedAction: `Schedule content for ${bestTimes[0]}`,
        data: { bestPostingTimes: bestTimes, source: "maxcore" },
      });
    }
    for (const [index, topic] of (
      result.recommendations.next_topics ?? []
    ).entries()) {
      recommendations.push({
        id: `maxcore-topic-${Date.now()}-${index}`,
        type: "content",
        title: String(topic.topic ?? "MaxCore content recommendation"),
        description: String(topic.hook ?? topic.cta ?? ""),
        confidence: result.model_powered ? 1 : 0,
        priority: index + 2,
        actionable: true,
        suggestedAction: topic.cta ? String(topic.cta) : undefined,
        data: { ...topic, source: "maxcore" },
      });
    }
    return recommendations;
  }

  async detectPatterns(userId: string): Promise<PerformancePattern[]> {
    const result = await this.requestMaxCoreAutopilot(userId);
    const tags = result.analysis.top_style_tags ?? [];
    return tags.map((tag) => ({
      pattern: String(tag),
      description: `MaxCore identified ${tag} as a top-performing style`,
      frequency: result.analysis.data_points,
      avgEngagement: result.analysis.avg_engagement_rate,
      confidence: result.model_powered ? 1 : 0,
    }));
  }

  async getPerformanceHistory(
    userId: string,
    options: { platform?: string; limit?: number; offset?: number } = {},
  ): Promise<{ data: unknown[]; total: number }> {
    try {
      const conditions = [eq(autopilotLearningData.userId, userId)];

      if (options?.platform) {
        conditions?.push(eq(autopilotLearningData.platform, options?.platform));
      }

      const [data, countResult] = await Promise.all([
        db
          .select()
          .from(autopilotLearningData)
          .where(and(...conditions))
          .orderBy(desc(autopilotLearningData.createdAt))
          .limit(options?.limit || 50)
          .offset(options?.offset || 0),
        db
          .select({ count: count() })
          .from(autopilotLearningData)
          .where(and(...conditions)),
      ]);

      return {
        data,
        total: Number(countResult[0]?.count || 0),
      };
    } catch (error) {
      logger.warn({ err: error }, "Failed to get performance history:");
      return { data: [], total: 0 };
    }
  }

  async getActiveInsights(userId: string): Promise<any[]> {
    try {
      new Date();
      return await db
        .select()
        .from(autopilotInsights)
        .where(
          and(
            eq(autopilotInsights.userId, userId),
            eq(autopilotInsights.isActive, true),
          ),
        )
        .orderBy(
          desc(autopilotInsights.priority),
          desc(autopilotInsights.confidence),
        )
        .limit(50);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get active insights:");
      return [];
    }
  }

  async getLearningInsights(userId: string): Promise<LearningInsight[]> {
    try {
      const [optimalTimes, topContentTypes, patterns, platformStats] =
        await Promise.all([
          this.getOptimalPostingTimes(userId, "all"),
          this.getTopPerformingContentTypes(userId),
          this.detectPatterns(userId),
          this.getPlatformStatistics(userId),
        ]);

      const insights: LearningInsight[] = [];

      if (optimalTimes?.length > 0) {
        insights?.push({
          type: "optimal_timing",
          data: { times: optimalTimes.slice(0, 10) },
          confidence: Math.min(0.9, 0.5 + optimalTimes?.length * 0.04),
          priority: 1,
        });
      }

      if (topContentTypes?.length > 0) {
        insights?.push({
          type: "content_performance",
          data: { contentTypes: topContentTypes },
          confidence: Math.min(
            0.85,
            0.4 + topContentTypes?.reduce((sum, t) => sum + t?.count, 0) * 0.02,
          ),
          priority: 2,
        });
      }

      for (const pattern of patterns) {
        insights?.push({
          type: "pattern",
          data: pattern,
          confidence: pattern.confidence,
          priority: 3,
        });
      }

      for (const stat of platformStats) {
        insights?.push({
          type: "platform_stats",
          platform: stat.platform,
          data: stat,
          confidence: 0.9,
          priority: 4,
        });
      }

      return insights;
    } catch (error) {
      logger.warn({ err: error }, "Failed to get learning insights:");
      return [];
    }
  }

  async getPlatformStatistics(userId: string): Promise<any[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const results = await db
        .select({
          platform: autopilotLearningData.platform,
          avgEngagement: avg(autopilotLearningData.engagementRate),
          totalImpressions: sql<number>`SUM(${autopilotLearningData.impressions})`,
          totalClicks: sql<number>`SUM(${autopilotLearningData.clicks})`,
          totalShares: sql<number>`SUM(${autopilotLearningData.shares})`,
          postCount: count(),
        })
        .from(autopilotLearningData)
        .where(
          and(
            eq(autopilotLearningData.userId, userId),
            gte(autopilotLearningData.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(autopilotLearningData.platform);

      return results?.map((r) => ({
        platform: r.platform,
        avgEngagement: parseFloat(String(r?.avgEngagement)) || 0,
        totalImpressions: Number(r?.totalImpressions) || 0,
        totalClicks: Number(r?.totalClicks) || 0,
        totalShares: Number(r?.totalShares) || 0,
        postCount: Number(r?.postCount),
      }));
    } catch (error) {
      logger.warn({ err: error }, "Failed to get platform statistics:");
      return [];
    }
  }

  private async updateInsightsIfNeeded(
    userId: string,
    _platform: string,
  ): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const [postCount] = await db
        .select({ count: count() })
        .from(autopilotLearningData)
        .where(
          and(
            eq(autopilotLearningData.userId, userId),
            gte(autopilotLearningData.createdAt, thirtyDaysAgo),
          ),
        );

      const total = Number(postCount?.count || 0);

      // Regenerate DB insights every 5 new posts once past 10
      if (total >= 10 && total % 5 === 0) {
        await this.generateInsights(userId);
      }

    } catch (error) {
      logger.warn({ err: error }, "Failed to check insights update:");
    }
  }

  async generateInsights(userId: string): Promise<void> {
    try {
      logger.info(`Requesting MaxCore insights for user ${userId}`);
      const result = await this.requestMaxCoreAutopilot(userId);

      await db
        .delete(autopilotInsights)
        .where(eq(autopilotInsights.userId, userId));

      const insightsToInsert = [{
        userId,
        insightType: "general",
        data: {
          title: "MaxCore Autopilot Strategy",
          description: "Current strategy from MaxCore",
          analysis: result.analysis,
          recommendations: result.recommendations,
          actionable: true,
          source: "maxcore",
        },
        confidence: result.model_powered ? 1 : 0,
        priority: 1,
        isActive: true,
      }];

      if (insightsToInsert?.length > 0) {
        await db.insert(autopilotInsights).values(insightsToInsert);
        logger.info(
          `Generated ${insightsToInsert?.length} insights for user ${userId}`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to generate insights:");
      throw error;
    }
  }

  /**
   * Dispatches a CurriculumTrainer training session to the AI server when a
   * high-engagement post is recorded. The engagement data acts as a reinforcement
   * label: the visual/content style that drove high engagement is signalled to the
   * DiffusionTrainer so it can reinforce those visual patterns in the next session.
   *
   * Fire-and-forget — never blocks the request path.
   */
  private async dispatchCurriculumSessionAsync(
    engagementRate: number,
    postData: PostData,
  ): Promise<void> {
    await pushTrainingFeedback({
      content: postData.contentText || "",
      source: "autopilot_learning",
      trigger: "high_engagement_post",
      engagement_rate: engagementRate,
      platform: postData.platform,
      content_type: postData.contentType || "unknown",
      hook_type: postData.hookType || "unknown",
      media_type: postData.mediaType || "unknown",
      curriculum_hint: "reinforce_high_engagement_visual_style",
      dispatched_at: new Date().toISOString(),
    });
  }
}

export const autopilotLearningService = new AutopilotLearningService();
