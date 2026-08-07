/**
 * MaxCore Proxy Routes
 * --------------------
 * Exposes the external MaxCore (Python AI server) endpoint surface through the
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
} from "../services/maxcoreConnector.js";

const router = Router();

// Imported MaxCore source documents this as an administrative API-key scope.
// It is routed separately below so application-level admin authorization is
// required before Max Booster supplies that trusted credential upstream.
const ADMIN_PATH_SUFFIXES = [
  "/platform/model/reload",
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
    // Bind identity to the authenticated session — overwrite unconditionally so
    // a caller cannot act as another user by supplying their own user_id.
    if (authUser?.id) {
      src.user_id = authUser.id;
      src.userId = authUser.id;
    }
    body = JSON.stringify(src);
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
        res.json(absolutizeMaxcoreMediaUrls(JSON.parse(text)));
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

/* ── Route registration (full paths; router mounted at "/") ───────────────── */

// Content & media generation
const POST_PATHS = [
  "/api/content/generate",
  "/api/generate/content",
  "/api/generate/text",
  "/api/generate/image",
  "/api/generate/audio",
  "/api/generate-video",
  "/api/generate/video",
  "/api/video/generate-ai",
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
  "/api/predict/engagement",
  // Artist / brand storage
  "/api/storage/artist/:profileId",
  "/api/storage/artist/:profileId/releases",
  // Training / model management
  "/api/training/start-from-storage",
  "/api/platform/model/reload",
];

const GET_PATHS = [
  "/api/platform/video/generate",
  "/api/platform/ads/performance/:userId",
  "/api/video-jobs",
  "/api/video-job/:jobId",
  "/api/video-job/:jobId/preview/:sceneIdx",
  "/api/video-job/:jobId/download",
  "/api/video-job/:jobId/file",
  "/api/video-job/:jobId/video",
  "/api/audio-job/:jobId",
  "/api/storage/artist/:profileId",
  "/api/platform/model/info",
];

const DELETE_PATHS = ["/api/video-job/:jobId"];

for (const p of POST_PATHS) {
  const isAdminPath = ADMIN_PATH_SUFFIXES.some((suffix) => p === `/api${suffix}`);
  router.post(p, isAdminPath ? requireAdmin : requireAuthOnly, proxyToMaxCore);
}
for (const p of GET_PATHS) router.get(p, requireAuthOnly, proxyToMaxCore);
for (const p of DELETE_PATHS) router.delete(p, requireAuthOnly, proxyToMaxCore);

export default router;
