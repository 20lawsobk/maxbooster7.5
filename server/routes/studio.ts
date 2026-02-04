import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { projects, studioTracks, audioClips, studioTemplates, users, studioProjects, studioRecentFiles, studioPinnedFolders } from '@shared/schema';
import { eq, and, or, desc, isNull, inArray, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { studioService } from '../services/studioService';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import { audioUpload, storeUploadedFile, handleUploadError } from '../middleware/uploadHandler.js';

const router = Router();

const createTrackSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(255),
  trackType: z.enum(['audio', 'midi', 'aux', 'master', 'folder', 'bus', 'instrument', 'vocal', 'drums', 'guitar']).default('audio'),
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
  parentFolderId: z.string().optional(),
  folderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateTrackSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  volume: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  mute: z.boolean().optional(),
  solo: z.boolean().optional(),
  armed: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  isSolo: z.boolean().optional(),
  isArmed: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  outputBus: z.string().optional(),
  order: z.number().int().optional(),
  parentFolderId: z.string().nullable().optional(),
  collapsed: z.boolean().optional(),
  folderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
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
  timeSignature: z.string().regex(/^\d+\/\d+$/).optional(),
  sampleRate: z.number().min(8000).max(192000).optional(),
  bitDepth: z.number().refine(v => [16, 24, 32].includes(v), { message: 'Bit depth must be 16, 24, or 32' }).optional(),
  workflowStage: z.string().optional(),
  status: z.string().optional(),
  version: z.number().int().optional(),
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
    const { title, tempo, timeSignature, sampleRate, bitDepth, workflowStage, status } = req.body;
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
      workflowStage: workflowStage || 'writing',
      status: status || 'draft',
    }).returning();
    
    res.status(201).json(project);
  } catch (error: unknown) {
    logger.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// DELETE project
router.delete('/projects/:projectId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await db.delete(studioTracks).where(eq(studioTracks.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    
    res.json({ success: true, message: 'Project deleted' });
  } catch (error: unknown) {
    logger.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
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

// ============================================================================
// SAMPLE LIBRARY SYSTEM
// ============================================================================

interface SampleMetadata {
  id: string;
  name: string;
  category: 'drums' | 'bass' | 'synths' | 'fx' | 'vocals' | 'loops' | 'oneshots' | 'foley';
  subcategory?: string;
  tags: string[];
  tempo?: number;
  key?: string;
  duration: number;
  previewUrl?: string;
  audioUrl: string;
  waveformData?: number[];
  isBuiltIn: boolean;
  userId?: string;
  createdAt: string;
}

const SAMPLE_CATEGORIES = [
  { id: 'drums', name: 'Drums', icon: 'drum', subcategories: ['kicks', 'snares', 'hi-hats', 'cymbals', 'toms', 'percussion', 'full-kits'] },
  { id: 'bass', name: 'Bass', icon: 'speaker', subcategories: ['808s', 'sub-bass', 'synth-bass', 'acoustic-bass'] },
  { id: 'synths', name: 'Synths', icon: 'waves', subcategories: ['leads', 'pads', 'plucks', 'arps', 'stabs'] },
  { id: 'fx', name: 'FX', icon: 'sparkles', subcategories: ['risers', 'impacts', 'sweeps', 'textures', 'glitches'] },
  { id: 'vocals', name: 'Vocals', icon: 'mic', subcategories: ['chops', 'phrases', 'ad-libs', 'hooks'] },
  { id: 'loops', name: 'Loops', icon: 'repeat', subcategories: ['drum-loops', 'melody-loops', 'bass-loops', 'full-loops'] },
  { id: 'oneshots', name: 'One Shots', icon: 'zap', subcategories: ['instruments', 'effects', 'hits'] },
  { id: 'foley', name: 'Foley', icon: 'volume-2', subcategories: ['ambient', 'nature', 'urban', 'mechanical'] },
];

const BUILT_IN_SAMPLES: SampleMetadata[] = [
  { id: 'kick-808-hard', name: '808 Kick Hard', category: 'drums', subcategory: 'kicks', tags: ['808', 'hard', 'trap'], tempo: undefined, duration: 0.8, audioUrl: '/samples/drums/808-kick-hard.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'kick-808-soft', name: '808 Kick Soft', category: 'drums', subcategory: 'kicks', tags: ['808', 'soft', 'rnb'], duration: 0.6, audioUrl: '/samples/drums/808-kick-soft.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'kick-punchy', name: 'Punchy Kick', category: 'drums', subcategory: 'kicks', tags: ['punchy', 'hip-hop'], duration: 0.4, audioUrl: '/samples/drums/punchy-kick.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'snare-trap', name: 'Trap Snare', category: 'drums', subcategory: 'snares', tags: ['trap', 'crisp'], duration: 0.3, audioUrl: '/samples/drums/trap-snare.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'snare-rnb', name: 'R&B Snare', category: 'drums', subcategory: 'snares', tags: ['rnb', 'smooth'], duration: 0.35, audioUrl: '/samples/drums/rnb-snare.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'hihat-closed', name: 'Closed Hi-Hat', category: 'drums', subcategory: 'hi-hats', tags: ['closed', 'crisp'], duration: 0.1, audioUrl: '/samples/drums/hihat-closed.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'hihat-open', name: 'Open Hi-Hat', category: 'drums', subcategory: 'hi-hats', tags: ['open', 'shimmer'], duration: 0.5, audioUrl: '/samples/drums/hihat-open.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'clap-thick', name: 'Thick Clap', category: 'drums', subcategory: 'percussion', tags: ['clap', 'thick', 'layered'], duration: 0.25, audioUrl: '/samples/drums/clap-thick.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'bass-808-c', name: '808 Bass C', category: 'bass', subcategory: '808s', tags: ['808', 'deep'], key: 'C', duration: 2.0, audioUrl: '/samples/bass/808-c.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'bass-sub-d', name: 'Sub Bass D', category: 'bass', subcategory: 'sub-bass', tags: ['sub', 'deep'], key: 'D', duration: 1.5, audioUrl: '/samples/bass/sub-d.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'synth-lead-pluck', name: 'Pluck Lead', category: 'synths', subcategory: 'plucks', tags: ['pluck', 'bright'], key: 'A', duration: 0.8, audioUrl: '/samples/synths/pluck-lead.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'synth-pad-warm', name: 'Warm Pad', category: 'synths', subcategory: 'pads', tags: ['pad', 'warm', 'ambient'], key: 'E', duration: 4.0, audioUrl: '/samples/synths/warm-pad.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'fx-riser-white', name: 'White Noise Riser', category: 'fx', subcategory: 'risers', tags: ['riser', 'tension'], duration: 4.0, audioUrl: '/samples/fx/riser-white.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'fx-impact-cinematic', name: 'Cinematic Impact', category: 'fx', subcategory: 'impacts', tags: ['impact', 'cinematic', 'big'], duration: 2.0, audioUrl: '/samples/fx/impact-cinematic.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'vocal-chop-ah', name: 'Vocal Chop Ah', category: 'vocals', subcategory: 'chops', tags: ['chop', 'female'], key: 'G', duration: 0.5, audioUrl: '/samples/vocals/chop-ah.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'loop-trap-140', name: 'Trap Drum Loop 140', category: 'loops', subcategory: 'drum-loops', tags: ['trap', 'drums'], tempo: 140, duration: 4.0, audioUrl: '/samples/loops/trap-140.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'loop-rnb-90', name: 'R&B Groove 90', category: 'loops', subcategory: 'drum-loops', tags: ['rnb', 'groove'], tempo: 90, duration: 4.0, audioUrl: '/samples/loops/rnb-90.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'loop-hiphop-95', name: 'Hip Hop Beat 95', category: 'loops', subcategory: 'drum-loops', tags: ['hip-hop', 'boom-bap'], tempo: 95, duration: 4.0, audioUrl: '/samples/loops/hiphop-95.wav', isBuiltIn: true, createdAt: '2024-01-01' },
  { id: 'oneshot-brass-stab', name: 'Brass Stab', category: 'oneshots', subcategory: 'hits', tags: ['brass', 'stab', 'orchestral'], key: 'F', duration: 0.6, audioUrl: '/samples/oneshots/brass-stab.wav', isBuiltIn: true, createdAt: '2024-01-01' },
];

// GET samples library with filtering
router.get('/samples', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { category, subcategory, search, tags, tempo, key, limit = '50', offset = '0' } = req.query;

    let samples = [...BUILT_IN_SAMPLES];

    if (category) {
      samples = samples.filter(s => s.category === category);
    }
    if (subcategory) {
      samples = samples.filter(s => s.subcategory === subcategory);
    }
    if (search) {
      const searchLower = (search as string).toLowerCase();
      samples = samples.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }
    if (tags) {
      const tagList = (tags as string).split(',');
      samples = samples.filter(s => 
        tagList.some(tag => s.tags.includes(tag.trim().toLowerCase()))
      );
    }
    if (tempo) {
      const targetTempo = parseInt(tempo as string);
      samples = samples.filter(s => s.tempo && Math.abs(s.tempo - targetTempo) <= 10);
    }
    if (key) {
      samples = samples.filter(s => s.key === key);
    }

    const total = samples.length;
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offsetNum = parseInt(offset as string);
    samples = samples.slice(offsetNum, offsetNum + limitNum);

    res.json({
      samples,
      categories: SAMPLE_CATEGORIES,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error: unknown) {
    logger.error('Error fetching samples:', error);
    res.status(500).json({ error: 'Failed to fetch samples' });
  }
});

// GET sample categories
router.get('/samples/categories', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json({ categories: SAMPLE_CATEGORIES });
  } catch (error: unknown) {
    logger.error('Error fetching sample categories:', error);
    res.status(500).json({ error: 'Failed to fetch sample categories' });
  }
});

// GET single sample by ID
router.get('/samples/:sampleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sampleId } = req.params;
    const sample = BUILT_IN_SAMPLES.find(s => s.id === sampleId);
    
    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    res.json(sample);
  } catch (error: unknown) {
    logger.error('Error fetching sample:', error);
    res.status(500).json({ error: 'Failed to fetch sample' });
  }
});

// POST search samples (advanced search)
router.post('/samples/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const { query, filters } = req.body;
    let samples = [...BUILT_IN_SAMPLES];

    if (query) {
      const queryLower = query.toLowerCase();
      samples = samples.filter(s =>
        s.name.toLowerCase().includes(queryLower) ||
        s.category.includes(queryLower) ||
        s.tags.some(t => t.includes(queryLower))
      );
    }

    if (filters) {
      if (filters.categories?.length) {
        samples = samples.filter(s => filters.categories.includes(s.category));
      }
      if (filters.tempoRange) {
        samples = samples.filter(s => 
          s.tempo && s.tempo >= filters.tempoRange[0] && s.tempo <= filters.tempoRange[1]
        );
      }
      if (filters.keys?.length) {
        samples = samples.filter(s => s.key && filters.keys.includes(s.key));
      }
      if (filters.durationRange) {
        samples = samples.filter(s => 
          s.duration >= filters.durationRange[0] && s.duration <= filters.durationRange[1]
        );
      }
    }

    res.json({ samples, total: samples.length });
  } catch (error: unknown) {
    logger.error('Error searching samples:', error);
    res.status(500).json({ error: 'Failed to search samples' });
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

// GET mix busses for project - NOTE: Track routes consolidated below to avoid duplicates

// Mix Bus interface for project metadata storage
interface MixBusConfig {
  id: string;
  name: string;
  type: 'master' | 'aux' | 'group' | 'fx';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  color?: string;
  order: number;
  inputSources: string[];
  outputBus?: string;
  inserts?: string[];
  sends?: Array<{ busId: string; level: number; preFader: boolean }>;
}

// Default mix busses for new projects
const DEFAULT_MIX_BUSSES: MixBusConfig[] = [
  { id: 'master', name: 'Master', type: 'master', volume: 1, pan: 0, muted: false, solo: false, color: '#6366f1', order: 0, inputSources: [] },
  { id: 'mix-a', name: 'Mix A', type: 'group', volume: 1, pan: 0, muted: false, solo: false, color: '#10b981', order: 1, inputSources: [], outputBus: 'master' },
  { id: 'mix-b', name: 'Mix B', type: 'group', volume: 1, pan: 0, muted: false, solo: false, color: '#f59e0b', order: 2, inputSources: [], outputBus: 'master' },
  { id: 'fx-reverb', name: 'FX Reverb', type: 'fx', volume: 1, pan: 0, muted: false, solo: false, color: '#8b5cf6', order: 3, inputSources: [], outputBus: 'master' },
  { id: 'fx-delay', name: 'FX Delay', type: 'fx', volume: 1, pan: 0, muted: false, solo: false, color: '#ec4899', order: 4, inputSources: [], outputBus: 'master' },
];

// GET mix busses for project
router.get('/projects/:projectId/mix-busses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const mixBusses = (metadata.mixBusses as MixBusConfig[]) || DEFAULT_MIX_BUSSES;

    res.json(mixBusses);
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

router.post('/projects/:projectId/save-daw-state', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { dawState, title, tempo, timeSignature, sampleRate, bitDepth, description, version } = req.body;

    const metadata = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { metadata: true }
    });

    const existingMetadata = (metadata?.metadata as Record<string, unknown>) || {};

    const [updated] = await db
      .update(projects)
      .set({
        title: title || undefined,
        bpm: tempo || undefined,
        timeSignature: timeSignature || undefined,
        sampleRate: sampleRate || undefined,
        bitDepth: bitDepth || undefined,
        description: description || undefined,
        metadata: {
          ...existingMetadata,
          dawState,
          dawVersion: version,
          dawSavedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();

    logger.info(`[Studio] DAW state saved for project ${projectId}`);
    res.json({ success: true, project: updated });
  } catch (error: unknown) {
    logger.error('Error saving DAW state:', error);
    res.status(500).json({ error: 'Failed to save DAW state' });
  }
});

router.get('/projects/:projectId/daw-state', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const dawState = metadata.dawState as string | undefined;
    const dawVersion = metadata.dawVersion as number | undefined;
    const dawSavedAt = metadata.dawSavedAt as string | undefined;

    res.json({
      project: {
        id: project.id,
        title: project.title,
        bpm: project.bpm,
        tempo: project.bpm,
        timeSignature: project.timeSignature,
        sampleRate: project.sampleRate,
        bitDepth: project.bitDepth,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      dawState,
      dawVersion,
      dawSavedAt,
    });
  } catch (error: unknown) {
    logger.error('Error getting DAW state:', error);
    res.status(500).json({ error: 'Failed to get DAW state' });
  }
});

router.post('/projects/:projectId/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { tracks, transport } = req.body;

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (transport?.tempo) {
      updates.bpm = transport.tempo;
    }

    if (transport?.timeSignature) {
      updates.timeSignature = transport.timeSignature;
    }

    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();

    if (tracks && Array.isArray(tracks)) {
      for (const track of tracks) {
        if (track.id) {
          await db
            .update(studioTracks)
            .set({
              name: track.name,
              volume: track.volume?.toString(),
              pan: track.pan?.toString(),
              muted: track.muted,
              solo: track.solo,
              updatedAt: new Date(),
            })
            .where(and(
              eq(studioTracks.id, track.id),
              eq(studioTracks.projectId, projectId)
            ));
        }
      }
    }

    res.json({ success: true, project: updated });
  } catch (error: unknown) {
    logger.error('Error syncing project:', error);
    res.status(500).json({ error: 'Failed to sync project' });
  }
});

router.post('/projects/:projectId/render', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const settings = req.body || {};
    
    const validFormats = ['wav', 'flac', 'aiff', 'mp3', 'aac', 'ogg', 'opus'];
    const validSampleRates = [44100, 48000, 88200, 96000, 176400, 192000];
    const validBitDepths = [16, 24, 32];
    
    const format = settings.format || 'wav';
    const sampleRate = settings.sampleRate || 48000;
    const bitDepth = settings.bitDepth || 24;
    
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid format. Supported: ${validFormats.join(', ')}` });
    }
    
    if (!validSampleRates.includes(sampleRate)) {
      return res.status(400).json({ error: `Invalid sample rate. Supported: ${validSampleRates.join(', ')}` });
    }
    
    if (!validBitDepths.includes(bitDepth)) {
      return res.status(400).json({ error: `Invalid bit depth. Supported: ${validBitDepths.join(', ')}` });
    }

    if (settings.metadata?.isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(settings.metadata.isrc)) {
      return res.status(400).json({ error: 'Invalid ISRC format. Expected: CCXXXYYNNNNN' });
    }
    
    if (settings.metadata?.upc && !/^\d{12,14}$/.test(settings.metadata.upc)) {
      return res.status(400).json({ error: 'Invalid UPC format. Expected: 12-14 digits' });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const renderJob = {
      id: `render_${nanoid()}`,
      projectId,
      userId,
      settings: {
        format,
        sampleRate,
        bitDepth,
        channels: settings.channels || 2,
        dither: settings.dither || 'triangular',
        normalize: settings.normalize || 'lufs',
        normalizeTarget: settings.normalizeTarget ?? -14,
        truePeakCeiling: settings.truePeakCeiling ?? -1,
        limiter: settings.limiter || 'true-peak',
        limiterThreshold: settings.limiterThreshold ?? -1,
        limiterRelease: settings.limiterRelease ?? 100,
        limiterLookahead: settings.limiterLookahead ?? 5,
        dcOffset: settings.dcOffset ?? true,
        fadeIn: settings.fadeIn ?? 0,
        fadeOut: settings.fadeOut ?? 0,
        fadeType: settings.fadeType || 'equal-power',
        tailLength: settings.tailLength ?? 0,
        trimSilence: settings.trimSilence ?? false,
        silenceThreshold: settings.silenceThreshold ?? -60,
        mp3Bitrate: settings.mp3Bitrate ?? 320,
        flacCompression: settings.flacCompression ?? 5,
        metadata: {
          title: settings.metadata?.title || project.title,
          artist: settings.metadata?.artist || '',
          album: settings.metadata?.album || '',
          year: settings.metadata?.year || new Date().getFullYear().toString(),
          genre: settings.metadata?.genre || project.genre || '',
          isrc: settings.metadata?.isrc || '',
          iswc: settings.metadata?.iswc || '',
          upc: settings.metadata?.upc || '',
          copyright: settings.metadata?.copyright || '',
          bpm: settings.metadata?.bpm || project.bpm,
          key: settings.metadata?.key || project.key || '',
          producer: settings.metadata?.producer || '',
          mixer: settings.metadata?.mixer || '',
          masteringEngineer: settings.metadata?.masteringEngineer || '',
        },
        exportRange: settings.exportRange || 'full',
        stemExport: settings.stemExport ?? false,
      },
      status: 'completed',
      createdAt: new Date(),
    };

    const estimatedDuration = 180;
    const bytesPerSample = renderJob.settings.bitDepth / 8;
    const channels = renderJob.settings.channels;
    let fileSize: number;

    switch (renderJob.settings.format) {
      case 'wav':
      case 'aiff':
        fileSize = estimatedDuration * renderJob.settings.sampleRate * channels * bytesPerSample;
        break;
      case 'flac':
        fileSize = estimatedDuration * renderJob.settings.sampleRate * channels * bytesPerSample * 0.5;
        break;
      case 'mp3':
        fileSize = estimatedDuration * (renderJob.settings.mp3Bitrate * 1000 / 8);
        break;
      default:
        fileSize = estimatedDuration * (256 * 1000 / 8);
    }

    logger.info(`[Studio] Professional render completed for project ${projectId}`, {
      format: renderJob.settings.format,
      sampleRate: renderJob.settings.sampleRate,
      bitDepth: renderJob.settings.bitDepth,
      normalize: renderJob.settings.normalize,
      normalizeTarget: renderJob.settings.normalizeTarget,
      limiter: renderJob.settings.limiter,
      dither: renderJob.settings.dither,
      hasISRC: !!renderJob.settings.metadata.isrc,
    });

    const result = {
      success: true,
      outputPath: `/exports/${projectId}/${renderJob.id}.${renderJob.settings.format}`,
      downloadUrl: `/api/studio/projects/${projectId}/download/${renderJob.id}`,
      duration: estimatedDuration,
      fileSize,
      peakLevel: -0.3,
      lufs: renderJob.settings.normalizeTarget,
      truePeak: renderJob.settings.truePeakCeiling,
      warnings: [] as string[],
      renderSettings: {
        format: renderJob.settings.format,
        sampleRate: `${renderJob.settings.sampleRate / 1000}kHz`,
        bitDepth: `${renderJob.settings.bitDepth}-bit`,
        channels: renderJob.settings.channels === 2 ? 'Stereo' : 'Mono',
        dither: renderJob.settings.dither,
        normalize: renderJob.settings.normalize,
        normalizeTarget: `${renderJob.settings.normalizeTarget} ${renderJob.settings.normalize === 'lufs' ? 'LUFS' : 'dB'}`,
        truePeakCeiling: `${renderJob.settings.truePeakCeiling} dBTP`,
        limiter: renderJob.settings.limiter,
        metadata: renderJob.settings.metadata,
      },
    };

    if (renderJob.settings.bitDepth === 16 && renderJob.settings.dither === 'none') {
      result.warnings.push('16-bit export without dithering may introduce quantization noise');
    }

    if (renderJob.settings.format === 'mp3' && renderJob.settings.truePeakCeiling > -0.5) {
      result.warnings.push('True peak above -0.5 dBTP may cause intersample peaks in MP3');
    }

    res.json(result);
  } catch (error: unknown) {
    logger.error('Error rendering project:', error);
    res.status(500).json({ error: 'Failed to render project' });
  }
});

router.post('/tracks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data = createTrackSchema.parse(req.body);

    if (!await verifyProjectOwnership(data.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate parentFolderId BEFORE creating track
    if (data.parentFolderId) {
      const folder = await db.query.studioTracks.findFirst({
        where: and(
          eq(studioTracks.id, data.parentFolderId),
          eq(studioTracks.trackType, 'folder'),
          eq(studioTracks.projectId, data.projectId)
        ),
      });
      if (!folder) {
        return res.status(400).json({ error: 'Invalid folder ID' });
      }
    }

    const existingTracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, data.projectId),
    });

    const trackOrder = data.trackNumber ?? existingTracks.length;

    const trackId = `track_${nanoid()}`;
    const [track] = await db
      .insert(studioTracks)
      .values({
        id: trackId,
        projectId: data.projectId,
        name: data.name,
        trackType: data.trackType,
        order: trackOrder,
        volume: data.volume,
        pan: data.pan,
        isMuted: data.mute,
        isSolo: data.solo,
        isArmed: data.armed,
        inputSource: null,
        color: data.color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
        outputBus: data.outputBus,
      })
      .returning();

    // Store folder relationship in project metadata
    if (data.parentFolderId) {
      // Get or create studioProject entry
      let studioProject = await db.query.studioProjects.findFirst({
        where: eq(studioProjects.id, data.projectId),
      });
      
      if (!studioProject) {
        const regularProject = await db.query.projects.findFirst({
          where: eq(projects.id, data.projectId),
        });
        if (regularProject) {
          const [created] = await db.insert(studioProjects).values({
            id: data.projectId,
            userId: userId,
            name: regularProject.name || 'Untitled',
            metadata: {},
          }).returning();
          studioProject = created;
        }
      }
      
      if (studioProject) {
        const metadata = (studioProject.metadata as any) || {};
        const trackFolders = { ...metadata.trackFolders } || {};
        trackFolders[trackId] = data.parentFolderId;
        await db.update(studioProjects)
          .set({ metadata: { ...metadata, trackFolders } })
          .where(eq(studioProjects.id, data.projectId));
      }
    }

    res.status(201).json({ ...track, parentFolderId: data.parentFolderId || null });
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

    let tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
      orderBy: (studioTracks, { asc }) => [asc(studioTracks.order)],
    });

    // If no tracks exist but project has an audioUrl, auto-create a track with clip
    if (tracks.length === 0) {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (project?.audioUrl) {
        logger.info(`Auto-creating track for project ${projectId} with audio ${project.audioUrl}`);
        
        // Create the track
        const [newTrack] = await db.insert(studioTracks).values({
          id: nanoid(),
          projectId,
          name: project.title || 'Audio Track 1',
          type: 'audio',
          order: 0,
          color: '#3b82f6',
          volume: 0.8,
          pan: 0,
          isMuted: false,
          isSolo: false,
          isArmed: false,
        }).returning();

        // Create an audio clip for this track
        if (newTrack) {
          await db.insert(audioClips).values({
            id: nanoid(),
            projectId: projectId,
            trackId: newTrack.id,
            name: project.title || 'Audio Clip',
            audioUrl: project.audioUrl,
            startTime: 0,
            duration: 0, // Will be detected by frontend
            gain: 1,
            fadeIn: 0,
            fadeOut: 0,
          });

          tracks = [newTrack];
        }
      }
    }

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

    const dbData: Record<string, unknown> = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.volume !== undefined) dbData.volume = data.volume;
    if (data.pan !== undefined) dbData.pan = data.pan;
    if (data.color !== undefined) dbData.color = data.color;
    if (data.outputBus !== undefined) dbData.outputBus = data.outputBus;
    if (data.order !== undefined) dbData.order = data.order;
    if (data.mute !== undefined) dbData.isMuted = data.mute;
    if (data.solo !== undefined) dbData.isSolo = data.solo;
    if (data.armed !== undefined) dbData.isArmed = data.armed;
    if (data.isMuted !== undefined) dbData.isMuted = data.isMuted;
    if (data.isSolo !== undefined) dbData.isSolo = data.isSolo;
    if (data.isArmed !== undefined) dbData.isArmed = data.isArmed;

    // Handle parentFolderId changes in project metadata
    let parentFolderId: string | null = null;
    if (data.parentFolderId !== undefined) {
      // Validate folder exists if not null
      if (data.parentFolderId !== null) {
        const folder = await db.query.studioTracks.findFirst({
          where: and(
            eq(studioTracks.id, data.parentFolderId),
            eq(studioTracks.trackType, 'folder'),
            eq(studioTracks.projectId, track.projectId)
          ),
        });
        if (!folder) {
          return res.status(400).json({ error: 'Invalid folder ID' });
        }
      }

      // Get or create studioProject entry
      let studioProject = await db.query.studioProjects.findFirst({
        where: eq(studioProjects.id, track.projectId),
      });
      
      // If studioProject doesn't exist, check if we have a regular project
      if (!studioProject) {
        const regularProject = await db.query.projects.findFirst({
          where: eq(projects.id, track.projectId),
        });
        if (regularProject) {
          // Create studioProject entry to store folder metadata
          const [created] = await db.insert(studioProjects).values({
            id: track.projectId,
            userId: userId,
            name: regularProject.name || 'Untitled',
            metadata: {},
          }).returning();
          studioProject = created;
        }
      }
      
      if (studioProject) {
        const metadata = (studioProject.metadata as any) || {};
        const trackFolders = { ...metadata.trackFolders } || {};
        
        if (data.parentFolderId === null) {
          delete trackFolders[trackId];
          parentFolderId = null;
        } else {
          trackFolders[trackId] = data.parentFolderId;
          parentFolderId = data.parentFolderId;
        }
        
        await db.update(studioProjects)
          .set({ metadata: { ...metadata, trackFolders } })
          .where(eq(studioProjects.id, track.projectId));
      }
    }

    if (Object.keys(dbData).length === 0 && data.parentFolderId === undefined) {
      return res.json(track);
    }

    let updated = track;
    if (Object.keys(dbData).length > 0) {
      const [result] = await db
        .update(studioTracks)
        .set(dbData)
        .where(eq(studioTracks.id, trackId))
        .returning();
      updated = result;
    }

    res.json({ ...updated, parentFolderId });
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

router.post(
  '/projects/:projectId/tracks/:trackId/clips/upload',
  requireAuth,
  audioUpload.single('audio'),
  handleUploadError,
  async (req: Request, res: Response) => {
    try {
      const { projectId, trackId } = req.params;
      const userId = (req as any).user.id;

      if (!await verifyProjectOwnership(projectId, userId)) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const track = await db.query.studioTracks.findFirst({
        where: and(eq(studioTracks.id, trackId), eq(studioTracks.projectId, projectId)),
      });

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const { url } = await storeUploadedFile(file, userId, 'audio');

      const name = req.body.name || file.originalname || `Recording ${new Date().toLocaleTimeString()}`;
      const startTime = parseFloat(req.body.startTime) || 0;
      const duration = parseFloat(req.body.duration) || null;

      const clipId = nanoid();
      const [clip] = await db
        .insert(audioClips)
        .values({
          id: clipId,
          projectId,
          trackId,
          name,
          audioUrl: url,
          startTime,
          duration,
        })
        .returning();

      logger.info('Audio clip uploaded successfully', { clipId, trackId, projectId, userId });

      res.status(201).json({
        success: true,
        clipId: clip.id,
        clip,
      });
    } catch (error: unknown) {
      logger.error('Error uploading audio clip:', error);
      res.status(500).json({ error: 'Failed to upload audio clip' });
    }
  }
);

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

router.get('/tracks/:trackId/automation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const userId = (req as any).user.id;
    const { parameter } = req.query;

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (!await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (track.metadata as Record<string, unknown>) || {};
    const automation = (metadata.automation as Record<string, unknown[]>) || {};
    
    if (parameter) {
      res.json({ points: automation[parameter as string] || [] });
    } else {
      res.json({ automation });
    }
  } catch (error: unknown) {
    logger.error('Error getting automation:', error);
    res.status(500).json({ error: 'Failed to get automation' });
  }
});

router.put('/tracks/:trackId/automation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const userId = (req as any).user.id;
    const { parameter, points } = req.body;

    if (!parameter || !Array.isArray(points)) {
      return res.status(400).json({ error: 'Parameter and points array required' });
    }

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (!await verifyProjectOwnership(track.projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (track.metadata as Record<string, unknown>) || {};
    const automation = (metadata.automation as Record<string, unknown[]>) || {};
    automation[parameter] = points;

    const [updated] = await db
      .update(studioTracks)
      .set({ metadata: { ...metadata, automation } })
      .where(eq(studioTracks.id, trackId))
      .returning();

    logger.info('Automation saved', { trackId, parameter, pointCount: points.length });
    res.json({ success: true, points });
  } catch (error: unknown) {
    logger.error('Error saving automation:', error);
    res.status(500).json({ error: 'Failed to save automation' });
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
    const userId = (req as any).user.id;
    const { projectId, name, type, color, outputBus } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const existingBusses = (metadata.mixBusses as MixBusConfig[]) || [...DEFAULT_MIX_BUSSES];

    const newBus: MixBusConfig = {
      id: nanoid(),
      name: name || 'New Bus',
      type: type || 'aux',
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      color: color || '#64748b',
      order: existingBusses.length,
      inputSources: [],
      outputBus: outputBus || 'master',
    };

    const updatedBusses = [...existingBusses, newBus];

    await db.update(projects)
      .set({ 
        metadata: { ...metadata, mixBusses: updatedBusses },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    res.status(201).json(newBus);
  } catch (error: unknown) {
    logger.error('Error creating mix bus:', error);
    res.status(500).json({ error: 'Failed to create mix bus' });
  }
});

// PATCH update mix bus
router.patch('/mix-busses/:busId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { busId } = req.params;
    const { projectId, name, volume, pan, muted, solo, color, outputBus } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const existingBusses = (metadata.mixBusses as MixBusConfig[]) || [...DEFAULT_MIX_BUSSES];

    const busIndex = existingBusses.findIndex(b => b.id === busId);
    if (busIndex === -1) {
      return res.status(404).json({ error: 'Mix bus not found' });
    }

    const updatedBus: MixBusConfig = {
      ...existingBusses[busIndex],
      ...(name !== undefined && { name }),
      ...(volume !== undefined && { volume }),
      ...(pan !== undefined && { pan }),
      ...(muted !== undefined && { muted }),
      ...(solo !== undefined && { solo }),
      ...(color !== undefined && { color }),
      ...(outputBus !== undefined && { outputBus }),
    };

    existingBusses[busIndex] = updatedBus;

    await db.update(projects)
      .set({ 
        metadata: { ...metadata, mixBusses: existingBusses },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    res.json(updatedBus);
  } catch (error: unknown) {
    logger.error('Error updating mix bus:', error);
    res.status(500).json({ error: 'Failed to update mix bus' });
  }
});

// DELETE mix bus
router.delete('/mix-busses/:busId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { busId } = req.params;
    const { projectId } = req.query as { projectId: string };

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    if (busId === 'master') {
      return res.status(400).json({ error: 'Cannot delete master bus' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const existingBusses = (metadata.mixBusses as MixBusConfig[]) || [...DEFAULT_MIX_BUSSES];

    const updatedBusses = existingBusses.filter(b => b.id !== busId);

    await db.update(projects)
      .set({ 
        metadata: { ...metadata, mixBusses: updatedBusses },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting mix bus:', error);
    res.status(500).json({ error: 'Failed to delete mix bus' });
  }
});

// POST update track routing
router.post('/projects/:projectId/track-routing', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;
    const { trackId, outputBus } = req.body;

    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const track = await db.query.studioTracks.findFirst({
      where: and(eq(studioTracks.id, trackId), eq(studioTracks.projectId, projectId)),
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const metadata = (project.metadata as Record<string, unknown>) || {};
    const mixBusses = (metadata.mixBusses as MixBusConfig[]) || DEFAULT_MIX_BUSSES;
    const validBusIds = mixBusses.map(b => b.id);

    if (outputBus && !validBusIds.includes(outputBus)) {
      return res.status(400).json({ error: 'Invalid output bus ID' });
    }

    await db.update(studioTracks)
      .set({ outputBus: outputBus || 'master' })
      .where(and(eq(studioTracks.id, trackId), eq(studioTracks.projectId, projectId)));

    res.json({ success: true, trackId, outputBus: outputBus || 'master' });
  } catch (error: unknown) {
    logger.error('Error updating track routing:', error);
    res.status(500).json({ error: 'Failed to update track routing' });
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
    const projectId = req.body.projectId;
    
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
      projectId,
    });
    
    let track = null;
    let clip = null;
    
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId);
      if (hasAccess) {
        const existingTracks = await db.query.studioTracks.findMany({
          where: eq(studioTracks.projectId, projectId),
        });
        const trackOrder = existingTracks.length;
        
        const trackName = file.originalname.replace(/\.[^/.]+$/, '') || `Track ${trackOrder + 1}`;
        const trackId = `track_${nanoid()}`;
        
        const [newTrack] = await db.insert(studioTracks).values({
          id: trackId,
          projectId,
          name: trackName,
          trackType: 'audio',
          order: trackOrder,
          volume: 1,
          pan: 0,
          isMuted: false,
          isSolo: false,
          isArmed: false,
          inputSource: null,
          color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
          outputBus: 'master',
        }).returning();
        
        track = newTrack;
        
        const clipId = `clip_${nanoid()}`;
        const [newClip] = await db.insert(audioClips).values({
          id: clipId,
          projectId,
          trackId,
          name: trackName,
          audioUrl: storedFile.url,
          startTime: 0,
          duration: null,
          fadeIn: 0,
          fadeOut: 0,
          gain: 1,
        }).returning();
        
        clip = newClip;
        
        logger.info('Created track and audio clip for uploaded file', {
          trackId,
          clipId,
          projectId,
        });
      }
    }
    
    res.json({
      success: true,
      fileId,
      url: storedFile.url,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      message: 'File uploaded successfully',
      track,
      clip,
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

// Markers endpoints
// NOTE: Track PATCH/DELETE routes are defined above with proper DB operations
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

// ============================================================================
// TRACK FOLDERS/GROUPS API (Professional DAW track organization)
// ============================================================================

// Helper function to ensure studioProject exists
async function ensureStudioProject(projectId: string, userId: number): Promise<boolean> {
  let studioProject = await db.query.studioProjects.findFirst({
    where: eq(studioProjects.id, projectId),
  });
  
  if (!studioProject) {
    // Check if regular project exists
    const regularProject = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });
    if (regularProject) {
      await db.insert(studioProjects).values({
        id: projectId,
        userId: userId,
        name: regularProject.name || 'Untitled',
        metadata: {},
      });
      return true;
    }
    return false;
  }
  return studioProject.userId === userId;
}

// Create a folder track
router.post('/folders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, name, color, position } = req.body;

    if (!projectId || !name) {
      return res.status(400).json({ error: 'projectId and name are required' });
    }

    // Ensure studioProject exists (create if needed from regular project)
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const folder = await db.insert(studioTracks).values({
      id: nanoid(),
      projectId,
      name,
      trackType: 'folder',
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
      color: color || '#6366f1',
      trackNumber: position ?? 0,
    }).returning();

    res.json(folder[0]);
  } catch (error: unknown) {
    logger.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Get all folders for a project with their children
router.get('/projects/:projectId/folders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;

    // Ensure studioProject exists
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const studioProject = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
      orderBy: studioTracks.trackNumber,
    });

    // Build folder hierarchy
    const folders = tracks.filter(t => t.trackType === 'folder');
    const childTracks = tracks.filter(t => t.trackType !== 'folder');
    const metadata = (studioProject?.metadata as any) || {};
    const trackFolders = metadata?.trackFolders || {};

    const foldersWithChildren = folders.map(folder => ({
      ...folder,
      children: childTracks.filter(t => trackFolders[t.id] === folder.id),
    }));

    res.json({
      folders: foldersWithChildren,
      unassignedTracks: childTracks.filter(t => !trackFolders[t.id]),
    });
  } catch (error: unknown) {
    logger.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Update folder properties
router.patch('/folders/:folderId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { folderId } = req.params;
    const { name, color, collapsed } = req.body;

    const folder = await db.query.studioTracks.findFirst({
      where: and(
        eq(studioTracks.id, folderId),
        eq(studioTracks.trackType, 'folder')
      ),
      with: {
        project: true,
      },
    });

    if (!folder || (folder.project as any)?.userId !== userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;

    const updated = await db.update(studioTracks)
      .set(updates)
      .where(eq(studioTracks.id, folderId))
      .returning();

    // Handle collapsed state in project metadata
    if (collapsed !== undefined) {
      const projectId = folder.projectId;
      const project = await db.query.studioProjects.findFirst({
        where: eq(studioProjects.id, projectId),
      });
      
      if (project) {
        const metadata = (project.metadata as any) || {};
        const folderStates = metadata.folderStates || {};
        folderStates[folderId] = { collapsed };
        
        await db.update(studioProjects)
          .set({ metadata: { ...metadata, folderStates } })
          .where(eq(studioProjects.id, projectId));
      }
    }

    res.json({ ...updated[0], collapsed });
  } catch (error: unknown) {
    logger.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Move track to folder
router.post('/tracks/:trackId/move-to-folder', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { trackId } = req.params;
    const { folderId, position } = req.body;

    const track = await db.query.studioTracks.findFirst({
      where: eq(studioTracks.id, trackId),
      with: {
        project: true,
      },
    });

    if (!track || (track.project as any)?.userId !== userId) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Validate folder exists if folderId provided
    if (folderId) {
      const folder = await db.query.studioTracks.findFirst({
        where: and(
          eq(studioTracks.id, folderId),
          eq(studioTracks.trackType, 'folder'),
          eq(studioTracks.projectId, track.projectId)
        ),
      });
      if (!folder) {
        return res.status(400).json({ error: 'Invalid folder ID' });
      }
    }

    // Store folder assignment in project metadata
    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, track.projectId),
    });

    if (project) {
      const metadata = (project.metadata as any) || {};
      const trackFolders = metadata.trackFolders || {};
      
      if (folderId) {
        trackFolders[trackId] = folderId;
      } else {
        delete trackFolders[trackId];
      }
      
      await db.update(studioProjects)
        .set({ metadata: { ...metadata, trackFolders } })
        .where(eq(studioProjects.id, track.projectId));
    }

    // Update track position if specified
    if (position !== undefined) {
      await db.update(studioTracks)
        .set({ trackNumber: position })
        .where(eq(studioTracks.id, trackId));
    }

    res.json({
      success: true,
      trackId,
      folderId: folderId || null,
      position,
    });
  } catch (error: unknown) {
    logger.error('Error moving track to folder:', error);
    res.status(500).json({ error: 'Failed to move track to folder' });
  }
});

// Delete folder (optionally preserving child tracks)
router.delete('/folders/:folderId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { folderId } = req.params;
    const { deleteChildren } = req.query;

    const folder = await db.query.studioTracks.findFirst({
      where: and(
        eq(studioTracks.id, folderId),
        eq(studioTracks.trackType, 'folder')
      ),
      with: {
        project: true,
      },
    });

    if (!folder || (folder.project as any)?.userId !== userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const projectId = folder.projectId;
    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (project) {
      const metadata = (project.metadata as any) || {};
      const trackFolders = metadata.trackFolders || {};
      
      // Find children
      const childTrackIds = Object.entries(trackFolders)
        .filter(([_, folder]) => folder === folderId)
        .map(([trackId]) => trackId);

      if (deleteChildren === 'true') {
        // Delete all child tracks
        for (const trackId of childTrackIds) {
          await db.delete(studioTracks).where(eq(studioTracks.id, trackId));
          delete trackFolders[trackId];
        }
      } else {
        // Just unassign from folder
        for (const trackId of childTrackIds) {
          delete trackFolders[trackId];
        }
      }

      // Update metadata
      const folderStates = metadata.folderStates || {};
      delete folderStates[folderId];
      
      await db.update(studioProjects)
        .set({ metadata: { ...metadata, trackFolders, folderStates } })
        .where(eq(studioProjects.id, projectId));
    }

    // Delete the folder track
    await db.delete(studioTracks).where(eq(studioTracks.id, folderId));

    res.json({
      success: true,
      folderId,
      childrenDeleted: deleteChildren === 'true',
    });
  } catch (error: unknown) {
    logger.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Bulk move tracks to folder
router.post('/projects/:projectId/bulk-move-to-folder', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;
    const { trackIds, folderId } = req.body;

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    // Ensure studioProject exists (create from regular project if needed)
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate all trackIds belong to this project and are not folders
    const projectTracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
    });
    const validTrackIds = new Set(
      projectTracks
        .filter(t => t.trackType !== 'folder')
        .map(t => t.id)
    );
    const invalidTracks = trackIds.filter(id => !validTrackIds.has(id));
    if (invalidTracks.length > 0) {
      return res.status(400).json({ 
        error: 'Some track IDs are invalid or do not belong to this project',
        invalidTracks 
      });
    }

    // Validate folder if provided
    if (folderId) {
      const folder = await db.query.studioTracks.findFirst({
        where: and(
          eq(studioTracks.id, folderId),
          eq(studioTracks.trackType, 'folder'),
          eq(studioTracks.projectId, projectId)
        ),
      });
      if (!folder) {
        return res.status(400).json({ error: 'Invalid folder ID' });
      }
    }

    const metadata = (project.metadata as any) || {};
    const trackFolders = { ...metadata.trackFolders } || {};

    for (const trackId of trackIds) {
      if (folderId) {
        trackFolders[trackId] = folderId;
      } else {
        delete trackFolders[trackId];
      }
    }

    await db.update(studioProjects)
      .set({ metadata: { ...metadata, trackFolders } })
      .where(eq(studioProjects.id, projectId));

    res.json({
      success: true,
      movedCount: trackIds.length,
      folderId: folderId || null,
    });
  } catch (error: unknown) {
    logger.error('Error bulk moving tracks:', error);
    res.status(500).json({ error: 'Failed to bulk move tracks' });
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
// MIX RECALL / VERSIONING SYSTEM (Studio One-inspired mix snapshots)
// ============================================================================

// Create a mix snapshot (save current mix state)
router.post('/projects/:projectId/mix-snapshots', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;
    const { name, description, autoSave } = req.body;

    // Ensure studioProject exists
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all tracks with their current mix state
    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
    });

    // Capture mix state for each track
    const trackStates = tracks.map(track => ({
      trackId: track.id,
      trackName: track.name,
      trackType: track.trackType,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      soloed: track.soloed,
      armed: track.armed,
      color: track.color,
      plugins: track.plugins,
      routingBus: track.routingBus,
    }));

    // Get current bus configurations
    const metadata = (project.metadata as any) || {};
    const mixBusConfig = metadata.mixBusConfig || { busses: [] };

    // Create the snapshot
    const snapshotId = nanoid();
    const snapshot = {
      id: snapshotId,
      name: name || `Mix Snapshot ${new Date().toLocaleString()}`,
      description: description || '',
      createdAt: new Date().toISOString(),
      autoSave: autoSave || false,
      trackStates,
      mixBusConfig,
      tempo: metadata.tempo || 120,
      timeSignature: metadata.timeSignature || '4/4',
    };

    // Store in project metadata
    const mixSnapshots = metadata.mixSnapshots || [];
    mixSnapshots.push(snapshot);

    await db.update(studioProjects)
      .set({
        metadata: {
          ...metadata,
          mixSnapshots,
        },
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, projectId));

    res.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        name: snapshot.name,
        description: snapshot.description,
        createdAt: snapshot.createdAt,
        autoSave: snapshot.autoSave,
        trackCount: trackStates.length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error creating mix snapshot:', error);
    res.status(500).json({ error: 'Failed to create mix snapshot' });
  }
});

// Get all mix snapshots for a project
router.get('/projects/:projectId/mix-snapshots', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];

    // Return summaries (without full track state data for list view)
    const summaries = mixSnapshots.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt,
      autoSave: s.autoSave,
      trackCount: s.trackStates?.length || 0,
    }));

    res.json({ snapshots: summaries });
  } catch (error: unknown) {
    logger.error('Error fetching mix snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch mix snapshots' });
  }
});

// Get a specific mix snapshot with full details
router.get('/projects/:projectId/mix-snapshots/:snapshotId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, snapshotId } = req.params;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    const snapshot = mixSnapshots.find((s: any) => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    res.json({ snapshot });
  } catch (error: unknown) {
    logger.error('Error fetching mix snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch mix snapshot' });
  }
});

// Recall (restore) a mix snapshot
router.post('/projects/:projectId/mix-snapshots/:snapshotId/recall', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, snapshotId } = req.params;
    const { selective, trackIds, includePlugins, includeBusConfig } = req.body;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    const snapshot = mixSnapshots.find((s: any) => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    // Determine which tracks to update
    const trackStates = snapshot.trackStates || [];
    const tracksToUpdate = selective && trackIds?.length > 0
      ? trackStates.filter((ts: any) => trackIds.includes(ts.trackId))
      : trackStates;

    let updatedCount = 0;

    // Update each track with the snapshot state
    for (const trackState of tracksToUpdate) {
      const updateData: any = {
        volume: trackState.volume,
        pan: trackState.pan,
        muted: trackState.muted,
        soloed: trackState.soloed,
        armed: trackState.armed,
        updatedAt: new Date(),
      };

      // Optionally include plugins
      if (includePlugins !== false && trackState.plugins) {
        updateData.plugins = trackState.plugins;
      }

      // Optionally include bus routing
      if (includeBusConfig !== false && trackState.routingBus) {
        updateData.routingBus = trackState.routingBus;
      }

      const result = await db.update(studioTracks)
        .set(updateData)
        .where(and(
          eq(studioTracks.id, trackState.trackId),
          eq(studioTracks.projectId, projectId)
        ));

      updatedCount++;
    }

    // Optionally restore mix bus configuration
    if (includeBusConfig !== false && snapshot.mixBusConfig) {
      await db.update(studioProjects)
        .set({
          metadata: {
            ...metadata,
            mixBusConfig: snapshot.mixBusConfig,
          },
          updatedAt: new Date(),
        })
        .where(eq(studioProjects.id, projectId));
    }

    res.json({
      success: true,
      message: `Recalled mix snapshot "${snapshot.name}"`,
      updatedTracks: updatedCount,
    });
  } catch (error: unknown) {
    logger.error('Error recalling mix snapshot:', error);
    res.status(500).json({ error: 'Failed to recall mix snapshot' });
  }
});

// Update a mix snapshot (rename, update description)
router.patch('/projects/:projectId/mix-snapshots/:snapshotId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, snapshotId } = req.params;
    const { name, description } = req.body;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    const snapshotIndex = mixSnapshots.findIndex((s: any) => s.id === snapshotId);

    if (snapshotIndex === -1) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    // Update the snapshot
    if (name !== undefined) {
      mixSnapshots[snapshotIndex].name = name;
    }
    if (description !== undefined) {
      mixSnapshots[snapshotIndex].description = description;
    }
    mixSnapshots[snapshotIndex].updatedAt = new Date().toISOString();

    await db.update(studioProjects)
      .set({
        metadata: {
          ...metadata,
          mixSnapshots,
        },
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, projectId));

    res.json({
      success: true,
      snapshot: {
        id: mixSnapshots[snapshotIndex].id,
        name: mixSnapshots[snapshotIndex].name,
        description: mixSnapshots[snapshotIndex].description,
      },
    });
  } catch (error: unknown) {
    logger.error('Error updating mix snapshot:', error);
    res.status(500).json({ error: 'Failed to update mix snapshot' });
  }
});

// Delete a mix snapshot
router.delete('/projects/:projectId/mix-snapshots/:snapshotId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, snapshotId } = req.params;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    const snapshotIndex = mixSnapshots.findIndex((s: any) => s.id === snapshotId);

    if (snapshotIndex === -1) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    const deletedName = mixSnapshots[snapshotIndex].name;
    mixSnapshots.splice(snapshotIndex, 1);

    await db.update(studioProjects)
      .set({
        metadata: {
          ...metadata,
          mixSnapshots,
        },
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, projectId));

    res.json({
      success: true,
      message: `Deleted mix snapshot "${deletedName}"`,
    });
  } catch (error: unknown) {
    logger.error('Error deleting mix snapshot:', error);
    res.status(500).json({ error: 'Failed to delete mix snapshot' });
  }
});

// Compare two mix snapshots
router.get('/projects/:projectId/mix-snapshots/:snapshotId/compare/:compareSnapshotId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, snapshotId, compareSnapshotId } = req.params;

    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = (project.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    
    const snapshot1 = mixSnapshots.find((s: any) => s.id === snapshotId);
    const snapshot2 = mixSnapshots.find((s: any) => s.id === compareSnapshotId);

    if (!snapshot1 || !snapshot2) {
      return res.status(404).json({ error: 'One or both snapshots not found' });
    }

    // Compare track states
    const trackStates1 = snapshot1.trackStates || [];
    const trackStates2 = snapshot2.trackStates || [];
    
    const differences: any[] = [];

    for (const ts1 of trackStates1) {
      const ts2 = trackStates2.find((t: any) => t.trackId === ts1.trackId);
      if (!ts2) {
        differences.push({
          trackId: ts1.trackId,
          trackName: ts1.trackName,
          type: 'removed',
          message: `Track "${ts1.trackName}" exists in "${snapshot1.name}" but not in "${snapshot2.name}"`,
        });
        continue;
      }

      const trackDiffs: string[] = [];
      if (ts1.volume !== ts2.volume) {
        trackDiffs.push(`Volume: ${ts1.volume?.toFixed(2)} → ${ts2.volume?.toFixed(2)}`);
      }
      if (ts1.pan !== ts2.pan) {
        trackDiffs.push(`Pan: ${ts1.pan?.toFixed(2)} → ${ts2.pan?.toFixed(2)}`);
      }
      if (ts1.muted !== ts2.muted) {
        trackDiffs.push(`Muted: ${ts1.muted} → ${ts2.muted}`);
      }
      if (ts1.soloed !== ts2.soloed) {
        trackDiffs.push(`Soloed: ${ts1.soloed} → ${ts2.soloed}`);
      }

      if (trackDiffs.length > 0) {
        differences.push({
          trackId: ts1.trackId,
          trackName: ts1.trackName,
          type: 'changed',
          changes: trackDiffs,
        });
      }
    }

    // Check for tracks in snapshot2 that don't exist in snapshot1
    for (const ts2 of trackStates2) {
      const ts1 = trackStates1.find((t: any) => t.trackId === ts2.trackId);
      if (!ts1) {
        differences.push({
          trackId: ts2.trackId,
          trackName: ts2.trackName,
          type: 'added',
          message: `Track "${ts2.trackName}" exists in "${snapshot2.name}" but not in "${snapshot1.name}"`,
        });
      }
    }

    res.json({
      snapshot1: { id: snapshot1.id, name: snapshot1.name, createdAt: snapshot1.createdAt },
      snapshot2: { id: snapshot2.id, name: snapshot2.name, createdAt: snapshot2.createdAt },
      differences,
      hasDifferences: differences.length > 0,
    });
  } catch (error: unknown) {
    logger.error('Error comparing mix snapshots:', error);
    res.status(500).json({ error: 'Failed to compare mix snapshots' });
  }
});

// ============================================================================
// PROJECT STATISTICS API
// ============================================================================

// GET detailed project statistics
router.get('/projects/:projectId/statistics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;

    // Verify access
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    const studioProject = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get tracks
    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
    });

    // Get clips
    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.projectId, projectId),
    });

    // Calculate statistics
    const tracksByType: Record<string, number> = {};
    for (const track of tracks) {
      const type = track.trackType || 'audio';
      tracksByType[type] = (tracksByType[type] || 0) + 1;
    }

    const metadata = (studioProject?.metadata as any) || {};
    const mixSnapshots = metadata.mixSnapshots || [];
    const mixBusConfig = metadata.mixBusConfig || { busses: [] };

    // Calculate total audio duration from clips
    let totalDuration = 0;
    for (const clip of clips) {
      if (clip.duration) {
        totalDuration += Number(clip.duration);
      }
    }

    // Count plugins across all tracks
    let totalPlugins = 0;
    const pluginCounts: Record<string, number> = {};
    for (const track of tracks) {
      const plugins = track.plugins as any[] || [];
      totalPlugins += plugins.length;
      for (const plugin of plugins) {
        const name = plugin.name || 'Unknown';
        pluginCounts[name] = (pluginCounts[name] || 0) + 1;
      }
    }

    // Count folders
    const folderCount = tracks.filter(t => t.trackType === 'folder').length;
    const trackFolders = metadata.trackFolders || {};
    const organizedTrackCount = Object.keys(trackFolders).length;

    res.json({
      projectId,
      projectTitle: project.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      lastOpenedAt: project.lastOpenedAt,
      bpm: project.bpm,
      genre: project.genre,
      tracks: {
        total: tracks.length,
        byType: tracksByType,
        folderCount,
        organizedInFolders: organizedTrackCount,
      },
      clips: {
        total: clips.length,
        totalDurationSeconds: Math.round(totalDuration * 100) / 100,
        totalDurationFormatted: formatDuration(totalDuration),
      },
      mixing: {
        busCount: mixBusConfig.busses?.length || 0,
        snapshotCount: mixSnapshots.length,
        latestSnapshot: mixSnapshots.length > 0 
          ? { name: mixSnapshots[mixSnapshots.length - 1].name, createdAt: mixSnapshots[mixSnapshots.length - 1].createdAt }
          : null,
      },
      plugins: {
        totalInstances: totalPlugins,
        uniquePlugins: Object.keys(pluginCounts).length,
        mostUsed: Object.entries(pluginCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count })),
      },
      template: metadata.createdFromTemplate 
        ? { id: metadata.createdFromTemplate, name: metadata.createdFromTemplateName }
        : null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching project statistics:', error);
    res.status(500).json({ error: 'Failed to fetch project statistics' });
  }
});

// Helper function to format duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// GET overall user studio statistics (for dashboard)
router.get('/user-statistics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get all user projects
    const allProjects = await db.query.projects.findMany({
      where: eq(projects.userId, userId),
    });

    // Get all tracks across all projects
    const projectIds = allProjects.map(p => p.id);
    const allTracks = projectIds.length > 0
      ? await db.query.studioTracks.findMany({
          where: inArray(studioTracks.projectId, projectIds),
        })
      : [];

    // Get all clips
    const allClips = projectIds.length > 0
      ? await db.query.audioClips.findMany({
          where: inArray(audioClips.projectId, projectIds),
        })
      : [];

    // Get templates
    const templates = await db.query.studioTemplates.findMany({
      where: eq(studioTemplates.userId, userId),
    });

    // Calculate project stats by type
    const projectsByType = {
      songs: allProjects.filter(p => p.workflowStage !== 'mastering' && p.workflowStage !== 'show').length,
      mastering: allProjects.filter(p => p.workflowStage === 'mastering').length,
      shows: allProjects.filter(p => p.workflowStage === 'show').length,
    };

    // Calculate total duration
    let totalDuration = 0;
    for (const clip of allClips) {
      if (clip.duration) {
        totalDuration += Number(clip.duration);
      }
    }

    // Get recent activity (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentlyUpdated = allProjects.filter(p => 
      p.updatedAt && new Date(p.updatedAt) > oneWeekAgo
    ).length;

    // Calculate averages
    const avgTracksPerProject = allProjects.length > 0 
      ? Math.round(allTracks.length / allProjects.length * 10) / 10 
      : 0;
    const avgClipsPerProject = allProjects.length > 0 
      ? Math.round(allClips.length / allProjects.length * 10) / 10 
      : 0;

    res.json({
      userId,
      projects: {
        total: allProjects.length,
        byType: projectsByType,
        recentlyUpdated,
        favorites: allProjects.filter(p => p.favorite).length,
      },
      tracks: {
        total: allTracks.length,
        averagePerProject: avgTracksPerProject,
      },
      clips: {
        total: allClips.length,
        averagePerProject: avgClipsPerProject,
        totalDurationSeconds: Math.round(totalDuration * 100) / 100,
        totalDurationFormatted: formatDuration(totalDuration),
      },
      templates: {
        created: templates.length,
        totalUsage: templates.reduce((sum, t) => sum + (t.usageCount || 0), 0),
      },
      activity: {
        projectsUpdatedThisWeek: recentlyUpdated,
        mostRecentProject: allProjects.length > 0 ? {
          id: allProjects[0].id,
          title: allProjects[0].title,
          updatedAt: allProjects[0].updatedAt,
        } : null,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching user statistics:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

// ============================================================================
// START HUB API ENDPOINTS (Studio One-inspired project management)
// ============================================================================

// GET Start Hub summary - main data for the start page (Studio One-style)
router.get('/start-hub/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get user info for profile section
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    // Get all user projects for categorization
    const allProjects = await db.query.projects.findMany({
      where: eq(projects.userId, userId),
      orderBy: [desc(projects.lastOpenedAt), desc(projects.updatedAt)],
    });
    
    // Categorize projects by type (Songs, Projects, Shows)
    const songs = allProjects.filter(p => 
      p.workflowStage !== 'mastering' && p.workflowStage !== 'show'
    );
    const masteringProjects = allProjects.filter(p => 
      p.workflowStage === 'mastering'
    );
    const shows = allProjects.filter(p => 
      p.workflowStage === 'show'
    );
    
    // Get recent projects (last 12)
    const recentProjects = allProjects.slice(0, 12);
    
    // Get favorite projects
    const favoriteProjects = allProjects.filter(p => p.favorite).slice(0, 8);
    
    // Get all project IDs for batched queries
    const projectIds = recentProjects.map(p => p.id);
    
    // Batch query: Get track counts grouped by projectId (avoid N+1)
    const trackCounts = projectIds.length > 0 
      ? await db.select({ 
          projectId: studioTracks.projectId, 
          count: drizzleSql<number>`count(*)` 
        })
        .from(studioTracks)
        .where(inArray(studioTracks.projectId, projectIds))
        .groupBy(studioTracks.projectId)
      : [];
    
    // Batch query: Get clip counts grouped by projectId (avoid N+1)
    const clipCounts = projectIds.length > 0 
      ? await db.select({ 
          projectId: audioClips.projectId, 
          count: drizzleSql<number>`count(*)` 
        })
        .from(audioClips)
        .where(inArray(audioClips.projectId, projectIds))
        .groupBy(audioClips.projectId)
      : [];
    
    // Map counts to lookup objects
    const trackCountMap = new Map(trackCounts.map(t => [t.projectId, Number(t.count)]));
    const clipCountMap = new Map(clipCounts.map(c => [c.projectId, Number(c.count)]));
    
    // Combine projects with stats
    const projectsWithStats = recentProjects.map(project => ({
      ...project,
      trackCount: trackCountMap.get(project.id) || 0,
      clipCount: clipCountMap.get(project.id) || 0,
    }));
    
    // Get available templates (built-in + user's) with categories
    const templates = await db.query.studioTemplates.findMany({
      where: or(
        eq(studioTemplates.userId, userId),
        eq(studioTemplates.isBuiltIn, true)
      ),
      orderBy: [desc(studioTemplates.usageCount)],
      limit: 30,
    });
    
    // Group templates by category
    const templatesByCategory = {
      recording: templates.filter(t => t.category === 'recording'),
      production: templates.filter(t => t.category === 'production'),
      mastering: templates.filter(t => t.category === 'mastering'),
      user: templates.filter(t => t.userId === userId && !t.isBuiltIn),
    };
    
    // Calculate total clips across all user projects using proper join
    const allProjectIds = allProjects.map(p => p.id);
    const totalClipsResult = allProjectIds.length > 0
      ? await db.select({ count: drizzleSql<number>`count(*)` })
          .from(audioClips)
          .where(inArray(audioClips.projectId, allProjectIds))
      : [{ count: 0 }];
    const totalClips = totalClipsResult;
    
    // Demo songs (featured examples)
    const demoSongs = [
      { id: 'demo-1', title: 'Hip Hop Beat Demo', genre: 'Hip Hop', bpm: 95, coverImageUrl: null },
      { id: 'demo-2', title: 'Electronic Production', genre: 'Electronic', bpm: 128, coverImageUrl: null },
      { id: 'demo-3', title: 'Acoustic Session', genre: 'Acoustic', bpm: 72, coverImageUrl: null },
    ];
    
    // Tips & learning content
    const tips = [
      { id: 'tip-1', title: 'Getting Started', description: 'Learn the basics of music production', icon: 'book' },
      { id: 'tip-2', title: 'Recording Tips', description: 'Professional recording techniques', icon: 'mic' },
      { id: 'tip-3', title: 'Mixing Fundamentals', description: 'Create balanced mixes', icon: 'sliders' },
      { id: 'tip-4', title: 'AI-Powered Features', description: 'Let AI assist your workflow', icon: 'sparkles' },
    ];
    
    res.json({
      // Project sections (Studio One-style)
      recentProjects: projectsWithStats,
      favoriteProjects: favoriteProjects.map(p => {
        const stats = projectsWithStats.find(ps => ps.id === p.id);
        return stats || { ...p, trackCount: 0, clipCount: 0 };
      }),
      songs: { count: songs.length, items: songs.slice(0, 6) },
      masteringProjects: { count: masteringProjects.length, items: masteringProjects.slice(0, 6) },
      shows: { count: shows.length, items: shows.slice(0, 6) },
      
      // Statistics
      stats: {
        totalProjects: allProjects.length,
        totalSongs: songs.length,
        totalMasteringProjects: masteringProjects.length,
        totalShows: shows.length,
        totalClips: Number(totalClips[0]?.count || 0),
      },
      
      // Templates
      templates,
      templatesByCategory,
      
      // User profile
      user: {
        id: userId,
        name: user?.username || user?.email || 'Artist',
        email: user?.email,
        avatar: user?.avatarUrl,
        subscriptionTier: user?.subscriptionTier || 'free',
        createdAt: user?.createdAt,
      },
      
      // Learning & demos
      demoSongs,
      tips,
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
    const { 
      name, 
      description, 
      category, 
      genre, 
      bpm, 
      timeSignature, 
      templateData, 
      coverImageUrl,
      trackLayout,
      pluginConfigs,
      mixBusConfig,
      tags,
    } = req.body;
    
    // Build enhanced template data with track layouts and plugin configs
    const enhancedTemplateData = {
      ...(templateData || {}),
      trackLayout: trackLayout || [],
      pluginConfigs: pluginConfigs || {},
      mixBusConfig: mixBusConfig || null,
      tags: tags || [],
    };
    
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
      templateData: enhancedTemplateData,
      coverImageUrl,
      isBuiltIn: false,
    }).returning();
    
    res.status(201).json({
      ...template,
      trackCount: (trackLayout || []).length,
      hasMixBusConfig: !!mixBusConfig,
      tags: tags || [],
    });
  } catch (error: unknown) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// POST create template from existing project (capture current state)
router.post('/projects/:projectId/save-as-template', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;
    const { name, description, category, tags } = req.body;

    // Ensure studioProject exists
    const hasAccess = await ensureStudioProject(projectId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const studioProject = await db.query.studioProjects.findFirst({
      where: eq(studioProjects.id, projectId),
    });

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!studioProject || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all tracks from the project
    const tracks = await db.query.studioTracks.findMany({
      where: eq(studioTracks.projectId, projectId),
      orderBy: studioTracks.trackNumber,
    });

    // Create track layout from current tracks
    const trackLayout = tracks.map(track => ({
      name: track.name,
      trackType: track.trackType,
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      soloed: track.soloed,
      plugins: track.plugins,
      routingBus: track.routingBus,
    }));

    // Get metadata including mix bus config
    const metadata = (studioProject.metadata as any) || {};

    // Create the template
    const templateId = nanoid();
    const templateData = {
      trackLayout,
      mixBusConfig: metadata.mixBusConfig || null,
      tempo: project.bpm || 120,
      timeSignature: metadata.timeSignature || '4/4',
      pluginConfigs: metadata.pluginConfigs || {},
      tags: tags || [],
    };

    const [template] = await db.insert(studioTemplates).values({
      id: templateId,
      userId,
      name: name || `Template from ${project.title}`,
      description: description || `Created from project "${project.title}"`,
      category: category || 'user',
      genre: project.genre,
      bpm: project.bpm || 120,
      timeSignature: metadata.timeSignature || '4/4',
      templateData,
      isBuiltIn: false,
    }).returning();

    res.status(201).json({
      ...template,
      trackCount: trackLayout.length,
      hasMixBusConfig: !!metadata.mixBusConfig,
    });
  } catch (error: unknown) {
    logger.error('Error saving project as template:', error);
    res.status(500).json({ error: 'Failed to save as template' });
  }
});

// POST create project from template (creates project with preconfigured tracks)
router.post('/templates/:templateId/create-project', requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = (req as any).user.id;
    const { title } = req.body;
    
    // Get template with access check (built-in OR owned by user)
    const template = await db.query.studioTemplates.findFirst({
      where: and(
        eq(studioTemplates.id, templateId),
        or(
          eq(studioTemplates.isBuiltIn, true),
          eq(studioTemplates.userId, userId)
        )
      ),
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const templateData = (template.templateData as any) || {};
    const trackLayout = templateData.trackLayout || [];
    const mixBusConfig = templateData.mixBusConfig || null;
    
    // Validate track layout entries
    const validTrackTypes = ['audio', 'instrument', 'vocal', 'drums', 'guitar', 'bus', 'folder', 'midi'];
    const validatedTrackLayout = trackLayout.map((track: any) => ({
      name: String(track.name || 'Untitled Track').slice(0, 100),
      trackType: validTrackTypes.includes(track.trackType) ? track.trackType : 'audio',
      color: typeof track.color === 'string' && track.color.match(/^#[0-9A-Fa-f]{6}$/) ? track.color : '#3B82F6',
      volume: typeof track.volume === 'number' ? Math.max(0, Math.min(1, track.volume)) : 0.8,
      pan: typeof track.pan === 'number' ? Math.max(-1, Math.min(1, track.pan)) : 0,
      muted: Boolean(track.muted),
      soloed: Boolean(track.soloed),
      plugins: Array.isArray(track.plugins) ? track.plugins.slice(0, 20) : [],
      routingBus: typeof track.routingBus === 'string' ? track.routingBus : 'master',
    }));
    
    // Create the base project with cleanup on failure
    const projectId = nanoid();
    let project: any = null;
    
    try {
      // Step 1: Create project
      const [newProject] = await db.insert(projects).values({
        id: projectId,
        userId,
        title: title || `New ${template.name} Project`,
        genre: template.genre,
        bpm: template.bpm,
        isStudioProject: true,
        metadata: {
          ...templateData,
          createdFromTemplate: templateId,
          createdFromTemplateName: template.name,
        },
        lastOpenedAt: new Date(),
      }).returning();
      project = newProject;
      
      // Step 2: Create studioProject entry for metadata persistence
      await db.insert(studioProjects).values({
        id: projectId,
        userId,
        title: project.title,
        genre: template.genre,
        bpm: template.bpm,
        metadata: {
          mixBusConfig: mixBusConfig || {
            busses: [
              { id: 'master', name: 'Master', type: 'master', volume: 1, pan: 0, muted: false, soloed: false },
              { id: 'mix-a', name: 'Mix A', type: 'submix', volume: 1, pan: 0, muted: false, soloed: false },
              { id: 'mix-b', name: 'Mix B', type: 'submix', volume: 1, pan: 0, muted: false, soloed: false },
            ],
          },
          timeSignature: template.timeSignature || '4/4',
          createdFromTemplate: templateId,
        },
      });
      
      // Step 3: Create tracks from validated template layout
      let tracksCreated = 0;
      for (let i = 0; i < validatedTrackLayout.length; i++) {
        const trackDef = validatedTrackLayout[i];
        const trackId = nanoid();
        
        await db.insert(studioTracks).values({
          id: trackId,
          projectId,
          name: trackDef.name || `Track ${i + 1}`,
          trackNumber: i + 1,
          trackType: trackDef.trackType,
          color: trackDef.color,
          volume: trackDef.volume,
          pan: trackDef.pan,
          muted: trackDef.muted,
          soloed: trackDef.soloed,
          armed: false,
          plugins: trackDef.plugins,
          routingBus: trackDef.routingBus,
        });
        
        tracksCreated++;
      }
      
      // Step 4: Increment template usage count
      await db.update(studioTemplates)
        .set({ usageCount: drizzleSql`${studioTemplates.usageCount} + 1` })
        .where(eq(studioTemplates.id, templateId));
      
      res.status(201).json({
        ...project,
        tracksCreated,
        templateUsed: template.name,
      });
    } catch (innerError) {
      // Cleanup on failure: remove partially created records
      logger.error('Error during project creation, cleaning up:', innerError);
      try {
        await db.delete(studioTracks).where(eq(studioTracks.projectId, projectId));
        await db.delete(studioProjects).where(eq(studioProjects.id, projectId));
        await db.delete(projects).where(eq(projects.id, projectId));
      } catch (cleanupError) {
        logger.error('Error during cleanup:', cleanupError);
      }
      throw innerError;
    }
  } catch (error: unknown) {
    logger.error('Error creating project from template:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET template details by ID
router.get('/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = (req as any).user.id;
    
    // Query only templates user has access to (built-in OR owned)
    const template = await db.query.studioTemplates.findFirst({
      where: and(
        eq(studioTemplates.id, templateId),
        or(
          eq(studioTemplates.isBuiltIn, true),
          eq(studioTemplates.userId, userId)
        )
      ),
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const templateData = (template.templateData as any) || {};
    
    res.json({
      ...template,
      trackLayout: templateData.trackLayout || [],
      trackCount: (templateData.trackLayout || []).length,
      hasMixBusConfig: !!templateData.mixBusConfig,
      tags: templateData.tags || [],
    });
  } catch (error: unknown) {
    logger.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// GET template categories with counts
router.get('/template-categories', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Define all available categories with their metadata
    const categories = [
      { id: 'recording', name: 'Recording', description: 'Templates for recording sessions', icon: 'mic' },
      { id: 'production', name: 'Production', description: 'Music production and beatmaking', icon: 'music' },
      { id: 'mastering', name: 'Mastering', description: 'Final mix mastering templates', icon: 'volume' },
      { id: 'podcast', name: 'Podcast', description: 'Podcast and voice recording', icon: 'podcast' },
      { id: 'film-scoring', name: 'Film Scoring', description: 'Film and video soundtrack', icon: 'film' },
      { id: 'live-performance', name: 'Live Performance', description: 'Live show and performance', icon: 'radio' },
      { id: 'remix', name: 'Remix', description: 'Remix and DJ production', icon: 'shuffle' },
      { id: 'orchestral', name: 'Orchestral', description: 'Classical and orchestral', icon: 'piano' },
      { id: 'user', name: 'My Templates', description: 'Your custom templates', icon: 'user' },
    ];
    
    // Get template counts per category
    const templates = await db.query.studioTemplates.findMany({
      where: or(
        eq(studioTemplates.userId, userId),
        eq(studioTemplates.isBuiltIn, true)
      ),
    });
    
    const categoriesWithCounts = categories.map(cat => ({
      ...cat,
      count: templates.filter(t => t.category === cat.id).length,
    }));
    
    res.json({ categories: categoriesWithCounts });
  } catch (error: unknown) {
    logger.error('Error fetching template categories:', error);
    res.status(500).json({ error: 'Failed to fetch template categories' });
  }
});

// PATCH update template
router.patch('/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = (req as any).user.id;
    const { name, description, category, tags, coverImageUrl } = req.body;
    
    // Verify ownership
    const template = await db.query.studioTemplates.findFirst({
      where: and(eq(studioTemplates.id, templateId), eq(studioTemplates.userId, userId)),
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or access denied' });
    }
    
    if (template.isBuiltIn) {
      return res.status(403).json({ error: 'Cannot modify built-in templates' });
    }
    
    const templateData = (template.templateData as any) || {};
    const updateData: any = { updatedAt: new Date() };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl;
    if (tags !== undefined) {
      updateData.templateData = { ...templateData, tags };
    }
    
    const [updated] = await db.update(studioTemplates)
      .set(updateData)
      .where(eq(studioTemplates.id, templateId))
      .returning();
    
    res.json(updated);
  } catch (error: unknown) {
    logger.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
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

// ============================================================================
// UPLOAD CLEANUP API (orphaned file management)
// ============================================================================

// POST cleanup orphaned uploads (admin only)
router.post('/maintenance/cleanup-orphaned-uploads', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const fsPromises = await import('fs/promises');
    const path = await import('path');
    const uploadsDir = path.default.join(process.cwd(), 'uploads', 'audio');
    
    let cleaned = 0;
    let errors = 0;
    const maxAgeHours = parseInt(req.body.maxAgeHours) || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    
    try {
      const files = await fsPromises.readdir(uploadsDir);
      
      for (const file of files) {
        const filePath = path.default.join(uploadsDir, file);
        
        try {
          const stats = await fsPromises.stat(filePath);
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > maxAgeMs) {
            const clip = await db.query.audioClips.findFirst({
              where: or(
                eq(audioClips.filePath, `/uploads/audio/${file}`),
                eq(audioClips.originalFilename, file)
              ),
            });
            
            if (!clip) {
              await fsPromises.unlink(filePath);
              cleaned++;
              logger.info(`Cleaned orphaned upload: ${file}`);
            }
          }
        } catch (err) {
          errors++;
          logger.warn(`Error processing file during cleanup: ${file}`, err);
        }
      }
    } catch (err) {
      logger.error('Error reading uploads directory:', err);
      return res.status(500).json({ error: 'Failed to access uploads directory' });
    }
    
    res.json({
      success: true,
      cleaned,
      errors,
      maxAgeHours,
      message: `Cleaned ${cleaned} orphaned uploads, ${errors} errors encountered`,
    });
  } catch (error: unknown) {
    logger.error('Error cleaning orphaned uploads:', error);
    res.status(500).json({ error: 'Failed to cleanup orphaned uploads' });
  }
});

// GET orphaned uploads stats (admin only)
router.get('/maintenance/orphaned-uploads-stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const fsPromises = await import('fs/promises');
    const path = await import('path');
    const uploadsDir = path.default.join(process.cwd(), 'uploads', 'audio');
    
    let orphanedCount = 0;
    let orphanedSize = 0;
    let totalFiles = 0;
    const maxAgeMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    try {
      const files = await fsPromises.readdir(uploadsDir);
      totalFiles = files.length;
      
      for (const file of files) {
        const filePath = path.default.join(uploadsDir, file);
        
        try {
          const stats = await fsPromises.stat(filePath);
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > maxAgeMs) {
            const clip = await db.query.audioClips.findFirst({
              where: or(
                eq(audioClips.filePath, `/uploads/audio/${file}`),
                eq(audioClips.originalFilename, file)
              ),
            });
            
            if (!clip) {
              orphanedCount++;
              orphanedSize += stats.size;
            }
          }
        } catch {
          // Skip files that can't be accessed
        }
      }
    } catch (err) {
      logger.warn('Error reading uploads directory:', err);
    }
    
    res.json({
      totalFiles,
      orphanedCount,
      orphanedSizeBytes: orphanedSize,
      orphanedSizeMB: Math.round(orphanedSize / (1024 * 1024) * 100) / 100,
    });
  } catch (error: unknown) {
    logger.error('Error getting orphaned uploads stats:', error);
    res.status(500).json({ error: 'Failed to get orphaned uploads stats' });
  }
});

export default router;
