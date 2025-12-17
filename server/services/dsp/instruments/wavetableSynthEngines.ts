import {
  AudioBuffer, DSPContext, createBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter,
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

class Wavetable {
  private tables: Float32Array[] = [];
  private tableSize: number;
  private numTables: number;

  constructor(tableSize: number = 2048) {
    this.tableSize = tableSize;
    this.numTables = 0;
  }

  addTable(generator: (phase: number, harmonics: number) => number, harmonics: number = 64): void {
    const table = new Float32Array(this.tableSize);
    for (let i = 0; i < this.tableSize; i++) {
      const phase = i / this.tableSize;
      table[i] = generator(phase, harmonics);
    }
    this.tables.push(table);
    this.numTables++;
  }

  generateSaw(harmonics: number = 64): void {
    this.addTable((phase, h) => {
      let value = 0;
      for (let k = 1; k <= h; k++) {
        value += Math.sin(2 * Math.PI * k * phase) / k;
      }
      return value * 2 / Math.PI;
    }, harmonics);
  }

  generateSquare(harmonics: number = 64): void {
    this.addTable((phase, h) => {
      let value = 0;
      for (let k = 1; k <= h; k += 2) {
        value += Math.sin(2 * Math.PI * k * phase) / k;
      }
      return value * 4 / Math.PI;
    }, harmonics);
  }

  generateTriangle(harmonics: number = 64): void {
    this.addTable((phase, h) => {
      let value = 0;
      for (let k = 1; k <= h; k += 2) {
        const sign = ((k - 1) / 2) % 2 === 0 ? 1 : -1;
        value += sign * Math.sin(2 * Math.PI * k * phase) / (k * k);
      }
      return value * 8 / (Math.PI * Math.PI);
    }, harmonics);
  }

  generateSine(): void {
    this.addTable((phase) => Math.sin(2 * Math.PI * phase), 1);
  }

  generatePWM(width: number): void {
    this.addTable((phase) => phase < width ? 1 : -1, 64);
  }

  generateFormant(formantFreq: number): void {
    this.addTable((phase) => {
      const carrier = Math.sin(2 * Math.PI * phase);
      const formant = Math.sin(2 * Math.PI * phase * formantFreq);
      return carrier * (0.5 + 0.5 * formant);
    }, 32);
  }

  generateDigital(): void {
    this.addTable((phase) => {
      const bits = 8;
      const quantized = Math.floor(Math.sin(2 * Math.PI * phase) * (1 << (bits - 1))) / (1 << (bits - 1));
      return quantized;
    }, 32);
  }

  generateAdditive(harmonicAmplitudes: number[]): void {
    this.addTable((phase) => {
      let value = 0;
      for (let k = 0; k < harmonicAmplitudes.length; k++) {
        value += Math.sin(2 * Math.PI * (k + 1) * phase) * harmonicAmplitudes[k];
      }
      return value;
    }, harmonicAmplitudes.length);
  }

  sample(phase: number, tablePosition: number): number {
    if (this.numTables === 0) return 0;
    
    const tableIdx = clamp(tablePosition, 0, 1) * (this.numTables - 1);
    const table1Idx = Math.floor(tableIdx);
    const table2Idx = Math.min(table1Idx + 1, this.numTables - 1);
    const tableFrac = tableIdx - table1Idx;
    
    const sampleIdx = (phase * this.tableSize) % this.tableSize;
    const idx1 = Math.floor(sampleIdx);
    const idx2 = (idx1 + 1) % this.tableSize;
    const frac = sampleIdx - idx1;
    
    const sample1 = this.tables[table1Idx][idx1] * (1 - frac) + this.tables[table1Idx][idx2] * frac;
    const sample2 = this.tables[table2Idx][idx1] * (1 - frac) + this.tables[table2Idx][idx2] * frac;
    
    return sample1 * (1 - tableFrac) + sample2 * tableFrac;
  }

  getNumTables(): number {
    return this.numTables;
  }
}

class WavetableOscillator {
  private wavetable: Wavetable;
  private phase: number = 0;
  private phaseIncrement: number = 0;
  private tablePosition: number = 0;

  constructor(wavetable: Wavetable) {
    this.wavetable = wavetable;
  }

  setFrequency(frequency: number, sampleRate: number): void {
    this.phaseIncrement = frequency / sampleRate;
  }

  setTablePosition(position: number): void {
    this.tablePosition = clamp(position, 0, 1);
  }

  process(): number {
    const sample = this.wavetable.sample(this.phase, this.tablePosition);
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= 1;
    return sample;
  }

  reset(): void {
    this.phase = 0;
  }
}

export class SerumSynth implements SynthesizerEngine {
  private wavetable1: Wavetable;
  private wavetable2: Wavetable;
  private osc1: WavetableOscillator;
  private osc2: WavetableOscillator;
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private morphLFO: LFO;
  private filterLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable1 = new Wavetable();
    this.wavetable1.generateSaw();
    this.wavetable1.generateSquare();
    this.wavetable1.generateTriangle();
    this.wavetable1.generateSine();
    
    this.wavetable2 = new Wavetable();
    this.wavetable2.generateSine();
    this.wavetable2.generatePWM(0.3);
    this.wavetable2.generatePWM(0.5);
    this.wavetable2.generatePWM(0.7);

    this.osc1 = new WavetableOscillator(this.wavetable1);
    this.osc2 = new WavetableOscillator(this.wavetable2);
    this.subOsc = new Oscillator();
    
    this.envelope = new ADSR(0.01, 0.2, 0.7, 0.3, 44100);
    this.filterEnvelope = new ADSR(0.02, 0.3, 0.5, 0.25, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.filterLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 1.003, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.morphLFO.setFrequency(0.3, context.sampleRate);
    this.filterLFO.setFrequency(0.5, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 2, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.18, 0.68, 0.28, context.sampleRate);
    this.filterEnvelope = new ADSR(0.015, 0.28, 0.48, 0.23, context.sampleRate);
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
      
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const filterMod = this.filterLFO.sine();

      this.osc1.setTablePosition(morphValue);
      this.osc2.setTablePosition(1 - morphValue);

      const osc1Out = this.osc1.process() * 0.5;
      const osc2Out = this.osc2.process() * 0.4;
      const subOut = this.subOsc.sine() * 0.3;

      let sample = osc1Out + osc2Out + subOut;

      const filterFreq = 1000 + filterEnvValue * 5000 + filterMod * 500 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 12000), 2 + filterEnvValue * 2, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.subOsc.reset();
    this.morphLFO.reset();
    this.filterLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class MassiveSynth implements SynthesizerEngine {
  private wavetables: Wavetable[] = [];
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private saturationFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private frequency: number = 55;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 3; i++) {
      const wt = new Wavetable();
      wt.generateSaw();
      wt.generateSquare();
      wt.generateDigital();
      this.wavetables.push(wt);
      this.oscillators.push(new WavetableOscillator(wt));
    }
    
    this.envelope = new ADSR(0.005, 0.25, 0.65, 0.2, 44100);
    this.filterEnvelope = new ADSR(0.01, 0.2, 0.4, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.saturationFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.02, 0, 0.02];
    for (let i = 0; i < 3; i++) {
      this.oscillators[i].setFrequency(frequency * (1 + detuneAmounts[i] * 0.01), context.sampleRate);
      this.oscillators[i].setTablePosition(0.3);
    }

    this.lfo.setFrequency(0.15, context.sampleRate);
    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(2000, 4, context.sampleRate);
    this.saturationFilter.setLowShelf(150, 8, context.sampleRate);

    this.envelope = new ADSR(0.003, 0.23, 0.63, 0.18, context.sampleRate);
    this.filterEnvelope = new ADSR(0.008, 0.18, 0.38, 0.13, context.sampleRate);
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
      const lfoValue = (this.lfo.sine() + 1) * 0.5;

      for (let o = 0; o < 3; o++) {
        this.oscillators[o].setTablePosition(0.2 + lfoValue * 0.3);
      }

      let sample = 0;
      for (let o = 0; o < 3; o++) {
        sample += this.oscillators[o].process();
      }
      sample /= 3;

      const filterFreq = 300 + filterEnvValue * 3000 + this.velocity * 1500;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 8000), 3.5 + filterEnvValue * 2, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.saturationFilter.process(sample);
      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.5, 0.85);

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
    this.lfo.reset();
    this.lpFilter.clear();
    this.saturationFilter.clear();
    this.hpFilter.clear();
  }
}

export class SynthwaveSynth implements SynthesizerEngine {
  private wavetable1: Wavetable;
  private wavetable2: Wavetable;
  private osc1: WavetableOscillator;
  private osc2: WavetableOscillator;
  private arpOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private chorusDelay1: DelayLine;
  private chorusDelay2: DelayLine;
  private chorusLFO: LFO;
  private filterLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable1 = new Wavetable();
    this.wavetable1.generateSaw();
    this.wavetable1.generatePWM(0.5);
    this.wavetable1.generateSquare();
    
    this.wavetable2 = new Wavetable();
    this.wavetable2.generateTriangle();
    this.wavetable2.generateSine();

    this.osc1 = new WavetableOscillator(this.wavetable1);
    this.osc2 = new WavetableOscillator(this.wavetable2);
    this.arpOsc = new Oscillator();
    
    this.envelope = new ADSR(0.02, 0.3, 0.75, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.03, 0.4, 0.5, 0.35, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.chorusDelay1 = new DelayLine(2205);
    this.chorusDelay2 = new DelayLine(2205);
    this.chorusLFO = new LFO();
    this.filterLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 2, context.sampleRate);
    this.arpOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.osc1.setTablePosition(0.3);
    this.osc2.setTablePosition(0.5);

    this.chorusLFO.setFrequency(0.6, context.sampleRate);
    this.filterLFO.setFrequency(0.25, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000, 2, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.28, 0.73, 0.38, context.sampleRate);
    this.filterEnvelope = new ADSR(0.025, 0.38, 0.48, 0.33, context.sampleRate);
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
      
      const chorusMod = this.chorusLFO.sine();
      const filterMod = this.filterLFO.sine();

      const osc1Out = this.osc1.process() * 0.5;
      const osc2Out = this.osc2.process() * 0.2;
      const arpOut = this.arpOsc.pulse(0.5) * 0.15;

      let sample = osc1Out + osc2Out + arpOut;

      const filterFreq = 1500 + filterEnvValue * 4000 + filterMod * 800 + this.velocity * 1500;
      this.lpFilter.setLowpass(clamp(filterFreq, 300, 10000), 1.8 + filterEnvValue * 1.5, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);

      this.chorusDelay1.write(sample);
      this.chorusDelay2.write(sample);
      
      const delayTime1 = 400 + chorusMod * 150;
      const delayTime2 = 450 - chorusMod * 150;
      
      const chorus1 = this.chorusDelay1.readInterpolated(delayTime1) * 0.25;
      const chorus2 = this.chorusDelay2.readInterpolated(delayTime2) * 0.25;

      const sampleL = sample * 0.7 + chorus1;
      const sampleR = sample * 0.7 + chorus2;

      output.samples[0][i] = softClip(sampleL * envValue * this.velocity, 0.9);
      output.samples[1][i] = softClip(sampleR * envValue * this.velocity, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.arpOsc.reset();
    this.chorusLFO.reset();
    this.filterLFO.reset();
    this.chorusDelay1.clear();
    this.chorusDelay2.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class VocalWavetableSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private formantFilters: BiquadFilter[] = [];
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private morphLFO: LFO;
  private vibratoLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateFormant(3);
    this.wavetable.generateFormant(5);
    this.wavetable.generateFormant(7);
    this.wavetable.generateFormant(9);
    this.wavetable.generateFormant(11);

    for (let i = 0; i < 4; i++) {
      this.oscillators.push(new WavetableOscillator(this.wavetable));
    }
    
    for (let i = 0; i < 5; i++) {
      this.formantFilters.push(new BiquadFilter());
    }
    
    this.envelope = new ADSR(0.1, 0.3, 0.8, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.vibratoLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.05, -0.02, 0.02, 0.05];
    for (let i = 0; i < 4; i++) {
      this.oscillators[i].setFrequency(frequency * (1 + detuneAmounts[i] * 0.01), context.sampleRate);
      this.oscillators[i].setTablePosition(0.2);
    }

    const formantFreqs = [800, 1200, 2500, 3200, 4500];
    const formantQs = [8, 6, 5, 4, 3];
    const formantGains = [4, 3, 2, 1.5, 1];
    for (let i = 0; i < 5; i++) {
      this.formantFilters[i].setPeaking(formantFreqs[i], formantQs[i], formantGains[i], context.sampleRate);
    }

    this.morphLFO.setFrequency(0.15, context.sampleRate);
    this.vibratoLFO.setFrequency(5.5, context.sampleRate);

    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.09, 0.28, 0.78, 0.48, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const vibrato = this.vibratoLFO.sine() * 0.003 * envValue;

      for (let o = 0; o < 4; o++) {
        this.oscillators[o].setTablePosition(morphValue);
      }

      let sampleL = 0;
      let sampleR = 0;
      for (let o = 0; o < 4; o++) {
        const osc = this.oscillators[o].process();
        const pan = (o - 1.5) / 2;
        sampleL += osc * (1 - pan * 0.3);
        sampleR += osc * (1 + pan * 0.3);
      }
      sampleL /= 4;
      sampleR /= 4;

      for (const filter of this.formantFilters) {
        sampleL = filter.process(sampleL);
        sampleR = filter.process(sampleR);
      }

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.formantFilters.forEach(f => f.clear());
    this.morphLFO.reset();
    this.vibratoLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class OrganicWavetableSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private breathEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private morphLFO: LFO;
  private breathLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateSine();
    this.wavetable.generateTriangle();
    this.wavetable.generateAdditive([1, 0.5, 0.25, 0.125, 0.0625]);
    this.wavetable.generateAdditive([1, 0.3, 0.6, 0.2, 0.4, 0.1]);

    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new WavetableOscillator(this.wavetable));
    }
    
    this.envelope = new ADSR(0.15, 0.4, 0.85, 0.6, 44100);
    this.breathEnvelope = new ADSR(0.2, 0.3, 0.4, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.breathLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.08, -0.04, -0.01, 0.01, 0.04, 0.08];
    for (let i = 0; i < 6; i++) {
      this.oscillators[i].setFrequency(frequency * (1 + detuneAmounts[i] * 0.01), context.sampleRate);
      this.oscillators[i].setTablePosition(0.2);
    }

    this.morphLFO.setFrequency(0.08, context.sampleRate);
    this.breathLFO.setFrequency(0.12, context.sampleRate);

    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000, 0.8, context.sampleRate);
    this.bodyFilter.setPeaking(400, 2, 3, context.sampleRate);

    this.envelope = new ADSR(0.13, 0.38, 0.83, 0.58, context.sampleRate);
    this.breathEnvelope = new ADSR(0.18, 0.28, 0.38, 0.48, context.sampleRate);
    this.envelope.trigger();
    this.breathEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.breathEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const breathEnvValue = this.breathEnvelope.process();
      
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const breathMod = this.breathLFO.sine() * 0.1 * breathEnvValue;

      for (let o = 0; o < 6; o++) {
        this.oscillators[o].setTablePosition(morphValue * 0.8);
      }

      let sampleL = 0;
      let sampleR = 0;
      for (let o = 0; o < 6; o++) {
        const osc = this.oscillators[o].process();
        const pan = (o - 2.5) / 3;
        sampleL += osc * (1 - pan * 0.35);
        sampleR += osc * (1 + pan * 0.35);
      }
      sampleL /= 6;
      sampleR /= 6;

      const breath = (Math.random() * 2 - 1) * breathEnvValue * 0.08;
      sampleL += breath;
      sampleR += breath;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.bodyFilter.process(sampleL);
      sampleR = this.bodyFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.morphLFO.reset();
    this.breathLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
  }
}

export class DigitalWavetableSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bitcrushFilter: BiquadFilter;
  private morphLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateDigital();
    this.wavetable.generateSquare();
    this.wavetable.generatePWM(0.2);
    this.wavetable.generatePWM(0.8);

    for (let i = 0; i < 3; i++) {
      this.oscillators.push(new WavetableOscillator(this.wavetable));
    }
    
    this.envelope = new ADSR(0.005, 0.15, 0.6, 0.2, 44100);
    this.filterEnvelope = new ADSR(0.01, 0.2, 0.4, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bitcrushFilter = new BiquadFilter();
    this.morphLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.01, 0, 0.01];
    for (let i = 0; i < 3; i++) {
      this.oscillators[i].setFrequency(frequency * (1 + detuneAmounts[i] * 0.01), context.sampleRate);
      this.oscillators[i].setTablePosition(0);
    }

    this.morphLFO.setFrequency(0.4, context.sampleRate);

    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000, 2.5, context.sampleRate);
    this.bitcrushFilter.setHighShelf(4000, -3, context.sampleRate);

    this.envelope = new ADSR(0.003, 0.13, 0.58, 0.18, context.sampleRate);
    this.filterEnvelope = new ADSR(0.008, 0.18, 0.38, 0.13, context.sampleRate);
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
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;

      for (let o = 0; o < 3; o++) {
        this.oscillators[o].setTablePosition(morphValue);
      }

      let sample = 0;
      for (let o = 0; o < 3; o++) {
        sample += this.oscillators[o].process();
      }
      sample /= 3;

      const bits = 6;
      const quantized = Math.floor(sample * (1 << (bits - 1))) / (1 << (bits - 1));
      sample = sample * 0.7 + quantized * 0.3;

      const filterFreq = 1500 + filterEnvValue * 5000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 300, 12000), 2 + filterEnvValue * 2, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bitcrushFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = hardClip(sample, 0.9);
      output.samples[1][i] = hardClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.morphLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bitcrushFilter.clear();
  }
}

export class PPGSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private morphLFO: LFO;
  private pwmLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable = new Wavetable();
    for (let p = 0; p < 8; p++) {
      const harmonics: number[] = [];
      for (let h = 0; h < 16; h++) {
        harmonics.push(Math.pow(0.7, h) * Math.sin(p * 0.5 + h * 0.3));
      }
      this.wavetable.generateAdditive(harmonics);
    }

    for (let i = 0; i < 2; i++) {
      this.oscillators.push(new WavetableOscillator(this.wavetable));
    }
    
    this.envelope = new ADSR(0.02, 0.25, 0.7, 0.35, 44100);
    this.filterEnvelope = new ADSR(0.03, 0.3, 0.5, 0.3, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.oscillators[0].setFrequency(frequency, context.sampleRate);
    this.oscillators[1].setFrequency(frequency * 1.005, context.sampleRate);
    
    this.oscillators[0].setTablePosition(0);
    this.oscillators[1].setTablePosition(0.2);

    this.morphLFO.setFrequency(0.2, context.sampleRate);
    this.pwmLFO.setFrequency(0.5, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 1.5, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.23, 0.68, 0.33, context.sampleRate);
    this.filterEnvelope = new ADSR(0.025, 0.28, 0.48, 0.28, context.sampleRate);
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
      
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const pwmValue = this.pwmLFO.sine() * 0.1;

      this.oscillators[0].setTablePosition(morphValue);
      this.oscillators[1].setTablePosition(clamp(morphValue + 0.2 + pwmValue, 0, 1));

      const osc1 = this.oscillators[0].process() * 0.5;
      const osc2 = this.oscillators[1].process() * 0.5;
      let sample = osc1 + osc2;

      const filterFreq = 1200 + filterEnvValue * 4000 + this.velocity * 1500;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 10000), 1.8 + filterEnvValue * 1.5, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.morphLFO.reset();
    this.pwmLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class MicrotonalSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private oscillators: WavetableOscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private morphLFO: LFO;
  private microtonalLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private microtonalRatios: number[] = [];

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateSine();
    this.wavetable.generateTriangle();
    this.wavetable.generateAdditive([1, 0.7, 0.4, 0.2, 0.1]);

    for (let i = 0; i < 5; i++) {
      this.oscillators.push(new WavetableOscillator(this.wavetable));
    }
    
    this.microtonalRatios = [1, 1.059463, 1.122462, 1.189207, 1.259921];
    
    this.envelope = new ADSR(0.08, 0.35, 0.8, 0.45, 44100);
    this.filterEnvelope = new ADSR(0.1, 0.4, 0.6, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.microtonalLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 5; i++) {
      this.oscillators[i].setFrequency(frequency * this.microtonalRatios[i], context.sampleRate);
      this.oscillators[i].setTablePosition(0.3);
    }

    this.morphLFO.setFrequency(0.1, context.sampleRate);
    this.microtonalLFO.setFrequency(0.05, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 1.0, context.sampleRate);

    this.envelope = new ADSR(0.07, 0.33, 0.78, 0.43, context.sampleRate);
    this.filterEnvelope = new ADSR(0.09, 0.38, 0.58, 0.38, context.sampleRate);
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
      
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const microtonalShift = this.microtonalLFO.sine() * 0.01;

      for (let o = 0; o < 5; o++) {
        this.oscillators[o].setTablePosition(morphValue);
        const shiftedFreq = this.frequency * this.microtonalRatios[o] * (1 + microtonalShift * (o % 2 === 0 ? 1 : -1));
        this.oscillators[o].setFrequency(shiftedFreq, this.sampleRate);
      }

      let sampleL = 0;
      let sampleR = 0;
      const levels = [0.4, 0.25, 0.2, 0.15, 0.1];
      for (let o = 0; o < 5; o++) {
        const osc = this.oscillators[o].process() * levels[o];
        const pan = (o - 2) / 2.5;
        sampleL += osc * (1 - pan * 0.3);
        sampleR += osc * (1 + pan * 0.3);
      }

      const filterFreq = 1500 + filterEnvValue * 3000 + this.velocity * 1500;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 8000), 1.2, this.sampleRate);

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.morphLFO.reset();
    this.microtonalLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class HybridSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private wtOscillators: WavetableOscillator[] = [];
  private subOsc: Oscillator;
  private noiseOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bpFilter: BiquadFilter;
  private morphLFO: LFO;
  private filterLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateSaw();
    this.wavetable.generateSquare();
    this.wavetable.generateTriangle();
    this.wavetable.generatePWM(0.25);

    for (let i = 0; i < 2; i++) {
      this.wtOscillators.push(new WavetableOscillator(this.wavetable));
    }
    this.subOsc = new Oscillator();
    this.noiseOsc = new Oscillator();
    
    this.envelope = new ADSR(0.01, 0.2, 0.7, 0.25, 44100);
    this.filterEnvelope = new ADSR(0.02, 0.25, 0.5, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bpFilter = new BiquadFilter();
    this.morphLFO = new LFO();
    this.filterLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.wtOscillators[0].setFrequency(frequency, context.sampleRate);
    this.wtOscillators[1].setFrequency(frequency * 1.005, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.wtOscillators[0].setTablePosition(0.2);
    this.wtOscillators[1].setTablePosition(0.4);

    this.morphLFO.setFrequency(0.25, context.sampleRate);
    this.filterLFO.setFrequency(0.4, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 2, context.sampleRate);
    this.bpFilter.setBandpass(2000, 1.5, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.18, 0.68, 0.23, context.sampleRate);
    this.filterEnvelope = new ADSR(0.015, 0.23, 0.48, 0.18, context.sampleRate);
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
      
      const morphValue = (this.morphLFO.sine() + 1) * 0.5;
      const filterMod = this.filterLFO.sine();

      this.wtOscillators[0].setTablePosition(morphValue);
      this.wtOscillators[1].setTablePosition(clamp(morphValue + 0.3, 0, 1));

      const wt1 = this.wtOscillators[0].process() * 0.4;
      const wt2 = this.wtOscillators[1].process() * 0.35;
      const sub = this.subOsc.sine() * 0.25;
      const noise = this.noiseOsc.noise() * 0.03 * filterEnvValue;

      let sample = wt1 + wt2 + sub + noise;

      const filterFreq = 1000 + filterEnvValue * 4500 + filterMod * 500 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 12000), 2 + filterEnvValue * 2, this.sampleRate);
      this.bpFilter.setBandpass(clamp(filterFreq * 0.6, 200, 6000), 1.5, this.sampleRate);

      sample = this.hpFilter.process(sample);
      const lpOut = this.lpFilter.process(sample);
      const bpOut = this.bpFilter.process(sample);
      sample = lpOut * 0.8 + bpOut * 0.2;

      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.wtOscillators.forEach(o => o.reset());
    this.subOsc.reset();
    this.noiseOsc.reset();
    this.morphLFO.reset();
    this.filterLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bpFilter.clear();
  }
}

export class GranularWavetableSynth implements SynthesizerEngine {
  private wavetable: Wavetable;
  private grains: { osc: WavetableOscillator, phase: number, amp: number, pan: number }[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private grainLFO: LFO;
  private positionLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private grainCounter: number = 0;
  private grainSize: number = 1000;
  private grainDensity: number = 4;

  constructor() {
    this.wavetable = new Wavetable();
    this.wavetable.generateSaw();
    this.wavetable.generateSquare();
    this.wavetable.generateTriangle();
    this.wavetable.generateSine();
    this.wavetable.generateAdditive([1, 0.5, 0.3, 0.2, 0.1]);

    for (let i = 0; i < 8; i++) {
      this.grains.push({
        osc: new WavetableOscillator(this.wavetable),
        phase: 0,
        amp: 0,
        pan: (Math.random() * 2 - 1) * 0.5
      });
    }
    
    this.envelope = new ADSR(0.2, 0.4, 0.8, 0.6, 44100);
    this.filterEnvelope = new ADSR(0.3, 0.5, 0.6, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.grainLFO = new LFO();
    this.positionLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.grainCounter = 0;
    this.grainSize = Math.floor(context.sampleRate / 20);

    for (let i = 0; i < 8; i++) {
      const detune = 1 + (Math.random() - 0.5) * 0.02;
      this.grains[i].osc.setFrequency(frequency * detune, context.sampleRate);
      this.grains[i].osc.setTablePosition(Math.random());
      this.grains[i].phase = Math.random();
      this.grains[i].amp = 0;
      this.grains[i].pan = (Math.random() * 2 - 1) * 0.5;
    }

    this.grainLFO.setFrequency(0.15, context.sampleRate);
    this.positionLFO.setFrequency(0.1, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.18, 0.38, 0.78, 0.58, context.sampleRate);
    this.filterEnvelope = new ADSR(0.28, 0.48, 0.58, 0.48, context.sampleRate);
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
      
      const positionMod = (this.positionLFO.sine() + 1) * 0.5;
      const grainMod = this.grainLFO.sine();

      this.grainCounter++;
      const triggerInterval = Math.floor(this.grainSize / this.grainDensity);
      
      if (this.grainCounter >= triggerInterval) {
        this.grainCounter = 0;
        for (const grain of this.grains) {
          if (grain.amp <= 0.01) {
            grain.phase = 0;
            grain.amp = 0.8 + Math.random() * 0.2;
            grain.osc.setTablePosition(positionMod + (Math.random() - 0.5) * 0.2);
            grain.pan = (Math.random() * 2 - 1) * 0.5;
            break;
          }
        }
      }

      let sampleL = 0;
      let sampleR = 0;

      for (const grain of this.grains) {
        if (grain.amp > 0.001) {
          const grainEnv = Math.sin(grain.phase * Math.PI);
          const grainSample = grain.osc.process() * grain.amp * grainEnv;
          
          sampleL += grainSample * (1 - grain.pan * 0.5);
          sampleR += grainSample * (1 + grain.pan * 0.5);
          
          grain.phase += 1 / this.grainSize;
          if (grain.phase >= 1) {
            grain.amp = 0;
            grain.phase = 0;
          }
        }
      }

      sampleL /= 4;
      sampleR /= 4;

      const filterFreq = 1500 + filterEnvValue * 3500 + grainMod * 500;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 10000), 1.0, this.sampleRate);

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.grains.forEach(g => {
      g.osc.reset();
      g.phase = 0;
      g.amp = 0;
    });
    this.grainCounter = 0;
    this.grainLFO.reset();
    this.positionLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export const WAVETABLE_SYNTH_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  'serum': SerumSynth,
  'massive': MassiveSynth,
  'synthwave': SynthwaveSynth,
  'vocal-wavetable': VocalWavetableSynth,
  'organic-wavetable': OrganicWavetableSynth,
  'digital-wavetable': DigitalWavetableSynth,
  'ppg': PPGSynth,
  'microtonal': MicrotonalSynth,
  'hybrid': HybridSynth,
  'granular-wavetable': GranularWavetableSynth,
};
