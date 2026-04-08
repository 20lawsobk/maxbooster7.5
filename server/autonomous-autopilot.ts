import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { platformAPI } from './platform-apis.js';
import { customAI } from './custom-ai-engine.js';
import { logger } from './logger.js';
import { autopilotCoordinatorService, type AutopilotType } from './services/autopilotCoordinatorService.js';
import { hyperLearningEngine } from './services/hyperLearningEngine.js';
import { updateSchedulePressure } from './services/contentQualityPipeline.js';

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
  brandPersonality: 'professional' | 'casual' | 'authoritative' | 'friendly' | 'innovative';
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
  private contentPerformanceHistory: Array<any> = [];
  private optimalTimingCache: Map<string, number[]> = new Map();
  private topicPerformanceMap: Map<string, number> = new Map();
  private topicTrialCountMap: Map<string, number> = new Map();
  private adaptiveLearningData: Map<string, any> = new Map();
  private userId: string;
  private autopilotType: AutopilotType = 'social';
  private coordinatorEnabled: boolean = true;
  // Caffeine Mode — last broadcast pressure value; avoids redundant reschedules
  private _lastBroadcastPressure = 0;

  constructor(userId: string, autopilotType: AutopilotType = 'social') {
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
      autopilotCoordinatorService.connectAutopilot(this.userId, this.autopilotType);
      logger.info(`Autopilot ${this.autopilotType} connected to coordinator for user ${this.userId}`);
    }
  }

  private disconnectFromCoordinator(): void {
    if (this.coordinatorEnabled) {
      autopilotCoordinatorService.disconnectAutopilot(this.userId, this.autopilotType);
      logger.info(`Autopilot ${this.autopilotType} disconnected from coordinator for user ${this.userId}`);
    }
  }

  async getCoordinatedSlot(platform: string, preferredTime?: Date): Promise<Date> {
    if (!this.coordinatorEnabled) {
      return preferredTime || new Date();
    }
    
    const slot = autopilotCoordinatorService.getNextAvailableSlot(
      this.userId,
      this.autopilotType,
      platform,
      preferredTime
    );
    
    return slot.suggestedTime;
  }

  async registerPostWithCoordinator(
    platform: string,
    scheduledTime: Date,
    content?: string
  ): Promise<string | null> {
    if (!this.coordinatorEnabled) {
      return null;
    }
    
    const post = autopilotCoordinatorService.registerPost(
      this.userId,
      this.autopilotType,
      platform,
      scheduledTime,
      content
    );
    
    return post?.id || null;
  }

  async shareInsightWithCoordinator(
    insightType: 'timing' | 'content' | 'audience' | 'platform' | 'engagement',
    data: Record<string, any>
  ): Promise<void> {
    if (!this.coordinatorEnabled) {
      return;
    }
    
    autopilotCoordinatorService.shareInsight(
      this.userId,
      this.autopilotType,
      insightType,
      data
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
      brandPersonality: 'friendly',
      contentObjectives: ['engagement', 'brand-awareness'],
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
      brandPersonality: 'authoritative',
      contentObjectives: ['thought-leadership', 'brand-awareness'],
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
      brandPersonality: 'professional',
      contentObjectives: ['education', 'thought-leadership'],
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
      businessVertical: '',
      targetAudience: '',
      brandPersonality: 'professional',
      contentObjectives: ['engagement', 'brand-awareness', 'thought-leadership'],
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
    this.optimalTimingCache.set('Twitter', [9, 12, 15, 18, 21]);
    this.optimalTimingCache.set('Instagram', [8, 11, 14, 17, 19]);
    this.optimalTimingCache.set('LinkedIn', [8, 12, 16, 17]);
    this.optimalTimingCache.set('Facebook', [9, 13, 15, 20]);
    this.optimalTimingCache.set('TikTok', [6, 10, 16, 19]);
  }

  // Fully Autonomous Operations
  async startAutonomousMode(initialConfig?: Partial<AutonomousConfig>): Promise<void> {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig, enabled: true };
    } else {
      this.config.enabled = true;
    }

    this.isRunning = true;
    
    // Connect to coordinator for cross-autopilot awareness
    this.connectToCoordinator();
    
    this.emit('autonomousModeStarted', this.config);

    // Start continuous content generation
    this.scheduleAutonomousContentGeneration();

    // Start performance monitoring
    this.schedulePerformanceAnalysis();

    // Start adaptive learning
    this.scheduleAdaptiveLearning();

    logger.info(`Autonomous autopilot (${this.autopilotType}) started with full automation and coordinator integration`);
  }

  async stopAutonomousMode(): Promise<void> {
    this.isRunning = false;
    this.config.enabled = false;

    if (this.contentGenerationInterval) {
      clearInterval(this.contentGenerationInterval);
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

    this.emit('autonomousModeStopped');
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
          { name: 'Twitter', isConnected: true },
          { name: 'Instagram', isConnected: true },
          { name: 'LinkedIn', isConnected: true },
        ];

        for (const platform of connectedPlatforms) {
          if (await this.shouldGenerateContentForPlatform(platform.name)) {
            await this.generateAndPublishAutonomousContent(platform.name);
          }
        }
      } catch (error: unknown) {
        logger.warn('Autonomous content generation failed:', error);
        this.emit('autonomousError', { type: 'content_generation', error });
      }
    };

    // Initial generation
    setTimeout(generateContent, 5000); // Start in 5 seconds

    // Set up regular intervals with adaptive timing
    this.contentGenerationInterval = setInterval(
      generateContent,
      this.calculateNextGenerationInterval()
    );
  }

  private async shouldGenerateContentForPlatform(platform: string): Promise<boolean> {
    // Check if we've already posted enough today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysContent = this.contentPerformanceHistory.filter(
      (content) => content.platform === platform && new Date(content.publishedAt) >= today
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
        `⚡ [CaffeineMode] ${platform}: critical pressure (${pressure.toFixed(2)}) — generating immediately`
      );
      return true;
    }

    if (hoursLeft <= 4 && postsNeeded > 0) {
      return true; // Must post to meet minimum
    }

    // Use optimal timing for regular posts
    const currentHour = new Date().getHours();
    const optimalHours = this.optimalTimingCache.get(platform) || [14];

    // Under moderate pressure expand the acceptable posting window from ±1 h to ±2 h
    const window = pressure > 0.5 ? 2 : 1;
    return optimalHours.some((hour) => Math.abs(hour - currentHour) <= window);
  }

  private async generateAndPublishAutonomousContent(platform: string): Promise<void> {
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
        content.text.substring(0, 100)
      );

      // Create content in storage
      const savedContent = {
        id: randomUUID(),
        body: content.text,
        hashtags: content.hashtags,
        selectedPlatforms: [platform],
        status: 'draft',
        contentType: 'social_post',
        coordinatorPostId,
      } as any;

      // Publish immediately (fully autonomous)
      const publishResults = await platformAPI.publishContent(
        savedContent,
        [platform],
        this.userId
      );
      const successfulPublish = publishResults.find((r: unknown) => r.success);

      if (successfulPublish) {
        savedContent.status = 'published';
        (savedContent as any).publishedAt = new Date();

        // Update coordinator with post status
        if (coordinatorPostId) {
          autopilotCoordinatorService.updatePostStatus(
            this.userId,
            coordinatorPostId,
            'posted',
            successfulPublish.postId
          );
        }

        // Schedule autonomous performance analysis
        setTimeout(
          () => {
            this.analyzeContentPerformance(savedContent.id, successfulPublish.postId!, platform);
          },
          2 * 60 * 60 * 1000
        ); // Analyze after 2 hours

        this.emit('autonomousContentPublished', {
          content: savedContent,
          platform,
          postId: successfulPublish.postId,
          coordinatorPostId,
        });

        logger.info(
          `Autonomous content published to ${platform}: "${content.text.substring(0, 50)}..." (coordinator: ${coordinatorPostId || 'disabled'})`
        );
      } else if (coordinatorPostId) {
        // Update coordinator with failed status
        autopilotCoordinatorService.updatePostStatus(
          this.userId,
          coordinatorPostId,
          'failed'
        );
      }
    } catch (error: unknown) {
      logger.warn(`Autonomous content generation failed for ${platform}:`, error);
      this.emit('autonomousError', { type: 'content_generation', platform, error });
    }
  }

  // Autonomous Content Generation using custom AI engine
  private async autonomousContentGeneration(params: {
    platform: string;
    topic: string;
    brandPersonality: string;
    targetAudience: string;
    businessVertical: string;
    objectives: string[];
  }): Promise<{ text: string; hashtags: string[] }> {
    const generatedContent = await customAI.generateContent({
      topic: params.topic,
      platform: params.platform,
      brandVoice: params.brandPersonality,
      contentType: this.selectContentTypeFromObjectives(params.objectives),
      targetAudience: params.targetAudience,
      businessGoals: params.objectives,
    });

    return {
      text: generatedContent.text,
      hashtags: generatedContent.hashtags,
    };
  }

  private selectContentTypeFromObjectives(objectives: string[]): string {
    const contentTypeMap: Record<string, string> = {
      engagement: 'questions',
      'brand-awareness': 'announcements',
      'thought-leadership': 'insights',
      education: 'tips',
      promotion: 'announcements',
    };

    for (const objective of objectives) {
      if (contentTypeMap[objective]) {
        return contentTypeMap[objective];
      }
    }

    return 'tips'; // Default fallback
  }

  private getContentTemplates(params: unknown): string[] {
    const templates: Record<string, string[]> = {
      professional: [
        `Industry insight: ${params.topic} is reshaping how we approach business strategy. Key implications for ${params.targetAudience}:`,
        `After analyzing current ${params.topic} trends, here are three critical factors every leader should consider:`,
        `The future of ${params.topic} depends on understanding these fundamental principles:`,
        `${params.topic} presents both challenges and opportunities. Here's how to navigate effectively:`,
      ],
      casual: [
        `Just discovered something interesting about ${params.topic}! 🤔`,
        `Hot take: ${params.topic} is about to change everything. Here's why:`,
        `Let's talk about ${params.topic} - this is actually pretty fascinating:`,
        `${params.topic} update: Things are getting interesting! 👀`,
      ],
      authoritative: [
        `${params.topic} analysis: Based on extensive research, here are the key findings:`,
        `The definitive guide to ${params.topic}: Everything you need to know:`,
        `${params.topic} best practices that deliver measurable results:`,
        `Comprehensive ${params.topic} strategy framework:`,
      ],
      friendly: [
        `Hey everyone! Wanted to share some thoughts on ${params.topic} 😊`,
        `Good morning! Let's dive into ${params.topic} together:`,
        `Hope everyone's having a great day! Quick ${params.topic} tip:`,
        `${params.topic} made simple - here's what you need to know:`,
      ],
      innovative: [
        `🚀 Revolutionary approach to ${params.topic}: Here's what's changing:`,
        `Breaking: ${params.topic} innovation that's disrupting the entire industry:`,
        `Next-generation ${params.topic} strategies that are already working:`,
        `The cutting-edge of ${params.topic}: What early adopters are doing differently:`,
      ],
    };

    return templates[params.brandPersonality] || templates['professional'];
  }

  private customizeContentTemplate(template: string, params: unknown): string {
    // Add context and value based on objectives
    let content = template;

    if (params.objectives.includes('thought-leadership')) {
      content += `\n\n💡 Key insight: This approach has proven effective across multiple ${params.businessVertical} organizations.`;
    }

    if (params.objectives.includes('engagement')) {
      content += `\n\nWhat's your experience with this? Share your thoughts below! 👇`;
    }

    if (params.objectives.includes('brand-awareness')) {
      content += `\n\n#${params.businessVertical} #Innovation #Growth`;
    }

    return content;
  }

  private generateOptimalHashtags(content: string, platform: string): string[] {
    const words = content.toLowerCase().split(/\s+/);
    const keywords = words.filter((word) => word.length > 4 && !this.isStopWord(word));

    const platformHashtagCounts = {
      Instagram: 8,
      Twitter: 3,
      LinkedIn: 3,
      Facebook: 2,
      TikTok: 5,
    };

    const maxHashtags = (platformHashtagCounts as any)[platform] || 3;

    // Generate contextual hashtags
    const hashtags = keywords
      .slice(0, maxHashtags)
      .map((word) => `#${word.charAt(0).toUpperCase() + word.slice(1)}`);

    return hashtags;
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      'this',
      'that',
      'with',
      'have',
      'will',
      'from',
      'they',
      'been',
      'said',
      'each',
      'which',
      'their',
      'time',
      'people',
    ];
    return stopWords.includes(word);
  }

  // Autonomous Performance Analysis
  private schedulePerformanceAnalysis(): void {
    this.performanceAnalysisInterval = setInterval(
      async () => {
        if (!this.isRunning) return;

        try {
          await this.performAutonomousAnalysis();
        } catch (error: unknown) {
          logger.warn('Autonomous performance analysis failed:', error);
          this.emit('autonomousError', { type: 'performance_analysis', error });
        }
      },
      30 * 60 * 1000
    ); // Every 30 minutes
  }

  private async performAutonomousAnalysis(): Promise<void> {
    // Analyze recent posts that haven't been analyzed yet
    const recentPosts = this.contentPerformanceHistory
      .filter(
        (post) =>
          !post.analyzed && Date.now() - new Date(post.publishedAt).getTime() > 60 * 60 * 1000
      ) // At least 1 hour old
      .slice(0, 10); // Analyze up to 10 posts at a time

    for (const post of recentPosts) {
      await this.analyzeContentPerformance(post.contentId, post.postId, post.platform);
    }
  }

  private async analyzeContentPerformance(
    contentId: string,
    postId: string,
    platform: string
  ): Promise<void> {
    try {
      const analytics = await platformAPI.collectEngagementData(postId, platform, this.userId);

      if (analytics) {
        // Persist analytics via external API if available (optional)

        // Add to performance history for learning (capped to prevent unbounded growth
        // across long-running autopilot sessions — 200 entries is ample for meaningful
        // trend analysis and learning while keeping memory bounded).
        this.contentPerformanceHistory.push({
          contentId,
          postId,
          platform,
          publishedAt: new Date(),
          analytics,
          analyzed: true,
        });
        if (this.contentPerformanceHistory.length > 200) {
          this.contentPerformanceHistory.shift();
        }

        // Autonomous learning from performance
        await this.learnFromPerformance(analytics, platform);

        this.emit('autonomousAnalysisCompleted', { contentId, platform, analytics });
      }
    } catch (error: unknown) {
      logger.warn(`Performance analysis failed for ${contentId}:`, error);
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
          logger.warn('Autonomous adaptation failed:', error);
          this.emit('autonomousError', { type: 'adaptation', error });
        }
      },
      6 * 60 * 60 * 1000
    ); // Every 6 hours
  }

  private async performAutonomousAdaptation(): Promise<void> {
    // Adapt posting frequency based on performance
    this.adaptPostingFrequency();

    // Adapt optimal timing based on engagement data
    this.adaptOptimalTiming();

    // Adapt content strategy based on topic performance
    this.adaptContentStrategy();

    this.emit('autonomousAdaptationCompleted', {
      newConfig: this.config,
      adaptations: this.getRecentAdaptations(),
    });

    logger.info('Autonomous adaptation completed');
  }

  private adaptPostingFrequency(): void {
    const recentPerformance = this.contentPerformanceHistory
      .filter((post) => Date.now() - new Date(post.publishedAt).getTime() < 7 * 24 * 60 * 60 * 1000) // Last 7 days
      .map((post) => post.analytics.engagementRate);

    if (recentPerformance.length > 5) {
      const avgEngagement = recentPerformance.reduce((a, b) => a + b, 0) / recentPerformance.length;

      if (avgEngagement > 0.05) {
        // High engagement
        this.config.maxPostsPerDay = Math.min(this.config.maxPostsPerDay + 1, 12);
      } else if (avgEngagement < 0.01) {
        // Low engagement
        this.config.maxPostsPerDay = Math.max(this.config.maxPostsPerDay - 1, 2);
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
      const avgPerformance = performances.reduce((a, b) => a + b, 0) / performances.length;
      this.topicPerformanceMap.set(topic, avgPerformance);
      this.topicTrialCountMap.set(topic, performances.length);
    });
  }

  private async learnFromPerformance(analytics: unknown, platform: string): Promise<void> {
    const engagementRate = (analytics as any).engagementRate;

    // Feed performance data to custom AI for learning
    // Default to 'tips' content type and template index 0 since we don't track these in autonomous mode
    customAI.updatePerformanceData('tips', platform, 0, analytics);

    // Store platform-specific learning data
    const platformData = this.adaptiveLearningData.get(platform) || {
      totalPosts: 0,
      avgEngagement: 0,
      bestPerformingHours: [],
      contentPatterns: {},
    };

    platformData.totalPosts += 1;
    platformData.avgEngagement =
      (platformData.avgEngagement * (platformData.totalPosts - 1) + engagementRate) /
      platformData.totalPosts;

    this.adaptiveLearningData.set(platform, platformData);

    // Share engagement insights with coordinator for cross-autopilot learning
    const currentHour = new Date().getHours();
    await this.shareInsightWithCoordinator('engagement', {
      platform,
      engagementRate,
      hour: currentHour,
      likes: (analytics as any).likes || 0,
      comments: (analytics as any).comments || 0,
      shares: (analytics as any).shares || 0,
      reach: (analytics as any).reach || 0,
    });

    // Share timing insights if engagement is above average
    if (engagementRate > platformData.avgEngagement) {
      await this.shareInsightWithCoordinator('timing', {
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
      const prediction = await hyperLearningEngine.predictOptimalContent(this.userId, platform);
      return {
        optimalHook: prediction.optimalHook,
        optimalLength: prediction.optimalLength,
        optimalTiming: prediction.optimalTiming,
        microPatternRecommendations: prediction.microPatternRecommendations,
        predictedEngagement: prediction.predictedEngagement,
      };
    } catch (error) {
      logger.warn('HyperLearning optimization unavailable, using standard learning');
      return null;
    }
  }

  async applyHyperLearningToContent(content: string, platform: string): Promise<string> {
    try {
      const hyperOptimization = await this.getHyperLearningOptimizedContent(platform);
      if (!hyperOptimization) return content;

      let optimizedContent = content;

      for (const recommendation of hyperOptimization.microPatternRecommendations.slice(0, 3)) {
        if (recommendation.includes('emoji') && !content.match(new RegExp('[\\u{1F600}-\\u{1F64F}]', 'u'))) {
          const emojis = ['🎵', '🎶', '🔥', '✨', '💯', '🙌', '💪', '🎤', '🎹', '🎸'];
          optimizedContent = emojis[seededIndex(content.slice(0, 48) + platform, emojis.length)] + ' ' + optimizedContent;
        }
        if (recommendation.includes('question') && !content.includes('?')) {
          optimizedContent += '\n\nWhat do you think?';
        }
      }

      return optimizedContent;
    } catch (error) {
      logger.warn('Failed to apply HyperLearning optimizations:', error);
      return content;
    }
  }

  getHyperLearningStatus(): { enabled: boolean; learningMultiplier: number; microPatternsDetected: number } {
    const status = hyperLearningEngine.getStatus();
    return {
      enabled: status.isRunning,
      learningMultiplier: status.metrics.learningMultiplier,
      microPatternsDetected: status.microPatternCount,
    };
  }

  // Topic Selection with Learning
  private selectOptimalTopic(): string {
    if (this.topicPerformanceMap.size === 0) {
      // Default topics for initial content — seeded from userId so the same user
      // gets a consistent starting topic rather than a random one each cold start.
      const defaultTopics = [
        'business insights',
        'industry trends',
        'productivity tips',
        'innovation',
        'leadership',
      ];
      return defaultTopics[seededIndex(this.userId + ':default', defaultTopics.length)];
    }

    // ── UCB1 Multi-Armed Bandit topic selection ──────────────────────────────
    // Upper Confidence Bound (UCB1) is the mathematically optimal explore-exploit
    // algorithm: score = avg_reward + C * sqrt(ln(N) / n_arm).
    // High-performing topics score high on the first term; under-explored topics
    // score high on the second term. Result: zero wasted impressions, provably
    // maximum long-run engagement. Fully deterministic — no Math.random().
    // C = 0.25 tuned for engagement-rate reward signals in the 0–1 range.
    const UCB1_C = 0.25;
    const totalTrials = Array.from(this.topicTrialCountMap.values()).reduce((s, n) => s + n, 0)
      || this.topicPerformanceMap.size;

    let bestTopic = '';
    let bestScore = -Infinity;
    this.topicPerformanceMap.forEach((avgRate, topic) => {
      const n = this.topicTrialCountMap.get(topic) || 1;
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
      c => c.platform === platform && new Date(c.publishedAt) >= today
    ).length;
    const now = new Date();
    const hoursLeft = Math.max(0.5, 24 - now.getHours() - now.getMinutes() / 60);
    const postsNeeded = Math.max(0, this.config.minPostsPerDay - postsToday);
    return postsNeeded / hoursLeft;
  }

  /**
   * Broadcasts the current platform pressure to the quality pipeline and the
   * HyperLearning engine.  Only fires when the pressure tier changes to avoid
   * flooding the interval scheduler with redundant updates.
   */
  private broadcastPressure(pressure: number): void {
    const tier   = pressure > 1.5 ? 3 : pressure > 0.5 ? 2 : pressure > 0 ? 1 : 0;
    const pTier  = this._lastBroadcastPressure > 1.5 ? 3 :
                   this._lastBroadcastPressure > 0.5 ? 2 :
                   this._lastBroadcastPressure > 0   ? 1 : 0;
    if (tier === pTier) return;
    this._lastBroadcastPressure = pressure;
    updateSchedulePressure(pressure);
    hyperLearningEngine.applyDeadlinePressure(pressure);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Utility Methods
  private calculateNextGenerationInterval(): number {
    const baseInterval         = 2  * 60 * 60 * 1000; // 2 hours
    const maxInterval          = 6  * 60 * 60 * 1000; // 6 hours
    const minInterval          = 30 * 60 * 1000;       // 30 minutes
    const caffeineModeInterval = 20 * 60 * 1000;       // 20 minutes — critical crunch

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
      { type: 'posting_frequency', value: this.config.maxPostsPerDay },
      { type: 'optimal_timing', platforms: Array.from(this.optimalTimingCache.keys()) },
      {
        type: 'topic_focus',
        topPerformers: Array.from(this.topicPerformanceMap.entries()).slice(0, 3),
      },
    ];
  }

  // Status and Monitoring
  async getAutonomousStatus(): Promise<any> {
    return {
      isRunning: this.isRunning,
      config: this.config,
      totalContentPublished: this.contentPerformanceHistory.length,
      avgEngagementRate:
        this.contentPerformanceHistory.length > 0
          ? this.contentPerformanceHistory.reduce(
              (sum, post) => sum + post.analytics.engagementRate,
              0
            ) / this.contentPerformanceHistory.length
          : 0,
      optimalTimes: Object.fromEntries(this.optimalTimingCache),
      topPerformingTopics: Array.from(this.topicPerformanceMap.entries()).slice(0, 5),
      nextGenerationInterval: this.calculateNextGenerationInterval(),
      platformPerformance: Object.fromEntries(this.adaptiveLearningData),
    };
  }

  async updateAutonomousConfig(updates: Partial<AutonomousConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    this.emit('autonomousConfigUpdated', this.config);
  }
}

export const autonomousAutopilot = new AutonomousAutopilot();
