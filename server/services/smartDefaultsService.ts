import { db } from "../db";
import { storage } from "../storage";
import { eq, desc, and, gte } from "drizzle-orm";
import { analytics, projects } from "../../shared/schema";

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

export interface RecommendedSettings {
  distribution: {
    primaryPlatforms: string[];
    releaseStrategy: "single" | "ep" | "album";
    preSaveEnabled: boolean;
    contentIdEnabled: boolean;
  };
  social: {
    suggestedPlatforms: string[];
    postingFrequency: "daily" | "3-per-week" | "weekly";
    contentTypes: string[];
    engagementStrategy: string;
  };
  studio: {
    defaultBPM: number;
    defaultKey: string;
    suggestedGenres: string[];
    collaborationMode: boolean;
  };
  marketing: {
    budgetRange: [number, number];
    targetAudience: string[];
    campaignTypes: string[];
  };
  dashboard: {
    priorityWidgets: string[];
    hiddenFeatures: string[];
    quickActions: string[];
  };
}

export interface UserBehaviorAnalysis {
  mostUsedFeatures: { feature: string; count: number; lastUsed: Date }[];
  preferredWorkingHours: { hour: number; activityLevel: number }[];
  contentPatterns: {
    avgTracksPerMonth: number;
    preferredGenres: string[];
    avgProjectDuration: number;
  };
  engagementMetrics: {
    loginFrequency: "daily" | "weekly" | "occasional";
    sessionDuration: number;
    completionRate: number;
  };
  growthTrends: {
    followerGrowthRate: number;
    revenueGrowthRate: number;
    streamGrowthRate: number;
  };
}

export interface OptimalSchedule {
  posting: {
    platform: string;
    bestDays: string[];
    bestTimes: string[];
    frequency: string;
    audienceActivity: number;
  }[];
  releases: {
    optimalDay: string;
    optimalTime: string;
    avoidDates: string[];
    reasoning: string;
  };
  engagement: {
    peakHours: number[];
    suggestedResponseTime: string;
    liveEventTimes: string[];
  };
}

export interface ActionSuggestion {
  id: string;
  type:
    | "distribution"
    | "social"
    | "marketing"
    | "studio"
    | "analytics"
    | "setup";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
  actionUrl?: string;
  icon: string;
  timeEstimate: string;
  deadline?: Date;
  context?: Record<string, any>;
}

export interface DashboardLayout {
  widgets: {
    id: string;
    position: number;
    visible: boolean;
    size: "small" | "medium" | "large";
  }[];
  quickActions: string[];
  hiddenFeatures: string[];
  theme: "compact" | "standard" | "expanded";
}

export interface PersonalizationPreferences {
  artistType: ArtistType;
  careerStage: CareerStage;
  primaryGenres: string[];
  goals: string[];
  dashboardLayout: DashboardLayout;
  featurePreferences: Record<string, boolean>;
}

class SmartDefaultsService {
  private artistTypeSettings: Record<ArtistType, Partial<RecommendedSettings>> =
    {
      solo: {
        distribution: {
          primaryPlatforms: ["spotify", "apple-music", "youtube-music"],
          releaseStrategy: "single",
          preSaveEnabled: true,
          contentIdEnabled: true,
        },
        social: {
          suggestedPlatforms: ["instagram", "tiktok", "twitter"],
          postingFrequency: "daily",
          contentTypes: [
            "behind-the-scenes",
            "music-clips",
            "personal-updates",
          ],
          engagementStrategy: "personal-connection",
        },
        dashboard: {
          priorityWidgets: [
            "streams",
            "social-reach",
            "next-release",
            "ai-coach",
          ],
          quickActions: ["upload-track", "schedule-post", "view-analytics"],
          hiddenFeatures: [],
        },
      },
      band: {
        distribution: {
          primaryPlatforms: ["spotify", "apple-music", "bandcamp", "youtube"],
          releaseStrategy: "ep",
          preSaveEnabled: true,
          contentIdEnabled: true,
        },
        social: {
          suggestedPlatforms: ["instagram", "facebook", "youtube", "tiktok"],
          postingFrequency: "3-per-week",
          contentTypes: [
            "rehearsal-clips",
            "live-performances",
            "member-spotlights",
          ],
          engagementStrategy: "community-building",
        },
        dashboard: {
          priorityWidgets: [
            "collaboration",
            "tour-dates",
            "merch-sales",
            "streams",
          ],
          quickActions: [
            "share-with-band",
            "schedule-rehearsal",
            "upload-track",
          ],
          hiddenFeatures: [],
        },
      },
      producer: {
        distribution: {
          primaryPlatforms: ["spotify", "beatport", "soundcloud", "bandcamp"],
          releaseStrategy: "single",
          preSaveEnabled: false,
          contentIdEnabled: true,
        },
        social: {
          suggestedPlatforms: ["instagram", "twitter", "youtube"],
          postingFrequency: "3-per-week",
          contentTypes: ["production-tips", "beat-previews", "studio-sessions"],
          engagementStrategy: "educational",
        },
        dashboard: {
          priorityWidgets: [
            "beat-sales",
            "licensing",
            "studio",
            "collaborations",
          ],
          quickActions: ["create-beat", "list-on-marketplace", "view-sales"],
          hiddenFeatures: ["tour-dates"],
        },
      },
      label: {
        distribution: {
          primaryPlatforms: [
            "spotify",
            "apple-music",
            "youtube-music",
            "deezer",
            "tidal",
          ],
          releaseStrategy: "album",
          preSaveEnabled: true,
          contentIdEnabled: true,
        },
        social: {
          suggestedPlatforms: ["instagram", "twitter", "facebook", "linkedin"],
          postingFrequency: "daily",
          contentTypes: [
            "artist-spotlights",
            "release-announcements",
            "industry-news",
          ],
          engagementStrategy: "brand-authority",
        },
        dashboard: {
          priorityWidgets: [
            "roster-overview",
            "revenue",
            "distribution-status",
            "contracts",
          ],
          quickActions: ["add-artist", "schedule-release", "view-royalties"],
          hiddenFeatures: ["studio"],
        },
      },
      dj: {
        distribution: {
          primaryPlatforms: ["spotify", "soundcloud", "beatport", "mixcloud"],
          releaseStrategy: "single",
          preSaveEnabled: true,
          contentIdEnabled: false,
        },
        social: {
          suggestedPlatforms: ["instagram", "tiktok", "twitter", "twitch"],
          postingFrequency: "daily",
          contentTypes: ["set-clips", "event-promos", "track-ids"],
          engagementStrategy: "event-driven",
        },
        dashboard: {
          priorityWidgets: [
            "upcoming-gigs",
            "track-library",
            "social-reach",
            "booking-requests",
          ],
          quickActions: ["upload-mix", "promote-event", "browse-tracks"],
          hiddenFeatures: ["contracts", "roster"],
        },
      },
      songwriter: {
        distribution: {
          primaryPlatforms: ["spotify", "apple-music", "youtube"],
          releaseStrategy: "single",
          preSaveEnabled: true,
          contentIdEnabled: true,
        },
        social: {
          suggestedPlatforms: ["instagram", "tiktok", "youtube"],
          postingFrequency: "3-per-week",
          contentTypes: [
            "songwriting-process",
            "acoustic-versions",
            "lyrics-breakdown",
          ],
          engagementStrategy: "storytelling",
        },
        dashboard: {
          priorityWidgets: [
            "royalties",
            "sync-opportunities",
            "collaborations",
            "publishing",
          ],
          quickActions: [
            "submit-to-sync",
            "track-royalties",
            "find-collaborators",
          ],
          hiddenFeatures: ["beat-marketplace"],
        },
      },
    };

  private careerStageMultipliers: Record<
    CareerStage,
    { budget: number; complexity: number }
  > = {
    emerging: { budget: 1, complexity: 0.5 },
    developing: { budget: 2, complexity: 0.75 },
    established: { budget: 4, complexity: 1 },
    professional: { budget: 8, complexity: 1.25 },
  };

  async getRecommendedSettings(
    userId: string,
    artistType: ArtistType,
  ): Promise<RecommendedSettings> {
    const user = await storage?.getUser(userId);
    const onboardingData = (user?.onboardingData as Record<string, any>) || {};
    const careerStage =
      (onboardingData?.careerStage as CareerStage) || "emerging";
    const genres = (onboardingData?.genres as string[]) || ["pop"];

    const baseSettings =
      this?.artistTypeSettings[artistType] || this?.artistTypeSettings.solo;
    const stageMultiplier = this?.careerStageMultipliers[careerStage];

    const genreSettings = this?.getGenreSpecificSettings(genres[0] || "pop");

    return {
      distribution: {
        primaryPlatforms: baseSettings.distribution?.primaryPlatforms || [
          "spotify",
          "apple-music",
        ],
        releaseStrategy: baseSettings.distribution?.releaseStrategy || "single",
        preSaveEnabled: baseSettings.distribution?.preSaveEnabled ?? true,
        contentIdEnabled: baseSettings.distribution?.contentIdEnabled ?? true,
      },
      social: {
        suggestedPlatforms: baseSettings.social?.suggestedPlatforms || [
          "instagram",
          "tiktok",
        ],
        postingFrequency: baseSettings.social?.postingFrequency || "daily",
        contentTypes: baseSettings.social?.contentTypes || ["music-clips"],
        engagementStrategy:
          baseSettings?.social?.engagementStrategy || "personal-connection",
      },
      studio: {
        defaultBPM: genreSettings.bpm,
        defaultKey: genreSettings.key,
        suggestedGenres: genres,
        collaborationMode: artistType === "band" || artistType === "label",
      },
      marketing: {
        budgetRange: [
          50 * stageMultiplier?.budget,
          500 * stageMultiplier?.budget,
        ],
        targetAudience: this.getTargetAudienceByGenre(genres),
        campaignTypes: this.getCampaignTypesByStage(careerStage),
      },
      dashboard: {
        priorityWidgets: baseSettings.dashboard?.priorityWidgets || [
          "streams",
          "revenue",
        ],
        hiddenFeatures: baseSettings.dashboard?.hiddenFeatures || [],
        quickActions: baseSettings.dashboard?.quickActions || ["upload-track"],
      },
    };
  }

  async analyzeUserBehavior(userId: string): Promise<UserBehaviorAnalysis> {
    const user = await storage?.getUser(userId);
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects?.userId, userId))
      .limit(50);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

    const recentAnalytics = await db
      .select()
      .from(analytics)
      .where(
        and(eq(analytics?.userId, userId), gte(analytics?.date, thirtyDaysAgo)),
      )
      .orderBy(desc(analytics?.date))
      .limit(30);

    const preferences = (user?.preferences as Record<string, any>) || {};
    const featureUsage =
      (preferences?.featureUsage as Record<string, number>) || {};
    const sessionData = (preferences?.sessionData as Record<string, any>) || {};

    const mostUsedFeatures = Object?.entries(featureUsage)
      .map(([feature, count]) => ({
        feature,
        count: count as number,
        lastUsed: new Date(),
      }))
      .sort((a, b) => b?.count - a?.count)
      .slice(0, 10);

    const genreCounts: Record<string, number> = {};
    userProjects?.forEach((p) => {
      if (p?.genre) {
        genreCounts[p.genre] = (genreCounts[p?.genre] || 0) + 1;
      }
    });

    const preferredGenres = Object?.entries(genreCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([genre]) => genre);

    recentAnalytics?.reduce(
      (sum, a) => sum + (a?.streams || 0),
      0,
    );
    recentAnalytics?.reduce(
      (sum, a) => sum + (a?.revenue || 0),
      0,
    );
    recentAnalytics?.reduce(
      (sum, a) => sum + (a?.followers || 0),
      0,
    );

    return {
      mostUsedFeatures,
      preferredWorkingHours: this.generatePreferredHours(sessionData),
      contentPatterns: {
        avgTracksPerMonth:
          userProjects?.length / Math?.max(1, this?.getAccountAgeMonths(user)),
        preferredGenres,
        avgProjectDuration: 14,
      },
      engagementMetrics: {
        loginFrequency: this.calculateLoginFrequency(sessionData),
        sessionDuration: sessionData.avgDuration || 15,
        completionRate: sessionData.completionRate || 0.6,
      },
      growthTrends: {
        followerGrowthRate: this.calculateGrowthRate(
          recentAnalytics,
          "followers",
        ),
        revenueGrowthRate: this.calculateGrowthRate(recentAnalytics, "revenue"),
        streamGrowthRate: this.calculateGrowthRate(recentAnalytics, "streams"),
      },
    };
  }

  async predictOptimalSchedule(userId: string): Promise<OptimalSchedule> {
    const behavior = await this?.analyzeUserBehavior(userId);
    const user = await storage?.getUser(userId);
    const onboardingData = (user?.onboardingData as Record<string, any>) || {};
    const artistType = (onboardingData?.artistType as ArtistType) || "solo";
    const genres = (onboardingData?.genres as string[]) || ["pop"];

    const platformSchedules = this?.getPlatformOptimalTimes(artistType, genres);

    return {
      posting: platformSchedules,
      releases: {
        optimalDay: "Friday",
        optimalTime: "00:00 UTC",
        avoidDates: this.getAvoidDates(),
        reasoning:
          "Friday releases align with New Music Friday playlists on major platforms.",
      },
      engagement: {
        peakHours: behavior.preferredWorkingHours
          .filter((h) => h?.activityLevel > 0.7)
          .map((h) => h?.hour),
        suggestedResponseTime: "< 2 hours",
        liveEventTimes: ["8:00 PM", "9:00 PM"],
      },
    };
  }

  async getSuggestions(userId: string): Promise<ActionSuggestion[]> {
    const user = await storage?.getUser(userId);
    const behavior = await this?.analyzeUserBehavior(userId);
    const onboardingData = (user?.onboardingData as Record<string, any>) || {};
    const careerStage =
      (onboardingData?.careerStage as CareerStage) || "emerging";
    const artistType = (onboardingData?.artistType as ArtistType) || "solo";

    const suggestions: ActionSuggestion[] = [];

    if (!onboardingData?.hasDistributed) {
      suggestions?.push({
        id: "first-distribution",
        type: "distribution",
        priority: "high",
        title: "Distribute Your First Track",
        description:
          "Get your music on Spotify, Apple Music, and 150+ platforms",
        action: "Start Distribution",
        actionUrl: "/distribution",
        icon: "upload",
        timeEstimate: "15 min",
      });
    }

    if (!onboardingData?.hasConnectedSocial) {
      suggestions?.push({
        id: "connect-social",
        type: "social",
        priority: "high",
        title: "Connect Your Social Accounts",
        description:
          "Link Instagram, TikTok, and Twitter to manage all platforms from one place",
        action: "Connect Accounts",
        actionUrl: "/settings?tab=connected-accounts",
        icon: "link",
        timeEstimate: "5 min",
      });
    }

    if (behavior?.mostUsedFeatures.length < 3) {
      suggestions?.push({
        id: "explore-features",
        type: "setup",
        priority: "medium",
        title: "Explore Key Features",
        description: "Discover AI-powered tools for your music career",
        action: "Start Tour",
        actionUrl: "/dashboard?tour=true",
        icon: "compass",
        timeEstimate: "10 min",
      });
    }

    suggestions?.push(
      ...this?.getCareerStageSuggestions(careerStage, artistType),
    );

    if (behavior?.growthTrends.streamGrowthRate < 0) {
      suggestions?.push({
        id: "boost-streams",
        type: "marketing",
        priority: "medium",
        title: "Boost Your Streams",
        description:
          "Your streaming numbers are declining. Launch a promotional campaign.",
        action: "Create Campaign",
        actionUrl: "/advertising",
        icon: "trending-up",
        timeEstimate: "20 min",
      });
    }

    return suggestions?.slice(0, 6);
  }

  async getDashboardLayout(userId: string): Promise<DashboardLayout> {
    const user = await storage?.getUser(userId);
    const preferences = (user?.preferences as Record<string, any>) || {};
    const onboardingData = (user?.onboardingData as Record<string, any>) || {};
    const artistType = (onboardingData?.artistType as ArtistType) || "solo";

    const savedLayout = preferences?.dashboardLayout as
      | DashboardLayout
      | undefined;
    if (savedLayout) {
      return savedLayout;
    }

    const behavior = await this?.analyzeUserBehavior(userId);
    const settings = await this?.getRecommendedSettings(userId, artistType);

    const allWidgets = [
      "streams",
      "revenue",
      "social-reach",
      "next-release",
      "ai-coach",
      "quick-actions",
      "recent-activity",
      "analytics-chart",
      "collaborations",
      "notifications",
      "achievements",
      "goals",
    ];

    const priorityWidgets = settings?.dashboard.priorityWidgets;
    const hiddenFeatures = settings?.dashboard.hiddenFeatures;
    const frequentlyUsed = behavior?.mostUsedFeatures.map((f) => f?.feature);

    const widgets = allWidgets
      .map((id, index) => ({
        id,
        position: priorityWidgets.includes(id)
          ? priorityWidgets?.indexOf(id)
          : index + 100,
        visible: !hiddenFeatures?.includes(id),
        size: priorityWidgets.includes(id)
          ? ("large" as const)
          : frequentlyUsed?.includes(id)
            ? ("medium" as const)
            : ("small" as const),
      }))
      .sort((a, b) => a?.position - b?.position);

    return {
      widgets,
      quickActions: settings.dashboard.quickActions,
      hiddenFeatures: settings.dashboard.hiddenFeatures,
      theme: "standard",
    };
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<PersonalizationPreferences>,
  ): Promise<void> {
    const user = await storage?.getUser(userId);
    const currentPrefs = (user?.preferences as Record<string, any>) || {};

    await storage?.updateUser(userId, {
      preferences: {
        ...currentPrefs,
        personalization: preferences,
        dashboardLayout:
          preferences?.dashboardLayout || currentPrefs?.dashboardLayout,
      },
    });
  }

  async trackFeatureUsage(userId: string, feature: string): Promise<void> {
    const user = await storage?.getUser(userId);
    const preferences = (user?.preferences as Record<string, any>) || {};
    const featureUsage =
      (preferences?.featureUsage as Record<string, number>) || {};

    featureUsage[feature] = (featureUsage[feature] || 0) + 1;

    await storage?.updateUser(userId, {
      preferences: {
        ...preferences,
        featureUsage,
        lastFeatureUsed: feature,
        lastActiveAt: new Date().toISOString(),
      },
    });
  }

  private getGenreSpecificSettings(genre: string): {
    bpm: number;
    key: string;
  } {
    const genreSettings: Record<string, { bpm: number; key: string }> = {
      pop: { bpm: 120, key: "C" },
      "hip-hop": { bpm: 90, key: "G minor" },
      edm: { bpm: 128, key: "A minor" },
      rock: { bpm: 130, key: "E" },
      rnb: { bpm: 85, key: "D minor" },
      jazz: { bpm: 100, key: "Bb" },
      classical: { bpm: 72, key: "C" },
      country: { bpm: 115, key: "G" },
      latin: { bpm: 100, key: "A minor" },
      electronic: { bpm: 125, key: "F minor" },
    };
    return genreSettings[genre?.toLowerCase()] || genreSettings?.pop;
  }

  private getTargetAudienceByGenre(genres: string[]): string[] {
    const audienceMap: Record<string, string[]> = {
      pop: ["18-34", "mainstream", "playlist-listeners"],
      "hip-hop": ["16-30", "urban", "social-media-active"],
      edm: ["18-28", "festival-goers", "streaming-heavy"],
      rock: ["25-45", "album-buyers", "concert-goers"],
      indie: ["20-35", "discovery-oriented", "vinyl-collectors"],
    };
    const audiences = new Set<string>();
    genres?.forEach((g) => {
      (audienceMap[g?.toLowerCase()] || audienceMap?.pop).forEach((a) =>
        audiences?.add(a),
      );
    });
    return Array?.from(audiences);
  }

  private getCampaignTypesByStage(stage: CareerStage): string[] {
    const campaigns: Record<CareerStage, string[]> = {
      emerging: ["playlist-pitching", "social-ads", "influencer-outreach"],
      developing: [
        "playlist-pitching",
        "social-ads",
        "pr-campaign",
        "blog-outreach",
      ],
      established: [
        "radio-promotion",
        "tour-support",
        "sync-licensing",
        "brand-partnerships",
      ],
      professional: [
        "global-campaigns",
        "major-label-partnerships",
        "arena-tours",
        "merchandise",
      ],
    };
    return campaigns[stage];
  }

  private getAccountAgeMonths(user: Record<string, unknown>): number {
    if (!user?.createdAt) return 1;
    const created = new Date(user?.createdAt);
    const now = new Date();
    return Math?.max(
      1,
      Math?.floor(
        (now?.getTime() - created?.getTime()) / (30 * 24 * 60 * 60 * 1000),
      ),
    );
  }

  private calculateLoginFrequency(
    sessionData: Record<string, any>,
  ): "daily" | "weekly" | "occasional" {
    const loginCount = sessionData?.loginCount || 0;
    const daysSinceCreation = sessionData?.daysSinceCreation || 30;
    const avgLogins = loginCount / Math?.max(1, daysSinceCreation);

    if (avgLogins >= 0.8) return "daily";
    if (avgLogins >= 0.3) return "weekly";
    return "occasional";
  }

  private calculateGrowthRate(analyticsData: unknown[], field: string): number {
    if (analyticsData?.length < 2) return 0;
    const recent = analyticsData?.slice(0, Math?.floor(analyticsData?.length / 2));
    const older = analyticsData?.slice(Math?.floor(analyticsData?.length / 2));

    const recentAvg =
      recent?.reduce((sum, a) => sum + (a[field] || 0), 0) / recent?.length;
    const olderAvg =
      older?.reduce((sum, a) => sum + (a[field] || 0), 0) / older?.length;

    if (olderAvg === 0) return recentAvg > 0 ? 100 : 0;
    return Math?.round(((recentAvg - olderAvg) / olderAvg) * 100);
  }

  private generatePreferredHours(
    sessionData: Record<string, any>,
  ): { hour: number; activityLevel: number }[] {
    const hourlyActivity =
      (sessionData?.hourlyActivity as number[]) ||
      Array?.from({ length: 24 }, (_, i) =>
        i >= 9 && i <= 22 ? Math?.random() * 0.5 + 0.5 : Math?.random() * 0.3,
      );

    return hourlyActivity?.map((level, hour) => ({
      hour,
      activityLevel: level,
    }));
  }

  private getPlatformOptimalTimes(
    artistType: ArtistType,
    genres: string[],
  ): OptimalSchedule["posting"] {
    const baseTimes: Record<
      string,
      { bestDays: string[]; bestTimes: string[] }
    > = {
      instagram: {
        bestDays: ["Tuesday", "Wednesday", "Thursday"],
        bestTimes: ["11:00 AM", "2:00 PM", "7:00 PM"],
      },
      tiktok: {
        bestDays: ["Tuesday", "Thursday", "Friday"],
        bestTimes: ["9:00 AM", "12:00 PM", "7:00 PM"],
      },
      twitter: {
        bestDays: ["Wednesday", "Thursday", "Friday"],
        bestTimes: ["9:00 AM", "12:00 PM", "5:00 PM"],
      },
      youtube: {
        bestDays: ["Thursday", "Friday", "Saturday"],
        bestTimes: ["2:00 PM", "5:00 PM"],
      },
      facebook: {
        bestDays: ["Wednesday", "Thursday", "Friday"],
        bestTimes: ["1:00 PM", "3:00 PM"],
      },
    };

    return Object?.entries(baseTimes).map(([platform, times]) => ({
      platform,
      bestDays: times.bestDays,
      bestTimes: times.bestTimes,
      frequency: artistType === "label" ? "multiple-daily" : "daily",
      audienceActivity: 0.7 + Math?.random() * 0.2,
    }));
  }

  private getAvoidDates(): string[] {
    const now = new Date();
    const avoidDates: string[] = [];

    const holidays = [
      new Date(now?.getFullYear(), 11, 25),
      new Date(now?.getFullYear(), 0, 1),
      new Date(now?.getFullYear(), 6, 4),
    ];

    holidays?.forEach((date) => {
      if (date > now) {
        avoidDates?.push(date?.toISOString().split("T")[0]);
      }
    });

    return avoidDates;
  }

  private getCareerStageSuggestions(
    stage: CareerStage,
    artistType: ArtistType,
  ): ActionSuggestion[] {
    const suggestions: ActionSuggestion[] = [];

    if (stage === "emerging") {
      suggestions?.push({
        id: "build-audience",
        type: "social",
        priority: "high",
        title: "Build Your Audience",
        description:
          "Focus on growing your social media following with consistent content",
        action: "Create Content Strategy",
        actionUrl: "/social",
        icon: "users",
        timeEstimate: "30 min",
      });
    }

    if (stage === "developing") {
      suggestions?.push({
        id: "pitch-playlists",
        type: "distribution",
        priority: "high",
        title: "Pitch to Playlists",
        description:
          "Your streams are growing! Time to pitch to editorial playlists",
        action: "Submit Pitch",
        actionUrl: "/distribution?tab=pitching",
        icon: "music",
        timeEstimate: "20 min",
      });
    }

    if (artistType === "producer") {
      suggestions?.push({
        id: "list-beats",
        type: "distribution",
        priority: "medium",
        title: "List Beats for Sale",
        description: "Start earning from your beats on the marketplace",
        action: "List Beat",
        actionUrl: "/marketplace/sell",
        icon: "dollar-sign",
        timeEstimate: "10 min",
      });
    }

    return suggestions;
  }

  async getSmartSchedule(
    _userId: string,
    platform: string,
    _contentType: string,
  ): Promise<{
    suggestions: {
      id: string;
      dayOfWeek: string;
      timeSlot: string;
      specificTime: string;
      timezone: string;
      confidence: number;
      estimatedEngagement: number;
      reasoning: string;
      platforms: string[];
      audienceActivity: number;
    }[];
    bestOverallTime: {
      id: string;
      dayOfWeek: string;
      timeSlot: string;
      specificTime: string;
      timezone: string;
      confidence: number;
      estimatedEngagement: number;
      reasoning: string;
      platforms: string[];
      audienceActivity: number;
    } | null;
    weeklyPattern: Record<string, number>;
    audienceTimezones: { timezone: string; percentage: number }[];
    engagementTrend: "increasing" | "stable" | "decreasing";
    lastUpdated: string;
  }> {
    const suggestions = [
      {
        id: "sched-1",
        dayOfWeek: "wednesday",
        timeSlot: "evening" as const,
        specificTime: "6:00 PM",
        timezone: "America/New_York",
        confidence: 0.87,
        estimatedEngagement: 23,
        reasoning: "Your audience is most active during mid-week evenings",
        platforms:
          platform === "all" ? ["instagram", "tiktok", "twitter"] : [platform],
        audienceActivity: 0.85,
      },
      {
        id: "sched-2",
        dayOfWeek: "friday",
        timeSlot: "afternoon" as const,
        specificTime: "2:00 PM",
        timezone: "America/New_York",
        confidence: 0.82,
        estimatedEngagement: 19,
        reasoning: "High engagement before weekend activities",
        platforms: platform === "all" ? ["instagram", "tiktok"] : [platform],
        audienceActivity: 0.78,
      },
      {
        id: "sched-3",
        dayOfWeek: "sunday",
        timeSlot: "morning" as const,
        specificTime: "10:00 AM",
        timezone: "America/New_York",
        confidence: 0.75,
        estimatedEngagement: 15,
        reasoning: "Relaxed weekend browsing time",
        platforms: platform === "all" ? ["twitter", "facebook"] : [platform],
        audienceActivity: 0.72,
      },
    ];

    return {
      suggestions,
      bestOverallTime: suggestions[0],
      weeklyPattern: {
        monday: 0.55,
        tuesday: 0.62,
        wednesday: 0.85,
        thursday: 0.7,
        friday: 0.78,
        saturday: 0.65,
        sunday: 0.72,
      },
      audienceTimezones: [
        { timezone: "America/New_York", percentage: 35 },
        { timezone: "America/Los_Angeles", percentage: 25 },
        { timezone: "Europe/London", percentage: 15 },
        { timezone: "America/Chicago", percentage: 12 },
        { timezone: "Other", percentage: 13 },
      ],
      engagementTrend: "increasing",
      lastUpdated: new Date().toISOString(),
    };
  }

  async applyArtistTypeDefaults(
    userId: string,
    artistType: ArtistType,
  ): Promise<void> {
    const layout = await this?.getDashboardLayout(userId);
    const priorityWidgets = this?.getPriorityWidgetsForType(artistType);

    const updatedWidgets = layout?.widgets
      .map((widget) => ({
        ...widget,
        visible: priorityWidgets.includes(widget?.id),
        position:
          priorityWidgets?.indexOf(widget?.id) !== -1
            ? priorityWidgets?.indexOf(widget?.id)
            : widget?.position + 100,
      }))
      .sort((a, b) => a?.position - b?.position);

    await this?.updatePreferences(userId, {
      artistType,
      dashboardLayout: { widgets: updatedWidgets },
    });
  }

  private getPriorityWidgetsForType(artistType: ArtistType): string[] {
    const widgetSets: Record<ArtistType, string[]> = {
      solo: [
        "streams",
        "social-reach",
        "next-release",
        "ai-coach",
        "quick-actions",
        "revenue",
      ],
      band: [
        "collaborations",
        "streams",
        "tour-dates",
        "social-reach",
        "merch-sales",
        "revenue",
      ],
      producer: [
        "beat-sales",
        "licensing",
        "studio",
        "collaborations",
        "streams",
        "marketplace",
      ],
      label: [
        "roster-overview",
        "revenue",
        "distribution-status",
        "contracts",
        "analytics-chart",
        "notifications",
      ],
      dj: [
        "gig-calendar",
        "streams",
        "social-reach",
        "mixes",
        "quick-actions",
        "collaborations",
      ],
      songwriter: [
        "publishing",
        "sync-licensing",
        "collaborations",
        "revenue",
        "streams",
        "ai-coach",
      ],
    };
    return widgetSets[artistType] || widgetSets?.solo;
  }
}

export const smartDefaultsService = new SmartDefaultsService();
