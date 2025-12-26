import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { projects, studioTracks, audioClips } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { studioService } from '../services/studioService';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';

const router = Router();

const createTrackSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(255),
  trackType: z.enum(['audio', 'midi', 'aux', 'master']).default('audio'),
  trackNumber: z.number().int().min(0).optional(),
  volume: z.number().min(0).max(2).default(1),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  armed: z.boolean().default(false),
  recordEnabled: z.boolean().default(false),
  inputMonitoring: z.boolean().default(false),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  height: z.number().int().min(40).max(300).default(80),
  collapsed: z.boolean().default(false),
  outputBus: z.string().default('master'),
});

const updateTrackSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  volume: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  mute: z.boolean().optional(),
  solo: z.boolean().optional(),
  armed: z.boolean().optional(),
  recordEnabled: z.boolean().optional(),
  inputMonitoring: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  height: z.number().int().min(40).max(300).optional(),
  collapsed: z.boolean().optional(),
  outputBus: z.string().optional(),
});

const updateClipSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  offset: z.number().min(0).optional(),
  gain: z.number().min(0).max(10).optional(),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  muted: z.boolean().optional(),
  locked: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  tempo: z.number().min(20).max(999).optional(),
  timeSignature: z.string().optional(),
  sampleRate: z.number().optional(),
  bitDepth: z.number().optional(),
});

async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return !!project;
}

router.get('/projects/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error: unknown) {
    logger.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

router.patch('/projects/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = updateProjectSchema.parse(req.body);

    const [updated] = await db
      .update(projects)
      .set({
        ...data,
        bpm: data.tempo,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating project:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.post('/tracks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data = createTrackSchema.parse(req.body);

    if (!await verifyProjectOwnership(data.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const existingTracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, data.projectId),
    });

    const trackNumber = data.trackNumber ?? existingTracks.length + 1;

    const [track] = await db
      .insert(studioTracks)
      .values({
        id: `track_${nanoid()}`,
        projectId: data.projectId,
        name: data.name,
        trackType: data.trackType,
        trackNumber,
        volume: data.volume,
        pan: data.pan,
        mute: data.mute,
        solo: data.solo,
        armed: data.armed,
        recordEnabled: data.recordEnabled,
        inputMonitoring: data.inputMonitoring,
        color: data.color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
        height: data.height,
        collapsed: data.collapsed,
        outputBus: data.outputBus,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json(track);
  } catch (error: unknown) {
    logger.error('Error creating track:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to create track' });
  }
});

router.get('/projects/:projectId/tracks', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
      orderBy: (studioTracks, { asc }) => [asc(studioTracks.trackNumber)],
    });

    res.json(tracks);
  } catch (error: unknown) {
    logger.error('Error getting tracks:', error);
    res.status(500).json({ error: 'Failed to get tracks' });
  }
});

router.patch('/tracks/:trackId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const userId = (req as any).user.id;

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (!await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = updateTrackSchema.parse(req.body);

    const [updated] = await db
      .update(studioTracks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(studioTracks.id, trackId))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating track:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update track' });
  }
});

router.delete('/tracks/:trackId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const userId = (req as any).user.id;

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (!await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.delete(audioClips).where(eq(audioClips.trackId, trackId));
    await db.delete(studioTracks).where(eq(studioTracks.id, trackId));

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting track:', error);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

router.get('/tracks/:trackId/audio-clips', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const userId = (req as any).user.id;

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (!await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.trackId, trackId),
      orderBy: (audioClips, { asc }) => [asc(audioClips.startTime)],
    });

    res.json(clips);
  } catch (error: unknown) {
    logger.error('Error getting audio clips:', error);
    res.status(500).json({ error: 'Failed to get audio clips' });
  }
});

router.patch('/clips/:clipId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const clip = await db.query.audioClips.findFirst({
      where: eq(audioClips.id, clipId),
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, clip.trackId),
    });

    if (!track || !await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = updateClipSchema.parse(req.body);

    const [updated] = await db
      .update(audioClips)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(audioClips.id, clipId))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating clip:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update clip' });
  }
});

router.delete('/clips/:clipId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clipId } = req.params;
    const userId = (req as any).user.id;

    const clip = await db.query.audioClips.findFirst({
      where: eq(audioClips.id, clipId),
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, clip.trackId),
    });

    if (!track || !await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.delete(audioClips).where(eq(audioClips.id, clipId));

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting clip:', error);
    res.status(500).json({ error: 'Failed to delete clip' });
  }
});

router.post('/record/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { trackId, projectId, audioData, duration, sampleRate } = req.body;

    if (!trackId || !projectId) {
      return res.status(400).json({ error: 'trackId and projectId are required' });
    }

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const clipId = nanoid();
    const [clip] = await db
      .insert(audioClips)
      .values({
        id: clipId,
        trackId,
        name: `Recording ${new Date().toLocaleTimeString()}`,
        startTime: 0,
        duration: duration || 0,
        sourceUrl: '',
        waveformData: audioData || null,
      })
      .returning();

    res.status(201).json({
      success: true,
      clip,
      message: 'Recording uploaded successfully',
    });
  } catch (error: unknown) {
    logger.error('Error uploading recording:', error);
    res.status(500).json({ error: 'Failed to upload recording' });
  }
});

router.get('/samples', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      samples: [],
      categories: ['Drums', 'Bass', 'Synths', 'FX', 'Vocals'],
    });
  } catch (error: unknown) {
    logger.error('Error fetching samples:', error);
    res.status(500).json({ error: 'Failed to fetch samples' });
  }
});

router.get('/recent-files', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const recentProjects = await db.query.studioProjects.findMany({
      where: eq(studioProjects.userId, userId),
      orderBy: (studioProjects, { desc }) => [desc(studioProjects.updatedAt)],
      limit: 10,
    });
    res.json(recentProjects.map(p => ({
      id: p.id,
      name: p.name,
      type: 'project',
      lastOpened: p.updatedAt,
    })));
  } catch (error: unknown) {
    logger.error('Error fetching recent files:', error);
    res.status(500).json({ error: 'Failed to fetch recent files' });
  }
});

router.post('/mix-busses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, name, type } = req.body;
    res.status(201).json({
      id: nanoid(),
      projectId,
      name: name || 'New Bus',
      type: type || 'aux',
      volume: 0,
      pan: 0,
      muted: false,
      solo: false,
    });
  } catch (error: unknown) {
    logger.error('Error creating mix bus:', error);
    res.status(500).json({ error: 'Failed to create mix bus' });
  }
});

router.get('/conversions', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error: unknown) {
    logger.error('Error fetching conversions:', error);
    res.status(500).json({ error: 'Failed to fetch conversions' });
  }
});

router.post('/conversions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, format, quality } = req.body;
    const conversionId = nanoid();
    res.status(201).json({
      id: conversionId,
      projectId,
      format: format || 'wav',
      quality: quality || 'high',
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error creating conversion:', error);
    res.status(500).json({ error: 'Failed to create conversion' });
  }
});

router.post('/conversions/:conversionId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { conversionId } = req.params;
    res.json({ success: true, message: 'Conversion cancelled', conversionId });
  } catch (error: unknown) {
    logger.error('Error cancelling conversion:', error);
    res.status(500).json({ error: 'Failed to cancel conversion' });
  }
});

router.get('/conversions/:conversionId/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { conversionId } = req.params;
    res.status(404).json({ error: 'Conversion not found or not ready', conversionId });
  } catch (error: unknown) {
    logger.error('Error downloading conversion:', error);
    res.status(500).json({ error: 'Failed to download conversion' });
  }
});

export default router;
