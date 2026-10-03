// @ts-nocheck
/**
 * Studio Render Service — real project mixdown rendering.
 *
 * Replaces the old fake "render job" (which fabricated a file size/duration
 * from a formula and returned a downloadUrl to a file that never existed)
 * with a genuine pipeline:
 *   1. Fetch tracks + clips for the project, apply mute/solo rules.
 *   2. Resolve every clip's audio to a local file (download from storage if
 *      it isn't already on disk).
 *   3. Use ffmpeg to mix all clips into a single stereo PCM buffer, honoring
 *      per-track volume/pan and per-clip start time.
 *   4. Optionally run the mixed PCM through IntelligentMasteringEngine for
 *      genre-aware mastering.
 *   5. Encode the final buffer to the requested output format and write it
 *      to disk under uploads/audio/renders/, where it is actually servable.
 *
 * No step reports success unless the corresponding file really exists.
 */

import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { studioTracks, audioClips, projects } from "@shared/schema";
import { eq } from "drizzle-orm";
import { resolveAudioUrlToLocalFile } from "./audioSourceResolver.js";
import { storageService } from "./storageService.js";
import { logger } from "../logger.js";
import {
  IntelligentMasteringEngine,
  type MasteringGenre,
} from "../../shared/ml/audio/IntelligentMasteringEngine.js";
import { getMaxCoreMasteringRecommendation } from "./maxcoreMasteringService.js";
import {
  getMaxCoreMixingRecommendation,
  type TrackMixConfig,
  type TrackMixRole,
} from "./maxcoreMixingService.js";

let ffmpeg: any = null;
let ffmpegAvailable = false;

async function getFfmpeg() {
  if (ffmpegAvailable) return ffmpeg;
  try {
    const fluentFfmpeg = (await import("fluent-ffmpeg")).default;
    const ffmpegStatic = (await import("ffmpeg-static")).default;
    if (ffmpegStatic) fluentFfmpeg.setFfmpegPath(ffmpegStatic as string);
    ffmpeg = fluentFfmpeg;
    ffmpegAvailable = true;
    return ffmpeg;
  } catch (err) {
    logger.warn({ err }, "[StudioRender] ffmpeg unavailable");
    return null;
  }
}

export const RENDER_DIR = path.resolve("./uploads/audio/renders");

async function ensureRenderDir() {
  await fsPromises.mkdir(RENDER_DIR, { recursive: true });
}

// Delegates to the shared resolver (also used by warp/transient processing)
// which additionally understands the `/api/storage/file/<key>` form. Render
// keeps its existing lenient policy of skipping a clip it can't resolve
// rather than failing the whole mixdown.
async function resolveClipToLocalFile(audioUrl: string, userId: string): Promise<string | null> {
  if (!audioUrl) return null;
  try {
    const { localPath } = await resolveAudioUrlToLocalFile(audioUrl, userId);
    return localPath;
  } catch (err) {
    logger.warn({ err, audioUrl }, "[StudioRender] failed to resolve clip audio");
    return null;
  }
}

interface RenderInput {
  path: string;
  volume: number; // linear 0-2
  pan: number; // -1..1
  startTimeMs: number;
  isTempFile: boolean;
  /** Optional ffmpeg filter chain (no brackets) applied before volume/pan — auto-mix EQ + compression. */
  preFilter?: string;
  /** Carried through only to build the MaxCore mixing-recommendation role hint; unused by ffmpeg. */
  trackName?: string;
  trackType?: string;
}

/**
 * Infer an instrumental role from the only per-track semantic signal the
 * schema stores (name/type). Role is a hint MaxCore's decision uses alongside
 * the track's actually measured audio — it is not itself the decision.
 */
function inferTrackRole(
  name: string | undefined,
  trackType: string | undefined,
): TrackMixRole {
  const n = `${name ?? ""} ${trackType ?? ""}`.toLowerCase();
  if (/\bbass\b|808/.test(n)) return "bass";
  if (/\bkick\b/.test(n)) return "kick";
  if (/\bdrum|\bpercussion/.test(n)) return "drums";
  if (/\bvocal|\bvox\b|\blead\b|\brap\b/.test(n)) return "vocal";
  return "generic";
}

/** Render a MaxCore mixing recommendation into an ffmpeg filter chain (no brackets). */
function buildMixFilterString(config: TrackMixConfig): string {
  const parts: string[] = [`highpass=f=${config.highpassFreq}`];
  for (const band of config.eq) {
    if (Math.abs(band.gain) < 0.05) continue; // skip no-op bands
    parts.push(
      `equalizer=f=${band.frequency}:width_type=q:width=${band.q}:g=${band.gain}`,
    );
  }
  const c = config.compressor;
  parts.push(
    `acompressor=threshold=${c.threshold}dB:ratio=${c.ratio}:attack=${c.attack}:release=${c.release}:makeup=${Math.max(1, c.makeupGain)}`,
  );
  return parts.join(",");
}

/**
 * Decode ONE track to PCM, measure its real audio features (same extractor
 * used for mastering), and ask MaxCore how to correct it before mixdown.
 * Two tracks with the same inferred role get different results if their
 * measured content differs — this is not a per-role fixed preset.
 */
async function analyzeAndRecommendTrackMix(
  input: RenderInput,
  sampleRate: number,
  genre: MasteringGenre | undefined,
  tempFiles: string[],
): Promise<string> {
  const role = inferTrackRole(input.trackName, input.trackType);
  const { pcmPath } = await mixToRawPcm(
    [{ path: input.path, volume: 1, pan: 0, startTimeMs: 0, isTempFile: false }],
    sampleRate,
  );
  tempFiles.push(pcmPath);
  const pcm = await pcmFileToFloat32(pcmPath);
  const engine = new IntelligentMasteringEngine(sampleRate);
  const analysis = engine.analyzeForMastering(pcm, sampleRate);
  const recommendation = await getMaxCoreMixingRecommendation(
    analysis,
    role,
    genre,
    sampleRate,
  );
  return buildMixFilterString(recommendation.config);
}

const AUTO_MIX_CONCURRENCY = 6;

/**
 * Fill in `preFilter` on every input from a real, MaxCore-backed per-track
 * decision. Runs a bounded number of tracks in parallel so a large project
 * doesn't fire dozens of simultaneous MaxCore calls. Any AIUnavailableError
 * propagates — auto-mix has no silent local fallback.
 */
async function applyAutoMixFilters(
  inputs: RenderInput[],
  sampleRate: number,
  genre: MasteringGenre | undefined,
  tempFiles: string[],
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < inputs.length) {
      const index = cursor++;
      const input = inputs[index];
      input.preFilter = await analyzeAndRecommendTrackMix(
        input,
        sampleRate,
        genre,
        tempFiles,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(AUTO_MIX_CONCURRENCY, inputs.length) }, worker),
  );
}

async function mixToRawPcm(
  inputs: RenderInput[],
  sampleRate: number,
): Promise<{ pcmPath: string; durationSec: number }> {
  const ff = await getFfmpeg();
  if (!ff) throw new Error("ffmpeg is not available on this server");

  await ensureRenderDir();
  const pcmPath = path.join(os.tmpdir(), `render_mix_${randomUUID()}.f32le`);

  await new Promise<void>((resolve, reject) => {
    let command = ff();
    inputs.forEach((inp) => command = command.input(inp.path));

    const filterParts: string[] = [];
    inputs.forEach((inp, i) => {
      const delayMs = Math.max(0, Math.round(inp.startTimeMs));
      const panLeft = Math.max(0, 1 - Math.max(0, inp.pan));
      const panRight = Math.max(0, 1 + Math.min(0, inp.pan));
      const pre = inp.preFilter ? `${inp.preFilter},` : "";
      filterParts.push(
        `[${i}:a]${pre}volume=${inp.volume}:eval=once,pan=stereo|c0=${panLeft}*c0|c1=${panRight}*c1,adelay=${delayMs}|${delayMs}[a${i}]`,
      );
    });
    const mixInputs = inputs.map((_, i) => `[a${i}]`).join("");
    filterParts.push(
      `${mixInputs}amix=inputs=${inputs.length}:duration=longest:normalize=0[mixed]`,
    );

    command
      .complexFilter(filterParts, "mixed")
      .outputOptions([
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ar",
        String(sampleRate),
        "-ac",
        "2",
      ])
      .on("error", (err: Error) => reject(err))
      .on("end", () => resolve())
      .save(pcmPath);
  });

  const stat = await fsPromises.stat(pcmPath);
  const bytesPerFrame = 4 /* f32 */ * 2 /* channels */;
  const durationSec = stat.size / bytesPerFrame / sampleRate;

  return { pcmPath, durationSec };
}

async function pcmFileToFloat32(pcmPath: string): Promise<Float32Array> {
  const buf = await fsPromises.readFile(pcmPath);
  const floats = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / 4,
  );
  // Copy out of the shared ArrayBuffer since it may include other data.
  return new Float32Array(floats);
}

async function encodeFinal(
  interleaved: Float32Array,
  sampleRate: number,
  format: string,
  bitDepth: number,
  outPath: string,
): Promise<void> {
  const ff = await getFfmpeg();
  if (!ff) throw new Error("ffmpeg is not available on this server");

  const rawPath = path.join(os.tmpdir(), `render_final_${randomUUID()}.f32le`);
  await fsPromises.writeFile(rawPath, Buffer.from(interleaved.buffer));

  const codecMap: Record<string, string> = {
    wav: bitDepth === 32 ? "pcm_f32le" : bitDepth === 16 ? "pcm_s16le" : "pcm_s24le",
    aiff: "pcm_s24be",
    flac: "flac",
    mp3: "libmp3lame",
    aac: "aac",
    ogg: "libvorbis",
  };
  const codec = codecMap[format] || "pcm_s24le";

  await new Promise<void>((resolve, reject) => {
    ff()
      .input(rawPath)
      .inputOptions(["-f", "f32le", "-ar", String(sampleRate), "-ac", "2"])
      .audioCodec(codec)
      .on("error", (err: Error) => reject(err))
      .on("end", () => resolve())
      .save(outPath);
  });

  await fsPromises.unlink(rawPath).catch(() => {});
}

export interface RenderProjectOptions {
  format: string;
  sampleRate: number;
  bitDepth: number;
  applyMastering?: boolean;
  masteringGenre?: MasteringGenre;
  targetLufs?: number;
  /** Auto-mix engine: role-based per-track EQ + leveling compression before the mixdown. */
  applyAutoMix?: boolean;
}

export interface RenderProjectResult {
  renderId: string;
  filePath: string;
  downloadPath: string;
  fileSize: number;
  durationSec: number;
  mastering?: {
    genre: string;
    confidence: number;
    reasoning: string[];
  };
}

/**
 * Render a project's tracks/clips into a single real audio file on disk.
 * Throws on failure — callers must not synthesize a success response.
 */
export async function renderProjectMixdown(
  projectId: string,
  options: RenderProjectOptions,
): Promise<RenderProjectResult> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    throw new Error("Project not found");
  }

  const tracks = await db.query.studioTracks.findMany({
    where: eq(studioTracks.projectId, projectId),
  });
  const clips = await db.query.audioClips.findMany({
    where: eq(audioClips.projectId, projectId),
  });

  const hasSolo = tracks.some((t) => t.isSolo);
  const activeTrackIds = new Set(
    tracks
      .filter((t) => {
        if (t.isMuted && !t.isSolo) return false;
        if (hasSolo && !t.isSolo) return false;
        return true;
      })
      .map((t) => t.id),
  );

  const activeClips = clips.filter(
    (c) => c.audioUrl && (!c.trackId || activeTrackIds.has(c.trackId)),
  );

  if (activeClips.length === 0) {
    throw new Error("No audible clips found for this project — add audio before rendering");
  }

  const tempFiles: string[] = [];
  const inputs: RenderInput[] = [];

  try {
    for (const clip of activeClips) {
      const localPath = await resolveClipToLocalFile(clip.audioUrl!, project.userId);
      if (!localPath) continue;
      const isTemp = localPath.startsWith(os.tmpdir());
      if (isTemp) tempFiles.push(localPath);

      const track = tracks.find((t) => t.id === clip.trackId);
      inputs.push({
        path: localPath,
        volume: (clip.gain ?? 1) * (track?.volume ?? 1),
        pan: track?.pan ?? 0,
        startTimeMs: (clip.startTime ?? 0) * 1000,
        isTempFile: isTemp,
        trackName: track?.name,
        trackType: track?.trackType ?? undefined,
      });
    }

    if (inputs.length === 0) {
      throw new Error("No clip audio could be resolved to real files for rendering");
    }

    if (options.applyAutoMix) {
      await applyAutoMixFilters(
        inputs,
        options.sampleRate,
        options.masteringGenre,
        tempFiles,
      );
    }

    const { pcmPath, durationSec } = await mixToRawPcm(inputs, options.sampleRate);
    tempFiles.push(pcmPath);

    let finalPcm = await pcmFileToFloat32(pcmPath);
    let masteringInfo: RenderProjectResult["mastering"] | undefined;

    if (options.applyMastering) {
      const engine = new IntelligentMasteringEngine(options.sampleRate);
      const analysis = engine.analyzeForMastering(finalPcm, options.sampleRate);
      const suggestion = await getMaxCoreMasteringRecommendation(
        analysis,
        options.sampleRate,
        options.masteringGenre,
      );
      if (typeof options.targetLufs === "number") {
        suggestion.config.loudness.targetLUFS = options.targetLufs;
      }
      finalPcm = engine.masterTrack(finalPcm, suggestion.config, options.sampleRate);
      masteringInfo = {
        genre: suggestion.genre,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
      };
    }

    await ensureRenderDir();
    const renderId = `render_${randomUUID()}`;
    const ext = options.format === "aiff" ? "aiff" : options.format;
    const projectDir = path.join(RENDER_DIR, projectId);
    await fsPromises.mkdir(projectDir, { recursive: true });
    const finalPath = path.join(projectDir, `${renderId}.${ext}`);

    await encodeFinal(finalPcm, options.sampleRate, options.format, options.bitDepth, finalPath);

    const stat = await fsPromises.stat(finalPath);
    if (stat.size === 0) {
      throw new Error("Render produced an empty file");
    }

    // Local disk is scratch space only — the durable, servable copy lives in
    // PDIM-backed storage. Upload the finished render, then delete the local
    // copy so ./uploads/audio/renders never becomes a second source of truth.
    const contentTypeMap: Record<string, string> = {
      wav: "audio/wav",
      aiff: "audio/aiff",
      flac: "audio/flac",
      mp3: "audio/mpeg",
      aac: "audio/aac",
      ogg: "audio/ogg",
    };
    const finalBuffer = await fsPromises.readFile(finalPath);
    const storageKey = await storageService.uploadFile(
      finalBuffer,
      "studio-renders",
      `${renderId}.${ext}`,
      contentTypeMap[options.format] || "application/octet-stream",
    );
    const servedUrl = await storageService.getDownloadUrl(storageKey);

    await fsPromises.unlink(finalPath).catch(() => {});
    await fsPromises.rmdir(projectDir).catch(() => {});

    logger.info(
      { projectId, renderId, fileSize: stat.size, durationSec, storageKey },
      "[StudioRender] Real mixdown rendered and uploaded to PDIM storage",
    );

    return {
      renderId,
      filePath: servedUrl,
      downloadPath: servedUrl,
      fileSize: stat.size,
      durationSec,
      mastering: masteringInfo,
    };
  } finally {
    for (const f of tempFiles) {
      await fsPromises.unlink(f).catch(() => {});
    }
  }
}
