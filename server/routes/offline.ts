import { Router } from 'express';
import { requireAuth } from '../auth';
import { z } from 'zod';
import { logger } from '../logger.js';
import { offlineModeService } from '../services/offlineModeService';

const router = Router();

const cacheProjectSchema = z.object({
  projectId: z.string(),
});

const updateSettingsSchema = z.object({
  maxCacheSize: z.number().int().positive().optional(),
  autoCacheProjects: z.boolean().optional(),
  cacheAudioQuality: z.enum(['original', 'high', 'medium', 'low']).optional(),
  syncOnReconnect: z.boolean().optional(),
  conflictResolution: z.enum(['local', 'server', 'ask']).optional(),
  backgroundSync: z.boolean().optional(),
  syncInterval: z.number().int().min(60000).optional(),
  offlineNotifications: z.boolean().optional(),
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const isOnline = offlineModeService.getOnlineStatus();
    const capabilities = offlineModeService.getOfflineCapabilities();
    const cacheStats = offlineModeService.getCacheStats();
    const syncQueue = offlineModeService.getSyncQueue();
    const isSyncing = offlineModeService.isSyncInProgress();

    res.json({
      success: true,
      isOnline,
      isOfflineAvailable: offlineModeService.isOfflineAvailable(),
      capabilities,
      cacheStats,
      syncQueue,
      isSyncing,
      lastOnlineCheck: offlineModeService.getLastOnlineCheck(),
    });
  } catch (error: unknown) {
    logger.error('Error getting offline status:', error);
    res.status(500).json({ error: 'Failed to get offline status' });
  }
});

router.get('/capabilities', requireAuth, async (req, res) => {
  try {
    const capabilities = offlineModeService.getOfflineCapabilities();

    res.json({
      success: true,
      capabilities,
      description: {
        projectEditing: 'Edit projects, add tracks, and make changes offline',
        audioPlayback: 'Play back audio from cached projects',
        midiEditing: 'Create and edit MIDI data offline',
        mixing: 'Adjust volume, pan, and effects offline',
        pluginProcessing: 'Use built-in plugins for audio processing',
        aiFeatures: 'Requires internet - AI mixing, mastering, content generation',
        distribution: 'Requires internet - Upload and distribute music',
        socialMedia: 'Requires internet - Social media scheduling and posting',
        analytics: 'Requires internet - View streaming and revenue analytics',
        marketplace: 'Requires internet - Browse and sell on marketplace',
      },
    });
  } catch (error: unknown) {
    logger.error('Error getting offline capabilities:', error);
    res.status(500).json({ error: 'Failed to get offline capabilities' });
  }
});

router.post('/cache', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = cacheProjectSchema.parse(req.body);

    const cachedProject = await offlineModeService.cacheProject(projectId, userId);

    res.status(201).json({
      success: true,
      project: {
        id: cachedProject.id,
        projectId: cachedProject.projectId,
        name: cachedProject.name,
        size: cachedProject.size,
        cachedAt: cachedProject.cachedAt,
        audioFilesCount: cachedProject.audioFiles.length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error caching project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to cache project' });
  }
});

router.delete('/cache/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    await offlineModeService.uncacheProject(projectId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error uncaching project:', error);
    res.status(500).json({ error: 'Failed to uncache project' });
  }
});

router.get('/cache', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const cachedProjects = offlineModeService.getCachedProjects(userId);

    res.json({
      success: true,
      projects: cachedProjects.map(p => ({
        id: p.id,
        projectId: p.projectId,
        name: p.name,
        size: p.size,
        cachedAt: p.cachedAt,
        lastSyncAt: p.lastSyncAt,
        status: p.status,
        localChanges: p.localChanges,
        serverChanges: p.serverChanges,
        audioFilesCount: p.audioFiles.length,
      })),
      stats: offlineModeService.getCacheStats(),
    });
  } catch (error: unknown) {
    logger.error('Error getting cached projects:', error);
    res.status(500).json({ error: 'Failed to get cached projects' });
  }
});

router.get('/cache/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const cached = offlineModeService.getCachedProject(projectId);

    if (!cached) {
      return res.status(404).json({ error: 'Project not cached' });
    }

    res.json({
      success: true,
      project: cached,
    });
  } catch (error: unknown) {
    logger.error('Error getting cached project:', error);
    res.status(500).json({ error: 'Failed to get cached project' });
  }
});

router.get('/cache/:projectId/check', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const isCached = offlineModeService.isProjectCached(projectId);

    res.json({
      success: true,
      projectId,
      isCached,
    });
  } catch (error: unknown) {
    logger.error('Error checking cache status:', error);
    res.status(500).json({ error: 'Failed to check cache status' });
  }
});

router.post('/sync/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await offlineModeService.syncProject(projectId);

    res.json({
      success: result.success,
      result,
    });
  } catch (error: unknown) {
    logger.error('Error syncing project:', error);
    res.status(500).json({ error: 'Failed to sync project' });
  }
});

router.post('/sync-all', requireAuth, async (req, res) => {
  try {
    const { results, totalTime } = await offlineModeService.syncAll();

    res.json({
      success: true,
      results,
      totalTime,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error syncing all projects:', error);
    res.status(500).json({ error: 'Failed to sync all projects' });
  }
});

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const settings = offlineModeService.getSettings();

    res.json({
      success: true,
      settings,
    });
  } catch (error: unknown) {
    logger.error('Error getting offline settings:', error);
    res.status(500).json({ error: 'Failed to get offline settings' });
  }
});

router.put('/settings', requireAuth, async (req, res) => {
  try {
    const updates = updateSettingsSchema.parse(req.body);
    const settings = offlineModeService.updateSettings(updates);

    res.json({
      success: true,
      settings,
    });
  } catch (error: unknown) {
    logger.error('Error updating offline settings:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update offline settings' });
  }
});

router.delete('/cache', requireAuth, async (req, res) => {
  try {
    await offlineModeService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error: unknown) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.post('/cleanup', requireAuth, async (req, res) => {
  try {
    const { maxAge } = req.body;
    const cleaned = await offlineModeService.cleanupOldCache(maxAge);

    res.json({
      success: true,
      removedProjects: cleaned,
    });
  } catch (error: unknown) {
    logger.error('Error cleaning up cache:', error);
    res.status(500).json({ error: 'Failed to cleanup cache' });
  }
});

router.post('/export/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const exportResult = await offlineModeService.exportProjectForOffline(projectId, userId);

    res.json({
      success: true,
      ...exportResult,
    });
  } catch (error: unknown) {
    logger.error('Error exporting project for offline:', error);
    res.status(500).json({ error: 'Failed to export project for offline use' });
  }
});

router.post('/import', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const projectData = req.body;

    const projectId = await offlineModeService.importOfflineProject(userId, projectData);

    res.json({
      success: true,
      projectId,
    });
  } catch (error: unknown) {
    logger.error('Error importing offline project:', error);
    res.status(500).json({ error: 'Failed to import offline project' });
  }
});

router.post('/change/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { type } = req.body;

    if (type === 'local') {
      offlineModeService.recordLocalChange(projectId);
    } else if (type === 'server') {
      offlineModeService.recordServerChange(projectId);
    } else {
      return res.status(400).json({ error: 'Invalid change type' });
    }

    res.json({
      success: true,
      message: `${type} change recorded`,
    });
  } catch (error: unknown) {
    logger.error('Error recording change:', error);
    res.status(500).json({ error: 'Failed to record change' });
  }
});

export default router;
