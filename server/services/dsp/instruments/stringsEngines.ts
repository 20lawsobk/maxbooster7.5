import {
  AudioBuffer, DSPContext, DSPProcessor, createBuffer, copyBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, CombFilter,
  LFO, Oscillator, ADSR,
  msToSamples, dbToLinear, clamp, softClip, hzToRadians
} from '../core';

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: DSPContext): void;
  noteOff(context: DSPContext): void;
  render(numSamples: number, context: DSPContext): AudioBuffer;
  isActive(): boolean;
  reset(): void;
}

class BowModel {
  private position: number = 0;
  private velocity: number = 0;
  private pressure: number = 0.5;
  private friction: number = 0;
  private sampleRate: number = 44100;

  setBowParameters(pressure: number, velocity: number): void {
    this.pressure = clamp(pressure, 0, 1);
    this.velocity = velocity;
  }

  process(stringVelocity: number): number {
    const relativeVelocity = this.velocity - stringVelocity;
    const frictionCurve = 0.3 * Math.exp(-3 * Math.abs(relativeVelocity)) + 0.1;
    this.friction = frictionCurve * this.pressure * Math.sign(relativeVelocity);
    return this.friction;
  }
}

class StringModel {
  private delayLine: DelayLine;
  private lpFilter: OnePoleFilter;
  private allpass: AllPassFilter;
  private feedback: number = 0.995;
  private excitation: number = 0;

  constructor(maxLength: number = 4410) {
    this.delayLine = new DelayLine(maxLength);
    this.lpFilter = new OnePoleFilter();
    this.allpass = new AllPassFilter(20, 0.5);
  }

  setFrequency(frequency: number, sampleRate: number, damping: number = 0.3): void {
    const period = sampleRate / frequency;
    this.lpFilter.setLowpass(frequency * 3, sampleRate);
    this.feedback = 0.998 - damping * 0.01;
  }

  excite(amplitude: number): void {
    this.excitation = amplitude;
  }

  process(input: number, frequency: number, sampleRate: number): number {
    const period = Math.floor(sampleRate / frequency);
    const sample = this.delayLine.read(period);
    const filtered = this.lpFilter.process(sample);
    const output = this.allpass.process(filtered);
    this.delayLine.write(input + this.excitation + output * this.feedback);
    this.excitation *= 0.95;
    return output;
  }

  clear(): void {
    this.delayLine.clear();
    this.lpFilter.clear();
    this.allpass.clear();
    this.excitation = 0;
  }
}

export class OrchestralStringsSynth implements SynthesizerEngine {
  private sections: { oscillators: Oscillator[], envelope: ADSR, pan: number }[] = [];
  private vibratoLFO: LFO;
  private expressionLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private airFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    const sectionConfigs = [
      { count: 3, pan: -0.6, octave: 0 },
      { count: 2, pan: -0.3, octave: 0 },
      { count: 2, pan: 0.3, octave: 0 },
      { count: 3, pan: 0.6, octave: -1 },
    ];
    
    for (const config of sectionConfigs) {
      const oscillators: Oscillator[] = [];
      for (let i = 0; i < config.count; i++) {
        oscillators.push(new Oscillator());
      }
      this.sections.push({
        oscillators,
        envelope: new ADSR(0.15, 0.3, 0.85, 0.4, 44100),
        pan: config.pan
      });
    }
    
    this.vibratoLFO = new LFO();
    this.expressionLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.airFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    this.expressionLFO.setFrequency(0.3, context.sampleRate);
    
    this.lpFilter.setLowpass(3000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(800, 1.5, 3, context.sampleRate);
    this.airFilter.setHighShelf(6000, 2, context.sampleRate);
    
    const octaveOffsets = [0, 0, 0, -1];
    this.sections.forEach((section, sIdx) => {
      const baseFreq = frequency * Math.pow(2, octaveOffsets[sIdx]);
      section.oscillators.forEach((osc, i) => {
        const detune = 1 + (Math.random() - 0.5) * 0.004;
        osc.setFrequency(baseFreq * detune, context.sampleRate);
      });
      section.envelope = new ADSR(0.12 + sIdx * 0.02, 0.25, 0.82, 0.35, context.sampleRate);
      section.envelope.trigger();
    });
  }

  noteOff(context: DSPContext): void {
    this.sections.forEach(section => section.envelope.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const vibrato = this.vibratoLFO.sine() * 0.003;
      const expression = 0.9 + this.expressionLFO.sine() * 0.1;
      
      let sampleL = 0;
      let sampleR = 0;
      
      for (const section of this.sections) {
        const envValue = section.envelope.process();
        let sectionSample = 0;
        
        for (const osc of section.oscillators) {
          const currentFreq = this.frequency * (1 + vibrato);
          osc.setFrequency(currentFreq * (1 + (Math.random() - 0.5) * 0.001), this.sampleRate);
          sectionSample += osc.sawBandLimited(12) * 0.3 + osc.sine() * 0.2;
        }
        
        sectionSample /= section.oscillators.length;
        sectionSample *= envValue;
        
        const panL = Math.cos((section.pan + 1) * Math.PI * 0.25);
        const panR = Math.sin((section.pan + 1) * Math.PI * 0.25);
        
        sampleL += sectionSample * panL;
        sampleR += sectionSample * panR;
      }
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.bodyFilter.process(sampleL);
      sampleR = this.bodyFilter.process(sampleR);
      sampleL = this.airFilter.process(sampleL);
      sampleR = this.airFilter.process(sampleR);
      
      sampleL *= expression * this.velocity;
      sampleR *= expression * this.velocity;
      
      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.sections.some(s => s.envelope.isActive());
  }

  reset(): void {
    this.sections.forEach(section => {
      section.oscillators.forEach(o => o.reset());
    });
    this.vibratoLFO.reset();
    this.expressionLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.airFilter.clear();
  }
}

export class ViolinSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private bowModel: BowModel;
  private envelope: ADSR;
  private vibratoLFO: LFO;
  private bowLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private bridgeFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.bowModel = new BowModel();
    this.envelope = new ADSR(0.08, 0.2, 0.9, 0.25, 44100);
    this.vibratoLFO = new LFO();
    this.bowLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.bridgeFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 8; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.bowModel.setBowParameters(0.5 + this.velocity * 0.3, 0.7);
    this.vibratoLFO.setFrequency(5.8, context.sampleRate);
    this.bowLFO.setFrequency(0.8, context.sampleRate);
    
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(200, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(450, 2, 4, context.sampleRate);
    this.bridgeFilter.setPeaking(2800, 3, 5, context.sampleRate);
    
    this.envelope = new ADSR(0.06, 0.15, 0.88, 0.2, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.004 * envValue;
      const bowPressure = 0.85 + this.bowLFO.sine() * 0.1;
      
      let sample = 0;
      const currentFreq = this.frequency * (1 + vibrato);
      
      for (let h = 0; h < 8; h++) {
        this.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
        const amplitude = 1 / (h + 1) * Math.pow(0.85, h);
        sample += this.oscillators[h].sawBandLimited(16) * amplitude;
      }
      
      const bowEffect = this.bowModel.process(sample * 0.1);
      sample = sample * 0.7 + bowEffect * sample * 0.3;
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.bridgeFilter.process(sample);
      
      sample *= envValue * this.velocity * bowPressure;
      sample = softClip(sample, 0.88);
      
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
    this.vibratoLFO.reset();
    this.bowLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.bridgeFilter.clear();
  }
}

export class CelloSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private vibratoLFO: LFO;
  private expressionLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 10; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.1, 0.3, 0.88, 0.35, 44100);
    this.vibratoLFO = new LFO();
    this.expressionLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 10; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.vibratoLFO.setFrequency(5.2, context.sampleRate);
    this.expressionLFO.setFrequency(0.25, context.sampleRate);
    
    this.lpFilter.setLowpass(2500 + this.velocity * 3000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(220, 2, 5, context.sampleRate);
    this.warmthFilter.setLowShelf(400, 4, context.sampleRate);
    
    this.envelope = new ADSR(0.08, 0.25, 0.85, 0.3, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.003 * envValue;
      const expression = 0.92 + this.expressionLFO.sine() * 0.08;
      
      let sample = 0;
      const currentFreq = this.frequency * (1 + vibrato);
      
      for (let h = 0; h < 10; h++) {
        this.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
        const amplitude = Math.pow(0.75, h) / (h + 1);
        sample += this.oscillators[h].sawBandLimited(14) * amplitude * 0.7;
        sample += this.oscillators[h].sine() * amplitude * 0.3;
      }
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.warmthFilter.process(sample);
      
      sample *= envValue * this.velocity * expression;
      sample = softClip(sample, 0.9);
      
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
    this.vibratoLFO.reset();
    this.expressionLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.warmthFilter.clear();
  }
}

export class ContrabassSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private vibratoLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private subFilter: OnePoleFilter;
  private frequency: number = 82.4;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.12, 0.35, 0.85, 0.4, 44100);
    this.vibratoLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.subFilter = new OnePoleFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 8; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);
    
    this.vibratoLFO.setFrequency(4.5, context.sampleRate);
    
    this.lpFilter.setLowpass(1500 + this.velocity * 2000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(35, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(120, 2, 6, context.sampleRate);
    this.subFilter.setLowpass(200, context.sampleRate);
    
    this.envelope = new ADSR(0.1, 0.3, 0.82, 0.35, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.002 * envValue;
      
      let sample = 0;
      const currentFreq = this.frequency * (1 + vibrato);
      
      for (let h = 0; h < 8; h++) {
        this.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
        const amplitude = Math.pow(0.7, h) / (h + 1);
        sample += this.oscillators[h].sawBandLimited(10) * amplitude;
      }
      
      this.subOsc.setFrequency(currentFreq * 0.5, this.sampleRate);
      const subSample = this.subOsc.sine() * 0.3;
      sample += this.subFilter.process(subSample);
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      
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
    this.subOsc.reset();
    this.vibratoLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.subFilter.clear();
  }
}

export class ViolaSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private vibratoLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private nasalFilter: BiquadFilter;
  private frequency: number = 293.7;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 9; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.09, 0.25, 0.87, 0.3, 44100);
    this.vibratoLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.nasalFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 9; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    
    this.lpFilter.setLowpass(3000 + this.velocity * 3500, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(120, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(350, 2, 4, context.sampleRate);
    this.nasalFilter.setPeaking(1200, 2.5, 3, context.sampleRate);
    
    this.envelope = new ADSR(0.07, 0.2, 0.85, 0.25, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.0035 * envValue;
      
      let sample = 0;
      const currentFreq = this.frequency * (1 + vibrato);
      
      for (let h = 0; h < 9; h++) {
        this.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
        const amplitude = Math.pow(0.78, h) / (h + 1);
        sample += this.oscillators[h].sawBandLimited(14) * amplitude * 0.75;
        sample += this.oscillators[h].sine() * amplitude * 0.25;
      }
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.nasalFilter.process(sample);
      
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.88);
      
      output.samples[0][i] = sample * 0.97;
      output.samples[1][i] = sample * 1.03;
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.vibratoLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.nasalFilter.clear();
  }
}

export class StringQuartetSynth implements SynthesizerEngine {
  private instruments: { oscillators: Oscillator[], envelope: ADSR, vibratoLFO: LFO, pan: number, octave: number }[] = [];
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private roomFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    const configs = [
      { pan: -0.5, octave: 0 },
      { pan: -0.15, octave: 0 },
      { pan: 0.15, octave: 0 },
      { pan: 0.5, octave: -1 },
    ];
    
    for (const config of configs) {
      const oscillators: Oscillator[] = [];
      for (let i = 0; i < 6; i++) {
        oscillators.push(new Oscillator());
      }
      this.instruments.push({
        oscillators,
        envelope: new ADSR(0.08, 0.2, 0.88, 0.25, 44100),
        vibratoLFO: new LFO(),
        pan: config.pan,
        octave: config.octave
      });
    }
    
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.roomFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.roomFilter.setPeaking(1500, 1, 2, context.sampleRate);
    
    const vibratoRates = [5.8, 5.6, 5.4, 5.0];
    this.instruments.forEach((inst, idx) => {
      const baseFreq = frequency * Math.pow(2, inst.octave);
      const detune = 1 + (idx - 1.5) * 0.002;
      inst.oscillators.forEach((osc, i) => {
        osc.setFrequency(baseFreq * detune * (i + 1), context.sampleRate);
      });
      inst.vibratoLFO.setFrequency(vibratoRates[idx], context.sampleRate);
      inst.envelope = new ADSR(0.06 + idx * 0.015, 0.18, 0.86, 0.22, context.sampleRate);
      inst.envelope.trigger();
    });
  }

  noteOff(context: DSPContext): void {
    this.instruments.forEach(inst => inst.envelope.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      let sampleL = 0;
      let sampleR = 0;
      
      for (const inst of this.instruments) {
        const envValue = inst.envelope.process();
        const vibrato = inst.vibratoLFO.sine() * 0.003 * envValue;
        
        let instSample = 0;
        const currentFreq = this.frequency * Math.pow(2, inst.octave) * (1 + vibrato);
        
        for (let h = 0; h < 6; h++) {
          inst.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
          const amplitude = Math.pow(0.75, h) / (h + 1);
          instSample += inst.oscillators[h].sawBandLimited(12) * amplitude;
        }
        
        instSample *= envValue;
        
        const panL = Math.cos((inst.pan + 1) * Math.PI * 0.25);
        const panR = Math.sin((inst.pan + 1) * Math.PI * 0.25);
        
        sampleL += instSample * panL;
        sampleR += instSample * panR;
      }
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.roomFilter.process(sampleL);
      sampleR = this.roomFilter.process(sampleR);
      
      sampleL *= this.velocity * 0.7;
      sampleR *= this.velocity * 0.7;
      
      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.instruments.some(inst => inst.envelope.isActive());
  }

  reset(): void {
    this.instruments.forEach(inst => {
      inst.oscillators.forEach(o => o.reset());
      inst.vibratoLFO.reset();
    });
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.roomFilter.clear();
  }
}

export class CinematicStringsSynth implements SynthesizerEngine {
  private layers: { oscillators: Oscillator[], envelope: ADSR, pan: number }[] = [];
  private vibratoLFO: LFO;
  private swellLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private airFilter: BiquadFilter;
  private reverbDelay: DelayLine;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let layer = 0; layer < 6; layer++) {
      const oscillators: Oscillator[] = [];
      for (let i = 0; i < 4; i++) {
        oscillators.push(new Oscillator());
      }
      this.layers.push({
        oscillators,
        envelope: new ADSR(0.3, 0.5, 0.9, 0.8, 44100),
        pan: (layer / 5 - 0.5) * 1.2
      });
    }
    
    this.vibratoLFO = new LFO();
    this.swellLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.airFilter = new BiquadFilter();
    this.reverbDelay = new DelayLine(22050);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    this.vibratoLFO.setFrequency(5.0, context.sampleRate);
    this.swellLFO.setFrequency(0.15, context.sampleRate);
    
    this.lpFilter.setLowpass(2500 + this.velocity * 5000, 0.6, context.sampleRate);
    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(600, 1.2, 4, context.sampleRate);
    this.airFilter.setHighShelf(8000, 3, context.sampleRate);
    
    const octaves = [0, 0, 0, -1, -1, -2];
    this.layers.forEach((layer, idx) => {
      const baseFreq = frequency * Math.pow(2, octaves[idx]);
      layer.oscillators.forEach((osc, i) => {
        const detune = 1 + (Math.random() - 0.5) * 0.006;
        osc.setFrequency(baseFreq * detune * (i + 1), context.sampleRate);
      });
      layer.envelope = new ADSR(0.25 + idx * 0.05, 0.4, 0.88, 0.6, context.sampleRate);
      layer.envelope.trigger();
    });
  }

  noteOff(context: DSPContext): void {
    this.layers.forEach(layer => layer.envelope.release());
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const vibrato = this.vibratoLFO.sine() * 0.002;
      const swell = 0.85 + this.swellLFO.sine() * 0.15;
      
      let sampleL = 0;
      let sampleR = 0;
      
      for (const layer of this.layers) {
        const envValue = layer.envelope.process();
        let layerSample = 0;
        
        for (const osc of layer.oscillators) {
          const currentFreq = this.frequency * (1 + vibrato + (Math.random() - 0.5) * 0.001);
          osc.setFrequency(currentFreq, this.sampleRate);
          layerSample += osc.sawBandLimited(10) * 0.25;
        }
        
        layerSample *= envValue;
        
        const panL = Math.cos((layer.pan + 1) * Math.PI * 0.25);
        const panR = Math.sin((layer.pan + 1) * Math.PI * 0.25);
        
        sampleL += layerSample * panL;
        sampleR += layerSample * panR;
      }
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.bodyFilter.process(sampleL);
      sampleR = this.bodyFilter.process(sampleR);
      sampleL = this.airFilter.process(sampleL);
      sampleR = this.airFilter.process(sampleR);
      
      this.reverbDelay.write((sampleL + sampleR) * 0.3);
      const reverbSample = this.reverbDelay.readInterpolated(msToSamples(80, this.sampleRate));
      
      sampleL = (sampleL + reverbSample * 0.2) * swell * this.velocity;
      sampleR = (sampleR + reverbSample * 0.2) * swell * this.velocity;
      
      output.samples[0][i] = softClip(sampleL, 0.92);
      output.samples[1][i] = softClip(sampleR, 0.92);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.layers.some(layer => layer.envelope.isActive());
  }

  reset(): void {
    this.layers.forEach(layer => {
      layer.oscillators.forEach(o => o.reset());
    });
    this.vibratoLFO.reset();
    this.swellLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.airFilter.clear();
    this.reverbDelay.clear();
  }
}

export class PizzicatoStringsSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private pluckEnvelope: ADSR;
  private bodyEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private pluckFilter: BiquadFilter;
  private stringModel: StringModel;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.pluckEnvelope = new ADSR(0.001, 0.05, 0.1, 0.08, 44100);
    this.bodyEnvelope = new ADSR(0.002, 0.15, 0.3, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
    this.pluckFilter = new BiquadFilter();
    this.stringModel = new StringModel(4410);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 6; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.stringModel.setFrequency(frequency, context.sampleRate, 0.4);
    this.stringModel.excite(this.velocity * 0.5);
    
    this.lpFilter.setLowpass(2000 + this.velocity * 4000, 0.8, context.sampleRate);
    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(400, 2, 4, context.sampleRate);
    this.pluckFilter.setPeaking(1500, 4, 6, context.sampleRate);
    
    this.pluckEnvelope = new ADSR(0.001, 0.04, 0.08, 0.06, context.sampleRate);
    this.bodyEnvelope = new ADSR(0.002, 0.12, 0.25, 0.15, context.sampleRate);
    this.pluckEnvelope.trigger();
    this.bodyEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.pluckEnvelope.release();
    this.bodyEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const pluckEnvValue = this.pluckEnvelope.process();
      const bodyEnvValue = this.bodyEnvelope.process();
      
      let sample = 0;
      
      for (let h = 0; h < 6; h++) {
        const amplitude = Math.pow(0.6, h) / (h + 1);
        sample += this.oscillators[h].sine() * amplitude;
      }
      
      const pluckNoise = (Math.random() * 2 - 1) * pluckEnvValue * 0.4;
      sample += pluckNoise;
      
      const stringSample = this.stringModel.process(pluckNoise * 0.3, this.frequency, this.sampleRate);
      sample = sample * 0.4 + stringSample * 0.6;
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      sample = this.pluckFilter.process(sample * pluckEnvValue + sample * (1 - pluckEnvValue) * 0.5);
      
      sample *= bodyEnvValue * this.velocity;
      sample = softClip(sample, 0.85);
      
      output.samples[0][i] = sample * 0.95;
      output.samples[1][i] = sample * 1.05;
    }
    
    return output;
  }

  isActive(): boolean {
    return this.bodyEnvelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.stringModel.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
    this.pluckFilter.clear();
  }
}

export class TremoloStringsSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private tremoloLFO: LFO;
  private vibratoLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private bodyFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.05, 0.2, 0.9, 0.3, 44100);
    this.tremoloLFO = new LFO();
    this.vibratoLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.bodyFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    for (let i = 0; i < 8; i++) {
      this.oscillators[i].setFrequency(frequency * (i + 1), context.sampleRate);
    }
    
    this.tremoloLFO.setFrequency(12, context.sampleRate);
    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    
    this.lpFilter.setLowpass(4000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(600, 1.5, 3, context.sampleRate);
    
    this.envelope = new ADSR(0.04, 0.15, 0.88, 0.25, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    
    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const tremolo = 0.6 + this.tremoloLFO.sine() * 0.4;
      const vibrato = this.vibratoLFO.sine() * 0.003 * envValue;
      
      let sample = 0;
      const currentFreq = this.frequency * (1 + vibrato);
      
      for (let h = 0; h < 8; h++) {
        this.oscillators[h].setFrequency(currentFreq * (h + 1), this.sampleRate);
        const amplitude = Math.pow(0.75, h) / (h + 1);
        sample += this.oscillators[h].sawBandLimited(14) * amplitude;
      }
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.bodyFilter.process(sample);
      
      sample *= envValue * tremolo * this.velocity;
      sample = softClip(sample, 0.88);
      
      const stereoTremolo = this.tremoloLFO.triangle() * 0.15;
      output.samples[0][i] = sample * (1 - stereoTremolo);
      output.samples[1][i] = sample * (1 + stereoTremolo);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.tremoloLFO.reset();
    this.vibratoLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.bodyFilter.clear();
  }
}

export class SynthStringsSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private chorusLFO: LFO;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private chorusDelay: DelayLine;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.2, 0.4, 0.85, 0.5, 44100);
    this.filterEnvelope = new ADSR(0.15, 0.3, 0.6, 0.4, 44100);
    this.chorusLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
    this.chorusDelay = new DelayLine(4410);
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    
    const detuneAmounts = [-0.02, -0.01, 0.01, 0.02];
    for (let i = 0; i < 4; i++) {
      this.oscillators[i].setFrequency(frequency * (1 + detuneAmounts[i] * 0.1), context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);
    
    this.chorusLFO.setFrequency(0.5, context.sampleRate);
    
    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.resonanceFilter.setPeaking(800, 3, 4, context.sampleRate);
    
    this.envelope = new ADSR(0.18, 0.35, 0.82, 0.45, context.sampleRate);
    this.filterEnvelope = new ADSR(0.12, 0.25, 0.55, 0.35, context.sampleRate);
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
      for (let o = 0; o < 4; o++) {
        sample += this.oscillators[o].sawBandLimited(16) * 0.2;
        sample += this.oscillators[o].pulse(0.5) * 0.05;
      }
      
      sample += this.subOsc.sine() * 0.15;
      
      const filterFreq = 800 + filterEnvValue * 3000 + this.velocity * 2000;
      this.lpFilter.setLowpass(filterFreq, 2 + filterEnvValue * 3, this.sampleRate);
      
      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.resonanceFilter.process(sample);
      
      this.chorusDelay.write(sample);
      const chorusMod = this.chorusLFO.sine() * 30 + 40;
      const chorusSample = this.chorusDelay.readInterpolated(chorusMod);
      
      sample = sample * 0.7 + chorusSample * 0.3;
      sample *= envValue * this.velocity;
      sample = softClip(sample, 0.9);
      
      const stereoWidth = this.chorusLFO.triangle() * 0.1;
      output.samples[0][i] = sample * (1 - stereoWidth);
      output.samples[1][i] = sample * (1 + stereoWidth);
    }
    
    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.subOsc.reset();
    this.chorusLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.resonanceFilter.clear();
    this.chorusDelay.clear();
  }
}

export const STRINGS_SYNTHESIZERS: Record<string, () => SynthesizerEngine> = {
  'orchestral-strings': () => new OrchestralStringsSynth(),
  'violin': () => new ViolinSynth(),
  'cello': () => new CelloSynth(),
  'contrabass': () => new ContrabassSynth(),
  'viola': () => new ViolaSynth(),
  'string-quartet': () => new StringQuartetSynth(),
  'cinematic-strings': () => new CinematicStringsSynth(),
  'pizzicato-strings': () => new PizzicatoStringsSynth(),
  'tremolo-strings': () => new TremoloStringsSynth(),
  'synth-strings': () => new SynthStringsSynth(),
};
