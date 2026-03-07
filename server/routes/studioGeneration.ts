import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';
import { logger } from '../logger.js';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { generateFromText, generateFromReference } from '../services/aiAudioGeneratorService.js';
import { melodyPatternService, GenerationParams } from '../services/melodyPatternService';
import { db } from '../db.js';
import { studioSamples } from '../../shared/schema.js';

async function persistGeneratedSample(opts: {
  name: string;
  category: string;
  subcategory?: string;
  tags: string[];
  duration?: number;
  tempo?: number;
  key?: string;
  audioUrl: string;
  userId: string;
}) {
  try {
    await db.insert(studioSamples).values({
      id: `ai_${nanoid()}`,
      name: opts.name,
      category: opts.category,
      subcategory: opts.subcategory,
      tags: opts.tags,
      duration: opts.duration,
      tempo: opts.tempo,
      key: opts.key,
      audioUrl: opts.audioUrl,
      isBuiltIn: false,
      userId: opts.userId,
    });
  } catch (err) {
    logger.warn('[Studio Generation] Could not persist sample to library:', err);
  }
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

const textGenerationSchema = z.object({
  text: z.string().optional().default(''),
  projectId: z.string().optional(),
  duration: z.number().positive().optional(),
  bars: z.number().int().positive().optional(),
  instrumentType: z.string().optional(),
  instrumentCategory: z.enum(['melodic', 'drums', 'percussion']).optional(),
  genre: z.string().optional(),
  genreCategory: z.string().optional(),
  style: z.string().optional(),
  tempo: z.number().int().min(40).max(240).optional(),
  key: z.string().optional(),
  scale: z.string().optional(),
  complexity: z.number().min(0).max(1).optional(),
  swing: z.number().min(0).max(1).optional(),
  humanize: z.number().min(0).max(1).optional(),
});

const audioGenerationSchema = z.object({
  targetType: z.string().optional(),
  text: z.string().optional(),
  projectId: z.string().optional(),
  bars: z.number().int().positive().optional(),
});

router.post('/text', requireAuth, async (req, res) => {
  try {
    const validatedData = textGenerationSchema.parse(req.body);
    
    let userText = (validatedData.text || '').trim();
    
    if (validatedData.tempo) {
      userText = userText.replace(/\b\d+\s*bpm\b/gi, '').trim();
    }
    
    const textLower = userText.toLowerCase();
    const parts: string[] = [];
    
    if (validatedData.instrumentType) {
      const instrumentId = validatedData.instrumentType.toLowerCase();
      const friendlyName = instrumentId.replace(/_/g, ' ');
      if (!textLower.includes(friendlyName) && !textLower.includes(instrumentId)) {
        parts.push(friendlyName);
      }
    }
    if (validatedData.genre && !textLower.includes(validatedData.genre.toLowerCase())) {
      parts.push(validatedData.genre);
    }
    
    if (userText) {
      parts.push(userText);
    }
    
    if (validatedData.tempo) {
      parts.push(`at ${validatedData.tempo}bpm`);
    }
    if (validatedData.key && !textLower.includes(` ${validatedData.key.toLowerCase()} `) && !textLower.includes(`in ${validatedData.key.toLowerCase()}`)) {
      parts.push(`in ${validatedData.key}`);
    }
    if (validatedData.scale && !textLower.includes(validatedData.scale.toLowerCase())) {
      parts.push(validatedData.scale);
    }
    
    const enhancedText = parts.join(' ').trim() || 'drums trap';

    logger.info(`[Studio Generation] Text-to-audio request: "${enhancedText}"`);

    const result = await generateFromText({
      text: enhancedText,
      duration: validatedData.duration,
      bars: validatedData.bars,
      projectId: validatedData.projectId,
    });

    const userId = (req as any).user?.id || 'unknown';
    const category = validatedData.instrumentCategory === 'drums' ? 'drums'
      : validatedData.instrumentCategory === 'percussion' ? 'percussion'
      : validatedData.genre ? validatedData.genre.toLowerCase()
      : 'synths';
    const tags = [
      validatedData.genre, validatedData.instrumentType,
      validatedData.key, validatedData.scale,
    ].filter(Boolean) as string[];

    await persistGeneratedSample({
      name: `AI: ${enhancedText.slice(0, 48)}`,
      category,
      subcategory: validatedData.instrumentType || undefined,
      tags,
      duration: result.duration,
      tempo: validatedData.tempo,
      key: validatedData.key,
      audioUrl: result.audioFilePath,
      userId,
    });

    res.json({
      success: true,
      audioFilePath: result.audioFilePath,
      parameters: result.parameters,
      duration: result.duration,
      sourceType: result.sourceType,
      generatedNotes: result.generatedNotes || [],
      generatedChords: result.generatedChords || [],
    });
  } catch (error: any) {
    logger.error('[Studio Generation] Text generation failed:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request parameters',
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate audio from text' 
    });
  }
});

router.post('/audio', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No audio file provided' 
      });
    }

    const bodyData = {
      targetType: req.body.targetType,
      text: req.body.text,
      projectId: req.body.projectId,
      bars: req.body.bars ? parseInt(req.body.bars, 10) : undefined,
    };
    
    const validatedData = audioGenerationSchema.parse(bodyData);

    logger.info(`[Studio Generation] Audio-to-audio request, file size: ${req.file.size} bytes`);

    const result = await generateFromReference({
      audioBuffer: req.file.buffer,
      targetType: validatedData.targetType || 'drums',
      text: validatedData.text,
      bars: validatedData.bars,
      projectId: validatedData.projectId,
    });

    const userId2 = (req as any).user?.id || 'unknown';
    await persistGeneratedSample({
      name: `AI Style Transfer: ${validatedData.targetType || 'drums'}`,
      category: validatedData.targetType === 'drums' ? 'drums' : 'synths',
      subcategory: validatedData.targetType || undefined,
      tags: ['style-transfer', validatedData.targetType || 'drums'].filter(Boolean) as string[],
      duration: result.duration,
      audioUrl: result.audioFilePath,
      userId: userId2,
    });

    res.json({
      success: true,
      audioFilePath: result.audioFilePath,
      parameters: result.parameters,
      duration: result.duration,
      sourceType: result.sourceType,
      generatedNotes: result.generatedNotes || [],
      generatedChords: result.generatedChords || [],
    });
  } catch (error: any) {
    logger.error('[Studio Generation] Audio generation failed:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request parameters',
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate audio from reference' 
    });
  }
});

router.get('/presets', requireAuth, async (req, res) => {
  try {
    const instruments = melodyPatternService.getAvailableInstruments();
    const genres = melodyPatternService.getAvailableGenres();
    const styles = melodyPatternService.getAvailableStyles();
    const scales = melodyPatternService.getAvailableScales();
    
    const presets = {
      genres: Object.entries(genres).flatMap(([category, data]) => 
        data.genres.map(g => ({
          id: g,
          name: g.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category,
          tempoRange: data.tempoRange,
          characteristics: data.characteristics,
        }))
      ),
      instrumentTypes: [
        ...instruments.melodic.map(i => ({
          id: i,
          name: i.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: 'melodic',
          description: `${i.replace(/_/g, ' ')} instrument`,
        })),
        ...instruments.drums.map(i => ({
          id: i,
          name: i.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: 'drums',
          description: `${i.replace(/_/g, ' ')} drum kit`,
        })),
        ...instruments.percussion.map(i => ({
          id: i,
          name: i.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: 'percussion',
          description: `${i.replace(/_/g, ' ')} percussion`,
        })),
      ],
      keys: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
      scales: scales.map(s => ({
        id: s,
        name: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      })),
      styles: styles.map(s => ({
        id: s,
        name: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      })),
      moods: ['dark', 'bright', 'aggressive', 'chill', 'uplifting', 'melancholic', 'energetic', 'dreamy', 'intense', 'peaceful'],
    };

    res.json(presets);
  } catch (error: any) {
    logger.error('[Studio Generation] Failed to get presets:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get presets' 
    });
  }
});

const patternGenerationSchema = z.object({
  instrument: z.string().min(1),
  genre: z.string().min(1),
  style: z.string().optional().default('melodic'),
  key: z.string().min(1).max(2).default('C'),
  scale: z.string().min(1).default('minor'),
  tempo: z.number().min(20).max(300).default(120),
  bars: z.number().min(1).max(64).default(4),
  complexity: z.number().min(0).max(1).default(0.5),
  swing: z.number().min(0).max(1).default(0),
  humanize: z.number().min(0).max(1).default(0.2),
});

router.get('/pattern/instruments', requireAuth, async (_req, res) => {
  try {
    const instruments = melodyPatternService.getAvailableInstruments();
    res.json(instruments);
  } catch (error: any) {
    logger.error('Error fetching instruments:', error);
    res.status(500).json({ error: 'Failed to fetch instruments' });
  }
});

router.get('/pattern/genres', requireAuth, async (_req, res) => {
  try {
    const genres = melodyPatternService.getAvailableGenres();
    res.json(genres);
  } catch (error: any) {
    logger.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

router.get('/pattern/styles', requireAuth, async (_req, res) => {
  try {
    const styles = melodyPatternService.getAvailableStyles();
    res.json(styles);
  } catch (error: any) {
    logger.error('Error fetching styles:', error);
    res.status(500).json({ error: 'Failed to fetch styles' });
  }
});

router.get('/pattern/scales', requireAuth, async (_req, res) => {
  try {
    const scales = melodyPatternService.getAvailableScales();
    res.json(scales);
  } catch (error: any) {
    logger.error('Error fetching scales:', error);
    res.status(500).json({ error: 'Failed to fetch scales' });
  }
});

router.get('/pattern/stats', requireAuth, async (_req, res) => {
  try {
    const stats = melodyPatternService.getPatternCount();
    const instruments = melodyPatternService.getAvailableInstruments();
    const genres = melodyPatternService.getAvailableGenres();
    
    res.json({
      ...stats,
      totalPatterns: stats.melody + stats.drums,
      instruments: {
        melodic: instruments.melodic.length,
        drums: instruments.drums.length,
        percussion: instruments.percussion.length,
        total: instruments.melodic.length + instruments.drums.length + instruments.percussion.length,
      },
      genres: Object.entries(genres).reduce((acc, [key, data]) => {
        acc[key] = data.genres.length;
        return acc;
      }, {} as Record<string, number>),
      totalGenres: Object.values(genres).reduce((sum, data) => sum + data.genres.length, 0),
      styles: melodyPatternService.getAvailableStyles().length,
      scales: melodyPatternService.getAvailableScales().length,
    });
  } catch (error: any) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/pattern/melody', requireAuth, async (req, res) => {
  try {
    const validation = patternGenerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }
    
    const params: GenerationParams = validation.data;
    const pattern = melodyPatternService.generateMelody(params);
    
    logger.info(`[Generation] Generated melody: ${params.instrument} in ${params.genre} style`);
    
    res.json({
      success: true,
      pattern,
      params,
    });
  } catch (error: any) {
    logger.error('Error generating melody:', error);
    res.status(500).json({ error: 'Failed to generate melody' });
  }
});

router.post('/pattern/drums', requireAuth, async (req, res) => {
  try {
    const validation = patternGenerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }
    
    const params: GenerationParams = validation.data;
    const pattern = melodyPatternService.generateDrums(params);
    
    logger.info(`[Generation] Generated drums: ${params.instrument} in ${params.genre} style`);
    
    res.json({
      success: true,
      pattern,
      params,
    });
  } catch (error: any) {
    logger.error('Error generating drums:', error);
    res.status(500).json({ error: 'Failed to generate drums' });
  }
});

router.post('/pattern/chords', requireAuth, async (req, res) => {
  try {
    const validation = patternGenerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }
    
    const params: GenerationParams = validation.data;
    const progression = melodyPatternService.generateChordProgression(params);
    
    logger.info(`[Generation] Generated chords: ${params.key} ${params.scale} in ${params.genre} style`);
    
    res.json({
      success: true,
      progression,
      params,
    });
  } catch (error: any) {
    logger.error('Error generating chords:', error);
    res.status(500).json({ error: 'Failed to generate chords' });
  }
});

router.post('/pattern/arrangement', requireAuth, async (req, res) => {
  try {
    const validation = patternGenerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }
    
    const params: GenerationParams = validation.data;
    
    const melody = melodyPatternService.generateMelody({ ...params, instrument: 'synth_lead' });
    const bass = melodyPatternService.generateMelody({ ...params, instrument: 'bass_synth' });
    const pad = melodyPatternService.generateMelody({ ...params, instrument: 'synth_pad' });
    const drums = melodyPatternService.generateDrums({ ...params, instrument: 'trap_kit' });
    const chords = melodyPatternService.generateChordProgression(params);
    
    logger.info(`[Generation] Generated full arrangement in ${params.genre} style`);
    
    res.json({
      success: true,
      arrangement: {
        melody,
        bass,
        pad,
        drums,
        chords,
      },
      params,
    });
  } catch (error: any) {
    logger.error('Error generating full arrangement:', error);
    res.status(500).json({ error: 'Failed to generate arrangement' });
  }
});

router.post('/audio-to-melody', requireAuth, upload.single('audio'), async (req, res) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  const os = await import('os');
  const path = await import('path');
  const fs = await import('fs');
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const ext = file.originalname.split('.').pop() || 'wav';
  const tmpPath = path.join(os.tmpdir(), `pitch_${Date.now()}.${ext}`);

  try {
    fs.writeFileSync(tmpPath, file.buffer);

    let stdout = '';
    let stderr = '';
    try {
      const out = await execFileAsync(
        'python3',
        ['server/services/audioAnalyzer.py', tmpPath, 'pitch_track'],
        { timeout: 45_000 }
      );
      stdout = out.stdout;
      stderr = out.stderr;
    } catch (execErr: any) {
      const msg = execErr?.stderr?.trim() || execErr?.message || 'Pitch tracking process failed';
      logger.error('[audio-to-melody] execFile error:', msg);
      return res.status(500).json({ error: 'Pitch tracking failed. Make sure the audio contains a clear melody.' });
    }

    let result: any;
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      logger.error('[audio-to-melody] Invalid JSON from pitch tracker. stderr:', stderr);
      return res.status(500).json({ error: 'Pitch tracker returned unexpected output.' });
    }

    if (result.error) {
      return res.status(422).json({ error: result.error });
    }

    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const melodyNotes = (result.notes as any[]).map((n: any) => ({
      pitch: n.midi,
      noteName: NOTES[n.midi % 12] + n.octave,
      duration: n.duration_beats,
      syllable: '',
      stress: n.position_beats % 1 < 0.1,
    }));

    res.json({
      success: true,
      notes: melodyNotes,
      detected_key: result.detected_key,
      bpm: result.bpm,
      note_count: result.note_count,
    });
  } catch (err: any) {
    logger.error('[audio-to-melody] Error:', err);
    res.status(500).json({ error: 'Pitch tracking failed' });
  } finally {
    try { (await import('fs')).unlinkSync(tmpPath); } catch {}
  }
});

export default router;
