import { db } from "../db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  artistProgressSnapshots,
  analytics,
  releases,
  projects,
} from "../../shared/schema";
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
  trend: "rising" | "stable" | "declining";
  velocity: number;
}

interface CareerMilestone {
  id: string;
  type: "streams" | "followers" | "revenue" | "releases" | "engagement";
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
    streams: [
      1000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000,
      100000000,
    ],
    followers: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
    revenue: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
    releases: [1, 5, 10, 25, 50, 100],
    engagement: [10, 25, 50, 75, 90, 95],
  };

  async captureSnapshot(userId: string): Promise<void> {
    try {
      const _today = new Date().toISOString().split("T")[0];

      const _existingSnapshot = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots?.userId, userId),
            eq(artistProgressSnapshots?.snapshotDate, today),
          ),
        )
        .limit(1);

      if (existingSnapshot?.length > 0) {
        logger?.info(`Snapshot already exists for user ${userId} on ${today}`);
        return;
      }

      const _analyticsData = await db
        .select({
          totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          totalFollowers: sql<number>`COALESCE(MAX(${analytics?.followers}), 0)`,
          totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
        })
        .from(analytics)
        .where(eq(analytics?.userId, userId));

      const _releasesCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(releases)
        .where(eq(releases?.userId, userId));

      const _projectsCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(projects)
        .where(eq(projects?.userId, userId));

      const _stats = analyticsData[0] || {
        totalStreams: 0,
        totalFollowers: 0,
        totalRevenue: 0,
      };
      const _releaseCount = releasesCount[0]?.count || 0;
      const _projectCount = projectsCount[0]?.count || 0;

      const _engagementScore = this?.calculateEngagementScore(
        Number(stats?.totalStreams),
        Number(stats?.totalFollowers),
        releaseCount,
      );

      const _growthRate = await this?.calculateCurrentGrowthRate(userId);

      await db?.insert(artistProgressSnapshots).values({
        userId,
        snapshotDate: today,
        totalStreams: Number(stats?.totalStreams),
        totalFollowers: Number(stats?.totalFollowers),
        totalRevenue: Number(stats?.totalRevenue),
        totalReleases: releaseCount + projectCount,
        engagementScore,
        growthRate,
      });

      logger?.info(
        `Captured snapshot for user ${userId}: streams=${stats?.totalStreams}, followers=${stats?.totalFollowers}`,
      );
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error capturing snapshot for user ${userId}:`,
      );
      throw error;
    }
  }

  async getProgressHistory(userId: string, days: number = 30): Promise<any[]> {
    try {
      const _startDate = new Date();
      startDate?.setDate(startDate?.getDate() - days);

      const _history = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots?.userId, userId),
            gte(
              artistProgressSnapshots?.snapshotDate,
              startDate?.toISOString().split("T")[0],
            ),
          ),
        )
        .orderBy(artistProgressSnapshots?.snapshotDate);

      if (history?.length === 0) {
        return [];
      }

      return history?.map((snapshot) => ({
        date: snapshot?.snapshotDate,
        streams: snapshot?.totalStreams,
        followers: snapshot?.totalFollowers,
        revenue: snapshot?.totalRevenue,
        releases: snapshot?.totalReleases,
        engagementScore: snapshot?.engagementScore,
        growthRate: snapshot?.growthRate,
      }));
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error getting progress history for user ${userId}:`,
      );
      return [];
    }
  }

  async calculateGrowthMetrics(userId: string): Promise<GrowthMetrics> {
    try {
      const _now = new Date();
      const _oneWeekAgo = new Date(now?.getTime() - 7 * 24 * 60 * 60 * 1000);
      const _twoWeeksAgo = new Date(now?.getTime() - 14 * 24 * 60 * 60 * 1000);
      const _oneMonthAgo = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);
      const _twoMonthsAgo = new Date(now?.getTime() - 60 * 24 * 60 * 60 * 1000);

      const [currentWeek, previousWeek, currentMonth, previousMonth] =
        await Promise?.all([
          this?.getAverageMetrics(
            userId,
            oneWeekAgo?.toISOString().split("T")[0],
            now?.toISOString().split("T")[0],
          ),
          this?.getAverageMetrics(
            userId,
            twoWeeksAgo?.toISOString().split("T")[0],
            oneWeekAgo?.toISOString().split("T")[0],
          ),
          this?.getAverageMetrics(
            userId,
            oneMonthAgo?.toISOString().split("T")[0],
            now?.toISOString().split("T")[0],
          ),
          this?.getAverageMetrics(
            userId,
            twoMonthsAgo?.toISOString().split("T")[0],
            oneMonthAgo?.toISOString().split("T")[0],
          ),
        ]);

      const _weekOverWeek = {
        streams: this?.calculatePercentChange(
          previousWeek?.streams,
          currentWeek?.streams,
        ),
        followers: this?.calculatePercentChange(
          previousWeek?.followers,
          currentWeek?.followers,
        ),
        revenue: this?.calculatePercentChange(
          previousWeek?.revenue,
          currentWeek?.revenue,
        ),
        engagement: this?.calculatePercentChange(
          previousWeek?.engagement,
          currentWeek?.engagement,
        ),
      };

      const _monthOverMonth = {
        streams: this?.calculatePercentChange(
          previousMonth?.streams,
          currentMonth?.streams,
        ),
        followers: this?.calculatePercentChange(
          previousMonth?.followers,
          currentMonth?.followers,
        ),
        revenue: this?.calculatePercentChange(
          previousMonth?.revenue,
          currentMonth?.revenue,
        ),
        engagement: this?.calculatePercentChange(
          previousMonth?.engagement,
          currentMonth?.engagement,
        ),
      };

      const _avgGrowth =
        (weekOverWeek?.streams + weekOverWeek?.followers + weekOverWeek?.revenue) /
        3;
      const _trend =
        avgGrowth > 5 ? "rising" : avgGrowth < -5 ? "declining" : "stable";
      const _velocity = Math?.abs(avgGrowth);

      return { weekOverWeek, monthOverMonth, trend, velocity };
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error calculating growth metrics for user ${userId}:`,
      );
      return this?.getDefaultGrowthMetrics();
    }
  }

  async getCareerMilestones(userId: string): Promise<CareerMilestone[]> {
    try {
      const _latestSnapshot = await db
        .select()
        .from(artistProgressSnapshots)
        .where(eq(artistProgressSnapshots?.userId, userId))
        .orderBy(desc(artistProgressSnapshots?.snapshotDate))
        .limit(1);

      const _snapshot = latestSnapshot[0] || {
        totalStreams: 0,
        totalFollowers: 0,
        totalRevenue: 0,
        totalReleases: 0,
        engagementScore: 0,
      };

      const milestones: CareerMilestone[] = [];

      this?.addMilestones(
        milestones,
        "streams",
        Number(snapshot?.totalStreams),
        "Streams",
        "🎵",
      );
      this?.addMilestones(
        milestones,
        "followers",
        Number(snapshot?.totalFollowers),
        "Followers",
        "👥",
      );
      this?.addMilestones(
        milestones,
        "revenue",
        Number(snapshot?.totalRevenue),
        "Revenue",
        "💰",
      );
      this?.addMilestones(
        milestones,
        "releases",
        Number(snapshot?.totalReleases),
        "Releases",
        "💿",
      );
      this?.addMilestones(
        milestones,
        "engagement",
        Number(snapshot?.engagementScore),
        "Engagement Score",
        "⚡",
      );

      if (milestones?.length === 0) {
        return this?.getDefaultMilestones();
      }

      return milestones
        .sort((a, b) => b?.achievedAt.getTime() - a?.achievedAt.getTime())
        .slice(0, 10);
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error getting career milestones for user ${userId}:`,
      );
      return this?.getDefaultMilestones();
    }
  }

  async getDashboardData(userId: string): Promise<DashboardData> {
    try {
      await this?.captureSnapshot(userId);

      const _history = await this?.getProgressHistory(userId, 60);
      const _growthMetrics = await this?.calculateGrowthMetrics(userId);

      const _current = history[history?.length - 1] || {
        streams: 0,
        followers: 0,
        revenue: 0,
        releases: 0,
        engagementScore: 0,
        growthRate: 0,
      };

      const _thirtyDaysAgo =
        history[Math?.max(0, history?.length - 31)] || current;

      const _careerScore = this?.calculateCareerScore(
        Number(current?.streams),
        Number(current?.followers),
        Number(current?.revenue),
        Number(current?.engagementScore),
        growthMetrics?.velocity,
      );

      const _percentileRank = this?.calculatePercentileRank(careerScore);

      return {
        careerScore,
        currentSnapshot: {
          totalStreams: Number(current?.streams),
          totalFollowers: Number(current?.followers),
          totalRevenue: Number(current?.revenue),
          totalReleases: Number(current?.releases),
          engagementScore: Number(current?.engagementScore),
          growthRate: Number(current?.growthRate),
        },
        previousPeriod: {
          totalStreams: Number(thirtyDaysAgo?.streams),
          totalFollowers: Number(thirtyDaysAgo?.followers),
          totalRevenue: Number(thirtyDaysAgo?.revenue),
          engagementScore: Number(thirtyDaysAgo?.engagementScore),
        },
        percentileRank,
        growthMetrics,
      };
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error getting dashboard data for user ${userId}:`,
      );
      return this?.getDefaultDashboardData();
    }
  }

  private calculateEngagementScore(
    streams: number,
    followers: number,
    releases: number,
  ): number {
    if (followers === 0) return 0;
    const _streamsPerFollower = streams / followers;
    const _releasesBonus = Math?.min(releases * 2, 20);
    return Math?.min(
      100,
      Math?.round(Math?.log10(streamsPerFollower + 1) * 20 + releasesBonus),
    );
  }

  private async calculateCurrentGrowthRate(userId: string): Promise<number> {
    try {
      const _oneWeekAgo = new Date();
      oneWeekAgo?.setDate(oneWeekAgo?.getDate() - 7);

      const _snapshots = await db
        .select()
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots?.userId, userId),
            gte(
              artistProgressSnapshots?.snapshotDate,
              oneWeekAgo?.toISOString().split("T")[0],
            ),
          ),
        )
        .orderBy(artistProgressSnapshots?.snapshotDate);

      if (snapshots?.length < 2) return 0;

      const _oldest = snapshots[0];
      const _newest = snapshots[snapshots?.length - 1];

      const _oldTotal =
        Number(oldest?.totalStreams) + Number(oldest?.totalFollowers);
      const _newTotal =
        Number(newest?.totalStreams) + Number(newest?.totalFollowers);

      return this?.calculatePercentChange(oldTotal, newTotal);
    } catch {
      return 0;
    }
  }

  private async getAverageMetrics(
    userId: string,
    startDate: string,
    endDate: string,
  ) {
    try {
      const _result = await db
        .select({
          streams: sql<number>`COALESCE(AVG(${artistProgressSnapshots?.totalStreams}), 0)`,
          followers: sql<number>`COALESCE(AVG(${artistProgressSnapshots?.totalFollowers}), 0)`,
          revenue: sql<number>`COALESCE(AVG(${artistProgressSnapshots?.totalRevenue}), 0)`,
          engagement: sql<number>`COALESCE(AVG(${artistProgressSnapshots?.engagementScore}), 0)`,
        })
        .from(artistProgressSnapshots)
        .where(
          and(
            eq(artistProgressSnapshots?.userId, userId),
            gte(artistProgressSnapshots?.snapshotDate, startDate),
            lte(artistProgressSnapshots?.snapshotDate, endDate),
          ),
        );

      return (
        result[0] || { streams: 0, followers: 0, revenue: 0, engagement: 0 }
      );
    } catch {
      return { streams: 0, followers: 0, revenue: 0, engagement: 0 };
    }
  }

  private calculatePercentChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math?.round(((newValue - oldValue) / oldValue) * 100 * 10) / 10;
  }

  private calculateCareerScore(
    streams: number,
    followers: number,
    revenue: number,
    engagement: number,
    velocity: number,
  ): number {
    const _streamScore = Math?.min(30, Math?.log10(streams + 1) * 5);
    const _followerScore = Math?.min(25, Math?.log10(followers + 1) * 4);
    const _revenueScore = Math?.min(20, Math?.log10(revenue + 1) * 4);
    const _engagementScore = Math?.min(15, engagement * 0?.15);
    const _velocityScore = Math?.min(10, velocity * 0?.5);

    return Math?.round(
      streamScore +
        followerScore +
        revenueScore +
        engagementScore +
        velocityScore,
    );
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
    type: "streams" | "followers" | "revenue" | "releases" | "engagement",
    currentValue: number,
    label: string,
    icon: string,
  ): void {
    const _thresholds = this?.milestoneThresholds[type];
    for (const threshold of thresholds) {
      if (currentValue >= threshold) {
        milestones?.push({
          id: `${type}-${threshold}`,
          type,
          title: `${this?.formatNumber(threshold)} ${label}`,
          description: `Reached ${this?.formatNumber(threshold)} ${label?.toLowerCase()}!`,
          value: threshold,
          achievedAt: new Date(),
          icon,
        });
      }
    }
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString();
  }

  // @deprecated - No longer used. Empty array returned instead.

  private getDefaultGrowthMetrics(): GrowthMetrics {
    return {
      weekOverWeek: { streams: 0, followers: 0, revenue: 0, engagement: 0 },
      monthOverMonth: { streams: 0, followers: 0, revenue: 0, engagement: 0 },
      trend: "stable",
      velocity: 0,
    };
  }

  private getDefaultMilestones(): CareerMilestone[] {
    return [];
  }

  private getDefaultDashboardData(): DashboardData {
    return {
      careerScore: 0,
      currentSnapshot: {
        totalStreams: 0,
        totalFollowers: 0,
        totalRevenue: 0,
        totalReleases: 0,
        engagementScore: 0,
        growthRate: 0,
      },
      previousPeriod: {
        totalStreams: 0,
        totalFollowers: 0,
        totalRevenue: 0,
        engagementScore: 0,
      },
      percentileRank: 0,
      growthMetrics: this?.getDefaultGrowthMetrics(),
    };
  }
}

export const _artistProgressService = new ArtistProgressService();
