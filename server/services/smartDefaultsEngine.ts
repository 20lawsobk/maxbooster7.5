import { db } from '../db';
import { users, analytics, socialAccounts } from '@shared/schema';
import { eq, desc, gte } from 'drizzle-orm';
import { getRedisClient } from '../lib/redisConnectionFactory';
import { logger } from '../logger';
import { userPreferencesService, ArtistType, CareerStage, UserPreferences } from './userPreferencesService';

export interface SmartDefault {
  category: string;
  key: string;
  value: any;
  confidence: number;
  reasoning: string;
}

export interface GenreTemplate {
  genre: string;
  defaultBPM: number;
  defaultKey: string;
  suggestedPlatforms: string[];
  contentStyle: string[];
  colorPalette: string[];
  postingFrequency: 'low' | 'medium' | 'high';
  audienceAge: [number, number];
}

export interface SchedulingSuggestion {
  day: string;
  times: string[];
  platform: string;
  reason: string;
  engagementScore: number;
}

export interface PlatformRecommendation {
  platform: string;
  priority: 'primary' | 'secondary' | 'emerging';
  reason: string;
  audienceMatch: number;
  growthPotential: number;
  effort: 'low' | 'medium' | 'high';
}

const GENRE_TEMPLATES: Record<string, GenreTemplate> = {
  'hip-hop': {
    genre: 'hip-hop',
    defaultBPM: 90,
    defaultKey: 'C minor',
    suggestedPlatforms: ['spotify', 'apple_music', 'tiktok', 'instagram'],
    contentStyle: ['behind_the_scenes', 'freestyles', 'studio_sessions'],
    colorPalette: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
    postingFrequency: 'high',
    audienceAge: [16, 30],
  },
  'electronic': {
    genre: 'electronic',
    defaultBPM: 128,
    defaultKey: 'A minor',
    suggestedPlatforms: ['spotify', 'soundcloud', 'beatport', 'youtube'],
    contentStyle: ['production_tips', 'live_sets', 'tutorials'],
    colorPalette: ['#0d0221', '#3d087b', '#6c3483', '#ff3cac'],
    postingFrequency: 'medium',
    audienceAge: [18, 35],
  },
  'pop': {
    genre: 'pop',
    defaultBPM: 120,
    defaultKey: 'C major',
    suggestedPlatforms: ['spotify', 'apple_music', 'tiktok', 'instagram', 'youtube'],
    contentStyle: ['personal_stories', 'music_videos', 'challenges'],
    colorPalette: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3'],
    postingFrequency: 'high',
    audienceAge: [14, 28],
  },
  'rock': {
    genre: 'rock',
    defaultBPM: 130,
    defaultKey: 'E minor',
    suggestedPlatforms: ['spotify', 'youtube', 'bandcamp', 'facebook'],
    contentStyle: ['live_performances', 'gear_reviews', 'band_updates'],
    colorPalette: ['#2d3436', '#636e72', '#b2bec3', '#e17055'],
    postingFrequency: 'medium',
    audienceAge: [20, 45],
  },
  'r&b': {
    genre: 'r&b',
    defaultBPM: 75,
    defaultKey: 'E♭ major',
    suggestedPlatforms: ['spotify', 'apple_music', 'instagram', 'youtube'],
    contentStyle: ['vocal_covers', 'acoustic_sessions', 'personal_stories'],
    colorPalette: ['#2c2c54', '#474787', '#706fd3', '#f8a5c2'],
    postingFrequency: 'medium',
    audienceAge: [18, 35],
  },
  'country': {
    genre: 'country',
    defaultBPM: 110,
    defaultKey: 'G major',
    suggestedPlatforms: ['spotify', 'apple_music', 'facebook', 'youtube'],
    contentStyle: ['storytelling', 'acoustic_sessions', 'lifestyle'],
    colorPalette: ['#d4a056', '#8c6239', '#5c4033', '#f5deb3'],
    postingFrequency: 'medium',
    audienceAge: [22, 50],
  },
  'jazz': {
    genre: 'jazz',
    defaultBPM: 100,
    defaultKey: 'B♭ major',
    suggestedPlatforms: ['spotify', 'bandcamp', 'youtube', 'linkedin'],
    contentStyle: ['live_performances', 'educational', 'collaborations'],
    colorPalette: ['#1a1a2e', '#b8860b', '#d4af37', '#ffe4b5'],
    postingFrequency: 'low',
    audienceAge: [25, 55],
  },
  'classical': {
    genre: 'classical',
    defaultBPM: 80,
    defaultKey: 'C major',
    suggestedPlatforms: ['spotify', 'youtube', 'apple_music', 'bandcamp'],
    contentStyle: ['performances', 'educational', 'practice_sessions'],
    colorPalette: ['#2c3e50', '#34495e', '#95a5a6', '#ecf0f1'],
    postingFrequency: 'low',
    audienceAge: [30, 65],
  },
  'latin': {
    genre: 'latin',
    defaultBPM: 100,
    defaultKey: 'A minor',
    suggestedPlatforms: ['spotify', 'youtube', 'tiktok', 'instagram'],
    contentStyle: ['dance_videos', 'live_performances', 'cultural_content'],
    colorPalette: ['#ff6b35', '#f7c531', '#f25c54', '#e53935'],
    postingFrequency: 'high',
    audienceAge: [16, 40],
  },
  'indie': {
    genre: 'indie',
    defaultBPM: 115,
    defaultKey: 'D major',
    suggestedPlatforms: ['spotify', 'bandcamp', 'soundcloud', 'instagram'],
    contentStyle: ['artistic_visuals', 'DIY_content', 'behind_the_scenes'],
    colorPalette: ['#f1c40f', '#2ecc71', '#3498db', '#9b59b6'],
    postingFrequency: 'medium',
    audienceAge: [18, 35],
  },
};

const TIMEZONE_POSTING_MAP: Record<string, { peakHours: number[]; peakDays: string[] }> = {
  'America/New_York': { peakHours: [9, 12, 17, 20], peakDays: ['Tuesday', 'Wednesday', 'Thursday'] },
  'America/Los_Angeles': { peakHours: [10, 13, 18, 21], peakDays: ['Tuesday', 'Wednesday', 'Friday'] },
  'Europe/London': { peakHours: [8, 12, 18, 21], peakDays: ['Wednesday', 'Thursday', 'Friday'] },
  'Europe/Paris': { peakHours: [9, 13, 19, 21], peakDays: ['Tuesday', 'Thursday', 'Friday'] },
  'Asia/Tokyo': { peakHours: [7, 12, 19, 22], peakDays: ['Monday', 'Wednesday', 'Friday'] },
  'Australia/Sydney': { peakHours: [8, 12, 18, 20], peakDays: ['Tuesday', 'Wednesday', 'Thursday'] },
};

const PLATFORM_DATA: Record<string, { audienceAge: [number, number]; engagement: string; growth: number; effort: string }> = {
  'spotify': { audienceAge: [16, 45], engagement: 'high', growth: 0.85, effort: 'medium' },
  'apple_music': { audienceAge: [18, 50], engagement: 'medium', growth: 0.75, effort: 'low' },
  'youtube': { audienceAge: [13, 55], engagement: 'high', growth: 0.9, effort: 'high' },
  'tiktok': { audienceAge: [13, 30], engagement: 'very_high', growth: 0.95, effort: 'high' },
  'instagram': { audienceAge: [16, 40], engagement: 'high', growth: 0.8, effort: 'medium' },
  'soundcloud': { audienceAge: [16, 35], engagement: 'medium', growth: 0.6, effort: 'low' },
  'bandcamp': { audienceAge: [20, 45], engagement: 'low', growth: 0.5, effort: 'low' },
  'facebook': { audienceAge: [25, 55], engagement: 'medium', growth: 0.5, effort: 'medium' },
  'twitter': { audienceAge: [18, 45], engagement: 'medium', growth: 0.6, effort: 'medium' },
  'linkedin': { audienceAge: [25, 55], engagement: 'low', growth: 0.4, effort: 'low' },
};

class SmartDefaultsEngine {
  private readonly CACHE_PREFIX = 'smart:defaults:';
  private readonly CACHE_TTL = 1800;

  async getSmartDefaults(userId: string): Promise<SmartDefault[]> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis.get(`${this.CACHE_PREFIX}${userId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const defaults = await this.calculateSmartDefaults(userId);

      if (redis) {
        await redis.setEx(`${this.CACHE_PREFIX}${userId}`, this.CACHE_TTL, JSON.stringify(defaults));
      }

      return defaults;
    } catch (error) {
      logger.warn('Error getting smart defaults:', error);
      return [];
    }
  }

  private async calculateSmartDefaults(userId: string): Promise<SmartDefault[]> {
    const defaults: SmartDefault[] = [];
    const preferences = await userPreferencesService.getUserPreferences(userId);
    if (!preferences) return defaults;

    const genreTemplate = this.getGenreTemplate(preferences.genres[0] || 'pop');
    
    defaults.push({
      category: 'studio',
      key: 'defaultBPM',
      value: genreTemplate.defaultBPM,
      confidence: 0.85,
      reasoning: `Based on ${genreTemplate.genre} genre conventions`,
    });

    defaults.push({
      category: 'studio',
      key: 'defaultKey',
      value: genreTemplate.defaultKey,
      confidence: 0.8,
      reasoning: `Common key for ${genreTemplate.genre} music`,
    });

    defaults.push({
      category: 'content',
      key: 'postingFrequency',
      value: genreTemplate.postingFrequency,
      confidence: 0.75,
      reasoning: `Optimal frequency for ${genreTemplate.genre} audience engagement`,
    });

    defaults.push({
      category: 'branding',
      key: 'colorPalette',
      value: genreTemplate.colorPalette,
      confidence: 0.7,
      reasoning: `Colors associated with ${genreTemplate.genre} aesthetics`,
    });

    const careerStageDefaults = this.getCareerStageDefaults(preferences.careerStage);
    defaults.push(...careerStageDefaults);

    return defaults;
  }

  getGenreTemplate(genre: string): GenreTemplate {
    const normalizedGenre = genre.toLowerCase().replace(/\s+/g, '-');
    return GENRE_TEMPLATES[normalizedGenre] || GENRE_TEMPLATES['pop'];
  }

  getAllGenreTemplates(): GenreTemplate[] {
    return Object.values(GENRE_TEMPLATES);
  }

  private getCareerStageDefaults(stage: CareerStage): SmartDefault[] {
    const defaults: SmartDefault[] = [];

    switch (stage) {
      case 'emerging':
        defaults.push({
          category: 'strategy',
          key: 'focusArea',
          value: 'audience_building',
          confidence: 0.9,
          reasoning: 'Early-stage artists should focus on building their initial fanbase',
        });
        defaults.push({
          category: 'content',
          key: 'quantity_vs_quality',
          value: 'balanced',
          confidence: 0.85,
          reasoning: 'New artists benefit from consistent presence while developing quality',
        });
        break;
      case 'developing':
        defaults.push({
          category: 'strategy',
          key: 'focusArea',
          value: 'engagement_deepening',
          confidence: 0.85,
          reasoning: 'Growing artists should deepen connections with existing fans',
        });
        break;
      case 'established':
        defaults.push({
          category: 'strategy',
          key: 'focusArea',
          value: 'monetization',
          confidence: 0.85,
          reasoning: 'Established artists can focus on revenue optimization',
        });
        break;
      case 'professional':
        defaults.push({
          category: 'strategy',
          key: 'focusArea',
          value: 'scaling',
          confidence: 0.9,
          reasoning: 'Professional artists should focus on scaling operations',
        });
        break;
    }

    return defaults;
  }

  async getSchedulingSuggestions(userId: string): Promise<SchedulingSuggestion[]> {
    try {
      const preferences = await userPreferencesService.getUserPreferences(userId);
      if (!preferences) return [];

      const timezone = preferences.targetAudience.primaryTimezone || 'America/New_York';
      const timezoneData = TIMEZONE_POSTING_MAP[timezone] || TIMEZONE_POSTING_MAP['America/New_York'];
      const platforms = preferences.contentPreferences.platforms;

      const suggestions: SchedulingSuggestion[] = [];

      for (const platform of platforms.slice(0, 3)) {
        for (const day of timezoneData.peakDays) {
          const times = timezoneData.peakHours.slice(0, 2).map(h => `${h.toString().padStart(2, '0')}:00`);
          suggestions.push({
            day,
            times,
            platform,
            reason: `Peak engagement times for ${platform} in ${timezone}`,
            engagementScore: 0.75 + Math.random() * 0.2,
          });
        }
      }

      return suggestions.sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 10);
    } catch (error) {
      logger.warn('Error getting scheduling suggestions:', error);
      return [];
    }
  }

  async getDistributionRecommendations(userId: string): Promise<PlatformRecommendation[]> {
    try {
      const preferences = await userPreferencesService.getUserPreferences(userId);
      if (!preferences) return [];

      const genreTemplate = this.getGenreTemplate(preferences.genres[0] || 'pop');
      const audienceAge = preferences.targetAudience.ageRange;
      const recommendations: PlatformRecommendation[] = [];

      for (const [platform, data] of Object.entries(PLATFORM_DATA)) {
        const ageOverlap = this.calculateAgeOverlap(audienceAge, data.audienceAge);
        const isGenreSuggested = genreTemplate.suggestedPlatforms.includes(platform);
        const isCurrentlyUsed = preferences.contentPreferences.platforms.includes(platform);

        let priority: 'primary' | 'secondary' | 'emerging';
        if (isGenreSuggested && ageOverlap > 0.6) {
          priority = 'primary';
        } else if (ageOverlap > 0.4 || data.growth > 0.8) {
          priority = 'secondary';
        } else {
          priority = 'emerging';
        }

        let reason = '';
        if (isGenreSuggested) {
          reason = `Popular for ${genreTemplate.genre} artists`;
        } else if (data.growth > 0.85) {
          reason = 'High growth platform with emerging opportunities';
        } else {
          reason = `Matches your target audience age (${audienceAge[0]}-${audienceAge[1]})`;
        }

        recommendations.push({
          platform,
          priority,
          reason,
          audienceMatch: ageOverlap,
          growthPotential: data.growth,
          effort: data.effort as 'low' | 'medium' | 'high',
        });
      }

      return recommendations
        .sort((a, b) => {
          const priorityOrder = { primary: 3, secondary: 2, emerging: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority] || b.audienceMatch - a.audienceMatch;
        })
        .slice(0, 8);
    } catch (error) {
      logger.warn('Error getting distribution recommendations:', error);
      return [];
    }
  }

  async getInitialSettings(artistType: ArtistType, genres: string[], careerStage: CareerStage): Promise<Partial<UserPreferences>> {
    const basePreferences = userPreferencesService.getDefaultPreferences(artistType, careerStage);
    
    if (genres.length > 0) {
      const primaryGenre = genres[0];
      const template = this.getGenreTemplate(primaryGenre);
      
      basePreferences.genres = genres;
      basePreferences.studioPreferences.defaultBPM = template.defaultBPM;
      basePreferences.studioPreferences.defaultKey = template.defaultKey;
      basePreferences.contentPreferences.platforms = template.suggestedPlatforms;
      basePreferences.contentPreferences.contentTypes = template.contentStyle;
      basePreferences.targetAudience.ageRange = template.audienceAge;
    }

    return basePreferences;
  }

  private calculateAgeOverlap(range1: [number, number], range2: [number, number]): number {
    const start = Math.max(range1[0], range2[0]);
    const end = Math.min(range1[1], range2[1]);
    if (start >= end) return 0;
    
    const overlapSize = end - start;
    const range1Size = range1[1] - range1[0];
    const range2Size = range2[1] - range2[0];
    
    return overlapSize / Math.max(range1Size, range2Size);
  }
}

export const smartDefaultsEngine = new SmartDefaultsEngine();
