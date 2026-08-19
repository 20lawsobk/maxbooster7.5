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

function awarenessModeForPath(path: string): string | null {
  const p = path.toLowerCase();
  if (p.includes("/generate/image") || p.includes("/generate/content") || p.includes("/platform/social")) return "content";
  if (p.includes("/generate/audio") || p.includes("/platform/audio-job") || p.includes("/audio")) return "music";
  if (p.includes("/platform/video") || p.includes("/generate-video") || p.includes("/generate/video") || p.includes("/video/")) return "video_script";
  if (p.includes("/optimize/ad") || p.includes("/predict/engagement") || p.includes("/platform/advertising")) return "ad_copy";
  return null;
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

  // Best-effort awareness injection: try multiple candidate module paths so
  // this file doesn't hard-depend on a single layout. This never blocks the
  // request for more than a short timeout (2s).
  try {
    const mode = awarenessModeForPath(req.originalUrl || req.path || "");
    if (mode) {
      const candidates = [
        "../services/contentAwarenessService.js",
        "../../awareness layer/ContentGenerationAwarenessService.js",
        "../awareness layer/ContentGenerationAwarenessService.js",
        "../../services/contentAwarenessService.js",
      ];
      let mod: any = null;
      for (const p of candidates) {
        try {
          // dynamic import — path may or may not exist depending on workspace
          // layout; swallow errors and continue to next candidate
           
          // Use import() instead of require to respect ESM
          // @ts-ignore dynamic import
          mod = await import(p);
          if (mod) break;
        } catch (e) {
          // ignore and try next
        }
      }

      const contentAwarenessService = mod?.contentAwarenessService || mod?.default?.contentAwarenessService || mod?.default;
      if (contentAwarenessService && typeof contentAwarenessService.getContextForMode === "function") {
        const ctx = await Promise.race([
          contentAwarenessService.getContextForMode(mode),
          new Promise((r) => setTimeout(() => r(null), 2000)),
        ]);
        if (ctx && (ctx as any).confidence > 0 && (ctx as any).contextString) {
          if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
            try {
              // preserve existing body but attach awareness
              if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
                (req as any).body = { ...(req.body as Record<string, unknown>), awareness: (ctx as any).contextString };
              } else {
                (req as any).body = { awareness: (ctx as any).contextString };
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }
  } catch (e) {
    logger.debug({ err: e }, "[MaxCoreProxy] awareness injection failed:");
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
