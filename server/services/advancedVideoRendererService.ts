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
import { hybridStorageService } from "./hybridStorageService.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOrigin,
} from "./maxcoreConnector.js";
import { ensureMaxCoreAudioAsset } from "./maxcoreAssetTransport.js";
import { trustedMaxcoreOwner } from "../lib/maxcoreOwnerContext.js";
import {
  assertSafeSpawnArguments,
  restrictedChildEnvironment,
} from "./subprocessSafety.js";

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 min

const MAXCORE_ORIGIN = getMaxcoreOrigin();
const MC_AI_KEY = getMaxcoreGenerationKey();
const LOCAL_VIDEO_DIR = path?.join(process.cwd(), "uploads", "videos");

async function maxCoreOwnedRequest<T>(
  pathName: string,
  userId: string,
  init: RequestInit,
): Promise<T> {
  const owner = trustedMaxcoreOwner(userId);
  if (!owner) throw new AIUnavailableError("video generation requires authenticated ownership");
  if (!MAXCORE_ORIGIN || !MC_AI_KEY) {
    throw new AIUnavailableError("video generation");
  }
  try {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "POST") {
      if (typeof init.body !== "string") {
        throw new AIUnavailableError("video generation request is invalid");
      }
      let body: unknown;
      try {
        body = JSON.parse(init.body);
      } catch {
        throw new AIUnavailableError("video generation request is invalid");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AIUnavailableError("video generation request is invalid");
      }
      const result = await MaxCoreAIClient.generate<T>(
        pathName,
        body as Record<string, unknown>,
        owner,
        45_000,
        false,
      );
      if (result === null) throw new AIUnavailableError("video generation");
      return result;
    }
    if (method === "GET") {
      const result = await MaxCoreAIClient.poll<T>(
        pathName,
        owner,
        45_000,
        true,
      );
      if (result === null) throw new AIUnavailableError("video generation");
      return result;
    }
    throw new AIUnavailableError("video generation request method is unsupported");
  } catch (error) {
    if (error instanceof AIUnavailableError) throw error;
    throw new AIUnavailableError("video generation");
  }
}

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
    ...(trustedMaxcoreOwner() ? { "X-MaxCore-User-Id": trustedMaxcoreOwner()! } : {}),
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
 * Candidate MaxCore URL paths to try while retrieving a video for PDIM storage.
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
 * Download the rendered video from MaxCore and persist it to PDIM.
 * Always sends auth headers. Tries multiple URL path variants.
 *
 * The local process only holds the response buffer while it is uploaded; client
 * URLs always resolve through the authenticated PDIM hybrid-storage route. A
 * scratch copy is written briefly so ffmpeg can extract a poster frame — it is
 * deleted immediately after, whether or not poster extraction succeeds.
 */
async function cacheVideoLocally(
  rawUrl: string,
  userId: string,
): Promise<{ videoUrl: string; posterUrl: string | null }> {
  const filename = path?.basename(rawUrl?.split("?")[0]);

  // Retain the source URL for diagnostics only; it is never served to clients.
  const absoluteForProxy = rawUrl?.startsWith("http")
    ? rawUrl
    : `${MAXCORE_ORIGIN}${rawUrl}`;
  urlStoreSet(filename, absoluteForProxy);

  try {
    const candidates = candidateUrls(rawUrl);
    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: new URL(url).origin === new URL(MAXCORE_ORIGIN).origin
            ? { ...maxcoreAuthHeaders(), "X-MaxCore-User-Id": userId }
            : {},
          signal: AbortSignal.timeout(60_000),
        });
        const ct = response?.headers.get("content-type") ?? "unknown";
        const cl = response?.headers.get("content-length") ?? "unknown";
        if (!response?.ok) {
          logger.info(
            { status: response.status, contentType: ct },
            "[AdvancedVideoRenderer] MaxCore video candidate unavailable",
          );
          continue;
        }

        // Buffer the full response so we can inspect it with magic bytes.
        // Content-type alone is unreliable — MaxCore's SPA returns text/html for
        // any unrecognised path with 200 OK.  Magic-byte validation is definitive.
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!looksLikeRealVideo(buffer)) {
          logger.info(
            {
              contentType: ct,
              contentLength: cl,
              actualLength: buffer.length,
            },
            "[AdvancedVideoRenderer] MaxCore candidate did not contain video bytes",
          );
          continue;
        }

        const upload = await hybridStorageService.upload(
          userId,
          filename,
          buffer,
          "video/mp4",
          { folder: "videos", isPublic: true },
        );
        const pdimUrl = await hybridStorageService.getDownloadUrl(userId, upload.key);
        logger.info(
          { byteLength: buffer.length },
          "[AdvancedVideoRenderer] Video stored in authenticated storage",
        );
        urlStoreSet(filename, url);

        // Best-effort poster: write a scratch copy only long enough for
        // ffmpeg to grab a frame, then delete it — never served from disk.
        let posterUrl: string | null = null;
        const scratchPath = path.join(LOCAL_VIDEO_DIR, filename);
        try {
          await fsPromises.mkdir(LOCAL_VIDEO_DIR, { recursive: true });
          await fsPromises.writeFile(scratchPath, buffer);
          posterUrl = await generateAndStorePosterThumbnail(scratchPath, userId);
        } catch (posterErr) {
          logger.info(
            {
              errorType:
                posterErr instanceof Error ? posterErr.name : typeof posterErr,
            },
            "[AdvancedVideoRenderer] Poster scratch step skipped",
          );
        } finally {
          await fsPromises.unlink(scratchPath).catch(() => {});
        }

        return { videoUrl: pdimUrl, posterUrl };
      } catch (err) {
        logger.info(
          {
            errorType: err instanceof Error ? err.name : typeof err,
          },
          "[AdvancedVideoRenderer] MaxCore video candidate fetch failed",
        );
      }
    }

    logger.warn(
      { candidateCount: candidates.length },
      "[AdvancedVideoRenderer] Could not persist the MaxCore video",
    );
  } catch (err) {
    logger.warn(
      {
        errorType: err instanceof Error ? err.name : typeof err,
      },
      "[AdvancedVideoRenderer] Video persistence setup failed",
    );
  }

  throw new Error("Unable to persist the MaxCore video");
}

// ── MaxCore video job status type ─────────────────────────────────────────────

interface MaxCoreVideoStatus {
  status: string;
  resolved_media_manifest?: Record<string, unknown>;
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
async function pollVideoJob(jobId: string, userId: string): Promise<VideoGenResult | null> {
  logger.info(
    { maxAttempts: POLL_MAX_ATTEMPTS, intervalSeconds: POLL_INTERVAL_MS / 1000 },
    "[AdvancedVideoRenderer] Polling MaxCore video job",
  );

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await maxCoreOwnedRequest<MaxCoreVideoStatus>(
      "/video-job/" + jobId,
      userId,
      { method: "GET" },
    );
    if (!status) continue;

    if (status.status === "done" && status.url) {
      const { videoUrl, posterUrl } = await cacheVideoLocally(status.url, userId);

      logger.info(
        { polls: attempt + 1 },
        "[AdvancedVideoRenderer] MaxCore video job completed",
      );
      return {
        success: true,
        url: videoUrl,
        thumbnail_url: posterUrl,
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
        resolved_media_manifest: status.resolved_media_manifest,
        scenes: status.scenes,
        source: "MaxCoreAI",
      };
    }

    if (status.status === "error") {
      logger.warn(
        { polls: attempt + 1 },
        "[AdvancedVideoRenderer] MaxCore video job returned failure",
      );
      return {
        success: false,
        error: "Video generation failed",
        source: "MaxCoreAI",
      };
    }

    if (attempt % 15 === 14) {
      logger.info(
        { polls: attempt + 1 },
        "[AdvancedVideoRenderer] MaxCore video job is still processing",
      );
    }
  }

  logger.warn(
    { maxAttempts: POLL_MAX_ATTEMPTS },
    "[AdvancedVideoRenderer] MaxCore video job timed out",
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
    headers: maxcoreAuthHeaders(),
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
 * Grab a real first-frame poster from a local MP4 and persist it to PDIM so
 * the client `<video>` shows an actual frame instead of a grey placeholder on
 * mobile (where browsers won't decode a frame without a poster). Best-effort:
 * returns a durable PDIM-backed thumbnail URL, or null if extraction/upload
 * fails — it must never fail the video render itself.
 *
 * localMp4Path must be a real local file (scratch space is fine — this is
 * exactly the kind of ephemeral, immediately-deleted use PDIM-only storage
 * allows). The caller keeps ownership of localMp4Path's lifecycle; this
 * function only manages the poster JPEG it creates internally.
 */
export async function generateAndStorePosterThumbnail(
  localMp4Path: string,
  userId: string,
): Promise<string | null> {
  let localPosterPath: string | null = null;
  try {
    localPosterPath = await generatePosterThumbnail(localMp4Path);
    if (!localPosterPath) return null;
    const jpegBuffer = await fsPromises.readFile(localPosterPath);
    const upload = await hybridStorageService.upload(
      userId,
      path.basename(localPosterPath),
      jpegBuffer,
      "image/jpeg",
      { folder: "videos", isPublic: true },
    );
    return await hybridStorageService.getDownloadUrl(userId, upload.key);
  } catch (err) {
    logger.warn(
      `[PhotoReal] Poster PDIM upload failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    if (localPosterPath) await fsPromises.unlink(localPosterPath).catch(() => {});
  }
}

export async function generatePosterThumbnail(
  localMp4Path: string,
): Promise<string | null> {
  // Bounded ffmpeg/ffprobe runner — a poster is best-effort and must never
  // stall job completion behind a hung subprocess.
  const runBounded = (
    tool: "ffmpeg" | "ffprobe",
    args: string[],
    timeoutMs: number,
  ) =>
    new Promise<string>((resolve, reject) => {
      assertSafeSpawnArguments(args);
      const spawnOptions = {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
        env: restrictedChildEnvironment({}),
      };
      // Keep executable selection closed: callers choose one of these two
      // trusted media tools and can never supply a command name.
      const proc =
        tool === "ffmpeg"
          ? spawn("ffmpeg", args, spawnOptions)
          : spawn("ffprobe", args, spawnOptions);
      const outChunks: string[] = [];
      const errChunks: string[] = [];
      const killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`${tool} poster step timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.stdout?.on("data", (d: Buffer) => outChunks.push(d.toString()));
      proc.stderr?.on("data", (d: Buffer) => errChunks.push(d.toString()));
      proc.on("close", (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve(outChunks.join(""));
        else
          reject(
            new Error(
              `${tool} exited ${code}: ${errChunks.slice(-3).join("").slice(0, 200)}`,
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
          "-i", path.resolve(localMp4Path),
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
          path.resolve(localMp4Path),
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
    // Caller is responsible for uploading this scratch file to durable
    // storage and deleting it — this function only ever produces local,
    // ephemeral output (it shells out to ffmpeg, which needs a real path).
    return outPath;
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
  resolved_media_manifest?: Record<string, unknown>;
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
  const requireMediaReceipt = (receipt?: Record<string, unknown>) => {
    const requested = opts.media_manifest;
    if (!requested) return;
    if (!receipt || receipt.version !== 1 ||
        receipt.image_count !== (opts.reference_images?.length || 0) ||
        receipt.beat_sync !== requested.beat_sync ||
        receipt.color_grade !== requested.color_grade ||
        receipt.transition !== requested.transition ||
        receipt.voice_asset !== !!requested.voice_b64 ||
        receipt.logo_asset !== !!requested.logo_b64) {
      throw new Error("MaxCore did not confirm delivery of the requested media manifest");
    }
  };

  const topic = typeof opts.topic === "string" ? opts.topic.trim() : "";
  const hook = typeof opts.hook === "string" ? opts.hook.trim() : "";
  const body = typeof opts.body === "string" ? opts.body.trim() : "";
  const explicitContent = hook || topic || body;
  if (!explicitContent) {
    throw new Error("A video topic, hook, or body is required");
  }
  const platform =
    typeof opts.platform === "string" ? opts.platform.trim() : "";
  if (!platform) {
    throw new Error("A target platform is required for video generation");
  }
  if (typeof opts.userId !== "string" || !opts.userId.trim()) {
    throw new AIUnavailableError(
      "video generation requires authenticated ownership",
    );
  }
  const ownerId = opts.userId.trim();
  const idea = [explicitContent, opts.artist_name, opts.genre]
    .filter(Boolean)
    .join(" — ");

  logger.info(
    { platform, hasTopic: !!topic, hasHook: !!hook, hasBody: !!body },
    "[AdvancedVideoRenderer] Submitting MaxCore video job",
  );

  const maxCoreAudioPath = opts.user_audio_path
    ? await ensureMaxCoreAudioAsset(opts.user_audio_path, ownerId)
    : undefined;
  const jobResp = await maxCoreOwnedRequest<MaxCoreVideoJobResponse>(
    "/generate-video",
    ownerId,
    {
      method: "POST",
      body: JSON.stringify({
      idea,
      topic: topic || undefined,
      hook: hook || undefined,
      body: body || undefined,
      cta: opts.cta || undefined,
      platform,
      aspect_ratio: opts.aspect_ratio || "9:16",
      template: opts.template || undefined,
      duration: opts.duration || 10,
      artist_name: opts.artist_name || undefined,
      genre: opts.genre || undefined,
      tone: opts.tone || "energetic",
      goal: opts.goal || "growth",
      intent: opts.intent,
      direction: opts.direction,
      context: opts.context,
      awareness: opts.awareness,
      quality: opts.quality || undefined,
      voiceover: !!opts.voiceover,
      user_audio_path: maxCoreAudioPath,
      first_frame_b64: opts.first_frame_b64 || undefined,
      last_frame_b64: opts.last_frame_b64 || undefined,
      reference_images: opts.reference_images,
      media_manifest: opts.media_manifest,
      scenes_override: opts.scenes_override,
      camera_motion: opts.camera_motion,
      motion_intensity: opts.motion_intensity,
      user_id: ownerId,
      }),
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
    requireMediaReceipt(jobResp.resolved_media_manifest);
    const { videoUrl, posterUrl } = await cacheVideoLocally(syncUrl, ownerId);
    logger.info(
      `[AdvancedVideoRenderer] Synchronous MaxCore render complete in ${Date.now() - startMs}ms`,
    );
    return {
      success: true,
      url: videoUrl,
      thumbnail_url: posterUrl,
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
      resolved_media_manifest: jobResp.resolved_media_manifest,
      hashtags: jobResp.hashtags,
      source: "MaxCoreAI",
      processing_time_ms: Date.now() - startMs,
      intelligence,
    } as unknown as VideoGenResult;
  }

  // Async job — poll MaxCore until the video is rendered and served
  if (jobResp.job_id) {
    const result = await pollVideoJob(jobResp.job_id, ownerId);
    if (result && !result.success) {
      return {
        success: false,
        error: "Video generation failed",
        source: "MaxCoreAI",
        processing_time_ms: Date.now() - startMs,
      } as unknown as VideoGenResult;
    }
    if (result) {
      requireMediaReceipt(result.resolved_media_manifest);
      return {
        ...result,
        hook: result.hook || opts.hook,
        body: result.body || opts.body,
        cta: result.cta || opts.cta,
        processing_time_ms: Date.now() - startMs,
        intelligence,
      } as unknown as VideoGenResult;
    }
    return {
      success: false,
      error: "Video generation did not complete within the polling window",
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
