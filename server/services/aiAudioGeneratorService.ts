/**
 * AI Audio Generator Service - Server-Side Integration
 * 
 * Provides REST API endpoints for the in-house AI audio generation system
 */

import path from 'path';
import fs from 'fs/promises';
import wavefilePkg from 'wavefile';
const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;

import { AIAudioGenerator, type GenerationOutput, type GenerationType } from '../../shared/ml/audio/AIAudioGenerator.js';
import { logger } from '../logger.js';

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
}

async function saveToWav(audioData: Float32Array, sampleRate: number): Promise<string> {
  const outputDir = path.join(process.cwd(), 'public', 'generated-content', 'audio');
  await fs.mkdir(outputDir, { recursive: true });

  const int16Data = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32767)));
  }

  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '16', Array.from(int16Data));

  const filename = `ai_generated_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;
  const filepath = path.join(outputDir, filename);

  await fs.writeFile(filepath, wav.toBuffer());

  return `/generated-content/audio/${filename}`;
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
    };
  } catch (error) {
    logger.error('[AI Audio] Text generation failed:', error);
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
    logger.error('[AI Audio] Reference generation failed:', error);
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
