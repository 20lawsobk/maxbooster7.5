import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../logger.js';
import multer from 'multer';
import { generateFromText, generateFromReference } from '../services/aiAudioGeneratorService.js';

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
  instrumentType: z.enum(['drums', 'bass', 'synth', 'pad', 'pluck', 'arp', 'full_beat', 'melody', 'loop']).optional(),
  genre: z.string().optional(),
  tempo: z.number().int().min(40).max(240).optional(),
  key: z.string().optional(),
  scale: z.enum(['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian']).optional(),
});

const audioGenerationSchema = z.object({
  targetType: z.enum(['drums', 'bass', 'synth', 'pad', 'pluck', 'arp', 'full_beat', 'melody', 'loop']).optional(),
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
    
    if (validatedData.instrumentType && !textLower.includes(validatedData.instrumentType.toLowerCase())) {
      parts.push(validatedData.instrumentType);
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

    res.json({
      success: true,
      audioFilePath: result.audioFilePath,
      parameters: result.parameters,
      duration: result.duration,
      sourceType: result.sourceType,
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

    res.json({
      success: true,
      audioFilePath: result.audioFilePath,
      parameters: result.parameters,
      duration: result.duration,
      sourceType: result.sourceType,
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
    const presets = {
      genres: [
        { id: 'trap', name: 'Trap', tempo: 140 },
        { id: 'house', name: 'House', tempo: 125 },
        { id: 'hiphop', name: 'Hip Hop', tempo: 90 },
        { id: 'dnb', name: 'Drum & Bass', tempo: 174 },
        { id: 'techno', name: 'Techno', tempo: 130 },
        { id: 'lofi', name: 'Lo-Fi', tempo: 80 },
        { id: 'dubstep', name: 'Dubstep', tempo: 140 },
        { id: 'pop', name: 'Pop', tempo: 120 },
        { id: 'rock', name: 'Rock', tempo: 120 },
        { id: 'jazz', name: 'Jazz', tempo: 110 },
        { id: 'rnb', name: 'R&B', tempo: 85 },
        { id: 'ambient', name: 'Ambient', tempo: 70 },
      ],
      instrumentTypes: [
        { id: 'drums', name: 'Drums', description: 'Full drum patterns' },
        { id: 'bass', name: 'Bass', description: 'Bass lines and 808s' },
        { id: 'synth', name: 'Synth Lead', description: 'Melodic synth leads' },
        { id: 'pad', name: 'Pad', description: 'Atmospheric pads' },
        { id: 'pluck', name: 'Pluck', description: 'Plucky synth sounds' },
        { id: 'arp', name: 'Arpeggio', description: 'Arpeggiated sequences' },
        { id: 'melody', name: 'Melody', description: 'Full melodic lines' },
        { id: 'full_beat', name: 'Full Beat', description: 'Complete beat with drums and bass' },
      ],
      keys: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
      scales: ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'],
      moods: ['dark', 'bright', 'aggressive', 'chill', 'uplifting', 'melancholic', 'energetic'],
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

export default router;
