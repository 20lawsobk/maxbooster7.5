import { storage } from '../storage';
import { socialQueueService } from './socialQueueService';
import { advertisingDispatchService } from './advertisingDispatchService';
import { approvalService } from './approvalService';
import { distributionService } from './distributionService';
import { viralScoringService } from './viralScoring';
import { timingOptimizerService as timingOptimizer } from './timingOptimizer';
import { contentVariantGeneratorService as contentVariantGenerator } from './contentVariantGenerator';
import { algorithmIntelligenceService as algorithmIntelligence } from './algorithmIntelligence';
import { aiContentService } from './aiContentService';
import { aiAnalyticsService } from './aiAnalyticsService';
import type { SocialPost, AdCampaign, Release } from '@shared/schema';
import { logger } from '../logger.js';
import { EventEmitter } from 'events';
import sharp from 'sharp';

interface AutonomousConfig {
  socialPosting: boolean;
  advertising: boolean;
  distribution: boolean;
  analytics: boolean;
  contentOptimization: boolean;
  imageProcessing: boolean;
  audioProcessing: boolean;
  marketplaceManagement: boolean;
  royaltyOptimization: boolean;
  growthHacking: boolean;
  viralOptimization: boolean;
  crossPlatformSync: boolean;
  aiLearning: boolean;
}

interface AutonomousMetrics {
  postsScheduled: number;
  postsPublished: number;
  campaignsLaunched: number;
  campaignsOptimized: number;
  releasesDistributed: number;
  imagesProcessed: number;
  audioFilesProcessed: number;
  analyticsGenerated: number;
  viralScoresComputed: number;
  contentVariantsGenerated: number;
  aiDecisionsMade: number;
  revenueOptimized: number;
  lastUpdated: Date;
}

interface AutoContentResult {
  success: boolean;
  contentId?: string;
  variants?: string[];
  viralScore?: number;
  optimalTiming?: Date;
  platforms?: string[];
}

interface AutoDistributionResult {
  success: boolean;
  releaseId?: string;
  dispatchedTo?: string[];
  estimatedReach?: number;
  royaltyProjection?: number;
}

interface AutoImageResult {
  success: boolean;
  processedUrl?: string;
  thumbnails?: string[];
  dimensions?: { width: number; height: number };
  optimizedSize?: number;
}

export class AutonomousService extends EventEmitter {
  private autonomousMode: boolean;
  private autonomousWhitelist: Set<string> = new Set();
  private config: AutonomousConfig;
  private metrics: AutonomousMetrics;
  private processingQueue: Map<string, any> = new Map();
  private learningData: Map<string, any> = new Map();
  private operationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.autonomousMode = process.env.AUTONOMOUS_MODE === 'true' || false;
    this.config = this.getDefaultConfig();
    this.metrics = this.initializeMetrics();
    this.loadAutonomousWhitelist();
  }

  private getDefaultConfig(): AutonomousConfig {
    return {
      socialPosting: true,
      advertising: true,
      distribution: true,
      analytics: true,
      contentOptimization: true,
      imageProcessing: true,
      audioProcessing: true,
      marketplaceManagement: true,
      royaltyOptimization: true,
      growthHacking: true,
      viralOptimization: true,
      crossPlatformSync: true,
      aiLearning: true,
    };
  }

  private initializeMetrics(): AutonomousMetrics {
    return {
      postsScheduled: 0,
      postsPublished: 0,
      campaignsLaunched: 0,
      campaignsOptimized: 0,
      releasesDistributed: 0,
      imagesProcessed: 0,
      audioFilesProcessed: 0,
      analyticsGenerated: 0,
      viralScoresComputed: 0,
      contentVariantsGenerated: 0,
      aiDecisionsMade: 0,
      revenueOptimized: 0,
      lastUpdated: new Date(),
    };
  }

  private async loadAutonomousWhitelist(): Promise<void> {
    try {
      this.autonomousWhitelist = new Set();
      if (process.env.ADMIN_USER_IDS) {
        const adminIds = process.env.ADMIN_USER_IDS.split(',');
        adminIds.forEach((id) => this.autonomousWhitelist.add(id.trim()));
      }
    } catch (error: unknown) {
      logger.error('Error loading autonomous whitelist:', error);
    }
  }

  isAutonomousEnabled(userId: string): boolean {
    return this.autonomousMode || this.autonomousWhitelist.has(userId);
  }

  async setAutonomousMode(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      this.autonomousWhitelist.add(userId);
    } else {
      this.autonomousWhitelist.delete(userId);
    }
    await storage.updateUser(userId, { autonomousEnabled: enabled });
    this.emit('autonomousModeChanged', { userId, enabled });
  }

  async configure(userId: string, updates: Partial<AutonomousConfig>): Promise<AutonomousConfig> {
    if (!this.isAutonomousEnabled(userId)) {
      throw new Error('Autonomous mode not enabled for this user');
    }
    this.config = { ...this.config, ...updates };
    this.emit('configUpdated', { userId, config: this.config });
    return this.config;
  }

  getMetrics(): AutonomousMetrics {
    return { ...this.metrics };
  }

  async postContent(
    userId: string,
    content: Partial<SocialPost>,
    platforms: string[]
  ): Promise<{ success: boolean; postId?: string; requiresApproval: boolean }> {
    try {
      const isAutonomous = this.isAutonomousEnabled(userId);

      if (isAutonomous) {
        logger.info(`[AUTONOMOUS] Publishing content directly for user ${userId}`);

        const post = await storage.createSocialPost({
          ...content,
          userId,
          platforms,
          status: 'scheduled',
          approvalStatus: 'auto-approved',
          approvedBy: 'autonomous-system',
          approvedAt: new Date(),
        } as any);

        await socialQueueService.schedulePost(post.id, new Date());
        await this.dispatchAutonomousContent(post.id);

        this.metrics.postsPublished++;
        this.metrics.lastUpdated = new Date();

        return {
          success: true,
          postId: post.id,
          requiresApproval: false,
        };
      } else {
        logger.info(`[APPROVAL] Routing content through approval for user ${userId}`);

        const post = await storage.createSocialPost({
          ...content,
          userId,
          platforms,
          status: 'draft',
          approvalStatus: 'pending',
        } as any);

        await approvalService.submitForApproval({
          type: 'social_post',
          itemId: post.id,
          userId,
          metadata: { platforms, content: content.content },
        });

        this.metrics.postsScheduled++;

        return {
          success: true,
          postId: post.id,
          requiresApproval: true,
        };
      }
    } catch (error: unknown) {
      logger.error('Error in autonomous posting:', error);
      return {
        success: false,
        requiresApproval: !this.isAutonomousEnabled(userId),
      };
    }
  }

  async launchCampaign(
    userId: string,
    campaign: Partial<AdCampaign>
  ): Promise<{ success: boolean; campaignId?: string; requiresApproval: boolean }> {
    try {
      const isAutonomous = this.isAutonomousEnabled(userId);

      if (isAutonomous) {
        logger.info(`[AUTONOMOUS] Launching campaign directly for user ${userId}`);

        const newCampaign = await storage.createAdCampaign({
          ...campaign,
          userId,
          status: 'active',
          approvalStatus: 'auto-approved',
          approvedBy: 'autonomous-system',
          approvedAt: new Date(),
        } as any);

        await advertisingDispatchService.startCampaign(newCampaign.id);
        this.startCampaignOptimization(newCampaign.id);

        this.metrics.campaignsLaunched++;
        this.metrics.lastUpdated = new Date();

        return {
          success: true,
          campaignId: newCampaign.id,
          requiresApproval: false,
        };
      } else {
        logger.info(`[APPROVAL] Routing campaign through approval for user ${userId}`);

        const newCampaign = await storage.createAdCampaign({
          ...campaign,
          userId,
          status: 'draft',
          approvalStatus: 'pending',
        } as any);

        await approvalService.submitForApproval({
          type: 'ad_campaign',
          itemId: newCampaign.id,
          userId,
          metadata: {
            budget: campaign.budget,
            targetAudience: campaign.targetAudience,
          },
        });

        return {
          success: true,
          campaignId: newCampaign.id,
          requiresApproval: true,
        };
      }
    } catch (error: unknown) {
      logger.error('Error in autonomous campaign launch:', error);
      return {
        success: false,
        requiresApproval: !this.isAutonomousEnabled(userId),
      };
    }
  }

  async autoGenerateContent(
    userId: string,
    topic: string,
    platforms: string[]
  ): Promise<AutoContentResult> {
    try {
      if (!this.config.contentOptimization) {
        return { success: false };
      }

      logger.info(`[AUTO-CONTENT] Generating optimized content for ${userId}`);

      const variants = await contentVariantGenerator.generateVariants({
        topic,
        platforms,
        count: 5,
        styles: ['engaging', 'professional', 'casual', 'viral', 'educational'],
      });

      const scoredVariants = await Promise.all(
        variants.map(async (variant: any) => {
          const viralScore = await viralScoringService.calculateViralScore({
            content: variant.content,
            platform: variant.platform,
            hashtags: variant.hashtags,
          });
          return { ...variant, viralScore };
        })
      );

      const bestVariant = scoredVariants.sort((a, b) => b.viralScore - a.viralScore)[0];

      const optimalTiming = await timingOptimizer.getOptimalPostingTime({
        userId,
        platforms,
        contentType: 'generated',
      });

      this.metrics.contentVariantsGenerated += variants.length;
      this.metrics.viralScoresComputed += scoredVariants.length;
      this.metrics.aiDecisionsMade++;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        contentId: bestVariant.id,
        variants: scoredVariants.map((v: any) => v.content),
        viralScore: bestVariant.viralScore,
        optimalTiming: optimalTiming.recommendedTime,
        platforms,
      };
    } catch (error: unknown) {
      logger.error('Error in auto content generation:', error);
      return { success: false };
    }
  }

  async autoDistributeRelease(
    userId: string,
    releaseData: Partial<Release>
  ): Promise<AutoDistributionResult> {
    try {
      if (!this.config.distribution) {
        return { success: false };
      }

      logger.info(`[AUTO-DISTRIBUTE] Processing release for ${userId}`);

      const release = await distributionService.createRelease({
        ...releaseData,
        userId,
        status: 'processing',
      } as any);

      const providers = ['spotify', 'apple_music', 'amazon_music', 'youtube_music', 'tidal', 'deezer'];
      const dispatchResults = [];

      for (const provider of providers) {
        try {
          const result = await distributionService.submitToProvider(release.id, provider, userId);
          dispatchResults.push({ provider, ...result });
        } catch (err) {
          logger.warn(`Failed to dispatch to ${provider}:`, err);
        }
      }

      const successfulDispatches = dispatchResults.filter(r => r.success);

      const estimatedReach = successfulDispatches.length * 50000;
      const royaltyProjection = estimatedReach * 0.004;

      this.metrics.releasesDistributed++;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        releaseId: release.id,
        dispatchedTo: successfulDispatches.map(r => r.provider),
        estimatedReach,
        royaltyProjection,
      };
    } catch (error: unknown) {
      logger.error('Error in auto distribution:', error);
      return { success: false };
    }
  }

  async autoProcessImage(
    imageBuffer: Buffer,
    options: {
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
      resize?: { width: number; height: number };
      generateThumbnails?: boolean;
      optimize?: boolean;
    } = {}
  ): Promise<AutoImageResult> {
    try {
      if (!this.config.imageProcessing) {
        return { success: false };
      }

      logger.info('[AUTO-IMAGE] Processing image with Sharp');

      let processor = sharp(imageBuffer);
      const metadata = await processor.metadata();

      if (options.resize) {
        processor = processor.resize(options.resize.width, options.resize.height, {
          fit: 'cover',
          position: 'center',
        });
      }

      if (options.optimize) {
        processor = processor.normalize().sharpen();
      }

      const format = options.format || 'webp';
      const quality = options.quality || 85;

      let outputBuffer: Buffer;
      switch (format) {
        case 'jpeg':
          outputBuffer = await processor.jpeg({ quality, progressive: true }).toBuffer();
          break;
        case 'png':
          outputBuffer = await processor.png({ compressionLevel: 9 }).toBuffer();
          break;
        case 'webp':
        default:
          outputBuffer = await processor.webp({ quality }).toBuffer();
          break;
      }

      const thumbnails: string[] = [];
      if (options.generateThumbnails) {
        const thumbnailSizes = [
          { width: 100, height: 100 },
          { width: 300, height: 300 },
          { width: 600, height: 600 },
        ];

        for (const size of thumbnailSizes) {
          const thumbBuffer = await sharp(imageBuffer)
            .resize(size.width, size.height, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();
          
          const base64 = thumbBuffer.toString('base64');
          thumbnails.push(`data:image/webp;base64,${base64}`);
        }
      }

      this.metrics.imagesProcessed++;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        processedUrl: `data:image/${format};base64,${outputBuffer.toString('base64')}`,
        thumbnails,
        dimensions: {
          width: options.resize?.width || metadata.width || 0,
          height: options.resize?.height || metadata.height || 0,
        },
        optimizedSize: outputBuffer.length,
      };
    } catch (error: unknown) {
      logger.error('Error in auto image processing:', error);
      return { success: false };
    }
  }

  async autoProcessArtwork(
    imageBuffer: Buffer,
    releaseType: 'single' | 'EP' | 'album'
  ): Promise<AutoImageResult> {
    const standardSize = 3000;
    
    return this.autoProcessImage(imageBuffer, {
      resize: { width: standardSize, height: standardSize },
      format: 'jpeg',
      quality: 100,
      generateThumbnails: true,
      optimize: true,
    });
  }

  async autoOptimizeForPlatform(
    imageBuffer: Buffer,
    platform: string
  ): Promise<AutoImageResult> {
    const platformSpecs: Record<string, { width: number; height: number; format: 'jpeg' | 'png' | 'webp' }> = {
      instagram_post: { width: 1080, height: 1080, format: 'jpeg' },
      instagram_story: { width: 1080, height: 1920, format: 'jpeg' },
      twitter: { width: 1200, height: 675, format: 'png' },
      facebook: { width: 1200, height: 630, format: 'jpeg' },
      youtube_thumbnail: { width: 1280, height: 720, format: 'jpeg' },
      spotify_cover: { width: 3000, height: 3000, format: 'jpeg' },
      tiktok: { width: 1080, height: 1920, format: 'jpeg' },
      linkedin: { width: 1200, height: 627, format: 'png' },
    };

    const specs = platformSpecs[platform] || platformSpecs.instagram_post;

    return this.autoProcessImage(imageBuffer, {
      resize: { width: specs.width, height: specs.height },
      format: specs.format,
      quality: 95,
      optimize: true,
    });
  }

  async autoAnalyzePerformance(userId: string): Promise<{
    success: boolean;
    insights?: any;
    recommendations?: string[];
    predictions?: any;
  }> {
    try {
      if (!this.config.analytics) {
        return { success: false };
      }

      logger.info(`[AUTO-ANALYTICS] Generating insights for ${userId}`);

      const analyticsData = await storage.getAnalyticsData(userId);
      
      const insights = {
        totalEngagement: analyticsData?.totalEngagement || 0,
        growthRate: analyticsData?.growthRate || 0,
        topPerformingContent: analyticsData?.topContent || [],
        audienceInsights: analyticsData?.audienceData || {},
        revenueMetrics: analyticsData?.revenue || {},
      };

      const recommendations: string[] = [];

      if (insights.growthRate < 5) {
        recommendations.push('Increase posting frequency during peak hours');
        recommendations.push('Experiment with more video content');
      }

      if (insights.totalEngagement < 1000) {
        recommendations.push('Use more trending hashtags');
        recommendations.push('Engage with audience comments within 1 hour');
      }

      recommendations.push('Cross-promote content across all platforms');
      recommendations.push('Schedule posts during optimal engagement windows');

      const predictions = {
        projectedGrowth: insights.growthRate * 1.15,
        estimatedReach: insights.totalEngagement * 12,
        revenueProjection: (insights.revenueMetrics.monthly || 0) * 1.2,
        viralPotential: 0.35 + (insights.growthRate / 100),
      };

      this.metrics.analyticsGenerated++;
      this.metrics.aiDecisionsMade++;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        insights,
        recommendations,
        predictions,
      };
    } catch (error: unknown) {
      logger.error('Error in auto analytics:', error);
      return { success: false };
    }
  }

  async autoOptimizeGrowth(userId: string): Promise<{
    success: boolean;
    optimizations?: string[];
    viralScore?: number;
    recommendations?: any;
  }> {
    try {
      if (!this.config.growthHacking) {
        return { success: false };
      }

      logger.info(`[AUTO-GROWTH] Optimizing growth for ${userId}`);

      const algorithmInsights = await algorithmIntelligence.analyzeAlgorithm({
        platforms: ['instagram', 'tiktok', 'twitter', 'youtube'],
        timeframe: '7d',
      });

      const optimizations: string[] = [];

      if (algorithmInsights.trendingFormats) {
        optimizations.push(`Focus on ${algorithmInsights.trendingFormats.join(', ')} content formats`);
      }

      if (algorithmInsights.optimalLength) {
        optimizations.push(`Keep content under ${algorithmInsights.optimalLength} seconds for maximum reach`);
      }

      optimizations.push('Use hook in first 3 seconds');
      optimizations.push('Include call-to-action in every post');
      optimizations.push('Reply to all comments within 1 hour');
      optimizations.push('Post during algorithm boost windows');

      const viralScore = await viralScoringService.getUserViralPotential(userId);

      this.metrics.aiDecisionsMade++;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        optimizations,
        viralScore,
        recommendations: algorithmInsights,
      };
    } catch (error: unknown) {
      logger.error('Error in auto growth optimization:', error);
      return { success: false };
    }
  }

  async autoScheduleWeek(
    userId: string,
    contentPlan: { topic: string; platforms: string[] }[]
  ): Promise<{
    success: boolean;
    scheduledPosts?: any[];
    totalReach?: number;
  }> {
    try {
      logger.info(`[AUTO-SCHEDULE] Creating week schedule for ${userId}`);

      const scheduledPosts: any[] = [];
      const now = new Date();

      for (let i = 0; i < contentPlan.length; i++) {
        const plan = contentPlan[i];
        
        const contentResult = await this.autoGenerateContent(userId, plan.topic, plan.platforms);
        
        if (contentResult.success) {
          const scheduledDate = new Date(now);
          scheduledDate.setDate(scheduledDate.getDate() + Math.floor(i / 3));
          scheduledDate.setHours(9 + (i % 3) * 4);

          const postResult = await this.postContent(
            userId,
            {
              content: contentResult.variants?.[0],
              scheduledAt: scheduledDate,
            } as any,
            plan.platforms
          );

          if (postResult.success) {
            scheduledPosts.push({
              postId: postResult.postId,
              scheduledAt: scheduledDate,
              topic: plan.topic,
              platforms: plan.platforms,
              viralScore: contentResult.viralScore,
            });
          }
        }
      }

      const totalReach = scheduledPosts.length * 5000;

      this.metrics.postsScheduled += scheduledPosts.length;
      this.metrics.lastUpdated = new Date();

      return {
        success: true,
        scheduledPosts,
        totalReach,
      };
    } catch (error: unknown) {
      logger.error('Error in auto week scheduling:', error);
      return { success: false };
    }
  }

  private async dispatchAutonomousContent(postId: string): Promise<void> {
    try {
      const post = await storage.getSocialPost(postId);
      if (!post) return;

      for (const platform of post.platforms || []) {
        await socialQueueService.publishToPlatform(postId, platform);
      }

      await storage.updateSocialPost(postId, {
        status: 'published',
        publishedAt: new Date(),
      });

      logger.info(`[AUTONOMOUS] Content ${postId} published successfully`);
    } catch (error: unknown) {
      logger.error(`[AUTONOMOUS] Error dispatching content ${postId}:`, error);
    }
  }

  private startCampaignOptimization(campaignId: string): void {
    const interval = setInterval(async () => {
      try {
        const campaign = await storage.getAdCampaign(campaignId);
        if (!campaign || campaign.status !== 'active') {
          clearInterval(interval);
          this.operationIntervals.delete(`campaign_${campaignId}`);
          return;
        }

        const metrics = await advertisingDispatchService.getCampaignMetrics(campaignId);

        if (metrics.ctr < 0.01) {
          await advertisingDispatchService.optimizeTargeting(campaignId);
        }

        if (metrics.conversionRate < 0.02) {
          await advertisingDispatchService.optimizeCreative(campaignId);
        }

        if (metrics.roas < 2) {
          await advertisingDispatchService.optimizeBidding(campaignId);
        }

        this.metrics.campaignsOptimized++;
        this.metrics.lastUpdated = new Date();

        logger.info(
          `[AUTONOMOUS] Campaign ${campaignId} optimized - CTR: ${metrics.ctr}, ROAS: ${metrics.roas}`
        );
      } catch (error: unknown) {
        logger.error(`[AUTONOMOUS] Error optimizing campaign ${campaignId}:`, error);
      }
    }, 300000);

    this.operationIntervals.set(`campaign_${campaignId}`, interval);
  }

  startAutonomousOperations(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('[AUTONOMOUS] Starting 24/7 autonomous operations...');

    const contentInterval = setInterval(async () => {
      try {
        const autonomousUsers = Array.from(this.autonomousWhitelist);

        for (const userId of autonomousUsers) {
          const pendingPosts = await storage.getPendingSocialPosts(userId);

          for (const post of pendingPosts) {
            if (post.scheduledAt && new Date(post.scheduledAt) <= new Date()) {
              await this.dispatchAutonomousContent(post.id);
            }
          }

          const activeCampaigns = await storage.getActiveAdCampaigns(userId);
          for (const campaign of activeCampaigns) {
            if (campaign.approvalStatus === 'auto-approved') {
              await advertisingDispatchService.optimizeCampaign(campaign.id);
            }
          }
        }
      } catch (error: unknown) {
        logger.error('[AUTONOMOUS] Error in 24/7 operations:', error);
      }
    }, 60000);

    this.operationIntervals.set('content_dispatch', contentInterval);

    const analyticsInterval = setInterval(async () => {
      try {
        const autonomousUsers = Array.from(this.autonomousWhitelist);

        for (const userId of autonomousUsers) {
          await this.autoAnalyzePerformance(userId);
          await this.autoOptimizeGrowth(userId);
        }
      } catch (error: unknown) {
        logger.error('[AUTONOMOUS] Error in analytics operations:', error);
      }
    }, 3600000);

    this.operationIntervals.set('analytics', analyticsInterval);

    logger.info('[AUTONOMOUS] 24/7 operations started successfully');
    this.emit('operationsStarted');
  }

  stopAutonomousOperations(): void {
    this.isRunning = false;

    for (const [key, interval] of this.operationIntervals) {
      clearInterval(interval);
      this.operationIntervals.delete(key);
    }

    logger.info('[AUTONOMOUS] 24/7 operations stopped');
    this.emit('operationsStopped');
  }

  getStatus(): {
    isRunning: boolean;
    config: AutonomousConfig;
    metrics: AutonomousMetrics;
    activeUsers: number;
    activeOperations: number;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      metrics: this.metrics,
      activeUsers: this.autonomousWhitelist.size,
      activeOperations: this.operationIntervals.size,
    };
  }
}

export const autonomousService = new AutonomousService();

autonomousService.startAutonomousOperations();
