import {
  AudioBuffer, DSPContext, createBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, CombFilter,
  LFO, Oscillator, ADSR, EnvelopeFollower,
  msToSamples, dbToLinear, clamp, softClip, hardClip
} from '../core';

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: DSPContext): void;
  noteOff(context: DSPContext): void;
  render(numSamples: number, context: DSPContext): AudioBuffer;
  isActive(): boolean;
  reset(): void;
}

class NoiseGenerator {
  private lastValue: number = 0;

  white(): number {
    return Math.random() * 2 - 1;
  }

  pink(): number {
    const white = this.white();
    this.lastValue = 0.99 * this.lastValue + 0.01 * white;
    return this.lastValue * 20;
  }

  brown(): number {
    const white = this.white();
    this.lastValue = 0.97 * this.lastValue + 0.03 * white;
    return this.lastValue * 10;
  }
}

export class AcousticDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private hihatEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private roomDelay: DelayLine;
  private roomFilter: BiquadFilter;
  private kickFilter: BiquadFilter;
  private snareFilter: BiquadFilter;
  private hihatFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'hihat' | 'tom' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.001, 0.15, 0, 0.2, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.08, 0, 0.12, 44100);
    this.hihatEnvelope = new ADSR(0.001, 0.04, 0, 0.05, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.02, 0, 0.03, 44100);
    this.roomDelay = new DelayLine(22050);
    this.roomFilter = new BiquadFilter();
    this.kickFilter = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.hihatFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(55, context.sampleRate);
      this.kickFilter.setLowpass(100, 0.8, context.sampleRate);
      this.bodyFilter.setPeaking(80, 2, 6, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.12 + this.velocity * 0.08, 0, 0.15, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.015, 0, 0.02, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 200) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(180, context.sampleRate);
      this.snareFilter.setBandpass(200, 2, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.06 + this.velocity * 0.04, 0.1, 0.1, context.sampleRate);
      this.snareEnvelope.trigger();
    } else if (frequency < 1000) {
      this.drumType = 'tom';
      this.kickOsc.setFrequency(frequency * 0.8, context.sampleRate);
      this.kickFilter.setLowpass(frequency * 2, 0.6, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.1 + this.velocity * 0.05, 0, 0.12, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.02, 0, 0.025, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else {
      this.drumType = 'hihat';
      this.hihatFilter.setHighpass(6000, 1, context.sampleRate);
      this.hihatEnvelope = new ADSR(0.001, 0.02 + this.velocity * 0.02, 0, 0.03, context.sampleRate);
      this.hihatEnvelope.trigger();
    }

    this.roomFilter.setLowpass(4000, 0.5, context.sampleRate);
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.hihatEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const kickFreq = 55 + pitchEnv * 100;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.05;
        sample = this.kickFilter.process(sample);
        sample = this.bodyFilter.process(sample);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        const toneComp = this.snareOsc.sine() * 0.4;
        const noiseComp = this.noise.white() * 0.6;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
      } else if (this.drumType === 'tom') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const tomFreq = this.frequency * 0.8 + pitchEnv * this.frequency * 0.5;
        this.kickOsc.setFrequency(tomFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.08;
        sample = this.kickFilter.process(sample);
      } else {
        const hihatEnv = this.hihatEnvelope.process();
        sample = this.noise.white() * hihatEnv;
        sample = this.hihatFilter.process(sample);
      }

      sample *= this.velocity;
      this.roomDelay.write(sample);
      const roomSample = this.roomDelay.readInterpolated(msToSamples(25, this.sampleRate));
      const roomProcessed = this.roomFilter.process(roomSample) * 0.15;

      sample = softClip(sample + roomProcessed, 0.95);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || this.hihatEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.roomDelay.clear();
    this.roomFilter.clear();
    this.kickFilter.clear();
    this.snareFilter.clear();
    this.hihatFilter.clear();
    this.bodyFilter.clear();
  }
}

export class ElectronicDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private hihatEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private snareFilter: BiquadFilter;
  private hihatFilter: BiquadFilter;
  private distortionFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'hihat' | 'clap' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.001, 0.3, 0, 0.4, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.1, 0, 0.15, 44100);
    this.hihatEnvelope = new ADSR(0.001, 0.05, 0, 0.06, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.03, 0, 0.04, 44100);
    this.kickFilter = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.hihatFilter = new BiquadFilter();
    this.distortionFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(45, context.sampleRate);
      this.kickFilter.setLowpass(80, 1.5, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.25 + this.velocity * 0.15, 0, 0.35, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.025, 0, 0.03, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 200) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(200, context.sampleRate);
      this.snareFilter.setHighpass(150, 1, context.sampleRate);
      this.distortionFilter.setPeaking(1000, 3, 4, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.08 + this.velocity * 0.04, 0.05, 0.12, context.sampleRate);
      this.snareEnvelope.trigger();
    } else if (frequency < 500) {
      this.drumType = 'clap';
      this.snareFilter.setBandpass(1200, 2, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.06, 0.1, 0.15, context.sampleRate);
      this.snareEnvelope.trigger();
    } else {
      this.drumType = 'hihat';
      this.hihatFilter.setHighpass(8000, 2, context.sampleRate);
      this.hihatEnvelope = new ADSR(0.001, 0.015 + (frequency > 2000 ? 0.08 : 0), 0, 0.02, context.sampleRate);
      this.hihatEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.hihatEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const kickFreq = 45 + pitchEnv * 150;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv * 1.4;
        sample = this.kickFilter.process(sample);
        sample = softClip(sample * 1.3, 0.98);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        this.snareOsc.setFrequency(200 + snareEnv * 50, this.sampleRate);
        const toneComp = this.snareOsc.sine() * 0.35;
        const noiseComp = this.noise.white() * 0.65;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
        sample = this.distortionFilter.process(sample);
      } else if (this.drumType === 'clap') {
        const snareEnv = this.snareEnvelope.process();
        const clapNoise = this.noise.white();
        const clapMod = Math.sin(i * 0.15) > 0 ? 1 : 0.3;
        sample = clapNoise * snareEnv * clapMod;
        sample = this.snareFilter.process(sample);
      } else {
        const hihatEnv = this.hihatEnvelope.process();
        sample = this.noise.white() * hihatEnv;
        sample = this.hihatFilter.process(sample);
        sample *= 0.6;
      }

      sample *= this.velocity;
      sample = hardClip(sample, 0.98);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || this.hihatEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.kickFilter.clear();
    this.snareFilter.clear();
    this.hihatFilter.clear();
    this.distortionFilter.clear();
  }
}

export class BreakbeatDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private hihatEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private snareFilter: BiquadFilter;
  private snareBody: BiquadFilter;
  private hihatFilter: BiquadFilter;
  private saturationFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'hihat' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.001, 0.1, 0, 0.12, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.12, 0, 0.14, 44100);
    this.hihatEnvelope = new ADSR(0.001, 0.03, 0, 0.04, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.015, 0, 0.02, 44100);
    this.kickFilter = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.snareBody = new BiquadFilter();
    this.hihatFilter = new BiquadFilter();
    this.saturationFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(60, context.sampleRate);
      this.kickFilter.setLowpass(120, 0.9, context.sampleRate);
      this.saturationFilter.setPeaking(100, 2, 4, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.08 + this.velocity * 0.04, 0, 0.1, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.012, 0, 0.015, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 300) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(185, context.sampleRate);
      this.snareFilter.setHighpass(200, 0.8, context.sampleRate);
      this.snareBody.setPeaking(800, 2.5, 5, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.1 + this.velocity * 0.04, 0.08, 0.12, context.sampleRate);
      this.snareEnvelope.trigger();
    } else {
      this.drumType = 'hihat';
      this.hihatFilter.setHighpass(5000, 1.5, context.sampleRate);
      this.hihatEnvelope = new ADSR(0.001, 0.025, 0, 0.03, context.sampleRate);
      this.hihatEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.hihatEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const kickFreq = 60 + pitchEnv * 80;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.1;
        sample = this.kickFilter.process(sample);
        sample = this.saturationFilter.process(sample);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        const toneComp = this.snareOsc.sine() * 0.3;
        const noiseComp = this.noise.white() * 0.7;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
        sample = this.snareBody.process(sample);
        sample = softClip(sample * 1.2, 0.9);
      } else {
        const hihatEnv = this.hihatEnvelope.process();
        sample = this.noise.white() * hihatEnv;
        sample = this.hihatFilter.process(sample);
        sample *= 0.7;
      }

      sample *= this.velocity;
      sample = softClip(sample, 0.92);

      const stereoWidth = 0.02;
      output.samples[0][i] = sample * (1 + stereoWidth);
      output.samples[1][i] = sample * (1 - stereoWidth);
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || this.hihatEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.kickFilter.clear();
    this.snareFilter.clear();
    this.snareBody.clear();
    this.hihatFilter.clear();
    this.saturationFilter.clear();
  }
}

export class TrapDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private subOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private subEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private hihatEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private subFilter: OnePoleFilter;
  private snareFilter: BiquadFilter;
  private hihatFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'hihat' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.subOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.001, 0.4, 0, 0.5, 44100);
    this.subEnvelope = new ADSR(0.001, 0.5, 0.3, 0.6, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.15, 0, 0.18, 44100);
    this.hihatEnvelope = new ADSR(0.001, 0.03, 0, 0.04, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.04, 0, 0.05, 44100);
    this.kickFilter = new BiquadFilter();
    this.subFilter = new OnePoleFilter();
    this.snareFilter = new BiquadFilter();
    this.hihatFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(40, context.sampleRate);
      this.subOsc.setFrequency(35, context.sampleRate);
      this.kickFilter.setLowpass(60, 2, context.sampleRate);
      this.subFilter.setLowpass(50, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.35 + this.velocity * 0.15, 0.1, 0.45, context.sampleRate);
      this.subEnvelope = new ADSR(0.001, 0.45, 0.25, 0.55, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.035, 0, 0.045, context.sampleRate);
      this.kickEnvelope.trigger();
      this.subEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 300) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(210, context.sampleRate);
      this.snareFilter.setHighpass(180, 1.2, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.12 + this.velocity * 0.05, 0.05, 0.15, context.sampleRate);
      this.snareEnvelope.trigger();
    } else {
      this.drumType = 'hihat';
      const isRoll = frequency > 1500;
      this.hihatFilter.setHighpass(isRoll ? 10000 : 7000, 2, context.sampleRate);
      this.hihatEnvelope = new ADSR(0.001, isRoll ? 0.01 : 0.025, 0, isRoll ? 0.012 : 0.03, context.sampleRate);
      this.hihatEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.subEnvelope.release();
    this.snareEnvelope.release();
    this.hihatEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const subEnv = this.subEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        
        const kickFreq = 40 + pitchEnv * 180;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        const kickSample = this.kickOsc.sine() * kickEnv * 0.7;
        
        const subFreq = 35 + pitchEnv * 30;
        this.subOsc.setFrequency(subFreq, this.sampleRate);
        const subSample = this.subOsc.sine() * subEnv * 0.8;
        
        sample = this.kickFilter.process(kickSample) + this.subFilter.process(subSample);
        sample = softClip(sample * 1.4, 0.98);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        this.snareOsc.setFrequency(210 + snareEnv * 40, this.sampleRate);
        const toneComp = this.snareOsc.sine() * 0.3;
        const noiseComp = this.noise.white() * 0.7;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
      } else {
        const hihatEnv = this.hihatEnvelope.process();
        sample = this.noise.white() * hihatEnv;
        sample = this.hihatFilter.process(sample);
        sample *= 0.5;
      }

      sample *= this.velocity;
      sample = hardClip(sample, 0.98);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.subEnvelope.isActive() || 
           this.snareEnvelope.isActive() || this.hihatEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.subOsc.reset();
    this.snareOsc.reset();
    this.kickFilter.clear();
    this.subFilter.clear();
    this.snareFilter.clear();
    this.hihatFilter.clear();
  }
}

export class JazzDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private brushEnvelope: ADSR;
  private rideEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private snareFilter: BiquadFilter;
  private brushFilter: BiquadFilter;
  private rideFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'brush' | 'ride' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.002, 0.08, 0, 0.1, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.06, 0.1, 0.08, 44100);
    this.brushEnvelope = new ADSR(0.003, 0.12, 0.2, 0.15, 44100);
    this.rideEnvelope = new ADSR(0.001, 0.2, 0.3, 0.5, 44100);
    this.kickFilter = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.brushFilter = new BiquadFilter();
    this.rideFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(65, context.sampleRate);
      this.kickFilter.setLowpass(150, 0.6, context.sampleRate);
      this.warmthFilter.setLowShelf(200, 3, context.sampleRate);
      this.kickEnvelope = new ADSR(0.002, 0.06 + this.velocity * 0.03, 0, 0.08, context.sampleRate);
      this.kickEnvelope.trigger();
    } else if (frequency < 200) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(160, context.sampleRate);
      this.snareFilter.setBandpass(350, 1.5, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.05 + this.velocity * 0.02, 0.08, 0.07, context.sampleRate);
      this.snareEnvelope.trigger();
    } else if (frequency < 500) {
      this.drumType = 'brush';
      this.brushFilter.setBandpass(2000, 0.8, context.sampleRate);
      this.brushEnvelope = new ADSR(0.003, 0.1 + this.velocity * 0.04, 0.15, 0.12, context.sampleRate);
      this.brushEnvelope.trigger();
    } else {
      this.drumType = 'ride';
      this.rideFilter.setHighpass(2500, 0.8, context.sampleRate);
      this.rideEnvelope = new ADSR(0.001, 0.15 + this.velocity * 0.1, 0.25, 0.4, context.sampleRate);
      this.rideEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.brushEnvelope.release();
    this.rideEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.04;
        sample = this.kickFilter.process(sample);
        sample = this.warmthFilter.process(sample);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        const toneComp = this.snareOsc.sine() * 0.35;
        const wireComp = this.noise.pink() * 0.65;
        sample = (toneComp + wireComp) * snareEnv;
        sample = this.snareFilter.process(sample);
      } else if (this.drumType === 'brush') {
        const brushEnv = this.brushEnvelope.process();
        sample = this.noise.pink() * brushEnv;
        sample = this.brushFilter.process(sample);
        sample *= 0.6;
      } else {
        const rideEnv = this.rideEnvelope.process();
        const bellTone = Math.sin(2 * Math.PI * 3000 * i / this.sampleRate) * 0.2;
        sample = (this.noise.white() * 0.3 + bellTone) * rideEnv;
        sample = this.rideFilter.process(sample);
        sample *= 0.5;
      }

      sample *= this.velocity * 0.8;
      sample = softClip(sample, 0.85);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || 
           this.brushEnvelope.isActive() || this.rideEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.kickFilter.clear();
    this.snareFilter.clear();
    this.brushFilter.clear();
    this.rideFilter.clear();
    this.warmthFilter.clear();
  }
}

export class RockDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private tomOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private tomEnvelope: ADSR;
  private crashEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private kickBoost: BiquadFilter;
  private snareFilter: BiquadFilter;
  private snareSnap: BiquadFilter;
  private tomFilter: BiquadFilter;
  private crashFilter: BiquadFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'tom' | 'crash' = 'kick';

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.tomOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.001, 0.12, 0, 0.15, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.1, 0.05, 0.12, 44100);
    this.tomEnvelope = new ADSR(0.001, 0.15, 0, 0.18, 44100);
    this.crashEnvelope = new ADSR(0.001, 0.4, 0.3, 0.8, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.02, 0, 0.025, 44100);
    this.kickFilter = new BiquadFilter();
    this.kickBoost = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.snareSnap = new BiquadFilter();
    this.tomFilter = new BiquadFilter();
    this.crashFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(55, context.sampleRate);
      this.kickFilter.setLowpass(140, 1, context.sampleRate);
      this.kickBoost.setPeaking(100, 2, 5, context.sampleRate);
      this.kickEnvelope = new ADSR(0.001, 0.1 + this.velocity * 0.05, 0, 0.12, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.018, 0, 0.022, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 200) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(175, context.sampleRate);
      this.snareFilter.setHighpass(150, 0.9, context.sampleRate);
      this.snareSnap.setPeaking(4000, 3, 6, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.08 + this.velocity * 0.04, 0.05, 0.1, context.sampleRate);
      this.snareEnvelope.trigger();
    } else if (frequency < 800) {
      this.drumType = 'tom';
      this.tomOsc.setFrequency(frequency * 0.6, context.sampleRate);
      this.tomFilter.setLowpass(frequency * 2, 0.7, context.sampleRate);
      this.tomEnvelope = new ADSR(0.001, 0.12 + this.velocity * 0.05, 0, 0.15, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.025, 0, 0.03, context.sampleRate);
      this.tomEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else {
      this.drumType = 'crash';
      this.crashFilter.setHighpass(3000, 1, context.sampleRate);
      this.crashEnvelope = new ADSR(0.001, 0.35 + this.velocity * 0.15, 0.25, 0.7, context.sampleRate);
      this.crashEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.tomEnvelope.release();
    this.crashEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const kickFreq = 55 + pitchEnv * 90;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.06;
        sample = this.kickFilter.process(sample);
        sample = this.kickBoost.process(sample);
        sample = softClip(sample * 1.3, 0.95);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        const toneComp = this.snareOsc.sine() * 0.35;
        const noiseComp = this.noise.white() * 0.65;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
        sample = this.snareSnap.process(sample);
        sample = softClip(sample * 1.2, 0.92);
      } else if (this.drumType === 'tom') {
        const tomEnv = this.tomEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const tomFreq = this.frequency * 0.6 + pitchEnv * this.frequency * 0.4;
        this.tomOsc.setFrequency(tomFreq, this.sampleRate);
        sample = this.tomOsc.sine() * tomEnv;
        sample += this.noise.brown() * tomEnv * 0.1;
        sample = this.tomFilter.process(sample);
      } else {
        const crashEnv = this.crashEnvelope.process();
        sample = this.noise.white() * crashEnv;
        sample = this.crashFilter.process(sample);
        sample *= 0.6;
      }

      sample *= this.velocity;
      sample = hardClip(sample, 0.98);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || 
           this.tomEnvelope.isActive() || this.crashEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.tomOsc.reset();
    this.kickFilter.clear();
    this.kickBoost.clear();
    this.snareFilter.clear();
    this.snareSnap.clear();
    this.tomFilter.clear();
    this.crashFilter.clear();
  }
}

export class PercussionSynth implements SynthesizerEngine {
  private congaOsc: Oscillator;
  private bongoOsc: Oscillator;
  private noise: NoiseGenerator;
  private envelope: ADSR;
  private pitchEnvelope: ADSR;
  private bodyFilter: BiquadFilter;
  private toneFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private frequency: number = 200;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private percType: 'conga' | 'bongo' | 'shaker' | 'tambourine' | 'cowbell' = 'conga';

  constructor() {
    this.congaOsc = new Oscillator();
    this.bongoOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.envelope = new ADSR(0.001, 0.15, 0, 0.18, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.02, 0, 0.025, 44100);
    this.bodyFilter = new BiquadFilter();
    this.toneFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 150) {
      this.percType = 'conga';
      this.congaOsc.setFrequency(frequency, context.sampleRate);
      this.bodyFilter.setPeaking(frequency, 3, 5, context.sampleRate);
      this.toneFilter.setLowpass(frequency * 3, 0.8, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.12 + this.velocity * 0.05, 0, 0.15, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.018, 0, 0.022, context.sampleRate);
      this.envelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 300) {
      this.percType = 'bongo';
      this.bongoOsc.setFrequency(frequency, context.sampleRate);
      this.bodyFilter.setPeaking(frequency, 2.5, 4, context.sampleRate);
      this.toneFilter.setLowpass(frequency * 4, 0.7, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.08 + this.velocity * 0.03, 0, 0.1, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.012, 0, 0.015, context.sampleRate);
      this.envelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 600) {
      this.percType = 'cowbell';
      this.congaOsc.setFrequency(frequency, context.sampleRate);
      this.bongoOsc.setFrequency(frequency * 1.5, context.sampleRate);
      this.toneFilter.setBandpass(frequency, 4, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.08, 0.15, 0.15, context.sampleRate);
      this.envelope.trigger();
    } else if (frequency < 1500) {
      this.percType = 'tambourine';
      this.resonanceFilter.setHighpass(4000, 1.5, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.05, 0.1, 0.08, context.sampleRate);
      this.envelope.trigger();
    } else {
      this.percType = 'shaker';
      this.resonanceFilter.setBandpass(6000, 1.2, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.04, 0.05, 0.05, context.sampleRate);
      this.envelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;
      const envValue = this.envelope.process();

      if (this.percType === 'conga') {
        const pitchEnv = this.pitchEnvelope.process();
        const freq = this.frequency + pitchEnv * this.frequency * 0.5;
        this.congaOsc.setFrequency(freq, this.sampleRate);
        sample = this.congaOsc.sine() * envValue;
        sample += this.noise.brown() * envValue * 0.15;
        sample = this.bodyFilter.process(sample);
        sample = this.toneFilter.process(sample);
      } else if (this.percType === 'bongo') {
        const pitchEnv = this.pitchEnvelope.process();
        const freq = this.frequency + pitchEnv * this.frequency * 0.6;
        this.bongoOsc.setFrequency(freq, this.sampleRate);
        sample = this.bongoOsc.sine() * envValue;
        sample += this.noise.white() * envValue * 0.1;
        sample = this.bodyFilter.process(sample);
        sample = this.toneFilter.process(sample);
      } else if (this.percType === 'cowbell') {
        const tone1 = this.congaOsc.sine();
        const tone2 = this.bongoOsc.sine();
        sample = (tone1 * 0.6 + tone2 * 0.4) * envValue;
        sample = this.toneFilter.process(sample);
        sample = hardClip(sample * 1.5, 0.9);
      } else if (this.percType === 'tambourine') {
        const jingle = this.noise.white();
        sample = jingle * envValue;
        sample = this.resonanceFilter.process(sample);
        sample *= 0.5;
      } else {
        sample = this.noise.white() * envValue;
        sample = this.resonanceFilter.process(sample);
        sample *= 0.4;
      }

      sample *= this.velocity;
      sample = softClip(sample, 0.92);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.congaOsc.reset();
    this.bongoOsc.reset();
    this.bodyFilter.clear();
    this.toneFilter.clear();
    this.resonanceFilter.clear();
  }
}

export class IndustrialDrumsSynth implements SynthesizerEngine {
  private metalOsc1: Oscillator;
  private metalOsc2: Oscillator;
  private metalOsc3: Oscillator;
  private noise: NoiseGenerator;
  private envelope: ADSR;
  private hitEnvelope: ADSR;
  private metalFilter: BiquadFilter;
  private distortionFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private frequency: number = 200;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private hitType: 'anvil' | 'pipe' | 'clang' | 'slam' = 'anvil';

  constructor() {
    this.metalOsc1 = new Oscillator();
    this.metalOsc2 = new Oscillator();
    this.metalOsc3 = new Oscillator();
    this.noise = new NoiseGenerator();
    this.envelope = new ADSR(0.001, 0.3, 0.1, 0.4, 44100);
    this.hitEnvelope = new ADSR(0.001, 0.01, 0, 0.012, 44100);
    this.metalFilter = new BiquadFilter();
    this.distortionFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    if (frequency < 100) {
      this.hitType = 'slam';
      this.metalOsc1.setFrequency(40, context.sampleRate);
      this.metalFilter.setLowpass(100, 1.5, context.sampleRate);
      this.distortionFilter.setPeaking(80, 3, 8, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.2 + this.velocity * 0.1, 0.05, 0.25, context.sampleRate);
    } else if (frequency < 300) {
      this.hitType = 'anvil';
      const ratios = [1, 1.47, 2.09, 2.56];
      this.metalOsc1.setFrequency(frequency * ratios[0], context.sampleRate);
      this.metalOsc2.setFrequency(frequency * ratios[1], context.sampleRate);
      this.metalOsc3.setFrequency(frequency * ratios[2], context.sampleRate);
      this.metalFilter.setBandpass(frequency * 2, 2, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.25 + this.velocity * 0.1, 0.08, 0.35, context.sampleRate);
    } else if (frequency < 800) {
      this.hitType = 'pipe';
      const ratios = [1, 2.76, 5.4];
      this.metalOsc1.setFrequency(frequency * ratios[0], context.sampleRate);
      this.metalOsc2.setFrequency(frequency * ratios[1], context.sampleRate);
      this.metalOsc3.setFrequency(frequency * ratios[2], context.sampleRate);
      this.resonanceFilter.setPeaking(frequency * 2, 4, 6, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.3, 0.12, 0.4, context.sampleRate);
    } else {
      this.hitType = 'clang';
      const ratios = [1, 1.32, 1.87, 2.43];
      this.metalOsc1.setFrequency(frequency * ratios[0], context.sampleRate);
      this.metalOsc2.setFrequency(frequency * ratios[1], context.sampleRate);
      this.metalOsc3.setFrequency(frequency * ratios[2], context.sampleRate);
      this.metalFilter.setHighpass(2000, 1.5, context.sampleRate);
      this.envelope = new ADSR(0.001, 0.2, 0.1, 0.3, context.sampleRate);
    }

    this.hitEnvelope = new ADSR(0.001, 0.008, 0, 0.01, context.sampleRate);
    this.envelope.trigger();
    this.hitEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.hitEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;
      const envValue = this.envelope.process();
      const hitValue = this.hitEnvelope.process();

      if (this.hitType === 'slam') {
        sample = this.metalOsc1.sine() * envValue * 0.8;
        sample += this.noise.brown() * envValue * 0.4;
        sample += this.noise.white() * hitValue * 0.6;
        sample = this.metalFilter.process(sample);
        sample = this.distortionFilter.process(sample);
        sample = hardClip(sample * 2, 0.95);
      } else if (this.hitType === 'anvil') {
        const tone1 = this.metalOsc1.sine() * 0.4;
        const tone2 = this.metalOsc2.sine() * 0.3;
        const tone3 = this.metalOsc3.sine() * 0.2;
        sample = (tone1 + tone2 + tone3) * envValue;
        sample += this.noise.white() * hitValue * 0.4;
        sample = this.metalFilter.process(sample);
        sample = hardClip(sample * 1.5, 0.9);
      } else if (this.hitType === 'pipe') {
        const tone1 = this.metalOsc1.sine() * 0.5;
        const tone2 = this.metalOsc2.sine() * 0.25;
        const tone3 = this.metalOsc3.sine() * 0.15;
        sample = (tone1 + tone2 + tone3) * envValue;
        sample += this.noise.white() * hitValue * 0.3;
        sample = this.resonanceFilter.process(sample);
      } else {
        const tone1 = this.metalOsc1.sine() * 0.35;
        const tone2 = this.metalOsc2.sine() * 0.3;
        const tone3 = this.metalOsc3.sine() * 0.25;
        sample = (tone1 + tone2 + tone3) * envValue;
        sample += this.noise.white() * hitValue * 0.35;
        sample = this.metalFilter.process(sample);
      }

      sample *= this.velocity;
      sample = softClip(sample, 0.95);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.metalOsc1.reset();
    this.metalOsc2.reset();
    this.metalOsc3.reset();
    this.metalFilter.clear();
    this.distortionFilter.clear();
    this.resonanceFilter.clear();
  }
}

export class LoFiDrumsSynth implements SynthesizerEngine {
  private kickOsc: Oscillator;
  private snareOsc: Oscillator;
  private noise: NoiseGenerator;
  private kickEnvelope: ADSR;
  private snareEnvelope: ADSR;
  private hihatEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private kickFilter: BiquadFilter;
  private snareFilter: BiquadFilter;
  private hihatFilter: BiquadFilter;
  private lofiFilter: BiquadFilter;
  private bitcrushFilter: OnePoleFilter;
  private frequency: number = 60;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'kick' | 'snare' | 'hihat' = 'kick';
  private sampleHold: number = 0;
  private sampleCounter: number = 0;
  private crushRate: number = 4;

  constructor() {
    this.kickOsc = new Oscillator();
    this.snareOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.kickEnvelope = new ADSR(0.002, 0.1, 0, 0.12, 44100);
    this.snareEnvelope = new ADSR(0.001, 0.08, 0, 0.1, 44100);
    this.hihatEnvelope = new ADSR(0.001, 0.03, 0, 0.04, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.015, 0, 0.02, 44100);
    this.kickFilter = new BiquadFilter();
    this.snareFilter = new BiquadFilter();
    this.hihatFilter = new BiquadFilter();
    this.lofiFilter = new BiquadFilter();
    this.bitcrushFilter = new OnePoleFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.lofiFilter.setLowpass(4000, 0.5, context.sampleRate);
    this.bitcrushFilter.setLowpass(8000, context.sampleRate);

    if (frequency < 80) {
      this.drumType = 'kick';
      this.kickOsc.setFrequency(55, context.sampleRate);
      this.kickFilter.setLowpass(120, 0.8, context.sampleRate);
      this.kickEnvelope = new ADSR(0.002, 0.08 + this.velocity * 0.04, 0, 0.1, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.012, 0, 0.015, context.sampleRate);
      this.kickEnvelope.trigger();
      this.pitchEnvelope.trigger();
      this.crushRate = 4;
    } else if (frequency < 300) {
      this.drumType = 'snare';
      this.snareOsc.setFrequency(170, context.sampleRate);
      this.snareFilter.setBandpass(400, 1.2, context.sampleRate);
      this.snareEnvelope = new ADSR(0.001, 0.06 + this.velocity * 0.03, 0.05, 0.08, context.sampleRate);
      this.snareEnvelope.trigger();
      this.crushRate = 3;
    } else {
      this.drumType = 'hihat';
      this.hihatFilter.setHighpass(5000, 1, context.sampleRate);
      this.hihatEnvelope = new ADSR(0.001, 0.02, 0, 0.025, context.sampleRate);
      this.hihatEnvelope.trigger();
      this.crushRate = 2;
    }
  }

  noteOff(context: DSPContext): void {
    this.kickEnvelope.release();
    this.snareEnvelope.release();
    this.hihatEnvelope.release();
    this.pitchEnvelope.release();
  }

  private bitcrush(sample: number, bits: number): number {
    const levels = Math.pow(2, bits);
    return Math.round(sample * levels) / levels;
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'kick') {
        const kickEnv = this.kickEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const kickFreq = 55 + pitchEnv * 70;
        this.kickOsc.setFrequency(kickFreq, this.sampleRate);
        sample = this.kickOsc.sine() * kickEnv;
        sample += this.noise.brown() * kickEnv * 0.08;
        sample = this.kickFilter.process(sample);
      } else if (this.drumType === 'snare') {
        const snareEnv = this.snareEnvelope.process();
        const toneComp = this.snareOsc.sine() * 0.35;
        const noiseComp = this.noise.white() * 0.65;
        sample = (toneComp + noiseComp) * snareEnv;
        sample = this.snareFilter.process(sample);
      } else {
        const hihatEnv = this.hihatEnvelope.process();
        sample = this.noise.white() * hihatEnv;
        sample = this.hihatFilter.process(sample);
        sample *= 0.6;
      }

      this.sampleCounter++;
      if (this.sampleCounter >= this.crushRate) {
        this.sampleHold = sample;
        this.sampleCounter = 0;
      }
      sample = this.sampleHold;

      sample = this.bitcrush(sample, 8);

      sample = this.lofiFilter.process(sample);
      sample = this.bitcrushFilter.process(sample);

      sample *= this.velocity;
      sample = softClip(sample, 0.88);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.kickEnvelope.isActive() || this.snareEnvelope.isActive() || this.hihatEnvelope.isActive();
  }

  reset(): void {
    this.kickOsc.reset();
    this.snareOsc.reset();
    this.kickFilter.clear();
    this.snareFilter.clear();
    this.hihatFilter.clear();
    this.lofiFilter.clear();
    this.bitcrushFilter.clear();
    this.sampleHold = 0;
    this.sampleCounter = 0;
  }
}

export class OrchestralDrumsSynth implements SynthesizerEngine {
  private timpaniOsc: Oscillator;
  private bassDrumOsc: Oscillator;
  private noise: NoiseGenerator;
  private timpaniEnvelope: ADSR;
  private bassDrumEnvelope: ADSR;
  private cymbalEnvelope: ADSR;
  private pitchEnvelope: ADSR;
  private timpaniFilter: BiquadFilter;
  private bassDrumFilter: BiquadFilter;
  private cymbalFilter: BiquadFilter;
  private bodyResonance: BiquadFilter;
  private roomDelay: DelayLine;
  private roomFilter: BiquadFilter;
  private frequency: number = 80;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private drumType: 'timpani' | 'bassdrum' | 'cymbal' | 'triangle' = 'timpani';

  constructor() {
    this.timpaniOsc = new Oscillator();
    this.bassDrumOsc = new Oscillator();
    this.noise = new NoiseGenerator();
    this.timpaniEnvelope = new ADSR(0.001, 0.4, 0.2, 0.6, 44100);
    this.bassDrumEnvelope = new ADSR(0.002, 0.25, 0.1, 0.35, 44100);
    this.cymbalEnvelope = new ADSR(0.001, 0.8, 0.4, 1.2, 44100);
    this.pitchEnvelope = new ADSR(0.001, 0.03, 0, 0.04, 44100);
    this.timpaniFilter = new BiquadFilter();
    this.bassDrumFilter = new BiquadFilter();
    this.cymbalFilter = new BiquadFilter();
    this.bodyResonance = new BiquadFilter();
    this.roomDelay = new DelayLine(44100);
    this.roomFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.roomFilter.setLowpass(3000, 0.4, context.sampleRate);

    if (frequency < 100) {
      this.drumType = 'bassdrum';
      this.bassDrumOsc.setFrequency(45, context.sampleRate);
      this.bassDrumFilter.setLowpass(100, 0.7, context.sampleRate);
      this.bodyResonance.setPeaking(60, 2, 5, context.sampleRate);
      this.bassDrumEnvelope = new ADSR(0.002, 0.2 + this.velocity * 0.1, 0.08, 0.3, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.025, 0, 0.03, context.sampleRate);
      this.bassDrumEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 300) {
      this.drumType = 'timpani';
      this.timpaniOsc.setFrequency(frequency, context.sampleRate);
      this.timpaniFilter.setLowpass(frequency * 4, 0.6, context.sampleRate);
      this.bodyResonance.setPeaking(frequency, 3, 6, context.sampleRate);
      this.timpaniEnvelope = new ADSR(0.001, 0.35 + this.velocity * 0.15, 0.15, 0.5, context.sampleRate);
      this.pitchEnvelope = new ADSR(0.001, 0.025, 0, 0.03, context.sampleRate);
      this.timpaniEnvelope.trigger();
      this.pitchEnvelope.trigger();
    } else if (frequency < 1000) {
      this.drumType = 'triangle';
      this.timpaniOsc.setFrequency(frequency, context.sampleRate);
      this.timpaniFilter.setHighpass(2000, 0.8, context.sampleRate);
      this.cymbalEnvelope = new ADSR(0.001, 0.5, 0.3, 0.8, context.sampleRate);
      this.cymbalEnvelope.trigger();
    } else {
      this.drumType = 'cymbal';
      this.cymbalFilter.setHighpass(3000, 1, context.sampleRate);
      this.cymbalEnvelope = new ADSR(0.001, 0.7 + this.velocity * 0.3, 0.35, 1.0, context.sampleRate);
      this.cymbalEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.timpaniEnvelope.release();
    this.bassDrumEnvelope.release();
    this.cymbalEnvelope.release();
    this.pitchEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      let sample = 0;

      if (this.drumType === 'bassdrum') {
        const envValue = this.bassDrumEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const freq = 45 + pitchEnv * 30;
        this.bassDrumOsc.setFrequency(freq, this.sampleRate);
        sample = this.bassDrumOsc.sine() * envValue;
        sample += this.noise.brown() * envValue * 0.15;
        sample = this.bassDrumFilter.process(sample);
        sample = this.bodyResonance.process(sample);
      } else if (this.drumType === 'timpani') {
        const envValue = this.timpaniEnvelope.process();
        const pitchEnv = this.pitchEnvelope.process();
        const freq = this.frequency + pitchEnv * this.frequency * 0.3;
        this.timpaniOsc.setFrequency(freq, this.sampleRate);
        sample = this.timpaniOsc.sine() * envValue;
        const overtone = Math.sin(2 * Math.PI * freq * 1.5 * i / this.sampleRate) * 0.2;
        sample += overtone * envValue;
        sample += this.noise.brown() * envValue * 0.08;
        sample = this.timpaniFilter.process(sample);
        sample = this.bodyResonance.process(sample);
      } else if (this.drumType === 'triangle') {
        const envValue = this.cymbalEnvelope.process();
        const tone1 = Math.sin(2 * Math.PI * this.frequency * i / this.sampleRate);
        const tone2 = Math.sin(2 * Math.PI * this.frequency * 2.13 * i / this.sampleRate) * 0.5;
        const tone3 = Math.sin(2 * Math.PI * this.frequency * 3.47 * i / this.sampleRate) * 0.3;
        sample = (tone1 + tone2 + tone3) * envValue;
        sample = this.timpaniFilter.process(sample);
        sample *= 0.5;
      } else {
        const envValue = this.cymbalEnvelope.process();
        sample = this.noise.white() * envValue;
        sample = this.cymbalFilter.process(sample);
        sample *= 0.5;
      }

      this.roomDelay.write(sample);
      const roomSample = this.roomDelay.readInterpolated(msToSamples(40, this.sampleRate));
      const roomProcessed = this.roomFilter.process(roomSample) * 0.2;

      sample *= this.velocity;
      sample = softClip(sample + roomProcessed, 0.92);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.timpaniEnvelope.isActive() || this.bassDrumEnvelope.isActive() || this.cymbalEnvelope.isActive();
  }

  reset(): void {
    this.timpaniOsc.reset();
    this.bassDrumOsc.reset();
    this.timpaniFilter.clear();
    this.bassDrumFilter.clear();
    this.cymbalFilter.clear();
    this.bodyResonance.clear();
    this.roomDelay.clear();
    this.roomFilter.clear();
  }
}

export const DRUMS_SYNTHESIZERS: Record<string, () => SynthesizerEngine> = {
  'acoustic-drums': () => new AcousticDrumsSynth(),
  'electronic-drums': () => new ElectronicDrumsSynth(),
  'breakbeat-drums': () => new BreakbeatDrumsSynth(),
  'trap-drums': () => new TrapDrumsSynth(),
  'jazz-drums': () => new JazzDrumsSynth(),
  'rock-drums': () => new RockDrumsSynth(),
  'percussion': () => new PercussionSynth(),
  'industrial-drums': () => new IndustrialDrumsSynth(),
  'lofi-drums': () => new LoFiDrumsSynth(),
  'orchestral-drums': () => new OrchestralDrumsSynth(),
};
