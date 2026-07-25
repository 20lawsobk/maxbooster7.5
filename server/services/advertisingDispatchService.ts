import { db } from "../db";
import { storage } from "../storage";
import { platformAPI } from "../platform-apis";
import { adCampaigns, adCreatives, contentCalendar, socialAccounts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../logger.js";

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
    campaignId: string,
    userId: string,
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
        .where(
          and(eq(adCampaigns?.id, campaignId), eq(adCampaigns?.userId, userId)),
        )
        .limit(1);

      if (campaigns?.length === 0) {
        return {
          success: false,
          message: "Campaign not found",
          error:
            "Campaign not found or you do not have permission to activate it",
        };
      }

      const campaign = campaigns[0];

      // 2. Check if campaign is already active
      if (campaign?.status === "active" || campaign?.status === "running") {
        return {
          success: false,
          message: "Campaign is already active",
          error: "This campaign has already been activated",
        };
      }

      // 3. Get campaign creatives
      const creatives = await db
        .select()
        .from(adCreatives)
        .where(eq(adCreatives?.campaignId, campaignId));

      if (creatives?.length === 0) {
        return {
          success: false,
          message: "No creatives found",
          error:
            "This campaign has no creatives to post. Please create at least one creative first.",
        };
      }

      // 4. Determine target platforms.
      // NOTE: adCampaigns has a singular `platform` column (NOT `platforms`).
      // Additional fan-out platforms may be supplied via metadata?.fanOutPlatforms.
      const meta = (campaign?.metadata as Record<string, unknown> | null) || {};
      const fanOut = Array.isArray(meta?.fanOutPlatforms)
        ? (meta?.fanOutPlatforms as unknown[]).filter(
            (p): p is string => typeof p === "string",
          )
        : [];
      const requestedPlatforms = Array.from(
        new Set([campaign?.platform, ...fanOut].filter((p): p is string => !!p)),
      );

      // 5. Verify user has connected social accounts
      const connectedPlatforms = await this.getConnectedPlatforms(userId);

      if (connectedPlatforms?.length === 0) {
        return {
          success: false,
          message: "No social media accounts connected",
          error:
            "You must connect at least one social media account before activating campaigns.",
          requiredConnections: [
            "Twitter",
            "Facebook",
            "Instagram",
            "LinkedIn",
            "TikTok",
          ],
          connectUrl: "/settings#social-connections",
        };
      }

      // Filter to only use platforms that are both requested AND connected
      let platformsToUse = requestedPlatforms?.filter((p) =>
        connectedPlatforms?.includes(p?.toLowerCase()),
      );

      // Self-optimization feedback: optimizeTargeting() persists
      // targetAudience.priorityPlatforms ranked by real engagement — dispatch
      // in that order (and include any connected priority platform even if it
      // wasn't in the original request) so targeting changes take real effect.
      const ta = (campaign?.targetAudience as Record<string, unknown> | null) || {};
      const priority = Array.isArray(ta?.priorityPlatforms)
        ? (ta.priorityPlatforms as unknown[]).filter(
            (p): p is string => typeof p === "string",
          )
        : [];
      if (priority.length > 0) {
        const connectedPriority = priority.filter((p) =>
          connectedPlatforms?.includes(p.toLowerCase()),
        );
        const rank = (p: string) => {
          const i = connectedPriority.findIndex(
            (q) => q.toLowerCase() === p.toLowerCase(),
          );
          return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        platformsToUse = Array.from(
          new Set([...connectedPriority, ...platformsToUse]),
        ).sort((a, b) => rank(a) - rank(b));
      }

      if (platformsToUse?.length === 0) {
        return {
          success: false,
          message: "No connected platforms match campaign targets",
          error: `Campaign targets ${requestedPlatforms?.join(", ")} but you have only connected ${connectedPlatforms?.join(", ")}`,
          requiredConnections: requestedPlatforms,
          connectUrl: "/settings#social-connections",
        };
      }

      // 6. Post creatives to platforms
      const postResults: Record<string, string> = {};
      const calendarEntries: string[] = [];
      const errors: string[] = [];
      let successfulPosts = 0;

      for (const creative of creatives) {
        // Prepare content for posting.
        // NOTE: adCreatives stores copy in `description`/`headline` and media in
        // `mediaUrl` (there are no `normalizedContent`/`rawContent`/`assetUrls`
        // columns), so read the real columns here.
        const copy = creative?.description || creative?.headline || "";
        // Beat Money Loop creatives carry the beat's audio rendered into a
        // postable video; variants.localMediaPath points at the local file so
        // platforms that upload bytes (Twitter) don't have to re-fetch the URL.
        const variants = (creative?.variants ?? {}) as Record<string, unknown>;
        const localMediaPath =
          typeof variants.localMediaPath === "string"
            ? variants.localMediaPath
            : null;
        // URL-fetching platforms (IG/FB/TikTok) can only use an ABSOLUTE
        // http(s) URL pointing at postable media (video/image). Never hand
        // them a relative path or a raw WAV — post text-only instead, and
        // let byte-upload platforms (Twitter) use the local file.
        const rawMediaUrl = creative.mediaUrl || null;
        const isAbsolute = !!rawMediaUrl && /^https?:\/\//i.test(rawMediaUrl);
        const isPostableMedia =
          isAbsolute && !/\.(wav|mp3|flac|ogg|aiff?)(\?|$)/i.test(rawMediaUrl!);
        const content = {
          text: copy,
          body: copy,
          mediaUrl: isPostableMedia ? rawMediaUrl : null,
          mediaLocalPath: localMediaPath,
          hashtags: this.extractHashtags(copy),
        };

        // Post to each platform
        const publishResults = await platformAPI?.publishContent(
          content,
          platformsToUse,
          userId,
        );

        // Process results
        for (const result of publishResults) {
          if (result?.success && result?.postId) {
            postResults[`${result.platform}_${creative.id}`] = result?.postId;
            successfulPosts++;

            // Create content calendar entry
            try {
              const calendarEntry = await this.createCalendarEntry(
                userId,
                creative,
                result?.platform,
                result?.postId,
                campaign,
              );
              calendarEntries?.push(calendarEntry?.id);
            } catch (err: unknown) {
              logger.warn({ err: err }, "Failed to create calendar entry:");
              errors?.push(
                `Calendar entry failed for ${result?.platform}: ${err?.message}`,
              );
            }

            // Create delivery log
            try {
              await storage?.createAdDeliveryLog({
                variantId: creative.id,
                platform: result.platform,
                platformAdId: result.postId,
                deliveryStatus: "active",
                platformResponse: {
                  type: "organic_post",
                  posted_at: new Date().toISOString(),
                },
                deliveredAt: new Date(),
              });
            } catch (err: unknown) {
              logger.warn({ err: err }, "Failed to create delivery log:");
            }
          } else {
            errors?.push(
              `${result?.platform}: ${result?.error || "Unknown error"}`,
            );

            // Log failure
            try {
              await storage?.createAdDeliveryLog({
                variantId: creative.id,
                platform: result.platform,
                deliveryStatus: "failed",
                errorMessage: result.error || "Unknown error",
                retryCount: 1,
              });
            } catch (err: unknown) {
              logger.warn({ err: err }, "Failed to create delivery log:");
            }
          }
        }
      }

      // 7. Update campaign status and metrics
      const organicMetrics = {
        posts: Object.entries(postResults).map(([key, postId]) => {
          const [platform] = key?.split("_");
          // Key format is `${platform}_${creative.id}` — recover the creative
          // id so per-creative performance can drive optimizeCreative().
          const creativeId = key?.slice((platform?.length ?? 0) + 1) || undefined;
          return {
            platform,
            creativeId,
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

      // Only mark "active" when at least one post actually went through.
      // Keeping status as "draft" when 0 posts succeed allows the campaign to
      // be re-dispatched later (e.g. once expired tokens are refreshed) without
      // the "already active" guard blocking it.
      await db
        .update(adCampaigns)
        .set({
          status: successfulPosts > 0 ? "active" : "draft",
          organicMetrics: organicMetrics as Record<string, unknown>,
          connectedPlatforms: platformsToUse as Record<string, unknown>,
        })
        .where(eq(adCampaigns?.id, campaignId));

      // 8. Return success
      return {
        success: true,
        message: `Campaign activated! Posted ${successfulPosts} times across ${platformsToUse?.length} platforms.`,
        results: {
          postsCreated: successfulPosts,
          platformsUsed: platformsToUse,
          postIds: postResults,
          calendarEntries,
          errors,
        },
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Campaign activation error:");
      return {
        success: false,
        message: "Campaign activation failed",
        error:
          error?.message ||
          "An unexpected error occurred during campaign activation",
      };
    }
  }

  /**
   * Collect engagement metrics for active campaigns
   * Should be called periodically (e?.g., every 6-24 hours)
   *
   * @param campaignId - Campaign to update metrics for
   * @param userId - User ID for auth
   */
  async collectCampaignEngagement(
    campaignId: string,
    userId: string,
  ): Promise<void> {
    try {
      // Get campaign
      const campaigns = await db
        .select()
        .from(adCampaigns)
        .where(
          and(eq(adCampaigns?.id, campaignId), eq(adCampaigns?.userId, userId)),
        )
        .limit(1);

      if (campaigns?.length === 0) {
        throw new Error("Campaign not found");
      }

      const campaign = campaigns[0];
      const organicMetrics = campaign?.organicMetrics as Record<string, unknown>;

      if (!organicMetrics || !organicMetrics?.posts) {
        logger.info("No organic posts to track for campaign", campaignId);
        return;
      }

      // Update metrics for each post
      const updatedPosts = [];
      let totalImpressions = 0;
      let totalEngagements = 0;
      let totalReach = 0;

      for (const post of organicMetrics?.posts) {
        if (!post?.postId) continue;

        try {
          // Collect engagement data from platform
          const engagement = await platformAPI?.collectEngagementData(
            post?.postId,
            post?.platform,
            userId,
          );

          // Update post metrics
          const updatedPost = {
            ...post,
            metrics: {
              impressions: engagement.impressions || engagement?.views || 0,
              engagements:
                engagement?.likes + engagement?.comments + engagement?.shares,
              shares: engagement.shares,
              clicks: 0, // Not available from most platforms
              reach: engagement.reach || engagement?.impressions || 0,
              engagementRate: engagement.engagementRate || 0,
            },
            organicBoost: this.calculateOrganicBoost(engagement),
            lastUpdated: new Date().toISOString(),
          };

          updatedPosts?.push(updatedPost);

          // Aggregate totals
          totalImpressions += updatedPost?.metrics.impressions;
          totalEngagements += updatedPost?.metrics.engagements;
          totalReach += updatedPost?.metrics.reach;
        } catch (err: unknown) {
          logger.warn(
            `Failed to collect engagement for ${post?.platform} post ${post?.postId}:`,
            err?.message,
          );
          updatedPosts?.push(post); // Keep existing data
        }
      }

      // Update campaign with new metrics
      const updatedOrganicMetrics = {
        ...organicMetrics,
        posts: updatedPosts,
        totalImpressions,
        totalEngagements,
        totalReach,
        avgEngagementRate:
          totalImpressions > 0 ? totalEngagements / totalImpressions : 0,
        lastCollected: new Date().toISOString(),
      };

      await db
        .update(adCampaigns)
        .set({
          impressions: totalImpressions,
          clicks: totalEngagements, // Using clicks field for total engagements
          organicMetrics: updatedOrganicMetrics as Record<string, unknown>,
        })
        .where(eq(adCampaigns?.id, campaignId));

      logger.info(
        `✅ Updated engagement metrics for campaign ${campaignId}: ${totalImpressions} impressions, ${totalEngagements} engagements`,
      );
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to collect campaign engagement:");
    }
  }

  /**
   * Get list of connected social media platforms for a user
   *
   * @param userId - User ID
   * @returns Array of connected platform names (lowercase)
   */
  private async getConnectedPlatforms(userId: string): Promise<string[]> {
    const rows = await db
      .select({ platform: socialAccounts.platform })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.isActive, true),
          // Exclude accounts whose OAuth tokens have already expired.
          // Platforms that don't use token_expires_at (e.g. Instagram, Facebook,
          // Threads) leave it NULL — treat NULL as "never expires" (still valid).
          sql`(${socialAccounts.tokenExpiresAt} IS NULL OR ${socialAccounts.tokenExpiresAt} > NOW())`,
        ),
      );
    return rows.map((r) => r.platform.toLowerCase());
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
    _postId: string,
    campaign: unknown,
  ): Promise<unknown> {
    const entry = await db
      .insert(contentCalendar)
      .values({
        userId,
        title: `${campaign?.name} - ${platform}`,
        scheduledFor: new Date(), // Already published
        platforms: [platform] as Record<string, unknown>,
        status: "published",
        postType: "campaign_post",
        content: creative?.description || creative?.headline || "",
        mediaUrls: (creative?.mediaUrl ? [creative.mediaUrl] : null) as Record<string, unknown>,
        hashtags: this.extractHashtags(
          creative?.description || creative?.headline || "",
        ) as Record<string, unknown>,
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
    const matches = text?.match(hashtagRegex);
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
    const engagementRate = engagement?.engagementRate || 0;
    const avgPaidAdEngagementRate = 0.01; // 1% baseline for paid ads

    if (engagementRate > avgPaidAdEngagementRate) {
      return (
        ((engagementRate - avgPaidAdEngagementRate) / avgPaidAdEngagementRate) *
        100
      );
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
      const activeCampaigns = userId
        ? await db
            .select()
            .from(adCampaigns)
            .where(
              and(
                eq(adCampaigns?.status, "active"),
                eq(adCampaigns?.userId, userId),
              ),
            )
            .limit(200)
        : await db
            .select()
            .from(adCampaigns)
            .where(eq(adCampaigns?.status, "active"))
            .limit(200);

      logger.info(
        `🔄 Collecting engagement for ${activeCampaigns?.length} active campaigns...`,
      );

      for (const campaign of activeCampaigns) {
        await this.collectCampaignEngagement(campaign?.id, campaign?.userId);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      logger.info(
        `✅ Finished collecting engagement for ${activeCampaigns?.length} campaigns`,
      );
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to collect all engagement:");
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
    campaign: unknown,
  ): Promise<unknown> {
    try {
      // Prepare content from variant
      const content = {
        text: variant.content || variant?.normalizedContent || "",
        body: variant.content || variant?.normalizedContent || "",
        mediaUrl:
          variant?.assetUrls && variant?.assetUrls.length > 0
            ? variant?.assetUrls[0]
            : null,
        hashtags: this.extractHashtags(variant?.content || ""),
      };

      // Post using platformAPI
      const results = await platformAPI?.publishContent(
        content,
        [platform],
        userId,
      );
      const result = results[0];

      if (result?.success && result?.postId) {
        // Log success
        await storage?.createAdDeliveryLog({
          variantId: variant.id,
          platform: result.platform,
          platformAdId: result.postId,
          deliveryStatus: "active",
          platformResponse: {
            type: "organic_post",
            posted_at: new Date().toISOString(),
          },
          deliveredAt: new Date(),
        });

        return {
          id: result.postId,
          type: "organic_post",
          status: "published",
          reach_type: "organic",
          ad_spend: 0,
          posted_at: new Date().toISOString(),
        };
      } else {
        throw new Error(result?.error || "Failed to post to platform");
      }
    } catch (error: unknown) {
      // Log failure
      await storage?.createAdDeliveryLog({
        variantId: variant.id,
        platform,
        deliveryStatus: "failed",
        errorMessage: error.message,
        retryCount: 1,
      });
      throw error;
    }
  }

  /**
   * Load a campaign by id (internal/autonomous context — no user filter).
   */
  private async getCampaignById(campaignId: string) {
    const rows = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.id, campaignId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Aggregate real stored delivery metrics for a campaign.
   * Derived entirely from data collected by collectCampaignEngagement —
   * returns zeros when nothing has been collected yet (never fabricated).
   */
  async getCampaignMetrics(campaignId: string): Promise<{
    impressions: number;
    engagements: number;
    ctr: number;
    conversionRate: number;
    roas: number;
    perPlatform: Record<
      string,
      { impressions: number; engagements: number; posts: number }
    >;
  }> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const organic = (campaign.organicMetrics ?? {}) as {
      posts?: Array<{
        platform?: string;
        metrics?: {
          impressions?: number;
          engagements?: number;
          clicks?: number;
        };
      }>;
      totalImpressions?: number;
      totalEngagements?: number;
    };

    const impressions =
      organic.totalImpressions ?? campaign.impressions ?? 0;
    const engagements = organic.totalEngagements ?? campaign.clicks ?? 0;

    const perPlatform: Record<
      string,
      { impressions: number; engagements: number; posts: number }
    > = {};
    for (const post of organic.posts ?? []) {
      const platform = post.platform || "unknown";
      if (!perPlatform[platform])
        perPlatform[platform] = { impressions: 0, engagements: 0, posts: 0 };
      perPlatform[platform].impressions += post.metrics?.impressions ?? 0;
      perPlatform[platform].engagements += post.metrics?.engagements ?? 0;
      perPlatform[platform].posts += 1;
    }

    const ctr = impressions > 0 ? engagements / impressions : 0;
    // Organic delivery has no conversion pixel; approximate conversion rate
    // as engagement depth (engagements per impression) — same source data,
    // clearly a proxy, never invented.
    const conversionRate = ctr;
    // ROAS proxy for zero-cost organic delivery: estimated media value of
    // impressions (CPM $5) versus configured budget. budget=0 → roas 0 when
    // no data, or a large value when impressions exist at no cost.
    const budget = campaign.budget ?? 0;
    const estimatedValue = (impressions / 1000) * 5;
    const roas =
      budget > 0 ? estimatedValue / budget : impressions > 0 ? 999 : 0;

    return { impressions, engagements, ctr, conversionRate, roas, perPlatform };
  }

  /**
   * Refocus targeting on the platforms that actually perform.
   * Real side effect: rewrites targetAudience.priorityPlatforms (read on the
   * next dispatch) and appends to aiOptimizations.history.
   */
  async optimizeTargeting(campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return false;
    const metrics = await this.getCampaignMetrics(campaignId);

    const ranked = Object.entries(metrics.perPlatform)
      .map(([platform, m]) => ({
        platform,
        rate: m.impressions > 0 ? m.engagements / m.impressions : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    if (ranked.length === 0) {
      logger.info(
        `[AdDispatch] optimizeTargeting(${campaignId}): no per-platform data yet — skipping`,
      );
      return false;
    }

    const priorityPlatforms = ranked
      .filter((r) => r.rate > 0)
      .map((r) => r.platform);
    const targetAudience = {
      ...((campaign.targetAudience as Record<string, unknown>) ?? {}),
      priorityPlatforms:
        priorityPlatforms.length > 0
          ? priorityPlatforms
          : ranked.map((r) => r.platform),
    };

    await db
      .update(adCampaigns)
      .set({
        targetAudience,
        aiOptimizations: this.appendOptimization(campaign, {
          type: "targeting",
          priorityPlatforms: targetAudience.priorityPlatforms,
          basis: ranked,
        }),
        updatedAt: new Date(),
      })
      .where(eq(adCampaigns.id, campaignId));
    logger.info(
      `[AdDispatch] optimizeTargeting(${campaignId}): priority=${(targetAudience.priorityPlatforms as string[]).join(",")}`,
    );
    return true;
  }

  /**
   * Reorder creatives so best-engaging variants dispatch first.
   * Real side effect: rewrites creativeIds order + aiOptimizations.history.
   */
  async optimizeCreative(campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return false;
    const ids = campaign.creativeIds ?? [];
    if (ids.length < 2) {
      logger.info(
        `[AdDispatch] optimizeCreative(${campaignId}): ${ids.length} creative(s) — nothing to reorder`,
      );
      return false;
    }

    // Score creatives by engagement recorded on delivery logs / organic posts.
    const organic = (campaign.organicMetrics ?? {}) as {
      posts?: Array<{
        creativeId?: string;
        metrics?: { engagements?: number; impressions?: number };
      }>;
    };
    const score = new Map<string, number>();
    for (const post of organic.posts ?? []) {
      if (!post.creativeId) continue;
      const imp = post.metrics?.impressions ?? 0;
      const eng = post.metrics?.engagements ?? 0;
      const rate = imp > 0 ? eng / imp : 0;
      score.set(post.creativeId, Math.max(score.get(post.creativeId) ?? 0, rate));
    }
    if (score.size === 0) {
      logger.info(
        `[AdDispatch] optimizeCreative(${campaignId}): no creative-level metrics yet — skipping`,
      );
      return false;
    }

    const reordered = [...ids].sort(
      (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0),
    );
    if (reordered.join() === ids.join()) return false; // no change → no claim

    await db
      .update(adCampaigns)
      .set({
        creativeIds: reordered,
        aiOptimizations: this.appendOptimization(campaign, {
          type: "creative",
          order: reordered,
          scores: Object.fromEntries(score),
        }),
        updatedAt: new Date(),
      })
      .where(eq(adCampaigns.id, campaignId));
    logger.info(
      `[AdDispatch] optimizeCreative(${campaignId}): reordered ${reordered.length} creatives by engagement`,
    );
    return true;
  }

  /**
   * Budget/pacing optimization for organic-first delivery.
   * Real side effect: adjusts dailyBudget pacing + aiOptimizations.history.
   */
  async optimizeBidding(campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return false;
    const metrics = await this.getCampaignMetrics(campaignId);

    const currentDaily = campaign.dailyBudget ?? 0;
    if (currentDaily <= 0) {
      logger.info(
        `[AdDispatch] optimizeBidding(${campaignId}): organic-only (no paid budget) — nothing to adjust`,
      );
      return false;
    }

    // Low ROAS → throttle paid spend 15% and lean on organic delivery;
    // strong ROAS is handled by the caller not invoking this method.
    const newDaily = Math.max(1, Number((currentDaily * 0.85).toFixed(2)));
    if (newDaily === currentDaily) return false;

    await db
      .update(adCampaigns)
      .set({
        dailyBudget: newDaily,
        aiOptimizations: this.appendOptimization(campaign, {
          type: "bidding",
          previousDailyBudget: currentDaily,
          newDailyBudget: newDaily,
          roas: metrics.roas,
        }),
        updatedAt: new Date(),
      })
      .where(eq(adCampaigns.id, campaignId));
    logger.info(
      `[AdDispatch] optimizeBidding(${campaignId}): dailyBudget ${currentDaily} → ${newDaily} (roas=${metrics.roas.toFixed(2)})`,
    );
    return true;
  }

  /** Append an entry to aiOptimizations.history, preserving existing keys. */
  private appendOptimization(
    campaign: { aiOptimizations?: unknown },
    entry: Record<string, unknown>,
  ): Record<string, unknown> {
    const existing =
      (campaign.aiOptimizations as Record<string, unknown>) ?? {};
    const history = Array.isArray(existing.history) ? existing.history : [];
    return {
      ...existing,
      realTimeOptimization: true,
      history: [...history, { ...entry, at: new Date().toISOString() }].slice(
        -50,
      ),
    };
  }
}

export const advertisingDispatchService = new AdvertisingDispatchService();
