// @ts-nocheck
/**
 * Content Analysis API Routes
 * Provides endpoints for analyzing multimodal content (images, videos, audio, text, websites)
 * Powers AI autopilot learning from actual content features, not just engagement metrics
 */

import { Router } from "express";
import { promises as dns } from "dns";
import { isIPv4 as netIsIPv4 } from "net";
import { Transform } from "stream";
import {
  ContentAnalysisUpstreamError,
  contentAnalysisService,
  normalizeOwnedAudioAsset,
} from "../services/contentAnalysisService";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { users, posts, adCampaigns } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { AIUnavailableError } from "../lib/aiSource.js";
import {
  getMaxcoreGenerationHeaders,
  getMaxcoreOrigin,
  maxcoreUrl,
} from "../services/maxcoreConnector.js";

const analysisErrorStatus = (error: unknown) =>
  error instanceof ContentAnalysisUpstreamError
    ? error.status
    : error instanceof AIUnavailableError
      ? 503
      : 500;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const MAXCORE_ANALYSIS_ASSET =
  /^\/uploads\/analysis-inputs\/[a-f0-9]{64}\/[a-f0-9]{32}\.(?:jpg|png|webp|mp4|webm|mov)$/;

// ─── Shared IP-safety helpers (pre-flight, defense-in-depth) ─────────────────
// MaxCore's native fetcher performs the connect-time SSRF check; these checks
// are an early-rejection layer to block obvious private targets.

const PRIVATE_IPV4_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;

const PRIVATE_IPV6_RE =
  /^(::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe[89ab][0-9a-f]:|::$)/i;

/**
 * Returns true when `raw` is a private/reserved/loopback IP address.
 * Handles plain IPv4, plain IPv6, bracket-quoted IPv6, and
 * IPv4-mapped IPv6 (::ffff:a?.b.c?.d).
 */
function isReservedIp(raw: string): boolean {
  let addr = raw?.toLowerCase();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr?.slice(1, -1);
  if (addr === "localhost" || addr === "0.0.0.0" || addr === "::1") return true;
  // IPv4-mapped IPv6 — extract the embedded IPv4 part.
  if (addr?.startsWith("::ffff:")) {
    const embedded = addr?.slice(7);
    if (netIsIPv4(embedded))
      return embedded === "0.0.0.0" || PRIVATE_IPV4_RE?.test(embedded);
    return true; // hex-only form — conservatively block
  }
  return PRIVATE_IPV4_RE?.test(addr) || PRIVATE_IPV6_RE?.test(addr);
}

/**
 * Validates that a URL is syntactically correct, uses http/https, and does NOT
 * resolve to a private/internal address. The DNS resolution step closes the
 * DNS-rebinding bypass that a hostname-only regex check cannot catch.
 *
 * Note: This is defense-in-depth. The service layer also enforces the same
 * policy at connect time via a custom http/https Agent.
 */
async function validateExternalUrl(raw: string): Promise<string> {
  let normalised = raw?.trim();
  // Upload returns an owner-scoped opaque MaxCore path. It must remain relative:
  // the native worker recognizes this shape and resolves it under the caller's
  // hashed owner directory without making an HTTP request.
  if (MAXCORE_ANALYSIS_ASSET.test(normalised)) {
    return normalised;
  }
  if (normalised && !/^https?:\/\//i?.test(normalised)) {
    normalised = "https://" + normalised;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalised);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed?.protocol !== "https:" && parsed?.protocol !== "http:") {
    throw new Error("Invalid URL protocol");
  }
  // MaxCore-owned temporary assets may intentionally live on its private/local
  // origin. They are safe because MaxCore enforces ownership using the actor
  // header; no arbitrary private origin is granted this exception.
  const maxcoreOrigin = getMaxcoreOrigin();
  if (maxcoreOrigin && parsed.origin === new URL(maxcoreOrigin).origin) {
    return parsed.href;
  }
  // parsed?.hostname strips brackets from IPv6 literals (e?.g. [::1] → ::1).
  const hostname = parsed?.hostname.toLowerCase();
  if (isReservedIp(hostname)) {
    throw new Error("URL resolves to a private or reserved address");
  }
  // Resolve DNS and validate every returned address.
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns?.lookup(hostname, { all: true });
  } catch {
    throw new Error("Unable to resolve URL hostname");
  }
  for (const { address } of addresses) {
    if (isReservedIp(address)) {
      throw new Error("URL resolves to a private or reserved address");
    }
  }
  return parsed?.href;
}

function actorId(req: { user?: { id?: unknown } }): string {
  const id = req.user?.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Authenticated user is missing an id");
  }
  return id;
}

const router = Router();

// 120M req/s system capacity — 7.2B per 15-minute window per user/IP.
// Content analysis is compute-heavy; the AI inference layer (MaxCore) handles
// back-pressure independently, so the HTTP rate limit matches global capacity.
const contentAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7_200_000_000,
  message: "Too many content analysis requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Middleware to check if user has a paid subscription (required for content analysis)
// Note: There is no free tier - all content analysis requires a paid subscription
const requirePremium = async (
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  next: Record<string, unknown>,
) => {
  try {
    if (!req.user) {
      return (res.status as any)(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, (req.user as any).id),
    });

    if (!user) {
      return (res.status as any)(404).json({ error: "User not found" });
    }

    // Only paid subscribers (monthly/yearly/lifetime) and admins can access
    const paidTiers = ["monthly", "yearly", "lifetime"];
    if (
      (user?.subscriptionTier && paidTiers?.includes(user?.subscriptionTier)) ||
      user?.role === "admin" ||
      (user as any)?.isAdmin
    ) {
      return next();
    }

    return (res.status as any)(403).json({
      error: "Paid subscription required",
      message:
        "Content analysis features require a paid subscription. Upgrade to access multimodal AI analysis.",
      upgradeUrl: "/pricing",
    });
  } catch (error) {
    logger.warn({ err: error }, "Premium check error:");
    (res.status as any)(500).json({ error: "Failed to verify subscription" });
  }
};

// Apply rate limiting, authentication, and premium requirement to all routes
router.use(contentAnalysisLimiter);
router.use(requireAuth);
router.use(requirePremium);

/**
 * Stream an authenticated raw image/video to MaxCore-owned temporary storage.
 * The body is intentionally raw (not multipart), allowing it to be proxied
 * without buffering it in application memory.
 */
router.post("/assets", async (req, res) => {
  const kind = req.query.kind;
  if (kind !== "image" && kind !== "video") {
    return res.status(400).json({ error: 'kind must be "image" or "video"' });
  }

  const contentType = String(req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!allowed.has(contentType)) {
    return res.status(415).json({ error: `Unsupported ${kind} content type` });
  }

  const limit = kind === "image" ? 16 * 1024 * 1024 : 100 * 1024 * 1024;
  const declaredLength = Number(req.headers["content-length"]);
  if (
    Number.isFinite(declaredLength) &&
    (declaredLength <= 0 || declaredLength > limit)
  ) {
    return res.status(declaredLength > limit ? 413 : 400).json({
      error: declaredLength > limit ? "Upload is too large" : "Upload is empty",
    });
  }

  let seen = 0;
  let tooLarge = false;
  const bounded = new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length;
      if (seen > limit) {
        tooLarge = true;
        callback(new Error("UPLOAD_TOO_LARGE"));
        return;
      }
      callback(null, chunk);
    },
  });
  req.pipe(bounded);

  try {
    const upstream = await fetch(
      `${maxcoreUrl("/api/analysis/upload")}?kind=${kind}`,
      {
        method: "POST",
        headers: {
          ...getMaxcoreGenerationHeaders(),
          "X-MaxCore-User-Id": actorId(req),
          "Content-Type": contentType,
          ...(Number.isFinite(declaredLength)
            ? { "Content-Length": String(declaredLength) }
            : {}),
        },
        body: bounded,
        duplex: "half",
        signal: AbortSignal.timeout(600_000),
        redirect: "manual",
      } as RequestInit & { duplex: "half" },
    );
    if (!upstream.ok) {
      const status = [400, 413, 415, 422, 429].includes(upstream.status)
        ? upstream.status
        : 503;
      return res.status(status).json({
        error:
          status === 503
            ? "Content analysis storage is unavailable"
            : "Upload was rejected",
      });
    }
    const value = await upstream.json().catch(() => null);
    if (
      !value ||
      typeof value.url !== "string" ||
      !value.url ||
      typeof value.expires_at !== "string" ||
      !value.expires_at
    ) {
      return res
        .status(503)
        .json({ error: "Content analysis storage returned an invalid response" });
    }
    return res.json({ url: value.url, expires_at: value.expires_at });
  } catch (error) {
    if (tooLarge || (error instanceof Error && error.message === "UPLOAD_TOO_LARGE")) {
      return res.status(413).json({ error: "Upload is too large" });
    }
    logger.warn({ err: error }, "Content analysis asset upload failed");
    return res
      .status(503)
      .json({ error: "Content analysis storage is unavailable" });
  }
});

/**
 * Analyze image content
 * POST /api/content-analysis/image
 * Body: { imageUrl: string }
 */
router.post("/image", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    let safeImageUrl: string;
    try {
      safeImageUrl = await validateExternalUrl(imageUrl);
    } catch {
      return res.status(400).json({ error: "Invalid or unsafe URL" });
    }

    const analysis = await contentAnalysisService.analyzeImage(
      safeImageUrl,
      actorId(req),
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Image analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to analyze image",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Analyze video content
 * POST /api/content-analysis/video
 * Body: { videoUrl: string, duration?: number }
 */
router.post("/video", async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: "videoUrl is required" });
    }

    let safeVideoUrl: string;
    try {
      safeVideoUrl = await validateExternalUrl(videoUrl);
    } catch {
      return res.status(400).json({ error: "Invalid or unsafe URL" });
    }

    const analysis = await contentAnalysisService.analyzeVideo(
      safeVideoUrl,
      actorId(req),
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Video analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to analyze video",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Analyze audio content
 * POST /api/content-analysis/audio
 * Body: { audioUrl: string, metadata?: any }
 */
router.post("/audio", async (req, res) => {
  try {
    const { audioUrl, metadata } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: "audioUrl is required" });
    }

    const ownedAudioAsset = normalizeOwnedAudioAsset(audioUrl);
    if (!ownedAudioAsset) {
      return res.status(422).json({
        error: "audioUrl must be an owned asset returned by /api/audio/upload",
      });
    }

    const analysis = await contentAnalysisService.analyzeAudio(
      ownedAudioAsset,
      metadata,
      actorId(req),
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Audio analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to analyze audio",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Analyze text content
 * POST /api/content-analysis/text
 * Body: { text: string }
 */
router.post("/text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    if (typeof text !== "string" || !text.trim()) {
      return res.status(422).json({ error: "text must be a non-empty string" });
    }
    const analysis = await contentAnalysisService.analyzeText(text, actorId(req));

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Text analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to analyze text",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Analyze website content
 * POST /api/content-analysis/website
 * Body: { url: string }
 */
router.post("/website", async (req, res) => {
  try {
    const { url } = req.body;

    logger.info(
      {
        receivedUrl: url,
        bodyKeys: Object.keys(req.body || {}),
        contentType: req.headers["content-type"],
      },
      "[ContentAnalysis] /website request received",
    );

    if (!url) {
      logger.warn(
        { body: req.body },
        "[ContentAnalysis] /website rejected — url missing",
      );
      return res.status(400).json({ error: "url is required" });
    }

    let safeUrl: string;
    try {
      safeUrl = await validateExternalUrl(url);
    } catch (validationError) {
      logger.warn(
        { url, err: validationError },
        "[ContentAnalysis] /website rejected — URL validation failed",
      );
      return res.status(400).json({ error: "Invalid or unsafe URL" });
    }

    const analysis = await contentAnalysisService.analyzeWebsite(
      safeUrl,
      actorId(req),
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Website analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to analyze website",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Batch analyze content for a social media post or campaign
 * POST /api/content-analysis/batch
 * Body: {
 *   mediaType: 'image' | 'video' | 'text',
 *   mediaUrl?: string,
 *   text?: string,
 *   landingPageUrl?: string,
 *   videoDuration?: number
 * }
 */
router.post("/batch", async (req, res) => {
  try {
    const { mediaType, mediaUrl, text, landingPageUrl, videoDuration } =
      req.body;

    const results: Record<string, unknown> = {};

    if (mediaType === "image" && mediaUrl) {
      let safeMediaUrl: string;
      try {
        safeMediaUrl = await validateExternalUrl(mediaUrl);
      } catch {
        return res.status(400).json({ error: "Invalid or unsafe mediaUrl" });
      }
      results.image = await contentAnalysisService.analyzeImage(
        safeMediaUrl,
        actorId(req),
      );
    }

    if (mediaType === "video" && mediaUrl) {
      let safeMediaUrl: string;
      try {
        safeMediaUrl = await validateExternalUrl(mediaUrl);
      } catch {
        return res.status(400).json({ error: "Invalid or unsafe mediaUrl" });
      }
      results.video = await contentAnalysisService.analyzeVideo(
        safeMediaUrl,
        actorId(req),
      );
    }

    if (text) {
      if (typeof text !== "string") {
        return res.status(422).json({ error: "text must be a string" });
      }
      results.text = await contentAnalysisService.analyzeText(text, actorId(req));
    }

    if (landingPageUrl) {
      let safeLandingPageUrl: string;
      try {
        safeLandingPageUrl = await validateExternalUrl(landingPageUrl);
      } catch {
        return res
          .status(400)
          .json({ error: "Invalid or unsafe landingPageUrl" });
      }
      results.website = await contentAnalysisService.analyzeWebsite(
        safeLandingPageUrl,
        actorId(req),
      );
    }

    res.json({
      success: true,
      contentAnalysis: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Batch analysis error:");
    res.status(analysisErrorStatus(error)).json({
      success: false,
      error: "Failed to perform batch analysis",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

/**
 * Get content analysis for existing post or campaign
 * GET /api/content-analysis/:type/:id
 * type: 'post' | 'campaign'
 * id: post or campaign ID
 */
router.get("/:type/:id", requireAuth, async (req, res) => {
  try {
    const { type, id } = req.params as Record<string, string>;

    if (type !== "post" && type !== "campaign") {
      return res.status(400).json({
        error: 'Invalid type. Must be "post" or "campaign"',
      });
    }

    if (type === "post") {
      const [post] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, id), eq(posts.userId, actorId(req))))
        .limit(1);

      if (!post) {
        return res
          .status(404)
          .json({ success: false, error: "Post not found" });
      }

      return res.json({
        success: true,
        type: "post",
        id: post.id,
        content: post.content,
        platform: post.platform,
        status: post.status,
        approvalStatus: post.approvalStatus,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        engagementData: post.engagement || null,
        mediaUrls: post.mediaUrls || [],
      });
    }

    if (type === "campaign") {
      const [campaign] = await db
        .select()
        .from(adCampaigns)
        .where(
          and(
            eq(adCampaigns.id, id),
            eq(adCampaigns.userId, actorId(req)),
          ),
        )
        .limit(1);

      if (!campaign) {
        return res
          .status(404)
          .json({ success: false, error: "Campaign not found" });
      }

      return res.json({
        success: true,
        type: "campaign",
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        platform: campaign.platform,
        budget: campaign.budget,
        performance: campaign.performance,
        targetAudience: campaign.targetAudience,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      });
    }
  } catch (error) {
    logger.warn({ err: error }, "Content analysis retrieval error:");
    res.status(500).json({
      success: false,
      error: "Failed to retrieve content analysis",
      message: error instanceof Error ? error?.message : "Unknown error",
    });
  }
});

export default router;
