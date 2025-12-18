/**
 * Text-to-Synth AI - In-House Natural Language Audio Generation
 * 
 * TensorFlow.js-based model that interprets text descriptions like:
 * - "dark trap hi-hats at 140bpm"
 * - "deep 808 bass in F minor"
 * - "ethereal pad with slow attack"
 * 
 * And converts them into synthesis parameters for the SynthesizerEngine.
 * 
 * Architecture:
 * 1. Text Tokenizer - Converts text to numerical features
 * 2. Intent Classifier - Determines instrument/sound type
 * 3. Parameter Predictor - Outputs synthesis parameters
 * 4. Style Mapper - Maps mood/genre descriptors to sound characteristics
 * 
 * 100% in-house, no external APIs
 */

import * as tf from '@tensorflow/tfjs';
import type { 
  DrumParams, 
  BassParams, 
  SynthParams, 
  FilterParams,
  EnvelopeParams,
  OscillatorType,
  FilterType 
} from './SynthesizerEngine.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type InstrumentCategory = 'drums' | 'bass' | 'synth' | 'pad' | 'pluck' | 'arp' | 'fx';
export type DrumType = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'cymbal' | 'perc';
export type SynthType = 'lead' | 'pad' | 'pluck' | 'arp' | 'brass' | 'string';
export type BassType = 'sub' | '808' | 'synth' | 'reese' | 'growl';

export interface ParsedIntent {
  category: InstrumentCategory;
  subType: string;
  confidence: number;
}

export interface ExtractedParameters {
  tempo: number;
  key: string;
  scale: 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian';
  mood: string;
  genre: string;
  brightness: number;     // 0-1, affects filter cutoff
  darkness: number;       // 0-1, inverse of brightness
  attack: number;         // 0-1, affects envelope attack
  decay: number;          // 0-1, affects envelope decay
  distortion: number;     // 0-1
  width: number;          // 0-1, stereo width
  depth: number;          // 0-1, affects resonance/modulation depth
  energy: number;         // 0-1, overall energy level
}

export interface GenerationRequest {
  text: string;
  intent: ParsedIntent;
  params: ExtractedParameters;
  drumParams?: DrumParams;
  bassParams?: BassParams;
  synthParams?: SynthParams;
  duration: number;
  patternLength: number;  // in bars
}

// ============================================================================
// VOCABULARY AND MAPPINGS
// ============================================================================

const INSTRUMENT_KEYWORDS: Record<InstrumentCategory, string[]> = {
  drums: ['drum', 'drums', 'beat', 'percussion', 'rhythm', 'groove', 'pattern', 'loop'],
  bass: ['bass', '808', 'sub', 'low', 'bottom', 'low-end', 'lowend'],
  synth: ['synth', 'synthesizer', 'lead', 'melody', 'melodic', 'hook'],
  pad: ['pad', 'ambient', 'atmosphere', 'atmospheric', 'texture', 'drone', 'sustained'],
  pluck: ['pluck', 'pizzicato', 'stab', 'stabs', 'key', 'keys', 'piano', 'chord', 'chords'],
  arp: ['arp', 'arpeggio', 'arpeggiated', 'sequence', 'sequencer'],
  fx: ['fx', 'effect', 'riser', 'sweep', 'impact', 'transition', 'whoosh'],
};

const DRUM_TYPE_KEYWORDS: Record<DrumType, string[]> = {
  kick: ['kick', 'bass drum', 'bd', 'boom', 'thump', 'punch'],
  snare: ['snare', 'sd', 'rimshot', 'rim', 'crack'],
  hihat: ['hihat', 'hi-hat', 'hh', 'hat', 'hats', 'hi hat'],
  clap: ['clap', 'claps', 'handclap'],
  tom: ['tom', 'toms', 'floor tom', 'rack tom'],
  cymbal: ['cymbal', 'crash', 'ride', 'china'],
  perc: ['perc', 'percussion', 'shaker', 'tambourine', 'conga', 'bongo'],
};

const BASS_TYPE_KEYWORDS: Record<BassType, string[]> = {
  sub: ['sub', 'subbass', 'sub-bass', 'deep', 'pure'],
  '808': ['808', 'trap', 'boom', 'booming', 'hard'],
  synth: ['synth', 'analog', 'moog', 'squelchy', 'filter'],
  reese: ['reese', 'dnb', 'drum and bass', 'jungle', 'detuned'],
  growl: ['growl', 'dubstep', 'wobble', 'aggressive', 'nasty', 'filthy'],
};

const SYNTH_TYPE_KEYWORDS: Record<SynthType, string[]> = {
  lead: ['lead', 'melody', 'hook', 'solo', 'screaming'],
  pad: ['pad', 'ambient', 'lush', 'warm', 'floating'],
  pluck: ['pluck', 'pizz', 'stab', 'short', 'percussive'],
  arp: ['arp', 'arpeggio', 'sequence', 'running'],
  brass: ['brass', 'horn', 'stab', 'power'],
  string: ['string', 'strings', 'orchestra', 'cinematic'],
};

const MOOD_KEYWORDS: Record<string, { brightness: number; energy: number; attack: number }> = {
  dark: { brightness: 0.2, energy: 0.5, attack: 0.3 },
  bright: { brightness: 0.9, energy: 0.7, attack: 0.4 },
  aggressive: { brightness: 0.6, energy: 0.95, attack: 0.1 },
  soft: { brightness: 0.4, energy: 0.3, attack: 0.7 },
  warm: { brightness: 0.3, energy: 0.5, attack: 0.5 },
  cold: { brightness: 0.7, energy: 0.4, attack: 0.3 },
  ethereal: { brightness: 0.5, energy: 0.3, attack: 0.8 },
  punchy: { brightness: 0.6, energy: 0.8, attack: 0.05 },
  chill: { brightness: 0.4, energy: 0.3, attack: 0.6 },
  hype: { brightness: 0.8, energy: 0.9, attack: 0.1 },
  mellow: { brightness: 0.35, energy: 0.3, attack: 0.6 },
  intense: { brightness: 0.7, energy: 0.9, attack: 0.1 },
  dreamy: { brightness: 0.45, energy: 0.25, attack: 0.7 },
  hard: { brightness: 0.5, energy: 0.9, attack: 0.05 },
  smooth: { brightness: 0.4, energy: 0.4, attack: 0.5 },
  gritty: { brightness: 0.4, energy: 0.7, attack: 0.2 },
  clean: { brightness: 0.6, energy: 0.5, attack: 0.3 },
  dirty: { brightness: 0.3, energy: 0.6, attack: 0.2 },
  lo-fi: { brightness: 0.25, energy: 0.35, attack: 0.5 },
  hi-fi: { brightness: 0.8, energy: 0.6, attack: 0.3 },
};

const GENRE_TEMPLATES: Record<string, Partial<ExtractedParameters>> = {
  trap: { tempo: 140, brightness: 0.4, darkness: 0.6, distortion: 0.3, energy: 0.7 },
  hiphop: { tempo: 90, brightness: 0.35, darkness: 0.65, distortion: 0.2, energy: 0.6 },
  house: { tempo: 125, brightness: 0.6, darkness: 0.4, distortion: 0.1, energy: 0.7 },
  techno: { tempo: 130, brightness: 0.5, darkness: 0.5, distortion: 0.2, energy: 0.8 },
  dubstep: { tempo: 140, brightness: 0.4, darkness: 0.6, distortion: 0.6, energy: 0.9 },
  dnb: { tempo: 174, brightness: 0.5, darkness: 0.5, distortion: 0.3, energy: 0.85 },
  ambient: { tempo: 80, brightness: 0.4, darkness: 0.6, distortion: 0, energy: 0.2 },
  lofi: { tempo: 85, brightness: 0.25, darkness: 0.75, distortion: 0.15, energy: 0.3 },
  pop: { tempo: 120, brightness: 0.7, darkness: 0.3, distortion: 0.05, energy: 0.65 },
  rock: { tempo: 120, brightness: 0.6, darkness: 0.4, distortion: 0.4, energy: 0.75 },
  edm: { tempo: 128, brightness: 0.75, darkness: 0.25, distortion: 0.15, energy: 0.85 },
  rnb: { tempo: 90, brightness: 0.45, darkness: 0.55, distortion: 0.05, energy: 0.5 },
  jazz: { tempo: 110, brightness: 0.5, darkness: 0.5, distortion: 0, energy: 0.45 },
  classical: { tempo: 100, brightness: 0.55, darkness: 0.45, distortion: 0, energy: 0.4 },
  phonk: { tempo: 130, brightness: 0.3, darkness: 0.7, distortion: 0.5, energy: 0.7 },
  drill: { tempo: 140, brightness: 0.35, darkness: 0.65, distortion: 0.25, energy: 0.75 },
  reggaeton: { tempo: 95, brightness: 0.6, darkness: 0.4, distortion: 0.1, energy: 0.7 },
  trance: { tempo: 138, brightness: 0.7, darkness: 0.3, distortion: 0.1, energy: 0.8 },
};

const KEY_ALIASES: Record<string, string> = {
  'c': 'C', 'c#': 'C#', 'db': 'Db',
  'd': 'D', 'd#': 'D#', 'eb': 'Eb',
  'e': 'E',
  'f': 'F', 'f#': 'F#', 'gb': 'Gb',
  'g': 'G', 'g#': 'G#', 'ab': 'Ab',
  'a': 'A', 'a#': 'A#', 'bb': 'Bb',
  'b': 'B',
};

const TEMPO_KEYWORDS: Record<string, number> = {
  slow: 80,
  medium: 110,
  fast: 140,
  very_fast: 160,
  uptempo: 130,
  downtempo: 90,
  midtempo: 105,
  bpm: 0, // placeholder, actual BPM extracted from number
};

// ============================================================================
// TEXT TOKENIZER
// ============================================================================

class TextTokenizer {
  private vocabulary: Map<string, number> = new Map();
  private inverseVocab: Map<number, string> = new Map();
  private vocabSize: number = 0;

  constructor() {
    this.buildVocabulary();
  }

  private buildVocabulary() {
    const allWords = new Set<string>();
    
    // Add all keywords to vocabulary
    for (const keywords of Object.values(INSTRUMENT_KEYWORDS)) {
      keywords.forEach(w => allWords.add(w.toLowerCase()));
    }
    for (const keywords of Object.values(DRUM_TYPE_KEYWORDS)) {
      keywords.forEach(w => allWords.add(w.toLowerCase()));
    }
    for (const keywords of Object.values(BASS_TYPE_KEYWORDS)) {
      keywords.forEach(w => allWords.add(w.toLowerCase()));
    }
    for (const keywords of Object.values(SYNTH_TYPE_KEYWORDS)) {
      keywords.forEach(w => allWords.add(w.toLowerCase()));
    }
    Object.keys(MOOD_KEYWORDS).forEach(w => allWords.add(w.toLowerCase()));
    Object.keys(GENRE_TEMPLATES).forEach(w => allWords.add(w.toLowerCase()));
    Object.keys(KEY_ALIASES).forEach(w => allWords.add(w.toLowerCase()));
    Object.keys(TEMPO_KEYWORDS).forEach(w => allWords.add(w.toLowerCase()));

    // Add common music production terms
    const additionalTerms = [
      'at', 'in', 'with', 'and', 'the', 'a', 'an',
      'major', 'minor', 'bpm', 'key', 'tempo',
      'long', 'short', 'high', 'low', 'mid',
      'open', 'closed', 'tight', 'loose',
      'wet', 'dry', 'heavy', 'light',
      'modern', 'vintage', 'classic', 'retro',
      'simple', 'complex', 'minimal', 'maximal',
      'mono', 'stereo', 'wide', 'narrow',
    ];
    additionalTerms.forEach(w => allWords.add(w.toLowerCase()));

    // Build vocabulary mapping
    let idx = 1; // 0 reserved for padding/unknown
    this.vocabulary.set('<PAD>', 0);
    this.inverseVocab.set(0, '<PAD>');
    
    for (const word of allWords) {
      this.vocabulary.set(word, idx);
      this.inverseVocab.set(idx, word);
      idx++;
    }
    
    this.vocabSize = idx;
  }

  tokenize(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9#\-\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    return words.map(w => this.vocabulary.get(w) || 0);
  }

  getVocabSize(): number {
    return this.vocabSize;
  }

  getWord(index: number): string {
    return this.inverseVocab.get(index) || '<UNK>';
  }
}

// ============================================================================
// INTENT CLASSIFIER (Rule-based + ML hybrid)
// ============================================================================

class IntentClassifier {
  private model: tf.LayersModel | null = null;
  private tokenizer: TextTokenizer;
  private isTraining: boolean = false;
  
  constructor(tokenizer: TextTokenizer) {
    this.tokenizer = tokenizer;
  }

  async initialize(): Promise<void> {
    // Build a simple neural network for intent classification
    // In practice, this would be pre-trained on music production terminology
    this.model = tf.sequential({
      layers: [
        tf.layers.embedding({
          inputDim: this.tokenizer.getVocabSize() + 1,
          outputDim: 32,
          inputLength: 20,
        }),
        tf.layers.globalAveragePooling1d({}),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ 
          units: Object.keys(INSTRUMENT_KEYWORDS).length, 
          activation: 'softmax' 
        }),
      ],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  }

  classifyWithRules(text: string): ParsedIntent {
    const lowerText = text.toLowerCase();
    const scores: Record<InstrumentCategory, number> = {
      drums: 0, bass: 0, synth: 0, pad: 0, pluck: 0, arp: 0, fx: 0,
    };

    // Score each category based on keyword matches
    for (const [category, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          scores[category as InstrumentCategory] += 1;
          // Exact word match gets bonus
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(lowerText)) {
            scores[category as InstrumentCategory] += 0.5;
          }
        }
      }
    }

    // Specific drum type detection
    for (const [drumType, keywords] of Object.entries(DRUM_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          scores.drums += 1.5; // Boost drums score
        }
      }
    }

    // Find highest scoring category
    let maxScore = 0;
    let bestCategory: InstrumentCategory = 'synth'; // default

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category as InstrumentCategory;
      }
    }

    // Determine subtype
    let subType = 'default';
    
    if (bestCategory === 'drums') {
      for (const [drumType, keywords] of Object.entries(DRUM_TYPE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            subType = drumType;
            break;
          }
        }
        if (subType !== 'default') break;
      }
    } else if (bestCategory === 'bass') {
      for (const [bassType, keywords] of Object.entries(BASS_TYPE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            subType = bassType;
            break;
          }
        }
        if (subType !== 'default') break;
      }
    } else if (bestCategory === 'synth' || bestCategory === 'pad' || bestCategory === 'pluck') {
      for (const [synthType, keywords] of Object.entries(SYNTH_TYPE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            subType = synthType;
            break;
          }
        }
        if (subType !== 'default') break;
      }
    }

    // Calculate confidence
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

    return {
      category: bestCategory,
      subType: subType === 'default' ? this.getDefaultSubType(bestCategory) : subType,
      confidence: Math.min(confidence, 0.95),
    };
  }

  private getDefaultSubType(category: InstrumentCategory): string {
    switch (category) {
      case 'drums': return 'kick';
      case 'bass': return '808';
      case 'synth': return 'lead';
      case 'pad': return 'pad';
      case 'pluck': return 'pluck';
      case 'arp': return 'arp';
      case 'fx': return 'riser';
      default: return 'default';
    }
  }

  async classify(text: string): Promise<ParsedIntent> {
    // For now, use rule-based classification
    // The ML model can be trained with user feedback over time
    return this.classifyWithRules(text);
  }
}

// ============================================================================
// PARAMETER EXTRACTOR
// ============================================================================

class ParameterExtractor {
  extractParameters(text: string): ExtractedParameters {
    const lowerText = text.toLowerCase();
    
    // Default parameters
    const params: ExtractedParameters = {
      tempo: 120,
      key: 'C',
      scale: 'minor',
      mood: 'neutral',
      genre: 'electronic',
      brightness: 0.5,
      darkness: 0.5,
      attack: 0.3,
      decay: 0.5,
      distortion: 0.1,
      width: 0.5,
      depth: 0.5,
      energy: 0.6,
    };

    // Extract tempo
    const tempoMatch = text.match(/(\d{2,3})\s*bpm/i);
    if (tempoMatch) {
      params.tempo = parseInt(tempoMatch[1], 10);
    } else {
      // Check tempo keywords
      for (const [keyword, tempo] of Object.entries(TEMPO_KEYWORDS)) {
        if (lowerText.includes(keyword) && tempo > 0) {
          params.tempo = tempo;
          break;
        }
      }
    }

    // Extract key
    const keyMatch = text.match(/\b([A-Ga-g][#b]?)\s*(major|minor|maj|min)?\b/);
    if (keyMatch) {
      const rawKey = keyMatch[1].toLowerCase();
      params.key = KEY_ALIASES[rawKey] || rawKey.toUpperCase();
      if (keyMatch[2]) {
        params.scale = keyMatch[2].toLowerCase().startsWith('maj') ? 'major' : 'minor';
      }
    }

    // Extract genre
    for (const genre of Object.keys(GENRE_TEMPLATES)) {
      if (lowerText.includes(genre)) {
        params.genre = genre;
        const template = GENRE_TEMPLATES[genre];
        Object.assign(params, template);
        break;
      }
    }

    // Extract mood
    for (const [mood, moodParams] of Object.entries(MOOD_KEYWORDS)) {
      if (lowerText.includes(mood)) {
        params.mood = mood;
        params.brightness = moodParams.brightness;
        params.energy = moodParams.energy;
        params.attack = moodParams.attack;
        params.darkness = 1 - params.brightness;
        break;
      }
    }

    // Specific parameter keywords
    if (lowerText.includes('short') || lowerText.includes('tight')) {
      params.decay *= 0.5;
    }
    if (lowerText.includes('long') || lowerText.includes('sustained')) {
      params.decay *= 2;
    }
    if (lowerText.includes('distorted') || lowerText.includes('distortion')) {
      params.distortion = 0.6;
    }
    if (lowerText.includes('clean')) {
      params.distortion = 0;
    }
    if (lowerText.includes('wide') || lowerText.includes('stereo')) {
      params.width = 0.9;
    }
    if (lowerText.includes('mono') || lowerText.includes('centered')) {
      params.width = 0;
    }
    if (lowerText.includes('open')) {
      params.decay = Math.max(params.decay, 0.4);
    }
    if (lowerText.includes('closed')) {
      params.decay = Math.min(params.decay, 0.1);
    }

    return params;
  }
}

// ============================================================================
// SYNTHESIS PARAMETER MAPPER
// ============================================================================

class SynthesisMapper {
  mapToDrumParams(intent: ParsedIntent, extracted: ExtractedParameters): DrumParams {
    const baseParams: DrumParams = {
      type: intent.subType as DrumParams['type'],
      decay: extracted.decay,
      tone: extracted.brightness,
      snap: extracted.attack < 0.3 ? 0.9 : 0.5,
      distortion: extracted.distortion,
    };

    // Type-specific adjustments
    switch (intent.subType) {
      case 'kick':
        baseParams.pitch = 40 + extracted.brightness * 30; // 40-70 Hz
        baseParams.decay = 0.3 + extracted.decay * 0.5;
        break;
      case 'snare':
        baseParams.pitch = 150 + extracted.brightness * 100;
        baseParams.noise = 0.4 + extracted.darkness * 0.4;
        break;
      case 'hihat':
        baseParams.decay = extracted.decay < 0.3 ? 0.05 : 0.3; // closed vs open
        baseParams.tone = 0.5 + extracted.brightness * 0.4;
        break;
      case 'clap':
        baseParams.decay = 0.2 + extracted.decay * 0.2;
        break;
    }

    return baseParams;
  }

  mapToBassParams(intent: ParsedIntent, extracted: ExtractedParameters): BassParams {
    const filterEnv: EnvelopeParams = {
      attack: extracted.attack * 0.1,
      decay: extracted.decay,
      sustain: 0.5,
      release: 0.3,
    };

    const filter: FilterParams = {
      type: 'lowpass',
      cutoff: 200 + extracted.brightness * 3000,
      resonance: 2 + extracted.depth * 8,
      envAmount: 0.3 + extracted.energy * 0.5,
      envelope: filterEnv,
    };

    return {
      type: intent.subType as BassType,
      note: extracted.key,
      octave: intent.subType === 'sub' ? 1 : 2,
      filter,
      distortion: extracted.distortion,
      subOscMix: intent.subType === 'sub' ? 1 : 0.3,
    };
  }

  mapToSynthParams(intent: ParsedIntent, extracted: ExtractedParameters): SynthParams {
    const ampEnv: EnvelopeParams = {
      attack: extracted.attack,
      decay: extracted.decay * 0.5,
      sustain: intent.category === 'pad' ? 0.8 : 0.6,
      release: intent.category === 'pad' ? 1.5 : 0.3,
    };

    const filterEnv: EnvelopeParams = {
      attack: extracted.attack * 0.5,
      decay: extracted.decay,
      sustain: 0.4,
      release: 0.5,
    };

    const filter: FilterParams = {
      type: 'lowpass',
      cutoff: 500 + extracted.brightness * 8000,
      resonance: 2 + extracted.depth * 6,
      envAmount: 0.3 + extracted.energy * 0.5,
      envelope: filterEnv,
    };

    // Determine oscillator types based on characteristics
    let oscType: OscillatorType = 'sawtooth';
    if (extracted.brightness < 0.3) {
      oscType = 'triangle';
    } else if (extracted.energy > 0.7) {
      oscType = 'square';
    }

    const params: SynthParams = {
      type: intent.subType as SynthType,
      oscillators: [
        { type: oscType, frequency: 1, detune: 0 },
      ],
      filter,
      ampEnvelope: ampEnv,
    };

    // Add second oscillator for richness
    if (extracted.depth > 0.5 || intent.category === 'pad') {
      params.oscillators.push({
        type: oscType === 'sawtooth' ? 'square' : 'triangle',
        frequency: 1,
        detune: 7,
      });
    }

    // Add unison for width
    if (extracted.width > 0.3) {
      params.unison = {
        voices: extracted.width > 0.6 ? 5 : 3,
        detune: 10 + extracted.width * 20,
        spread: extracted.width,
      };
    }

    // Add LFO for pads and atmospheric sounds
    if (intent.category === 'pad' || intent.subType === 'pad') {
      params.lfo = {
        rate: 0.3 + extracted.energy * 0.5,
        depth: 0.1 + extracted.depth * 0.2,
        target: 'filter',
      };
    }

    return params;
  }
}

// ============================================================================
// MAIN TEXT-TO-SYNTH AI CLASS
// ============================================================================

export class TextToSynthAI {
  private tokenizer: TextTokenizer;
  private intentClassifier: IntentClassifier;
  private parameterExtractor: ParameterExtractor;
  private synthesisMapper: SynthesisMapper;
  private initialized: boolean = false;

  constructor() {
    this.tokenizer = new TextTokenizer();
    this.intentClassifier = new IntentClassifier(this.tokenizer);
    this.parameterExtractor = new ParameterExtractor();
    this.synthesisMapper = new SynthesisMapper();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.intentClassifier.initialize();
    this.initialized = true;
  }

  async parseText(text: string): Promise<GenerationRequest> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Classify intent
    const intent = await this.intentClassifier.classify(text);
    
    // Extract parameters
    const params = this.parameterExtractor.extractParameters(text);
    
    // Map to synthesis parameters
    let drumParams: DrumParams | undefined;
    let bassParams: BassParams | undefined;
    let synthParams: SynthParams | undefined;

    switch (intent.category) {
      case 'drums':
        drumParams = this.synthesisMapper.mapToDrumParams(intent, params);
        break;
      case 'bass':
        bassParams = this.synthesisMapper.mapToBassParams(intent, params);
        break;
      case 'synth':
      case 'pad':
      case 'pluck':
      case 'arp':
        synthParams = this.synthesisMapper.mapToSynthParams(intent, params);
        break;
    }

    // Determine duration based on context
    let duration = 2; // default 2 seconds
    let patternLength = 4; // default 4 bars
    
    if (text.toLowerCase().includes('loop')) {
      patternLength = 4;
      duration = (60 / params.tempo) * 4 * patternLength; // 4 bars
    } else if (text.toLowerCase().includes('one-shot') || text.toLowerCase().includes('one shot')) {
      duration = 1;
      patternLength = 1;
    }

    return {
      text,
      intent,
      params,
      drumParams,
      bassParams,
      synthParams,
      duration,
      patternLength,
    };
  }

  // Get suggested variations based on the parsed request
  getSuggestions(request: GenerationRequest): string[] {
    const suggestions: string[] = [];
    const { intent, params } = request;

    // Genre variations
    const otherGenres = Object.keys(GENRE_TEMPLATES)
      .filter(g => g !== params.genre)
      .slice(0, 3);
    
    for (const genre of otherGenres) {
      suggestions.push(`${intent.subType} ${genre} style`);
    }

    // Mood variations
    if (params.mood !== 'neutral') {
      const moodOpposites: Record<string, string> = {
        dark: 'bright',
        bright: 'dark',
        aggressive: 'soft',
        soft: 'aggressive',
        warm: 'cold',
        cold: 'warm',
      };
      const opposite = moodOpposites[params.mood];
      if (opposite) {
        suggestions.push(`${opposite} ${intent.subType}`);
      }
    }

    // Tempo variations
    suggestions.push(`${intent.subType} at ${params.tempo + 20}bpm`);
    suggestions.push(`${intent.subType} at ${params.tempo - 20}bpm`);

    return suggestions.slice(0, 5);
  }
}

export default TextToSynthAI;
