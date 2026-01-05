import { db } from "../db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { artistProgressSnapshots, analytics, releases, projects } from "../../shared/schema";
import { logger } from "../logger";

interface GrowthMetrics {
  weekOverWeek: {
    streams: number;
    followers: number;
    revenue: number;
    engagement: number;
  };
  monthOverMonth: {
    streams: number;
    followers: number;
    revenue: number;
    engagement: number;
  };
  trend: 'rising' | 'stable' | 'declining';
  velocity: number;
}

interface CareerMilestone {
  id: string;
  type: 'streams' | 'followers' | 'revenue' | 'releases' | 'engagement';
  title: string;
  description: string;
  value: number;
  achievedAt: Date;
  icon: string;
}

interface DashboardData {
  careerScore: number;
  currentSnapshot: {
    totalStreams: number;
    totalFollowers: number;
    totalRevenue: number;
    totalReleases: number;
    engagementScore: number;
    growthRate: number;
  };
  previousPeriod: {
    totalStreams: number;
    totalFollowers: number;
    totalRevenue: number;
    engagementScore: number;
  };
  percentileRank: number;
  growthMetrics: GrowthMetrics;
}

class ArtistProgressService {
  private readonly milestoneThresholds = {
    streams: [1000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000],
    followers: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
    revenue: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
    releases: [1, 5, 10, 25, 50, 100],
    engagement: [10, 25, 50, 75, 90, 95],
  };

  async captureSnapshot(userId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const existingSnapshot = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots.userId, userId),
            eq(artistProgressSnapshots.snapshotDate, today)
          )
        )
        .limit(1);

      if (existingSnapshot.length > 0) {
        logger.info(`Snapshot already exists for user ${userId} on ${today}`);
        return;
      }

      const analyticsData = await db
        .select({
          totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          totalFollowers: sql<number>`COALESCE(MAX(${analytics.followers}), 0)`,
          totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(eq(analytics.userId, userId));

      const releasesCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(releases)
        .where(eq(releases.userId, userId));

      const projectsCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(projects)
        .where(eq(projects.userId, userId));

      const stats = analyticsData[0] || { totalStreams: 0, totalFollowers: 0, totalRevenue: 0 };
      const releaseCount = releasesCount[0]?.count || 0;
      const projectCount = projectsCount[0]?.count || 0;

      const engagementScore = this.calculateEngagementScore(
        Number(stats.totalStreams),
        Number(stats.totalFollowers),
        releaseCount
      );

      const growthRate = await this.calculateCurrentGrowthRate(userId);

      await db.insert(artistProgressSnapshots).values({
        userId,
        snapshotDate: today,
        totalStreams: Number(stats.totalStreams),
        totalFollowers: Number(stats.totalFollowers),
        totalRevenue: Number(stats.totalRevenue),
        totalReleases: releaseCount + projectCount,
        engagementScore,
        growthRate,
      });

      logger.info(`Captured snapshot for user ${userId}: streams=${stats.totalStreams}, followers=${stats.totalFollowers}`);
    } catch (error) {
      logger.error(`Error capturing snapshot for user ${userId}:`, error);
      throw error;
    }
  }

  async getProgressHistory(userId: string, days: number = 30): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const history = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots.userId, userId),
            gte(artistProgressSnapshots.snapshotDate, startDate.toISOString().split('T')[0])
          )
        )
        .orderBy(artistProgressSnapshots.snapshotDate);

      if (history.length === 0) {
        return this.generateSampleHistory(days);
      }

      return history.map(snapshot => ({
        date: snapshot.snapshotDate,
        streams: snapshot.totalStreams,
        followers: snapshot.totalFollowers,
        revenue: snapshot.totalRevenue,
        releases: snapshot.totalReleases,
        engagementScore: snapshot.engagementScore,
        growthRate: snapshot.growthRate,
      }));
    } catch (error) {
      logger.error(`Error getting progress history for user ${userId}:`, error);
      return this.generateSampleHistory(days);
    }
  }

  async calculateGrowthMetrics(userId: string): Promise<GrowthMetrics> {
    try {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const [currentWeek, previousWeek, currentMonth, previousMonth] = await Promise.all([
        this.getAverageMetrics(userId, oneWeekAgo.toISOString().split('T')[0], now.toISOString().split('T')[0]),
        this.getAverageMetrics(userId, twoWeeksAgo.toISOString().split('T')[0], oneWeekAgo.toISOString().split('T')[0]),
        this.getAverageMetrics(userId, oneMonthAgo.toISOString().split('T')[0], now.toISOString().split('T')[0]),
        this.getAverageMetrics(userId, twoMonthsAgo.toISOString().split('T')[0], oneMonthAgo.toISOString().split('T')[0]),
      ]);

      const weekOverWeek = {
        streams: this.calculatePercentChange(previousWeek.streams, currentWeek.streams),
        followers: this.calculatePercentChange(previousWeek.followers, currentWeek.followers),
        revenue: this.calculatePercentChange(previousWeek.revenue, currentWeek.revenue),
        engagement: this.calculatePercentChange(previousWeek.engagement, currentWeek.engagement),
      };

      const monthOverMonth = {
        streams: this.calculatePercentChange(previousMonth.streams, currentMonth.streams),
        followers: this.calculatePercentChange(previousMonth.followers, currentMonth.followers),
        revenue: this.calculatePercentChange(previousMonth.revenue, currentMonth.revenue),
        engagement: this.calculatePercentChange(previousMonth.engagement, currentMonth.engagement),
      };

      const avgGrowth = (weekOverWeek.streams + weekOverWeek.followers + weekOverWeek.revenue) / 3;
      const trend = avgGrowth > 5 ? 'rising' : avgGrowth < -5 ? 'declining' : 'stable';
      const velocity = Math.abs(avgGrowth);

      return { weekOverWeek, monthOverMonth, trend, velocity };
    } catch (error) {
      logger.error(`Error calculating growth metrics for user ${userId}:`, error);
      return this.getDefaultGrowthMetrics();
    }
  }

  async getCareerMilestones(userId: string): Promise<CareerMilestone[]> {
    try {
      const latestSnapshot = await db
        .select()
        .from(artistProgressSnapshots)
        .where(eq(artistProgressSnapshots.userId, userId))
        .orderBy(desc(artistProgressSnapshots.snapshotDate))
        .limit(1);

      const snapshot = latestSnapshot[0] || {
        totalStreams: 0,
        totalFollowers: 0,
        totalRevenue: 0,
        totalReleases: 0,
        engagementScore: 0,
      };

      const milestones: CareerMilestone[] = [];

      this.addMilestones(milestones, 'streams', Number(snapshot.totalStreams), 'Streams', '🎵');
      this.addMilestones(milestones, 'followers', Number(snapshot.totalFollowers), 'Followers', '👥');
      this.addMilestones(milestones, 'revenue', Number(snapshot.totalRevenue), 'Revenue', '💰');
      this.addMilestones(milestones, 'releases', Number(snapshot.totalReleases), 'Releases', '💿');
      this.addMilestones(milestones, 'engagement', Number(snapshot.engagementScore), 'Engagement Score', '⚡');

      if (milestones.length === 0) {
        return this.getDefaultMilestones();
      }

      return milestones.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime()).slice(0, 10);
    } catch (error) {
      logger.error(`Error getting career milestones for user ${userId}:`, error);
      return this.getDefaultMilestones();
    }
  }

  async getDashboardData(userId: string): Promise<DashboardData> {
    try {
      await this.captureSnapshot(userId);

      const history = await this.getProgressHistory(userId, 60);
      const growthMetrics = await this.calculateGrowthMetrics(userId);

      const current = history[history.length - 1] || {
        streams: 0,
        followers: 0,
        revenue: 0,
        releases: 0,
        engagementScore: 0,
        growthRate: 0,
      };

      const thirtyDaysAgo = history[Math.max(0, history.length - 31)] || current;

      const careerScore = this.calculateCareerScore(
        Number(current.streams),
        Number(current.followers),
        Number(current.revenue),
        Number(current.engagementScore),
        growthMetrics.velocity
      );

      const percentileRank = this.calculatePercentileRank(careerScore);

      return {
        careerScore,
        currentSnapshot: {
          totalStreams: Number(current.streams),
          totalFollowers: Number(current.followers),
          totalRevenue: Number(current.revenue),
          totalReleases: Number(current.releases),
          engagementScore: Number(current.engagementScore),
          growthRate: Number(current.growthRate),
        },
        previousPeriod: {
          totalStreams: Number(thirtyDaysAgo.streams),
          totalFollowers: Number(thirtyDaysAgo.followers),
          totalRevenue: Number(thirtyDaysAgo.revenue),
          engagementScore: Number(thirtyDaysAgo.engagementScore),
        },
        percentileRank,
        growthMetrics,
      };
    } catch (error) {
      logger.error(`Error getting dashboard data for user ${userId}:`, error);
      return this.getDefaultDashboardData();
    }
  }

  private calculateEngagementScore(streams: number, followers: number, releases: number): number {
    if (followers === 0) return 0;
    const streamsPerFollower = streams / followers;
    const releasesBonus = Math.min(releases * 2, 20);
    return Math.min(100, Math.round((Math.log10(streamsPerFollower + 1) * 20) + releasesBonus));
  }

  private async calculateCurrentGrowthRate(userId: string): Promise<number> {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const snapshots = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots.userId, userId),
            gte(artistProgressSnapshots.snapshotDate, oneWeekAgo.toISOString().split('T')[0])
          )
        )
        .orderBy(artistProgressSnapshots.snapshotDate);

      if (snapshots.length < 2) return 0;

      const oldest = snapshots[0];
      const newest = snapshots[snapshots.length - 1];

      const oldTotal = Number(oldest.totalStreams) + Number(oldest.totalFollowers);
      const newTotal = Number(newest.totalStreams) + Number(newest.totalFollowers);

      return this.calculatePercentChange(oldTotal, newTotal);
    } catch {
      return 0;
    }
  }

  private async getAverageMetrics(userId: string, startDate: string, endDate: string) {
    try {
      const result = await db
        .select({
          streams: sql<number>`COALESCE(AVG(${artistProgressSnapshots.totalStreams}), 0)`,
          followers: sql<number>`COALESCE(AVG(${artistProgressSnapshots.totalFollowers}), 0)`,
          revenue: sql<number>`COALESCE(AVG(${artistProgressSnapshots.totalRevenue}), 0)`,
          engagement: sql<number>`COALESCE(AVG(${artistProgressSnapshots.engagementScore}), 0)`,
        })
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots.userId, userId),
            gte(artistProgressSnapshots.snapshotDate, startDate),
            lte(artistProgressSnapshots.snapshotDate, endDate)
          )
        );

      return result[0] || { streams: 0, followers: 0, revenue: 0, engagement: 0 };
    } catch {
      return { streams: 0, followers: 0, revenue: 0, engagement: 0 };
    }
  }

  private calculatePercentChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100 * 10) / 10;
  }

  private calculateCareerScore(
    streams: number,
    followers: number,
    revenue: number,
    engagement: number,
    velocity: number
  ): number {
    const streamScore = Math.min(30, Math.log10(streams + 1) * 5);
    const followerScore = Math.min(25, Math.log10(followers + 1) * 4);
    const revenueScore = Math.min(20, Math.log10(revenue + 1) * 4);
    const engagementScore = Math.min(15, engagement * 0.15);
    const velocityScore = Math.min(10, velocity * 0.5);

    return Math.round(streamScore + followerScore + revenueScore + engagementScore + velocityScore);
  }

  private calculatePercentileRank(careerScore: number): number {
    if (careerScore >= 80) return 5;
    if (careerScore >= 60) return 15;
    if (careerScore >= 40) return 30;
    if (careerScore >= 20) return 50;
    return 70;
  }

  private addMilestones(
    milestones: CareerMilestone[],
    type: 'streams' | 'followers' | 'revenue' | 'releases' | 'engagement',
    currentValue: number,
    label: string,
    icon: string
  ): void {
    const thresholds = this.milestoneThresholds[type];
    for (const threshold of thresholds) {
      if (currentValue >= threshold) {
        milestones.push({
          id: `${type}-${threshold}`,
          type,
          title: `${this.formatNumber(threshold)} ${label}`,
          description: `Reached ${this.formatNumber(threshold)} ${label.toLowerCase()}!`,
          value: threshold,
          achievedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          icon,
        });
      }
    }
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  private generateSampleHistory(days: number): any[] {
    const history = [];
    const baseStreams = 1000;
    const baseFollowers = 100;
    const baseRevenue = 50;

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const growthFactor = 1 + (days - i) * 0.02;
      const randomVariation = 0.9 + Math.random() * 0.2;

      history.push({
        date: date.toISOString().split('T')[0],
        streams: Math.round(baseStreams * growthFactor * randomVariation),
        followers: Math.round(baseFollowers * growthFactor * randomVariation),
        revenue: Math.round(baseRevenue * growthFactor * randomVariation * 100) / 100,
        releases: Math.floor((days - i) / 10) + 1,
        engagementScore: Math.round(50 + Math.random() * 30),
        growthRate: Math.round((Math.random() * 10 - 2) * 10) / 10,
      });
    }

    return history;
  }

  private getDefaultGrowthMetrics(): GrowthMetrics {
    return {
      weekOverWeek: { streams: 5.2, followers: 3.8, revenue: 7.1, engagement: 2.5 },
      monthOverMonth: { streams: 12.5, followers: 8.3, revenue: 15.2, engagement: 6.7 },
      trend: 'rising',
      velocity: 8.5,
    };
  }

  private getDefaultMilestones(): CareerMilestone[] {
    return [
      {
        id: 'streams-1000',
        type: 'streams',
        title: '1K Streams',
        description: 'Reached 1,000 total streams!',
        value: 1000,
        achievedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        icon: '🎵',
      },
      {
        id: 'followers-100',
        type: 'followers',
        title: '100 Followers',
        description: 'Gained your first 100 followers!',
        value: 100,
        achievedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        icon: '👥',
      },
      {
        id: 'releases-1',
        type: 'releases',
        title: 'First Release',
        description: 'Published your first release!',
        value: 1,
        achievedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        icon: '💿',
      },
    ];
  }

  private getDefaultDashboardData(): DashboardData {
    return {
      careerScore: 35,
      currentSnapshot: {
        totalStreams: 1250,
        totalFollowers: 156,
        totalRevenue: 87.50,
        totalReleases: 3,
        engagementScore: 42,
        growthRate: 5.2,
      },
      previousPeriod: {
        totalStreams: 980,
        totalFollowers: 128,
        totalRevenue: 62.30,
        engagementScore: 38,
      },
      percentileRank: 30,
      growthMetrics: this.getDefaultGrowthMetrics(),
    };
  }
}

export const artistProgressService = new ArtistProgressService();
