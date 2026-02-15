import {
  AudioBuffer, DSPContext, DSPProcessor, createBuffer, copyBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, CombFilter,
  LFO, Oscillator, ADSR,
  msToSamples, dbToLinear, clamp, softClip, hzToRadians
} from '../core';

export interface NoteParams {
  frequency: number;
  velocity: number;
  noteOn: boolean;
  noteOff?: boolean;
}

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: DSPContext): void;
  noteOff(context: DSPContext): void;
  render(numSamples: number, context: DSPContext): AudioBuffer;
  isActive(): boolean;
  reset(): void;
}

class HammerModel {
  private hardness: number;
  private mass: number;
  private velocity: number = 0;
  private position: number = 0;

  constructor(hardness: number = 0.8, mass: number = 0.5) {
    this.hardness = hardness;
    this.mass = mass;
  }

  strike(velocity: number): number {
    this.velocity = velocity;
    const impact = Math.pow(velocity, 1 + this.hardness * 0.5);
    const brightness = 0.3 + velocity * 0.7 * this.hardness;
    return impact * brightness;
  }

  getHarmonicContent(velocity: number): number[] {
    const numHarmonics = Math.floor(8 + velocity * 24 * this.hardness);
    const harmonics: number[] = [];
    for (let i = 1; i <= numHarmonics; i++) {
      const amplitude = Math.pow(0.7, (i - 1) * (1 - this.hardness * 0.5)) / i;
      harmonics.push(amplitude * (0.5 + velocity * 0.5));
    }
    return harmonics;
  }
}

class StringResonator {
  private combFilters: CombFilter[] = [];
  private allpassFilters: AllPassFilter[] = [];
  private damping: number;
  private sampleRate: number = 44100;

  constructor(numStrings: number = 3, damping: number = 0.995) {
    this.damping = damping;
    for (let i = 0; i < numStrings; i++) {
      this.combFilters.push(new CombFilter(4410, 0.5, 0.2));
      this.allpassFilters.push(new AllPassFilter(100 + i * 20, 0.5));
    }
  }

  setFrequency(frequency: number, sampleRate: number): void {
    this.sampleRate = sampleRate;
    const period = Math.floor(sampleRate / frequency);
    this.combFilters.forEach((comb, i) => {
      const detuning = 1 + (i - 1) * 0.001;
      const detunedPeriod = Math.floor(period * detuning);
      comb.setFeedback(this.damping);
      comb.setDamping(0.3);
    });
  }

  process(input: number): number {
    let output = 0;
    for (let i = 0; i < this.combFilters.length; i++) {
      let sample = this.combFilters[i].process(input);
      sample = this.allpassFilters[i].process(sample);
      output += sample;
    }
    return output / this.combFilters.length;
  }

  clear(): void {
    this.combFilters.forEach(c => c.clear());
    this.allpassFilters.forEach(a => a.clear());
  }
}

export class GrandPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private hammer: HammerModel;
  private stringResonator: StringResonator;
  private sympatheticResonator: StringResonator;
  private bodyFilter: BiquadFilter;
  private soundboardFilter: BiquadFilter;
  private highShelf: BiquadFilter;
  private delayLine: DelayLine;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private harmonicAmplitudes: number[] = [];
  private phase: number[] = [];

  constructor() {
    for (let i = 0; i < 16; i++) {
      this.oscillators.push(new Oscillator());
      this.phase.push(Math.random() * Math.PI * 2);
    }
    this.envelope = new ADSR(0.001, 0.8, 0.6, 2.0, 44100);
    this.hammer = new HammerModel(0.85, 0.5);
    this.stringResonator = new StringResonator(3, 0.997);
    this.sympatheticResonator = new StringResonator(5, 0.99);
    this.bodyFilter = new BiquadFilter();
    this.soundboardFilter = new BiquadFilter();
    this.highShelf = new BiquadFilter();
    this.delayLine = new DelayLine(4410);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.harmonicAmplitudes = this.hammer.getHarmonicContent(this.velocity);
    this.stringResonator.setFrequency(frequency, context.sampleRate);
    this.bodyFilter.setPeaking(250, 2, 3, context.sampleRate);
    this.soundboardFilter.setPeaking(2000, 1.5, 2, context.sampleRate);
    this.highShelf.setHighShelf(4000, -3 + this.velocity * 6, context.sampleRate);
    for (let i = 0; i < this.oscillators.length; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    this.envelope = new ADSR(0.001, 0.5 + (1 - this.velocity) * 0.5, 0.5, 1.5 + (1 - this.velocity) * 1.5, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      let sample = 0;
      const envValue = this.envelope.process();
      
      for (let h = 0; h < Math.min(this.harmonicAmplitudes.length, 16); h++) {
        this.oscillators[h].setFrequency(this.frequency * (h + 1), this.sampleRate);
        const inharmonicity = 1 + 0.0001 * (h + 1) * (h + 1);
        const harmonicSample = this.oscillators[h].sine() * this.harmonicAmplitudes[h];
        sample += harmonicSample;
      }
      
      sample = this.stringResonator.process(sample * 0.3) * 0.7 + sample * 0.3;
      sample = this.bodyFilter.process(sample);
      sample = this.soundboardFilter.process(sample);
      sample = this.highShelf.process(sample);
      
      const sympathetic = this.sympatheticResonator.process(sample * 0.05);
      sample += sympathetic * 0.1;
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);
      
      const stereoWidth = 0.15;
      const notePosition = (this.frequency - 27.5) / (4186 - 27.5);
      const pan = 0.5 + (notePosition - 0.5) * stereoWidth;
      
      output.samples[0][i] = sample * (1 - pan * 0.3);
      output.samples[1][i] = sample * (0.7 + pan * 0.3);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.envelope = new ADSR(0.001, 0.8, 0.6, 2.0, this.sampleRate);
    this.stringResonator.clear();
    this.sympatheticResonator.clear();
    this.bodyFilter.clear();
    this.soundboardFilter.clear();
    this.highShelf.clear();
    this.delayLine.clear();
  }
}

export class UprightPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private damperEnvelope: ADSR;
  private bodyFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private lpFilter: OnePoleFilter;
  private combFilter: CombFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 12; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.002, 0.6, 0.5, 1.5, 44100);
    this.damperEnvelope = new ADSR(0.001, 0.1, 0.8, 0.3, 44100);
    this.bodyFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
    this.lpFilter = new OnePoleFilter();
    this.combFilter = new CombFilter(500, 0.3, 0.4);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < this.oscillators.length; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.bodyFilter.setPeaking(300, 2.5, 4, context.sampleRate);
    this.warmthFilter.setLowShelf(400, 3, context.sampleRate);
    this.lpFilter.setLowpass(3000 + this.velocity * 5000, context.sampleRate);
    
    this.envelope = new ADSR(0.002, 0.4 + (1 - this.velocity) * 0.3, 0.45, 1.2, context.sampleRate);
    this.damperEnvelope = new ADSR(0.001, 0.08, 0.7, 0.25, context.sampleRate);
    this.envelope.trigger();
    this.damperEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.damperEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      let sample = 0;
      const envValue = this.envelope.process();
      const damperValue = this.damperEnvelope.process();
      
      for (let h = 0; h < 12; h++) {
        const amplitude = Math.pow(0.65, h) / (h + 1);
        const harmonicSample = this.oscillators[h].sine() * amplitude;
        sample += harmonicSample;
      }
      
      sample = this.combFilter.process(sample * 0.2) * 0.3 + sample * 0.7;
      sample = this.bodyFilter.process(sample);
      sample = this.warmthFilter.process(sample);
      sample = this.lpFilter.process(sample);
      
      const damperEffect = 1 - (1 - damperValue) * 0.3;
      sample *= envValue * this.velocity * damperEffect;
      sample = softClip(sample, 0.85);
      
      output.samples[0][i] = sample * 0.95;
      output.samples[1][i] = sample * 1.05;
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.bodyFilter.clear();
    this.warmthFilter.clear();
    this.lpFilter.clear();
    this.combFilter.clear();
  }
}

export class ElectricPianoSynth implements SynthesizerEngine {
  private tineOsc: Oscillator;
  private toneBarOsc: Oscillator;
  private envelope: ADSR;
  private tineEnvelope: ADSR;
  private tremoloLFO: LFO;
  private chorusLFO: LFO;
  private chorusDelay: DelayLine;
  private lpFilter: BiquadFilter;
  private barkFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.tineOsc = new Oscillator();
    this.toneBarOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.3, 0.7, 0.8, 44100);
    this.tineEnvelope = new ADSR(0.0005, 0.05, 0.3, 0.2, 44100);
    this.tremoloLFO = new LFO();
    this.chorusLFO = new LFO();
    this.chorusDelay = new DelayLine(2205);
    this.lpFilter = new BiquadFilter();
    this.barkFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    this.tineOsc.setFrequency(frequency, context.sampleRate);
    this.toneBarOsc.setFrequency(frequency, context.sampleRate);
    
    this.tremoloLFO.setFrequency(5.5, context.sampleRate);
    this.chorusLFO.setFrequency(0.8, context.sampleRate);
    
    this.lpFilter.setLowpass(2500 + this.velocity * 4000, 0.7, context.sampleRate);
    this.barkFilter.setPeaking(800, 2, 3 + this.velocity * 4, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 0.2 + (1 - this.velocity) * 0.2, 0.65, 0.6, context.sampleRate);
    this.tineEnvelope = new ADSR(0.0005, 0.03, 0.2, 0.15, context.sampleRate);
    this.envelope.trigger();
    this.tineEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.tineEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const tineEnvValue = this.tineEnvelope.process();
      
      const toneBar = this.toneBarOsc.sine();
      this.tineOsc.setFrequency(this.frequency * 2, this.sampleRate);
      const tine = this.tineOsc.sine() * tineEnvValue;
      this.tineOsc.setFrequency(this.frequency * 3, this.sampleRate);
      const tine2 = this.tineOsc.sine() * tineEnvValue * 0.5;
      
      let sample = toneBar * 0.6 + tine * 0.3 + tine2 * 0.1;
      
      const fmAmount = this.velocity * 0.3;
      const fmMod = Math.sin(2 * Math.PI * this.frequency * 7 * i / this.sampleRate);
      sample += sample * fmMod * fmAmount * tineEnvValue;
      
      sample = this.lpFilter.process(sample);
      sample = this.barkFilter.process(sample);
      
      const tremolo = 1 - this.tremoloLFO.sine() * 0.15;
      sample *= tremolo;
      
      this.chorusDelay.write(sample);
      const chorusMod = this.chorusLFO.sine() * 20 + 30;
      const chorusSample = this.chorusDelay.readInterpolated(chorusMod);
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.85);
      
      output.samples[0][i] = sample * 0.7 + chorusSample * 0.3 * envValue;
      output.samples[1][i] = sample * 0.7 + chorusSample * 0.3 * envValue;
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.tineOsc.reset();
    this.toneBarOsc.reset();
    this.tremoloLFO.reset();
    this.chorusLFO.reset();
    this.chorusDelay.clear();
    this.lpFilter.clear();
    this.barkFilter.clear();
  }
}

export class ClavinetSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private pickupEnvelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private clavFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.001, 0.15, 0.6, 0.2, 44100);
    this.pickupEnvelope = new ADSR(0.0005, 0.02, 0.4, 0.1, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.08, 0.3, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.clavFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < this.oscillators.length; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.hpFilter.setHighpass(200, 0.7, context.sampleRate);
    this.clavFilter.setPeaking(1500, 3, 6, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 0.1, 0.55, 0.15, context.sampleRate);
    this.pickupEnvelope = new ADSR(0.0005, 0.015, 0.35, 0.08, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.06, 0.25, 0.12, context.sampleRate);
    
    this.envelope.trigger();
    this.pickupEnvelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.pickupEnvelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const pickupEnvValue = this.pickupEnvelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      
      let sample = 0;
      sample += this.oscillators[0].pulse(0.3) * 0.5;
      sample += this.oscillators[1].pulse(0.25) * 0.25;
      sample += this.oscillators[2].pulse(0.2) * 0.15;
      sample += this.oscillators[3].pulse(0.15) * 0.1;
      
      const pickupClick = pickupEnvValue * 0.4;
      sample += (Math.random() * 2 - 1) * pickupClick;
      
      const filterFreq = 800 + filterEnvValue * 4000 + this.velocity * 3000;
      this.lpFilter.setLowpass(filterFreq, 2 + this.velocity * 4, this.sampleRate);
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.clavFilter.process(sample);
      
      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.5, 0.9);
      
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
    this.clavFilter.clear();
  }
}

export class HonkyTonkSynth implements SynthesizerEngine {
  private oscillators: Oscillator[][] = [];
  private envelope: ADSR;
  private bodyFilter: BiquadFilter;
  private lpFilter: OnePoleFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private detuneAmounts: number[] = [];

  constructor() {
    for (let s = 0; s < 3; s++) {
      const stringOscs: Oscillator[] = [];
      for (let h = 0; h < 8; h++) {
        stringOscs.push(new Oscillator());
      }
      this.oscillators.push(stringOscs);
      this.detuneAmounts.push((s - 1) * 0.015 + (Math.random() - 0.5) * 0.005);
    }
    this.envelope = new ADSR(0.002, 0.5, 0.55, 1.2, 44100);
    this.bodyFilter = new BiquadFilter();
    this.lpFilter = new OnePoleFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let s = 0; s < 3; s++) {
      const detunedFreq = frequency * (1 + this.detuneAmounts[s]);
      for (let h = 0; h < 8; h++) {
        this.oscillators[s][h].setFrequency(detunedFreq * (h + 1), context.sampleRate);
      }
    }
    
    this.bodyFilter.setPeaking(400, 2, 4, context.sampleRate);
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, context.sampleRate);
    
    this.envelope = new ADSR(0.002, 0.4, 0.5, 1.0, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      let sample = 0;
      const envValue = this.envelope.process();
      
      for (let s = 0; s < 3; s++) {
        let stringSample = 0;
        for (let h = 0; h < 8; h++) {
          const amplitude = Math.pow(0.6, h) / (h + 1);
          stringSample += this.oscillators[s][h].sine() * amplitude;
        }
        sample += stringSample;
      }
      
      sample /= 3;
      sample = this.bodyFilter.process(sample);
      sample = this.lpFilter.process(sample);
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.85);
      
      const wobble = Math.sin(i * 0.0003) * 0.02;
      output.samples[0][i] = sample * (1 + wobble);
      output.samples[1][i] = sample * (1 - wobble);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(s => s.forEach(o => o.reset()));
    this.bodyFilter.clear();
    this.lpFilter.clear();
  }
}

export class ToyPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private strikeEnvelope: ADSR;
  private metalFilter: BiquadFilter;
  private highBoost: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.001, 0.2, 0.3, 0.4, 44100);
    this.strikeEnvelope = new ADSR(0.0002, 0.01, 0.1, 0.05, 44100);
    this.metalFilter = new BiquadFilter();
    this.highBoost = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    const inharmonicRatios = [1, 2.01, 3.03, 4.02, 5.05, 6.01];
    for (let i = 0; i < 6; i++) {
      this.oscillators[i].setFrequency(frequency * inharmonicRatios[i], context.sampleRate);
    }
    
    this.metalFilter.setPeaking(3000, 4, 8, context.sampleRate);
    this.highBoost.setHighShelf(5000, 6, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 0.15, 0.25, 0.3, context.sampleRate);
    this.strikeEnvelope = new ADSR(0.0002, 0.008, 0.08, 0.04, context.sampleRate);
    this.envelope.trigger();
    this.strikeEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.strikeEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const strikeValue = this.strikeEnvelope.process();
      
      let sample = 0;
      const amplitudes = [0.5, 0.3, 0.15, 0.08, 0.04, 0.02];
      for (let h = 0; h < 6; h++) {
        sample += this.oscillators[h].sine() * amplitudes[h];
      }
      
      sample += (Math.random() * 2 - 1) * strikeValue * 0.3;
      
      sample = this.metalFilter.process(sample);
      sample = this.highBoost.process(sample);
      
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
    this.metalFilter.clear();
    this.highBoost.clear();
  }
}

export class TackPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private tackOsc: Oscillator;
  private envelope: ADSR;
  private tackEnvelope: ADSR;
  private bodyFilter: BiquadFilter;
  private tackFilter: BiquadFilter;
  private highBoost: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 10; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.tackOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.4, 0.5, 1.0, 44100);
    this.tackEnvelope = new ADSR(0.0001, 0.003, 0.05, 0.01, 44100);
    this.bodyFilter = new BiquadFilter();
    this.tackFilter = new BiquadFilter();
    this.highBoost = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 10; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    this.tackOsc.setFrequency(frequency * 8, context.sampleRate);
    
    this.bodyFilter.setPeaking(300, 2, 2, context.sampleRate);
    this.tackFilter.setPeaking(4000, 5, 10, context.sampleRate);
    this.highBoost.setHighShelf(3000, 8, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 0.35, 0.45, 0.8, context.sampleRate);
    this.tackEnvelope = new ADSR(0.0001, 0.002, 0.04, 0.008, context.sampleRate);
    this.envelope.trigger();
    this.tackEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.tackEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const tackEnvValue = this.tackEnvelope.process();
      
      let sample = 0;
      for (let h = 0; h < 10; h++) {
        const amplitude = Math.pow(0.7, h) / (h + 1);
        sample += this.oscillators[h].sine() * amplitude;
      }
      
      const tackSound = this.tackOsc.saw() * tackEnvValue * 0.5;
      sample += tackSound;
      sample += (Math.random() * 2 - 1) * tackEnvValue * 0.3;
      
      sample = this.bodyFilter.process(sample);
      sample = this.tackFilter.process(sample);
      sample = this.highBoost.process(sample);
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.88);
      
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
    this.tackOsc.reset();
    this.bodyFilter.clear();
    this.tackFilter.clear();
    this.highBoost.clear();
  }
}

export class PreparedPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private noiseOsc: Oscillator;
  private envelope: ADSR;
  private muteEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private bpFilter: BiquadFilter;
  private metalFilter: BiquadFilter;
  private comb: CombFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private preparationType: number = 0;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.noiseOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.3, 0.4, 0.6, 44100);
    this.muteEnvelope = new ADSR(0.0005, 0.05, 0.2, 0.1, 44100);
    this.lpFilter = new BiquadFilter();
    this.bpFilter = new BiquadFilter();
    this.metalFilter = new BiquadFilter();
    this.comb = new CombFilter(200, 0.4, 0.3);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.preparationType = Math.floor(Math.random() * 3);
    
    for (let i = 0; i < 8; i++) {
      const detune = 1 + (Math.random() - 0.5) * 0.02;
      this.oscillators[i].setFrequency(frequency * (i + 1) * detune, context.sampleRate);
    }
    
    this.lpFilter.setLowpass(1500 + this.velocity * 2000, 1, context.sampleRate);
    this.bpFilter.setBandpass(frequency * 2, 3, context.sampleRate);
    this.metalFilter.setPeaking(2500, 4, 5, context.sampleRate);
    
    this.envelope = new ADSR(0.001, 0.2, 0.35, 0.5, context.sampleRate);
    this.muteEnvelope = new ADSR(0.0005, 0.04, 0.15, 0.08, context.sampleRate);
    this.envelope.trigger();
    this.muteEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.muteEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const muteValue = this.muteEnvelope.process();
      
      let sample = 0;
      
      if (this.preparationType === 0) {
        for (let h = 0; h < 8; h++) {
          const amplitude = Math.pow(0.5, h) / (h + 1);
          sample += this.oscillators[h].sine() * amplitude * (1 - muteValue * 0.7);
        }
        sample = this.lpFilter.process(sample);
      } else if (this.preparationType === 1) {
        for (let h = 0; h < 4; h++) {
          sample += this.oscillators[h].triangle() * 0.2;
        }
        sample += this.noiseOsc.noise() * muteValue * 0.2;
        sample = this.bpFilter.process(sample);
        sample = this.metalFilter.process(sample);
      } else {
        for (let h = 0; h < 6; h++) {
          sample += this.oscillators[h].sine() * 0.15;
        }
        sample = this.comb.process(sample);
        sample *= (1 - muteValue * 0.5);
      }
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.85);
      
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
    this.noiseOsc.reset();
    this.lpFilter.clear();
    this.bpFilter.clear();
    this.metalFilter.clear();
    this.comb.clear();
  }
}

export class FeltPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private softEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private softFilter: OnePoleFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.01, 0.8, 0.7, 2.5, 44100);
    this.softEnvelope = new ADSR(0.02, 0.5, 0.8, 1.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
    this.softFilter = new OnePoleFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 8; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.lpFilter.setLowpass(1200 + this.velocity * 1500, 0.5, context.sampleRate);
    this.warmthFilter.setLowShelf(300, 4, context.sampleRate);
    this.softFilter.setLowpass(2000, context.sampleRate);
    
    this.envelope = new ADSR(0.015, 0.6, 0.65, 2.0, context.sampleRate);
    this.softEnvelope = new ADSR(0.025, 0.4, 0.75, 1.2, context.sampleRate);
    this.envelope.trigger();
    this.softEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.softEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const softEnvValue = this.softEnvelope.process();
      
      let sample = 0;
      for (let h = 0; h < 8; h++) {
        const amplitude = Math.pow(0.55, h) / (h + 1);
        sample += this.oscillators[h].sine() * amplitude;
      }
      
      sample = this.lpFilter.process(sample);
      sample = this.warmthFilter.process(sample);
      sample = this.softFilter.process(sample);
      
      sample *= envValue * softEnvValue * this.velocity * 0.8;
      sample = softClip(sample, 0.7);
      
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
    this.warmthFilter.clear();
    this.softFilter.clear();
  }
}

export class GlassPianoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private bellEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private bellFilter: BiquadFilter;
  private shimmerFilter: BiquadFilter;
  private delay: DelayLine;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 12; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.002, 0.4, 0.5, 1.5, 44100);
    this.bellEnvelope = new ADSR(0.001, 0.1, 0.3, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.bellFilter = new BiquadFilter();
    this.shimmerFilter = new BiquadFilter();
    this.delay = new DelayLine(4410);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    const bellRatios = [1, 2, 2.4, 3, 4, 4.8, 5.2, 6, 7.2, 8, 9.6, 10.8];
    for (let i = 0; i < 12; i++) {
      this.oscillators[i].setFrequency(frequency * bellRatios[i], context.sampleRate);
    }
    
    this.lpFilter.setLowpass(6000 + this.velocity * 6000, 0.7, context.sampleRate);
    this.bellFilter.setPeaking(frequency * 3, 4, 6, context.sampleRate);
    this.shimmerFilter.setHighShelf(4000, 4, context.sampleRate);
    
    this.envelope = new ADSR(0.002, 0.35, 0.45, 1.2, context.sampleRate);
    this.bellEnvelope = new ADSR(0.001, 0.08, 0.25, 0.4, context.sampleRate);
    this.envelope.trigger();
    this.bellEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.bellEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const bellEnvValue = this.bellEnvelope.process();
      
      let sample = 0;
      const bellAmps = [0.5, 0.3, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02];
      for (let h = 0; h < 12; h++) {
        const env = h < 4 ? envValue : bellEnvValue;
        sample += this.oscillators[h].sine() * bellAmps[h] * env;
      }
      
      sample = this.lpFilter.process(sample);
      sample = this.bellFilter.process(sample);
      sample = this.shimmerFilter.process(sample);
      
      this.delay.write(sample);
      const delaySample = this.delay.readInterpolated(msToSamples(30, this.sampleRate));
      
      sample *= this.velocity;
      sample = sample * 0.85 + delaySample * 0.15;
      sample = softClip(sample, 0.9);
      
      output.samples[0][i] = sample * 0.95 + delaySample * 0.1;
      output.samples[1][i] = sample * 0.95 + delaySample * 0.1;
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.lpFilter.clear();
    this.bellFilter.clear();
    this.shimmerFilter.clear();
    this.delay.clear();
  }
}

export const PIANO_SYNTHESIZERS: Record<string, () => SynthesizerEngine> = {
  'grand-piano': () => new GrandPianoSynth(),
  'upright-piano': () => new UprightPianoSynth(),
  'electric-piano': () => new ElectricPianoSynth(),
  'clavinet': () => new ClavinetSynth(),
  'honky-tonk': () => new HonkyTonkSynth(),
  'toy-piano': () => new ToyPianoSynth(),
  'tack-piano': () => new TackPianoSynth(),
  'prepared-piano': () => new PreparedPianoSynth(),
  'felt-piano': () => new FeltPianoSynth(),
  'glass-piano': () => new GlassPianoSynth(),
};
