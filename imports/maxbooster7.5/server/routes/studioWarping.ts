// @ts-nocheck
import { Router } from "express";
import path from "path";
import os from "os";
import fs from "fs";
import fsPromises from "fs/promises";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db";
import {
  audioClips,
  warpMarkers,
  studioTracks,
  projects,
  insertWarpMarkerSchema,
  updateWarpMarkerSchema,
} from "@shared/schema";
import { eq, and, or, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../logger.js";
import { resolveAudioUrlToLocalFile } from "../services/audioSourceResolver.js";
import {
  timeStretchService,
  dbMarkersToWarpMarkerData,
  warpMarkerDataToDbFields,
} from "../services/timeStretchService.js";
import { storageService } from "../services/storageService.js";

const router = Router();

// ============================================================================
// SCHEMAS
//
// Every route that touches rendered audio (preview/commit/quantize) requires
// an explicit `bpm` from the client rather than trusting `projects.bpm` — the
// frontend already tracks the authoritative tempo for whatever beat-grid the
// clip's warp markers are currently expressed in (see dbMarkersToWarpMarkerData
// doc comment), and that can legitimately diverge from the stale project-level
// value.
// ============================================================================

const warpProcessOptionsSchema = z.object({
  bpm: z.number().min(20).max(300),
  pitchShift: z.number().min(-24).max(24).optional().default(0),
  preserveFormants: z.boolean().optional().default(true),
  algorithm: z
    .enum(["rubberband", "phase_vocoder", "wsola"])
    .optional()
    .default("phase_vocoder"),
  quality: z.enum(["fast", "normal", "high"]).optional().default("normal"),
});

const warpPreviewSchema = warpProcessOptionsSchema.extend({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
});

const warpCommitSchema = warpProcessOptionsSchema.extend({
  quality: z.enum(["fast", "normal", "high"]).optional().default("high"),
  replaceOriginal: z.boolean().optional().default(false),
});

const transientDetectionSchema = z.object({
  sensitivity: z.coerce.number().min(0).max(1).optional().default(0.5),
  minTransientGap: z.coerce.number().min(0.01).max(1).optional().default(0.05),
});

const quantizeSchema = z.object({
  bpm: z.number().min(20).max(300),
  targetBpm: z.number().min(20).max(300),
  strength: z.number().min(0).max(1).optional().default(1.0),
  sensitivity: z.number().min(0).max(1).optional().default(0.5),
});

const ensureClipSchema = z.object({
  clientClipId: z.string().min(1),
  trackId: z.string().min(1),
  name: z.string().min(1),
  audioUrl: z.string().min(1),
  bpm: z.number().min(20).max(300),
  startTime: z.number().min(0).optional().default(0),
  duration: z.number().min(0).optional().default(0),
  fadeIn: z.number().min(0).optional().default(0),
  fadeOut: z.number().min(0).optional().default(0),
  gain: z.number().optional().default(1),
});

// ============================================================================
// OWNERSHIP HELPERS
// ============================================================================

async function verifyClipOwnership(
  clipId: string,
  userId: string,
): Promise<{
  clip: Record<string, unknown>;
  track: Record<string, unknown>;
  project: Record<string, unknown>;
} | null> {
  const clip = await db.query.audioClips.findFirst({
    where: eq(audioClips.id, clipId),
  });

  if (!clip) {
    return null;
  }

  const track = await db.query.studioTracks.findFirst({
    where: eq(studioTracks.id, clip?.trackId),
  });

  if (!track) {
    return null;
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, track?.projectId), eq(projects.userId, userId)),
  });

  if (!project) {
    return null;
  }

  return { clip, track, project };
}

async function verifyTrackOwnership(
  trackId: string,
  userId: string,
): Promise<{
  track: Record<string, unknown>;
  project: Record<string, unknown>;
} | null> {
  const track = await db.query.studioTracks.findFirst({
    where: eq(studioTracks.id, trackId),
  });

  if (!track) {
    return null;
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, track?.projectId), eq(projects.userId, userId)),
  });

  if (!project) {
    return null;
  }

  return { track, project };
}

/** Classifies a caught processing error as an environment problem (503) vs a generic failure (500). */
function warpErrorStatus(error: unknown): number {
  if (error instanceof Error && /FFmpeg is not available/.test(error.message)) {
    return 503;
  }
  return 500;
}

function warpErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function tempWavPath(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}_${randomUUID()}.wav`);
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fsPromises.unlink(filePath);
    }
  } catch {}
}

// ============================================================================
// CLIP IDENTITY MATERIALIZATION
//
// Clips created via record/import get a real `audioClips` row immediately.
// Clips created via split/duplicate/AI-gen are client-side only until this
// endpoint materializes them. It is idempotent on (trackId, clientClipId) so
// a retried call after a dropped response never creates a duplicate row.
// ============================================================================

router.post("/clips/ensure", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = ensureClipSchema.parse(req.body);

    const ownership = await verifyTrackOwnership(data.trackId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Track not found or unauthorized" });
    }

    // A clientClipId matches an existing row two ways: (a) it's already a
    // real audioClips.id — the common case (record/import/AI-gen clips are
    // real from creation, so WarpDialog's clipId prop IS the real id), or
    // (b) it was a client-only id already materialized by a PRIOR ensure
    // call, recoverable only via the metadata stamp. Checking only (b) (as
    // this used to) means every already-real clip fails the lookup and gets
    // a duplicate orphan row inserted on every dialog open.
    const existing = await db.query.audioClips.findFirst({
      where: and(
        eq(audioClips.trackId, data.trackId),
        or(
          eq(audioClips.id, data.clientClipId),
          sql`${audioClips.metadata}->>'clientClipId' = ${data.clientClipId}`,
        ),
      ),
    });

    if (existing) {
      return res.status(200).json({ clip: existing, created: false });
    }

    const [newClip] = await db
      .insert(audioClips)
      .values({
        projectId: ownership.track.projectId,
        trackId: data.trackId,
        name: data.name,
        audioUrl: data.audioUrl,
        startTime: data.startTime,
        duration: data.duration,
        fadeIn: data.fadeIn,
        fadeOut: data.fadeOut,
        gain: data.gain,
        warpSettings: { markerBpm: data.bpm },
        metadata: { clientClipId: data.clientClipId },
      })
      .returning();

    res.status(201).json({ clip: newClip, created: true });
  } catch (error) {
    logger.warn({ err: error }, "Error ensuring clip identity:");
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid clip data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to ensure clip identity" });
  }
});

// ============================================================================
// MARKER CRUD — pure passthrough to warp_markers' native beat/sample units.
// No time-unit conversion happens here; only the audio-rendering routes below
// need to translate to/from seconds for ffmpeg.
// ============================================================================

router.get("/clips/:clipId/warp/markers", requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.beatPosition)],
    });

    res.json({ markers });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching warp markers:");
    res.status(500).json({ error: "Failed to fetch warp markers" });
  }
});

router.post("/clips/:clipId/warp/markers", requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const markerData = insertWarpMarkerSchema?.parse({
      ...req.body,
      clipId,
    });

    const [newMarker] = await db
      .insert(warpMarkers)
      .values(markerData)
      .returning();

    res.status(201).json(newMarker);
  } catch (error) {
    logger.warn({ err: error }, "Error creating warp marker:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid marker data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to create warp marker" });
  }
});

const bulkMarkerSchema = z.object({
  markers: z
    .array(
      z.object({
        beatPosition: z.number().min(0),
        samplePosition: z.number().min(0),
      }),
    )
    .min(1)
    .max(500),
});

// Bulk append (NOT replace) — used by "Add All Detected" after a read-only
// transient scan. Quantize below is the separate atomic replace-all path.
router.post(
  "/clips/:clipId/warp/markers/bulk",
  requireAuth,
  async (req, res) => {
    try {
      const { clipId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const ownership = await verifyClipOwnership(clipId, userId);
      if (!ownership) {
        return res.status(404).json({ error: "Clip not found or unauthorized" });
      }

      const { markers } = bulkMarkerSchema.parse(req.body);

      const inserted = await db
        .insert(warpMarkers)
        .values(markers.map((m) => ({ clipId, ...m })))
        .returning();

      res.status(201).json({ markers: inserted });
    } catch (error) {
      logger.warn({ err: error }, "Error bulk-creating warp markers:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid marker data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create warp markers" });
    }
  },
);

router.put(
  "/clips/:clipId/warp/markers/:markerId",
  requireAuth,
  async (req, res) => {
    try {
      const { clipId, markerId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const ownership = await verifyClipOwnership(clipId, userId);
      if (!ownership) {
        return res
          .status(404)
          .json({ error: "Clip not found or unauthorized" });
      }

      const marker = await db.query.warpMarkers.findFirst({
        where: and(
          eq(warpMarkers.id, markerId),
          eq(warpMarkers.clipId, clipId),
        ),
      });

      if (!marker) {
        return res.status(404).json({ error: "Warp marker not found" });
      }

      const updates = updateWarpMarkerSchema?.parse(req.body);

      const [updatedMarker] = await db
        .update(warpMarkers)
        .set({
          ...updates,
        })
        .where(eq(warpMarkers.id, markerId))
        .returning();

      res.json(updatedMarker);
    } catch (error) {
      logger.warn({ err: error }, "Error updating warp marker:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid marker data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update warp marker" });
    }
  },
);

router.delete(
  "/clips/:clipId/warp/markers/:markerId",
  requireAuth,
  async (req, res) => {
    try {
      const { clipId, markerId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const ownership = await verifyClipOwnership(clipId, userId);
      if (!ownership) {
        return res
          .status(404)
          .json({ error: "Clip not found or unauthorized" });
      }

      const marker = await db.query.warpMarkers.findFirst({
        where: and(
          eq(warpMarkers.id, markerId),
          eq(warpMarkers.clipId, clipId),
        ),
      });

      if (!marker) {
        return res.status(404).json({ error: "Warp marker not found" });
      }

      await db.delete(warpMarkers).where(eq(warpMarkers.id, markerId));

      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting warp marker:");
      res.status(500).json({ error: "Failed to delete warp marker" });
    }
  },
);

router.delete("/clips/:clipId/warp/markers", requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    await db.delete(warpMarkers).where(eq(warpMarkers.clipId, clipId));

    res.json({
      message: "All warp markers deleted",
      deleted: true,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error deleting all warp markers:");
    res.status(500).json({ error: "Failed to delete warp markers" });
  }
});

// ============================================================================
// PREVIEW — synchronous render of a bounded window. Result is throwaway
// scratch audio (short TTL), never touches the clip's persisted row.
// ============================================================================

router.post("/clips/:clipId/warp/preview", requireAuth, async (req, res) => {
  const tempOutput = tempWavPath("warp_preview");
  let source: { localPath: string; cleanup: () => Promise<void> } | null = null;

  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const { clip } = ownership;
    if (!clip.audioUrl) {
      return res.status(400).json({ error: "Clip has no audio to warp" });
    }

    const options = warpPreviewSchema.parse(req.body);

    const markerRows = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.beatPosition)],
    });

    source = await resolveAudioUrlToLocalFile(clip.audioUrl as string, req.user!.id);
    const metadata = await timeStretchService.getAudioMetadata(source.localPath);
    const markerData = dbMarkersToWarpMarkerData(
      markerRows,
      options.bpm,
      metadata.sampleRate,
    );

    await timeStretchService.generateWarpPreview(
      source.localPath,
      tempOutput,
      markerData,
      options.startTime,
      options.endTime,
      {
        pitchShift: options.pitchShift,
        preserveFormants: options.preserveFormants,
        algorithm: options.algorithm,
        quality: options.quality,
      },
    );

    const outputBuffer = await fsPromises.readFile(tempOutput);
    const outputMetadata = await timeStretchService.getAudioMetadata(tempOutput);
    const storageKey = await storageService.uploadGeneratedFile(
      outputBuffer,
      userId,
      "warp-preview",
      `${clipId}_${Date.now()}.wav`,
      "audio/wav",
    );
    // Previews are throwaway scratch audio — clean up automatically.
    await storageService.deleteWithTTL(storageKey, 15 * 60 * 1000);

    res.json({
      previewUrl: await storageService.getDownloadUrl(storageKey),
      duration: outputMetadata.duration,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error creating warp preview:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid preview options", details: error.issues });
    }
    res
      .status(warpErrorStatus(error))
      .json({ error: warpErrorMessage(error, "Failed to create warp preview") });
  } finally {
    if (source) await source.cleanup();
    await cleanupTempFile(tempOutput);
  }
});

// ============================================================================
// COMMIT — synchronous full render. replaceOriginal=true updates the clip in
// place (keeping its markers); replaceOriginal=false inserts a new sibling
// clip and leaves the original untouched.
// ============================================================================

router.post("/clips/:clipId/warp/commit", requireAuth, async (req, res) => {
  const tempOutput = tempWavPath("warp_commit");
  let source: { localPath: string; cleanup: () => Promise<void> } | null = null;

  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const { clip } = ownership;
    if (!clip.audioUrl) {
      return res.status(400).json({ error: "Clip has no audio to warp" });
    }

    const options = warpCommitSchema.parse(req.body);

    const markerRows = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.beatPosition)],
    });

    if (markerRows.length === 0) {
      return res
        .status(400)
        .json({ error: "No warp markers found for this clip" });
    }

    source = await resolveAudioUrlToLocalFile(clip.audioUrl as string, req.user!.id);
    const metadata = await timeStretchService.getAudioMetadata(source.localPath);
    const markerData = dbMarkersToWarpMarkerData(
      markerRows,
      options.bpm,
      metadata.sampleRate,
    );

    await timeStretchService.processWarpMarkers(
      source.localPath,
      tempOutput,
      markerData,
      {
        pitchShift: options.pitchShift,
        preserveFormants: options.preserveFormants,
        algorithm: options.algorithm,
        quality: options.quality,
      },
    );

    const outputBuffer = await fsPromises.readFile(tempOutput);
    const outputMetadata = await timeStretchService.getAudioMetadata(tempOutput);
    const storageKey = await storageService.uploadGeneratedFile(
      outputBuffer,
      req.user!.id,
      "warp",
      `${clipId}_${Date.now()}.wav`,
      "audio/wav",
    );
    const newAudioUrl = await storageService.getDownloadUrl(storageKey);

    const prevSettings = (clip.warpSettings ?? {}) as Record<string, unknown>;
    const warpSettings = {
      ...prevSettings,
      pitchShift: options.pitchShift,
      preserveFormants: options.preserveFormants,
      algorithm: options.algorithm,
      quality: options.quality,
      // Commit doesn't change the marker grid, so this just reaffirms the
      // bpm frame the client says the markers are already expressed in.
      markerBpm: options.bpm,
      originalAudioUrl: prevSettings.originalAudioUrl ?? clip.audioUrl,
    };

    if (options.replaceOriginal) {
      const [updatedClip] = await db
        .update(audioClips)
        .set({
          audioUrl: newAudioUrl,
          duration: outputMetadata.duration,
          warpMode: "warped",
          warpSettings,
        })
        .where(eq(audioClips.id, clipId))
        .returning();

      return res.json({ clip: updatedClip, replaced: true });
    }

    const [newClip] = await db
      .insert(audioClips)
      .values({
        projectId: ownership.project.id,
        trackId: clip.trackId,
        name: `${clip.name} (Warped)`,
        audioUrl: newAudioUrl,
        startTime: clip.startTime,
        duration: outputMetadata.duration,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        gain: clip.gain,
        warpMode: "warped",
        warpSettings: { ...warpSettings, originalAudioUrl: clip.audioUrl },
      })
      .returning();

    res.status(201).json({ clip: newClip, replaced: false });
  } catch (error) {
    logger.warn({ err: error }, "Error committing warp:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid commit options", details: error.issues });
    }
    res
      .status(warpErrorStatus(error))
      .json({ error: warpErrorMessage(error, "Failed to commit warp") });
  } finally {
    if (source) await source.cleanup();
    await cleanupTempFile(tempOutput);
  }
});

// ============================================================================
// TRANSIENT DETECTION — read-only analysis, no bpm/beat-grid involved.
// ============================================================================

router.get("/clips/:clipId/warp/transients", requireAuth, async (req, res) => {
  let source: { localPath: string; cleanup: () => Promise<void> } | null = null;

  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const { clip } = ownership;
    if (!clip.audioUrl) {
      return res.status(400).json({ error: "Clip has no audio to analyze" });
    }

    const options = transientDetectionSchema.parse(req.query);

    source = await resolveAudioUrlToLocalFile(clip.audioUrl as string, req.user!.id);
    const result = await timeStretchService.detectTransients(source.localPath, {
      sensitivity: options.sensitivity,
      minTransientGap: options.minTransientGap,
      detectBeats: true,
    });

    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error detecting transients:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid detection options", details: error.issues });
    }
    res
      .status(warpErrorStatus(error))
      .json({ error: warpErrorMessage(error, "Failed to detect transients") });
  } finally {
    if (source) await source.cleanup();
  }
});

// ============================================================================
// QUANTIZE — detect transients, map them onto a target-tempo beat grid, and
// replace the clip's marker set with the result. The persisted markers are
// stored in the TARGET tempo's beat frame, so the response's `targetBpm` is
// the `bpm` the client must pass to any subsequent preview/commit call for
// this clip until it is re-quantized.
// ============================================================================

router.post("/clips/:clipId/warp/quantize", requireAuth, async (req, res) => {
  let source: { localPath: string; cleanup: () => Promise<void> } | null = null;

  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const { clip } = ownership;
    if (!clip.audioUrl) {
      return res.status(400).json({ error: "Clip has no audio to quantize" });
    }

    const options = quantizeSchema.parse(req.body);

    source = await resolveAudioUrlToLocalFile(clip.audioUrl as string, req.user!.id);
    const metadata = await timeStretchService.getAudioMetadata(source.localPath);

    const detection = await timeStretchService.detectTransients(source.localPath, {
      sensitivity: options.sensitivity,
      detectBeats: true,
    });

    const tempoMapping = timeStretchService.calculateTempoMapping(
      options.bpm,
      options.targetBpm,
      metadata.duration,
    );

    const quantizedMarkers = timeStretchService.quantizeToGrid(
      detection.transients,
      tempoMapping.beatGrid,
      options.strength,
    );

    const dbFields = quantizedMarkers.map((m) =>
      warpMarkerDataToDbFields(m, options.targetBpm, metadata.sampleRate),
    );

    // Nothing detected to quantize onto — leave existing markers untouched
    // rather than silently wiping them for a zero-marker "result".
    if (dbFields.length === 0) {
      return res.json({
        markers: [],
        sourceBpm: options.bpm,
        targetBpm: options.targetBpm,
        detectedBpm: detection.detectedBpm,
        transientCount: 0,
        applied: false,
      });
    }

    const newMarkers = await db.transaction(async (tx) => {
      await tx.delete(warpMarkers).where(eq(warpMarkers.clipId, clipId));
      const inserted = await tx
        .insert(warpMarkers)
        .values(dbFields.map((f) => ({ clipId, ...f })))
        .returning();

      // Markers are now expressed in targetBpm's beat frame — persist that so
      // a future dialog open (or a preview/commit before the next quantize)
      // knows which bpm to convert beatPosition back to seconds with.
      const prevSettings = (clip.warpSettings ?? {}) as Record<string, unknown>;
      await tx
        .update(audioClips)
        .set({ warpSettings: { ...prevSettings, markerBpm: options.targetBpm } })
        .where(eq(audioClips.id, clipId));

      return inserted;
    });

    res.json({
      markers: newMarkers,
      sourceBpm: options.bpm,
      targetBpm: options.targetBpm,
      detectedBpm: detection.detectedBpm,
      transientCount: detection.transients.length,
      applied: true,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error quantizing to grid:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid quantize options", details: error.issues });
    }
    res
      .status(warpErrorStatus(error))
      .json({ error: warpErrorMessage(error, "Failed to quantize to grid") });
  } finally {
    if (source) await source.cleanup();
  }
});

// ============================================================================
// TEMPO / STATE SNAPSHOT — grounded entirely in real columns.
// ============================================================================

router.get("/clips/:clipId/warp/tempo", requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: "Clip not found or unauthorized" });
    }

    const { clip } = ownership;

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.beatPosition)],
    });

    const warpSettings = (clip.warpSettings ?? null) as Record<string, unknown> | null;

    res.json({
      clipId,
      currentDuration: clip.duration,
      warpMode: clip.warpMode ?? null,
      warpSettings,
      // Convenience: the bpm frame the markers below are expressed in.
      // Absent only for a never-touched clip (no markers, no warp state yet).
      markerBpm: warpSettings?.markerBpm ?? null,
      markerCount: markers.length,
      markers: markers.map((m: Record<string, unknown>) => ({
        id: m.id,
        beatPosition: m.beatPosition,
        samplePosition: m.samplePosition,
      })),
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching tempo info:");
    res.status(500).json({ error: "Failed to fetch tempo info" });
  }
});

export default router;
