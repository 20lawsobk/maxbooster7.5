import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { createHardenedUpload } from "../middleware/uploadHandler.js";
import { randomBytes } from "crypto";
import {
  generateFromText,
  generateFromReference,
} from "../services/aiAudioGeneratorService.js";
import {
  melodyPatternService,
  GenerationParams,
} from "../services/melodyPatternService";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
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
  try {
    await db?.insert(studioSamples).values({
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
  } catch (err) {
    logger?.warn(
      { err: err },
      "[Studio Generation] Could not persist sample to library:",
    );
  }
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
});

const audioGenerationSchema = z.object({
  targetType: z.string().max(64).optional(),
  text: z.string().max(500).optional(), // fed to AI — cap to prevent prompt injection / cost abuse
  projectId: z.string().max(64).optional(),
  bars: z.number().int().positive().optional(),
});

// POST /text — async audio job submit
// MaxCore audio generation takes several minutes; holding an HTTP connection
// open that long causes proxy timeouts. This route submits the job and returns
// a job_id immediately. The client polls GET /api/audio-job/:jobId (existing
// MaxCore proxy) for completion and gets the audio URL from the completed job.
router?.post("/text", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validatedData = textGenerationSchema?.parse(req?.body);

    let userText = (validatedData?.text || "").trim();
    if (validatedData?.tempo) {
      userText = userText?.replace(/\b\d+\s*bpm\b/gi, "").trim();
    }

    const textLower = userText?.toLowerCase();
    const parts: string[] = [];

    if (validatedData?.instrumentType) {
      const instrumentId = validatedData?.instrumentType.toLowerCase();
      const friendlyName = instrumentId?.replace(/_/g, " ");
      if (!textLower?.includes(friendlyName) && !textLower?.includes(instrumentId)) {
        parts?.push(friendlyName);
      }
    }
    if (validatedData?.genre && !textLower?.includes(validatedData?.genre.toLowerCase())) {
      parts?.push(validatedData?.genre);
    }
    if (userText) parts?.push(userText);
    if (validatedData?.tempo) parts?.push(`at ${validatedData?.tempo}bpm`);
    if (validatedData?.key &&
      !textLower?.includes(` ${validatedData?.key.toLowerCase()} `) &&
      !textLower?.includes(`in ${validatedData?.key.toLowerCase()}`)) {
      parts?.push(`in ${validatedData?.key}`);
    }
    if (validatedData?.scale && !textLower?.includes(validatedData?.scale.toLowerCase())) {
      parts?.push(validatedData?.scale);
    }

    const enhancedText = parts?.join(" ").trim() || "trap beat";
    logger?.info(`[Studio Generation] Text-to-audio submit: "${enhancedText}"`);

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
        },
      ),
      "studio audio generation",
    );

    // If MaxCore returned audio synchronously (rare fast path), serve it directly.
    const syncAudioUrl = submitted.audioUrl ?? submitted.audio_url ?? null;
    if (syncAudioUrl && !submitted.job_id) {
      return res?.json({ success: true, audioUrl: syncAudioUrl, status: "completed", sourceType: "MaxCoreAI" });
    }

    const jobId = submitted.job_id;
    if (!jobId) throw new AIUnavailableError("studio audio generation — no job_id returned");

    logger?.info(`[Studio Generation] Audio job ${jobId} submitted — client should poll /api/audio-job/${jobId}`);

    // Return the job reference immediately — Replit's proxy would kill a long-held
    // connection before the job finishes. Client polls GET /api/audio-job/:jobId.
    return res?.json({
      success: true,
      jobId,
      status: "processing",
      message: `Audio job submitted. Poll GET /api/audio-job/${jobId} for completion.`,
      pollUrl: `/api/audio-job/${jobId}`,
      sourceType: "MaxCoreAI",
    });
  } catch (error) {
    logger?.warn({ err: error }, "[Studio Generation] Text-to-audio failed:");
    if (error instanceof z.ZodError) {
      return res?.status(400).json({ success: false, message: "Invalid request parameters", errors: error.issues });
    }
    if (error instanceof AIUnavailableError) {
      return res?.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    res?.status(500).json({ success: false, message: (error as Error).message || "Failed to submit audio job" });
  }
});

router?.post(
  "/audio",
  requireAuth,
  aiRateLimiter,
  upload?.single("audio"),
  async (req, res) => {
    try {
      if (!req?.file) {
        return res?.status(400).json({
          success: false,
          message: "No audio file provided",
        });
      }

      const bodyData = {
        targetType: req.body.targetType,
        text: req.body.text,
        projectId: req.body.projectId,
        bars: req.body.bars ? parseInt(req?.body.bars, 10) : undefined,
      };

      const validatedData = audioGenerationSchema?.parse(bodyData);

      logger?.info(
        `[Studio Generation] Audio-to-audio request, file size: ${req?.file.size} bytes`,
      );

      const result = await generateFromReference({
        audioBuffer: req.file.buffer,
        targetType: validatedData.targetType || "drums",
        text: validatedData.text,
        bars: validatedData.bars,
        projectId: validatedData.projectId,
      });

      const userId2 = req?.user?.id || "unknown";
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

      res?.json({
        success: true,
        audioFilePath: result.audioFilePath,
        parameters: result.parameters,
        duration: result.duration,
        sourceType: result.sourceType,
        generatedNotes: result.generatedNotes || [],
        generatedChords: result.generatedChords || [],
      });
    } catch (error) {
      logger?.warn(
        { err: error },
        "[Studio Generation] Audio generation failed:",
      );

      if (error instanceof z.ZodError) {
        return res?.status(400).json({
          success: false,
          message: "Invalid request parameters",
          errors: error.issues,
        });
      }

      if (error instanceof AIUnavailableError) {
        return res?.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }

      res?.status(500).json({
        success: false,
        message: error.message || "Failed to generate audio from reference",
      });
    }
  },
);

router?.get("/presets", requireAuth, async (_req, res) => {
  try {
    const instruments = melodyPatternService?.getAvailableInstruments();
    const genres = melodyPatternService?.getAvailableGenres();
    const styles = melodyPatternService?.getAvailableStyles();
    const scales = melodyPatternService?.getAvailableScales();

    const presets = {
      genres: Object.entries(genres).flatMap(([category, data]) =>
        data?.genres.map((g) => ({
          id: g,
          name: g.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category,
          tempoRange: data.tempoRange,
          characteristics: data.characteristics,
        })),
      ),
      instrumentTypes: [
        ...instruments?.melodic.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "melodic",
          description: `${i?.replace(/_/g, " ")} instrument`,
        })),
        ...instruments?.drums.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "drums",
          description: `${i?.replace(/_/g, " ")} drum kit`,
        })),
        ...instruments?.percussion.map((i) => ({
          id: i,
          name: i.replace(/_/g, " ").replace(/\b\w/g, (l) => l?.toUpperCase()),
          category: "percussion",
          description: `${i?.replace(/_/g, " ")} percussion`,
        })),
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

    res?.json(presets);
  } catch (error) {
    logger?.warn({ err: error }, "[Studio Generation] Failed to get presets:");
    res?.status(500).json({
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
});

router?.get("/pattern/instruments", requireAuth, async (_req, res) => {
  try {
    const instruments = melodyPatternService?.getAvailableInstruments();
    res?.json(instruments);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching instruments:");
    res?.status(500).json({ error: "Failed to fetch instruments" });
  }
});

router?.get("/pattern/genres", requireAuth, async (_req, res) => {
  try {
    const genres = melodyPatternService?.getAvailableGenres();
    res?.json(genres);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching genres:");
    res?.status(500).json({ error: "Failed to fetch genres" });
  }
});

router?.get("/pattern/styles", requireAuth, async (_req, res) => {
  try {
    const styles = melodyPatternService?.getAvailableStyles();
    res?.json(styles);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching styles:");
    res?.status(500).json({ error: "Failed to fetch styles" });
  }
});

router?.get("/pattern/scales", requireAuth, async (_req, res) => {
  try {
    const scales = melodyPatternService?.getAvailableScales();
    res?.json(scales);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching scales:");
    res?.status(500).json({ error: "Failed to fetch scales" });
  }
});

router?.get("/pattern/stats", requireAuth, async (_req, res) => {
  try {
    const stats = melodyPatternService?.getPatternCount();
    const instruments = melodyPatternService?.getAvailableInstruments();
    const genres = melodyPatternService?.getAvailableGenres();

    res?.json({
      ...stats,
      totalPatterns: stats.melody + stats?.drums,
      instruments: {
        melodic: instruments.melodic.length,
        drums: instruments.drums.length,
        percussion: instruments.percussion.length,
        total:
          instruments?.melodic.length +
          instruments?.drums.length +
          instruments?.percussion.length,
      },
      genres: Object.entries(genres).reduce(
        (acc, [key, data]) => {
          acc[key] = data?.genres.length;
          return acc;
        },
        {} as Record<string, number>,
      ),
      totalGenres: Object.values(genres).reduce(
        (sum, data) => sum + data?.genres.length,
        0,
      ),
      styles: melodyPatternService.getAvailableStyles().length,
      scales: melodyPatternService.getAvailableScales().length,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching stats:");
    res?.status(500).json({ error: "Failed to fetch stats" });
  }
});

router?.post("/pattern/melody", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req?.body);
    if (!validation?.success) {
      return res?.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const prompt = `${params.instrument} melody ${params.genre} style ${params.key} ${params.scale} ${params.tempo}bpm ${params.bars} bars`;

    // ── MaxCore primary ─────────────────────────────────────────────────────
    // Do NOT send mode:"music" — it causes MaxCore to return non-JSON / empty.
    // Instead phrase the prompt as a content generation request so MaxCore's
    // /api/generate/content endpoint always returns hook/caption/body text.
    const mcResult = await MaxCoreAIClient.generate<{
      notes?: number[];
      durations?: number[];
      velocities?: number[];
      audioUrl?: string;
      audio_url?: string;
      hook?: string;
      caption?: string;
      body?: string;
      pattern?: Record<string, unknown>;
    }>("/api/generate/content", {
      topic: prompt,
      platform: "studio",
      tone: "creative",
      genre: params.genre,
      key: params.key,
      scale: params.scale,
      instrument: params.instrument,
      bars: params.bars,
      type: "melody",
    });

    // mcResult is null when MaxCore is unreachable or circuit-breaker is open.
    if (!mcResult) throw new AIUnavailableError("studio generation");

    const mcAny = mcResult as Record<string, unknown>;
    const textDesc: string = [mcAny.hook, mcAny.caption, mcAny.body]
      .filter(Boolean).join(" ").slice(0, 300) || "";

    if (!mcResult.notes?.length && !mcResult.audioUrl && !mcResult.audio_url && !textDesc) {
      throw new AIUnavailableError("studio generation");
    }

    const pattern = {
      ...(mcResult.notes ? { notes: mcResult.notes } : {}),
      ...(mcResult.durations ? { durations: mcResult.durations } : {}),
      ...(mcResult.velocities ? { velocities: mcResult.velocities } : {}),
      ...(mcResult.audioUrl ?? mcResult.audio_url
        ? { audioUrl: mcResult.audioUrl ?? mcResult.audio_url }
        : {}),
      ...(textDesc ? { description: textDesc } : {}),
      sourceType: "MaxCoreAI",
    };
    logger?.info(`[Generation] MaxCore melody: ${params.instrument} ${params.genre}`);
    return res?.json({ success: true, pattern, params });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger?.warn(`[Generation] MaxCore unavailable (melody): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger?.warn({ err: error }, "Error generating melody:");
    res?.status(500).json({ error: "Failed to generate melody" });
  }
});

router?.post("/pattern/drums", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req?.body);
    if (!validation?.success) {
      return res?.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const prompt = `${params.instrument} drum pattern ${params.genre} style ${params.tempo}bpm ${params.bars} bars`;

    // ── MaxCore primary ─────────────────────────────────────────────────────
    const mcResult = await MaxCoreAIClient.generate<{
      hits?: Record<string, number[]>;
      pattern?: Record<string, unknown>;
      audioUrl?: string;
      audio_url?: string;
      hook?: string;
      caption?: string;
      body?: string;
    }>("/api/generate/content", {
      topic: prompt,
      platform: "studio",
      tone: "creative",
      genre: params.genre,
      instrument: params.instrument,
      tempo: params.tempo,
      bars: params.bars,
      type: "drums",
    });

    if (!mcResult) throw new AIUnavailableError("studio generation");
    const mcAny = mcResult as Record<string, unknown>;
    const textDesc: string = [mcAny.hook, mcAny.caption, mcAny.body]
      .filter(Boolean).join(" ").slice(0, 300) || "";

    if (
      !(mcResult.hits && Object.keys(mcResult.hits).length) &&
      !mcResult.audioUrl && !mcResult.audio_url && !textDesc
    ) {
      throw new AIUnavailableError("studio generation");
    }

    const pattern = {
      ...(mcResult.hits ? { hits: mcResult.hits } : {}),
      ...(mcResult.audioUrl ?? mcResult.audio_url
        ? { audioUrl: mcResult.audioUrl ?? mcResult.audio_url }
        : {}),
      ...(textDesc ? { description: textDesc } : {}),
      sourceType: "MaxCoreAI",
    };
    logger?.info(`[Generation] MaxCore drums: ${params.instrument} ${params.genre}`);
    return res?.json({ success: true, pattern, params });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger?.warn(`[Generation] MaxCore unavailable (drums): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger?.warn({ err: error }, "Error generating drums:");
    res?.status(500).json({ error: "Failed to generate drums" });
  }
});

router?.post("/pattern/chords", requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const validation = patternGenerationSchema?.safeParse(req?.body);
    if (!validation?.success) {
      return res?.status(400).json({ error: validation.error.message });
    }

    const params: GenerationParams = validation?.data;
    const prompt = `chord progression ${params.key} ${params.scale} ${params.genre} style ${params.tempo}bpm ${params.bars} bars`;

    // ── MaxCore primary ─────────────────────────────────────────────────────
    const mcResult = await MaxCoreAIClient.generate<{
      chords?: string[];
      progression?: string[];
      audioUrl?: string;
      audio_url?: string;
      hook?: string;
      caption?: string;
      body?: string;
    }>("/api/generate/content", {
      topic: prompt,
      platform: "studio",
      tone: "creative",
      genre: params.genre,
      key: params.key,
      scale: params.scale,
      tempo: params.tempo,
      bars: params.bars,
      type: "chords",
    });

    if (!mcResult) throw new AIUnavailableError("studio generation");
    const mcAny = mcResult as Record<string, unknown>;
    const textDesc: string = [mcAny.hook, mcAny.caption, mcAny.body]
      .filter(Boolean).join(" ").slice(0, 300) || "";
    const chordList = mcResult.chords ?? mcResult.progression;

    if (!chordList?.length && !mcResult.audioUrl && !mcResult.audio_url && !textDesc) {
      throw new AIUnavailableError("studio generation");
    }

    const progression = {
      ...(chordList ? { chords: chordList } : {}),
      ...(mcResult.audioUrl ?? mcResult.audio_url
        ? { audioUrl: mcResult.audioUrl ?? mcResult.audio_url }
        : {}),
      ...(textDesc ? { description: textDesc } : {}),
      sourceType: "MaxCoreAI",
    };
    logger?.info(`[Generation] MaxCore chords: ${params.key} ${params.scale} ${params.genre}`);
    return res?.json({ success: true, progression, params });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      logger?.warn(`[Generation] MaxCore unavailable (chords): ${error.message}`);
      return res
        ?.status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    logger?.warn({ err: error }, "Error generating chords:");
    res?.status(500).json({ error: "Failed to generate chords" });
  }
});

router?.post(
  "/pattern/arrangement",
  requireAuth,
  aiRateLimiter,
  async (req, res) => {
    try {
      const validation = patternGenerationSchema?.safeParse(req?.body);
      if (!validation?.success) {
        return res?.status(400).json({ error: validation.error.message });
      }

      const params: GenerationParams = validation?.data;
      const prompt = `full arrangement ${params.genre} style ${params.key} ${params.scale} ${params.tempo}bpm ${params.bars} bars`;

      // ── MaxCore primary ───────────────────────────────────────────────────
      const mcResult = await MaxCoreAIClient.generate<{
        melody?: Record<string, unknown>;
        bass?: Record<string, unknown>;
        pad?: Record<string, unknown>;
        drums?: Record<string, unknown>;
        chords?: Record<string, unknown>;
        audioUrl?: string;
        audio_url?: string;
        hook?: string;
        caption?: string;
        body?: string;
      }>("/api/generate/content", {
        topic: prompt,
        platform: "studio",
        tone: "creative",
        genre: params.genre,
        key: params.key,
        scale: params.scale,
        tempo: params.tempo,
        bars: params.bars,
        type: "arrangement",
      });

      if (!mcResult) throw new AIUnavailableError("studio generation");
      const mcAny = mcResult as Record<string, unknown>;
      const textDesc: string = [mcAny.hook, mcAny.caption, mcAny.body]
        .filter(Boolean).join(" ").slice(0, 400) || "";

      if (
        !mcResult.melody && !mcResult.bass && !mcResult.pad &&
        !mcResult.drums && !mcResult.chords &&
        !mcResult.audioUrl && !mcResult.audio_url && !textDesc
      ) {
        throw new AIUnavailableError("studio generation");
      }

      const arrangement = {
        melody: mcResult.melody ? { ...mcResult.melody, sourceType: "MaxCoreAI" } : { sourceType: "MaxCoreAI" },
        bass:   mcResult.bass   ? { ...mcResult.bass,   sourceType: "MaxCoreAI" } : { sourceType: "MaxCoreAI" },
        pad:    mcResult.pad    ? { ...mcResult.pad,    sourceType: "MaxCoreAI" } : { sourceType: "MaxCoreAI" },
        drums:  mcResult.drums  ? { ...mcResult.drums,  sourceType: "MaxCoreAI" } : { sourceType: "MaxCoreAI" },
        chords: mcResult.chords ? { ...mcResult.chords, sourceType: "MaxCoreAI" } : { sourceType: "MaxCoreAI" },
        ...(mcResult.audioUrl ?? mcResult.audio_url
          ? { audioUrl: mcResult.audioUrl ?? mcResult.audio_url }
          : {}),
        ...(textDesc ? { description: textDesc } : {}),
        sourceType: "MaxCoreAI",
      };
      logger?.info(`[Generation] MaxCore arrangement: ${params.genre} style`);
      return res?.json({ success: true, arrangement, params });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        logger?.warn(
          `[Generation] MaxCore unavailable (arrangement): ${error.message}`,
        );
        return res
          ?.status(error.statusCode)
          .json({ error: error.message, code: error.code });
      }
      logger?.warn({ err: error }, "Error generating full arrangement:");
      res?.status(500).json({ error: "Failed to generate arrangement" });
    }
  },
);

router?.post(
  "/audio-to-melody",
  requireAuth,
  aiRateLimiter,
  upload?.single("audio"),
  async (req, res) => {
    const file = req?.file;
    if (!file) {
      return res?.status(400).json({ error: "No audio file provided" });
    }

    const rawExt = (file?.originalname.split(".").pop() || "wav")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const ext = rawExt || "wav";
    const tmpPath = path?.join(os?.tmpdir(), `pitch_${Date?.now()}.${ext}`);

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
      } catch (execErr: Record<string, unknown>) {
        const msg =
          execErr?.stderr?.trim() ||
          execErr?.message ||
          "Pitch tracking process failed";
        logger?.warn("[audio-to-melody] execFile error:", msg);
        return res
          .status(500)
          .json({
            error:
              "Pitch tracking failed. Make sure the audio contains a clear melody.",
          });
      }

      let result: Record<string, unknown>;
      try {
        result = JSON?.parse(stdout?.trim());
      } catch {
        logger?.warn(
          "[audio-to-melody] Invalid JSON from pitch tracker. stderr:",
          stderr,
        );
        return res
          .status(500)
          .json({ error: "Pitch tracker returned unexpected output." });
      }

      if (result?.error) {
        return res?.status(422).json({ error: result.error });
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
          stress: n.position_beats % 1 < 0.1,
        }),
      );

      res?.json({
        success: true,
        notes: melodyNotes,
        detected_key: result.detected_key,
        bpm: result.bpm,
        note_count: result.note_count,
      });
    } catch (err) {
      logger?.warn({ err: err }, "[audio-to-melody] Error:");
      res?.status(500).json({ error: "Pitch tracking failed" });
    } finally {
      fsPromises?.unlink(tmpPath).catch(() => {
        /* intentional: temp-file cleanup */
      });
    }
  },
);

export default router;
