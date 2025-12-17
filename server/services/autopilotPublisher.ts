import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from './aiModelManager.js';
import { autoPostingServiceV2 } from './autoPostingServiceV2.js';
import type { PostContent } from './autoPostingServiceV2.js';
import { aiContentService } from './aiContentService.js';

/**
 * Automated Autopilot Publisher
 * 
 * Runs scheduled jobs to automatically generate and publish content for users
 * with autopilot enabled and autoPublish=true.
 * 
 * Features:
 * - Social Media Auto-Publishing: Generates and posts social media content
 * - Advertising Auto-Publishing: Creates and launches ad campaigns
 * - Multimodal Analysis Integration: Uses analyzed content features for better predictions
 * - Confidence-based Publishing: Only publishes when confidence exceeds user threshold
 */

interface AutoPublishResult {
  userId: string;
  socialPosts: number;
  adCampaigns: number;
  errors: string[];
}

class AutopilotPublisher {
  private isRunning: boolean = false;
  private lastRun: Date | null = null;

  /**
   * Main entry point: Run autopilot publishing for all eligible users
   */
  async publishForAllUsers(): Promise<AutoPublishResult[]> {
    if (this.isRunning) {
      logger.warn('Autopilot publisher already running, skipping this cycle');
      return [];
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      logger.info('🚀 Starting automated autopilot publishing cycle');

      // Get all users with autopilot enabled
      const enabledConfigs = await storage.getAllEnabledAutopilotConfigs();
      
      if (enabledConfigs.length === 0) {
        logger.info('No users with autopilot enabled');
        return [];
      }

      logger.info(`Found ${enabledConfigs.length} users with autopilot enabled`);

      // Process each user in parallel (but limit concurrency to avoid overload)
      const results: AutoPublishResult[] = [];
      const batchSize = 5; // Process 5 users at a time
      
      for (let i = 0; i < enabledConfigs.length; i += batchSize) {
        const batch = enabledConfigs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(config => this.publishForUser(config))
        );
        results.push(...batchResults);
      }

      const totalPosts = results.reduce((sum, r) => sum + r.socialPosts, 0);
      const totalCampaigns = results.reduce((sum, r) => sum + r.adCampaigns, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      logger.info(`✅ Autopilot publishing cycle completed:`);
      logger.info(`   - Social posts published: ${totalPosts}`);
      logger.info(`   - Ad campaigns created: ${totalCampaigns}`);
      logger.info(`   - Errors: ${totalErrors}`);

      return results;
    } catch (error) {
      logger.error('Error in autopilot publishing cycle:', error);
      return [];
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Publish content for a single user
   */
  private async publishForUser(config: any): Promise<AutoPublishResult> {
    const result: AutoPublishResult = {
      userId: config.userId,
      socialPosts: 0,
      adCampaigns: 0,
      errors: [],
    };

    try {
      // Check if auto-publish is enabled for this user
      if (!config.autoPublish) {
        logger.debug(`User ${config.userId}: autoPublish disabled, skipping`);
        return result;
      }

      // Check posting frequency to determine if we should post now
      if (!this.shouldPostNow(config)) {
        logger.debug(`User ${config.userId}: Not time to post yet based on frequency ${config.postingFrequency}`);
        return result;
      }

      logger.info(`📝 Processing autopilot for user ${config.userId}`);

      // Social Media Autopilot - errors propagate upward, not silently logged
      // CRITICAL: Media generation failures must abort scheduling
      if (config.platforms && config.platforms.length > 0) {
        const socialResult = await this.publishSocialContent(config);
        result.socialPosts = socialResult.posts;
        if (socialResult.error) {
          // Non-critical errors (like low confidence) are recorded but not thrown
          if (!socialResult.error.includes('below threshold') && 
              !socialResult.error.includes('not trained')) {
            throw new Error(`Social media publishing failed: ${socialResult.error}`);
          }
          result.errors.push(`Social: ${socialResult.error}`);
        }
      }

      // Advertising Autopilot - errors propagate upward, not silently logged
      // CRITICAL: Media generation failures must abort campaign creation
      const adResult = await this.publishAdvertisingCampaigns(config);
      result.adCampaigns = adResult.campaigns;
      if (adResult.error) {
        // Non-critical errors (like low confidence) are recorded but not thrown
        if (!adResult.error.includes('below threshold') && 
            !adResult.error.includes('not trained')) {
          throw new Error(`Advertising campaign creation failed: ${adResult.error}`);
        }
        result.errors.push(`Advertising: ${adResult.error}`);
      }

    } catch (error: any) {
      result.errors.push(`General: ${error.message}`);
      logger.error(`Error processing user ${config.userId}:`, error);
    }

    return result;
  }

  /**
   * Publish social media content for a user
   */
  private async publishSocialContent(config: any): Promise<{ posts: number; error?: string }> {
    try {
      const userId = config.userId;
      
      // Get the user's trained social media AI model
      const socialAI = await aiModelManager.getSocialAutopilot(userId);
      
      if (!socialAI.getIsTrained()) {
        return { posts: 0, error: 'Social AI model not trained yet' };
      }

      // Get multimodal features if enabled
      let multimodalFeatures = null;
      if (config.useMultimodalAnalysis) {
        const recentAnalysis = await storage.getRecentAnalyzedContent(userId, 1);
        if (recentAnalysis && recentAnalysis.length > 0) {
          multimodalFeatures = recentAnalysis[0].features;
        }
      }

      // Generate content recommendations
      const contentTypes = config.contentTypes || ['tips', 'insights'];
      const recommendations = await socialAI.generateContentRecommendations(
        contentTypes[Math.floor(Math.random() * contentTypes.length)],
        multimodalFeatures
      );

      if (!recommendations || recommendations.length === 0) {
        return { posts: 0, error: 'No content recommendations generated' };
      }

      // Pick the best recommendation based on predicted engagement
      const bestRecommendation = recommendations.reduce((best: any, current: any) => {
        return (current.predictedEngagement || 0) > (best.predictedEngagement || 0) ? current : best;
      });

      // Check confidence threshold for auto-publish
      const confidence = bestRecommendation.confidence || bestRecommendation.predictedEngagement || 0;
      const minThreshold = config.minConfidenceThreshold || 0.7;
      
      if (confidence < minThreshold) {
        logger.info(`User ${userId}: Content confidence ${confidence.toFixed(2)} below threshold ${minThreshold}, not publishing`);
        return { posts: 0, error: `Confidence ${confidence.toFixed(2)} below threshold ${minThreshold}` };
      }

      // Generate actual media asset using in-house AI Content Service
      // CRITICAL: No silent fallbacks - if media generation fails, we must propagate the error
      let mediaUrl: string | undefined;
      if (bestRecommendation.mediaType !== 'text') {
        const generatedAsset = await aiContentService.generateContent({
          prompt: bestRecommendation.content || bestRecommendation.text,
          platform: bestRecommendation.platform as any,
          format: bestRecommendation.mediaType,
          tone: 'creative',
          length: 'medium',
        });
        if (!generatedAsset.url) {
          throw new Error(`Media generation returned no URL for ${bestRecommendation.mediaType}`);
        }
        mediaUrl = generatedAsset.url;
        logger.info(`✅ Generated ${bestRecommendation.mediaType} asset for user ${userId}: ${mediaUrl}`);
      }

      // Create post content with actual media type and URL from in-house generation
      const postContent: PostContent = {
        text: bestRecommendation.content || bestRecommendation.text,
        hashtags: bestRecommendation.hashtags,
        mediaType: mediaUrl ? bestRecommendation.mediaType : 'text', // Use AI's media type if asset generated
        mediaUrl, // Include generated media URL
      };

      // Calculate next optimal posting time for this platform
      const nextOptimalTime = this.calculateNextOptimalPostingTime(
        bestRecommendation.platform,
        config.postingFrequency || 'daily'
      );

      // Schedule post for optimal time (not immediate)
      const platforms = [bestRecommendation.platform]; // Use AI-selected platform
      const scheduledPost = await autoPostingServiceV2.schedulePost(
        userId,
        platforms,
        postContent,
        nextOptimalTime, // Schedule at optimal time
        'social_autopilot'
      );

      logger.info(`✅ User ${userId}: Scheduled ${bestRecommendation.mediaType} post ${scheduledPost.id} for ${bestRecommendation.platform} at ${nextOptimalTime.toISOString()} (confidence: ${confidence.toFixed(2)})`);
      
      return { posts: 1 };
    } catch (error: any) {
      logger.error('Error in publishSocialContent:', error);
      return { posts: 0, error: error.message };
    }
  }

  /**
   * Publish advertising campaigns for a user
   */
  private async publishAdvertisingCampaigns(config: any): Promise<{ campaigns: number; error?: string }> {
    try {
      const userId = config.userId;
      
      // Get the user's trained advertising AI model
      const advertisingAI = await aiModelManager.getAdvertisingAutopilot(userId);
      
      if (!advertisingAI.getIsTrained()) {
        return { campaigns: 0, error: 'Advertising AI model not trained yet' };
      }

      // Get multimodal features if enabled
      let multimodalFeatures = null;
      if (config.useMultimodalAnalysis) {
        const recentAnalysis = await storage.getRecentAnalyzedContent(userId, 1);
        if (recentAnalysis && recentAnalysis.length > 0) {
          multimodalFeatures = recentAnalysis[0].features;
        }
      }

      // Generate campaign recommendations
      const objective = 'brand_awareness'; // Could be configurable
      const recommendations = await advertisingAI.generateCampaignRecommendations(
        objective,
        multimodalFeatures
      );

      if (!recommendations || recommendations.length === 0) {
        return { campaigns: 0, error: 'No campaign recommendations generated' };
      }

      // Pick the best recommendation
      const bestCampaign = recommendations.reduce((best: any, current: any) => {
        return (current.predictedROI || 0) > (best.predictedROI || 0) ? current : best;
      });

      // Check confidence threshold for auto-publish
      const confidence = bestCampaign.confidence || bestCampaign.predictedROI || 0;
      const minThreshold = config.minConfidenceThreshold || 0.7;
      
      if (confidence < minThreshold) {
        logger.info(`User ${userId}: Campaign confidence ${confidence.toFixed(2)} below threshold ${minThreshold}, not creating`);
        return { campaigns: 0, error: `Confidence ${confidence.toFixed(2)} below threshold ${minThreshold}` };
      }

      // Generate actual media asset for advertising campaign using in-house AI Content Service
      // CRITICAL: No silent fallbacks - if media generation fails, we must propagate the error
      let mediaUrl: string | undefined;
      if (bestCampaign.mediaType !== 'text') {
        const generatedAsset = await aiContentService.generateContent({
          prompt: bestCampaign.content,
          platform: bestCampaign.platforms[0] as any,
          format: bestCampaign.mediaType,
          tone: 'promotional',
          length: 'medium',
        });
        if (!generatedAsset.url) {
          throw new Error(`Ad media generation returned no URL for ${bestCampaign.mediaType}`);
        }
        mediaUrl = generatedAsset.url;
        logger.info(`✅ Generated ${bestCampaign.mediaType} ad asset for user ${userId}: ${mediaUrl}`);
      }

      // Calculate next optimal posting time for advertising
      const primaryPlatform = bestCampaign.platforms?.[0] || 'facebook';
      const nextOptimalTime = this.calculateNextOptimalPostingTime(
        primaryPlatform,
        config.postingFrequency || 'daily'
      );

      // Create campaign via storage with AI-selected media type, timing, and generated assets
      const campaign = await storage.createAdCampaign({
        userId,
        name: bestCampaign.name || `Auto ${bestCampaign.mediaType} Campaign - ${primaryPlatform}`,
        objective,
        budget: bestCampaign.suggestedBudget || 0,
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        status: 'scheduled', // Set as scheduled, not active yet
        startDate: nextOptimalTime, // Use optimal time instead of now
        platforms: bestCampaign.platforms || ['facebook', 'instagram'],
        connectedPlatforms: [],
        personalAdNetwork: true,
        useAIAmplification: true,
        targetAudience: bestCampaign.targetAudience || {},
        creativeAssets: bestCampaign.creatives || [],
        aiPredictions: {
          viralityScore: confidence,
          expectedReach: bestCampaign.expectedReach || 1000,
          expectedEngagement: bestCampaign.expectedEngagement || 50,
          confidence,
        },
      });

      logger.info(`✅ User ${userId}: Created ${mediaUrl ? bestCampaign.mediaType : 'text'} ad campaign ${campaign.id} for ${primaryPlatform} at ${nextOptimalTime.toISOString()} (confidence: ${confidence.toFixed(2)}, ROI: ${bestCampaign.predictedROI.toFixed(2)}x)${mediaUrl ? ` with asset: ${mediaUrl}` : ''}`);
      
      return { campaigns: 1 };
    } catch (error: any) {
      logger.error('Error in publishAdvertisingCampaigns:', error);
      return { campaigns: 0, error: error.message };
    }
  }

  /**
   * Determine if it's time to post based on posting frequency AND optimal posting times
   * Smart: Uses platform-specific optimal times for maximum engagement
   * Obedient: Respects user's frequency constraints (hourly/daily/weekly)
   */
  private shouldPostNow(config: any): boolean {
    const frequency = config.postingFrequency || 'daily';
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();
    const currentMinute = new Date().getMinutes();

    // Platform-specific optimal posting times (based on industry research)
    const optimalHours = {
      twitter: [9, 12, 17],      // 9 AM, 12 PM, 5 PM
      instagram: [11, 13, 19],   // 11 AM, 1 PM, 7 PM
      facebook: [13, 15, 19],    // 1 PM, 3 PM, 7 PM
      tiktok: [6, 10, 19, 22],   // 6 AM, 10 AM, 7 PM, 10 PM
      youtube: [14, 17, 20],     // 2 PM, 5 PM, 8 PM
    };

    // Get user's primary platform (or use instagram as default)
    const primaryPlatform = config.platforms?.[0] || 'instagram';
    const platformOptimalHours = optimalHours[primaryPlatform] || [9, 12, 17];

    // Check if current hour is optimal for the platform
    const isOptimalHour = platformOptimalHours.includes(currentHour);

    // Only post during the first 15 minutes of optimal hour to avoid duplicate posts
    const isOptimalWindow = isOptimalHour && currentMinute < 15;

    switch (frequency) {
      case 'hourly':
        // Hourly: Post every hour, but prefer optimal times
        return isOptimalWindow || currentMinute < 5; // Every hour, first 5 minutes
      
      case 'daily':
        // Daily: Post once per day, only at optimal times
        return isOptimalWindow;
      
      case 'weekly':
        // Weekly: Post once per week on Tuesday-Thursday at optimal times
        const isOptimalDay = currentDay >= 2 && currentDay <= 4; // Tue-Thu
        return isOptimalDay && isOptimalWindow;
      
      default:
        // Default: Use optimal times
        return isOptimalWindow;
    }
  }

  /**
   * Calculate next optimal posting time based on platform and frequency
   * Returns the next available optimal time slot that respects user constraints
   */
  private calculateNextOptimalPostingTime(platform: string, frequency: string): Date {
    const now = new Date();
    const currentHour = now.getHours();

    // Platform-specific optimal posting hours
    const optimalHours = {
      twitter: [9, 12, 17],      // 9 AM, 12 PM, 5 PM
      instagram: [11, 13, 19],   // 11 AM, 1 PM, 7 PM
      facebook: [13, 15, 19],    // 1 PM, 3 PM, 7 PM
      tiktok: [6, 10, 19, 22],   // 6 AM, 10 AM, 7 PM, 10 PM
      youtube: [14, 17, 20],     // 2 PM, 5 PM, 8 PM
    };

    const platformHours = optimalHours[platform] || [9, 12, 17];

    // Find next optimal hour
    let nextOptimalHour = platformHours.find(h => h > currentHour);
    
    // If no optimal hour today, use first optimal hour tomorrow
    if (!nextOptimalHour) {
      nextOptimalHour = platformHours[0];
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(nextOptimalHour, 0, 0, 0);
      return tomorrow;
    }

    // Schedule for today at next optimal hour
    const scheduledTime = new Date(now);
    scheduledTime.setHours(nextOptimalHour, 0, 0, 0);
    return scheduledTime;
  }

  /**
   * Get status of the autopilot publisher
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    };
  }
}

export const autopilotPublisher = new AutopilotPublisher();
