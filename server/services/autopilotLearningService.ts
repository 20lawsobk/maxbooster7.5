import { db } from '../db.js';
import { autopilotLearningData, autopilotInsights } from '@shared/schema';
import { eq, and, desc, gte, sql, avg, count } from 'drizzle-orm';
import { logger } from '../logger.js';

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
  type: 'timing' | 'content' | 'hashtags' | 'hook' | 'platform' | 'general';
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

class AutopilotLearningService {
  async recordPerformance(
    userId: string,
    postData: PostData,
    analytics: AnalyticsData
  ): Promise<string> {
    try {
      const postedAt = postData.postedAt || new Date();
      const postingHour = postedAt.getHours();
      const postingDayOfWeek = postedAt.getDay();

      const engagementRate = this.calculateEngagementScore(analytics);

      const [record] = await db.insert(autopilotLearningData).values({
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
      }).returning();

      logger.info(`Recorded performance for user ${userId} on ${postData.platform}`);

      await this.updateInsightsIfNeeded(userId, postData.platform);

      return record.id;
    } catch (error) {
      logger.error('Failed to record performance:', error);
      throw error;
    }
  }

  calculateEngagementScore(analytics: AnalyticsData): number {
    const impressions = analytics.impressions || 1;
    const totalEngagements = 
      (analytics.likes || 0) +
      (analytics.comments || 0) * 2 +
      (analytics.shares || 0) * 3 +
      (analytics.saves || 0) * 2 +
      (analytics.clicks || 0);
    
    const engagementRate = (totalEngagements / impressions) * 100;
    return Math.round(engagementRate * 100) / 100;
  }

  async getOptimalPostingTimes(
    userId: string,
    platform: string
  ): Promise<{ hour: number; dayOfWeek: number; avgEngagement: number }[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
            gte(autopilotLearningData.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(autopilotLearningData.postingHour, autopilotLearningData.postingDayOfWeek)
        .orderBy(desc(avg(autopilotLearningData.engagementRate)));

      return results
        .filter(r => r.hour !== null && r.dayOfWeek !== null)
        .map(r => ({
          hour: r.hour!,
          dayOfWeek: r.dayOfWeek!,
          avgEngagement: parseFloat(String(r.avgEngagement)) || 0,
        }));
    } catch (error) {
      logger.error('Failed to get optimal posting times:', error);
      return [];
    }
  }

  async getTopPerformingContentTypes(
    userId: string,
    platform?: string
  ): Promise<{ contentType: string; avgEngagement: number; count: number }[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const conditions = [
        eq(autopilotLearningData.userId, userId),
        gte(autopilotLearningData.createdAt, thirtyDaysAgo),
      ];

      if (platform) {
        conditions.push(eq(autopilotLearningData.platform, platform));
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
        .filter(r => r.contentType)
        .map(r => ({
          contentType: r.contentType!,
          avgEngagement: parseFloat(String(r.avgEngagement)) || 0,
          count: Number(r.count),
        }));
    } catch (error) {
      logger.error('Failed to get top performing content types:', error);
      return [];
    }
  }

  async getRecommendations(userId: string): Promise<Recommendation[]> {
    try {
      const recommendations: Recommendation[] = [];

      const [optimalTimes, topContentTypes, patterns, insights] = await Promise.all([
        this.getOptimalPostingTimes(userId, 'all'),
        this.getTopPerformingContentTypes(userId),
        this.detectPatterns(userId),
        this.getActiveInsights(userId),
      ]);

      if (optimalTimes.length > 0) {
        const bestTime = optimalTimes[0];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        recommendations.push({
          id: `timing-${Date.now()}`,
          type: 'timing',
          title: 'Optimal Posting Time',
          description: `Your content performs best on ${days[bestTime.dayOfWeek]} at ${bestTime.hour}:00 with ${bestTime.avgEngagement.toFixed(2)}% engagement rate.`,
          confidence: Math.min(0.95, 0.5 + (optimalTimes.length * 0.05)),
          priority: 1,
          actionable: true,
          suggestedAction: `Schedule your next post for ${days[bestTime.dayOfWeek]} at ${bestTime.hour}:00`,
          data: { bestTime, allTimes: optimalTimes.slice(0, 5) },
        });
      }

      if (topContentTypes.length > 0) {
        const bestType = topContentTypes[0];
        recommendations.push({
          id: `content-${Date.now()}`,
          type: 'content',
          title: 'Top Performing Content Type',
          description: `${bestType.contentType} content generates ${bestType.avgEngagement.toFixed(2)}% engagement on average.`,
          confidence: Math.min(0.9, 0.4 + (bestType.count * 0.1)),
          priority: 2,
          actionable: true,
          suggestedAction: `Create more ${bestType.contentType} content to maximize engagement`,
          data: { bestType, allTypes: topContentTypes },
        });
      }

      for (const pattern of patterns.slice(0, 3)) {
        recommendations.push({
          id: `pattern-${Date.now()}-${pattern.pattern}`,
          type: 'general',
          title: `Pattern Detected: ${pattern.pattern}`,
          description: pattern.description,
          confidence: pattern.confidence,
          priority: 3,
          actionable: true,
          data: { pattern },
        });
      }

      for (const insight of insights) {
        const insightData = insight.data as Record<string, any>;
        recommendations.push({
          id: `insight-${insight.id}`,
          type: insight.insightType as Recommendation['type'],
          title: insightData.title || `${insight.insightType} Insight`,
          description: insightData.description || 'AI-generated insight',
          confidence: insight.confidence || 0.5,
          priority: insight.priority || 5,
          actionable: insightData.actionable || false,
          suggestedAction: insightData.suggestedAction,
          data: insightData,
        });
      }

      return recommendations.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      logger.error('Failed to get recommendations:', error);
      return [];
    }
  }

  async detectPatterns(userId: string): Promise<PerformancePattern[]> {
    try {
      const patterns: PerformancePattern[] = [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentData = await db
        .select()
        .from(autopilotLearningData)
        .where(
          and(
            eq(autopilotLearningData.userId, userId),
            gte(autopilotLearningData.createdAt, thirtyDaysAgo)
          )
        )
        .orderBy(desc(autopilotLearningData.engagementRate))
        .limit(100);

      if (recentData.length < 5) {
        return patterns;
      }

      const avgEngagement = recentData.reduce((sum, d) => sum + (d.engagementRate || 0), 0) / recentData.length;
      const highPerformers = recentData.filter(d => (d.engagementRate || 0) > avgEngagement * 1.5);

      if (highPerformers.length >= 3) {
        const hookTypes = highPerformers.map(d => d.hookType).filter(Boolean);
        const hookCounts = hookTypes.reduce((acc, hook) => {
          acc[hook!] = (acc[hook!] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const topHook = Object.entries(hookCounts).sort((a, b) => b[1] - a[1])[0];
        if (topHook && topHook[1] >= 2) {
          patterns.push({
            pattern: 'hook_success',
            description: `Posts with "${topHook[0]}" hooks perform ${((highPerformers[0].engagementRate || 0) / avgEngagement * 100 - 100).toFixed(0)}% better than average`,
            frequency: topHook[1],
            avgEngagement: highPerformers.filter(d => d.hookType === topHook[0])
              .reduce((sum, d) => sum + (d.engagementRate || 0), 0) / topHook[1],
            confidence: Math.min(0.85, 0.5 + (topHook[1] * 0.1)),
          });
        }

        const morningPosts = highPerformers.filter(d => (d.postingHour || 0) >= 6 && (d.postingHour || 0) < 12);
        const afternoonPosts = highPerformers.filter(d => (d.postingHour || 0) >= 12 && (d.postingHour || 0) < 18);
        const eveningPosts = highPerformers.filter(d => (d.postingHour || 0) >= 18 && (d.postingHour || 0) < 22);

        if (morningPosts.length > afternoonPosts.length && morningPosts.length > eveningPosts.length) {
          patterns.push({
            pattern: 'morning_performer',
            description: 'Your best content performs well during morning hours (6 AM - 12 PM)',
            frequency: morningPosts.length,
            avgEngagement: morningPosts.reduce((sum, d) => sum + (d.engagementRate || 0), 0) / morningPosts.length,
            confidence: 0.7,
          });
        } else if (eveningPosts.length > morningPosts.length && eveningPosts.length > afternoonPosts.length) {
          patterns.push({
            pattern: 'evening_performer',
            description: 'Your audience is most active during evening hours (6 PM - 10 PM)',
            frequency: eveningPosts.length,
            avgEngagement: eveningPosts.reduce((sum, d) => sum + (d.engagementRate || 0), 0) / eveningPosts.length,
            confidence: 0.7,
          });
        }

        const allHashtags: string[] = [];
        highPerformers.forEach(d => {
          if (Array.isArray(d.hashtags)) {
            allHashtags.push(...d.hashtags);
          }
        });

        const hashtagCounts = allHashtags.reduce((acc, tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const topHashtags = Object.entries(hashtagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (topHashtags.length >= 3) {
          patterns.push({
            pattern: 'hashtag_success',
            description: `Top performing hashtags: ${topHashtags.map(h => `#${h[0]}`).join(', ')}`,
            frequency: topHashtags.reduce((sum, h) => sum + h[1], 0),
            avgEngagement: avgEngagement * 1.5,
            confidence: 0.65,
          });
        }
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to detect patterns:', error);
      return [];
    }
  }

  async getPerformanceHistory(
    userId: string,
    options: { platform?: string; limit?: number; offset?: number } = {}
  ): Promise<{ data: any[]; total: number }> {
    try {
      const conditions = [eq(autopilotLearningData.userId, userId)];
      
      if (options.platform) {
        conditions.push(eq(autopilotLearningData.platform, options.platform));
      }

      const [data, countResult] = await Promise.all([
        db
          .select()
          .from(autopilotLearningData)
          .where(and(...conditions))
          .orderBy(desc(autopilotLearningData.createdAt))
          .limit(options.limit || 50)
          .offset(options.offset || 0),
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
      logger.error('Failed to get performance history:', error);
      return { data: [], total: 0 };
    }
  }

  async getActiveInsights(userId: string): Promise<any[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(autopilotInsights)
        .where(
          and(
            eq(autopilotInsights.userId, userId),
            eq(autopilotInsights.isActive, true)
          )
        )
        .orderBy(desc(autopilotInsights.priority), desc(autopilotInsights.confidence));
    } catch (error) {
      logger.error('Failed to get active insights:', error);
      return [];
    }
  }

  async getLearningInsights(userId: string): Promise<LearningInsight[]> {
    try {
      const [
        optimalTimes,
        topContentTypes,
        patterns,
        platformStats,
      ] = await Promise.all([
        this.getOptimalPostingTimes(userId, 'all'),
        this.getTopPerformingContentTypes(userId),
        this.detectPatterns(userId),
        this.getPlatformStatistics(userId),
      ]);

      const insights: LearningInsight[] = [];

      if (optimalTimes.length > 0) {
        insights.push({
          type: 'optimal_timing',
          data: { times: optimalTimes.slice(0, 10) },
          confidence: Math.min(0.9, 0.5 + (optimalTimes.length * 0.04)),
          priority: 1,
        });
      }

      if (topContentTypes.length > 0) {
        insights.push({
          type: 'content_performance',
          data: { contentTypes: topContentTypes },
          confidence: Math.min(0.85, 0.4 + (topContentTypes.reduce((sum, t) => sum + t.count, 0) * 0.02)),
          priority: 2,
        });
      }

      for (const pattern of patterns) {
        insights.push({
          type: 'pattern',
          data: pattern,
          confidence: pattern.confidence,
          priority: 3,
        });
      }

      for (const stat of platformStats) {
        insights.push({
          type: 'platform_stats',
          platform: stat.platform,
          data: stat,
          confidence: 0.9,
          priority: 4,
        });
      }

      return insights;
    } catch (error) {
      logger.error('Failed to get learning insights:', error);
      return [];
    }
  }

  async getPlatformStatistics(userId: string): Promise<any[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
            gte(autopilotLearningData.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(autopilotLearningData.platform);

      return results.map(r => ({
        platform: r.platform,
        avgEngagement: parseFloat(String(r.avgEngagement)) || 0,
        totalImpressions: Number(r.totalImpressions) || 0,
        totalClicks: Number(r.totalClicks) || 0,
        totalShares: Number(r.totalShares) || 0,
        postCount: Number(r.postCount),
      }));
    } catch (error) {
      logger.error('Failed to get platform statistics:', error);
      return [];
    }
  }

  private async updateInsightsIfNeeded(userId: string, platform: string): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const postCount = await db
        .select({ count: count() })
        .from(autopilotLearningData)
        .where(
          and(
            eq(autopilotLearningData.userId, userId),
            gte(autopilotLearningData.createdAt, thirtyDaysAgo)
          )
        );

      const total = Number(postCount[0]?.count || 0);

      if (total >= 10 && total % 5 === 0) {
        await this.generateInsights(userId);
      }
    } catch (error) {
      logger.error('Failed to check insights update:', error);
    }
  }

  async generateInsights(userId: string): Promise<void> {
    try {
      logger.info(`Generating insights for user ${userId}`);

      const [optimalTimes, topContentTypes, patterns] = await Promise.all([
        this.getOptimalPostingTimes(userId, 'all'),
        this.getTopPerformingContentTypes(userId),
        this.detectPatterns(userId),
      ]);

      await db.delete(autopilotInsights).where(eq(autopilotInsights.userId, userId));

      const insightsToInsert = [];

      if (optimalTimes.length > 0) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const bestTime = optimalTimes[0];
        insightsToInsert.push({
          userId,
          insightType: 'timing',
          data: {
            title: 'Best Posting Time',
            description: `Post on ${days[bestTime.dayOfWeek]} at ${bestTime.hour}:00 for optimal engagement`,
            times: optimalTimes.slice(0, 5),
            actionable: true,
            suggestedAction: `Schedule posts for ${days[bestTime.dayOfWeek]} at ${bestTime.hour}:00`,
          },
          confidence: Math.min(0.9, 0.5 + (optimalTimes.length * 0.05)),
          priority: 1,
          isActive: true,
        });
      }

      if (topContentTypes.length > 0) {
        insightsToInsert.push({
          userId,
          insightType: 'content',
          data: {
            title: 'Top Content Types',
            description: `${topContentTypes[0].contentType} content performs best with ${topContentTypes[0].avgEngagement.toFixed(2)}% engagement`,
            contentTypes: topContentTypes,
            actionable: true,
            suggestedAction: `Focus on creating more ${topContentTypes[0].contentType} content`,
          },
          confidence: Math.min(0.85, 0.4 + (topContentTypes[0].count * 0.1)),
          priority: 2,
          isActive: true,
        });
      }

      for (const pattern of patterns) {
        insightsToInsert.push({
          userId,
          insightType: 'general',
          data: {
            title: pattern.pattern,
            description: pattern.description,
            pattern,
            actionable: true,
          },
          confidence: pattern.confidence,
          priority: 3,
          isActive: true,
        });
      }

      if (insightsToInsert.length > 0) {
        await db.insert(autopilotInsights).values(insightsToInsert);
        logger.info(`Generated ${insightsToInsert.length} insights for user ${userId}`);
      }
    } catch (error) {
      logger.error('Failed to generate insights:', error);
    }
  }
}

export const autopilotLearningService = new AutopilotLearningService();
