import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { platformAPI } from './platform-apis.js';
import { customAI } from './custom-ai-engine.js';
import { logger } from './logger.js';

interface AutopilotJob {
  id: string;
  type: 'content_generation' | 'content_publishing' | 'performance_analysis';
  scheduledAt: Date;
  platform: string;
  data: any;
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
  private jobs: Map<string, AutopilotJob> = new Map();
  private config: AutopilotConfig;
  private isRunning: boolean = false;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private contentQueue: Map<string, any[]> = new Map();
  private performanceData: Map<string, any> = new Map();
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
    }, 60000); // Check every minute

    logger.info('Autopilot started with config:', this.config);
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
      const nextPostTime = this.calculateNextPostTime(platform);

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

  private calculateNextPostTime(platform: string): Date {
    const now = new Date();
    const optimalTimes = this.getOptimalTimesForPlatform(platform);

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
      case 'daily':
        const optimalHour = optimalTimes[0] || 14;
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(optimalHour, 0, 0, 0);
        break;
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

  private getOptimalTimesForPlatform(platform: string): number[] {
    // Real implementation would query actual audience activity data
    const platformTimes: Record<string, number[]> = {
      Twitter: [9, 12, 15, 18],
      Instagram: [8, 11, 14, 19],
      LinkedIn: [8, 12, 17],
      Facebook: [9, 13, 15, 20],
      TikTok: [6, 10, 16, 19],
    };

    return platformTimes[platform] || [14];
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
    return types[Math.floor(Math.random() * types.length)];
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
      logger.error(`Job ${job.id} failed:`, error);

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

      // Store generated content in-memory queue item
      const content = {
        id: randomUUID(),
        text: generatedContent.text,
        hashtags: generatedContent.hashtags,
        platforms: [job.platform],
        status: 'draft',
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
      // Store performance data for learning
      this.performanceData.set(contentId, {
        platform: job.platform,
        engagement: analytics,
        timestamp: new Date(),
      });

      // Learn from performance
      await this.learnFromPerformance(contentId, analytics);

      this.emit('performanceAnalyzed', { job, analytics });
    }
  }

  // AI Content Generation using custom AI engine
  private async generateContentForAutopilot(params: {
    topic: string;
    platform: string;
    brandVoice: string;
    contentType: string;
    targetAudience: string;
    businessGoals: string[];
  }): Promise<{ text: string; hashtags: string[] }> {
    const generatedContent = await customAI.generateContent({
      topic: params.topic,
      platform: params.platform,
      brandVoice: params.brandVoice,
      contentType: params.contentType,
      targetAudience: params.targetAudience,
      businessGoals: params.businessGoals,
    });

    return {
      text: generatedContent.text,
      hashtags: generatedContent.hashtags,
    };
  }

  // Performance Learning
  private async learnFromPerformance(contentId: string, analytics: unknown): Promise<void> {
    // Get content details to extract template information
    // In this minimal integration, we don't persist content externally.
    const content = { id: contentId, text: '', contentType: 'tips', platform: 'Twitter' } as any;

    // Extract content metadata for learning
    const contentType = content.contentType || 'tips';
    const platform = content.platform || 'Twitter';

    // Determine template index based on content patterns
    const templateIndex = this.extractTemplateIndex(content.text, contentType);

    // Feed performance data back to AI engine for learning
    customAI.updatePerformanceData(contentType, platform, templateIndex, analytics);

    const engagementRate = analytics.engagementRate;

    // Adjust future content strategy based on performance
    if (engagementRate > this.config.engagementThreshold * 2) {
      logger.info(`High performing content detected: ${contentId} (${engagementRate}% engagement)`);
    } else if (engagementRate < this.config.engagementThreshold * 0.5) {
      logger.info(`Low performing content detected: ${contentId} (${engagementRate}% engagement)`);
    }
  }

  private extractTemplateIndex(text: string, contentType: string): number {
    // Simple heuristic to determine which template was likely used
    if (text.includes('💡') || text.includes('Pro tip')) return 0;
    if (text.includes('🔥') || text.includes('Quick tip')) return 1;
    if (text.includes('✨') || text.includes('Want to')) return 2;
    if (text.includes('📈')) return 3;

    return 0; // Default
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
