// @ts-nocheck
import fs from "fs";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOrigin,
  getMaxcoreOriginOrDefault,
} from "../services/maxcoreConnector.js";
import fsPromises from "fs/promises";
import { storageService } from "../services/storageService.js";
import { pocketManager } from "../pocket-dimension/index.js";
import { generateAndStorePosterThumbnail } from "../services/advancedVideoRendererService.js";
import path from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import { logger } from "../logger";
import { db } from "../db";
import { socialInboxMessages, socialReplyTemplates, socialAccounts, posts, storefronts, listings, socialAutopilotContent, artistProfiles, campaigns, contentCalendar, users, workspaceMembers } from "@shared/schema";
import { eq, and, desc, gte, inArray, isNull, or } from "drizzle-orm";
import { syncPlatformData } from "../services/socialSyncService";
import {
  listPromotableContent,
  resolvePromotableContent,
  PromotableContentError,
  PROMOTABLE_CONTENT_TYPES,
  type PromotableContentType,
} from "../services/promotableContentService.js";
import { requireAuth, requireAuthOnly } from "../middleware/auth.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { AIUnavailableError, requireMaxCore } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import { generateSocialUrlWithMaxCore } from "../services/socialUrlMaxCoreTransport.js";
import { resolveFirstPartySocialSource } from "../services/firstPartySocialSource.js";
import { generateSocialDirect } from "../services/maxcoreDomainAdapter.js";
import {
  getAwarenessContext,
  normalizeSocialAwarenessPlatform,
  platformAwarenessOptimization,
} from "../services/awarenessContext.js";
import { notificationService } from "../services/notificationService.js";
import {
  deliverInboxReply,
  SocialInboxProviderError,
  syncSocialInbox,
} from "../services/socialInboxProviderService.js";
import {
  autoPostingServiceV2,
  normalizePublishingPlatform,
} from "../services/autoPostingServiceV2.js";
import {
  audioUpload,
  artworkUpload,
  mediaUpload,
} from "../middleware/uploadHandler.js";
import {
  analyzeUrl,
  analyzeAudio,
  analyzeImage,
  urlToContentSeed,
  audioToContentSeed,
  imageToContentSeed,
} from "../services/mediaAnalyzerService.js";
import {
  getVisualSpec,
  type SupportedPlatform as ContentSupportedPlatform,
  ALL_PLATFORMS as CONTENT_ALL_PLATFORMS,
} from "../services/contentPipeline/platformFormatters.js";

// ── Lazy-loaded AI/TF-heavy services ──────────────────────────────────────────
// These are only imported on first use inside route handlers — NOT at module
// load time — so route registration never fails due to missing TF native libs.
let unifiedAIController:
  | typeof import("../services/unifiedAIController.js").unifiedAIController
  | null = null;
let competitorBenchmarkService:
  | typeof import("../services/competitorBenchmarkService.js").competitorBenchmarkService
  | null = null;
let pythonAIService:
  | typeof import("../services/pythonAIService.js").pythonAIService
  | null = null;

function cleanupMediaUploadFiles(req: Request): Promise<void> {
  const fieldFiles = Array.isArray(req.files)
    ? req.files
    : Object.values(
        (req.files || {}) as Record<string, Express.Multer.File[]>,
      ).flat();
  const files = [
    ...(req.file ? [req.file] : []),
    ...fieldFiles,
  ];
  return Promise.all(
    files
      .map((file) => file?.path)
      .filter((filePath): filePath is string => Boolean(filePath))
      .map((filePath) => fsPromises.unlink(filePath).catch(() => {})),
  ).then(() => undefined);
}

function handleMediaUpload(
  upload: (req: Request, res: Response, callback: (error?: unknown) => void) => void,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (error?: unknown) => {
      if (!error) return next();
      void cleanupMediaUploadFiles(req).finally(() => next(error));
    });
  };
}
let veoMusicService:
  | typeof import("../services/veoMusicService.js").veoMusicService
  | null = null;
let _renderAdvancedVideo:
  | typeof import("../services/advancedVideoRendererService.js").renderVideo
  | null = null;
let maxcoreVideoUrlStore:
  | typeof import("../services/advancedVideoRendererService.js").maxcoreVideoUrlStore
  | null = null;
let _voiceSynthService:
  | typeof import("../services/voiceSynthesisService.js")
  | null = null;
let beatSyncService: typeof import("../services/beatSyncService.js") | null =
  null;
let imageToVideoService:
  | typeof import("../services/imageToVideoService.js")
  | null = null;

async function getVoiceSynthService() {
  if (!_voiceSynthService)
    _voiceSynthService = await import("../services/voiceSynthesisService.js");
  return _voiceSynthService!;
}
async function getBeatSyncService() {
  if (!beatSyncService)
    beatSyncService = await import("../services/beatSyncService.js");
  return beatSyncService!;
}
async function getImageToVideoService() {
  if (!imageToVideoService)
    imageToVideoService = await import("../services/imageToVideoService.js");
  return imageToVideoService!;
}

let _musicVideoStudioService: typeof import("../services/musicVideoStudioService.js") | null = null;
async function getMusicVideoStudioService() {
  if (!_musicVideoStudioService)
    _musicVideoStudioService = await import("../services/musicVideoStudioService.js");
  return _musicVideoStudioService!;
}

async function getUnifiedAI() {
  if (!unifiedAIController) {
    const m = await import("../services/unifiedAIController.js");
    unifiedAIController = m?.unifiedAIController;
  }
  return unifiedAIController!;
}
async function getCompetitorBenchmark() {
  if (!competitorBenchmarkService) {
    const m = await import("../services/competitorBenchmarkService.js");
    competitorBenchmarkService = m?.competitorBenchmarkService;
  }
  return competitorBenchmarkService!;
}
async function getPythonAI() {
  if (!pythonAIService) {
    const m = await import("../services/pythonAIService.js");
    pythonAIService = m?.pythonAIService;
  }
  return pythonAIService!;
}
async function getVeoMusic() {
  if (!veoMusicService) {
    const m = await import("../services/veoMusicService.js");
    veoMusicService = m?.veoMusicService;
  }
  return veoMusicService!;
}
async function getRenderAdvancedVideo() {
  if (!_renderAdvancedVideo) {
    const m = await import("../services/advancedVideoRendererService.js");
    _renderAdvancedVideo = m?.renderVideo;
    maxcoreVideoUrlStore = m?.maxcoreVideoUrlStore;
  }
  return _renderAdvancedVideo!;
}
async function getMaxcoreVideoUrlStore() {
  if (!maxcoreVideoUrlStore) {
    const m = await import("../services/advancedVideoRendererService.js");
    _renderAdvancedVideo = m?.renderVideo;
    maxcoreVideoUrlStore = m?.maxcoreVideoUrlStore;
  }
  return maxcoreVideoUrlStore!;
}

const router = Router();

// ── Async FFmpeg job store ─────────────────────────────────────────────────────
// Holds in-progress and completed FFmpeg video jobs.  Jobs are pruned after
// 10 minutes so memory never grows unbounded.  The client uses the existing
// /video-job/:jobId polling endpoint to check completion — same contract as
// the Python AI service, so no client changes are needed.

interface FFmpegJob {
  status: "processing" | "done" | "error";
  userId: string;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

const ffmpegJobs = new Map<string, FFmpegJob>();

function pruneStaleFFmpegJobs() {
  const now = Date.now();
  for (const [id, job] of ffmpegJobs?.entries() ?? []) {
    if (now - job?.createdAt > 10 * 60 * 1000) ffmpegJobs?.delete(id);
  }
}

// Type for authenticated requests.
// The global Express.Request augmentation (see server/routes.ts) already types
// `user?` as the full `User` schema type, so we simply reuse `Request` here to
// stay compatible with that augmentation. A few legacy handlers also read a
// `userId` field off the user object; that seam is narrowed locally at the
// usage site (see UserWithLegacyId below).
type AuthenticatedRequest = Request;

// Some legacy handlers read `req.user.userId` in addition to `req.user.id`.
// `userId` is not part of the `User` schema (it resolves to `undefined` at
// runtime, which the surrounding `|| ...` fallbacks already tolerate), so we
// model it as an optional field via a local intersection at the read seam.
type UserWithLegacyId = { id?: string; userId?: string };

// Middleware to require authentication
// =========================================
// SOCIAL MEDIA ROUTES - Return empty data until real data exists
// Frontend expects BARE ARRAYS, not wrapped objects
// =========================================

// Get social posts - returns empty array when no real data exists
router.get(
  "/posts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const posts = (await storage.getSocialPosts?.(userId)) || [];
      res.json(posts.map((post) => {
        const engagement =
          post?.engagement && typeof post.engagement === "object"
            ? post.engagement as Record<string, unknown>
            : {};
        let parsedContent: Record<string, unknown> = {};
        try {
          const rawContent =
            typeof post?.content === "string"
              ? JSON.parse(post.content)
              : post?.content;
          if (rawContent && typeof rawContent === "object") {
            parsedContent = rawContent as Record<string, unknown>;
          }
        } catch {
          parsedContent = {};
        }
        const content =
          engagement?._autopilotMeta === true &&
          engagement.content &&
          typeof engagement.content === "object"
            ? engagement.content as Record<string, unknown>
            : parsedContent;
        const rawText =
          (typeof content?.text === "string" && content.text) ||
          (typeof content?.caption === "string" && content.caption) ||
          (typeof post?.content === "string" ? post.content : "");
        const status =
          post?.status === "completed"
            ? "published"
            : post?.status === "pending" || post?.status === "scheduled"
              ? "scheduled"
              : post?.status === "posting"
                ? "publishing"
                : post?.status;
        const storedMediaUrls = Array.isArray(post?.mediaUrls)
          ? post.mediaUrls
          : [];
        const contentMediaUrls = Array.isArray(content?.mediaUrls)
          ? content.mediaUrls
          : typeof content?.mediaUrl === "string"
            ? [content.mediaUrl]
            : [];
        return {
          ...post,
          content: rawText,
          status,
          mediaUrls: storedMediaUrls.length ? storedMediaUrls : contentMediaUrls,
          platforms: Array.isArray(engagement.platforms)
            ? engagement.platforms
            : [post?.platform].filter(Boolean),
        };
      }));
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social posts:");
      res.status(500).json({ error: "Failed to get social posts:" });
    }
  },
);

router.delete(
  "/posts/:postId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postId } = req.params as Record<string, string>;
      const [existing] = await db
        .select({ status: posts.status })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (!["draft", "scheduled", "pending"].includes(existing.status)) {
        return res.status(409).json({
          error: "Posts that are publishing, delivered, or require reconciliation cannot be deleted.",
        });
      }
      const [deleted] = await db
        .delete(posts)
        .where(
          and(
            eq(posts.id, postId),
            eq(posts.userId, userId),
            inArray(posts.status, ["draft", "scheduled", "pending"]),
          ),
        )
        .returning({ id: posts.id });
      if (!deleted) {
        return res.status(409).json({
          error: "Post delivery started while the delete was being processed.",
        });
      }
      res.json({ success: true, id: deleted.id });
    } catch (error) {
      logger.warn({ err: error }, "Failed to delete social post:");
      res.status(500).json({ error: "Failed to delete social post" });
    }
  },
);

const VALID_PLATFORMS = [
  "instagram",
  "twitter",
  "x",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "threads",
  "googlebusiness",
  "google_business",
] as const;

const schedulePostSchema = z.object({
  platform: z.enum(VALID_PLATFORMS).optional(),
  platforms: z.array(z.enum(VALID_PLATFORMS)).min(1).max(8).optional(),
  content: z.string().min(1).max(10000),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  mediaType: z.enum(["text", "image", "photo", "video", "audio", "carousel"]).optional(),
  hashtags: z.array(z.string().max(100)).max(50).optional(),
  mentions: z.array(z.string().max(100)).max(50).optional(),
  headline: z.string().max(500).optional(),
  scheduledAt: z.string().optional().nullable(),
  scheduledTime: z.string().optional().nullable(),
  idempotencyKey: z.string().min(1).max(128).regex(/^[^:]+$/).optional(),
}).superRefine((value, ctx) => {
  if (!value.platform && !value.platforms?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one platform is required",
      path: ["platforms"],
    });
  }
  if (value.platform && value.platforms?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide platform or platforms, not both",
      path: ["platforms"],
    });
  }
});

router.post(
  "/schedule-post",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const parsed = schedulePostSchema?.safeParse(req.body);
      if (!parsed?.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.issues });
      }
      const {
        platform,
        platforms,
        content,
        mediaUrls,
        mediaType,
        hashtags,
        mentions,
        headline,
        scheduledAt,
        scheduledTime,
        idempotencyKey,
      } = parsed.data;
      const requestedSchedule = scheduledAt ?? scheduledTime;
      const scheduledDate = requestedSchedule ? new Date(requestedSchedule) : null;
      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: "scheduledAt must be a valid date" });
      }

      const targetPlatforms = [...new Set(
        (platforms ?? [platform!]).map(normalizePublishingPlatform),
      )];
      let createdPosts;
      if (scheduledDate) {
        const queuedPost = await autoPostingServiceV2.schedulePost(
          userId,
          targetPlatforms,
          {
            text: content,
            ...(headline ? { headline } : {}),
            ...(hashtags?.length ? { hashtags } : {}),
            ...(mentions?.length ? { mentions } : {}),
            ...(mediaUrls?.length ? { mediaUrl: mediaUrls[0], mediaUrls } : {}),
            ...(mediaType ? { mediaType } : {}),
          },
          scheduledDate,
          "manual",
          undefined,
          idempotencyKey || randomUUID(),
        );
        createdPosts = [queuedPost];
      } else {
        createdPosts = await db
          .insert(posts)
          .values(
            targetPlatforms.map((targetPlatform) => ({
              userId,
              platform: targetPlatform,
              content,
              mediaUrls: mediaUrls || [],
              status: "draft",
              scheduledAt: null,
            })),
          )
          .returning();
      }

      res.status(scheduledDate ? 201 : 200).json({
        success: true,
        posts: createdPosts,
        post: createdPosts[0],
        queued: Boolean(scheduledDate),
      });

      if (scheduledDate) {
        setImmediate(async () => {
          try {
            await Promise.all(
              targetPlatforms.map((targetPlatform) =>
                notificationService.sendSocialPostScheduledNotification(
                  userId,
                  targetPlatform,
                  content,
                  scheduledDate,
                ),
              ),
            );
          } catch (err) {
            logger.warn(
              { err: err },
              "Social post scheduled notification error:",
            );
          }
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to schedule post:");
      res.status(500).json({ error: "Failed to schedule post" });
    }
  },
);

router.post(
  "/calendar/:postId/publish",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postId } = req.params as Record<string, string>;

      const [post] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      // This calendar route has no platform publishing integration. Marking the
      // record published here would make a scheduled post disappear without
      // ever being delivered to its connected account.
      return res.status(409).json({
        error:
          "Direct calendar publishing is unavailable until a platform delivery is configured",
        postId: post.id,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to publish post:");
      res.status(500).json({ error: "Failed to publish post" });
    }
  },
);

// Get social metrics - returns empty metrics when no real data exists
router.get(
  "/metrics",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const metrics = (await storage.getSocialMetrics?.(userId)) || {
        totalFollowers: 0,
        totalEngagement: 0,
        totalReach: 0,
        totalImpressions: 0,
        postsThisWeek: 0,
        avgEngagementRate: 0,
        followersGrowth: null,
        contentPerformance: null,
        platformGrowth: null,
        aiRecommendation: null,
      };
      res.json(metrics);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social metrics:");
      res.json({
        totalFollowers: 0,
        totalEngagement: 0,
        totalReach: 0,
        totalImpressions: 0,
        postsThisWeek: 0,
        avgEngagementRate: 0,
        followersGrowth: null,
        contentPerformance: null,
        platformGrowth: null,
        aiRecommendation: null,
      });
    }
  },
);

// Get social calendar - returns empty array when no real data exists
router.get(
  "/calendar",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const events = await Promise.race([
        storage.getSocialCalendarEvents?.(userId) ?? Promise.resolve([]),
        new Promise<unknown[]>(resolve => setTimeout(() => resolve([]), 5_000)),
      ]).catch(() => []) as unknown[];
      res.json(events || []);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social calendar:");
      res.json([]);
    }
  },
);

// Get calendar stats - returns empty stats when no real data exists
router.get(
  "/calendar/stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const emptyStats = {
      totalScheduled: 0,
      pendingApproval: 0,
      published: 0,
      totalPublished: 0,
      upcomingThisWeek: 0,
      drafts: 0,
    };
    try {
      const userId = req.user!.id;
      const stats = await Promise.race([
        storage.getSocialCalendarStats?.(userId) ?? Promise.resolve(emptyStats),
        new Promise<typeof emptyStats>(resolve => setTimeout(() => resolve(emptyStats), 5_000)),
      ]).catch(() => emptyStats);
      res.json(stats || emptyStats);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get calendar stats:");
      res.json(emptyStats);
    }
  },
);

// Create a new calendar post
router.post(
  "/calendar",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const calendarPostSchema = z.object({
        platform: z.enum(VALID_PLATFORMS).optional(),
        platforms: z.array(z.enum(VALID_PLATFORMS)).min(1).max(8).optional(),
        content: z.string().min(1).max(10000),
        mediaUrls: z.array(z.string().url()).max(10).optional(),
        mediaType: z.enum(["text", "image", "photo", "video", "audio", "carousel"]).optional(),
        hashtags: z.array(z.string().max(100)).max(50).optional(),
        mentions: z.array(z.string().max(100)).max(50).optional(),
        title: z.string().max(500).optional(),
        scheduledAt: z.string().optional().nullable(),
        scheduledFor: z.string().optional().nullable(),
        status: z.enum(["draft", "scheduled"]).optional(),
        idempotencyKey: z.string().min(1).max(128).regex(/^[^:]+$/).optional(),
      }).superRefine((value, ctx) => {
        if (!value.platform && !value.platforms?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one platform is required",
            path: ["platforms"],
          });
        }
        if (value.platform && value.platforms?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide platform or platforms, not both",
            path: ["platforms"],
          });
        }
      }).safeParse(req.body);
      if (!calendarPostSchema.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: calendarPostSchema.error.issues,
        });
      }

      const {
        platform,
        platforms,
        content,
        mediaUrls,
        mediaType,
        hashtags,
        mentions,
        title,
        scheduledAt,
        scheduledFor,
        idempotencyKey,
        status,
      } = calendarPostSchema.data;
      const requestedSchedule = scheduledAt ?? scheduledFor;
      const scheduledDate = requestedSchedule ? new Date(requestedSchedule) : null;
      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: "scheduledAt must be a valid date" });
      }
      const targetPlatforms = [...new Set(
        (platforms ?? [platform!]).map(normalizePublishingPlatform),
      )];
      const postStatus = status || (scheduledDate ? "scheduled" : "draft");
      if (postStatus === "scheduled" && !scheduledDate) {
        return res.status(400).json({
          error: "scheduledAt is required for a scheduled post",
        });
      }
      const postContent = {
        text: content,
        ...(title ? { headline: title } : {}),
        ...(hashtags?.length ? { hashtags } : {}),
        ...(mentions?.length ? { mentions } : {}),
        ...(mediaUrls?.length ? { mediaUrl: mediaUrls[0], mediaUrls } : {}),
        ...(mediaType
          ? { mediaType }
          : mediaUrls?.length
            ? { mediaType: "image" as const }
            : {}),
      };

      let post;
      if (postStatus === "scheduled") {
        post = await autoPostingServiceV2.schedulePost(
          userId,
          targetPlatforms,
          postContent,
          scheduledDate!,
          "manual",
          undefined,
          idempotencyKey || randomUUID(),
        );
      } else {
        const drafts = await db
          .insert(posts)
          .values(
            targetPlatforms.map((targetPlatform) => ({
              userId,
              platform: targetPlatform,
              content: JSON.stringify(postContent),
              mediaUrls: mediaUrls || [],
              status: "draft",
              scheduledAt: scheduledDate,
            })),
          )
          .returning();
        post = drafts[0];
      }

      if (scheduledDate && postStatus === "scheduled") {
        setImmediate(async () => {
          try {
            await notificationService?.sendSocialPostScheduledNotification(
              userId,
              targetPlatforms[0],
              content,
              scheduledDate,
            );
          } catch (err) {
            logger.warn({ err }, "Calendar post scheduled notification error:");
          }
        });
      }

      res.status(201).json({
        ...(post as Record<string, unknown>),
        ...(postStatus === "scheduled" ? { queued: true } : {}),
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to create calendar post:");
      res.status(500).json({ error: "Failed to create calendar post" });
    }
  },
);

// Update an existing calendar post
router.put(
  "/calendar/:postId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postId } = req.params as Record<string, string>;
      const {
        platform,
        platforms,
        content,
        mediaUrls,
        mediaType,
        hashtags,
        mentions,
        title,
        scheduledAt: rawScheduledAt,
        scheduledFor,
        status,
      } = req.body || {};
      const requestedSchedule = rawScheduledAt ?? scheduledFor;
      const scheduledDate = requestedSchedule
        ? new Date(requestedSchedule)
        : null;

      const existing = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);

      if (!existing?.length) {
        return res.status(404).json({ error: "Post not found" });
      }
      const currentPost = existing[0];
      if (status === "published") {
        return res.status(400).json({
          error:
            "Posts cannot be marked published before platform delivery is verified",
        });
      }

      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: "scheduledAt must be a valid date" });
      }
      if (
        ["pending", "scheduled", "posting", "completed", "published"].includes(
          currentPost.status,
        )
      ) {
        return res.status(409).json({
          error:
            "Queued or delivered posts cannot be edited in place. Delete the queued post and create a replacement.",
        });
      }

      const targetPlatforms = [...new Set(
        (Array.isArray(platforms) ? platforms : platform ? [platform] : [])
          .map(normalizePublishingPlatform),
      )];
      const postContent = {
        text: typeof content === "string" ? content : "",
        ...(typeof title === "string" && title ? { headline: title } : {}),
        ...(Array.isArray(hashtags) && hashtags.length ? { hashtags } : {}),
        ...(Array.isArray(mentions) && mentions.length ? { mentions } : {}),
        ...(Array.isArray(mediaUrls) && mediaUrls.length
          ? { mediaUrl: mediaUrls[0], mediaUrls }
          : {}),
        ...(mediaType
          ? { mediaType }
          : Array.isArray(mediaUrls) && mediaUrls.length
            ? { mediaType: "image" as const }
            : {}),
      };
      const requestedStatus = status || "draft";
      if (requestedStatus === "scheduled") {
        if (!scheduledDate) {
          return res.status(400).json({
            error: "scheduledAt is required for a scheduled post",
          });
        }
        if (targetPlatforms.length === 0) {
          return res.status(400).json({ error: "At least one platform is required" });
        }
        const queued = await autoPostingServiceV2.scheduleExistingPost(postId, {
          platforms: targetPlatforms,
          content: postContent,
          mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
          scheduledAt: scheduledDate,
        });
        return res.status(200).json({ ...queued, queued: true });
      }

      if (targetPlatforms.length > 1) {
        return res.status(400).json({
          error: "A draft calendar row can target only one platform; schedule it to publish across platforms.",
        });
      }
      const updates: Record<string, unknown> = {};
      if (targetPlatforms.length === 1) updates.platform = targetPlatforms[0];
      if (content !== undefined) updates.content = JSON.stringify(postContent);
      if (mediaUrls !== undefined) updates.mediaUrls = mediaUrls;
      if (status !== undefined) updates.status = requestedStatus;
      if (requestedSchedule !== undefined)
        updates.scheduledAt = scheduledDate;

      const [updated] = await db
        .update(posts)
        .set(updates)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Failed to update calendar post:");
      res.status(500).json({ error: "Failed to update calendar post" });
    }
  },
);

// ── Batch operations on calendar posts ───────────────────────────────────────
// These routes MUST appear before /:postId routes so Express does not
// interpret "batch" as a post ID.

// Batch update: change status, scheduledAt, platform, or content on many posts
router.patch(
  "/calendar/batch",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postIds, updates } = req.body as {
        postIds: string[];
        updates: {
          status?: string;
          scheduledAt?: string | null;
          platform?: string;
          content?: string;
        };
      };

      if (!Array.isArray(postIds) || postIds?.length === 0) {
        return res
          .status(400)
          .json({ error: "postIds must be a non-empty array" });
      }
      if (!updates || Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ error: "updates must contain at least one field" });
      }
      if (updates.status === "published") {
        return res.status(400).json({
          error:
            "Posts cannot be marked published before platform delivery is verified",
        });
      }
      if (updates.status === "scheduled") {
        return res.status(409).json({
          error:
            "Bulk status changes cannot create provider queue jobs. Schedule drafts individually from the calendar.",
        });
      }

      // Verify all posts belong to this user
      const existing = await db
        .select({ id: posts.id, status: posts.status })
        .from(posts)
        .where(and(inArray(posts.id, postIds), eq(posts.userId, userId)));

      const validIds = existing?.map((r) => r?.id);
      if (validIds?.length === 0) {
        return res.status(404).json({ error: "No matching posts found" });
      }
      if (existing.some((post) => ["pending", "scheduled", "posting", "completed", "published"].includes(post.status))) {
        return res.status(409).json({
          error:
            "Queued or delivered posts cannot be batch-edited. Delete a queued post and create a replacement instead.",
        });
      }

      const dbUpdates: Record<string, unknown> = {};
      if (updates?.status !== undefined) dbUpdates.status = updates?.status;
      if (updates?.platform !== undefined) dbUpdates.platform = updates?.platform;
      if (updates?.content !== undefined) dbUpdates.content = updates?.content;
      if (updates?.scheduledAt !== undefined) {
        dbUpdates.scheduledAt = updates?.scheduledAt
          ? new Date(updates?.scheduledAt)
          : null;
      }

      const updated = await db
        .update(posts)
        .set(dbUpdates)
        .where(and(inArray(posts.id, validIds), eq(posts.userId, userId)))
        .returning();

      res.json({ updated: updated.length, posts: updated });
    } catch (error) {
      logger.warn({ err: error }, "Batch calendar update error");
      res.status(500).json({ error: "Failed to batch update posts" });
    }
  },
);

// Batch publish: immediately publish multiple posts
router.post(
  "/calendar/batch/publish",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postIds } = req.body as { postIds: string[] };

      if (!Array.isArray(postIds) || postIds?.length === 0) {
        return res
          .status(400)
          .json({ error: "postIds must be a non-empty array" });
      }

      const existing = await db
        .select()
        .from(posts)
        .where(and(inArray(posts.id, postIds), eq(posts.userId, userId)));

      if (existing?.length === 0) {
        return res.status(404).json({ error: "No matching posts found" });
      }

      // As with the single-post route, do not claim delivery by changing a
      // terminal status before a platform API has accepted each post.
      return res.status(409).json({
        error:
          "Direct calendar publishing is unavailable until a platform delivery is configured",
        postIds: existing.map((post) => post.id),
      });
    } catch (error) {
      logger.warn({ err: error }, "Batch publish error");
      res.status(500).json({ error: "Failed to batch publish posts" });
    }
  },
);

// Batch delete: remove multiple calendar posts at once
router.delete(
  "/calendar/batch",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      // Support both JSON body and query-string for DELETE
      const rawIds = req.body?.postIds ?? req.query?.postIds;
      const postIds: string[] = Array.isArray(rawIds)
        ? rawIds
        : typeof rawIds === "string"
          ? [rawIds]
          : [];

      if (postIds?.length === 0) {
        return res
          .status(400)
          .json({ error: "postIds must be a non-empty array" });
      }

      const existing = await db
        .select({ id: posts.id, status: posts.status })
        .from(posts)
        .where(and(inArray(posts.id, postIds), eq(posts.userId, userId)));

      const validIds = existing?.map((r) => r?.id);
      if (validIds?.length === 0) {
        return res.status(404).json({ error: "No matching posts found" });
      }

      const deletableIds = existing
        .filter((post) => ["draft", "scheduled", "pending"].includes(post.status))
        .map((post) => post.id);
      const deleted = deletableIds.length
        ? await db
        .delete(posts)
        .where(
          and(
            inArray(posts.id, deletableIds),
            eq(posts.userId, userId),
            inArray(posts.status, ["draft", "scheduled", "pending"]),
          ),
        )
        .returning({ id: posts.id })
        : [];

      const deletedIds = deleted.map((post) => post.id);
      const skippedIds = validIds.filter((id) => !deletedIds.includes(id));
      res.status(skippedIds.length ? 207 : 200).json({
        deleted: deletedIds.length,
        ids: deletedIds,
        skippedIds,
      });
    } catch (error) {
      logger.warn({ err: error }, "Batch delete error");
      res.status(500).json({ error: "Failed to batch delete posts" });
    }
  },
);

// Delete a calendar post
router.delete(
  "/calendar/:postId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { postId } = req.params as Record<string, string>;

      const existing = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);

      if (!existing?.length) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (!["draft", "scheduled", "pending"].includes(existing[0].status)) {
        return res.status(409).json({
          error: "Posts that are publishing, delivered, or require reconciliation cannot be deleted.",
        });
      }
      const [deleted] = await db
        .delete(posts)
        .where(
          and(
            eq(posts.id, postId),
            eq(posts.userId, userId),
            inArray(posts.status, ["draft", "scheduled", "pending"]),
          ),
        )
        .returning({ id: posts.id });
      if (!deleted) {
        return res.status(409).json({
          error: "Post delivery started while the delete was being processed.",
        });
      }

      res.json({ success: true, id: postId });
    } catch (error) {
      logger.warn({ err: error }, "Failed to delete calendar post:");
      res.status(500).json({ error: "Failed to delete calendar post" });
    }
  },
);

// Get social activity - returns empty array when no real data exists
router.get(
  "/activity",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const activity = (await storage.getSocialActivity?.(userId)) || [];
      res.json(activity);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social activity:");
      res.status(500).json({ error: "Failed to get social activity:" });
    }
  },
);

// Get weekly stats - returns empty array when no real data exists
router.get(
  "/weekly-stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const daily = (await storage.getSocialWeeklyStats?.(userId)) || [];
      const totalReach = daily.reduce(
        (sum: number, d: any) => sum + (Number(d?.views) || 0) + (Number(d?.impressions) || 0),
        0,
      );
      const postsThisWeek = daily.reduce(
        (sum: number, d: any) => sum + (Number(d?.posts) || 0),
        0,
      );
      const totalEngagement = daily.reduce(
        (sum: number, d: any) => sum + (Number(d?.engagement) || 0),
        0,
      );
      const engagementRate =
        totalReach > 0 ? Number(((totalEngagement / (totalReach || 1)) * 100).toFixed(2)) : 0;
      const dailyEngagement = daily.map((d: any) => ({
        date: d?.date,
        engagement: Number(d?.engagement) || 0,
      }));
      res.json({ totalReach, engagementRate, postsThisWeek, dailyEngagement });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get weekly stats:");
      res.status(500).json({ error: "Failed to get weekly stats:" });
    }
  },
);

// Get AI insights - returns empty array when no real data exists
router.get(
  "/ai-insights",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const insights = await (
        storage.getSocialAIInsights?.(userId) ?? Promise.resolve([])
      ).catch(() => []);
      res.json(insights);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get AI insights:");
      res.json([]);
    }
  },
);

// Track the time this server process started — any sync older than this used the old
// code and must be re-fetched immediately regardless of the 1-hour guard.
const SERVER_BOOT_MS = Date.now();

// Get platform status - returns connected social accounts from OAuth connections
// Returns array format for SocialMedia page, also works for Advertisement page
router.get(
  "/platform-status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Get actual OAuth connections from socialAccounts table
      const connections = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, userId))
        .limit(50);

      const connectionMap = new Map<string, (typeof connections)[0]>();
      for (const conn of connections) {
        if (conn?.isActive) {
          connectionMap?.set(conn?.platform, conn);
        }
      }

      const ONE_HOUR_MS = 60 * 60 * 1000;
      const now = Date.now();
      const stalePlatforms: string[] = [];
      for (const conn of connections) {
        if (conn?.isActive) {
          const meta = conn?.metadata as Record<string, unknown>;
          const lastSync = meta?.lastSyncedAt
            ? new Date(meta?.lastSyncedAt as any).getTime()
            : conn?.createdAt
              ? new Date(conn?.createdAt).getTime()
              : 0;
          // Stale if: older than 1 hour OR synced before this server boot (old code)
          if (now - lastSync > ONE_HOUR_MS || lastSync < SERVER_BOOT_MS) {
            stalePlatforms?.push(conn?.platform);
          }
        }
      }

      if (stalePlatforms?.length > 0) {
        const uniquePlatforms = new Set<string>();
        const hasPreBootStale = stalePlatforms?.some((p) => {
          const conn = connections?.find((c) => c?.platform === p);
          const meta = conn?.metadata as Record<string, unknown>;
          const lastSync = meta?.lastSyncedAt
            ? new Date(meta?.lastSyncedAt as any).getTime()
            : 0;
          return lastSync < SERVER_BOOT_MS;
        });
        for (const p of stalePlatforms) {
          if (p === "facebook" || p === "instagram") {
            uniquePlatforms?.add("meta");
          } else {
            uniquePlatforms?.add(p);
          }
        }
        if (hasPreBootStale) {
          // Pre-boot data used the old sync code — block and wait so the response
          // contains fresh follower/engagement numbers rather than stale zeros.
          logger.info(
            `[SocialSync] Pre-boot stale data detected — running blocking sync for ${[...uniquePlatforms].join(", ")}`,
          );
          await Promise.all(
            [...uniquePlatforms].map((p) =>
              syncPlatformData(userId, p).catch((err) =>
                logger.warn({ err: err }, `Blocking sync failed for ${p}:`),
              ),
            ),
          );
          // Refresh the connection map with newly synced data
          const freshConns = await db
            .select()
            .from(socialAccounts)
            .where(eq(socialAccounts.userId, userId))
            .limit(50);
          connectionMap?.clear();
          for (const conn of freshConns) {
            if (conn?.isActive) connectionMap?.set(conn?.platform, conn);
          }
        } else {
          // Normal background refresh — return current data immediately
          for (const p of uniquePlatforms) {
            syncPlatformData(userId, p).catch((err) => {
              logger.warn({ err: err }, `Background sync failed for ${p}:`);
            });
          }
        }
      }

      const supportedPlatforms = [
        { id: "meta", name: "Meta (Facebook + Instagram)" },
        { id: "twitter", name: "Twitter (X)" },
        { id: "youtube", name: "YouTube" },
        {
          id: "tiktok",
          name:
            process.env.TIKTOK_ENV === "sandbox"
              ? "TikTok (Sandbox)"
              : "TikTok",
        },
        { id: "linkedin", name: "LinkedIn" },
        { id: "threads", name: "Threads" },
        { id: "googlebusiness", name: "Google Business" },
        { id: "spotify", name: "Spotify" },
      ];

      const platformStatus = supportedPlatforms?.map((platform) => {
        if (platform?.id === "meta") {
          const fb = connectionMap?.get("facebook");
          const ig = connectionMap?.get("instagram");
          const isConnected = !!(fb || ig);

          // Sum followers from BOTH Facebook and Instagram
          const fbFollowers = fb?.followerCount || 0;
          const igFollowers = ig?.followerCount || 0;
          const followers = fbFollowers + igFollowers;

          const fbMeta = fb?.metadata as Record<string, unknown>;
          const igMeta = ig?.metadata as Record<string, unknown>;

          // Average engagement across both (only include platforms with real data)
          const rates = [fbMeta?.engagementRate, igMeta?.engagementRate].filter(
            (r) => typeof r === "number" && r > 0,
          );
          const engagement =
            rates?.length > 0
              ? Math.round(
                  ((rates as any)?.reduce((a: number, b: number) => a + b, 0) /
                    rates?.length) *
                    100,
                ) / 100
              : 0;

          // Most recent sync across FB + IG
          const fbSync = fbMeta?.lastSyncedAt
            ? new Date(fbMeta?.lastSyncedAt as any).getTime()
            : 0;
          const igSync = igMeta?.lastSyncedAt
            ? new Date(igMeta?.lastSyncedAt as any).getTime()
            : 0;
          const lastSync = new Date(
            Math.max(fbSync, igSync) || Date.now(),
          ).toISOString();

          // Primary conn for username/profileUrl — prefer IG, fall back to FB
          const primaryConn = ig || fb;
          const secondaryConn = ig ? fb : undefined;

          return {
            id: "meta",
            name: platform.name,
            isConnected,
            followers,
            engagement,
            lastSync,
            status: isConnected ? "active" : "inactive",
            username: primaryConn?.username || undefined,
            profileUrl: primaryConn?.profileUrl || "",
            platformUserId: primaryConn?.platformUserId || "",
            // Expose per-platform breakdown in metadata for UI tooltip/detail
            metadata: {
              ...(primaryConn?.metadata || {}),
              facebook: {
                followers: fbFollowers,
                username: fb?.username || null,
                profileUrl: fb?.profileUrl || null,
                engagementRate: (fbMeta as Record<string, unknown>)?.engagementRate || 0,
              },
              instagram: {
                followers: igFollowers,
                username: ig?.username || null,
                profileUrl: ig?.profileUrl || null,
                engagementRate: (igMeta as Record<string, unknown>)?.engagementRate || 0,
              },
            },
            // Extra field used by the connected accounts detail view
            secondaryUsername: secondaryConn?.username || undefined,
          };
        }
        const conn = connectionMap?.get(platform?.id);
        const connMeta = conn?.metadata as Record<string, unknown>;
        const engagement =
          typeof connMeta?.engagementRate === "number"
            ? connMeta?.engagementRate
            : 0;
        const needsReconnect = !!connMeta?.needsReconnect;
        return {
          id: platform.id,
          name: platform.name,
          isConnected: !!conn,
          followers: conn?.followerCount || 0,
          engagement,
          lastSync:
            connMeta?.lastSyncedAt || conn?.createdAt?.toISOString() || "",
          status: conn
            ? needsReconnect
              ? "needs_reconnect"
              : "active"
            : "inactive",
          needsReconnect,
          tokenRefreshFailedAt: connMeta?.tokenRefreshFailedAt || null,
          username: conn?.username || undefined,
          profileUrl: conn?.profileUrl || "",
          platformUserId: conn?.platformUserId || "",
          metadata: conn?.metadata || {},
        };
      });

      res.json(platformStatus);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get platform status:");
      res.status(500).json({ error: "Failed to get platform status:" });
    }
  },
);

router.post(
  "/sync-all",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const connections = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, userId))
        .limit(50);

      const activePlatforms = new Set<string>();
      for (const conn of connections) {
        if (conn?.isActive) {
          if (conn?.platform === "facebook" || conn?.platform === "instagram") {
            activePlatforms?.add("meta");
          } else {
            activePlatforms?.add(conn?.platform);
          }
        }
      }

      const allResults: Record<string, any> = {};
      for (const p of activePlatforms) {
        try {
          const result = await syncPlatformData(userId, p);
          Object.assign(allResults, result);
        } catch (err) {
          logger.warn({ err: err }, `sync-all: failed to sync ${p}:`);
          allResults[p] = { error: "Sync failed" };
        }
      }

      res.json({ success: true, results: allResults });

      setImmediate(async () => {
        try {
          const followerMilestones = [
            1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
          ];
          for (const conn of connections) {
            if (!conn?.isActive || !conn?.followerCount) continue;
            const followers = conn?.followerCount as number;
            if (followerMilestones?.includes(followers)) {
              const platformName =
                conn?.platform?.charAt(0).toUpperCase() + conn?.platform?.slice(1);
              await notificationService?.sendFollowerMilestoneNotification(
                userId,
                platformName,
                followers,
              );
            }
          }
        } catch (err) {
          logger.warn({ err: err }, "Follower milestone notification error:");
        }
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to sync all platforms:");
      res.status(500).json({ error: "Failed to sync all platforms" });
    }
  },
);

// =========================================
// SOCIAL LISTENING ROUTES
// =========================================

// Social listening response contract:
// keywords -> { keywords }, trending -> { topics }, influencers -> { influencers },
// alerts -> { alerts }. Empty datasets remain successful responses with empty arrays.
router.get(
  "/listening/keywords",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const keywords =
        (await storage.getSocialListeningKeywords?.(userId)) || [];
      res.json({ keywords });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social listening keywords:");
      res
        .status(500)
        .json({ error: "Failed to get social listening keywords:" });
    }
  },
);

router.get(
  "/hashtags/trending",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);

      // MaxCore is the sole hashtag source — no local fallback list.
      const ai = await getUnifiedAI();
      const mcResult = await Promise.race([
        ai?.generateContent({
          topic: "trending music hashtags for social media marketing",
          platform: "instagram",
          tone: "energetic",
          genre: ((user as Record<string, unknown>)?.genre as string) || "music",
          artistName:
            ((user as Record<string, unknown>)?.artistName as string) || "",
          includeHashtags: true,
          extraContext:
            "Return a diverse list of trending music hashtags across categories: general music, production, hip-hop, R&B, promotion, indie. Include high-reach and niche tags.",
        }),
        new Promise<null>((_, reject) =>
          setTimeout(
            () => reject(new AIUnavailableError("trending hashtags (MaxCore timeout)")),
            10_000,
          ),
        ),
      ]);

      const mcHashtags = (mcResult as any)?.data?.hashtags;
      const rawTags: string[] = requireMaxCore(
        Array.isArray(mcHashtags) && mcHashtags.length ? mcHashtags : null,
        "trending hashtags",
      );

      const categoryMap: Record<string, string> = {
        production: "production",
        producer: "production",
        beatmaker: "production",
        studiolife: "production",
        beats: "production",
        beatmaking: "production",
        hiphop: "hiphop",
        rap: "hiphop",
        rapper: "hiphop",
        trap: "hiphop",
        freestyle: "hiphop",
        bars: "hiphop",
        rnb: "rnb",
        soul: "rnb",
        indie: "indie",
        indieartist: "indie",
        linkinbio: "promotion",
        streaming: "promotion",
        spotify: "promotion",
        newrelease: "promotion",
        musicvideo: "promotion",
      };

      function guessCategory(tag: string): string {
        const t = tag?.replace(/^#/, "").toLowerCase();
        for (const [key, cat] of Object.entries(categoryMap)) {
          if (t?.includes(key)) return cat;
        }
        return "general";
      }

      // MaxCore identifies relevant tags, but it does not provide measured
      // platform volume or momentum. Do not manufacture those metrics from a
      // hash/time function or imply that the tags are ranked by live volume.
      res.json(
        rawTags.slice(0, 12).map((tag) => ({
          hashtag: tag.startsWith("#") ? tag : `#${tag}`,
          category: guessCategory(tag),
        })),
      );
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "Trending hashtag generation is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to get trending hashtags",
      );
      res.status(500).json({ error: "Failed to get trending hashtags" });
    }
  },
);

router.get(
  "/listening/trending",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const trending =
        (await storage.getSocialListeningTrending?.(userId)) || [];
      res.json({ topics: trending });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social listening trending:");
      res
        .status(500)
        .json({ error: "Failed to get social listening trending:" });
    }
  },
);

router.get(
  "/listening/influencers",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const influencers =
        (await storage.getSocialListeningInfluencers?.(userId)) || [];
      res.json({ influencers });
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to get social listening influencers:",
      );
      res
        .status(500)
        .json({ error: "Failed to get social listening influencers:" });
    }
  },
);

router.get(
  "/listening/alerts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const alerts = (await storage.getSocialListeningAlerts?.(userId)) || [];
      res.json({ alerts });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social listening alerts:");
      res.status(500).json({ error: "Failed to get social listening alerts:" });
    }
  },
);

// =========================================
// COMPETITOR BENCHMARKING ROUTES
// =========================================

// Get competitors - returns competitors from database
router.get(
  "/competitors",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const competitors = await (
        await getCompetitorBenchmark()
      ).getCompetitors(userId);
      res.json(competitors);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get competitors:");
      res.status(500).json({ error: "Failed to get competitors:" });
    }
  },
);

// Add competitor
router.post(
  "/competitors",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, handle, platforms } = req.body;

      if (!name || !handle) {
        return res.status(400).json({ error: "Name and handle are required" });
      }

      const result = await (
        await getCompetitorBenchmark()
      ).addCompetitor(userId, { name, handle, platforms });

      if (!result?.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json(result?.competitor);
    } catch (error) {
      logger.warn({ err: error }, "Failed to add competitor:");
      res.status(500).json({ error: "Failed to add competitor" });
    }
  },
);

// Remove competitor
router.delete(
  "/competitors/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      const result = await (
        await getCompetitorBenchmark()
      ).removeCompetitor(userId, id);

      if (!result?.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Failed to remove competitor:");
      res.status(500).json({ error: "Failed to remove competitor" });
    }
  },
);

// Get your social stats - returns null when no real data exists
router.get(
  "/your-stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const stats = (await storage.getUserSocialStats?.(userId)) || null;
      res.json(stats);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get your social stats:");
      res.json(null);
    }
  },
);

// Get benchmark competitors - returns comprehensive benchmark data
router.get(
  "/benchmark/competitors",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const competitors = await (
        await getCompetitorBenchmark()
      ).getCompetitors(userId);
      const yourBrand = await (
        await getCompetitorBenchmark()
      ).getYourStats(userId);
      const comparison = await (
        await getCompetitorBenchmark()
      ).getBenchmarkComparison(userId);
      res.json({ competitors, yourBrand, comparison });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get benchmark competitors:");
      res.json({ competitors: [], yourBrand: null, comparison: [] });
    }
  },
);

// Get benchmark insights - returns competitive insights
router.get(
  "/benchmark/insights",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const insights = await (
        await getCompetitorBenchmark()
      ).getInsights(userId);
      res.json(insights);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get benchmark insights:");
      res.status(500).json({ error: "Failed to get benchmark insights:" });
    }
  },
);

// Get share of voice
router.get(
  "/benchmark/share-of-voice",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const shareOfVoice = await (
        await getCompetitorBenchmark()
      ).getShareOfVoice(userId);
      res.json(shareOfVoice);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get share of voice:");
      res.status(500).json({ error: "Failed to get share of voice" });
    }
  },
);

// =========================================
// UNIFIED INBOX ROUTES - Provider-synced messages and receipt-backed replies
// =========================================

function inboxAccessCondition(userId: string) {
  return or(
    eq(socialInboxMessages.userId, userId),
    eq(socialInboxMessages.assignedTo, userId),
  );
}

async function getActiveWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(100);
  return [...new Set(memberships.map((membership) => membership.workspaceId))];
}

// Get inbox messages - returns messages from database with filtering
router.get(
  "/inbox",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        platform,
        status,
        priority,
        sentiment,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = db
        .select()
        .from(socialInboxMessages)
        .where(inboxAccessCondition(userId))
        .orderBy(desc(socialInboxMessages.createdAt))
        .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
        .offset(Math.min(Math.max(0, Number(offset) || 0), 100_000));

      const messages = await query;

      const filteredMessages = messages?.filter((m) => {
        if (platform && platform !== "all" && m?.platform !== platform)
          return false;
        if (status && status !== "all" && m?.status !== status) return false;
        if (priority && priority !== "all" && m?.priority !== priority)
          return false;
        if (sentiment && sentiment !== "all" && m?.sentiment !== sentiment)
          return false;
        return true;
      });

      res.json({
        messages: filteredMessages.map((m) => ({
          id: m.id,
          platform: m.platform,
          type: m.messageType,
          content: m.content,
          author: {
            id: m.authorId,
            name: m.authorName,
            username: m.authorHandle,
            avatar: m.authorAvatar,
            followers: m.authorFollowers,
            verified: m.authorVerified,
          },
          postContent: m.postContent,
          postUrl: m.postUrl,
          sentiment: m.sentiment,
          priority: m.priority,
          status: m.status,
          assignedTo: m.assignedTo,
          tags: m.tags || [],
          threadId: m.threadId,
          createdAt: m.createdAt,
          readAt: m.readAt,
          repliedAt: m.repliedAt,
          replyContent: m.replyContent,
          replyDelivered: m.replyDelivered,
          replyDeliveryState: m.replyDeliveryState,
          providerReplyId: m.providerReplyId,
          replyDeliveryError: m.replyDeliveryError,
        })),
        total: filteredMessages.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get inbox messages:");
      res.status(500).json({ error: "Failed to load inbox messages" });
    }
  },
);

// Fetch current provider mentions/comments and persist only records returned
// by the connected provider APIs. Unsupported platforms are reported rather
// than represented as a successfully empty inbox.
router.post(
  "/inbox/sync",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = z
      .object({
        platforms: z.array(z.string().min(1).max(40)).max(12).optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid inbox sync request",
        details: parsed.error.flatten(),
      });
    }
    try {
      const result = await syncSocialInbox(
        req.user!.id,
        parsed.data.platforms,
      );
      res.status(result.success ? 200 : 207).json(result);
    } catch (error) {
      logger.warn({ err: error }, "[SocialInbox] Provider sync failed:");
      res.status(502).json({
        success: false,
        error: "Inbox sync could not be completed.",
      });
    }
  },
);

// Get inbox stats - returns stats from database
router.get(
  "/inbox/stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messages = await db
        .select()
        .from(socialInboxMessages)
        .where(inboxAccessCondition(userId))
        .limit(200);

      const stats = {
        total: messages.length,
        unread: messages.filter((m) => m?.status === "unread").length,
        highPriority: messages.filter(
          (m) => m?.priority === "high" && m?.status === "unread",
        ).length,
        negative: messages.filter(
          (m) => m?.sentiment === "negative" && m?.status === "unread",
        ).length,
        byPlatform: {
          twitter: messages.filter((m) => m?.platform === "twitter").length,
          instagram: messages.filter((m) => m?.platform === "instagram").length,
          facebook: messages.filter((m) => m?.platform === "facebook").length,
          tiktok: messages.filter((m) => m?.platform === "tiktok").length,
          youtube: messages.filter((m) => m?.platform === "youtube").length,
          linkedin: messages.filter((m) => m?.platform === "linkedin").length,
        },
      };
      res.json(stats);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get inbox stats:");
      res.status(500).json({ error: "Failed to load inbox stats" });
    }
  },
);

function parseBulkMessageIds(body: unknown): string[] | null {
  const messageIds = (body as { messageIds?: unknown } | null)?.messageIds;
  if (!Array.isArray(messageIds) || messageIds.length === 0) return null;
  if (messageIds.length > 500) return null;
  if (!messageIds.every((id) => typeof id === "string")) return null;
  return messageIds as string[];
}

// NOTE: all "/inbox/bulk/*" routes MUST be registered before "/inbox/:id/*"
// routes below — Express matches routes in registration order, and
// "/inbox/:id/read" would otherwise greedily match "/inbox/bulk/read" with
// id="bulk", silently no-opping every bulk action.

// Mark multiple messages as read — single batched query, not one round-trip
// per id, so bulk-selecting hundreds of messages doesn't serialize into a
// slow sequential loop.
router.post(
  "/inbox/bulk/read",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageIds = parseBulkMessageIds(req.body);
      if (!messageIds) {
        return res
          .status(400)
          .json({ error: "messageIds must be a non-empty array (max 500)" });
      }

      await db
        .update(socialInboxMessages)
        .set({ status: "read", readAt: new Date() })
        .where(
          and(
            inArray(socialInboxMessages.id, messageIds),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true, updated: messageIds.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to mark messages as read:");
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  },
);

// Mark multiple messages as unread
router.post(
  "/inbox/bulk/unread",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageIds = parseBulkMessageIds(req.body);
      if (!messageIds) {
        return res
          .status(400)
          .json({ error: "messageIds must be a non-empty array (max 500)" });
      }

      await db
        .update(socialInboxMessages)
        .set({ status: "unread", readAt: null })
        .where(
          and(
            inArray(socialInboxMessages.id, messageIds),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true, updated: messageIds.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to mark messages as unread:");
      res.status(500).json({ error: "Failed to mark messages as unread" });
    }
  },
);

// Archive multiple messages
router.post(
  "/inbox/bulk/archive",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageIds = parseBulkMessageIds(req.body);
      if (!messageIds) {
        return res
          .status(400)
          .json({ error: "messageIds must be a non-empty array (max 500)" });
      }

      await db
        .update(socialInboxMessages)
        .set({ status: "archived" })
        .where(
          and(
            inArray(socialInboxMessages.id, messageIds),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true, updated: messageIds.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to archive messages:");
      res.status(500).json({ error: "Failed to archive messages" });
    }
  },
);

// Delete multiple messages permanently
router.post(
  "/inbox/bulk/delete",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageIds = parseBulkMessageIds(req.body);
      if (!messageIds) {
        return res
          .status(400)
          .json({ error: "messageIds must be a non-empty array (max 500)" });
      }

      await db
        .delete(socialInboxMessages)
        .where(
          and(
            inArray(socialInboxMessages.id, messageIds),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true, deleted: messageIds.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to delete messages:");
      res.status(500).json({ error: "Failed to delete messages" });
    }
  },
);

// Mark message as read
router.post(
  "/inbox/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      await db
        .update(socialInboxMessages)
        .set({
          status: "read",
          readAt: new Date(),
        })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Failed to mark message as read:");
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  },
);

// Reply to message
router.post(
  "/inbox/:id/reply",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;
      const content =
        typeof req.body?.content === "string" ? req.body.content.trim() : "";

      if (!content || content.length > 5000) {
        return res.status(400).json({
          error: "Reply content is required and must be 5000 characters or fewer",
          outcome: {
            status: "error",
            category: "inbox",
            title: "Reply Failed",
            message: "Enter a reply of 5000 characters or fewer.",
          },
        });
      }

      const [message] = await db
        .select()
        .from(socialInboxMessages)
        .where(
          and(
            eq(socialInboxMessages.id, id),
            inboxAccessCondition(userId),
          ),
        )
        .limit(1);

      if (!message) {
        return res.status(404).json({
          error: "Message not found",
          outcome: {
            status: "error",
            category: "inbox",
            title: "Message Not Found",
            message: "The message you are trying to reply to was not found.",
          },
        });
      }

      if (!["comment", "mention"].includes(message.messageType)) {
        return res.status(409).json({
          error: "Automatic delivery is available only for provider comments and mentions.",
          outcome: {
            status: "error",
            category: "inbox",
            title: "Reply Not Supported",
            message:
              "This item is not a provider comment or mention with a supported reply endpoint.",
          },
        });
      }
      if (!["twitter", "facebook", "instagram"].includes(message.platform)) {
        return res.status(409).json({
          error: `Provider reply delivery is not configured for ${message.platform}.`,
          outcome: {
            status: "error",
            category: "inbox",
            title: "Reply Not Supported",
            message: `Replies to ${message.platform} inbox items are not available.`,
          },
        });
      }
      if (
        message.platform === "twitter" &&
        Array.from(content).length > 280
      ) {
        return res.status(400).json({
          error: "X replies must be 280 characters or fewer.",
        });
      }

      const currentDeliveryState =
        message.replyDeliveryState ||
        (message.replyDelivered ? "delivered" : "draft");
      if (currentDeliveryState === "delivered" && message.providerReplyId) {
        if (message.replyContent !== content) {
          return res.status(409).json({
            error: "A provider-confirmed reply already exists for this message.",
            delivered: true,
            providerReplyId: message.providerReplyId,
          });
        }
        return res.json({
          success: true,
          delivered: true,
          duplicate: true,
          status: "delivered",
          providerReplyId: message.providerReplyId,
          replyContent: message.replyContent,
          outcome: {
            status: "success",
            category: "inbox",
            title: "Reply Already Delivered",
            message: "The provider receipt for this reply is already saved.",
            delivered: true,
          },
        });
      }
      if (["sending", "unknown"].includes(currentDeliveryState)) {
        return res.status(409).json({
          success: false,
          delivered: false,
          status: currentDeliveryState,
          error:
            "Reply delivery may already have reached the provider. Reconcile it before attempting another send.",
          outcome: {
            status: "warning",
            category: "inbox",
            title: "Reply Requires Reconciliation",
            message:
              "The provider may have accepted this reply. Do not send another copy until its delivery is reconciled.",
          },
        });
      }

      const [claimed] = await db
        .update(socialInboxMessages)
        .set({
          replyContent: content,
          replyDelivered: false,
          replyDeliveryState: "sending",
          providerReplyId: null,
          replyDeliveryError: null,
        })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            inboxAccessCondition(userId),
            eq(socialInboxMessages.replyDeliveryState, currentDeliveryState),
            eq(socialInboxMessages.replyDelivered, false),
          ),
        )
        .returning({ id: socialInboxMessages.id });
      if (!claimed) {
        return res.status(409).json({
          success: false,
          delivered: false,
          status: "sending",
          error:
            "Another reply attempt has already claimed this message. Reconcile its provider status before retrying.",
        });
      }

      let receipt;
      try {
        receipt = await deliverInboxReply(message, content);
      } catch (deliveryError) {
        const providerError =
          deliveryError instanceof SocialInboxProviderError
            ? deliveryError
            : new SocialInboxProviderError(
                "Provider reply delivery failed; reconcile before retrying.",
                undefined,
                "unknown",
              );
        await db
          .update(socialInboxMessages)
          .set({
            replyDeliveryState: providerError.outcome,
            replyDeliveryError: providerError.message,
            replyDelivered: false,
          })
          .where(
            and(
              eq(socialInboxMessages.id, id),
              eq(socialInboxMessages.userId, message.userId),
            ),
          );
        const uncertain = providerError.outcome === "unknown";
        return res.status(uncertain ? 202 : 422).json({
          success: false,
          delivered: false,
          status: providerError.outcome,
          replyContent: content,
          error: providerError.message,
          outcome: {
            status: uncertain ? "warning" : "error",
            category: "inbox",
            title: uncertain
              ? "Reply Requires Reconciliation"
              : "Reply Delivery Failed",
            message: uncertain
              ? "The provider's acceptance could not be confirmed. Do not retry until the delivery is reconciled."
              : providerError.message,
            delivered: false,
          },
        });
      }

      try {
        const [saved] = await db
          .update(socialInboxMessages)
          .set({
            replyContent: content,
            replyDelivered: true,
            replyDeliveryState: "delivered",
            providerReplyId: receipt.providerReplyId,
            replyDeliveryError: null,
            status: "replied",
            repliedAt: new Date(),
          })
          .where(
            and(
              eq(socialInboxMessages.id, id),
              eq(socialInboxMessages.userId, message.userId),
              eq(socialInboxMessages.replyDeliveryState, "sending"),
            ),
          )
          .returning({ id: socialInboxMessages.id });
        if (!saved) throw new Error("Reply row changed before receipt persistence");
      } catch (receiptError) {
        logger.warn(
          { err: receiptError, messageId: id, platform: message.platform },
          "[SocialInbox] Provider reply receipt could not be persisted",
        );
        return res.status(202).json({
          success: false,
          delivered: false,
          status: "unknown",
          providerReplyId: receipt.providerReplyId,
          error:
            "The provider returned a reply receipt, but it could not be saved. Reconcile before retrying.",
          outcome: {
            status: "warning",
            category: "inbox",
            title: "Reply Receipt Requires Reconciliation",
            message:
              "The provider confirmed a reply, but local receipt persistence failed. Do not retry this reply.",
            delivered: false,
          },
        });
      }

      await queryCache?.invalidate(
        createCacheKey("socialInbox", message.userId),
      );
      res.json({
        success: true,
        delivered: true,
        status: "delivered",
        providerReplyId: receipt.providerReplyId,
        providerUrl: receipt.providerUrl,
        replyContent: content,
        outcome: {
          status: "success",
          category: "inbox",
          title: "Reply Delivered",
          message: `The ${message.platform} provider returned a delivery receipt.`,
          platform: message.platform,
          author: message.authorHandle,
          delivered: true,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to reply to message:");
      res.status(500).json({
        error: "Failed to reply to message",
        outcome: {
          status: "error",
          category: "inbox",
          title: "Reply Failed",
          message: "Failed to process your reply. Check its delivery status before retrying.",
          retryable: true,
        },
      });
    }
  },
);

router.post(
  "/inbox/:id/assign",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;
      const assigneeId = req.body?.assigneeId;
      if (typeof assigneeId !== "string" || !assigneeId) {
        return res.status(400).json({ error: "A valid team member is required" });
      }

      const workspaceIds = await getActiveWorkspaceIds(userId);
      if (!workspaceIds.length) {
        return res.status(409).json({
          error: "Join an active workspace with team members before assigning inbox messages.",
        });
      }
      const [member] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            inArray(workspaceMembers.workspaceId, workspaceIds),
            eq(workspaceMembers.userId, assigneeId),
            eq(workspaceMembers.status, "active"),
          ),
        )
        .limit(1);
      if (!member) {
        return res.status(403).json({
          error: "The selected assignee is not an active member of your workspace.",
        });
      }

      const [updated] = await db
        .update(socialInboxMessages)
        .set({ assignedTo: member.id })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            inboxAccessCondition(userId),
          ),
        )
        .returning({ id: socialInboxMessages.id });
      if (!updated) return res.status(404).json({ error: "Message not found" });

      await queryCache?.invalidate(
        createCacheKey("socialInbox", req.user!.id),
      );
      const name =
        [member.firstName, member.lastName].filter(Boolean).join(" ") ||
        member.email;
      res.json({
        success: true,
        assignedTo: member.id,
        assigneeName: name,
        outcome: {
          status: "success",
          category: "inbox",
          title: "Message Assigned",
          message: `Message assigned to ${name}.`,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to assign inbox message:");
      res.status(500).json({ error: "Failed to assign inbox message" });
    }
  },
);

// Archive message
router.post(
  "/inbox/:id/archive",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      await db
        .update(socialInboxMessages)
        .set({ status: "archived" })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            inboxAccessCondition(userId),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Failed to archive message:");
      res.status(500).json({ error: "Failed to archive message" });
    }
  },
);

// Default canned replies seeded for a user the first time they open the
// reply-template picker with no saved templates of their own.
const DEFAULT_REPLY_TEMPLATES: Array<{
  name: string;
  content: string;
  category: string;
}> = [
  {
    name: "Thank you",
    content: "Thank you so much for the love — really appreciate you!",
    category: "general",
  },
  {
    name: "New release plug",
    content: "Glad you're vibing with it! New music dropping soon, stay tuned.",
    category: "promotional",
  },
  {
    name: "Support follow-up",
    content:
      "Sorry for the trouble — send us a DM with more details and we'll get it sorted.",
    category: "support",
  },
];

// Get reply templates - backed by durable per-user storage; seeds a set of
// default canned replies on first use so the picker is never empty for no
// good reason, but stays truthfully empty if the user deletes them all.
router.get(
  "/inbox/templates",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      let templates = await db
        .select()
        .from(socialReplyTemplates)
        .where(eq(socialReplyTemplates.userId, userId))
        .orderBy(desc(socialReplyTemplates.createdAt))
        .limit(100);

      if (templates.length === 0) {
        // Only seed defaults on a genuine first-ever use, tracked via a
        // per-user flag — otherwise a user who deletes every template would
        // see them reappear on the next page load.
        const [user] = await db
          .select({ preferences: users.preferences })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const prefs = (user?.preferences as Record<string, unknown>) || {};
        const alreadySeeded = prefs?.socialReplyTemplatesSeeded === true;

        if (!alreadySeeded) {
          const seeded = await db
            .insert(socialReplyTemplates)
            .values(
              DEFAULT_REPLY_TEMPLATES.map((t) => ({
                userId,
                name: t.name,
                content: t.content,
                category: t.category,
              })),
            )
            .returning();
          templates = seeded;

          await db
            .update(users)
            .set({ preferences: { ...prefs, socialReplyTemplatesSeeded: true } })
            .where(eq(users.id, userId));
        }
      }

      res.json({
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          content: t.content,
          category: t.category,
        })),
        total: templates.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get reply templates:");
      res.status(500).json({ error: "Failed to load reply templates" });
    }
  },
);

// Create a custom reply template
router.post(
  "/inbox/templates",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, content, category } = req.body || {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Template name is required" });
      }
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Template content is required" });
      }

      const [template] = await db
        .insert(socialReplyTemplates)
        .values({
          userId,
          name: name.trim().slice(0, 100),
          content: content.trim().slice(0, 2000),
          category:
            typeof category === "string" && category.trim()
              ? category.trim().slice(0, 50)
              : "general",
        })
        .returning();

      res.status(201).json({
        template: {
          id: template.id,
          name: template.name,
          content: template.content,
          category: template.category,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to create reply template:");
      res.status(500).json({ error: "Failed to create reply template" });
    }
  },
);

// Delete a custom reply template
router.delete(
  "/inbox/templates/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      await db
        .delete(socialReplyTemplates)
        .where(
          and(
            eq(socialReplyTemplates.id, id),
            eq(socialReplyTemplates.userId, userId),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Failed to delete reply template:");
      res.status(500).json({ error: "Failed to delete reply template" });
    }
  },
);

router.get(
  "/inbox/team",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceIds = await getActiveWorkspaceIds(req.user!.id);
      if (!workspaceIds.length) {
        return res.json({
          enabled: false,
          members: [],
          reason: "Join an active workspace to assign inbox messages to teammates.",
        });
      }
      const rows = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatar: users.profileImageUrl,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            inArray(workspaceMembers.workspaceId, workspaceIds),
            eq(workspaceMembers.status, "active"),
          ),
        )
        .limit(100);
      const members = [
        ...new Map(
          rows.map((member) => [
            member.id,
            {
              id: member.id,
              name:
                [member.firstName, member.lastName].filter(Boolean).join(" ") ||
                member.email,
              email: member.email,
              avatar: member.avatar || undefined,
            },
          ]),
        ).values(),
      ];
      res.json({
        enabled: members.length > 1,
        members,
        ...(members.length <= 1
          ? { reason: "Add another active workspace member to enable assignment." }
          : {}),
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to load inbox team members:");
      res.status(500).json({ error: "Failed to load inbox team members" });
    }
  },
);

// Connections endpoint - returns OAuth connections
router.get(
  "/connections",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const connections = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, userId))
        .limit(50);

      res.json(
        connections
          // NOTE: keep filtering to isActive only — the platform-connections.tsx
          // frontend derives its "connected" badge purely from whether a
          // platform appears in this list at all (`connections.some(...)`), not
          // from a status field, so an inactive entry must not be included.
          .filter((c) => c?.isActive)
          .map((c) => {
            const isTokenExpired = c.tokenExpiresAt
              ? new Date(c.tokenExpiresAt) < new Date()
              : false;
            const tokenExpiresIn = c.tokenExpiresAt
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date(c.tokenExpiresAt).getTime() - Date.now()) /
                      1000,
                  ),
                )
              : null;
            const status: "connected" | "expired" = isTokenExpired
              ? "expired"
              : "connected";

            return {
              platform: c.platform,
              username: c.username,
              connected: c.isActive,
              connectedAt: c.createdAt,
              followers: c.followerCount || 0,
              followerCount: c.followerCount || 0,
              profileUrl: c.profileUrl || "",
              platformUserId: c.platformUserId || "",
              metadata: c.metadata || {},
              status,
              tokenExpiresAt: c.tokenExpiresAt,
              tokenExpiresIn,
              requiresReauth: isTokenExpired,
              lastSync: c.createdAt,
            };
          }),
      );
    } catch (error) {
      logger.warn({ err: error }, "Failed to get connections:");
      res.status(500).json({ error: "Failed to get connections:" });
    }
  },
);

// ===========================
// UNIFIED CALENDAR ENDPOINTS
// ===========================

router.get(
  "/unified-calendar/posts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Scheduled social posts (includes autopilot-created posts with status 'pending')
      const scheduledPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            inArray(posts.status, [
              "scheduled",
              "pending",
              "published",
              "completed",
              "posting",
              "failed",
            ]),
          ),
        )
        .orderBy(desc(posts.scheduledAt))
        .limit(200);

      // Content calendar entries
      const calendarEntries = await db
        .select()
        .from(contentCalendar)
        .where(eq(contentCalendar.userId, userId))
        .orderBy(desc(contentCalendar.scheduledAt))
        .limit(200);

      const calendarPostIds = new Set(calendarEntries?.map((c) => c?.id));

      // Merge and normalise both sources
      const allPosts = [
        ...scheduledPosts
          .filter((p) => !calendarPostIds?.has(p?.id))
          .map((p) => {
            const eng = (p?.engagement as Record<string, unknown>) || {};
            const meta = (eng?._autopilotMeta ? eng : {}) as Record<string, any>;
            let parsedContent: Record<string, unknown> = {};
            try {
              const rawContent =
                typeof p?.content === "string"
                  ? JSON.parse(p.content)
                  : p?.content;
              if (rawContent && typeof rawContent === "object") {
                parsedContent = rawContent as Record<string, unknown>;
              }
            } catch {
              parsedContent = {};
            }
            const contentObj = meta?.content || parsedContent || {};
            const titleText =
              (contentObj as any)?.text ||
              (contentObj as any)?.caption ||
              (typeof p?.content === "string" ? p.content.slice(0, 80) : "") ||
              "(no caption)";
            const resolvedStatus =
              p?.status === "pending" || p?.status === "scheduled"
                ? "scheduled"
                : p?.status === "completed"
                  ? "published"
                  : p?.status === "posting"
                    ? "publishing"
                    : (p?.status ?? "scheduled");
            const createdBy = meta.createdBy || "manual";
            return {
              id: p.id,
              title: String(titleText).slice(0, 80),
              platform: meta.platforms?.[0] || p?.platform,
              platforms: meta.platforms || [p?.platform].filter(Boolean),
              status: resolvedStatus,
              scheduledAt: p.scheduledAt,
              publishedAt: p.publishedAt,
              content: contentObj,
              mediaUrls:
                p.mediaUrls?.length
                  ? p.mediaUrls
                  : (contentObj as any)?.mediaUrls ||
                    ((contentObj as any)?.mediaUrl ? [(contentObj as any).mediaUrl] : []),
              source: createdBy === "manual" ? "social" as const : "autopilot" as const,
              createdBy,
            };
          }),
        ...(calendarEntries?.map((c) => ({
          id: c.id,
          title: c.title,
          platform: c.platform,
          status: c.status,
          scheduledAt: c.scheduledAt,
          publishedAt: c.publishedAt,
          content:
            ((c?.content as Record<string, unknown>)?.body as string) ?? null,
          mediaUrls: c.mediaUrls ?? [],
          source: "calendar" as const,
        })) ?? []),
      ];

      return res.json({ posts: allPosts, total: allPosts.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get unified calendar posts:");
      return res.status(500).json({ error: "Failed to load calendar posts" });
    }
  },
);

router.get(
  "/unified-calendar/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const userCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.userId, userId))
        .orderBy(desc(campaigns.createdAt))
        .limit(100);

      return res.json({
        campaigns: userCampaigns,
        total: userCampaigns.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get unified calendar campaigns:");
      return res
        .status(500)
        .json({ error: "Failed to load calendar campaigns" });
    }
  },
);

// Static music-industry calendar dates — updated for the current year.
// These mark high-impact windows when artists should schedule releases/campaigns.
const MUSIC_INDUSTRY_HOLIDAYS = (() => {
  const y = new Date().getFullYear();
  return [
    {
      id: "new-release-friday",
      name: "New Release Friday",
      date: "every-friday",
      type: "recurring",
      description:
        "Global release day — highest streaming activity of the week.",
    },
    {
      id: "grammys",
      name: "Grammy Awards",
      date: `${y}-02-04`,
      type: "awards",
      description: "Release or promote during awards season for maximum press.",
    },
    {
      id: "valentines",
      name: "Valentine's Day",
      date: `${y}-02-14`,
      type: "seasonal",
      description: "Strong window for love-themed content and playlists.",
    },
    {
      id: "international-music",
      name: "International Music Day",
      date: `${y}-06-21`,
      type: "cultural",
      description: "Global music celebration — ideal for awareness campaigns.",
    },
    {
      id: "hip-hop-day",
      name: "Hip-Hop Appreciation Week",
      date: `${y}-11-12`,
      type: "cultural",
      description: "Celebrate and amplify hip-hop culture.",
    },
    {
      id: "black-friday",
      name: "Black Friday",
      date: `${y}-11-28`,
      type: "commerce",
      description:
        "Top window for merch drops, beat bundles, and license deals.",
    },
    {
      id: "cyber-monday",
      name: "Cyber Monday",
      date: `${y}-12-01`,
      type: "commerce",
      description:
        "Second peak shopping day — great for digital product offers.",
    },
    {
      id: "year-end",
      name: "Year-End Wrap",
      date: `${y}-12-20`,
      type: "seasonal",
      description:
        "Spotify / Apple Music wrap-up coverage starts — push streaming.",
    },
    {
      id: "new-year-drop",
      name: "New Year's Drop",
      date: `${y + 1}-01-01`,
      type: "seasonal",
      description:
        "High-impact date for resolutions content and fresh releases.",
    },
  ];
})();

router.get(
  "/unified-calendar/holidays",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      return res.json({
        holidays: MUSIC_INDUSTRY_HOLIDAYS,
        total: MUSIC_INDUSTRY_HOLIDAYS.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get unified calendar holidays:");
      return res.json({ holidays: [], total: 0 });
    }
  },
);

router.get(
  "/unified-calendar/queue",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Posts that are scheduled but not yet published (the publishing queue)
      const queuedPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            inArray(posts.status, ["queued", "pending", "scheduled"]),
            isNull(posts.publishedAt),
          ),
        )
        .orderBy(posts.scheduledAt)
        .limit(100);

      return res.json({ queue: queuedPosts, total: queuedPosts.length });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get unified calendar queue:");
      return res.status(500).json({ error: "Failed to load calendar queue" });
    }
  },
);

// =========================================
// AI CONTENT GENERATION
// =========================================

// Retained legacy response contract. Current clients use the direct-MaxCore
// contract below; keep the old shape available without shadowing that route.
router.post(
  "/generate-content-legacy",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }
      const {
        platform: singlePlatform,
        platforms: requestedPlatforms,
        contentType = "post",
        topic,
        tone = "energetic",
      } = req.body ?? {};

      const validPlatforms = [
        "instagram",
        "twitter",
        "facebook",
        "tiktok",
        "youtube",
        "linkedin",
        "threads",
        "googlebusiness",
      ];
      const validTones = ["professional", "casual", "energetic", "promotional"];
      const contentTypeMap: Record<string, string> = {
        post: "engagement",
        announcement: "announcement",
        "behind-the-scenes": "behind-the-scenes",
        promotional: "promotional",
        release: "release",
        story: "engagement",
        reel: "behind-the-scenes",
        carousel: "engagement",
        thread: "engagement",
        poll: "engagement",
        "live-announcement": "announcement",
        short: "behind-the-scenes",
        pin: "promotional",
        newsletter: "announcement",
        "collab-post": "engagement",
        remix: "engagement",
        duet: "engagement",
        challenge: "engagement",
        giveaway: "promotional",
        ama: "engagement",
        tutorial: "engagement",
        review: "engagement",
        testimonial: "promotional",
        milestone: "announcement",
        throwback: "engagement",
        teaser: "promotional",
        countdown: "announcement",
        "fan-spotlight": "engagement",
        meme: "engagement",
        infographic: "engagement",
        quote: "engagement",
      };

      let platforms: unknown[];
      if (requestedPlatforms !== undefined) {
        if (!Array.isArray(requestedPlatforms)) {
          return res.status(400).json({
            success: false,
            message: "platforms must be an array of supported platforms",
          });
        }
        platforms = requestedPlatforms;
      } else if (singlePlatform !== undefined) {
        platforms = [singlePlatform];
      } else {
        return res.status(400).json({
          success: false,
          message: "At least one target platform is required",
        });
      }

      if (
        platforms.length < 1 ||
        platforms.length > 8 ||
        platforms.some(
          (platform) =>
            typeof platform !== "string" ||
            !validPlatforms.includes(platform),
        ) ||
        new Set(platforms).size !== platforms.length
      ) {
        return res.status(400).json({
          success: false,
          message: "Each target platform must be supported and unique",
        });
      }

      if (typeof topic !== "string" || !topic.trim() || topic.length > 4000) {
        return res.status(400).json({
          success: false,
          message: "A non-empty topic of at most 4000 characters is required",
        });
      }
      if (typeof tone !== "string" || !validTones.includes(tone)) {
        return res.status(400).json({
          success: false,
          message: "A supported content tone is required",
        });
      }
      if (
        typeof contentType !== "string" ||
        !Object.prototype.hasOwnProperty.call(contentTypeMap, contentType)
      ) {
        return res.status(400).json({
          success: false,
          message: "A supported content type is required",
        });
      }

      const normalizedTopic = topic.trim();
      const targetPlatforms = platforms as string[];
      const generatedContent: Record<string, unknown>[] = [];
      const failedPlatforms: { platform: string; error: string }[] = [];

      // MaxCore AI is the only source — all platforms in parallel
      const mcResults = await Promise.allSettled(
        targetPlatforms.map(async (platform) => {
          const ai = await getUnifiedAI();
          const result = await ai?.generateContent({
            tone: tone as import("../../shared/ml/nlp/ContentGenerator.js").ContentTone,
            platform: platform as import("../../shared/ml/nlp/ContentGenerator.js").Platform,
            topic: normalizedTopic,
            contentType: contentTypeMap[contentType] as import("../../shared/ml/nlp/ContentGenerator.js").GenerationOptions["contentType"],
            userId,
            includeHashtags: true,
            includeEmojis: true,
          });
          return { platform, result };
        }),
      );

      for (const settled of mcResults) {
        if (settled?.status !== "fulfilled") {
          failedPlatforms?.push({
            platform: "unknown",
            error: "Generation failed",
          });
          continue;
        }
        const { platform, result } = settled?.value ?? {};
        const caption =
          typeof result?.data?.caption === "string"
            ? result.data.caption.trim()
            : "";
        if (result?.success && caption) {
          generatedContent?.push({
            platform,
            caption,
            content: caption,
            hashtags: result.data.hashtags,
            hook: result.data.hook,
            body: result.data.body,
            cta: result.data.cta,
            emojis: result.data.emojis,
            characterCount: result.data.charCount,
            estimatedEngagement: result.data.estimatedEngagement,
            optimalPostTime: getOptimalPostTime(platform),
            source: "MaxCoreAI",
          });
        } else {
          failedPlatforms?.push({ platform, error: "Generation failed" });
        }
      }

      const hasHashtags = generatedContent?.some(
        (c) => c?.hashtags && c?.hashtags?.length > 0,
      );
      const optimalTime = generatedContent[0]?.optimalPostTime || null;
      const completeSuccess =
        generatedContent.length === targetPlatforms.length &&
        failedPlatforms.length === 0;

      // MaxCore-only fail-explicit contract: if every platform failed,
      // surface 503 instead of a 200 with success:false.
      if (generatedContent.length === 0) {
        return res.status(503).json({
          success: false,
          error: "AI_UNAVAILABLE",
          message:
            "Content generation is temporarily unavailable (MaxCore did not return content). Please try again shortly.",
          failedPlatforms,
        });
      }

      res.json({
        success: completeSuccess,
        generatedContent,
        platforms,
        contentType,
        failedPlatforms,
        outcome: {
          status:
            completeSuccess
              ? "success"
              : generatedContent.length > 0
                ? "partial"
                : "error",
          category: "content",
          title:
            completeSuccess
              ? "Content Generated"
              : generatedContent.length > 0
                ? "Partial Content Generation"
                : "Generation Failed",
          message:
            completeSuccess
              ? `Generated ${generatedContent.length} content variation${generatedContent.length > 1 ? "s" : ""}.${hasHashtags ? " Hashtag suggestions included." : ""}${optimalTime ? ` Best posting time: ${optimalTime}.` : ""}`
              : generatedContent.length > 0
                ? `Generated ${generatedContent.length} of ${targetPlatforms.length} requested variations; some platforms failed.`
              : "Failed to generate content. Please try again.",
          variationsCount: generatedContent.length,
          hasHashtags,
          optimalTime,
          fallbackAvailable: failedPlatforms.length > 0,
        },
      });

      if (generatedContent?.length > 0 && req.user?.id) {
        setImmediate(async () => {
          try {
            const firstPiece = generatedContent[0];
            const platformLabel =
              firstPiece?.platform?.charAt(0).toUpperCase() +
              firstPiece?.platform?.slice(1);
            const snippet = (
              firstPiece?.caption ||
              firstPiece?.content ||
              ""
            ).slice(0, 100);
            await notificationService?.sendSocialContentGeneratedNotification(
              req.user!.id,
              platformLabel,
              snippet,
            );
          } catch (err) {
            logger.warn(
              { err: err },
              "[SocialMedia] content generated notification error:",
            );
          }
        });
      }
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "Social content generation is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate social content",
      );
      res.status(500).json({
        success: false,
        message: "Failed to generate content",
        outcome: {
          status: "error",
          category: "content",
          title: "Generation Failed",
          message:
            "AI content generation service is temporarily unavailable. Please try again or use a template.",
          retryable: true,
        },
      });
    }
  },
);

function getOptimalPostTime(platform: string): string {
  const optimalTimes: Record<string, string> = {
    instagram: "Today at 11:00 AM",
    twitter: "Today at 9:00 AM",
    facebook: "Today at 1:00 PM",
    linkedin: "Today at 8:00 AM",
    tiktok: "Today at 7:00 PM",
    youtube: "Today at 3:00 PM",
  };
  return optimalTimes[platform] || "Today at 12:00 PM";
}

/**
 * Validate that a user-supplied URL is safe to fetch from the server.
 * Blocks loopback, private, link-local, and cloud-metadata addresses to
 * prevent Server-Side Request Forgery (SSRF) attacks.
 */
function assertSafeExternalUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed?.protocol)) {
    throw Object.assign(new Error("Only http/https URLs are permitted"), {
      status: 400,
    });
  }
  const h = parsed?.hostname?.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  const blocked = [
    /^localhost$/i,
    /^127\./, // 127.0.0.0/8  loopback
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fc00:/i,
    /^fd/i, // IPv6 unique-local
    /^fe80:/i, // IPv6 link-local
    /^10\./, // 10.0.0.0/8   private
    /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 private
    /^192\.168\./, // 192.168.0.0/16 private
    /^169\.254\./, // 169.254.0.0/16 link-local + AWS/GCP metadata
    /^100\.64\./, // 100.64.0.0/10 CGNAT
    /^198\.51\.100\./, // TEST-NET-2
    /^203\.0\.113\./, // TEST-NET-3
    /metadata\.google\.internal$/i,
    /\.internal$/i,
    /\.local$/i,
  ];
  if (blocked?.some((re) => re?.test(h))) {
    throw Object.assign(
      new Error("URL resolves to a restricted network range"),
      { status: 400 },
    );
  }
}

const socialUrlGenerationSchema = z.object({
  url: z.string().trim().min(1, "URL is required").max(2048),
  platforms: z.array(z.string().min(1).max(50)).min(1).max(8),
  tone: z
    .enum([
      "professional",
      "casual",
      "energetic",
      "promotional",
      "funny",
      "inspirational",
    ])
    .default("energetic"),
  format: z.enum(["text", "image", "audio", "video"]).default("text"),
  targetAudience: z.string().trim().max(500).optional().default(""),
  hashtagStrategy: z
    .enum(["balanced", "niche", "trending", "branded"])
    .optional(),
  captionLength: z.enum(["short", "optimal", "long"]).optional(),
  callToActionStrength: z.enum(["low", "medium", "high"]).optional(),
  intent: z.unknown().optional(),
  direction: z.unknown().optional(),
  context: z.unknown().optional(),
  awareness: z.unknown().optional(),
});

const manualSocialGenerationSchema = z.object({
  platforms: z.array(z.string().trim().min(1).max(50)).min(1).max(8),
  topic: z.string().trim().min(1).max(1000),
  tone: z
    .enum([
      "professional",
      "casual",
      "energetic",
      "promotional",
      "funny",
      "inspirational",
    ])
    .default("professional"),
  targetAudience: z.string().trim().max(500).optional(),
  hashtagStrategy: z
    .enum(["balanced", "niche", "trending", "branded"])
    .optional(),
  captionLength: z.enum(["short", "optimal", "long"]).optional(),
  callToActionStrength: z.enum(["low", "medium", "high"]).optional(),
  intent: z.unknown().optional(),
  direction: z.unknown().optional(),
  context: z.unknown().optional(),
  awareness: z.unknown().optional(),
});

const MANUAL_SOCIAL_PLATFORMS = new Set([
  "instagram",
  "twitter",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "threads",
  "googlebusiness",
  "google_business",
]);

function maxCoreSocialPlatform(platform: string): string {
  if (platform === "threads") return "instagram";
  if (platform === "googlebusiness" || platform === "google_business") {
    return "facebook";
  }
  return platform;
}

router.post(
  "/generate-content",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = manualSocialGenerationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid social content generation request",
        details: parsed.error.issues,
      });
    }
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const requestedPlatforms = [
      ...new Set(parsed.data.platforms.map((platform) => platform.toLowerCase())),
    ];
    const invalidPlatforms = requestedPlatforms.filter(
      (platform) => !MANUAL_SOCIAL_PLATFORMS.has(platform),
    );
    if (invalidPlatforms.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Unsupported social platform(s): ${invalidPlatforms.join(", ")}`,
      });
    }

    try {
      const results = await Promise.allSettled(
        requestedPlatforms.map(async (platform, index) => {
          const result = await generateSocialDirect({
            userId,
            platform: maxCoreSocialPlatform(platform),
            topic: parsed.data.topic,
            tone: parsed.data.tone,
            targetAudience: parsed.data.targetAudience,
            hashtagStrategy: parsed.data.hashtagStrategy,
            captionLength: parsed.data.captionLength,
            callToActionStrength: parsed.data.callToActionStrength,
            includeHashtags: true,
            numVariants: 1,
            intent: parsed.data.intent,
            direction: parsed.data.direction,
            context: parsed.data.context,
            awareness: parsed.data.awareness,
          });
          const variant = result.variants[0];
          const caption =
            variant.caption ||
            [variant.hook, variant.body, variant.cta]
              .filter(Boolean)
              .join("\n\n");
          if (!caption.trim()) {
            throw new AIUnavailableError("MaxCore returned empty social copy");
          }
          return {
            id: `manual-social-${index + 1}`,
            modality: "text",
            platform,
            payload: caption,
            metadata: {
              hook: variant.hook,
              body: variant.body,
              cta: variant.cta,
              hashtags: variant.hashtags,
              source: "MaxCoreAI",
              topic: parsed.data.topic,
              targetAudience: parsed.data.targetAudience,
            },
          };
        }),
      );
      const assets: Array<Record<string, any>> = [];
      const failedPlatforms: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          assets.push(result.value);
          return;
        }
        const platform = requestedPlatforms[index];
        failedPlatforms.push(platform);
        logger.warn(
          {
            platform,
            errorType:
              result.reason instanceof Error
                ? result.reason.name
                : typeof result.reason,
          },
          "[ManualSocial] platform generation failed",
        );
      });

      if (assets.length === 0) {
        return res.status(503).json({
          success: false,
          code: "AI_UNAVAILABLE",
          error: "MaxCore social content generation is temporarily unavailable",
          failedPlatforms,
        });
      }

      const generatedContent = assets.map((asset) => ({
        platform: asset.platform,
        caption: asset.payload,
        content: asset.payload,
        ...asset.metadata,
        source: "MaxCoreAI",
      }));
      return res.json({
        success: failedPlatforms.length === 0,
        assets,
        generatedContent,
        failedPlatforms,
        platforms: requestedPlatforms,
        source: "MaxCoreAI",
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          error: "MaxCore social content generation is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate manual social content",
      );
      return res
        .status(500)
        .json({ success: false, error: "Social content generation failed" });
    }
  },
);

// Helper function to fetch and extract metadata from any URL

// Generate content from any URL (websites, music, videos, articles, products, etc.)
router.post(
  "/generate-from-url",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsedRequest = socialUrlGenerationSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        return res.status(400).json({
          error: "Invalid social URL generation request",
          details: parsedRequest.error.issues,
        });
      }
      const {
        url,
        platforms,
        tone,
        format,
        targetAudience,
        hashtagStrategy,
        captionLength,
        callToActionStrength,
        intent,
        direction,
        context,
        awareness,
      } = parsedRequest.data;

      const normalizedUrl = url.trim();
      const firstPartySource = resolveFirstPartySocialSource(normalizedUrl);

      // The plan-page draft path must stay ephemeral. Non-text formats enter
      // the multimodal worker, which durably stores generated media assets.
      if (firstPartySource && format !== "text") {
        return res.status(422).json({
          error:
            "This first-party source supports text drafts only; media generation stores generated assets.",
        });
      }

      // The narrowly-resolved first-party route uses internal checkout data and
      // never fetches the submitted URL. Every other URL keeps the existing
      // SSRF guard and safe parser path.
      if (!firstPartySource) {
        try {
          assertSafeExternalUrl(normalizedUrl);
        } catch (ssrfErr) {
          return res
            .status(400)
            .json({ error: (ssrfErr as Error).message || "Invalid URL" });
        }
      }

      type SocialUrlSeed = Pick<
        ReturnType<typeof urlToContentSeed>,
        | "genre"
        | "artist"
        | "track"
        | "content_type"
        | "platform_category"
        | "og_image"
        | "thumbnail_url"
      >;
      let seed: SocialUrlSeed;
      let sourceTitle: string;
      let sourceDescription: string;
      let sourcePlatform: string;

      if (firstPartySource) {
        seed = {
          genre: "default",
          artist: "",
          track: "",
          content_type: firstPartySource.contentType,
          platform_category: "web",
          og_image: "",
          thumbnail_url: "",
        };
        sourceTitle = firstPartySource.title;
        sourceDescription = firstPartySource.description;
        sourcePlatform = "web";
      } else {
        // Content must be based on a successfully retrieved and analyzed
        // external source. Structure-only metadata is not sufficient.
        try {
          const analysis = await analyzeUrl(normalizedUrl);
          seed = urlToContentSeed(analysis);
          sourceTitle = analysis.title;
          sourceDescription = analysis.description;
          sourcePlatform = analysis.platform;
        } catch (analyzeErr) {
          logger.warn(
            "[generate-from-url] URL analysis failed:",
            (analyzeErr as any)?.message,
          );
          return res.status(422).json({
            error: "Unable to retrieve analyzable content from this URL",
          });
        }
      }

      // Derive the content_type for better CTA selection
      const contentType =
        seed?.content_type || seed?.platform_category || "general";

      const validPlatforms = [
        "instagram",
        "twitter",
        "facebook",
        "tiktok",
        "youtube",
        "linkedin",
        "threads",
        "googlebusiness",
      ];
      const requestedPlatforms = [
        ...new Set(
          platforms
            .filter((platform: unknown): platform is string => typeof platform === "string")
            .map((platform: string) => platform.toLowerCase()),
        ),
      ].filter((platform) => validPlatforms.includes(platform));
      if (requestedPlatforms.length === 0) {
        return res.status(400).json({
          error: `At least one supported platform is required: ${validPlatforms.join(", ")}`,
        });
      }
      const generatedContent: Record<string, unknown>[] = [];

      // External URLs remain the topic for MaxCore's guarded resolver. The
      // narrowly-resolved first-party page instead uses its non-URL topic and
      // server-verified context, without fetching the submitted URL.
      const platformResults = await Promise.allSettled(
        requestedPlatforms
          .map(async (platform: string) => {
            const result = await generateSocialUrlWithMaxCore({
              url: normalizedUrl,
              topic: firstPartySource?.topic,
              extraContext: firstPartySource?.extraContext,
              platform,
              userId: req.user!.id,
              tone,
              format,
              targetAudience: targetAudience || undefined,
              hashtagStrategy,
              captionLength,
              callToActionStrength,
              genre: seed.genre || undefined,
              contentType,
              intent,
              direction,
              context,
              awareness,
            });
            return { platform, result };
          }),
      );

      for (const settled of platformResults) {
        if (settled?.status !== "fulfilled") continue;
        const { platform, result } = settled?.value ?? {};
        if (!result) continue;

        const captionText = result.caption.includes(url)
          ? result.caption
          : `${result.caption}\n\n🔗 ${url}`;
        const derivedHook = result.hook;
        const derivedBody = result.body;
        const derivedCta = result.cta;
        // Video overlays need short, punchy text (no hashtags, no URLs)
        const stripMeta = (s: string) =>
          s
            .replace(/#\w+/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/🔗.*$/g, "")
            .trim();
        const videoHook = stripMeta(derivedHook).slice(0, 80);
        const videoBody = stripMeta(derivedBody).slice(0, 100);
        const videoCta = stripMeta(derivedCta).slice(0, 50);
        generatedContent?.push({
          platform,
          caption: captionText,
          content: captionText,
          hashtags: result.hashtags,
          hook: derivedHook,
          body: derivedBody,
          cta: derivedCta,
          video_hook: videoHook,
          video_body: videoBody,
          video_cta: videoCta,
          artist_name: seed.artist || "",
          genre:
            seed.genre && seed.genre !== "default" ? seed.genre : "",
          thumbnail_url: seed.og_image || seed?.thumbnail_url || "",
          sourceUrl: normalizedUrl,
          extractedTitle: sourceTitle,
          contentType,
          format,
          targetAudience: targetAudience || undefined,
          source: "MaxCoreAI",
          sourceProvenance:
            firstPartySource?.provenance ?? "maxcore_fetched_url",
        });
      }

      if (generatedContent?.length === 0) {
        logger.warn(
          `[generate-from-url] MaxCore returned no usable social variants for ${requestedPlatforms.length} platform(s)`,
        );
        return res.status(503).json({
          success: false,
          code: "AI_UNAVAILABLE",
          error: "MaxCore did not return usable social content",
        });
      }

      const generatedPlatforms = new Set(
        generatedContent.map((item) => String(item.platform)),
      );
      const failedPlatforms = requestedPlatforms.filter(
        (platform) => !generatedPlatforms.has(platform),
      );

      res.json({
        success: true,
        generatedContent,
        failedPlatforms,
        url: normalizedUrl,
        platforms: requestedPlatforms,
        metadata: {
          title: sourceTitle,
          description: sourceDescription?.substring(0, 200),
          type: contentType,
          artist: seed.artist || "",
          track: seed.track || "",
          genre: seed.genre || "",
          thumbnail: seed.og_image || seed?.thumbnail_url || "",
          platform: sourcePlatform,
          sourceProvenance:
            firstPartySource?.provenance ?? "maxcore_fetched_url",
        },
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "URL-based content generation is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate content from URL",
      );
      res.status(500).json({ error: "Failed to generate content from URL" });
    }
  },
);

// GET /api/social/scheduled - Get scheduled posts
router.get(
  "/scheduled",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const scheduledPosts = (await storage.getScheduledPosts?.(userId)) || [];
      res.json(scheduledPosts);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get scheduled posts:");
      res.status(500).json({ error: "Failed to get scheduled posts:" });
    }
  },
);

// GET /api/social/analytics - Get social analytics
router.get(
  "/analytics",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { platform, period = "30d" } = req.query;

      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [accounts, periodPosts, autopilotContent, artistProfile] =
        await Promise.all([
          db
            .select()
            .from(socialAccounts)
            .where(eq(socialAccounts.userId, userId)),
          db
            .select()
            .from(posts)
            .where(
              and(eq(posts.userId, userId), gte(posts.createdAt, periodStart)),
            ),
          db
            .select()
            .from(socialAutopilotContent)
            .where(
              and(
                eq(socialAutopilotContent.userId, userId),
                gte(socialAutopilotContent.createdAt, periodStart),
              ),
            ),
          db
            .select()
            .from(artistProfiles)
            .where(eq(artistProfiles.userId, userId))
            .limit(1),
        ]);

      // Kick off background follower-count sync for stale accounts
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const now = Date.now();
      const stalePlatforms = new Set<string>();
      for (const acc of accounts) {
        if (!acc?.isActive) continue;
        const lastSynced = (acc?.metadata as Record<string, unknown>)
          ?.lastSyncedAt
          ? new Date(
              (acc?.metadata as Record<string, unknown>).lastSyncedAt as string,
            ).getTime()
          : acc?.createdAt
            ? new Date(acc?.createdAt).getTime()
            : 0;
        if (now - lastSynced > ONE_HOUR_MS) {
          stalePlatforms?.add(
            acc?.platform === "facebook" || acc?.platform === "instagram"
              ? "meta"
              : acc?.platform,
          );
        }
      }
      for (const p of stalePlatforms) {
        syncPlatformData(userId, p).catch((err) =>
          logger.warn({ err: err }, `[Analytics] BG sync failed for ${p}:`),
        );
      }

      // Aggregate engagement from posts
      let totalLikes = 0,
        totalComments = 0,
        totalShares = 0,
        totalViews = 0;
      let totalReach = 0,
        totalImpressions = 0;

      const platformEngagement: Record<
        string,
        {
          likes: number;
          comments: number;
          shares: number;
          views: number;
          posts: number;
        }
      > = {};

      for (const post of periodPosts) {
        const eng = post?.engagement as Record<string, unknown>;
        if (eng) {
          const pl = (post?.platform || "unknown").toLowerCase();
          if (!platformEngagement[pl])
            platformEngagement[pl] = {
              likes: 0,
              comments: 0,
              shares: 0,
              views: 0,
              posts: 0,
            };
          platformEngagement[pl].likes += Number(eng?.likes) || 0;
          platformEngagement[pl].comments += Number(eng?.comments) || 0;
          platformEngagement[pl].shares += Number(eng?.shares) || Number(eng?.retweets) || 0;
          platformEngagement[pl].views += Number(eng?.views) || 0;
          platformEngagement[pl].posts += 1;
          totalLikes += Number(eng?.likes) || 0;
          totalComments += Number(eng?.comments) || 0;
          totalShares += Number(eng?.shares) || Number(eng?.retweets) || 0;
          totalViews += Number(eng?.views) || 0;
          totalReach += Number(eng?.reach) || 0;
          totalImpressions += Number(eng?.impressions) || 0;
        }
      }

      for (const content of autopilotContent) {
        const perf = content?.performance as Record<string, unknown>;
        if (perf) {
          const pl = (content?.platform || "unknown").toLowerCase();
          if (!platformEngagement[pl])
            platformEngagement[pl] = {
              likes: 0,
              comments: 0,
              shares: 0,
              views: 0,
              posts: 0,
            };
          platformEngagement[pl].likes += Number(perf?.likes) || 0;
          platformEngagement[pl].comments += Number(perf?.comments) || 0;
          platformEngagement[pl].shares += Number(perf?.shares) || 0;
          platformEngagement[pl].views += Number(perf?.views) || 0;
          platformEngagement[pl].posts += 1;
          totalLikes += Number(perf?.likes) || 0;
          totalComments += Number(perf?.comments) || 0;
          totalShares += Number(perf?.shares) || 0;
          totalViews += Number(perf?.views) || 0;
        }
      }

      const totalEngagement = totalLikes + totalComments + totalShares;
      const totalFollowers = accounts?.reduce(
        (sum, acc) => sum + (acc?.followerCount || 0),
        0,
      );
      const engagementRate =
        totalViews > 0
          ? Math.round((totalEngagement / (totalViews || 1)) * 10000) / 100
          : 0;

      // Platform breakdown enriched with follower counts from connected accounts
      const platformBreakdown = accounts
        .filter((acc) => acc?.isActive)
        .map((acc) => {
          const pl = acc?.platform?.toLowerCase();
          const eng = platformEngagement[pl] || {
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            posts: 0,
          };
          return {
            platform: acc.platform,
            username: acc.username || "",
            followers: acc.followerCount || 0,
            posts: eng.posts,
            likes: eng.likes,
            comments: eng.comments,
            shares: eng.shares,
            views: eng.views,
            engagement: eng.likes + eng?.comments + eng?.shares,
            profileUrl: acc.profileUrl || "",
          };
        });

      // Daily metrics for the period
      const dailyMap: Record<
        string,
        { date: string; posts: number; engagement: number; views: number }
      > = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        dailyMap[d] = { date: d, posts: 0, engagement: 0, views: 0 };
      }
      for (const post of periodPosts) {
        const d = new Date(post?.createdAt).toISOString().split("T")[0];
        if (dailyMap[d]) {
          dailyMap[d].posts += 1;
          const eng = post?.engagement as Record<string, unknown>;
          if (eng) {
            dailyMap[d].engagement +=
              (Number(eng?.likes) || 0) + (Number(eng?.comments) || 0) + (Number(eng?.shares) || 0);
            dailyMap[d].views += Number(eng?.views) || 0;
          }
        }
      }
      for (const content of autopilotContent) {
        const d = new Date(content?.createdAt).toISOString().split("T")[0];
        if (dailyMap[d]) {
          dailyMap[d].posts += 1;
          const perf = content?.performance as Record<string, unknown>;
          if (perf) {
            dailyMap[d].engagement +=
              (Number(perf?.likes) || 0) + (Number(perf?.comments) || 0) + (Number(perf?.shares) || 0);
            dailyMap[d].views += Number(perf?.views) || 0;
          }
        }
      }

      // Top posts by engagement
      const allPostsForRanking = [
        ...(periodPosts?.map((p) => ({
          id: p.id,
          platform: p.platform,
          content: p.content?.substring(0, 120) || "",
          publishedAt: p.publishedAt || p?.createdAt,
          engagement: (() => {
            const e = p?.engagement as Record<string, unknown>;
            return e ? (Number(e?.likes) || 0) + (Number(e?.comments) || 0) + (Number(e?.shares) || 0) : 0;
          })(),
          views: Number((p?.engagement as Record<string, unknown>)?.views) || 0,
        })) ?? []),
      ]
        .sort((a, b) => b?.engagement - a?.engagement)
        .slice(0, 10);

      // Spotify artist data if connected
      let spotifyStats: Record<string, unknown> | null = null;
      const profile = artistProfile[0];
      if (profile?.spotifyArtistId) {
        try {
          const clientId = process.env.SPOTIFY_CLIENT_ID;
          const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
          if (clientId && clientSecret) {
            const tokenRes = await fetch(
              "https://accounts.spotify.com/api/token",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${Buffer?.from(`${clientId}:${clientSecret}`).toString("base64")}`,
                },
                body: "grant_type=client_credentials",
                signal: AbortSignal.timeout(6000),
              },
            );
            if (tokenRes?.ok) {
              const { access_token } = (await tokenRes?.json()) as {
                access_token: string;
              };
              const artistRes = await fetch(
                `https://api.spotify.com/v1/artists/${profile.spotifyArtistId}`,
                {
                  headers: { Authorization: `Bearer ${access_token}` },
                  signal: AbortSignal.timeout(6000),
                },
              );
              if (artistRes?.ok) {
                const artist = (await artistRes?.json()) as Record<
                  string,
                  unknown
                >;
                spotifyStats = {
                  followers: (artist.followers as any)?.total || 0,
                  popularity: artist.popularity || 0,
                  genres: artist.genres || [],
                  artistId: profile.spotifyArtistId,
                  artistName: artist.name,
                  imageUrl: (artist.images as any)?.[0]?.url || null,
                };
              }
            }
          }
        } catch (spotifyErr) {
          logger.warn(
            { err: spotifyErr },
            "[Analytics] Spotify artist stats fetch failed:",
          );
        }
      }

      res.json({
        period,
        platform: platform || "all",
        syncedAt: new Date().toISOString(),
        metrics: {
          totalFollowers,
          followersGrowth: 0,
          totalEngagement,
          engagementRate,
          totalReach: totalReach || totalViews,
          totalImpressions: totalImpressions || totalViews,
          postsPublished: periodPosts.length + autopilotContent?.length,
          totalLikes,
          totalComments,
          totalShares,
          totalViews,
        },
        platformBreakdown,
        dailyMetrics: Object.values(dailyMap),
        topPosts: allPostsForRanking,
        spotifyStats,
        connectedPlatforms: accounts.filter((a) => a?.isActive).length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get social analytics:");
      res.status(500).json({ error: "Failed to get analytics" });
    }
  },
);

router.post(
  "/generate-video",
  requireAuthOnly,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        hook: rawHook,
        body: rawBody,
        cta: rawCta,
        platform,
        aspect_ratio,
        template,
        duration,
        bg_color,
        
        accent_color,
        artist_name,
        topic,
        goal,
        tone,
        quality,
        genre,
        user_audio_path,
        voiceover,
      } = req.body ?? {};

      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      if (
        [rawHook, rawBody, rawCta, topic].some(
          (value) => value != null && typeof value !== "string",
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "topic, hook, body, and cta must be text",
        });
      }

      // ── Validate: at least one content source must be provided ───────────────
      const topicText = typeof topic === "string" ? topic.trim() : "";
      const hookText = typeof rawHook === "string" ? rawHook.trim() : "";
      const bodyText = typeof rawBody === "string" ? rawBody.trim() : "";
      const ctaText = typeof rawCta === "string" ? rawCta.trim() : "";
      if (!topicText && !hookText && !bodyText) {
        return res.status(400).json({
          success: false,
          message: "topic, hook, or body is required to generate a video",
        });
      }
      if (
        typeof platform !== "string" ||
        !VALID_PLATFORMS.some((candidate) => candidate === platform.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "A supported platform is required",
        });
      }
      if (/^https?:\/\//i.test(topicText)) {
        return res.status(400).json({
          success: false,
          message:
            "URL topics are not supported here; use the URL analysis workflow or provide a text topic",
        });
      }
      const resolvedTopic = topicText || hookText || bodyText;
      const selectedPlatform = platform.trim();

      // ── Always respond immediately — client polls via /video-job/:id ─────────
      // Holding the HTTP connection open during generation (2–5 min) triggers
      // proxy timeouts that the client misreads as auth failures. MaxCore
      // rendering runs in a background job and the polling endpoint serves the
      // validated result.
      const jobId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      pruneStaleFFmpegJobs();
      ffmpegJobs?.set(jobId, {
        status: "processing",
        userId,
        createdAt: Date.now(),
      });

      // ── Background job: MaxCore video render ──────────────────────────────────
      (async () => {
        try {
          // Hook/body/cta passed directly from the client are forwarded as
          // optional hints. No pre-generation happens here — the MaxCore
          // /api/generate-video job generates its own script, renders, and
          // serves the file itself (no local or intermediate AI calls).
          const hook = hookText;
          const body = bodyText;
          const cta = ctaText;

          // Shared render params for all video renderers.
          const videoParams = {
            topic: resolvedTopic,
            platform: selectedPlatform,
            template: template || undefined,
            aspect_ratio,
            duration: duration || 10,
            tone: tone || "energetic",
            goal: goal || "growth",
            artist_name,
            genre: genre || undefined,
            quality: quality || "cinematic",
            hook,
            body,
            cta,
            bg_color: bg_color || undefined,
            accent_color: accent_color || undefined,
            user_audio_path: user_audio_path || undefined,
            voiceover: !!voiceover,
            userId,
          };

          // Stages 2–4 — Advanced Video Renderer (MaxCore)
          logger.info(
            `[VideoGen] Routing job ${jobId} through Advanced Video Renderer`,
          );
          const result = await (
            await getRenderAdvancedVideo()
          )({
            ...videoParams,
            // Preserve an intentionally-absent template: the client omits it
            // to signal "use a photorealistic visual base", not "pick one
            // for me". Forcing a default here would silently defeat that.
            template: template || undefined,
          });

          if (result?.success) {
            ffmpegJobs?.set(jobId, {
              status: "done",
              userId,
              result: result as unknown as Record<string, unknown>,
              createdAt: Date.now(),
            });
            logger.info(`[VideoGen] Job ${jobId} completed`);
          } else {
            ffmpegJobs?.set(jobId, {
              status: "error",
              userId,
              error: "Video generation failed",
              createdAt: Date.now(),
            });
            logger.warn({ jobId }, "[VideoGen] Background render failed");
          }
        } catch (err) {
          ffmpegJobs?.set(jobId, {
            status: "error",
            userId,
            error: "Video generation failed",
            createdAt: Date.now(),
          });
          logger.warn(
            {
              jobId,
              errorType: err instanceof Error ? err.name : typeof err,
            },
            "[VideoGen] Background job failed",
          );
        }
      })();

      logger.info(`[VideoGen] Job ${jobId} queued — responding immediately`);
      return res.json({ success: true, job_id: jobId, status: "processing" });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to start video generation",
      );
      res
        .status(500)
        .json({ success: false, message: "Video generation failed" });
    }
  },
);

router.get(
  "/video-job/:jobId",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params as Record<string, string>;

      // Check the authenticated MaxCore render job map first.
      const ffmpegJob = ffmpegJobs?.get(jobId);
      if (ffmpegJob) {
        if (ffmpegJob.userId !== req.user?.id) {
          return res.status(404).json({
            success: false,
            status: "error",
            message: "Job not found. Please generate a new video.",
          });
        }
        if (ffmpegJob?.status === "processing") {
          return res.json({ status: "processing", progress: 50 });
        }
        if (ffmpegJob?.status === "done" && ffmpegJob?.result) {
          const r = ffmpegJob?.result;
          // If the renderer marked success but returned no URL, treat it as an
          // error so the client shows a clear retry prompt instead of silently
          // polling until the 3-minute timeout fires.
          const resolvedUrl = r.url || r.video_url || null;
          if (!resolvedUrl) {
            return res.status(500).json({
              status: "error",
              error: "Video was generated but no file URL was returned. Please try again.",
            });
          }
          return res.json({
            ...r,
            status: "completed",
            url: resolvedUrl,
            video_url: resolvedUrl,
            thumbnail_url: r.thumbnail_url ?? r?.thumbnailUrl ?? null,
            metadata: r.metadata ?? {},
          });
        }
        // error or unknown state — use `error` (the field the client reads),
        // keep `message` for any older consumers.
        const jobErr = "Video generation failed";
        return res.status(500).json({
          status: "error",
          error: jobErr,
          message: jobErr,
        });
      }

      // video_* jobs are MaxCore-backed. If they are absent, the server restarted
      // and the in-memory job is gone; return a clear retryable failure.
      if (jobId.startsWith("video_")) {
        return res.status(410).json({
          status: "error",
          error:
            "Server was restarted while your video was rendering. Please generate again.",
        });
      }

      // Unknown job ID format — all video jobs are FFmpeg-backed ("video_*")
      // so anything else is either a typo or a stale reference from before a restart.
      return res.status(404).json({
        success: false,
        status: "error",
        message: "Job not found. Please generate a new video.",
      });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to poll video job",
      );
      res
        .status(500)
        .json({
          success: false,
          status: "error",
          message: "Job status check failed",
        });
    }
  },
);

/**
 * GET /video-proxy/:filename
 * Server-side proxy that streams a MaxCore-rendered video to the browser.
 * The browser never touches MaxCore directly — our server adds the auth headers.
 * Falls back through multiple URL path variants that MaxCore might use.
 */
router.get(
  "/video-proxy/:filename",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const { filename } = req.params as Record<string, string>;
    if (!filename || !filename.match(/^[\w\-]+\.mp4$/i)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const MC_AI_URL = getMaxcoreOrigin();
    const MC_AI_KEY = getMaxcoreGenerationKey();

    // 1. Check the PDIM cache first — if a validated video was cached from an
    //    earlier proxy fetch, serve it directly. Every entry ever written here
    //    already passed the >10 KB + magic-byte check below, so a bad/small
    //    entry should never exist; the size guard is defense in depth only.
    const videoCachePocket = await pocketManager.openPocket("video-proxy-cache");
    try {
      if (videoCachePocket.exists(filename)) {
        const cached = await videoCachePocket.read(filename);
        if (cached?.length > 10_240) {
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.setHeader("Accept-Ranges", "bytes");
          return res.send(cached);
        }
        logger.warn(
          `[VideoProxy] PDIM cache entry ${filename} is too small (${cached?.length ?? 0} bytes) — deleting stale cache`,
        );
        await videoCachePocket.delete(filename).catch(() => {
          /* intentional: stale cache cleanup */
        });
      }
    } catch (err) {
      logger.warn(
        { err },
        `[VideoProxy] PDIM cache read failed for ${filename} — falling through to MaxCore proxy`,
      );
    }

    // 2. Try to fetch from MaxCore using stored URL or candidate paths
    const urlStore = await getMaxcoreVideoUrlStore();
    const candidateUrls: string[] = [];

    // Add the stored URL first if we have it
    const storedUrl = urlStore?.get(filename);
    if (storedUrl) candidateUrls?.push(storedUrl);

    if (MC_AI_URL) {
      // Extract job UUID from filename pattern: video_<uuid>.mp4
      const uuidMatch = filename?.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      const uuid = uuidMatch ? uuidMatch[1] : null;

      // Job-ID-based download routes first (most likely to work if MaxCore has them)
      if (uuid) {
        candidateUrls?.push(
          `${MC_AI_URL}/api/video-job/${uuid}/download`,
          `${MC_AI_URL}/api/video-job/${uuid}/file`,
          `${MC_AI_URL}/api/video-job/${uuid}/video`,
          `${MC_AI_URL}/api/download/${uuid}`,
          `${MC_AI_URL}/api/video/${uuid}`,
          `${MC_AI_URL}/api/video/${uuid}.mp4`,
          `${MC_AI_URL}/api/videos/${uuid}`,
          `${MC_AI_URL}/api/videos/${uuid}.mp4`,
          `${MC_AI_URL}/api/render/${uuid}/download`,
        );
      }

      // Filename-based /api/* routes (bypass SPA catch-all)
      candidateUrls?.push(
        `${MC_AI_URL}/api/uploads/${filename}`,
        `${MC_AI_URL}/api/uploads/videos/${filename}`,
        `${MC_AI_URL}/api/videos/${filename}`,
        `${MC_AI_URL}/api/video/${filename}`,
        `${MC_AI_URL}/api/generated/${filename}`,
        `${MC_AI_URL}/api/generated/videos/${filename}`,
        `${MC_AI_URL}/api/render/${filename}`,
        `${MC_AI_URL}/api/output/${filename}`,
        `${MC_AI_URL}/api/media/${filename}`,
        `${MC_AI_URL}/api/download/${filename}`,
        `${MC_AI_URL}/api/stream/${filename}`,
        `${MC_AI_URL}/api/files/${filename}`,
        `${MC_AI_URL}/api/static/videos/${filename}`,
        // Non-/api/ static paths
        `${MC_AI_URL}/uploads/${filename}`,
        `${MC_AI_URL}/uploads/videos/${filename}`,
        `${MC_AI_URL}/videos/${filename}`,
        `${MC_AI_URL}/static/${filename}`,
        `${MC_AI_URL}/static/videos/${filename}`,
        `${MC_AI_URL}/generated/${filename}`,
        `${MC_AI_URL}/output/${filename}`,
        `${MC_AI_URL}/media/${filename}`,
      );
    }

    // Bearer ONLY — MaxCore validates X-API-Key/X-Admin-Key schemes first
    // and 401s the whole request if they're present (see replit.md).
    const authHeaders: Record<string, string> = {
      Authorization: `Bearer ${MC_AI_KEY}`,
    };

    // Limit proxy attempts: stored URL + first 8 candidates.
    // Each attempt uses an 8s timeout — MaxCore responds immediately (200 or
    // 404); only a connection stall would exhaust the timeout.  Without this
    // cap, a missing file walks all 20+ candidates × 30s = many minutes.
    const MAX_PROXY_ATTEMPTS = 9;
    for (const url of candidateUrls.slice(0, MAX_PROXY_ATTEMPTS)) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const upstreamController = new AbortController();
      const upstreamTimeout = setTimeout(
        () =>
          upstreamController.abort(
            new DOMException("The video upstream timed out", "TimeoutError"),
          ),
        8_000,
      );
      upstreamTimeout.unref?.();
      const abortUpstream = () => {
        if (!upstreamController.signal.aborted && !res.writableEnded) {
          upstreamController.abort(
            new DOMException(
              "The video proxy client disconnected",
              "AbortError",
            ),
          );
        }
      };
      req.once("aborted", abortUpstream);
      res.once("close", abortUpstream);
      try {
        const upstream = await fetch(url, {
          headers: authHeaders,
          signal: upstreamController.signal,
        });
        if (!upstream?.ok) {
          logger.info(
            `[VideoProxy] Candidate ${url} → HTTP ${upstream.status} ct="${upstream.headers.get("content-type") ?? ""}"`,
          );
          continue;
        }

        // Peek at the first bytes to validate with magic-byte detection.
        // Content-type alone is unreliable — MaxCore's SPA returns text/html with
        // 200 OK for every unrecognised path.  We read a small peek chunk first;
        // if it doesn't look like a real video we cancel and try the next candidate.
        reader = upstream?.body?.getReader();
        if (!reader) continue;

        // Read up to 512 bytes to inspect magic bytes
        const peekResult = await reader?.read();
        const peekChunk = peekResult?.value;
        const peekDone = peekResult?.done;

        if (!peekChunk || peekChunk?.length === 0) {
          reader?.cancel();
          continue;
        }

        const peekBuf = Buffer?.from(peekChunk);
        const isMP4 =
          peekBuf?.length >= 8 &&
          peekBuf?.slice(4, 8).toString("ascii") === "ftyp";
        const isWebM =
          peekBuf?.length >= 4 &&
          peekBuf[0] === 0x1a &&
          peekBuf[1] === 0x45 &&
          peekBuf[2] === 0xdf &&
          peekBuf[3] === 0xa3;
        const isAVI =
          peekBuf?.length >= 4 &&
          peekBuf?.slice(0, 4).toString("ascii") === "RIFF";

        // Reject anything that starts with HTML markers
        const peekText = peekBuf?.slice(0, 100).toString("utf8").toLowerCase();
        const looksHTML =
          peekText?.includes("<!doctype") ||
          peekText?.includes("<html") ||
          peekText?.startsWith("<!");

        const isRealVideo = (isMP4 || isWebM || isAVI) && !looksHTML;

        const ct = upstream?.headers?.get("content-type") ?? "";
        if (!isRealVideo) {
          reader?.cancel();
          logger.info(
            `[VideoProxy] Candidate ${url} → NOT video (HTTP 200, ct="${ct}", peek="${peekText.slice(0, 60).replace(/\n/g, "\\n")}")`,
          );
          continue;
        }

        const cl = upstream?.headers?.get("content-length");
        res.setHeader("Content-Type", "video/mp4");
        if (cl) res.setHeader("Content-Length", cl);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Accept-Ranges", "bytes");
        res.writeHead(200);

        // Stream the validated first chunk and remaining Web-stream data through
        // pipeline. Plain .pipe(res) leaves source errors unhandled; a deadline
        // firing after headers resolved could therefore crash the process.
        const chunks: Uint8Array[] = [];
        const body = Readable.from(
          (async function* () {
            chunks.push(peekChunk);
            yield peekChunk;
            if (!peekDone) {
              while (true) {
                const { done, value } = await (reader?.read() ?? {});
                if (done) break;
                chunks.push(value);
                yield value;
              }
            }
          })(),
        );
        await pipeline(body, res);

        // Cache only after the complete body was received and relayed. A timed
        // out or client-aborted partial response must never become a cache hit.
        const buf = Buffer.concat(chunks);
        if (buf.length > 10_240) {
          await videoCachePocket.write(filename, buf);
          logger.info(
            `[VideoProxy] Cached ${filename} to PDIM (${(buf.length / 1024).toFixed(0)} KB)`,
          );
        }

        logger.info(`[VideoProxy] Streamed ${filename} from ${url}`);
        return;
      } catch (err) {
        if (res.headersSent) {
          // Do not report a truncated video as a successful 200 or attempt a
          // second candidate after response bytes have already been committed.
          if (!res.destroyed) {
            res.destroy(err instanceof Error ? err : undefined);
          }
          return;
        }
        logger.info(
          `[VideoProxy] Candidate ${url} fetch error: ${(err as any)?.message}`,
        );
      } finally {
        clearTimeout(upstreamTimeout);
        req.off("aborted", abortUpstream);
        res.off("close", abortUpstream);
        if (!res.writableEnded) {
          try {
            await reader?.cancel();
          } catch {
            // The reader may already be errored/cancelled by pipeline.
          }
        }
      }
    }

    logger.warn(
      `[VideoProxy] Could not retrieve ${filename} from any MaxCore path`,
    );
    return res
      .status(404)
      .json({
        error:
          "Video not found — it may have expired on MaxCore. Please regenerate.",
      });
  },
);

router.get(
  "/video-templates",
  requireAuthOnly,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await (await getPythonAI()).getCinematicTemplates();
      if (result?.success && result?.data) {
        res.json({
          ...result?.data,
          aspect_ratios: [
            {
              id: "9:16",
              name: "Vertical (9:16)",
              platforms: ["TikTok", "Reels", "Stories", "Shorts"],
            },
            {
              id: "16:9",
              name: "Landscape (16:9)",
              platforms: ["YouTube", "Twitter", "LinkedIn"],
            },
            {
              id: "1:1",
              name: "Square (1:1)",
              platforms: ["Instagram Feed", "Facebook", "Threads"],
            },
            {
              id: "4:5",
              name: "Portrait (4:5)",
              platforms: ["Instagram", "Facebook"],
            },
          ],
        });
      } else {
        res.json({
          templates: [
            {
              id: "cinematic_promo",
              name: "Cinematic Promo",
              description: "Film-quality promotional video",
              category: "promo",
            },
            {
              id: "neon_pulse",
              name: "Neon Pulse",
              description: "Vibrant neon with plasma backgrounds",
              category: "energetic",
            },
            {
              id: "dark_cinema",
              name: "Dark Cinema",
              description: "Moody atmospheric film look",
              category: "dramatic",
            },
            {
              id: "aurora",
              name: "Aurora Borealis",
              description: "Northern lights color waves",
              category: "atmospheric",
            },
            {
              id: "music_video",
              name: "Music Video",
              description: "High-energy music video style",
              category: "music",
            },
            {
              id: "gold_luxury",
              name: "Gold Luxury",
              description: "Premium gold and black aesthetic",
              category: "luxury",
            },
            {
              id: "elegant_minimal",
              name: "Elegant Minimal",
              description: "Clean sophisticated design",
              category: "professional",
            },
            {
              id: "vintage_film",
              name: "Vintage Film",
              description: "Retro 8mm film aesthetic",
              category: "retro",
            },
            {
              id: "ocean_wave",
              name: "Ocean Wave",
              description: "Calming ocean gradients",
              category: "calm",
            },
            {
              id: "fire_ember",
              name: "Fire & Ember",
              description: "Intense warm fire tones",
              category: "intense",
            },
            {
              id: "storyteller",
              name: "Storyteller",
              description: "Narrative-driven scene progression",
              category: "narrative",
            },
          ],
          quick_templates: [
            "promo",
            "lyric",
            "announcement",
            "minimal",
            "neon",
          ],
          aspect_ratios: [
            {
              id: "9:16",
              name: "Vertical (9:16)",
              platforms: ["TikTok", "Reels", "Stories", "Shorts"],
            },
            {
              id: "16:9",
              name: "Landscape (16:9)",
              platforms: ["YouTube", "Twitter", "LinkedIn"],
            },
            {
              id: "1:1",
              name: "Square (1:1)",
              platforms: ["Instagram Feed", "Facebook", "Threads"],
            },
            {
              id: "4:5",
              name: "Portrait (4:5)",
              platforms: ["Instagram", "Facebook"],
            },
          ],
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to get video templates:");
      res
        .status(500)
        .json({ success: false, message: "Failed to get templates" });
    }
  },
);

router.post(
  "/veo-campaign",
  requireAuth,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        title,
        artist,
        album,
        story,
        mood,
        era,
        references,
        label,
        brand_notes,
        lyrics,
        primary_platforms,
        campaign_notes,
        targets,
        audio_duration_sec,
        track_id,
      } = req.body;

      if (!title || !artist) {
        return res.status(400).json({
          success: false,
          message: "Track title and artist name are required",
        });
      }

      const result = await (
        await getVeoMusic()
      ).generateCampaign({
        track_id,
        title,
        artist,
        album,
        story,
        mood: mood || "energetic",
        era: era || "modern",
        references: references || [],
        label,
        brand_notes: brand_notes || "",
        lyrics,
        primary_platforms: primary_platforms || [
          "tiktok",
          "youtube",
          "instagram",
        ],
        campaign_notes: campaign_notes || "",
        targets,
        audio_duration_sec: audio_duration_sec || 180,
      });

      if (!result?.success) {
        return res.status(500).json({
          success: false,
          message: "Video campaign generation failed",
        });
      }

      res.json(result);
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate video campaign",
      );
      res
        .status(500)
        .json({ success: false, message: "Video campaign generation failed" });
    }
  },
);

router.post(
  "/veo-campaign/single",
  requireAuth,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, artist, platform, mood, story, lyrics, tone } = req.body;

      if (!title || !artist || !platform) {
        return res.status(400).json({
          success: false,
          message: "Track title, artist, and platform are required",
        });
      }

      const asset = await (
        await getVeoMusic()
      ).generateForPost({
        title,
        artist,
        platform,
        mood,
        story,
        lyrics,
        tone,
      });

      if (!asset) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate video for platform",
        });
      }

      res.json({ success: true, asset });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate single video",
      );
      res
        .status(500)
        .json({ success: false, message: "Video generation failed" });
    }
  },
);

router.get(
  "/veo-campaign/platforms",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await (await getVeoMusic()).getAvailablePlatforms();
      if (!data) {
        return res.status(503).json({
          success: false,
          message: "Veo Music pipeline not available",
        });
      }
      res.json({ success: true, ...data });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get Veo platforms:");
      res
        .status(500)
        .json({ success: false, message: "Failed to get platforms" });
    }
  },
);

router.get(
  "/veo-campaign/goals",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await (await getVeoMusic()).getAvailableGoals();
      if (!data) {
        return res.status(503).json({
          success: false,
          message: "Veo Music pipeline not available",
        });
      }
      res.json({ success: true, ...data });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get Veo goals:");
      res.status(500).json({ success: false, message: "Failed to get goals" });
    }
  },
);

router.get(
  "/veo-campaign/recommend/:platform",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { platform } = req.params as Record<string, string>;
      const data = await (await getVeoMusic()).getRecommendedGoals(platform);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: `No recommendations for platform: ${platform}`,
        });
      }
      res.json({ success: true, ...data });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get Veo recommendations:");
      res
        .status(500)
        .json({ success: false, message: "Failed to get recommendations" });
    }
  },
);

router.get(
  "/veo-campaign/status",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await (await getVeoMusic()).getPipelineStatus();
      if (!status) {
        return res.status(503).json({
          success: false,
          message: "Veo Music pipeline not available",
        });
      }
      res.json({ success: true, ...status });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get Veo status:");
      res.status(500).json({ success: false, message: "Failed to get status" });
    }
  },
);

router.post(
  "/veo-url/metadata",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({
          success: false,
          message: 'Missing or invalid "url" field',
        });
      }

      const data = await (await getVeoMusic()).extractUrlMetadata(url);
      if (!data) {
        return res.status(503).json({
          success: false,
          message: "Veo Music pipeline not available",
        });
      }
      res.json(data);
    } catch (error) {
      logger.warn({ err: error }, "Failed to extract URL metadata:");
      res
        .status(500)
        .json({
          success: false,
          message: "Failed to extract metadata from URL",
        });
    }
  },
);

router.post(
  "/veo-campaign/from-url",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, ...overrides } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({
          success: false,
          message: 'Missing or invalid "url" field',
        });
      }

      const result = await (
        await getVeoMusic()
      ).generateCampaignFromUrl(url, overrides);
      if (!result || (!result as any)?.success) {
        return res
          .status((result as any)?.error?.includes("unavailable") ? 503 : 500)
          .json({
            success: false,
            message: (result as any).error || "Campaign generation from URL failed",
          });
      }
      res.json(result);
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate campaign from URL",
      );
      res
        .status(500)
        .json({
          success: false,
          message: "Campaign generation from URL failed",
        });
    }
  },
);

// Lists the authenticated user's own items for a given promotable content
// type (beat listing, release, storefront, published social post, artist
// EPK) so the Advertising page / autopilot can offer a real picker instead
// of being hardcoded to beats only.
router.get(
  "/promotable-content",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const type = req.query.type as string;
      if (!PROMOTABLE_CONTENT_TYPES.includes(type as PromotableContentType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid type. Must be one of: ${PROMOTABLE_CONTENT_TYPES.join(", ")}`,
        });
      }
      const items = await listPromotableContent(
        userId,
        type as PromotableContentType,
      );
      res.json({ success: true, type, items });
    } catch (error) {
      logger.warn({ err: error }, "Failed to list promotable content:");
      res
        .status(500)
        .json({ success: false, message: "Failed to load promotable content" });
    }
  },
);

// Generic "promote this" campaign generator — works for any owned content
// type (beat, release, storefront, social post, artist EPK), not just
// marketplace beats. Used by the manual Advertising page, the advertising
// autopilot, and automation pipelines.
router.post(
  "/veo-campaign/promote",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Not authenticated" });

      const {
        contentType,
        contentId,
        platforms,
        mood,
        brand_notes,
        campaign_notes,
      } = req.body as Record<string, any>;

      if (!PROMOTABLE_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid contentType. Must be one of: ${PROMOTABLE_CONTENT_TYPES.join(", ")}`,
        });
      }

      let source;
      try {
        source = await resolvePromotableContent(userId, contentType, contentId);
      } catch (err) {
        if (err instanceof PromotableContentError) {
          return res
            .status(err.status)
            .json({ success: false, message: err.message });
        }
        throw err;
      }

      const campaignRequest: Record<string, any> = {
        title: source.title,
        artist: source.artist || source.title,
        mood: mood || (source.category ? "energetic" : "uplifting"),
        era: "modern",
        story: source.description,
        primary_platforms: platforms || [
          "tiktok",
          "instagram",
          "reels",
          "shorts",
        ],
        audio_duration_sec: 180,
        source_url: source.sourceUrl,
        source_platform: source.sourcePlatform,
        content_type: source.veoContentType,
      };

      if (brand_notes) campaignRequest.brand_notes = brand_notes;
      if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
      if (source.artworkUrl) campaignRequest.artwork_url = source.artworkUrl;
      if (source.category) campaignRequest.genre = source.category;

      const result = await (
        await getVeoMusic()
      ).generateCampaign(campaignRequest as import("../services/veoMusicService.js").VeoCampaignRequest);
      if (!result || !result.success) {
        return res.status(500).json({
          success: false,
          message: result?.error || "Campaign generation failed",
        });
      }

      res.json({
        ...result,
        contentType: source.contentType,
        source: source.summary,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to promote content:");
      res
        .status(500)
        .json({ success: false, message: "Promotion campaign failed" });
    }
  },
);

router.post(
  "/veo-campaign/promote-storefront",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Not authenticated" });

      const { slug, platforms, mood, brand_notes, campaign_notes } = req.body;

      let storefront: Record<string, unknown> | null = null;
      if (slug) {
        const rows = await db
          .select()
          .from(storefronts)
          .where(
            and(eq(storefronts.slug, slug), eq(storefronts.userId, userId)),
          )
          .limit(1);
        storefront = rows[0];
      } else {
        const rows = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts.userId, userId))
          .limit(1);
        storefront = rows[0];
      }

      if (!storefront) {
        return res
          .status(404)
          .json({
            success: false,
            message: "Storefront not found or you do not own it",
          });
      }

      if (!storefront?.isActive) {
        return res
          .status(403)
          .json({ success: false, message: "Storefront is not active" });
      }

      const customization = (storefront?.customization || {}) as Record<
        string,
        any
      >;
      const seo = (storefront?.seo || {}) as Record<string, any>;

      const storeListings = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.storefrontId, storefront?.id as string),
            eq(listings.isPublished, true),
          ),
        )
        .limit(10);

      const listingCount = storeListings?.length;
      const genres = [
        ...new Set(
          storeListings
            .map((l: Record<string, unknown>) => l?.category)
            .filter(Boolean),
        ),
      ];
      const topListings = storeListings
        .slice(0, 3)
        .map((l: Record<string, unknown>) => l?.title)
        .join(", ");

      const description = seo?.description || customization?.bio || "";
      const title = seo?.title || storefront?.name || "My Storefront";
      const artworkUrl =
        seo?.ogImage || customization?.banner || customization?.logo || "";
      const keywords = seo?.keywords || [];

      let story = `Promote ${title}.`;
      if (description) story += ` ${description?.slice(0, 200)}.`;
      if (listingCount > 0)
        story += ` Featuring ${listingCount} beats${topListings ? ` including ${topListings}` : ""}.`;
      if (genres.length > 0) story += ` Genres: ${genres?.join(", ")}.`;
      story += " Drive traffic and sales to the storefront.";

      const campaignRequest: Record<string, any> = {
        title,
        artist: storefront.name,
        mood: mood || "energetic",
        era: "modern",
        story,
        primary_platforms: platforms || [
          "tiktok",
          "youtube",
          "instagram",
          "reels",
          "shorts",
          "facebook",
        ],
        audio_duration_sec: 180,
        source_url: `/storefront/${storefront?.slug}`,
        source_platform: "website",
        content_type: "website",
      };

      if (brand_notes) campaignRequest.brand_notes = brand_notes;
      else if (description)
        campaignRequest.brand_notes = description?.slice(0, 300);

      if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
      if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
      if (keywords.length > 0) campaignRequest.keywords = keywords;

      const result = await (
        await getVeoMusic()
      ).generateCampaign(campaignRequest as import("../services/veoMusicService.js").VeoCampaignRequest);
      if (!result || !result?.success) {
        return res
          .status(500)
          .json({
            success: false,
            message: "Campaign generation failed",
          });
      }

      res.json({
        ...result,
        storefront: {
          id: storefront.id,
          name: storefront.name,
          slug: storefront.slug,
          listingCount,
          genres,
        },
      });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to promote storefront",
      );
      res
        .status(500)
        .json({
          success: false,
          message: "Storefront promotion campaign failed",
        });
    }
  },
);

router.post(
  "/veo-campaign/promote-listing",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Not authenticated" });

      const { listingId, platforms, mood, brand_notes, campaign_notes } =
        req.body;
      if (!listingId)
        return res
          .status(400)
          .json({ success: false, message: "Missing listingId" });

      const rows = await db
        .select()
        .from(listings)
        .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
        .limit(1);
      const listing = rows[0] as Record<string, unknown>;
      if (!listing)
        return res
          .status(404)
          .json({
            success: false,
            message: "Listing not found or you do not own it",
          });

      if (!listing?.isPublished) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Listing must be published before promoting",
          });
      }

      let storefrontName = "My Store";
      if (listing?.storefrontId) {
        const storeRows = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts.id, listing.storefrontId!))
          .limit(1);
        if (storeRows[0])
          storefrontName =
            ((storeRows[0] as Record<string, unknown>).name as string) || storefrontName;
      }

      const metadata = (listing?.metadata || {}) as Record<string, any>;
      const title = listing?.title;
      const description = listing?.description || "";
      const category = listing?.category || metadata?.genre || "";
      const artworkUrl = listing?.artworkUrl || "";
      const priceDisplay = listing?.priceCents
        ? `$${(Number(listing.priceCents) / 100).toFixed(2)}`
        : "";

      let story = `Check out "${title}" by ${storefrontName}.`;
      if (description) story += ` ${(description as any)?.slice(0, 150)}.`;
      if (category) story += ` Genre: ${category}.`;
      if (priceDisplay) story += ` Available now for ${priceDisplay}.`;
      story += " Get it before it's gone!";

      const isMusic = listing.audioUrl || category;

      const campaignRequest: Record<string, any> = {
        title,
        artist: storefrontName,
        mood: mood || (category ? "energetic" : "uplifting"),
        era: "modern",
        story,
        primary_platforms: platforms || [
          "tiktok",
          "instagram",
          "reels",
          "shorts",
        ],
        audio_duration_sec: 180,
        // Must be absolute — a relative path isn't a valid landing link once
        // this campaign's content ships through a connected social account.
        source_url: `${(process.env.APP_URL || "https://maxbooster.replit.app").replace(/\/$/, "")}/marketplace/beat/${listing.id}`,
        source_platform: isMusic ? "maxbooster" : "website",
        content_type: isMusic ? "music" : "website",
      };

      if (brand_notes) campaignRequest.brand_notes = brand_notes;
      if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
      if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
      if (category) campaignRequest.genre = category;

      const result = await (
        await getVeoMusic()
      ).generateCampaign(campaignRequest as import("../services/veoMusicService.js").VeoCampaignRequest);
      if (!result || !result.success) {
        return res
          .status(500)
          .json({
            success: false,
            message: "Campaign generation failed",
          });
      }

      res.json({
        ...result,
        listing: {
          id: listing.id,
          title: listing.title,
          category: listing.category,
          price: priceDisplay,
          storefrontName,
        },
      });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to promote listing",
      );
      res
        .status(500)
        .json({ success: false, message: "Listing promotion campaign failed" });
    }
  },
);

router.post(
  "/generate-image",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        topic,
        platform,
        tone,
        
        artist_name,
        
        // URL analysis context
        artist,
        track,
        genre,
        
        keywords,
        description,
        urlDescription,
        artistName,
        trackTitle,
        intent,
        direction,
        context,
        awareness,
      } = req.body;

      if (!topic) {
        return res
          .status(400)
          .json({ success: false, message: "Topic is required" });
      }

      // Build enriched topic string from URL analysis context (same as /generate route)
      const contextParts: string[] = [];
      const resolvedTrack = track || trackTitle;
      const resolvedArtist = artist || artistName || artist_name;
      if (resolvedTrack) contextParts.push(`"${resolvedTrack}"`);
      if (resolvedArtist) contextParts.push(`by ${resolvedArtist}`);
      contextParts.push(String(topic));
      if (urlDescription && urlDescription !== topic)
        contextParts.push(urlDescription);
      if (description && description !== topic) contextParts.push(description);
      const enrichedTopic = contextParts.filter(Boolean).join(" — ");

      const requestedPlatform =
        typeof platform === "string" && platform.trim()
          ? platform.trim()
          : "instagram";
      if (
        !CONTENT_ALL_PLATFORMS.includes(
          requestedPlatform as ContentSupportedPlatform,
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Unsupported platform for image generation",
        });
      }
      const resolvedPlatform = requestedPlatform as ContentSupportedPlatform;

      const resolvedTone = String(tone || "energetic").toLowerCase();

      // ── Try MaxCore /api/generate/image first ────────────────────────────
      // Uses MaxCoreAIClient so the bulkhead, circuit breaker, and auth
      // centralization all apply (avoids the manual-fetch bypass pattern).
      type McImgResp = { url?: string; image_url?: string; outputs?: { url?: string }[] };
      const imgData = await MaxCoreAIClient.infer<McImgResp>("/api/generate/image", {
        prompt: enrichedTopic || topic,
        style: resolvedTone,
        platform: resolvedPlatform,
        genre: genre || "",
        intent,
        direction,
        context,
        awareness,
      });
      const raw = imgData?.url ?? imgData?.image_url ?? imgData?.outputs?.[0]?.url ?? null;
      // MaxCore may return relative paths like /uploads/images/img_xxx.png —
      // make them absolute so the browser can load them.
      const imageUrl =
        raw && /^https?:\/\//i.test(raw)
          ? raw
          : raw
            ? `${getMaxcoreOriginOrDefault()}${raw.startsWith("/") ? "" : "/"}${raw}`
            : null;
      if (!imageUrl) {
        throw new AIUnavailableError(
          "Image generation did not return an image URL",
        );
      }

      // ── Build visual spec for the generated image ────────────────────────
      const toneColorMap: Record<string, string[]> = {
        energetic: ["#ff6b35", "#f7c59f", "#1a1a2e", "#ffffff"],
        chill: ["#a8dadc", "#457b9d", "#1d3557", "#f1faee"],
        professional: ["#2b2d42", "#8d99ae", "#edf2f4", "#ef233c"],
        playful: ["#ffbe0b", "#fb5607", "#ff006e", "#8338ec"],
        nostalgic: ["#d4a373", "#ccd5ae", "#e9edc9", "#fefae0"],
      };
      const colorPalette = toneColorMap[resolvedTone] ?? toneColorMap.energetic;

      const visualSpec = getVisualSpec(resolvedPlatform, "short_video", colorPalette);

      const specData = {
        ...visualSpec,
        topic: enrichedTopic || topic,
        platform: resolvedPlatform,
        tone: resolvedTone,
        artist: resolvedArtist || "",
        track: resolvedTrack || "",
        genre: genre || "",
        keywords: Array.isArray(keywords) ? keywords : [],
        description: description || urlDescription || "",
        source: "MaxCoreAI",
      };

      res.json({
        success: true,
        visual_spec: specData,
        image_url: imageUrl,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        ...specData,
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "Social image generation is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Failed to generate social image",
      );
      res
        .status(500)
        .json({ success: false, message: "Image generation failed" });
    }
  },
);

// ── Media-to-Content: URL ─────────────────────────────────────────────────────

router.post(
  "/analyze-url",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, platform } = req.body;
      if (!url || typeof url !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "url is required" });
      }

      // Reject obviously oversized URLs before any parsing or network fetch
      if (url.length > 2048) {
        return res.status(400).json({
          success: false,
          message: "URL too long (max 2048 characters)",
        });
      }

      const normalizedUrl = url.trim();
      const firstPartySource = resolveFirstPartySocialSource(normalizedUrl);
      let analysis: any;
      if (firstPartySource) {
        // Use checkout-backed facts for the one trusted first-party route;
        // never fetch the submitted page or send its URL to MaxCore as a topic.
        const parsedUrl = new URL(normalizedUrl);
        analysis = {
          url: normalizedUrl,
          domain: parsedUrl.hostname,
          platform: "web",
          platform_category: "web",
          is_music: false,
          title: firstPartySource.title,
          description: firstPartySource.description,
          author: "",
          published: "",
          modified: "",
          og_image: "",
          thumbnail_url: "",
          canonical: normalizedUrl,
          language: "",
          content_type: firstPartySource.contentType,
          content_category: "pricing",
          genre: "default",
          tone: "professional",
          artist: "",
          track: "",
          album: "",
          duration: "",
          release_date: "",
          label: "",
          isrc: "",
          bpm: "",
          tracklist: [],
          members: [],
          keywords: [],
          tags: [],
          headings: [],
          body_preview: firstPartySource.description,
          summary: firstPartySource.description,
          view_count: null,
          like_count: null,
          comment_count: null,
          play_count: null,
          share_count: null,
          subscriber_count: null,
          data_sources: [firstPartySource.provenance],
          sourceProvenance: firstPartySource.provenance,
        };
      } else {
        // All other URLs retain the fail-closed SSRF guard before parsing.
        try {
          assertSafeExternalUrl(normalizedUrl);
        } catch (ssrfErr) {
          return res
            .status(400)
            .json({ success: false, message: (ssrfErr as Error).message || "Invalid URL" });
        }
        analysis = await analyzeUrl(normalizedUrl);
      }
      if (analysis.error && !analysis.title) {
        return res
          .status(422)
          .json({ success: false, message: analysis.error, analysis });
      }

      const seed = urlToContentSeed(analysis);
      if (firstPartySource) {
        seed.topic = firstPartySource.topic;
      }

      // Keep the extracted topic for the video config, but send external URLs
      // to MaxCore's guarded URL resolver. Trusted first-party content instead
      // uses its server-verified non-URL topic and checkout context.
      const aiTopic =
        seed.track && seed.artist
          ? `"${seed.track}" by ${seed.artist}${seed.genre && seed.genre !== "default" ? ` — ${seed.genre}` : ""}`
          : seed.track
            ? `"${seed.track}"`
            : seed.artist
              ? `New music by ${seed.artist}`
              : seed.topic.slice(0, 80);

      const requestedPlatform =
        typeof platform === "string" && platform.trim()
          ? platform.trim()
          : "instagram";
      const maxCoreVariant = await generateSocialUrlWithMaxCore({
        url: normalizedUrl,
        topic: firstPartySource?.topic,
        extraContext: firstPartySource?.extraContext,
        platform: requestedPlatform,
        userId: req.user!.id,
        tone: seed.tone !== "default" ? seed.tone : "energetic",
        format: "text",
        genre: seed.genre !== "default" ? seed.genre : undefined,
        contentType: seed.content_type,
      });
      if (!maxCoreVariant?.caption) {
        throw new AIUnavailableError(
          "MaxCore did not return usable URL social content",
        );
      }
      const content = {
        success: true,
        data: {
          caption: maxCoreVariant.caption,
          hook: maxCoreVariant.hook,
          body: maxCoreVariant.body,
          cta: maxCoreVariant.cta,
          hashtags: maxCoreVariant.hashtags,
        },
        source: "MaxCoreAI",
      };

      // Derive genre-based default colors for the video template
      const genreColorMap: Record<string, { bg: string; ac: string }> = {
        trap:           { bg: "#0a0a0a", ac: "#ff3c00" },
        drill:          { bg: "#0a0a0a", ac: "#cc2200" },
        "hip-hop":      { bg: "#1a1a2e", ac: "#e94560" },
        "hip hop":      { bg: "#1a1a2e", ac: "#e94560" },
        rap:            { bg: "#1a1a2e", ac: "#e94560" },
        "r&b":          { bg: "#1a0a2e", ac: "#c77dff" },
        rnb:            { bg: "#1a0a2e", ac: "#c77dff" },
        soul:           { bg: "#1a0a2e", ac: "#c77dff" },
        "neo soul":     { bg: "#1a0a2e", ac: "#b07acc" },
        pop:            { bg: "#0d0d1a", ac: "#00d4ff" },
        edm:            { bg: "#000d1a", ac: "#00ffcc" },
        electronic:     { bg: "#000d1a", ac: "#00ffcc" },
        house:          { bg: "#000d1a", ac: "#00ffe0" },
        "tech house":   { bg: "#000d1a", ac: "#00ffe0" },
        "deep house":   { bg: "#001030", ac: "#0080ff" },
        techno:         { bg: "#000000", ac: "#888888" },
        dubstep:        { bg: "#000d1a", ac: "#ff00cc" },
        "drum and bass":{ bg: "#001010", ac: "#00ff88" },
        dnb:            { bg: "#001010", ac: "#00ff88" },
        phonk:          { bg: "#0a0000", ac: "#cc0000" },
        synthwave:      { bg: "#100030", ac: "#ff66cc" },
        afrobeats:      { bg: "#1a0a00", ac: "#ff9900" },
        afropop:        { bg: "#1a0a00", ac: "#ff9900" },
        amapiano:       { bg: "#0a1a00", ac: "#88cc00" },
        country:        { bg: "#1a1000", ac: "#d4af37" },
        folk:           { bg: "#1a1000", ac: "#d4af37" },
        rock:           { bg: "#1a0000", ac: "#ff4500" },
        metal:          { bg: "#0a0000", ac: "#cc0000" },
        indie:          { bg: "#0a1a1a", ac: "#66cccc" },
        alternative:    { bg: "#0a0a1a", ac: "#9966ff" },
        punk:           { bg: "#1a0000", ac: "#ff0044" },
        jazz:           { bg: "#0a0a1a", ac: "#d4af37" },
        blues:          { bg: "#000a1a", ac: "#3399ff" },
        classical:      { bg: "#1a1a10", ac: "#c0c0c0" },
        reggae:         { bg: "#001a0a", ac: "#00aa44" },
        reggaeton:      { bg: "#1a0500", ac: "#ff6600" },
        dancehall:      { bg: "#001a0a", ac: "#ffcc00" },
        latin:          { bg: "#1a0500", ac: "#ff6600" },
        cumbia:         { bg: "#1a0500", ac: "#ff8800" },
        soca:           { bg: "#1a0500", ac: "#ffcc00" },
        gospel:         { bg: "#0a0a1a", ac: "#ffdd00" },
        funk:           { bg: "#1a0a00", ac: "#ff6600" },
        disco:          { bg: "#0a001a", ac: "#ff44cc" },
        grime:          { bg: "#0a0a0a", ac: "#00ccff" },
        "k-pop":        { bg: "#0a001a", ac: "#ff66bb" },
        kpop:           { bg: "#0a001a", ac: "#ff66bb" },
        "lo-fi":        { bg: "#0a0a1a", ac: "#9999cc" },
        lofi:           { bg: "#0a0a1a", ac: "#9999cc" },
        ambient:        { bg: "#001020", ac: "#66aacc" },
        hyperpop:       { bg: "#0a001a", ac: "#ff00ff" },
        "bossa nova":   { bg: "#001a10", ac: "#44cc88" },
      };

      // Platform-specific overrides
      const platformColorMap: Record<string, { bg: string; ac: string }> = {
        youtube:       { bg: "#0f0f0f", ac: "#ff0000" },
        spotify:       { bg: "#191414", ac: "#1db954" },
        soundcloud:    { bg: "#1a0a00", ac: "#ff5500" },
        tiktok:        { bg: "#010101", ac: "#69c9d0" },
        apple_music:   { bg: "#1c1c1e", ac: "#fc3c44" },
        tidal:         { bg: "#000000", ac: "#ffffff" },
        deezer:        { bg: "#1a0032", ac: "#a238ff" },
        audiomack:     { bg: "#001a00", ac: "#ff6600" },
        beatport:      { bg: "#000000", ac: "#01ff95" },
        mixcloud:      { bg: "#00001a", ac: "#5000ff" },
        bandcamp:      { bg: "#0a0f1a", ac: "#1da0c3" },
        youtube_music: { bg: "#0f0f0f", ac: "#ff0000" },
        instagram:     { bg: "#0d0d0d", ac: "#e1306c" },
        twitch:        { bg: "#0e0e10", ac: "#9147ff" },
        patreon:       { bg: "#052d49", ac: "#ff424d" },
        vimeo:         { bg: "#1a2633", ac: "#1ab7ea" },
        linkedin:      { bg: "#000e1a", ac: "#0077b5" },
      };

      const genreKey = (seed.genre || "hip-hop").toLowerCase();
      const platformKey = (analysis.platform || "").toLowerCase();
      const colors = platformColorMap[platformKey] ||
        genreColorMap[genreKey] || { bg: "#1a1a2e", ac: "#e94560" };

      // Video-overlay copy must also come from MaxCore; do not substitute
      // locally templated hooks, bodies, or calls to action.
      const stripMeta = (value: string) =>
        value
          .replace(/#\w+/g, "")
          .replace(/https?:\/\/\S+/g, "")
          .replace(/🔗.*$/g, "")
          .trim();
      const videoHook = stripMeta(content.data.hook).slice(0, 80);
      const videoBody = stripMeta(content.data.body).slice(0, 100);
      const videoCta = stripMeta(content.data.cta).slice(0, 50);
      const videoConfig =
        videoHook && videoBody && videoCta
          ? {
              topic: aiTopic,
              genre:
                seed.genre && seed.genre !== "default" ? seed.genre : "",
              tone: seed.tone !== "default" ? seed.tone : "energetic",
              platform: requestedPlatform,
              duration: 15,
              artist_name: seed.artist || "",
              hook: videoHook,
              body: videoBody,
              cta: videoCta,
              bg_color: colors.bg,
              accent_color: colors.ac,
              thumbnail_url: seed.og_image || seed.thumbnail_url || "",
            }
          : null;

      const audioStyle = {
        genre: seed.genre || "hip-hop",
        mood: seed.tone || "energetic",
        prompt: `${seed.genre || "hip-hop"} beat for "${seed.topic.slice(0, 40)}"`,
        bpm: seed.genre === "trap" ? 140 : seed.genre === "r&b" ? 90 : 120,
      };

      const imagePrompt =
        [
          seed.artist ? `Artist: ${seed.artist}` : "",
          seed.track ? `Track: ${seed.track}` : "",
          seed.genre ? `Genre: ${seed.genre}` : "",
          seed.tone ? `Mood: ${seed.tone}` : "",
          seed.og_image ? `Reference image: ${seed.og_image}` : "",
        ]
          .filter(Boolean)
          .join(". ") || seed.topic;

      const responsePayload: Record<string, unknown> = {
        success: true,
        analysis,
        seed,
        content,
        source: "MaxCoreAI",
        sourceProvenance:
          firstPartySource?.provenance ?? "maxcore_fetched_url",
      };
      if (videoConfig) {
        responsePayload.video_config = videoConfig;
      }
      if (!firstPartySource) {
        responsePayload.audio_style = audioStyle;
        responsePayload.image_prompt = imagePrompt;
      }
      res.json(responsePayload);
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "URL analysis is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "URL analysis failed",
      );
      res.status(500).json({ success: false, message: "URL analysis failed" });
    }
  },
);

// ── Media-to-Content: Audio ───────────────────────────────────────────────────

router.post(
  "/analyze-audio",
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    audioUpload.single("audio")(
      req as unknown as import("express").Request,
      res as unknown as import("express").Response,
      next,
    );
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({
            success: false,
            message: "audio file is required (field: audio)",
          });
      }

      const analysis = await analyzeAudio(file.buffer, file.originalname);
      if (analysis.error) {
        return res
          .status(422)
          .json({ success: false, message: analysis.error, analysis });
      }

      const seed = audioToContentSeed(analysis);
      const platform = (req.body.platform as string) || "instagram";

      // Generate content from audio features
      const content = await (
        await getUnifiedAI()
      ).generateContent({
        type: "social_post",
        platform: platform as import("../../shared/ml/nlp/ContentGenerator.js").Platform,
        topic: seed.topic,
        tone: "energetic" as import("../../shared/ml/nlp/ContentGenerator.js").ContentTone,
        genre: seed.genre,
        artistName: seed.artist,
        trackTitle: seed.track,
      });

      // Produce a video config the frontend can use to call /generate-video
      const videoConfig = {
        genre: analysis.genre,
        topic: seed.topic,
        tone: "default",
        speed: undefined as number | undefined, // let NN decide
        bg: "0x1a1a2e",
        ac: "0xe94560",
        duration: 15,
        platform,
      };

      res.json({
        success: true,
        analysis,
        seed,
        content: (content as any).content || content || null,
        video_config: videoConfig,
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "Audio analysis is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Audio analysis failed",
      );
      res
        .status(500)
        .json({ success: false, message: "Audio analysis failed" });
    }
  },
);

// ── Media-to-Content: Image ───────────────────────────────────────────────────

router.post(
  "/analyze-image",
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    artworkUpload.single("image")(
      req as unknown as import("express").Request,
      res as unknown as import("express").Response,
      next,
    );
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({
            success: false,
            message: "image file is required (field: image)",
          });
      }

      const analysis = await analyzeImage(file.buffer, file.originalname);
      if (analysis.error) {
        return res
          .status(422)
          .json({ success: false, message: analysis.error, analysis });
      }

      const seed = imageToContentSeed(analysis);
      const platform = (req.body.platform as string) || "instagram";

      // Generate content from visual mood
      const content = await (
        await getUnifiedAI()
      ).generateContent({
        type: "social_post",
        platform: platform as import("../../shared/ml/nlp/ContentGenerator.js").Platform,
        topic: `${analysis.mood} visual aesthetic, ${analysis.genre_hint} music`,
        tone: (analysis.tone && analysis.tone !== "default" ? analysis.tone : "energetic") as import("../../shared/ml/nlp/ContentGenerator.js").ContentTone,
        genre: analysis.genre_hint,
        artistName: (req.body.artist_name as string) || "",
      });

      // Video config with extracted colors baked in
      const videoConfig = {
        genre: analysis.genre_hint,
        topic: `${analysis.mood} aesthetic`,
        tone: analysis.tone || "default",
        bg: analysis.bg_color,
        ac: analysis.ac_color,
        duration: 15,
        platform,
      };

      res.json({
        success: true,
        analysis,
        seed,
        content: (content as any).content || content || null,
        video_config: videoConfig,
        palette: analysis.palette.slice(0, 5),
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(503).json({
          success: false,
          code: error.code,
          error: "Image analysis is temporarily unavailable",
        });
      }
      logger.warn(
        { errorType: error instanceof Error ? error.name : typeof error },
        "Image analysis failed",
      );
      res
        .status(500)
        .json({ success: false, message: "Image analysis failed" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE SYNTHESIS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /voice-profiles
 * Returns all available voice profiles with metadata.
 */
router.get(
  "/voice-profiles",
  requireAuthOnly,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const svc = await getVoiceSynthService();
      res.json({ success: true, profiles: svc.listVoiceProfiles() });
    } catch (e) {
      logger.warn(`[Route] voice-profiles: ${(e as Error).message}`);
      res
        .status(500)
        .json({ success: false, error: "Failed to load voice profiles" });
    }
  },
);

/**
 * POST /synthesize-voice
 * Body: { text, profileId?, speed?, pitch?, volume?, reverbAmount?, outputFormat? }
 * File (optional): audio field → reference voice sample for profile auto-selection
 *
 * Returns: { success, outputPath, publicUrl, durationSeconds, profileUsed }
 */
router.post(
  "/synthesize-voice",
  requireAuthOnly,
  handleMediaUpload(mediaUpload.single("reference_audio")),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        text,
        profileId,
        speed,
        pitch,
        volume,
        reverbAmount,
        outputFormat,
        segments,
      } = req.body as {
        text?: string;
        profileId?: string;
        speed?: number;
        pitch?: number;
        volume?: number;
        reverbAmount?: number;
        outputFormat?: "wav" | "mp3";
        segments?: string;
      };

      const svc = await getVoiceSynthService();
      const referenceAudioPath = req.file?.path;

      const options = {
        profileId,
        speed: speed ? Number(speed) : undefined,
        pitch: pitch ? Number(pitch) : undefined,
        volume: volume ? Number(volume) : undefined,
        reverbAmount:
          reverbAmount !== undefined ? Number(reverbAmount) : undefined,
        outputFormat:
          outputFormat === "mp3" ? ("mp3" as const) : ("wav" as const),
        referenceAudioPath,
      };

      let result;
      try {
        if (segments) {
          let parsedSegments: Array<{ text: string; pause?: number }> = [];
          try {
            parsedSegments = JSON.parse(segments);
          } catch {
            return res
              .status(400)
              .json({ success: false, error: "Invalid segments JSON" });
          }
          result = await svc.synthesizeSegments(parsedSegments, options);
        } else {
          if (!text?.trim())
            return res
              .status(400)
              .json({ success: false, error: "text is required" });
          result = await svc.synthesizeVoice(text!, options);
        }
      } finally {
        // The uploaded reference-audio sample was only needed to steer
        // synthesis — it is never re-read or served, so clean it up now
        // regardless of whether synthesis succeeded, failed, or threw.
        if (referenceAudioPath) {
          await fsPromises.unlink(referenceAudioPath).catch(() => {});
        }
      }

      if (!result.success)
        return res.status(500).json({ success: false, error: result.error });

      // ffmpeg needed a real file path to write the synthesized output, but
      // PDIM-backed storage is the only durable/servable copy — upload the
      // finished file, then delete the local scratch copy immediately.
      const outputPath = result.outputPath!;
      const filename = outputPath.split("/").pop()!;
      const contentType =
        options.outputFormat === "mp3" ? "audio/mpeg" : "audio/wav";
      let publicUrl: string;
      try {
        const audioBuffer = await fsPromises.readFile(outputPath);
        const storageKey = await storageService.uploadFile(
          audioBuffer,
          "voices",
          filename,
          contentType,
        );
        publicUrl = await storageService.getDownloadUrl(storageKey);
      } finally {
        await fsPromises.unlink(outputPath).catch(() => {});
      }

      res.json({
        success: true,
        publicUrl,
        filename,
        durationSeconds: result.durationSeconds,
        profileUsed: result.profileUsed,
        voiceUsed: result.voiceUsed,
      });
    } catch (e) {
      if (e instanceof AIUnavailableError) {
        return res.status(e.statusCode).json({
          success: false,
          code: e.code,
          error: e.message,
        });
      }
      logger.warn(`[Route] synthesize-voice: ${(e as Error).message}`);
      res
        .status(500)
        .json({
          success: false,
          error: (e as Error).message || "Voice synthesis failed",
        });
    }
  },
);

/**
 * POST /analyze-reference-voice
 * Body: multipart/form-data with audio field
 * Returns: { estimatedPitch, estimatedTempo, energy, suggestedProfileId }
 */
router.post(
  "/analyze-reference-voice",
  requireAuthOnly,
  handleMediaUpload(mediaUpload.single("audio")),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file?.path) {
        return res
          .status(400)
          .json({ success: false, error: "Audio file required" });
      }
      try {
        const svc = await getVoiceSynthService();
        const characteristics = await svc.analyzeReferenceVoice(file.path);
        res.json({ success: true, characteristics });
      } finally {
        await fsPromises.unlink(file.path).catch(() => {});
      }
    } catch (e) {
      logger.warn(`[Route] analyze-reference-voice: ${(e as Error).message}`);
      res
        .status(500)
        .json({ success: false, error: (e as Error).message || "Analysis failed" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BEAT SYNC / AUDIO ANALYSIS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /analyze-audio-beats
 * Body: multipart/form-data with audio field
 * Returns full BeatAnalysis: { bpm, confidence, beats, downbeats, sections,
 *   energyEnvelope, peakPositions, durationSeconds, tier }
 */
router.post(
  "/analyze-audio-beats",
  requireAuthOnly,
  handleMediaUpload(mediaUpload.single("audio")),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file?.path) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Audio file required (multipart/form-data, field: audio)",
          });
      }

      let analysis;
      let cacheHit = false;
      try {
        // ── Check PDIM cache first ────────────────────────────────────────────
        const { getCachedBeatAnalysis, cacheBeatAnalysis } = await import(
          "../services/pdimMediaStorageService.js"
        );
        const cached = await getCachedBeatAnalysis(file!.path);
        if (cached) {
          analysis = cached;
          cacheHit = true;
        } else {
          const svc = await getBeatSyncService();
          analysis = await svc.analyzeAudio(file!.path);
          // Cache the result in PDIM for 24 hours
          await cacheBeatAnalysis(file!.path, analysis);
        }
      } catch (cacheError) {
        logger.warn(
          { err: cacheError },
          "PDIM beat-analysis cache unavailable; performing uncached analysis",
        );
        const svc = await getBeatSyncService();
        analysis = await svc.analyzeAudio(file.path);
        cacheHit = false;
      }
      try {
        res.json({ success: true, analysis, cacheHit });
      } finally {
        await fsPromises.unlink(file.path).catch(() => {});
      }
    } catch (e) {
      if (req.file?.path) {
        await fsPromises.unlink(req.file.path).catch(() => {});
      }
      logger.warn(`[Route] analyze-audio-beats: ${(e as Error).message}`);
      res
        .status(500)
        .json({ success: false, error: (e as Error).message || "Beat analysis failed" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE-TO-VIDEO / MUSIC VIDEO GENERATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /beat-analyze
 * Quick audio beat analysis — returns BPM + sections without rendering a video.
 * Used by the Music Video Studio UI to show the song structure before committing.
 */
router.post(
  "/beat-analyze",
  requireAuthOnly,
  handleMediaUpload(mediaUpload.fields([{ name: "audio", maxCount: 1 }])),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const audioFile = files?.audio?.[0];
      if (!audioFile) {
        return res.status(400).json({ success: false, error: "audio file required" });
      }
      try {
        const svc = await getMusicVideoStudioService();
        const result = await Promise.race([
          svc.quickBeatAnalyze(audioFile.path),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Beat analysis timed out after 30s")), 30_000)
          ),
        ]);
        return res.json({ success: true, ...result });
      } finally {
        await fsPromises.unlink(audioFile.path).catch(() => {});
      }
    } catch (err) {
      logger.warn("[BeatAnalyze]", (err as any)?.message);
      return res.status(500).json({ success: false, error: (err as any)?.message || "Analysis failed" });
    }
  },
);

// Track async music video jobs in the same pattern as ffmpegJobs
interface MusicVideoJob {
  status: "processing" | "done" | "error";
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}
const musicVideoJobs = new Map<string, MusicVideoJob>();
const musicVideoJobOwners = new Map<string, string>();

// Prune jobs older than 15 minutes
setInterval(
  () => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [id, job] of musicVideoJobs.entries()) {
      if (job.createdAt < cutoff) {
        musicVideoJobs.delete(id);
        musicVideoJobOwners.delete(id);
      }
    }
  },
  3 * 60 * 1000,
);

/**
 * POST /generate-music-video
 * Accepts multipart/form-data:
 *   images[]         — one or more image files (JPEG/PNG/WebP)
 *   audio            — audio track (mp3/wav) — optional
 *   reference_voice  — voice reference sample — optional
 *
 * Body fields (all optional):
 *   template, platform, aspect_ratio, duration, genre,
 *   hook, body, cta, artistName,
 *   beatSync (bool), kenBurnsIntensity, colorGrade, transitionType,
 *   synthesize_voice (bool), voice_text, voice_profile_id
 *
 * Returns immediately with jobId — poll /music-video-job/:jobId for result.
 */
router.post(
  "/generate-music-video",
  requireAuthOnly,
  handleMediaUpload(
    mediaUpload.fields([
      { name: "images", maxCount: 10 },
      { name: "audio", maxCount: 1 },
      { name: "reference_voice", maxCount: 1 },
    ]),
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    const authenticatedUserId = req.user?.id;
    if (!authenticatedUserId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }
    const requestBody = (req.body ?? {}) as Record<string, unknown>;
    const requestFiles = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    if (requestBody.ai_generate_scenes === "true") {
      const hasExplicitDirection = [
        requestBody.topic,
        requestBody.hook,
        requestBody.body,
      ].some((value) => typeof value === "string" && value.trim().length > 0);
      const hasUrlDirection = [
        requestBody.topic,
        requestBody.hook,
        requestBody.body,
      ].some(
        (value) =>
          typeof value === "string" && /^https?:\/\//i.test(value.trim()),
      );
      const targetPlatform =
        typeof requestBody.platform === "string"
          ? requestBody.platform.trim()
          : "";
      if (!hasExplicitDirection) {
        return res.status(400).json({
          success: false,
          error: "A video topic, hook, or body is required",
        });
      }
      if (hasUrlDirection) {
        return res.status(400).json({
          success: false,
          error:
            "URL topics are not supported here; use the URL analysis workflow",
        });
      }
      if (!VALID_PLATFORMS.includes(targetPlatform)) {
        return res.status(400).json({
          success: false,
          error: "A supported platform is required for video generation",
        });
      }
      if (!requestFiles?.audio?.[0]) {
        return res.status(400).json({
          success: false,
          error: "An audio file is required for music video generation",
        });
      }
    }

    const jobId = `mvjob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    musicVideoJobOwners.set(jobId, authenticatedUserId);
    musicVideoJobs.set(jobId, { status: "processing", createdAt: Date.now() });

    // Respond immediately
    res.json({
      success: true,
      jobId,
      message: "Music video generation started",
    });

    // Process async
    (async () => {
      let voiceSynthPath: string | undefined;
      try {
        const files = req.files as
          | Record<string, Express.Multer.File[]>
          | undefined;
        const imageFiles = files?.images || [];
        const audioFile = files?.audio?.[0];
        const voiceRef = files?.reference_voice?.[0];

        const body = req.body as Record<string, string>;

        // ── AI Scene Generation mode (Music Video Studio) ─────────────────────
        // When ai_generate_scenes=true, MaxCore generates one photorealistic image
        // per detected song section — no user images needed. This is the capability
        // that surpasses InVideo (no beat sync, no music AI) and Google Veo (8s cap).
        if (body.ai_generate_scenes === "true") {
          if (!audioFile) {
            musicVideoJobs.set(jobId, {
              status: "error",
              error: "Audio file required for AI scene generation",
              createdAt: Date.now(),
            });
            return;
          }
          const userId = authenticatedUserId;
          const studioSvc = await getMusicVideoStudioService();
          const studioResult = await studioSvc.generateFullMusicVideo({
            audioPath: audioFile.path,
            userId,
            genre: body.genre,
            artistName: body.artist_name || body.artistName,
            artistStyle: body.artist_style,
            hook: body.hook,
            bodyText: body.body,
            cta: body.cta,
            intent: body.intent,
            direction: body.direction,
            context: body.context,
            awareness: body.awareness,
            platform: body.platform,
            aspectRatio: body.aspect_ratio || "9:16",
            colorGrade: (body.color_grade as "cinematic") || "cinematic",
            kenBurnsIntensity: (body.intensity as "moderate") || "moderate",
            transitionType: body.transition,
            // No app-side scene cap — MaxCore owns scene generation, so honor an
            // explicit client max_scenes but otherwise render every detected section.
            maxScenes: body.max_scenes ? Number(body.max_scenes) : undefined,
          });

          if (!studioResult.success) {
            musicVideoJobs.set(jobId, {
              status: "error",
              error: "Music video generation failed",
              createdAt: Date.now(),
            });
            return;
          }

          // The MaxCore renderer has already downloaded, validated, and stored
          // the completed video in PDIM. Do not look for or re-upload a local
          // scratch filename that no longer exists.
          if (!studioResult.url) {
            musicVideoJobs.set(jobId, {
              status: "error",
              error: "MaxCore completed without a durable video URL",
              createdAt: Date.now(),
            });
            return;
          }
          (studioResult as any).video_url = studioResult.url;

          musicVideoJobs.set(jobId, {
            status: "done",
            result: studioResult as unknown as Record<string, unknown>,
            createdAt: Date.now(),
          });
          logger.info({ jobId }, "[MusicVideo/Studio] Generation completed");
          return;
        }

        // ── Legacy mode: user provides their own images ────────────────────────
        if (!imageFiles.length) {
          musicVideoJobs.set(jobId, {
            status: "error",
            error: "At least one image is required",
            createdAt: Date.now(),
          });
          return;
        }

        const imagePaths = imageFiles
          .map((f: Express.Multer.File) => f.path)
          .filter(Boolean);
        const audioPath = audioFile?.path;

        // Optional: synthesize voice narration before rendering
        if (body.synthesize_voice === "true" && body.voice_text?.trim()) {
          try {
            const voiceSvc = await getVoiceSynthService();
            const voiceResult = await voiceSvc.synthesizeVoice(
              body.voice_text,
              {
                profileId: body.voice_profile_id || "smooth_narrator",
                referenceAudioPath: voiceRef?.path,
              },
            );
            if (voiceResult.success && voiceResult.outputPath) {
              voiceSynthPath = voiceResult.outputPath;
            } else {
              throw new Error(voiceResult.error || "Voice synthesis failed");
            }
          } catch (e) {
            throw new Error(`Voice synthesis failed: ${(e as Error).message}`);
          }
        }

        const imgSvc = await getImageToVideoService();
        const result = await imgSvc.imageToMusicVideo({
          imagePaths,
          audioPath,
          voiceSynthPath,
          template: body.template,
          platform: body.platform,
          aspect_ratio: body.aspect_ratio,
          duration: body.duration ? Number(body.duration) : undefined,
          genre: body.genre,
          hook: body.hook,
          body: body.body,
          cta: body.cta,
          artistName: body.artist_name || body.artistName,
          beatSync: body.beat_sync !== "false",
          kenBurnsIntensity:
            body.intensity === "subtle" ||
            body.intensity === "moderate" ||
            body.intensity === "dramatic"
              ? body.intensity
              : "moderate",
          colorGrade:
            body.color_grade === "none" ||
            body.color_grade === "cinematic" ||
            body.color_grade === "cool" ||
            body.color_grade === "neon" ||
            body.color_grade === "warm"
              ? body.color_grade
              : "cinematic",
          transitionType: body.transition,
          userId:
            (req.user as UserWithLegacyId | undefined)?.id?.toString() ||
            (req.user as UserWithLegacyId | undefined)?.userId?.toString(),
        });

        if (!result.success) {
          musicVideoJobs.set(jobId, {
            status: "error",
            error: "Music video generation failed",
            createdAt: Date.now(),
          });
          return;
        }
        if (!result.url) {
          throw new Error("MaxCore completed without a durable video URL");
        }
        (result as any).video_url = result.url;
        musicVideoJobs.set(jobId, {
          status: "done",
          result: result as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        });
        logger.info({ jobId }, "[MusicVideo] Generation completed");
        return;

      } catch (e) {
        logger.warn(
          { jobId, errorType: e instanceof Error ? e.name : typeof e },
          "[MusicVideo] Generation failed",
        );
        musicVideoJobs.set(jobId, {
          status: "error",
          error: "Music video generation failed",
          createdAt: Date.now(),
        });
      } finally {
        const files = req.files as
          | Record<string, Express.Multer.File[]>
          | undefined;
        const uploadPaths = Object.values(files || {})
          .flat()
          .map((file) => file?.path)
          .filter((filePath): filePath is string => Boolean(filePath));
        await Promise.all(
          uploadPaths.map((filePath) => fsPromises.unlink(filePath).catch(() => {})),
        );
        if (voiceSynthPath) {
          await fsPromises.unlink(voiceSynthPath).catch(() => {});
        }
      }
    })();
  },
);

/**
 * GET /music-video-job/:jobId
 * Poll for music video generation status.
 * Returns: { status: 'processing'|'done'|'error', result?, error? }
 */
router.get(
  "/music-video-job/:jobId",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const { jobId } = req.params as Record<string, string>;
    const job = musicVideoJobs?.get(jobId);

    if (!job || musicVideoJobOwners.get(jobId) !== req.user!.id) {
      return res
        .status(404)
        .json({ success: false, error: "Job not found or expired" });
    }

    if (job?.status === "processing") {
      return res.json({
        success: true,
        status: "processing",
        message: "Music video is being rendered…",
      });
    }

    if (job?.status === "error") {
      // 200 (not 500) so the client poll can read the failure instead of throwing.
      return res.json({
        success: false,
        status: "failed",
        error: job.error,
      });
    }

    // Normalize to the contract the client expects: status "completed" plus a
    // flat videoUrl/thumbnailUrl (poster) so the new VideoPlayer can render.
    const doneResult = job.result as Record<string, unknown> | undefined;
    res.json({
      success: true,
      status: "completed",
      videoUrl: (doneResult?.url as string) ?? null,
      thumbnailUrl: (doneResult?.thumbnail_url as string) ?? null,
      result: job.result,
    });
  },
);

/**
 * GET /music-video-capabilities
 * Returns all available options for music video generation.
 */
router.get(
  "/music-video-capabilities",
  requireAuthOnly,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const [voiceSvc, _imgSvc] = await Promise.all([
        getVoiceSynthService(),
        getImageToVideoService(),
      ]);
      res.json({
        success: true,
        voices: voiceSvc.listVoiceProfiles().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          gender: p.gender,
        })),
        kenBurns: ["subtle", "moderate", "dramatic"],
        colorGrades: ["none", "warm", "cool", "cinematic", "neon"],
        transitions: [
          "fade",
          "fadeblack",
          "fadewhite",
          "slideleft",
          "slideright",
          "slideup",
          "slidedown",
          "wipeleft",
          "wiperight",
          "radial",
          "smoothleft",
          "smoothright",
          "circleopen",
          "circlecrop",
          "rectcrop",
          "dissolve",
          "pixelize",
          "horzopen",
          "vertopen",
        ],
        aspectRatios: ["9:16", "1:1", "16:9", "4:5"],
        platforms: [
          "tiktok",
          "instagram",
          "instagram_reels",
          "youtube",
          "facebook",
          "twitter",
          "linkedin",
        ],
        genres: [
          "trap",
          "r&b",
          "hip_hop",
          "pop",
          "edm",
          "house",
          "lofi",
          "gospel",
          "drill",
          "dancehall",
          "reggae",
          "metal",
          "blues",
          "classical",
        ],
        maxImages: 10,
        maxDurationSeconds: 60,
      });
    } catch (e) {
      res
        .status(500)
        .json({
          success: false,
          error: (e as Error).message || "Failed to load capabilities",
        });
    }
  },
);

export default router;
