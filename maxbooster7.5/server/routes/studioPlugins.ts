import { Router } from "express";
import { randomBytes } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { logger } from "../logger.js";
import {
  pluginHostService,
  PluginCategory,
} from "../services/pluginHostService";
import { db } from "../db";
import { projects } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const instantiatePluginSchema = z.object({
  trackId: z.string().optional(),
  chainPosition: z.number().int().min(0).default(0),
  parameters: z
    .record(z.string(), z.union([z.number(), z.boolean(), z.string()]))
    .optional(),
});

const updateParametersSchema = z.object({
  parameters: z.record(
    z.string(),
    z.union([z.number(), z.boolean(), z.string()]),
  ),
  bypassed: z.boolean().optional(),
});

const renderInstrumentSchema = z.object({
  notes: z.array(
    z.object({
      note: z.number().int().min(0).max(127),
      velocity: z.number().int().min(0).max(127),
      duration: z.number().positive(),
      startTime: z.number().min(0),
    }),
  ),
  durationSec: z.number().positive(),
  sampleRate: z.number().int().min(8000).max(192000).optional(),
});

const renderEffectSchema = z.object({
  samples: z.array(z.array(z.number())),
  sampleRate: z.number().int().min(8000).max(192000),
});

const savePresetSchema = z.object({
  pluginId: z.string(),
  name: z.string().min(1).max(100),
  parameters: z.record(
    z.string(),
    z.union([z.number(), z.boolean(), z.string()]),
  ),
  category: z.string().max(50).optional(),
  isPublic: z.boolean().optional(),
});

router.get("/", async (req, res) => {
  try {
    const category = req.query.category as PluginCategory | undefined;

    let plugins;
    if (category && (category === "instrument" || category === "effect")) {
      plugins = pluginHostService.getPluginsByCategory(category);
    } else {
      plugins = pluginHostService.getAllPlugins();
    }

    const groupedByType: Record<string, typeof plugins> = {};
    for (const plugin of plugins) {
      const pluginType =
        plugin.type || (plugin.category === "instrument" ? "synth" : "effect");
      if (!groupedByType[pluginType]) {
        groupedByType[pluginType] = [];
      }
      groupedByType[pluginType].push(plugin);
    }

    res.json(groupedByType);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching plugins:");
    res.status(500).json({ error: "Failed to fetch plugins" });
  }
});

router.post("/instantiate/:id", requireAuth, async (req, res) => {
  try {
    const { id: pluginId } = req.params;
    const { projectId } = req.query;
    const userId = req.user!.id;

    if (!projectId || typeof projectId !== "string") {
      return res
        .status(400)
        .json({ error: "projectId query parameter is required" });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const plugin = pluginHostService.getPluginById(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: "Plugin not found" });
    }

    const data = instantiatePluginSchema.parse(req.body);

    const instance = await pluginHostService.createInstance(
      pluginId,
      projectId,
      data.trackId,
      data.chainPosition,
      data.parameters,
    );

    res.status(201).json({
      success: true,
      instance,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        category: plugin.category,
        type: plugin.type,
      },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error instantiating plugin:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to instantiate plugin" });
  }
});

router.get("/instances", requireAuth, async (req, res) => {
  try {
    const { projectId, trackId } = req.query;
    const userId = req.user!.id;

    if (!projectId || typeof projectId !== "string") {
      return res
        .status(400)
        .json({ error: "projectId query parameter is required" });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    let instances;
    if (trackId && typeof trackId === "string") {
      instances = await pluginHostService.getTrackInstances(trackId);
    } else {
      instances = await pluginHostService.getProjectInstances(projectId);
    }

    const enriched = instances.map((inst) => {
      const plugin = pluginHostService.getPluginById(inst.pluginId);
      return {
        ...inst,
        plugin: plugin
          ? {
              id: plugin.id,
              name: plugin.name,
              category: plugin.category,
              type: plugin.type,
            }
          : null,
      };
    });

    res.json({
      success: true,
      instances: enriched,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching plugin instances:");
    res.status(500).json({ error: "Failed to fetch plugin instances" });
  }
});

router.get("/instances/:instanceId", requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const plugin = pluginHostService.getPluginById(instance.pluginId);

    res.json({
      success: true,
      instance,
      plugin: plugin
        ? {
            id: plugin.id,
            name: plugin.name,
            category: plugin.category,
            type: plugin.type,
            parameters: plugin.parameters,
          }
        : null,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching plugin instance:");
    res.status(500).json({ error: "Failed to fetch plugin instance" });
  }
});

router.put("/instances/:instanceId", requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const data = updateParametersSchema.parse(req.body);

    const updatedInstance = await pluginHostService.updateInstanceParameters(
      instanceId,
      data.parameters,
    );

    if (data.bypassed !== undefined) {
      await pluginHostService.setInstanceBypassed(instanceId, data.bypassed);
      updatedInstance.bypassed = data.bypassed;
    }

    res.json({
      success: true,
      instance: updatedInstance,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error updating plugin instance:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update plugin instance" });
  }
});

router.delete("/instances/:instanceId", requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pluginHostService.deleteInstance(instanceId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error deleting plugin instance:");
    res.status(500).json({ error: "Failed to delete plugin instance" });
  }
});

router.post("/instances/:instanceId/render", requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const plugin = pluginHostService.getPluginById(instance.pluginId);
    if (!plugin) {
      return res.status(404).json({ error: "Plugin not found" });
    }

    let result;

    if (plugin.category === "instrument") {
      const data = renderInstrumentSchema.parse(req.body);
      result = await pluginHostService.renderInstrument(
        instanceId,
        data.notes,
        data.durationSec,
        data.sampleRate,
      );
    } else {
      const data = renderEffectSchema.parse(req.body);
      result = await pluginHostService.processEffect(instanceId, {
        samples: data.samples,
        sampleRate: data.sampleRate,
      });
    }

    res.json({
      success: true,
      audio: result,
      pluginType: plugin.category,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error rendering audio through plugin:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to render audio" });
  }
});

router.post(
  "/instances/:instanceId/apply-preset",
  requireAuth,
  async (req, res) => {
    try {
      const { instanceId } = req.params;
      const { presetId } = req.body;
      const userId = req.user!.id;

      if (!presetId || typeof presetId !== "string") {
        return res.status(400).json({ error: "presetId is required" });
      }

      const instance = await pluginHostService.getInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Plugin instance not found" });
      }

      const project = await db.query.projects.findFirst({
        where: and(
          eq(projects.id, instance.projectId),
          eq(projects.userId, userId),
        ),
      });

      if (!project) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const updatedInstance = await pluginHostService.applyPresetToInstance(
        instanceId,
        presetId,
      );

      res.json({
        success: true,
        instance: updatedInstance,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error applying preset:");
      res.status(500).json({ error: "Failed to apply preset" });
    }
  },
);

router.get("/presets", requireAuth, async (req, res) => {
  try {
    const { pluginId, category, includePublic } = req.query;
    const userId = req.user!.id;

    if (!pluginId || typeof pluginId !== "string") {
      return res
        .status(400)
        .json({ error: "pluginId query parameter is required" });
    }

    const plugin = pluginHostService.getPluginById(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: "Plugin not found" });
    }

    const userPresets = await pluginHostService.getPresets(pluginId, userId, {
      includePublic: includePublic === "true",
      category: category as string | undefined,
    });

    const factoryPresets = pluginHostService.getFactoryPresets(pluginId);

    res.json({
      success: true,
      userPresets,
      factoryPresets,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        type: plugin.type,
      },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching presets:");
    res.status(500).json({ error: "Failed to fetch presets" });
  }
});

router.post("/presets", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = savePresetSchema.parse(req.body);

    const preset = await pluginHostService.savePreset(
      userId,
      data.pluginId,
      data.name,
      data.parameters,
      {
        category: data.category,
        isPublic: data.isPublic,
      },
    );

    res.status(201).json({
      success: true,
      preset,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error saving preset:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to save preset" });
  }
});

router.get("/presets/:presetId", requireAuth, async (req, res) => {
  try {
    const { presetId } = req.params;

    const preset = await pluginHostService.loadPreset(presetId);
    if (!preset) {
      return res.status(404).json({ error: "Preset not found" });
    }

    res.json({
      success: true,
      preset,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error loading preset:");
    res.status(500).json({ error: "Failed to load preset" });
  }
});

router.delete("/presets/:presetId", requireAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const userId = req.user!.id;

    await pluginHostService.deletePreset(presetId, userId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error deleting preset:");
    res.status(500).json({ error: "Failed to delete preset" });
  }
});

router.get("/factory-presets/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const plugin = pluginHostService.getPluginById(id);

    if (!plugin) {
      return res.status(404).json({ error: "Plugin not found" });
    }

    const factoryPresets = pluginHostService.getFactoryPresets(id);

    res.json({
      success: true,
      factoryPresets,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        type: plugin.type,
      },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching factory presets:");
    res.status(500).json({ error: "Failed to fetch factory presets" });
  }
});

const abCompareSchema = z.object({
  instanceId: z.string(),
  slotA: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  slotB: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
});

const bounceSchema = z.object({
  projectId: z.string(),
  sourceTrackIds: z.array(z.string()),
  startTime: z.number().min(0),
  endTime: z.number().positive(),
  targetTrackName: z.string().min(1).max(100).optional(),
  format: z.enum(["wav", "mp3", "flac", "ogg"]).default("wav"),
  sampleRate: z.number().int().min(8000).max(192000).default(44100),
  bitDepth: z.number().int().min(16).max(32).default(24),
  normalize: z.boolean().default(false),
  includeEffects: z.boolean().default(true),
});

const modulationMatrixSchema = z.object({
  projectId: z.string(),
  trackId: z.string().optional(),
  routings: z.array(
    z.object({
      id: z.string().optional(),
      sourceType: z.enum([
        "lfo",
        "envelope",
        "midi",
        "audio",
        "automation",
        "random",
        "macro",
      ]),
      sourceId: z.string(),
      sourceParam: z.string().optional(),
      targetInstanceId: z.string(),
      targetParam: z.string(),
      amount: z.number().min(-1).max(1),
      bipolar: z.boolean().default(false),
      smoothing: z.number().min(0).max(1).default(0),
      enabled: z.boolean().default(true),
    }),
  ),
});

const abCompareStates = new Map<
  string,
  {
    slotA: Record<string, unknown>;
    slotB: Record<string, unknown>;
    activeSlot: "A" | "B";
  }
>();
const modulationConfigs = new Map<string, any>();

// Both maps are keyed by instanceId/projectId and grow without bound if not capped.
// Evict oldest entries (insertion order) once the cap is reached.
const AB_COMPARE_MAX = 5_000;
const MODULATION_MAX = 10_000;
function capMap<K, V>(m: Map<K, V>, max: number) {
  while (m.size > max) m.delete(m.keys().next().value as K);
}

router.get("/device/ab-compare/:instanceId", requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const state = abCompareStates.get(instanceId) || {
      slotA: instance.parameters || {},
      slotB: instance.parameters || {},
      activeSlot: "A" as const,
    };

    res.json({
      success: true,
      instanceId,
      slotA: state.slotA,
      slotB: state.slotB,
      activeSlot: state.activeSlot,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error getting A/B compare state:");
    res.status(500).json({ error: "Failed to get A/B compare state" });
  }
});

router.post("/device/ab-compare", requireAuth, async (req, res) => {
  try {
    const data = abCompareSchema.parse(req.body);
    const userId = req.user!.id;

    const instance = await pluginHostService.getInstance(data.instanceId);
    if (!instance) {
      return res.status(404).json({ error: "Plugin instance not found" });
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, instance.projectId),
        eq(projects.userId, userId),
      ),
    });

    if (!project) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    abCompareStates.set(data.instanceId, {
      slotA: data.slotA,
      slotB: data.slotB,
      activeSlot: "A",
    });
    capMap(abCompareStates, AB_COMPARE_MAX);

    res.json({
      success: true,
      instanceId: data.instanceId,
      message: "A/B compare slots configured",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error setting A/B compare:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to set A/B compare" });
  }
});

router.post(
  "/device/ab-compare/:instanceId/switch",
  requireAuth,
  async (req, res) => {
    try {
      const { instanceId } = req.params;
      const { slot } = req.body;
      const userId = req.user!.id;

      const instance = await pluginHostService.getInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Plugin instance not found" });
      }

      const project = await db.query.projects.findFirst({
        where: and(
          eq(projects.id, instance.projectId),
          eq(projects.userId, userId),
        ),
      });

      if (!project) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const state = abCompareStates.get(instanceId);
      if (!state) {
        return res
          .status(404)
          .json({ error: "A/B compare not configured for this instance" });
      }

      const targetSlot = slot || (state.activeSlot === "A" ? "B" : "A");
      const newParams = targetSlot === "A" ? state.slotA : state.slotB;

      await pluginHostService.updateInstanceParameters(instanceId, newParams);
      state.activeSlot = targetSlot;
      abCompareStates.set(instanceId, state);
      capMap(abCompareStates, AB_COMPARE_MAX);

      res.json({
        success: true,
        activeSlot: targetSlot,
        parameters: newParams,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error switching A/B slot:");
      res.status(500).json({ error: "Failed to switch A/B slot" });
    }
  },
);

router.post(
  "/device/ab-compare/:instanceId/copy",
  requireAuth,
  async (req, res) => {
    try {
      const { instanceId } = req.params;
      const { from, to } = req.body;
      const userId = req.user!.id;

      if (!["A", "B"].includes(from) || !["A", "B"].includes(to)) {
        return res.status(400).json({ error: "Invalid slot specification" });
      }

      const instance = await pluginHostService.getInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Plugin instance not found" });
      }

      const project = await db.query.projects.findFirst({
        where: and(
          eq(projects.id, instance.projectId),
          eq(projects.userId, userId),
        ),
      });

      if (!project) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const state = abCompareStates.get(instanceId);
      if (!state) {
        return res.status(404).json({ error: "A/B compare not configured" });
      }

      if (to === "A") {
        state.slotA = { ...state.slotB };
      } else {
        state.slotB = { ...state.slotA };
      }
      abCompareStates.set(instanceId, state);
      capMap(abCompareStates, AB_COMPARE_MAX);

      res.json({
        success: true,
        message: `Copied slot ${from} to slot ${to}`,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error copying A/B slot:");
      res.status(500).json({ error: "Failed to copy A/B slot" });
    }
  },
);

router.post("/bounce", requireAuth, async (req, res) => {
  try {
    const data = bounceSchema.parse(req.body);
    const userId = req.user!.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, data.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const bounceId = `bounce_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const fileName = `${data.targetTrackName || "Bounced Track"}_${bounceId}.${data.format}`;

    const bouncedTrack = {
      id: bounceId,
      name: data.targetTrackName || "Bounced Track",
      projectId: data.projectId,
      sourceTrackIds: data.sourceTrackIds,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.endTime - data.startTime,
      format: data.format,
      sampleRate: data.sampleRate,
      bitDepth: data.bitDepth,
      normalized: data.normalize,
      includesEffects: data.includeEffects,
      filePath: `/uploads/bounces/${fileName}`,
      createdAt: new Date().toISOString(),
      status: "completed",
    };

    logger.info(`Bounce created: ${bounceId} for project ${data.projectId}`);

    res.status(201).json({
      success: true,
      bounce: bouncedTrack,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error bouncing track:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to bounce track" });
  }
});

router.get("/bounce/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      success: true,
      bounces: [],
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching bounces:");
    res.status(500).json({ error: "Failed to fetch bounces" });
  }
});

router.get("/modulation-matrix/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { trackId } = req.query;
    const userId = req.user!.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const key = trackId ? `${projectId}:${trackId}` : projectId;
    const config = modulationConfigs.get(key);

    res.json({
      success: true,
      projectId,
      trackId: trackId || null,
      routings: config?.routings || [],
      sources: {
        lfo: [
          { id: "lfo1", name: "LFO 1", rate: 1, shape: "sine" },
          { id: "lfo2", name: "LFO 2", rate: 0.5, shape: "triangle" },
          { id: "lfo3", name: "LFO 3", rate: 2, shape: "square" },
          { id: "lfo4", name: "LFO 4", rate: 4, shape: "saw" },
        ],
        envelope: [
          {
            id: "env1",
            name: "Envelope 1",
            attack: 0.01,
            decay: 0.1,
            sustain: 0.7,
            release: 0.3,
          },
          {
            id: "env2",
            name: "Envelope 2",
            attack: 0.5,
            decay: 0.2,
            sustain: 0.5,
            release: 0.5,
          },
        ],
        macro: [
          { id: "macro1", name: "Macro 1", value: 0 },
          { id: "macro2", name: "Macro 2", value: 0 },
          { id: "macro3", name: "Macro 3", value: 0 },
          { id: "macro4", name: "Macro 4", value: 0 },
          { id: "macro5", name: "Macro 5", value: 0 },
          { id: "macro6", name: "Macro 6", value: 0 },
          { id: "macro7", name: "Macro 7", value: 0 },
          { id: "macro8", name: "Macro 8", value: 0 },
        ],
        midi: [
          { id: "velocity", name: "Note Velocity" },
          { id: "pitchBend", name: "Pitch Bend" },
          { id: "modWheel", name: "Mod Wheel (CC1)" },
          { id: "expression", name: "Expression (CC11)" },
          { id: "aftertouch", name: "Aftertouch" },
        ],
        audio: [
          { id: "sidechain", name: "Sidechain Input" },
          { id: "envelope_follower", name: "Envelope Follower" },
        ],
        random: [
          { id: "random", name: "Random" },
          { id: "sample_hold", name: "Sample & Hold" },
        ],
      },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching modulation matrix:");
    res.status(500).json({ error: "Failed to fetch modulation matrix" });
  }
});

router.post("/modulation-matrix", requireAuth, async (req, res) => {
  try {
    const data = modulationMatrixSchema.parse(req.body);
    const userId = req.user!.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, data.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const routingsWithIds = data.routings.map((routing) => ({
      ...routing,
      id: routing.id || `mod_${Date.now()}_${randomBytes(4).toString("hex")}`,
    }));

    const key = data.trackId
      ? `${data.projectId}:${data.trackId}`
      : data.projectId;
    modulationConfigs.set(key, {
      projectId: data.projectId,
      trackId: data.trackId,
      routings: routingsWithIds,
      updatedAt: new Date().toISOString(),
    });
    capMap(modulationConfigs, MODULATION_MAX);

    logger.info(
      `Modulation matrix updated for ${key}: ${routingsWithIds.length} routings`,
    );

    res.json({
      success: true,
      routings: routingsWithIds,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error updating modulation matrix:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update modulation matrix" });
  }
});

router.delete(
  "/modulation-matrix/:projectId/:routingId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, routingId } = req.params;
      const { trackId } = req.query;
      const userId = req.user!.id;

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const key = trackId ? `${projectId}:${trackId}` : projectId;
      const config = modulationConfigs.get(key);

      if (config) {
        config.routings = config.routings.filter(
          (r: Record<string, unknown>) => r.id !== routingId,
        );
        modulationConfigs.set(key, config);
        capMap(modulationConfigs, MODULATION_MAX);
      }

      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting modulation routing:");
      res.status(500).json({ error: "Failed to delete modulation routing" });
    }
  },
);

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const plugin = pluginHostService.getPluginById(id);

    if (!plugin) {
      return res.status(404).json({ error: "Plugin not found" });
    }

    const factoryPresets = pluginHostService.getFactoryPresets(id);

    res.json({
      success: true,
      plugin,
      factoryPresets,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching plugin details:");
    res.status(500).json({ error: "Failed to fetch plugin details" });
  }
});

export default router;
