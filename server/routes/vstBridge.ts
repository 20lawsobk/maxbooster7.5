import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../logger.js';
import { vstPluginBridge } from '../services/vstPluginBridge';

const router = Router();

const scanPathsSchema = z.object({
  paths: z.array(z.string()).optional(),
});

const connectDesktopSchema = z.object({
  sessionId: z.string(),
});

const createInstanceSchema = z.object({
  pluginId: z.string(),
  projectId: z.string(),
  trackId: z.string().optional(),
  chainPosition: z.number().int().min(0).default(0),
  sampleRate: z.number().int().min(8000).max(192000).default(44100),
  blockSize: z.number().int().min(32).max(4096).default(512),
});

const updateParametersSchema = z.object({
  parameters: z.record(z.number()),
});

const loadProgramSchema = z.object({
  programIndex: z.number().int().min(0),
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const stats = vstPluginBridge.getStats();
    res.json({
      success: true,
      bridgeReady: stats.bridgeReady,
      desktopConnected: stats.desktopConnected,
      totalPlugins: stats.totalPlugins,
      totalInstances: stats.totalInstances,
      instancesByFormat: stats.instancesByFormat,
      lastScanTime: stats.lastScanTime,
    });
  } catch (error: unknown) {
    logger.error('Error getting VST bridge status:', error);
    res.status(500).json({ error: 'Failed to get VST bridge status' });
  }
});

router.post('/initialize', requireAuth, async (req, res) => {
  try {
    await vstPluginBridge.initialize();
    res.json({
      success: true,
      message: 'VST Plugin Bridge initialized',
    });
  } catch (error: unknown) {
    logger.error('Error initializing VST bridge:', error);
    res.status(500).json({ error: 'Failed to initialize VST bridge' });
  }
});

router.post('/connect-desktop', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = connectDesktopSchema.parse(req.body);

    const connected = await vstPluginBridge.connectDesktopApp({
      sessionId,
      userId,
    });

    if (connected) {
      res.json({
        success: true,
        message: 'Desktop app connected successfully',
        capabilities: {
          vstSupport: true,
          auSupport: true,
          vst3Support: true,
          pluginScanning: true,
          nativeProcessing: true,
        },
      });
    } else {
      res.status(400).json({ error: 'Failed to connect desktop app' });
    }
  } catch (error: unknown) {
    logger.error('Error connecting desktop app:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to connect desktop app' });
  }
});

router.post('/disconnect-desktop', requireAuth, async (req, res) => {
  try {
    vstPluginBridge.disconnectDesktopApp();
    res.json({
      success: true,
      message: 'Desktop app disconnected',
    });
  } catch (error: unknown) {
    logger.error('Error disconnecting desktop app:', error);
    res.status(500).json({ error: 'Failed to disconnect desktop app' });
  }
});

router.post('/scan', requireAuth, async (req, res) => {
  try {
    const { paths } = scanPathsSchema.parse(req.body);
    const result = await vstPluginBridge.scanPlugins(paths);

    res.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    logger.error('Error scanning VST plugins:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to scan VST plugins' });
  }
});

router.get('/plugins', requireAuth, async (req, res) => {
  try {
    const { category, format } = req.query;

    let plugins = vstPluginBridge.getScannedPlugins();

    if (category && (category === 'instrument' || category === 'effect')) {
      plugins = vstPluginBridge.getPluginsByCategory(category);
    }

    if (format && ['vst2', 'vst3', 'au', 'aax'].includes(format as string)) {
      plugins = vstPluginBridge.getPluginsByFormat(format as any);
    }

    res.json({
      success: true,
      plugins,
      count: plugins.length,
    });
  } catch (error: unknown) {
    logger.error('Error fetching VST plugins:', error);
    res.status(500).json({ error: 'Failed to fetch VST plugins' });
  }
});

router.get('/plugins/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const plugin = vstPluginBridge.getPluginById(id);

    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    res.json({
      success: true,
      plugin,
    });
  } catch (error: unknown) {
    logger.error('Error fetching VST plugin details:', error);
    res.status(500).json({ error: 'Failed to fetch plugin details' });
  }
});

router.post('/instances', requireAuth, async (req, res) => {
  try {
    const data = createInstanceSchema.parse(req.body);

    const instance = await vstPluginBridge.createInstance(
      data.pluginId,
      data.projectId,
      data.trackId,
      data.chainPosition,
      data.sampleRate,
      data.blockSize
    );

    res.status(201).json({
      success: true,
      instance,
    });
  } catch (error: unknown) {
    logger.error('Error creating VST instance:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create VST instance' });
  }
});

router.get('/instances', requireAuth, async (req, res) => {
  try {
    const { projectId, trackId } = req.query;

    let instances;
    if (trackId && typeof trackId === 'string') {
      instances = vstPluginBridge.getTrackInstances(trackId);
    } else if (projectId && typeof projectId === 'string') {
      instances = vstPluginBridge.getProjectInstances(projectId);
    } else {
      return res.status(400).json({ error: 'projectId or trackId is required' });
    }

    res.json({
      success: true,
      instances,
    });
  } catch (error: unknown) {
    logger.error('Error fetching VST instances:', error);
    res.status(500).json({ error: 'Failed to fetch VST instances' });
  }
});

router.get('/instances/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const instance = vstPluginBridge.getInstance(id);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json({
      success: true,
      instance,
    });
  } catch (error: unknown) {
    logger.error('Error fetching VST instance:', error);
    res.status(500).json({ error: 'Failed to fetch VST instance' });
  }
});

router.put('/instances/:id/parameters', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { parameters } = updateParametersSchema.parse(req.body);

    const instance = await vstPluginBridge.updateParameters(id, parameters);

    res.json({
      success: true,
      instance,
    });
  } catch (error: unknown) {
    logger.error('Error updating VST parameters:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update VST parameters' });
  }
});

router.put('/instances/:id/bypass', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { bypassed } = req.body;

    if (typeof bypassed !== 'boolean') {
      return res.status(400).json({ error: 'bypassed must be a boolean' });
    }

    const instance = await vstPluginBridge.setBypass(id, bypassed);

    res.json({
      success: true,
      instance,
    });
  } catch (error: unknown) {
    logger.error('Error setting VST bypass:', error);
    res.status(500).json({ error: 'Failed to set VST bypass' });
  }
});

router.post('/instances/:id/program', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { programIndex } = loadProgramSchema.parse(req.body);

    await vstPluginBridge.loadProgram(id, programIndex);

    res.json({
      success: true,
      message: 'Program loaded successfully',
    });
  } catch (error: unknown) {
    logger.error('Error loading VST program:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to load VST program' });
  }
});

router.post('/instances/:id/editor/open', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await vstPluginBridge.openEditor(id);

    res.json({
      success: true,
      windowId: result.windowId,
    });
  } catch (error: unknown) {
    logger.error('Error opening VST editor:', error);
    res.status(500).json({ error: 'Failed to open VST editor' });
  }
});

router.post('/instances/:id/editor/close', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await vstPluginBridge.closeEditor(id);

    res.json({
      success: true,
      message: 'Editor closed',
    });
  } catch (error: unknown) {
    logger.error('Error closing VST editor:', error);
    res.status(500).json({ error: 'Failed to close VST editor' });
  }
});

router.delete('/instances/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await vstPluginBridge.deleteInstance(id);

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting VST instance:', error);
    res.status(500).json({ error: 'Failed to delete VST instance' });
  }
});

router.get('/formats', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      formats: [
        {
          id: 'vst2',
          name: 'VST 2.4',
          description: 'Steinberg VST 2.4 plugin format',
          platforms: ['windows', 'macos'],
          fileExtensions: ['.dll', '.vst'],
        },
        {
          id: 'vst3',
          name: 'VST 3',
          description: 'Steinberg VST 3 plugin format',
          platforms: ['windows', 'macos', 'linux'],
          fileExtensions: ['.vst3'],
        },
        {
          id: 'au',
          name: 'Audio Unit',
          description: 'Apple Audio Unit plugin format',
          platforms: ['macos'],
          fileExtensions: ['.component'],
        },
        {
          id: 'aax',
          name: 'AAX',
          description: 'Avid AAX plugin format (Pro Tools)',
          platforms: ['windows', 'macos'],
          fileExtensions: ['.aaxplugin'],
        },
      ],
    });
  } catch (error: unknown) {
    logger.error('Error fetching plugin formats:', error);
    res.status(500).json({ error: 'Failed to fetch plugin formats' });
  }
});

export default router;
