/**
 * Advanced Video Renderer Service
 *
 * MaxCore is the ONLY video renderer. Always running, never down.
 * No local FFmpeg fallback. No Python AI fallback.
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import fsPromises from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { logger } from "../logger.js";
import type {
  VideoGenOptions,
  VideoGenResult,
} from "./videoGeneratorService.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { generateAudio } from "./audioGeneratorService.js";

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
  return {
    "X-Admin-Key": MC_AI_KEY,
    "X-API-Key": MC_AI_KEY,
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
 * Ordered: specific API download routes first (bypass SPA), then static paths.
 */
function candidateUrls(rawUrl: string): string[] {
  const absolute = rawUrl?.startsWith("http")
    ? rawUrl
    : `${MAXCORE_ORIGIN}${rawUrl}`;
  const filename = path?.basename(rawUrl?.split("?")[0]);
  const uuid = extractJobUuid(filename);

  const urls: string[] = [];

  // Job-ID-based download routes (most likely to work)
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

  // The raw URL from MaxCore + non-/api/ static paths (caught by SPA but worth trying)
  urls?.push(
    absolute,
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
          `[AdvancedVideoRenderer] Candidate ${url} fetch error: ${err.message}`,
        );
      }
    }

    logger.warn(
      `[AdvancedVideoRenderer] All ${candidates.length} candidates failed for "${filename}" — proxy will stream from MaxCore: ${absoluteForProxy}`,
    );
  } catch (err) {
    logger.warn(
      `[AdvancedVideoRenderer] Local cache setup failed: ${err.message}`,
    );
  }

  // Return proxy URL — our server will stream from MaxCore with auth
  return `/api/social/video-proxy/${filename}`;
}

interface CompositeOpts {
  voiceover?: boolean;
  genre?: string;
  duration?: number;
  artistName?: string;
  topic?: string;
}

/**
 * Inner compositor — shared by the MaxCore video path and the photorealistic
 * Ken-Burns path.  Takes an absolute local video file path, composites
 * hook/body/CTA text and optional AI voiceover onto it, and writes the result
 * to LOCAL_VIDEO_DIR/comp_<basename>.
 *
 * Returns the served URL of the composited file.
 * Throws on FFmpeg error so callers can apply their own fallback.
 */
async function compositeTextOnLocalVideo(
  inPath: string,
  hook: string,
  body: string,
  cta: string,
  opts: CompositeOpts = {},
): Promise<string> {
  await fsPromises.mkdir(LOCAL_VIDEO_DIR, { recursive: true });

  const inFilename = path.basename(inPath);
  const outFilename = `comp_${inFilename}`;
  const outPath = path.join(LOCAL_VIDEO_DIR, outFilename);

  // Sanitize text: strip chars that break FFmpeg's drawtext filter parser
  const sanitize = (t: string) =>
    (t ?? "")
      .replace(/['":\\,[\]%]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Wrap text into lines of up to maxChars characters
  const wrap = (text: string, maxChars: number, maxLines = 3): string[] => {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (candidate.length <= maxChars) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        cur = w.slice(0, maxChars);
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  };

  const hookLines = wrap(sanitize(hook), 24, 3);
  const bodyLines = wrap(sanitize(body), 38, 3);
  const ctaText  = sanitize(cta).slice(0, 48);

  const filters: string[] = [];

  // ── Hook: top of frame, large bold white with black shadow ─────────────────
  let hookY = 140;
  for (const line of hookLines) {
    filters.push(
      `drawtext=text='${line}':fontsize=68:fontcolor=white` +
      `:x=(w-text_w)/2:y=${hookY}` +
      `:shadowx=3:shadowy=3:shadowcolor=black@0.8`,
    );
    hookY += 92;
  }

  // ── Body: lower-middle area, smaller white with shadow ─────────────────────
  let bodyY = 680;
  for (const line of bodyLines) {
    filters.push(
      `drawtext=text='${line}':fontsize=38:fontcolor=white@0.95` +
      `:x=(w-text_w)/2:y=${bodyY}` +
      `:shadowx=2:shadowy=2:shadowcolor=black@0.8`,
    );
    bodyY += 56;
  }

  // ── CTA: near bottom, gold / yellow ────────────────────────────────────────
  if (ctaText) {
    filters.push(
      `drawtext=text='${ctaText}':fontsize=44:fontcolor=#FFD700` +
      `:x=(w-text_w)/2:y=h-210` +
      `:shadowx=3:shadowy=3:shadowcolor=black@0.9`,
    );
  }

  // No drawable text — return original file URL
  if (filters.length === 0) return `/uploads/videos/${inFilename}`;

  // ── Optional voiceover ─────────────────────────────────────────────────────
  let audioLocalPath: string | null = null;
  if (opts.voiceover) {
    const script = [hook, body, cta].filter(Boolean).join(". ");
    const videoDuration = opts.duration ?? 10;

    // Primary: MaxCore authoritative AI voice synthesis
    try {
      const mcAudio = await MaxCoreAIClient.generate<{
        url?: string;
        audio_url?: string;
      }>("/generate/audio", {
        text: script,
        genre: opts.genre || "default",
        duration: videoDuration,
        artist_name: opts.artistName,
        topic: opts.topic,
        platform: "video",
        quality: "high",
      });
      const rawAudioUrl = mcAudio?.url ?? mcAudio?.audio_url;
      if (rawAudioUrl) {
        const fullAudioUrl = rawAudioUrl.startsWith("http")
          ? rawAudioUrl
          : `${MAXCORE_ORIGIN}${rawAudioUrl}`;
        const audioFilename = `vo_mc_${Date.now()}.mp3`;
        const audioDir = path.join(process.cwd(), "uploads", "audio");
        await fsPromises.mkdir(audioDir, { recursive: true });
        const audioPath = path.join(audioDir, audioFilename);
        const audioResp = await fetch(fullAudioUrl, {
          headers: { "X-Admin-Key": MC_AI_KEY, Authorization: `Bearer ${MC_AI_KEY}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (audioResp.ok) {
          await fsPromises.writeFile(audioPath, Buffer.from(await audioResp.arrayBuffer()));
          audioLocalPath = audioPath;
          logger.info(`[AdvancedVideoRenderer] MaxCore voiceover ready → ${audioFilename}`);
        }
      }
    } catch (mcErr: unknown) {
      logger.warn(
        `[AdvancedVideoRenderer] MaxCore /generate/audio unavailable (${(mcErr as Error).message}) — falling back to local TTS`,
      );
    }

    // Fallback: local espeak/flite TTS + genre music bed
    if (!audioLocalPath) {
      try {
        const audioResult = await generateAudio({
          text: script,
          topic: opts.topic,
          artistName: opts.artistName,
          genre: opts.genre,
          duration: videoDuration,
        });
        if (audioResult.success && audioResult.filename) {
          audioLocalPath = path.join(
            process.cwd(), "uploads", "audio", audioResult.filename,
          );
          logger.info(`[AdvancedVideoRenderer] Local TTS voiceover ready → ${audioResult.filename}`);
        } else {
          logger.warn("[AdvancedVideoRenderer] Local TTS also failed — video will be silent");
        }
      } catch (audioErr: unknown) {
        const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
        logger.warn(`[AdvancedVideoRenderer] Local TTS error (${msg}) — video will be silent`);
      }
    }
  }

  let ffmpegArgs: string[];
  if (audioLocalPath) {
    ffmpegArgs = [
      "-y",
      "-i", inPath,
      "-i", audioLocalPath,
      "-filter_complex", `[0:v]${filters.join(",")}[vout]`,
      "-map", "[vout]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      outPath,
    ];
  } else {
    ffmpegArgs = [
      "-y",
      "-i", inPath,
      "-vf", filters.join(","),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-movflags", "+faststart",
      "-an",
      outPath,
    ];
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`FFmpeg composite exited ${code}`)),
    );
    proc.on("error", reject);
  });

  const audioTag = audioLocalPath ? " + voiceover" : "";
  logger.info(
    `[AdvancedVideoRenderer] Composited (text${audioTag}) → ${outFilename}`,
  );
  return `/uploads/videos/${outFilename}`;
}

/**
 * Thin wrapper: resolves MaxCore's served URL to a local path, then delegates
 * to compositeTextOnLocalVideo.  Returns the original servedUrl on any failure.
 */
async function compositeTextOnMaxcoreVideo(
  servedUrl: string,
  hook: string,
  body: string,
  cta: string,
  opts: CompositeOpts = {},
): Promise<string> {
  if ((!hook && !body && !cta) || !servedUrl.startsWith("/uploads/videos/")) {
    return servedUrl;
  }
  const inPath = path.join(
    process.cwd(), "uploads", "videos", path.basename(servedUrl),
  );
  try {
    return await compositeTextOnLocalVideo(inPath, hook, body, cta, opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[AdvancedVideoRenderer] Compositing failed (${msg}) — serving original MaxCore video`,
    );
    return servedUrl;
  }
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

// ── Scene-based video assembly (FFmpeg fallback) ───────────────────────────────

const SCENE_BG: Record<string, string> = {
  hook:  "0x1a0a2e",
  build: "0x0a1a30",
  body:  "0x0a2e1a",
  drop:  "0x2e0a0a",
  outro: "0x1a1a08",
};

const SCENE_DURATION_S: Record<string, number> = {
  hook:  4,
  build: 3,
  body:  4,
  drop:  4,
  outro: 3,
};

/**
 * Assemble a real MP4 from MaxCore scene data using local FFmpeg.
 *
 * Called automatically when MaxCore renders successfully (status=done, scenes=[...])
 * but its file-serving layer cannot deliver the bytes (500 on /uploads/videos/*).
 * Each scene becomes a styled text-overlay clip; all clips are concatenated into
 * one playable MP4 and written to LOCAL_VIDEO_DIR.
 *
 * Returns the served URL (/uploads/videos/<filename>) or null on failure.
 */
async function assembleVideoFromScenes(
  scenes: Array<{ type: string; text: string }>,
  opts: {
    jobId: string;
    width?: number;
    height?: number;
    duration?: number;
  },
): Promise<string | null> {
  if (!scenes || scenes.length === 0) return null;

  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const totalDuration = opts.duration ?? scenes.length * 3;
  const clipS = Math.max(2, Math.min(6, Math.floor(totalDuration / scenes.length)));
  const fontSize = Math.floor(W / 16);
  const labelSize = Math.floor(W / 35);

  const tmpDir = await fsPromises.mkdtemp(path.join(tmpdir(), "maxcore-scenes-"));
  const clipPaths: string[] = [];

  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.join(tmpDir, `scene_${i}.mp4`);
      const bgColor = SCENE_BG[scene.type] ?? "0x111111";
      const sceneClipS = SCENE_DURATION_S[scene.type] ?? clipS;

      // Sanitize text — strip chars that confuse FFmpeg's drawtext filter parser
      const txt = (scene.text ?? "")
        .replace(/['":\\,[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 55);
      const label = (scene.type ?? "").toUpperCase().replace(/['":\\,[\]]/g, "");

      await new Promise<void>((resolve, reject) => {
        const vf = [
          `drawtext=text='${txt}':fontcolor=white:fontsize=${fontSize}` +
            `:x=(w-text_w)/2:y=(h-text_h)/2` +
            `:box=1:boxcolor=black@0.35:boxborderw=20`,
          `drawtext=text='${label}':fontcolor=#aaaaaa:fontsize=${labelSize}` +
            `:x=60:y=60`,
        ].join(",");
        const args = [
          "-y",
          "-f", "lavfi",
          "-i", `color=c=${bgColor}:s=${W}x${H}:r=30`,
          "-vf", vf,
          "-t", String(sceneClipS),
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          clipPath,
        ];
        const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
        const errBufs: Buffer[] = [];
        proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `FFmpeg scene ${i} exit=${code}: ` +
                  Buffer.concat(errBufs).toString().slice(-300),
              ),
            );
          }
        });
        proc.on("error", reject);
      });

      clipPaths.push(clipPath);
      logger.info(
        `[SceneAssembly] Scene ${i + 1}/${scenes.length} — type=${scene.type} duration=${sceneClipS}s`,
      );
    }

    // Write concat list
    const listPath = path.join(tmpDir, "list.txt");
    await fsPromises.writeFile(
      listPath,
      clipPaths.map((p) => `file '${p}'`).join("\n"),
      "utf-8",
    );

    // Concatenate → final MP4
    await fsPromises.mkdir(LOCAL_VIDEO_DIR, { recursive: true });
    const outFilename = `ai_${opts.jobId.replace(/-/g, "").slice(0, 12)}_assembled.mp4`;
    const outPath = path.join(LOCAL_VIDEO_DIR, outFilename);

    await new Promise<void>((resolve, reject) => {
      const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath];
      const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      const errBufs: Buffer[] = [];
      proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg concat exit=${code}: ` +
                Buffer.concat(errBufs).toString().slice(-300),
            ),
          );
        }
      });
      proc.on("error", reject);
    });

    logger.info(
      `[SceneAssembly] ${scenes.length} scenes assembled → ${outFilename} (${W}x${H}, ~${totalDuration}s)`,
    );
    return `/uploads/videos/${outFilename}`;
  } catch (err) {
    logger.warn(
      `[SceneAssembly] FFmpeg assembly failed: ${(err as Error).message}`,
    );
    return null;
  } finally {
    for (const p of clipPaths) await fsPromises.unlink(p).catch(() => {});
    await fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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
      let servedUrl = await cacheVideoLocally(status.url);

      // If MaxCore's file-serving layer failed (proxy fallback) AND we have
      // scene data → assemble a real playable MP4 locally with FFmpeg.
      if (
        servedUrl.startsWith("/api/social/video-proxy/") &&
        status.scenes?.length
      ) {
        logger.info(
          `[AdvancedVideoRenderer] Download unavailable — assembling ` +
            `${status.scenes.length} scenes locally with FFmpeg`,
        );
        const assembled = await assembleVideoFromScenes(status.scenes, {
          jobId,
          width: status.width,
          height: status.height,
          duration: status.duration,
        });
        if (assembled) {
          servedUrl = assembled;
          logger.info(
            `[AdvancedVideoRenderer] Scene assembly complete → ${assembled}`,
          );
        }
      }

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
      return null;
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

// ── Photorealistic video pipeline ─────────────────────────────────────────────
//
// MaxCore /generate/image → photorealistic frame → FFmpeg Ken Burns zoom →
// compositeTextOnLocalVideo (text + voiceover) → comp_photo_base_*.mp4
//
// This is the sole photorealistic path.  MaxCore's growing image-generation
// dataset (fine-tuned on real music photography) powers the visual base.
// A vivid Sharp genre-palette gradient is the fallback if MaxCore is offline.

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
 * Falls back to a vivid Sharp gradient when MaxCore is unavailable.
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

  // Cinematic scene description — MaxCore's dataset uses music-photography
  // keywords (venue lighting, artist silhouettes, crowd dynamics, etc.)
  const sceneText = (hook || topic || "music artist").slice(0, 120);
  const prompt = [
    sceneText,
    genre ? `${genre} music scene` : "music scene",
    "photorealistic cinematic photography, dramatic studio lighting",
    "ultra-high detail, 8k resolution, vivid colors, no text, no watermarks",
  ].join(", ");

  try {
    const result = await MaxCoreAIClient.generate<{
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
    });

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

    if (imageUrl) {
      const rawExt = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
      const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
      const filename = `photo_${randomUUID().slice(0, 8)}.${ext}`;
      const localPath = path.join(PHOTO_CACHE_DIR, filename);

      const imgResp = await fetch(imageUrl, {
        headers: { "X-Admin-Key": MC_AI_KEY, Authorization: `Bearer ${MC_AI_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (imgResp.ok) {
        const buf = Buffer.from(await imgResp.arrayBuffer());
        if (buf.length > 5_000) {
          await fsPromises.writeFile(localPath, buf);
          logger.info(
            `[PhotoReal] MaxCore image cached → ${filename} (${Math.round(buf.length / 1024)} KB)`,
          );
          return localPath;
        }
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `[PhotoReal] MaxCore /generate/image failed (${(err as Error).message ?? String(err)}) — using gradient fallback`,
    );
  }

  return generatePhotoGradientFallback(W, H, genre);
}

/**
 * Sharp gradient fallback — a vivid multi-stop vertical gradient keyed to the
 * artist's genre palette.  Used when MaxCore image generation is unavailable.
 */
async function generatePhotoGradientFallback(
  W: number,
  H: number,
  genre: string,
): Promise<string> {
  await fsPromises.mkdir(PHOTO_CACHE_DIR, { recursive: true });

  const filename = `gradient_${randomUUID().slice(0, 8)}.png`;
  const localPath = path.join(PHOTO_CACHE_DIR, filename);

  // [top-R, top-G, top-B, mid-R, mid-G, mid-B, bot-R, bot-G, bot-B]
  const PALETTES: Record<string, [number,number,number, number,number,number, number,number,number]> = {
    "hip-hop":    [20,  0, 40,  80,  0, 120, 200,   0,  60],
    "trap":       [10,  0, 30,  60,  0,  80, 150,   0,  20],
    "pop":        [20,  0, 60, 160,  0, 200, 255,  60, 120],
    "r&b":        [40,  0, 60, 120, 20,  40, 180,  30,  30],
    "electronic": [ 0, 20, 80,   0,120, 200,   0, 200, 180],
    "dance":      [60,  0,120, 120,  0, 200, 200,   0, 255],
    "rock":       [30,  0,  0,  80, 10,   0,  60,   0,   0],
    "country":    [80, 50, 10, 180,120,   0, 220, 160,  20],
    "jazz":       [20, 15, 50,  80, 60,  20, 100,  80,  30],
    "latin":      [180,40,  0, 220,100,   0, 255, 160,   0],
  };

  const key = Object.keys(PALETTES).find((k) =>
    (genre ?? "").toLowerCase().includes(k),
  );
  const [tr,tg,tb, mr,mg,mb, br,bg_,bb] = PALETTES[key ?? ""] ?? PALETTES["pop"];

  try {
    const sharp = (await import("sharp")).default;
    const pixels = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1);
      const toMid = Math.min(t * 2, 1);
      const toBot = Math.max((t - 0.5) * 2, 0);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        pixels[i]     = Math.round(tr + (mr - tr) * toMid + (br - mr) * toBot);
        pixels[i + 1] = Math.round(tg + (mg - tg) * toMid + (bg_ - mg) * toBot);
        pixels[i + 2] = Math.round(tb + (mb - tb) * toMid + (bb - mb) * toBot);
      }
    }
    await sharp(pixels, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(localPath);
    logger.info(`[PhotoReal] Gradient fallback rendered → ${filename}`);
    return localPath;
  } catch {
    // Last resort: tiny valid 1×1 black PNG that FFmpeg accepts
    const black = path.join(PHOTO_CACHE_DIR, `black_${randomUUID().slice(0, 6)}.png`);
    await fsPromises.writeFile(
      black,
      Buffer.from([
        137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,
        8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,96,96,96,
        0,0,0,4,0,1,39,246,149,36,0,0,0,0,73,69,78,68,174,66,96,130,
      ]),
    );
    return black;
  }
}

/**
 * Applies a Ken Burns (slow zoom-in + centered pan) effect to a still image,
 * producing a smooth cinematic base video ready for text compositing.
 *
 * FFmpeg zoompan needs headroom to crop into: the image is scaled to 2× first,
 * then zoompan crops and outputs at the target WxH so no quality is lost.
 *
 * Returns the absolute local path of the rendered base MP4.
 */
async function kenBurnsAnimate(
  imagePath: string,
  W: number,
  H: number,
  durationSec: number,
): Promise<string> {
  await fsPromises.mkdir(LOCAL_VIDEO_DIR, { recursive: true });

  const outFilename = `photo_base_${randomUUID().slice(0, 8)}.mp4`;
  const outPath = path.join(LOCAL_VIDEO_DIR, outFilename);

  const fps = 24;
  const frames = Math.round(durationSec * fps);

  // Zoom slowly from 1.02 → max 1.5, panned to center (iw/zoom keeps the
  // output crop centred regardless of zoom level).
  const zoomFilter =
    `scale=iw*2:ih*2,` +
    `zoompan=` +
      `z='min(zoom+0.0015,1.5)':` +
      `x='iw/2-(iw/zoom/2)':` +
      `y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:fps=${fps}:s=${W}x${H},` +
    `format=yuv420p`;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-loop", "1",
        "-i", imagePath,
        "-vf", zoomFilter,
        "-t", String(durationSec),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-movflags", "+faststart",
        outPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const errChunks: string[] = [];
    proc.stderr?.on("data", (d: Buffer) => errChunks.push(d.toString()));
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `FFmpeg Ken Burns exited ${code}: ${errChunks.slice(-3).join("").slice(0, 300)}`,
            ),
          ),
    );
    proc.on("error", reject);
  });

  logger.info(
    `[PhotoReal] Ken Burns video → ${outFilename} (${W}×${H}, ${durationSec}s)`,
  );
  return outPath;
}

/**
 * Full photorealistic video pipeline:
 *   1. MaxCore /generate/image  →  photorealistic background frame
 *   2. FFmpeg Ken Burns          →  animated base video (cinematic zoom)
 *   3. compositeTextOnLocalVideo →  hook/body/CTA text + optional AI voiceover
 *
 * Falls back to a genre-palette gradient when MaxCore image generation is
 * unavailable — the Ken Burns + text composite still runs over the gradient.
 */
async function renderPhotorealisticVideo(
  opts: VideoGenOptions,
  hook: string,
  body: string,
  cta: string,
  startMs: number,
  intelligence: Record<string, unknown>,
): Promise<VideoGenResult> {
  const aspectRatio = opts.aspect_ratio ?? "9:16";
  const [W, H] = PHOTO_ASPECT_DIMS[aspectRatio] ?? PHOTO_ASPECT_DIMS["9:16"];
  const durationSec = opts.duration ?? 10;

  const compositeOpts: CompositeOpts = {
    voiceover: !!opts.voiceover,
    genre: opts.genre,
    duration: durationSec,
    artistName: opts.artist_name,
    topic: opts.topic,
  };

  try {
    logger.info("[PhotoReal] Fetching photorealistic image from MaxCore…");
    const imagePath = await fetchPhotorealisticImage(
      opts.topic ?? hook ?? "music artist",
      hook,
      opts.genre ?? "pop",
      opts.platform ?? "tiktok",
      aspectRatio,
    );

    logger.info("[PhotoReal] Applying Ken Burns animation…");
    const baseVideoPath = await kenBurnsAnimate(imagePath, W, H, durationSec);

    logger.info("[PhotoReal] Compositing text overlay…");
    const finalUrl = await compositeTextOnLocalVideo(
      baseVideoPath, hook, body, cta, compositeOpts,
    );

    logger.info(
      `[PhotoReal] Pipeline complete in ${Date.now() - startMs}ms → ${finalUrl}`,
    );

    return {
      success: true,
      url: finalUrl,
      width: W,
      height: H,
      duration: durationSec,
      hook,
      body,
      cta,
      template: "photorealistic",
      template_name: "Photorealistic (MaxCore AI)",
      source: "MaxCoreAI-Photorealistic",
      quality: "photorealistic",
      capabilities: [
        "maxcore_image_generation",
        "ken_burns_animation",
        "text_overlay",
        ...(compositeOpts.voiceover ? ["ai_voiceover"] : []),
      ],
      processing_time_ms: Date.now() - startMs,
      ...intelligence,
    } as unknown as VideoGenResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[PhotoReal] Pipeline failed: ${msg}`);
    return {
      success: false,
      error: `Photorealistic pipeline failed: ${msg}`,
      source: "MaxCoreAI-Photorealistic",
      processing_time_ms: Date.now() - startMs,
    };
  }
}

// ── MaxCore content types ─────────────────────────────────────────────────────

interface MaxCoreContent {
  caption: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  confidence: number;
  processing_time_ms: number;
}

interface MaxCoreSentiment {
  sentiment: number; // 0–1
  label: string;
  confidence: number;
  model_summary: string;
  source: string;
}

// ── Step 1: generate content intelligence from MaxCore ────────────────────────

async function generateContent(
  opts: VideoGenOptions,
): Promise<MaxCoreContent | null> {
  const topic = [
    opts.artist_name ? `${opts.artist_name}` : null,
    opts.topic,
    opts.genre ? `(${opts.genre})` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  logger.info(
    `[AdvancedVideoRenderer] Calling /api/generate/content for topic: "${topic}"`,
  );

  return MaxCoreAIClient.generate<MaxCoreContent>("/generate/content", {
    topic,
    platform: opts.platform || "tiktok",
    tone: opts.tone || "energetic",
    goal: opts.goal || "growth",
    genre: opts.genre || undefined,
    artist: opts.artist_name || undefined,
    title: opts.topic || undefined,
  });
}

// ── Step 2: sentiment scoring on the hook ─────────────────────────────────────

async function getSentiment(hook: string): Promise<MaxCoreSentiment | null> {
  return MaxCoreAIClient.generate<MaxCoreSentiment>("/analyze/sentiment", {
    text: hook,
  });
}

/**
 * Render a video through MaxCore — authoritative AI generation pipeline:
 *   Step 1: MaxCore content + sentiment intelligence
 *   Step 2: MaxCore video generation (async job with polling)
 *   Step 3: FFmpeg compositing — text overlays + AI voiceover on the cached MP4
 */
export async function renderVideo(
  opts: VideoGenOptions,
): Promise<VideoGenResult> {
  const startMs = Date?.now();
  logger?.info("[AdvancedVideoRenderer] Starting MaxCore video pipeline");

  // ── Step 1: generate content + sentiment intelligence (parallel) ──────────
  const contentResult = await generateContent(opts);

  const hook = contentResult?.hook || opts?.hook || "";
  const body = contentResult?.body || opts?.body || "";
  const cta = contentResult?.cta || opts?.cta || "";
  const hashtags = contentResult?.hashtags || [];
  const contentConfidence = contentResult?.confidence ?? null;

  if (contentResult) {
    logger?.info(
      `[AdvancedVideoRenderer] Content generated — hook: "${hook.slice(0, 60)}..." ` +
        `confidence: ${contentConfidence} hashtags: ${hashtags?.length}`,
    );
  } else {
    logger?.warn(
      "[AdvancedVideoRenderer] /api/generate/content returned null — using opts fallbacks",
    );
  }

  const sentimentResult = hook ? await getSentiment(hook) : null;
  if (sentimentResult) {
    logger?.info(
      `[AdvancedVideoRenderer] Sentiment: ${sentimentResult?.label} ` +
        `(score=${sentimentResult.sentiment.toFixed(2)}, confidence=${sentimentResult?.confidence.toFixed(2)})`,
    );
  }

  const intelligence = {
    hashtags,
    content_confidence: contentConfidence,
    sentiment_score: sentimentResult?.sentiment ?? null,
    sentiment_label: sentimentResult?.label ?? null,
    sentiment_confidence: sentimentResult?.confidence ?? null,
  };

  // ── Photorealistic mode — branch before MaxCore motion-video submission ──────
  // MaxCore /generate/image provides the visual base (photorealistic frame),
  // FFmpeg Ken Burns animates it, compositeTextOnLocalVideo adds text+voice.
  if (opts.quality === "photorealistic") {
    return renderPhotorealisticVideo(
      opts, hook, body, cta, startMs, intelligence as Record<string, unknown>,
    );
  }

  // ── Step 2: MaxCore video script generation ──────────────────────────────────
  // /api/platform/video/generate is the correct MaxCore endpoint (see arch doc).
  // It returns a synchronous video SCRIPT (scenes, hook, script, captions) that
  // we then render via renderPhotorealisticVideo (MaxCore image + FFmpeg assembly).
  type MaxCoreVideoScript = {
    success?: boolean;
    hook?: string;
    body?: string;
    cta?: string;
    script?: string;
    title?: string;
    scenes?: Array<{
      scene: number;
      duration_seconds?: number;
      description?: string;
      visual_direction?: string;
      narration?: string;
    }>;
    hashtags?: string[];
    duration_seconds?: number;
    aspect_ratio?: string;
    user_id?: string;
    job_id?: string;
    url?: string;
  };
  const jobResp = await MaxCoreAIClient?.infer<MaxCoreVideoScript>(
    "/platform/video/generate",
    {
      idea:
        [hook, opts.artist_name, opts.genre, opts.topic]
          .filter(Boolean)
          .join(" — ") || "music video",
      hook,
      body,
      cta,
      topic: opts.topic || hook || body || "music video",
      platform: opts.platform || "tiktok",
      aspect_ratio: opts.aspect_ratio,
      template: opts.template || "cinematic_promo",
      duration: opts.duration || 10,
      artist_name: opts.artist_name,
      genre: opts.genre || undefined,
      tone: opts.tone || "energetic",
      goal: opts.goal || "growth",
      quality: opts.quality || "cinematic",
      user_audio_path: opts.user_audio_path || undefined,
      voiceover: !!opts?.voiceover,
      user_id: opts.userId || "anonymous",
    },
  );

  if (!jobResp) {
    // MaxCore endpoint unavailable (cold-start, training load, transient 5xx).
    // Fall through to the photorealistic pipeline which calls /generate/image —
    // still MaxCore-powered and always produces a playable MP4.
    logger.warn(
      "[AdvancedVideoRenderer] /api/platform/video/generate returned null — " +
        "routing to MaxCore photorealistic pipeline",
    );
    return renderPhotorealisticVideo(
      opts,
      hook,
      body,
      cta,
      startMs,
      intelligence as Record<string, unknown>,
    );
  }

  // Synchronous scene-script response (new format from /platform/video/generate):
  // MaxCore returns hook + scenes + captions but no rendered file yet.
  // Use the enriched hook/body/cta from the script, then render via the
  // photorealistic pipeline (MaxCore /generate/image + FFmpeg assembly).
  if (jobResp?.scenes?.length || (jobResp?.success && !jobResp?.url && !jobResp?.job_id)) {
    const scriptHook = jobResp?.hook || hook;
    const scriptBody = jobResp?.script?.split("\n")[1] || body;
    const scriptCta  = jobResp?.cta  || cta;
    const scriptHashtags = jobResp?.hashtags || hashtags;
    logger.info(
      `[AdvancedVideoRenderer] MaxCore returned ${jobResp?.scenes?.length ?? 0}-scene script — ` +
        `rendering photorealistic pipeline with enriched hook`,
    );
    return renderPhotorealisticVideo(
      opts,
      scriptHook,
      scriptBody,
      scriptCta,
      startMs,
      { ...intelligence, hashtags: scriptHashtags } as Record<string, unknown>,
    );
  }

  // Shared composite options derived from the render request
  const compositeOpts: CompositeOpts = {
    voiceover: !!opts?.voiceover,
    genre: opts.genre,
    duration: opts.duration || 10,
    artistName: opts.artist_name,
    topic: opts.topic,
  };

  // Synchronous response — MaxCore rendered immediately
  if (jobResp?.url) {
    const cachedUrl = await cacheVideoLocally(jobResp?.url);
    const finalHook = jobResp.hook || hook;
    const finalBody = jobResp.body || body;
    const finalCta  = jobResp.cta  || cta;
    const servedUrl = await compositeTextOnMaxcoreVideo(cachedUrl, finalHook, finalBody, finalCta, compositeOpts);
    logger?.info(
      `[AdvancedVideoRenderer] Synchronous render complete in ${Date?.now() - startMs}ms`,
    );
    return {
      success: true,
      url: servedUrl,
      filename: jobResp.filename,
      width: jobResp.width,
      height: jobResp.height,
      duration: jobResp.duration,
      hook: finalHook,
      body: finalBody,
      cta: finalCta,
      template: jobResp.template,
      template_name: jobResp.template_name,
      scenes_rendered: jobResp.scenes_rendered,
      source: "MaxCoreAI",
      processing_time_ms: Date.now() - startMs,
      ...intelligence,
    } as Record<string, unknown>;
  }

  // Async response — poll for completion
  if (jobResp?.job_id) {
    const result = await pollVideoJob(jobResp?.job_id);
    if (result) {
      const finalHook = result.hook || hook;
      const finalBody = result.body || body;
      const finalCta  = result.cta  || cta;
      const servedUrl = await compositeTextOnMaxcoreVideo(result.url as string, finalHook, finalBody, finalCta, compositeOpts);
      return {
        ...result,
        url: servedUrl,
        hook: finalHook,
        body: finalBody,
        cta: finalCta,
        processing_time_ms: Date.now() - startMs,
        ...intelligence,
      } as Record<string, unknown>;
    }
    return {
      success: false,
      error: `MaxCore job ${jobResp?.job_id} did not complete within the polling window`,
      source: "MaxCoreAI",
      processing_time_ms: Date.now() - startMs,
    };
  }

  logger?.warn(
    "[AdvancedVideoRenderer] MaxCore response missing both url and job_id:",
    jobResp,
  );
  return {
    success: false,
    error: "MaxCore returned an unexpected response format",
    source: "MaxCoreAI",
    processing_time_ms: Date.now() - startMs,
  };
}
