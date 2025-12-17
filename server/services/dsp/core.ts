export interface AudioBuffer {
  samples: Float32Array[];
  sampleRate: number;
  channels: number;
}

export interface DSPContext {
  sampleRate: number;
  blockSize: number;
  tempo: number;
  currentTime: number;
}

export interface DSPProcessor {
  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer;
  reset(): void;
}

export function createBuffer(length: number, channels: number = 2, sampleRate: number = 44100): AudioBuffer {
  return {
    samples: Array.from({ length: channels }, () => new Float32Array(length)),
    sampleRate,
    channels
  };
}

export function copyBuffer(source: AudioBuffer): AudioBuffer {
  return {
    samples: source.samples.map(ch => new Float32Array(ch)),
    sampleRate: source.sampleRate,
    channels: source.channels
  };
}

export function mixBuffers(dry: AudioBuffer, wet: AudioBuffer, mix: number): AudioBuffer {
  const output = copyBuffer(dry);
  const dryAmount = 1 - mix;
  for (let ch = 0; ch < output.channels; ch++) {
    for (let i = 0; i < output.samples[ch].length; i++) {
      output.samples[ch][i] = dry.samples[ch][i] * dryAmount + wet.samples[ch][i] * mix;
    }
  }
  return output;
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}

export function msToSamples(ms: number, sampleRate: number): number {
  return Math.floor((ms / 1000) * sampleRate);
}

export function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000;
}

export function hzToRadians(hz: number, sampleRate: number): number {
  return (2 * Math.PI * hz) / sampleRate;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function softClip(x: number, threshold: number = 0.8): number {
  if (Math.abs(x) < threshold) return x;
  const sign = x > 0 ? 1 : -1;
  return sign * (threshold + (1 - threshold) * Math.tanh((Math.abs(x) - threshold) / (1 - threshold)));
}

export function hardClip(x: number, threshold: number = 1): number {
  return clamp(x, -threshold, threshold);
}

export class DelayLine {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private maxDelay: number;

  constructor(maxDelaySamples: number) {
    this.maxDelay = maxDelaySamples;
    this.buffer = new Float32Array(maxDelaySamples);
  }

  write(sample: number): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.maxDelay;
  }

  read(delaySamples: number): number {
    const readIndex = (this.writeIndex - Math.floor(delaySamples) + this.maxDelay) % this.maxDelay;
    return this.buffer[readIndex];
  }

  readInterpolated(delaySamples: number): number {
    const intDelay = Math.floor(delaySamples);
    const frac = delaySamples - intDelay;
    const idx1 = (this.writeIndex - intDelay + this.maxDelay) % this.maxDelay;
    const idx2 = (idx1 - 1 + this.maxDelay) % this.maxDelay;
    return this.buffer[idx1] * (1 - frac) + this.buffer[idx2] * frac;
  }

  tap(delaySamples: number): number {
    return this.read(delaySamples);
  }

  clear(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
  }
}

export class AllPassFilter {
  private delay: DelayLine;
  private delaySamples: number;
  private feedback: number;

  constructor(delaySamples: number, feedback: number = 0.5) {
    this.delay = new DelayLine(delaySamples + 1);
    this.delaySamples = delaySamples;
    this.feedback = feedback;
  }

  process(input: number): number {
    const delayed = this.delay.read(this.delaySamples);
    const output = -input + delayed;
    this.delay.write(input + delayed * this.feedback);
    return output;
  }

  clear(): void {
    this.delay.clear();
  }
}

export class CombFilter {
  private delay: DelayLine;
  private delaySamples: number;
  private feedback: number;
  private damping: number;
  private filterStore: number = 0;

  constructor(delaySamples: number, feedback: number = 0.8, damping: number = 0.2) {
    this.delay = new DelayLine(delaySamples + 1);
    this.delaySamples = delaySamples;
    this.feedback = feedback;
    this.damping = damping;
  }

  process(input: number): number {
    const output = this.delay.read(this.delaySamples);
    this.filterStore = output * (1 - this.damping) + this.filterStore * this.damping;
    this.delay.write(input + this.filterStore * this.feedback);
    return output;
  }

  setFeedback(feedback: number): void {
    this.feedback = feedback;
  }

  setDamping(damping: number): void {
    this.damping = damping;
  }

  clear(): void {
    this.delay.clear();
    this.filterStore = 0;
  }
}

export class BiquadFilter {
  private b0: number = 1;
  private b1: number = 0;
  private b2: number = 0;
  private a1: number = 0;
  private a2: number = 0;
  private x1: number = 0;
  private x2: number = 0;
  private y1: number = 0;
  private y2: number = 0;

  setLowpass(frequency: number, q: number, sampleRate: number): void {
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = ((1 - cosOmega) / 2) / a0;
    this.b1 = (1 - cosOmega) / a0;
    this.b2 = ((1 - cosOmega) / 2) / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setHighpass(frequency: number, q: number, sampleRate: number): void {
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = ((1 + cosOmega) / 2) / a0;
    this.b1 = (-(1 + cosOmega)) / a0;
    this.b2 = ((1 + cosOmega) / 2) / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setBandpass(frequency: number, q: number, sampleRate: number): void {
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setNotch(frequency: number, q: number, sampleRate: number): void {
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = 1 / a0;
    this.b1 = (-2 * cosOmega) / a0;
    this.b2 = 1 / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setPeaking(frequency: number, q: number, gainDb: number, sampleRate: number): void {
    const A = Math.pow(10, gainDb / 40);
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosOmega) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }

  setLowShelf(frequency: number, gainDb: number, sampleRate: number): void {
    const A = Math.pow(10, gainDb / 40);
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / 2 * Math.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2);

    const a0 = (A + 1) + (A - 1) * cosOmega + 2 * Math.sqrt(A) * alpha;
    this.b0 = (A * ((A + 1) - (A - 1) * cosOmega + 2 * Math.sqrt(A) * alpha)) / a0;
    this.b1 = (2 * A * ((A - 1) - (A + 1) * cosOmega)) / a0;
    this.b2 = (A * ((A + 1) - (A - 1) * cosOmega - 2 * Math.sqrt(A) * alpha)) / a0;
    this.a1 = (-2 * ((A - 1) + (A + 1) * cosOmega)) / a0;
    this.a2 = ((A + 1) + (A - 1) * cosOmega - 2 * Math.sqrt(A) * alpha) / a0;
  }

  setHighShelf(frequency: number, gainDb: number, sampleRate: number): void {
    const A = Math.pow(10, gainDb / 40);
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / 2 * Math.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2);

    const a0 = (A + 1) - (A - 1) * cosOmega + 2 * Math.sqrt(A) * alpha;
    this.b0 = (A * ((A + 1) + (A - 1) * cosOmega + 2 * Math.sqrt(A) * alpha)) / a0;
    this.b1 = (-2 * A * ((A - 1) + (A + 1) * cosOmega)) / a0;
    this.b2 = (A * ((A + 1) + (A - 1) * cosOmega - 2 * Math.sqrt(A) * alpha)) / a0;
    this.a1 = (2 * ((A - 1) - (A + 1) * cosOmega)) / a0;
    this.a2 = ((A + 1) - (A - 1) * cosOmega - 2 * Math.sqrt(A) * alpha) / a0;
  }

  setAllpass(frequency: number, q: number, sampleRate: number): void {
    const omega = hzToRadians(frequency, sampleRate);
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = (1 - alpha) / a0;
    this.b1 = (-2 * cosOmega) / a0;
    this.b2 = (1 + alpha) / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(input: number): number {
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }

  clear(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

export class OnePoleFilter {
  private a0: number = 1;
  private b1: number = 0;
  private y1: number = 0;

  setLowpass(frequency: number, sampleRate: number): void {
    const x = Math.exp(-2 * Math.PI * frequency / sampleRate);
    this.a0 = 1 - x;
    this.b1 = x;
  }

  setHighpass(frequency: number, sampleRate: number): void {
    const x = Math.exp(-2 * Math.PI * frequency / sampleRate);
    this.a0 = (1 + x) / 2;
    this.b1 = -x;
  }

  process(input: number): number {
    const output = this.a0 * input + this.b1 * this.y1;
    this.y1 = output;
    return output;
  }

  clear(): void {
    this.y1 = 0;
  }
}

export class EnvelopeFollower {
  private attackCoeff: number;
  private releaseCoeff: number;
  private envelope: number = 0;

  constructor(attackMs: number, releaseMs: number, sampleRate: number) {
    this.attackCoeff = Math.exp(-1 / msToSamples(attackMs, sampleRate));
    this.releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, sampleRate));
  }

  setAttack(attackMs: number, sampleRate: number): void {
    this.attackCoeff = Math.exp(-1 / msToSamples(attackMs, sampleRate));
  }

  setRelease(releaseMs: number, sampleRate: number): void {
    this.releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, sampleRate));
  }

  process(input: number): number {
    const inputLevel = Math.abs(input);
    const coeff = inputLevel > this.envelope ? this.attackCoeff : this.releaseCoeff;
    this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
    return this.envelope;
  }

  getEnvelope(): number {
    return this.envelope;
  }

  clear(): void {
    this.envelope = 0;
  }
}

export class LFO {
  private phase: number = 0;
  private phaseIncrement: number = 0;

  setFrequency(frequency: number, sampleRate: number): void {
    this.phaseIncrement = (2 * Math.PI * frequency) / sampleRate;
  }

  sine(): number {
    const value = Math.sin(this.phase);
    this.advance();
    return value;
  }

  triangle(): number {
    const normalized = this.phase / (2 * Math.PI);
    const value = 4 * Math.abs(normalized - 0.5) - 1;
    this.advance();
    return value;
  }

  saw(): number {
    const normalized = this.phase / (2 * Math.PI);
    const value = 2 * normalized - 1;
    this.advance();
    return value;
  }

  square(): number {
    const value = this.phase < Math.PI ? 1 : -1;
    this.advance();
    return value;
  }

  private advance(): void {
    this.phase += this.phaseIncrement;
    if (this.phase >= 2 * Math.PI) {
      this.phase -= 2 * Math.PI;
    }
  }

  reset(): void {
    this.phase = 0;
  }
}

export class PitchShifter {
  private buffer: Float32Array;
  private bufferSize: number;
  private writeIndex: number = 0;
  private readIndex1: number = 0;
  private readIndex2: number = 0;
  private crossfade: number = 0;
  private grainSize: number;
  private pitch: number = 1;

  constructor(bufferSize: number = 4096, grainSize: number = 1024) {
    this.bufferSize = bufferSize;
    this.grainSize = grainSize;
    this.buffer = new Float32Array(bufferSize);
    this.readIndex2 = grainSize / 2;
  }

  setPitch(semitones: number): void {
    this.pitch = Math.pow(2, semitones / 12);
  }

  process(input: number): number {
    this.buffer[this.writeIndex] = input;
    
    const sample1 = this.buffer[Math.floor(this.readIndex1) % this.bufferSize];
    const sample2 = this.buffer[Math.floor(this.readIndex2) % this.bufferSize];
    
    const fadeIn = this.crossfade / this.grainSize;
    const fadeOut = 1 - fadeIn;
    const output = sample1 * fadeOut + sample2 * fadeIn;
    
    this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
    this.readIndex1 += this.pitch;
    this.readIndex2 += this.pitch;
    this.crossfade++;
    
    if (this.crossfade >= this.grainSize) {
      this.crossfade = 0;
      this.readIndex1 = this.readIndex2;
      this.readIndex2 = this.writeIndex - this.grainSize / 2;
      if (this.readIndex2 < 0) this.readIndex2 += this.bufferSize;
    }
    
    return output;
  }

  clear(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.readIndex1 = 0;
    this.readIndex2 = this.grainSize / 2;
    this.crossfade = 0;
  }
}

export class Oscillator {
  private phase: number = 0;
  private phaseIncrement: number = 0;

  setFrequency(frequency: number, sampleRate: number): void {
    this.phaseIncrement = frequency / sampleRate;
  }

  sine(): number {
    const value = Math.sin(2 * Math.PI * this.phase);
    this.advance();
    return value;
  }

  saw(): number {
    const value = 2 * this.phase - 1;
    this.advance();
    return value;
  }

  sawBandLimited(numHarmonics: number = 20): number {
    let value = 0;
    for (let k = 1; k <= numHarmonics; k++) {
      value += Math.sin(2 * Math.PI * k * this.phase) / k;
    }
    value *= 2 / Math.PI;
    this.advance();
    return value;
  }

  square(): number {
    const value = this.phase < 0.5 ? 1 : -1;
    this.advance();
    return value;
  }

  squareBandLimited(numHarmonics: number = 20): number {
    let value = 0;
    for (let k = 1; k <= numHarmonics; k += 2) {
      value += Math.sin(2 * Math.PI * k * this.phase) / k;
    }
    value *= 4 / Math.PI;
    this.advance();
    return value;
  }

  triangle(): number {
    const value = 4 * Math.abs(this.phase - 0.5) - 1;
    this.advance();
    return value;
  }

  noise(): number {
    return Math.random() * 2 - 1;
  }

  pulse(width: number = 0.5): number {
    const value = this.phase < width ? 1 : -1;
    this.advance();
    return value;
  }

  private advance(): void {
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) {
      this.phase -= 1;
    }
  }

  reset(): void {
    this.phase = 0;
  }

  setPhase(phase: number): void {
    this.phase = phase % 1;
  }
}

export class ADSR {
  private attackTime: number;
  private decayTime: number;
  private sustainLevel: number;
  private releaseTime: number;
  private sampleRate: number;
  
  private state: 'idle' | 'attack' | 'decay' | 'sustain' | 'release' = 'idle';
  private currentLevel: number = 0;
  private releaseLevel: number = 0;
  private sampleCount: number = 0;

  constructor(attack: number, decay: number, sustain: number, release: number, sampleRate: number) {
    this.attackTime = attack;
    this.decayTime = decay;
    this.sustainLevel = sustain;
    this.releaseTime = release;
    this.sampleRate = sampleRate;
  }

  trigger(): void {
    this.state = 'attack';
    this.sampleCount = 0;
  }

  release(): void {
    if (this.state !== 'idle') {
      this.state = 'release';
      this.releaseLevel = this.currentLevel;
      this.sampleCount = 0;
    }
  }

  process(): number {
    const attackSamples = this.attackTime * this.sampleRate;
    const decaySamples = this.decayTime * this.sampleRate;
    const releaseSamples = this.releaseTime * this.sampleRate;

    switch (this.state) {
      case 'attack':
        if (this.sampleCount < attackSamples) {
          this.currentLevel = this.sampleCount / attackSamples;
          this.sampleCount++;
        } else {
          this.state = 'decay';
          this.sampleCount = 0;
        }
        break;
        
      case 'decay':
        if (this.sampleCount < decaySamples) {
          this.currentLevel = 1 - (1 - this.sustainLevel) * (this.sampleCount / decaySamples);
          this.sampleCount++;
        } else {
          this.state = 'sustain';
        }
        break;
        
      case 'sustain':
        this.currentLevel = this.sustainLevel;
        break;
        
      case 'release':
        if (this.sampleCount < releaseSamples) {
          this.currentLevel = this.releaseLevel * (1 - this.sampleCount / releaseSamples);
          this.sampleCount++;
        } else {
          this.state = 'idle';
          this.currentLevel = 0;
        }
        break;
        
      case 'idle':
      default:
        this.currentLevel = 0;
        break;
    }

    return this.currentLevel;
  }

  isActive(): boolean {
    return this.state !== 'idle';
  }

  getState(): string {
    return this.state;
  }
}
