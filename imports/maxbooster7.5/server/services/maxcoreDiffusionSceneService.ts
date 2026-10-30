/**
 * MaxCore Diffusion Scene Service
 *
 * Tier 1 of the image-to-video cascade.
 *
 * For each scene in a music video, this service attempts to produce a real
 * AI-synthesized video clip via the local PyTorch diffusion API
 * (VIDEO_DIFFUSION_URL, defaulting to the internal diffusion gateway port)
 * before falling back to
 * the Ken Burns FFmpeg renderer.
 *
 * Integration pattern inside imageToVideoService?.ts:
 *   1. Call checkDiffusionAvailable() once before the scene loop.
 *   2. If available, call renderDiffusionScene() per image.
 *   3. On null return or any error, fall through to renderImageWithKenBurns().
 *
 * All rendering is synchronous within the scene loop — no streaming is used
 * here because the pipeline needs the finished clip before moving to xfade
 * assembly.
 */

import { unlinkSync, existsSync } from "fs";
import { writeFile as fsWriteFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../logger.js";
import {
  isPyTorchDiffusionReady,
  generatePyTorchDiffusionVideo,
  type PyTorchDiffusionRequest,
} from "./diffusionVideoService.js";
import type { BeatAnalysis } from "./beatSyncService.js";

const execFileAsync = promisify(execFile);

// ── Style mapping ─────────────────────────────────────────────────────────────

/** Maps color-grade names to PyTorch diffusion style_name parameters. */
const COLOR_GRADE_TO_STYLE: Record<string, string> = {
  cinematic: "neon_tunnel",
  warm: "sunset_city",
  cool: "deep_space",
  neon: "neon_tunnel",
  none: "crystal_waters",
};

/** Maps platform names to default diffusion style_name parameters. */
const PLATFORM_TO_STYLE: Record<string, string> = {
  tiktok: "neon_tunnel",
  instagram: "sunset_city",
  instagram_reels: "sunset_city",
  youtube: "deep_space",
  facebook: "crystal_waters",
  twitter: "deep_space",
  linkedin: "crystal_waters",
};

/** Maps genre names to emotional descriptors used in the diffusion prompt. */
const GENRE_TO_AESTHETIC: Record<string, string> = {
  "hip-hop": "urban street aesthetic, dramatic lighting",
  rap: "urban street aesthetic, dramatic lighting",
  "r&b": "silky smooth warm tones, soulful atmosphere",
  pop: "vibrant colorful energetic, glossy finish",
  edm: "futuristic neon cyberpunk, high energy",
  electronic: "futuristic neon cyberpunk, pulsing beats",
  rock: "gritty high contrast, electric energy",
  country: "warm golden sunset, open landscape",
  jazz: "moody blue tones, smoky atmosphere",
  classical: "elegant orchestral, timeless composition",
  reggae: "tropical warm greens, chill vibrations",
  latin: "vibrant warm colors, festive energy",
  default: "cinematic professional, premium quality",
};

// ── Availability check ────────────────────────────────────────────────────────

/** Cache the availability result for the duration of a generation run. */
let _availabilityCache: { ts: number; available: boolean } | null = null;
const CACHE_TTL_MS = 30_000; // 30 s — recheck if idle

/** Returns true if the PyTorch diffusion API is currently reachable. */
export async function checkDiffusionAvailable(): Promise<boolean> {
  if (_availabilityCache && Date.now() - _availabilityCache?.ts < CACHE_TTL_MS) {
    return _availabilityCache?.available;
  }
  const available = await isPyTorchDiffusionReady();
  _availabilityCache = { ts: Date.now(), available };
  if (available) {
    logger.info(
      "[DiffusionScene] PyTorch diffusion API is ready — Tier 1 active",
    );
  } else {
    logger.debug(
      "[DiffusionScene] PyTorch diffusion API not reachable — Tier 1 bypassed, using Ken Burns",
    );
  }
  return available;
}

/** Invalidate the availability cache (call after a scene failure to recheck). */
export function invalidateDiffusionCache(): void {
  _availabilityCache = null;
}

// ── Scene options ─────────────────────────────────────────────────────────────

export interface DiffusionSceneOptions {
  /** Path to the source image (used only for logging; diffusion generates fresh frames). */
  imagePath: string;

  /** Where to write the finished scene clip. */
  outputPath: string;

  /** Target output dimensions in pixels. */
  width: number;
  height: number;

  /** Duration of this scene in seconds. */
  durationSec: number;

  /** Music genre string (used to build the diffusion prompt). */
  genre?: string;

  /** Color grade key — controls diffusion style_name. */
  colorGrade?: string;

  /** Target social platform. */
  platform?: string;

  /** Beat analysis from beatSyncService — used to pass BPM + energy to diffusion. */
  beatAnalysis?: BeatAnalysis | null;

  /** Index of this scene in the total sequence (0-based). */
  sceneIndex: number;

  /** Total number of scenes in the video. */
  totalScenes: number;

  /** Artist name for the prompt context. */
  artistName?: string;

  /**
   * Pre-built FFmpeg drawtext/drawbox filter segments (one per overlay element).
   * Applied on top of the diffusion output during the post-process FFmpeg pass.
   * Join with ',' before passing to -vf.
   */
  textOverlays?: string[];
}

// ── Core renderer ─────────────────────────────────────────────────────────────

/**
 * Attempt to render a single scene using the PyTorch diffusion API.
 *
 * @returns The output path (same as opts.outputPath) on success, or null if
 *          the diffusion API is unavailable / returns an error.
 *
 * Caller MUST fall back to Ken Burns rendering on null return.
 */
export async function renderDiffusionScene(
  opts: DiffusionSceneOptions,
  ffmpegPath: string,
): Promise<string | null> {
  try {
    // ── Build diffusion prompt ───────────────────────────────────────────────
    const genreKey = (opts?.genre || "default")
      .toLowerCase()
      .replace(/[^a-z&-]/g, "");
    const aesthetic =
      GENRE_TO_AESTHETIC[genreKey] || GENRE_TO_AESTHETIC?.default;
    const gradeLabel =
      opts?.colorGrade && opts?.colorGrade !== "none"
        ? `${opts?.colorGrade} color grade`
        : "";
    const artistCtx = opts?.artistName ? `${opts?.artistName} music video, ` : "";
    const prompt = [
      artistCtx,
      aesthetic,
      gradeLabel,
      "professional music video, 4K quality",
    ]
      .filter(Boolean)
      .join(", ");

    // ── Map style ────────────────────────────────────────────────────────────
    const styleName =
      COLOR_GRADE_TO_STYLE[opts?.colorGrade || "cinematic"] ||
      PLATFORM_TO_STYLE[opts?.platform || "tiktok"] ||
      "neon_tunnel";

    // ── Compute beat-derived parameters ─────────────────────────────────────
    const ba = opts?.beatAnalysis;
    const bpm = ba?.bpm ?? 120;
    const totalSc = opts?.totalScenes > 0 ? opts?.totalScenes : 1;
    const sceneProgress =
      opts?.totalScenes > 1 ? opts?.sceneIndex / (opts?.totalScenes - 1) : 0.5;

    // Sample energy envelope at scene midpoint
    let energy = 0.65;
    if (ba?.energyEnvelope && ba?.energyEnvelope.length > 0) {
      const midpoint = (opts?.sceneIndex + 0.5) / (totalSc || 1);
      const idx = Math.min(
        Math.floor(midpoint * ba?.energyEnvelope.length),
        ba?.energyEnvelope.length - 1,
      );
      energy = Math.max(0.1, Math.min(1.0, ba?.energyEnvelope[idx]));
    }

    // Check if this scene contains an energy peak (drop / chorus)
    const sceneStartSec =
      (opts?.sceneIndex * (ba?.durationSeconds ?? opts?.durationSec)) / (totalSc || 1);
    const sceneEndSec = sceneStartSec + opts?.durationSec;
    const isDrop =
      ba?.peakPositions?.some((t) => t >= sceneStartSec && t < sceneEndSec) ??
      false;

    // Emotional arc: curiosity → excitement → inspiration → anthemic
    const emotionalGoal =
      sceneProgress < 0.25
        ? "curiosity"
        : sceneProgress < 0.55
          ? "excitement"
          : sceneProgress < 0.8
            ? "inspiration"
            : "anthemic";

    // ── Frame budget ─────────────────────────────────────────────────────────
    // Diffusion API is capped at 48 frames per call for performance.
    // The post-process FFmpeg step trims/loops to exact durationSec.
    const fps = 30;
    const frames = Math.min(Math.ceil(opts?.durationSec * fps), 48);

    // Cap resolution — diffusion API works best at ≤512 on each axis.
    const H = Math.min(opts?.height, 512);
    const W = Math.min(opts?.width, 512);

    const diffRequest: PyTorchDiffusionRequest = {
      prompt,
      T: frames,
      H,
      W,
      bpm,
      energy,
      energy_peak: isDrop ? 0.95 : energy * 0.9 + 0.05,
      style_name: styleName,
      beat_index: opts.sceneIndex,
      total_beats: totalSc,
      is_drop: isDrop,
      emotional_goal: emotionalGoal,
      output_format: "mp4_b64",
      platform: opts.platform || "tiktok",
      use_digital_gpu: true,
      temporal_smooth: true,
    };

    logger.info(
      `[DiffusionScene] Scene ${opts?.sceneIndex + 1}/${totalSc} → ` +
        `style=${styleName} bpm=${bpm.toFixed(0)} energy=${energy?.toFixed(2)} ` +
        `frames=${frames} drop=${isDrop} goal=${emotionalGoal}`,
    );

    // ── Call diffusion API ───────────────────────────────────────────────────
    const result = await generatePyTorchDiffusionVideo(diffRequest);
    if (result?.status !== "ok" || !result?.mp4_b64) {
      logger.warn(
        `[DiffusionScene] Scene ${opts.sceneIndex + 1} — API returned status="${result.status}" with no mp4_b64`,
      );
      return null;
    }

    // ── Decode base64 → raw diffusion clip ──────────────────────────────────
    const rawPath = opts?.outputPath.replace(/\.mp4$/, "_diffraw.mp4");
    await fsWriteFile(rawPath, Buffer?.from(result?.mp4_b64, "base64"));

    // ── Post-process: scale to target res + text overlays ───────────────────
    //
    // The diffusion output is at H×W (≤512×512).  We upscale to the target
    // resolution (width×height), apply vignette, color grade, and text
    // overlays, then trim/loop to the exact scene duration.
    const vfParts: string[] = [
      `scale=${opts.width}:${opts.height}:flags=lanczos`,
      "format=yuv420p",
      "vignette=angle=PI/4.5:mode=forward:eval=init",
    ];
    if (opts?.textOverlays && opts?.textOverlays.length > 0) {
      vfParts?.push(...(opts?.textOverlays ?? []));
    }

    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-stream_loop",
        "-1", // loop the short diffusion clip if durationSec > clip length
        "-i",
        rawPath,
        "-vf",
        vfParts?.join(","),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        "-t",
        String(opts?.durationSec),
        "-r",
        String(fps),
        opts?.outputPath,
      ],
      { timeout: Math.max(90_000, opts?.durationSec * 6000) },
    );

    // Clean up raw diffusion file
    try {
      if (existsSync(rawPath)) unlinkSync(rawPath);
    } catch {
      /* intentional: temp raw diffusion file cleanup */
    }

    logger.info(
      `[DiffusionScene] ✅ Scene ${opts?.sceneIndex + 1} — ` +
        `gpu=${result.gpu_applied} style=${result?.style_used ?? styleName} ` +
        `scene=${result?.scene_name ?? "?"}`,
    );
    return opts?.outputPath;
  } catch (err) {
    logger.warn(
      `[DiffusionScene] Scene ${opts?.sceneIndex + 1} failed (${(err as any)?.message ?? err}) ` +
        `— will fall back to Ken Burns`,
    );
    // Invalidate cache so the next availability check is fresh
    invalidateDiffusionCache();
    return null;
  }
}
