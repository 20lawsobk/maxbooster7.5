/**
 * Advanced Synthesizer Engine - In-House AI Audio Generation
 *
 * Fully custom synthesizer engine for generating:
 * - Drums (kick, snare, hi-hat, clap, percussion)
 * - Bass (sub-bass, 808, synth bass)
 * - Synths (leads, pads, arps, plucks)
 * - Effects (filtering, distortion, reverb simulation)
 *
 * No external APIs - 100% in-house generation
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type OscillatorType =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle"
  | "noise"
  | "pulse";
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";
export type InstrumentType =
  | "kick"
  | "snare"
  | "hihat"
  | "clap"
  | "tom"
  | "cymbal"
  | "bass"
  | "lead"
  | "pad"
  | "pluck"
  | "arp";

export interface EnvelopeParams {
  attack: number; // 0-2 seconds
  decay: number; // 0-2 seconds
  sustain: number; // 0-1 level
  release: number; // 0-5 seconds
}

export interface FilterParams {
  type: FilterType;
  cutoff: number; // Hz
  resonance: number; // 0-30 Q value
  envAmount: number; // How much envelope affects cutoff
  envelope: EnvelopeParams;
}

export interface OscillatorParams {
  type: OscillatorType;
  frequency: number;
  detune: number; // cents
  pulseWidth?: number; // for pulse wave, 0-1
  pitchEnvelope?: {
    amount: number; // semitones
    decay: number; // seconds
  };
}

export interface DrumParams {
  type: "kick" | "snare" | "hihat" | "clap" | "tom" | "cymbal" | "perc";
  pitch?: number; // Base frequency for tonal drums
  decay?: number; // Overall decay time
  tone?: number; // 0-1, affects timbre
  snap?: number; // 0-1, transient sharpness
  noise?: number; // 0-1, noise mix
  distortion?: number; // 0-1, saturation amount
}

export interface BassParams {
  type: "sub" | "808" | "synth" | "reese" | "growl";
  note: string;
  octave: number;
  filter: FilterParams;
  glide?: number; // Portamento time
  distortion?: number;
  subOscMix?: number; // 0-1
}

export interface SynthParams {
  type: "lead" | "pad" | "pluck" | "arp" | "brass" | "string";
  oscillators: OscillatorParams[];
  filter: FilterParams;
  ampEnvelope: EnvelopeParams;
  lfo?: {
    rate: number;
    depth: number;
    target: "pitch" | "filter" | "amplitude";
  };
  unison?: {
    voices: number;
    detune: number;
    spread: number;
  };
}

export interface GenerationParams {
  sampleRate: number;
  duration: number; // seconds
  tempo: number; // BPM
  key?: string;
  scale?:
    | "major"
    | "minor"
    | "dorian"
    | "phrygian"
    | "lydian"
    | "mixolydian"
    | "locrian";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63,
  "C#": 277.18,
  Db: 277.18,
  D: 293.66,
  "D#": 311.13,
  Eb: 311.13,
  E: 329.63,
  F: 349.23,
  "F#": 369.99,
  Gb: 369.99,
  G: 392.0,
  "G#": 415.3,
  Ab: 415.3,
  A: 440.0,
  "A#": 466.16,
  Bb: 466.16,
  B: 493.88,
};


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getNoteFrequency(note: string, octave: number): number {
  const baseFreq = NOTE_FREQUENCIES[note] || 440;
  const octaveDiff = octave - 4;
  return baseFreq * Math.pow(2, octaveDiff);
}



function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


// Seeded random for reproducible generation
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
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

  gaussian(): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================================
// OSCILLATOR GENERATORS (with polyBLEP anti-aliasing)
// ============================================================================

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const tn = t / dt;
    return tn + tn - tn * tn - 1;
  } else if (t > 1 - dt) {
    const tn = (t - 1) / dt;
    return tn * tn + tn + tn + 1;
  }
  return 0;
}

function generateSine(phase: number): number {
  return Math.sin(2 * Math.PI * phase);
}

function generateSquare(
  phase: number,
  pulseWidth: number = 0.5,
  dt: number = 0,
): number {
  const t = phase % 1;
  let sample = t < pulseWidth ? 1 : -1;
  if (dt > 0) {
    sample += polyBlep(t, dt);
    sample -= polyBlep((t - pulseWidth + 1) % 1, dt);
  }
  return sample;
}

function generateSawtooth(phase: number, dt: number = 0): number {
  const t = phase % 1;
  let sample = 2 * t - 1;
  if (dt > 0) {
    sample -= polyBlep(t, dt);
  }
  return sample;
}

function polyBlamp(t: number, dt: number): number {
  if (t < dt) {
    const tn = t / dt;
    return -dt * ((tn * tn * tn) / 3 - (tn * tn) / 2 + tn - 1.0 / 3.0);
  } else if (t > 1 - dt) {
    const tn = (t - 1) / dt;
    return dt * ((tn * tn * tn) / 3 + (tn * tn) / 2 + tn + 1.0 / 3.0);
  }
  return 0;
}

function generateTriangle(phase: number, dt: number = 0): number {
  const t = phase % 1;
  let sample = 4 * Math.abs(t - 0.5) - 1;
  if (dt > 0) {
    sample += polyBlamp(t, dt) * 4;
    sample += polyBlamp((t + 0.5) % 1, dt) * -4;
  }
  return sample;
}

function generateNoise(rng: SeededRandom): number {
  return rng.next() * 2 - 1;
}

function generatePulse(phase: number, width: number, dt: number = 0): number {
  return generateSquare(phase, width, dt);
}

function generateOscillator(
  type: OscillatorType,
  phase: number,
  rng: SeededRandom,
  pulseWidth: number = 0.5,
  dt: number = 0,
): number {
  switch (type) {
    case "sine":
      return generateSine(phase);
    case "square":
      return generateSquare(phase, pulseWidth, dt);
    case "sawtooth":
      return generateSawtooth(phase, dt);
    case "triangle":
      return generateTriangle(phase, dt);
    case "noise":
      return generateNoise(rng);
    case "pulse":
      return generatePulse(phase, pulseWidth, dt);
    default:
      return generateSine(phase);
  }
}

function softLimit(x: number): number {
  if (Math.abs(x) < 0.7) return x;
  const sign = x > 0 ? 1 : -1;
  const abs = Math.abs(x);
  return sign * (0.7 + Math.tanh((abs - 0.7) * 2) * 0.28);
}

// ============================================================================
// ENVELOPE GENERATORS
// ============================================================================

function generateEnvelope(
  params: EnvelopeParams,
  time: number,
  noteOffTime: number | null,
  sampleRate: number,
): number {
  const { attack, decay, sustain, release } = params;

  if (noteOffTime !== null && time >= noteOffTime) {
    // Release phase
    const releaseTime = time - noteOffTime;
    if (releaseTime >= release) return 0;
    return sustain * (1 - releaseTime / release);
  }

  if (time < attack) {
    // Attack phase
    return time / attack;
  } else if (time < attack + decay) {
    // Decay phase
    const decayProgress = (time - attack) / decay;
    return 1 - (1 - sustain) * decayProgress;
  } else {
    // Sustain phase
    return sustain;
  }
}

function generateADEnvelope(
  attack: number,
  decay: number,
  time: number,
): number {
  if (time < attack) {
    return time / attack;
  } else if (time < attack + decay) {
    return 1 - (time - attack) / decay;
  }
  return 0;
}

// ============================================================================
// FILTER IMPLEMENTATION
// ============================================================================

class BiquadFilter {
  private x1: number = 0;
  private x2: number = 0;
  private y1: number = 0;
  private y2: number = 0;
  private b0: number = 1;
  private b1: number = 0;
  private b2: number = 0;
  private a1: number = 0;
  private a2: number = 0;

  setParams(
    type: FilterType,
    frequency: number,
    Q: number,
    sampleRate: number,
  ) {
    const w0 = (2 * Math.PI * frequency) / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);

    let a0: number;

    switch (type) {
      case "lowpass":
        this.b0 = (1 - cosW0) / 2;
        this.b1 = 1 - cosW0;
        this.b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case "highpass":
        this.b0 = (1 + cosW0) / 2;
        this.b1 = -(1 + cosW0);
        this.b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case "bandpass":
        this.b0 = alpha;
        this.b1 = 0;
        this.b2 = -alpha;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case "notch":
        this.b0 = 1;
        this.b1 = -2 * cosW0;
        this.b2 = 1;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
    }

    // Normalize
    this.b0 /= a0;
    this.b1 /= a0;
    this.b2 /= a0;
    this.a1 /= a0;
    this.a2 /= a0;
  }

  process(input: number): number {
    const output =
      this.b0 * input +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;

    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;

    return output;
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

// ============================================================================
// PROFESSIONAL AUDIO PROCESSING - Quality Enhancement Suite
// ============================================================================

// Moog-style Ladder Filter (24dB/oct resonant lowpass)
class LadderFilter {
  private stage: number[] = [0, 0, 0, 0];
  private delay: number[] = [0, 0, 0, 0];
  private tunedCoeff: number = 0;
  private resonanceCoeff: number = 0;

  setCutoff(frequency: number, resonance: number, sampleRate: number) {
    const fc = frequency / sampleRate;
    this.tunedCoeff = 1.16 * fc - 0.16 * fc * fc * fc;
    this.resonanceCoeff = resonance * (1.0 - 0.15 * fc * fc);
  }

  process(input: number): number {
    // Feedback path with resonance
    const feedback = this.resonanceCoeff * this.stage[3];
    let x = input - feedback;
    x = clamp(x, -1, 1); // Prevent blowup

    // 4-pole cascade
    for (let i = 0; i < 4; i++) {
      x = x * this.tunedCoeff + this.delay[i] * (1 - this.tunedCoeff);
      this.delay[i] = x;
      this.stage[i] = x;
    }

    return this.stage[3];
  }

  reset() {
    this.stage = [0, 0, 0, 0];
    this.delay = [0, 0, 0, 0];
  }
}

// State Variable Filter (multi-mode with smooth transitions)

// Harmonic Overtone Generator for richer timbres

// Predefined harmonic structures for realistic timbres
const HARMONIC_STRUCTURES = {
  piano: [
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2, amplitude: 0.4 },
    { ratio: 3, amplitude: 0.2 },
    { ratio: 4, amplitude: 0.15 },
    { ratio: 5, amplitude: 0.1 },
    { ratio: 6, amplitude: 0.08 },
    { ratio: 7, amplitude: 0.05 },
  ],
  strings: [
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2, amplitude: 0.5 },
    { ratio: 3, amplitude: 0.33 },
    { ratio: 4, amplitude: 0.25 },
    { ratio: 5, amplitude: 0.2 },
    { ratio: 6, amplitude: 0.17 },
    { ratio: 7, amplitude: 0.14 },
    { ratio: 8, amplitude: 0.12 },
  ],
  brass: [
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2, amplitude: 0.7 },
    { ratio: 3, amplitude: 0.5 },
    { ratio: 4, amplitude: 0.35 },
    { ratio: 5, amplitude: 0.25 },
    { ratio: 6, amplitude: 0.18 },
  ],
  woodwind: [
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2, amplitude: 0.3 },
    { ratio: 3, amplitude: 0.5 },
    { ratio: 4, amplitude: 0.15 },
    { ratio: 5, amplitude: 0.3 },
  ],
  organ: [
    { ratio: 0.5, amplitude: 0.5 },
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2, amplitude: 0.8 },
    { ratio: 3, amplitude: 0.6 },
    { ratio: 4, amplitude: 0.5 },
    { ratio: 6, amplitude: 0.3 },
    { ratio: 8, amplitude: 0.2 },
  ],
  bell: [
    { ratio: 1, amplitude: 1.0 },
    { ratio: 2.4, amplitude: 0.6 },
    { ratio: 3, amplitude: 0.5 },
    { ratio: 4.2, amplitude: 0.4 },
    { ratio: 5.4, amplitude: 0.3 },
    { ratio: 6.8, amplitude: 0.2 },
  ],
};

// Exponential/Logarithmic Envelope Generator (more natural response)
function generateExponentialEnvelope(
  params: EnvelopeParams,
  time: number,
  noteOffTime: number | null,
  curvature: number = 3, // Higher = more curved
): number {
  const { attack, decay, sustain, release } = params;

  if (noteOffTime !== null && time >= noteOffTime) {
    const releaseTime = time - noteOffTime;
    if (releaseTime >= release) return 0;
    // Exponential release curve
    const t = releaseTime / release;
    return sustain * Math.pow(1 - t, curvature);
  }

  if (time < attack) {
    // Logarithmic attack (fast start, slows down)
    const t = time / attack;
    return 1 - Math.pow(1 - t, 1 / curvature);
  } else if (time < attack + decay) {
    // Exponential decay
    const t = (time - attack) / decay;
    return 1 - (1 - sustain) * (1 - Math.pow(1 - t, curvature));
  } else {
    return sustain;
  }
}

// Schroeder Reverb Implementation (improved with damping filters and longer tails)
class SchroederReverb {
  private combFilters: {
    delay: Float32Array;
    index: number;
    feedback: number;
    damp: number;
    dampState: number;
  }[] = [];
  private allpassFilters: {
    delay: Float32Array;
    index: number;
    gain: number;
  }[] = [];
  private preDelay: Float32Array;
  private preDelayIndex: number = 0;
  private preDelayLength: number;

  constructor(
    sampleRate: number,
    roomSize: number = 0.5,
    damping: number = 0.5,
  ) {
    this.preDelayLength = Math.floor(sampleRate * 0.012);
    this.preDelay = new Float32Array(Math.max(1, this.preDelayLength));

    const combDelays = [2281, 2467, 2647, 2803, 2999, 3169, 3373, 3547].map(
      (d) => Math.max(1, Math.floor((d * roomSize * sampleRate) / 44100)),
    );

    const allpassDelays = [347, 521, 797, 1117].map((d) =>
      Math.max(1, Math.floor((d * sampleRate) / 44100)),
    );

    const feedback = Math.min(0.95, 0.8 + roomSize * 0.15 - damping * 0.15);
    for (const delay of combDelays) {
      this.combFilters.push({
        delay: new Float32Array(delay),
        index: 0,
        feedback,
        damp: 0.2 + damping * 0.4,
        dampState: 0,
      });
    }

    for (let i = 0; i < allpassDelays.length; i++) {
      this.allpassFilters.push({
        delay: new Float32Array(allpassDelays[i]),
        index: 0,
        gain: 0.5,
      });
    }
  }

  process(input: number, wet: number = 0.3): number {
    let preDelayed = this.preDelay[this.preDelayIndex];
    this.preDelay[this.preDelayIndex] = input;
    this.preDelayIndex = (this.preDelayIndex + 1) % this.preDelayLength;

    let combOutput = 0;
    for (const comb of this.combFilters) {
      const delayed = comb.delay[comb.index];
      comb.dampState = delayed * (1 - comb.damp) + comb.dampState * comb.damp;
      comb.delay[comb.index] = preDelayed + comb.dampState * comb.feedback;
      comb.index = (comb.index + 1) % comb.delay.length;
      combOutput += delayed;
    }
    combOutput /= this.combFilters.length;

    let output = combOutput;
    for (const allpass of this.allpassFilters) {
      const delayed = allpass.delay[allpass.index];
      const temp = -allpass.gain * output + delayed;
      allpass.delay[allpass.index] = output + allpass.gain * delayed;
      allpass.index = (allpass.index + 1) % allpass.delay.length;
      output = temp;
    }

    return input * (1 - wet) + output * wet;
  }
}

// Stereo Chorus Effect
class StereoChorus {
  private delayLineL: Float32Array;
  private delayLineR: Float32Array;
  private writeIndex: number = 0;
  private lfoPhase: number = 0;
  private maxDelay: number;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.maxDelay = Math.floor(sampleRate * 0.05); // 50ms max delay
    this.delayLineL = new Float32Array(this.maxDelay);
    this.delayLineR = new Float32Array(this.maxDelay);
  }

  process(
    input: number,
    rate: number = 0.5,
    depth: number = 0.5,
    mix: number = 0.3,
  ): { left: number; right: number } {
    // Write to delay line
    this.delayLineL[this.writeIndex] = input;
    this.delayLineR[this.writeIndex] = input;

    // LFO for modulation
    this.lfoPhase += rate / this.sampleRate;
    const lfoL = Math.sin(2 * Math.PI * this.lfoPhase);
    const lfoR = Math.sin(2 * Math.PI * this.lfoPhase + Math.PI * 0.5); // 90 degree offset

    // Calculate delay times
    const baseDelay = this.maxDelay * 0.2;
    const modDepth = this.maxDelay * 0.3 * depth;
    const delayL = baseDelay + lfoL * modDepth;
    const delayR = baseDelay + lfoR * modDepth;

    // Read with interpolation
    const readL = (this.writeIndex - delayL + this.maxDelay) % this.maxDelay;
    const readR = (this.writeIndex - delayR + this.maxDelay) % this.maxDelay;

    const indexL = Math.floor(readL);
    const indexR = Math.floor(readR);
    const fracL = readL - indexL;
    const fracR = readR - indexR;

    const wetL =
      this.delayLineL[indexL] * (1 - fracL) +
      this.delayLineL[(indexL + 1) % this.maxDelay] * fracL;
    const wetR =
      this.delayLineR[indexR] * (1 - fracR) +
      this.delayLineR[(indexR + 1) % this.maxDelay] * fracR;

    this.writeIndex = (this.writeIndex + 1) % this.maxDelay;

    return {
      left: input * (1 - mix) + wetL * mix,
      right: input * (1 - mix) + wetR * mix,
    };
  }
}

// Analog-style Warmth/Saturation
function analogWarmth(
  input: number,
  drive: number = 0.3,
  tone: number = 0.5,
): number {
  // Asymmetric soft clipping for even harmonics (tube-like)
  const asymmetry = 0.2;
  let x = input * (1 + drive * 2);

  // Asymmetric clipping
  if (x > 0) {
    x = Math.tanh(x * (1 + asymmetry));
  } else {
    x = Math.tanh(x * (1 - asymmetry));
  }

  // Add subtle even harmonics
  const secondHarmonic =
    Math.sin(2 * Math.PI * 2 * Math.abs(input)) * drive * 0.1;
  x += secondHarmonic * (input > 0 ? 1 : -1);

  // Gentle high-frequency rolloff for warmth
  x = x * (1 - tone * 0.3) + x * tone * 0.7;

  return x * 0.7; // Compensate for gain increase
}

// DC Blocker (removes DC offset)
class DCBlocker {
  private x1: number = 0;
  private y1: number = 0;
  private R: number = 0.995;

  process(input: number): number {
    const output = input - this.x1 + this.R * this.y1;
    this.x1 = input;
    this.y1 = output;
    return output;
  }
}

// Oversampling for anti-aliasing

function downsample2x(samples: Float32Array): Float32Array {
  const output = new Float32Array(Math.floor(samples.length / 2));

  const coeffs = [
    -0.008, 0.0, 0.0488, 0.0, -0.1562, 0.0, 0.6152, 1.0, 0.6152, 0.0, -0.1562,
    0.0, 0.0488, 0.0, -0.008,
  ];
  const halfLen = Math.floor(coeffs.length / 2);
  const normFactor = (1 / coeffs.reduce((a, b) => a + Math.abs(b), 0)) * 2;

  for (let i = 0; i < output.length; i++) {
    const center = i * 2;
    let sum = 0;

    for (let j = 0; j < coeffs.length; j++) {
      const readIdx = center - halfLen + j;
      if (readIdx >= 0 && readIdx < samples.length) {
        sum += samples[readIdx] * coeffs[j];
      }
    }

    output[i] = sum * normFactor;
  }

  return output;
}

// Velocity Curve for dynamic expression
function velocityCurve(
  velocity: number,
  curve: "linear" | "soft" | "hard" = "linear",
): number {
  velocity = clamp(velocity, 0, 1);
  switch (curve) {
    case "soft":
      return Math.pow(velocity, 0.5); // More sensitive to soft playing
    case "hard":
      return Math.pow(velocity, 2); // Less sensitive, needs more force
    default:
      return velocity;
  }
}

// Stereo Width Control
function stereoWidth(
  left: number,
  right: number,
  width: number,
): { left: number; right: number } {
  const mid = (left + right) * 0.5;
  const side = (left - right) * 0.5;
  return {
    left: mid + side * width,
    right: mid - side * width,
  };
}

// ============================================================================
// EFFECTS (Original + Enhanced)
// ============================================================================

function softClip(x: number, drive: number = 1): number {
  const k = 2 * drive;
  return Math.tanh(k * x) / Math.tanh(k);
}



// Simple delay line for chorus/flanger effects

// ============================================================================
// DRUM SYNTHESIZERS
// ============================================================================

export function synthesizeKick(
  params: DrumParams,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);

  const pitch = params.pitch || 60;
  const decay = params.decay || 0.5;
  const tone = params.tone || 0.5;
  const snap = params.snap || 0.5;
  const distortion = params.distortion || 0.3;

  // Kick has pitch envelope (starts high, drops to base)
  const pitchStart = pitch * 4; // Start 2 octaves higher
  const pitchDecay = 0.02 + (1 - snap) * 0.03; // Faster snap = faster pitch drop

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;

    // Pitch envelope
    const pitchEnv = Math.exp(-t / pitchDecay);
    const currentPitch = pitch + (pitchStart - pitch) * pitchEnv;

    // Amplitude envelope
    const ampEnv = Math.exp(-t / decay);

    // Main tone (sine wave with pitch envelope)
    const phase = currentPitch * t;
    let sample = Math.sin(2 * Math.PI * phase);

    // Add click/snap (high frequency burst)
    if (t < 0.01) {
      const clickEnv = Math.exp(-t / 0.002);
      sample += clickEnv * Math.sin(2 * Math.PI * (pitch * 8) * t) * snap;
    }

    // Add sub harmonic
    sample += Math.sin(2 * Math.PI * (pitch / 2) * t) * 0.3 * (1 - tone);

    // Apply distortion
    if (distortion > 0) {
      sample = softClip(sample * (1 + distortion * 2), 1 + distortion);
    }

    output[i] = sample * ampEnv;
  }

  return output;
}

export function synthesizeSnare(
  params: DrumParams,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const pitch = params.pitch || 200;
  const decay = params.decay || 0.2;
  const tone = params.tone || 0.5;
  const snap = params.snap || 0.7;
  const noiseAmount = params.noise || 0.6;

  // Snare body filter
  const bodyFilter = new BiquadFilter();
  bodyFilter.setParams("bandpass", pitch, 2, sampleRate);

  // Noise filter (highpass for snare wires)
  const noiseFilter = new BiquadFilter();
  noiseFilter.setParams("highpass", 2000 + tone * 4000, 1, sampleRate);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;

    // Body envelope (fast attack, medium decay)
    const bodyEnv = Math.exp(-t / (decay * 0.5));

    // Noise envelope (slightly longer decay)
    const noiseEnv = Math.exp(-t / decay);

    // Snare body (two tones beating)
    let body = Math.sin(2 * Math.PI * pitch * t);
    body += Math.sin(2 * Math.PI * (pitch * 1.5) * t) * 0.5;
    body = bodyFilter.process(body);

    // Snare wires (filtered noise)
    let noise = rng.next() * 2 - 1;
    noise = noiseFilter.process(noise);

    // Initial snap/transient
    let transient = 0;
    if (t < 0.005) {
      transient = Math.exp(-t / 0.001) * snap;
    }

    // Mix
    let sample =
      body * bodyEnv * (1 - noiseAmount * 0.5) +
      noise * noiseEnv * noiseAmount +
      transient;

    output[i] = clamp(sample, -1, 1);
  }

  return output;
}

export function synthesizeHihat(
  params: DrumParams,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const decay = params.decay || 0.1; // Short for closed, long for open
  const tone = params.tone || 0.7; // Higher = brighter
  const snap = params.snap || 0.8;

  // Multiple bandpass filters for metallic sound
  const filters: BiquadFilter[] = [];
  const filterFreqs = [3000, 6000, 9000, 12000, 15000];

  for (const freq of filterFreqs) {
    const filter = new BiquadFilter();
    filter.setParams("bandpass", freq + tone * 2000, 10, sampleRate);
    filters.push(filter);
  }

  // Highpass to remove low end
  const hpFilter = new BiquadFilter();
  hpFilter.setParams("highpass", 5000 + tone * 3000, 1, sampleRate);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;

    // Envelope
    const env = Math.exp(-t / decay);

    // Generate metallic noise
    let sample = 0;
    const noise = rng.next() * 2 - 1;

    for (const filter of filters) {
      sample += filter.process(noise) * 0.3;
    }

    sample = hpFilter.process(sample);

    // Add transient
    if (t < 0.002) {
      sample += (rng.next() * 2 - 1) * snap * 2;
    }

    output[i] = clamp(sample * env, -1, 1);
  }

  return output;
}

export function synthesizeClap(
  params: DrumParams,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const decay = params.decay || 0.3;
  const tone = params.tone || 0.5;

  // Bandpass filter for clap body
  const bpFilter = new BiquadFilter();
  bpFilter.setParams("bandpass", 1000 + tone * 1000, 2, sampleRate);

  // Multiple micro-delays for the "multiple hands" effect
  const clapTimes = [0, 0.01, 0.02, 0.025];

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Layer multiple "claps"
    for (const offset of clapTimes) {
      const localT = t - offset;
      if (localT >= 0 && localT < decay) {
        const env = Math.exp(-localT / decay);
        const noise = rng.next() * 2 - 1;
        sample += bpFilter.process(noise) * env * 0.4;
      }
    }

    output[i] = clamp(sample, -1, 1);
  }

  return output;
}

// ============================================================================
// BASS SYNTHESIZERS
// ============================================================================

export function synthesizeBass(
  params: BassParams,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  new SeededRandom(Date.now());

  const baseFreq = getNoteFrequency(params.note, params.octave);
  const { type, filter, distortion = 0, subOscMix = 0.3 } = params;

  const mainFilter = new BiquadFilter();

  const useSubOsc = type === "808" || type === "sub";

  let phaseAcc = 0;
  let phaseAcc2 = 0;
  let phaseAcc3 = 0;
  let phase808Acc = 0;
  let modPhaseAcc = 0;

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const baseDt = baseFreq / sampleRate;
    phaseAcc += baseDt;
    if (phaseAcc > 1e6) phaseAcc -= Math.floor(phaseAcc);

    const filterEnv = generateEnvelope(filter.envelope, t, null, sampleRate);
    const filterCutoff =
      filter.cutoff + filter.envAmount * filterEnv * filter.cutoff;
    mainFilter.setParams(
      filter.type,
      clamp(filterCutoff, 20, 20000),
      filter.resonance,
      sampleRate,
    );

    const noteOffTime = Math.max(duration * 0.85, duration - 0.08);
    const ampEnv = generateADEnvelope(0.005, noteOffTime, t);

    let sample = 0;

    switch (type) {
      case "sub":
        sample = generateSine(phaseAcc);
        break;

      case "808": {
        const pitchEnv808 = Math.exp(-t / 0.1);
        const freq808 = baseFreq + baseFreq * 2 * pitchEnv808;
        const dt808 = freq808 / sampleRate;
        phase808Acc += dt808;
        if (phase808Acc > 1e6) phase808Acc -= Math.floor(phase808Acc);
        sample = generateSine(phase808Acc);
        if (distortion > 0) {
          sample = softClip(sample * (1 + distortion * 3), 1);
        }
        break;
      }

      case "synth":
        sample = generateSawtooth(phaseAcc, baseDt);
        sample = mainFilter.process(sample);
        break;

      case "reese": {
        const dt2 = (baseFreq * 1.005) / sampleRate;
        const dt3 = (baseFreq * 0.995) / sampleRate;
        phaseAcc2 += dt2;
        phaseAcc3 += dt3;
        if (phaseAcc2 > 1e6) phaseAcc2 -= Math.floor(phaseAcc2);
        if (phaseAcc3 > 1e6) phaseAcc3 -= Math.floor(phaseAcc3);
        sample = generateSawtooth(phaseAcc, baseDt);
        sample += generateSawtooth(phaseAcc2, dt2) * 0.7;
        sample += generateSawtooth(phaseAcc3, dt3) * 0.7;
        sample = mainFilter.process(sample / 2);
        break;
      }

      case "growl": {
        const modDt = (baseFreq * 0.5) / sampleRate;
        modPhaseAcc += modDt;
        if (modPhaseAcc > 1e6) modPhaseAcc -= Math.floor(modPhaseAcc);
        const modAmount = 2 + Math.sin(2 * Math.PI * t * 4) * 1.5;
        sample = generateSine(phaseAcc + generateSine(modPhaseAcc) * modAmount);
        sample = mainFilter.process(sample);
        if (distortion > 0) {
          sample = softClip(sample * (1 + distortion * 2), 1);
        }
        break;
      }
    }

    if (useSubOsc && type !== "sub") {
      sample =
        sample * (1 - subOscMix) + generateSine(phaseAcc * 0.5) * subOscMix;
    }

    output[i] = softLimit(sample * ampEnv);
  }

  return output;
}

// ============================================================================
// SYNTH SYNTHESIZERS
// ============================================================================

export function synthesizeSynth(
  params: SynthParams,
  note: string,
  octave: number,
  genParams: GenerationParams,
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const baseFreq = getNoteFrequency(note, octave);
  const { oscillators, filter, ampEnvelope, lfo, unison } = params;

  const mainFilter = new BiquadFilter();

  const unisonVoices = unison?.voices || 1;
  const unisonDetune = unison?.detune || 0;

  const totalOscPhases: number[][] = [];
  for (let v = 0; v < unisonVoices; v++) {
    totalOscPhases.push(new Array(oscillators.length).fill(0));
  }

  const noteOffTime = Math.max(duration * 0.85, duration - 0.1);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;

    let lfoValue = 0;
    if (lfo) {
      lfoValue = Math.sin(2 * Math.PI * lfo.rate * t) * lfo.depth;
    }

    const filterEnv = generateEnvelope(filter.envelope, t, null, sampleRate);
    let filterCutoff =
      filter.cutoff + filter.envAmount * filterEnv * filter.cutoff;
    if (lfo?.target === "filter") {
      filterCutoff *= 1 + lfoValue;
    }
    mainFilter.setParams(
      filter.type,
      clamp(filterCutoff, 20, 20000),
      filter.resonance,
      sampleRate,
    );

    const ampEnv = generateEnvelope(ampEnvelope, t, noteOffTime, sampleRate);

    let sample = 0;

    for (let v = 0; v < unisonVoices; v++) {
      const detuneAmt =
        unisonVoices > 1
          ? (v / (unisonVoices - 1) - 0.5) * 2 * unisonDetune
          : 0;
      const voiceFreq = baseFreq * Math.pow(2, detuneAmt / 1200);

      let pitchMod = 1;
      if (lfo?.target === "pitch") {
        pitchMod = 1 + lfoValue * 0.1;
      }

      for (let oIdx = 0; oIdx < oscillators.length; oIdx++) {
        const osc = oscillators[oIdx];
        let oscFreq = voiceFreq * pitchMod * Math.pow(2, osc.detune / 1200);

        if (osc.pitchEnvelope) {
          const pitchEnv = Math.exp(-t / osc.pitchEnvelope.decay);
          oscFreq *= Math.pow(2, (osc.pitchEnvelope.amount * pitchEnv) / 12);
        }

        const dt = oscFreq / sampleRate;
        totalOscPhases[v][oIdx] += dt;
        if (totalOscPhases[v][oIdx] > 1e6)
          totalOscPhases[v][oIdx] -= Math.floor(totalOscPhases[v][oIdx]);

        sample += generateOscillator(
          osc.type,
          totalOscPhases[v][oIdx],
          rng,
          osc.pulseWidth,
          dt,
        );
      }
    }

    sample /= unisonVoices * oscillators.length;

    sample = mainFilter.process(sample);

    let ampMod = 1;
    if (lfo?.target === "amplitude") {
      ampMod = 1 + lfoValue * 0.3;
    }

    output[i] = softLimit(sample * ampEnv * ampMod);
  }

  return output;
}

// ============================================================================
// PRESET FACTORY
// ============================================================================

export const SYNTH_PRESETS = {
  lead: {
    classic: (): SynthParams => ({
      type: "lead",
      oscillators: [
        { type: "sawtooth", frequency: 1, detune: 0 },
        { type: "square", frequency: 1, detune: 7 },
      ],
      filter: {
        type: "lowpass",
        cutoff: 3000,
        resonance: 4,
        envAmount: 0.5,
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
      },
      ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      unison: { voices: 3, detune: 15, spread: 0.5 },
    }),

    supersaw: (): SynthParams => ({
      type: "lead",
      oscillators: [{ type: "sawtooth", frequency: 1, detune: 0 }],
      filter: {
        type: "lowpass",
        cutoff: 8000,
        resonance: 2,
        envAmount: 0.3,
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.7, release: 0.5 },
      },
      ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.4 },
      unison: { voices: 7, detune: 25, spread: 0.8 },
    }),
  },

  pad: {
    warm: (): SynthParams => ({
      type: "pad",
      oscillators: [
        { type: "sawtooth", frequency: 1, detune: 0 },
        { type: "triangle", frequency: 0.5, detune: -5 },
      ],
      filter: {
        type: "lowpass",
        cutoff: 2000,
        resonance: 1,
        envAmount: 0.2,
        envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1 },
      },
      ampEnvelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.5 },
      lfo: { rate: 0.5, depth: 0.1, target: "filter" },
      unison: { voices: 5, detune: 10, spread: 0.6 },
    }),

    ethereal: (): SynthParams => ({
      type: "pad",
      oscillators: [
        { type: "sine", frequency: 1, detune: 0 },
        { type: "triangle", frequency: 2, detune: 3 },
      ],
      filter: {
        type: "lowpass",
        cutoff: 4000,
        resonance: 2,
        envAmount: 0.4,
        envelope: { attack: 1, decay: 0.5, sustain: 0.6, release: 2 },
      },
      ampEnvelope: { attack: 1, decay: 0.5, sustain: 0.7, release: 2 },
      lfo: { rate: 0.2, depth: 0.15, target: "pitch" },
      unison: { voices: 5, detune: 20, spread: 0.8 },
    }),
  },

  pluck: {
    acoustic: (): SynthParams => ({
      type: "pluck",
      oscillators: [{ type: "sawtooth", frequency: 1, detune: 0 }],
      filter: {
        type: "lowpass",
        cutoff: 8000,
        resonance: 2,
        envAmount: 0.8,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
      },
      ampEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 },
    }),

    digital: (): SynthParams => ({
      type: "pluck",
      oscillators: [
        { type: "square", frequency: 1, detune: 0, pulseWidth: 0.3 },
      ],
      filter: {
        type: "lowpass",
        cutoff: 6000,
        resonance: 8,
        envAmount: 0.9,
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      },
      ampEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
    }),
  },
};

export const DRUM_PRESETS = {
  kick: {
    trap: (): DrumParams => ({
      type: "kick",
      pitch: 45,
      decay: 0.6,
      tone: 0.3,
      snap: 0.8,
      distortion: 0.4,
    }),
    house: (): DrumParams => ({
      type: "kick",
      pitch: 55,
      decay: 0.4,
      tone: 0.5,
      snap: 0.6,
      distortion: 0.2,
    }),
    acoustic: (): DrumParams => ({
      type: "kick",
      pitch: 65,
      decay: 0.3,
      tone: 0.7,
      snap: 0.4,
      distortion: 0.1,
    }),
    sub: (): DrumParams => ({
      type: "kick",
      pitch: 35,
      decay: 0.8,
      tone: 0.2,
      snap: 0.3,
      distortion: 0.5,
    }),
  },
  snare: {
    trap: (): DrumParams => ({
      type: "snare",
      pitch: 180,
      decay: 0.25,
      tone: 0.4,
      snap: 0.9,
      noise: 0.7,
    }),
    acoustic: (): DrumParams => ({
      type: "snare",
      pitch: 220,
      decay: 0.2,
      tone: 0.6,
      snap: 0.7,
      noise: 0.5,
    }),
    clap: (): DrumParams => ({
      type: "snare",
      pitch: 200,
      decay: 0.3,
      tone: 0.5,
      snap: 0.6,
      noise: 0.8,
    }),
  },
  hihat: {
    closed: (): DrumParams => ({
      type: "hihat",
      decay: 0.05,
      tone: 0.6,
      snap: 0.9,
    }),
    open: (): DrumParams => ({
      type: "hihat",
      decay: 0.4,
      tone: 0.7,
      snap: 0.7,
    }),
    pedal: (): DrumParams => ({
      type: "hihat",
      decay: 0.08,
      tone: 0.4,
      snap: 0.5,
    }),
  },
};

export const BASS_PRESETS = {
  sub: (): BassParams => ({
    type: "sub",
    note: "C",
    octave: 1,
    filter: {
      type: "lowpass",
      cutoff: 200,
      resonance: 0,
      envAmount: 0,
      envelope: { attack: 0.01, decay: 0.5, sustain: 1, release: 0.3 },
    },
  }),

  trap808: (): BassParams => ({
    type: "808",
    note: "C",
    octave: 1,
    distortion: 0.4,
    filter: {
      type: "lowpass",
      cutoff: 500,
      resonance: 2,
      envAmount: 0.3,
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.5, release: 0.5 },
    },
  }),

  synthBass: (): BassParams => ({
    type: "synth",
    note: "C",
    octave: 2,
    filter: {
      type: "lowpass",
      cutoff: 1000,
      resonance: 6,
      envAmount: 0.7,
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
    },
  }),

  reese: (): BassParams => ({
    type: "reese",
    note: "C",
    octave: 1,
    filter: {
      type: "lowpass",
      cutoff: 2000,
      resonance: 4,
      envAmount: 0.5,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.6, release: 0.4 },
    },
  }),
};

// ============================================================================
// MAIN SYNTHESIZER CLASS
// ============================================================================

export class SynthesizerEngine {
  private sampleRate: number;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
  }

  generateDrum(
    type: DrumParams["type"],
    preset?: string,
    duration: number = 1,
  ): Float32Array {
    let params: DrumParams;

    switch (type) {
      case "kick":
        params =
          preset && DRUM_PRESETS.kick[preset as keyof typeof DRUM_PRESETS.kick]
            ? DRUM_PRESETS.kick[preset as keyof typeof DRUM_PRESETS.kick]()
            : DRUM_PRESETS.kick.trap();
        return synthesizeKick(params, {
          sampleRate: this.sampleRate,
          duration,
          tempo: 120,
        });

      case "snare":
        params =
          preset &&
          DRUM_PRESETS.snare[preset as keyof typeof DRUM_PRESETS.snare]
            ? DRUM_PRESETS.snare[preset as keyof typeof DRUM_PRESETS.snare]()
            : DRUM_PRESETS.snare.trap();
        return synthesizeSnare(params, {
          sampleRate: this.sampleRate,
          duration,
          tempo: 120,
        });

      case "hihat":
        params =
          preset &&
          DRUM_PRESETS.hihat[preset as keyof typeof DRUM_PRESETS.hihat]
            ? DRUM_PRESETS.hihat[preset as keyof typeof DRUM_PRESETS.hihat]()
            : DRUM_PRESETS.hihat.closed();
        return synthesizeHihat(params, {
          sampleRate: this.sampleRate,
          duration,
          tempo: 120,
        });

      case "clap":
        params = { type: "clap", decay: 0.3, tone: 0.5 };
        return synthesizeClap(params, {
          sampleRate: this.sampleRate,
          duration,
          tempo: 120,
        });

      default:
        return synthesizeKick(
          { type: "kick" },
          { sampleRate: this.sampleRate, duration, tempo: 120 },
        );
    }
  }

  generateBass(
    note: string,
    octave: number,
    preset: string = "trap808",
    duration: number = 1,
  ): Float32Array {
    let params: BassParams;

    switch (preset) {
      case "sub":
        params = { ...BASS_PRESETS.sub(), note, octave };
        break;
      case "trap808":
      case "808":
        params = { ...BASS_PRESETS.trap808(), note, octave };
        break;
      case "synth":
        params = { ...BASS_PRESETS.synthBass(), note, octave };
        break;
      case "reese":
        params = { ...BASS_PRESETS.reese(), note, octave };
        break;
      default:
        params = { ...BASS_PRESETS.trap808(), note, octave };
    }

    return synthesizeBass(params, {
      sampleRate: this.sampleRate,
      duration,
      tempo: 120,
    });
  }

  generateSynth(
    note: string,
    octave: number,
    type: "lead" | "pad" | "pluck" = "lead",
    preset: string = "classic",
    duration: number = 1,
  ): Float32Array {
    let params: SynthParams;

    switch (type) {
      case "lead":
        params =
          preset === "supersaw"
            ? SYNTH_PRESETS.lead.supersaw()
            : SYNTH_PRESETS.lead.classic();
        break;
      case "pad":
        params =
          preset === "ethereal"
            ? SYNTH_PRESETS.pad.ethereal()
            : SYNTH_PRESETS.pad.warm();
        break;
      case "pluck":
        params =
          preset === "digital"
            ? SYNTH_PRESETS.pluck.digital()
            : SYNTH_PRESETS.pluck.acoustic();
        break;
      default:
        params = SYNTH_PRESETS.lead.classic();
    }

    return synthesizeSynth(params, note, octave, {
      sampleRate: this.sampleRate,
      duration,
      tempo: 120,
    });
  }

  generateSynthWithInstrumentParams(
    note: string,
    octave: number,
    instrumentParams: {
      brightness: number;
      attack: number;
      decay: number;
      sustain?: number;
      synthType?: "sine" | "square" | "sawtooth" | "triangle";
      instrumentName?: string;
      velocity?: number;
    },
    duration: number = 1,
  ): Float32Array {
    const {
      brightness,
      attack,
      decay,
      sustain = 0.6,
      synthType,
      instrumentName,
      velocity = 0.8,
    } = instrumentParams;

    // Use 2x oversampling for anti-aliasing
    const oversampleFactor = 2;
    const internalSampleRate = this.sampleRate * oversampleFactor;
    const samples = Math.floor(internalSampleRate * duration);
    const oversampledOutput = new Float32Array(samples);
    const rng = new SeededRandom(Date.now());

    const baseFreq = getNoteFrequency(note, octave);
    const velocityGain = velocityCurve(velocity, "soft");

    // Determine instrument characteristics
    let harmonicType: keyof typeof HARMONIC_STRUCTURES = "piano";
    let useHarmonics = false;
    let oscType: OscillatorType = synthType || "sawtooth"; // Respect synthType override
    let secondOscType: OscillatorType = "triangle";
    let detuneAmount = 7;
    let unisonVoices = 1;
    let unisonDetune = 0;
    let reverbAmount = 0.15;
    let warmthAmount = 0.2;
    let chorusAmount = 0;
    let vibratoRate = 0;
    let vibratoDepth = 0;
    let stereoWidthAmount = 1.0;

    const name = (instrumentName || "").toLowerCase();

    if (name.includes("piano") || name.includes("electric_piano")) {
      harmonicType = "piano";
      useHarmonics = true;
      reverbAmount = 0.25;
      warmthAmount = 0.15;
    } else if (name.includes("organ")) {
      harmonicType = "organ";
      useHarmonics = true;
      unisonVoices = 3;
      unisonDetune = 5;
      reverbAmount = 0.3;
      chorusAmount = 0.3;
    } else if (
      name.includes("violin") ||
      name.includes("strings") ||
      name.includes("cello") ||
      name.includes("viola")
    ) {
      harmonicType = "strings";
      useHarmonics = true;
      unisonVoices = 4;
      unisonDetune = 12;
      reverbAmount = 0.35;
      vibratoRate = 5;
      vibratoDepth = 0.02;
    } else if (
      name.includes("trumpet") ||
      name.includes("brass") ||
      name.includes("trombone") ||
      name.includes("horn")
    ) {
      harmonicType = "brass";
      useHarmonics = true;
      reverbAmount = 0.2;
      warmthAmount = 0.3;
    } else if (
      name.includes("flute") ||
      name.includes("pan_flute") ||
      name.includes("recorder")
    ) {
      harmonicType = "woodwind";
      useHarmonics = true;
      reverbAmount = 0.3;
      vibratoRate = 4;
      vibratoDepth = 0.015;
    } else if (name.includes("sax")) {
      harmonicType = "brass";
      useHarmonics = true;
      warmthAmount = 0.35;
      vibratoRate = 5;
      vibratoDepth = 0.02;
    } else if (name.includes("guitar") || name.includes("acoustic")) {
      oscType = "triangle";
      secondOscType = "sawtooth";
      detuneAmount = 3;
      reverbAmount = 0.2;
      warmthAmount = 0.25;
    } else if (name.includes("vocal") || name.includes("choir")) {
      harmonicType = "strings";
      useHarmonics = true;
      unisonVoices = 5;
      unisonDetune = 8;
      reverbAmount = 0.4;
      chorusAmount = 0.25;
      vibratoRate = 5;
      vibratoDepth = 0.025;
    } else if (
      name.includes("vibraphone") ||
      name.includes("marimba") ||
      name.includes("bells") ||
      name.includes("kalimba") ||
      name.includes("glockenspiel")
    ) {
      harmonicType = "bell";
      useHarmonics = true;
      reverbAmount = 0.4;
    } else if (
      name.includes("sitar") ||
      name.includes("koto") ||
      name.includes("erhu")
    ) {
      harmonicType = "strings";
      useHarmonics = true;
      unisonVoices = 2;
      unisonDetune = 15;
      vibratoRate = 6;
      vibratoDepth = 0.03;
    } else if (name.includes("oud") || name.includes("balalaika")) {
      harmonicType = "strings";
      useHarmonics = true;
      unisonVoices = 2;
      unisonDetune = 10;
      vibratoRate = 4;
      vibratoDepth = 0.02;
      warmthAmount = 0.3;
    } else if (name.includes("didgeridoo")) {
      harmonicType = "brass";
      useHarmonics = true;
      unisonVoices = 3;
      unisonDetune = 8;
      warmthAmount = 0.5;
      reverbAmount = 0.4;
    } else if (name.includes("harpsichord")) {
      harmonicType = "piano";
      useHarmonics = true;
      oscType = "sawtooth";
      warmthAmount = 0.1;
      reverbAmount = 0.15;
    } else if (
      name.includes("celesta") ||
      name.includes("music_box") ||
      name.includes("music box") ||
      name.includes("xylophone")
    ) {
      harmonicType = "bell";
      useHarmonics = true;
      reverbAmount = 0.35;
      warmthAmount = 0.1;
    } else if (name.includes("clarinet") || name.includes("oboe")) {
      harmonicType = "woodwind";
      useHarmonics = true;
      reverbAmount = 0.25;
      vibratoRate = 4.5;
      vibratoDepth = 0.012;
      warmthAmount = 0.25;
    } else if (name.includes("whisper")) {
      harmonicType = "strings";
      useHarmonics = true;
      unisonVoices = 3;
      unisonDetune = 12;
      reverbAmount = 0.5;
      warmthAmount = 0.1;
      oscType = "triangle";
    } else if (name.includes("synth_lead") || name.includes("lead")) {
      oscType = "sawtooth";
      secondOscType = "square";
      unisonVoices = 3;
      unisonDetune = 15;
      warmthAmount = 0.3;
    } else if (name.includes("synth_pad") || name.includes("pad")) {
      oscType = "sawtooth";
      secondOscType = "triangle";
      unisonVoices = 5;
      unisonDetune = 20;
      reverbAmount = 0.45;
      chorusAmount = 0.35;
    } else if (name.includes("synth_pluck") || name.includes("pluck")) {
      oscType = "sawtooth";
      secondOscType = "square";
      detuneAmount = 5;
      warmthAmount = 0.2;
    } else if (name.includes("synth_brass")) {
      oscType = "sawtooth";
      unisonVoices = 4;
      unisonDetune = 10;
      warmthAmount = 0.35;
    }

    const ladderFilter = new LadderFilter();
    const dcBlocker = new DCBlocker();
    const reverb = new SchroederReverb(internalSampleRate, 0.6, 0.35);
    const chorus = new StereoChorus(internalSampleRate);

    const cutoff = 800 + brightness * 6000;
    const resonance = 0.15 + brightness * 0.45;

    const releaseTime = Math.max(0.05, decay * 0.4);
    const noteOffTime = Math.max(
      duration * 0.85,
      duration - releaseTime - 0.02,
    );
    const ampEnv: EnvelopeParams = {
      attack: Math.max(0.003, attack),
      decay: decay * 0.4,
      sustain,
      release: releaseTime,
    };
    const filterEnv: EnvelopeParams = {
      attack: Math.max(0.003, attack * 0.5),
      decay: decay * 0.6,
      sustain: 0.4,
      release: releaseTime * 1.2,
    };

    const harmonics =
      HARMONIC_STRUCTURES[harmonicType] || HARMONIC_STRUCTURES.piano;

    const phaseAccum: number[] = new Array(Math.max(1, unisonVoices)).fill(0);
    const phaseAccum2: number[] = new Array(Math.max(1, unisonVoices)).fill(0);
    const dt = 1 / internalSampleRate;

    for (let i = 0; i < samples; i++) {
      const t = i / internalSampleRate;

      let pitchMod = 1;
      if (vibratoRate > 0 && t > attack) {
        const vibratoEnv = Math.min(1, (t - attack) / 0.3);
        pitchMod =
          1 +
          Math.sin(2 * Math.PI * vibratoRate * t) * vibratoDepth * vibratoEnv;
      }

      let sample = 0;

      if (useHarmonics) {
        const timeDecay = Math.exp(-t * 0.3);
        const dynamicHarmonics = harmonics.map((h, idx) => ({
          ...h,
          amplitude: h.amplitude * (idx === 0 ? 1 : 0.5 + 0.5 * timeDecay),
        }));

        for (let v = 0; v < Math.max(1, unisonVoices); v++) {
          const detuneRatio =
            unisonVoices > 1
              ? Math.pow(
                  2,
                  ((v - (unisonVoices - 1) / 2) * unisonDetune) / 1200,
                )
              : 1;
          const voiceFreq = baseFreq * pitchMod * detuneRatio;
          phaseAccum[v] += voiceFreq * dt;
          if (phaseAccum[v] > 1e6) phaseAccum[v] -= Math.floor(phaseAccum[v]);

          let voiceSample = 0;
          for (const h of dynamicHarmonics) {
            const hFreq = voiceFreq * h.ratio;
            if (hFreq > internalSampleRate * 0.45) continue;
            voiceSample +=
              Math.sin(2 * Math.PI * phaseAccum[v] * h.ratio) * h.amplitude;
          }
          sample += voiceSample * (v === 0 ? 1 : 0.65);
        }
        if (unisonVoices > 1) sample /= 1 + (unisonVoices - 1) * 0.65;
      } else {
        const voiceCount = Math.max(1, unisonVoices);
        for (let v = 0; v < voiceCount; v++) {
          const detuneRatio =
            voiceCount > 1
              ? Math.pow(2, ((v - (voiceCount - 1) / 2) * unisonDetune) / 1200)
              : 1;
          const voiceFreq = baseFreq * pitchMod * detuneRatio;
          const voiceDt = voiceFreq / internalSampleRate;

          phaseAccum[v] += voiceDt;
          if (phaseAccum[v] > 1e6) phaseAccum[v] -= Math.floor(phaseAccum[v]);

          const freq2 = voiceFreq * Math.pow(2, detuneAmount / 1200);
          const dt2 = freq2 / internalSampleRate;
          phaseAccum2[v] += dt2;
          if (phaseAccum2[v] > 1e6)
            phaseAccum2[v] -= Math.floor(phaseAccum2[v]);

          sample += generateOscillator(
            oscType,
            phaseAccum[v],
            rng,
            0.5,
            voiceDt,
          );
          sample +=
            generateOscillator(secondOscType, phaseAccum2[v], rng, 0.5, dt2) *
            0.4;
        }
        sample /= voiceCount * 1.4;
      }

      const ampEnvValue = generateExponentialEnvelope(
        ampEnv,
        t,
        noteOffTime,
        2.5,
      );

      const filterEnvValue = generateExponentialEnvelope(filterEnv, t, null, 2);
      const modulatedCutoff = cutoff * (0.6 + filterEnvValue * 0.8);
      ladderFilter.setCutoff(
        clamp(modulatedCutoff, 30, internalSampleRate * 0.42),
        resonance,
        internalSampleRate,
      );
      sample = ladderFilter.process(sample);

      if (warmthAmount > 0) {
        sample = analogWarmth(sample, warmthAmount * 0.7, 0.4);
      }

      if (reverbAmount > 0) {
        sample = reverb.process(sample, reverbAmount * 0.8);
      }

      let sampleLeft = sample;
      let sampleRight = sample;
      if (chorusAmount > 0) {
        const stereoResult = chorus.process(
          sample,
          0.4,
          0.4,
          chorusAmount * 0.7,
        );
        sampleLeft = stereoResult.left;
        sampleRight = stereoResult.right;
      }

      if (stereoWidthAmount !== 1.0) {
        const widthResult = stereoWidth(
          sampleLeft,
          sampleRight,
          stereoWidthAmount,
        );
        sampleLeft = widthResult.left;
        sampleRight = widthResult.right;
      }

      sample = (sampleLeft + sampleRight) * 0.5;
      sample = dcBlocker.process(sample);

      oversampledOutput[i] = softLimit(
        sample * ampEnvValue * velocityGain * 0.75,
      );
    }

    const output = downsample2x(oversampledOutput);

    return output;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }
}

export default SynthesizerEngine;

// ============================================================================
// FM SYNTHESIS ENGINE — 4-OPERATOR DX7-STYLE
// ============================================================================

export interface FMOperator {
  ratio: number; // Frequency ratio relative to carrier
  level: number; // Output level 0-1
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  detune: number; // Cents offset
  feedback?: number; // Self-modulation 0-1 (operator 1 only)
}

export interface FMAlgorithm {
  name: string;
  carriers: number[]; // Operator indices that produce audio output
  modulations: Array<{ mod: number; car: number }>; // Modulation routing
}

// Classic DX7 algorithms (simplified to 4 operators)
export const FM_ALGORITHMS: Record<string, FMAlgorithm> = {
  dx7_1: {
    name: "Stack (Op4→Op3→Op2→Op1)",
    carriers: [0],
    modulations: [
      { mod: 3, car: 2 },
      { mod: 2, car: 1 },
      { mod: 1, car: 0 },
    ],
  },
  dx7_5: {
    name: "Additive (4 carriers)",
    carriers: [0, 1, 2, 3],
    modulations: [],
  },
  dx7_7: {
    name: "Double Stack (Op4→Op3, Op2→Op1)",
    carriers: [0, 2],
    modulations: [
      { mod: 3, car: 2 },
      { mod: 1, car: 0 },
    ],
  },
  organ: {
    name: "Organ (Op3→Op1, Op4→Op2, additive)",
    carriers: [0, 1],
    modulations: [
      { mod: 2, car: 0 },
      { mod: 3, car: 1 },
    ],
  },
  bell: {
    name: "Bell (Op2+Op4 mod Op1, Op3 mod Op1)",
    carriers: [0],
    modulations: [
      { mod: 1, car: 0 },
      { mod: 2, car: 0 },
      { mod: 3, car: 2 },
    ],
  },
};

// Preset operator configs for common FM tones
export const FM_PRESETS: Record<
  string,
  { operators: FMOperator[]; algorithm: string }
> = {
  electric_piano: {
    algorithm: "dx7_7",
    operators: [
      {
        ratio: 1.0,
        level: 0.9,
        attack: 0.002,
        decay: 1.2,
        sustain: 0.4,
        release: 0.8,
        detune: 0,
      },
      {
        ratio: 14.0,
        level: 0.6,
        attack: 0.001,
        decay: 0.4,
        sustain: 0.0,
        release: 0.2,
        detune: 2,
      },
      {
        ratio: 1.0,
        level: 0.8,
        attack: 0.002,
        decay: 1.5,
        sustain: 0.5,
        release: 1.0,
        detune: 0,
      },
      {
        ratio: 11.0,
        level: 0.5,
        attack: 0.001,
        decay: 0.3,
        sustain: 0.0,
        release: 0.2,
        detune: -3,
      },
    ],
  },
  dx_bell: {
    algorithm: "bell",
    operators: [
      {
        ratio: 1.0,
        level: 0.85,
        attack: 0.001,
        decay: 3.0,
        sustain: 0.0,
        release: 2.0,
        detune: 0,
      },
      {
        ratio: 3.5,
        level: 0.7,
        attack: 0.001,
        decay: 2.0,
        sustain: 0.0,
        release: 1.5,
        detune: 5,
      },
      {
        ratio: 1.0,
        level: 0.5,
        attack: 0.001,
        decay: 1.0,
        sustain: 0.0,
        release: 0.5,
        detune: 0,
      },
      {
        ratio: 7.0,
        level: 0.4,
        attack: 0.001,
        decay: 1.5,
        sustain: 0.0,
        release: 1.0,
        detune: -4,
      },
    ],
  },
  fm_bass: {
    algorithm: "dx7_1",
    operators: [
      {
        ratio: 1.0,
        level: 0.95,
        attack: 0.002,
        decay: 0.5,
        sustain: 0.6,
        release: 0.3,
        detune: 0,
      },
      {
        ratio: 1.0,
        level: 0.8,
        attack: 0.001,
        decay: 0.3,
        sustain: 0.0,
        release: 0.1,
        detune: 0,
        feedback: 0.3,
      },
      {
        ratio: 0.5,
        level: 0.6,
        attack: 0.001,
        decay: 0.2,
        sustain: 0.0,
        release: 0.1,
        detune: 0,
      },
      {
        ratio: 2.0,
        level: 0.5,
        attack: 0.001,
        decay: 0.15,
        sustain: 0.0,
        release: 0.05,
        detune: 3,
      },
    ],
  },
  organ: {
    algorithm: "organ",
    operators: [
      {
        ratio: 1.0,
        level: 0.7,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.9,
        release: 0.05,
        detune: 0,
      },
      {
        ratio: 2.0,
        level: 0.5,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.9,
        release: 0.05,
        detune: 0,
      },
      {
        ratio: 3.0,
        level: 0.3,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.8,
        release: 0.05,
        detune: 0,
      },
      {
        ratio: 4.0,
        level: 0.2,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.05,
        detune: 0,
      },
    ],
  },
  metal_lead: {
    algorithm: "dx7_1",
    operators: [
      {
        ratio: 1.0,
        level: 1.0,
        attack: 0.005,
        decay: 0.3,
        sustain: 0.8,
        release: 0.5,
        detune: 0,
      },
      {
        ratio: 1.0,
        level: 0.9,
        attack: 0.001,
        decay: 0.2,
        sustain: 0.7,
        release: 0.2,
        detune: 7,
        feedback: 0.5,
      },
      {
        ratio: 3.0,
        level: 0.6,
        attack: 0.001,
        decay: 0.1,
        sustain: 0.0,
        release: 0.05,
        detune: 0,
      },
      {
        ratio: 5.0,
        level: 0.4,
        attack: 0.001,
        decay: 0.08,
        sustain: 0.0,
        release: 0.03,
        detune: -5,
      },
    ],
  },
};

function adsrEnvelope(
  t: number,
  duration: number,
  a: number,
  d: number,
  s: number,
  r: number,
): number {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < duration - r) return s;
  const rt = t - (duration - r);
  return s * (1 - rt / r);
}

export function generateFMTone(
  frequency: number,
  duration: number,
  sampleRate: number,
  presetName: string = "electric_piano",
  velocity: number = 0.8,
): Float32Array {
  const preset = FM_PRESETS[presetName] || FM_PRESETS.electric_piano;
  const algorithm = FM_ALGORITHMS[preset.algorithm] || FM_ALGORITHMS.dx7_7;
  const totalSamples = Math.ceil(duration * sampleRate);
  const output = new Float32Array(totalSamples);

  const phases = new Float32Array(4);
  const modSignals = new Float32Array(4);

  for (let n = 0; n < totalSamples; n++) {
    const t = n / sampleRate;

    // Compute each operator's envelope and output
    for (let i = 0; i < 4; i++) {
      const op = preset.operators[i];
      const env = adsrEnvelope(
        t,
        duration,
        op.attack,
        op.decay,
        op.sustain,
        op.release,
      );
      const freq = frequency * op.ratio * Math.pow(2, (op.detune || 0) / 1200);
      const phaseInc = (2 * Math.PI * freq) / sampleRate;

      // Self-feedback for operator 1 style
      const fb = op.feedback ? op.feedback * modSignals[i] * 0.3 : 0;
      modSignals[i] = Math.sin(phases[i] + fb) * env * op.level;
      phases[i] = (phases[i] + phaseInc) % (2 * Math.PI);
    }

    // Apply modulation routing
    const modulated = new Float32Array(4);
    for (let i = 0; i < 4; i++) modulated[i] = modSignals[i];
    for (const route of algorithm.modulations) {
      modulated[route.car] = Math.sin(
        Math.asin(Math.max(-1, Math.min(1, modulated[route.car]))) +
          modulated[route.mod] * Math.PI,
      );
    }

    // Sum carriers
    let sample = 0;
    for (const ci of algorithm.carriers) {
      sample += modulated[ci];
    }
    output[n] = Math.max(
      -1,
      Math.min(1, (sample * velocity) / algorithm.carriers.length),
    );
  }

  return output;
}

// ============================================================================
// WAVETABLE OSCILLATOR — Morphing Between Waveforms
// ============================================================================

export type WaveShape = "sine" | "triangle" | "sawtooth" | "square" | "pulse25";

const WAVE_FNS: Record<WaveShape, (phase: number) => number> = {
  sine: (p) => Math.sin(p),
  triangle: (p) => (2 / Math.PI) * Math.asin(Math.sin(p)),
  sawtooth: (p) => p / Math.PI - 1,
  square: (p) => (p < Math.PI ? 1 : -1),
  pulse25: (p) => (p < Math.PI * 0.5 ? 1 : -1),
};

export function generateWavetableTone(
  frequency: number,
  duration: number,
  sampleRate: number,
  startShape: WaveShape = "sine",
  endShape: WaveShape = "sawtooth",
  morphTime: number = 0.5,
  detune: number = 0,
): Float32Array {
  const totalSamples = Math.ceil(duration * sampleRate);
  const output = new Float32Array(totalSamples);
  const freq = frequency * Math.pow(2, detune / 1200);
  const phaseInc = (2 * Math.PI * freq) / sampleRate;
  let phase = 0;

  const startFn = WAVE_FNS[startShape] || WAVE_FNS.sine;
  const endFn = WAVE_FNS[endShape] || WAVE_FNS.sawtooth;

  for (let n = 0; n < totalSamples; n++) {
    const t = n / sampleRate;
    const morphAmt = Math.min(1, t / Math.max(morphTime, 0.001));
    const s = startFn(phase) * (1 - morphAmt) + endFn(phase) * morphAmt;
    output[n] = s;
    phase = (phase + phaseInc) % (2 * Math.PI);
  }
  return output;
}

// ============================================================================
// ADVANCED DSP EFFECTS
// ============================================================================

/** Schroeder plate reverb model (simplified). */
export class PlateReverb {
  private buffers: Float32Array[];
  private positions: number[];
  private sizes: number[];
  private decays: number[];

  constructor(
    sampleRate: number,
    roomSize: number = 0.7,
    damping: number = 0.5,
  ) {
    // Comb filter delays (prime numbers of samples)
    this.sizes = [1031, 1153, 1237, 1301].map((d) => Math.floor(d * roomSize));
    this.decays = this.sizes.map((s) =>
      Math.exp((-3.0 * s) / (sampleRate * Math.max(0.1, damping))),
    );
    this.buffers = this.sizes.map((s) => new Float32Array(s));
    this.positions = new Array(4).fill(0);
  }

  process(input: number, mix: number = 0.3): number {
    let out = 0;
    for (let i = 0; i < this.sizes.length; i++) {
      const pos = this.positions[i];
      const delayed = this.buffers[i][pos];
      this.buffers[i][pos] = input + delayed * this.decays[i];
      this.positions[i] = (pos + 1) % this.sizes[i];
      out += delayed;
    }
    return input * (1 - mix) + out * (mix / this.sizes.length);
  }
}

/** Stereo chorus/flanger effect. */
export class ChorusFlanger {
  private buffer: Float32Array;
  private writePos: number = 0;
  private maxDelay: number;
  private sr: number;

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    this.maxDelay = Math.floor(sampleRate * 0.05); // 50ms max delay
    this.buffer = new Float32Array(this.maxDelay + 1);
  }

  process(
    input: number,
    rate: number = 0.5, // LFO rate Hz
    depth: number = 0.004, // LFO depth in seconds
    feedback: number = 0.2, // Feedback amount
    time: number = 0, // Current time in seconds
  ): { left: number; right: number } {
    // Two LFOs 90° apart for stereo spread
    const lfo1 = Math.sin(2 * Math.PI * rate * time);
    const lfo2 = Math.sin(2 * Math.PI * rate * time + Math.PI * 0.5);

    const delay1 = Math.max(
      1,
      Math.floor((depth * 0.5 + depth * 0.5 * lfo1) * this.sr),
    );
    const delay2 = Math.max(
      1,
      Math.floor((depth * 0.5 + depth * 0.5 * lfo2) * this.sr),
    );

    const readPos1 =
      (this.writePos - delay1 + this.buffer.length) % this.buffer.length;
    const readPos2 =
      (this.writePos - delay2 + this.buffer.length) % this.buffer.length;

    const d1 = this.buffer[readPos1];
    const d2 = this.buffer[readPos2];

    this.buffer[this.writePos] = input + d1 * feedback;
    this.writePos = (this.writePos + 1) % this.buffer.length;

    return {
      left: input * 0.7 + d1 * 0.3,
      right: input * 0.7 + d2 * 0.3,
    };
  }
}

/** Tape saturation simulation (soft-clip + 2nd harmonic distortion). */
export function tapeSaturate(sample: number, drive: number = 0.5): number {
  const k = 1 + drive * 4;
  // 2nd harmonic distortion + soft clip
  const driven = sample * k;
  const saturated = driven / (1 + Math.abs(driven));
  // Add subtle even harmonic
  return saturated + sample * sample * drive * 0.05;
}

/** Phaser effect — 4-stage all-pass filter chain. */
export class Phaser {
  private aps: Array<{ z: number }> = Array.from({ length: 4 }, () => ({
    z: 0,
  }));
  private phase: number = 0;

  process(
    input: number,
    rate: number = 0.5,
    depth: number = 0.7,
    sampleRate: number = 48000,
  ): number {
    this.phase += (2 * Math.PI * rate) / sampleRate;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

    const freq = 200 + 1800 * (0.5 + 0.5 * Math.sin(this.phase)) * depth;
    const g = Math.tan((Math.PI * freq) / sampleRate);
    const coef = (g - 1) / (g + 1);

    let x = input;
    for (const ap of this.aps) {
      const out = coef * x + ap.z;
      ap.z = x - coef * out;
      x = out;
    }
    return input * 0.5 + x * 0.5;
  }
}

/** Formant filter for vowel-like resonances. */
export function formantFilter(
  input: Float32Array,
  sampleRate: number,
  vowel: "a" | "e" | "i" | "o" | "u" = "a",
  wet: number = 0.6,
): Float32Array {
  // Vowel formant frequencies (F1, F2, F3) and bandwidths
  const formants: Record<string, Array<[number, number]>> = {
    a: [
      [800, 80],
      [1200, 120],
      [2800, 200],
    ],
    e: [
      [400, 60],
      [2200, 120],
      [2900, 150],
    ],
    i: [
      [300, 60],
      [2700, 100],
      [3200, 150],
    ],
    o: [
      [400, 80],
      [750, 100],
      [2400, 200],
    ],
    u: [
      [300, 80],
      [600, 80],
      [2300, 200],
    ],
  };

  const fmts = formants[vowel];
  const output = new Float32Array(input.length);

  for (const [f, bw] of fmts) {
    const w0 = (2 * Math.PI * f) / sampleRate;
    const alpha = (Math.sin(w0) * bw) / (2 * f);
    const b0 = alpha;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let n = 0; n < input.length; n++) {
      const x = input[n];
      const y = (b0 * x + 0 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      output[n] += y;
    }
  }

  for (let n = 0; n < input.length; n++) {
    output[n] = input[n] * (1 - wet) + (output[n] * wet) / fmts.length;
  }
  return output;
}

/** Ring modulator — multiplies signal by a carrier sine. */
export function ringModulate(
  input: Float32Array,
  sampleRate: number,
  carrierFreq: number = 440,
  wet: number = 0.5,
): Float32Array {
  const output = new Float32Array(input.length);
  const phaseInc = (2 * Math.PI * carrierFreq) / sampleRate;
  let phase = 0;
  for (let n = 0; n < input.length; n++) {
    const modulated = input[n] * Math.sin(phase);
    output[n] = input[n] * (1 - wet) + modulated * wet;
    phase = (phase + phaseInc) % (2 * Math.PI);
  }
  return output;
}
