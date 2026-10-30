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

import { SynthesizerEngine } from "./SynthesizerEngine.js";

// ============================================================================
// AUDIO UTILITIES
// ============================================================================

function softLimitMaster(x: number): number {
  if (Math.abs(x) < 0.75) return x;
  const sign = x > 0 ? 1 : -1;
  const abs = Math.abs(x);
  return sign * (0.75 + Math.tanh((abs - 0.75) * 2.5) * 0.23);
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PatternStep {
  active: boolean;
  velocity: number; // 0-1
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
  swing: number; // 0-1
}

export interface NoteEvent {
  note: string;
  octave: number;
  time: number; // in beats
  duration: number; // in beats
  velocity: number; // 0-1
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
  stepsPerBar: number; // Usually 16 for 16th notes
  genre: string;
  energy: number; // 0-1
  complexity: number; // 0-1
  swing: number; // 0-1
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
};

const NOTE_TO_MIDI: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const MIDI_TO_NOTE = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Genre-specific probability matrices for drums
const DRUM_PATTERNS: Record<string, Record<string, number[]>> = {
  trap: {
    kick: [1, 0, 0, 0, 0, 0, 0.3, 0, 1, 0, 0, 0.2, 0.5, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [
      0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9, 0.5, 0.8, 0.5, 0.9,
      0.5,
    ],
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
    hihat: [
      0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7,
      0.4,
    ],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  dubstep: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.5, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [
      0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8,
      0.5,
    ],
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

export function generateDrumPattern(
  config: GenerationConfig,
  seed?: number,
): DrumPattern {
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

export function generateBassPattern(
  config: GenerationConfig,
  seed?: number,
): BassPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  const notes: NoteEvent[] = [];

  // Get scale notes
  const scaleIntervals = SCALE_INTERVALS[config.scale] || SCALE_INTERVALS.minor;
  const rootMidi = NOTE_TO_MIDI[config.key] || 0;

  // Bass typically follows kick pattern
  const kickPattern =
    DRUM_PATTERNS[config.genre]?.kick || DRUM_PATTERNS.hiphop.kick;

  // Generate bass notes
  let currentScaleIndex = 0; // Start on root

  for (let step = 0; step < totalSteps; step++) {
    const baseStep = step % 16;
    const kickProb = kickPattern[baseStep];

    // Bass typically plays on kick hits
    if (rng.next() < kickProb * 0.8) {
      // Determine note
      const interval =
        scaleIntervals[currentScaleIndex % scaleIntervals.length];
      const midiNote = rootMidi + interval;
      const noteName = MIDI_TO_NOTE[midiNote % 12];

      // Duration based on next note or end of bar
      let duration = 0.25; // 16th note default
      if (kickProb > 0.5) {
        duration = 0.5; // 8th note for strong beats
      }
      if (config.genre === "trap" && rng.next() < 0.3) {
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
        currentScaleIndex =
          (currentScaleIndex + movement + scaleIntervals.length) %
          scaleIntervals.length;
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
  type: "lead" | "pad" | "arp" = "lead",
  seed?: number,
): MelodicPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  const notes: NoteEvent[] = [];

  // Get scale notes
  const scaleIntervals = SCALE_INTERVALS[config.scale] || SCALE_INTERVALS.minor;
  const rootMidi = NOTE_TO_MIDI[config.key] || 0;

  if (type === "arp") {
    // Arpeggio pattern
    const arpPattern = [0, 2, 4, 2]; // 1-3-5-3 pattern
    let patternIndex = 0;

    for (let step = 0; step < totalSteps; step++) {
      if (step % 2 === 0 || rng.next() < config.complexity * 0.5) {
        // 8th notes + variation
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
  } else if (type === "pad") {
    // Long sustained chords
    for (let bar = 0; bar < config.bars; bar++) {
      const chordRoot = bar % 4 === 0 ? 0 : bar % 2 === 0 ? 4 : 3; // I-V-IV progression

      // Add chord tones
      for (const chordTone of [0, 2, 4]) {
        // Root, 3rd, 5th
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
      const noteProb = isDownbeat ? 0.8 : 0.2 + config.complexity * 0.4;

      if (rng.next() < noteProb && step - lastNoteTime >= 1) {
        const interval =
          scaleIntervals[currentScaleIndex % scaleIntervals.length];
        const midiNote = rootMidi + interval;
        const noteName = MIDI_TO_NOTE[midiNote % 12];

        // Duration: longer on downbeats
        let duration = isDownbeat
          ? 0.5 + rng.next() * 0.5
          : 0.25 + rng.next() * 0.25;

        notes.push({
          note: noteName,
          octave: 4 + rng.nextInt(0, 1),
          time: step / 4,
          duration,
          velocity: isDownbeat ? 0.8 : 0.5 + rng.next() * 0.3,
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
        currentScaleIndex = Math.max(
          0,
          Math.min(scaleIntervals.length - 1, currentScaleIndex),
        );
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
    genre: string = "trap",
  ): Float32Array {
    const samplesPerBeat = Math.floor((this.sampleRate * 60) / tempo);
    const samplesPerStep = Math.floor(samplesPerBeat / 4); // 16th notes
    const totalSamples = pattern.steps * samplesPerStep;
    const output = new Float32Array(totalSamples);

    // Render each drum
    const drumConfigs: Array<{
      track: PatternStep[];
      type: "kick" | "snare" | "hihat" | "clap";
      preset: string;
      gain: number;
    }> = [
      {
        track: pattern.kick,
        type: "kick",
        preset: genre === "house" ? "house" : "trap",
        gain: 1.0,
      },
      { track: pattern.snare, type: "snare", preset: "trap", gain: 0.9 },
      { track: pattern.hihat, type: "hihat", preset: "closed", gain: 0.6 },
      { track: pattern.clap, type: "clap", preset: "trap", gain: 0.7 },
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
          const drumSound = this.synth.generateDrum(
            config.type,
            config.preset,
            0.5,
          );

          // Mix into output
          const velocity = config.track[step].velocity * config.gain;
          for (
            let i = 0;
            i < drumSound.length && samplePosition + i < totalSamples;
            i++
          ) {
            output[samplePosition + i] += drumSound[i] * velocity;
          }
        }
      }
    }

    for (let i = 0; i < output.length; i++) {
      output[i] = softLimitMaster(output[i]);
    }

    return output;
  }

  renderBassPattern(
    pattern: BassPattern,
    tempo: number,
    preset: string = "trap808",
  ): Float32Array {
    const samplesPerBeat = Math.floor((this.sampleRate * 60) / tempo);
    const totalBeats = pattern.steps / 4;
    const totalSamples = Math.floor(totalBeats * samplesPerBeat);
    const output = new Float32Array(totalSamples);

    for (const note of pattern.notes) {
      const startSample = Math.floor(note.time * samplesPerBeat);
      const duration = (note.duration * samplesPerBeat) / this.sampleRate;

      const bassSound = this.synth.generateBass(
        note.note,
        note.octave,
        preset,
        Math.max(0.3, duration),
      );

      // Mix into output
      for (
        let i = 0;
        i < bassSound.length && startSample + i < totalSamples;
        i++
      ) {
        output[startSample + i] += bassSound[i] * note.velocity;
      }
    }

    for (let i = 0; i < output.length; i++) {
      output[i] = softLimitMaster(output[i]);
    }

    return output;
  }

  renderMelodicPattern(
    pattern: MelodicPattern,
    tempo: number,
    type: "lead" | "pad" | "pluck" = "lead",
    preset: string = "classic",
    instrumentParams?: {
      brightness: number;
      attack: number;
      decay: number;
      sustain?: number;
      synthType?: "sine" | "square" | "sawtooth" | "triangle";
      instrumentName?: string;
    },
  ): Float32Array {
    const samplesPerBeat = Math.floor((this.sampleRate * 60) / tempo);
    const totalBeats = pattern.steps / 4;
    const totalSamples = Math.floor(totalBeats * samplesPerBeat);
    const output = new Float32Array(totalSamples);

    for (const note of pattern.notes) {
      const startSample = Math.floor(note.time * samplesPerBeat);
      const duration = (note.duration * 60) / tempo;

      let synthSound: Float32Array;

      if (instrumentParams) {
        synthSound = this.synth.generateSynthWithInstrumentParams(
          note.note,
          note.octave,
          instrumentParams,
          Math.max(0.1, duration),
        );
      } else {
        synthSound = this.synth.generateSynth(
          note.note,
          note.octave,
          type,
          preset,
          Math.max(0.1, duration),
        );
      }

      for (
        let i = 0;
        i < synthSound.length && startSample + i < totalSamples;
        i++
      ) {
        output[startSample + i] += synthSound[i] * note.velocity;
      }
    }

    for (let i = 0; i < output.length; i++) {
      output[i] = softLimitMaster(output[i]);
    }

    return output;
  }

  mixPatterns(patterns: Float32Array[], gains: number[] = []): Float32Array {
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

    for (let i = 0; i < output.length; i++) {
      output[i] = softLimitMaster(output[i]);
    }

    const fadeOutSamples = Math.min(Math.floor(output.length * 0.02), 2048);
    for (let i = 0; i < fadeOutSamples; i++) {
      const fadeGain = i / fadeOutSamples;
      const endIdx = output.length - 1 - i;
      if (endIdx >= 0) {
        output[endIdx] *= fadeGain;
      }
      if (i < output.length) {
        output[i] *= Math.min(1, i / Math.min(fadeOutSamples, 256));
      }
    }

    return output;
  }
}

// ============================================================================
// EUCLIDEAN RHYTHM GENERATOR (Bjorklund's Algorithm)
// ============================================================================

/**
 * Bjorklund's algorithm distributes k pulses across n steps as evenly as possible.
 * E(3,8) = [1,0,0,1,0,0,1,0] — classic tresillo, the foundation of many rhythms.
 */
export function euclideanRhythm(
  pulses: number,
  steps: number,
  rotation: number = 0,
): boolean[] {
  if (pulses <= 0) return new Array(steps).fill(false);
  if (pulses >= steps) return new Array(steps).fill(true);

  const pattern: boolean[] = new Array(steps).fill(false);
  let remainder = pulses;
  let divisor = steps - pulses;
  const counts: number[] = [];
  const remainders: number[] = [];

  while (true) {
    counts.push(Math.floor(divisor / remainder));
    remainders.push(divisor % remainder);
    divisor = remainder;
    remainder = remainders[remainders.length - 1];
    if (remainder <= 1) break;
  }
  counts.push(divisor);

  // Build the binary sequence
  const build = (level: number): boolean[] => {
    if (level === -1) return [false];
    if (level === -2) return [true];

    const seq: boolean[] = [];
    for (let i = 0; i < counts[level]; i++) seq.push(...build(level - 1));
    if (remainders[level] !== 0) seq.push(...build(level - 2));
    return seq;
  };

  const seq = build(counts.length - 1);
  for (let i = 0; i < steps; i++) {
    pattern[(i + rotation) % steps] = seq[i];
  }
  return pattern;
}

/** Euclidean rhythm presets for common music patterns */
export const EUCLIDEAN_PRESETS: Record<
  string,
  {
    kick?: [number, number];
    snare?: [number, number];
    hihat?: [number, number];
  }
> = {
  tresillo: { kick: [3, 8], snare: [2, 8] },
  cinquillo: { kick: [5, 8], hihat: [8, 16] },
  rumba: { kick: [3, 16], snare: [5, 16], hihat: [8, 16] },
  bossa_nova: { kick: [3, 8], snare: [5, 16], hihat: [4, 8] },
  clave_3_2: { kick: [3, 8], snare: [2, 8] },
  clave_son: { kick: [5, 16], hihat: [8, 16] },
  afrobeats: { kick: [4, 16], snare: [3, 16], hihat: [6, 16] },
  reggaeton_d: { kick: [3, 8], snare: [3, 8], hihat: [4, 8] },
  trap_triplet: { kick: [3, 12], hihat: [9, 12] },
  juke_poly: { kick: [5, 16], snare: [7, 16], hihat: [13, 16] },
  amapiano: { kick: [4, 16], snare: [3, 16], hihat: [7, 16] },
  dnb_amen: { kick: [2, 16], snare: [3, 16], hihat: [7, 16] },
};

// ============================================================================
// MICROTIMING & HUMAN-FEEL ENGINE
// ============================================================================

export interface MicrotimingProfile {
  /** Max timing offset in milliseconds per step */
  maxOffsetMs: number;
  /** Velocity variation (0-0.3) */
  velocityVariation: number;
  /** Swing amount applied to even 16th notes (0-0.5) */
  swingAmount: number;
  /** Whether the feel is "behind" or "ahead" of the beat */
  feel: "behind" | "on" | "ahead";
  /** Per-instrument groove bias in samples */
  instrumentBias?: { kick?: number; snare?: number; hihat?: number };
}

const MICROTIMING_PROFILES: Record<string, MicrotimingProfile> = {
  trap: {
    maxOffsetMs: 15,
    velocityVariation: 0.15,
    swingAmount: 0.0,
    feel: "behind",
  },
  hiphop: {
    maxOffsetMs: 12,
    velocityVariation: 0.18,
    swingAmount: 0.25,
    feel: "behind",
    instrumentBias: { kick: -3, snare: 8 },
  },
  house: {
    maxOffsetMs: 5,
    velocityVariation: 0.08,
    swingAmount: 0.05,
    feel: "on",
  },
  techno: {
    maxOffsetMs: 2,
    velocityVariation: 0.05,
    swingAmount: 0.0,
    feel: "on",
  },
  lofi: {
    maxOffsetMs: 20,
    velocityVariation: 0.25,
    swingAmount: 0.35,
    feel: "behind",
  },
  dnb: {
    maxOffsetMs: 6,
    velocityVariation: 0.1,
    swingAmount: 0.0,
    feel: "ahead",
  },
  afrobeats: {
    maxOffsetMs: 18,
    velocityVariation: 0.2,
    swingAmount: 0.15,
    feel: "behind",
  },
  amapiano: {
    maxOffsetMs: 14,
    velocityVariation: 0.17,
    swingAmount: 0.12,
    feel: "behind",
  },
  jazz: {
    maxOffsetMs: 25,
    velocityVariation: 0.3,
    swingAmount: 0.45,
    feel: "behind",
  },
  neosoul: {
    maxOffsetMs: 18,
    velocityVariation: 0.22,
    swingAmount: 0.3,
    feel: "behind",
  },
  funk: {
    maxOffsetMs: 10,
    velocityVariation: 0.15,
    swingAmount: 0.2,
    feel: "on",
    instrumentBias: { snare: 5, hihat: -3 },
  },
  reggaeton: {
    maxOffsetMs: 8,
    velocityVariation: 0.1,
    swingAmount: 0.05,
    feel: "on",
  },
  dubstep: {
    maxOffsetMs: 4,
    velocityVariation: 0.08,
    swingAmount: 0.0,
    feel: "on",
  },
  futurebass: {
    maxOffsetMs: 6,
    velocityVariation: 0.1,
    swingAmount: 0.0,
    feel: "on",
  },
  juke: {
    maxOffsetMs: 3,
    velocityVariation: 0.12,
    swingAmount: 0.05,
    feel: "ahead",
  },
};

/** Apply microtiming to a drum pattern, returning sample offsets per step */
export function applyMicrotiming(
  pattern: DrumPattern,
  sampleRate: number,
  tempo: number,
  genre: string,
  rng: { next: () => number },
): { stepOffsets: number[]; velocityMultipliers: number[][] } {
  const profile = MICROTIMING_PROFILES[genre] || MICROTIMING_PROFILES.hiphop;
  const samplesPerMs = sampleRate / 1000;
  const maxOffsetSamples = profile.maxOffsetMs * samplesPerMs;

  const stepOffsets: number[] = [];
  for (let i = 0; i < pattern.steps; i++) {
    // Swing on off-beat 16ths (odd steps in 4/4)
    let swingOffset = 0;
    if (i % 2 === 1 && profile.swingAmount > 0) {
      const samplesPerStep = Math.floor((sampleRate * 60) / tempo / 4);
      swingOffset = Math.floor(samplesPerStep * profile.swingAmount * 0.5);
    }
    // Random micro-offset
    const microOffset = (rng.next() * 2 - 1) * maxOffsetSamples;
    // Feel bias (positive = behind beat, negative = ahead)
    const feelBias =
      profile.feel === "behind"
        ? maxOffsetSamples * 0.15
        : profile.feel === "ahead"
          ? -maxOffsetSamples * 0.15
          : 0;
    stepOffsets.push(Math.round(swingOffset + microOffset + feelBias));
  }

  // Per-track velocity humanization
  const tracks = ["kick", "snare", "hihat", "clap", "perc"] as const;
  const velocityMultipliers: number[][] = tracks.map(() =>
    Array.from(
      { length: pattern.steps },
      () => 1 + (rng.next() * 2 - 1) * profile.velocityVariation,
    ),
  );

  return { stepOffsets, velocityMultipliers };
}

// ============================================================================
// GROOVE FILL GENERATOR
// ============================================================================

export interface FillConfig {
  bars: number;
  fillBar: number; // Which bar to insert a fill (1-indexed)
  style: "snare-roll" | "tom-run" | "kick-burst" | "hihat-cascade" | "combo";
  intensity: number; // 0-1
}

export function generateFill(
  config: GenerationConfig,
  fillConfig: FillConfig,
  rng: { next: () => number; nextInt: (a: number, b: number) => number },
): Partial<DrumPattern> {
  const stepsPerFill = config.stepsPerBar;
  const fills: Partial<DrumPattern> = {
    kick: Array(stepsPerFill).fill({
      active: false,
      velocity: 0,
      probability: 0,
      accent: false,
    }),
    snare: Array(stepsPerFill).fill({
      active: false,
      velocity: 0,
      probability: 0,
      accent: false,
    }),
    hihat: Array(stepsPerFill).fill({
      active: false,
      velocity: 0,
      probability: 0,
      accent: false,
    }),
    clap: Array(stepsPerFill).fill({
      active: false,
      velocity: 0,
      probability: 0,
      accent: false,
    }),
    perc: Array(stepsPerFill).fill({
      active: false,
      velocity: 0,
      probability: 0,
      accent: false,
    }),
  };

  const mkStep = (
    vel: number,
    prob: number,
    accent: boolean = false,
  ): PatternStep => ({
    active: true,
    velocity: vel,
    probability: prob,
    accent,
  });

  const style =
    fillConfig.style === "combo"
      ? (["snare-roll", "hihat-cascade", "kick-burst"] as const)[
          rng.nextInt(0, 2)
        ]
      : fillConfig.style;

  if (style === "snare-roll") {
    // 16th-note snare roll in last 4–8 steps
    const rollStart = Math.max(
      0,
      stepsPerFill - Math.floor(4 + fillConfig.intensity * 12),
    );
    for (let i = rollStart; i < stepsPerFill; i++) {
      const vel = 0.5 + ((i - rollStart) / (stepsPerFill - rollStart)) * 0.5;
      (fills.snare as PatternStep[])[i] = mkStep(
        vel,
        1,
        i === stepsPerFill - 1,
      );
    }
  } else if (style === "hihat-cascade") {
    // Dense hi-hat run with velocity crescendo
    const start = Math.max(
      0,
      stepsPerFill - Math.floor(8 + fillConfig.intensity * 8),
    );
    for (let i = start; i < stepsPerFill; i++) {
      const vel = 0.3 + ((i - start) / (stepsPerFill - start)) * 0.7;
      (fills.hihat as PatternStep[])[i] = mkStep(vel, 1, false);
    }
  } else if (style === "kick-burst") {
    // Rapid kick pattern — trap / EDM style
    const positions = euclideanRhythm(
      Math.floor(3 + fillConfig.intensity * 5),
      stepsPerFill,
      0,
    );
    positions.forEach((on, i) => {
      if (on)
        (fills.kick as PatternStep[])[i] = mkStep(
          0.7 + rng.next() * 0.3,
          1,
          i === 0,
        );
    });
    // Final snare accent
    if (stepsPerFill > 0) {
      (fills.snare as PatternStep[])[stepsPerFill - 1] = mkStep(1.0, 1, true);
    }
  }

  return fills;
}

// ============================================================================
// EXTENDED GENRE DRUM PATTERNS
// ============================================================================

const EXTENDED_DRUM_PATTERNS: Record<string, Record<string, number[]>> = {
  afrobeats: {
    kick: [1, 0, 0, 0.3, 0, 0, 0.5, 0, 1, 0, 0, 0, 0.4, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.4, 0, 1, 0, 0, 0.2],
    hihat: [
      0.6, 0.4, 0.8, 0.4, 0.6, 0.4, 0.8, 0.6, 0.6, 0.4, 0.8, 0.4, 0.6, 0.4, 0.8,
      0.5,
    ],
    clap: [0, 0, 0, 0, 0.8, 0, 0, 0.3, 0, 0, 0, 0, 0.8, 0, 0, 0.3],
  },
  amapiano: {
    kick: [1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0.3],
    snare: [0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0.2, 0],
    hihat: [
      0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.5, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7,
      0.5,
    ],
    clap: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0],
  },
  dancehall: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.4, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0.2, 0],
    hihat: [
      0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.3, 0.7,
      0.4,
    ],
    clap: [0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0],
  },
  neosoul: {
    kick: [1, 0, 0, 0.2, 0, 0, 0.4, 0, 0.7, 0, 0.3, 0, 0, 0, 0.5, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0.1, 0, 0, 0, 0.3, 1, 0, 0, 0.1],
    hihat: [
      0.5, 0.2, 0.6, 0.2, 0.5, 0.2, 0.6, 0.4, 0.5, 0.2, 0.6, 0.2, 0.5, 0.2, 0.6,
      0.4,
    ],
    clap: [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0],
  },
  futurebass: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hihat: [0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  jerseyclub: {
    kick: [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0.5, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0.7, 0, 0],
    hihat: [
      0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8,
      0.8,
    ],
    clap: [0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0.5, 0],
  },
  reggaeton: {
    kick: [1, 0, 0, 0.7, 0, 0, 1, 0, 0, 0, 0.7, 0, 0, 1, 0, 0],
    snare: [0, 0, 0.6, 0, 0, 0.6, 0, 0, 0.6, 0, 0, 0.6, 0, 0, 0.6, 0],
    hihat: [
      0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7,
      0.5,
    ],
    clap: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  },
  hyperpop: {
    kick: [1, 0, 0.3, 0, 1, 0, 0, 0.5, 0, 1, 0, 0, 1, 0, 0.3, 0],
    snare: [0, 0.4, 0, 0, 0, 0, 1, 0, 0, 0.4, 0, 0, 0, 0, 1, 0.5],
    hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    clap: [0, 0, 0.6, 0, 1, 0, 0, 0.6, 0, 0, 0.6, 0, 1, 0, 0, 0.6],
  },
  gqom: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0, 0],
    snare: [0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0.3],
    hihat: [0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  juke: {
    kick: [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
    snare: [0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0.8, 0, 0, 0, 0, 0.8, 0],
    hihat: [
      0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6,
      0.6,
    ],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

/** Merge extended patterns into main lookup */
Object.assign(DRUM_PATTERNS, EXTENDED_DRUM_PATTERNS);

// ============================================================================
// POLYRHYTHM GENERATOR
// ============================================================================

export interface PolyrhythmConfig {
  base: number; // Base time signature numerator (e.g. 4)
  against: number; // Against value (e.g. 3 for 3:4)
  totalBars: number;
  instrument: "kick" | "snare" | "hihat";
}

export function generatePolyrhythmLayer(
  config: PolyrhythmConfig,
): PatternStep[] {
  const totalSteps = config.base * config.totalBars * 4;
  const steps: PatternStep[] = new Array(totalSteps).fill(null).map(() => ({
    active: false,
    velocity: 0.7,
    probability: 0,
    accent: false,
  }));

  const period = ((totalSteps / config.against) * config.base) / config.base;
  for (let pulse = 0; pulse < config.against * config.totalBars; pulse++) {
    const stepIdx = Math.round(pulse * period);
    if (stepIdx < totalSteps) {
      steps[stepIdx] = {
        active: true,
        velocity: 0.7 + (pulse % config.against === 0 ? 0.3 : 0),
        probability: 1,
        accent: pulse % config.against === 0,
      };
    }
  }
  return steps;
}

// ============================================================================
// EUCLIDEAN DRUM PATTERN GENERATOR (replaces/extends simple probability matrix)
// ============================================================================

export function generateEuclideanDrumPattern(
  config: GenerationConfig & { euclideanPreset?: string },
  seed?: number,
): DrumPattern {
  const rng = new SeededRandom(seed);
  const totalSteps = config.bars * config.stepsPerBar;
  const pattern: DrumPattern = {
    kick: [],
    snare: [],
    hihat: [],
    clap: [],
    perc: [],
    steps: totalSteps,
    swing: config.swing,
  };

  const preset = EUCLIDEAN_PRESETS[config.euclideanPreset || "tresillo"];
  const [kPulses, kSteps] = preset.kick || [4, 16];
  const [sPulses, sSteps] = preset.snare || [2, 16];
  const [hPulses, hSteps] = preset.hihat || [8, 16];

  const kickTemplate = euclideanRhythm(kPulses, kSteps);
  const snareTemplate = euclideanRhythm(
    sPulses,
    sSteps,
    Math.floor(sSteps / 4),
  );
  const hihatTemplate = euclideanRhythm(hPulses, hSteps);

  for (let step = 0; step < totalSteps; step++) {
    const t = step % 16;
    const energy = config.energy;
    pattern.kick.push({
      active:
        kickTemplate[t % kickTemplate.length] &&
        rng.next() < 0.7 + energy * 0.3,
      velocity: 0.75 + rng.next() * 0.25,
      probability: kickTemplate[t % kickTemplate.length] ? 0.85 : 0.05,
      accent: t === 0,
    });
    pattern.snare.push({
      active: snareTemplate[t % snareTemplate.length] && rng.next() < 0.9,
      velocity: 0.8 + rng.next() * 0.2,
      probability: snareTemplate[t % snareTemplate.length] ? 0.9 : 0.02,
      accent: snareTemplate[t % snareTemplate.length],
    });
    pattern.hihat.push({
      active:
        hihatTemplate[t % hihatTemplate.length] &&
        rng.next() < 0.4 + energy * 0.5,
      velocity: 0.4 + rng.next() * 0.5,
      probability: hihatTemplate[t % hihatTemplate.length] ? 0.75 : 0.05,
      accent: false,
    });
    pattern.clap.push({
      active: t === 4 || t === 12,
      velocity: 0.9,
      probability: t === 4 || t === 12 ? 0.95 : 0,
      accent: true,
    });
    pattern.perc.push({
      active: rng.next() < config.complexity * 0.25,
      velocity: 0.4 + rng.next() * 0.4,
      probability: 0.15,
      accent: false,
    });
  }

  return pattern;
}

export default PatternRenderer;
