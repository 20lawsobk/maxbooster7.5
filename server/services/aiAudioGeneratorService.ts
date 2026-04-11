/**
 * AI Audio Generator Service - Server-Side Integration
 * 
 * Provides REST API endpoints for the in-house AI audio generation system
 */

import wavefilePkg from 'wavefile';
const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;
import { randomBytes } from 'crypto';

import { AIAudioGenerator, type GenerationOutput, type GenerationType } from '../../shared/ml/audio/AIAudioGenerator.js';
import { logger } from '../logger.js';
import { storageService } from './storageService.js';

// Initialize generator
const audioGenerator = new AIAudioGenerator(48000);
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await audioGenerator.initialize();
    initialized = true;
  }
}

export interface TextToAudioRequest {
  text: string;
  duration?: number;
  bars?: number;
  projectId?: string;
}

export interface AudioToAudioRequest {
  audioBuffer: Buffer;
  targetType: GenerationType;
  text?: string;
  bars?: number;
  projectId?: string;
}

export interface GenerationResult {
  success: boolean;
  audioFilePath: string;
  parameters: {
    type: GenerationType;
    tempo: number;
    key: string;
    scale: string;
    genre: string;
  };
  duration: number;
  sourceType: 'text' | 'audio';
  generatedNotes?: Array<{ note: string; octave: number; time: number; duration: number; velocity: number }>;
  generatedChords?: Array<{ chord: string; time: number; duration: number }>;
}

async function saveToWav(audioData: Float32Array, sampleRate: number): Promise<string> {
  const int16Data = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32767)));
  }

  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '16', Array.from(int16Data));

  const filename = `ai_generated_${Date.now()}_${randomBytes(8).toString('hex')}.wav`;
  const key = `generated-content/audio/${filename}`;
  const buffer = Buffer.from(wav.toBuffer());

  await storageService.uploadFile(buffer, key, 'audio/wav');
  return await storageService.getDownloadUrl(key);
}

export async function generateFromText(request: TextToAudioRequest): Promise<GenerationResult> {
  await ensureInitialized();
  
  logger.info(`[AI Audio] Generating from text: "${request.text}"`);
  
  try {
    const output = await audioGenerator.generateFromText({
      text: request.text,
      duration: request.duration,
      bars: request.bars,
    });

    const audioFilePath = await saveToWav(output.audioData, output.sampleRate);

    logger.info(`[AI Audio] Generated ${output.metadata.type} at ${output.metadata.tempo}bpm in ${output.metadata.key} ${output.metadata.scale}`);

    // Extract notes from patterns
    const generatedNotes: GenerationResult['generatedNotes'] = [];
    const generatedChords: GenerationResult['generatedChords'] = [];
    
    if (output.metadata.patterns) {
      // Extract bass notes
      if (output.metadata.patterns.bass?.notes) {
        for (const note of output.metadata.patterns.bass.notes) {
          generatedNotes.push({
            note: note.note,
            octave: note.octave,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
          });
        }
      }
      
      // Extract melodic notes
      if (output.metadata.patterns.melody?.notes) {
        for (const note of output.metadata.patterns.melody.notes) {
          generatedNotes.push({
            note: note.note,
            octave: note.octave,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
          });
        }
      }
      
      // Count drum hits as notes too (for drums-only generation)
      if (output.metadata.patterns.drums) {
        const drums = output.metadata.patterns.drums;
        let drumNoteCount = 0;
        ['kick', 'snare', 'hihat', 'clap', 'perc'].forEach((drumType) => {
          const pattern = drums[drumType as keyof typeof drums];
          if (Array.isArray(pattern)) {
            for (let i = 0; i < pattern.length; i++) {
              const step = pattern[i];
              if (step && typeof step === 'object' && 'active' in step && step.active) {
                drumNoteCount++;
                generatedNotes.push({
                  note: drumType.toUpperCase(),
                  octave: 0,
                  time: i * 0.25,
                  duration: 0.25,
                  velocity: step.velocity || 0.8,
                });
              }
            }
          }
        });
      }
      
      // Generate chord names from bass notes (simplified chord detection)
      if (output.metadata.patterns.bass?.notes && output.metadata.patterns.bass.notes.length > 0) {
        const bassNotes = output.metadata.patterns.bass.notes;
        const scale = output.metadata.scale;
        const key = output.metadata.key;
        
        // Group notes by position to form chords
        const notesByTime: Record<number, string[]> = {};
        bassNotes.forEach(n => {
          const timeKey = Math.floor(n.time);
          if (!notesByTime[timeKey]) notesByTime[timeKey] = [];
          notesByTime[timeKey].push(n.note);
        });
        
        Object.entries(notesByTime).forEach(([timeStr, notes]) => {
          const time = parseInt(timeStr);
          if (notes.length > 0) {
            const chordName = notes[0] + (scale === 'minor' ? 'm' : '');
            generatedChords.push({
              chord: chordName,
              time,
              duration: 1,
            });
          }
        });
      }
    }

    logger.info(`[AI Audio] Generated ${generatedNotes.length} notes, ${generatedChords.length} chords`);

    return {
      success: true,
      audioFilePath,
      parameters: {
        type: output.metadata.type,
        tempo: output.metadata.tempo,
        key: output.metadata.key,
        scale: output.metadata.scale,
        genre: output.metadata.genre,
      },
      duration: output.duration,
      sourceType: 'text',
      generatedNotes,
      generatedChords,
    };
  } catch (error) {
    logger.warn({ err: error }, '[AI Audio] Text generation failed:');
    throw error;
  }
}

export async function generateFromReference(request: AudioToAudioRequest): Promise<GenerationResult> {
  await ensureInitialized();
  
  logger.info(`[AI Audio] Generating ${request.targetType} from audio reference`);
  
  try {
    const audioData = bufferToFloat32Array(request.audioBuffer);
    
    const output = await audioGenerator.generateFromReference({
      referenceAudio: audioData,
      referenceSampleRate: 48000,
      targetType: request.targetType,
      text: request.text,
      bars: request.bars,
    });

    const audioFilePath = await saveToWav(output.audioData, output.sampleRate);

    logger.info(`[AI Audio] Generated ${output.metadata.type} matching reference style`);

    return {
      success: true,
      audioFilePath,
      parameters: {
        type: output.metadata.type,
        tempo: output.metadata.tempo,
        key: output.metadata.key,
        scale: output.metadata.scale,
        genre: output.metadata.genre,
      },
      duration: output.duration,
      sourceType: 'audio',
    };
  } catch (error) {
    logger.warn({ err: error }, '[AI Audio] Reference generation failed:');
    throw error;
  }
}

export async function generateDrumHit(
  type: 'kick' | 'snare' | 'hihat' | 'clap',
  preset?: string
): Promise<string> {
  await ensureInitialized();
  
  const audioData = audioGenerator.generateDrumHit(type, preset, 1);
  return saveToWav(audioData, 48000);
}

export async function generateBassNote(
  note: string,
  octave: number = 1,
  preset: string = 'trap808',
  duration: number = 1
): Promise<string> {
  await ensureInitialized();
  
  const audioData = audioGenerator.generateBassNote(note, octave, preset, duration);
  return saveToWav(audioData, 48000);
}

export async function generateSynthNote(
  note: string,
  octave: number = 4,
  type: 'lead' | 'pad' | 'pluck' = 'lead',
  preset: string = 'classic',
  duration: number = 1
): Promise<string> {
  await ensureInitialized();
  
  const audioData = audioGenerator.generateSynthNote(note, octave, type, preset, duration);
  return saveToWav(audioData, 48000);
}

export async function getSuggestions(text: string): Promise<string[]> {
  await ensureInitialized();
  return audioGenerator.getSuggestions(text);
}

function bufferToFloat32Array(buffer: Buffer): Float32Array {
  try {
    const wav = new WaveFile(buffer);
    const samples = wav.getSamples(false, Float32Array) as Float32Array;
    if (samples instanceof Float32Array) {
      return samples;
    }
    if (Array.isArray(samples) && samples[0] instanceof Float32Array) {
      return samples[0];
    }
    const float32 = new Float32Array(buffer.length / 2);
    for (let i = 0; i < float32.length; i++) {
      const int16 = buffer.readInt16LE(i * 2);
      float32[i] = int16 / 32768;
    }
    return float32;
  } catch {
    const float32 = new Float32Array(buffer.length / 2);
    for (let i = 0; i < float32.length; i++) {
      const int16 = buffer.readInt16LE(i * 2);
      float32[i] = int16 / 32768;
    }
    return float32;
  }
}

export const aiAudioGeneratorService = {
  generateFromText,
  generateFromReference,
  generateDrumHit,
  generateBassNote,
  generateSynthNote,
  getSuggestions,
};
