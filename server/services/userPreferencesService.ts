import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getRedisClient } from "../lib/redisConnectionFactory";
import { logger } from "../logger";

export type ArtistType =
  | "solo"
  | "band"
  | "producer"
  | "label"
  | "dj"
  | "songwriter";
export type CareerStage =
  | "emerging"
  | "developing"
  | "established"
  | "professional";
export type LayoutPreset = "compact" | "standard" | "detailed";

export interface DashboardWidget {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  size: "small" | "medium" | "large";
  column: number;
}

export interface DashboardLayout {
  preset: LayoutPreset;
  widgets: DashboardWidget[];
  customName?: string;
}

export interface UserPreferences {
  artistType: ArtistType;
  careerStage: CareerStage;
  genres: string[];
  primaryGoals: string[];
  targetAudience: {
    ageRange: [number, number];
    regions: string[];
    primaryTimezone: string;
  };
  contentPreferences: {
    preferredPostingTimes: string[];
    contentTypes: string[];
    platforms: string[];
  };
  studioPreferences: {
    defaultBPM: number;
    defaultKey: string;
    autoSave: boolean;
    defaultSampleRate: number;
  };
  dashboardLayout: DashboardLayout;
  notificationPreferences: {
    email: boolean;
    push: boolean;
    inApp: boolean;
    frequency: "realtime" | "daily" | "weekly";
  };
  aiAssistantLevel: "minimal" | "moderate" | "aggressive";
  betaFeatures: boolean;
}

export interface BehaviorEvent {
  eventType: string;
  context: Record<string, any>;
  timestamp: Date;
}

export interface PreferenceRecommendation {
  category: string;
  recommendation: string;
  reason: string;
  priority: "high" | "medium" | "low";
  actionable: boolean;
  suggestedValue?: Record<string, unknown>;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: "overview",
    name: "Overview Stats",
    visible: true,
    order: 0,
    size: "large",
    column: 0,
  },
  {
    id: "revenue",
    name: "Revenue",
    visible: true,
    order: 1,
    size: "medium",
    column: 0,
  },
  {
    id: "analytics",
    name: "Analytics",
    visible: true,
    order: 2,
    size: "medium",
    column: 1,
  },
  {
    id: "releases",
    name: "Upcoming Releases",
    visible: true,
    order: 3,
    size: "small",
    column: 1,
  },
  {
    id: "social",
    name: "Social Media",
    visible: true,
    order: 4,
    size: "medium",
    column: 0,
  },
  {
    id: "ai-coach",
    name: "AI Career Coach",
    visible: true,
    order: 5,
    size: "medium",
    column: 1,
  },
  {
    id: "collaborators",
    name: "Collaborators",
    visible: true,
    order: 6,
    size: "small",
    column: 0,
  },
  {
    id: "achievements",
    name: "Achievements",
    visible: true,
    order: 7,
    size: "small",
    column: 1,
  },
  {
    id: "quick-actions",
    name: "Quick Actions",
    visible: true,
    order: 8,
    size: "small",
    column: 0,
  },
  {
    id: "tips",
    name: "Tips & Guidance",
    visible: true,
    order: 9,
    size: "small",
    column: 1,
  },
];

const ARTIST_TYPE_DEFAULTS: Record<ArtistType, Partial<UserPreferences>> = {
  solo: {
    primaryGoals: ["grow_fanbase", "increase_streams", "build_brand"],
    contentPreferences: {
      preferredPostingTimes: ["18:00", "12:00", "20:00"],
      contentTypes: ["behind_the_scenes", "music_releases", "personal_stories"],
      platforms: ["instagram", "tiktok", "spotify"],
    },
    aiAssistantLevel: "moderate",
  },
  band: {
    primaryGoals: ["book_shows", "grow_fanbase", "sell_merch"],
    contentPreferences: {
      preferredPostingTimes: ["19:00", "14:00", "21:00"],
      contentTypes: ["live_performances", "band_updates", "music_releases"],
      platforms: ["instagram", "youtube", "facebook"],
    },
    aiAssistantLevel: "moderate",
  },
  producer: {
    primaryGoals: ["sell_beats", "collaborate", "build_catalog"],
    contentPreferences: {
      preferredPostingTimes: ["15:00", "21:00", "10:00"],
      contentTypes: ["beat_previews", "production_tips", "studio_sessions"],
      platforms: ["youtube", "instagram", "beatstars"],
    },
    aiAssistantLevel: "aggressive",
  },
  label: {
    primaryGoals: ["sign_artists", "maximize_revenue", "build_roster"],
    contentPreferences: {
      preferredPostingTimes: ["12:00", "18:00", "09:00"],
      contentTypes: ["artist_spotlights", "new_releases", "industry_news"],
      platforms: ["instagram", "twitter", "linkedin"],
    },
    aiAssistantLevel: "minimal",
  },
  dj: {
    primaryGoals: ["book_gigs", "grow_fanbase", "release_mixes"],
    contentPreferences: {
      preferredPostingTimes: ["22:00", "16:00", "20:00"],
      contentTypes: ["set_previews", "event_promos", "music_selections"],
      platforms: ["instagram", "soundcloud", "mixcloud"],
    },
    aiAssistantLevel: "moderate",
  },
  songwriter: {
    primaryGoals: ["get_placements", "collaborate", "build_portfolio"],
    contentPreferences: {
      preferredPostingTimes: ["11:00", "15:00", "19:00"],
      contentTypes: ["songwriting_process", "demos", "collaboration_calls"],
      platforms: ["instagram", "twitter", "linkedin"],
    },
    aiAssistantLevel: "moderate",
  },
};

const CAREER_STAGE_MODIFIERS: Record<CareerStage, Partial<UserPreferences>> = {
  emerging: {
    primaryGoals: ["grow_fanbase", "learn_marketing", "first_release"],
    aiAssistantLevel: "aggressive",
    dashboardLayout: { preset: "detailed", widgets: DEFAULT_WIDGETS },
  },
  developing: {
    primaryGoals: ["consistent_releases", "grow_streams", "build_email_list"],
    aiAssistantLevel: "moderate",
    dashboardLayout: { preset: "standard", widgets: DEFAULT_WIDGETS },
  },
  established: {
    primaryGoals: [
      "maximize_revenue",
      "expand_audience",
      "strategic_partnerships",
    ],
    aiAssistantLevel: "moderate",
    dashboardLayout: { preset: "standard", widgets: DEFAULT_WIDGETS },
  },
  professional: {
    primaryGoals: ["scale_operations", "team_management", "major_placements"],
    aiAssistantLevel: "minimal",
    dashboardLayout: { preset: "compact", widgets: DEFAULT_WIDGETS },
  },
};

class UserPreferencesService {
  private readonly CACHE_PREFIX = "user:preferences:";
  private readonly CACHE_TTL = 3600;
  private readonly BEHAVIOR_PREFIX = "user:behavior:";

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis?.get(`${this.CACHE_PREFIX}${userId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users?.id, userId))
        .limit(1);
      if (!user) return null;

      const preferences =
        (user?.preferences as UserPreferences) ||
        this.getDefaultPreferences("solo", "emerging");

      if (redis) {
        await redis?.setEx(
          `${this.CACHE_PREFIX}${userId}`,
          this.CACHE_TTL,
          JSON.stringify(preferences),
        );
      }

      return preferences;
    } catch (error) {
      logger.warn({ err: error }, "Error getting user preferences:");
      return this.getDefaultPreferences("solo", "emerging");
    }
  }

  async updateUserPreferences(
    userId: string,
    updates: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    try {
      const current =
        (await this.getUserPreferences(userId)) ||
        this.getDefaultPreferences("solo", "emerging");
      const updated = this.deepMerge(current, updates);

      await db
        .update(users)
        .set({ preferences: updated as Record<string, unknown> })
        .where(eq(users?.id, userId));

      const redis = await getRedisClient();
      if (redis) {
        await redis?.setEx(
          `${this.CACHE_PREFIX}${userId}`,
          this.CACHE_TTL,
          JSON.stringify(updated),
        );
      }

      return updated;
    } catch (error) {
      logger.warn({ err: error }, "Error updating user preferences:");
      throw error;
    }
  }

  getDefaultPreferences(
    artistType: ArtistType,
    careerStage: CareerStage,
  ): UserPreferences {
    const baseDefaults: UserPreferences = {
      artistType,
      careerStage,
      genres: [],
      primaryGoals: [],
      targetAudience: {
        ageRange: [18, 35],
        regions: ["US", "UK", "CA"],
        primaryTimezone: "America/New_York",
      },
      contentPreferences: {
        preferredPostingTimes: ["12:00", "18:00", "21:00"],
        contentTypes: ["music_releases", "behind_the_scenes"],
        platforms: ["instagram", "spotify"],
      },
      studioPreferences: {
        defaultBPM: 120,
        defaultKey: "C",
        autoSave: true,
        defaultSampleRate: 44100,
      },
      dashboardLayout: {
        preset: "standard",
        widgets: [...DEFAULT_WIDGETS],
      },
      notificationPreferences: {
        email: true,
        push: true,
        inApp: true,
        frequency: "daily",
      },
      aiAssistantLevel: "moderate",
      betaFeatures: false,
    };

    const artistDefaults = ARTIST_TYPE_DEFAULTS[artistType] || {};
    const stageModifiers = CAREER_STAGE_MODIFIERS[careerStage] || {};

    return this.deepMerge(
      this.deepMerge(baseDefaults, artistDefaults),
      stageModifiers,
    );
  }

  async recordBehaviorEvent(
    userId: string,
    event: BehaviorEvent,
  ): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      const key = `${this.BEHAVIOR_PREFIX}${userId}:${event?.eventType}`;
      const eventData = JSON.stringify({ ...event, timestamp: new Date() });

      await redis?.lPush(key, eventData);
      await redis?.lTrim(key, 0, 99);
      await redis?.expire(key, 86400 * 30);
    } catch (error) {
      logger.warn({ err: error }, "Error recording behavior event:");
    }
  }

  async learnFromBehavior(userId: string): Promise<PreferenceRecommendation[]> {
    try {
      const redis = await getRedisClient();
      if (!redis) return [];

      const recommendations: PreferenceRecommendation[] = [];
      const preferences = await this.getUserPreferences(userId);
      if (!preferences) return [];

      const featureUsage = await this.analyzeFeatureUsage(userId, redis);
      const timePatterns = await this.analyzeTimePatterns(userId, redis);
      const contentPatterns = await this.analyzeContentPatterns(userId, redis);

      if (
        featureUsage?.studioUsage > 0.7 &&
        preferences?.studioPreferences.autoSave === false
      ) {
        recommendations?.push({
          category: "studio",
          recommendation: "Enable auto-save for your studio projects",
          reason:
            "You use the studio frequently - auto-save will protect your work",
          priority: "high",
          actionable: true,
          suggestedValue: { autoSave: true },
        });
      }

      if (
        timePatterns?.peakHour &&
        !preferences?.contentPreferences.preferredPostingTimes?.includes(
          `${timePatterns?.peakHour}:00`,
        )
      ) {
        recommendations?.push({
          category: "content",
          recommendation: `Consider posting around ${timePatterns?.peakHour}:00`,
          reason: "This aligns with when your content gets the most engagement",
          priority: "medium",
          actionable: true,
          suggestedValue: {
            preferredPostingTimes: [
              `${timePatterns?.peakHour}:00`,
              ...preferences?.contentPreferences.preferredPostingTimes?.slice(
                0,
                2,
              ),
            ],
          },
        });
      }

      if (
        contentPatterns?.topContentType &&
        !preferences?.contentPreferences.contentTypes?.includes(
          contentPatterns?.topContentType,
        )
      ) {
        recommendations?.push({
          category: "content",
          recommendation: `Add "${contentPatterns.topContentType}" to your content types`,
          reason: "This content type performs well based on your activity",
          priority: "medium",
          actionable: true,
          suggestedValue: {
            contentTypes: [
              ...preferences?.contentPreferences.contentTypes,
              contentPatterns?.topContentType,
            ],
          },
        });
      }

      if (
        featureUsage?.aiUsage < 0.2 &&
        preferences?.aiAssistantLevel !== "minimal"
      ) {
        recommendations?.push({
          category: "ai",
          recommendation: "Consider trying our AI assistant features",
          reason:
            "You haven't fully explored AI tools that could save you time",
          priority: "low",
          actionable: false,
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ err: error }, "Error learning from behavior:");
      return [];
    }
  }

  async getPreferenceRecommendations(
    userId: string,
  ): Promise<PreferenceRecommendation[]> {
    const behaviorRecommendations = await this.learnFromBehavior(userId);
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) return behaviorRecommendations;

    const generalRecommendations: PreferenceRecommendation[] = [];

    if (preferences?.genres.length === 0) {
      generalRecommendations?.push({
        category: "profile",
        recommendation: "Add your primary genres to get better recommendations",
        reason: "Genre information helps us tailor content suggestions",
        priority: "high",
        actionable: true,
      });
    }

    if (preferences?.targetAudience.regions?.length === 0) {
      generalRecommendations?.push({
        category: "audience",
        recommendation: "Define your target audience regions",
        reason: "This helps optimize posting times and distribution",
        priority: "medium",
        actionable: true,
      });
    }

    if (
      preferences?.dashboardLayout.widgets?.filter((w) => w?.visible).length < 3
    ) {
      generalRecommendations?.push({
        category: "dashboard",
        recommendation: "Enable more dashboard widgets for a complete overview",
        reason: "More widgets help you track important metrics",
        priority: "low",
        actionable: true,
      });
    }

    return [...generalRecommendations, ...behaviorRecommendations];
  }

  async saveDashboardLayout(
    userId: string,
    layout: DashboardLayout,
  ): Promise<void> {
    await this.updateUserPreferences(userId, { dashboardLayout: layout });
  }

  async getDashboardLayout(userId: string): Promise<DashboardLayout> {
    const preferences = await this.getUserPreferences(userId);
    return (
      preferences?.dashboardLayout || {
        preset: "standard",
        widgets: [...DEFAULT_WIDGETS],
      }
    );
  }

  private async analyzeFeatureUsage(
    userId: string,
    redis: Record<string, unknown>,
  ): Promise<{ studioUsage: number; aiUsage: number; socialUsage: number }> {
    const studioEvents =
      (await redis?.lLen(`${this.BEHAVIOR_PREFIX}${userId}:studio_action`)) || 0;
    const aiEvents =
      (await redis?.lLen(`${this.BEHAVIOR_PREFIX}${userId}:ai_action`)) || 0;
    const socialEvents =
      (await redis?.lLen(`${this.BEHAVIOR_PREFIX}${userId}:social_action`)) || 0;
    const total = studioEvents + aiEvents + socialEvents || 1;

    return {
      studioUsage: studioEvents / total,
      aiUsage: aiEvents / total,
      socialUsage: socialEvents / total,
    };
  }

  private async analyzeTimePatterns(
    userId: string,
    redis: Record<string, unknown>,
  ): Promise<{ peakHour: number | null }> {
    const events = await redis?.lRange(
      `${this.BEHAVIOR_PREFIX}${userId}:login`,
      0,
      -1,
    );
    if (!events || events?.length === 0) return { peakHour: null };

    const hourCounts: Record<number, number> = {};
    for (const eventStr of events) {
      try {
        const event = JSON.parse(eventStr);
        const hour = new Date(event?.timestamp).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch {
        /* intentional: malformed event string → skipped */
      }
    }

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    return { peakHour: peakHour ? parseInt(peakHour[0]) : null };
  }

  private async analyzeContentPatterns(
    userId: string,
    redis: Record<string, unknown>,
  ): Promise<{ topContentType: string | null }> {
    const events = await redis?.lRange(
      `${this.BEHAVIOR_PREFIX}${userId}:content_create`,
      0,
      -1,
    );
    if (!events || events?.length === 0) return { topContentType: null };

    const typeCounts: Record<string, number> = {};
    for (const eventStr of events) {
      try {
        const event = JSON.parse(eventStr);
        if (event?.context?.contentType) {
          typeCounts[event.context.contentType] =
            (typeCounts[event?.context.contentType] || 0) + 1;
        }
      } catch {
        /* intentional: malformed event string → skipped */
      }
    }

    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    return { topContentType: topType ? topType[0] : null };
  }

  private deepMerge<T extends Record<string, any>>(
    target: T,
    source: Partial<T>,
  ): T {
    const output = { ...target };
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        output[key] = this.deepMerge(
          target[key] || {},
          source[key] as Record<string, unknown>,
        );
      } else if (source[key] !== undefined) {
        output[key] = source[key] as Record<string, unknown>;
      }
    }
    return output;
  }
}

export const userPreferencesService = new UserPreferencesService();
