// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { createHardenedUpload } from "../middleware/uploadHandler.js";
import { randomBytes } from "crypto";
import {
  generateFromText as _generateFromText,
  generateFromReference,
} from "../services/aiAudioGeneratorService.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "../services/maxcoreConnector.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";
import { db } from "../db.js";
import { studioSamples } from "../../shared/schema.js";
import os from "os";
import path from "path";
import fsPromises from "fs/promises";
import { execFile } from "child_process";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface GenerationParams {
  instrument: string;
  genre: string;
  style: string;
  key: string;
  scale: string;
  tempo: number;
  bars: number;
  complexity: number;
  swing: number;
  humanize: number;
  intent?: unknown;
  direction?: unknown;
  context?: unknown;
  awareness?: unknown;
}

// Lightweight UI metadata only. Unlike the former pattern service, this does
// not initialize or generate a local pattern library.
const STUDIO_INSTRUMENTS = {
  melodic: [
    "piano",
    "synth_lead",
    "synth_pad",
    "guitar_acoustic",
    "guitar_electric",
    "bass_electric",
    "bass_synth",
    "strings_ensemble",
    "brass_trumpet",
    "woodwind_flute",
  ],
  drums: [
    "acoustic_kit",
    "electronic_kit",
    "808_kit",
    "trap_kit",
    "jazz_kit",
    "rock_kit",
    "lofi_kit",
    "house_kit",
  ],
  percussion: ["congas", "bongos", "shaker", "tambourine", "claves"],
};
const STUDIO_GENRES = {
  electronic: {
    genres: ["house", "techno", "ambient", "drum_and_bass"],
    tempoRange: [90, 180],
    characteristics: ["synthesized", "rhythmic"],
  },
  urban: {
    genres: ["hip_hop", "trap", "drill", "r_and_b"],
    tempoRange: [60, 160],
    characteristics: ["beat_driven", "bass_heavy"],
  },
  band: {
    genres: ["pop", "rock", "indie", "jazz"],
    tempoRange: [60, 180],
    characteristics: ["melodic", "live_instruments"],
  },
};
const STUDIO_STYLES = ["melodic", "rhythmic", "minimal", "complex"];
const STUDIO_SCALES = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "pentatonic_major",
  "pentatonic_minor",
  "blues",
  "chromatic",
];

type GeneratedMidiNote = {
  note: number;
  octave: number;
  duration: number;
  velocity: number;
};

function readVarLen(bytes: Uint8Array, cursor: { value: number }): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const byte = bytes[cursor.value++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return value;
}

/** Parse MaxCore's standard MIDI output into the route's legacy note DTO. */
export function parseMaxCoreMidiNotes(buffer: ArrayBuffer): GeneratedMidiNote[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "MThd") {
    throw new AIUnavailableError("studio MIDI generation (invalid MIDI header)");
  }
  const division = view.getUint16(12) || 480;
  const trackOffset = 14;
  if (String.fromCharCode(...bytes.slice(trackOffset, trackOffset + 4)) !== "MTrk") {
    throw new AIUnavailableError("studio MIDI generation (missing MIDI track)");
  }
  const cursor = { value: trackOffset + 8 };
  const end = Math.min(bytes.length, cursor.value + view.getUint32(trackOffset + 4));
  const active = new Map<number, Array<{ tick: number; velocity: number }>>();
  const notes: GeneratedMidiNote[] = [];
  let tick = 0;
  let runningStatus = 0;
  while (cursor.value < end) {
    tick += readVarLen(bytes, cursor);
    let status = bytes[cursor.value++];
    if (status < 0x80) {
      cursor.value--;
      status = runningStatus;
    } else {
      runningStatus = status;
    }
    if (status === 0xff) {
      cursor.value++;
      cursor.value += readVarLen(bytes, cursor);
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      cursor.value += readVarLen(bytes, cursor);
      continue;
    }
    const command = status & 0xf0;
    const midi = bytes[cursor.value++];
    const value = bytes[cursor.value++];
    if (command === 0x90 && value > 0) {
      const stack = active.get(midi) ?? [];
      stack.push({ tick, velocity: value });
      active.set(midi, stack);
    } else if (command === 0x80 || (command === 0x90 && value === 0)) {
      const start = active.get(midi)?.shift();
      if (start) {
        notes.push({
          note: midi % 12,
          octave: Math.floor(midi / 12) - 1,
          duration: Math.max(0.0625, (tick - start.tick) / division),
          velocity: start.velocity,
        });
      }
    }
  }
  if (!notes.length) {
    throw new AIUnavailableError("studio MIDI generation (MaxCore returned no notes)");
  }
  return notes;
}

async function maxCoreOwnedJson<T>(
  pathName: string,
  method: "GET" | "POST",
  userId: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${getMaxcoreOriginOrDefault()}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${getMaxcoreGenerationKey()}`,
      "X-MaxCore-User-Id": userId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(method === "POST" ? 60_000 : 30_000),
  }).catch((error) => {
    throw new AIUnavailableError(
      `studio generation: ${(error as Error).message}`,
    );
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AIUnavailableError(
      `studio generation returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
    );
  }
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new AIUnavailableError("studio generation returned non-JSON");
  }
  return (await response.json()) as T;
}

async function generateMaxCorePattern(
  params: GenerationParams,
  kind: "melody" | "drums" | "chords" | "arrangement",
  userId: string,
) {
  const duration = Math.max(2, (params.bars * 4 * 60) / params.tempo);
  const submitted = await maxCoreOwnedJson<{ job_id?: string }>(
    "/api/generate/audio",
    "POST",
    userId,
    {
      prompt: `${kind}, ${params.instrument || ""}, ${params.genre}, ${params.key} ${params.scale}`,
      instrument: params.instrument,
      genre: params.genre,
      bpm: params.tempo,
      key: `${params.key} ${params.scale}`,
      duration,
      format: "wav",
      intent: params.intent ?? kind,
      direction: params.direction,
      context: params.context,
      awareness: params.awareness,
    },
  );
  if (!submitted.job_id) {
    throw new AIUnavailableError(`studio ${kind} generation (missing job id)`);
  }
  let audio: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const status = await maxCoreOwnedJson<Record<string, unknown>>(
      `/api/audio-job/${submitted.job_id}`,
      "GET",
      userId,
    );
    if (status?.status === "error") {
      throw new AIUnavailableError(
        `studio ${kind} generation: ${String(status.error || "job failed")}`,
      );
    }
    if (status?.status === "done") {
      audio = status;
      break;
    }
  }
  if (!audio) throw new AIUnavailableError(`studio ${kind} generation timed out`);

  const response = await fetch(
    `${getMaxcoreOriginOrDefault()}/api/audio/${submitted.job_id}/midi`,
    {
      headers: {
        Authorization: `Bearer ${getMaxcoreGenerationKey()}`,
        "X-MaxCore-User-Id": userId,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new AIUnavailableError(
      `studio ${kind} MIDI generation returned HTTP ${response.status}`,
    );
  }
  return {
    notes: parseMaxCoreMidiNotes(await response.arrayBuffer()),
    audioUrl: audio.audio_url ?? audio.url,
    midiUrl: `/api/audio/${submitted.job_id}/midi`,
    jobId: submitted.job_id,
    sourceType: "MaxCoreAI",
  };
}

async function persistGeneratedSample(opts: {
  name: string;
  category: string;
  subcategory?: string;
  tags: string[];
  duration?: number;
  tempo?: number;
  key?: string;
  audioUrl: string;
  userId: string;
}) {
  await db.insert(studioSamples).values({
    id: `ai_${randomBytes(8).toString("hex")}`,
    name: opts.name,
    category: opts.category,
    subcategory: opts.subcategory,
    tags: opts.tags,
    duration: opts.duration,
    tempo: opts.tempo,
    key: opts.key,
    audioUrl: opts.audioUrl,
    isBuiltIn: false,
    userId: opts.userId,
  });
}

const router = Router();

const upload = createHardenedUpload({
  maxFileSize: 50 * 1024 * 1024,
  maxFiles: 1,
  allowedMimes: [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/flac",
    "audio/x-flac",
    "audio/aiff",
    "audio/x-aiff",
    "audio/ogg",
    "audio/opus",
    "audio/x-opus",
    "audio/aac",
    "audio/x-aac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/webm",
  ],
  allowedExtensions: [
    ".mp3",
    ".wav",
    ".flac",
    ".aiff",
    ".aif",
    ".ogg",
    ".opus",
    ".aac",
    ".m4a",
    ".webm",
  ],
  label: "studio audio",
});

const textGenerationSchema = z.object({
  text: z.string().max(500).optional().default(""), // fed to AI — cap to prevent prompt injection
  projectId: z.string().max(64).optional(),
  duration: z.number().positive().optional(),
  bars: z.number().int().positive().optional(),
  instrumentType: z.string().max(64).optional(),
  instrumentCategory: z.enum(["melodic", "drums", "percussion"]).optional(),
  genre: z.string().max(64).optional(),
  genreCategory: z.string().max(64).optional(),
  style: z.string().max(64).optional(),
  tempo: z.number().int().min(40).max(240).optional(),
  key: z.string().max(8).optional(),
  scale: z.string().max(32).optional(),
  complexity: z.number().min(0).max(1).optional(),
  swing: z.number().min(0).max(1).optional(),
  humanize: z.number().min(0).max(1).optional(),
  intent: z.unknown().optional(),
  direction: z.unknown().optional(),
  context: z.unknown().optional(),
  awareness: z.unknown().optional(),
});

const audioGenerationSchema = z.object({
  targetType: z.string().max(64).optional(),
  text: z.string().max(500).optional(), // fed to AI — cap to prevent prompt injection / cost abuse
  projectId: z.string().max(64).optional(),
  bars: z.number().int().positive().optional(),
  intent: z.unknown().optional(),
  direction: z.unknown().optional(),
  context: z.unknown().optional(),
  awareness: z.unknown().optional(),
});

// POST /text — async audio job submit
// MaxCore audio generation takes several minutes; holding an HTTP connection
// open that long causes proxy timeouts. This route submits the job and returns
// a job_id immediately. The client polls GET /api/audio-job/:jobId (existing
// MaxCore proxy) for completion and gets the audio URL from the completed job.
router.post("/text", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validatedData = textGenerationSchema?.parse(req.body);

    let userText = (validatedData?.text || "").trim();
    if (validatedData?.tempo) {
      userText = userText?.replace(/\b\d+\s*bpm\b/gi, "").trim();
    }

    const textLower = userText?.toLowerCase();
    const parts: string[] = [];

    if (validatedData?.instrumentType) {
      const instrumentId = validatedData?.instrumentType?.toLowerCase();
      const friendlyName = instrumentId?.replace(/_/g, " ");
      if (!textLower?.includes(friendlyName) && !textLower?.includes(instrumentId)) {
        parts?.push(friendlyName);
      }
    }
    if (validatedData?.genre && !textLower?.includes(validatedData?.genre?.toLowerCase())) {
      parts?.push(validatedData?.genre);
    }
    if (userText) parts?.push(userText);
    if (validatedData?.tempo) parts?.push(`at ${validatedData?.tempo}bpm`);
    if (validatedData?.key &&
      !textLower?.includes(` ${validatedData?.key?.toLowerCase()} `) &&
      !textLower?.includes(`in ${validatedData?.key?.toLowerCase()}`)) {
      parts?.push(`in ${validatedData?.key}`);
    }
    if (validatedData?.scale && !textLower?.includes(validatedData?.scale?.toLowerCase())) {
      parts?.push(validatedData?.scale);
    }

    const enhancedText = parts?.join(" ").trim() || "trap beat";
    logger.info(`[Studio Generation] Text-to-audio submit: "${enhancedText}"`);

    // Submit job to MaxCore — returns {job_id} almost immediately.
    const submitted = requireMaxCore(
      await MaxCoreAIClient.generate<{ job_id?: string; audioUrl?: string; audio_url?: string; status?: string }>(
        "/api/generate/audio",
        {
          text: enhancedText,
          duration: validatedData.duration ?? null,
          bars: validatedData.bars ?? null,
          tempo: validatedData.tempo ?? null,
          genre: validatedData.genre ?? null,
          key: validatedData.key ?? null,
          intent: validatedData.intent,
          direction: validatedData.direction,
          context: validatedData.context,
          awareness: validatedData.awareness,
        },
      ),
      "studio audio generation",
    );

    // If MaxCore returned audio synchronously (rare fast path), serve it directly.
    const syncAudioUrl = submitted.audioUrl ?? submitted.audio_url ?? null;
    if (syncAudioUrl && !submitted.job_id) {
      return res.json({ success: true, audioUrl: syncAudioUrl, status: "completed", sourceType: "MaxCoreAI" });
    }

    const jobId = submitted.job_id;
    if (!jobId) throw new AIUnavailableError("studio audio generation — no job_id returned");

    logger.info(`[Studio Generation] Audio job ${jobId} submitted — client should poll /api/audio-job/${jobId}`);

    // Return the job reference immediately — Replit's proxy would kill a long-held
    // connection before the job finishes. Client polls GET /api/audio-job/:jobId.
    return res.json({
      success: true,
      jobId,
      status: "processing",
      message: `Audio job submitted. Poll GET /api/audio-job/${jobId} for completion.`,
      pollUrl: `/api/audio-job/${jobId}`,
      sourceType: "MaxCoreAI",
    });
  } catch (error) {
    logger.warn({ err: error }, "[Studio Generation] Text-to-audio failed:");
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Invalid request parameters", errors: error.issues });
    }
    if (error instanceof AIUnavailableError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    res.status(500).json({ success: false, message: (error as Error).message || "Failed to submit audio job" });
  }
});

router.post(
  "/audio",
  requireAuth,
  aiRateLimiter,
  upload?.single("audio"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No audio file provided",
        });
      }

      const bodyData = {
        targetType: req.body.targetType,
        text: req.body.text,
        projectId: req.body.projectId,
        bars: req.body.bars ? parseInt(req.body.bars, 10) : undefined,
        intent: req.body.intent,
        direction: req.body.direction,
        context: req.body.context,
        awareness: req.body.awareness,
      };

      const validatedData = audioGenerationSchema?.parse(bodyData);

      logger.info(
        `[Studio Generation] Audio-to-audio request, file size: ${req.file.size} bytes`,
      );

      const result = await generateFromReference({
        audioBuffer: req.file.buffer,
        targetType: validatedData.targetType || "drums",
        text: validatedData.text,
        bars: validatedData.bars,
        projectId: validatedData.projectId,
         intent: validatedData.intent,
         direction: validatedData.direction,
         context: validatedData.context,
         awareness: validatedData.awareness,
      });

      const userId2 = req.user?.id || "unknown";
      await persistGeneratedSample({
        name: `AI Style Transfer: ${validatedData?.targetType || "drums"}`,
        category: validatedData.targetType === "drums" ? "drums" : "synths",
        subcategory: validatedData.targetType || undefined,
        tags: ["style-transfer", validatedData?.targetType || "drums"].filter(
          Boolean,
        ) as string[],
        duration: result.duration,
        audioUrl: result.audioFilePath,
        userId: userId2,
      });

      res.json({
        success: true,
        audioFilePath: result.audioFilePath,
        parameters: result.parameters,
        duration: result.duration,
        sourceType: result.sourceType,
        generatedNotes: result.generatedNotes || [],
        generatedChords: result.generatedChords || [],
      });
    } catch (error) {
      logger.warn(
        { err: error },
        "[Studio Generation] Audio generation failed:",
      );

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid request parameters",
          errors: error.issues,
        });
      }

      if (error instanceof AIUnavailableError) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        message: (error as Error).message || "Failed to generate audio from reference",
      });
    }
  },
);

router.get("/presets", requireAuth, async (_req, res) => {
  try {
    const instruments = STUDIO_INSTRUMENTS;
    const genres = STUDIO_GENRES;
    const styles = STUDIO_STYLES;
    const scales = STUDIO_SCALES;

    const presets = {
      genres: Object.entries(genres).flatMap(([category, data]) =>
        data?.genres?.map((g) => ({
          id: g,
          name: g.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category,
          tempoRange: data.tempoRange,
          characteristics: data.characteristics,
        })),
      ),
      instrumentTypes: [
        ...(instruments?.melodic?.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "melodic",
          description: `${i?.replace(/_/g, " ")} instrument`,
        })) ?? []),
        ...(instruments?.drums?.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "drums",
          description: `${i?.replace(/_/g, " ")} drum kit`,
        })) ?? []),
        ...(instruments?.percussion?.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "percussion",
          description: `${i?.replace(/_/g, " ")} percussion`,
        })) ?? []),
      ],
      keys: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
      scales: scales.map((s) => ({
        id: s,
        name: s.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
      })),
      styles: styles.map((s) => ({
        id: s,
        name: s.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
      })),
      moods: [
        "dark",
        "bright",
        "aggressive",
        "chill",
        "uplifting",
        "melancholic",
        "energetic",
        "dreamy",
        "intense",
        "peaceful",
      ],
    };

    res.json(presets);
  } catch (error) {
    logger.warn({ err: error }, "[Studio Generation] Failed to get presets:");
    res.status(500).json({
      success: false,
      message: "Failed to get presets",
    });
  }
});

const patternGenerationSchema = z.object({
  instrument: z.string().min(1),
  genre: z.string().min(1),
  style: z.string().optional().default("melodic"),
  key: z.string().min(1).max(2).default("C"),
  scale: z.string().min(1).default("minor"),
  tempo: z.number().min(20).max(300).default(120),
  bars: z.number().min(1).max(64).default(4),
  complexity: z.number().min(0).max(1).default(0.5),
  swing: z.number().min(0).max(1).default(0),
  humanize: z.number().min(0).max(1).default(0.2),
  intent: z.unknown().optional(),
  direction: z.unknown().optional(),
  context: z.unknown().optional(),
  awareness: z.unknown().optional(),
});

router.get("/pattern/instruments", requireAuth, async (_req, res) => {
  try {
    res.json(STUDIO_INSTRUMENTS);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching instruments:");
    res.status(500).json({ error: "Failed to fetch instruments" });
  }
});

router.get("/pattern/genres", requireAuth, async (_req, res) => {
  try {
    res.json(STUDIO_GENRES);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching genres:");
    res.status(500).json({ error: "Failed to fetch genres" });
  }
});

router.get("/pattern/styles", requireAuth, async (_req, res) => {
  try {
    res.json(STUDIO_STYLES);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching styles:");
    res.status(500).json({ error: "Failed to fetch styles" });
  }
});

router.get("/pattern/scales", requireAuth, async (_req, res) => {
  try {
    res.json(STUDIO_SCALES);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching scales:");
    res.status(500).json({ error: "Failed to fetch scales" });
  }
});

router.get("/pattern/stats", requireAuth, async (_req, res) => {
  try {
    const instruments = STUDIO_INSTRUMENTS;
    const genres = STUDIO_GENRES;

    res.json({
      source: "MaxCoreAI",
      generatedPatternLibrary: false,
      totalPatterns: null,
      instruments: {
        melodic: instruments.melodic.length,
        drums: instruments.drums.length,
        percussion: instruments.percussion.length,
        total:
          instruments?.melodic?.length +
          instruments?.drums?.length +
          instruments?.percussion?.length,
      },
      genres: Object.entries(genres).reduce(
        (acc, [key, data]) => {
          acc[key] = data?.genres?.length;
          return acc;
        },
        {} as Record<string, number>,
      ),
      totalGenres: Object.values(genres).reduce(
        (sum, data) => sum + data?.genres?.length,
        0,
      ),
      styles: STUDIO_STYLES.length,
      scales: STUDIO_SCALES.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching stats:");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.post("/pattern/melody", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const generatedPattern = await generateMaxCorePattern(
      params,
      "melody",
      String(req.user?.id ?? ""),
    );
    return res.json({
      success: true,
      pattern: generatedPattern,
      melody: generatedPattern,
      params,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger.warn(`[Generation] MaxCore unavailable (melody): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger.warn({ err: error }, "Error generating melody:");
    res.status(500).json({ error: "Failed to generate melody" });
  }
});

router.post("/pattern/drums", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const generatedPattern = await generateMaxCorePattern(
      params,
      "drums",
      String(req.user?.id ?? ""),
    );
    return res.json({ success: true, pattern: generatedPattern, params });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger.warn(`[Generation] MaxCore unavailable (drums): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger.warn({ err: error }, "Error generating drums:");
    res.status(500).json({ error: "Failed to generate drums" });
  }
});

router.post("/pattern/chords", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req.body);
    if (!validation?.success) {
      return res.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const generatedProgression = await generateMaxCorePattern(
      params,
      "chords",
      String(req.user?.id ?? ""),
    );
    return res.json({
      success: true,
      progression: generatedProgression,
      params,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger.warn(`[Generation] MaxCore unavailable (chords): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger.warn({ err: error }, "Error generating chords:");
    res.status(500).json({ error: "Failed to generate chords" });
  }
});

router.post(
  "/pattern/arrangement",
  requireAuth,
  aiRateLimiter,
  async (req, res) => {
    try {
      const validation = patternGenerationSchema?.safeParse(req.body);
      if (!validation?.success) {
        return res.status(400).json({ error: validation.error.message });
      }

      const params: GenerationParams = validation?.data;
      const generatedArrangement = await generateMaxCorePattern(
        params,
        "arrangement",
        String(req.user?.id ?? ""),
      );
      return res.json({
        success: true,
        arrangement: generatedArrangement,
        params,
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        logger.warn(
          `[Generation] MaxCore unavailable (arrangement): ${error.message}`,
        );
        return res
          ?.status(error.statusCode)
          .json({ error: error.message, code: error.code });
      }
      logger.warn({ err: error }, "Error generating full arrangement:");
      res.status(500).json({ error: "Failed to generate arrangement" });
    }
  },
);

router.post(
  "/audio-to-melody",
  requireAuth,
  aiRateLimiter,
  upload?.single("audio"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const rawExt = (file?.originalname?.split(".").pop() || "wav")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const ext = rawExt || "wav";
    const tmpPath = path?.join(os?.tmpdir(), `pitch_${Date.now()}.${ext}`);

    try {
      await fsPromises?.writeFile(tmpPath, file?.buffer);

      let stdout = "";
      let stderr = "";
      try {
        const out = await execFileAsync(
          "python3",
          ["server/services/audioAnalyzer.py", tmpPath, "pitch_track"],
          { timeout: 45_000 },
        );
        stdout = out?.stdout;
        stderr = out?.stderr;
      } catch (execErr: any) {
        const msg =
          execErr?.stderr?.trim() ||
          execErr?.message ||
          "Pitch tracking process failed";
        logger.warn("[audio-to-melody] execFile error:", msg);
        return res
          .status(500)
          .json({
            error:
              "Pitch tracking failed. Make sure the audio contains a clear melody.",
          });
      }

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(stdout?.trim());
      } catch {
        logger.warn({ detail: stderr }, "[audio-to-melody] Invalid JSON from pitch tracker. stderr:",
        );
        return res
          .status(500)
          .json({ error: "Pitch tracker returned unexpected output." });
      }

      if (result?.error) {
        return res.status(422).json({ error: result.error });
      }

      const NOTES = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ];
      const melodyNotes = (result?.notes as Record<string, unknown>[]).map(
        (n: Record<string, unknown>) => ({
          pitch: n.midi,
          noteName: NOTES[n?.midi % 12] + n?.octave,
          duration: n.duration_beats,
          syllable: "",
          stress: (n.position_beats as any) % 1 < 0.1,
        }),
      );

      res.json({
        success: true,
        notes: melodyNotes,
        detected_key: result.detected_key,
        bpm: result.bpm,
        note_count: result.note_count,
      });
    } catch (err) {
      logger.warn({ err: err }, "[audio-to-melody] Error:");
      res.status(500).json({ error: "Pitch tracking failed" });
    } finally {
      fsPromises?.unlink(tmpPath).catch(() => {
        /* intentional: temp-file cleanup */
      });
    }
  },
);

export default router;
