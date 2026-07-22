/**
 * Voice Synthesis Service
 *
 * Architecture: MaxCore is the ONLY voice-synthesis source. `synthesizeVoice`
 * calls MaxCore audio generation and fails explicitly (AIUnavailableError) when
 * MaxCore is unavailable — there is no local TTS fallback. FFmpeg is used only
 * for post-processing the MaxCore-generated audio (format/loudness), never to
 * synthesize speech locally.
 *
 * VOICE_PROFILES describe the requested voice characteristics passed to MaxCore.
 */

import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { writeFile as fsWriteFile } from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";

const execFileAsync = promisify(execFile);

// ── FFmpeg path resolution ────────────────────────────────────────────────────
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
const VOICE_DIR = path.join(process.cwd(), "uploads", "voices");

// ── VOICE PROFILES ─────────────────────────────────────────────────────────
export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  category: "hype" | "smooth" | "cinematic" | "character";
  gender: "neutral" | "masculine" | "feminine";
  pitchFactor: number; // asetrate multiplier (1.0=normal, 0.80=deeper, 1.20=higher)
  tempoFactor: number; // atempo speed (1.0=normal, 1.15=faster, 0.90=slower)
  eqChain: string; // FFmpeg audio filter chain
  spatialFx: string; // echo/reverb/delay filter
  stereoWidth: number; // extrastereo m value (1.0=normal, 1.8=wide)
  gainDb: number; // final gain adjustment in dB
}

export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  radio_announcer: {
    id: "radio_announcer",
    name: "Radio Announcer",
    category: "cinematic",
    gender: "masculine",
    description:
      "Deep, authoritative broadcast voice — cut-through-the-noise presence",
    pitchFactor: 0.88,
    tempoFactor: 0.97,
    eqChain:
      "highpass=f=120,equalizer=f=200:width_type=o:width=2:g=3,equalizer=f=1200:width_type=o:width=2:g=2,equalizer=f=8000:width_type=o:width=2:g=-2,acompressor=threshold=0.4:ratio=4:attack=3:release=40",
    spatialFx: "aecho=0.8:0.6:20:0.08",
    stereoWidth: 1.3,
    gainDb: 2,
  },
  hype_man: {
    id: "hype_man",
    name: "Hype Man",
    category: "hype",
    gender: "masculine",
    description: "High-energy, punchy and fast — festival opener energy",
    pitchFactor: 1.06,
    tempoFactor: 1.12,
    eqChain:
      "highpass=f=100,treble=g=4,equalizer=f=3000:width_type=o:width=2:g=3,acompressor=threshold=0.3:ratio=6:attack=1:release=20",
    spatialFx: "aecho=0.6:0.4:15:0.05",
    stereoWidth: 1.6,
    gainDb: 3,
  },
  smooth_narrator: {
    id: "smooth_narrator",
    name: "Smooth Narrator",
    category: "cinematic",
    gender: "neutral",
    description: "Measured, cinematic documentary voice — trust and gravitas",
    pitchFactor: 0.92,
    tempoFactor: 0.9,
    eqChain:
      "highpass=f=90,equalizer=f=300:width_type=o:width=2:g=2,equalizer=f=2500:width_type=o:width=2:g=1,lowpass=f=14000,acompressor=threshold=0.45:ratio=3:attack=8:release=80",
    spatialFx: "aecho=0.85:0.6:30:0.12",
    stereoWidth: 1.2,
    gainDb: 1,
  },
  r_and_b_smooth: {
    id: "r_and_b_smooth",
    name: "R&B Smooth",
    category: "smooth",
    gender: "neutral",
    description: "Warm, silky, intimate — velvet texture for soulful content",
    pitchFactor: 0.9,
    tempoFactor: 0.93,
    eqChain:
      "highpass=f=80,equalizer=f=180:width_type=o:width=2:g=4,equalizer=f=800:width_type=o:width=2:g=2,equalizer=f=6000:width_type=o:width=2:g=-3,lowpass=f=12000,acompressor=threshold=0.4:ratio=3:attack=6:release=60",
    spatialFx: "aecho=0.9:0.7:40:0.18",
    stereoWidth: 1.5,
    gainDb: 1,
  },
  hype_girl: {
    id: "hype_girl",
    name: "Hype Girl",
    category: "hype",
    gender: "feminine",
    description: "Bright, energetic, celebratory — pop and dance content queen",
    pitchFactor: 1.18,
    tempoFactor: 1.08,
    eqChain:
      "highpass=f=150,treble=g=5,equalizer=f=4000:width_type=o:width=2:g=3,equalizer=f=200:width_type=o:width=2:g=-2,acompressor=threshold=0.35:ratio=4:attack=2:release=25",
    spatialFx: "aecho=0.7:0.5:18:0.08",
    stereoWidth: 1.7,
    gainDb: 2,
  },
  deep_boss: {
    id: "deep_boss",
    name: "Deep Boss",
    category: "hype",
    gender: "masculine",
    description: "Very deep, commanding, bass-heavy — trap and rap authority",
    pitchFactor: 0.78,
    tempoFactor: 0.95,
    eqChain:
      "highpass=f=60,bass=g=6,equalizer=f=100:width_type=o:width=2:g=4,equalizer=f=4000:width_type=o:width=2:g=-3,acompressor=threshold=0.3:ratio=5:attack=3:release=35",
    spatialFx: "aecho=0.8:0.5:25:0.10",
    stereoWidth: 1.4,
    gainDb: 3,
  },
  ethereal_guide: {
    id: "ethereal_guide",
    name: "Ethereal Guide",
    category: "character",
    gender: "feminine",
    description:
      "Dreamy, reverb-drenched, otherworldly — ambient and spiritual vibes",
    pitchFactor: 1.1,
    tempoFactor: 0.88,
    eqChain:
      "highpass=f=100,equalizer=f=500:width_type=o:width=2:g=-2,equalizer=f=3000:width_type=o:width=2:g=4,treble=g=3,acompressor=threshold=0.5:ratio=2:attack=15:release=120",
    spatialFx: "aecho=0.8:0.6:60:0.30,aecho=0.6:0.4:120:0.15",
    stereoWidth: 1.9,
    gainDb: 0,
  },
  rap_mc: {
    id: "rap_mc",
    name: "Rap MC",
    category: "hype",
    gender: "neutral",
    description: "Fast, rhythmic, punchy — hip-hop and rap drops",
    pitchFactor: 1.02,
    tempoFactor: 1.18,
    eqChain:
      "highpass=f=100,equalizer=f=200:width_type=o:width=2:g=2,treble=g=2,equalizer=f=2000:width_type=o:width=2:g=2,acompressor=threshold=0.28:ratio=7:attack=1:release=18",
    spatialFx: "aecho=0.7:0.4:12:0.06",
    stereoWidth: 1.5,
    gainDb: 2,
  },
  whisper_intimate: {
    id: "whisper_intimate",
    name: "Whisper",
    category: "smooth",
    gender: "neutral",
    description:
      "Soft, hushed, intimate — perfect for emotional or late-night content",
    pitchFactor: 0.95,
    tempoFactor: 0.86,
    eqChain:
      "highpass=f=120,equalizer=f=1000:width_type=o:width=2:g=2,treble=g=-2,lowpass=f=10000,acompressor=threshold=0.6:ratio=2:attack=20:release=150,volume=0.7",
    spatialFx: "aecho=0.9:0.8:50:0.25",
    stereoWidth: 1.6,
    gainDb: -3,
  },
  storyteller_warm: {
    id: "storyteller_warm",
    name: "Storyteller",
    category: "cinematic",
    gender: "neutral",
    description:
      "Warm, measured, inviting — the voice of a compelling narrative",
    pitchFactor: 0.94,
    tempoFactor: 0.92,
    eqChain:
      "highpass=f=100,equalizer=f=250:width_type=o:width=2:g=3,equalizer=f=2000:width_type=o:width=2:g=1,equalizer=f=7000:width_type=o:width=2:g=-1,acompressor=threshold=0.42:ratio=3:attack=7:release=70",
    spatialFx: "aecho=0.85:0.65:35:0.14",
    stereoWidth: 1.3,
    gainDb: 1,
  },
  arena_hype: {
    id: "arena_hype",
    name: "Arena Hype",
    category: "hype",
    gender: "masculine",
    description: "MASSIVE, stadium-sized, echo-heavy — concert intro energy",
    pitchFactor: 0.93,
    tempoFactor: 1.05,
    eqChain:
      "highpass=f=100,bass=g=4,equalizer=f=1500:width_type=o:width=2:g=3,treble=g=2,acompressor=threshold=0.25:ratio=8:attack=2:release=30",
    spatialFx: "aecho=0.85:0.7:80:0.35,aecho=0.7:0.5:160:0.18",
    stereoWidth: 1.8,
    gainDb: 4,
  },
  afrobeats_hype: {
    id: "afrobeats_hype",
    name: "Afrobeats Hype",
    category: "hype",
    gender: "neutral",
    description: "Bright, tropical, rhythmic — Afrobeats and Amapiano energy",
    pitchFactor: 1.05,
    tempoFactor: 1.06,
    eqChain:
      "highpass=f=110,treble=g=4,equalizer=f=3500:width_type=o:width=2:g=3,equalizer=f=150:width_type=o:width=2:g=3,acompressor=threshold=0.32:ratio=5:attack=3:release=35",
    spatialFx: "aecho=0.75:0.5:20:0.10",
    stereoWidth: 1.6,
    gainDb: 2,
  },
  latin_energy: {
    id: "latin_energy",
    name: "Latin Energy",
    category: "hype",
    gender: "feminine",
    description: "Vibrant, bright, passionate — reggaeton and Latin pop",
    pitchFactor: 1.08,
    tempoFactor: 1.1,
    eqChain:
      "highpass=f=120,treble=g=5,equalizer=f=4000:width_type=o:width=2:g=4,equalizer=f=100:width_type=o:width=2:g=2,acompressor=threshold=0.30:ratio=5:attack=2:release=28",
    spatialFx: "aecho=0.72:0.48:16:0.07",
    stereoWidth: 1.7,
    gainDb: 2,
  },
  cold_luxury: {
    id: "cold_luxury",
    name: "Cold Luxury",
    category: "smooth",
    gender: "neutral",
    description:
      "Cool, detached, premium — luxury brand and high-fashion energy",
    pitchFactor: 0.87,
    tempoFactor: 0.88,
    eqChain:
      "highpass=f=150,equalizer=f=300:width_type=o:width=2:g=-2,equalizer=f=2000:width_type=o:width=2:g=2,equalizer=f=8000:width_type=o:width=2:g=3,acompressor=threshold=0.5:ratio=3:attack=10:release=90",
    spatialFx: "aecho=0.9:0.7:45:0.20",
    stereoWidth: 1.4,
    gainDb: 0,
  },
};

// ── REFERENCE VOICE ANALYSIS ──────────────────────────────────────────────────
export interface VoiceCharacteristics {
  estimatedPitch: "very_low" | "low" | "medium" | "high" | "very_high";
  estimatedTempo: "slow" | "medium" | "fast";
  energy: "quiet" | "moderate" | "loud";
  suggestedProfileId: string;
}

export async function analyzeReferenceVoice(
  audioPath: string,
): Promise<VoiceCharacteristics> {
  try {
    // Use FFmpeg astats to get basic signal characteristics
    const { stderr } = await execFileAsync(
      FFMPEG,
      ["-i", audioPath, "-af", "astats=metadata=1:reset=1", "-f", "null", "-"],
      { timeout: 15_000 },
    );

    // Parse RMS level → energy estimate
    const rmsMatch = stderr?.match(/RMS level dB:\s*([-\d.]+)/);
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -20;
    const energy: VoiceCharacteristics["energy"] =
      rmsDb > -12 ? "loud" : rmsDb > -24 ? "moderate" : "quiet";

    // Parse mean sample value / peak → rough pitch approximation
    // (real pitch detection needs librosa; this is a heuristic)
    const peakMatch = stderr?.match(/Max level dB:\s*([-\d.]+)/);
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -6;
    const dynamic = peakDb - rmsDb; // wider dynamic = more expressive/slower

    const estimatedPitch: VoiceCharacteristics["estimatedPitch"] =
      dynamic < 8
        ? "very_low"
        : dynamic < 14
          ? "low"
          : dynamic < 20
            ? "medium"
            : dynamic < 26
              ? "high"
              : "very_high";

    const estimatedTempo: VoiceCharacteristics["estimatedTempo"] =
      dynamic > 22 ? "slow" : dynamic > 14 ? "medium" : "fast";

    // Suggest closest profile based on energy + pitch
    let suggestedProfileId = "smooth_narrator";
    if (energy === "loud") {
      suggestedProfileId =
        estimatedPitch === "very_high" || estimatedPitch === "high"
          ? "hype_girl"
          : estimatedPitch === "low" || estimatedPitch === "very_low"
            ? "deep_boss"
            : "hype_man";
    } else if (energy === "moderate") {
      suggestedProfileId =
        estimatedPitch === "high" || estimatedPitch === "very_high"
          ? "r_and_b_smooth"
          : "storyteller_warm";
    } else {
      suggestedProfileId = "whisper_intimate";
    }

    return { estimatedPitch, estimatedTempo, energy, suggestedProfileId };
  } catch (e) {
    logger.warn("[VoiceSynth] Reference analysis failed:", e?.message);
    return {
      estimatedPitch: "medium",
      estimatedTempo: "medium",
      energy: "moderate",
      suggestedProfileId: "smooth_narrator",
    };
  }
}

// ── CORE SYNTHESIS ────────────────────────────────────────────────────────────
export interface SynthesisOptions {
  profileId?: string;
  speed?: number; // additional speed multiplier (0.5–2.0, default 1.0)
  pitch?: number; // additional pitch multiplier (0.7–1.5, default 1.0)
  volume?: number; // output volume 0.0–2.0 (default 1.0)
  outputFormat?: "wav" | "mp3";
  reverbAmount?: number; // 0.0 (none) – 1.0 (heavy) — scales spatial FX
  referenceAudioPath?: string; // analyze + adapt voice to this sample
  maxDurationSeconds?: number; // truncate output to this length
}

export interface SynthesisResult {
  success: boolean;
  outputPath?: string;
  durationSeconds?: number;
  profileUsed?: string;
  voiceUsed?: string;
  error?: string;
}

export async function synthesizeVoice(
  text: string,
  options: SynthesisOptions = {},
): Promise<SynthesisResult> {
  mkdirSync(VOICE_DIR, { recursive: true });

  // ── MaxCore primary TTS ──────────────────────────────────────────────────
  const mcAudio = requireMaxCore(
    await MaxCoreAIClient.generate<{
      audioUrl?: string;
      audio_url?: string;
      audio_data?: string;
      format?: string;
      duration?: number;
    }>("/api/generate/audio", {
      text,
      voice_id: options.profileId ?? "smooth_narrator",
      output_format: options.outputFormat ?? "wav",
      pitch: options.pitch ?? 1.0,
      speed: options.speed ?? 1.0,
      volume: options.volume ?? 1.0,
      max_duration: options.maxDurationSeconds ?? null,
    }),
    "voice synthesis",
  );

  const audioSrc = mcAudio?.audioUrl ?? mcAudio?.audio_url ?? null;
  const audioData = mcAudio?.audio_data ?? null;

  // A non-null response with no usable audio is still unavailability — surface
  // it explicitly instead of a soft success:false result.
  if (!(audioSrc || audioData)) {
    throw new AIUnavailableError("voice synthesis");
  }

  const ext = options.outputFormat === "mp3" ? "mp3" : "wav";
  const outFilename = `voice_mc_${randomBytes(6).toString("hex")}.${ext}`;
  const outputPath = path.join(VOICE_DIR, outFilename);

  if (audioData) {
    await fsWriteFile(outputPath, Buffer.from(audioData, "base64"));
  } else if (audioSrc) {
    const resp = await fetch(audioSrc);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      await fsWriteFile(outputPath, buf);
    } else {
      throw new Error(`MaxCore audio download failed: ${resp.status}`);
    }
  }

  logger.info(`[VoiceSynth] MaxCore audio generated → ${outFilename}`);
  return {
    success: true,
    outputPath,
    durationSeconds: mcAudio?.duration ?? 0,
    profileUsed: options.profileId ?? "smooth_narrator",
    voiceUsed: "maxcore",
  };
}

/**
 * Synthesize multiple text segments with cross-fading between them.
 * Returns a single merged audio file.
 */
export async function synthesizeSegments(
  segments: Array<{ text: string; pause?: number }>,
  options: SynthesisOptions = {},
): Promise<SynthesisResult> {
  if (!segments?.length)
    return { success: false, error: "No segments provided" };

  const tempFiles: string[] = [];

  try {
    // Synthesize each segment to a temp file
    const segPaths: string[] = [];
    for (let i = 0; i < segments?.length; i++) {
      const seg = segments[i];
      const result = await synthesizeVoice(seg?.text, options);
      if (!result?.success || !result?.outputPath) {
        return {
          success: false,
          error: `Segment ${i + 1} synthesis failed: ${result?.error}`,
        };
      }
      segPaths?.push(result?.outputPath);
      tempFiles?.push(result?.outputPath);

      // Add a silence gap between segments if requested
      if (seg?.pause && seg?.pause > 0 && i < segments?.length - 1) {
        const pausePath = path?.join(
          os?.tmpdir(),
          `pause_${randomBytes(4).toString("hex")}.wav`,
        );
        await execFileAsync(
          FFMPEG,
          [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `anullsrc=sample_rate=44100:channel_layout=stereo`,
            "-t",
            String(seg?.pause),
            "-c:a",
            "pcm_s16le",
            pausePath,
          ],
          { timeout: 10_000 },
        );
        segPaths?.push(pausePath);
        tempFiles?.push(pausePath);
      }
    }

    if (segPaths?.length === 1) {
      return {
        success: true,
        outputPath: segPaths[0],
        profileUsed: options.profileId,
      };
    }

    // Concatenate all segments using FFmpeg concat demuxer
    const concatList = path?.join(
      os?.tmpdir(),
      `concat_${randomBytes(4).toString("hex")}.txt`,
    );
    await fsWriteFile(
      concatList,
      segPaths?.map((p) => `file '${p}'`).join("\n"),
    );
    tempFiles?.push(concatList);

    const outFilename = `voice_${randomBytes(6).toString("hex")}.wav`;
    const outputPath = path?.join(VOICE_DIR, outFilename);

    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatList,
        "-c:a",
        "pcm_s16le",
        outputPath,
      ],
      { timeout: 60_000 },
    );

    return { success: true, outputPath, profileUsed: options.profileId };
  } catch (err) {
    // MaxCore unavailability must propagate explicitly, not collapse into a
    // soft success:false result.
    if (err instanceof AIUnavailableError) throw err;
    return { success: false, error: err.message || String(err) };
  } finally {
    // Clean up temp segment files
    for (const f of tempFiles) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        /* intentional: temp segment file cleanup */
      }
    }
  }
}

export function listVoiceProfiles(): VoiceProfile[] {
  return Object.values(VOICE_PROFILES);
}

export function getVoiceProfile(id: string): VoiceProfile | undefined {
  return VOICE_PROFILES[id];
}
