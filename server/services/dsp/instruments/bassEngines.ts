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

export class ElectricBassSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private ampEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private pickupFilter: BiquadFilter;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.002, 0.15, 0.7, 0.2, 44100);
    this.ampEnvelope = new ADSR(0.001, 0.08, 0.8, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.pickupFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 6; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }

    this.lpFilter.setLowpass(1500 + this.velocity * 2000, 0.8, context.sampleRate);
    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(120, 2, 4, context.sampleRate);
    this.pickupFilter.setPeaking(800, 1.5, 3, context.sampleRate);

    this.envelope = new ADSR(0.002, 0.12, 0.65, 0.18, context.sampleRate);
    this.ampEnvelope = new ADSR(0.001, 0.06, 0.75, 0.12, context.sampleRate);
    this.envelope.trigger();
    this.ampEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.ampEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const ampEnvValue = this.ampEnvelope.process();

      let sample = 0;
      const harmonicAmps = [1.0, 0.5, 0.25, 0.12, 0.06, 0.03];
      for (let h = 0; h < 6; h++) {
        this.oscillators[h].setFrequency(this.frequency * (h + 1), this.sampleRate);
        sample += this.oscillators[h].sine() * harmonicAmps[h];
      }

      const fingerNoise = (Math.random() * 2 - 1) * 0.02 * ampEnvValue;
      sample += fingerNoise;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.pickupFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.pickupFilter.clear();
  }
}

export class SynthBassSynth implements SynthesizerEngine {
  private oscillator1: Oscillator;
  private oscillator2: Oscillator;
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.oscillator1 = new Oscillator();
    this.oscillator2 = new Oscillator();
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.2, 0.8, 0.25, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.15, 0.4, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillator1.setFrequency(frequency, context.sampleRate);
    this.oscillator2.setFrequency(frequency * 0.998, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.warmthFilter.setLowShelf(200, 4, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.18, 0.75, 0.22, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.12, 0.35, 0.18, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();

      const saw1 = this.oscillator1.sawBandLimited(16);
      const saw2 = this.oscillator2.sawBandLimited(16);
      const sub = this.subOsc.sine();

      let sample = saw1 * 0.4 + saw2 * 0.3 + sub * 0.3;

      const filterFreq = 200 + filterEnvValue * 2500 + this.velocity * 1500;
      this.lpFilter.setLowpass(filterFreq, 2 + filterEnvValue * 4, this.sampleRate);
      this.resonanceFilter.setPeaking(filterFreq * 0.8, 3, 4, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.resonanceFilter.process(sample);
      sample = this.warmthFilter.process(sample);

      sample *= envValue * this.velocity;
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
    this.oscillator1.reset();
    this.oscillator2.reset();
    this.subOsc.reset();
    this.lpFilter.clear();
    this.resonanceFilter.clear();
    this.warmthFilter.clear();
  }
}

export class AcousticBassSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private bodyEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private airFilter: BiquadFilter;
  private stringDelay: DelayLine;
  private frequency: number = 41.2;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.005, 0.3, 0.6, 0.4, 44100);
    this.bodyEnvelope = new ADSR(0.002, 0.15, 0.4, 0.25, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.airFilter = new BiquadFilter();
    this.stringDelay = new DelayLine(4410);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 8; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }

    this.lpFilter.setLowpass(1200 + this.velocity * 1000, 0.6, context.sampleRate);
    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(100, 2.5, 5, context.sampleRate);
    this.airFilter.setPeaking(2500, 1, 2, context.sampleRate);

    this.envelope = new ADSR(0.005, 0.25 + (1 - this.velocity) * 0.1, 0.55, 0.35, context.sampleRate);
    this.bodyEnvelope = new ADSR(0.002, 0.12, 0.35, 0.2, context.sampleRate);
    this.envelope.trigger();
    this.bodyEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.bodyEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const bodyEnvValue = this.bodyEnvelope.process();

      let sample = 0;
      const harmonicDecay = [1.0, 0.6, 0.35, 0.2, 0.12, 0.07, 0.04, 0.02];
      for (let h = 0; h < 8; h++) {
        this.oscillators[h].setFrequency(this.frequency * (h + 1), this.sampleRate);
        const sawComp = this.oscillators[h].sawBandLimited(12) * 0.3;
        const sineComp = this.oscillators[h].sine() * 0.7;
        sample += (sawComp + sineComp) * harmonicDecay[h];
      }

      const bodyResonance = Math.sin(2 * Math.PI * 100 * i / this.sampleRate) * bodyEnvValue * 0.1;
      sample += bodyResonance;

      this.stringDelay.write(sample);
      const delayedSample = this.stringDelay.readInterpolated(Math.floor(this.sampleRate / this.frequency));
      sample = sample * 0.7 + delayedSample * 0.3;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.airFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.88);

      output.samples[0][i] = sample * 0.98;
      output.samples[1][i] = sample * 1.02;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.airFilter.clear();
    this.stringDelay.clear();
  }
}

export class SubBassSynth implements SynthesizerEngine {
  private oscillator: Oscillator;
  private subOsc: Oscillator;
  private envelope: ADSR;
  private lpFilter: OnePoleFilter;
  private subFilter: BiquadFilter;
  private frequency: number = 41.2;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.oscillator = new Oscillator();
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.005, 0.3, 0.9, 0.4, 44100);
    this.lpFilter = new OnePoleFilter();
    this.subFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillator.setFrequency(frequency, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.lpFilter.setLowpass(150 + this.velocity * 100, context.sampleRate);
    this.subFilter.setLowpass(80, 1.5, context.sampleRate);

    this.envelope = new ADSR(0.005, 0.25, 0.88, 0.35, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();

      const mainSine = this.oscillator.sine();
      const subSine = this.subOsc.sine();

      let sample = mainSine * 0.6 + subSine * 0.4;

      sample = this.lpFilter.process(sample);
      sample = this.subFilter.process(sample);

      sample *= envValue * this.velocity * 1.2;
      sample = softClip(sample, 0.98);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillator.reset();
    this.subOsc.reset();
    this.lpFilter.clear();
    this.subFilter.clear();
  }
}

export class WobbleBassSynth implements SynthesizerEngine {
  private oscillator1: Oscillator;
  private oscillator2: Oscillator;
  private subOsc: Oscillator;
  private wobbleLFO: LFO;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 41.2;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private wobbleRate: number = 4;

  constructor() {
    this.oscillator1 = new Oscillator();
    this.oscillator2 = new Oscillator();
    this.subOsc = new Oscillator();
    this.wobbleLFO = new LFO();
    this.envelope = new ADSR(0.001, 0.1, 0.9, 0.3, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.08, 0.5, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillator1.setFrequency(frequency, context.sampleRate);
    this.oscillator2.setFrequency(frequency * 1.005, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.wobbleRate = 2 + (frequency - 30) * 0.05;
    this.wobbleLFO.setFrequency(this.wobbleRate, context.sampleRate);

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.08, 0.88, 0.25, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.06, 0.45, 0.15, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();

      const wobble = (this.wobbleLFO.sine() + 1) * 0.5;

      const saw1 = this.oscillator1.sawBandLimited(16);
      const saw2 = this.oscillator2.sawBandLimited(16);
      const square1 = this.oscillator1.squareBandLimited(12);
      const sub = this.subOsc.sine();

      let sample = saw1 * 0.35 + saw2 * 0.25 + square1 * 0.15 + sub * 0.25;

      const filterFreq = 100 + wobble * 3500 + filterEnvValue * 1500;
      this.lpFilter.setLowpass(filterFreq, 4 + wobble * 6, this.sampleRate);
      this.resonanceFilter.setPeaking(filterFreq * 0.7, 4, 6, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.resonanceFilter.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.3, 0.95);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillator1.reset();
    this.oscillator2.reset();
    this.subOsc.reset();
    this.wobbleLFO.reset();
    this.lpFilter.clear();
    this.resonanceFilter.clear();
    this.hpFilter.clear();
  }
}

export class FunkBassSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private slapEnvelope: ADSR;
  private popEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private midFilter: BiquadFilter;
  private presenceFilter: BiquadFilter;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 10; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.001, 0.08, 0.6, 0.12, 44100);
    this.slapEnvelope = new ADSR(0.0005, 0.015, 0, 0.02, 44100);
    this.popEnvelope = new ADSR(0.0003, 0.008, 0, 0.01, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.midFilter = new BiquadFilter();
    this.presenceFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 10; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }

    this.lpFilter.setLowpass(3000 + this.velocity * 3000, 0.8, context.sampleRate);
    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.midFilter.setPeaking(800, 2, 4, context.sampleRate);
    this.presenceFilter.setPeaking(2500, 2.5, 5, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.06 + this.velocity * 0.03, 0.55, 0.1, context.sampleRate);
    this.slapEnvelope = new ADSR(0.0005, 0.012, 0, 0.015, context.sampleRate);
    this.popEnvelope = new ADSR(0.0003, 0.006, 0, 0.008, context.sampleRate);
    this.envelope.trigger();
    this.slapEnvelope.trigger();
    if (this.velocity > 0.7) {
      this.popEnvelope.trigger();
    }
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.slapEnvelope.release();
    this.popEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const slapValue = this.slapEnvelope.process();
      const popValue = this.popEnvelope.process();

      let sample = 0;
      const harmonicAmps = [1.0, 0.7, 0.45, 0.3, 0.2, 0.15, 0.1, 0.07, 0.04, 0.02];
      for (let h = 0; h < 10; h++) {
        this.oscillators[h].setFrequency(this.frequency * (h + 1), this.sampleRate);
        sample += this.oscillators[h].sine() * harmonicAmps[h];
      }

      const slapClick = (Math.random() * 2 - 1) * slapValue * 0.8;
      const popHarmonic = Math.sin(2 * Math.PI * this.frequency * 4 * i / this.sampleRate) * popValue * 0.5;

      sample = sample + slapClick + popHarmonic;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.midFilter.process(sample);
      sample = this.presenceFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.2, 0.92);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.midFilter.clear();
    this.presenceFilter.clear();
  }
}

export class ReesBassSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private phaseOffsets: number[] = [];
  private frequency: number = 41.2;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
      this.phaseOffsets.push(Math.random() * Math.PI * 2);
    }
    this.envelope = new ADSR(0.001, 0.15, 0.85, 0.3, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.1, 0.4, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.12, -0.06, -0.02, 0.02, 0.06, 0.12];
    for (let i = 0; i < 6; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.12, 0.82, 0.25, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.08, 0.35, 0.18, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();

      let sample = 0;
      for (let o = 0; o < 6; o++) {
        sample += this.oscillators[o].sawBandLimited(14) / 6;
      }

      const filterFreq = 150 + filterEnvValue * 2000 + this.velocity * 1500;
      this.lpFilter.setLowpass(filterFreq, 2 + filterEnvValue * 3, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);

      const stereoPhase = Math.sin(i * 0.0005) * 0.1;
      output.samples[0][i] = sample * (1 + stereoPhase);
      output.samples[1][i] = sample * (1 - stereoPhase);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class FMBassSynth implements SynthesizerEngine {
  private carrierOsc: Oscillator;
  private modulatorOsc1: Oscillator;
  private modulatorOsc2: Oscillator;
  private envelope: ADSR;
  private modEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private modIndex: number = 3;
  private modRatio: number = 2;

  constructor() {
    this.carrierOsc = new Oscillator();
    this.modulatorOsc1 = new Oscillator();
    this.modulatorOsc2 = new Oscillator();
    this.envelope = new ADSR(0.001, 0.15, 0.7, 0.2, 44100);
    this.modEnvelope = new ADSR(0.001, 0.08, 0.3, 0.1, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.carrierOsc.setFrequency(frequency, context.sampleRate);
    this.modulatorOsc1.setFrequency(frequency * this.modRatio, context.sampleRate);
    this.modulatorOsc2.setFrequency(frequency * (this.modRatio + 1), context.sampleRate);

    this.lpFilter.setLowpass(2000 + this.velocity * 3000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(35, 0.7, context.sampleRate);

    this.modIndex = 2 + this.velocity * 4;

    this.envelope = new ADSR(0.001, 0.12 + (1 - this.velocity) * 0.05, 0.65, 0.18, context.sampleRate);
    this.modEnvelope = new ADSR(0.001, 0.06, 0.25, 0.08, context.sampleRate);
    this.envelope.trigger();
    this.modEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.modEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const modEnvValue = this.modEnvelope.process();

      const mod1 = this.modulatorOsc1.sine() * this.modIndex * modEnvValue;
      const mod2 = this.modulatorOsc2.sine() * this.modIndex * 0.5 * modEnvValue;

      const carrierPhase = 2 * Math.PI * this.frequency * i / this.sampleRate;
      let sample = Math.sin(carrierPhase + mod1 + mod2);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.carrierOsc.reset();
    this.modulatorOsc1.reset();
    this.modulatorOsc2.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class PluckBassSynth implements SynthesizerEngine {
  private oscillator: Oscillator;
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private pluckFilter: BiquadFilter;
  private stringDelay: DelayLine;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.oscillator = new Oscillator();
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.12, 0.5, 0.15, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.04, 0.2, 0.06, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.pluckFilter = new BiquadFilter();
    this.stringDelay = new DelayLine(2205);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillator.setFrequency(frequency, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.pluckFilter.setPeaking(1200, 3, 5, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.1 + (1 - this.velocity) * 0.04, 0.45, 0.12, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.035, 0.15, 0.05, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();

      const saw = this.oscillator.sawBandLimited(12);
      const square = this.oscillator.squareBandLimited(10);
      const sub = this.subOsc.sine();

      let sample = saw * 0.4 + square * 0.3 + sub * 0.3;

      const filterFreq = 300 + filterEnvValue * 4000 + this.velocity * 2000;
      this.lpFilter.setLowpass(filterFreq, 3 + filterEnvValue * 5, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);
      sample = this.pluckFilter.process(sample);

      this.stringDelay.write(sample * 0.3);
      const delaySample = this.stringDelay.readInterpolated(msToSamples(5, this.sampleRate));
      sample = sample * 0.8 + delaySample * 0.2;

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillator.reset();
    this.subOsc.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.pluckFilter.clear();
    this.stringDelay.clear();
  }
}

export class GrowlBassSynth implements SynthesizerEngine {
  private oscillator1: Oscillator;
  private oscillator2: Oscillator;
  private oscillator3: Oscillator;
  private subOsc: Oscillator;
  private growlLFO: LFO;
  private formantLFO: LFO;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private formant1: BiquadFilter;
  private formant2: BiquadFilter;
  private distortionFilter: BiquadFilter;
  private frequency: number = 41.2;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.oscillator1 = new Oscillator();
    this.oscillator2 = new Oscillator();
    this.oscillator3 = new Oscillator();
    this.subOsc = new Oscillator();
    this.growlLFO = new LFO();
    this.formantLFO = new LFO();
    this.envelope = new ADSR(0.001, 0.15, 0.85, 0.25, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.1, 0.5, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.formant1 = new BiquadFilter();
    this.formant2 = new BiquadFilter();
    this.distortionFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillator1.setFrequency(frequency, context.sampleRate);
    this.oscillator2.setFrequency(frequency * 1.003, context.sampleRate);
    this.oscillator3.setFrequency(frequency * 0.997, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.growlLFO.setFrequency(6, context.sampleRate);
    this.formantLFO.setFrequency(0.8, context.sampleRate);

    this.hpFilter.setHighpass(35, 0.7, context.sampleRate);
    this.distortionFilter.setPeaking(500, 3, 6, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.12, 0.82, 0.22, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.08, 0.45, 0.12, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();

      const growl = this.growlLFO.sine();
      const formantMod = (this.formantLFO.sine() + 1) * 0.5;

      const saw1 = this.oscillator1.sawBandLimited(16);
      const saw2 = this.oscillator2.sawBandLimited(16);
      const saw3 = this.oscillator3.sawBandLimited(16);
      const sub = this.subOsc.sine();

      let sample = (saw1 + saw2 + saw3) / 3 * 0.7 + sub * 0.3;

      const filterFreq = 200 + filterEnvValue * 2500 + growl * 500;
      this.lpFilter.setLowpass(filterFreq, 4 + filterEnvValue * 4, this.sampleRate);

      const formantFreq1 = 400 + formantMod * 400;
      const formantFreq2 = 1200 + formantMod * 600;
      this.formant1.setPeaking(formantFreq1, 4, 6, this.sampleRate);
      this.formant2.setPeaking(formantFreq2, 3, 4, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);
      sample = this.formant1.process(sample);
      sample = this.formant2.process(sample);
      sample = this.distortionFilter.process(sample);

      sample = hardClip(sample * 1.5, 0.85);

      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.95);

      const stereoGrowl = growl * 0.05;
      output.samples[0][i] = sample * (1 + stereoGrowl);
      output.samples[1][i] = sample * (1 - stereoGrowl);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillator1.reset();
    this.oscillator2.reset();
    this.oscillator3.reset();
    this.subOsc.reset();
    this.growlLFO.reset();
    this.formantLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.formant1.clear();
    this.formant2.clear();
    this.distortionFilter.clear();
  }
}

export const BASS_SYNTHESIZERS: Record<string, () => SynthesizerEngine> = {
  'electric-bass': () => new ElectricBassSynth(),
  'synth-bass': () => new SynthBassSynth(),
  'acoustic-bass': () => new AcousticBassSynth(),
  'sub-bass': () => new SubBassSynth(),
  'wobble-bass': () => new WobbleBassSynth(),
  'funk-bass': () => new FunkBassSynth(),
  'reese-bass': () => new ReesBassSynth(),
  'fm-bass': () => new FMBassSynth(),
  'pluck-bass': () => new PluckBassSynth(),
  'growl-bass': () => new GrowlBassSynth(),
};
