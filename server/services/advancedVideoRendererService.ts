/**
 * Advanced Video Renderer Service
 *
 * MaxCore is the ONLY video renderer. Always running, never down.
 * No local FFmpeg fallback. No Python AI fallback.
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import fsPromises from "fs/promises";
import path from "path";
import { logger } from "../logger.js";
import type {
  VideoGenOptions,
  VideoGenResult,
} from "./videoGeneratorService.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 min

const MAXCORE_ORIGIN = (process?.env.AI_SERVER_URL || "").replace(/\/+$/, "");
const MC_AI_KEY =
  process?.env.AI_SERVER_KEY || process?.env.MAXCORE_ADMIN_KEY || "";
const LOCAL_VIDEO_DIR = path?.join(process?.cwd(), "uploads", "videos");

// ── MaxCore video URL cache ───────────────────────────────────────────────────

/**
 * Maps filename → absolute MaxCore URL for the video-proxy route.
 * Populated when local caching fails so the proxy can still serve the video.
 * Capped at MAX_URL_STORE_SIZE entries (oldest evicted first) to prevent
 * unbounded memory growth in long-running production deployments.
 */
const MAX_URL_STORE_SIZE = 500;
export const maxcoreVideoUrlStore = new Map<string, string>();

function urlStoreSet(filename: string, url: string): void {
  if (maxcoreVideoUrlStore?.size >= MAX_URL_STORE_SIZE) {
    const firstKey = maxcoreVideoUrlStore?.keys().next().value;
    if (firstKey !== undefined) maxcoreVideoUrlStore?.delete(firstKey);
  }
  maxcoreVideoUrlStore?.set(filename, url);
}

function maxcoreAuthHeaders(): Record<string, string> {
  // Bearer ONLY — MaxCore validates X-Admin-Key/X-API-Key schemes first
  // and 401s the whole request if they're present (see replit.md).
  return {
    Authorization: `Bearer ${MC_AI_KEY}`,
  };
}

/**
 * Returns true if the buffer starts with known video file magic bytes.
 *   MP4 / MOV: bytes 4–7 are the ASCII string 'ftyp'
 *   WebM:      first 4 bytes are 0x1A 0x45 0xDF 0xA3
 *   AVI:       starts with 'RIFF'
 *
 * Also returns true for large binary buffers that don't look like HTML — a
 * real video will always be many megabytes, never 683 bytes of index.html.
 */
function looksLikeRealVideo(buf: Buffer): boolean {
  if (buf.length < 100) return false;

  const isMP4 = buf.slice(4, 8).toString("ascii") === "ftyp";
  const isWebM =
    buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const isAVI = buf.slice(0, 4).toString("ascii") === "RIFF";

  if (isMP4 || isWebM || isAVI) return true;

  // Reject anything that looks like HTML/text
  const head = buf.slice(0, 200).toString("utf8").toLowerCase();
  if (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.startsWith("{") ||
    head.startsWith("[")
  )
    return false;

  // Accept anything large and binary that isn't HTML — real video files are always > 100 KB
  return buf?.length > 100_000;
}

/**
 * Extract the MaxCore job UUID from a filename like "video_<uuid>.mp4"
 */
function extractJobUuid(filename: string): string | null {
  const m = filename?.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m ? m[1] : null;
}

/**
 * Candidate URL paths to try when downloading a video from MaxCore.
 * Ordered: the raw URL MaxCore reported FIRST (its file-serving layer now
 * serves /uploads/videos/* directly — verified 2026-07-14), then legacy API
 * download routes as fallbacks for older MaxCore deployments.
 */
function candidateUrls(rawUrl: string): string[] {
  const absolute = rawUrl?.startsWith("http")
    ? rawUrl
    : `${MAXCORE_ORIGIN}${rawUrl}`;
  const filename = path?.basename(rawUrl?.split("?")[0]);
  const uuid = extractJobUuid(filename);

  // The URL MaxCore itself reported — authoritative, try it first.
  const urls: string[] = [absolute];

  // Job-ID-based download routes (legacy fallbacks)
  if (uuid) {
    urls?.push(
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/download`,
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/file`,
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/video`,
      `${MAXCORE_ORIGIN}/api/download/${uuid}`,
      `${MAXCORE_ORIGIN}/api/video/${uuid}`,
      `${MAXCORE_ORIGIN}/api/video/${uuid}.mp4`,
      `${MAXCORE_ORIGIN}/api/videos/${uuid}`,
      `${MAXCORE_ORIGIN}/api/videos/${uuid}.mp4`,
      `${MAXCORE_ORIGIN}/api/render/${uuid}/download`,
    );
  }

  // Filename-based /api/* routes (bypass SPA catch-all)
  urls?.push(
    `${MAXCORE_ORIGIN}/api/uploads/${filename}`,
    `${MAXCORE_ORIGIN}/api/uploads/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/video/${filename}`,
    `${MAXCORE_ORIGIN}/api/generated/${filename}`,
    `${MAXCORE_ORIGIN}/api/generated/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/render/${filename}`,
    `${MAXCORE_ORIGIN}/api/output/${filename}`,
    `${MAXCORE_ORIGIN}/api/media/${filename}`,
    `${MAXCORE_ORIGIN}/api/download/${filename}`,
    `${MAXCORE_ORIGIN}/api/stream/${filename}`,
    `${MAXCORE_ORIGIN}/api/files/${filename}`,
    `${MAXCORE_ORIGIN}/api/static/videos/${filename}`,
  );

  // Non-/api/ static paths (caught by SPA but worth trying)
  urls?.push(
    `${MAXCORE_ORIGIN}/uploads/${filename}`,
    `${MAXCORE_ORIGIN}/uploads/videos/${filename}`,
    `${MAXCORE_ORIGIN}/videos/${filename}`,
    `${MAXCORE_ORIGIN}/static/${filename}`,
    `${MAXCORE_ORIGIN}/static/videos/${filename}`,
    `${MAXCORE_ORIGIN}/generated/${filename}`,
    `${MAXCORE_ORIGIN}/output/${filename}`,
    `${MAXCORE_ORIGIN}/media/${filename}`,
  );

  return urls;
}

/**
 * Attempt to download the rendered video from MaxCore and cache it locally.
 * Always sends auth headers. Tries multiple URL path variants.
 *
 * Returns:
 *   - `/uploads/videos/<filename>`  if local caching succeeds (served from our origin)
 *   - `/api/social/video-proxy/<filename>` as fallback (server-side proxy with auth)
 *
 * The raw MaxCore URL is stored in maxcoreVideoUrlStore so the proxy can use it.
 */
async function cacheVideoLocally(rawUrl: string): Promise<string> {
  const filename = path?.basename(rawUrl?.split("?")[0]);
  const localPath = path?.join(LOCAL_VIDEO_DIR, filename);

  // Log the exact URL MaxCore returned so we can diagnose path issues
  logger?.info(
    `[AdvancedVideoRenderer] cacheVideoLocally — rawUrl from MaxCore: "${rawUrl}"`,
  );

  // Register the raw MaxCore URL for the proxy route regardless of what happens below
  const absoluteForProxy = rawUrl?.startsWith("http")
    ? rawUrl
    : `${MAXCORE_ORIGIN}${rawUrl}`;
  urlStoreSet(filename, absoluteForProxy);

  try {
    await fsPromises?.mkdir(LOCAL_VIDEO_DIR, { recursive: true });

    const candidates = candidateUrls(rawUrl);
    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: maxcoreAuthHeaders(),
          signal: AbortSignal.timeout(60_000),
        });
        const ct = response?.headers.get("content-type") ?? "unknown";
        const cl = response?.headers.get("content-length") ?? "unknown";
        if (!response?.ok) {
          logger?.info(
            `[AdvancedVideoRenderer] Candidate ${url} → HTTP ${response.status} ct="${ct}"`,
          );
          continue;
        }

        // Buffer the full response so we can inspect it with magic bytes.
        // Content-type alone is unreliable — MaxCore's SPA returns text/html for
        // any unrecognised path with 200 OK.  Magic-byte validation is definitive.
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!looksLikeRealVideo(buffer)) {
          const head = buffer
            .slice(0, 60)
            .toString("utf8")
            .replace(/[\r\n]/g, " ");
          logger.info(
            `[AdvancedVideoRenderer] Candidate ${url} → NOT video (HTTP 200, ct="${ct}", len=${cl}, head="${head}")`,
          );
          continue;
        }

        await fsPromises.writeFile(localPath, buffer);
        logger.info(
          `[AdvancedVideoRenderer] Video cached from ${url} — ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`,
        );
        urlStoreSet(filename, url);
        return `/uploads/videos/${filename}`;
      } catch (err) {
        logger.info(
          `[AdvancedVideoRenderer] Candidate ${url} fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    logger.warn(
      `[AdvancedVideoRenderer] All ${candidates.length} candidates failed for "${filename}" — proxy will stream from MaxCore: ${absoluteForProxy}`,
    );
  } catch (err) {
    logger.warn(
      `[AdvancedVideoRenderer] Local cache setup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Return proxy URL — our server will stream from MaxCore with auth
  return `/api/social/video-proxy/${filename}`;
}

// ── MaxCore video job status type ─────────────────────────────────────────────

interface MaxCoreVideoStatus {
  status: string;
  url?: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
  aspect_ratio?: string;
  hook?: string;
  body?: string;
  cta?: string;
  template?: string;
  template_name?: string;
  scenes_rendered?: number;
  scenes?: Array<{ type: string; text: string }>;
  genre_detected?: string;
  tone_used?: string;
  source?: string;
  error?: string;
}

/**
 * Poll MaxCore until the video job finishes, errors, or times out.
 * Uses poll() (not get()) so each attempt is a real HTTP request with no suppression.
 */
async function pollVideoJob(jobId: string): Promise<VideoGenResult | null> {
  logger.info(
    `[AdvancedVideoRenderer] Polling MaxCore job ${jobId} (max ${POLL_MAX_ATTEMPTS} × ${POLL_INTERVAL_MS / 1000}s)`,
  );

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await MaxCoreAIClient.poll<MaxCoreVideoStatus>(
      "/video-job/" + jobId,
    );
    if (!status) continue;

    if (status.status === "done" && status.url) {
      const servedUrl = await cacheVideoLocally(status.url);

      logger.info(
        `[AdvancedVideoRenderer] Job ${jobId} done after ${attempt + 1} poll(s) — serving: ${servedUrl}`,
      );
      return {
        success: true,
        url: servedUrl,
        filename: status.filename,
        width: status.width,
        height: status.height,
        duration: status.duration,
        hook: status.hook,
        body: status.body,
        cta: status.cta,
        template: status.template,
        template_name: status.template_name,
        scenes_rendered: status.scenes_rendered,
        source: "MaxCoreAI",
      };
    }

    if (status.status === "error") {
      logger.warn(
        `[AdvancedVideoRenderer] MaxCore job ${jobId} errored: ${status.error}`,
      );
      // Preserve MaxCore's own error text — do NOT collapse into the
      // generic timeout message the caller uses for a null return.
      return {
        success: false,
        error: status.error || "MaxCore video job failed",
        source: "MaxCoreAI",
      };
    }

    if (attempt % 15 === 14) {
      logger.info(
        `[AdvancedVideoRenderer] Job ${jobId} still ${status.status ?? "processing"} (${attempt + 1} polls)`,
      );
    }
  }

  logger.warn(
    `[AdvancedVideoRenderer] Job ${jobId} timed out after ${POLL_MAX_ATTEMPTS} poll attempts`,
  );
  return null;
}

// ── MaxCore photorealistic image fetch ───────────────────────────────────────
//
// Used by the Music Video Studio path (musicVideoStudioService) as a visual
// base. MaxCore is the ONLY source — fails explicitly when unavailable.

const PHOTO_CACHE_DIR = path.join(process.cwd(), "uploads", "photo_cache");

/** Aspect-ratio → [width, height] map, matching videoGeneratorService. */
const PHOTO_ASPECT_DIMS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1":  [1080, 1080],
  "4:5":  [1080, 1350],
};

/**
 * Requests a photorealistic background image from MaxCore /generate/image.
 * The prompt is assembled from the video's hook, topic, genre, and platform so
 * MaxCore's model can leverage its training data for music-specific scenes.
 *
 * MaxCore is the only source — throws (fail-explicit) when unavailable.
 * Returns an absolute local file path ready for FFmpeg input.
 */
export async function fetchPhotorealisticImage(
  topic: string,
  hook: string,
  genre: string,
  platform: string,
  aspectRatio: string,
): Promise<string> {
  await fsPromises.mkdir(PHOTO_CACHE_DIR, { recursive: true });

  const [W, H] = PHOTO_ASPECT_DIMS[aspectRatio] ?? PHOTO_ASPECT_DIMS["9:16"];

  // MaxCore's image endpoint composes its own awareness prompt (tone / goal /
  // audience / themes) server-side and RENDERS the prompt text as the artwork
  // headline (engine: maxbooster-pil-v1). Send ONLY the clean hook copy —
  // keyword-stuffed diffusion prompts ("8k resolution, no text, …") get
  // printed verbatim onto the card and look like debug output.
  const prompt = (hook || topic || "music artist").slice(0, 120);

  const result = requireMaxCore(
    await MaxCoreAIClient.generate<{
      url?: string;
      image_url?: string;
      src?: string;
      outputs?: Array<{ url?: string; src?: string }>;
    }>("/generate/image", {
      prompt,
      negative_prompt:
        "text, watermark, blurry, pixelated, low quality, cartoon, anime, illustration, sketch",
      width: W,
      height: H,
      quality: "photorealistic",
      style: "cinematic",
      genre: genre || "pop",
      platform,
      steps: 30,
      guidance_scale: 7.5,
      seed: Math.floor(Math.random() * 999_999),
    }),
    "video rendering",
  );

  const rawImageUrl =
    result?.url ??
    result?.image_url ??
    result?.src ??
    result?.outputs?.[0]?.url ??
    result?.outputs?.[0]?.src;

  // MaxCore may return a relative path ("/uploads/images/img_xxx.png") —
  // resolve it against MAXCORE_ORIGIN so the fetch works.
  const imageUrl = rawImageUrl
    ? rawImageUrl.startsWith("http://") || rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : rawImageUrl.startsWith("/")
        ? `${MAXCORE_ORIGIN}${rawImageUrl}`
        : null
    : null;

  if (!imageUrl) {
    throw new Error("MaxCore video rendering returned no image URL");
  }

  const rawExt = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
  const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
  const filename = `photo_${randomUUID().slice(0, 8)}.${ext}`;
  const localPath = path.join(PHOTO_CACHE_DIR, filename);

  const imgResp = await fetch(imageUrl, {
    // Bearer ONLY — MaxCore validates X-Admin-Key/X-API-Key schemes first
    // and 401s the whole request if they're present (see replit.md).
    headers: { Authorization: `Bearer ${MC_AI_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!imgResp.ok) {
    throw new Error(`MaxCore image download failed: ${imgResp.status}`);
  }
  const buf = Buffer.from(await imgResp.arrayBuffer());
  if (buf.length <= 5_000) {
    throw new Error("MaxCore image download returned an empty/invalid image");
  }
  await fsPromises.writeFile(localPath, buf);
  logger.info(
    `[PhotoReal] MaxCore image cached → ${filename} (${Math.round(buf.length / 1024)} KB)`,
  );
  return localPath;
}


/**
 * Grab a real first-frame poster from a rendered MP4 so the client `<video>`
 * shows an actual frame instead of a grey placeholder on mobile (where browsers
 * won't decode a frame without a poster). Best-effort: returns the poster URL,
 * or null if extraction fails — it must never fail the video render itself.
 *
 * posterForServedUrl: best-effort poster for a served video URL. Only locally-served files
 * (`/uploads/videos/...`) can be frame-extracted; proxy URLs return null.
 * Prefix-guarded so contract drift can never resolve an unexpected path
 * into the ffmpeg input. Never throws.
 */
async function posterForServedUrl(
  servedUrl: string | null | undefined,
): Promise<string | null> {
  if (!servedUrl || !servedUrl.startsWith("/uploads/videos/")) return null;
  try {
    return await generatePosterThumbnail(
      path.join(process.cwd(), servedUrl.replace(/^\/+/, "")),
    );
  } catch {
    return null;
  }
}

export async function generatePosterThumbnail(
  localMp4Path: string,
): Promise<string | null> {
  // Bounded ffmpeg/ffprobe runner — a poster is best-effort and must never
  // stall job completion behind a hung subprocess.
  const runBounded = (cmd: string, args: string[], timeoutMs: number) =>
    new Promise<string>((resolve, reject) => {
      const proc = spawn(cmd, [...args], { stdio: ["ignore", "pipe", "pipe"] });
      const outChunks: string[] = [];
      const errChunks: string[] = [];
      const killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`${cmd} poster step timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.stdout?.on("data", (d: Buffer) => outChunks.push(d.toString()));
      proc.stderr?.on("data", (d: Buffer) => errChunks.push(d.toString()));
      proc.on("close", (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve(outChunks.join(""));
        else
          reject(
            new Error(
              `${cmd} exited ${code}: ${errChunks.slice(-3).join("").slice(0, 200)}`,
            ),
          );
      });
      proc.on("error", (e) => {
        clearTimeout(killTimer);
        reject(e);
      });
    });

  // Mean luma (0-255) of a JPEG — detects near-black fade-in frames.
  const frameBrightness = async (jpgPath: string): Promise<number | null> => {
    try {
      const out = await runBounded(
        "ffmpeg",
        [
          "-v", "error",
          "-i", jpgPath,
          "-vf", "signalstats,metadata=print:file=-",
          "-f", "null", "-",
        ],
        5_000,
      );
      const m = out.match(/signalstats\.YAVG=([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    } catch {
      return null;
    }
  };

  const extractFrame = async (outPath: string, seekSec: number) =>
    runBounded(
      "ffmpeg",
      [
        "-y",
        "-ss", seekSec.toFixed(2),
        "-i", localMp4Path,
        // Pick the most representative frame from a short window instead of
        // whatever frame lands exactly at the seek point.
        "-vf", "thumbnail=30",
        "-frames:v", "1",
        "-q:v", "3",
        outPath,
      ],
      10_000,
    );

  try {
    await fsPromises.mkdir(LOCAL_VIDEO_DIR, { recursive: true });
    const outFilename = `poster_${randomUUID().slice(0, 8)}.jpg`;
    const outPath = path.join(LOCAL_VIDEO_DIR, outFilename);

    // Probe duration so we can seek past intro fades (best-effort).
    let durationSec = 0;
    try {
      const probed = await runBounded(
        "ffprobe",
        [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "csv=p=0",
          localMp4Path,
        ],
        5_000,
      );
      durationSec = parseFloat(probed.trim()) || 0;
    } catch {
      /* fall back to fixed seeks below */
    }

    // Videos fade in from black, so the 0s frame is a near-black "placeholder
    // looking" poster. Try ~25% in, then ~55% in, then the start.
    const seeks = durationSec > 0.5
      ? [
          Math.max(0.5, durationSec * 0.25),
          Math.min(durationSec - 0.2, durationSec * 0.55),
          0.1,
        ]
      : [1.0, 0.1];

    const MIN_BRIGHTNESS = 24; // YAVG below this reads as a black frame
    let extracted = false;
    for (const seek of seeks) {
      try {
        await extractFrame(outPath, seek);
      } catch {
        continue;
      }
      const stat = await fsPromises.stat(outPath).catch(() => null);
      if (!stat || stat.size < 1_000) continue;
      extracted = true;
      const brightness = await frameBrightness(outPath);
      // Unknown brightness = accept (we at least have a real frame).
      if (brightness === null || brightness >= MIN_BRIGHTNESS) break;
      logger.info(
        `[PhotoReal] Poster frame at ${seek.toFixed(1)}s too dark (YAVG=${brightness.toFixed(1)}) — trying a later frame`,
      );
    }

    // Only advertise a poster that is a real, non-trivial JPEG.
    const stat = await fsPromises.stat(outPath).catch(() => null);
    if (!extracted || !stat || stat.size < 1_000) {
      logger.warn("[PhotoReal] Poster frame missing or too small — skipping");
      return null;
    }
    logger.info(
      `[PhotoReal] Poster frame → ${outFilename} (${Math.round(stat.size / 1024)} KB)`,
    );
    return `/uploads/videos/${outFilename}`;
  } catch (err: unknown) {
    logger.warn(
      `[PhotoReal] Poster extraction failed (${(err as Error).message ?? String(err)}) — no poster`,
    );
    return null;
  }
}


// ── MaxCore end-to-end video job ──────────────────────────────────────────────
//
// MaxCore /api/generate-video renders the ENTIRE video itself — content
// intelligence, script, scene rendering, text, voiceover, and file serving all
// happen on the MaxCore server. This service only submits the job, polls
// /api/video-job/:id, and caches the finished MP4 locally (pure file
// transport — no local generation, compositing, or re-rendering in between).

interface MaxCoreVideoJobResponse {
  job_id?: string;
  status?: string;
  url?: string;
  video_url?: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
  hook?: string;
  body?: string;
  cta?: string;
  template?: string;
  template_name?: string;
  scenes_rendered?: number;
  hashtags?: string[];
  intelligence?: Record<string, unknown>;
}

/**
 * Render a video through MaxCore's own end-to-end job pipeline.
 *   Submit → POST /api/generate-video (requires `idea`; returns job_id)
 *   Poll   → GET /api/video-job/:id until status=done with a URL
 *   Cache  → download the finished MP4 locally (file transport only)
 *
 * Fails explicitly (AIUnavailableError → 503) when MaxCore is unavailable.
 * There is NO local rendering fallback — the MaxCore job owns the video.
 */
export async function renderVideo(
  opts: VideoGenOptions,
): Promise<VideoGenResult> {
  const startMs = Date.now();

  const idea =
    [opts.hook || opts.topic, opts.artist_name, opts.genre]
      .filter(Boolean)
      .join(" — ") || "music promo video";

  logger.info(
    `[AdvancedVideoRenderer] Submitting MaxCore video job — idea: "${idea.slice(0, 80)}"`,
  );

  const jobResp = await MaxCoreAIClient.infer<MaxCoreVideoJobResponse>(
    "/generate-video",
    {
      idea,
      topic: opts.topic || undefined,
      hook: opts.hook || undefined,
      body: opts.body || undefined,
      cta: opts.cta || undefined,
      platform: opts.platform || "tiktok",
      aspect_ratio: opts.aspect_ratio || "9:16",
      template: opts.template || undefined,
      duration: opts.duration || 10,
      artist_name: opts.artist_name || undefined,
      genre: opts.genre || undefined,
      tone: opts.tone || "energetic",
      goal: opts.goal || "growth",
      quality: opts.quality || undefined,
      voiceover: !!opts.voiceover,
      user_audio_path: opts.user_audio_path || undefined,
      user_id: opts.userId || "anonymous",
    },
  );

  if (!jobResp) {
    // MaxCore unavailable — fail explicitly (503). No local fallback.
    throw new AIUnavailableError("video generation");
  }

  const intelligence = (jobResp.intelligence ?? {}) as Record<string, unknown>;

  // Synchronous response — MaxCore rendered immediately
  const syncUrl = jobResp.url || jobResp.video_url;
  if (syncUrl) {
    const servedUrl = await cacheVideoLocally(syncUrl);
    logger.info(
      `[AdvancedVideoRenderer] Synchronous MaxCore render complete in ${Date.now() - startMs}ms`,
    );
    return {
      success: true,
      url: servedUrl,
      thumbnail_url: await posterForServedUrl(servedUrl),
      filename: jobResp.filename,
      width: jobResp.width,
      height: jobResp.height,
      duration: jobResp.duration,
      hook: jobResp.hook || opts.hook,
      body: jobResp.body || opts.body,
      cta: jobResp.cta || opts.cta,
      template: jobResp.template,
      template_name: jobResp.template_name,
      scenes_rendered: jobResp.scenes_rendered,
      hashtags: jobResp.hashtags,
      source: "MaxCoreAI",
      processing_time_ms: Date.now() - startMs,
      intelligence,
    } as unknown as VideoGenResult;
  }

  // Async job — poll MaxCore until the video is rendered and served
  if (jobResp.job_id) {
    const result = await pollVideoJob(jobResp.job_id);
    if (result && !result.success) {
      // Explicit MaxCore job error — surface its own error text.
      return {
        ...result,
        processing_time_ms: Date.now() - startMs,
      } as unknown as VideoGenResult;
    }
    if (result) {
      return {
        ...result,
        thumbnail_url: await posterForServedUrl(result.url as string),
        hook: result.hook || opts.hook,
        body: result.body || opts.body,
        cta: result.cta || opts.cta,
        processing_time_ms: Date.now() - startMs,
        intelligence,
      } as unknown as VideoGenResult;
    }
    return {
      success: false,
      error: `MaxCore job ${jobResp.job_id} did not complete within the polling window`,
      source: "MaxCoreAI",
      processing_time_ms: Date.now() - startMs,
    };
  }

  logger.warn(
    "[AdvancedVideoRenderer] MaxCore response missing both url and job_id",
  );
  return {
    success: false,
    error: "MaxCore returned neither a job_id nor a video URL",
    source: "MaxCoreAI",
    processing_time_ms: Date.now() - startMs,
  };
}
