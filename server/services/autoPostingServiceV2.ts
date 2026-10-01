// @ts-nocheck
import { randomBytes } from "crypto";
import { Worker } from "bullmq";
import { newBullMQRedisConnection } from "../lib/redisClient.js";
import { BoosterQueue } from "./queueService.js";
import { storage } from "../storage.js";
import { logger } from "../logger.js";
import axios from "axios";
import type { User } from "../../shared/schema.js";
import { autopilotLearningService } from "./autopilotLearningService.js";
import { detectHookPattern } from "./postingUtils.js";
import { notificationService } from "./notificationService.js";
import { claimSocialPost, checkpointSocialPost, recoverStrandedSocialPosts } from "./socialPostingRepository.js";
import { socialOAuth } from "./socialOAuthService.js";

// Max posts to dequeue and process concurrently per 2-second tick.
// Override with AUTO_POST_BATCH_SIZE env var.
const AUTO_POST_BATCH_SIZE = parseInt(
  process.env.AUTO_POST_BATCH_SIZE ?? "5",
  10,
);

/**
 * Auto-Posting Service V2 — BoosterQueue-backed persistent posting.
 * Used by autopilotPublisher. For OAuth direct posting, see autoPostingService (V1).
 */

export interface PostContent {
  text: string;
  headline?: string;
  hashtags?: string[];
  mentions?: string[];
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: "text" | "audio" | "image" | "photo" | "video" | "carousel";
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
  outcome?: "started" | "confirmed" | "unknown" | "cancelled";
}

const PUBLISHING_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
  "youtube",
  "linkedin",
  "threads",
  "google_business",
]);

export function normalizePublishingPlatform(platform: string): string {
  const normalized = platform.trim().toLowerCase();
  if (normalized === "x") return "twitter";
  if (normalized === "googlebusiness") return "google_business";
  return normalized;
}

export function normalizePostContent(
  rawContent: unknown,
  mediaUrls: string[] = [],
): PostContent {
  let source: Record<string, unknown> = {};

  if (rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)) {
    source = rawContent as Record<string, unknown>;
  } else if (typeof rawContent === "string") {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        source = parsed as Record<string, unknown>;
      } else {
        source = { text: rawContent };
      }
    } catch {
      source = { text: rawContent };
    }
  }

  const storedUrls = Array.isArray(source.mediaUrls)
    ? source.mediaUrls.filter((url): url is string => typeof url === "string")
    : [];
  const resolvedMediaUrls = mediaUrls.length > 0 ? mediaUrls : storedUrls;
  const mediaUrl =
    (typeof source.mediaUrl === "string" && source.mediaUrl) ||
    resolvedMediaUrls[0];
  const explicitMediaType = source.mediaType;
  const inferredVideo =
    typeof mediaUrl === "string" &&
    /\.(mp4|mov|m4v|webm|avi|mkv)(?:$|[?#])/i.test(mediaUrl);
  const mediaType =
    explicitMediaType === "video" ||
    explicitMediaType === "image" ||
    explicitMediaType === "photo" ||
    explicitMediaType === "audio" ||
    explicitMediaType === "carousel" ||
    explicitMediaType === "text"
      ? explicitMediaType
      : inferredVideo
        ? "video"
        : mediaUrl
          ? "image"
          : undefined;

  return {
    text:
      (typeof source.text === "string" && source.text) ||
      (typeof source.caption === "string" && source.caption) ||
      "",
    ...(typeof source.headline === "string" ? { headline: source.headline } : {}),
    ...(Array.isArray(source.hashtags) ? { hashtags: source.hashtags as string[] } : {}),
    ...(Array.isArray(source.mentions) ? { mentions: source.mentions as string[] } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(resolvedMediaUrls.length > 0 ? { mediaUrls: resolvedMediaUrls } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(typeof source.link === "string" ? { link: source.link } : {}),
  };
}

export function hasAutoPublishConsent(
  createdBy: ScheduledPost["createdBy"],
  config: Record<string, unknown> | null | undefined,
  systemApproved = false,
): boolean {
  if (createdBy === "social_autopilot" || systemApproved) {
    return config?.enabled === true && config?.autoPublish === true;
  }
  if (createdBy === "advertising_autopilot") {
    return config?.isRunning === true && config?.autoPublish === true;
  }
  return createdBy === "manual";
}

class AutoPostingServiceV2 {
  private postQueue: BoosterQueue;
  private worker: Worker | null = null;
  private recoveryInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private isPaused: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.postQueue = new BoosterQueue("scheduled-posts");
  }

  async initialize() {
    if (this.isPaused) {
      throw new Error("Auto-posting is paused and cannot accept scheduled posts");
    }
    if (this.isInitialized && this.worker) return;
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        if (!this.worker) this.startWorker();
        await this.reloadPendingJobs();
        this.isInitialized = true;
        logger.info("✅ Auto-posting service initialized (boosterstate-backed)");
      })().finally(() => {
        this.initializationPromise = null;
      });
    }
    await this.initializationPromise;
  }

  private async reloadPendingJobs() {
    try {
      await recoverStrandedSocialPosts();
      const pendingPosts = await storage.getScheduledPosts({
        status: "pending",
      });

      // Enqueue all pending posts concurrently — each add() is an independent
      // PDIM write, so firing them in parallel cuts startup time proportionally
      // to the number of pending posts.
      const results = await Promise?.allSettled(
        pendingPosts?.map(async (row) => {
          const post = await storage.getScheduledPostById(row.id);
          if (!post) return;
          const delay = new Date(post?.scheduledTime).getTime() - Date?.now();
          return this.postQueue.add("auto-post", post, {
            jobId: post.id,
            delay: delay > 0 ? delay : 0,
          });
        }),
      );

      const reloadedCount = results?.filter(
        (r) => r?.status === "fulfilled",
      ).length;
      const failedCount = results?.length - reloadedCount;
      if (failedCount > 0) {
        logger.warn(
          `[AutoPost] reloadPendingJobs: ${failedCount} enqueue(s) failed`,
        );
      }
      logger.info(`✅ Reloaded ${reloadedCount} pending posts`);
    } catch (error) {
      logger.warn({ err: error }, "Failed to reload pending jobs:");
    }
  }

  private async hasCurrentPublishConsent(post: ScheduledPost): Promise<boolean> {
    const systemApproved =
      post.approvedBy === "autonomous-system" &&
      post.approvalStatus === "auto-approved";
    const createdBy = post.createdBy || "manual";
    if (createdBy === "manual" && !systemApproved) return true;
    const config =
      createdBy === "advertising_autopilot"
        ? await storage.getAdvertisingAutopilotConfig?.(post.userId)
        : await storage.getAutopilotConfig?.(post.userId);
    return hasAutoPublishConsent(createdBy, config, systemApproved);
  }

  private async processSinglePost(post: ScheduledPost): Promise<void> {
    logger.info(
      `🚀 Processing auto-post job ${post?.id} for user ${post?.userId}`,
    );
    try {
      const claimed = await claimSocialPost(post.id);
      if (!claimed) return; // Duplicate queue deliveries must not repeat external side effects.
      post = await storage.getScheduledPostById(post.id);
      if (!post) throw new Error("Scheduled post disappeared before dispatch");
      if (!(await this.hasCurrentPublishConsent(post))) {
        const cancelledResults = (post.platforms || []).map((platform) => ({
          platform,
          success: false,
          outcome: "cancelled" as const,
          error: "Automated publishing permission was withdrawn before dispatch",
          postedAt: new Date(),
        }));
        await checkpointSocialPost(post.id, cancelledResults, "failed");
        return;
      }

      const results = await this.executePost(post);

      await checkpointSocialPost(post.id, results,
        results.length > 0 && results.every((r) => r.success) ? "completed" : "failed");

      for (const result of results) {
        if (result?.success) {
          autopilotLearningService
            .recordPerformance(
              post?.userId,
              {
                platform: result.platform,
                contentType: post.content.mediaType
                  ? "media_post"
                  : "text_post",
                hookType: detectHookPattern(post?.content.text || ""),
                hashtags: post.content.hashtags || [],
                contentText: post.content.text,
                mediaType: post.content.mediaType || null,
                postId: result.postId || null,
                postedAt: new Date(),
                metadata: {
                  scheduledPostId: post.id,
                  source: "autopilot_v2",
                  createdBy: post.createdBy,
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
              logger.warn("Learning record failed (non-fatal):", err?.message),
            );
        }
      }

      await (storage as any)?.trackSocialPost({
        userId: post.userId,
        content: post.content,
        mediaType: post.content.mediaType,
        createdBy: post.createdBy,
        results,
      });

      const successfulPlatforms = results
        .filter((r) => r?.success)
        .map((r) => r?.platform);
      if (
        successfulPlatforms?.length > 0 &&
        post?.createdBy === "social_autopilot"
      ) {
        const platformLabel =
          successfulPlatforms[0].charAt(0).toUpperCase() +
          successfulPlatforms[0].slice(1);
        notificationService
          .sendAutoPostPublishedNotification(
            post?.userId,
            platformLabel,
            (post?.content.text || "").slice(0, 100),
          )
          .catch((err) =>
            logger.warn(
              "[AutoPost] notification error (non-fatal):",
              err?.message,
            ),
          );
      }
    } catch (error) {
      logger.warn({ err: error }, `Failed to process auto-post ${post?.id}:`);
      await storage.updateScheduledPost(post?.id, { status: "failed" });
    }
  }

  private startWorker() {
    if (this.worker) return;
    this.worker = new Worker(
      "scheduled-posts",
      async (job) => this.processSinglePost(job.data as ScheduledPost),
      {
        connection: newBullMQRedisConnection(),
        concurrency: AUTO_POST_BATCH_SIZE,
      },
    );
    this.worker.on("failed", (job, error) => {
      logger.warn(
        { err: error, jobId: job?.id },
        "Auto-post BullMQ job failed:",
      );
    });
    this.worker.on("error", (error) => {
      logger.warn({ err: error }, "Auto-post BullMQ worker error:");
    });
    this.recoveryInterval = setInterval(() => {
      void this.reloadPendingJobs();
    }, 60_000);
    this.recoveryInterval.unref?.();
    logger.info(
      `✅ Auto-posting BullMQ worker started (concurrency: ${AUTO_POST_BATCH_SIZE})`,
    );
  }

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
    idempotencyKey?: string,
  ): Promise<ScheduledPost> {
    if (idempotencyKey?.includes(":")) {
      throw new Error("The idempotency key contains characters unsupported by the queue");
    }
    content = normalizePostContent(content, content.mediaUrls || []);
    const normalizedPlatforms = [
      ...new Set(platforms.map(normalizePublishingPlatform)),
    ];
    if (normalizedPlatforms.length === 0) {
      throw new Error("At least one publishing platform is required");
    }
    const unsupported = normalizedPlatforms.filter(
      (platform) => !PUBLISHING_PLATFORMS.has(platform),
    );
    if (unsupported.length > 0) {
      throw new Error(`Unsupported publishing platform: ${unsupported.join(", ")}`);
    }
    if (!(scheduledTime instanceof Date) || !Number.isFinite(scheduledTime.getTime())) {
      throw new Error("A valid scheduled publishing time is required");
    }
    if (createdBy !== "manual") {
      const config =
        createdBy === "advertising_autopilot"
          ? await storage.getAdvertisingAutopilotConfig?.(userId)
          : await storage.getAutopilotConfig?.(userId);
      if (!hasAutoPublishConsent(createdBy, config)) {
        throw new Error("Automated publishing requires explicit auto-publish consent");
      }
    }
    await this.initialize();

    const postId = idempotencyKey
      ? `post_${idempotencyKey}`
      : `post_${Date?.now()}_${randomBytes(4).toString("hex")}`;

    if (idempotencyKey) {
      const existingPost = await storage.getScheduledPostById(postId);
      if (existingPost) {
        const samePlatforms =
          JSON.stringify([...(existingPost.platforms || [])].sort()) ===
          JSON.stringify([...normalizedPlatforms].sort());
        const sameContent =
          JSON.stringify(existingPost.content) === JSON.stringify(content);
        if (
          existingPost.userId !== userId ||
          !samePlatforms ||
          !sameContent ||
          new Date(existingPost.scheduledTime).getTime() !== scheduledTime.getTime()
        ) {
          throw new Error("Idempotency key is already bound to a different scheduled post");
        }
        logger.info(
          `📋 Returning existing post ${postId} (idempotency key: ${idempotencyKey})`,
        );
        return existingPost as ScheduledPost;
      }
    }

    const scheduledPost: ScheduledPost = {
      id: postId,
      userId,
      platforms: normalizedPlatforms,
      content,
      scheduledTime,
      status: "pending",
      createdBy,
      viralPrediction,
    };

    await storage.createScheduledPost(scheduledPost);

    const delay = scheduledTime?.getTime() - Date?.now();
    await this.postQueue.add("auto-post", scheduledPost, {
      jobId: postId,
      delay: delay > 0 ? delay : 0,
    });

    logger.info(
      `📅 Scheduled post ${postId} for ${scheduledTime?.toISOString()} (${delay}ms delay)`,
    );

    return scheduledPost;
  }

  async scheduleExistingPost(
    postId: string,
    updates: {
      platform?: string;
      platforms?: string[];
      content?: unknown;
      mediaUrls?: string[];
      scheduledAt?: Date;
    } = {},
  ): Promise<ScheduledPost> {
    await this.initialize();

    const existingPost = await storage.getScheduledPostById(postId);
    if (!existingPost) throw new Error("Scheduled post not found");
    if (["posting", "completed", "published"].includes(existingPost.status)) {
      throw new Error("This post can no longer be queued because delivery has started or completed");
    }
    if (
      Array.isArray(existingPost.results) &&
      existingPost.results.some((result: PostResult) =>
        ["started", "unknown", "confirmed"].includes(result.outcome || "") ||
        result.success === true
      )
    ) {
      throw new Error("This post has a provider receipt or an uncertain delivery; reconcile it before retrying");
    }

    const platforms = [
      ...new Set(
        (updates.platforms?.length
          ? updates.platforms
          : updates.platform
            ? [updates.platform]
            : existingPost.platforms?.length
              ? existingPost.platforms
              : [existingPost.platform]
        ).map(normalizePublishingPlatform),
      ),
    ].filter(Boolean);
    const unsupported = platforms.filter(
      (platform) => !PUBLISHING_PLATFORMS.has(platform),
    );
    if (platforms.length === 0 || unsupported.length > 0) {
      throw new Error(
        unsupported.length > 0
          ? `Unsupported publishing platform: ${unsupported.join(", ")}`
          : "At least one publishing platform is required",
      );
    }

    const mediaUrls = updates.mediaUrls ?? existingPost.mediaUrls ?? [];
    const content = normalizePostContent(
      updates.content !== undefined ? updates.content : existingPost.content,
      mediaUrls,
    );
    const scheduledTime = updates.scheduledAt
      ?? existingPost.scheduledTime
      ?? existingPost.scheduledAt
      ?? new Date();
    if (!(scheduledTime instanceof Date) || !Number.isFinite(scheduledTime.getTime())) {
      throw new Error("A valid scheduled publishing time is required");
    }

    const createdBy = existingPost.createdBy || "manual";
    const permissionConfig =
      createdBy === "advertising_autopilot"
        ? await storage.getAdvertisingAutopilotConfig?.(existingPost.userId)
        : await storage.getAutopilotConfig?.(existingPost.userId);
    const systemApproved =
      existingPost.approvedBy === "autonomous-system" &&
      existingPost.approvalStatus === "auto-approved";
    if (!hasAutoPublishConsent(createdBy, permissionConfig, systemApproved)) {
      throw new Error("Automated publishing requires explicit auto-publish consent");
    }

    const scheduledPost: ScheduledPost = {
      id: postId,
      userId: existingPost.userId,
      platforms,
      content,
      scheduledTime,
      status: "pending",
      createdBy,
    };
    await storage.updateScheduledPost(postId, {
      platforms,
      content,
      mediaUrls,
      scheduledTime,
      status: "pending",
      createdBy,
    });
    const delay = Math.max(0, scheduledTime.getTime() - Date.now());
    await this.postQueue.add("auto-post", scheduledPost, {
      jobId: postId,
      delay,
    });
    return scheduledPost;
  }

  async postNow(
    userId: string,
    platforms: string[],
    content: PostContent,
    createdBy:
      | "social_autopilot"
      | "advertising_autopilot"
      | "manual" = "manual",
  ): Promise<PostResult[]> {
    logger.info(
      `🚀 Posting immediately to ${platforms?.join(", ")} for user ${userId}`,
    );

    const tempPost: ScheduledPost = {
      id: `immediate_${Date.now()}_${randomBytes(8).toString("hex")}`,
      userId,
      platforms,
      content,
      scheduledTime: new Date(),
      status: "pending",
      createdBy,
    };

    await storage.createScheduledPost(tempPost);
    await this.processSinglePost(tempPost);
    const saved = await storage.getScheduledPostById(tempPost.id);
    if (!saved) throw new Error("Immediate post receipt could not be loaded");
    if (Array.isArray(saved.results)) return saved.results;
    if (Array.isArray(saved.engagement?.postingResults)) return saved.engagement.postingResults;
    throw new Error("Immediate post has no readable durable receipts; reconcile before retrying");
  }

  private async executePost(post: ScheduledPost): Promise<PostResult[]> {
    const results: PostResult[] = [];

    const user = await storage.getUser(post.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Serialize checkpoints: a receipt is durable before another platform is attempted.
    for (const platform of [...new Set(post.platforms)]) {
      const prior = Array.isArray(post.results)
        ? post.results.find((result) => result.platform === platform) : undefined;
      if (prior) {
        // A legacy/manual reset to pending is not authority to repeat an
        // externally accepted or ambiguous create.
        results.push(prior);
        continue;
      }
      if (!(await this.hasCurrentPublishConsent(post))) {
        results.push({
          platform,
          success: false,
          outcome: "cancelled",
          error: "Automated publishing permission was withdrawn before dispatch",
          postedAt: new Date(),
        });
        await checkpointSocialPost(post.id, results);
        continue;
      }
      const pending: PostResult = { platform, success: false, outcome: "started",
        error: "External action started; reconcile provider receipt before retrying", postedAt: new Date() };
      results.push(pending);
      await checkpointSocialPost(post.id, results);
      try {
        const result = await this.postToPlatform(user, platform, post?.content);
        if (!result.postId) throw new Error("Provider returned no publication receipt");
        Object.assign(pending, result, { outcome: "confirmed", error: undefined });
      } catch (error) {
        logger.warn({ err: error }, `Failed to post to ${platform}:`);
        Object.assign(pending, {
          outcome: "unknown",
          error: (error as Error).message,
        });
      }
      await checkpointSocialPost(post.id, results);
    }

    logger.info(
      `✅ Posted to ${results?.filter((r) => r?.success).length}/${results?.length} platforms`,
    );

    return results;
  }

  private async postToPlatform(
    user: User,
    platform: string,
    content: PostContent,
  ): Promise<PostResult> {
    const publishingPlatform = normalizePublishingPlatform(platform);
    const oauthPlatform =
      publishingPlatform === "google_business"
        ? "googlebusiness"
        : publishingPlatform;
    const accessToken = await socialOAuth.getValidAccessToken(
      user.id,
      oauthPlatform,
    );
    const tokens = { [publishingPlatform]: accessToken };

    switch (publishingPlatform) {
      case "instagram":
        return await this.postToInstagram(user, tokens?.instagram, content);
      case "facebook":
        return await this.postToFacebook(user, tokens?.facebook, content);
      case "twitter":
        return await this.postToTwitter(user, tokens?.twitter, content);
      case "tiktok":
        return await this.postToTikTok(user, tokens?.tiktok, content);
      case "youtube":
        return await this.postToYouTube(user, tokens?.youtube, content);
      case "linkedin":
        return await this.postToLinkedIn(user, tokens?.linkedin, content);
      case "threads":
        return await this.postToThreads(user, tokens?.threads, content);
      case "google_business":
        return await this.postToGoogleBusiness(
          user,
          tokens?.google_business,
          content,
        );
      default:
        throw new Error(`Platform ${publishingPlatform} not supported`);
    }
  }

  private async postToInstagram(
    user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) {
      throw new Error("Instagram not connected");
    }

    const account = await storage.getUserSocialAccountDetails(user.id, "instagram");
    if (!account?.platformUserId) throw new Error("Instagram business account ID is missing; reconnect the account");
    if (!content.mediaUrl) throw new Error("Instagram requires a public image or video URL");
    const video = content.mediaType === "video";
    const postData = {
      caption: `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`,
      ...(video ? { video_url: content.mediaUrl, media_type: "REELS" } : { image_url: content.mediaUrl }),
    };

    const response = await axios?.post(
      `https://graph.facebook.com/v18.0/${account.platformUserId}/media`,
      postData,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const creationId = response.data.id;
    if (!creationId) throw new Error("Instagram returned no media container ID");
    if (video) {
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const status = await axios.get(`https://graph.facebook.com/v18.0/${creationId}`, {
          params: { fields: "status_code" }, headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (status.data.status_code === "FINISHED") { ready = true; break; }
        if (["ERROR", "EXPIRED"].includes(status.data.status_code)) throw new Error("Instagram media processing failed");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      if (!ready) throw new Error("Instagram media processing remains pending; reconcile the container before retrying");
    }
    const published = await axios.post(
      `https://graph.facebook.com/v18.0/${account.platformUserId}/media_publish`,
      { creation_id: creationId }, { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!published.data.id) throw new Error("Instagram returned no publication receipt");
    return {
      platform: "instagram",
      success: true,
      postId: published.data.id,
      postedAt: new Date(),
    };
  }

  private async postToFacebook(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("Facebook not connected");

    const postData = {
      message: `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`,
      link: content.link,
    };

    const response = await axios?.post(
      "https://graph.facebook.com/v18.0/me/feed",
      postData,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return {
      platform: "facebook",
      success: true,
      postId: response.data.id,
      postUrl: `https://facebook.com/${response.data.id}`,
      postedAt: new Date(),
    };
  }

  private async postToTwitter(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("Twitter not connected");

    const tweetText = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    const response = await axios?.post(
      "https://api.twitter.com/2/tweets",
      { text: tweetText.slice(0, 280) },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return {
      platform: "twitter",
      success: true,
      postId: response.data.data?.id,
      postUrl: `https://twitter.com/i/web/status/${response?.data.data.id}`,
      postedAt: new Date(),
    };
  }

  private async postToTikTok(
    user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("TikTok not connected");

    const caption = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    if (!content?.mediaUrl || content?.mediaType !== "video") {
      throw new Error("TikTok requires video content");
    }

    const initResponse = await axios?.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: content.mediaUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );

    const publishId = initResponse?.data.data?.publish_id;
    const uploadUrl = initResponse?.data.data?.upload_url;

    if (!publishId) {
      throw new Error("TikTok video init failed: no publish_id returned");
    }

    if (uploadUrl) {
      const videoResponse = await axios?.get(content?.mediaUrl, {
        responseType: "arraybuffer",
      });
      const videoBuffer = Buffer?.from(videoResponse?.data);

      await axios?.put(uploadUrl, videoBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": videoBuffer?.byteLength.toString(),
          "Content-Range": `bytes 0-${videoBuffer?.byteLength - 1}/${videoBuffer?.byteLength}`,
        },
      });
    }

    await axios?.post(
      "https://open.tiktokapis.com/v2/post/publish/video/submit/",
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );

    let videoId: string | undefined;
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const statusResponse = await axios?.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        { publish_id: publishId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
      );

      const status = statusResponse?.data.data?.status;
      if (status === "PUBLISH_COMPLETE") {
        const postIds = statusResponse?.data.data?.publicly_available_post_ids;
        videoId = postIds?.[0]?.id || postIds?.[0];
        break;
      } else if (status === "FAILED") {
        throw new Error(
          `TikTok publish failed: ${statusResponse?.data.data?.fail_reason || "unknown"}`,
        );
      }
    }

    if (!videoId) {
      throw new Error(
        "TikTok video publish timed out - video may still be processing",
      );
    }

    return {
      platform: "tiktok",
      success: true,
      postId: videoId,
      postUrl: `https://www.tiktok.com/@${user.username}/video/${videoId}`,
      postedAt: new Date(),
    };
  }

  private async postToYouTube(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("YouTube not connected");

    const description = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    if (content?.mediaType === "video" && content?.mediaUrl) {
      const initResponse = await axios?.post(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          snippet: {
            title: content.headline || content?.text.slice(0, 100),
            description: description,
            tags: content.hashtags?.map((h) => h?.replace("#", "")) || [],
            categoryId: "10",
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/*",
          },
        },
      );

      const uploadUrl = initResponse?.headers.location;
      if (!uploadUrl) {
        throw new Error(
          "YouTube upload session failed: no upload URL returned",
        );
      }

      const videoResponse = await axios?.get(content?.mediaUrl, {
        responseType: "arraybuffer",
      });
      const videoBuffer = Buffer?.from(videoResponse?.data);

      const uploadResponse = await axios?.put(uploadUrl, videoBuffer, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "video/*",
          "Content-Length": videoBuffer?.byteLength.toString(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const videoId = uploadResponse?.data.id;

      return {
        platform: "youtube",
        success: true,
        postId: videoId,
        postUrl: videoId ? `https://youtube.com/watch?v=${videoId}` : undefined,
        postedAt: new Date(),
      };
    } else {
      throw new Error("YouTube publishing requires video content; the Data API does not support community text posts");
    }
  }

  private async postToLinkedIn(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("LinkedIn not connected");

    const postText = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    const profileResponse = await axios?.get(
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const personUrn = `urn:li:person:${profileResponse?.data.sub}`;

    let mediaAssets: unknown[] = [];

    if (content?.mediaUrl && content?.mediaType === "image") {
      const registerResponse = await axios?.post(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: personUrn,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );

      const uploadUrl =
        registerResponse?.data.value?.uploadMechanism?.[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]?.uploadUrl;
      const assetUrn = registerResponse?.data.value?.asset;

      if (uploadUrl && assetUrn) {
        const imageResponse = await axios?.get(content?.mediaUrl, {
          responseType: "arraybuffer",
        });

        await axios?.put(uploadUrl, imageResponse?.data, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "image/*",
          },
        });

        mediaAssets?.push({
          status: "READY",
          media: assetUrn,
        });
      }
    }

    const postData: Record<string, unknown> = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: postText,
          },
          shareMediaCategory: mediaAssets.length > 0 ? "IMAGE" : "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    if (mediaAssets?.length > 0) {
      (postData.specificContent as any)["com.linkedin.ugc.ShareContent"].media =
        mediaAssets;
    }

    const response = await axios?.post(
      "https://api.linkedin.com/v2/ugcPosts",
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );

    const postId = response?.data.id;

    return {
      platform: "linkedin",
      success: true,
      postId,
      postUrl: postId
        ? `https://www.linkedin.com/feed/update/${postId}`
        : undefined,
      postedAt: new Date(),
    };
  }

  private async postToThreads(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("Threads not connected");

    const caption = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    const userResponse = await axios?.get(
      `https://graph.threads.net/v1.0/me?access_token=${accessToken}&fields=id,username`,
    );
    const threadsUserId = userResponse?.data.id;
    const threadsUsername = userResponse?.data.username;

    let mediaType = "TEXT";
    const containerData: Record<string, unknown> = {
      text: caption.slice(0, 500),
    };

    if (content?.mediaUrl && content?.mediaType === "image") {
      mediaType = "IMAGE";
      containerData.image_url = content?.mediaUrl;
    } else if (content?.mediaUrl && content?.mediaType === "video") {
      mediaType = "VIDEO";
      containerData.video_url = content?.mediaUrl;
    }

    const createUrl = new URL(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
    );
    createUrl?.searchParams.set("access_token", accessToken);
    createUrl?.searchParams.set("media_type", mediaType);
    createUrl?.searchParams.set("text", (containerData?.text as string));
    if (containerData?.image_url) {
      createUrl?.searchParams.set("image_url", (containerData?.image_url as string));
    }
    if (containerData?.video_url) {
      createUrl?.searchParams.set("video_url", (containerData?.video_url as string));
    }

    const createResponse = await axios?.post(createUrl?.toString());
    const creationId = createResponse?.data.id;

    if (!creationId) {
      throw new Error("Threads container creation failed");
    }

    if (mediaType === "VIDEO") {
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusResponse = await axios?.get(
          `https://graph.threads.net/v1.0/${creationId}?access_token=${accessToken}&fields=status`,
        );

        if (statusResponse?.data.status === "FINISHED") {
          break;
        } else if (statusResponse?.data.status === "ERROR") {
          throw new Error("Threads video processing failed");
        }
      }
    }

    const publishUrl = new URL(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
    );
    publishUrl?.searchParams.set("access_token", accessToken);
    publishUrl?.searchParams.set("creation_id", creationId);

    const publishResponse = await axios?.post(publishUrl?.toString());
    const postId = publishResponse?.data.id;

    return {
      platform: "threads",
      success: true,
      postId,
      postUrl: postId
        ? `https://www.threads.net/@${threadsUsername}/post/${postId}`
        : undefined,
      postedAt: new Date(),
    };
  }

  private async postToGoogleBusiness(
    _user: User,
    accessToken: string | undefined,
    content: PostContent,
  ): Promise<PostResult> {
    if (!accessToken) throw new Error("Google Business not connected");

    const postText = `${content?.headline ? content?.headline + "\n\n" : ""}${content?.text}${content?.hashtags ? "\n\n" + content?.hashtags.join(" ") : ""}`;

    const accountsResponse = await axios?.get(
      "https://mybusinessbusinessinformation.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const accountName = accountsResponse?.data.accounts?.[0]?.name;

    if (!accountName) {
      throw new Error("No Google Business account found");
    }

    const locationsResponse = await axios?.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const locationName = locationsResponse?.data.locations?.[0]?.name;

    if (!locationName) {
      throw new Error("No Google Business location found");
    }

    const postData: Record<string, unknown> = {
      languageCode: "en-US",
      summary: postText.slice(0, 1500),
      topicType: "STANDARD",
    };

    if (content?.mediaUrl) {
      postData.media = [
        {
          mediaFormat: content.mediaType === "video" ? "VIDEO" : "PHOTO",
          sourceUrl: content.mediaUrl,
        },
      ];
    }

    if (content?.link) {
      postData.callToAction = {
        actionType: "LEARN_MORE",
        url: content.link,
      };
    }

    const response = await axios?.post(
      `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const postId = response?.data.name?.split("/").pop();

    return {
      platform: "google_business",
      success: true,
      postId,
      postUrl: response.data.searchUrl || undefined,
      postedAt: new Date(),
    };
  }

  async getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
    return await storage.getScheduledPosts({ userId, status: "pending" });
  }

  async cancelScheduledPost(postId: string): Promise<void> {
    await (storage as any)?.deleteScheduledPost(postId);
    logger.info(`❌ Cancelled scheduled post ${postId}`);
  }

  pause(): void {
    this.isPaused = true;
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    this.recoveryInterval = null;
    void this.worker?.pause();
    logger.info("[AutoPostingService V2] Paused by kill switch");
  }

  resume(): void {
    this.isPaused = false;
    if (!this.worker) {
      this.startWorker();
    } else {
      void this.worker.resume();
    }
    if (!this.recoveryInterval) {
      this.recoveryInterval = setInterval(() => {
        void this.reloadPendingJobs();
      }, 60_000);
      this.recoveryInterval.unref?.();
    }
    void this.reloadPendingJobs();
    logger.info("[AutoPostingService V2] Resumed");
  }

  async shutdown() {
    logger.info("Shutting down auto-posting service...");

    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    this.recoveryInterval = null;
    await this.worker?.close();
    this.worker = null;
    this.isInitialized = false;
    await this.postQueue.close();

    logger.info("✅ Auto-posting service shut down gracefully");
  }
}

export const autoPostingServiceV2 = new AutoPostingServiceV2();
