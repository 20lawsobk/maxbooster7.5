/**
 * AI Audio Generation Module - Index
 * 
 * Exports all audio generation components for the in-house AI system
 */

export { SynthesizerEngine, DRUM_PRESETS, BASS_PRESETS, SYNTH_PRESETS } from './SynthesizerEngine.js';
export type { DrumParams, BassParams, SynthParams, FilterParams, EnvelopeParams } from './SynthesizerEngine.js';

export { TextToSynthAI } from './TextToSynthAI.js';
export type { GenerationRequest, ExtractedParameters, ParsedIntent } from './TextToSynthAI.js';

export { AudioFeatureExtractor, extractAllFeatures, generateStyleProfile } from './AudioFeatureExtractor.js';
export type { AudioFeatures, StyleProfile, SpectralFeatures, RhythmFeatures } from './AudioFeatureExtractor.js';

export { PatternRenderer, generateDrumPattern, generateBassPattern, generateMelodicPattern } from './PatternGenerator.js';
export type { DrumPattern, BassPattern, MelodicPattern, GenerationConfig, PatternStep, NoteEvent } from './PatternGenerator.js';

export { AIAudioGenerator } from './AIAudioGenerator.js';
export type { GenerationType, TextGenerationInput, AudioReferenceInput, GenerationOutput, StyleTransferInput } from './AIAudioGenerator.js';

export { IntelligentMasteringEngine } from './IntelligentMasteringEngine.js';
export type {
  MasteringGenre,
  EQBand,
  MultibandCompressorBand,
  LimiterSettings,
  StereoSettings,
  LoudnessSettings,
  MasteringChainConfig,
  GenrePreset,
  MasteringAnalysis,
  MasteringIssue,
  ReferenceMatchResult,
  SuggestedSettings,
} from './IntelligentMasteringEngine.js';
