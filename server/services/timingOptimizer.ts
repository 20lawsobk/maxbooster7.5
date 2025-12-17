import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import type { RedisClientType } from 'redis';
import { nanoid } from 'nanoid';

export interface OptimalTiming {
  platform: string;
  bestTimes: Array<{
    dayOfWeek: number;
    hour: number;
    score: number;
    audienceActive: number;
    competitionLevel: number;
  }>;
  timezone: string;
  nextOptimalSlot: Date;
}

export interface AudiencePattern {
  platform: string;
  userId?: string;
  timezone: string;
  peakHours: number[];
  peakDays: number[];
  avgEngagementByHour: Record<number, number>;
  avgEngagementByDay: Record<number, number>;
}

export interface CompetitorTiming {
  platform: string;
  saturatedHours: Array<{ dayOfWeek: number; hour: number; level: 'low' | 'medium' | 'high' }>;
  optimalGaps: Array<{ dayOfWeek: number; hour: number; opportunity: number }>;
}

export interface TimingRecommendation {
  id: string;
  platform: string;
  scheduledTime: Date;
  score: number;
  reasoning: string[];
  alternatives: Date[];
}

interface PlatformEngagementData {
  hourlyMultipliers: Record<number, number>;
  dayMultipliers: Record<number, number>;
  optimalWindows: Array<{ day: number; startHour: number; endHour: number; score: number }>;
}

class TimingOptimizerService {
  private readonly REDIS_TTL = 1800;
  private readonly CACHE_PREFIX = 'timing:';

  private readonly platformEngagement: Record<string, PlatformEngagementData> = {
    tiktok: {
      hourlyMultipliers: {
        0: 0.4, 1: 0.3, 2: 0.2, 3: 0.2, 4: 0.3, 5: 0.4,
        6: 0.6, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.0, 11: 1.1,
        12: 1.2, 13: 1.1, 14: 1.0, 15: 1.0, 16: 1.1, 17: 1.2,
        18: 1.3, 19: 1.4, 20: 1.5, 21: 1.4, 22: 1.2, 23: 0.8,
      },
      dayMultipliers: {
        0: 1.2, 1: 0.9, 2: 0.95, 3: 1.0, 4: 1.1, 5: 1.15, 6: 1.3,
      },
      optimalWindows: [
        { day: 0, startHour: 12, endHour: 15, score: 90 },
        { day: 0, startHour: 19, endHour: 21, score: 95 },
        { day: 5, startHour: 11, endHour: 14, score: 88 },
        { day: 6, startHour: 10, endHour: 14, score: 92 },
        { day: 6, startHour: 18, endHour: 21, score: 94 },
      ],
    },
    instagram: {
      hourlyMultipliers: {
        0: 0.3, 1: 0.2, 2: 0.15, 3: 0.1, 4: 0.2, 5: 0.4,
        6: 0.6, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.1, 11: 1.2,
        12: 1.3, 13: 1.2, 14: 1.1, 15: 1.0, 16: 1.0, 17: 1.1,
        18: 1.2, 19: 1.3, 20: 1.2, 21: 1.1, 22: 0.9, 23: 0.5,
      },
      dayMultipliers: {
        0: 1.1, 1: 1.0, 2: 1.05, 3: 1.1, 4: 1.05, 5: 1.0, 6: 1.15,
      },
      optimalWindows: [
        { day: 1, startHour: 11, endHour: 13, score: 88 },
        { day: 2, startHour: 10, endHour: 12, score: 86 },
        { day: 3, startHour: 11, endHour: 14, score: 90 },
        { day: 4, startHour: 10, endHour: 12, score: 87 },
        { day: 5, startHour: 10, endHour: 11, score: 85 },
      ],
    },
    youtube: {
      hourlyMultipliers: {
        0: 0.4, 1: 0.3, 2: 0.2, 3: 0.2, 4: 0.25, 5: 0.4,
        6: 0.5, 7: 0.6, 8: 0.7, 9: 0.8, 10: 0.9, 11: 1.0,
        12: 1.1, 13: 1.1, 14: 1.2, 15: 1.3, 16: 1.3, 17: 1.4,
        18: 1.4, 19: 1.5, 20: 1.5, 21: 1.4, 22: 1.2, 23: 0.8,
      },
      dayMultipliers: {
        0: 1.2, 1: 0.85, 2: 0.9, 3: 0.95, 4: 1.0, 5: 1.1, 6: 1.25,
      },
      optimalWindows: [
        { day: 4, startHour: 14, endHour: 16, score: 92 },
        { day: 5, startHour: 12, endHour: 15, score: 90 },
        { day: 6, startHour: 9, endHour: 11, score: 88 },
        { day: 0, startHour: 9, endHour: 11, score: 89 },
      ],
    },
    twitter: {
      hourlyMultipliers: {
        0: 0.3, 1: 0.2, 2: 0.15, 3: 0.1, 4: 0.15, 5: 0.3,
        6: 0.5, 7: 0.7, 8: 0.9, 9: 1.1, 10: 1.2, 11: 1.2,
        12: 1.3, 13: 1.2, 14: 1.1, 15: 1.0, 16: 1.0, 17: 1.1,
        18: 1.2, 19: 1.2, 20: 1.1, 21: 1.0, 22: 0.8, 23: 0.5,
      },
      dayMultipliers: {
        0: 0.85, 1: 1.1, 2: 1.15, 3: 1.2, 4: 1.15, 5: 1.0, 6: 0.9,
      },
      optimalWindows: [
        { day: 2, startHour: 9, endHour: 11, score: 92 },
        { day: 3, startHour: 12, endHour: 13, score: 90 },
        { day: 4, startHour: 8, endHour: 10, score: 88 },
      ],
    },
    facebook: {
      hourlyMultipliers: {
        0: 0.3, 1: 0.2, 2: 0.15, 3: 0.1, 4: 0.15, 5: 0.3,
        6: 0.5, 7: 0.7, 8: 0.85, 9: 1.0, 10: 1.1, 11: 1.15,
        12: 1.2, 13: 1.15, 14: 1.1, 15: 1.05, 16: 1.0, 17: 1.05,
        18: 1.1, 19: 1.15, 20: 1.1, 21: 1.0, 22: 0.8, 23: 0.5,
      },
      dayMultipliers: {
        0: 1.0, 1: 0.95, 2: 1.0, 3: 1.1, 4: 1.15, 5: 1.05, 6: 1.0,
      },
      optimalWindows: [
        { day: 3, startHour: 13, endHour: 16, score: 90 },
        { day: 4, startHour: 12, endHour: 14, score: 88 },
        { day: 5, startHour: 13, endHour: 15, score: 86 },
      ],
    },
    linkedin: {
      hourlyMultipliers: {
        0: 0.1, 1: 0.05, 2: 0.02, 3: 0.02, 4: 0.05, 5: 0.2,
        6: 0.5, 7: 0.8, 8: 1.2, 9: 1.4, 10: 1.5, 11: 1.4,
        12: 1.3, 13: 1.2, 14: 1.1, 15: 1.0, 16: 0.9, 17: 0.8,
        18: 0.6, 19: 0.4, 20: 0.3, 21: 0.2, 22: 0.15, 23: 0.1,
      },
      dayMultipliers: {
        0: 0.4, 1: 1.2, 2: 1.3, 3: 1.35, 4: 1.3, 5: 1.0, 6: 0.5,
      },
      optimalWindows: [
        { day: 2, startHour: 7, endHour: 8, score: 95 },
        { day: 2, startHour: 10, endHour: 11, score: 92 },
        { day: 3, startHour: 7, endHour: 8, score: 94 },
        { day: 4, startHour: 9, endHour: 10, score: 90 },
      ],
    },
  };

  private readonly timezoneOffsets: Record<string, number> = {
    'America/New_York': -5,
    'America/Los_Angeles': -8,
    'America/Chicago': -6,
    'Europe/London': 0,
    'Europe/Paris': 1,
    'Asia/Tokyo': 9,
    'Australia/Sydney': 11,
    UTC: 0,
  };

  constructor() {
    logger.info('✅ Timing Optimizer service initialized');
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async getOptimalTiming(
    platform: string,
    timezone: string = 'America/New_York',
    userId?: string
  ): Promise<OptimalTiming> {
    const cacheKey = `${this.CACHE_PREFIX}optimal:${platform}:${timezone}`;
    
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const bestTimes = this.calculateBestTimes(platform, timezone);
    const nextOptimalSlot = this.findNextOptimalSlot(bestTimes, timezone);

    const result: OptimalTiming = {
      platform,
      bestTimes,
      timezone,
      nextOptimalSlot,
    };

    if (redis) {
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(result));
    }

    logger.info(`🕐 Optimal timing calculated for ${platform} in ${timezone}`);
    return result;
  }

  private calculateBestTimes(
    platform: string,
    timezone: string
  ): OptimalTiming['bestTimes'] {
    const platformData = this.platformEngagement[platform] || this.platformEngagement.instagram;
    const tzOffset = this.timezoneOffsets[timezone] || 0;
    const bestTimes: OptimalTiming['bestTimes'] = [];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const adjustedHour = (hour - tzOffset + 24) % 24;
        const hourMultiplier = platformData.hourlyMultipliers[adjustedHour] || 1;
        const dayMultiplier = platformData.dayMultipliers[day] || 1;
        
        const baseScore = hourMultiplier * dayMultiplier * 50;
        
        const windowBonus = platformData.optimalWindows.some(
          w => w.day === day && hour >= w.startHour && hour <= w.endHour
        ) ? 20 : 0;

        const competitionLevel = this.estimateCompetition(day, hour, platform);
        const audienceActive = Math.round(hourMultiplier * dayMultiplier * 100);

        bestTimes.push({
          dayOfWeek: day,
          hour,
          score: Math.min(100, Math.round(baseScore + windowBonus - competitionLevel * 5)),
          audienceActive,
          competitionLevel,
        });
      }
    }

    return bestTimes.sort((a, b) => b.score - a.score).slice(0, 21);
  }

  private estimateCompetition(day: number, hour: number, platform: string): number {
    const peakHours = [9, 10, 11, 12, 13, 17, 18, 19, 20];
    const isPeakHour = peakHours.includes(hour);
    const isPeakDay = [2, 3, 4].includes(day);

    let competition = 3;
    
    if (isPeakHour && isPeakDay) {
      competition = 8;
    } else if (isPeakHour) {
      competition = 6;
    } else if (isPeakDay) {
      competition = 5;
    }

    if (platform === 'linkedin' && (day === 0 || day === 6)) {
      competition = 2;
    }

    return competition;
  }

  private findNextOptimalSlot(
    bestTimes: OptimalTiming['bestTimes'],
    timezone: string
  ): Date {
    const now = new Date();
    const tzOffset = (this.timezoneOffsets[timezone] || 0) * 60;
    
    const localNow = new Date(now.getTime() + tzOffset * 60 * 1000);
    const currentDay = localNow.getUTCDay();
    const currentHour = localNow.getUTCHours();

    const sortedByScore = [...bestTimes].sort((a, b) => b.score - a.score);

    for (const slot of sortedByScore) {
      let daysUntil = slot.dayOfWeek - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && slot.hour <= currentHour)) {
        daysUntil += 7;
      }

      const nextSlot = new Date(localNow);
      nextSlot.setUTCDate(nextSlot.getUTCDate() + daysUntil);
      nextSlot.setUTCHours(slot.hour, 0, 0, 0);

      nextSlot.setTime(nextSlot.getTime() - tzOffset * 60 * 1000);

      if (nextSlot > now) {
        return nextSlot;
      }
    }

    const nextSlot = new Date(now);
    nextSlot.setHours(nextSlot.getHours() + 1, 0, 0, 0);
    return nextSlot;
  }

  async analyzeAudiencePatterns(
    userId: string,
    platform: string,
    historicalData?: Array<{ postedAt: Date; engagement: number }>
  ): Promise<AudiencePattern> {
    const engagementByHour: Record<number, number[]> = {};
    const engagementByDay: Record<number, number[]> = {};

    for (let h = 0; h < 24; h++) engagementByHour[h] = [];
    for (let d = 0; d < 7; d++) engagementByDay[d] = [];

    if (historicalData && historicalData.length > 0) {
      for (const post of historicalData) {
        const hour = new Date(post.postedAt).getHours();
        const day = new Date(post.postedAt).getDay();
        engagementByHour[hour].push(post.engagement);
        engagementByDay[day].push(post.engagement);
      }
    } else {
      const platformData = this.platformEngagement[platform] || this.platformEngagement.instagram;
      for (let h = 0; h < 24; h++) {
        engagementByHour[h] = [platformData.hourlyMultipliers[h] * 100];
      }
      for (let d = 0; d < 7; d++) {
        engagementByDay[d] = [platformData.dayMultipliers[d] * 100];
      }
    }

    const avgEngagementByHour: Record<number, number> = {};
    const avgEngagementByDay: Record<number, number> = {};

    for (let h = 0; h < 24; h++) {
      const values = engagementByHour[h];
      avgEngagementByHour[h] = values.length > 0 
        ? values.reduce((a, b) => a + b, 0) / values.length 
        : 50;
    }

    for (let d = 0; d < 7; d++) {
      const values = engagementByDay[d];
      avgEngagementByDay[d] = values.length > 0 
        ? values.reduce((a, b) => a + b, 0) / values.length 
        : 50;
    }

    const sortedHours = Object.entries(avgEngagementByHour)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([h]) => parseInt(h));

    const sortedDays = Object.entries(avgEngagementByDay)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([d]) => parseInt(d));

    return {
      platform,
      userId,
      timezone: 'America/New_York',
      peakHours: sortedHours,
      peakDays: sortedDays,
      avgEngagementByHour,
      avgEngagementByDay,
    };
  }

  async getCompetitorTiming(platform: string): Promise<CompetitorTiming> {
    const saturatedHours: CompetitorTiming['saturatedHours'] = [];
    const optimalGaps: CompetitorTiming['optimalGaps'] = [];

    const peakDays = [1, 2, 3, 4];
    const peakHours = [9, 10, 11, 12, 13, 17, 18, 19];

    for (const day of peakDays) {
      for (const hour of peakHours) {
        saturatedHours.push({
          dayOfWeek: day,
          hour,
          level: hour >= 11 && hour <= 13 ? 'high' : 'medium',
        });
      }
    }

    const lowCompetitionHours = [6, 7, 14, 15, 16, 21, 22];
    for (let day = 0; day < 7; day++) {
      for (const hour of lowCompetitionHours) {
        const opportunity = 70 + Math.floor(Math.random() * 20);
        optimalGaps.push({
          dayOfWeek: day,
          hour,
          opportunity,
        });
      }
    }

    return {
      platform,
      saturatedHours,
      optimalGaps: optimalGaps.sort((a, b) => b.opportunity - a.opportunity).slice(0, 15),
    };
  }

  async getTimingRecommendation(
    platform: string,
    targetDate: Date,
    timezone: string = 'America/New_York'
  ): Promise<TimingRecommendation> {
    const optimalTiming = await this.getOptimalTiming(platform, timezone);
    const targetDay = targetDate.getDay();
    const targetHour = targetDate.getHours();

    const sameDay = optimalTiming.bestTimes.filter(t => t.dayOfWeek === targetDay);
    const nearestSlot = sameDay.sort((a, b) => 
      Math.abs(a.hour - targetHour) - Math.abs(b.hour - targetHour)
    )[0];

    const reasoning: string[] = [];
    let score = 50;

    if (nearestSlot) {
      score = nearestSlot.score;
      reasoning.push(`Audience activity: ${nearestSlot.audienceActive}% of peak`);
      reasoning.push(`Competition level: ${nearestSlot.competitionLevel}/10`);
      
      if (nearestSlot.score >= 80) {
        reasoning.push('Excellent timing - high engagement expected');
      } else if (nearestSlot.score >= 60) {
        reasoning.push('Good timing - moderate engagement expected');
      } else {
        reasoning.push('Consider alternative slots for better reach');
      }
    }

    const alternatives = optimalTiming.bestTimes
      .filter(t => t.score > score)
      .slice(0, 3)
      .map(t => {
        const alt = new Date(targetDate);
        const dayDiff = t.dayOfWeek - targetDay;
        alt.setDate(alt.getDate() + (dayDiff >= 0 ? dayDiff : dayDiff + 7));
        alt.setHours(t.hour, 0, 0, 0);
        return alt;
      });

    return {
      id: nanoid(),
      platform,
      scheduledTime: targetDate,
      score,
      reasoning,
      alternatives,
    };
  }

  async getOptimalTimingForAllPlatforms(
    timezone: string = 'America/New_York'
  ): Promise<Record<string, OptimalTiming>> {
    const platforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin'];
    const results: Record<string, OptimalTiming> = {};

    await Promise.all(
      platforms.map(async (platform) => {
        results[platform] = await this.getOptimalTiming(platform, timezone);
      })
    );

    return results;
  }

  async suggestPostingSchedule(
    platforms: string[],
    postsPerWeek: number,
    timezone: string = 'America/New_York'
  ): Promise<Array<{ platform: string; scheduledTime: Date; score: number }>> {
    const schedule: Array<{ platform: string; scheduledTime: Date; score: number }> = [];
    const now = new Date();

    const allTimings = await this.getOptimalTimingForAllPlatforms(timezone);

    const postsPerPlatform = Math.ceil(postsPerWeek / platforms.length);
    const tzOffset = (this.timezoneOffsets[timezone] || 0) * 60;

    for (const platform of platforms) {
      const timing = allTimings[platform];
      const topSlots = timing.bestTimes.slice(0, postsPerPlatform);

      for (const slot of topSlots) {
        let daysUntil = slot.dayOfWeek - now.getDay();
        if (daysUntil <= 0) daysUntil += 7;

        const scheduledTime = new Date(now);
        scheduledTime.setDate(scheduledTime.getDate() + daysUntil);
        scheduledTime.setHours(slot.hour, 0, 0, 0);

        schedule.push({
          platform,
          scheduledTime,
          score: slot.score,
        });
      }
    }

    return schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }
}

export const timingOptimizerService = new TimingOptimizerService();
