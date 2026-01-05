import { db } from "../db";
import { eq, and, desc, isNull, sql, gte } from "drizzle-orm";
import { 
  careerCoachRecommendations, 
  careerGoals, 
  analytics, 
  releases, 
  projects,
  socialAccounts,
  dspAnalytics,
  InsertCareerCoachRecommendation,
  InsertCareerGoal,
  CareerCoachRecommendation,
  CareerGoal
} from "../../shared/schema";
import { logger } from "../logger";

interface CareerGap {
  area: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

interface SmartGoalSuggestion {
  goalType: string;
  title: string;
  description: string;
  targetValue: number;
  unit: string;
  deadlineDays: number;
  reasoning: string;
}

interface UserAnalyticsSnapshot {
  totalStreams: number;
  totalFollowers: number;
  totalRevenue: number;
  releaseCount: number;
  lastReleaseDate: Date | null;
  socialAccounts: string[];
  topPlatform: string | null;
  topCity: string | null;
  avgEngagementRate: number;
}

class CareerCoachService {
  private readonly recommendationTypes = {
    RELEASE_CONSISTENCY: 'release_consistency',
    PLATFORM_FOCUS: 'platform_focus',
    BENCHMARK: 'benchmark',
    SOCIAL_CONNECT: 'social_connect',
    GEO_TARGETING: 'geo_targeting',
    CONTENT_OPTIMIZATION: 'content_optimization',
    GROWTH_OPPORTUNITY: 'growth_opportunity',
    ENGAGEMENT_BOOST: 'engagement_boost',
  };

  async generateDailyRecommendations(userId: string): Promise<CareerCoachRecommendation[]> {
    try {
      logger.info(`Generating daily recommendations for user ${userId}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existingToday = await db
        .select()
        .from(careerCoachRecommendations)
        .where(
          and(
            eq(careerCoachRecommendations.userId, userId),
            gte(careerCoachRecommendations.createdAt, today),
            isNull(careerCoachRecommendations.dismissedAt),
            isNull(careerCoachRecommendations.completedAt)
          )
        );

      if (existingToday.length > 0) {
        logger.info(`Found ${existingToday.length} existing recommendations for today`);
        return existingToday;
      }

      const userSnapshot = await this.getUserAnalyticsSnapshot(userId);
      const gaps = await this.analyzeCareerGaps(userId);
      const recommendations: InsertCareerCoachRecommendation[] = [];

      for (const gap of gaps.slice(0, 5)) {
        const rec = this.createRecommendationFromGap(userId, gap, userSnapshot);
        if (rec) {
          recommendations.push(rec);
        }
      }

      if (recommendations.length === 0) {
        recommendations.push({
          userId,
          type: this.recommendationTypes.GROWTH_OPPORTUNITY,
          title: "Keep up the momentum!",
          description: "You're doing great! Consider exploring new promotional strategies to reach even more listeners.",
          priority: 2,
          actionUrl: "/analytics",
        });
      }

      const inserted: CareerCoachRecommendation[] = [];
      for (const rec of recommendations) {
        const [result] = await db.insert(careerCoachRecommendations).values(rec).returning();
        inserted.push(result);
      }

      logger.info(`Generated ${inserted.length} recommendations for user ${userId}`);
      return inserted;
    } catch (error) {
      logger.error(`Error generating recommendations for user ${userId}:`, error);
      throw error;
    }
  }

  async analyzeCareerGaps(userId: string): Promise<CareerGap[]> {
    const gaps: CareerGap[] = [];
    const snapshot = await this.getUserAnalyticsSnapshot(userId);

    const daysSinceRelease = snapshot.lastReleaseDate 
      ? Math.floor((Date.now() - snapshot.lastReleaseDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceRelease > 30) {
      gaps.push({
        area: 'release_frequency',
        severity: daysSinceRelease > 60 ? 'high' : 'medium',
        description: `It's been ${daysSinceRelease} days since your last release`,
        recommendation: 'Release more consistently to keep your audience engaged',
      });
    }

    const connectedPlatforms = snapshot.socialAccounts.length;
    if (connectedPlatforms < 2) {
      gaps.push({
        area: 'social_presence',
        severity: 'high',
        description: `Only ${connectedPlatforms} social platform${connectedPlatforms === 1 ? '' : 's'} connected`,
        recommendation: 'Connect Instagram to unlock cross-promotion opportunities',
      });
    }

    if (snapshot.topPlatform && snapshot.avgEngagementRate > 0) {
      const platformEngagement: Record<string, number> = {};
      
      const dspData = await db
        .select()
        .from(dspAnalytics)
        .where(eq(dspAnalytics.userId, userId))
        .limit(50);

      for (const d of dspData) {
        const platform = d.platform || 'unknown';
        const engagement = ((d.saves || 0) + (d.playlistAdds || 0)) / Math.max(d.streams || 1, 1);
        platformEngagement[platform] = (platformEngagement[platform] || 0) + engagement;
      }

      const platforms = Object.entries(platformEngagement).sort((a, b) => b[1] - a[1]);
      if (platforms.length >= 2) {
        const topEngagement = platforms[0][1];
        const secondEngagement = platforms[1][1];
        if (topEngagement > secondEngagement * 2) {
          gaps.push({
            area: 'platform_optimization',
            severity: 'medium',
            description: `Your ${platforms[0][0]} engagement is ${Math.round(topEngagement / secondEngagement)}x higher than other platforms`,
            recommendation: `Focus your efforts on ${platforms[0][0]} for maximum impact`,
          });
        }
      }
    }

    if (snapshot.releaseCount > 0 && snapshot.releaseCount < 2) {
      gaps.push({
        area: 'benchmark',
        severity: 'low',
        description: 'Similar artists at your level average 2 releases per month',
        recommendation: 'Increase your release frequency to match industry benchmarks',
      });
    }

    if (snapshot.topCity) {
      gaps.push({
        area: 'geo_targeting',
        severity: 'low',
        description: `Your top city is ${snapshot.topCity}`,
        recommendation: `Consider targeted promotion campaigns in ${snapshot.topCity} for better ROI`,
      });
    }

    if (snapshot.avgEngagementRate < 0.05 && snapshot.totalStreams > 1000) {
      gaps.push({
        area: 'engagement',
        severity: 'medium',
        description: 'Your engagement rate is below average',
        recommendation: 'Try posting behind-the-scenes content to boost fan interaction',
      });
    }

    return gaps.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  async createSmartGoal(userId: string, goalType: string): Promise<CareerGoal | null> {
    try {
      const suggestion = await this.suggestSmartGoal(userId, goalType);
      if (!suggestion) return null;

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + suggestion.deadlineDays);

      const [goal] = await db.insert(careerGoals).values({
        userId,
        goalType: suggestion.goalType,
        title: suggestion.title,
        description: suggestion.description,
        targetValue: suggestion.targetValue,
        currentValue: 0,
        unit: suggestion.unit,
        deadline,
        status: 'active',
        metadata: { reasoning: suggestion.reasoning },
      }).returning();

      logger.info(`Created SMART goal for user ${userId}: ${goal.title}`);
      return goal;
    } catch (error) {
      logger.error(`Error creating SMART goal for user ${userId}:`, error);
      throw error;
    }
  }

  async dismissRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    try {
      const [updated] = await db
        .update(careerCoachRecommendations)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(careerCoachRecommendations.id, recommendationId),
            eq(careerCoachRecommendations.userId, userId)
          )
        )
        .returning();

      return !!updated;
    } catch (error) {
      logger.error(`Error dismissing recommendation ${recommendationId}:`, error);
      throw error;
    }
  }

  async completeRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    try {
      const [updated] = await db
        .update(careerCoachRecommendations)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(careerCoachRecommendations.id, recommendationId),
            eq(careerCoachRecommendations.userId, userId)
          )
        )
        .returning();

      return !!updated;
    } catch (error) {
      logger.error(`Error completing recommendation ${recommendationId}:`, error);
      throw error;
    }
  }

  async getActiveRecommendations(userId: string): Promise<CareerCoachRecommendation[]> {
    return db
      .select()
      .from(careerCoachRecommendations)
      .where(
        and(
          eq(careerCoachRecommendations.userId, userId),
          isNull(careerCoachRecommendations.dismissedAt),
          isNull(careerCoachRecommendations.completedAt)
        )
      )
      .orderBy(desc(careerCoachRecommendations.priority), desc(careerCoachRecommendations.createdAt))
      .limit(10);
  }

  async getGoals(userId: string): Promise<CareerGoal[]> {
    return db
      .select()
      .from(careerGoals)
      .where(eq(careerGoals.userId, userId))
      .orderBy(desc(careerGoals.createdAt));
  }

  async createGoal(userId: string, data: Omit<InsertCareerGoal, 'userId'>): Promise<CareerGoal> {
    const [goal] = await db.insert(careerGoals).values({
      ...data,
      userId,
    }).returning();
    return goal;
  }

  async updateGoalProgress(userId: string, goalId: string, currentValue: number): Promise<CareerGoal | null> {
    const [goal] = await db
      .update(careerGoals)
      .set({ 
        currentValue, 
        updatedAt: new Date(),
        status: currentValue >= (await this.getGoalTarget(goalId)) ? 'completed' : 'active'
      })
      .where(
        and(
          eq(careerGoals.id, goalId),
          eq(careerGoals.userId, userId)
        )
      )
      .returning();
    return goal || null;
  }

  private async getGoalTarget(goalId: string): Promise<number> {
    const [goal] = await db
      .select({ targetValue: careerGoals.targetValue })
      .from(careerGoals)
      .where(eq(careerGoals.id, goalId));
    return goal?.targetValue || 0;
  }

  private async getUserAnalyticsSnapshot(userId: string): Promise<UserAnalyticsSnapshot> {
    const analyticsData = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalFollowers: sql<number>`COALESCE(MAX(${analytics.followers}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const releasesData = await db
      .select()
      .from(releases)
      .where(eq(releases.userId, userId))
      .orderBy(desc(releases.createdAt));

    const socialData = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId));

    const dspData = await db
      .select()
      .from(dspAnalytics)
      .where(eq(dspAnalytics.userId, userId))
      .limit(100);

    let topPlatform: string | null = null;
    let topCity: string | null = null;
    let avgEngagementRate = 0;

    if (dspData.length > 0) {
      const platformStreams: Record<string, number> = {};
      let totalEngagement = 0;
      let totalStreams = 0;

      for (const d of dspData) {
        const platform = d.platform || 'unknown';
        platformStreams[platform] = (platformStreams[platform] || 0) + (d.streams || 0);
        totalEngagement += (d.saves || 0) + (d.playlistAdds || 0);
        totalStreams += d.streams || 0;

        const geo = d.geography as { countries?: { name: string; streams: number }[] } | null;
        if (geo?.countries?.[0]) {
          topCity = geo.countries[0].name;
        }
      }

      topPlatform = Object.entries(platformStreams)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      avgEngagementRate = totalStreams > 0 ? totalEngagement / totalStreams : 0;
    }

    return {
      totalStreams: Number(analyticsData[0]?.totalStreams || 0),
      totalFollowers: Number(analyticsData[0]?.totalFollowers || 0),
      totalRevenue: Number(analyticsData[0]?.totalRevenue || 0),
      releaseCount: releasesData.length,
      lastReleaseDate: releasesData[0]?.createdAt || null,
      socialAccounts: socialData.map(s => s.platform),
      topPlatform,
      topCity,
      avgEngagementRate,
    };
  }

  private createRecommendationFromGap(
    userId: string, 
    gap: CareerGap, 
    snapshot: UserAnalyticsSnapshot
  ): InsertCareerCoachRecommendation | null {
    const typeMap: Record<string, string> = {
      release_frequency: this.recommendationTypes.RELEASE_CONSISTENCY,
      social_presence: this.recommendationTypes.SOCIAL_CONNECT,
      platform_optimization: this.recommendationTypes.PLATFORM_FOCUS,
      benchmark: this.recommendationTypes.BENCHMARK,
      geo_targeting: this.recommendationTypes.GEO_TARGETING,
      engagement: this.recommendationTypes.ENGAGEMENT_BOOST,
    };

    const actionUrlMap: Record<string, string> = {
      release_frequency: '/distribution',
      social_presence: '/settings?tab=integrations',
      platform_optimization: '/analytics',
      benchmark: '/distribution',
      geo_targeting: '/advertising',
      engagement: '/social-media',
    };

    const priorityMap: Record<string, number> = {
      high: 1,
      medium: 2,
      low: 3,
    };

    return {
      userId,
      type: typeMap[gap.area] || this.recommendationTypes.GROWTH_OPPORTUNITY,
      title: gap.recommendation,
      description: gap.description,
      priority: priorityMap[gap.severity],
      actionUrl: actionUrlMap[gap.area] || '/dashboard',
      metadata: { area: gap.area, severity: gap.severity, snapshot: { ...snapshot, lastReleaseDate: snapshot.lastReleaseDate?.toISOString() } },
    };
  }

  private async suggestSmartGoal(userId: string, goalType: string): Promise<SmartGoalSuggestion | null> {
    const snapshot = await this.getUserAnalyticsSnapshot(userId);

    const suggestions: Record<string, SmartGoalSuggestion> = {
      streams: {
        goalType: 'streams',
        title: 'Increase Monthly Streams',
        description: 'Grow your monthly streaming numbers through consistent releases and promotion',
        targetValue: Math.max(snapshot.totalStreams * 1.5, 10000),
        unit: 'streams',
        deadlineDays: 30,
        reasoning: 'Based on your current performance, a 50% growth target is ambitious but achievable with focused effort.',
      },
      followers: {
        goalType: 'followers',
        title: 'Grow Your Fanbase',
        description: 'Build your follower count across platforms',
        targetValue: Math.max(snapshot.totalFollowers * 1.25, 1000),
        unit: 'followers',
        deadlineDays: 60,
        reasoning: 'Growing your fanbase by 25% over 2 months aligns with industry growth rates for artists at your level.',
      },
      releases: {
        goalType: 'releases',
        title: 'Consistent Releases',
        description: 'Maintain a regular release schedule to keep fans engaged',
        targetValue: snapshot.releaseCount + 4,
        unit: 'releases',
        deadlineDays: 90,
        reasoning: 'Industry data shows artists with 4+ releases per quarter see better algorithmic placement.',
      },
      engagement: {
        goalType: 'engagement',
        title: 'Boost Engagement Rate',
        description: 'Increase fan interaction through quality content and community building',
        targetValue: Math.max(snapshot.avgEngagementRate * 2, 0.1),
        unit: 'rate',
        deadlineDays: 30,
        reasoning: 'Higher engagement signals to algorithms that your content resonates, leading to more organic reach.',
      },
    };

    return suggestions[goalType] || suggestions.streams;
  }
}

export const careerCoachService = new CareerCoachService();
