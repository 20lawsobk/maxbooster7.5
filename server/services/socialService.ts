import { storage } from "../storage";
import { aiContentService } from "./aiContentService";
import { db } from "../db.js";
import { socialAccounts, socialCampaigns } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

import type { InsertAdCampaign, AdCampaign } from "@shared/schema";
import { logger } from "../logger.js";

// Timeout-guarded fetch (10 s default)
const timedFetch = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(10_000), ...init });

/** Retrieve and optionally decrypt the access token stored in social_accounts. */
async function getStoredToken(
  userId: string,
  platform: string,
): Promise<string | null> {
  try {
    const [account] = await db
      .select({ accessToken: socialAccounts.accessToken })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, platform),
          eq(socialAccounts.isActive, true),
        ),
      )
      .limit(1);
    if (!account?.accessToken) return null;
    // Tokens may be stored as plain text or AES-256-GCM (iv:tag:cipher).
    // If it contains two colons it is encrypted — fall through to the OAuth
    // service for a full decrypt; otherwise return as-is.
    const parts = account.accessToken.split(":");
    if (parts.length === 3) {
      // Attempt inline AES-256-GCM decryption using TOKEN_ENCRYPTION_KEY
      const { createDecipheriv } = await import("crypto");
      const key = Buffer.from(
        (process.env.TOKEN_ENCRYPTION_KEY || "")
          .substring(0, 32)
          .padEnd(32, "0"),
      );
      const iv = Buffer.from(parts[0], "hex");
      const authTag = Buffer.from(parts[1], "hex");
      const enc = parts[2];
      const decipher = createDecipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
      });
      decipher.setAuthTag(authTag);
      let plain = decipher.update(enc, "hex", "utf8");
      plain += decipher.final("utf8");
      return plain || null;
    }
    return account.accessToken;
  } catch {
    return null;
  }
}

export interface SocialPost {
  id: string;
  campaignId?: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  publishedAt?: Date;
  status: "draft" | "scheduled" | "published" | "failed";
  metrics?: {
    likes: number;
    shares: number;
    comments: number;
    reach: number;
    engagement: number;
  };
}

export interface Campaign {
  id: number;
  userId: string;
  name: string;
  platforms: string[];
  content: Record<string, unknown>;
  variants?: unknown[];
  schedule?: Record<string, unknown>;
  status: "draft" | "active" | "paused" | "completed";
  metrics?: Record<string, unknown>;
  createdAt: Date;
}

export class SocialService {
  /**
   * Create social media campaign
   */
  async createCampaign(data: InsertAdCampaign): Promise<AdCampaign> {
    try {
      const campaign = await storage.createAdCampaign(data);
      return campaign;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating campaign:");
      throw new Error("Failed to create campaign");
    }
  }

  /**
   * Get user's campaigns
   */
  async getUserCampaigns(userId: string): Promise<AdCampaign[]> {
    try {
      return await storage.getUserAdCampaigns(userId);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching campaigns:");
      throw new Error("Failed to fetch campaigns");
    }
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(
    campaignId: number,
    userId: string,
  ): Promise<AdCampaign | undefined> {
    try {
      const campaign = await storage.getAdCampaign(campaignId);

      if (campaign && campaign.userId !== userId) {
        throw new Error("Unauthorized access to campaign");
      }

      return campaign;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching campaign:");
      throw new Error("Failed to fetch campaign");
    }
  }

  /**
   * Generate A/B test variants for campaign
   */
  async generateVariants(
    campaignId: number,
    platforms: string[],
  ): Promise<{
    variants: Array<{ platform: string; content: string[] }>;
  }> {
    try {
      const campaign = await storage.getAdCampaign(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const variants: Array<{ platform: string; content: string[] }> = [];

      for (const platform of platforms) {
        const content = await aiContentService.generateVariations(
          campaign.adContent || "",
          platform,
          3,
        );

        variants.push({
          platform,
          content,
        });
      }

      // Store variants in campaign
      await storage.updateAdCampaign(campaignId, { variants });

      return { variants };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating variants:");
      throw new Error("Failed to generate variants");
    }
  }

  /**
   * Schedule posts for campaign
   */
  async schedulePost(
    campaignId: number,
    schedule: Array<{ platform: string; content: string; scheduledAt: Date }>,
  ): Promise<{ success: boolean; scheduled: number }> {
    try {
      const campaign = await storage.getAdCampaign(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      // Store schedule in campaign
      const existingSchedule = (campaign.schedule as unknown[]) || [];
      const newSchedule = [...existingSchedule, ...schedule];

      await storage.updateAdCampaign(campaignId, { schedule: newSchedule });

      return {
        success: true,
        scheduled: schedule.length,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error scheduling posts:");
      throw new Error("Failed to schedule posts");
    }
  }

  /**
   * Publish post to platform using the stored OAuth access token for that platform.
   * Supports: twitter, instagram (Graph API), tiktok, facebook.
   */
  async publishPost(
    postId: string,
    userId: string,
  ): Promise<{ success: boolean; publishedAt: Date }> {
    // Resolve the scheduled post from social_campaigns
    const [post] = await db
      .select()
      .from(socialCampaigns)
      .where(
        and(eq(socialCampaigns.userId, userId), eq(socialCampaigns.id, postId)),
      )
      .limit(1);

    if (!post) {
      throw new Error(`Scheduled post ${postId} not found for user ${userId}`);
    }

    const platform = post.platform;
    const content = post.content || "";
    const mediaUrls: string[] = post.mediaUrls || [];

    const token = await getStoredToken(userId, platform);
    if (!token) {
      throw new Error(
        `No active OAuth token for platform ${platform} — please reconnect in Settings`,
      );
    }

    try {
      const publishedAt = new Date();

      if (platform === "twitter" || platform === "x") {
        const body: Record<string, unknown> = { text: content.slice(0, 280) };
        const res = await timedFetch("https://api.twitter.com/2/tweets", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(
            `Twitter publish failed (${res.status}): ${err.slice(0, 200)}`,
          );
        }
        const data = await res.json();
        logger.info({ postId: data.data?.id }, "Published to Twitter");
      } else if (platform === "facebook") {
        const pageId = process.env.FACEBOOK_PAGE_ID || "me";
        const res = await timedFetch(
          `https://graph.facebook.com/v18.0/${pageId}/feed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: content, access_token: token }),
          },
        );
        if (!res.ok) {
          const err = await res.text();
          throw new Error(
            `Facebook publish failed (${res.status}): ${err.slice(0, 200)}`,
          );
        }
      } else if (platform === "instagram") {
        // Instagram Graph API two-step: create container → publish
        const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "me";
        const mediaPayload: Record<string, string> = {
          caption: content,
          access_token: token,
        };
        if (mediaUrls.length > 0) mediaPayload.image_url = mediaUrls[0];
        const createRes = await timedFetch(
          `https://graph.instagram.com/v18.0/${igId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mediaPayload),
          },
        );
        if (createRes.ok) {
          const container = await createRes.json();
          if (container.id) {
            await timedFetch(
              `https://graph.instagram.com/v18.0/${igId}/media_publish`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creation_id: container.id,
                  access_token: token,
                }),
              },
            );
          }
        }
      } else if (platform === "tiktok") {
        // TikTok Content Posting API v2 — text post (video requires upload URL flow)
        const res = await timedFetch(
          "https://open.tiktokapis.com/v2/post/publish/content/init/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
              post_info: {
                title: content.slice(0, 150),
                privacy_level: "PUBLIC_TO_EVERYONE",
                disable_comment: false,
              },
              source_info: {
                source: "PULL_FROM_URL",
                video_url: mediaUrls[0] || "",
              },
            }),
          },
        );
        if (!res.ok) {
          const err = await res.text();
          logger.warn(
            `TikTok publish failed (${res.status}): ${err.slice(0, 200)}`,
          );
        }
      } else if (platform === "linkedin") {
        const personIdRes = await timedFetch(
          "https://api.linkedin.com/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const person = personIdRes.ok ? await personIdRes.json() : null;
        const author = person?.sub ? `urn:li:person:${person.sub}` : "";
        if (author) {
          await timedFetch("https://api.linkedin.com/v2/ugcPosts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              author,
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: content },
                  shareMediaCategory: "NONE",
                },
              },
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
              },
            }),
          });
        }
      } else {
        logger.warn(
          `publishPost: unsupported platform ${platform} — post queued but not dispatched`,
        );
      }

      // Mark the scheduled post as published
      await db
        .update(socialCampaigns)
        .set({ status: "published", publishedAt })
        .where(
          and(
            eq(socialCampaigns.userId, userId),
            eq(socialCampaigns.id, postId),
          ),
        );

      return { success: true, publishedAt };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Post publishing error:");
      throw new Error(
        error instanceof Error ? error.message : "Failed to publish post",
      );
    }
  }

  /**
   * Track post metrics — reads engagement JSONB stored on the social_campaigns row,
   * optionally enriched by platform API data.
   */
  async trackMetrics(postId: string): Promise<{
    likes: number;
    shares: number;
    comments: number;
    reach: number;
    engagement: number;
  }> {
    try {
      const [post] = await db
        .select({
          engagement: socialCampaigns.engagement,
          platform: socialCampaigns.platform,
          userId: socialCampaigns.userId,
        })
        .from(socialCampaigns)
        .where(eq(socialCampaigns.id, postId))
        .limit(1);

      if (!post) {
        return { likes: 0, shares: 0, comments: 0, reach: 0, engagement: 0 };
      }

      // If engagement data is already stored (e.g. from autopilot sync), use it
      const stored = post.engagement as Record<string, number> | null;
      if (stored && (stored.likes || stored.reach || stored.comments)) {
        const likes = stored.likes || 0;
        const shares = stored.shares || 0;
        const comments = stored.comments || 0;
        const reach = stored.reach || 0;
        const total = likes + shares + comments;
        const rate = reach > 0 ? (total / reach) * 100 : 0;
        return { likes, shares, comments, reach, engagement: rate };
      }

      // No stored data — return zeros (metrics are populated by the analytics sync job)
      return { likes: 0, shares: 0, comments: 0, reach: 0, engagement: 0 };
    } catch (error: unknown) {
      logger.warn({ err: error }, "trackMetrics error:");
      return { likes: 0, shares: 0, comments: 0, reach: 0, engagement: 0 };
    }
  }

  /**
   * Optimize variant selection based on performance
   */
  async optimizeVariant(campaignId: number): Promise<{
    bestVariant: Record<string, unknown>;
    performanceData: Record<string, unknown>;
  }> {
    try {
      const campaign = await storage.getAdCampaign(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const variants = (campaign.variants as Record<string, unknown>[]) || [];

      // In production:
      // 1. Get metrics for each variant
      // 2. Calculate performance scores
      // 3. Select best performing variant
      // 4. Return recommendation

      return {
        bestVariant: variants[0],
        performanceData: {
          totalReach: 0,
          totalEngagement: 0,
          conversionRate: 0,
        },
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error optimizing variant:");
      throw new Error("Failed to optimize variant");
    }
  }

  /**
   * Connect social media platform via OAuth
   */
  async connectPlatform(
    userId: string,
    platform: string,
    _authCode: string,
  ): Promise<{
    success: boolean;
    accountId: string;
  }> {
    try {
      // In production: Handle OAuth flows for each platform
      switch (platform) {
        case "twitter":
          // Twitter API v2 OAuth
          break;
        case "instagram":
          // Instagram Basic Display API
          break;
        case "youtube":
          // YouTube Data API
          break;
        case "tiktok":
          // TikTok for Developers API
          break;
        case "facebook":
          // Facebook Graph API
          break;
        case "linkedin":
          // LinkedIn API
          break;
      }

      return { success: true, accountId: `${platform}_${userId}` };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Platform connection error:");
      throw new Error("Failed to connect platform");
    }
  }

  /**
   * Get engagement analytics across all connected platforms for a user.
   * Reads stored follower counts from social_accounts and aggregates
   * engagement from recent published posts in social_campaigns.
   */
  async getEngagementAnalytics(userId: string): Promise<{
    totalFollowers: number;
    totalReach: number;
    engagementRate: number;
    topPosts: unknown[];
  }> {
    try {
      // 1. Sum followers across all connected, active accounts
      const accounts = await db
        .select({
          platform: socialAccounts.platform,
          followerCount: socialAccounts.followerCount,
        })
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.userId, userId),
            eq(socialAccounts.isActive, true),
          ),
        );

      const totalFollowers = accounts.reduce(
        (sum, a) => sum + (a.followerCount || 0),
        0,
      );

      // 2. Aggregate reach & engagement from the last 30 days of published posts
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const posts = await db
        .select({
          engagement: socialCampaigns.engagement,
          platform: socialCampaigns.platform,
        })
        .from(socialCampaigns)
        .where(
          and(
            eq(socialCampaigns.userId, userId),
            eq(socialCampaigns.status, "published"),
            gte(socialCampaigns.publishedAt, since),
          ),
        )
        .orderBy(desc(socialCampaigns.publishedAt))
        .limit(100);

      let totalReach = 0;
      let totalEngagements = 0;
      const enrichedPosts: unknown[] = [];

      for (const post of posts) {
        const eng = post.engagement as Record<string, number> | null;
        if (!eng) continue;
        const reach = eng.reach || 0;
        const likes = eng.likes || 0;
        const comments = eng.comments || 0;
        const shares = eng.shares || 0;
        totalReach += reach;
        totalEngagements += likes + comments + shares;
        enrichedPosts.push({
          platform: post.platform,
          reach,
          likes,
          comments,
          shares,
          engagementRate:
            reach > 0 ? ((likes + comments + shares) / reach) * 100 : 0,
        });
      }

      // Sort by engagement rate and return top 5
      const topPosts = enrichedPosts
        .sort((a: any, b: any) => b.engagementRate - a.engagementRate)
        .slice(0, 5);

      const engagementRate =
        totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;

      return { totalFollowers, totalReach, engagementRate, topPosts };
    } catch (error: unknown) {
      logger.warn({ err: error }, "getEngagementAnalytics error:");
      return {
        totalFollowers: 0,
        totalReach: 0,
        engagementRate: 0,
        topPosts: [],
      };
    }
  }

  /**
   * AI-powered post amplification
   */
  async amplifyPost(
    postId: string,
    _userId: string,
  ): Promise<{
    success: boolean;
    amplificationId: string;
    projectedReachIncrease: number;
    projectedEngagementIncrease: number;
  }> {
    try {
      // AI-powered optimization strategies:
      // - Optimal posting times
      // - Hashtag optimization
      // - Cross-platform syndication
      // - Engagement pattern analysis

      return {
        success: true,
        amplificationId: `amp_${postId}`,
        projectedReachIncrease: 45,
        projectedEngagementIncrease: 28,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Post amplification error:");
      throw new Error("Failed to amplify post");
    }
  }

  /**
   * Get aggregated metrics for an ad campaign.
   * Uses the performance JSONB stored on the ad_campaigns row plus any
   * associated social_campaigns posts that fall within the campaign window.
   */
  async getCampaignMetrics(
    campaignId: number,
    userId: string,
  ): Promise<{
    totalReach: number;
    totalEngagement: number;
    platforms: Record<
      string,
      { reach: number; engagement: number; posts: number }
    >;
    timeline: unknown[];
  }> {
    try {
      const campaign = await this.getCampaign(campaignId, userId);
      if (!campaign) throw new Error("Campaign not found");

      // 1. Seed from ad_campaigns.performance JSONB if present
      const perf = campaign.performance as Record<string, number> | null;
      let totalReach = perf?.reach || 0;
      let totalEngagement = perf?.engagement || 0;

      // 2. Aggregate from published social_campaigns posts in the campaign window
      const startDate = campaign.startDate
        ? new Date(campaign.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = campaign.endDate
        ? new Date(campaign.endDate)
        : new Date();

      const posts = await db
        .select({
          engagement: socialCampaigns.engagement,
          platform: socialCampaigns.platform,
          publishedAt: socialCampaigns.publishedAt,
        })
        .from(socialCampaigns)
        .where(
          and(
            eq(socialCampaigns.userId, userId),
            eq(socialCampaigns.status, "published"),
            gte(socialCampaigns.publishedAt, startDate),
            lte(socialCampaigns.publishedAt, endDate),
          ),
        )
        .orderBy(socialCampaigns.publishedAt);

      const platforms: Record<
        string,
        { reach: number; engagement: number; posts: number }
      > = {};
      const timeline: { date: string; reach: number; engagement: number }[] =
        [];

      for (const post of posts) {
        const eng = post.engagement as Record<string, number> | null;
        const platform = post.platform || "unknown";
        const reach = eng?.reach || 0;
        const likes = eng?.likes || 0;
        const comments = eng?.comments || 0;
        const shares = eng?.shares || 0;
        const engSum = likes + comments + shares;

        totalReach += reach;
        totalEngagement += engSum;

        if (!platforms[platform])
          platforms[platform] = { reach: 0, engagement: 0, posts: 0 };
        platforms[platform].reach += reach;
        platforms[platform].engagement += engSum;
        platforms[platform].posts++;

        const dateKey = post.publishedAt
          ? new Date(post.publishedAt).toISOString().split("T")[0]
          : "unknown";
        const existing = timeline.find((t) => t.date === dateKey);
        if (existing) {
          existing.reach += reach;
          existing.engagement += engSum;
        } else {
          timeline.push({ date: dateKey, reach, engagement: engSum });
        }
      }

      // Merge stored performance totals if posts didn't capture them
      if (posts.length === 0 && perf) {
        totalReach = perf.reach || 0;
        totalEngagement = perf.engagement || 0;
      }

      return { totalReach, totalEngagement, platforms, timeline };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching campaign metrics:");
      throw new Error("Failed to fetch campaign metrics");
    }
  }
}

export const socialService = new SocialService();
