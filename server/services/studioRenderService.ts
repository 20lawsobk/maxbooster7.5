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
import { storageService } from "./storageService.js";
import { logger } from "../logger.js";
import {
  IntelligentMasteringEngine,
  type MasteringGenre,
} from "../../shared/ml/audio/IntelligentMasteringEngine.js";

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

async function resolveClipToLocalFile(audioUrl: string): Promise<string | null> {
  if (!audioUrl) return null;

  // Already a local path served from this app (uploads/, samples/, attached_assets/)
  if (audioUrl.startsWith("/uploads/") || audioUrl.startsWith("/samples/") || audioUrl.startsWith("/attached_assets/")) {
    const rel = audioUrl.replace(/^\//, "");
    const abs = path.resolve(".", rel.startsWith("uploads/") ? rel : path.join("client/public", rel));
    const candidates = [path.resolve(".", rel), abs];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
    try {
      const resp = await fetch(audioUrl);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const tmp = path.join(os.tmpdir(), `render_clip_${randomUUID()}.wav`);
      await fsPromises.writeFile(tmp, buf);
      return tmp;
    } catch (err) {
      logger.warn({ err, audioUrl }, "[StudioRender] failed to fetch remote clip");
      return null;
    }
  }

  // Otherwise treat as a storage key
  try {
    const buf = await storageService.downloadFile(audioUrl);
    const tmp = path.join(os.tmpdir(), `render_clip_${randomUUID()}.wav`);
    await fsPromises.writeFile(tmp, buf);
    return tmp;
  } catch (err) {
    logger.warn({ err, audioUrl }, "[StudioRender] failed to resolve clip from storage");
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
}

/**
 * Role-based corrective EQ + leveling compression for the auto-mix engine.
 * This is real per-track DSP applied through ffmpeg's audio filters
 * (highpass/lowshelf/peaking EQ + acompressor) — not a score or a fake
 * "mixed" flag. Roles are inferred from the track name/type since that's
 * the only per-track semantic signal the schema stores; unrecognized roles
 * get generic corrective EQ + gentle leveling rather than no processing.
 */
function autoMixFilterForTrack(
  name: string | undefined,
  trackType: string | undefined,
): string {
  const n = `${name ?? ""} ${trackType ?? ""}`.toLowerCase();
  const isBass = /\bbass\b|808/.test(n);
  const isKickOrDrum = /\bkick\b|\bdrum|\bpercussion/.test(n);
  const isVocal = /\bvocal|\bvox\b|\blead\b|\brap\b/.test(n);

  if (isBass) {
    // Keep sub weight, tame boxy mids, prevent bass from clashing with kick.
    return "highpass=f=30,equalizer=f=250:width_type=o:width=1.5:g=-3,acompressor=threshold=-16dB:ratio=3.5:attack=8:release=90:makeup=2";
  }
  if (isKickOrDrum) {
    // Punch through with a small low-mid scoop for clarity against bass.
    return "highpass=f=35,equalizer=f=400:width_type=o:width=1.5:g=-2,acompressor=threshold=-14dB:ratio=4:attack=3:release=60:makeup=2";
  }
  if (isVocal) {
    // Clear the low end, add presence, gentle leveling compression.
    return "highpass=f=100,equalizer=f=3000:width_type=o:width=1.8:g=2.5,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=80:makeup=2.5";
  }
  // Generic instrument/other: reduce sub-bass mud, light leveling.
  return "highpass=f=60,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=100:makeup=1.5";
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
      const localPath = await resolveClipToLocalFile(clip.audioUrl!);
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
        preFilter: options.applyAutoMix
          ? autoMixFilterForTrack(track?.name, track?.trackType ?? undefined)
          : undefined,
      });
    }

    if (inputs.length === 0) {
      throw new Error("No clip audio could be resolved to real files for rendering");
    }

    const { pcmPath, durationSec } = await mixToRawPcm(inputs, options.sampleRate);
    tempFiles.push(pcmPath);

    let finalPcm = await pcmFileToFloat32(pcmPath);
    let masteringInfo: RenderProjectResult["mastering"] | undefined;

    if (options.applyMastering) {
      const engine = new IntelligentMasteringEngine(options.sampleRate);
      const suggestion = engine.suggestSettings(
        finalPcm,
        options.masteringGenre,
        options.sampleRate,
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

    logger.info(
      { projectId, renderId, fileSize: stat.size, durationSec },
      "[StudioRender] Real mixdown rendered",
    );

    return {
      renderId,
      filePath: finalPath,
      downloadPath: `/uploads/audio/renders/${projectId}/${renderId}.${ext}`,
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
