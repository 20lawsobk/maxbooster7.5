/**
 * AI Audio Generator Service - Server-Side Integration
 *
 * Provides REST API endpoints for the in-house AI audio generation system
 */

import wavefilePkg from "wavefile";
const WaveFile =
  (wavefilePkg as Record<string, unknown>).WaveFile || wavefilePkg;
import { randomBytes } from "crypto";

import { AIAudioGenerator, type GenerationType } from "../../shared/ml/audio/AIAudioGenerator.js";
import { logger } from "../logger.js";
import { storageService } from "./storageService.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";

// Initialize generator
const audioGenerator = new AIAudioGenerator(48000);
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await audioGenerator?.initialize();
    initialized = true;
  }
}

export interface TextToAudioRequest {
  text: string;
  duration?: number;
  bars?: number;
  tempo?: number;
  projectId?: string;
}

export interface AudioToAudioRequest {
  audioBuffer: Buffer;
  targetType: GenerationType;
  text?: string;
  bars?: number;
  projectId?: string;
}

export interface GenerationResult {
  success: boolean;
  audioFilePath: string;
  parameters: {
    type: GenerationType;
    tempo: number;
    key: string;
    scale: string;
    genre: string;
  };
  duration: number;
  sourceType: "text" | "audio";
  generatedNotes?: Array<{
    note: string;
    octave: number;
    time: number;
    duration: number;
    velocity: number;
  }>;
  generatedChords?: Array<{ chord: string; time: number; duration: number }>;
}

async function saveToWav(
  audioData: Float32Array,
  sampleRate: number,
): Promise<string> {
  const int16Data = new Int16Array(audioData?.length);
  for (let i = 0; i < audioData?.length; i++) {
    int16Data[i] = Math?.max(
      -32768,
      Math?.min(32767, Math?.floor(audioData[i] * 32767)),
    );
  }

  const wav = new WaveFile();
  wav?.fromScratch(1, sampleRate, "16", Array?.from(int16Data));

  const filename = `ai_generated_${Date?.now()}_${randomBytes(8).toString("hex")}.wav`;
  const key = `generated-content/audio/${filename}`;
  const buffer = Buffer?.from(wav?.toBuffer());

  await storageService?.uploadFile(buffer, key, "audio/wav");
  return await storageService?.getDownloadUrl(key);
}

export async function generateFromText(
  request: TextToAudioRequest,
): Promise<GenerationResult> {
  await ensureInitialized();

  logger?.info(`[AI Audio] Generating from text: "${request.text}"`);

  // ── MaxCore primary audio generation ─────────────────────────────────────
  const mcAudio = requireMaxCore(
    await MaxCoreAIClient.generate<{
      audioUrl?: string;
      audio_url?: string;
      audio_data?: string;
      duration?: number;
      tempo?: number;
      key?: string;
      scale?: string;
      genre?: string;
    }>("/api/generate/audio", {
      text: request.text,
      duration: request.duration ?? null,
      bars: request.bars ?? null,
      tempo: request.tempo ?? null,
      project_id: request.projectId ?? null,
    }),
    "audio generation",
  );

  const audioSrc = mcAudio?.audioUrl ?? mcAudio?.audio_url ?? null;
  const audioData = mcAudio?.audio_data ?? null;

  if (!(audioSrc || audioData)) {
    throw new Error("MaxCore audio generation returned no audio");
  }

  const outDir = process.cwd() + "/uploads/audio";
  const { mkdirSync } = await import("fs");
  mkdirSync(outDir, { recursive: true });
  const filename = `mc_audio_${randomBytes(6).toString("hex")}.wav`;
  const filePath = `${outDir}/${filename}`;

  if (audioData) {
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, Buffer.from(audioData, "base64"));
  } else if (audioSrc) {
    const resp = await fetch(audioSrc);
    if (resp.ok) {
      const { writeFile } = await import("fs/promises");
      await writeFile(filePath, Buffer.from(await resp.arrayBuffer()));
    } else {
      throw new Error(`MaxCore audio download failed: ${resp.status}`);
    }
  }

  logger?.info(`[AI Audio] MaxCore audio generated → ${filename}`);
  return {
    success: true,
    audioFilePath: `/uploads/audio/${filename}`,
    parameters: {
      type: "music" as GenerationType,
      tempo: mcAudio?.tempo ?? request.tempo ?? 120,
      key: mcAudio?.key ?? "C",
      scale: mcAudio?.scale ?? "major",
      genre: mcAudio?.genre ?? "electronic",
    },
    duration: mcAudio?.duration ?? request.duration ?? 0,
    sourceType: "text",
  };
}


export async function generateFromReference(
  request: AudioToAudioRequest,
): Promise<GenerationResult> {
  await ensureInitialized();

  logger?.info(
    `[AI Audio] Generating ${request?.targetType} from audio reference`,
  );

  // MaxCore is the ONLY audio-generation source — no local synthesis fallback.
  // The requested target style is described to MaxCore; generation is required
  // and fails explicitly when MaxCore is unavailable or returns no audio.
  const mcAudio = requireMaxCore(
    await MaxCoreAIClient.generate<{
      audioUrl?: string;
      audio_url?: string;
      audio_data?: string;
      duration?: number;
      tempo?: number;
      key?: string;
      scale?: string;
      genre?: string;
      notes?: Array<{
        note: string;
        octave: number;
        time: number;
        duration: number;
        velocity: number;
      }>;
      chords?: Array<{ chord: string; time: number; duration: number }>;
    }>("/api/generate/audio", {
      mode: "audio-to-audio",
      target_type: request.targetType,
      text: request.text ?? null,
      bars: request.bars ?? null,
      project_id: request.projectId ?? null,
      // Style transfer needs the reference audio itself — send it to MaxCore.
      reference_audio: request.audioBuffer.toString("base64"),
      reference_format: "wav",
    }),
    "audio style transfer",
  );

  const audioSrc = mcAudio?.audioUrl ?? mcAudio?.audio_url ?? null;
  const audioData = mcAudio?.audio_data ?? null;
  if (!(audioSrc || audioData)) {
    throw new AIUnavailableError("audio style transfer");
  }

  const outDir = process.cwd() + "/uploads/audio";
  const { mkdirSync } = await import("fs");
  mkdirSync(outDir, { recursive: true });
  const filename = `mc_audio_${randomBytes(6).toString("hex")}.wav`;
  const filePath = `${outDir}/${filename}`;

  if (audioData) {
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, Buffer.from(audioData, "base64"));
  } else if (audioSrc) {
    const resp = await fetch(audioSrc);
    if (!resp.ok) {
      throw new Error(`MaxCore audio download failed: ${resp.status}`);
    }
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, Buffer.from(await resp.arrayBuffer()));
  }

  logger?.info(
    `[AI Audio] MaxCore audio (from reference) generated → ${filename}`,
  );
  return {
    success: true,
    audioFilePath: `/uploads/audio/${filename}`,
    parameters: {
      type: request.targetType,
      tempo: mcAudio?.tempo ?? 120,
      key: mcAudio?.key ?? "C",
      scale: mcAudio?.scale ?? "major",
      genre: mcAudio?.genre ?? "electronic",
    },
    duration: mcAudio?.duration ?? 0,
    sourceType: "audio",
    generatedNotes: mcAudio?.notes,
    generatedChords: mcAudio?.chords,
  };
}

export async function generateDrumHit(
  type: "kick" | "snare" | "hihat" | "clap",
  preset?: string,
): Promise<string> {
  await ensureInitialized();

  const audioData = audioGenerator?.generateDrumHit(type, preset, 1);
  return saveToWav(audioData, 48000);
}

export async function generateBassNote(
  note: string,
  octave: number = 1,
  preset: string = "trap808",
  duration: number = 1,
): Promise<string> {
  await ensureInitialized();

  const audioData = audioGenerator?.generateBassNote(
    note,
    octave,
    preset,
    duration,
  );
  return saveToWav(audioData, 48000);
}

export async function generateSynthNote(
  note: string,
  octave: number = 4,
  type: "lead" | "pad" | "pluck" = "lead",
  preset: string = "classic",
  duration: number = 1,
): Promise<string> {
  await ensureInitialized();

  const audioData = audioGenerator?.generateSynthNote(
    note,
    octave,
    type,
    preset,
    duration,
  );
  return saveToWav(audioData, 48000);
}

export async function getSuggestions(text: string): Promise<string[]> {
  await ensureInitialized();
  return audioGenerator?.getSuggestions(text);
}

export const aiAudioGeneratorService = {
  generateFromText,
  generateFromReference,
  generateDrumHit,
  generateBassNote,
  generateSynthNote,
  getSuggestions,
};
