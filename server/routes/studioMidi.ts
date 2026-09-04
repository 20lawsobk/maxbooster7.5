import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { midiGeneratorService } from "../services/midiGeneratorService";
import { midiTransformService } from "../services/midiTransformService";
import { microtonalService } from "../services/microtonalService";
import { db } from "../db.js";
import { midiClips, midiNotes, projects, studioProjects, studioTracks } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

const midiClipSchema = z.object({
  trackId: z.string().min(1),
  name: z.string().min(1).max(255),
  startBeat: z.number().min(0).default(0),
  durationBeats: z.number().positive().default(4),
  color: z.string().max(32).default("#8b5cf6"),
  looped: z.boolean().default(false),
  loopLength: z.number().positive().default(4),
});

const midiClipUpdateSchema = midiClipSchema.partial().omit({ trackId: true });

const persistedMidiNoteSchema = z.object({
  pitch: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  startBeat: z.number().min(0),
  durationBeats: z.number().positive(),
  channel: z.number().int().min(0).max(15).default(0),
});

const quantizeSchema = z.object({
  value: z.number().positive(),
  strength: z.number().min(0).max(1).default(1),
  selectedOnly: z.boolean().optional(),
});

async function verifyProjectOwnership(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  if (project) return true;
  const studioProject = await db.query.studioProjects.findFirst({
    where: and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
  });
  return !!studioProject;
}

async function getOwnedClip(projectId: string, clipId: string, userId: string) {
  if (!(await verifyProjectOwnership(projectId, userId))) return null;
  return db.query.midiClips.findFirst({
    where: and(eq(midiClips.id, clipId), eq(midiClips.projectId, projectId)),
  });
}

function serializeClip(clip: typeof midiClips.$inferSelect, notes: (typeof midiNotes.$inferSelect)[]) {
  return { ...clip, notes };
}

router.get("/projects/:projectId/midi/clips", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const trackId = z.string().min(1).safeParse(req.query.trackId);
    if (!trackId.success) return res.status(400).json({ error: "trackId is required" });
    if (!(await verifyProjectOwnership(projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }
    const clips = await db.query.midiClips.findMany({
      where: and(eq(midiClips.projectId, projectId), eq(midiClips.trackId, trackId.data)),
    });
    const result = await Promise.all(clips.map(async (clip) =>
      serializeClip(clip, await db.query.midiNotes.findMany({ where: eq(midiNotes.clipId, clip.id) })),
    ));
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching MIDI clips:");
    res.status(500).json({ error: "Failed to fetch MIDI clips" });
  }
});

router.post("/projects/:projectId/midi/clips", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!(await verifyProjectOwnership(projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }
    const data = midiClipSchema.parse(req.body);
    const track = await db.query.studioTracks.findFirst({
      where: and(eq(studioTracks.id, data.trackId), eq(studioTracks.projectId, projectId)),
    });
    if (!track) return res.status(400).json({ error: "Track does not belong to this project" });
    const [clip] = await db.insert(midiClips).values({ ...data, projectId }).returning();
    res.status(201).json(serializeClip(clip, []));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid MIDI clip", details: error.issues });
    logger.warn({ err: error }, "Error creating MIDI clip:");
    res.status(500).json({ error: "Failed to create MIDI clip" });
  }
});

router.put("/projects/:projectId/midi/clips/:clipId", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    const data = midiClipUpdateSchema.parse(req.body);
    const [updated] = await db.update(midiClips).set({ ...data, updatedAt: new Date() }).where(eq(midiClips.id, clip.id)).returning();
    const notes = await db.query.midiNotes.findMany({ where: eq(midiNotes.clipId, clip.id) });
    res.json(serializeClip(updated, notes));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid MIDI clip", details: error.issues });
    logger.warn({ err: error }, "Error updating MIDI clip:");
    res.status(500).json({ error: "Failed to update MIDI clip" });
  }
});

router.delete("/projects/:projectId/midi/clips/:clipId", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    await db.delete(midiNotes).where(eq(midiNotes.clipId, clip.id));
    await db.delete(midiClips).where(eq(midiClips.id, clip.id));
    res.status(204).send();
  } catch (error) {
    logger.warn({ err: error }, "Error deleting MIDI clip:");
    res.status(500).json({ error: "Failed to delete MIDI clip" });
  }
});

router.post("/projects/:projectId/midi/clips/:clipId/notes", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    const data = persistedMidiNoteSchema.parse(req.body);
    const [note] = await db.insert(midiNotes).values({ ...data, clipId: clip.id }).returning();
    res.status(201).json(note);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid MIDI note", details: error.issues });
    logger.warn({ err: error }, "Error adding MIDI note:");
    res.status(500).json({ error: "Failed to add MIDI note" });
  }
});

router.put("/projects/:projectId/midi/clips/:clipId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    const data = persistedMidiNoteSchema.partial().parse(req.body);
    const [note] = await db.update(midiNotes).set({ ...data, updatedAt: new Date() }).where(and(eq(midiNotes.id, req.params.noteId), eq(midiNotes.clipId, clip.id))).returning();
    if (!note) return res.status(404).json({ error: "MIDI note not found" });
    res.json(note);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid MIDI note", details: error.issues });
    logger.warn({ err: error }, "Error updating MIDI note:");
    res.status(500).json({ error: "Failed to update MIDI note" });
  }
});

router.delete("/projects/:projectId/midi/clips/:clipId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    const deleted = await db.delete(midiNotes).where(and(eq(midiNotes.id, req.params.noteId), eq(midiNotes.clipId, clip.id))).returning();
    if (!deleted.length) return res.status(404).json({ error: "MIDI note not found" });
    res.status(204).send();
  } catch (error) {
    logger.warn({ err: error }, "Error deleting MIDI note:");
    res.status(500).json({ error: "Failed to delete MIDI note" });
  }
});

router.post("/projects/:projectId/midi/clips/:clipId/quantize", requireAuth, async (req, res) => {
  try {
    const clip = await getOwnedClip(req.params.projectId, req.params.clipId, req.user!.id);
    if (!clip) return res.status(404).json({ error: "MIDI clip not found" });
    const { value, strength } = quantizeSchema.parse(req.body);
    const notes = await db.query.midiNotes.findMany({ where: eq(midiNotes.clipId, clip.id) });
    const updated = await Promise.all(notes.map(async (note) => {
      const target = Math.round(note.startBeat / value) * value;
      const startBeat = note.startBeat + (target - note.startBeat) * strength;
      const [result] = await db.update(midiNotes).set({ startBeat, updatedAt: new Date() }).where(eq(midiNotes.id, note.id)).returning();
      return result;
    }));
    res.json({ success: true, notes: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid quantize options", details: error.issues });
    logger.warn({ err: error }, "Error quantizing MIDI notes:");
    res.status(500).json({ error: "Failed to quantize MIDI notes" });
  }
});

const midiNoteSchema = z.object({
  note: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  startTime: z.number().min(0),
  duration: z.number().positive(),
  channel: z.number().int().min(0).max(15).optional(),
});

const constraintsSchema = z.object({
  key: z.string().default("C"),
  scale: z.string().default("major"),
  tempo: z.number().int().min(20).max(300).default(120),
  timeSignature: z.tuple([z.number().int(), z.number().int()]).optional(),
  octaveRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  velocityRange: z.tuple([z.number().int(), z.number().int()]).optional(),
});

const humanizationSchema = z.object({
  velocityVariation: z.number().min(0).max(50).default(10),
  timingOffsetMs: z.number().min(0).max(100).default(10),
  durationVariation: z.number().min(0).max(0.5).default(0.1),
  enabled: z.boolean().default(true),
});

const generateMelodySchema = z.object({
  constraints: constraintsSchema,
  bars: z.number().int().min(1).max(64).default(4),
  density: z.enum(["sparse", "normal", "dense"]).default("normal"),
  humanization: humanizationSchema.optional(),
});

const generateRhythmSchema = z.object({
  constraints: constraintsSchema,
  bars: z.number().int().min(1).max(64).default(4),
  pattern: z
    .enum([
      "straight",
      "swing",
      "triplet",
      "dotted",
      "syncopated",
      "hiphop",
      "trap",
      "house",
      "dnb",
    ])
    .default("straight"),
  noteValue: z.number().int().min(0).max(127).default(60),
});

const generateChordsSchema = z.object({
  constraints: constraintsSchema,
  style: z
    .enum(["pop", "jazz", "classical", "edm", "blues", "rnb", "custom"])
    .default("pop"),
  length: z.number().int().min(1).max(32).default(4),
  complexity: z.enum(["simple", "moderate", "complex"]).default("moderate"),
  allowBorrowedChords: z.boolean().default(false),
  voicing: z
    .enum(["close", "open", "drop2", "drop3", "spread"])
    .default("close"),
});

const arpeggiateSchema = z.object({
  notes: z.array(midiNoteSchema),
  pattern: z
    .enum([
      "up",
      "down",
      "updown",
      "downup",
      "random",
      "order",
      "converge",
      "diverge",
    ])
    .default("up"),
  rate: z
    .enum(["1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T", "1/16T"])
    .default("1/8"),
  octaves: z.number().int().min(1).max(4).default(1),
  gate: z.number().min(0.1).max(2).default(0.8),
  swing: z.number().min(0).max(100).default(0),
  velocity: z.number().int().min(1).max(127).optional(),
  hold: z.boolean().optional(),
  tempo: z.number().int().min(20).max(300).default(120),
});

const transformSchema = z.object({
  notes: z.array(midiNoteSchema),
  transform: z.enum([
    "transpose",
    "invert",
    "retrograde",
    "retrogradeInversion",
    "augment",
    "diminish",
    "quantize",
    "legato",
    "staccato",
    "velocityCurve",
    "randomize",
  ]),
  options: z.record(z.string(), z.any()).optional(),
});

const ornamentSchema = z.object({
  notes: z.array(midiNoteSchema),
  type: z.enum([
    "trill",
    "mordent",
    "turn",
    "graceNote",
    "tremolo",
    "glissando",
  ]),
  speed: z.number().optional(),
  interval: z.number().int().optional(),
  count: z.number().int().optional(),
});

const strumSchema = z.object({
  notes: z.array(midiNoteSchema),
  direction: z.enum(["up", "down", "alternating"]).default("down"),
  speed: z.number().min(1).max(200).default(30),
  velocityCurve: z
    .enum(["linear", "exponential", "logarithmic"])
    .default("linear"),
  humanize: z.boolean().default(true),
});

const fitToScaleSchema = z.object({
  notes: z.array(midiNoteSchema),
  rootNote: z.number().int().min(0).max(127),
  scale: z.string(),
});

const scaleSyncSchema = z.object({
  projectId: z.string(),
  scale: z.string(),
  rootNote: z.number().int().min(0).max(127),
  tuningSystem: z.string().optional(),
  affectedClips: z.array(z.string()).optional(),
});

router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { type, ...params } = req.body;

    let result;
    switch (type) {
      case "melody": {
        const data = generateMelodySchema?.parse(params);
        result = midiGeneratorService?.generateMelody(
          data?.constraints,
          data?.bars,
          data?.density,
          data?.humanization,
        );
        break;
      }
      case "rhythm": {
        const data = generateRhythmSchema?.parse(params);
        result = midiGeneratorService?.generateRhythm(
          data?.constraints,
          data?.bars,
          data?.pattern,
          data?.noteValue,
        );
        break;
      }
      case "chords": {
        const data = generateChordsSchema?.parse(params);
        result = midiGeneratorService?.generateChords(data?.constraints, {
          style: data.style,
          length: data.length,
          complexity: data.complexity,
          allowBorrowedChords: data.allowBorrowedChords,
          voicing: data.voicing,
        });
        break;
      }
      default:
        return res.status(400).json({ error: "Invalid generation type" });
    }

    res.json({
      success: true,
      notes: result,
      type,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error generating MIDI:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to generate MIDI" });
  }
});

router.post("/transform", requireAuth, async (req, res) => {
  try {
    const data = transformSchema?.parse(req.body);
    const options = data?.options || {};

    let result;
    switch (data?.transform) {
      case "transpose":
        result = midiTransformService?.transpose(
          data?.notes,
          options?.semitones || 0,
        );
        break;
      case "invert":
        result = midiTransformService?.invert(data?.notes, options?.pivotNote);
        break;
      case "retrograde":
        result = midiTransformService?.retrograde(data?.notes);
        break;
      case "retrogradeInversion":
        result = midiTransformService?.retrogradeInversion(
          data?.notes,
          options?.pivotNote,
        );
        break;
      case "augment":
        result = midiTransformService?.augment(data?.notes, options?.factor || 2);
        break;
      case "diminish":
        result = midiTransformService?.diminish(data?.notes, options?.factor || 2);
        break;
      case "quantize":
        result = midiTransformService?.quantize(
          data?.notes,
          options?.gridSize || 0.25,
          options?.strength || 1,
        );
        break;
      case "legato":
        result = midiTransformService?.legato(data?.notes, options?.overlap || 0);
        break;
      case "staccato":
        result = midiTransformService?.staccato(
          data?.notes,
          options?.factor || 0.5,
        );
        break;
      case "velocityCurve":
        result = midiTransformService?.velocityCurve(
          data?.notes,
          options?.curve || "crescendo",
          options?.intensity || 1,
        );
        break;
      case "randomize":
        result = midiTransformService?.randomize(data?.notes, options);
        break;
      default:
        return res.status(400).json({ error: "Invalid transform type" });
    }

    res.json({
      success: true,
      notes: result,
      transform: data.transform,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error transforming MIDI:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to transform MIDI" });
  }
});

router.post("/arpeggiate", requireAuth, async (req, res) => {
  try {
    const data = arpeggiateSchema?.parse(req.body);

    const result = midiGeneratorService?.arpeggiate(
      data?.notes,
      {
        pattern: data.pattern,
        rate: data.rate,
        octaves: data.octaves,
        gate: data.gate,
        swing: data.swing,
        velocity: data.velocity,
        hold: data.hold,
      },
      data?.tempo,
    );

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error creating arpeggio:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to create arpeggio" });
  }
});

router.post("/chords", requireAuth, async (req, res) => {
  try {
    const data = generateChordsSchema?.parse(req.body);

    const result = midiGeneratorService?.generateChordProgression(
      data?.constraints,
      {
        style: data.style,
        length: data.length,
        complexity: data.complexity,
        allowBorrowedChords: data.allowBorrowedChords,
        voicing: data.voicing,
      },
    );

    res.json({
      success: true,
      chords: result.chords,
      notes: result.notes,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error generating chord progression:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to generate chord progression" });
  }
});

router.post("/ornament", requireAuth, async (req, res) => {
  try {
    const data = ornamentSchema?.parse(req.body);

    const result = midiTransformService?.addOrnament(data?.notes, {
      type: data.type,
      speed: data.speed,
      interval: data.interval,
      count: data.count,
    });

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error adding ornament:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to add ornament" });
  }
});

router.post("/strum", requireAuth, async (req, res) => {
  try {
    const data = strumSchema?.parse(req.body);

    const result = midiTransformService?.applyStrumPattern(data?.notes, {
      direction: data.direction,
      speed: data.speed,
      velocityCurve: data.velocityCurve,
      humanize: data.humanize,
    });

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error applying strum pattern:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to apply strum pattern" });
  }
});

router.post("/fit-to-scale", requireAuth, async (req, res) => {
  try {
    const data = fitToScaleSchema?.parse(req.body);

    const result = microtonalService?.fitNotesToScale(
      data?.notes,
      data?.rootNote,
      data?.scale,
    );

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fitting to scale:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to fit notes to scale" });
  }
});

router.get("/scales", requireAuth, async (req, res) => {
  try {
    const { category } = req.query;

    let scales;
    if (category && typeof category === "string") {
      scales = microtonalService?.getScalesByCategory(category);
    } else {
      scales = microtonalService?.getAllScales();
    }

    const tunings = microtonalService?.getAllTuningSystems();
    const generators = {
      scales: midiGeneratorService.getAvailableScales(),
      rhythmPatterns: midiGeneratorService.getAvailableRhythmPatterns(),
      chordStyles: midiGeneratorService.getAvailableChordStyles(),
    };

    res.json({
      success: true,
      scales,
      tunings,
      generators,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching scales:");
    res.status(500).json({ error: "Failed to fetch scales" });
  }
});

router.get("/scales/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { rootNote, octaves } = req.query;

    const scale = microtonalService?.getScale(id);
    if (!scale) {
      return res.status(404).json({ error: "Scale not found" });
    }

    const root = rootNote ? parseInt(rootNote as string) : 60;
    const octs = octaves ? parseInt(octaves as string) : 1;
    const notes = microtonalService?.getScaleNotes(root, id, octs);
    const frequencies = microtonalService?.getScaleFrequencies(
      root,
      id,
      "equal12",
      octs,
    );

    res.json({
      success: true,
      scale,
      notes,
      frequencies,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching scale:");
    res.status(500).json({ error: "Failed to fetch scale" });
  }
});

router.get("/tunings/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    const tuning = microtonalService?.getTuningSystem(id);
    if (!tuning) {
      return res.status(404).json({ error: "Tuning system not found" });
    }

    res.json({
      success: true,
      tuning,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching tuning:");
    res.status(500).json({ error: "Failed to fetch tuning" });
  }
});

router.post("/scale-sync", requireAuth, async (req, res) => {
  try {
    const data = scaleSyncSchema?.parse(req.body);
    if (!(await verifyProjectOwnership(data.projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }

    microtonalService?.setScaleSync({
      projectId: data.projectId,
      scale: data.scale,
      rootNote: data.rootNote,
      tuningSystem: data.tuningSystem || "equal12",
      affectedClips: data.affectedClips || [],
    });

    res.json({
      success: true,
      message: "Scale sync configured",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error setting scale sync:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.issues });
    }
    res.status(500).json({ error: "Failed to set scale sync" });
  }
});

router.get("/scale-sync/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>;
    if (!(await verifyProjectOwnership(projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const config = microtonalService?.getScaleSync(projectId);

    res.json({
      success: true,
      config: config || null,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching scale sync:");
    res.status(500).json({ error: "Failed to fetch scale sync" });
  }
});

router.delete("/scale-sync/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>;
    if (!(await verifyProjectOwnership(projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }

    microtonalService?.removeScaleSync(projectId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error removing scale sync:");
    res.status(500).json({ error: "Failed to remove scale sync" });
  }
});

router.post("/note-info", requireAuth, async (req, res) => {
  try {
    const { note, tuningSystem } = req.body;

    if (typeof note !== "number" || note < 0 || note > 127) {
      return res.status(400).json({ error: "Invalid MIDI note" });
    }

    const info = microtonalService?.getNoteInfo(note, tuningSystem || "equal12");

    res.json({
      success: true,
      ...info,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error getting note info:");
    res.status(500).json({ error: "Failed to get note info" });
  }
});

router.post("/frequency", requireAuth, async (req, res) => {
  try {
    const { note, tuningSystem, referenceNote, referenceFrequency } = req.body;

    if (typeof note !== "number" || note < 0 || note > 127) {
      return res.status(400).json({ error: "Invalid MIDI note" });
    }

    const frequency = microtonalService?.noteToFrequency(
      note,
      tuningSystem || "equal12",
      referenceNote || 69,
      referenceFrequency || 440,
    );

    res.json({
      success: true,
      frequency,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error calculating frequency:");
    res.status(500).json({ error: "Failed to calculate frequency" });
  }
});

export default router;
