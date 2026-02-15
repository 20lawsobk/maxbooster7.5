import { db } from '../db';
import { competitorProfiles, posts } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';

export interface CompetitorMetrics {
  id: string;
  name: string;
  handle: string;
  platforms: Array<{
    platform: string;
    followers: number;
    followersGrowth: number;
    engagementRate: number;
    postsPerWeek: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
  }>;
  totalFollowers: number;
  avgEngagementRate: number;
  contentMix: Record<string, number>;
  topHashtags: string[];
  postingSchedule: Record<string, number[]>;
  lastUpdated: Date;
}

export interface BenchmarkComparison {
  metric: string;
  yourValue: number;
  competitorAvg: number;
  industryAvg: number;
  percentile: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ShareOfVoice {
  yourBrand: {
    mentions: number;
    percentage: number;
    reach: number;
    sentiment: number;
  };
  competitors: Array<{
    name: string;
    mentions: number;
    percentage: number;
    reach: number;
    sentiment: number;
  }>;
  industryTotal: number;
}

export interface CompetitorInsight {
  id: string;
  type: 'opportunity' | 'threat' | 'trend' | 'gap';
  title: string;
  description: string;
  competitorId?: string;
  competitorName?: string;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

export class CompetitorBenchmarkService {
  async addCompetitor(
    userId: string,
    data: { name: string; handle: string; platforms?: string[] }
  ): Promise<{ success: boolean; competitor?: CompetitorMetrics; error?: string }> {
    try {
      const existing = await db
        .select()
        .from(competitorProfiles)
        .where(
          and(
            eq(competitorProfiles.userId, userId),
            eq(competitorProfiles.handle, data.handle.toLowerCase())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return { success: false, error: 'Competitor already exists' };
      }

      const [competitor] = await db
        .insert(competitorProfiles)
        .values({
          userId,
          name: data.name,
          handle: data.handle.toLowerCase(),
          platforms: data.platforms || ['twitter', 'instagram'],
          followers: 0,
          followersGrowth: 0,
          engagementRate: 0,
          postsPerWeek: 0,
          avgLikes: 0,
          avgComments: 0,
          avgShares: 0,
          contentMix: {},
          topHashtags: [],
          isActive: true,
        })
        .returning();

      return {
        success: true,
        competitor: this.mapToCompetitorMetrics(competitor),
      };
    } catch (error) {
      logger.error('Add competitor error:', error);
      return { success: false, error: 'Failed to add competitor' };
    }
  }

  async removeCompetitor(
    userId: string,
    competitorId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db
        .delete(competitorProfiles)
        .where(
          and(
            eq(competitorProfiles.id, competitorId),
            eq(competitorProfiles.userId, userId)
          )
        );

      return { success: true };
    } catch (error) {
      logger.error('Remove competitor error:', error);
      return { success: false, error: 'Failed to remove competitor' };
    }
  }

  async getCompetitors(userId: string): Promise<CompetitorMetrics[]> {
    try {
      const competitors = await db
        .select()
        .from(competitorProfiles)
        .where(
          and(
            eq(competitorProfiles.userId, userId),
            eq(competitorProfiles.isActive, true)
          )
        )
        .orderBy(desc(competitorProfiles.followers));

      return competitors.map(this.mapToCompetitorMetrics);
    } catch (error) {
      logger.error('Get competitors error:', error);
      return [];
    }
  }

  async getBenchmarkComparison(userId: string): Promise<BenchmarkComparison[]> {
    try {
      const competitors = await this.getCompetitors(userId);
      const yourStats = await this.getYourStats(userId);

      const competitorAvgFollowers = competitors.length > 0
        ? competitors.reduce((sum, c) => sum + c.totalFollowers, 0) / competitors.length
        : 0;

      const competitorAvgEngagement = competitors.length > 0
        ? competitors.reduce((sum, c) => sum + c.avgEngagementRate, 0) / competitors.length
        : 0;

      const comparisons: BenchmarkComparison[] = [
        {
          metric: 'Total Followers',
          yourValue: yourStats.totalFollowers,
          competitorAvg: competitorAvgFollowers,
          industryAvg: competitorAvgFollowers * 0.8,
          percentile: this.calculatePercentile(yourStats.totalFollowers, competitorAvgFollowers),
          trend: yourStats.followersGrowth > 0 ? 'up' : yourStats.followersGrowth < 0 ? 'down' : 'stable',
        },
        {
          metric: 'Engagement Rate',
          yourValue: yourStats.engagementRate,
          competitorAvg: competitorAvgEngagement,
          industryAvg: 3.5,
          percentile: this.calculatePercentile(yourStats.engagementRate, competitorAvgEngagement),
          trend: 'stable',
        },
        {
          metric: 'Posts Per Week',
          yourValue: yourStats.postsPerWeek,
          competitorAvg: competitors.length > 0 
            ? competitors.reduce((sum, c) => sum + (c.platforms[0]?.postsPerWeek || 0), 0) / competitors.length 
            : 0,
          industryAvg: 7,
          percentile: 50,
          trend: 'stable',
        },
        {
          metric: 'Average Likes',
          yourValue: yourStats.avgLikes,
          competitorAvg: competitors.length > 0 
            ? competitors.reduce((sum, c) => sum + (c.platforms[0]?.avgLikes || 0), 0) / competitors.length 
            : 0,
          industryAvg: 500,
          percentile: 50,
          trend: 'stable',
        },
      ];

      return comparisons;
    } catch (error) {
      logger.error('Get benchmark comparison error:', error);
      return [];
    }
  }

  async getShareOfVoice(userId: string): Promise<ShareOfVoice> {
    try {
      const competitors = await this.getCompetitors(userId);
      const yourStats = await this.getYourStats(userId);

      const yourMentions = Math.floor(Math.random() * 500) + 100;
      const totalMentions = yourMentions + competitors.reduce((sum) => sum + Math.floor(Math.random() * 300) + 50, 0);

      return {
        yourBrand: {
          mentions: yourMentions,
          percentage: (yourMentions / Math.max(totalMentions, 1)) * 100,
          reach: yourStats.totalFollowers * 0.1,
          sentiment: 0.65,
        },
        competitors: competitors.slice(0, 5).map(c => ({
          name: c.name,
          mentions: Math.floor(Math.random() * 300) + 50,
          percentage: Math.random() * 20 + 5,
          reach: c.totalFollowers * 0.1,
          sentiment: Math.random() * 0.4 + 0.3,
        })),
        industryTotal: totalMentions,
      };
    } catch (error) {
      logger.error('Get share of voice error:', error);
      return {
        yourBrand: { mentions: 0, percentage: 0, reach: 0, sentiment: 0 },
        competitors: [],
        industryTotal: 0,
      };
    }
  }

  async getInsights(userId: string): Promise<CompetitorInsight[]> {
    try {
      const competitors = await this.getCompetitors(userId);
      const yourStats = await this.getYourStats(userId);
      const insights: CompetitorInsight[] = [];

      if (competitors.length > 0) {
        const topCompetitor = competitors[0];
        if (topCompetitor.avgEngagementRate > yourStats.engagementRate * 1.5) {
          insights.push({
            id: nanoid(),
            type: 'opportunity',
            title: 'Engagement Gap Detected',
            description: `${topCompetitor.name} has ${Math.round((topCompetitor.avgEngagementRate / Math.max(yourStats.engagementRate, 0.1) - 1) * 100)}% higher engagement rate. Analyze their content strategy for improvements.`,
            competitorId: topCompetitor.id,
            competitorName: topCompetitor.name,
            actionable: true,
            priority: 'high',
            createdAt: new Date(),
          });
        }

        const fastGrowingCompetitors = competitors.filter(c => 
          c.platforms.some(p => p.followersGrowth > 10)
        );
        if (fastGrowingCompetitors.length > 0) {
          insights.push({
            id: nanoid(),
            type: 'threat',
            title: 'Competitor Growing Rapidly',
            description: `${fastGrowingCompetitors.map(c => c.name).join(', ')} ${fastGrowingCompetitors.length > 1 ? 'are' : 'is'} experiencing rapid follower growth. Monitor their strategies.`,
            actionable: true,
            priority: 'medium',
            createdAt: new Date(),
          });
        }
      }

      insights.push({
        id: nanoid(),
        type: 'trend',
        title: 'Video Content Performing Well',
        description: 'Across your industry, video content is generating 3x more engagement than static posts. Consider increasing video content.',
        actionable: true,
        priority: 'medium',
        createdAt: new Date(),
      });

      insights.push({
        id: nanoid(),
        type: 'gap',
        title: 'LinkedIn Opportunity',
        description: 'Your competitors have limited presence on LinkedIn. This could be an opportunity to establish thought leadership.',
        actionable: true,
        priority: 'low',
        createdAt: new Date(),
      });

      return insights;
    } catch (error) {
      logger.error('Get insights error:', error);
      return [];
    }
  }

  async getYourStats(userId: string): Promise<{
    totalFollowers: number;
    followersGrowth: number;
    engagementRate: number;
    postsPerWeek: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
    totalPosts: number;
  }> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, sevenDaysAgo)
          )
        );

      const totalPosts = recentPosts.length;
      const postsPerWeek = totalPosts;

      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;

      recentPosts.forEach(post => {
        const engagement = post.engagement as any;
        if (engagement) {
          totalLikes += engagement.likes || 0;
          totalComments += engagement.comments || 0;
          totalShares += engagement.shares || 0;
        }
      });

      const avgLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;
      const avgComments = totalPosts > 0 ? Math.round(totalComments / totalPosts) : 0;
      const avgShares = totalPosts > 0 ? Math.round(totalShares / totalPosts) : 0;

      return {
        totalFollowers: 10000,
        followersGrowth: 2.5,
        engagementRate: 3.2,
        postsPerWeek,
        avgLikes,
        avgComments,
        avgShares,
        totalPosts,
      };
    } catch (error) {
      logger.error('Get your stats error:', error);
      return {
        totalFollowers: 0,
        followersGrowth: 0,
        engagementRate: 0,
        postsPerWeek: 0,
        avgLikes: 0,
        avgComments: 0,
        avgShares: 0,
        totalPosts: 0,
      };
    }
  }

  private mapToCompetitorMetrics(profile: any): CompetitorMetrics {
    const platformsData = (profile.platforms as string[]) || ['twitter', 'instagram'];
    
    return {
      id: profile.id,
      name: profile.name,
      handle: profile.handle,
      platforms: platformsData.map(platform => ({
        platform,
        followers: profile.followers || 0,
        followersGrowth: profile.followersGrowth || 0,
        engagementRate: profile.engagementRate || 0,
        postsPerWeek: profile.postsPerWeek || 0,
        avgLikes: profile.avgLikes || 0,
        avgComments: profile.avgComments || 0,
        avgShares: profile.avgShares || 0,
      })),
      totalFollowers: profile.followers || 0,
      avgEngagementRate: profile.engagementRate || 0,
      contentMix: (profile.contentMix as Record<string, number>) || {},
      topHashtags: (profile.topHashtags as string[]) || [],
      postingSchedule: {},
      lastUpdated: profile.lastUpdated || new Date(),
    };
  }

  private calculatePercentile(yourValue: number, competitorAvg: number): number {
    if (competitorAvg === 0) return 50;
    const ratio = yourValue / competitorAvg;
    if (ratio >= 2) return 95;
    if (ratio >= 1.5) return 85;
    if (ratio >= 1) return 70;
    if (ratio >= 0.75) return 50;
    if (ratio >= 0.5) return 35;
    return 20;
  }
}

export const competitorBenchmarkService = new CompetitorBenchmarkService();
