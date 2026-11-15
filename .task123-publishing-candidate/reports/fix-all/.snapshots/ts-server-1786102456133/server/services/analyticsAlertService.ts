import { db } from "../db";
import { randomBytes } from "crypto";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { dspAnalytics } from "@shared/schema";
import { logger } from "../logger";

type AlertType =
  | "milestone"
  | "playlist_add"
  | "playlist_remove"
  | "trigger_city"
  | "growth_spike"
  | "viral_alert"
  | "decline_warning";
type AlertPriority = "low" | "medium" | "high" | "critical";
type Platform =
  | "spotify"
  | "apple"
  | "youtube"
  | "amazon"
  | "tiktok"
  | "instagram"
  | "tidal"
  | "deezer"
  | "soundcloud"
  | "pandora";

interface Alert {
  id: string;
  userId: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  data: Record<string, any>;
  platform?: Platform;
  createdAt: Date;
  readAt?: Date;
  dismissed: boolean;
}

interface TriggerCity {
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  growthRate: number;
  streamCount: number;
  listenerCount: number;
  previousWeekStreams: number;
  growthPercentage: number;
  isHotspot: boolean;
  detectedAt: Date;
  trendDirection: "rising" | "stable" | "declining";
  platforms: Platform[];
}

interface PlaylistChange {
  playlistId: string;
  playlistName: string;
  platform: Platform;
  trackId: string;
  trackName: string;
  artistName: string;
  changeType: "added" | "removed";
  position?: number;
  followerCount: number;
  estimatedReach: number;
  detectedAt: Date;
}

interface MilestoneAlert {
  metric: string;
  platform: Platform;
  previousValue: number;
  currentValue: number;
  milestone: number;
  percentageOfMilestone: number;
  estimatedTimeToMilestone: number;
}

interface CrossPlatformComparison {
  platforms: Platform[];
  metrics: {
    platform: Platform;
    streams: number;
    listeners: number;
    engagement: number;
    revenue: number;
    growthRate: number;
  }[];
  topPerformer: Platform;
  recommendations: string[];
}

const ALERT_MAX_USERS = 50_000;
const ALERT_MAX_PER_USER = 200;
const ALERT_USER_TTL_MS = 24 * 60 * 60 * 1000;

class AnalyticsAlertService {
  private alertStore: Map<string, Alert[]> = new Map();
  private triggerCityCache: Map<string, TriggerCity[]> = new Map();
  private playlistTracking: Map<string, Map<string, Set<string>>> = new Map();
  private lastAccess: Map<string, number> = new Map();

  constructor() {
    setInterval(() => this._sweepExpired(), ALERT_USER_TTL_MS).unref();
  }

  private _sweepExpired(): void {
    const cutoff = Date?.now() - ALERT_USER_TTL_MS;
    for (const [uid, ts] of this.lastAccess) {
      if (ts < cutoff) {
        this.alertStore.delete(uid);
        this.triggerCityCache.delete(uid);
        this.playlistTracking.delete(uid);
        this.lastAccess.delete(uid);
      }
    }
  }

  private _touch(userId: string): void {
    this.lastAccess.set(userId, Date?.now());
  }

  private _evictIfFull(): void {
    if (this.alertStore.size < ALERT_MAX_USERS) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [uid, ts] of this.lastAccess) {
      if (ts < oldestTime) {
        oldestTime = ts;
        oldestKey = uid;
      }
    }
    if (oldestKey) {
      this.alertStore.delete(oldestKey);
      this.triggerCityCache.delete(oldestKey);
      this.playlistTracking.delete(oldestKey);
      this.lastAccess.delete(oldestKey);
    }
  }

  private readonly milestoneThresholds = {
    streams: [
      1000, 10000, 100000, 500000, 1000000, 5000000, 10000000, 50000000,
      100000000,
    ],
    listeners: [100, 1000, 10000, 50000, 100000, 500000, 1000000, 5000000],
    followers: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
    playlistAdds: [10, 50, 100, 500, 1000, 5000],
    saves: [100, 1000, 10000, 50000, 100000],
    revenue: [100, 500, 1000, 5000, 10000, 50000, 100000],
  };

  private readonly hotspotThreshold = 50;
  private readonly growthSpikeThreshold = 25;
  private readonly declineWarningThreshold = -15;

  async detectTriggerCities(
    userId: string,
    period: { start: Date; end: Date },
  ): Promise<TriggerCity[]> {
    try {
      logger.info(`Detecting trigger cities for user ${userId}`);

      const halfPeriod = new Date(
        period?.start.getTime() +
          (period?.end.getTime() - period?.start.getTime()) / 2,
      );

      const [currentData, previousData] = await Promise?.all([
        db
          .select()
          .from(dspAnalytics)
          .where(
            and(
              eq(dspAnalytics.userId, userId),
              gte(dspAnalytics.date, halfPeriod),
              lte(dspAnalytics.date, period?.end),
            ),
          ),
        db
          .select()
          .from(dspAnalytics)
          .where(
            and(
              eq(dspAnalytics.userId, userId),
              gte(dspAnalytics.date, period?.start),
              lte(dspAnalytics.date, halfPeriod),
            ),
          ),
      ]);

      if (!currentData || currentData?.length === 0) {
        logger.info(`No geographic data available for user ${userId}`);
        return [];
      }

      const currentCityMap = new Map<
        string,
        {
          streams: number;
          listeners: number;
          country: string;
          region: string;
          lat: number;
          lon: number;
          platforms: Set<string>;
        }
      >();
      const previousCityMap = new Map<string, number>();

      for (const record of currentData) {
        const geography = (record as any)?.geography as Record<string, unknown>;
        if (!geography?.cities) continue;
        for (const city of geography?.cities) {
          if (!city?.name || !city?.streams) continue;
          const key = `${city?.name}-${city?.country || ""}`;
          const existing = currentCityMap?.get(key);
          if (existing) {
            existing.streams += city?.streams || 0;
            existing.listeners += city?.listeners || 0;
            existing?.platforms.add(record?.platform);
          } else {
            currentCityMap?.set(key, {
              streams: city.streams || 0,
              listeners: city.listeners || 0,
              country: city.country || "",
              region: city.region || "",
              lat: city.latitude || 0,
              lon: city.longitude || 0,
              platforms: new Set([record?.platform]),
            });
          }
        }
      }

      for (const record of previousData) {
        const geography = (record as any)?.geography as Record<string, unknown>;
        if (!geography?.cities) continue;
        for (const city of geography?.cities) {
          if (!city?.name || !city?.streams) continue;
          const key = `${city?.name}-${city?.country || ""}`;
          previousCityMap?.set(
            key,
            (previousCityMap?.get(key) || 0) + city?.streams,
          );
        }
      }

      const triggerCities: TriggerCity[] = [];

      for (const [key, data] of currentCityMap) {
        const previousStreams = previousCityMap?.get(key) || 0;
        const growthPercentage =
          previousStreams > 0
            ? ((data?.streams - previousStreams) / previousStreams) * 100
            : data?.streams > 0
              ? 100
              : 0;
        const isHotspot = growthPercentage >= this.hotspotThreshold;
        const trendDirection =
          growthPercentage > 10
            ? ("rising" as const)
            : growthPercentage < -10
              ? ("declining" as const)
              : ("stable" as const);

        triggerCities?.push({
          city: key.split("-")[0],
          country: data.country,
          region: data.region,
          latitude: data.lat,
          longitude: data.lon,
          growthRate: growthPercentage,
          streamCount: data.streams,
          listenerCount: data.listeners,
          previousWeekStreams: previousStreams,
          growthPercentage,
          isHotspot,
          detectedAt: new Date(),
          trendDirection,
          platforms: Array.from(data?.platforms) as Platform[],
        });
      }

      const hotspots = triggerCities?.filter((city) => city?.isHotspot);

      for (const city of hotspots) {
        await this.createAlert({
          userId,
          type: "trigger_city",
          priority:
            city?.growthPercentage > 100
              ? "critical"
              : city?.growthPercentage > 50
                ? "high"
                : "medium",
          title: `🔥 Trigger City Detected: ${city?.city}`,
          message: `Your music is trending in ${city?.city}, ${city?.country} with ${city?.growthPercentage.toFixed(0)}% growth this week. ${city?.listenerCount.toLocaleString()} new listeners detected.`,
          data: city,
        });
      }

      this._evictIfFull();
      this.triggerCityCache.set(userId, triggerCities);
      this._touch(userId);

      return triggerCities;
    } catch (error) {
      logger.warn({ err: error }, "Error detecting trigger cities:");
      return [];
    }
  }

  // @deprecated - No longer used. Mock data replaced with real DB queries.

  // @deprecated - No longer used.

  async trackPlaylistChanges(userId: string): Promise<PlaylistChange[]> {
    try {
      logger.info(`Tracking playlist changes for user ${userId}`);
      logger.info(
        "No real playlist tracking integration available. Returning empty results.",
      );
      return [];
    } catch (error) {
      logger.warn({ err: error }, "Error tracking playlist changes:");
      return [];
    }
  }

  // @deprecated - No longer used. Playlist tracking requires real integration.

  async checkMilestones(
    userId: string,
    platform: Platform,
    metrics: Record<string, number>,
  ): Promise<MilestoneAlert[]> {
    try {
      const milestones: MilestoneAlert[] = [];

      for (const [metric, value] of Object.entries(metrics)) {
        const thresholds =
          this.milestoneThresholds[
            metric as keyof typeof this.milestoneThresholds
          ];
        if (!thresholds) continue;

        for (const milestone of thresholds) {
          if (value >= milestone * 0.9 && value < milestone) {
            const percentageOfMilestone = (value / milestone) * 100;
            const growthRate = 0.05;
            const estimatedDays = Math.ceil(
              (milestone - value) / (value * growthRate),
            );

            milestones?.push({
              metric,
              platform,
              previousValue: Math.floor(value * 0.9),
              currentValue: value,
              milestone,
              percentageOfMilestone,
              estimatedTimeToMilestone: estimatedDays,
            });

            await this.createAlert({
              userId,
              type: "milestone",
              priority: "high",
              title: `🎯 Approaching Milestone: ${milestone?.toLocaleString()} ${metric}`,
              message: `You're ${percentageOfMilestone.toFixed(1)}% of the way to ${milestone.toLocaleString()} ${metric} on ${platform}! At your current growth rate, you'll reach this milestone in approximately ${estimatedDays} days.`,
              data: {
                metric,
                platform,
                currentValue: value,
                milestone,
                estimatedDays,
              },
              platform,
            });
          } else if (value >= milestone) {
            const previousValue = Math.floor(value * 0.95);
            if (previousValue < milestone && value >= milestone) {
              milestones?.push({
                metric,
                platform,
                previousValue,
                currentValue: value,
                milestone,
                percentageOfMilestone: 100,
                estimatedTimeToMilestone: 0,
              });

              await this.createAlert({
                userId,
                type: "milestone",
                priority: "critical",
                title: `🏆 Milestone Reached: ${milestone?.toLocaleString()} ${metric}!`,
                message: `Congratulations! You've reached ${milestone?.toLocaleString()} ${metric} on ${platform}! This is a major achievement.`,
                data: { metric, platform, currentValue: value, milestone },
                platform,
              });
            }
          }
        }
      }

      return milestones;
    } catch (error) {
      logger.warn({ err: error }, "Error checking milestones:");
      return [];
    }
  }

  async detectGrowthAnomalies(
    userId: string,
    platform: Platform,
    currentMetrics: Record<string, number>,
    previousMetrics: Record<string, number>,
  ): Promise<void> {
    try {
      for (const [metric, currentValue] of Object.entries(currentMetrics)) {
        const previousValue = previousMetrics[metric];
        if (!previousValue || previousValue === 0) continue;

        const growthPercentage =
          ((currentValue - previousValue) / previousValue) * 100;

        if (growthPercentage >= this.growthSpikeThreshold) {
          await this.createAlert({
            userId,
            type: "growth_spike",
            priority:
              growthPercentage > 100
                ? "critical"
                : growthPercentage > 50
                  ? "high"
                  : "medium",
            title: `📈 Growth Spike Detected: ${metric}`,
            message: `Your ${metric} on ${platform} increased by ${growthPercentage?.toFixed(1)}% compared to the previous period! Current: ${currentValue?.toLocaleString()}, Previous: ${previousValue?.toLocaleString()}.`,
            data: {
              metric,
              platform,
              currentValue,
              previousValue,
              growthPercentage,
            },
            platform,
          });
        }

        if (growthPercentage <= this.declineWarningThreshold) {
          await this.createAlert({
            userId,
            type: "decline_warning",
            priority:
              growthPercentage < -50
                ? "critical"
                : growthPercentage < -30
                  ? "high"
                  : "medium",
            title: `📉 Decline Warning: ${metric}`,
            message: `Your ${metric} on ${platform} decreased by ${Math.abs(growthPercentage).toFixed(1)}% compared to the previous period. Current: ${currentValue?.toLocaleString()}, Previous: ${previousValue?.toLocaleString()}. Consider reviewing your strategy.`,
            data: {
              metric,
              platform,
              currentValue,
              previousValue,
              growthPercentage,
            },
            platform,
          });
        }
      }
    } catch (error) {
      logger.warn({ err: error }, "Error detecting growth anomalies:");
    }
  }

  async detectViralContent(
    userId: string,
    platform: Platform,
    metrics: { shares: number; views: number; engagementRate: number },
  ): Promise<void> {
    try {
      const viralityScore =
        (metrics?.shares / Math.max(metrics?.views, 1)) * 1000 +
        metrics?.engagementRate;

      if (viralityScore > 50 || metrics?.engagementRate > 15) {
        await this.createAlert({
          userId,
          type: "viral_alert",
          priority: viralityScore > 100 ? "critical" : "high",
          title: `🚀 Viral Content Detected on ${platform}!`,
          message: `Your content is going viral! Share rate: ${((metrics?.shares / Math.max(metrics?.views, 1)) * 100).toFixed(2)}%, Engagement: ${metrics?.engagementRate.toFixed(1)}%. Capitalize on this momentum by posting more content and engaging with your audience.`,
          data: { platform, viralityScore, ...metrics },
          platform,
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Error detecting viral content:");
    }
  }

  async getCrossPlatformComparison(
    userId: string,
  ): Promise<CrossPlatformComparison> {
    try {
      const platforms: Platform[] = [
        "spotify",
        "apple",
        "youtube",
        "tiktok",
        "instagram",
      ];

      const now = new Date();
      const thirtyDaysAgo = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);

      const analyticsData = await db
        .select()
        .from(dspAnalytics)
        .where(
          and(
            eq(dspAnalytics.userId, userId),
            gte(dspAnalytics.date, thirtyDaysAgo),
            lte(dspAnalytics.date, now),
          ),
        )
        .orderBy(desc(dspAnalytics.date));

      const metrics = platforms?.map((platform) => {
        const platformData = analyticsData?.filter(
          (d) => d?.platform === platform,
        );
        const totalStreams = platformData?.reduce(
          (sum, d) => sum + (d?.streams || 0),
          0,
        );
        const totalListeners = platformData?.reduce(
          (sum, d) => sum + (d?.listeners || 0),
          0,
        );
        const totalRevenue = platformData?.reduce(
          (sum, d) => sum + (d?.revenue ? parseFloat(d?.revenue) : 0),
          0,
        );

        return {
          platform,
          streams: totalStreams,
          listeners: totalListeners,
          engagement: 0,
          revenue: totalRevenue,
          growthRate: 0,
        };
      });

      metrics?.sort((a, b) => b?.streams - a?.streams);
      const topPerformer = metrics[0].platform;

      const recommendations: string[] = [];

      const lowEngagement = metrics?.filter((m) => m?.streams === 0);
      if (lowEngagement?.length > 0) {
        recommendations?.push(
          `No data available on ${lowEngagement?.map((m) => m?.platform).join(", ")}. Connect these platforms to see cross-platform analytics.`,
        );
      }

      return {
        platforms,
        metrics,
        topPerformer,
        recommendations,
      };
    } catch (error) {
      logger.warn(
        { err: error },
        "Error generating cross-platform comparison:",
      );
      throw error;
    }
  }

  private async createAlert(
    alertData: Omit<Alert, "id" | "createdAt" | "dismissed">,
  ): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${Date?.now()}_${randomBytes(4).toString("hex")}`,
      createdAt: new Date(),
      dismissed: false,
      ...alertData,
    };

    this._evictIfFull();
    const userAlerts = this.alertStore.get(alertData?.userId) || [];
    userAlerts?.unshift(alert);

    if (userAlerts?.length > ALERT_MAX_PER_USER) {
      userAlerts?.splice(ALERT_MAX_PER_USER);
    }

    this.alertStore.set(alertData?.userId, userAlerts);
    this._touch(alertData?.userId);

    logger.info(
      `Created ${alert?.type} alert for user ${alertData?.userId}: ${alert?.title}`,
    );

    return alert;
  }

  async getAlerts(
    userId: string,
    options?: {
      type?: AlertType;
      priority?: AlertPriority;
      unreadOnly?: boolean;
      limit?: number;
    },
  ): Promise<Alert[]> {
    let alerts = this.alertStore.get(userId) || [];

    if (options?.type) {
      alerts = alerts?.filter((a) => a?.type === options?.type);
    }
    if (options?.priority) {
      alerts = alerts?.filter((a) => a?.priority === options?.priority);
    }
    if (options?.unreadOnly) {
      alerts = alerts?.filter((a) => !a?.readAt);
    }
    if (options?.limit) {
      alerts = alerts?.slice(0, options?.limit);
    }

    return alerts;
  }

  async markAlertAsRead(userId: string, alertId: string): Promise<boolean> {
    const alerts = this.alertStore.get(userId);
    if (!alerts) return false;

    const alert = alerts?.find((a) => a?.id === alertId);
    if (!alert) return false;

    alert.readAt = new Date();
    return true;
  }

  async dismissAlert(userId: string, alertId: string): Promise<boolean> {
    const alerts = this.alertStore.get(userId);
    if (!alerts) return false;

    const alert = alerts?.find((a) => a?.id === alertId);
    if (!alert) return false;

    alert.dismissed = true;
    return true;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const alerts = this.alertStore.get(userId) || [];
    return alerts?.filter((a) => !a?.readAt && !a?.dismissed).length;
  }

  async getTriggerCities(userId: string): Promise<TriggerCity[]> {
    return this.triggerCityCache.get(userId) || [];
  }

  async getAlertSummary(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<AlertType, number>;
    byPriority: Record<AlertPriority, number>;
    recentHighPriority: Alert[];
  }> {
    const alerts = this.alertStore.get(userId) || [];

    const byType: Record<AlertType, number> = {
      milestone: 0,
      playlist_add: 0,
      playlist_remove: 0,
      trigger_city: 0,
      growth_spike: 0,
      viral_alert: 0,
      decline_warning: 0,
    };

    const byPriority: Record<AlertPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    alerts?.forEach((alert) => {
      byType[alert?.type]++;
      byPriority[alert?.priority]++;
    });

    return {
      total: alerts.length,
      unread: alerts.filter((a) => !a?.readAt && !a?.dismissed).length,
      byType,
      byPriority,
      recentHighPriority: alerts
        .filter((a) => a?.priority === "high" || a?.priority === "critical")
        .slice(0, 5),
    };
  }
}

export const analyticsAlertService = new AnalyticsAlertService();
