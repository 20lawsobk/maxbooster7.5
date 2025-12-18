/**
 * Pattern Generator - In-House Algorithmic Pattern Generation
 * 
 * Generates musical patterns for:
 * - Drum loops (kick, snare, hi-hat patterns)
 * - Bass lines (root notes, octaves, rhythms)
 * - Melodic sequences (arpeggios, melodies)
 * 
 * Uses AI-driven rules and probability matrices
 * 100% in-house, no external APIs
 */

import { 
  SynthesizerEngine, 
  DRUM_PRESETS, 
  BASS_PRESETS,
  SYNTH_PRESETS,
  type DrumParams,
  type BassParams,
  type SynthParams 
} from './SynthesizerEngine.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PatternStep {
  active: boolean;
  velocity: number;    // 0-1
  probability: number; // 0-1, chance of playing
  accent: boolean;
}

export interface DrumPattern {
  kick: PatternStep[];
  snare: PatternStep[];
  hihat: PatternStep[];
  clap: PatternStep[];
  perc: PatternStep[];
  steps: number;
  swing: number;       // 0-1
}

export interface NoteEvent {
  note: string;
  octave: number;
  time: number;        // in beats
  duration: number;    // in beats
  velocity: number;    // 0-1
}

export interface BassPattern {
  notes: NoteEvent[];
  steps: number;
}

export interface MelodicPattern {
  notes: NoteEvent[];
  steps: number;
}

export interface GenerationConfig {
  tempo: number;
  key: string;
  scale: string;
  bars: number;
  stepsPerBar: number;  // Usually 16 for 16th notes
  genre: string;
  energy: number;       // 0-1
  complexity: number;   // 0-1
  swing: number;        // 0-1
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCALE_INTERVALS: Record<string, number[]> = {
  'major': [0, 2, 4, 5, 7, 9, 11],
  'minor': [0, 2, 3, 5, 7, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'phrygian': [0, 1, 3, 5, 7, 8, 10],
  'lydian': [0, 2, 4, 6, 7, 9, 11],
  'mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'pentatonic_major': [0, 2, 4, 7, 9],
  'pentatonic_minor': [0, 3, 5, 7, 10],
  'blues': [0, 3, 5, 6, 7, 10],
  'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
};

const NOTE_TO_MIDI: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

const MIDI_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Genre-specific probability matrices for drums
const DRUM_PATTERNS: Record<string, Record<string, number[]>> = {
  trap: {
    kick: [1, 0, 0, 0, 0, 0, 0.3, 0, 1, 0, 0, 0.2, 0.5, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9, 0.5],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.3],
  },
  house: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  hiphop: {
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0.5],
    clap: [0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
  },
  dnb: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  techno: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  lofi: {
    kick: [1, 0, 0, 0, 0, 0, 0.3, 0, 1, 0, 0, 0, 0, 0, 0.2, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.2, 1, 0, 0, 0],
    hihat: [0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.4],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  dubstep: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.5, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5],
  },
};

// ============================================================================
// SEEDED RANDOM
// ============================================================================

class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed || Date.now();
  }

  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  weighted(probabilities: number[]): number {
    const sum = probabilities.reduce((a, b) => a + b, 0);
    let random = this.next() * sum;
    for (let i = 0; i < probabilities.length; i++) {
      random -= probabilities[i];
      if (random <= 0) return i;
    }
    return probabilities.length - 1;
  }
}

// ============================================================================
// DRUM PATTERN GENERATOR
// ============================================================================

export function generateDrumPattern(config: GenerationConfig, seed?: number): DrumPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  
  // Get base pattern for genre
  const basePattern = DRUM_PATTERNS[config.genre] || DRUM_PATTERNS.hiphop;
  
  // Initialize pattern
  const pattern: DrumPattern = {
    kick: [],
    snare: [],
    hihat: [],
    clap: [],
    perc: [],
    steps: totalSteps,
    swing: config.swing,
  };

  // Generate each drum track
  for (let step = 0; step < totalSteps; step++) {
    const baseStep = step % 16; // Wrap to 16-step pattern
    
    // Kick
    const kickProb = basePattern.kick[baseStep] * (0.7 + config.energy * 0.3);
    pattern.kick.push({
      active: rng.next() < kickProb,
      velocity: 0.7 + rng.next() * 0.3,
      probability: kickProb,
      accent: baseStep === 0,
    });

    // Snare
    const snareProb = basePattern.snare[baseStep];
    pattern.snare.push({
      active: rng.next() < snareProb,
      velocity: 0.8 + rng.next() * 0.2,
      probability: snareProb,
      accent: snareProb > 0.5,
    });

    // Hi-hat (complexity affects density)
    let hihatProb = basePattern.hihat[baseStep];
    if (config.complexity > 0.5) {
      hihatProb = Math.min(hihatProb + 0.2, 1);
    }
    pattern.hihat.push({
      active: rng.next() < hihatProb,
      velocity: 0.5 + rng.next() * 0.5,
      probability: hihatProb,
      accent: false,
    });

    // Clap
    const clapProb = basePattern.clap[baseStep];
    pattern.clap.push({
      active: rng.next() < clapProb,
      velocity: 0.75 + rng.next() * 0.25,
      probability: clapProb,
      accent: clapProb > 0.5,
    });

    // Percussion (based on complexity)
    const percProb = config.complexity * 0.3 * (step % 4 === 2 ? 1 : 0.3);
    pattern.perc.push({
      active: rng.next() < percProb,
      velocity: 0.4 + rng.next() * 0.4,
      probability: percProb,
      accent: false,
    });
  }

  return pattern;
}

// ============================================================================
// BASS PATTERN GENERATOR
// ============================================================================

export function generateBassPattern(config: GenerationConfig, seed?: number): BassPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  const notes: NoteEvent[] = [];
  
  // Get scale notes
  const scaleIntervals = SCALE_INTERVALS[config.scale] || SCALE_INTERVALS.minor;
  const rootMidi = NOTE_TO_MIDI[config.key] || 0;
  
  // Bass typically follows kick pattern
  const kickPattern = DRUM_PATTERNS[config.genre]?.kick || DRUM_PATTERNS.hiphop.kick;
  
  // Generate bass notes
  let currentScaleIndex = 0; // Start on root
  
  for (let step = 0; step < totalSteps; step++) {
    const baseStep = step % 16;
    const kickProb = kickPattern[baseStep];
    
    // Bass typically plays on kick hits
    if (rng.next() < kickProb * 0.8) {
      // Determine note
      const interval = scaleIntervals[currentScaleIndex % scaleIntervals.length];
      const midiNote = rootMidi + interval;
      const noteName = MIDI_TO_NOTE[midiNote % 12];
      
      // Duration based on next note or end of bar
      let duration = 0.25; // 16th note default
      if (kickProb > 0.5) {
        duration = 0.5; // 8th note for strong beats
      }
      if (config.genre === 'trap' && rng.next() < 0.3) {
        duration = 1; // Longer 808 tails
      }
      
      notes.push({
        note: noteName,
        octave: 1, // Low bass octave
        time: step / 4, // Convert to beats
        duration,
        velocity: 0.7 + kickProb * 0.3,
      });
      
      // Movement based on complexity
      if (rng.next() < config.complexity * 0.5) {
        // Move to different scale degree
        const movement = rng.nextInt(-2, 2);
        currentScaleIndex = (currentScaleIndex + movement + scaleIntervals.length) % scaleIntervals.length;
      } else {
        // Stay on root or fifth
        currentScaleIndex = rng.next() < 0.7 ? 0 : 4 % scaleIntervals.length;
      }
    }
  }

  return { notes, steps: totalSteps };
}

// ============================================================================
// MELODIC PATTERN GENERATOR
// ============================================================================

export function generateMelodicPattern(
  config: GenerationConfig,
  type: 'lead' | 'pad' | 'arp' = 'lead',
  seed?: number
): MelodicPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  const notes: NoteEvent[] = [];
  
  // Get scale notes
  const scaleIntervals = SCALE_INTERVALS[config.scale] || SCALE_INTERVALS.minor;
  const rootMidi = NOTE_TO_MIDI[config.key] || 0;
  
  if (type === 'arp') {
    // Arpeggio pattern
    const arpPattern = [0, 2, 4, 2]; // 1-3-5-3 pattern
    let patternIndex = 0;
    
    for (let step = 0; step < totalSteps; step++) {
      if (step % 2 === 0 || rng.next() < config.complexity * 0.5) { // 8th notes + variation
        const scaleIndex = arpPattern[patternIndex % arpPattern.length];
        const interval = scaleIntervals[scaleIndex % scaleIntervals.length];
        const midiNote = rootMidi + interval;
        const noteName = MIDI_TO_NOTE[midiNote % 12];
        
        notes.push({
          note: noteName,
          octave: 4,
          time: step / 4,
          duration: 0.25,
          velocity: 0.6 + rng.next() * 0.3,
        });
        
        patternIndex++;
      }
    }
  } else if (type === 'pad') {
    // Long sustained chords
    for (let bar = 0; bar < config.bars; bar++) {
      const chordRoot = bar % 4 === 0 ? 0 : (bar % 2 === 0 ? 4 : 3); // I-V-IV progression
      
      // Add chord tones
      for (const chordTone of [0, 2, 4]) { // Root, 3rd, 5th
        const scaleIndex = (chordRoot + chordTone) % scaleIntervals.length;
        const interval = scaleIntervals[scaleIndex];
        const midiNote = rootMidi + interval;
        const noteName = MIDI_TO_NOTE[midiNote % 12];
        
        notes.push({
          note: noteName,
          octave: 4,
          time: bar * 4,
          duration: 4, // Whole bar
          velocity: 0.5 + rng.next() * 0.2,
        });
      }
    }
  } else {
    // Lead melody
    let currentScaleIndex = 0;
    let lastNoteTime = -1;
    
    for (let step = 0; step < totalSteps; step++) {
      // Probability of note based on position and complexity
      const isDownbeat = step % 4 === 0;
      const noteProb = isDownbeat ? 0.8 : (0.2 + config.complexity * 0.4);
      
      if (rng.next() < noteProb && step - lastNoteTime >= 1) {
        const interval = scaleIntervals[currentScaleIndex % scaleIntervals.length];
        const midiNote = rootMidi + interval;
        const noteName = MIDI_TO_NOTE[midiNote % 12];
        
        // Duration: longer on downbeats
        let duration = isDownbeat ? (0.5 + rng.next() * 0.5) : (0.25 + rng.next() * 0.25);
        
        notes.push({
          note: noteName,
          octave: 4 + rng.nextInt(0, 1),
          time: step / 4,
          duration,
          velocity: isDownbeat ? 0.8 : (0.5 + rng.next() * 0.3),
        });
        
        lastNoteTime = step;
        
        // Melody movement
        if (rng.next() < 0.6) {
          // Stepwise motion
          currentScaleIndex += rng.next() < 0.5 ? 1 : -1;
        } else {
          // Larger leap
          currentScaleIndex += rng.nextInt(-3, 3);
        }
        
        // Keep in range
        currentScaleIndex = Math.max(0, Math.min(scaleIntervals.length - 1, currentScaleIndex));
      }
    }
  }

  return { notes, steps: totalSteps };
}

// ============================================================================
// PATTERN TO AUDIO RENDERER
// ============================================================================

export class PatternRenderer {
  private synth: SynthesizerEngine;
  private sampleRate: number;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
    this.synth = new SynthesizerEngine(sampleRate);
  }

  renderDrumPattern(
    pattern: DrumPattern,
    tempo: number,
    genre: string = 'trap'
  ): Float32Array {
    const samplesPerBeat = Math.floor(this.sampleRate * 60 / tempo);
    const samplesPerStep = Math.floor(samplesPerBeat / 4); // 16th notes
    const totalSamples = pattern.steps * samplesPerStep;
    const output = new Float32Array(totalSamples);

    // Render each drum
    const drumConfigs: Array<{ 
      track: PatternStep[], 
      type: 'kick' | 'snare' | 'hihat' | 'clap',
      preset: string,
      gain: number 
    }> = [
      { track: pattern.kick, type: 'kick', preset: genre === 'house' ? 'house' : 'trap', gain: 1.0 },
      { track: pattern.snare, type: 'snare', preset: 'trap', gain: 0.9 },
      { track: pattern.hihat, type: 'hihat', preset: 'closed', gain: 0.6 },
      { track: pattern.clap, type: 'clap', preset: 'trap', gain: 0.7 },
    ];

    for (const config of drumConfigs) {
      for (let step = 0; step < pattern.steps; step++) {
        if (config.track[step]?.active) {
          // Apply swing to off-beat 16ths
          let swingOffset = 0;
          if (step % 2 === 1 && pattern.swing > 0) {
            swingOffset = Math.floor(samplesPerStep * pattern.swing * 0.5);
          }

          const samplePosition = step * samplesPerStep + swingOffset;
          const drumSound = this.synth.generateDrum(config.type, config.preset, 0.5);
          
          // Mix into output
          const velocity = config.track[step].velocity * config.gain;
          for (let i = 0; i < drumSound.length && samplePosition + i < totalSamples; i++) {
            output[samplePosition + i] += drumSound[i] * velocity;
          }
        }
      }
    }

    // Normalize to prevent clipping
    let maxAmp = 0;
    for (let i = 0; i < output.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(output[i]));
    }
    if (maxAmp > 0.9) {
      const scale = 0.9 / maxAmp;
      for (let i = 0; i < output.length; i++) {
        output[i] *= scale;
      }
    }

    return output;
  }

  renderBassPattern(
    pattern: BassPattern,
    tempo: number,
    preset: string = 'trap808'
  ): Float32Array {
    const samplesPerBeat = Math.floor(this.sampleRate * 60 / tempo);
    const totalBeats = pattern.steps / 4;
    const totalSamples = Math.floor(totalBeats * samplesPerBeat);
    const output = new Float32Array(totalSamples);

    for (const note of pattern.notes) {
      const startSample = Math.floor(note.time * samplesPerBeat);
      const duration = note.duration * samplesPerBeat / this.sampleRate;
      
      const bassSound = this.synth.generateBass(
        note.note,
        note.octave,
        preset,
        Math.max(0.3, duration)
      );

      // Mix into output
      for (let i = 0; i < bassSound.length && startSample + i < totalSamples; i++) {
        output[startSample + i] += bassSound[i] * note.velocity;
      }
    }

    // Normalize
    let maxAmp = 0;
    for (let i = 0; i < output.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(output[i]));
    }
    if (maxAmp > 0.9) {
      const scale = 0.9 / maxAmp;
      for (let i = 0; i < output.length; i++) {
        output[i] *= scale;
      }
    }

    return output;
  }

  renderMelodicPattern(
    pattern: MelodicPattern,
    tempo: number,
    type: 'lead' | 'pad' | 'pluck' = 'lead',
    preset: string = 'classic'
  ): Float32Array {
    const samplesPerBeat = Math.floor(this.sampleRate * 60 / tempo);
    const totalBeats = pattern.steps / 4;
    const totalSamples = Math.floor(totalBeats * samplesPerBeat);
    const output = new Float32Array(totalSamples);

    for (const note of pattern.notes) {
      const startSample = Math.floor(note.time * samplesPerBeat);
      const duration = note.duration * 60 / tempo; // Convert to seconds
      
      const synthSound = this.synth.generateSynth(
        note.note,
        note.octave,
        type,
        preset,
        Math.max(0.1, duration)
      );

      // Mix into output
      for (let i = 0; i < synthSound.length && startSample + i < totalSamples; i++) {
        output[startSample + i] += synthSound[i] * note.velocity;
      }
    }

    // Normalize
    let maxAmp = 0;
    for (let i = 0; i < output.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(output[i]));
    }
    if (maxAmp > 0.9) {
      const scale = 0.9 / maxAmp;
      for (let i = 0; i < output.length; i++) {
        output[i] *= scale;
      }
    }

    return output;
  }

  // Combine multiple patterns into one output
  mixPatterns(patterns: Float32Array[], gains: number[] = []): Float32Array {
    // Find max length
    let maxLength = 0;
    for (const pattern of patterns) {
      maxLength = Math.max(maxLength, pattern.length);
    }

    const output = new Float32Array(maxLength);

    for (let p = 0; p < patterns.length; p++) {
      const gain = gains[p] ?? 1;
      for (let i = 0; i < patterns[p].length; i++) {
        output[i] += patterns[p][i] * gain;
      }
    }

    // Normalize
    let maxAmp = 0;
    for (let i = 0; i < output.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(output[i]));
    }
    if (maxAmp > 0.9) {
      const scale = 0.9 / maxAmp;
      for (let i = 0; i < output.length; i++) {
        output[i] *= scale;
      }
    }

    return output;
  }
}

export default PatternRenderer;
