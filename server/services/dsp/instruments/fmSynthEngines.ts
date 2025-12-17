import {
  AudioBuffer, DSPContext, createBuffer,
  BiquadFilter, OnePoleFilter, DelayLine,
  LFO, Oscillator, ADSR,
  msToSamples, dbToLinear, clamp, softClip, hardClip
} from '../core';

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: DSPContext): void;
  noteOff(context: DSPContext): void;
  render(numSamples: number, context: DSPContext): AudioBuffer;
  isActive(): boolean;
  reset(): void;
}

class FMOperator {
  private phase: number = 0;
  private phaseIncrement: number = 0;
  private frequency: number = 440;
  private ratio: number = 1;
  private outputLevel: number = 1;
  private envelope: ADSR;
  private sampleRate: number = 44100;
  private feedback: number = 0;
  private lastOutput: number = 0;

  constructor(attack: number = 0.001, decay: number = 0.1, sustain: number = 0.7, release: number = 0.2) {
    this.envelope = new ADSR(attack, decay, sustain, release, 44100);
  }

  setFrequency(frequency: number, sampleRate: number): void {
    this.frequency = frequency;
    this.sampleRate = sampleRate;
    this.phaseIncrement = (frequency * this.ratio) / sampleRate;
  }

  setRatio(ratio: number): void {
    this.ratio = ratio;
    this.phaseIncrement = (this.frequency * this.ratio) / this.sampleRate;
  }

  setOutputLevel(level: number): void {
    this.outputLevel = level;
  }

  setFeedback(feedback: number): void {
    this.feedback = feedback;
  }

  setEnvelope(attack: number, decay: number, sustain: number, release: number): void {
    this.envelope = new ADSR(attack, decay, sustain, release, this.sampleRate);
  }

  trigger(): void {
    this.envelope.trigger();
  }

  release(): void {
    this.envelope.release();
  }

  process(modulation: number = 0): number {
    const envValue = this.envelope.process();
    const totalMod = modulation + this.lastOutput * this.feedback;
    const output = Math.sin(2 * Math.PI * (this.phase + totalMod)) * envValue * this.outputLevel;
    
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= 1;
    
    this.lastOutput = output;
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.phase = 0;
    this.lastOutput = 0;
  }
}

export class DX7BellSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.001, 2.0, 0.0, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1.41, 2.83, 5.65, 7.07, 14.14];
    const levels = [0.8, 0.5, 0.35, 0.2, 0.1, 0.05];
    
    for (let i = 0; i < 6; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      
      const decayScale = 1 + i * 0.3;
      this.operators[i].setEnvelope(0.001, 1.5 / decayScale, 0.0, 0.4 / decayScale);
      this.operators[i].trigger();
    }

    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(8000 + this.velocity * 6000, 0.7, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 1.8, 0.0, 0.45, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();

      const mod6 = this.operators[5].process(0) * 2.5;
      const mod5 = this.operators[4].process(mod6) * 2.0;
      const mod4 = this.operators[3].process(mod5) * 1.5;
      const mod3 = this.operators[2].process(0) * 1.8;
      const mod2 = this.operators[1].process(mod4) * 1.2;
      
      let sample = this.operators[0].process(mod2 + mod3);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7BassSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private saturationFilter: BiquadFilter;
  private frequency: number = 55;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.002, 0.3, 0.6, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.saturationFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1, 2, 3];
    const levels = [0.9, 0.7, 0.4, 0.2];

    for (let i = 0; i < 4; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.002, 0.15 + i * 0.05, 0.5 - i * 0.1, 0.1);
      this.operators[i].trigger();
    }
    
    this.operators[0].setFeedback(0.3);

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(1500 + this.velocity * 2000, 2.5, context.sampleRate);
    this.saturationFilter.setLowShelf(200, 6, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.28, 0.58, 0.12, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();

      const mod4 = this.operators[3].process(0) * 3.0;
      const mod3 = this.operators[2].process(mod4) * 2.5;
      const mod2 = this.operators[1].process(mod3) * 2.0;
      let sample = this.operators[0].process(mod2);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.saturationFilter.process(sample);
      sample *= envValue;
      sample = softClip(sample * 1.4, 0.85);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.saturationFilter.clear();
  }
}

export class DX7EPianoSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private tineOperators: FMOperator[] = [];
  private envelope: ADSR;
  private tineEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private tremoloLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.operators.push(new FMOperator());
    }
    for (let i = 0; i < 2; i++) {
      this.tineOperators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.001, 0.8, 0.3, 0.4, 44100);
    this.tineEnvelope = new ADSR(0.001, 0.1, 0.0, 0.05, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.tremoloLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1, 14, 7];
    const levels = [0.7, 0.5, 0.15, 0.1];

    for (let i = 0; i < 4; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].trigger();
    }
    
    this.operators[0].setEnvelope(0.001, 1.2, 0.25, 0.35);
    this.operators[1].setEnvelope(0.001, 0.8, 0.2, 0.3);
    this.operators[2].setEnvelope(0.001, 0.15, 0.0, 0.05);
    this.operators[3].setEnvelope(0.001, 0.2, 0.0, 0.08);

    this.tineOperators[0].setFrequency(frequency, context.sampleRate);
    this.tineOperators[0].setRatio(1);
    this.tineOperators[0].setOutputLevel(0.3 * this.velocity * this.velocity);
    this.tineOperators[0].setEnvelope(0.001, 0.08, 0.0, 0.02);
    this.tineOperators[0].trigger();
    
    this.tineOperators[1].setFrequency(frequency, context.sampleRate);
    this.tineOperators[1].setRatio(7);
    this.tineOperators[1].setOutputLevel(0.2 * this.velocity * this.velocity);
    this.tineOperators[1].setEnvelope(0.001, 0.05, 0.0, 0.01);
    this.tineOperators[1].trigger();

    this.tremoloLFO.setFrequency(5.5, context.sampleRate);
    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.75, 0.28, 0.38, context.sampleRate);
    this.tineEnvelope = new ADSR(0.001, 0.08, 0.0, 0.03, context.sampleRate);
    this.envelope.trigger();
    this.tineEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.tineEnvelope.release();
    this.operators.forEach(op => op.release());
    this.tineOperators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const tineEnvValue = this.tineEnvelope.process();
      const tremolo = 1 + this.tremoloLFO.sine() * 0.03;

      const mod4 = this.operators[3].process(0) * 1.5;
      const mod3 = this.operators[2].process(mod4) * 2.0;
      const mod2 = this.operators[1].process(0) * 1.2;
      let sample = this.operators[0].process(mod2 + mod3);

      const tineMod = this.tineOperators[1].process(0) * 3.0;
      const tine = this.tineOperators[0].process(tineMod) * tineEnvValue;
      sample += tine;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * tremolo;

      output.samples[0][i] = softClip(sample, 0.88);
      output.samples[1][i] = softClip(sample, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.tineOperators.forEach(op => op.reset());
    this.tremoloLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7BrassSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.05, 0.2, 0.8, 0.15, 44100);
    this.filterEnvelope = new ADSR(0.08, 0.3, 0.6, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1, 2, 3];
    const levels = [0.8, 0.6, 0.5, 0.3];

    for (let i = 0; i < 4; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.04 + i * 0.01, 0.15, 0.75 - i * 0.1, 0.12);
      this.operators[i].trigger();
    }

    this.operators[0].setFeedback(0.2);
    this.lfo.setFrequency(5.2, context.sampleRate);
    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(2000, 1.5, context.sampleRate);

    this.envelope = new ADSR(0.045, 0.18, 0.78, 0.13, context.sampleRate);
    this.filterEnvelope = new ADSR(0.06, 0.25, 0.55, 0.18, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      const vibrato = this.lfo.sine() * 0.003 * envValue;

      const modAmount = 2.0 + filterEnvValue * 2.5;
      const mod4 = this.operators[3].process(0) * modAmount;
      const mod3 = this.operators[2].process(mod4) * modAmount * 0.8;
      const mod2 = this.operators[1].process(mod3) * modAmount * 0.6;
      let sample = this.operators[0].process(mod2);

      const filterFreq = 800 + filterEnvValue * 4000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 10000), 1.2, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lfo.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7PadSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo1: LFO;
  private lfo2: LFO;
  private lfo3: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.5, 0.8, 0.85, 1.0, 44100);
    this.filterEnvelope = new ADSR(0.8, 1.0, 0.6, 0.8, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo1 = new LFO();
    this.lfo2 = new LFO();
    this.lfo3 = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1.002, 2, 2.005, 0.5, 0.498];
    const levels = [0.5, 0.5, 0.3, 0.3, 0.4, 0.4];

    for (let i = 0; i < 6; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.4 + i * 0.05, 0.7, 0.8, 0.9);
      this.operators[i].trigger();
    }

    this.lfo1.setFrequency(0.2, context.sampleRate);
    this.lfo2.setFrequency(0.15, context.sampleRate);
    this.lfo3.setFrequency(5.5, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(3000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.45, 0.75, 0.82, 0.95, context.sampleRate);
    this.filterEnvelope = new ADSR(0.75, 0.95, 0.55, 0.75, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      
      const modLFO = this.lfo1.sine();
      const panLFO = this.lfo2.sine();
      const vibrato = this.lfo3.sine() * 0.002;

      const modAmount = 0.8 + modLFO * 0.4;
      
      const mod6 = this.operators[5].process(0) * modAmount;
      const mod5 = this.operators[4].process(0) * modAmount;
      const mod4 = this.operators[3].process(mod6) * modAmount;
      const mod3 = this.operators[2].process(mod5) * modAmount;
      
      const carrier1 = this.operators[0].process(mod3 + mod4);
      const carrier2 = this.operators[1].process(mod3 + mod4);
      
      let sample = (carrier1 + carrier2) * 0.5;

      const filterFreq = 1000 + filterEnvValue * 2500 + modLFO * 400;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 8000), 0.9, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      const panL = 0.5 - panLFO * 0.15;
      const panR = 0.5 + panLFO * 0.15;

      output.samples[0][i] = softClip(sample * panL * 2, 0.9);
      output.samples[1][i] = softClip(sample * panR * 2, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lfo1.reset();
    this.lfo2.reset();
    this.lfo3.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7LeadSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private vibratoLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.01, 0.15, 0.7, 0.2, 44100);
    this.filterEnvelope = new ADSR(0.01, 0.1, 0.5, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.vibratoLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1, 3, 4];
    const levels = [0.8, 0.6, 0.4, 0.25];

    for (let i = 0; i < 4; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.008, 0.12, 0.65, 0.18);
      this.operators[i].trigger();
    }

    this.operators[0].setFeedback(0.15);
    this.vibratoLFO.setFrequency(5.8, context.sampleRate);
    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000 + this.velocity * 4000, 1.2, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.13, 0.68, 0.18, context.sampleRate);
    this.filterEnvelope = new ADSR(0.008, 0.08, 0.48, 0.13, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.004 * envValue;

      const modAmount = 2.5 + filterEnvValue * 1.5;
      const mod4 = this.operators[3].process(0) * modAmount;
      const mod3 = this.operators[2].process(mod4) * modAmount * 0.8;
      const mod2 = this.operators[1].process(mod3) * modAmount * 0.6;
      let sample = this.operators[0].process(mod2);

      const filterFreq = 2000 + filterEnvValue * 5000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 500, 12000), 1.3, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      output.samples[0][i] = softClip(sample * 1.1, 0.9);
      output.samples[1][i] = softClip(sample * 1.1, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.vibratoLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7KeysSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private drawbarEnvelopes: ADSR[] = [];
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private rotaryLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.operators.push(new FMOperator());
      this.drawbarEnvelopes.push(new ADSR(0.01, 0.1, 0.8, 0.15, 44100));
    }
    this.envelope = new ADSR(0.005, 0.2, 0.7, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.rotaryLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [0.5, 1, 2, 3, 4, 6];
    const levels = [0.6, 0.8, 0.5, 0.4, 0.3, 0.2];

    for (let i = 0; i < 6; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.003, 0.08, 0.85, 0.12);
      this.operators[i].trigger();
      
      this.drawbarEnvelopes[i] = new ADSR(0.003, 0.06 + i * 0.02, 0.8 - i * 0.05, 0.1);
      this.drawbarEnvelopes[i].trigger();
    }

    this.rotaryLFO.setFrequency(6.0, context.sampleRate);
    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000 + this.velocity * 3000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.003, 0.18, 0.68, 0.18, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.drawbarEnvelopes.forEach(env => env.release());
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const rotary = this.rotaryLFO.sine();

      let sample = 0;
      for (let o = 0; o < 6; o++) {
        const drawbarEnv = this.drawbarEnvelopes[o].process();
        sample += this.operators[o].process(0) * drawbarEnv;
      }

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      const rotaryAmount = 0.2;
      const sampleL = sample * (1 + rotary * rotaryAmount);
      const sampleR = sample * (1 - rotary * rotaryAmount);

      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.rotaryLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class DX7PercSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private noiseFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 200;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.operators.push(new FMOperator());
    }
    this.envelope = new ADSR(0.001, 0.15, 0.0, 0.1, 44100);
    this.noiseFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1.5, 2.3, 3.7];
    const levels = [0.8, 0.5, 0.3, 0.15];

    for (let i = 0; i < 4; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.001, 0.08 / (i + 1), 0.0, 0.05 / (i + 1));
      this.operators[i].trigger();
    }

    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, 1.5, context.sampleRate);
    this.noiseFilter.setBandpass(frequency * 2, 3, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.12, 0.0, 0.08, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();

      const modAmount = 4.0 * envValue + 1.0;
      const mod4 = this.operators[3].process(0) * modAmount;
      const mod3 = this.operators[2].process(mod4) * modAmount;
      const mod2 = this.operators[1].process(mod3) * modAmount;
      let sample = this.operators[0].process(mod2);

      const noise = (Math.random() * 2 - 1) * 0.1 * envValue;
      const filteredNoise = this.noiseFilter.process(noise);
      sample += filteredNoise;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      output.samples[0][i] = softClip(sample * 1.2, 0.9);
      output.samples[1][i] = softClip(sample * 1.2, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.noiseFilter.clear();
  }
}

export class FM8Synth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bpFilter: BiquadFilter;
  private lfo1: LFO;
  private lfo2: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private modMatrix: number[][] = [];

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.operators.push(new FMOperator());
      this.modMatrix.push(new Array(8).fill(0));
    }
    this.modMatrix[7][6] = 1.5;
    this.modMatrix[6][5] = 1.2;
    this.modMatrix[5][4] = 1.0;
    this.modMatrix[4][0] = 0.8;
    this.modMatrix[3][2] = 1.3;
    this.modMatrix[2][1] = 1.1;
    this.modMatrix[1][0] = 0.9;
    
    this.envelope = new ADSR(0.02, 0.3, 0.7, 0.3, 44100);
    this.filterEnvelope = new ADSR(0.03, 0.4, 0.5, 0.25, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bpFilter = new BiquadFilter();
    this.lfo1 = new LFO();
    this.lfo2 = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const ratios = [1, 1.002, 2, 2.005, 3, 4, 5, 7];
    const levels = [0.7, 0.7, 0.5, 0.5, 0.4, 0.3, 0.2, 0.15];

    for (let i = 0; i < 8; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(ratios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.015 + i * 0.005, 0.25, 0.65 - i * 0.05, 0.25);
      this.operators[i].trigger();
    }

    this.operators[0].setFeedback(0.1);
    this.operators[1].setFeedback(0.08);

    this.lfo1.setFrequency(0.25, context.sampleRate);
    this.lfo2.setFrequency(5.5, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 1.0, context.sampleRate);
    this.bpFilter.setBandpass(2000, 1.5, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.28, 0.68, 0.28, context.sampleRate);
    this.filterEnvelope = new ADSR(0.025, 0.38, 0.48, 0.23, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    const opOutputs = new Float32Array(8);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      const modLFO = this.lfo1.sine();
      const vibrato = this.lfo2.sine() * 0.002;

      for (let o = 7; o >= 0; o--) {
        let modulation = 0;
        for (let m = 0; m < 8; m++) {
          modulation += opOutputs[m] * this.modMatrix[m][o] * (1 + modLFO * 0.3);
        }
        opOutputs[o] = this.operators[o].process(modulation);
      }

      let sample = (opOutputs[0] + opOutputs[1]) * 0.5;

      const filterFreq = 1500 + filterEnvValue * 4000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 300, 12000), 1.2, this.sampleRate);
      this.bpFilter.setBandpass(clamp(filterFreq * 0.7, 200, 8000), 1.5, this.sampleRate);

      sample = this.hpFilter.process(sample);
      const lpOut = this.lpFilter.process(sample);
      const bpOut = this.bpFilter.process(sample);
      sample = lpOut * 0.7 + bpOut * 0.3;
      sample *= envValue;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lfo1.reset();
    this.lfo2.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bpFilter.clear();
  }
}

export class ModularFMSynth implements SynthesizerEngine {
  private operators: FMOperator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo1: LFO;
  private lfo2: LFO;
  private lfo3: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private customRatios: number[] = [];

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.operators.push(new FMOperator());
    }
    this.customRatios = [1, 1.618, 2.236, 3.141, 2.718, 1.414];
    
    this.envelope = new ADSR(0.1, 0.4, 0.75, 0.5, 44100);
    this.filterEnvelope = new ADSR(0.15, 0.5, 0.5, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo1 = new LFO();
    this.lfo2 = new LFO();
    this.lfo3 = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const levels = [0.7, 0.6, 0.5, 0.4, 0.35, 0.25];

    for (let i = 0; i < 6; i++) {
      this.operators[i].setFrequency(frequency, context.sampleRate);
      this.operators[i].setRatio(this.customRatios[i]);
      this.operators[i].setOutputLevel(levels[i] * this.velocity);
      this.operators[i].setEnvelope(0.08 + i * 0.02, 0.35, 0.7 - i * 0.08, 0.45);
      this.operators[i].trigger();
    }

    this.operators[0].setFeedback(0.2);
    this.operators[2].setFeedback(0.15);

    this.lfo1.setFrequency(0.12, context.sampleRate);
    this.lfo2.setFrequency(0.08, context.sampleRate);
    this.lfo3.setFrequency(0.33, context.sampleRate);

    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000, 1.0, context.sampleRate);

    this.envelope = new ADSR(0.09, 0.38, 0.73, 0.48, context.sampleRate);
    this.filterEnvelope = new ADSR(0.13, 0.48, 0.48, 0.38, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
    this.operators.forEach(op => op.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      
      const ratioMod = this.lfo1.sine() * 0.05;
      const modIndexMod = this.lfo2.sine() * 0.3;
      const panMod = this.lfo3.sine();

      for (let o = 0; o < 6; o++) {
        const newRatio = this.customRatios[o] * (1 + ratioMod * (o % 2 === 0 ? 1 : -1));
        this.operators[o].setRatio(newRatio);
      }

      const modAmount = 1.5 + modIndexMod;
      
      const mod6 = this.operators[5].process(0) * modAmount;
      const mod5 = this.operators[4].process(mod6) * modAmount;
      const mod4 = this.operators[3].process(0) * modAmount * 0.8;
      const mod3 = this.operators[2].process(mod4 + mod5) * modAmount * 0.6;
      
      const carrier1 = this.operators[0].process(mod3);
      const carrier2 = this.operators[1].process(mod3);
      
      let sample = (carrier1 + carrier2) * 0.5;

      const filterFreq = 1200 + filterEnvValue * 3500 + this.velocity * 1500;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 10000), 1.1, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue;

      const panL = 0.5 - panMod * 0.2;
      const panR = 0.5 + panMod * 0.2;

      output.samples[0][i] = softClip(sample * panL * 2, 0.9);
      output.samples[1][i] = softClip(sample * panR * 2, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.operators.forEach(op => op.reset());
    this.lfo1.reset();
    this.lfo2.reset();
    this.lfo3.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export const FM_SYNTH_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  'dx7-bell': DX7BellSynth,
  'dx7-bass': DX7BassSynth,
  'dx7-epiano': DX7EPianoSynth,
  'dx7-brass': DX7BrassSynth,
  'dx7-pad': DX7PadSynth,
  'dx7-lead': DX7LeadSynth,
  'dx7-keys': DX7KeysSynth,
  'dx7-perc': DX7PercSynth,
  'fm8': FM8Synth,
  'modular-fm': ModularFMSynth,
};
