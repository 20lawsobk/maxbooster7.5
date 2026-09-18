/*
 * MaxCore Proxy Routes
 * --------------------
 * Exposes the internal MaxCore (Python AI subsystem) endpoint surface through the
 * Node/Express `/api/*` layer so the frontend never has to talk to MaxCore
 * directly (avoids CORS, hides the MaxCore key, and lets us inject the
 * authenticated user id).
 *
 * Every route here forwards method + path + query + body to
 * `${AI_SERVER_URL}${req.originalUrl}` using Bearer auth ONLY — MaxCore
 * validates X-API-Key / X-Admin-Key schemes first and 401s the whole request
 * if either is present (see replit.md + .agents/memory/maxcore-auth-header.md).
 *
 * Response handling is content-type aware: JSON is parsed and re-sent, binary
 * media (image/video/audio/octet-stream) is streamed straight through so
 * downloads and previews work.
 */

import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { requireAdmin, requireAuthOnly } from "../middleware/auth.js";
import { logger } from "../logger.js";
import {
  absolutizeMaxcoreMediaUrls,
  getMaxcoreAdminHeaders,
  getMaxcoreGenerationHeaders,
  getMaxcoreOrigin,
  isAllowedMaxcoreMediaPath,
} from "../services/maxcoreConnector.js";

const router = Router();

// Imported MaxCore source documents this as an administrative API-key scope.
// It is routed separately below so application-level admin authorization is
// required before Max Booster supplies that trusted credential upstream.
const ADMIN_PATH_SUFFIXES = [
  "/platform/model/reload",
  "/training/start",
  "/training/stop",
  "/training/schedule",
  "/training/continuous/start",
  "/training/continuous/stop",
  "/training/puller/pull",
  "/training/puller/start",
  "/training/puller/stop",
  "/training/start-from-storage",
];

// Generous timeout — generation calls (image/video/audio) can be slow.
const GEN_TIMEOUT_MS = 120_000;
const BINARY_PREFIXES = ["image/", "video/", "audio/", "application/octet-stream"];

function isBinary(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return BINARY_PREFIXES.some((p) => ct.startsWith(p));
}

/**
 * Generic forwarder. Relays the incoming request to MaxCore at the same path.
 */
async function proxyToMaxCore(req: Request, res: Response): Promise<void> {
  const origin = getMaxcoreOrigin();
  if (!origin) {
    res.status(503).json({
      error: "MaxCore not configured",
      message: "AI_SERVER_URL is not set on this environment",
    });
    return;
  }

  // Enforce identity binding: a caller may only address their own user id in
  // path params (admins may address any). Prevents IDOR on routes like
  // /api/platform/ads/performance/:userId and /api/storage/artist/:profileId.
  const authUser = req.user as { id?: string; role?: string } | undefined;
  const paramId = req.params.userId || req.params.profileId;
  if (paramId && authUser?.role !== "admin" && paramId !== authUser?.id) {
    res.status(403).json({
      error: "Forbidden",
      message: "Cannot access another user's resources",
    });
    return;
  }

  const targetUrl = `${origin}${req.originalUrl}`;
  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";

  const headers: Record<string, string> = {
    ...getMaxcoreGenerationHeaders(),
    Accept: "application/json, */*",
  };
  if (authUser?.id) {
    // Internal trust-boundary header. MaxCore persists this identity in its
    // durable job record and enforces it for every subsequent job operation.
    headers["X-MaxCore-User-Id"] = authUser.id;
  }

  const isAdminPath = ADMIN_PATH_SUFFIXES.some((s) =>
    req.originalUrl.startsWith(`/api${s}`),
  );
  if (isAdminPath) {
    delete headers.Authorization;
    Object.assign(headers, getMaxcoreAdminHeaders());
  }

  let body: string | undefined;
  if (hasBody) {
    headers["Content-Type"] = "application/json";
    // Inject the authenticated user id (MaxCore requires user_id on several
    // generation routes) without clobbering anything the caller already sent.
    const src =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? { ...req.body }
        : {};
    if (authUser?.id) {
      src.user_id = authUser.id;
      src.userId = authUser.id;
    }
    try {
      body = JSON.stringify(src);
    } catch (e) {
      // fall back to undefined body
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });

    const contentType = upstream.headers.get("content-type");

    // Stream binary media straight through (downloads, previews, images)
    // without buffering the whole payload in memory.
    if (isBinary(contentType)) {
      res.status(upstream.status);
      if (contentType) res.setHeader("Content-Type", contentType);
      const disp = upstream.headers.get("content-disposition");
      if (disp) res.setHeader("Content-Disposition", disp);
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      if (upstream.body) {
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
      } else {
        res.end();
      }
      return;
    }

    const text = await upstream.text();
    res.status(upstream.status);
    if (contentType?.includes("application/json")) {
      try {
        const parsed = absolutizeMaxcoreMediaUrls(JSON.parse(text));
        res.json(parsed);
        return;
      } catch {
        // fall through to raw send if body wasn't valid JSON
      }
    }
    if (contentType) res.setHeader("Content-Type", contentType);
    res.send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const aborted = message.includes("aborted") || message.includes("timeout");
    logger.warn(
      `[MaxCoreProxy] ${method} ${req.originalUrl} → ${aborted ? "timeout" : "error"}: ${message}`,
    );
    res.status(aborted ? 504 : 502).json({
      error: aborted ? "MaxCore request timed out" : "MaxCore request failed",
      message,
      path: req.originalUrl,
    });
  }
}

async function proxyAudioUpload(req: Request, res: Response): Promise<void> {
  const origin = getMaxcoreOrigin();
  if (!origin) {
    res.status(503).json({ error: "MaxCore not configured" });
    return;
  }
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
  if (!contentType.startsWith("audio/")) {
    res.status(415).json({ error: "Content-Type must be a supported audio type" });
    return;
  }
  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > 100 * 1024 * 1024) {
    res.status(413).json({ error: "Audio upload exceeds size limit" });
    return;
  }
  try {
    const upstream = await fetch(`${origin}/api/audio/upload`, {
      method: "POST",
      headers: {
        ...getMaxcoreGenerationHeaders(),
        "Content-Type": contentType,
        "X-MaxCore-User-Id": userId,
      },
      body: req as unknown as BodyInit,
      duplex: "half",
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    } as RequestInit & { duplex: "half" });
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      // Preserve the MaxCore-local /uploads URL: callers pass it back to
      // analysis/video APIs; rewriting it to the browser media proxy would
      // destroy the owner-scoped input contract.
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "MaxCore audio upload failed", message });
  }
}

/**
 * Streams MaxCore-hosted media (images/audio/video generated by MaxCore) to
 * the browser through this same-origin path. Needed because in local mode
 * MaxCore's real origin is a loopback address the browser can never reach
 * directly (and http:// loopback URLs are CSP-blocked); see
 * absolutizeMaxcoreMediaUrls in maxcoreConnector.ts, which rewrites MaxCore's
 * relative media paths to `/api/maxcore-media${path}` for the browser to hit.
 * Publicly readable (no auth) since this only ever serves already-public
 * generated media (cover art, previews) — never a path outside `RELATIVE_MEDIA`.
 */
async function proxyMaxcoreMedia(req: Request, res: Response): Promise<void> {
  const origin = getMaxcoreOrigin();
  if (!origin) {
    res.status(503).json({ error: "MaxCore not configured" });
    return;
  }
  const rawSplat = req.params.mediaPath;
  const splat = Array.isArray(rawSplat) ? rawSplat.join("/") : rawSplat || "";
  const subPath = splat ? `/${splat}` : "";

  // Only ever forward the same media-prefixed, traversal-free paths
  // absolutizeMaxcoreMediaUrls itself rewrites to this proxy — this is a
  // PUBLIC unauthenticated route, so it must never become an open relay for
  // MaxCore's full GET surface.
  if (!isAllowedMaxcoreMediaPath(subPath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const targetUrl = `${origin}${subPath}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
    // Never follow a redirect blindly — that would let a compromised/misbehaving
    // MaxCore instance turn this public proxy into an open relay to arbitrary
    // hosts. Treat any redirect as an upstream failure instead.
    if (upstream.status >= 300 && upstream.status < 400) {
      res.status(502).json({ error: "MaxCore media redirect rejected" });
      return;
    }
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    const len = upstream.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    // Generated media is immutable-by-name (random ids), safe to cache.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (upstream.body) {
      Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[MaxCoreProxy] media fetch failed for ${targetUrl}: ${message}`);
    res.status(502).json({ error: "MaxCore media request failed" });
  }
}

/* ── Route registration (full paths; router mounted at "/") ───────────────── */

router.get("/api/maxcore-media/*mediaPath", proxyMaxcoreMedia);
router.post("/api/audio/upload", requireAuthOnly, proxyAudioUpload);

// Content & media generation
const POST_PATHS = [
  "/api/content/generate",
  "/api/generate/content",
  "/api/generate/text",
  "/api/generate/image",
  "/api/generate/audio",
  "/api/generate-video",
  "/api/generate/video",
  "/api/generate/campaign",
  "/api/campaigns",
  "/api/video/generate-ai",
  "/api/video/extend",
  "/api/platform/video/generate",
  "/api/platform/social/generate",
  "/api/platform/social/autopilot",
  "/api/platform/daw/generate",
  "/api/platform/distribution/plan",
  "/api/platform/ads/generate",
  "/api/platform/ads/autopilot",
  "/api/platform/ads/audience",
  "/api/platform/ads/optimize",
  "/api/platform/ads/record",
  // Analysis / scoring / prediction
  "/api/content/score",
  "/api/analyze",
  "/api/analyze/sentiment",
  "/api/analyze/audio",
  "/api/audio/analyze",
  "/api/safety/screen",
  "/api/infer/viral-score",
  "/api/optimize/ad",
  "/api/predict/engagement",
  "/api/audio/mastering-recommendation",
  "/api/audio/mixing-recommendation",
  // Artist / brand storage
  "/api/storage/artist/:profileId",
  "/api/storage/artist/:profileId/releases",
  // Training / model management
  "/api/train/feedback",
  "/api/training/start",
  "/api/training/stop",
  "/api/training/schedule",
  "/api/training/continuous/start",
  "/api/training/continuous/stop",
  "/api/training/puller/pull",
  "/api/training/puller/start",
  "/api/training/puller/stop",
  "/api/training/start-from-storage",
  "/api/platform/model/reload",
];

for (const p of POST_PATHS) {
  const isAdminPath = ADMIN_PATH_SUFFIXES.some((suffix) => p === `/api${suffix}`);
  router.post(p, isAdminPath ? requireAdmin : requireAuthOnly, proxyToMaxCore);
}
// Keep these registrations explicit: besides making the proxied contract easy to
// inspect, this lets route tooling enumerate the protected GET/DELETE endpoints.
router.get("/api/platform/video/generate", requireAuthOnly, proxyToMaxCore);
router.get(
  "/api/platform/ads/performance/:userId",
  requireAuthOnly,
  proxyToMaxCore,
);
router.get("/api/video-jobs", requireAuthOnly, proxyToMaxCore);
router.get("/api/video-job/:jobId", requireAuthOnly, proxyToMaxCore);
router.get(
  "/api/video-job/:jobId/preview/:sceneIdx",
  requireAuthOnly,
  proxyToMaxCore,
);
router.get(
  "/api/video-job/:jobId/download",
  requireAuthOnly,
  proxyToMaxCore,
);
router.get("/api/video-job/:jobId/file", requireAuthOnly, proxyToMaxCore);
router.get("/api/video-job/:jobId/video", requireAuthOnly, proxyToMaxCore);
router.get("/api/audio-job/:jobId", requireAuthOnly, proxyToMaxCore);
router.get("/api/audio/:jobId/stems", requireAuthOnly, proxyToMaxCore);
router.get("/api/audio/:jobId/midi", requireAuthOnly, proxyToMaxCore);
router.get(
  "/api/files/stems/:jobId/:filename",
  requireAuthOnly,
  proxyToMaxCore,
);
router.get(
  "/api/storage/artist/:profileId",
  requireAuthOnly,
  proxyToMaxCore,
);
router.get("/api/platform/model/info", requireAuthOnly, proxyToMaxCore);
router.get("/api/models/social/state", requireAuthOnly, proxyToMaxCore);
router.get("/api/models/advertising/state", requireAuthOnly, proxyToMaxCore);
router.get("/api/models/content/state", requireAuthOnly, proxyToMaxCore);
router.get("/api/models/engagement/state", requireAuthOnly, proxyToMaxCore);
router.get("/api/training/status", requireAdmin, proxyToMaxCore);
router.get("/api/training/logs", requireAdmin, proxyToMaxCore);
router.get("/api/training/datasets", requireAdmin, proxyToMaxCore);
router.get("/api/training/continuous/status", requireAdmin, proxyToMaxCore);
router.get("/api/training/continuous/history", requireAdmin, proxyToMaxCore);
router.get("/api/training/puller/status", requireAdmin, proxyToMaxCore);
router.get("/api/training/puller/sources", requireAdmin, proxyToMaxCore);
router.get("/api/campaigns", requireAuthOnly, proxyToMaxCore);
router.get("/api/campaigns/:campaignId", requireAuthOnly, proxyToMaxCore);

router.delete("/api/video-job/:jobId", requireAuthOnly, proxyToMaxCore);
router.delete("/api/campaigns/:campaignId", requireAuthOnly, proxyToMaxCore);
router.patch(
  "/api/campaigns/:campaignId/posts/:postId",
  requireAuthOnly,
  proxyToMaxCore,
);
router.post(
  "/api/campaigns/:campaignId/schedule",
  requireAuthOnly,
  proxyToMaxCore,
);

export default router;
