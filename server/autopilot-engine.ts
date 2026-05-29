import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { platformAPI } from './platform-apis.js';
import { logger } from './logger.js';
import { advancedSocialAIService } from './services/advancedSocialAIService.js';
import { autopilotLearningService } from './services/autopilotLearningService.js';

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

interface AutopilotJob {
  id: string;
  type: 'content_generation' | 'content_publishing' | 'performance_analysis';
  scheduledAt: Date;
  platform: string;
  data: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retries: number;
  maxRetries: number;
}

interface AutopilotConfig {
  enabled: boolean;
  platforms: string[];
  topics: string[];
  postingFrequency: 'hourly' | 'daily' | 'twice-daily' | 'weekly';
  brandVoice: 'professional' | 'casual' | 'energetic' | 'informative';
  contentTypes: string[];
  targetAudience: string;
  businessGoals: string[];
  autoPublish: boolean;
  optimalTimesOnly: boolean;
  crossPostingEnabled: boolean;
  engagementThreshold: number;
}

export class AutopilotEngine extends EventEmitter {
  // Cap performance-data memory: keep only the most recent MAX_PERF_ENTRIES
  // content IDs. Without a cap, long-running autopilot instances accumulate
  // an entry per published piece of content and never release it.
  private static readonly MAX_PERF_ENTRIES = 2_000;

  private jobs: Map<string, AutopilotJob> = new Map();
  private config: AutopilotConfig;
  private isRunning: boolean = false;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private contentQueue: Map<string, any[]> = new Map();
  private performanceData: Map<string, any> = new Map();
  // Durable publish context keyed by contentId, captured at PUBLISH time.
  // The published item is shift()-ed off contentQueue immediately, so the
  // later (+2h) performance-analysis job can no longer recover its true
  // publishedAt / topic / contentType / hashtags / text from the queue.
  // This map preserves that context so optimal-time + topic learning train on
  // the real signal rather than synthetic now-2h / undefined fallbacks.
  private publishContext: Map<string, any> = new Map();
  private userId: string;

  constructor(userId: string) {
    super();
    this.userId = userId;
    this.config = this.getDefaultConfig();
  }

  static createForSocialAndAds(userId: string): AutopilotEngine {
    const engine = new AutopilotEngine(userId);
    engine.configure({
      enabled: false,
      platforms: ['Twitter', 'Instagram', 'TikTok', 'Facebook', 'LinkedIn'],
      postingFrequency: 'twice-daily',
      brandVoice: 'energetic',
      contentTypes: ['announcements', 'questions', 'tips', 'insights'],
      optimalTimesOnly: true,
      crossPostingEnabled: true,
      engagementThreshold: 0.03,
    });
    return engine;
  }

  static createForAutonomousUpdates(userId: string): AutopilotEngine {
    const engine = new AutopilotEngine(userId);
    engine.configure({
      enabled: false,
      platforms: ['Twitter', 'LinkedIn'],
      postingFrequency: 'daily',
      brandVoice: 'informative',
      contentTypes: ['announcements', 'insights'],
      optimalTimesOnly: true,
      crossPostingEnabled: false,
      engagementThreshold: 0.02,
    });
    return engine;
  }

  static createForSecurityIT(userId: string): AutopilotEngine {
    const engine = new AutopilotEngine(userId);
    engine.configure({
      enabled: false,
      platforms: ['Twitter', 'LinkedIn'],
      postingFrequency: 'weekly',
      brandVoice: 'professional',
      contentTypes: ['announcements', 'insights'],
      optimalTimesOnly: true,
      crossPostingEnabled: false,
      engagementThreshold: 0.01,
    });
    return engine;
  }

  private getDefaultConfig(): AutopilotConfig {
    return {
      enabled: false,
      platforms: [],
      topics: [],
      postingFrequency: 'daily',
      brandVoice: 'professional',
      contentTypes: ['tips', 'insights', 'questions', 'announcements'],
      targetAudience: '',
      businessGoals: [],
      autoPublish: false,
      optimalTimesOnly: true,
      crossPostingEnabled: false,
      engagementThreshold: 0.02,
    };
  }

  // Autopilot Configuration
  async configure(config: Partial<AutopilotConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    if (this.config.enabled && !this.isRunning) {
      await this.start();
    } else if (!this.config.enabled && this.isRunning) {
      await this.stop();
    }

    this.emit('configUpdated', this.config);
  }

  async getConfig(): Promise<AutopilotConfig> {
    return this.config;
  }

  // Autopilot Lifecycle
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('autopilotStarted');

    // Initialize content generation jobs
    await this.scheduleContentGeneration();

    // Start the job scheduler
    this.schedulerInterval = setInterval(() => {
      this.processJobs();
      this.pruneCompletedJobs();
    }, 60000); // Check every minute

    logger.info('Autopilot started with config:', this.config);
  }

  /** Remove completed/failed jobs older than 24 h to prevent the Map growing unbounded. */
  private pruneCompletedJobs(): void {
    const cutoff = Date.now() - 86_400_000;
    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.scheduledAt.getTime() < cutoff
      ) {
        this.jobs.delete(id);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    // Cancel pending jobs
    this.jobs.forEach((job) => {
      if (job.status === 'pending') {
        job.status = 'failed';
      }
    });

    this.emit('autopilotStopped');
    logger.info('Autopilot stopped');
  }

  // Content Generation Pipeline
  private async scheduleContentGeneration(): Promise<void> {
    if (!this.config.enabled || this.config.platforms.length === 0) return;

    for (const platform of this.config.platforms) {
      const nextPostTime = await this.calculateNextPostTime(platform);

      // Schedule content generation 30 minutes before posting
      const generationTime = new Date(nextPostTime.getTime() - 30 * 60 * 1000);

      const job: AutopilotJob = {
        id: randomUUID(),
        type: 'content_generation',
        scheduledAt: generationTime,
        platform,
        data: {
          topic: this.selectNextTopic(),
          brandVoice: this.config.brandVoice,
          contentType: this.selectContentType(),
        },
        status: 'pending',
        retries: 0,
        maxRetries: 3,
      };

      this.jobs.set(job.id, job);

      // Schedule the actual publishing
      const publishJob: AutopilotJob = {
        id: randomUUID(),
        type: 'content_publishing',
        scheduledAt: nextPostTime,
        platform,
        data: { contentJobId: job.id },
        status: 'pending',
        retries: 0,
        maxRetries: 2,
      };

      this.jobs.set(publishJob.id, publishJob);
    }

    // Schedule next batch based on frequency
    const nextBatchTime = this.calculateNextBatchTime();
    setTimeout(() => {
      this.scheduleContentGeneration();
    }, nextBatchTime - Date.now());
  }

  private async calculateNextPostTime(platform: string): Promise<Date> {
    const now = new Date();
    const optimalTimes = await this.getOptimalTimesForPlatform(platform);

    // Find next optimal time
    let nextTime = new Date(now);

    switch (this.config.postingFrequency) {
      case 'hourly':
        nextTime.setHours(now.getHours() + 1, 0, 0, 0);
        break;
      case 'twice-daily':
        const morningHour = optimalTimes[0] || 9;
        const eveningHour = optimalTimes[1] || 17;

        if (now.getHours() < morningHour) {
          nextTime.setHours(morningHour, 0, 0, 0);
        } else if (now.getHours() < eveningHour) {
          nextTime.setHours(eveningHour, 0, 0, 0);
        } else {
          nextTime.setDate(nextTime.getDate() + 1);
          nextTime.setHours(morningHour, 0, 0, 0);
        }
        break;
      case 'daily': {
        const optimalHour = optimalTimes[0] || 14;
        // If the optimal hour hasn't passed yet today, schedule for today
        // (the prior implementation always pushed to tomorrow, wasting up
        // to a full day's posting window on every reschedule).
        if (now.getHours() < optimalHour) {
          nextTime.setHours(optimalHour, 0, 0, 0);
        } else {
          nextTime.setDate(nextTime.getDate() + 1);
          nextTime.setHours(optimalHour, 0, 0, 0);
        }
        break;
      }
      case 'weekly':
        nextTime.setDate(nextTime.getDate() + 7);
        nextTime.setHours(optimalTimes[0] || 14, 0, 0, 0);
        break;
    }

    return nextTime;
  }

  private calculateNextBatchTime(): number {
    const now = Date.now();
    const frequency = this.config.postingFrequency;

    switch (frequency) {
      case 'hourly':
        return now + 60 * 60 * 1000; // 1 hour
      case 'twice-daily':
        return now + 12 * 60 * 60 * 1000; // 12 hours
      case 'daily':
        return now + 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return now + 7 * 24 * 60 * 60 * 1000; // 7 days
      default:
        return now + 24 * 60 * 60 * 1000;
    }
  }

  private async getOptimalTimesForPlatform(platform: string): Promise<number[]> {
    // Prefer learned times derived from this artist's real performance data
    // — autopilotLearningService aggregates the last 30 days from
    // autopilot_learning_data by (hour, dayOfWeek) and returns descending
    // average engagement. Fall back to industry-average hours when there
    // is not yet enough history for this user/platform pair.
    try {
      const platformKey = platform.toLowerCase();
      const learned = await autopilotLearningService.getOptimalPostingTimes(
        this.userId,
        platformKey,
      );
      if (learned && learned.length > 0) {
        const hours = Array.from(new Set(learned.map((r) => r.hour))).slice(0, 5);
        if (hours.length > 0) return hours;
      }
    } catch (err) {
      logger.warn(
        { err },
        `[Autopilot] Failed to load learned optimal times for ${platform}, using defaults`,
      );
    }

    const platformTimes: Record<string, number[]> = {
      twitter: [9, 12, 15, 18],
      instagram: [8, 11, 14, 19],
      linkedin: [8, 12, 17],
      facebook: [9, 13, 15, 20],
      tiktok: [6, 10, 16, 19],
    };
    return platformTimes[platform.toLowerCase()] || [14];
  }

  private selectNextTopic(): string {
    if (this.config.topics.length === 0) {
      return 'business insights';
    }

    // Rotate through topics to ensure variety
    const topicIndex = Date.now() % this.config.topics.length;
    return this.config.topics[Math.floor(topicIndex)];
  }

  private selectContentType(): string {
    const types = this.config.contentTypes;
    return types[seededIndex(this.userId + ':' + types.join(','), types.length)];
  }

  // Job Processing
  private async processJobs(): Promise<void> {
    const now = new Date();
    const pendingJobs = Array.from(this.jobs.values())
      .filter((job) => job.status === 'pending' && job.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    for (const job of pendingJobs) {
      await this.executeJob(job);
    }
  }

  private async executeJob(job: AutopilotJob): Promise<void> {
    try {
      job.status = 'running';
      this.emit('jobStarted', job);

      switch (job.type) {
        case 'content_generation':
          await this.executeContentGeneration(job);
          break;
        case 'content_publishing':
          await this.executeContentPublishing(job);
          break;
        case 'performance_analysis':
          await this.executePerformanceAnalysis(job);
          break;
      }

      job.status = 'completed';
      this.emit('jobCompleted', job);
    } catch (error: unknown) {
      logger.warn({ err: error }, `Job ${job.id} failed:`);

      if (job.retries < job.maxRetries) {
        job.retries++;
        job.status = 'pending';
        job.scheduledAt = new Date(Date.now() + 5 * 60 * 1000); // Retry in 5 minutes
      } else {
        job.status = 'failed';
        this.emit('jobFailed', job, error);
      }
    }
  }

  private async executeContentGeneration(job: AutopilotJob): Promise<void> {
    const { topic, brandVoice, contentType } = job.data;

    try {
      // This would call your actual AI service
      const generatedContent = await this.generateContentForAutopilot({
        topic,
        platform: job.platform,
        brandVoice,
        contentType,
        targetAudience: this.config.targetAudience,
        businessGoals: this.config.businessGoals,
      });

      // Store generated content in-memory queue item.
      // Persist topic + contentType so publish context (captured after the
      // item is shift()-ed off the queue) carries the real values into
      // performance analysis instead of synthetic 'social_post' / undefined.
      const content = {
        id: randomUUID(),
        text: generatedContent.text,
        hashtags: generatedContent.hashtags,
        platforms: [job.platform],
        status: 'draft',
        type: contentType,
        topic,
        createdAt: new Date(),
      };

      // Add to content queue
      if (!this.contentQueue.has(job.platform)) {
        this.contentQueue.set(job.platform, []);
      }
      this.contentQueue.get(job.platform)!.push(content);

      this.emit('contentGenerated', { job, content });
    } catch (error: unknown) {
      // If AI service is not configured, create a placeholder request
      throw new Error(
        'AI content generation service not configured. Please connect your AI service.'
      );
    }
  }

  private async executeContentPublishing(job: AutopilotJob): Promise<void> {
    const platformQueue = this.contentQueue.get(job.platform);

    if (!platformQueue || platformQueue.length === 0) {
      throw new Error(`No content available for platform ${job.platform}`);
    }

    const content = platformQueue.shift()!;

    if (this.config.autoPublish) {
      // Publish immediately
      const results = await platformAPI.publishContent(content, [job.platform], this.userId);
      const successfulResults = results.filter((r: unknown) => r.success);

      if (successfulResults.length > 0) {
        content.status = 'published';
        content.publishedAt = new Date();

        // Persist publish context durably (content is no longer in the queue
        // after shift()). Evict oldest first when at cap, matching performanceData.
        if (this.publishContext.size >= AutopilotEngine.MAX_PERF_ENTRIES) {
          const oldestKey = this.publishContext.keys().next().value;
          if (oldestKey !== undefined) this.publishContext.delete(oldestKey);
        }
        this.publishContext.set(content.id, {
          publishedAt: content.publishedAt,
          type: content.type ?? 'social_post',
          hashtags: content.hashtags ?? [],
          text: content.text,
          topic: content.topic,
        });

        // Schedule performance analysis for later
        const analysisJob: AutopilotJob = {
          id: randomUUID(),
          type: 'performance_analysis',
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours later
          platform: job.platform,
          data: { contentId: content.id, postId: successfulResults[0].postId },
          status: 'pending',
          retries: 0,
          maxRetries: 2,
        };

        this.jobs.set(analysisJob.id, analysisJob);
      }

      this.emit('contentPublished', { job, content, results });
    } else {
      // Schedule for review
      content.status = 'scheduled';
      this.emit('contentScheduled', { job, content });
    }
  }

  private async executePerformanceAnalysis(job: AutopilotJob): Promise<void> {
    const { contentId, postId } = job.data;

    // Collect real engagement data
    const analytics = await platformAPI.collectEngagementData(postId, job.platform, this.userId);

    if (analytics) {
      // Store performance data for learning — evict oldest entry first when at cap.
      if (this.performanceData.size >= AutopilotEngine.MAX_PERF_ENTRIES) {
        const oldestKey = this.performanceData.keys().next().value;
        if (oldestKey !== undefined) this.performanceData.delete(oldestKey);
      }
      // Recover publish context from the durable map captured at publish time.
      // (The content was shift()-ed off contentQueue at publish, so a queue
      // lookup here would miss and fall back to synthetic now-2h / undefined.)
      const ctx = this.publishContext.get(contentId);
      this.performanceData.set(contentId, {
        platform: job.platform,
        engagement: analytics,
        timestamp: new Date(),
        publishedAt: ctx?.publishedAt instanceof Date
          ? ctx.publishedAt
          : new Date(Date.now() - 2 * 60 * 60 * 1000),
        contentType: ctx?.type ?? 'social_post',
        hashtags: ctx?.hashtags ?? [],
        text: ctx?.text,
        postId,
        topic: ctx?.topic,
      });
      // NOTE: do NOT delete publishContext here. performance_analysis jobs
      // have maxRetries=2; if a downstream step throws after this point the
      // job is retried, and an early delete would leave the retry without
      // context (falling back to synthetic now-2h / 'social_post'). Memory is
      // already bounded by the cap-based eviction at publish time, so stale
      // entries are reclaimed there.

      // Learn from performance
      await this.learnFromPerformance(contentId, analytics);

      this.emit('performanceAnalyzed', { job, analytics });
    }
  }

  // AI Content Generation using Advanced Social AI (GPT-5.2 Level)
  private async generateContentForAutopilot(params: {
    topic: string;
    platform: string;
    brandVoice: string;
    contentType: string;
    targetAudience: string;
    businessGoals: string[];
  }): Promise<{ text: string; hashtags: string[]; hook?: string; cta?: string; viralScore?: number }> {
    try {
      // Use Advanced Social AI for GPT-5.2 level content generation
      const advancedResult = await advancedSocialAIService.generateAdvancedContent({
        userId: this.userId,
        topic: params.topic,
        platforms: [params.platform.toLowerCase()],
        objective: this.mapGoalsToObjective(params.businessGoals),
        tone: this.mapBrandVoiceToTone(params.brandVoice),
        targetAudience: params.targetAudience?.toLowerCase().replace(/\s+/g, '_'),
        contentType: this.mapContentType(params.contentType),
        includeHashtags: true,
        includeEmojis: true,
        variantCount: 3,
      });

      logger.info(`[Autopilot] Generated content with Advanced AI: score=${advancedResult.scoring.overall.toFixed(1)}, viral=${advancedResult.viralPotential.score.toFixed(1)}`);

      return {
        text: advancedResult.primary.body,
        hashtags: advancedResult.primary.hashtags,
        hook: advancedResult.primary.hook,
        cta: advancedResult.primary.callToAction,
        viralScore: advancedResult.viralPotential.score,
      };
    } catch (error) {
      // Advanced Social AI routes exclusively through MaxCore. If it fails,
      // surface the error rather than degrading to a generic on-box generator
      // — silent fallback was producing low-quality, off-brand content and
      // hiding real MaxCore outages from the operator.
      logger.warn(
        { err: error },
        `[Autopilot] Advanced AI generation failed for ${params.platform} — skipping this generation cycle`,
      );
      throw error instanceof Error
        ? error
        : new Error(`Advanced Social AI generation failed: ${String(error)}`);
    }
  }

  private mapGoalsToObjective(goals: string[]): 'awareness' | 'engagement' | 'conversions' | 'viral' {
    const goalsLower = goals.map(g => g.toLowerCase()).join(' ');
    if (goalsLower.includes('sales') || goalsLower.includes('revenue') || goalsLower.includes('conversion')) {
      return 'conversions';
    }
    if (goalsLower.includes('viral') || goalsLower.includes('growth') || goalsLower.includes('reach')) {
      return 'viral';
    }
    if (goalsLower.includes('brand') || goalsLower.includes('awareness')) {
      return 'awareness';
    }
    return 'engagement';
  }

  private mapBrandVoiceToTone(brandVoice: string): 'professional' | 'casual' | 'energetic' | 'inspirational' | 'humorous' | 'storytelling' {
    const voiceLower = brandVoice.toLowerCase();
    if (voiceLower === 'professional') return 'professional';
    if (voiceLower === 'energetic') return 'energetic';
    if (voiceLower === 'informative') return 'professional';
    if (voiceLower === 'humorous' || voiceLower === 'funny') return 'humorous';
    if (voiceLower === 'inspirational' || voiceLower === 'motivational') return 'inspirational';
    return 'casual';
  }

  private mapContentType(contentType: string): 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling' {
    const typeLower = contentType.toLowerCase();
    if (typeLower === 'announcements' || typeLower === 'announcement') return 'announcement';
    if (typeLower === 'behind-the-scenes' || typeLower === 'bts') return 'behind_scenes';
    if (typeLower === 'questions' || typeLower === 'polls') return 'engagement';
    if (typeLower === 'promotional' || typeLower === 'promo') return 'promotional';
    if (typeLower === 'tips' || typeLower === 'insights') return 'storytelling';
    return 'engagement';
  }

  // Performance Learning
  private async learnFromPerformance(contentId: string, analytics: unknown): Promise<void> {
    // Persist real engagement to autopilot_learning_data via the canonical
    // learning service. This is the same store consumed by
    // getOptimalPostingTimes(), getContentPatternWeights() and the
    // recommendations engine — so every published piece of content now
    // measurably tightens the feedback loop for this artist.
    const a = (analytics ?? {}) as Record<string, unknown>;
    const cached = this.performanceData.get(contentId) as Record<string, unknown> | undefined;
    const platform = String(cached?.platform ?? a.platform ?? 'unknown');
    const engagementRate = Number(a.engagementRate ?? 0);

    try {
      await autopilotLearningService.recordPerformance(
        this.userId,
        {
          platform,
          contentType: String(cached?.contentType ?? 'social_post'),
          hookType: cached?.hookType ? String(cached.hookType) : undefined,
          hashtags: Array.isArray(cached?.hashtags) ? (cached!.hashtags as string[]) : [],
          contentText: cached?.text ? String(cached.text) : undefined,
          postId: cached?.postId ? String(cached.postId) : undefined,
          postedAt: cached?.publishedAt instanceof Date
            ? (cached.publishedAt as Date)
            : new Date(),
          metadata: { contentId },
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
      logger.warn({ err }, `[Autopilot] Failed to record performance for ${contentId}`);
    }

    if (engagementRate > this.config.engagementThreshold * 2) {
      logger.info(`High performing content detected: ${contentId} (${engagementRate}% engagement)`);
    } else if (engagementRate < this.config.engagementThreshold * 0.5) {
      logger.info(`Low performing content detected: ${contentId} (${engagementRate}% engagement)`);
    }
  }

  // Status and Monitoring
  async getStatus(): Promise<{
    isRunning: boolean;
    totalJobs: number;
    pendingJobs: number;
    completedJobs: number;
    failedJobs: number;
    nextScheduledJob?: Date;
  }> {
    const jobs = Array.from(this.jobs.values());
    const pendingJobs = jobs.filter((j) => j.status === 'pending');
    const nextJob = pendingJobs.sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    )[0];

    return {
      isRunning: this.isRunning,
      totalJobs: jobs.length,
      pendingJobs: pendingJobs.length,
      completedJobs: jobs.filter((j) => j.status === 'completed').length,
      failedJobs: jobs.filter((j) => j.status === 'failed').length,
      nextScheduledJob: nextJob?.scheduledAt,
    };
  }

  async getRecentActivity(limit: number = 10): Promise<AutopilotJob[]> {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
      .slice(0, limit);
  }

  // Content Queue Management
  async getContentQueue(platform?: string): Promise<Map<string, any[]> | any[]> {
    if (platform) {
      return this.contentQueue.get(platform) || [];
    }
    return this.contentQueue;
  }

  async clearContentQueue(platform?: string): Promise<void> {
    if (platform) {
      this.contentQueue.delete(platform);
    } else {
      this.contentQueue.clear();
    }
  }
}

export const autopilotEngine = new AutopilotEngine();
