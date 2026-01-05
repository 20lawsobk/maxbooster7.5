import { db } from "../db";
import { eq, and, desc, sql, gte, lte, lt, gt, or } from "drizzle-orm";
import { logger } from "../logger";

type AlertType = 'milestone' | 'playlist_add' | 'playlist_remove' | 'trigger_city' | 'growth_spike' | 'viral_alert' | 'decline_warning';
type AlertPriority = 'low' | 'medium' | 'high' | 'critical';
type Platform = 'spotify' | 'apple' | 'youtube' | 'amazon' | 'tiktok' | 'instagram' | 'tidal' | 'deezer' | 'soundcloud' | 'pandora';

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
  trendDirection: 'rising' | 'stable' | 'declining';
  platforms: Platform[];
}

interface PlaylistChange {
  playlistId: string;
  playlistName: string;
  platform: Platform;
  trackId: string;
  trackName: string;
  artistName: string;
  changeType: 'added' | 'removed';
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

class AnalyticsAlertService {
  private alertStore: Map<string, Alert[]> = new Map();
  private triggerCityCache: Map<string, TriggerCity[]> = new Map();
  private playlistTracking: Map<string, Map<string, Set<string>>> = new Map();

  private readonly milestoneThresholds = {
    streams: [1000, 10000, 100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000],
    listeners: [100, 1000, 10000, 50000, 100000, 500000, 1000000, 5000000],
    followers: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
    playlistAdds: [10, 50, 100, 500, 1000, 5000],
    saves: [100, 1000, 10000, 50000, 100000],
    revenue: [100, 500, 1000, 5000, 10000, 50000, 100000],
  };

  private readonly hotspotThreshold = 50;
  private readonly growthSpikeThreshold = 25;
  private readonly declineWarningThreshold = -15;

  async detectTriggerCities(userId: string, period: { start: Date; end: Date }): Promise<TriggerCity[]> {
    try {
      logger.info(`Detecting trigger cities for user ${userId}`);

      const mockCities = this.generateMockTriggerCities();
      
      const triggerCities = mockCities.filter(city => city.isHotspot);
      
      for (const city of triggerCities) {
        await this.createAlert({
          userId,
          type: 'trigger_city',
          priority: city.growthPercentage > 100 ? 'critical' : city.growthPercentage > 50 ? 'high' : 'medium',
          title: `🔥 Trigger City Detected: ${city.city}`,
          message: `Your music is trending in ${city.city}, ${city.country} with ${city.growthPercentage.toFixed(0)}% growth this week. ${city.listenerCount.toLocaleString()} new listeners detected.`,
          data: city,
        });
      }

      this.triggerCityCache.set(userId, triggerCities);
      
      return triggerCities;
    } catch (error) {
      logger.error('Error detecting trigger cities:', error);
      return [];
    }
  }

  private generateMockTriggerCities(): TriggerCity[] {
    const cities = [
      { city: 'Jakarta', country: 'Indonesia', region: 'Southeast Asia', lat: -6.2088, lon: 106.8456 },
      { city: 'São Paulo', country: 'Brazil', region: 'South America', lat: -23.5505, lon: -46.6333 },
      { city: 'Mexico City', country: 'Mexico', region: 'North America', lat: 19.4326, lon: -99.1332 },
      { city: 'Lagos', country: 'Nigeria', region: 'West Africa', lat: 6.5244, lon: 3.3792 },
      { city: 'Manila', country: 'Philippines', region: 'Southeast Asia', lat: 14.5995, lon: 120.9842 },
      { city: 'Buenos Aires', country: 'Argentina', region: 'South America', lat: -34.6037, lon: -58.3816 },
      { city: 'Delhi', country: 'India', region: 'South Asia', lat: 28.7041, lon: 77.1025 },
      { city: 'Cairo', country: 'Egypt', region: 'North Africa', lat: 30.0444, lon: 31.2357 },
      { city: 'Berlin', country: 'Germany', region: 'Europe', lat: 52.5200, lon: 13.4050 },
      { city: 'Tokyo', country: 'Japan', region: 'East Asia', lat: 35.6762, lon: 139.6503 },
      { city: 'London', country: 'UK', region: 'Europe', lat: 51.5074, lon: -0.1278 },
      { city: 'Los Angeles', country: 'USA', region: 'North America', lat: 34.0522, lon: -118.2437 },
      { city: 'Paris', country: 'France', region: 'Europe', lat: 48.8566, lon: 2.3522 },
      { city: 'Toronto', country: 'Canada', region: 'North America', lat: 43.6532, lon: -79.3832 },
      { city: 'Sydney', country: 'Australia', region: 'Oceania', lat: -33.8688, lon: 151.2093 },
    ];

    return cities.map(c => {
      const growthRate = -20 + Math.random() * 150;
      const streamCount = Math.floor(Math.random() * 50000) + 1000;
      const previousWeekStreams = Math.floor(streamCount / (1 + growthRate / 100));
      
      return {
        city: c.city,
        country: c.country,
        region: c.region,
        latitude: c.lat,
        longitude: c.lon,
        growthRate,
        streamCount,
        listenerCount: Math.floor(streamCount * 0.4),
        previousWeekStreams,
        growthPercentage: growthRate,
        isHotspot: growthRate >= this.hotspotThreshold,
        detectedAt: new Date(),
        trendDirection: growthRate > 10 ? 'rising' : growthRate < -10 ? 'declining' : 'stable',
        platforms: this.getRandomPlatforms(),
      };
    });
  }

  private getRandomPlatforms(): Platform[] {
    const allPlatforms: Platform[] = ['spotify', 'apple', 'youtube', 'tiktok', 'instagram'];
    const count = Math.floor(Math.random() * 3) + 1;
    return allPlatforms.sort(() => Math.random() - 0.5).slice(0, count);
  }

  async trackPlaylistChanges(userId: string): Promise<PlaylistChange[]> {
    try {
      logger.info(`Tracking playlist changes for user ${userId}`);

      const changes = this.generateMockPlaylistChanges(userId);
      
      for (const change of changes) {
        const priority: AlertPriority = change.followerCount > 100000 ? 'critical' : 
                                         change.followerCount > 50000 ? 'high' : 
                                         change.followerCount > 10000 ? 'medium' : 'low';
        
        await this.createAlert({
          userId,
          type: change.changeType === 'added' ? 'playlist_add' : 'playlist_remove',
          priority,
          title: change.changeType === 'added' 
            ? `🎵 Added to Playlist: ${change.playlistName}`
            : `❌ Removed from Playlist: ${change.playlistName}`,
          message: change.changeType === 'added'
            ? `"${change.trackName}" was added to "${change.playlistName}" (${change.followerCount.toLocaleString()} followers). Estimated reach: ${change.estimatedReach.toLocaleString()} listeners.`
            : `"${change.trackName}" was removed from "${change.playlistName}". This playlist had ${change.followerCount.toLocaleString()} followers.`,
          data: change,
          platform: change.platform,
        });
      }

      return changes;
    } catch (error) {
      logger.error('Error tracking playlist changes:', error);
      return [];
    }
  }

  private generateMockPlaylistChanges(userId: string): PlaylistChange[] {
    const playlists = [
      { name: 'Today\'s Top Hits', platform: 'spotify' as Platform, followers: 35000000 },
      { name: 'New Music Friday', platform: 'spotify' as Platform, followers: 12500000 },
      { name: 'RapCaviar', platform: 'spotify' as Platform, followers: 15200000 },
      { name: 'Today Hits', platform: 'apple' as Platform, followers: 8500000 },
      { name: 'A-List Pop', platform: 'apple' as Platform, followers: 6200000 },
      { name: 'Hot Rotation', platform: 'amazon' as Platform, followers: 2100000 },
      { name: 'Indie Chill', platform: 'spotify' as Platform, followers: 890000 },
      { name: 'Chill Vibes', platform: 'spotify' as Platform, followers: 2400000 },
      { name: 'Discover Weekly', platform: 'spotify' as Platform, followers: 500000 },
    ];

    const numChanges = Math.floor(Math.random() * 3) + 1;
    const changes: PlaylistChange[] = [];

    for (let i = 0; i < numChanges; i++) {
      const playlist = playlists[Math.floor(Math.random() * playlists.length)];
      const isAdded = Math.random() > 0.3;
      
      changes.push({
        playlistId: `pl_${Math.random().toString(36).substr(2, 9)}`,
        playlistName: playlist.name,
        platform: playlist.platform,
        trackId: `track_${Math.random().toString(36).substr(2, 9)}`,
        trackName: `Track ${Math.floor(Math.random() * 100)}`,
        artistName: 'Your Artist',
        changeType: isAdded ? 'added' : 'removed',
        position: isAdded ? Math.floor(Math.random() * 50) + 1 : undefined,
        followerCount: playlist.followers,
        estimatedReach: Math.floor(playlist.followers * (0.1 + Math.random() * 0.3)),
        detectedAt: new Date(),
      });
    }

    return changes;
  }

  async checkMilestones(userId: string, platform: Platform, metrics: Record<string, number>): Promise<MilestoneAlert[]> {
    try {
      const milestones: MilestoneAlert[] = [];

      for (const [metric, value] of Object.entries(metrics)) {
        const thresholds = this.milestoneThresholds[metric as keyof typeof this.milestoneThresholds];
        if (!thresholds) continue;

        for (const milestone of thresholds) {
          if (value >= milestone * 0.9 && value < milestone) {
            const percentageOfMilestone = (value / milestone) * 100;
            const growthRate = 0.05;
            const estimatedDays = Math.ceil((milestone - value) / (value * growthRate));

            milestones.push({
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
              type: 'milestone',
              priority: 'high',
              title: `🎯 Approaching Milestone: ${milestone.toLocaleString()} ${metric}`,
              message: `You're ${percentageOfMilestone.toFixed(1)}% of the way to ${milestone.toLocaleString()} ${metric} on ${platform}! At your current growth rate, you'll reach this milestone in approximately ${estimatedDays} days.`,
              data: { metric, platform, currentValue: value, milestone, estimatedDays },
              platform,
            });
          } else if (value >= milestone) {
            const previousValue = Math.floor(value * 0.95);
            if (previousValue < milestone && value >= milestone) {
              milestones.push({
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
                type: 'milestone',
                priority: 'critical',
                title: `🏆 Milestone Reached: ${milestone.toLocaleString()} ${metric}!`,
                message: `Congratulations! You've reached ${milestone.toLocaleString()} ${metric} on ${platform}! This is a major achievement.`,
                data: { metric, platform, currentValue: value, milestone },
                platform,
              });
            }
          }
        }
      }

      return milestones;
    } catch (error) {
      logger.error('Error checking milestones:', error);
      return [];
    }
  }

  async detectGrowthAnomalies(userId: string, platform: Platform, currentMetrics: Record<string, number>, previousMetrics: Record<string, number>): Promise<void> {
    try {
      for (const [metric, currentValue] of Object.entries(currentMetrics)) {
        const previousValue = previousMetrics[metric];
        if (!previousValue || previousValue === 0) continue;

        const growthPercentage = ((currentValue - previousValue) / previousValue) * 100;

        if (growthPercentage >= this.growthSpikeThreshold) {
          await this.createAlert({
            userId,
            type: 'growth_spike',
            priority: growthPercentage > 100 ? 'critical' : growthPercentage > 50 ? 'high' : 'medium',
            title: `📈 Growth Spike Detected: ${metric}`,
            message: `Your ${metric} on ${platform} increased by ${growthPercentage.toFixed(1)}% compared to the previous period! Current: ${currentValue.toLocaleString()}, Previous: ${previousValue.toLocaleString()}.`,
            data: { metric, platform, currentValue, previousValue, growthPercentage },
            platform,
          });
        }

        if (growthPercentage <= this.declineWarningThreshold) {
          await this.createAlert({
            userId,
            type: 'decline_warning',
            priority: growthPercentage < -50 ? 'critical' : growthPercentage < -30 ? 'high' : 'medium',
            title: `📉 Decline Warning: ${metric}`,
            message: `Your ${metric} on ${platform} decreased by ${Math.abs(growthPercentage).toFixed(1)}% compared to the previous period. Current: ${currentValue.toLocaleString()}, Previous: ${previousValue.toLocaleString()}. Consider reviewing your strategy.`,
            data: { metric, platform, currentValue, previousValue, growthPercentage },
            platform,
          });
        }
      }
    } catch (error) {
      logger.error('Error detecting growth anomalies:', error);
    }
  }

  async detectViralContent(userId: string, platform: Platform, metrics: { shares: number; views: number; engagementRate: number }): Promise<void> {
    try {
      const viralityScore = (metrics.shares / Math.max(metrics.views, 1)) * 1000 + metrics.engagementRate;
      
      if (viralityScore > 50 || metrics.engagementRate > 15) {
        await this.createAlert({
          userId,
          type: 'viral_alert',
          priority: viralityScore > 100 ? 'critical' : 'high',
          title: `🚀 Viral Content Detected on ${platform}!`,
          message: `Your content is going viral! Share rate: ${((metrics.shares / Math.max(metrics.views, 1)) * 100).toFixed(2)}%, Engagement: ${metrics.engagementRate.toFixed(1)}%. Capitalize on this momentum by posting more content and engaging with your audience.`,
          data: { platform, viralityScore, ...metrics },
          platform,
        });
      }
    } catch (error) {
      logger.error('Error detecting viral content:', error);
    }
  }

  async getCrossPlatformComparison(userId: string): Promise<CrossPlatformComparison> {
    try {
      const platforms: Platform[] = ['spotify', 'apple', 'youtube', 'tiktok', 'instagram'];
      
      const metrics = platforms.map(platform => ({
        platform,
        streams: Math.floor(Math.random() * 500000) + 10000,
        listeners: Math.floor(Math.random() * 200000) + 5000,
        engagement: 2 + Math.random() * 15,
        revenue: Math.floor(Math.random() * 5000) + 100,
        growthRate: -10 + Math.random() * 50,
      }));

      metrics.sort((a, b) => b.streams - a.streams);
      const topPerformer = metrics[0].platform;

      const recommendations: string[] = [];
      
      const tiktokData = metrics.find(m => m.platform === 'tiktok');
      const spotifyData = metrics.find(m => m.platform === 'spotify');
      
      if (tiktokData && spotifyData && tiktokData.growthRate > spotifyData.growthRate) {
        recommendations.push('Your TikTok growth is outpacing Spotify. Consider creating more short-form content to convert TikTok followers to streaming platforms.');
      }
      
      const lowEngagement = metrics.filter(m => m.engagement < 5);
      if (lowEngagement.length > 0) {
        recommendations.push(`Engagement is low on ${lowEngagement.map(m => m.platform).join(', ')}. Try posting more interactive content like polls, Q&As, or behind-the-scenes footage.`);
      }

      const negativeGrowth = metrics.filter(m => m.growthRate < 0);
      if (negativeGrowth.length > 0) {
        recommendations.push(`Consider focusing on ${negativeGrowth.map(m => m.platform).join(', ')} where growth has declined. Fresh content or a new release could help reverse this trend.`);
      }

      return {
        platforms,
        metrics,
        topPerformer,
        recommendations,
      };
    } catch (error) {
      logger.error('Error generating cross-platform comparison:', error);
      throw error;
    }
  }

  private async createAlert(alertData: Omit<Alert, 'id' | 'createdAt' | 'dismissed'>): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      dismissed: false,
      ...alertData,
    };

    const userAlerts = this.alertStore.get(alertData.userId) || [];
    userAlerts.unshift(alert);
    
    if (userAlerts.length > 100) {
      userAlerts.splice(100);
    }
    
    this.alertStore.set(alertData.userId, userAlerts);

    logger.info(`Created ${alert.type} alert for user ${alertData.userId}: ${alert.title}`);

    return alert;
  }

  async getAlerts(userId: string, options?: { type?: AlertType; priority?: AlertPriority; unreadOnly?: boolean; limit?: number }): Promise<Alert[]> {
    let alerts = this.alertStore.get(userId) || [];

    if (options?.type) {
      alerts = alerts.filter(a => a.type === options.type);
    }
    if (options?.priority) {
      alerts = alerts.filter(a => a.priority === options.priority);
    }
    if (options?.unreadOnly) {
      alerts = alerts.filter(a => !a.readAt);
    }
    if (options?.limit) {
      alerts = alerts.slice(0, options.limit);
    }

    return alerts;
  }

  async markAlertAsRead(userId: string, alertId: string): Promise<boolean> {
    const alerts = this.alertStore.get(userId);
    if (!alerts) return false;

    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.readAt = new Date();
    return true;
  }

  async dismissAlert(userId: string, alertId: string): Promise<boolean> {
    const alerts = this.alertStore.get(userId);
    if (!alerts) return false;

    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.dismissed = true;
    return true;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const alerts = this.alertStore.get(userId) || [];
    return alerts.filter(a => !a.readAt && !a.dismissed).length;
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

    alerts.forEach(alert => {
      byType[alert.type]++;
      byPriority[alert.priority]++;
    });

    return {
      total: alerts.length,
      unread: alerts.filter(a => !a.readAt && !a.dismissed).length,
      byType,
      byPriority,
      recentHighPriority: alerts.filter(a => a.priority === 'high' || a.priority === 'critical').slice(0, 5),
    };
  }
}

export const analyticsAlertService = new AnalyticsAlertService();
