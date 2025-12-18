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

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'pulse';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';
export type InstrumentType = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'cymbal' | 'bass' | 'lead' | 'pad' | 'pluck' | 'arp';

export interface EnvelopeParams {
  attack: number;   // 0-2 seconds
  decay: number;    // 0-2 seconds
  sustain: number;  // 0-1 level
  release: number;  // 0-5 seconds
}

export interface FilterParams {
  type: FilterType;
  cutoff: number;      // Hz
  resonance: number;   // 0-30 Q value
  envAmount: number;   // How much envelope affects cutoff
  envelope: EnvelopeParams;
}

export interface OscillatorParams {
  type: OscillatorType;
  frequency: number;
  detune: number;        // cents
  pulseWidth?: number;   // for pulse wave, 0-1
  pitchEnvelope?: {
    amount: number;      // semitones
    decay: number;       // seconds
  };
}

export interface DrumParams {
  type: 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'cymbal' | 'perc';
  pitch?: number;        // Base frequency for tonal drums
  decay?: number;        // Overall decay time
  tone?: number;         // 0-1, affects timbre
  snap?: number;         // 0-1, transient sharpness
  noise?: number;        // 0-1, noise mix
  distortion?: number;   // 0-1, saturation amount
}

export interface BassParams {
  type: 'sub' | '808' | 'synth' | 'reese' | 'growl';
  note: string;
  octave: number;
  filter: FilterParams;
  glide?: number;        // Portamento time
  distortion?: number;
  subOscMix?: number;    // 0-1
}

export interface SynthParams {
  type: 'lead' | 'pad' | 'pluck' | 'arp' | 'brass' | 'string';
  oscillators: OscillatorParams[];
  filter: FilterParams;
  ampEnvelope: EnvelopeParams;
  lfo?: {
    rate: number;
    depth: number;
    target: 'pitch' | 'filter' | 'amplitude';
  };
  unison?: {
    voices: number;
    detune: number;
    spread: number;
  };
}

export interface GenerationParams {
  sampleRate: number;
  duration: number;      // seconds
  tempo: number;         // BPM
  key?: string;
  scale?: 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63, 'C#': 277.18, 'Db': 277.18,
  'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
  'E': 329.63,
  'F': 349.23, 'F#': 369.99, 'Gb': 369.99,
  'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
  'A': 440.00, 'A#': 466.16, 'Bb': 466.16,
  'B': 493.88
};

const SCALE_INTERVALS: Record<string, number[]> = {
  'major': [0, 2, 4, 5, 7, 9, 11],
  'minor': [0, 2, 3, 5, 7, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'phrygian': [0, 1, 3, 5, 7, 8, 10],
  'lydian': [0, 2, 4, 6, 7, 9, 11],
  'mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'locrian': [0, 1, 3, 5, 6, 8, 10],
  'pentatonic_major': [0, 2, 4, 7, 9],
  'pentatonic_minor': [0, 3, 5, 7, 10],
  'blues': [0, 3, 5, 6, 7, 10],
  'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getNoteFrequency(note: string, octave: number): number {
  const baseFreq = NOTE_FREQUENCIES[note] || 440;
  const octaveDiff = octave - 4;
  return baseFreq * Math.pow(2, octaveDiff);
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
// OSCILLATOR GENERATORS
// ============================================================================

function generateSine(phase: number): number {
  return Math.sin(2 * Math.PI * phase);
}

function generateSquare(phase: number, pulseWidth: number = 0.5): number {
  return (phase % 1) < pulseWidth ? 1 : -1;
}

function generateSawtooth(phase: number): number {
  return 2 * (phase % 1) - 1;
}

function generateTriangle(phase: number): number {
  const t = phase % 1;
  return 4 * Math.abs(t - 0.5) - 1;
}

function generateNoise(rng: SeededRandom): number {
  return rng.next() * 2 - 1;
}

function generatePulse(phase: number, width: number): number {
  return (phase % 1) < width ? 1 : -1;
}

function generateOscillator(
  type: OscillatorType,
  phase: number,
  rng: SeededRandom,
  pulseWidth: number = 0.5
): number {
  switch (type) {
    case 'sine': return generateSine(phase);
    case 'square': return generateSquare(phase, pulseWidth);
    case 'sawtooth': return generateSawtooth(phase);
    case 'triangle': return generateTriangle(phase);
    case 'noise': return generateNoise(rng);
    case 'pulse': return generatePulse(phase, pulseWidth);
    default: return generateSine(phase);
  }
}

// ============================================================================
// ENVELOPE GENERATORS
// ============================================================================

function generateEnvelope(
  params: EnvelopeParams,
  time: number,
  noteOffTime: number | null,
  sampleRate: number
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

function generateADEnvelope(attack: number, decay: number, time: number): number {
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

  setParams(type: FilterType, frequency: number, Q: number, sampleRate: number) {
    const w0 = 2 * Math.PI * frequency / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);

    let a0: number;

    switch (type) {
      case 'lowpass':
        this.b0 = (1 - cosW0) / 2;
        this.b1 = 1 - cosW0;
        this.b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case 'highpass':
        this.b0 = (1 + cosW0) / 2;
        this.b1 = -(1 + cosW0);
        this.b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case 'bandpass':
        this.b0 = alpha;
        this.b1 = 0;
        this.b2 = -alpha;
        a0 = 1 + alpha;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case 'notch':
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
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2
                   - this.a1 * this.y1 - this.a2 * this.y2;
    
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
// EFFECTS
// ============================================================================

function softClip(x: number, drive: number = 1): number {
  const k = 2 * drive;
  return Math.tanh(k * x) / Math.tanh(k);
}

function hardClip(x: number, threshold: number = 0.8): number {
  return clamp(x, -threshold, threshold);
}

function bitCrush(x: number, bits: number): number {
  const levels = Math.pow(2, bits);
  return Math.round(x * levels) / levels;
}

// Simple delay line for chorus/flanger effects
class DelayLine {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private maxDelay: number;

  constructor(maxDelaySamples: number) {
    this.maxDelay = maxDelaySamples;
    this.buffer = new Float32Array(maxDelaySamples);
  }

  write(sample: number) {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.maxDelay;
  }

  read(delaySamples: number): number {
    const readIndex = (this.writeIndex - delaySamples + this.maxDelay) % this.maxDelay;
    const index0 = Math.floor(readIndex);
    const index1 = (index0 + 1) % this.maxDelay;
    const frac = readIndex - index0;
    return this.buffer[index0] * (1 - frac) + this.buffer[index1] * frac;
  }
}

// ============================================================================
// DRUM SYNTHESIZERS
// ============================================================================

export function synthesizeKick(
  params: DrumParams,
  genParams: GenerationParams
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
  genParams: GenerationParams
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
  bodyFilter.setParams('bandpass', pitch, 2, sampleRate);

  // Noise filter (highpass for snare wires)
  const noiseFilter = new BiquadFilter();
  noiseFilter.setParams('highpass', 2000 + tone * 4000, 1, sampleRate);

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
    let sample = body * bodyEnv * (1 - noiseAmount * 0.5) + 
                 noise * noiseEnv * noiseAmount + 
                 transient;
    
    output[i] = clamp(sample, -1, 1);
  }

  return output;
}

export function synthesizeHihat(
  params: DrumParams,
  genParams: GenerationParams
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const decay = params.decay || 0.1; // Short for closed, long for open
  const tone = params.tone || 0.7;   // Higher = brighter
  const snap = params.snap || 0.8;

  // Multiple bandpass filters for metallic sound
  const filters: BiquadFilter[] = [];
  const filterFreqs = [3000, 6000, 9000, 12000, 15000];
  
  for (const freq of filterFreqs) {
    const filter = new BiquadFilter();
    filter.setParams('bandpass', freq + tone * 2000, 10, sampleRate);
    filters.push(filter);
  }

  // Highpass to remove low end
  const hpFilter = new BiquadFilter();
  hpFilter.setParams('highpass', 5000 + tone * 3000, 1, sampleRate);

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
  genParams: GenerationParams
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const decay = params.decay || 0.3;
  const tone = params.tone || 0.5;

  // Bandpass filter for clap body
  const bpFilter = new BiquadFilter();
  bpFilter.setParams('bandpass', 1000 + tone * 1000, 2, sampleRate);

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
  genParams: GenerationParams
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const baseFreq = getNoteFrequency(params.note, params.octave);
  const { type, filter, distortion = 0, subOscMix = 0.3 } = params;

  // Main filter
  const mainFilter = new BiquadFilter();
  
  // For 808, add sub oscillator
  const useSubOsc = type === '808' || type === 'sub';
  
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const phase = baseFreq * t;
    
    // Filter envelope
    const filterEnv = generateEnvelope(filter.envelope, t, null, sampleRate);
    const filterCutoff = filter.cutoff + filter.envAmount * filterEnv * filter.cutoff;
    mainFilter.setParams(filter.type, clamp(filterCutoff, 20, 20000), filter.resonance, sampleRate);
    
    // Amplitude envelope
    const ampEnv = generateADEnvelope(0.01, duration - 0.01, t);
    
    let sample = 0;
    
    switch (type) {
      case 'sub':
        // Pure sub bass
        sample = generateSine(phase);
        break;
        
      case '808':
        // 808-style: sine with pitch envelope + distortion
        const pitchEnv808 = Math.exp(-t / 0.1);
        const freq808 = baseFreq + baseFreq * 2 * pitchEnv808;
        sample = generateSine(freq808 * t);
        if (distortion > 0) {
          sample = softClip(sample * (1 + distortion * 3), 1);
        }
        break;
        
      case 'synth':
        // Saw bass
        sample = generateSawtooth(phase);
        sample = mainFilter.process(sample);
        break;
        
      case 'reese':
        // Detuned saws (reese bass)
        sample = generateSawtooth(phase);
        sample += generateSawtooth(phase * 1.005) * 0.7;
        sample += generateSawtooth(phase * 0.995) * 0.7;
        sample = mainFilter.process(sample / 2);
        break;
        
      case 'growl':
        // FM growl bass
        const modPhase = phase * 0.5;
        const modAmount = 2 + Math.sin(2 * Math.PI * t * 4) * 1.5; // LFO on FM
        sample = generateSine(phase + generateSine(modPhase) * modAmount);
        sample = mainFilter.process(sample);
        if (distortion > 0) {
          sample = softClip(sample * (1 + distortion * 2), 1);
        }
        break;
    }
    
    // Add sub oscillator
    if (useSubOsc && type !== 'sub') {
      sample = sample * (1 - subOscMix) + generateSine(phase / 2) * subOscMix;
    }
    
    output[i] = sample * ampEnv;
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
  genParams: GenerationParams
): Float32Array {
  const { sampleRate, duration } = genParams;
  const samples = Math.floor(sampleRate * duration);
  const output = new Float32Array(samples);
  const rng = new SeededRandom(Date.now());

  const baseFreq = getNoteFrequency(note, octave);
  const { oscillators, filter, ampEnvelope, lfo, unison } = params;

  // Main filter
  const mainFilter = new BiquadFilter();
  
  // Unison detuning
  const unisonVoices = unison?.voices || 1;
  const unisonDetune = unison?.detune || 0;
  
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    
    // LFO
    let lfoValue = 0;
    if (lfo) {
      lfoValue = Math.sin(2 * Math.PI * lfo.rate * t) * lfo.depth;
    }
    
    // Filter envelope
    const filterEnv = generateEnvelope(filter.envelope, t, null, sampleRate);
    let filterCutoff = filter.cutoff + filter.envAmount * filterEnv * filter.cutoff;
    if (lfo?.target === 'filter') {
      filterCutoff *= 1 + lfoValue;
    }
    mainFilter.setParams(filter.type, clamp(filterCutoff, 20, 20000), filter.resonance, sampleRate);
    
    // Amplitude envelope
    const ampEnv = generateEnvelope(ampEnvelope, t, duration * 0.8, sampleRate);
    
    let sample = 0;
    
    // Generate oscillators with unison
    for (let v = 0; v < unisonVoices; v++) {
      const detuneAmount = unisonVoices > 1 
        ? (v / (unisonVoices - 1) - 0.5) * 2 * unisonDetune
        : 0;
      const voiceFreq = baseFreq * Math.pow(2, detuneAmount / 1200); // Cents to ratio
      
      let pitchMod = 1;
      if (lfo?.target === 'pitch') {
        pitchMod = 1 + lfoValue * 0.1; // Subtle pitch mod
      }
      
      for (const osc of oscillators) {
        const oscFreq = voiceFreq * pitchMod * Math.pow(2, osc.detune / 1200);
        const phase = oscFreq * t;
        
        // Pitch envelope for oscillator
        let freqWithPitchEnv = oscFreq;
        if (osc.pitchEnvelope) {
          const pitchEnv = Math.exp(-t / osc.pitchEnvelope.decay);
          freqWithPitchEnv *= Math.pow(2, osc.pitchEnvelope.amount * pitchEnv / 12);
        }
        
        sample += generateOscillator(osc.type, freqWithPitchEnv * t, rng, osc.pulseWidth);
      }
    }
    
    // Normalize by voice count
    sample /= (unisonVoices * oscillators.length);
    
    // Apply filter
    sample = mainFilter.process(sample);
    
    // Apply amplitude LFO (tremolo)
    let ampMod = 1;
    if (lfo?.target === 'amplitude') {
      ampMod = 1 + lfoValue * 0.3;
    }
    
    output[i] = sample * ampEnv * ampMod;
  }

  return output;
}

// ============================================================================
// PRESET FACTORY
// ============================================================================

export const SYNTH_PRESETS = {
  lead: {
    classic: (): SynthParams => ({
      type: 'lead',
      oscillators: [
        { type: 'sawtooth', frequency: 1, detune: 0 },
        { type: 'square', frequency: 1, detune: 7 },
      ],
      filter: {
        type: 'lowpass',
        cutoff: 3000,
        resonance: 4,
        envAmount: 0.5,
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
      },
      ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      unison: { voices: 3, detune: 15, spread: 0.5 },
    }),
    
    supersaw: (): SynthParams => ({
      type: 'lead',
      oscillators: [
        { type: 'sawtooth', frequency: 1, detune: 0 },
      ],
      filter: {
        type: 'lowpass',
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
      type: 'pad',
      oscillators: [
        { type: 'sawtooth', frequency: 1, detune: 0 },
        { type: 'triangle', frequency: 0.5, detune: -5 },
      ],
      filter: {
        type: 'lowpass',
        cutoff: 2000,
        resonance: 1,
        envAmount: 0.2,
        envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1 },
      },
      ampEnvelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.5 },
      lfo: { rate: 0.5, depth: 0.1, target: 'filter' },
      unison: { voices: 5, detune: 10, spread: 0.6 },
    }),
    
    ethereal: (): SynthParams => ({
      type: 'pad',
      oscillators: [
        { type: 'sine', frequency: 1, detune: 0 },
        { type: 'triangle', frequency: 2, detune: 3 },
      ],
      filter: {
        type: 'lowpass',
        cutoff: 4000,
        resonance: 2,
        envAmount: 0.4,
        envelope: { attack: 1, decay: 0.5, sustain: 0.6, release: 2 },
      },
      ampEnvelope: { attack: 1, decay: 0.5, sustain: 0.7, release: 2 },
      lfo: { rate: 0.2, depth: 0.15, target: 'pitch' },
      unison: { voices: 5, detune: 20, spread: 0.8 },
    }),
  },
  
  pluck: {
    acoustic: (): SynthParams => ({
      type: 'pluck',
      oscillators: [
        { type: 'sawtooth', frequency: 1, detune: 0 },
      ],
      filter: {
        type: 'lowpass',
        cutoff: 8000,
        resonance: 2,
        envAmount: 0.8,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
      },
      ampEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 },
    }),
    
    digital: (): SynthParams => ({
      type: 'pluck',
      oscillators: [
        { type: 'square', frequency: 1, detune: 0, pulseWidth: 0.3 },
      ],
      filter: {
        type: 'lowpass',
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
    trap: (): DrumParams => ({ type: 'kick', pitch: 45, decay: 0.6, tone: 0.3, snap: 0.8, distortion: 0.4 }),
    house: (): DrumParams => ({ type: 'kick', pitch: 55, decay: 0.4, tone: 0.5, snap: 0.6, distortion: 0.2 }),
    acoustic: (): DrumParams => ({ type: 'kick', pitch: 65, decay: 0.3, tone: 0.7, snap: 0.4, distortion: 0.1 }),
    sub: (): DrumParams => ({ type: 'kick', pitch: 35, decay: 0.8, tone: 0.2, snap: 0.3, distortion: 0.5 }),
  },
  snare: {
    trap: (): DrumParams => ({ type: 'snare', pitch: 180, decay: 0.25, tone: 0.4, snap: 0.9, noise: 0.7 }),
    acoustic: (): DrumParams => ({ type: 'snare', pitch: 220, decay: 0.2, tone: 0.6, snap: 0.7, noise: 0.5 }),
    clap: (): DrumParams => ({ type: 'snare', pitch: 200, decay: 0.3, tone: 0.5, snap: 0.6, noise: 0.8 }),
  },
  hihat: {
    closed: (): DrumParams => ({ type: 'hihat', decay: 0.05, tone: 0.6, snap: 0.9 }),
    open: (): DrumParams => ({ type: 'hihat', decay: 0.4, tone: 0.7, snap: 0.7 }),
    pedal: (): DrumParams => ({ type: 'hihat', decay: 0.08, tone: 0.4, snap: 0.5 }),
  },
};

export const BASS_PRESETS = {
  sub: (): BassParams => ({
    type: 'sub',
    note: 'C',
    octave: 1,
    filter: {
      type: 'lowpass',
      cutoff: 200,
      resonance: 0,
      envAmount: 0,
      envelope: { attack: 0.01, decay: 0.5, sustain: 1, release: 0.3 },
    },
  }),
  
  trap808: (): BassParams => ({
    type: '808',
    note: 'C',
    octave: 1,
    distortion: 0.4,
    filter: {
      type: 'lowpass',
      cutoff: 500,
      resonance: 2,
      envAmount: 0.3,
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.5, release: 0.5 },
    },
  }),
  
  synthBass: (): BassParams => ({
    type: 'synth',
    note: 'C',
    octave: 2,
    filter: {
      type: 'lowpass',
      cutoff: 1000,
      resonance: 6,
      envAmount: 0.7,
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
    },
  }),
  
  reese: (): BassParams => ({
    type: 'reese',
    note: 'C',
    octave: 1,
    filter: {
      type: 'lowpass',
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
  
  generateDrum(type: DrumParams['type'], preset?: string, duration: number = 1): Float32Array {
    let params: DrumParams;
    
    switch (type) {
      case 'kick':
        params = preset && DRUM_PRESETS.kick[preset as keyof typeof DRUM_PRESETS.kick]
          ? DRUM_PRESETS.kick[preset as keyof typeof DRUM_PRESETS.kick]()
          : DRUM_PRESETS.kick.trap();
        return synthesizeKick(params, { sampleRate: this.sampleRate, duration, tempo: 120 });
        
      case 'snare':
        params = preset && DRUM_PRESETS.snare[preset as keyof typeof DRUM_PRESETS.snare]
          ? DRUM_PRESETS.snare[preset as keyof typeof DRUM_PRESETS.snare]()
          : DRUM_PRESETS.snare.trap();
        return synthesizeSnare(params, { sampleRate: this.sampleRate, duration, tempo: 120 });
        
      case 'hihat':
        params = preset && DRUM_PRESETS.hihat[preset as keyof typeof DRUM_PRESETS.hihat]
          ? DRUM_PRESETS.hihat[preset as keyof typeof DRUM_PRESETS.hihat]()
          : DRUM_PRESETS.hihat.closed();
        return synthesizeHihat(params, { sampleRate: this.sampleRate, duration, tempo: 120 });
        
      case 'clap':
        params = { type: 'clap', decay: 0.3, tone: 0.5 };
        return synthesizeClap(params, { sampleRate: this.sampleRate, duration, tempo: 120 });
        
      default:
        return synthesizeKick({ type: 'kick' }, { sampleRate: this.sampleRate, duration, tempo: 120 });
    }
  }
  
  generateBass(note: string, octave: number, preset: string = 'trap808', duration: number = 1): Float32Array {
    let params: BassParams;
    
    switch (preset) {
      case 'sub':
        params = { ...BASS_PRESETS.sub(), note, octave };
        break;
      case 'trap808':
      case '808':
        params = { ...BASS_PRESETS.trap808(), note, octave };
        break;
      case 'synth':
        params = { ...BASS_PRESETS.synthBass(), note, octave };
        break;
      case 'reese':
        params = { ...BASS_PRESETS.reese(), note, octave };
        break;
      default:
        params = { ...BASS_PRESETS.trap808(), note, octave };
    }
    
    return synthesizeBass(params, { sampleRate: this.sampleRate, duration, tempo: 120 });
  }
  
  generateSynth(
    note: string,
    octave: number,
    type: 'lead' | 'pad' | 'pluck' = 'lead',
    preset: string = 'classic',
    duration: number = 1
  ): Float32Array {
    let params: SynthParams;
    
    switch (type) {
      case 'lead':
        params = preset === 'supersaw' 
          ? SYNTH_PRESETS.lead.supersaw()
          : SYNTH_PRESETS.lead.classic();
        break;
      case 'pad':
        params = preset === 'ethereal'
          ? SYNTH_PRESETS.pad.ethereal()
          : SYNTH_PRESETS.pad.warm();
        break;
      case 'pluck':
        params = preset === 'digital'
          ? SYNTH_PRESETS.pluck.digital()
          : SYNTH_PRESETS.pluck.acoustic();
        break;
      default:
        params = SYNTH_PRESETS.lead.classic();
    }
    
    return synthesizeSynth(params, note, octave, { sampleRate: this.sampleRate, duration, tempo: 120 });
  }
  
  getSampleRate(): number {
    return this.sampleRate;
  }
}

export default SynthesizerEngine;
