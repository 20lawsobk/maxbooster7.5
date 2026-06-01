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
import { notificationService } from './notificationService.js';
import type { SocialPost, AdCampaign, Release } from '@shared/schema';
import { logger } from '../logger.js';
import { EventEmitter } from 'events';
import { cbIsOpen } from '../lib/pdimCircuitBreaker.js';
import sharp from 'sharp';
import { distributedCache } from '../infrastructure/distributedCache.js';
import {
  setupRepeatableJobs,
  scheduleCampaignOptimization,
  removeCampaignOptimization,
  teardownRepeatableJobs,
} from './autonomousJobScheduler.js';

const MAX_PROCESSING_QUEUE = 1000;
const MAX_LEARNING_DATA = 500;
const METRICS_CACHE_KEY = 'autonomous:metrics';
let _lastPersistWarnAt  = 0; // rate-limits persist-failure log to once per 60 s
let _lastLoadWarnAt     = 0; // rate-limits load-failure log to once per 60 s


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
  private isRunning: boolean = false;

  constructor() {
    super();
    this.autonomousMode = process.env.AUTONOMOUS_MODE === 'true' || false;
    this.config = this.getDefaultConfig();
    this.metrics = this.initializeMetrics();
    this.loadAutonomousWhitelist();
    this.loadMetricsFromCache();
  }

  private boundedMapSet(map: Map<string, any>, key: string, value: Record<string, unknown>, maxSize: number): void {
    if (map.size >= maxSize && !map.has(key)) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
    map.set(key, value);
  }

  private addToProcessingQueue(key: string, value: Record<string, unknown>): void {
    this.boundedMapSet(this.processingQueue, key, value, MAX_PROCESSING_QUEUE);
  }

  private addToLearningData(key: string, value: Record<string, unknown>): void {
    this.boundedMapSet(this.learningData, key, value, MAX_LEARNING_DATA);
  }

  private async loadMetricsFromCache(): Promise<void> {
    // If PDIM circuit is OPEN at startup, the load will fail for every attempt.
    // Skip silently and schedule a retry — in-memory defaults are already in place.
    if (cbIsOpen()) {
      setTimeout(() => this.loadMetricsFromCache(), 30_000);
      return;
    }
    try {
      const cached = await distributedCache.get<AutonomousMetrics>(METRICS_CACHE_KEY);
      if (cached) {
        this.metrics = { ...cached, lastUpdated: new Date(cached.lastUpdated) };
        logger.info('[AUTONOMOUS] Metrics restored from shared cache');
      }
    } catch (err) {
      // Only warn when PDIM is genuinely UP but the cache operation fails unexpectedly.
      // Rate-limit to once per 60 s to prevent flooding on sustained outages.
      if (!cbIsOpen()) {
        const now = Date.now();
        if (now - _lastLoadWarnAt >= 60_000) {
          _lastLoadWarnAt = now;
          logger.warn({ err: err }, '[AUTONOMOUS] Could not load metrics from cache:');
        }
      }
    }
  }

  async persistMetricsToCache(): Promise<void> {
    try {
      await distributedCache.set(METRICS_CACHE_KEY, this.metrics, 3600);
    } catch (err) {
      // Rate-limit to once per 60 s so a sustained PDIM outage doesn't flood logs.
      const now = Date.now();
      if (now - _lastPersistWarnAt >= 60_000) {
        _lastPersistWarnAt = now;
        logger.warn({ err: err }, '[AUTONOMOUS] Could not persist metrics to cache:');
      }
    }
  }

  private getDefaultConfig(): AutonomousConfig {
    // Spend-capable categories (advertising, distribution, marketplace) default
    // OFF — they must be enabled explicitly per user via `configure()` so that
    // turning on autonomous mode never silently authorises budget, licensing
    // or fulfilment actions. Read-only / analysis-only categories stay on so
    // the user gets immediate value the moment they opt in.
    return {
      socialPosting: true,
      advertising: false,
      distribution: false,
      analytics: true,
      contentOptimization: true,
      imageProcessing: true,
      audioProcessing: true,
      marketplaceManagement: false,
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
      logger.warn({ err: error }, 'Error loading autonomous whitelist:');
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
    // NOTE: there is no `autonomousEnabled` column on the users table, so writing
    // it produced an empty `UPDATE users SET  WHERE ...` and threw a SQL syntax
    // error on every call. The whitelist is in-memory (rehydrated at startup from
    // the ADMIN_USER_IDS env var). Persisting per-user autonomous state would
    // require a schema column; until then we keep this in-memory only.
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
        } as Record<string, unknown>);

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
        } as Record<string, unknown>);

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
      logger.warn({ err: error }, 'Error in autonomous posting:');
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

        // Create as 'draft' — activateCampaign() rejects campaigns that are
        // already 'active'/'running' and is what actually flips status to
        // 'active' once posts succeed. Creating as 'active' here would make
        // activation a no-op and silently skip dispatch.
        const newCampaign = await storage.createAdCampaign({
          ...campaign,
          userId,
          status: 'draft',
          approvalStatus: 'auto-approved',
          approvedBy: 'autonomous-system',
          approvedAt: new Date(),
        } as Record<string, unknown>);

        // NOTE: the real dispatch method is activateCampaign(campaignId, userId)
        // — there is no startCampaign(). Posting only happens when the user has
        // connected social accounts; log (non-fatally) when it does not.
        const dispatch = await advertisingDispatchService.activateCampaign(newCampaign.id, userId);
        if (!dispatch.success) {
          logger.warn(`[AUTONOMOUS] Campaign ${newCampaign.id} created but not dispatched: ${dispatch.error ?? dispatch.message}`);
        }
        scheduleCampaignOptimization(newCampaign.id).catch((err) =>
          logger.warn({ err: err }, '[AUTONOMOUS] Failed to schedule campaign optimization:')
        );

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
        } as Record<string, unknown>);

        // Campaign is persisted as draft/pending for manual review. There is no
        // campaign-level review pipeline in approvalService (it is post-centric),
        // so we do not submit it there — doing so previously threw and silently
        // discarded the campaign. The pending record is the source of truth.
        logger.info(
          `[APPROVAL] Campaign ${newCampaign.id} created as pending for user ${userId} (awaiting manual approval)`
        );

        return {
          success: true,
          campaignId: newCampaign.id,
          requiresApproval: true,
        };
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, 'Error in autonomous campaign launch:');
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
        variants.map(async (variant: Record<string, unknown>) => {
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
        variants: scoredVariants.map((v: Record<string, unknown>) => v.content),
        viralScore: bestVariant.viralScore,
        optimalTiming: optimalTiming.recommendedTime,
        platforms,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, 'Error in auto content generation:');
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
      } as Record<string, unknown>);

      const providers = ['spotify', 'apple_music', 'amazon_music', 'youtube_music', 'tidal', 'deezer'];
      const dispatchResults = [];

      for (const provider of providers) {
        try {
          const result = await distributionService.submitToProvider(release.id, provider, userId);
          dispatchResults.push({ provider, ...result });
        } catch (err) {
          logger.warn({ err: err }, `Failed to dispatch to ${provider}:`);
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
      logger.warn({ err: error }, 'Error in auto distribution:');
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
      logger.warn({ err: error }, 'Error in auto image processing:');
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
    insights?: Record<string, unknown>;
    recommendations?: string[];
    predictions?: Record<string, unknown>;
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
      logger.warn({ err: error }, 'Error in auto analytics:');
      return { success: false };
    }
  }

  async autoOptimizeGrowth(userId: string): Promise<{
    success: boolean;
    optimizations?: string[];
    viralScore?: number;
    recommendations?: Record<string, unknown>;
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
      logger.warn({ err: error }, 'Error in auto growth optimization:');
      return { success: false };
    }
  }

  async autoScheduleWeek(
    userId: string,
    contentPlan: { topic: string; platforms: string[] }[]
  ): Promise<{
    success: boolean;
    scheduledPosts?: Record<string, unknown>[];
    totalReach?: number;
  }> {
    try {
      logger.info(`[AUTO-SCHEDULE] Creating week schedule for ${userId}`);

      const scheduledPosts: Record<string, unknown>[] = [];
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
            } as Record<string, unknown>,
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
      logger.warn({ err: error }, 'Error in auto week scheduling:');
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
      logger.warn({ err: error }, `[AUTONOMOUS] Error dispatching content ${postId}:`);
    }
  }

  async runCampaignOptimization(campaignId: string): Promise<void> {
    try {
      const campaign = await storage.getAdCampaign(campaignId);
      if (!campaign || campaign.status !== 'active') {
        await removeCampaignOptimization(campaignId);
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

      if (campaign.userId) {
        const roasLabel = metrics.roas >= 2 ? `ROAS ${metrics.roas.toFixed(1)}x` : `CTR ${(metrics.ctr * 100).toFixed(2)}%`;
        notificationService.send({
          userId: campaign.userId,
          type: 'ad_campaign_optimized',
          title: '🚀 Campaign Automatically Optimized',
          message: `Your campaign "${campaign.name || campaignId}" was optimized by the AI. ${roasLabel}. Targeting, creative, and bidding updated.`,
          link: `/campaigns/${campaignId}`,
          metadata: { campaignId, ctr: metrics.ctr, roas: metrics.roas, conversionRate: metrics.conversionRate },
        }).catch((err) => logger.warn({ err: err }, '[AUTONOMOUS] Failed to send campaign notification:'));
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, `[AUTONOMOUS] Error optimizing campaign ${campaignId}:`);
    }
  }

  async runContentDispatch(): Promise<void> {
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
      logger.warn({ err: error }, '[AUTONOMOUS] Error in content dispatch job:');
    }
  }

  async runPeriodicAnalytics(): Promise<void> {
    try {
      const autonomousUsers = Array.from(this.autonomousWhitelist);

      for (const userId of autonomousUsers) {
        await this.autoAnalyzePerformance(userId);
        await this.autoOptimizeGrowth(userId);
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, '[AUTONOMOUS] Error in analytics job:');
    }
  }

  startAutonomousOperations(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('[AUTONOMOUS] Starting 24/7 autonomous operations...');

    setupRepeatableJobs().catch((err) =>
      logger.warn({ err: err }, '[AUTONOMOUS] Failed to register repeatable jobs:')
    );

    logger.info('[AUTONOMOUS] 24/7 operations started successfully');
    this.emit('operationsStarted');
  }

  stopAutonomousOperations(): void {
    this.isRunning = false;

    teardownRepeatableJobs().catch((err) =>
      logger.warn({ err: err }, '[AUTONOMOUS] Failed to remove repeatable jobs:')
    );

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
      activeOperations: this.isRunning ? 3 : 0,
    };
  }
}

export const autonomousService = new AutonomousService();

// startAutonomousOperations() is NOT called here at module-load time.
// It is called explicitly by server/index.ts on worker 0 only (isBgWorker guard).
// Calling it here caused all cluster workers to start autonomous operations the
// moment this module was first imported (e.g. by chainErrorAutoFixer on any worker),
// which multiplied PDIM load and MaxCoreAI generate calls by the worker count (×15).

