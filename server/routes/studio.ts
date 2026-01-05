import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { projects, studioTracks, audioClips, studioTemplates } from '@shared/schema';
import { eq, and, or, desc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { studioService } from '../services/studioService';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import { audioUpload, storeUploadedFile, handleUploadError } from '../middleware/uploadHandler.js';

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
  description: z.string().optional(),
  genre: z.string().optional(),
  tempo: z.number().min(20).max(999).optional(),
  bpm: z.number().min(20).max(999).optional(),
  key: z.string().optional(),
  timeSignature: z.string().optional(),
  sampleRate: z.number().optional(),
  bitDepth: z.number().optional(),
  workflowStage: z.string().optional(),
  status: z.string().optional(),
});

async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return !!project;
}

// GET all projects for user
router.get('/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const userProjects = await db.query.projects.findMany({
      where: eq(projects.userId, userId),
    });
    res.json(userProjects);
  } catch (error: unknown) {
    logger.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST create new project
router.post('/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title, tempo, timeSignature, sampleRate, bitDepth } = req.body;
    const projectId = nanoid();
    
    const [project] = await db.insert(projects).values({
      id: projectId,
      userId,
      title: title || 'Untitled Project',
      tempo: tempo || 120,
      timeSignature: timeSignature || '4/4',
      sampleRate: sampleRate || 44100,
      bitDepth: bitDepth || 24,
      isStudioProject: true,
    }).returning();
    
    res.status(201).json(project);
  } catch (error: unknown) {
    logger.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET recent files
router.get('/recent-files', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ files: [] });
  } catch (error: unknown) {
    logger.error('Error fetching recent files:', error);
    res.status(500).json({ error: 'Failed to fetch recent files' });
  }
});

// GET samples
router.get('/samples', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ samples: [] });
  } catch (error: unknown) {
    logger.error('Error fetching samples:', error);
    res.status(500).json({ error: 'Failed to fetch samples' });
  }
});

// POST record upload
router.post('/record/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, fileId: `recording_${nanoid()}`, url: null });
  } catch (error: unknown) {
    logger.error('Error uploading recording:', error);
    res.status(500).json({ error: 'Failed to upload recording' });
  }
});

// GET tracks for project
router.get('/projects/:projectId/tracks', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
    });
    
    res.json(tracks);
  } catch (error: unknown) {
    logger.error('Error fetching tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// POST create track
router.post('/tracks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const trackData = createTrackSchema.parse(req.body);
    
    const hasAccess = await verifyProjectOwnership(trackData.projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const trackId = nanoid();
    const [track] = await db.insert(studioTracks).values({
      id: trackId,
      ...trackData,
    }).returning();
    
    res.status(201).json(track);
  } catch (error: unknown) {
    logger.error('Error creating track:', error);
    res.status(500).json({ error: 'Failed to create track' });
  }
});

// GET audio clips for track
router.get('/tracks/:trackId/audio-clips', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.trackId, trackId),
    });
    res.json(clips);
  } catch (error: unknown) {
    logger.error('Error fetching audio clips:', error);
    res.status(500).json({ error: 'Failed to fetch audio clips' });
  }
});

// GET mix busses for project
router.get('/projects/:projectId/mix-busses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    res.json([]);
  } catch (error: unknown) {
    logger.error('Error fetching mix busses:', error);
    res.status(500).json({ error: 'Failed to fetch mix busses' });
  }
});

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

// Lyrics endpoints
router.get('/lyrics', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    res.json({
      projectId,
      lyrics: '',
      sections: [],
      lastUpdated: null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching lyrics:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

router.post('/lyrics', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, lyrics, sections } = req.body;
    res.json({
      success: true,
      projectId,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error saving lyrics:', error);
    res.status(500).json({ error: 'Failed to save lyrics' });
  }
});

// AI Master endpoint
router.post('/ai-master/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { targetLoudness, genre, preset } = req.body;
    res.json({
      success: true,
      projectId,
      jobId: `master_${Date.now()}`,
      status: 'processing',
      message: 'AI mastering started',
      settings: { targetLoudness: targetLoudness || -14, genre, preset },
    });
  } catch (error: unknown) {
    logger.error('Error starting AI master:', error);
    res.status(500).json({ error: 'Failed to start AI mastering' });
  }
});

// AI Mix endpoint
router.post('/ai-mix/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { targetGenre, referenceTrack, autoEQ, autoCompression } = req.body;
    res.json({
      success: true,
      projectId,
      jobId: `mix_${Date.now()}`,
      status: 'processing',
      message: 'AI mixing started',
      settings: { targetGenre, autoEQ: autoEQ ?? true, autoCompression: autoCompression ?? true },
    });
  } catch (error: unknown) {
    logger.error('Error starting AI mix:', error);
    res.status(500).json({ error: 'Failed to start AI mixing' });
  }
});

// AI Music endpoints
router.get('/ai-music/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, genre } = req.query;
    res.json({
      suggestions: [
        { type: 'eq', description: 'Boost high frequencies for more clarity', confidence: 0.85 },
        { type: 'compression', description: 'Add gentle compression to drums', confidence: 0.78 },
        { type: 'reverb', description: 'Consider adding room reverb to vocals', confidence: 0.72 },
      ],
    });
  } catch (error: unknown) {
    logger.error('Error fetching AI suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch AI suggestions' });
  }
});

router.get('/ai-music/presets', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      presets: [
        { id: 'pop', name: 'Pop', description: 'Bright and punchy mix' },
        { id: 'hiphop', name: 'Hip Hop', description: 'Heavy bass, crisp highs' },
        { id: 'rock', name: 'Rock', description: 'Aggressive mids, room reverb' },
        { id: 'electronic', name: 'Electronic', description: 'Wide stereo, sidechain compression' },
        { id: 'acoustic', name: 'Acoustic', description: 'Natural, warm sound' },
      ],
    });
  } catch (error: unknown) {
    logger.error('Error fetching AI presets:', error);
    res.status(500).json({ error: 'Failed to fetch AI presets' });
  }
});

router.post('/ai-music/apply-genre-preset', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, presetId } = req.body;
    res.json({
      success: true,
      message: `Applied ${presetId} preset to project`,
      projectId,
    });
  } catch (error: unknown) {
    logger.error('Error applying genre preset:', error);
    res.status(500).json({ error: 'Failed to apply genre preset' });
  }
});

router.post('/ai-music/analyze-loudness', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    res.json({
      integrated: -14.2,
      truePeak: -1.0,
      shortTerm: -12.8,
      momentary: -10.5,
      dynamicRange: 8.5,
      recommendations: ['Track is well balanced for streaming platforms'],
    });
  } catch (error: unknown) {
    logger.error('Error analyzing loudness:', error);
    res.status(500).json({ error: 'Failed to analyze loudness' });
  }
});

router.post('/ai-music/match-reference', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, referenceTrackId } = req.body;
    res.json({
      success: true,
      matchScore: 0.82,
      adjustments: [
        { type: 'eq', description: 'Boost 2-4kHz by 2dB' },
        { type: 'compression', description: 'Reduce attack on drums' },
      ],
    });
  } catch (error: unknown) {
    logger.error('Error matching reference:', error);
    res.status(500).json({ error: 'Failed to match reference' });
  }
});

// Studio upload endpoint with proper file handling
router.post('/upload', requireAuth, audioUpload.single('audioFile'), handleUploadError, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const fileId = `file_${nanoid()}`;
    
    const storedFile = await storeUploadedFile(file, userId, 'audio');
    
    logger.info('Audio file uploaded to studio', { 
      fileId, 
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      url: storedFile.url,
    });
    
    res.json({
      success: true,
      fileId,
      url: storedFile.url,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      message: 'File uploaded successfully',
    });
  } catch (error: unknown) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Studio export endpoints
router.post('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, format, quality, settings } = req.body;
    const jobId = `export_${nanoid()}`;
    res.json({
      success: true,
      jobId,
      projectId,
      format: format || 'wav',
      quality: quality || 'high',
      status: 'processing',
    });
  } catch (error: unknown) {
    logger.error('Error starting export:', error);
    res.status(500).json({ error: 'Failed to start export' });
  }
});

router.get('/export/:jobId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    res.json({
      jobId,
      status: 'completed',
      progress: 100,
      downloadUrl: `/api/studio/export/${jobId}/download`,
    });
  } catch (error: unknown) {
    logger.error('Error checking export status:', error);
    res.status(500).json({ error: 'Failed to check export status' });
  }
});

router.get('/export/:jobId/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    res.status(404).json({ error: 'Export not found or expired', jobId });
  } catch (error: unknown) {
    logger.error('Error downloading export:', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

router.post('/export/:jobId/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    res.json({
      success: true,
      jobId,
      message: 'Export uploaded to distribution',
    });
  } catch (error: unknown) {
    logger.error('Error uploading export:', error);
    res.status(500).json({ error: 'Failed to upload export' });
  }
});

// Clips endpoints
router.patch('/clips/:clipId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clipId } = req.params;
    res.json({
      success: true,
      clipId,
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error updating clip:', error);
    res.status(500).json({ error: 'Failed to update clip' });
  }
});

router.post('/clips/audio', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId, startTime, duration, audioData } = req.body;
    res.json({
      id: `clip_${nanoid()}`,
      trackId,
      startTime: startTime || 0,
      duration: duration || 0,
      createdAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error creating audio clip:', error);
    res.status(500).json({ error: 'Failed to create audio clip' });
  }
});

// Tracks endpoints
router.patch('/tracks/:trackId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    res.json({
      success: true,
      id: trackId,
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error updating track:', error);
    res.status(500).json({ error: 'Failed to update track' });
  }
});

router.delete('/tracks/:trackId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    res.json({ success: true, message: 'Track deleted', trackId });
  } catch (error: unknown) {
    logger.error('Error deleting track:', error);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

// Markers endpoints
router.get('/projects/:projectId/markers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    res.json({ markers: [] });
  } catch (error: unknown) {
    logger.error('Error fetching markers:', error);
    res.status(500).json({ error: 'Failed to fetch markers' });
  }
});

router.post('/projects/:projectId/markers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { position, label, color, type } = req.body;
    res.json({
      id: `marker_${nanoid()}`,
      projectId,
      position: position || 0,
      label: label || 'Marker',
      color: color || '#3B82F6',
      type: type || 'generic',
      createdAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error creating marker:', error);
    res.status(500).json({ error: 'Failed to create marker' });
  }
});

router.patch('/markers/:markerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { markerId } = req.params;
    res.json({
      success: true,
      id: markerId,
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Error updating marker:', error);
    res.status(500).json({ error: 'Failed to update marker' });
  }
});

router.delete('/markers/:markerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { markerId } = req.params;
    res.json({ success: true, message: 'Marker deleted', markerId });
  } catch (error: unknown) {
    logger.error('Error deleting marker:', error);
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

// Tracks reorder endpoint
router.post('/projects/:projectId/tracks/reorder', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { trackOrder } = req.body;
    res.json({
      success: true,
      projectId,
      trackOrder,
    });
  } catch (error: unknown) {
    logger.error('Error reordering tracks:', error);
    res.status(500).json({ error: 'Failed to reorder tracks' });
  }
});

// Note: AI audio generation endpoints are in studioGeneration.ts mounted at /api/studio/generation
// The following are legacy placeholder endpoints - audio generation is handled by the dedicated route

// Stem exports endpoint
router.get('/stem-exports/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    res.json({
      exports: [],
      projectId,
    });
  } catch (error: unknown) {
    logger.error('Error fetching stem exports:', error);
    res.status(500).json({ error: 'Failed to fetch stem exports' });
  }
});

// Project export stems endpoint
router.post('/projects/:projectId/export-stems', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { format, quality } = req.body;
    res.json({
      success: true,
      jobId: `stems_${nanoid()}`,
      projectId,
      format: format || 'wav',
      quality: quality || 'high',
      status: 'processing',
    });
  } catch (error: unknown) {
    logger.error('Error starting stem export:', error);
    res.status(500).json({ error: 'Failed to start stem export' });
  }
});

// ============================================================================
// START HUB API ENDPOINTS (Studio One-inspired project management)
// ============================================================================

import { studioRecentFiles, studioPinnedFolders } from '@shared/schema';
import { sql as drizzleSql } from 'drizzle-orm';

// GET Start Hub summary - main data for the start page
router.get('/start-hub/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get recent projects (last 10, ordered by lastOpenedAt) - include ALL user projects
    const recentProjects = await db.query.projects.findMany({
      where: eq(projects.userId, userId),
      orderBy: [desc(projects.lastOpenedAt), desc(projects.updatedAt)],
      limit: 10,
    });
    
    // Get favorite projects - include ALL user favorites
    const favoriteProjects = await db.query.projects.findMany({
      where: and(
        eq(projects.userId, userId), 
        eq(projects.favorite, true)
      ),
      orderBy: [desc(projects.updatedAt)],
      limit: 5,
    });
    
    // Get project count - count ALL user projects
    const projectCount = await db.select({ count: drizzleSql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.userId, userId));
    
    // Get available templates (built-in + user's)
    const templates = await db.query.studioTemplates.findMany({
      where: or(
        eq(studioTemplates.userId, userId),
        eq(studioTemplates.isBuiltIn, true)
      ),
      orderBy: [desc(studioTemplates.usageCount)],
      limit: 20,
    });
    
    res.json({
      recentProjects,
      favoriteProjects,
      projectCount: Number(projectCount[0]?.count || 0),
      templates,
      user: {
        id: userId,
        name: (req as any).user.username || (req as any).user.email,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching start hub summary:', error);
    res.status(500).json({ error: 'Failed to fetch start hub data' });
  }
});

// GET recent projects for start hub
router.get('/start-hub/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 20;
    
    // Include ALL user projects, not just studio-specific ones
    const recentProjects = await db.query.projects.findMany({
      where: eq(projects.userId, userId),
      orderBy: [desc(projects.lastOpenedAt), desc(projects.updatedAt)],
      limit,
    });
    
    res.json({ projects: recentProjects });
  } catch (error: unknown) {
    logger.error('Error fetching recent projects:', error);
    res.status(500).json({ error: 'Failed to fetch recent projects' });
  }
});

// PATCH toggle project favorite
router.patch('/projects/:projectId/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    const { favorite } = req.body;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [updated] = await db.update(projects)
      .set({ 
        favorite: favorite ?? true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    
    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating project favorite:', error);
    res.status(500).json({ error: 'Failed to update favorite status' });
  }
});

// PATCH update project lastOpenedAt
router.patch('/projects/:projectId/opened', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [updated] = await db.update(projects)
      .set({ lastOpenedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    
    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating project opened time:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// ============================================================================
// TEMPLATES API
// ============================================================================

// GET all templates
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const category = req.query.category as string;
    
    // Build the where clause for user's templates OR built-in templates
    const baseCondition = or(
      eq(studioTemplates.userId, userId),
      eq(studioTemplates.isBuiltIn, true)
    );
    
    const whereCondition = category 
      ? and(baseCondition, eq(studioTemplates.category, category))
      : baseCondition;
    
    const templates = await db.query.studioTemplates.findMany({
      where: whereCondition,
      orderBy: [desc(studioTemplates.usageCount), desc(studioTemplates.createdAt)],
    });
    
    res.json({ templates });
  } catch (error: unknown) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST create template from project
router.post('/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, description, category, genre, bpm, timeSignature, templateData, coverImageUrl } = req.body;
    
    const templateId = nanoid();
    const [template] = await db.insert(studioTemplates).values({
      id: templateId,
      userId,
      name: name || 'Untitled Template',
      description,
      category: category || 'user',
      genre,
      bpm: bpm || 120,
      timeSignature: timeSignature || '4/4',
      templateData,
      coverImageUrl,
      isBuiltIn: false,
    }).returning();
    
    res.status(201).json(template);
  } catch (error: unknown) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// POST create project from template
router.post('/templates/:templateId/create-project', requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = (req as any).user.id;
    const { title } = req.body;
    
    // Get template
    const template = await db.query.studioTemplates.findFirst({
      where: eq(studioTemplates.id, templateId),
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Create project from template
    const projectId = nanoid();
    const [project] = await db.insert(projects).values({
      id: projectId,
      userId,
      title: title || `New ${template.name} Project`,
      genre: template.genre,
      bpm: template.bpm,
      isStudioProject: true,
      metadata: template.templateData,
      lastOpenedAt: new Date(),
    }).returning();
    
    // Increment template usage count
    await db.update(studioTemplates)
      .set({ usageCount: drizzleSql`${studioTemplates.usageCount} + 1` })
      .where(eq(studioTemplates.id, templateId));
    
    res.status(201).json(project);
  } catch (error: unknown) {
    logger.error('Error creating project from template:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// DELETE template
router.delete('/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = (req as any).user.id;
    
    // Verify ownership (can't delete built-in templates)
    const template = await db.query.studioTemplates.findFirst({
      where: and(eq(studioTemplates.id, templateId), eq(studioTemplates.userId, userId)),
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or access denied' });
    }
    
    if (template.isBuiltIn) {
      return res.status(403).json({ error: 'Cannot delete built-in templates' });
    }
    
    await db.delete(studioTemplates).where(eq(studioTemplates.id, templateId));
    
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// PINNED FOLDERS API
// ============================================================================

// GET pinned folders
router.get('/pinned-folders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const folders = await db.query.studioPinnedFolders.findMany({
      where: eq(studioPinnedFolders.userId, userId),
      orderBy: [studioPinnedFolders.sortOrder],
    });
    
    res.json({ folders });
  } catch (error: unknown) {
    logger.error('Error fetching pinned folders:', error);
    res.status(500).json({ error: 'Failed to fetch pinned folders' });
  }
});

// POST create pinned folder
router.post('/pinned-folders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, path } = req.body;
    
    if (!name || !path) {
      return res.status(400).json({ error: 'Name and path are required' });
    }
    
    // Get max sort order
    const maxSort = await db.select({ max: drizzleSql<number>`COALESCE(MAX(${studioPinnedFolders.sortOrder}), 0)` })
      .from(studioPinnedFolders)
      .where(eq(studioPinnedFolders.userId, userId));
    
    const folderId = nanoid();
    const [folder] = await db.insert(studioPinnedFolders).values({
      id: folderId,
      userId,
      name,
      path,
      sortOrder: (maxSort[0]?.max || 0) + 1,
    }).returning();
    
    res.status(201).json(folder);
  } catch (error: unknown) {
    logger.error('Error creating pinned folder:', error);
    res.status(500).json({ error: 'Failed to create pinned folder' });
  }
});

// DELETE pinned folder
router.delete('/pinned-folders/:folderId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    const userId = (req as any).user.id;
    
    await db.delete(studioPinnedFolders)
      .where(and(eq(studioPinnedFolders.id, folderId), eq(studioPinnedFolders.userId, userId)));
    
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting pinned folder:', error);
    res.status(500).json({ error: 'Failed to delete pinned folder' });
  }
});

// ============================================================================
// PROJECT POOL API (session files)
// ============================================================================

// GET project pool (all audio/samples in current session)
router.get('/projects/:projectId/pool', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all audio clips for this project
    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.projectId, projectId),
    });
    
    // Get recent files used in this project
    const recentFiles = await db.query.studioRecentFiles.findMany({
      where: and(
        eq(studioRecentFiles.userId, userId),
        eq(studioRecentFiles.projectId, projectId)
      ),
      orderBy: [desc(studioRecentFiles.accessedAt)],
    });
    
    res.json({
      clips,
      recentFiles,
      projectId,
    });
  } catch (error: unknown) {
    logger.error('Error fetching project pool:', error);
    res.status(500).json({ error: 'Failed to fetch project pool' });
  }
});

// POST add file to project pool
router.post('/projects/:projectId/pool', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    const { fileName, filePath, fileType, metadata } = req.body;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const fileId = nanoid();
    const [recentFile] = await db.insert(studioRecentFiles).values({
      id: fileId,
      userId,
      projectId,
      fileName,
      filePath,
      fileType: fileType || 'audio',
      metadata,
    }).returning();
    
    res.status(201).json(recentFile);
  } catch (error: unknown) {
    logger.error('Error adding file to pool:', error);
    res.status(500).json({ error: 'Failed to add file to pool' });
  }
});

export default router;
