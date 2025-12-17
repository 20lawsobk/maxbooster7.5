import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { audioClips, warpMarkers, studioTracks, projects } from '@shared/schema';
import { insertWarpMarkerSchema, updateWarpMarkerSchema } from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';
import { timeStretchService } from '../services/timeStretchService.js';
import { queueService } from '../services/queueService.js';
import { randomUUID } from 'crypto';

const router = Router();

const warpPreviewSchema = z.object({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  pitchShift: z.number().min(-24).max(24).optional(),
  preserveFormants: z.boolean().optional().default(true),
  algorithm: z.enum(['rubberband', 'phase_vocoder', 'wsola']).optional().default('phase_vocoder'),
  quality: z.enum(['fast', 'normal', 'high']).optional().default('normal'),
});

const warpCommitSchema = z.object({
  pitchShift: z.number().min(-24).max(24).optional(),
  preserveFormants: z.boolean().optional().default(true),
  algorithm: z.enum(['rubberband', 'phase_vocoder', 'wsola']).optional().default('phase_vocoder'),
  quality: z.enum(['fast', 'normal', 'high']).optional().default('high'),
  replaceOriginal: z.boolean().optional().default(false),
});

const transientDetectionSchema = z.object({
  sensitivity: z.number().min(0).max(1).optional().default(0.5),
  minTransientGap: z.number().min(0.01).max(1).optional().default(0.05),
  createMarkers: z.boolean().optional().default(false),
});

async function verifyClipOwnership(
  clipId: string,
  userId: string
): Promise<{ clip: any; track: any; project: any } | null> {
  const clip = await db.query.audioClips.findFirst({
    where: eq(audioClips.id, clipId),
  });

  if (!clip) {
    return null;
  }

  const track = await db.query.studioTracks.findFirst({
    where: eq(studioTracks.id, clip.trackId),
  });

  if (!track) {
    return null;
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, track.projectId), eq(projects.userId, userId)),
  });

  if (!project) {
    return null;
  }

  return { clip, track, project };
}

router.get('/clips/:clipId/warp/markers', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.sourceTime)],
    });

    res.json({ markers });
  } catch (error: unknown) {
    logger.error('Error fetching warp markers:', error);
    res.status(500).json({ error: 'Failed to fetch warp markers' });
  }
});

router.post('/clips/:clipId/warp/markers', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const markerData = insertWarpMarkerSchema.parse({
      ...req.body,
      clipId,
    });

    const [newMarker] = await db
      .insert(warpMarkers)
      .values(markerData)
      .returning();

    res.status(201).json(newMarker);
  } catch (error: any) {
    logger.error('Error creating warp marker:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid marker data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create warp marker' });
  }
});

router.put('/clips/:clipId/warp/markers/:markerId', requireAuth, async (req, res) => {
  try {
    const { clipId, markerId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const marker = await db.query.warpMarkers.findFirst({
      where: and(eq(warpMarkers.id, markerId), eq(warpMarkers.clipId, clipId)),
    });

    if (!marker) {
      return res.status(404).json({ error: 'Warp marker not found' });
    }

    const updates = updateWarpMarkerSchema.parse(req.body);

    const [updatedMarker] = await db
      .update(warpMarkers)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(warpMarkers.id, markerId))
      .returning();

    res.json(updatedMarker);
  } catch (error: any) {
    logger.error('Error updating warp marker:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid marker data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update warp marker' });
  }
});

router.delete('/clips/:clipId/warp/markers/:markerId', requireAuth, async (req, res) => {
  try {
    const { clipId, markerId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const marker = await db.query.warpMarkers.findFirst({
      where: and(eq(warpMarkers.id, markerId), eq(warpMarkers.clipId, clipId)),
    });

    if (!marker) {
      return res.status(404).json({ error: 'Warp marker not found' });
    }

    await db.delete(warpMarkers).where(eq(warpMarkers.id, markerId));

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting warp marker:', error);
    res.status(500).json({ error: 'Failed to delete warp marker' });
  }
});

router.post('/clips/:clipId/warp/preview', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const { clip } = ownership;
    const options = warpPreviewSchema.parse(req.body);

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.sourceTime)],
    });

    const jobId = randomUUID();
    const jobData = {
      userId,
      clipId,
      storageKey: clip.filePath,
      markers: markers.map((m: any) => ({
        id: m.id,
        sourceTime: m.sourceTime,
        targetTime: m.targetTime,
      })),
      startTime: options.startTime,
      endTime: options.endTime,
      pitchShift: options.pitchShift,
      preserveFormants: options.preserveFormants,
      algorithm: options.algorithm,
      quality: options.quality,
    };

    await queueService.addJob('audio-warp-preview', `warp-preview-${jobId}`, jobData, {
      priority: 2,
      attempts: 2,
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      statusUrl: `/api/studio/jobs/${jobId}/status`,
    });
  } catch (error: any) {
    logger.error('Error creating warp preview:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid preview options', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create warp preview' });
  }
});

router.post('/clips/:clipId/warp/commit', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const { clip } = ownership;
    const options = warpCommitSchema.parse(req.body);

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.sourceTime)],
    });

    if (markers.length === 0) {
      return res.status(400).json({ error: 'No warp markers found for this clip' });
    }

    const jobId = randomUUID();
    const jobData = {
      userId,
      clipId,
      storageKey: clip.filePath,
      markers: markers.map((m: any) => ({
        id: m.id,
        sourceTime: m.sourceTime,
        targetTime: m.targetTime,
      })),
      pitchShift: options.pitchShift ?? clip.pitchShift,
      preserveFormants: options.preserveFormants ?? clip.preserveFormants,
      algorithm: options.algorithm,
      quality: options.quality,
      replaceOriginal: options.replaceOriginal,
    };

    await queueService.addJob('audio-warp-commit', `warp-commit-${jobId}`, jobData, {
      priority: 1,
      attempts: 3,
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Warp rendering started. The clip will be updated when complete.',
      statusUrl: `/api/studio/jobs/${jobId}/status`,
    });
  } catch (error: any) {
    logger.error('Error committing warp:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid commit options', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to commit warp' });
  }
});

router.get('/clips/:clipId/warp/transients', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const { clip } = ownership;
    const options = transientDetectionSchema.parse(req.query);

    const jobId = randomUUID();
    const jobData = {
      userId,
      clipId,
      storageKey: clip.filePath,
      sensitivity: options.sensitivity,
      minTransientGap: options.minTransientGap,
    };

    await queueService.addJob('transient-detection', `transient-${jobId}`, jobData, {
      priority: 2,
      attempts: 2,
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Transient detection started',
      statusUrl: `/api/studio/jobs/${jobId}/status`,
    });
  } catch (error: any) {
    logger.error('Error detecting transients:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid detection options', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to detect transients' });
  }
});

router.post('/clips/:clipId/warp/quantize', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const { clip } = ownership;

    const quantizeSchema = z.object({
      targetBpm: z.number().min(20).max(300),
      strength: z.number().min(0).max(1).optional().default(1.0),
      sensitivity: z.number().min(0).max(1).optional().default(0.5),
    });

    const options = quantizeSchema.parse(req.body);

    const jobId = randomUUID();
    const jobData = {
      userId,
      clipId,
      storageKey: clip.filePath,
      targetBpm: options.targetBpm,
      strength: options.strength,
      sensitivity: options.sensitivity,
    };

    await queueService.addJob('audio-quantize', `quantize-${jobId}`, jobData, {
      priority: 1,
      attempts: 3,
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Beat quantization started',
      statusUrl: `/api/studio/jobs/${jobId}/status`,
    });
  } catch (error: any) {
    logger.error('Error quantizing to grid:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid quantize options', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to start quantization' });
  }
});

router.delete('/clips/:clipId/warp/markers', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const result = await db.delete(warpMarkers).where(eq(warpMarkers.clipId, clipId));

    res.json({
      message: 'All warp markers deleted',
      deleted: true,
    });
  } catch (error: unknown) {
    logger.error('Error deleting all warp markers:', error);
    res.status(500).json({ error: 'Failed to delete warp markers' });
  }
});

router.get('/clips/:clipId/warp/tempo', requireAuth, async (req, res) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const ownership = await verifyClipOwnership(clipId, userId);
    if (!ownership) {
      return res.status(404).json({ error: 'Clip not found or unauthorized' });
    }

    const { clip } = ownership;

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.sourceTime)],
    });

    const stretchRatio = clip.timeStretch || 1.0;
    const originalDuration = clip.duration / stretchRatio;

    res.json({
      clipId,
      originalDuration,
      currentDuration: clip.duration,
      timeStretch: stretchRatio,
      pitchShift: clip.pitchShift || 0,
      preserveFormants: clip.preserveFormants ?? true,
      markerCount: markers.length,
      markers: markers.map((m: any) => ({
        id: m.id,
        sourceTime: m.sourceTime,
        targetTime: m.targetTime,
        markerType: m.markerType,
        isAnchor: m.isAnchor,
      })),
    });
  } catch (error: unknown) {
    logger.error('Error fetching tempo info:', error);
    res.status(500).json({ error: 'Failed to fetch tempo info' });
  }
});

export default router;
