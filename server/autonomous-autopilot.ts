import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { platformAPI } from "./platform-apis.js";
import { logger } from "./logger.js";
import {
  autopilotCoordinatorService,
  type AutopilotType,
} from "./services/autopilotCoordinatorService.js";
import { hyperLearningEngine } from "./services/hyperLearningEngine.js";
import { updateSchedulePressure } from "./services/contentQualityPipeline.js";
import { advancedSocialAIService } from "./services/advancedSocialAIService.js";
import { autopilotLearningService } from "./services/autopilotLearningService.js";
import { evolutionRegistry } from "./services/evolutionRegistry.js";

// ── Deterministic PRNG — FNV-1a 32-bit ──────────────────────────────────────
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
// ────────────────────────────────────────────────────────────────────────────

interface AutonomousConfig {
  enabled: boolean;
  minPostsPerDay: number;
  maxPostsPerDay: number;
  businessVertical: string;
  targetAudience: string;
  brandPersonality:
    | "professional"
    | "casual"
    | "authoritative"
    | "friendly"
    | "innovative";
  contentObjectives: string[];
  engagementTargets: {
    minLikesPerPost: number;
    minSharesPerPost: number;
    minCommentsPerPost: number;
  };
  autoOptimization: boolean;
  crossPlatformSyncing: boolean;
  adaptivePosting: boolean;
}

export class AutonomousAutopilot extends EventEmitter {
  private config: AutonomousConfig;
  private isRunning: boolean = false;
  private contentGenerationInterval: NodeJS.Timeout | null = null;
  private performanceAnalysisInterval: NodeJS.Timeout | null = null;
  private adaptationInterval: NodeJS.Timeout | null = null;
  private platformPerformance: Map<string, any> = new Map();
  private static readonly DEFAULT_TOPICS = [
    "new release",
    "studio session",
    "behind the scenes",
    "fan stories",
    "tour update",
    "songwriting process",
    "gear & production",
  ] as const;
  private contentPerformanceHistory: Array<Record<string, unknown>> = [];
  private optimalTimingCache: Map<string, number[]> = new Map();
  // Platforms that have received REAL learned timing data (vs. seeded defaults).
  // Learned data always wins; the self-evolution override only applies when a
  // platform has no learned data yet.
  private learnedTimingPlatforms: Set<string> = new Set();
  private topicPerformanceMap: Map<string, number> = new Map();
  private topicTrialCountMap: Map<string, number> = new Map();
  private adaptiveLearningData: Map<string, any> = new Map();
  private userId: string;
  private autopilotType: AutopilotType = "social";
  private coordinatorEnabled: boolean = true;
  // Caffeine Mode — last broadcast pressure value; avoids redundant reschedules
  private _lastBroadcastPressure = 0;

  constructor(userId: string, autopilotType: AutopilotType = "social") {
    super();
    this.userId = userId;
    this.autopilotType = autopilotType;
    this.config = this.getDefaultConfig();
    this.initializeAutonomousLearning();
  }

  setAutopilotType(type: AutopilotType): void {
    this.autopilotType = type;
  }

  getAutopilotType(): AutopilotType {
    return this.autopilotType;
  }

  setCoordinatorEnabled(enabled: boolean): void {
    this.coordinatorEnabled = enabled;
  }

  private connectToCoordinator(): void {
    if (this.coordinatorEnabled) {
      autopilotCoordinatorService.connectAutopilot(
        this.userId,
        this.autopilotType,
      );
      logger.info(
        `Autopilot ${this.autopilotType} connected to coordinator for user ${this.userId}`,
      );
    }
  }

  private disconnectFromCoordinator(): void {
    if (this.coordinatorEnabled) {
      autopilotCoordinatorService.disconnectAutopilot(
        this.userId,
        this.autopilotType,
      );
      logger.info(
        `Autopilot ${this.autopilotType} disconnected from coordinator for user ${this.userId}`,
      );
    }
  }

  async getCoordinatedSlot(
    platform: string,
    preferredTime?: Date,
  ): Promise<Date> {
    if (!this.coordinatorEnabled) {
      return preferredTime || new Date();
    }

    const slot = autopilotCoordinatorService.getNextAvailableSlot(
      this.userId,
      this.autopilotType,
      platform,
      preferredTime,
    );

    return slot.suggestedTime;
  }

  async registerPostWithCoordinator(
    platform: string,
    scheduledTime: Date,
    content?: string,
  ): Promise<string | null> {
    if (!this.coordinatorEnabled) {
      return null;
    }

    const post = autopilotCoordinatorService.registerPost(
      this.userId,
      this.autopilotType,
      platform,
      scheduledTime,
      content,
    );

    return post?.id || null;
  }

  async shareInsightWithCoordinator(
    insightType: "timing" | "content" | "audience" | "platform" | "engagement",
    data: Record<string, any>,
  ): Promise<void> {
    if (!this.coordinatorEnabled) {
      return;
    }

    autopilotCoordinatorService.shareInsight(
      this.userId,
      this.autopilotType,
      insightType,
      data,
    );
  }

  getCoordinatorStatus() {
    return autopilotCoordinatorService.getStatus(this.userId);
  }

  getCoordinatedSchedule() {
    return autopilotCoordinatorService.getCoordinatedSchedule(this.userId);
  }

  syncCoordinatorInsights() {
    return autopilotCoordinatorService.syncInsights(this.userId);
  }

  static createForSocialAndAds(userId: string): AutonomousAutopilot {
    const engine = new AutonomousAutopilot(userId);
    engine.updateAutonomousConfig({
      enabled: false,
      minPostsPerDay: 3,
      maxPostsPerDay: 8,
      brandPersonality: "friendly",
      contentObjectives: ["engagement", "brand-awareness"],
      crossPlatformSyncing: true,
      adaptivePosting: true,
    });
    return engine;
  }

  static createForAutonomousUpdates(userId: string): AutonomousAutopilot {
    const engine = new AutonomousAutopilot(userId);
    engine.updateAutonomousConfig({
      enabled: false,
      minPostsPerDay: 1,
      maxPostsPerDay: 3,
      brandPersonality: "authoritative",
      contentObjectives: ["thought-leadership", "brand-awareness"],
      crossPlatformSyncing: true,
      adaptivePosting: true,
    });
    return engine;
  }

  static createForSecurityIT(userId: string): AutonomousAutopilot {
    const engine = new AutonomousAutopilot(userId);
    engine.updateAutonomousConfig({
      enabled: false,
      minPostsPerDay: 0,
      maxPostsPerDay: 2,
      brandPersonality: "professional",
      contentObjectives: ["education", "thought-leadership"],
      crossPlatformSyncing: false,
      adaptivePosting: true,
    });
    return engine;
  }

  private getDefaultConfig(): AutonomousConfig {
    return {
      enabled: false,
      minPostsPerDay: 3,
      maxPostsPerDay: 8,
      businessVertical: "",
      targetAudience: "",
      brandPersonality: "professional",
      contentObjectives: [
        "engagement",
        "brand-awareness",
        "thought-leadership",
      ],
      engagementTargets: {
        minLikesPerPost: 10,
        minSharesPerPost: 2,
        minCommentsPerPost: 1,
      },
      autoOptimization: true,
      crossPlatformSyncing: true,
      adaptivePosting: true,
    };
  }

  private async initializeAutonomousLearning(): Promise<void> {
    // Initialize with industry-standard optimal times
    this.optimalTimingCache.set("Twitter", [9, 12, 15, 18, 21]);
    this.optimalTimingCache.set("Instagram", [8, 11, 14, 17, 19]);
    this.optimalTimingCache.set("LinkedIn", [8, 12, 16, 17]);
    this.optimalTimingCache.set("Facebook", [9, 13, 15, 20]);
    this.optimalTimingCache.set("TikTok", [6, 10, 16, 19]);
  }

  // Fully Autonomous Operations
  async startAutonomousMode(
    initialConfig?: Partial<AutonomousConfig>,
  ): Promise<void> {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig, enabled: true };
    } else {
      this.config.enabled = true;
    }

    this.isRunning = true;

    // Connect to coordinator for cross-autopilot awareness
    this.connectToCoordinator();

    this.emit("autonomousModeStarted", this.config);

    // Start continuous content generation
    this.scheduleAutonomousContentGeneration();

    // Start performance monitoring
    this.schedulePerformanceAnalysis();

    // Start adaptive learning
    this.scheduleAdaptiveLearning();

    logger.info(
      `Autonomous autopilot (${this.autopilotType}) started with full automation and coordinator integration`,
    );
  }

  async stopAutonomousMode(): Promise<void> {
    this.isRunning = false;
    this.config.enabled = false;

    if (this.contentGenerationInterval) {
      clearTimeout(this.contentGenerationInterval);
      this.contentGenerationInterval = null;
    }

    if (this.performanceAnalysisInterval) {
      clearInterval(this.performanceAnalysisInterval);
      this.performanceAnalysisInterval = null;
    }

    if (this.adaptationInterval) {
      clearInterval(this.adaptationInterval);
      this.adaptationInterval = null;
    }

    // Disconnect from coordinator
    this.disconnectFromCoordinator();

    this.emit("autonomousModeStopped");
    logger.info(`Autonomous autopilot (${this.autopilotType}) stopped`);
  }

  // Autonomous Content Generation
  private scheduleAutonomousContentGeneration(): void {
    // Generate content every 2-4 hours with intelligent spacing
    const generateContent = async () => {
      if (!this.isRunning) return;

      try {
        // Minimal connected platforms list; integrate real list via external APIs
        const connectedPlatforms = [
          { name: "Twitter", isConnected: true },
          { name: "Instagram", isConnected: true },
          { name: "LinkedIn", isConnected: true },
        ];

        for (const platform of connectedPlatforms) {
          if (await this.shouldGenerateContentForPlatform(platform.name)) {
            await this.generateAndPublishAutonomousContent(platform.name);
          }
        }
      } catch (error: unknown) {
        logger.warn({ err: error }, "Autonomous content generation failed:");
        this.emit("autonomousError", { type: "content_generation", error });
      }
    };

    // Self-rescheduling loop — recompute the interval on every tick so
    // pressure spikes (Caffeine Mode), engagement shifts and config changes
    // re-tune the cadence dynamically. A static setInterval, computed once
    // at start(), would stay frozen at the cold-start cadence for the life
    // of the process even when the situation demands much faster posting.
    const runLoop = async () => {
      await generateContent();
      if (!this.isRunning) return;
      this.contentGenerationInterval = setTimeout(
        runLoop,
        this.calculateNextGenerationInterval(),
      );
    };
    this.contentGenerationInterval = setTimeout(runLoop, 5000); // Start in 5s
  }

  private async shouldGenerateContentForPlatform(
    platform: string,
  ): Promise<boolean> {
    // Check if we've already posted enough today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysContent = this.contentPerformanceHistory.filter(
      (content) =>
        content.platform === platform && new Date(content.publishedAt) >= today,
    );

    const dailyPostCount = todaysContent.length;

    // Don't exceed max posts per day
    if (dailyPostCount >= this.config.maxPostsPerDay) {
      return false;
    }

    // Compute schedule pressure and broadcast to quality pipeline + HyperLearning
    const pressure = this.computeSchedulePressure(platform);
    this.broadcastPressure(pressure);

    const hoursLeft = 24 - new Date().getHours();
    const postsNeeded = this.config.minPostsPerDay - dailyPostCount;

    // Caffeine Mode: under critical pressure generate on every check — no waiting
    // for the optimal window.  Like a student who has to submit something before
    // the exam starts, even if conditions aren't perfect.
    if (pressure > 1.5 && postsNeeded > 0) {
      logger.warn(
        `⚡ [CaffeineMode] ${platform}: critical pressure (${pressure.toFixed(2)}) — generating immediately`,
      );
      return true;
    }

    if (hoursLeft <= 4 && postsNeeded > 0) {
      return true; // Must post to meet minimum
    }

    // Use optimal timing for regular posts. Precedence: real learned data >
    // self-evolution registry override (from a real detected industry change) >
    // seeded static defaults.
    const currentHour = new Date().getHours();
    let optimalHours = this.optimalTimingCache.get(platform) || [14];
    if (!this.learnedTimingPlatforms.has(platform)) {
      try {
        const override = evolutionRegistry.getOptimalHoursOverride(platform);
        if (override && override.length > 0) {
          optimalHours = override;
        }
      } catch (err) {
        logger.warn(
          { err },
          `[AutonomousAutopilot] Failed to read evolution hours override for ${platform}`,
        );
      }
    }

    // Under moderate pressure expand the acceptable posting window from ±1 h to ±2 h
    const window = pressure > 0.5 ? 2 : 1;
    return optimalHours.some((hour) => Math.abs(hour - currentHour) <= window);
  }

  private async generateAndPublishAutonomousContent(
    platform: string,
  ): Promise<void> {
    try {
      // Check coordinator for available slot before posting
      const scheduledTime = await this.getCoordinatedSlot(platform);

      // Autonomously select the best topic based on performance history
      const topic = this.selectOptimalTopic();

      // Generate content autonomously
      const content = await this.autonomousContentGeneration({
        platform,
        topic,
        brandPersonality: this.config.brandPersonality,
        targetAudience: this.config.targetAudience,
        businessVertical: this.config.businessVertical,
        objectives: this.config.contentObjectives,
      });

      // Register with coordinator before publishing
      const coordinatorPostId = await this.registerPostWithCoordinator(
        platform,
        scheduledTime,
        content.text.substring(0, 100),
      );

      // Create content in storage
      const savedContent = {
        id: randomUUID(),
        body: content.text,
        hashtags: content.hashtags,
        selectedPlatforms: [platform],
        status: "draft",
        contentType: "social_post",
        coordinatorPostId,
      } as Record<string, unknown>;

      // Publish immediately (fully autonomous)
      const publishResults = await platformAPI.publishContent(
        savedContent,
        [platform],
        this.userId,
      );
      const successfulPublish = publishResults.find((r: unknown) => r.success);

      if (successfulPublish) {
        const realPublishedAt = new Date();
        savedContent.status = "published";
        (savedContent as Record<string, unknown>).publishedAt = realPublishedAt;

        // Seed performance history at PUBLISH time with topic + true publish time
        // so UCB1 topic feedback and optimal-time learning train on the real
        // posting hour, not the +2h analysis hour.
        this.contentPerformanceHistory.push({
          contentId: savedContent.id,
          postId: successfulPublish.postId,
          platform,
          topic,
          contentText: content.text,
          hashtags: content.hashtags,
          publishedAt: realPublishedAt,
          analytics: { engagementRate: 0 },
          analyzed: false,
        });
        if (this.contentPerformanceHistory.length > 200) {
          this.contentPerformanceHistory.shift();
        }

        // Update coordinator with post status
        if (coordinatorPostId) {
          autopilotCoordinatorService.updatePostStatus(
            this.userId,
            coordinatorPostId,
            "posted",
            successfulPublish.postId,
          );
        }

        // Schedule autonomous performance analysis
        setTimeout(
          () => {
            this.analyzeContentPerformance(
              savedContent.id as string,
              successfulPublish.postId!,
              platform,
            );
          },
          2 * 60 * 60 * 1000,
        ); // Analyze after 2 hours

        this.emit("autonomousContentPublished", {
          content: savedContent,
          platform,
          postId: successfulPublish.postId,
          coordinatorPostId,
        });

        logger.info(
          `Autonomous content published to ${platform}: "${content.text.substring(0, 50)}..." (coordinator: ${coordinatorPostId || "disabled"})`,
        );
      } else if (coordinatorPostId) {
        // Update coordinator with failed status
        autopilotCoordinatorService.updatePostStatus(
          this.userId,
          coordinatorPostId,
          "failed",
        );
      }
    } catch (error: unknown) {
      logger.warn(
        { err: error },
        `Autonomous content generation failed for ${platform}:`,
      );
      this.emit("autonomousError", {
        type: "content_generation",
        platform,
        error,
      });
    }
  }

  // Autonomous Content Generation routed through MaxCore via Advanced Social AI.
  // Matches autopilot-engine's pipeline so both code paths produce the same
  // GPT-5.2 level, viral-scored, music-industry-tuned output and share the
  // same engagement-driven feedback loop.
  private async autonomousContentGeneration(params: {
    platform: string;
    topic: string;
    brandPersonality: string;
    targetAudience: string;
    businessVertical: string;
    objectives: string[];
  }): Promise<{
    text: string;
    hashtags: string[];
    hook?: string;
    cta?: string;
  }> {
    const goalsLower = params.objectives.map((g) => g.toLowerCase()).join(" ");
    let objective: "awareness" | "engagement" | "conversions" | "viral" =
      goalsLower.includes("sales") ||
      goalsLower.includes("conversion") ||
      goalsLower.includes("revenue")
        ? "conversions"
        : goalsLower.includes("viral") ||
            goalsLower.includes("reach") ||
            goalsLower.includes("growth")
          ? "viral"
          : goalsLower.includes("brand") || goalsLower.includes("awareness")
            ? "awareness"
            : "engagement";

    // A self-evolution posting_optimization override may call for prioritizing
    // engagement (from a real detected industry change). When engagementTargeting
    // is 'high', steer the objective toward engagement regardless of the
    // configured objectives. Fully reversible (deactivating reverts behavior).
    try {
      const posting = evolutionRegistry.getPostingOptimization(
        params.platform.toLowerCase(),
      );
      if (posting?.engagementTargeting === "high") {
        objective = "engagement";
      }
    } catch (err) {
      logger.warn(
        { err },
        `[AutonomousAutopilot] Failed to read evolution engagement targeting for ${params.platform}`,
      );
    }

    const voice = params.brandPersonality.toLowerCase();
    const tone:
      | "professional"
      | "casual"
      | "energetic"
      | "inspirational"
      | "humorous"
      | "storytelling" =
      voice === "professional" || voice === "authoritative"
        ? "professional"
        : voice === "innovative"
          ? "energetic"
          : voice === "friendly"
            ? "casual"
            : (voice as "casual") || "casual";

    const ctMap: Record<
      string,
      | "announcement"
      | "behind_scenes"
      | "engagement"
      | "promotional"
      | "storytelling"
    > = {
      questions: "engagement",
      announcements: "announcement",
      insights: "storytelling",
      tips: "storytelling",
    };
    const contentType =
      ctMap[this.selectContentTypeFromObjectives(params.objectives)] ??
      "engagement";

    const advancedResult =
      await advancedSocialAIService.generateAdvancedContent({
        userId: this.userId,
        topic: params.topic,
        platforms: [params.platform.toLowerCase()],
        objective,
        tone,
        targetAudience: params.targetAudience
          ?.toLowerCase()
          .replace(/\s+/g, "_"),
        contentType,
        includeHashtags: true,
        includeEmojis: true,
        variantCount: 3,
      });

    return {
      text: advancedResult.primary.body,
      hashtags: advancedResult.primary.hashtags,
      hook: advancedResult.primary.hook,
      cta: advancedResult.primary.callToAction,
    };
  }

  private selectContentTypeFromObjectives(objectives: string[]): string {
    const contentTypeMap: Record<string, string> = {
      engagement: "questions",
      "brand-awareness": "announcements",
      "thought-leadership": "insights",
      education: "tips",
      promotion: "announcements",
    };

    for (const objective of objectives) {
      if (contentTypeMap[objective]) {
        return contentTypeMap[objective];
      }
    }

    return "tips"; // Default fallback
  }

  // Autonomous Performance Analysis
  private schedulePerformanceAnalysis(): void {
    this.performanceAnalysisInterval = setInterval(
      async () => {
        if (!this.isRunning) return;

        try {
          await this.performAutonomousAnalysis();
        } catch (error: unknown) {
          logger.warn(
            { err: error },
            "Autonomous performance analysis failed:",
          );
          this.emit("autonomousError", { type: "performance_analysis", error });
        }
      },
      30 * 60 * 1000,
    ); // Every 30 minutes
  }

  private async performAutonomousAnalysis(): Promise<void> {
    // Analyze recent posts that haven't been analyzed yet
    const recentPosts = this.contentPerformanceHistory
      .filter(
        (post) =>
          !post.analyzed &&
          Date.now() - new Date(post.publishedAt).getTime() > 60 * 60 * 1000,
      ) // At least 1 hour old
      .slice(0, 10); // Analyze up to 10 posts at a time

    for (const post of recentPosts) {
      await this.analyzeContentPerformance(
        post.contentId,
        post.postId,
        post.platform,
      );
    }
  }

  private async analyzeContentPerformance(
    contentId: string,
    postId: string,
    platform: string,
  ): Promise<void> {
    try {
      const analytics = await platformAPI.collectEngagementData(
        postId,
        platform,
        this.userId,
      );

      if (analytics) {
        // Update the seeded publish-time entry rather than pushing a duplicate.
        // The entry was created at publish time with topic + true publishedAt so
        // UCB1 topic feedback and optimal-time learning train on the real
        // posting hour, not the +2h analysis hour.
        const existing = this.contentPerformanceHistory.find(
          (p) => p.contentId === contentId,
        );
        if (existing) {
          existing.analytics = analytics;
          existing.analyzed = true;
        } else {
          // Fallback: seed entry was evicted from the 200-cap window.
          this.contentPerformanceHistory.push({
            contentId,
            postId,
            platform,
            publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            analytics,
            analyzed: true,
          });
          if (this.contentPerformanceHistory.length > 200) {
            this.contentPerformanceHistory.shift();
          }
        }

        // Autonomous learning from performance — pass the seeded context so
        // recordPerformance receives true publish time + topic + content.
        await this.learnFromPerformance(analytics, platform, existing);

        this.emit("autonomousAnalysisCompleted", {
          contentId,
          platform,
          analytics,
        });
      }
    } catch (error: unknown) {
      logger.warn(
        { err: error },
        `Performance analysis failed for ${contentId}:`,
      );
    }
  }

  // Autonomous Learning and Adaptation
  private scheduleAdaptiveLearning(): void {
    this.adaptationInterval = setInterval(
      async () => {
        if (!this.isRunning) return;

        try {
          await this.performAutonomousAdaptation();
        } catch (error: unknown) {
          logger.warn({ err: error }, "Autonomous adaptation failed:");
          this.emit("autonomousError", { type: "adaptation", error });
        }
      },
      6 * 60 * 60 * 1000,
    ); // Every 6 hours
  }

  private async performAutonomousAdaptation(): Promise<void> {
    // Adapt posting frequency based on performance
    this.adaptPostingFrequency();

    // Adapt optimal timing based on engagement data
    this.adaptOptimalTiming();

    // Adapt content strategy based on topic performance
    this.adaptContentStrategy();

    this.emit("autonomousAdaptationCompleted", {
      newConfig: this.config,
      adaptations: this.getRecentAdaptations(),
    });

    logger.info("Autonomous adaptation completed");
  }

  private adaptPostingFrequency(): void {
    const recentPerformance = this.contentPerformanceHistory
      .filter(
        (post) =>
          Date.now() - new Date(post.publishedAt).getTime() <
          7 * 24 * 60 * 60 * 1000,
      ) // Last 7 days
      .map((post) => post.analytics.engagementRate);

    if (recentPerformance.length > 5) {
      const avgEngagement =
        recentPerformance.reduce((a, b) => a + b, 0) /
        (recentPerformance.length || 1);

      if (avgEngagement > 0.05) {
        // High engagement
        this.config.maxPostsPerDay = Math.min(
          this.config.maxPostsPerDay + 1,
          12,
        );
      } else if (avgEngagement < 0.01) {
        // Low engagement
        this.config.maxPostsPerDay = Math.max(
          this.config.maxPostsPerDay - 1,
          2,
        );
      }
    }
  }

  private adaptOptimalTiming(): void {
    const platformPerformance = new Map<string, Map<number, number>>();

    // Analyze performance by hour for each platform
    this.contentPerformanceHistory.forEach((post) => {
      const hour = new Date(post.publishedAt).getHours();
      const platform = post.platform;

      if (!platformPerformance.has(platform)) {
        platformPerformance.set(platform, new Map());
      }

      const hourlyPerf = platformPerformance.get(platform)!;
      const currentAvg = hourlyPerf.get(hour) || 0;
      hourlyPerf.set(hour, (currentAvg + post.analytics.engagementRate) / 2);
    });

    // Update optimal times cache
    platformPerformance.forEach((hourlyPerf, platform) => {
      const sortedHours = Array.from(hourlyPerf.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([hour]) => hour);

      if (sortedHours.length > 0) {
        this.optimalTimingCache.set(platform, sortedHours);
        this.learnedTimingPlatforms.add(platform);
      }
    });
  }

  private adaptContentStrategy(): void {
    // Track which topics perform best and adjust focus
    const topicPerformance = new Map<string, number[]>();

    this.contentPerformanceHistory.forEach((post) => {
      if (post.topic) {
        if (!topicPerformance.has(post.topic)) {
          topicPerformance.set(post.topic, []);
        }
        topicPerformance.get(post.topic)!.push(post.analytics.engagementRate);
      }
    });

    // Update topic performance map and trial counts for UCB1
    topicPerformance.forEach((performances, topic) => {
      const avgPerformance =
        performances.reduce((a, b) => a + b, 0) / (performances.length || 1);
      this.topicPerformanceMap.set(topic, avgPerformance);
      this.topicTrialCountMap.set(topic, performances.length);
    });
  }

  private async learnFromPerformance(
    analytics: unknown,
    platform: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const a = (analytics ?? {}) as Record<string, unknown>;
    const engagementRate = Number(a.engagementRate ?? 0);

    // Persist the performance signal to the DB-backed learning store so the
    // optimal-times / hashtag / hook analytics in autopilotLearningService can
    // consume autonomous-mode posts the same way published-mode posts feed it.
    // Best-effort: a learning-store failure must not block the autopilot loop.
    try {
      const ctx = (context ?? {}) as Record<string, unknown>;
      const realPostedAt =
        ctx.publishedAt instanceof Date
          ? (ctx.publishedAt as Date)
          : new Date(Date.now() - 2 * 60 * 60 * 1000);
      await autopilotLearningService.recordPerformance(
        this.userId,
        {
          platform,
          contentType: "tips",
          hashtags: Array.isArray(ctx.hashtags)
            ? (ctx.hashtags as string[])
            : [],
          contentText:
            typeof ctx.contentText === "string"
              ? (ctx.contentText as string)
              : undefined,
          postId:
            typeof ctx.postId === "string" ? (ctx.postId as string) : undefined,
          postedAt: realPostedAt,
          metadata: {
            source: "autonomous-autopilot",
            topic: typeof ctx.topic === "string" ? ctx.topic : undefined,
            contentId:
              typeof ctx.contentId === "string" ? ctx.contentId : undefined,
          },
        },
        {
          impressions: Number(a.impressions ?? 0),
          clicks: Number(a.clicks ?? 0),
          shares: Number(a.shares ?? 0),
          likes: Number(a.likes ?? 0),
          comments: Number(a.comments ?? 0),
          saves: Number(a.saves ?? 0),
          reach: Number(a.reach ?? 0),
          engagementRate,
        },
      );
    } catch (err) {
      logger.warn(
        { err, userId: this.userId, platform },
        "[AutonomousAutopilot] recordPerformance failed — continuing learning loop",
      );
    }

    // Store platform-specific learning data
    const platformData = this.adaptiveLearningData.get(platform) || {
      totalPosts: 0,
      avgEngagement: 0,
      bestPerformingHours: [],
      contentPatterns: {},
    };

    platformData.totalPosts += 1;
    platformData.avgEngagement =
      (platformData.avgEngagement * (platformData.totalPosts - 1) +
        engagementRate) /
      platformData.totalPosts;

    this.adaptiveLearningData.set(platform, platformData);

    // Share engagement insights with coordinator for cross-autopilot learning.
    // Use the REAL posting hour from context (the +2h analysis time would skew
    // every cross-autopilot timing insight by the analytics delay).
    const ctxForHour = (context ?? {}) as Record<string, unknown>;
    const postedHour =
      ctxForHour.publishedAt instanceof Date
        ? (ctxForHour.publishedAt as Date).getHours()
        : new Date(Date.now() - 2 * 60 * 60 * 1000).getHours();
    const currentHour = postedHour;
    await this.shareInsightWithCoordinator("engagement", {
      platform,
      engagementRate,
      hour: currentHour,
      likes: (analytics as Record<string, unknown>).likes || 0,
      comments: (analytics as Record<string, unknown>).comments || 0,
      shares: (analytics as Record<string, unknown>).shares || 0,
      reach: (analytics as Record<string, unknown>).reach || 0,
    });

    // Share timing insights if engagement is above average
    if (engagementRate > platformData.avgEngagement) {
      await this.shareInsightWithCoordinator("timing", {
        platform,
        hour: currentHour,
        engagementScore: engagementRate,
        isOptimal: true,
      });
    }
  }

  async getHyperLearningOptimizedContent(platform: string): Promise<{
    optimalHook: string;
    optimalLength: string;
    optimalTiming: { hour: number; dayOfWeek: number };
    microPatternRecommendations: string[];
    predictedEngagement: number;
  } | null> {
    try {
      const prediction = await hyperLearningEngine.predictOptimalContent(
        this.userId,
        platform,
      );
      return {
        optimalHook: prediction.optimalHook,
        optimalLength: prediction.optimalLength,
        optimalTiming: prediction.optimalTiming,
        microPatternRecommendations: prediction.microPatternRecommendations,
        predictedEngagement: prediction.predictedEngagement,
      };
    } catch (error) {
      logger.warn(
        "HyperLearning optimization unavailable, using standard learning",
      );
      return null;
    }
  }

  async applyHyperLearningToContent(
    content: string,
    platform: string,
  ): Promise<string> {
    try {
      const hyperOptimization =
        await this.getHyperLearningOptimizedContent(platform);
      if (!hyperOptimization) return content;

      let optimizedContent = content;

      for (const recommendation of hyperOptimization.microPatternRecommendations.slice(
        0,
        3,
      )) {
        if (
          recommendation.includes("emoji") &&
          !content.match(new RegExp("[\\u{1F600}-\\u{1F64F}]", "u"))
        ) {
          const emojis = [
            "🎵",
            "🎶",
            "🔥",
            "✨",
            "💯",
            "🙌",
            "💪",
            "🎤",
            "🎹",
            "🎸",
          ];
          optimizedContent =
            emojis[
              seededIndex(content.slice(0, 48) + platform, emojis.length)
            ] +
            " " +
            optimizedContent;
        }
        if (recommendation.includes("question") && !content.includes("?")) {
          optimizedContent += "\n\nWhat do you think?";
        }
      }

      return optimizedContent;
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to apply HyperLearning optimizations:",
      );
      return content;
    }
  }

  getHyperLearningStatus(): {
    enabled: boolean;
    learningMultiplier: number;
    microPatternsDetected: number;
  } {
    const status = hyperLearningEngine.getStatus();
    return {
      enabled: status.isRunning,
      learningMultiplier: status.metrics.learningMultiplier,
      microPatternsDetected: status.microPatternCount,
    };
  }

  // Topic Selection with Learning
  private selectOptimalTopic(): string {
    // Candidate arm set is the UNION of the canonical default topics and any
    // topic ever seen in history. Seeding with the full default set is what
    // lets UCB1 keep exploring beyond the single cold-start topic — without it
    // the bandit would only ever have one arm (the first topic learned) and
    // could never converge to the true best topic across the catalogue.
    // Music-artist topics — the prior generic-business defaults
    // ('industry trends', 'leadership', etc.) produced off-brand posts
    // that hurt engagement, so these reflect what performs for working artists.
    const defaultTopics = AutonomousAutopilot.DEFAULT_TOPICS;

    // Derive per-topic trial count + reward sum directly from history so the
    // arm statistics are never stale relative to the periodic adaptation cycle,
    // and posts that are published-but-not-yet-analysed still count as trials
    // (prevents the cold-start loop from hammering one topic before the ~2h
    // analytics delay records any feedback).
    const statsByTopic = new Map<string, { n: number; sum: number }>();
    for (const post of this.contentPerformanceHistory) {
      const topic = typeof post.topic === "string" ? post.topic : undefined;
      if (!topic) continue;
      const er = Number(
        (post.analytics as Record<string, unknown> | undefined)
          ?.engagementRate ?? 0,
      );
      const s = statsByTopic.get(topic) || { n: 0, sum: 0 };
      s.n += 1;
      s.sum += er;
      statsByTopic.set(topic, s);
    }

    const candidates = new Set<string>([
      ...defaultTopics,
      ...statsByTopic.keys(),
    ]);

    // Forced exploration: any candidate arm never tried (n=0) must be sampled
    // before exploitation begins. Pick deterministically (seeded by userId +
    // remaining-untried count) so exploration order is stable yet spreads
    // across distinct topics as each gets its first post.
    const untried = Array.from(candidates).filter(
      (t) => (statsByTopic.get(t)?.n ?? 0) === 0,
    );
    if (untried.length > 0) {
      return untried[
        seededIndex(`${this.userId}:explore:${untried.length}`, untried.length)
      ];
    }

    // ── UCB1 Multi-Armed Bandit topic selection ──────────────────────────────
    // Upper Confidence Bound (UCB1) is the mathematically optimal explore-exploit
    // algorithm: score = avg_reward + C * sqrt(ln(N) / n_arm).
    // High-performing topics score high on the first term; under-explored topics
    // score high on the second term. Result: zero wasted impressions, provably
    // maximum long-run engagement. Fully deterministic — no Math.random().
    // C = 0.25 tuned for engagement-rate reward signals in the 0–1 range.
    const UCB1_C = 0.25;
    const totalTrials =
      Array.from(statsByTopic.values()).reduce((s, v) => s + v.n, 0) || 1;

    let bestTopic = defaultTopics[0];
    let bestScore = -Infinity;
    candidates.forEach((topic) => {
      const stat = statsByTopic.get(topic);
      const n = stat?.n || 1;
      const avgRate = stat ? stat.sum / stat.n : 0;
      const explorationBonus = UCB1_C * Math.sqrt(Math.log(totalTrials) / n);
      const ucb1Score = avgRate + explorationBonus;
      if (ucb1Score > bestScore) {
        bestScore = ucb1Score;
        bestTopic = topic;
      }
    });
    return bestTopic;
  }

  // ── Caffeine Mode — Deadline Pressure Utilities ─────────────────────────────

  /**
   * Computes how many posts per remaining hour are needed to hit the daily
   * minimum for the given platform.
   *   0      = on track or ahead
   *   0–0.5  = mild lag
   *   0.5–1.5= behind (moderate caffeine)
   *   >1.5   = critical (max caffeine — all-nighter mode)
   */
  private computeSchedulePressure(platform: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const postsToday = this.contentPerformanceHistory.filter(
      (c) => c.platform === platform && new Date(c.publishedAt) >= today,
    ).length;
    const now = new Date();
    const hoursLeft = Math.max(
      0.5,
      24 - now.getHours() - now.getMinutes() / 60,
    );
    const postsNeeded = Math.max(0, this.config.minPostsPerDay - postsToday);
    return postsNeeded / hoursLeft;
  }

  /**
   * Broadcasts the current platform pressure to the quality pipeline and the
   * HyperLearning engine.  Only fires when the pressure tier changes to avoid
   * flooding the interval scheduler with redundant updates.
   */
  private broadcastPressure(pressure: number): void {
    const tier = pressure > 1.5 ? 3 : pressure > 0.5 ? 2 : pressure > 0 ? 1 : 0;
    const pTier =
      this._lastBroadcastPressure > 1.5
        ? 3
        : this._lastBroadcastPressure > 0.5
          ? 2
          : this._lastBroadcastPressure > 0
            ? 1
            : 0;
    if (tier === pTier) return;
    this._lastBroadcastPressure = pressure;
    updateSchedulePressure(pressure);
    hyperLearningEngine.applyDeadlinePressure(pressure);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Utility Methods
  private calculateNextGenerationInterval(): number {
    const baseInterval = 2 * 60 * 60 * 1000; // 2 hours
    const maxInterval = 6 * 60 * 60 * 1000; // 6 hours
    const minInterval = 30 * 60 * 1000; // 30 minutes
    const caffeineModeInterval = 20 * 60 * 1000; // 20 minutes — critical crunch

    // Caffeine Mode overrides engagement-based timing when behind schedule
    const pressure = this._lastBroadcastPressure;
    if (pressure > 1.5) return caffeineModeInterval;
    if (pressure > 0.5) return minInterval;

    if (this.contentPerformanceHistory.length < 10) {
      return baseInterval; // Standard interval initially
    }

    const recentAvgEngagement =
      this.contentPerformanceHistory
        .slice(-10)
        .reduce((sum, post) => sum + post.analytics.engagementRate, 0) / 10;

    if (recentAvgEngagement > 0.05) {
      return minInterval; // Post more frequently if performing well
    } else if (recentAvgEngagement < 0.01) {
      return maxInterval; // Post less frequently if performing poorly
    }

    return baseInterval;
  }

  private getRecentAdaptations(): unknown[] {
    return [
      { type: "posting_frequency", value: this.config.maxPostsPerDay },
      {
        type: "optimal_timing",
        platforms: Array.from(this.optimalTimingCache.keys()),
      },
      {
        type: "topic_focus",
        topPerformers: Array.from(this.topicPerformanceMap.entries()).slice(
          0,
          3,
        ),
      },
    ];
  }

  // Status and Monitoring
  async getAutonomousStatus(): Promise<unknown> {
    return {
      isRunning: this.isRunning,
      config: this.config,
      totalContentPublished: this.contentPerformanceHistory.length,
      avgEngagementRate:
        this.contentPerformanceHistory.length > 0
          ? this.contentPerformanceHistory.reduce(
              (sum, post) => sum + post.analytics.engagementRate,
              0,
            ) / this.contentPerformanceHistory.length
          : 0,
      optimalTimes: Object.fromEntries(this.optimalTimingCache),
      topPerformingTopics: Array.from(this.topicPerformanceMap.entries()).slice(
        0,
        5,
      ),
      nextGenerationInterval: this.calculateNextGenerationInterval(),
      platformPerformance: Object.fromEntries(this.adaptiveLearningData),
    };
  }

  async updateAutonomousConfig(
    updates: Partial<AutonomousConfig>,
  ): Promise<void> {
    this.config = { ...this.config, ...updates };
    this.emit("autonomousConfigUpdated", this.config);
  }
}

export const autonomousAutopilot = new AutonomousAutopilot();
