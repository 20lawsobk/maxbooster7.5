import { storage } from "../storage";

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

export interface PersonalizationPreferences {
  artistType: ArtistType;
  careerStage: CareerStage;
  primaryGenres: string[];
  goals: string[];
  dashboardWidgets: DashboardWidget[];
  timeBasedLayouts: TimeOfDayLayout;
  featurePreferences: Record<string, boolean>;
  notificationPriorities: Record<string, "high" | "medium" | "low">;
  quickActions: string[];
  hiddenFeatures: string[];
}

export interface DashboardWidget {
  id: string;
  position: number;
  visible: boolean;
  size: "small" | "medium" | "large";
  priority: number;
  lastUsed?: Date;
  usageCount: number;
  pinned?: boolean;
  avgViewDuration?: number;
}

export interface TimeOfDayLayout {
  morning: DashboardWidget[];
  afternoon: DashboardWidget[];
  evening: DashboardWidget[];
  night: DashboardWidget[];
}

export interface InteractionEvent {
  type:
    | "click"
    | "view"
    | "complete"
    | "dismiss"
    | "hover"
    | "search"
    | "shortcut"
    | "scroll";
  target: string;
  context?: Record<string, any>;
  duration?: number;
  timestamp: Date;
  path?: string;
}

export interface LearningInsight {
  id: string;
  insight: string;
  confidence: number;
  category: "navigation" | "content" | "timing" | "preferences";
  suggestedAction: string;
  applied: boolean;
  dismissed: boolean;
  createdAt: Date;
}

export interface LearningState {
  isLearning: boolean;
  interactionCount: number;
  patternCount: number;
  lastAnalysis: Date | null;
  confidenceLevel: number;
  suggestionsApplied: number;
  suggestionsDeclined: number;
}

export interface InteractionPattern {
  id: string;
  type: "navigation" | "action" | "preference" | "workflow";
  pattern: string;
  frequency: number;
  confidence: number;
  lastOccurred: Date;
}

export interface FeatureUsageData {
  featureId: string;
  name: string;
  category: string;
  usageCount: number;
  lastUsed: Date | null;
  avgSessionTime: number;
  completionRate: number;
  isVisible: boolean;
  priority: number;
  suggestedPriority?: number;
  trendDirection: "up" | "down" | "stable";
}

export interface Recommendation {
  id: string;
  type: "action" | "feature" | "content" | "setting";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  link?: string;
  estimatedTime?: string;
  impact: "high" | "medium" | "low";
  careerStage?: CareerStage[];
  artistTypes?: ArtistType[];
  contextual: boolean;
}

const defaultWidgets: DashboardWidget[] = [
  {
    id: "streams",
    position: 0,
    visible: true,
    size: "medium",
    priority: 1,
    usageCount: 0,
  },
  {
    id: "revenue",
    position: 1,
    visible: true,
    size: "medium",
    priority: 2,
    usageCount: 0,
  },
  {
    id: "social-reach",
    position: 2,
    visible: true,
    size: "small",
    priority: 3,
    usageCount: 0,
  },
  {
    id: "next-release",
    position: 3,
    visible: true,
    size: "small",
    priority: 4,
    usageCount: 0,
  },
  {
    id: "ai-coach",
    position: 4,
    visible: true,
    size: "large",
    priority: 5,
    usageCount: 0,
  },
  {
    id: "quick-actions",
    position: 5,
    visible: true,
    size: "medium",
    priority: 6,
    usageCount: 0,
  },
  {
    id: "recent-activity",
    position: 6,
    visible: true,
    size: "small",
    priority: 7,
    usageCount: 0,
  },
  {
    id: "analytics-chart",
    position: 7,
    visible: true,
    size: "large",
    priority: 8,
    usageCount: 0,
  },
  {
    id: "collaborations",
    position: 8,
    visible: false,
    size: "medium",
    priority: 9,
    usageCount: 0,
  },
  {
    id: "notifications",
    position: 9,
    visible: true,
    size: "small",
    priority: 10,
    usageCount: 0,
  },
  {
    id: "achievements",
    position: 10,
    visible: true,
    size: "small",
    priority: 11,
    usageCount: 0,
  },
  {
    id: "goals",
    position: 11,
    visible: true,
    size: "medium",
    priority: 12,
    usageCount: 0,
  },
];

const artistTypeWidgetPresets: Record<ArtistType, string[]> = {
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
    "social-reach",
    "revenue",
    "goals",
    "notifications",
  ],
  producer: [
    "streams",
    "revenue",
    "collaborations",
    "quick-actions",
    "analytics-chart",
    "achievements",
  ],
  label: [
    "revenue",
    "analytics-chart",
    "recent-activity",
    "notifications",
    "collaborations",
    "goals",
  ],
  dj: [
    "streams",
    "social-reach",
    "quick-actions",
    "revenue",
    "ai-coach",
    "achievements",
  ],
  songwriter: [
    "collaborations",
    "revenue",
    "ai-coach",
    "quick-actions",
    "achievements",
    "goals",
  ],
};

const featureDefinitions: Omit<
  FeatureUsageData,
  | "usageCount"
  | "lastUsed"
  | "avgSessionTime"
  | "completionRate"
  | "trendDirection"
>[] = [
  {
    featureId: "studio",
    name: "Music Studio",
    category: "studio",
    isVisible: true,
    priority: 1,
  },
  {
    featureId: "distribution",
    name: "Distribution",
    category: "distribution",
    isVisible: true,
    priority: 2,
  },
  {
    featureId: "analytics",
    name: "Analytics Dashboard",
    category: "analytics",
    isVisible: true,
    priority: 3,
  },
  {
    featureId: "social-media",
    name: "Social Media Manager",
    category: "social",
    isVisible: true,
    priority: 4,
  },
  {
    featureId: "advertising",
    name: "Advertising Campaigns",
    category: "marketing",
    isVisible: true,
    priority: 5,
  },
  {
    featureId: "collaborations",
    name: "Collaborations",
    category: "collaboration",
    isVisible: true,
    priority: 6,
  },
  {
    featureId: "royalties",
    name: "Royalty Management",
    category: "monetization",
    isVisible: true,
    priority: 7,
  },
  {
    featureId: "marketplace",
    name: "Beat Marketplace",
    category: "monetization",
    isVisible: true,
    priority: 8,
  },
  {
    featureId: "contracts",
    name: "Contracts",
    category: "collaboration",
    isVisible: true,
    priority: 9,
  },
  {
    featureId: "ai-coach",
    name: "AI Career Coach",
    category: "analytics",
    isVisible: true,
    priority: 10,
  },
  {
    featureId: "settings",
    name: "Settings",
    category: "settings",
    isVisible: true,
    priority: 11,
  },
];

class PersonalizationService {
  private userInteractions: Map<string, InteractionEvent[]> = new Map();
  private userPatterns: Map<string, InteractionPattern[]> = new Map();
  private userInsights: Map<string, LearningInsight[]> = new Map();
  private userLearningState: Map<string, LearningState> = new Map();

  // Memory caps — in-process cache only. Preferences are persisted in the DB.
  private static readonly MAX_USERS = 50_000; // max concurrent cached users
  // max interaction events per user
  private static readonly STALE_USER_TTL_MS = 4 * 60 * 60 * 1000; // 4 h inactivity → evict

  constructor() {
    // Periodic cleanup: evict users whose last interaction is older than TTL,
    // then enforce hard cap on overall Map size.
    setInterval(
      () => {
        const cutoff = Date.now() - PersonalizationService.STALE_USER_TTL_MS;
        for (const [uid, events] of this.userInteractions.entries()) {
          const lastTs =
            events.length > 0
              ? new Date(events[events.length - 1].timestamp).getTime()
              : 0;
          if (lastTs < cutoff) {
            this.userInteractions.delete(uid);
            this.userPatterns.delete(uid);
            this.userInsights.delete(uid);
            this.userLearningState.delete(uid);
          }
        }
        // Hard-cap safety net
        const overage =
          this.userInteractions.size - PersonalizationService.MAX_USERS;
        if (overage > 0) {
          let n = overage;
          for (const uid of this.userInteractions.keys()) {
            this.userInteractions.delete(uid);
            this.userPatterns.delete(uid);
            this.userInsights.delete(uid);
            this.userLearningState.delete(uid);
            if (--n <= 0) break;
          }
        }
      },
      10 * 60 * 1000,
    ).unref();
  }

  async getPreferences(userId: string): Promise<PersonalizationPreferences> {
    const user = await storage.getUser(userId);
    const storedPrefs =
      (user?.preferences as Record<string, any>)?.personalization || {};
    const onboardingData = (user?.onboardingData as Record<string, any>) || {};

    const artistType =
      onboardingData.artistType || storedPrefs.artistType || "solo";
    const careerStage =
      onboardingData.careerStage || storedPrefs.careerStage || "emerging";
    const genres = onboardingData.genres || storedPrefs.primaryGenres || [];
    const goals = onboardingData.goals || storedPrefs.goals || [];

    return {
      artistType,
      careerStage,
      primaryGenres: genres,
      goals,
      dashboardWidgets:
        storedPrefs.dashboardWidgets ||
        this.getDefaultWidgetsForType(artistType),
      timeBasedLayouts:
        storedPrefs.timeBasedLayouts || this.getDefaultTimeLayouts(artistType),
      featurePreferences: storedPrefs.featurePreferences || {},
      notificationPriorities:
        storedPrefs.notificationPriorities ||
        this.getDefaultNotificationPriorities(),
      quickActions: storedPrefs.quickActions || [
        "upload-track",
        "schedule-post",
        "view-analytics",
      ],
      hiddenFeatures: storedPrefs.hiddenFeatures || [],
    };
  }

  async updatePreferences(
    userId: string,
    updates: Partial<PersonalizationPreferences>,
  ): Promise<void> {
    const user = await storage.getUser(userId);
    const currentPrefs = (user?.preferences as Record<string, any>) || {};

    await storage.updateUser(userId, {
      preferences: {
        ...currentPrefs,
        personalization: {
          ...currentPrefs.personalization,
          ...updates,
        },
      },
    });
  }

  async trackInteraction(
    userId: string,
    event: InteractionEvent,
  ): Promise<void> {
    const interactions = this.userInteractions.get(userId) || [];
    interactions.push(event);

    if (interactions.length > 1000) {
      interactions.splice(0, interactions.length - 1000);
    }

    this.userInteractions.set(userId, interactions);

    const state =
      this.userLearningState.get(userId) || this.getDefaultLearningState();
    state.interactionCount++;
    this.userLearningState.set(userId, state);

    if (interactions.length % 50 === 0) {
      await this.analyzePatterns(userId);
    }
  }

  async trackBatchInteractions(
    userId: string,
    events: InteractionEvent[],
  ): Promise<void> {
    for (const event of events) {
      await this.trackInteraction(userId, event);
    }
  }

  async trackWidgetView(
    userId: string,
    widgetId: string,
    duration: number,
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    const widgets = prefs.dashboardWidgets;

    const widgetIndex = widgets.findIndex((w) => w.id === widgetId);
    if (widgetIndex !== -1) {
      widgets[widgetIndex].usageCount++;
      widgets[widgetIndex].lastUsed = new Date();

      const currentAvg = widgets[widgetIndex].avgViewDuration || 0;
      const count = widgets[widgetIndex].usageCount;
      widgets[widgetIndex].avgViewDuration =
        (currentAvg * (count - 1) + duration) / count;

      await this.updatePreferences(userId, { dashboardWidgets: widgets });
    }
  }

  async analyzePatterns(userId: string): Promise<InteractionPattern[]> {
    const interactions = this.userInteractions.get(userId) || [];
    if (interactions.length < 10) return [];

    const patterns: InteractionPattern[] = [];
    const targetCounts: Record<string, number> = {};
    const pathCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};

    for (const interaction of interactions) {
      targetCounts[interaction.target] =
        (targetCounts[interaction.target] || 0) + 1;
      if (interaction.path) {
        pathCounts[interaction.path] = (pathCounts[interaction.path] || 0) + 1;
      }
      const hour = new Date(interaction.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const topTargets = Object.entries(targetCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [target, count] of topTargets) {
      if (count >= 3) {
        patterns.push({
          id: `target-${target}`,
          type: "action",
          pattern: `Frequently uses "${target}"`,
          frequency: count,
          confidence: Math.min(count / interactions.length, 0.95),
          lastOccurred: new Date(),
        });
      }
    }

    const topPaths = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [path, count] of topPaths) {
      if (count >= 5) {
        patterns.push({
          id: `path-${path}`,
          type: "navigation",
          pattern: `Frequently visits ${path}`,
          frequency: count,
          confidence: Math.min(count / interactions.length, 0.9),
          lastOccurred: new Date(),
        });
      }
    }

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      const hourNum = parseInt(peakHour[0]);
      const timeLabel =
        hourNum < 12
          ? "morning"
          : hourNum < 17
            ? "afternoon"
            : hourNum < 21
              ? "evening"
              : "night";
      patterns.push({
        id: `time-preference`,
        type: "preference",
        pattern: `Most active during ${timeLabel} (around ${hourNum}:00)`,
        frequency: peakHour[1],
        confidence: peakHour[1] / interactions.length,
        lastOccurred: new Date(),
      });
    }

    this.userPatterns.set(userId, patterns);

    const state =
      this.userLearningState.get(userId) || this.getDefaultLearningState();
    state.patternCount = patterns.length;
    state.lastAnalysis = new Date();
    state.confidenceLevel =
      patterns.reduce((acc, p) => acc + p.confidence, 0) /
      Math.max(patterns.length, 1);
    this.userLearningState.set(userId, state);

    await this.generateInsights(userId, patterns);

    return patterns;
  }

  private async generateInsights(
    userId: string,
    patterns: InteractionPattern[],
  ): Promise<void> {
    const insights: LearningInsight[] = [];

    for (const pattern of patterns) {
      if (pattern.confidence > 0.6) {
        let insight: LearningInsight | null = null;

        if (pattern.type === "action" && pattern.frequency >= 5) {
          insight = {
            id: `insight-${pattern.id}-${Date.now()}`,
            insight: `You use "${pattern.pattern.replace('Frequently uses "', "").replace('"', "")}" frequently.`,
            confidence: pattern.confidence,
            category: "preferences",
            suggestedAction: "Add this action to your quick access bar",
            applied: false,
            dismissed: false,
            createdAt: new Date(),
          };
        } else if (pattern.type === "navigation") {
          insight = {
            id: `insight-${pattern.id}-${Date.now()}`,
            insight: pattern.pattern,
            confidence: pattern.confidence,
            category: "navigation",
            suggestedAction: "Pin this page to your sidebar",
            applied: false,
            dismissed: false,
            createdAt: new Date(),
          };
        } else if (
          pattern.type === "preference" &&
          pattern.id === "time-preference"
        ) {
          insight = {
            id: `insight-${pattern.id}-${Date.now()}`,
            insight: pattern.pattern,
            confidence: pattern.confidence,
            category: "timing",
            suggestedAction: "Optimize dashboard layout for this time of day",
            applied: false,
            dismissed: false,
            createdAt: new Date(),
          };
        }

        if (insight) {
          insights.push(insight);
        }
      }
    }

    const existingInsights = this.userInsights.get(userId) || [];
    const newInsights = [...existingInsights, ...insights].slice(-20);
    this.userInsights.set(userId, newInsights);
  }

  async getLearningState(userId: string): Promise<LearningState> {
    return this.userLearningState.get(userId) || this.getDefaultLearningState();
  }

  async getLearningInsights(userId: string): Promise<LearningInsight[]> {
    return this.userInsights.get(userId) || [];
  }

  async getInteractionPatterns(userId: string): Promise<InteractionPattern[]> {
    return this.userPatterns.get(userId) || [];
  }

  async applyInsight(userId: string, insightId: string): Promise<void> {
    const insights = this.userInsights.get(userId) || [];
    const insight = insights.find((i) => i.id === insightId);

    if (insight) {
      insight.applied = true;
      this.userInsights.set(userId, insights);

      const state =
        this.userLearningState.get(userId) || this.getDefaultLearningState();
      state.suggestionsApplied++;
      this.userLearningState.set(userId, state);
    }
  }

  async dismissInsight(userId: string, insightId: string): Promise<void> {
    const insights = this.userInsights.get(userId) || [];
    const insightIndex = insights.findIndex((i) => i.id === insightId);

    if (insightIndex !== -1) {
      insights[insightIndex].dismissed = true;
      this.userInsights.set(userId, insights);

      const state =
        this.userLearningState.get(userId) || this.getDefaultLearningState();
      state.suggestionsDeclined++;
      this.userLearningState.set(userId, state);
    }
  }

  async resetLearning(userId: string): Promise<void> {
    this.userInteractions.delete(userId);
    this.userPatterns.delete(userId);
    this.userInsights.delete(userId);
    this.userLearningState.set(userId, this.getDefaultLearningState());
  }

  async getFeatureUsage(userId: string): Promise<FeatureUsageData[]> {
    const prefs = await this.getPreferences(userId);
    const interactions = this.userInteractions.get(userId) || [];

    return featureDefinitions.map((feature) => {
      const featureInteractions = interactions.filter(
        (i) =>
          i.target.toLowerCase().includes(feature.featureId.toLowerCase()) ||
          i.path?.includes(feature.featureId),
      );

      const usageCount = featureInteractions.length;
      const lastUsed =
        featureInteractions.length > 0
          ? featureInteractions[featureInteractions.length - 1].timestamp
          : null;

      const recentInteractions = featureInteractions.filter(
        (i) =>
          new Date(i.timestamp).getTime() >
          Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      const olderInteractions = featureInteractions.filter(
        (i) =>
          new Date(i.timestamp).getTime() <=
            Date.now() - 7 * 24 * 60 * 60 * 1000 &&
          new Date(i.timestamp).getTime() >
            Date.now() - 14 * 24 * 60 * 60 * 1000,
      );

      let trendDirection: "up" | "down" | "stable" = "stable";
      if (recentInteractions.length > olderInteractions.length * 1.2) {
        trendDirection = "up";
      } else if (recentInteractions.length < olderInteractions.length * 0.8) {
        trendDirection = "down";
      }

      return {
        ...feature,
        usageCount,
        lastUsed,
        avgSessionTime: 0,
        completionRate: usageCount > 0 ? Math.min(usageCount / 10, 1) : 0,
        trendDirection,
        isVisible: !prefs.hiddenFeatures.includes(feature.featureId),
      };
    });
  }

  async updateFeaturePriority(
    userId: string,
    featureId: string,
    updates: { isVisible?: boolean; priority?: number },
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);

    if (updates.isVisible !== undefined) {
      if (updates.isVisible) {
        prefs.hiddenFeatures = prefs.hiddenFeatures.filter(
          (f) => f !== featureId,
        );
      } else if (!prefs.hiddenFeatures.includes(featureId)) {
        prefs.hiddenFeatures.push(featureId);
      }
    }

    await this.updatePreferences(userId, {
      hiddenFeatures: prefs.hiddenFeatures,
      featurePreferences: {
        ...prefs.featurePreferences,
        [`${featureId}_priority`]: updates.priority,
      },
    });
  }

  async getRecommendations(userId: string): Promise<Recommendation[]> {
    const prefs = await this.getPreferences(userId);
    this.userPatterns.get(userId) || [];

    const recommendations: Recommendation[] = [];

    if (prefs.careerStage === "emerging") {
      recommendations.push({
        id: "complete-profile",
        type: "action",
        title: "Complete Your Artist Profile",
        description:
          "A complete profile helps you get discovered and build your brand.",
        priority: "high",
        category: "setup",
        link: "/settings",
        estimatedTime: "5 min",
        impact: "high",
        careerStage: ["emerging"],
        contextual: true,
      });

      recommendations.push({
        id: "first-release",
        type: "action",
        title: "Prepare Your First Release",
        description:
          "Start your journey by uploading your music to streaming platforms.",
        priority: "high",
        category: "distribution",
        link: "/distribution",
        estimatedTime: "15 min",
        impact: "high",
        careerStage: ["emerging"],
        contextual: true,
      });
    }

    if (prefs.artistType === "producer") {
      recommendations.push({
        id: "list-beats",
        type: "action",
        title: "List Beats on Marketplace",
        description:
          "Start earning by selling your beats to artists worldwide.",
        priority: "medium",
        category: "monetization",
        link: "/marketplace",
        estimatedTime: "10 min",
        impact: "medium",
        artistTypes: ["producer"],
        contextual: true,
      });
    }

    if (prefs.artistType === "band") {
      recommendations.push({
        id: "invite-members",
        type: "action",
        title: "Invite Band Members",
        description: "Collaborate with your bandmates on releases and splits.",
        priority: "medium",
        category: "collaboration",
        link: "/collaborations",
        estimatedTime: "5 min",
        impact: "medium",
        artistTypes: ["band"],
        contextual: true,
      });
    }

    recommendations.push({
      id: "connect-social",
      type: "action",
      title: "Connect Social Media Accounts",
      description:
        "Link your social accounts to schedule posts and track engagement.",
      priority: "medium",
      category: "social",
      link: "/social",
      estimatedTime: "5 min",
      impact: "medium",
      contextual: false,
    });

    recommendations.push({
      id: "explore-ai-coach",
      type: "feature",
      title: "Meet Your AI Career Coach",
      description:
        "Get personalized insights and recommendations for your music career.",
      priority: "low",
      category: "analytics",
      link: "/career-coach",
      estimatedTime: "3 min",
      impact: "medium",
      contextual: false,
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async applyArtistTypeDefaults(
    userId: string,
    artistType: ArtistType,
  ): Promise<void> {
    const widgets = this.getDefaultWidgetsForType(artistType);
    await this.updatePreferences(userId, {
      artistType,
      dashboardWidgets: widgets,
    });
  }

  async applyGenreDefaults(userId: string, genre: string): Promise<void> {
    await this.updatePreferences(userId, {
      primaryGenres: [genre],
    });
  }

  async resetToDefaults(userId: string): Promise<void> {
    const user = await storage.getUser(userId);
    const currentPrefs = (user?.preferences as Record<string, any>) || {};

    await storage.updateUser(userId, {
      preferences: {
        ...currentPrefs,
        personalization: null,
      },
    });

    await this.resetLearning(userId);
  }

  async updateWidget(
    userId: string,
    widgetId: string,
    updates: Partial<DashboardWidget>,
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    const widgets = prefs.dashboardWidgets;

    const widgetIndex = widgets.findIndex((w) => w.id === widgetId);
    if (widgetIndex !== -1) {
      widgets[widgetIndex] = { ...widgets[widgetIndex], ...updates };
      await this.updatePreferences(userId, { dashboardWidgets: widgets });
    }
  }

  async getDefaults(userId: string): Promise<{
    artistType: ArtistType;
    careerStage: CareerStage;
    primaryGoals: string[];
    genres: string[];
    enabledFeatures: string[];
  }> {
    const prefs = await this.getPreferences(userId);
    return {
      artistType: prefs.artistType,
      careerStage: prefs.careerStage,
      primaryGoals: prefs.goals,
      genres: prefs.primaryGenres,
      enabledFeatures: Object.entries(prefs.featurePreferences)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature),
    };
  }

  async updateDefaults(
    userId: string,
    defaults: {
      artistType: ArtistType;
      careerStage: CareerStage;
      primaryGoals: string[];
      genres: string[];
      enabledFeatures: string[];
    },
  ): Promise<void> {
    const featurePrefs: Record<string, boolean> = {};
    defaults.enabledFeatures.forEach((f) => {
      featurePrefs[f] = true;
    });

    await this.updatePreferences(userId, {
      artistType: defaults.artistType,
      careerStage: defaults.careerStage,
      goals: defaults.primaryGoals,
      primaryGenres: defaults.genres,
      featurePreferences: featurePrefs,
    });
  }

  async updateDashboardLayout(
    userId: string,
    layout: { name: string; widgets: DashboardWidget[] },
  ): Promise<void> {
    await this.updatePreferences(userId, {
      dashboardWidgets: layout.widgets,
    });
  }

  async getLayoutPresets(
    userId: string,
  ): Promise<{ id: string; name: string; widgetIds: string[] }[]> {
    const userData = this.userPreferencesCache.get(userId);
    const presets = (userData as Record<string, unknown>)?.layoutPresets || [];
    return presets;
  }

  async createLayoutPreset(
    userId: string,
    preset: { name: string; widgetIds: string[] },
  ): Promise<{ id: string; name: string; widgetIds: string[] }> {
    const newPreset = {
      id: `preset-${Date.now()}`,
      name: preset.name,
      widgetIds: preset.widgetIds,
    };

    const userData = this.userPreferencesCache.get(userId) || {};
    const presets = (userData as Record<string, unknown>).layoutPresets || [];
    presets.push(newPreset);
    (userData as Record<string, unknown>).layoutPresets = presets;
    this.userPreferencesCache.set(
      userId,
      userData as PersonalizationPreferences,
    );

    return newPreset;
  }

  async applyScheduleSuggestion(
    userId: string,
    suggestionId: string,
    platform?: string,
  ): Promise<void> {
    await this.getPreferences(userId);
    await this.trackInteraction(userId, {
      type: "complete",
      target: "schedule-suggestion",
      context: { suggestionId, platform },
      timestamp: new Date(),
    });
  }

  async getNextAction(userId: string): Promise<Recommendation | null> {
    const recommendations = await this.getRecommendations(userId);
    return recommendations.length > 0 ? recommendations[0] : null;
  }

  private getDefaultWidgetsForType(artistType: ArtistType): DashboardWidget[] {
    const priorityWidgets =
      artistTypeWidgetPresets[artistType] || artistTypeWidgetPresets.solo;

    return defaultWidgets.map((widget) => ({
      ...widget,
      visible: priorityWidgets.includes(widget.id),
      priority:
        priorityWidgets.indexOf(widget.id) !== -1
          ? priorityWidgets.indexOf(widget.id)
          : widget.priority + 100,
    }));
  }

  private getDefaultTimeLayouts(artistType: ArtistType): TimeOfDayLayout {
    const baseWidgets = this.getDefaultWidgetsForType(artistType);

    return {
      morning: baseWidgets.slice(0, 6),
      afternoon: baseWidgets,
      evening: baseWidgets,
      night: baseWidgets.slice(0, 4),
    };
  }

  private getDefaultNotificationPriorities(): Record<
    string,
    "high" | "medium" | "low"
  > {
    return {
      releases: "high",
      payments: "high",
      collaborations: "medium",
      social: "medium",
      marketing: "low",
      system: "low",
    };
  }

  private getDefaultLearningState(): LearningState {
    return {
      isLearning: true,
      interactionCount: 0,
      patternCount: 0,
      lastAnalysis: null,
      confidenceLevel: 0,
      suggestionsApplied: 0,
      suggestionsDeclined: 0,
    };
  }
}

export const personalizationService = new PersonalizationService();
