/**
 * AI Audio Generator - Main Entry Point for In-House Audio Generation
 * 
 * Unified interface for:
 * - Text-to-audio generation
 * - Audio-to-audio style transfer
 * - Pattern-based loop generation
 * 
 * Combines all synthesizer, AI text parsing, feature extraction, and pattern generation
 * into a single, easy-to-use API.
 * 
 * 100% in-house, no external APIs
 */

import { SynthesizerEngine, type DrumParams, type BassParams, type SynthParams } from './SynthesizerEngine.js';
import { TextToSynthAI, type GenerationRequest, type ExtractedParameters } from './TextToSynthAI.js';
import { AudioFeatureExtractor, type AudioFeatures, type StyleProfile, generateStyleProfile } from './AudioFeatureExtractor.js';
import { 
  PatternRenderer, 
  generateDrumPattern, 
  generateBassPattern, 
  generateMelodicPattern,
  type DrumPattern,
  type BassPattern,
  type MelodicPattern,
  type GenerationConfig 
} from './PatternGenerator.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type GenerationType = 
  | 'drums' 
  | 'bass' 
  | 'synth' 
  | 'pad' 
  | 'pluck' 
  | 'arp' 
  | 'full_beat' 
  | 'melody' 
  | 'loop';

export interface TextGenerationInput {
  text: string;
  duration?: number;       // seconds
  bars?: number;           // number of bars to generate
}

export interface AudioReferenceInput {
  audioData: Float32Array;
  sampleRate: number;
  text?: string;           // Optional text modifiers
}

export interface GenerationOutput {
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
  metadata: {
    type: GenerationType;
    tempo: number;
    key: string;
    scale: string;
    genre: string;
    patterns?: {
      drums?: DrumPattern;
      bass?: BassPattern;
      melody?: MelodicPattern;
    };
    styleProfile?: StyleProfile;
    textParsed?: GenerationRequest;
  };
}

export interface StyleTransferInput {
  referenceAudio: Float32Array;
  referenceSampleRate: number;
  targetType: GenerationType;
  text?: string;           // Optional text modifiers
  bars?: number;
}

// ============================================================================
// STYLE TRANSFER ENGINE
// ============================================================================

class StyleTransferEngine {
  private featureExtractor: AudioFeatureExtractor;
  
  constructor(sampleRate: number) {
    this.featureExtractor = new AudioFeatureExtractor(sampleRate);
  }
  
  analyzeReference(audioData: Float32Array): StyleProfile {
    return this.featureExtractor.getStyleProfile(audioData);
  }
  
  applyStyleToParams(
    style: StyleProfile,
    params: ExtractedParameters
  ): ExtractedParameters {
    return {
      ...params,
      tempo: style.tempo || params.tempo,
      brightness: style.brightness,
      darkness: 1 - style.brightness,
      attack: style.attack,
      decay: style.decay,
      distortion: style.distortion,
      energy: style.energy,
      depth: style.filterResonance / 12, // Normalize 0-12 to 0-1
    };
  }
  
  generateSimilarDrumParams(style: StyleProfile): DrumParams {
    return {
      type: 'kick',
      pitch: 40 + style.brightness * 30,
      decay: 0.3 + style.decay * 0.5,
      tone: style.brightness,
      snap: style.attack < 0.1 ? 0.9 : 0.5,
      distortion: style.distortion,
    };
  }
  
  generateSimilarBassParams(style: StyleProfile, key: string): BassParams {
    return {
      type: style.distortion > 0.3 ? '808' : 'sub',
      note: key,
      octave: 1,
      filter: {
        type: 'lowpass',
        cutoff: style.filterCutoff || 500,
        resonance: style.filterResonance || 4,
        envAmount: 0.3 + style.energy * 0.5,
        envelope: {
          attack: style.attack,
          decay: style.decay,
          sustain: 0.5,
          release: 0.3,
        },
      },
      distortion: style.distortion,
    };
  }
  
  generateSimilarSynthParams(style: StyleProfile): SynthParams {
    const oscType = style.brightness > 0.6 ? 'sawtooth' : 
                    style.brightness > 0.3 ? 'square' : 'triangle';
    
    return {
      type: 'lead',
      oscillators: [
        { type: oscType as any, frequency: 1, detune: 0 },
      ],
      filter: {
        type: 'lowpass',
        cutoff: style.filterCutoff || 2000,
        resonance: style.filterResonance || 4,
        envAmount: 0.4,
        envelope: {
          attack: style.attack,
          decay: style.decay,
          sustain: 0.6,
          release: 0.4,
        },
      },
      ampEnvelope: {
        attack: style.attack,
        decay: 0.3,
        sustain: 0.7,
        release: 0.4,
      },
      unison: {
        voices: 3,
        detune: 15,
        spread: 0.5,
      },
    };
  }
}

// ============================================================================
// MAIN AI AUDIO GENERATOR CLASS
// ============================================================================

export class AIAudioGenerator {
  private sampleRate: number;
  private synth: SynthesizerEngine;
  private textAI: TextToSynthAI;
  private featureExtractor: AudioFeatureExtractor;
  private patternRenderer: PatternRenderer;
  private styleTransfer: StyleTransferEngine;
  private initialized: boolean = false;
  
  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
    this.synth = new SynthesizerEngine(sampleRate);
    this.textAI = new TextToSynthAI();
    this.featureExtractor = new AudioFeatureExtractor(sampleRate);
    this.patternRenderer = new PatternRenderer(sampleRate);
    this.styleTransfer = new StyleTransferEngine(sampleRate);
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.textAI.initialize();
    this.initialized = true;
  }
  
  // =========================================================================
  // TEXT-TO-AUDIO GENERATION
  // =========================================================================
  
  async generateFromText(input: TextGenerationInput): Promise<GenerationOutput> {
    await this.initialize();
    
    // Parse text to get intent and parameters
    const parsed = await this.textAI.parseText(input.text);
    const bars = input.bars || parsed.patternLength;
    
    // Build generation config
    const config: GenerationConfig = {
      tempo: parsed.params.tempo,
      key: parsed.params.key,
      scale: parsed.params.scale,
      bars,
      stepsPerBar: 16,
      genre: parsed.params.genre,
      energy: parsed.params.energy,
      complexity: parsed.params.depth,
      swing: parsed.params.genre === 'trap' || parsed.params.genre === 'hiphop' ? 0.2 : 0,
    };
    
    let audioData: Float32Array;
    let type: GenerationType = 'loop';
    const patterns: GenerationOutput['metadata']['patterns'] = {};
    
    // Generate based on intent
    switch (parsed.intent.category) {
      case 'drums': {
        type = 'drums';
        const drumPattern = generateDrumPattern(config);
        patterns.drums = drumPattern;
        audioData = this.patternRenderer.renderDrumPattern(
          drumPattern,
          config.tempo,
          config.genre
        );
        break;
      }
      
      case 'bass': {
        type = 'bass';
        const bassPattern = generateBassPattern(config);
        patterns.bass = bassPattern;
        audioData = this.patternRenderer.renderBassPattern(
          bassPattern,
          config.tempo,
          parsed.intent.subType === '808' ? 'trap808' : parsed.intent.subType
        );
        break;
      }
      
      case 'synth':
      case 'pad':
      case 'pluck':
      case 'arp': {
        type = parsed.intent.category as GenerationType;
        const melodicPattern = generateMelodicPattern(
          config,
          parsed.intent.subType as 'lead' | 'pad' | 'arp'
        );
        patterns.melody = melodicPattern;
        audioData = this.patternRenderer.renderMelodicPattern(
          melodicPattern,
          config.tempo,
          parsed.intent.subType as 'lead' | 'pad' | 'pluck',
          parsed.params.brightness > 0.6 ? 'supersaw' : 'classic'
        );
        break;
      }
      
      default: {
        // Full beat/loop generation
        type = 'full_beat';
        
        // Generate all patterns
        const drumPattern = generateDrumPattern(config);
        const bassPattern = generateBassPattern(config);
        const melodicPattern = generateMelodicPattern(config, 'lead');
        
        patterns.drums = drumPattern;
        patterns.bass = bassPattern;
        patterns.melody = melodicPattern;
        
        // Render each
        const drumAudio = this.patternRenderer.renderDrumPattern(
          drumPattern, 
          config.tempo, 
          config.genre
        );
        const bassAudio = this.patternRenderer.renderBassPattern(
          bassPattern, 
          config.tempo
        );
        const melodyAudio = this.patternRenderer.renderMelodicPattern(
          melodicPattern, 
          config.tempo, 
          'lead'
        );
        
        // Mix together
        audioData = this.patternRenderer.mixPatterns(
          [drumAudio, bassAudio, melodyAudio],
          [1.0, 0.8, 0.6] // Gains
        );
      }
    }
    
    const duration = audioData.length / this.sampleRate;
    
    return {
      audioData,
      sampleRate: this.sampleRate,
      duration,
      metadata: {
        type,
        tempo: config.tempo,
        key: config.key,
        scale: config.scale,
        genre: config.genre,
        patterns,
        textParsed: parsed,
      },
    };
  }
  
  // =========================================================================
  // AUDIO-TO-AUDIO STYLE TRANSFER
  // =========================================================================
  
  async generateFromReference(input: StyleTransferInput): Promise<GenerationOutput> {
    await this.initialize();
    
    // Analyze reference audio
    const styleProfile = this.styleTransfer.analyzeReference(input.referenceAudio);
    
    // Parse optional text modifiers
    let textParams: ExtractedParameters | undefined;
    if (input.text) {
      const parsed = await this.textAI.parseText(input.text);
      textParams = parsed.params;
    }
    
    // Merge style profile with text modifiers
    const mergedParams: ExtractedParameters = textParams 
      ? this.styleTransfer.applyStyleToParams(styleProfile, textParams)
      : {
          tempo: styleProfile.tempo,
          key: 'C',
          scale: 'minor',
          mood: 'neutral',
          genre: 'electronic',
          brightness: styleProfile.brightness,
          darkness: 1 - styleProfile.brightness,
          attack: styleProfile.attack,
          decay: styleProfile.decay,
          distortion: styleProfile.distortion,
          width: 0.5,
          depth: styleProfile.filterResonance / 12,
          energy: styleProfile.energy,
        };
    
    const bars = input.bars || 4;
    
    // Build generation config from style
    const config: GenerationConfig = {
      tempo: mergedParams.tempo,
      key: mergedParams.key,
      scale: mergedParams.scale,
      bars,
      stepsPerBar: 16,
      genre: mergedParams.genre,
      energy: mergedParams.energy,
      complexity: mergedParams.depth,
      swing: styleProfile.swing,
    };
    
    let audioData: Float32Array;
    const patterns: GenerationOutput['metadata']['patterns'] = {};
    
    // Generate based on target type
    switch (input.targetType) {
      case 'drums': {
        const drumPattern = generateDrumPattern(config);
        patterns.drums = drumPattern;
        audioData = this.patternRenderer.renderDrumPattern(
          drumPattern,
          config.tempo,
          config.genre
        );
        break;
      }
      
      case 'bass': {
        const bassPattern = generateBassPattern(config);
        patterns.bass = bassPattern;
        audioData = this.patternRenderer.renderBassPattern(
          bassPattern,
          config.tempo
        );
        break;
      }
      
      case 'synth':
      case 'lead': {
        const melodicPattern = generateMelodicPattern(config, 'lead');
        patterns.melody = melodicPattern;
        audioData = this.patternRenderer.renderMelodicPattern(
          melodicPattern,
          config.tempo,
          'lead'
        );
        break;
      }
      
      case 'pad': {
        const melodicPattern = generateMelodicPattern(config, 'pad');
        patterns.melody = melodicPattern;
        audioData = this.patternRenderer.renderMelodicPattern(
          melodicPattern,
          config.tempo,
          'pad'
        );
        break;
      }
      
      case 'arp': {
        const melodicPattern = generateMelodicPattern(config, 'arp');
        patterns.melody = melodicPattern;
        audioData = this.patternRenderer.renderMelodicPattern(
          melodicPattern,
          config.tempo,
          'pluck'
        );
        break;
      }
      
      default: {
        // Full beat matching reference style
        const drumPattern = generateDrumPattern(config);
        const bassPattern = generateBassPattern(config);
        
        patterns.drums = drumPattern;
        patterns.bass = bassPattern;
        
        const drumAudio = this.patternRenderer.renderDrumPattern(
          drumPattern, 
          config.tempo
        );
        const bassAudio = this.patternRenderer.renderBassPattern(
          bassPattern, 
          config.tempo
        );
        
        audioData = this.patternRenderer.mixPatterns(
          [drumAudio, bassAudio],
          [1.0, 0.8]
        );
      }
    }
    
    const duration = audioData.length / this.sampleRate;
    
    return {
      audioData,
      sampleRate: this.sampleRate,
      duration,
      metadata: {
        type: input.targetType,
        tempo: config.tempo,
        key: config.key,
        scale: config.scale,
        genre: config.genre,
        patterns,
        styleProfile,
      },
    };
  }
  
  // =========================================================================
  // SINGLE SOUND GENERATION
  // =========================================================================
  
  generateDrumHit(
    type: 'kick' | 'snare' | 'hihat' | 'clap',
    preset?: string,
    duration: number = 1
  ): Float32Array {
    return this.synth.generateDrum(type, preset, duration);
  }
  
  generateBassNote(
    note: string,
    octave: number,
    preset: string = 'trap808',
    duration: number = 1
  ): Float32Array {
    return this.synth.generateBass(note, octave, preset, duration);
  }
  
  generateSynthNote(
    note: string,
    octave: number,
    type: 'lead' | 'pad' | 'pluck' = 'lead',
    preset: string = 'classic',
    duration: number = 1
  ): Float32Array {
    return this.synth.generateSynth(note, octave, type, preset, duration);
  }
  
  // =========================================================================
  // ANALYSIS
  // =========================================================================
  
  analyzeAudio(audioData: Float32Array): AudioFeatures {
    return this.featureExtractor.extract(audioData);
  }
  
  getStyleProfile(audioData: Float32Array): StyleProfile {
    return this.featureExtractor.getStyleProfile(audioData);
  }
  
  // =========================================================================
  // SUGGESTIONS
  // =========================================================================
  
  async getSuggestions(text: string): Promise<string[]> {
    await this.initialize();
    const parsed = await this.textAI.parseText(text);
    return this.textAI.getSuggestions(parsed);
  }
  
  // =========================================================================
  // UTILITIES
  // =========================================================================
  
  getSampleRate(): number {
    return this.sampleRate;
  }
  
  floatToInt16(floatData: Float32Array): Int16Array {
    const int16Data = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(floatData[i] * 32767)));
    }
    return int16Data;
  }
}

export default AIAudioGenerator;
