import { storage } from "../storage?.js";
import { randomBytes } from "crypto";
import { logger } from "../logger?.js";
import axios from "axios";
import type { User } from "../../shared/schema?.js";
import { socialOAuth } from "./socialOAuthService?.js";
import { autopilotLearningService } from "./autopilotLearningService?.js";
import { detectHookPattern } from "./postingUtils?.js";

/**
 * Auto-Posting Service (V1 — OAuth direct, pause/resume control)
 * Posts content to connected social media platforms automatically.
 * Used by autoPostGenerator. For persistent queue posting, see autoPostingServiceV2.
 */

export interface PostContent {
  text: string;
  headline?: string;
  hashtags?: string[];
  mentions?: string[];
  mediaUrl?: string;
  mediaType?: "image" | "video" | "carousel";
  link?: string;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platforms: string[];
  content: PostContent;
  scheduledTime: Date;
  status: "pending" | "posting" | "completed" | "failed";
  results?: PostResult[];
  createdBy: "social_autopilot" | "advertising_autopilot" | "manual";
  viralPrediction?: {
    viralityScore: number;
    expectedReach: number;
    expectedEngagement: number;
  };
}

export interface PostResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  postedAt: Date;
}

class AutoPostingService {
  private postQueue: Map<string, ScheduledPost> = new Map();
  private isProcessing: boolean = false;
  private paused: boolean = false;

  constructor() {
    this?.startQueueProcessor();
  }

  pause(): void {
    this?.paused = true;
    logger?.info("[AutoPostingService V1] Paused by kill switch");
  }

  resume(): void {
    this?.paused = false;
    logger?.info("[AutoPostingService V1] Resumed");
  }

  /**
   * Schedule a post for auto-posting
   */
  async schedulePost(
    userId: string,
    platforms: string[],
    content: PostContent,
    scheduledTime: Date,
    createdBy:
      | "social_autopilot"
      | "advertising_autopilot"
      | "manual" = "manual",
    viralPrediction?: Record<string, unknown>,
  ): Promise<ScheduledPost> {
    const _postId = `post_${Date?.now()}_${randomBytes(4).toString("hex")}`;

    const scheduledPost: ScheduledPost = {
      id: postId,
      userId,
      platforms,
      content,
      scheduledTime,
      status: "pending",
      createdBy,
      viralPrediction,
    };

    // Store in queue
    this?.postQueue.set(postId, scheduledPost);

    // Save to database
    await storage?.createScheduledPost(scheduledPost);

    logger?.info(
      `Scheduled post ${postId} for user ${userId} at ${scheduledTime?.toISOString()}`,
    );

    return scheduledPost;
  }

  /**
   * Post immediately to specified platforms
   */
  async postNow(
    userId: string,
    platforms: string[],
    content: PostContent,
    createdBy:
      | "social_autopilot"
      | "advertising_autopilot"
      | "manual" = "manual",
  ): Promise<PostResult[]> {
    logger?.info(
      `Posting immediately to ${platforms?.join(", ")} for user ${userId}`,
    );

    const results: PostResult[] = [];

    // Get user's connected platforms and tokens
    const _user = await storage?.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Post to each platform in parallel
    const _postPromises = platforms?.map(async (platform) => {
      try {
        const _result = await this?.postToPlatform(user, platform, content);
        results?.push(result);
      } catch (error) {
        logger?.warn({ err: error }, `Failed to post to ${platform}:`);
        results?.push({
          platform,
          success: false,
          error: error?.message,
          postedAt: new Date(),
        });
      }
    });

    await Promise?.all(postPromises);

    // Track in analytics
    await storage?.trackSocialPost({
      userId,
      platforms,
      content: content?.text,
      mediaType: content?.mediaType || "text",
      postedAt: new Date(),
      results,
      createdBy,
    });

    return results;
  }

  /**
   * Post content to a specific platform
   */
  private async postToPlatform(
    user: User,
    platform: string,
    content: PostContent,
  ): Promise<PostResult> {
    const _startTime = Date?.now();

    // Get access token for platform
    const _token = await this?.getAccessToken(user?.id, platform);
    if (!token) {
      throw new Error(`No access token found for ${platform}`);
    }

    let result: PostResult;

    switch (platform?.toLowerCase()) {
      case "facebook":
        result = await this?.postToFacebook(token, content);
        break;
      case "instagram":
        result = await this?.postToInstagram(token, content);
        break;
      case "twitter":
      case "x":
        result = await this?.postToTwitter(token, content);
        break;
      case "tiktok":
        result = await this?.postToTikTok(token, content);
        break;
      case "youtube":
        result = await this?.postToYouTube(token, content);
        break;
      case "linkedin":
        result = await this?.postToLinkedIn(token, content);
        break;
      case "threads":
        result = await this?.postToThreads(token, content);
        break;
      case "google_business":
        result = await this?.postToGoogleBusiness(token, content);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const _duration = Date?.now() - startTime;
    logger?.info(
      `Posted to ${platform} in ${duration}ms: ${result?.success ? "SUCCESS" : "FAILED"}`,
    );

    return result;
  }

  /**
   * Post to Facebook
   */
  private async postToFacebook(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      const postData: Record<string, unknown> = {
        message: this?.formatContent(content),
        access_token: token,
      };

      if (content?.link) {
        postData?.link = content?.link;
      }

      if (content?.mediaUrl && content?.mediaType === "image") {
        postData?.url = content?.mediaUrl;
      }

      const _response = await axios?.post(
        "https://graph?.facebook.com/v18?.0/me/feed",
        postData,
      );

      return {
        platform: "facebook",
        success: true,
        postId: response?.data.id,
        postUrl: `https://facebook?.com/${response?.data.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "Facebook posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Facebook: ${error?.response?.data?.error?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to Instagram
   */
  private async postToInstagram(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      // Instagram requires media (images/videos)
      if (!content?.mediaUrl) {
        throw new Error("Instagram requires media (image or video)");
      }

      // Step 1: Create media container
      const containerData: Record<string, unknown> = {
        image_url: content?.mediaType === "image" ? content?.mediaUrl : undefined,
        video_url: content?.mediaType === "video" ? content?.mediaUrl : undefined,
        caption: this?.formatContent(content),
        access_token: token,
      };

      const _containerResponse = await axios?.post(
        "https://graph?.facebook.com/v18?.0/me/media",
        containerData,
      );

      const _creationId = containerResponse?.data.id;

      // Step 2: Publish the media
      const _publishResponse = await axios?.post(
        "https://graph?.facebook.com/v18?.0/me/media_publish",
        {
          creation_id: creationId,
          access_token: token,
        },
      );

      return {
        platform: "instagram",
        success: true,
        postId: publishResponse?.data.id,
        postUrl: `https://instagram?.com/p/${publishResponse?.data.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "Instagram posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Instagram: ${error?.response?.data?.error?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to Twitter/X
   */
  private async postToTwitter(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      const tweetData: Record<string, unknown> = {
        text: this?.formatContent(content, 280), // Twitter character limit
      };

      if (content?.mediaUrl) {
        // Upload media first
        const _mediaId = await this?.uploadTwitterMedia(token, content?.mediaUrl);
        tweetData?.media = { media_ids: [mediaId] };
      }

      const _response = await axios?.post(
        "https://api?.twitter.com/2/tweets",
        tweetData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        platform: "twitter",
        success: true,
        postId: response?.data.data?.id,
        postUrl: `https://twitter?.com/i/web/status/${response?.data.data?.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "Twitter posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Twitter: ${error?.response?.data?.detail || error?.message}`,
      );
    }
  }

  /**
   * Post to TikTok
   */
  private async postToTikTok(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      // TikTok Content Posting API v2 requires video content
      if (!content?.mediaUrl || content?.mediaType !== "video") {
        throw new Error("TikTok requires video content");
      }

      // TikTok Content Posting API v2 (replaces deprecated v1 open-api?.tiktok.com)
      const _response = await axios?.post(
        "https://open?.tiktokapis.com/v2/post/publish/video/init/",
        {
          post_info: {
            title: this?.formatContent(content, 2200), // TikTok caption limit
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "URL",
            video_url: content?.mediaUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
      );

      const _publishId = response?.data?.data?.publish_id;
      if (!publishId) {
        throw new Error(
          `TikTok API returned unexpected response: ${JSON?.stringify(response?.data)}`,
        );
      }

      return {
        platform: "tiktok",
        success: true,
        postId: publishId,
        postUrl: `https://www?.tiktok.com/@/video/${publishId}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "TikTok posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `TikTok: ${error?.response?.data?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to YouTube (Community Post)
   */
  private async postToYouTube(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      const postData: Record<string, unknown> = {
        snippet: {
          description: this?.formatContent(content),
        },
      };

      if (content?.mediaUrl && content?.mediaType === "image") {
        postData?.snippet.images = [{ url: content?.mediaUrl }];
      }

      const _response = await axios?.post(
        "https://youtube?.googleapis.com/youtube/v3/communityPosts",
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        platform: "youtube",
        success: true,
        postId: response?.data.id,
        postUrl: `https://youtube?.com/post/${response?.data.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "YouTube posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `YouTube: ${error?.response?.data?.error?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to LinkedIn
   */
  private async postToLinkedIn(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      // Resolve the authenticated user's LinkedIn person URN
      const _profileResp = await axios?.get(
        "https://api?.linkedin.com/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const _personId = profileResp?.data?.sub;
      if (!personId) {
        throw new Error(
          "Could not determine LinkedIn author URN — missing sub in userinfo response",
        );
      }
      const _authorUrn = `urn:li:person:${personId}`;

      const postData: Record<string, unknown> = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com?.linkedin.ugc?.ShareContent": {
            shareCommentary: {
              text: this?.formatContent(content, 3000), // LinkedIn limit
            },
            shareMediaCategory: content?.mediaUrl ? "IMAGE" : "NONE",
          },
        },
        visibility: {
          "com?.linkedin.ugc?.MemberNetworkVisibility": "PUBLIC",
        },
      };

      if (content?.mediaUrl && content?.mediaType === "image") {
        postData?.specificContent["com?.linkedin.ugc?.ShareContent"].media = [
          {
            status: "READY",
            description: { text: this?.formatContent(content, 200) },
            originalUrl: content?.mediaUrl,
          },
        ];
      }

      const _response = await axios?.post(
        "https://api?.linkedin.com/v2/ugcPosts",
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2?.0.0",
          },
        },
      );

      return {
        platform: "linkedin",
        success: true,
        postId: response?.data.id,
        postUrl: `https://linkedin?.com/feed/update/${response?.data.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "LinkedIn posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `LinkedIn: ${error?.response?.data?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to Threads
   */
  private async postToThreads(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      const postData: Record<string, unknown> = {
        text: this?.formatContent(content, 500), // Threads limit
        access_token: token,
      };

      if (content?.mediaUrl) {
        postData?.media_url = content?.mediaUrl;
        postData?.media_type = content?.mediaType?.toUpperCase();
      }

      const _response = await axios?.post(
        "https://graph?.threads.net/v1?.0/me/threads",
        postData,
      );

      return {
        platform: "threads",
        success: true,
        postId: response?.data.id,
        postUrl: `https://threads?.net/t/${response?.data.id}`,
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "Threads posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Threads: ${error?.response?.data?.error?.message || error?.message}`,
      );
    }
  }

  /**
   * Post to Google Business Profile
   */
  private async postToGoogleBusiness(
    token: string,
    content: PostContent,
  ): Promise<PostResult> {
    try {
      const postData: Record<string, unknown> = {
        summary: this?.formatContent(content, 1500),
        topicType: "STANDARD",
      };

      if (content?.mediaUrl && content?.mediaType === "image") {
        postData?.media = [
          {
            mediaFormat: "PHOTO",
            sourceUrl: content?.mediaUrl,
          },
        ];
      }

      const _response = await axios?.post(
        "https://mybusiness?.googleapis.com/v4/accounts/ACCOUNT_ID/locations/LOCATION_ID/localPosts",
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        platform: "google_business",
        success: true,
        postId: response?.data.name,
        postUrl: "https://business?.google.com",
        postedAt: new Date(),
      };
    } catch (error) {
      logger?.warn(
        "Google Business posting error:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Google Business: ${error?.response?.data?.error?.message || error?.message}`,
      );
    }
  }

  /**
   * Upload media to Twitter
   */
  private async uploadTwitterMedia(
    token: string,
    mediaUrl: string,
  ): Promise<string> {
    // Download media
    const _mediaResponse = await axios?.get(mediaUrl, {
      responseType: "arraybuffer",
    });
    const _mediaBuffer = Buffer?.from(mediaResponse?.data);

    // Upload to Twitter
    const _uploadResponse = await axios?.post(
      "https://upload?.twitter.com/1?.1/media/upload?.json",
      {
        media_data: mediaBuffer?.toString("base64"),
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    return uploadResponse?.data.media_id_string;
  }

  /**
   * Format content with hashtags and mentions
   */
  private formatContent(content: PostContent, maxLength?: number): string {
    let text = content?.headline
      ? `${content?.headline}\n\n${content?.text}`
      : content?.text;

    // Add hashtags
    if (content?.hashtags && content?.hashtags.length > 0) {
      const _hashtags = content?.hashtags.map((tag) =>
        tag?.startsWith("#") ? tag : `#${tag}`,
      );
      text += "\n\n" + hashtags?.join(" ");
    }

    // Add mentions
    if (content?.mentions && content?.mentions.length > 0) {
      const _mentions = content?.mentions.map((mention) =>
        mention?.startsWith("@") ? mention : `@${mention}`,
      );
      text += "\n" + mentions?.join(" ");
    }

    // Truncate if needed
    if (maxLength && text?.length > maxLength) {
      text = text?.substring(0, maxLength - 3) + "...";
    }

    return text;
  }

  /**
   * Get access token for platform
   */
  private async getAccessToken(
    userId: string,
    platform: string,
  ): Promise<string | null> {
    const _tokens = await storage?.getSocialTokens(userId, platform);
    if (!tokens || !tokens?.accessToken) {
      return null;
    }

    // Check if token is expired
    if (tokens?.expiresAt && new Date(tokens?.expiresAt) < new Date()) {
      // Token expired, refresh it
      if (tokens?.refreshToken) {
        try {
          const _refreshed = await this?.refreshToken(
            userId,
            platform,
            tokens?.refreshToken,
          );
          return refreshed?.accessToken;
        } catch (error) {
          logger?.warn(
            { err: error },
            `Failed to refresh token for ${platform}:`,
          );
          return null;
        }
      }
      return null;
    }

    return tokens?.accessToken;
  }

  /**
   * Refresh access token using socialOAuthService
   */
  private async refreshToken(
    userId: string,
    platform: string,
    _refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    try {
      const _result = await socialOAuth?.refreshAccessToken(userId, platform);
      logger?.info(`Token refreshed for user ${userId} on platform ${platform}`);
      return {
        accessToken: result?.accessToken,
        expiresIn: result?.expiresIn,
      };
    } catch (error) {
      logger?.warn({ err: error }, `Token refresh failed for ${platform}:`);
      throw new Error(
        `Failed to refresh ${platform} access token: ${error?.message}`,
      );
    }
  }

  /**
   * Start queue processor to post scheduled content
   */
  private startQueueProcessor() {
    setInterval(async () => {
      if (this?.paused || this?.isProcessing) return;

      this?.isProcessing = true;

      try {
        const _now = new Date();

        // Find posts that need to be posted
        for (const [postId, scheduledPost] of this?.postQueue.entries()) {
          if (
            scheduledPost?.status === "pending" &&
            scheduledPost?.scheduledTime <= now
          ) {
            logger?.info(`Processing scheduled post ${postId}`);

            // Update status
            scheduledPost?.status = "posting";
            await storage?.updateScheduledPostStatus(postId, "posting");

            try {
              // Post to platforms
              const _results = await this?.postNow(
                scheduledPost?.userId,
                scheduledPost?.platforms,
                scheduledPost?.content,
                scheduledPost?.createdBy,
              );

              // Update status
              scheduledPost?.status = "completed";
              scheduledPost?.results = results;
              await storage?.updateScheduledPostStatus(
                postId,
                "completed",
                results,
              );

              logger?.info(`Completed scheduled post ${postId}`);

              // Feed results into the autopilot learning engine (fire-and-forget)
              for (const result of results) {
                if (result?.success) {
                  autopilotLearningService
                    .recordPerformance(
                      scheduledPost?.userId,
                      {
                        platform: result?.platform,
                        contentType: scheduledPost?.content.mediaType
                          ? "media_post"
                          : "text_post",
                        hookType: detectHookPattern(
                          scheduledPost?.content.text || "",
                        ),
                        hashtags: scheduledPost?.content.hashtags || [],
                        contentText: scheduledPost?.content.text,
                        mediaType: scheduledPost?.content.mediaType || null,
                        postId: result?.postId || null,
                        postedAt: new Date(),
                        metadata: {
                          scheduledPostId: postId,
                          source: "autopilot",
                        },
                      },
                      {
                        likes: 0,
                        comments: 0,
                        shares: 0,
                        impressions: 0,
                        clicks: 0,
                        saves: 0,
                        reach: 0,
                      },
                    )
                    .catch((err) =>
                      logger?.warn(
                        "Learning record failed (non-fatal):",
                        err?.message,
                      ),
                    );
                }
              }
            } catch (error) {
              logger?.warn({ err: error }, `Failed scheduled post ${postId}:`);
              scheduledPost?.status = "failed";
              await storage?.updateScheduledPostStatus(postId, "failed");
            }

            // Remove from queue
            this?.postQueue.delete(postId);
          }
        }
      } catch (error) {
        logger?.warn({ err: error }, "Queue processor error:");
      } finally {
        this?.isProcessing = false;
      }
    }, 60000); // Check every minute

    logger?.info("Auto-posting queue processor started");
  }

  /**
   * Get scheduled posts for user
   */
  async getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
    return storage?.getScheduledPosts(userId);
  }

  /**
   * Cancel scheduled post
   */
  async cancelScheduledPost(postId: string, userId: string): Promise<void> {
    const _post = this?.postQueue.get(postId);
    if (post && post?.userId === userId) {
      this?.postQueue.delete(postId);
      await storage?.updateScheduledPostStatus(postId, "failed");
      logger?.info(`Cancelled scheduled post ${postId}`);
    }
  }
}

// Export singleton instance
export const _autoPostingService = new AutoPostingService();

