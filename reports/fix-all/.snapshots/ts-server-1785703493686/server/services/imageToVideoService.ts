/**
 * Image-to-Video Service — Music Video Compositor
 *
 * Converts static images into cinematic music videos using:
 *   - Ken Burns effect (pan + zoom via FFmpeg zoompan filter)
 *   - Beat-synchronized scene cuts (via beatSyncService)
 *   - Animated text overlays (from videoGeneratorService templates)
 *   - Genre audio bed or user-supplied audio track
 *   - xfade transitions aligned to beat positions
 *   - Cinematic vignette + color grading
 *
 * Two core modes:
 *   1. singleImageToVideo   — One cover/promo image → full music video with
 *                             animated overlays and audio. Good for single covers.
 *   2. multiImageMusicVideo — Multiple images → beat-synced montage. Each image
 *                             gets a unique Ken Burns motion path for variety.
 *                             Great for EPK reels, lyric videos, tour recaps.
 *
 * Ken Burns motions (cycled across images so no two consecutive shots match):
 *   zoom_in_center    — Slow zoom toward center (classic lock)
 *   zoom_out_center   — Pull back from tight crop to full frame
 *   pan_left          — Slow horizontal pan left-to-right
 *   pan_right         — Slow horizontal pan right-to-left
 *   zoom_in_top_left  — Push toward top-left (editorial)
 *   zoom_in_bottom_right — Diagonal push to bottom-right
 *   tilt_up           — Slow vertical tilt upward
 *   tilt_down         — Slow vertical tilt downward
 */

import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import {
  analyzeAudio,
  getBeatAlignedCuts,
  cutsToSceneDurations,
} from "./beatSyncService.js";
import type { BeatAnalysis } from "./beatSyncService.js";
import {
  AUDIO_PROFILES,
  TEMPLATE_STYLES,
  type VideoGenResult,
} from "./videoGeneratorService.js";
import {
  checkDiffusionAvailable,
  renderDiffusionScene,
} from "./maxcoreDiffusionSceneService.js";

const execFileAsync = promisify(execFile);

function resolveFFmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = execFileSync("/bin/sh", ["-c", "which ffmpeg"], { timeout: 3000 })
      .toString()
      .trim();
    if (p) return p;
  } catch {
    /* intentional: shell which-lookup fails → falls through to hardcoded candidates */
  }
  for (const c of [
    "/run/current-system/sw/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ]) {
    if (existsSync(c)) return c;
  }
  return "ffmpeg";
}

const FFMPEG = resolveFFmpegPath();
const OUTPUT_DIR = path?.join(process.cwd(), "uploads", "videos");
const TEMP_DIR = path?.join(process.cwd(), "uploads", "video_temp");
const FONT_DIR = "/usr/share/fonts/truetype/dejavu";

const FONTS = {
  bold: `${FONT_DIR}/DejaVuSans-Bold.ttf`,
  regular: `${FONT_DIR}/DejaVuSans.ttf`,
  mono: `${FONT_DIR}/DejaVuSansMono-Bold.ttf`,
  serif: `${FONT_DIR}/DejaVuSerif-Bold.ttf`,
  italic: `${FONT_DIR}/DejaVuSans-Oblique.ttf`,
  boldItalic: `${FONT_DIR}/DejaVuSansMono-BoldOblique.ttf`,
} as const;

function tempPath(tag: string): string {
  return path?.join(
    TEMP_DIR,
    `img2v_${tag}_${randomBytes(4).toString("hex")}.mp4`,
  );
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* intentional: temp-file cleanup */
    }
  }
}

function sanitize(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/['"\[\]:,;|\\]/g, "")
    .replace(/%/g, "%%")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// ── KEN BURNS MOTION PATHS ────────────────────────────────────────────────────
interface KenBurnsMotion {
  id: string;
  // zoompan expressions — z=zoom, x/y=pan position in source pixels
  // Duration is set at render time (dur parameter replaces D in expressions)
  z: (dur: number) => string;
  x: (iw: number, ow: number, dur: number) => string;
  y: (ih: number, oh: number, dur: number) => string;
}

const KEN_BURNS_MOTIONS: KenBurnsMotion[] = [
  {
    id: "zoom_in_center",
    z: (d) => `1.0+0.08*on/${d * 25}`,
    x: (iw, ow) => `(${iw}/2-${ow}/2)`,
    y: (ih, oh) => `(${ih}/2-${oh}/2)`,
  },
  {
    id: "zoom_out_center",
    z: (d) => `1.08-0.08*on/${d * 25}`,
    x: (iw, ow) => `(${iw}/2-${ow}/2)`,
    y: (ih, oh) => `(${ih}/2-${oh}/2)`,
  },
  {
    id: "pan_left",
    z: () => `1.04`,
    x: (iw, ow, d) => `(${iw}-${ow})*on/${d * 25}`,
    y: (ih, oh) => `(${ih}/2-${oh}/2)`,
  },
  {
    id: "pan_right",
    z: () => `1.04`,
    x: (iw, ow, d) => `(${iw}-${ow})*(1-on/${d * 25})`,
    y: (ih, oh) => `(${ih}/2-${oh}/2)`,
  },
  {
    id: "zoom_in_top_left",
    z: (d) => `1.0+0.10*on/${d * 25}`,
    x: () => `0`,
    y: () => `0`,
  },
  {
    id: "zoom_in_bottom_right",
    z: (d) => `1.0+0.10*on/${d * 25}`,
    x: (iw, ow) => `${iw}-${ow}`,
    y: (ih, oh) => `${ih}-${oh}`,
  },
  {
    id: "tilt_up",
    z: () => `1.04`,
    x: (iw, ow) => `(${iw}/2-${ow}/2)`,
    y: (ih, oh, d) => `(${ih}-${oh})*(1-on/${d * 25})`,
  },
  {
    id: "tilt_down",
    z: () => `1.04`,
    x: (iw, ow) => `(${iw}/2-${ow}/2)`,
    y: (ih, oh, d) => `(${ih}-${oh})*on/${d * 25}`,
  },
];

// ── OPTIONS ───────────────────────────────────────────────────────────────────
export interface ImageToVideoOptions {
  imagePaths: string[]; // one or more image file paths
  audioPath?: string; // user-supplied audio file (mp3/wav/m4a)
  genre?: string; // for procedural audio if no audioPath
  template?: string; // visual template key (from videoGeneratorService)
  platform?: string; // tiktok | instagram | youtube | etc.
  aspect_ratio?: string; // '9:16' | '16:9' | '1:1' | '4:5'
  duration?: number; // total video duration in seconds (3–60)
  hook?: string; // hook text overlay
  body?: string; // body text overlay
  cta?: string; // CTA text overlay
  artistName?: string;
  voiceSynthPath?: string; // pre-synthesized voice audio file
  logoPath?: string;
  beatSync?: boolean; // align cuts to detected beats (default: true when audioPath present)
  kenBurnsIntensity?: "subtle" | "moderate" | "dramatic"; // motion scale
  colorGrade?: "none" | "warm" | "cool" | "cinematic" | "neon";
  transitionType?: string; // FFmpeg xfade transition
}

// ── KEN BURNS RENDERER ────────────────────────────────────────────────────────
async function renderImageWithKenBurns(
  imagePath: string,
  outputPath: string,
  width: number,
  height: number,
  durationSec: number,
  motionIndex: number,
  // NOTE: intensity is accepted for API compatibility but not yet wired into the
  // zoom/pan amount — Ken Burns currently renders the same regardless of level.
  _intensity: "subtle" | "moderate" | "dramatic",
  colorGrade: string,
  textOverlays: string[],
  fps = 30,
): Promise<void> {
  const motion = KEN_BURNS_MOTIONS[motionIndex % KEN_BURNS_MOTIONS.length];
  const frames = Math.ceil(durationSec * fps);

  // zoompan: zoom in/out + pan within source image
  // Output is at output resolution (width x height), source scaled from input image.
  // We render at full resolution — the zoompan filter handles the motion.
  const zBasic = motion.z(durationSec);
  const xBasic = motion.x(width, width, durationSec);
  const yBasic = motion.y(height, height, durationSec);

  // Color grade filter
  const gradeFilter = buildColorGrade(colorGrade);

  // Vignette for cinematic depth
  const vignetteFilter = "vignette=angle=PI/4.5:mode=forward:eval=init";

  // Build complete filter chain
  const filterParts = [
    `scale=${width * 2}:${height * 2}:flags=lanczos`, // oversample for quality Ken Burns
    `zoompan=z='${zBasic}':x='${xBasic}':y='${yBasic}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    "format=yuv420p",
    vignetteFilter,
    ...(gradeFilter ? [gradeFilter] : []),
    ...textOverlays,
  ];

  await execFileAsync(
    FFMPEG,
    [
      "-y",
      "-loop",
      "1", // loop still image as video source
      "-i",
      imagePath,
      "-vf",
      filterParts.join(","),
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
      String(durationSec),
      "-r",
      String(fps),
      outputPath,
    ],
    { timeout: Math.max(120_000, durationSec * 8000) },
  );
}

function buildColorGrade(grade: string): string {
  switch (grade) {
    case "warm":
      return "curves=r=0/0.1 1/1:g=0/0 1/0.95:b=0/0 1/0.88,eq=brightness=0.05:saturation=1.2";
    case "cool":
      return "curves=r=0/0 1/0.90:g=0/0 1/0.95:b=0/0.1 1/1,eq=brightness=0.02:saturation=1.1";
    case "cinematic":
      return "curves=r=0/0.05 1/0.95:g=0/0.02 1/0.93:b=0/0.08 1/0.92,eq=contrast=1.12:saturation=0.92,vignette=angle=PI/4:mode=forward:eval=init";
    case "neon":
      return "curves=r=0/0 1/1:g=0/0 0.5/0.7 1/1:b=0/0 0.5/0.8 1/1,eq=saturation=1.4:contrast=1.05";
    default:
      return "";
  }
}

// ── AUDIO FINALIZER (image video specific) ────────────────────────────────────
async function applyAudioToVideo(
  videoPath: string,
  outputPath: string,
  totalDur: number,
  genre: string,
  audioPath?: string,
  voiceSynthPath?: string,
  logoPath?: string,
): Promise<void> {
  const audioProfiles: Record<string, any> = AUDIO_PROFILES;
  const audioProfile = audioProfiles[genre] || audioProfiles.default;

  const fadeDur = Math.min(1.5, totalDur * 0.1);
  const fadeOut = Math.max(0, totalDur - fadeDur);
  const fd = fadeDur.toFixed(2);
  const fo = fadeOut.toFixed(2);

  const src1 = `aevalsrc=${audioProfile.bass}|${audioProfile.bass}:sample_rate=44100:channel_layout=stereo`;
  const src2 = `aevalsrc=${audioProfile.beat}|${audioProfile.beat}:sample_rate=44100:channel_layout=stereo`;
  const src3 = `aevalsrc=${audioProfile.pad}|${audioProfile.pad}:sample_rate=44100:channel_layout=stereo`;

  const hasLogo = !!(logoPath && existsSync(logoPath));
  const hasAudio = !!(audioPath && existsSync(audioPath));
  const hasVoice = !!(voiceSynthPath && existsSync(voiceSynthPath));

  const inputs: string[] = ["-i", videoPath];
  inputs.push("-f", "lavfi", "-i", src1);
  inputs.push("-f", "lavfi", "-i", src2);
  inputs.push("-f", "lavfi", "-i", src3);

  let logoIdx = -1;
  let audioIdx = -1;
  let voiceIdx = -1;
  let nextIdx = 4;

  if (hasLogo) {
    logoIdx = nextIdx++;
    inputs.push("-i", logoPath!);
  }
  if (hasAudio) {
    audioIdx = nextIdx++;
    inputs.push("-i", audioPath!);
  }
  if (hasVoice) {
    voiceIdx = nextIdx++;
    inputs.push("-i", voiceSynthPath!);
  }

  const parts: string[] = [];
  const videoMap = hasLogo ? ["-map", "[vfinal]"] : ["-map", "0:v"];
  const outputLabels = [...videoMap, "-map", "[afinal]"];

  if (hasLogo) {
    parts.push(
      `[${logoIdx}:v]scale=iw*0.14:ih*0.14[logo]`,
      `[0:v][logo]overlay=W-w-24:24:enable='between(t\\,0\\,${totalDur})'[vfinal]`,
    );
  }

  // Synth bed
  parts.push(
    `[1:a][2:a][3:a]amix=inputs=3:normalize=0:weights=1.25 1.0 0.55[synth_raw]`,
  );
  parts.push(
    `[synth_raw]${audioProfile.filters},extrastereo=m=1.4,` +
      `afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[synth]`,
  );

  if (hasAudio && hasVoice) {
    // User audio + voice narration over synth bed
    parts.push(
      `[${audioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `volume=0.85,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[user_a]`,
    );
    parts.push(
      `[${voiceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `volume=1.1,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[voice_a]`,
    );
    parts.push(
      `[user_a][voice_a][synth]amix=inputs=3:normalize=0:weights=1.0 1.1 0.15[afinal]`,
    );
  } else if (hasAudio) {
    // User audio (music) is dominant, synth bed very low
    parts.push(
      `[${audioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `volume=0.92,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[user_a]`,
    );
    parts.push(
      `[user_a][synth]amix=inputs=2:normalize=0:weights=1.0 0.08[afinal]`,
    );
  } else if (hasVoice) {
    // Voice narration + synth bed
    parts.push(
      `[${voiceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `volume=1.2,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[voice_a]`,
    );
    parts.push(
      `[voice_a][synth]amix=inputs=2:normalize=0:weights=1.2 0.22[afinal]`,
    );
  } else {
    parts.push(`[synth]volume=1.0[afinal]`);
  }

  const ffmpegArgs = [
    "-y",
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    ...outputLabels,
    "-c:v",
    hasLogo ? "libx264" : "copy",
    ...(hasLogo
      ? ["-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]
      : []),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-t",
    String(totalDur),
    outputPath,
  ];

  try {
    await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 120_000 });
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    if (/No such filter|Invalid option|filter.*not found/i.test(errMsg)) {
      logger.warn(
        "[ImageToVideo] Complex audio filters failed, retrying with safe chain",
      );
      const safeParts = parts.map((p) =>
        p
          .replace(
            `[synth_raw]${audioProfile.filters},extrastereo=m=1.4,`,
            "[synth_raw]volume=0.9,",
          )
          .replace(
            `[synth_raw]${audioProfile.filters},`,
            "[synth_raw]volume=0.9,",
          ),
      );
      const safeArgs = [
        "-y",
        ...inputs,
        "-filter_complex",
        safeParts.join(";"),
        ...outputLabels,
        "-c:v",
        hasLogo ? "libx264" : "copy",
        ...(hasLogo
          ? ["-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]
          : []),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-t",
        String(totalDur),
        outputPath,
      ];
      await execFileAsync(FFMPEG, safeArgs, { timeout: 120_000 });
    } else {
      throw err;
    }
  }
}

// ── SCENE COMBINER ────────────────────────────────────────────────────────────
async function combineImageScenes(
  scenePaths: string[],
  sceneDurations: number[],
  outputPath: string,
  transition: string,
  transitionDur = 0.4,
): Promise<void> {
  if (scenePaths.length === 1) {
    await execFileAsync("cp", [scenePaths[0], outputPath]);
    return;
  }
  const inputs = scenePaths.flatMap((p) => ["-i", p]);
  let fc = "";
  let prevLabel = "[0:v]";
  let cumOffset = 0;

  for (let i = 0; i < scenePaths.length - 1; i++) {
    cumOffset += sceneDurations[i] - transitionDur;
    const nextIn = `[${i + 1}:v]`;
    const outLbl = i === scenePaths.length - 2 ? "[vout]" : `[v${i}]`;
    fc += `${prevLabel}${nextIn}xfade=transition=${transition}:duration=${transitionDur}:offset=${cumOffset.toFixed(3)}${outLbl};`;
    prevLabel = outLbl;
  }
  fc = fc.replace(/;$/, "");

  await execFileAsync(
    FFMPEG,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      fc,
      "-map",
      "[vout]",
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
      outputPath,
    ],
    { timeout: 180_000 },
  );
}

// ── TEXT OVERLAYS FOR IMAGE VIDEO ─────────────────────────────────────────────
function buildTextOverlays(
  hook: string,
  body: string,
  cta: string,
  style: Record<string, unknown>,
  width: number,
  height: number,
  _sceneDuration: number,
  sceneType: "hook" | "body" | "cta" | "all",
  artistName?: string,
): string[] {
  const overlays: string[] = [];
  const barH = Math.floor(height * 0.085);
  const hs = style.hs || 64;
  const bs = style.bs || 42;
  const cs = style.cs || 48;
  const font = FONTS.bold;

  // Accent bars
  overlays.push(
    `drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`,
  );
  overlays.push(
    `drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`,
  );

  // Artist name
  if (artistName) {
    const at = sanitize(artistName).toUpperCase();
    overlays.push(
      `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=${style.ac}:fontsize=${Math.floor(bs * 0.62)}` +
        `:x=(w-text_w)/2:y=h*0.05:alpha='min(1\\,t*5)':bordercolor=black@0.4:borderw=2`,
    );
  }

  if (sceneType === "hook" || sceneType === "all") {
    const ht = sanitize(hook);
    // Shadow
    overlays.push(
      `drawtext=fontfile=${font}:text='${ht}':fontcolor=black@0.50:fontsize=${hs}` +
        `:x=(w-text_w)/2+4:y=(h-text_h)/4+4+30*(1-min(1\\,t*3)):alpha='min(1\\,t*3)'`,
    );
    // Main + outline
    overlays.push(
      `drawtext=fontfile=${font}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/4+30*(1-min(1\\,t*3)):alpha='min(1\\,t*3)'` +
        `:bordercolor=${style.ac}:borderw=2`,
    );
    // Expanding accent line
    const acLineY = Math.floor(height * 0.44);
    overlays.push(
      `drawbox=x=(iw-iw*min(1\\,max(0\\,(t-0.3)*2.5))*0.50)/2` +
        `:y=${acLineY}:w=iw*min(1\\,max(0\\,(t-0.3)*2.5))*0.50:h=4` +
        `:color=${style.ac}:t=fill:enable='gte(t\\,0.3)'`,
    );
  }

  if (sceneType === "body" || sceneType === "all") {
    const bt = sanitize(body);
    const yTime =
      sceneType === "all" ? `(h-text_h)/2` : `(h-text_h)/2+25*(1-min(1\\,t*3))`;
    overlays.push(
      `drawtext=fontfile=${font}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
        `:x=(w-text_w)/2:y=${yTime}:alpha='min(1\\,t*3)'`,
    );
  }

  if (sceneType === "cta" || sceneType === "all") {
    const ct = sanitize(cta);
    const boxW = Math.floor(width * 0.82);
    const boxX = Math.floor((width - boxW) / 2);
    const boxY = Math.floor(height * 0.68);
    const boxH = cs + 44;
    overlays.push(
      `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.cta_bg}@0.94:t=fill:enable='gte(t\\,0.2)'`,
    );
    overlays.push(
      `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=4:color=${style.ac}:t=fill:enable='gte(t\\,0.2)'`,
    );
    overlays.push(
      `drawbox=x=${boxX}:y=${boxY + boxH - 4}:w=${boxW}:h=4:color=${style.ac}@0.55:t=fill:enable='gte(t\\,0.2)'`,
    );
    overlays.push(
      `drawtext=fontfile=${font}:text='${ct}':fontcolor=white:fontsize=${cs}` +
        `:x=(w-text_w)/2:y=h*0.70+20*(1-min(1\\,t*5)):alpha='min(1\\,t*5)'`,
    );
  }

  return overlays;
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────
const ASPECT_RATIOS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};
const PLATFORM_RATIOS: Record<string, string> = {
  tiktok: "9:16",
  instagram: "1:1",
  instagram_reels: "9:16",
  youtube: "16:9",
  facebook: "1:1",
  twitter: "16:9",
  linkedin: "16:9",
};

export async function imageToMusicVideo(
  opts: ImageToVideoOptions,
): Promise<VideoGenResult> {
  const startMs = Date.now();
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const imagePaths = opts.imagePaths.filter((p) => existsSync(p));
  if (!imagePaths.length) {
    return { success: false, error: "No valid image files found" };
  }

  const templateKey =
    opts.template && TEMPLATE_STYLES[opts.template]
      ? opts.template
      : "cinematic_promo";
  const style = TEMPLATE_STYLES[templateKey] as unknown as Record<string, unknown>;
  const ratio =
    opts.aspect_ratio || PLATFORM_RATIOS[opts.platform || "tiktok"] || "9:16";
  const [width, height] = ASPECT_RATIOS[ratio] || [1080, 1920];
  const totalDur = Math.max(
    4,
    Math.min(opts.duration || imagePaths.length * 4, 60),
  );
  const genre = (opts.genre || "default").toLowerCase();
  const transition = opts.transitionType || style.transition || "fade";
  const intensity = opts.kenBurnsIntensity || "moderate";
  const colorGrade =
    opts.colorGrade || (style.bgType === "solid" ? "cinematic" : "none");
  const transitionDur = 0.4;

  const hook = opts.hook || "New Music Drop";
  const body = opts.body || "Stream now on all platforms";
  const cta = opts.cta || "Follow for more";

  const tempFiles: string[] = [];
  const renderStart = Date.now();

  try {
    // ── Beat sync: analyze audio and compute scene durations ────────────────
    let beatAnalysis: BeatAnalysis | null = null;
    let sceneDurations: number[];

    if (
      opts.audioPath &&
      existsSync(opts.audioPath) &&
      opts.beatSync !== false
    ) {
      try {
        beatAnalysis = await analyzeAudio(opts.audioPath);
        const cuts = getBeatAlignedCuts(beatAnalysis, imagePaths.length, true);
        sceneDurations = cutsToSceneDurations(
          cuts,
          Math.min(totalDur, beatAnalysis.durationSeconds),
        );
        logger.info(
          `[ImageToVideo] Beat sync — BPM=${beatAnalysis.bpm.toFixed(1)} tier=${beatAnalysis.tier}`,
        );
      } catch (e) {
        logger.warn(
          "[ImageToVideo] Beat analysis failed, using equal durations:",
          (e as Error).message,
        );
        const perScene = totalDur / imagePaths.length;
        sceneDurations = imagePaths.map(() => perScene);
      }
    } else {
      // Equal durations without beat sync
      const perScene = totalDur / imagePaths.length;
      sceneDurations = imagePaths.map(() => perScene);
    }

    // Ensure each scene is at least 1.5 seconds
    const minDur = 1.5;
    sceneDurations = sceneDurations.map((d) => Math.max(d, minDur));

    // ── Render each image — Tier 1: PyTorch diffusion → Tier 2: Ken Burns ───
    const scenePaths: string[] = [];
    const sceneSources: string[] = [];

    // Check diffusion availability once before the loop (2 s probe, 30 s cached).
    const diffusionAvailable = await checkDiffusionAvailable();
    if (diffusionAvailable) {
      logger.info(
        "[ImageToVideo] Tier 1 (PyTorch diffusion) active for this run",
      );
    }

    for (let i = 0; i < imagePaths.length; i++) {
      const sceneDur = sceneDurations[i];
      const scenePath = tempPath(`scene${i}`);
      tempFiles.push(scenePath);

      // Assign text type to scene
      let sceneType: "hook" | "body" | "cta" | "all";
      if (imagePaths.length === 1) {
        sceneType = "all";
      } else if (i === 0) {
        sceneType = "hook";
      } else if (i === imagePaths.length - 1) {
        sceneType = "cta";
      } else {
        sceneType = "body";
      }

      const textOverlays = buildTextOverlays(
        hook,
        body,
        cta,
        style,
        width,
        height,
        sceneDur,
        sceneType,
        opts.artistName,
      );

      // ── Tier 1: PyTorch diffusion (per-scene AI video synthesis) ──────────
      let sceneRendered = false;
      if (diffusionAvailable) {
        const diffOut = await renderDiffusionScene(
          {
            imagePath: imagePaths[i],
            outputPath: scenePath,
            width,
            height,
            durationSec: sceneDur,
            genre,
            colorGrade,
            platform: opts.platform,
            beatAnalysis,
            sceneIndex: i,
            totalScenes: imagePaths.length,
            artistName: opts.artistName,
            textOverlays,
          },
          FFMPEG,
        );
        if (diffOut) {
          sceneRendered = true;
          sceneSources.push("diffusion");
        }
      }

      // ── Tier 2: Ken Burns FFmpeg (always-available fallback) ──────────────
      if (!sceneRendered) {
        await renderImageWithKenBurns(
          imagePaths[i],
          scenePath,
          width,
          height,
          sceneDur,
          i, // motionIndex cycles through KEN_BURNS_MOTIONS
          intensity,
          colorGrade,
          textOverlays,
        );
        sceneSources.push("ken_burns");
      }

      scenePaths.push(scenePath);
    }

    const diffusionScenes = sceneSources.filter(
      (s) => s === "diffusion",
    ).length;
    const kenBurnsScenes = sceneSources.filter((s) => s === "ken_burns").length;
    if (diffusionScenes > 0) {
      logger.info(
        `[ImageToVideo] Scene render complete — ` +
          `diffusion: ${diffusionScenes}/${imagePaths.length} scenes, ` +
          `ken_burns: ${kenBurnsScenes}/${imagePaths.length} scenes`,
      );
    }

    // ── Combine scenes ──────────────────────────────────────────────────────
    let videoPath: string;
    if (scenePaths.length === 1) {
      videoPath = scenePaths[0];
    } else {
      videoPath = tempPath("combined");
      tempFiles.push(videoPath);
      await combineImageScenes(
        scenePaths,
        sceneDurations,
        videoPath,
        (transition as string),
        transitionDur,
      );
    }

    // ── Apply audio ─────────────────────────────────────────────────────────
    const combinedDur =
      sceneDurations.reduce((a, b) => a + b, 0) -
      (scenePaths.length > 1 ? (scenePaths.length - 1) * transitionDur : 0);

    const filename = `musicvideo_${randomBytes(6).toString("hex")}.mp4`;
    const finalPath = path.join(OUTPUT_DIR, filename);

    await applyAudioToVideo(
      videoPath,
      finalPath,
      combinedDur,
      genre,
      opts.audioPath,
      opts.voiceSynthPath,
      opts.logoPath,
    );

    const renderMs = Date.now() - renderStart;
    cleanup(...tempFiles);

    logger.info(
      `[ImageToVideo] ✅ ${filename} — ${width}x${height} ${combinedDur.toFixed(1)}s | ` +
        `${imagePaths.length} images | ${beatAnalysis ? `beat-synced BPM=${beatAnalysis.bpm.toFixed(0)}` : "equal cuts"} | ${renderMs}ms`,
    );

    const diffusionUsed = diffusionScenes > 0;
    const beatLabel = beatAnalysis
      ? `beat_sync_${beatAnalysis.tier}`
      : "equal_cuts";
    const tierLabel = diffusionUsed
      ? `pytorch_diffusion+${beatLabel}`
      : beatLabel;

    return {
      success: true,
      url: `/uploads/videos/${filename}`,
      filename,
      width,
      height,
      duration: Math.round(combinedDur),
      hook,
      body,
      cta,
      template: templateKey,
      template_name: style.name,
      scenes_rendered: imagePaths.length,
      processing_time_ms: Date.now() - startMs,
      render_time_ms: renderMs,
      source: tierLabel,
      quality: "cinematic",
      capabilities: [
        ...(diffusionUsed ? ["pytorch_diffusion"] : ["ken_burns"]),
        "beat_sync",
        "vignette",
        "drop_shadow",
        "text_outline",
        "color_grade",
        "audio_track",
        "multi_font",
        ...(opts.audioPath ? ["user_audio"] : []),
        ...(opts.voiceSynthPath ? ["voice_narration"] : []),
        ...(opts.logoPath ? ["logo_overlay"] : []),
        ...(diffusionUsed && kenBurnsScenes > 0 ? ["ken_burns_fallback"] : []),
      ],
    };
  } catch (err) {
    cleanup(...tempFiles);
    logger.warn("[ImageToVideo] Render failed:", (err as any).stderr || (err as Error).message);
    return {
      success: false,
      error: `Music video render failed: ${(err as Error).message || "FFmpeg error"}`,
    };
  }
}

/**
 * Single image to full music video — fastest path for cover art → video.
 */
export async function singleImageToVideo(
  opts: Omit<ImageToVideoOptions, "imagePaths"> & { imagePath: string },
): Promise<VideoGenResult> {
  return imageToMusicVideo({ ...opts, imagePaths: [opts?.imagePath] });
}
