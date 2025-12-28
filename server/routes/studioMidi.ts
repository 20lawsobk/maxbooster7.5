import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../logger.js';
import { midiGeneratorService } from '../services/midiGeneratorService';
import { midiTransformService } from '../services/midiTransformService';
import { microtonalService } from '../services/microtonalService';

const router = Router();

const midiNoteSchema = z.object({
  note: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  startTime: z.number().min(0),
  duration: z.number().positive(),
  channel: z.number().int().min(0).max(15).optional(),
});

const constraintsSchema = z.object({
  key: z.string().default('C'),
  scale: z.string().default('major'),
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
  density: z.enum(['sparse', 'normal', 'dense']).default('normal'),
  humanization: humanizationSchema.optional(),
});

const generateRhythmSchema = z.object({
  constraints: constraintsSchema,
  bars: z.number().int().min(1).max(64).default(4),
  pattern: z.enum(['straight', 'swing', 'triplet', 'dotted', 'syncopated', 'hiphop', 'trap', 'house', 'dnb']).default('straight'),
  noteValue: z.number().int().min(0).max(127).default(60),
});

const generateChordsSchema = z.object({
  constraints: constraintsSchema,
  style: z.enum(['pop', 'jazz', 'classical', 'edm', 'blues', 'rnb', 'custom']).default('pop'),
  length: z.number().int().min(1).max(32).default(4),
  complexity: z.enum(['simple', 'moderate', 'complex']).default('moderate'),
  allowBorrowedChords: z.boolean().default(false),
  voicing: z.enum(['close', 'open', 'drop2', 'drop3', 'spread']).default('close'),
});

const arpeggiateSchema = z.object({
  notes: z.array(midiNoteSchema),
  pattern: z.enum(['up', 'down', 'updown', 'downup', 'random', 'order', 'converge', 'diverge']).default('up'),
  rate: z.enum(['1/4', '1/8', '1/16', '1/32', '1/4T', '1/8T', '1/16T']).default('1/8'),
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
    'transpose', 'invert', 'retrograde', 'retrogradeInversion',
    'augment', 'diminish', 'quantize', 'legato', 'staccato',
    'velocityCurve', 'randomize'
  ]),
  options: z.record(z.any()).optional(),
});

const ornamentSchema = z.object({
  notes: z.array(midiNoteSchema),
  type: z.enum(['trill', 'mordent', 'turn', 'graceNote', 'tremolo', 'glissando']),
  speed: z.number().optional(),
  interval: z.number().int().optional(),
  count: z.number().int().optional(),
});

const strumSchema = z.object({
  notes: z.array(midiNoteSchema),
  direction: z.enum(['up', 'down', 'alternating']).default('down'),
  speed: z.number().min(1).max(200).default(30),
  velocityCurve: z.enum(['linear', 'exponential', 'logarithmic']).default('linear'),
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

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { type, ...params } = req.body;
    
    let result;
    switch (type) {
      case 'melody': {
        const data = generateMelodySchema.parse(params);
        result = midiGeneratorService.generateMelody(
          data.constraints,
          data.bars,
          data.density,
          data.humanization
        );
        break;
      }
      case 'rhythm': {
        const data = generateRhythmSchema.parse(params);
        result = midiGeneratorService.generateRhythm(
          data.constraints,
          data.bars,
          data.pattern,
          data.noteValue
        );
        break;
      }
      case 'chords': {
        const data = generateChordsSchema.parse(params);
        result = midiGeneratorService.generateChords(data.constraints, {
          style: data.style,
          length: data.length,
          complexity: data.complexity,
          allowBorrowedChords: data.allowBorrowedChords,
          voicing: data.voicing,
        });
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid generation type' });
    }

    res.json({
      success: true,
      notes: result,
      type,
    });
  } catch (error: unknown) {
    logger.error('Error generating MIDI:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to generate MIDI' });
  }
});

router.post('/transform', requireAuth, async (req, res) => {
  try {
    const data = transformSchema.parse(req.body);
    const options = data.options || {};
    
    let result;
    switch (data.transform) {
      case 'transpose':
        result = midiTransformService.transpose(data.notes, options.semitones || 0);
        break;
      case 'invert':
        result = midiTransformService.invert(data.notes, options.pivotNote);
        break;
      case 'retrograde':
        result = midiTransformService.retrograde(data.notes);
        break;
      case 'retrogradeInversion':
        result = midiTransformService.retrogradeInversion(data.notes, options.pivotNote);
        break;
      case 'augment':
        result = midiTransformService.augment(data.notes, options.factor || 2);
        break;
      case 'diminish':
        result = midiTransformService.diminish(data.notes, options.factor || 2);
        break;
      case 'quantize':
        result = midiTransformService.quantize(data.notes, options.gridSize || 0.25, options.strength || 1);
        break;
      case 'legato':
        result = midiTransformService.legato(data.notes, options.overlap || 0);
        break;
      case 'staccato':
        result = midiTransformService.staccato(data.notes, options.factor || 0.5);
        break;
      case 'velocityCurve':
        result = midiTransformService.velocityCurve(data.notes, options.curve || 'crescendo', options.intensity || 1);
        break;
      case 'randomize':
        result = midiTransformService.randomize(data.notes, options);
        break;
      default:
        return res.status(400).json({ error: 'Invalid transform type' });
    }

    res.json({
      success: true,
      notes: result,
      transform: data.transform,
    });
  } catch (error: unknown) {
    logger.error('Error transforming MIDI:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to transform MIDI' });
  }
});

router.post('/arpeggiate', requireAuth, async (req, res) => {
  try {
    const data = arpeggiateSchema.parse(req.body);
    
    const result = midiGeneratorService.arpeggiate(
      data.notes,
      {
        pattern: data.pattern,
        rate: data.rate,
        octaves: data.octaves,
        gate: data.gate,
        swing: data.swing,
        velocity: data.velocity,
        hold: data.hold,
      },
      data.tempo
    );

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.error('Error creating arpeggio:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create arpeggio' });
  }
});

router.post('/chords', requireAuth, async (req, res) => {
  try {
    const data = generateChordsSchema.parse(req.body);
    
    const result = midiGeneratorService.generateChordProgression(data.constraints, {
      style: data.style,
      length: data.length,
      complexity: data.complexity,
      allowBorrowedChords: data.allowBorrowedChords,
      voicing: data.voicing,
    });

    res.json({
      success: true,
      chords: result.chords,
      notes: result.notes,
    });
  } catch (error: unknown) {
    logger.error('Error generating chord progression:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to generate chord progression' });
  }
});

router.post('/ornament', requireAuth, async (req, res) => {
  try {
    const data = ornamentSchema.parse(req.body);
    
    const result = midiTransformService.addOrnament(data.notes, {
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
    logger.error('Error adding ornament:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add ornament' });
  }
});

router.post('/strum', requireAuth, async (req, res) => {
  try {
    const data = strumSchema.parse(req.body);
    
    const result = midiTransformService.applyStrumPattern(data.notes, {
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
    logger.error('Error applying strum pattern:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to apply strum pattern' });
  }
});

router.post('/fit-to-scale', requireAuth, async (req, res) => {
  try {
    const data = fitToScaleSchema.parse(req.body);
    
    const result = microtonalService.fitNotesToScale(data.notes, data.rootNote, data.scale);

    res.json({
      success: true,
      notes: result,
    });
  } catch (error: unknown) {
    logger.error('Error fitting to scale:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to fit notes to scale' });
  }
});

router.get('/scales', requireAuth, async (req, res) => {
  try {
    const { category } = req.query;
    
    let scales;
    if (category && typeof category === 'string') {
      scales = microtonalService.getScalesByCategory(category);
    } else {
      scales = microtonalService.getAllScales();
    }
    
    const tunings = microtonalService.getAllTuningSystems();
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
    logger.error('Error fetching scales:', error);
    res.status(500).json({ error: 'Failed to fetch scales' });
  }
});

router.get('/scales/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rootNote, octaves } = req.query;
    
    const scale = microtonalService.getScale(id);
    if (!scale) {
      return res.status(404).json({ error: 'Scale not found' });
    }
    
    const root = rootNote ? parseInt(rootNote as string) : 60;
    const octs = octaves ? parseInt(octaves as string) : 1;
    const notes = microtonalService.getScaleNotes(root, id, octs);
    const frequencies = microtonalService.getScaleFrequencies(root, id, 'equal12', octs);

    res.json({
      success: true,
      scale,
      notes,
      frequencies,
    });
  } catch (error: unknown) {
    logger.error('Error fetching scale:', error);
    res.status(500).json({ error: 'Failed to fetch scale' });
  }
});

router.get('/tunings/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tuning = microtonalService.getTuningSystem(id);
    if (!tuning) {
      return res.status(404).json({ error: 'Tuning system not found' });
    }

    res.json({
      success: true,
      tuning,
    });
  } catch (error: unknown) {
    logger.error('Error fetching tuning:', error);
    res.status(500).json({ error: 'Failed to fetch tuning' });
  }
});

router.post('/scale-sync', requireAuth, async (req, res) => {
  try {
    const data = scaleSyncSchema.parse(req.body);
    
    microtonalService.setScaleSync({
      projectId: data.projectId,
      scale: data.scale,
      rootNote: data.rootNote,
      tuningSystem: data.tuningSystem || 'equal12',
      affectedClips: data.affectedClips || [],
    });

    res.json({
      success: true,
      message: 'Scale sync configured',
    });
  } catch (error: unknown) {
    logger.error('Error setting scale sync:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to set scale sync' });
  }
});

router.get('/scale-sync/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const config = microtonalService.getScaleSync(projectId);

    res.json({
      success: true,
      config: config || null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching scale sync:', error);
    res.status(500).json({ error: 'Failed to fetch scale sync' });
  }
});

router.delete('/scale-sync/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    microtonalService.removeScaleSync(projectId);

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error removing scale sync:', error);
    res.status(500).json({ error: 'Failed to remove scale sync' });
  }
});

router.post('/note-info', requireAuth, async (req, res) => {
  try {
    const { note, tuningSystem } = req.body;
    
    if (typeof note !== 'number' || note < 0 || note > 127) {
      return res.status(400).json({ error: 'Invalid MIDI note' });
    }
    
    const info = microtonalService.getNoteInfo(note, tuningSystem || 'equal12');

    res.json({
      success: true,
      ...info,
    });
  } catch (error: unknown) {
    logger.error('Error getting note info:', error);
    res.status(500).json({ error: 'Failed to get note info' });
  }
});

router.post('/frequency', requireAuth, async (req, res) => {
  try {
    const { note, tuningSystem, referenceNote, referenceFrequency } = req.body;
    
    if (typeof note !== 'number' || note < 0 || note > 127) {
      return res.status(400).json({ error: 'Invalid MIDI note' });
    }
    
    const frequency = microtonalService.noteToFrequency(
      note,
      tuningSystem || 'equal12',
      referenceNote || 69,
      referenceFrequency || 440
    );

    res.json({
      success: true,
      frequency,
    });
  } catch (error: unknown) {
    logger.error('Error calculating frequency:', error);
    res.status(500).json({ error: 'Failed to calculate frequency' });
  }
});

export default router;
