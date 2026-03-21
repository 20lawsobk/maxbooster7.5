import { db } from '../db';
import { storage } from '../storage';
import { platformAPI } from '../platform-apis';
import { adCampaigns, adCreatives, contentCalendar } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { AdCampaign, AdCreative } from '@shared/schema';
import { logger } from '../logger.js';

/**
 * Advertising Dispatch Service
 *
 * Handles campaign activation by posting creatives to user's connected social media profiles.
 * This enables "Zero-Cost Advertising" through organic social media posting instead of paid ads.
 *
 * Key Features:
 * - Posts campaign creatives to all connected social platforms
 * - Creates content calendar entries for tracking
 * - Collects engagement metrics automatically
 * - Tracks organic reach vs paid ad spend savings
 * - Supports scheduled campaign posts
 */
export class AdvertisingDispatchService {
  /**
   * Activate a campaign by posting creatives to user's social media profiles
   *
   * @param campaignId - Campaign to activate
   * @param userId - User ID (for auth and token lookup)
   * @returns Activation results with post IDs and errors
   */
  async activateCampaign(
    campaignId: number,
    userId: string
  ): Promise<{
    success: boolean;
    message: string;
    results?: {
      postsCreated: number;
      platformsUsed: string[];
      postIds: Record<string, string>;
      calendarEntries: string[];
      errors: string[];
    };
    error?: string;
    requiredConnections?: string[];
    connectUrl?: string;
  }> {
    try {
      // 1. Get campaign
      const campaigns = await db
        .select()
        .from(adCampaigns)
        .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.userId, userId)))
        .limit(1);

      if (campaigns.length === 0) {
        return {
          success: false,
          message: 'Campaign not found',
          error: 'Campaign not found or you do not have permission to activate it',
        };
      }

      const campaign = campaigns[0];

      // 2. Check if campaign is already active
      if (campaign.status === 'active' || campaign.status === 'running') {
        return {
          success: false,
          message: 'Campaign is already active',
          error: 'This campaign has already been activated',
        };
      }

      // 3. Get campaign creatives
      const creatives = await db
        .select()
        .from(adCreatives)
        .where(eq(adCreatives.campaignId, campaignId));

      if (creatives.length === 0) {
        return {
          success: false,
          message: 'No creatives found',
          error:
            'This campaign has no creatives to post. Please create at least one creative first.',
        };
      }

      // 4. Determine target platforms
      const requestedPlatforms = (campaign.platforms as string[]) || [];

      // 5. Verify user has connected social accounts
      const connectedPlatforms = await this.getConnectedPlatforms(userId);

      if (connectedPlatforms.length === 0) {
        return {
          success: false,
          message: 'No social media accounts connected',
          error: 'You must connect at least one social media account before activating campaigns.',
          requiredConnections: ['Twitter', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok'],
          connectUrl: '/settings#social-connections',
        };
      }

      // Filter to only use platforms that are both requested AND connected
      const platformsToUse = requestedPlatforms.filter((p) =>
        connectedPlatforms.includes(p.toLowerCase())
      );

      if (platformsToUse.length === 0) {
        return {
          success: false,
          message: 'No connected platforms match campaign targets',
          error: `Campaign targets ${requestedPlatforms.join(', ')} but you have only connected ${connectedPlatforms.join(', ')}`,
          requiredConnections: requestedPlatforms,
          connectUrl: '/settings#social-connections',
        };
      }

      // 6. Post creatives to platforms
      const postResults: Record<string, string> = {};
      const calendarEntries: string[] = [];
      const errors: string[] = [];
      let successfulPosts = 0;

      for (const creative of creatives) {
        // Prepare content for posting
        const content = {
          text: creative.normalizedContent || creative.rawContent || '',
          body: creative.normalizedContent || creative.rawContent || '',
          mediaUrl:
            creative.assetUrls && creative.assetUrls.length > 0 ? creative.assetUrls[0] : null,
          hashtags: this.extractHashtags(creative.normalizedContent || creative.rawContent || ''),
        };

        // Post to each platform
        const publishResults = await platformAPI.publishContent(content, platformsToUse, userId);

        // Process results
        for (const result of publishResults) {
          if (result.success && result.postId) {
            postResults[`${result.platform}_${creative.id}`] = result.postId;
            successfulPosts++;

            // Create content calendar entry
            try {
              const calendarEntry = await this.createCalendarEntry(
                userId,
                creative,
                result.platform,
                result.postId,
                campaign
              );
              calendarEntries.push(calendarEntry.id);
            } catch (err: unknown) {
              logger.error('Failed to create calendar entry:', err);
              errors.push(`Calendar entry failed for ${result.platform}: ${err.message}`);
            }

            // Create delivery log
            try {
              await storage.createAdDeliveryLog({
                variantId: creative.id,
                platform: result.platform,
                platformAdId: result.postId,
                deliveryStatus: 'active',
                platformResponse: { type: 'organic_post', posted_at: new Date().toISOString() },
                deliveredAt: new Date(),
              });
            } catch (err: unknown) {
              logger.error('Failed to create delivery log:', err);
            }
          } else {
            errors.push(`${result.platform}: ${result.error || 'Unknown error'}`);

            // Log failure
            try {
              await storage.createAdDeliveryLog({
                variantId: creative.id,
                platform: result.platform,
                deliveryStatus: 'failed',
                errorMessage: result.error || 'Unknown error',
                retryCount: 1,
              });
            } catch (err: unknown) {
              logger.error('Failed to create delivery log:', err);
            }
          }
        }
      }

      // 7. Update campaign status and metrics
      const organicMetrics = {
        posts: Object.entries(postResults).map(([key, postId]) => {
          const [platform] = key.split('_');
          return {
            platform,
            posted: true,
            postId,
            metrics: {
              impressions: 0,
              engagements: 0,
              shares: 0,
              clicks: 0,
              reach: 0,
              engagementRate: 0,
            },
            organicBoost: 0,
            lastUpdated: new Date().toISOString(),
          };
        }),
        totalPosts: successfulPosts,
        platformsUsed: platformsToUse,
        activatedAt: new Date().toISOString(),
      };

      await db
        .update(adCampaigns)
        .set({
          status: 'active',
          organicMetrics: organicMetrics as any,
          connectedPlatforms: platformsToUse as any,
        })
        .where(eq(adCampaigns.id, campaignId));

      // 8. Return success
      return {
        success: true,
        message: `Campaign activated! Posted ${successfulPosts} times across ${platformsToUse.length} platforms.`,
        results: {
          postsCreated: successfulPosts,
          platformsUsed: platformsToUse,
          postIds: postResults,
          calendarEntries,
          errors,
        },
      };
    } catch (error: unknown) {
      logger.error('Campaign activation error:', error);
      return {
        success: false,
        message: 'Campaign activation failed',
        error: error.message || 'An unexpected error occurred during campaign activation',
      };
    }
  }

  /**
   * Collect engagement metrics for active campaigns
   * Should be called periodically (e.g., every 6-24 hours)
   *
   * @param campaignId - Campaign to update metrics for
   * @param userId - User ID for auth
   */
  async collectCampaignEngagement(campaignId: number, userId: string): Promise<void> {
    try {
      // Get campaign
      const campaigns = await db
        .select()
        .from(adCampaigns)
        .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.userId, userId)))
        .limit(1);

      if (campaigns.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = campaigns[0];
      const organicMetrics = campaign.organicMetrics as any;

      if (!organicMetrics || !organicMetrics.posts) {
        logger.info('No organic posts to track for campaign', campaignId);
        return;
      }

      // Update metrics for each post
      const updatedPosts = [];
      let totalImpressions = 0;
      let totalEngagements = 0;
      let totalReach = 0;

      for (const post of organicMetrics.posts) {
        if (!post.postId) continue;

        try {
          // Collect engagement data from platform
          const engagement = await platformAPI.collectEngagementData(
            post.postId,
            post.platform,
            userId
          );

          // Update post metrics
          const updatedPost = {
            ...post,
            metrics: {
              impressions: engagement.impressions || engagement.views || 0,
              engagements: engagement.likes + engagement.comments + engagement.shares,
              shares: engagement.shares,
              clicks: 0, // Not available from most platforms
              reach: engagement.reach || engagement.impressions || 0,
              engagementRate: engagement.engagementRate || 0,
            },
            organicBoost: this.calculateOrganicBoost(engagement),
            lastUpdated: new Date().toISOString(),
          };

          updatedPosts.push(updatedPost);

          // Aggregate totals
          totalImpressions += updatedPost.metrics.impressions;
          totalEngagements += updatedPost.metrics.engagements;
          totalReach += updatedPost.metrics.reach;
        } catch (err: unknown) {
          logger.error(
            `Failed to collect engagement for ${post.platform} post ${post.postId}:`,
            err.message
          );
          updatedPosts.push(post); // Keep existing data
        }
      }

      // Update campaign with new metrics
      const updatedOrganicMetrics = {
        ...organicMetrics,
        posts: updatedPosts,
        totalImpressions,
        totalEngagements,
        totalReach,
        avgEngagementRate: totalImpressions > 0 ? totalEngagements / totalImpressions : 0,
        lastCollected: new Date().toISOString(),
      };

      await db
        .update(adCampaigns)
        .set({
          impressions: totalImpressions,
          clicks: totalEngagements, // Using clicks field for total engagements
          organicMetrics: updatedOrganicMetrics as any,
        })
        .where(eq(adCampaigns.id, campaignId));

      logger.info(
        `✅ Updated engagement metrics for campaign ${campaignId}: ${totalImpressions} impressions, ${totalEngagements} engagements`
      );
    } catch (error: unknown) {
      logger.error('Failed to collect campaign engagement:', error);
    }
  }

  /**
   * Get list of connected social media platforms for a user
   *
   * @param userId - User ID
   * @returns Array of connected platform names (lowercase)
   */
  private async getConnectedPlatforms(userId: string): Promise<string[]> {
    const user = await storage.getUser(userId);
    if (!user) return [];

    const platforms: string[] = [];

    if (user.twitterToken) platforms.push('twitter');
    if (user.facebookToken) platforms.push('facebook');
    if (user.instagramToken) platforms.push('instagram');
    if (user.linkedinToken) platforms.push('linkedin');
    if (user.tiktokToken) platforms.push('tiktok');
    if (user.threadsToken) platforms.push('threads');

    return platforms;
  }

  /**
   * Create a content calendar entry for a posted creative
   *
   * @param userId - User ID
   * @param creative - Creative that was posted
   * @param platform - Platform where it was posted
   * @param postId - Post ID from the platform
   * @param campaign - Campaign the creative belongs to
   */
  private async createCalendarEntry(
    userId: string,
    creative: unknown,
    platform: string,
    postId: string,
    campaign: unknown
  ): Promise<any> {
    const entry = await db
      .insert(contentCalendar)
      .values({
        userId,
        title: `${campaign.name} - ${platform}`,
        scheduledFor: new Date(), // Already published
        platforms: [platform] as any,
        status: 'published',
        postType: 'campaign_post',
        content: creative.normalizedContent || creative.rawContent,
        mediaUrls: creative.assetUrls as any,
        hashtags: this.extractHashtags(
          creative.normalizedContent || creative.rawContent || ''
        ) as any,
        publishedAt: new Date(),
      })
      .returning();

    return entry[0];
  }

  /**
   * Extract hashtags from content text
   *
   * @param text - Content text
   * @returns Array of hashtags
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w]+/g;
    const matches = text.match(hashtagRegex);
    return matches || [];
  }

  /**
   * Calculate organic boost compared to paid ads
   *
   * @param engagement - Engagement metrics from platform
   * @returns Organic boost percentage
   */
  private calculateOrganicBoost(engagement: unknown): number {
    // Organic posts typically get 100-300% more engagement per impression than paid ads
    // This is a simplified calculation
    const engagementRate = engagement.engagementRate || 0;
    const avgPaidAdEngagementRate = 0.01; // 1% baseline for paid ads

    if (engagementRate > avgPaidAdEngagementRate) {
      return ((engagementRate - avgPaidAdEngagementRate) / avgPaidAdEngagementRate) * 100;
    }

    return 0;
  }

  /**
   * Batch collect engagement for all active campaigns
   * This should be called by a cron job every 6-24 hours
   *
   * @param userId - Optional user ID to limit to specific user
   */
  async collectAllActiveEngagement(userId?: string): Promise<void> {
    try {
      // Get all active campaigns
      let query = db.select().from(adCampaigns).where(eq(adCampaigns.status, 'active'));

      const activeCampaigns = userId
        ? await query.where(eq(adCampaigns.userId, userId))
        : await query;

      logger.info(`🔄 Collecting engagement for ${activeCampaigns.length} active campaigns...`);

      for (const campaign of activeCampaigns) {
        await this.collectCampaignEngagement(campaign.id, campaign.userId);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      logger.info(`✅ Finished collecting engagement for ${activeCampaigns.length} campaigns`);
    } catch (error: unknown) {
      logger.error('Failed to collect all engagement:', error);
    }
  }

  /**
   * Legacy method for variant-based dispatch (backwards compatibility)
   * Now uses the new platformAPI system under the hood
   */
  async dispatchToPlatform(
    platform: string,
    variant: unknown,
    userId: string,
    campaign: unknown
  ): Promise<any> {
    try {
      // Prepare content from variant
      const content = {
        text: variant.content || variant.normalizedContent || '',
        body: variant.content || variant.normalizedContent || '',
        mediaUrl: variant.assetUrls && variant.assetUrls.length > 0 ? variant.assetUrls[0] : null,
        hashtags: this.extractHashtags(variant.content || ''),
      };

      // Post using platformAPI
      const results = await platformAPI.publishContent(content, [platform], userId);
      const result = results[0];

      if (result.success && result.postId) {
        // Log success
        await storage.createAdDeliveryLog({
          variantId: variant.id,
          platform: result.platform,
          platformAdId: result.postId,
          deliveryStatus: 'active',
          platformResponse: { type: 'organic_post', posted_at: new Date().toISOString() },
          deliveredAt: new Date(),
        });

        return {
          id: result.postId,
          type: 'organic_post',
          status: 'published',
          reach_type: 'organic',
          ad_spend: 0,
          posted_at: new Date().toISOString(),
        };
      } else {
        throw new Error(result.error || 'Failed to post to platform');
      }
    } catch (error: unknown) {
      // Log failure
      await storage.createAdDeliveryLog({
        variantId: variant.id,
        platform,
        deliveryStatus: 'failed',
        errorMessage: error.message,
        retryCount: 1,
      });
      throw error;
    }
  }
}

export const advertisingDispatchService = new AdvertisingDispatchService();
