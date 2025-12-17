import { Router } from 'express';
import { requireAuth } from '../auth';
import { z } from 'zod';
import { logger } from '../logger.js';
import { pluginHostService, PluginCategory } from '../services/pluginHostService';
import { db } from '../db';
import { projects } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

const instantiatePluginSchema = z.object({
  trackId: z.string().optional(),
  chainPosition: z.number().int().min(0).default(0),
  parameters: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
});

const updateParametersSchema = z.object({
  parameters: z.record(z.union([z.number(), z.boolean(), z.string()])),
  bypassed: z.boolean().optional(),
});

const renderInstrumentSchema = z.object({
  notes: z.array(z.object({
    note: z.number().int().min(0).max(127),
    velocity: z.number().int().min(0).max(127),
    duration: z.number().positive(),
    startTime: z.number().min(0),
  })),
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
  parameters: z.record(z.union([z.number(), z.boolean(), z.string()])),
  category: z.string().max(50).optional(),
  isPublic: z.boolean().optional(),
});

router.get('/plugins', requireAuth, async (req, res) => {
  try {
    const category = req.query.category as PluginCategory | undefined;
    
    let plugins;
    if (category && (category === 'instrument' || category === 'effect')) {
      plugins = pluginHostService.getPluginsByCategory(category);
    } else {
      plugins = pluginHostService.getAllPlugins();
    }

    const groupedByType: Record<string, typeof plugins> = {};
    for (const plugin of plugins) {
      const pluginType = plugin.type || (plugin.category === 'instrument' ? 'synth' : 'effect');
      if (!groupedByType[pluginType]) {
        groupedByType[pluginType] = [];
      }
      groupedByType[pluginType].push(plugin);
    }

    res.json(groupedByType);
  } catch (error: unknown) {
    logger.error('Error fetching plugins:', error);
    res.status(500).json({ error: 'Failed to fetch plugins' });
  }
});

router.get('/plugins/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const plugin = pluginHostService.getPluginById(id);

    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const factoryPresets = pluginHostService.getFactoryPresets(id);

    res.json({
      success: true,
      plugin,
      factoryPresets,
    });
  } catch (error: unknown) {
    logger.error('Error fetching plugin details:', error);
    res.status(500).json({ error: 'Failed to fetch plugin details' });
  }
});

router.post('/plugins/:id/instantiate', requireAuth, async (req, res) => {
  try {
    const { id: pluginId } = req.params;
    const { projectId } = req.query;
    const userId = (req as any).user.id;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId query parameter is required' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const plugin = pluginHostService.getPluginById(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const data = instantiatePluginSchema.parse(req.body);

    const instance = await pluginHostService.createInstance(
      pluginId,
      projectId,
      data.trackId,
      data.chainPosition,
      data.parameters
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
    logger.error('Error instantiating plugin:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to instantiate plugin' });
  }
});

router.get('/instances', requireAuth, async (req, res) => {
  try {
    const { projectId, trackId } = req.query;
    const userId = (req as any).user.id;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId query parameter is required' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let instances;
    if (trackId && typeof trackId === 'string') {
      instances = await pluginHostService.getTrackInstances(trackId);
    } else {
      instances = await pluginHostService.getProjectInstances(projectId);
    }

    const enriched = instances.map(inst => {
      const plugin = pluginHostService.getPluginById(inst.pluginId);
      return {
        ...inst,
        plugin: plugin ? {
          id: plugin.id,
          name: plugin.name,
          category: plugin.category,
          type: plugin.type,
        } : null,
      };
    });

    res.json({
      success: true,
      instances: enriched,
    });
  } catch (error: unknown) {
    logger.error('Error fetching plugin instances:', error);
    res.status(500).json({ error: 'Failed to fetch plugin instances' });
  }
});

router.get('/instances/:instanceId', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = (req as any).user.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Plugin instance not found' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, instance.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const plugin = pluginHostService.getPluginById(instance.pluginId);

    res.json({
      success: true,
      instance,
      plugin: plugin ? {
        id: plugin.id,
        name: plugin.name,
        category: plugin.category,
        type: plugin.type,
        parameters: plugin.parameters,
      } : null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching plugin instance:', error);
    res.status(500).json({ error: 'Failed to fetch plugin instance' });
  }
});

router.put('/instances/:instanceId', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = (req as any).user.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Plugin instance not found' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, instance.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const data = updateParametersSchema.parse(req.body);

    const updatedInstance = await pluginHostService.updateInstanceParameters(
      instanceId,
      data.parameters
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
    logger.error('Error updating plugin instance:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update plugin instance' });
  }
});

router.delete('/instances/:instanceId', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = (req as any).user.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Plugin instance not found' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, instance.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await pluginHostService.deleteInstance(instanceId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting plugin instance:', error);
    res.status(500).json({ error: 'Failed to delete plugin instance' });
  }
});

router.post('/instances/:instanceId/render', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = (req as any).user.id;

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Plugin instance not found' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, instance.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const plugin = pluginHostService.getPluginById(instance.pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    let result;

    if (plugin.category === 'instrument') {
      const data = renderInstrumentSchema.parse(req.body);
      result = await pluginHostService.renderInstrument(
        instanceId,
        data.notes,
        data.durationSec,
        data.sampleRate
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
    logger.error('Error rendering audio through plugin:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to render audio' });
  }
});

router.post('/instances/:instanceId/apply-preset', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { presetId } = req.body;
    const userId = (req as any).user.id;

    if (!presetId || typeof presetId !== 'string') {
      return res.status(400).json({ error: 'presetId is required' });
    }

    const instance = await pluginHostService.getInstance(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Plugin instance not found' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, instance.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updatedInstance = await pluginHostService.applyPresetToInstance(instanceId, presetId);

    res.json({
      success: true,
      instance: updatedInstance,
    });
  } catch (error: unknown) {
    logger.error('Error applying preset:', error);
    res.status(500).json({ error: 'Failed to apply preset' });
  }
});

router.get('/presets', requireAuth, async (req, res) => {
  try {
    const { pluginId, category, includePublic } = req.query;
    const userId = (req as any).user.id;

    if (!pluginId || typeof pluginId !== 'string') {
      return res.status(400).json({ error: 'pluginId query parameter is required' });
    }

    const plugin = pluginHostService.getPluginById(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const userPresets = await pluginHostService.getPresets(pluginId, userId, {
      includePublic: includePublic === 'true',
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
    logger.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

router.post('/presets', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const data = savePresetSchema.parse(req.body);

    const preset = await pluginHostService.savePreset(
      userId,
      data.pluginId,
      data.name,
      data.parameters,
      {
        category: data.category,
        isPublic: data.isPublic,
      }
    );

    res.status(201).json({
      success: true,
      preset,
    });
  } catch (error: unknown) {
    logger.error('Error saving preset:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

router.get('/presets/:presetId', requireAuth, async (req, res) => {
  try {
    const { presetId } = req.params;

    const preset = await pluginHostService.loadPreset(presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({
      success: true,
      preset,
    });
  } catch (error: unknown) {
    logger.error('Error loading preset:', error);
    res.status(500).json({ error: 'Failed to load preset' });
  }
});

router.delete('/presets/:presetId', requireAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const userId = (req as any).user.id;

    await pluginHostService.deletePreset(presetId, userId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting preset:', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

router.get('/plugins/:id/factory-presets', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const plugin = pluginHostService.getPluginById(id);

    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
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
    logger.error('Error fetching factory presets:', error);
    res.status(500).json({ error: 'Failed to fetch factory presets' });
  }
});

export default router;
