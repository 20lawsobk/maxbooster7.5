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

export class WarmPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo1: LFO;
  private lfo2: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.3, 0.5, 0.85, 0.8, 44100);
    this.filterEnvelope = new ADSR(0.4, 0.6, 0.6, 0.7, 44100);
    this.lpFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo1 = new LFO();
    this.lfo2 = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.08, -0.04, 0, 0, 0.04, 0.08];
    for (let i = 0; i < 6; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.lfo1.setFrequency(0.3, context.sampleRate);
    this.lfo2.setFrequency(0.15, context.sampleRate);

    this.warmthFilter.setLowShelf(300, 6, context.sampleRate);
    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.35, 0.5, 0.82, 0.75, context.sampleRate);
    this.filterEnvelope = new ADSR(0.4, 0.55, 0.55, 0.65, context.sampleRate);
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

      const lfo1Value = this.lfo1.sine();
      const lfo2Value = this.lfo2.triangle();

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const saw = this.oscillators[o].sawBandLimited(14);
        const pulse = this.oscillators[o].pulse(0.35 + lfo1Value * 0.15);
        const mixed = saw * 0.6 + pulse * 0.4;
        
        const pan = (o - 2.5) / 2.5;
        sampleL += mixed * (1 - pan * 0.4);
        sampleR += mixed * (1 + pan * 0.4);
      }

      const sub = this.subOsc.sine() * 0.25;
      sampleL += sub;
      sampleR += sub;

      sampleL /= 6;
      sampleR /= 6;

      const filterFreq = 400 + filterEnvValue * 1800 + lfo2Value * 200 + this.velocity * 1000;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 8000), 1.5, this.sampleRate);

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.warmthFilter.process(sampleL);
      sampleR = this.warmthFilter.process(sampleR);

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
    this.subOsc.reset();
    this.lfo1.reset();
    this.lfo2.reset();
    this.lpFilter.clear();
    this.warmthFilter.clear();
    this.hpFilter.clear();
  }
}

export class StringPadSynth implements SynthesizerEngine {
  private sections: { oscillators: Oscillator[], pan: number }[] = [];
  private envelope: ADSR;
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
    for (let s = 0; s < 4; s++) {
      const oscillators: Oscillator[] = [];
      for (let i = 0; i < 4; i++) {
        oscillators.push(new Oscillator());
      }
      this.sections.push({ oscillators, pan: (s - 1.5) / 1.5 });
    }
    this.envelope = new ADSR(0.4, 0.4, 0.9, 0.6, 44100);
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

    this.vibratoLFO.setFrequency(5.2, context.sampleRate);
    this.expressionLFO.setFrequency(0.2, context.sampleRate);

    this.sections.forEach((section, sIdx) => {
      const octaveOffset = sIdx === 3 ? 0.5 : 1;
      section.oscillators.forEach((osc, i) => {
        const detune = 1 + (Math.random() - 0.5) * 0.006;
        osc.setFrequency(frequency * octaveOffset * detune, context.sampleRate);
      });
    });

    this.lpFilter.setLowpass(3500 + this.velocity * 3000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);
    this.bodyFilter.setPeaking(600, 1.5, 3, context.sampleRate);
    this.airFilter.setHighShelf(5000, 2, context.sampleRate);

    this.envelope = new ADSR(0.35, 0.4, 0.88, 0.55, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.003;
      const expression = 0.9 + this.expressionLFO.sine() * 0.1;

      let sampleL = 0;
      let sampleR = 0;

      for (const section of this.sections) {
        let sectionSample = 0;
        for (const osc of section.oscillators) {
          const currentFreq = this.frequency * (1 + vibrato);
          osc.setFrequency(currentFreq * (1 + (Math.random() - 0.5) * 0.001), this.sampleRate);
          sectionSample += osc.sawBandLimited(12) * 0.4 + osc.sine() * 0.2;
        }
        sectionSample /= section.oscillators.length;

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

      sampleL *= envValue * expression * this.velocity;
      sampleR *= envValue * expression * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
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

export class ChoirPadSynth implements SynthesizerEngine {
  private formantOscs: Oscillator[] = [];
  private envelope: ADSR;
  private breathEnvelope: ADSR;
  private vibratoLFO: LFO;
  private formantLFO: LFO;
  private formantFilters: BiquadFilter[] = [];
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.formantOscs.push(new Oscillator());
    }
    for (let i = 0; i < 5; i++) {
      this.formantFilters.push(new BiquadFilter());
    }
    this.envelope = new ADSR(0.5, 0.4, 0.85, 0.7, 44100);
    this.breathEnvelope = new ADSR(0.3, 0.2, 0.3, 0.4, 44100);
    this.vibratoLFO = new LFO();
    this.formantLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 8; i++) {
      const detune = 1 + (i - 3.5) * 0.003;
      this.formantOscs[i].setFrequency(frequency * detune, context.sampleRate);
    }

    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    this.formantLFO.setFrequency(0.15, context.sampleRate);

    const formantFreqs = [800, 1200, 2500, 3500, 4500];
    const formantQs = [10, 8, 6, 5, 4];
    const formantGains = [6, 4, 2, 1, 0.5];
    for (let i = 0; i < 5; i++) {
      this.formantFilters[i].setPeaking(formantFreqs[i], formantQs[i], formantGains[i], context.sampleRate);
    }

    this.lpFilter.setLowpass(6000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.45, 0.35, 0.82, 0.65, context.sampleRate);
    this.breathEnvelope = new ADSR(0.25, 0.15, 0.25, 0.35, context.sampleRate);
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
      const breathValue = this.breathEnvelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.004 * envValue;
      const formantMod = this.formantLFO.sine() * 0.08;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 8; o++) {
        const currentFreq = this.frequency * (1 + vibrato);
        this.formantOscs[o].setFrequency(currentFreq * (1 + (o - 3.5) * 0.003), this.sampleRate);
        
        const saw = this.formantOscs[o].sawBandLimited(16);
        const pulse = this.formantOscs[o].pulse(0.3);
        let sample = saw * 0.5 + pulse * 0.3;

        const breath = (Math.random() * 2 - 1) * breathValue * 0.15;
        sample += breath;

        for (const filter of this.formantFilters) {
          sample = filter.process(sample);
        }

        const pan = (o - 3.5) / 4;
        sampleL += sample * (1 - pan * 0.3);
        sampleR += sample * (1 + pan * 0.3);
      }

      sampleL /= 8;
      sampleR /= 8;

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
    this.formantOscs.forEach(o => o.reset());
    this.formantFilters.forEach(f => f.clear());
    this.vibratoLFO.reset();
    this.formantLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class GlassPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private bellOscs: Oscillator[] = [];
  private envelope: ADSR;
  private shimmerEnvelope: ADSR;
  private shimmerLFO: LFO;
  private sparkleDelay: DelayLine;
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private shimmerFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    for (let i = 0; i < 4; i++) {
      this.bellOscs.push(new Oscillator());
    }
    this.envelope = new ADSR(0.2, 0.4, 0.8, 0.9, 44100);
    this.shimmerEnvelope = new ADSR(0.3, 0.5, 0.6, 0.8, 44100);
    this.shimmerLFO = new LFO();
    this.sparkleDelay = new DelayLine(4410);
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.shimmerFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 6; i++) {
      const detune = 1 + (i - 2.5) * 0.002;
      this.oscillators[i].setFrequency(frequency * detune, context.sampleRate);
    }

    const bellRatios = [2, 3.5, 5.19, 7.23];
    for (let i = 0; i < 4; i++) {
      this.bellOscs[i].setFrequency(frequency * bellRatios[i], context.sampleRate);
    }

    this.shimmerLFO.setFrequency(3.5, context.sampleRate);

    this.hpFilter.setHighpass(200, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(8000 + this.velocity * 4000, 0.7, context.sampleRate);
    this.shimmerFilter.setHighShelf(4000, 4, context.sampleRate);

    this.envelope = new ADSR(0.18, 0.35, 0.78, 0.85, context.sampleRate);
    this.shimmerEnvelope = new ADSR(0.25, 0.45, 0.55, 0.75, context.sampleRate);
    this.envelope.trigger();
    this.shimmerEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.shimmerEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const shimmerEnvValue = this.shimmerEnvelope.process();
      const shimmer = this.shimmerLFO.sine();

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const tri = this.oscillators[o].triangle();
        const sine = this.oscillators[o].sine();
        const mixed = tri * 0.5 + sine * 0.5;

        const pan = (o - 2.5) / 3;
        sampleL += mixed * (1 - pan * 0.4);
        sampleR += mixed * (1 + pan * 0.4);
      }

      let bellSample = 0;
      const bellAmps = [0.15, 0.1, 0.06, 0.03];
      for (let b = 0; b < 4; b++) {
        bellSample += this.bellOscs[b].sine() * bellAmps[b] * shimmerEnvValue;
      }

      sampleL = sampleL / 6 + bellSample;
      sampleR = sampleR / 6 + bellSample;

      this.sparkleDelay.write((sampleL + sampleR) * 0.5);
      const delayed = this.sparkleDelay.readInterpolated(1500 + shimmer * 200) * 0.2;
      sampleL += delayed;
      sampleR += delayed;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.shimmerFilter.process(sampleL);
      sampleR = this.shimmerFilter.process(sampleR);

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
    this.bellOscs.forEach(o => o.reset());
    this.shimmerLFO.reset();
    this.sparkleDelay.clear();
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.shimmerFilter.clear();
  }
}

export class DarkPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private noiseOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private darkFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private rumbleFilter: BiquadFilter;
  private lfo1: LFO;
  private lfo2: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 5; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.noiseOsc = new Oscillator();
    this.envelope = new ADSR(0.6, 0.5, 0.8, 1.0, 44100);
    this.filterEnvelope = new ADSR(0.8, 0.6, 0.4, 0.8, 44100);
    this.lpFilter = new BiquadFilter();
    this.darkFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.rumbleFilter = new BiquadFilter();
    this.lfo1 = new LFO();
    this.lfo2 = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.15, -0.08, 0, 0.08, 0.15];
    for (let i = 0; i < 5; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.25, context.sampleRate);

    this.lfo1.setFrequency(0.08, context.sampleRate);
    this.lfo2.setFrequency(0.2, context.sampleRate);

    this.lpFilter.setLowpass(800 + this.velocity * 500, 2, context.sampleRate);
    this.darkFilter.setLowShelf(200, 8, context.sampleRate);
    this.hpFilter.setHighpass(25, 0.7, context.sampleRate);
    this.rumbleFilter.setPeaking(60, 3, 6, context.sampleRate);

    this.envelope = new ADSR(0.55, 0.45, 0.78, 0.95, context.sampleRate);
    this.filterEnvelope = new ADSR(0.75, 0.55, 0.35, 0.75, context.sampleRate);
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

      const lfo1Value = this.lfo1.sine();
      const lfo2Value = this.lfo2.triangle();

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 5; o++) {
        const saw = this.oscillators[o].sawBandLimited(10);
        const square = this.oscillators[o].squareBandLimited(8);
        const mixed = saw * 0.7 + square * 0.3;

        const pan = (o - 2) / 2.5;
        sampleL += mixed * (1 - pan * 0.3);
        sampleR += mixed * (1 + pan * 0.3);
      }

      const sub = this.subOsc.sine() * 0.4;
      const noise = this.noiseOsc.noise() * 0.05 * envValue;

      sampleL = sampleL / 5 + sub + noise;
      sampleR = sampleR / 5 + sub + noise;

      const filterFreq = 300 + filterEnvValue * 600 + lfo2Value * 150;
      this.lpFilter.setLowpass(clamp(filterFreq, 80, 2000), 2.5 + lfo1Value * 0.5, this.sampleRate);

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.darkFilter.process(sampleL);
      sampleR = this.darkFilter.process(sampleR);
      sampleL = this.rumbleFilter.process(sampleL);
      sampleR = this.rumbleFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.92);
      output.samples[1][i] = softClip(sampleR, 0.92);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.subOsc.reset();
    this.noiseOsc.reset();
    this.lfo1.reset();
    this.lfo2.reset();
    this.lpFilter.clear();
    this.darkFilter.clear();
    this.hpFilter.clear();
    this.rumbleFilter.clear();
  }
}

export class EvolvingPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private morphLFO: LFO;
  private panLFO: LFO;
  private filterLFO: LFO;
  private pwmLFO: LFO;
  private lpFilter: BiquadFilter;
  private bpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private sampleCounter: number = 0;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.8, 0.6, 0.85, 1.2, 44100);
    this.filterEnvelope = new ADSR(1.0, 0.8, 0.5, 1.0, 44100);
    this.morphLFO = new LFO();
    this.panLFO = new LFO();
    this.filterLFO = new LFO();
    this.pwmLFO = new LFO();
    this.lpFilter = new BiquadFilter();
    this.bpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.sampleCounter = 0;

    const detuneAmounts = [-0.12, -0.08, -0.04, -0.01, 0.01, 0.04, 0.08, 0.12];
    for (let i = 0; i < 8; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }

    this.morphLFO.setFrequency(0.05, context.sampleRate);
    this.panLFO.setFrequency(0.12, context.sampleRate);
    this.filterLFO.setFrequency(0.08, context.sampleRate);
    this.pwmLFO.setFrequency(0.3, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.75, 0.55, 0.82, 1.1, context.sampleRate);
    this.filterEnvelope = new ADSR(0.95, 0.75, 0.45, 0.95, context.sampleRate);
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

      const morph = (this.morphLFO.sine() + 1) * 0.5;
      const pan = this.panLFO.sine();
      const filterMod = this.filterLFO.triangle();
      const pwm = 0.3 + this.pwmLFO.sine() * 0.2;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 8; o++) {
        const saw = this.oscillators[o].sawBandLimited(14);
        const pulse = this.oscillators[o].pulse(pwm);
        const triangle = this.oscillators[o].triangle();
        const sine = this.oscillators[o].sine();

        const mixed = saw * (1 - morph) * 0.4 + 
                      pulse * morph * 0.3 + 
                      triangle * (1 - morph) * 0.2 + 
                      sine * morph * 0.1;

        const oscPan = (o - 3.5) / 4 + pan * 0.2;
        sampleL += mixed * (1 - oscPan * 0.4);
        sampleR += mixed * (1 + oscPan * 0.4);
      }

      sampleL /= 8;
      sampleR /= 8;

      const filterFreq = 400 + filterEnvValue * 2500 + filterMod * 800 + this.velocity * 1500;
      const resonance = 1.5 + morph * 2;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 10000), resonance, this.sampleRate);
      this.bpFilter.setBandpass(filterFreq * 1.5, 2, this.sampleRate);

      const lpL = this.lpFilter.process(sampleL);
      const lpR = this.lpFilter.process(sampleR);
      const bpL = this.bpFilter.process(sampleL);
      const bpR = this.bpFilter.process(sampleR);

      sampleL = lpL * (1 - morph * 0.3) + bpL * morph * 0.3;
      sampleR = lpR * (1 - morph * 0.3) + bpR * morph * 0.3;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);

      this.sampleCounter++;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.morphLFO.reset();
    this.panLFO.reset();
    this.filterLFO.reset();
    this.pwmLFO.reset();
    this.lpFilter.clear();
    this.bpFilter.clear();
    this.hpFilter.clear();
    this.sampleCounter = 0;
  }
}

export class NoisePadSynth implements SynthesizerEngine {
  private noiseOscs: Oscillator[] = [];
  private toneOscs: Oscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilters: BiquadFilter[] = [];
  private bpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private modulationLFO: LFO;
  private sweepLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.noiseOscs.push(new Oscillator());
      this.lpFilters.push(new BiquadFilter());
    }
    for (let i = 0; i < 3; i++) {
      this.toneOscs.push(new Oscillator());
    }
    this.envelope = new ADSR(0.4, 0.5, 0.75, 0.8, 44100);
    this.filterEnvelope = new ADSR(0.5, 0.6, 0.5, 0.7, 44100);
    this.bpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.modulationLFO = new LFO();
    this.sweepLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const filterFreqs = [frequency * 0.5, frequency, frequency * 2, frequency * 4];
    for (let i = 0; i < 4; i++) {
      this.lpFilters[i].setBandpass(filterFreqs[i], 8, context.sampleRate);
    }

    for (let i = 0; i < 3; i++) {
      const detune = 1 + (i - 1) * 0.005;
      this.toneOscs[i].setFrequency(frequency * detune, context.sampleRate);
    }

    this.modulationLFO.setFrequency(0.25, context.sampleRate);
    this.sweepLFO.setFrequency(0.08, context.sampleRate);

    this.bpFilter.setBandpass(frequency, 4, context.sampleRate);
    this.hpFilter.setHighpass(80, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.35, 0.45, 0.72, 0.75, context.sampleRate);
    this.filterEnvelope = new ADSR(0.45, 0.55, 0.45, 0.65, context.sampleRate);
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

      const modulation = this.modulationLFO.sine();
      const sweep = this.sweepLFO.triangle();

      let noiseSampleL = 0;
      let noiseSampleR = 0;

      for (let n = 0; n < 4; n++) {
        const noise = this.noiseOscs[n].noise();
        const filterMod = 1 + sweep * 0.3 + filterEnvValue * 0.5;
        this.lpFilters[n].setBandpass(this.frequency * Math.pow(2, n - 1) * filterMod, 6 + modulation * 2, this.sampleRate);
        const filtered = this.lpFilters[n].process(noise);

        const pan = (n - 1.5) / 2;
        noiseSampleL += filtered * (1 - pan * 0.4) * 0.3;
        noiseSampleR += filtered * (1 + pan * 0.4) * 0.3;
      }

      let toneSample = 0;
      for (let t = 0; t < 3; t++) {
        const sine = this.toneOscs[t].sine();
        toneSample += sine * 0.15;
      }

      let sampleL = noiseSampleL + toneSample;
      let sampleR = noiseSampleR + toneSample;

      sampleL = this.bpFilter.process(sampleL);
      sampleR = this.bpFilter.process(sampleR);
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);

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
    this.noiseOscs.forEach(o => o.reset());
    this.toneOscs.forEach(o => o.reset());
    this.lpFilters.forEach(f => f.clear());
    this.bpFilter.clear();
    this.hpFilter.clear();
    this.modulationLFO.reset();
    this.sweepLFO.reset();
  }
}

export class BrassPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private brassFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private vibratoLFO: LFO;
  private growlLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.15, 0.3, 0.85, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.1, 0.25, 0.5, 0.3, 44100);
    this.lpFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
    this.brassFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.vibratoLFO = new LFO();
    this.growlLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.06, -0.03, 0, 0, 0.03, 0.06];
    for (let i = 0; i < 6; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }

    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    this.growlLFO.setFrequency(8, context.sampleRate);

    this.brassFilter.setPeaking(1500, 2, 4, context.sampleRate);
    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.12, 0.25, 0.82, 0.35, context.sampleRate);
    this.filterEnvelope = new ADSR(0.08, 0.2, 0.45, 0.25, context.sampleRate);
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

      const vibrato = this.vibratoLFO.sine() * 0.003 * envValue;
      const growl = this.growlLFO.sine() * 0.02 * this.velocity;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const currentFreq = this.frequency * (1 + vibrato);
        this.oscillators[o].setFrequency(currentFreq * (1 + (o - 2.5) * 0.002), this.sampleRate);

        const saw = this.oscillators[o].sawBandLimited(16);
        const square = this.oscillators[o].squareBandLimited(12);
        const mixed = saw * 0.6 + square * 0.4;

        const pan = (o - 2.5) / 3;
        sampleL += mixed * (1 - pan * 0.3);
        sampleR += mixed * (1 + pan * 0.3);
      }

      sampleL /= 6;
      sampleR /= 6;

      sampleL *= 1 + growl;
      sampleR *= 1 + growl;

      const filterFreq = 800 + filterEnvValue * 4000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 10000), 2 + filterEnvValue * 3, this.sampleRate);
      this.resonanceFilter.setPeaking(filterFreq * 0.8, 3, 5, this.sampleRate);

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.resonanceFilter.process(sampleL);
      sampleR = this.resonanceFilter.process(sampleR);
      sampleL = this.brassFilter.process(sampleL);
      sampleR = this.brassFilter.process(sampleR);

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
    this.vibratoLFO.reset();
    this.growlLFO.reset();
    this.lpFilter.clear();
    this.resonanceFilter.clear();
    this.brassFilter.clear();
    this.hpFilter.clear();
  }
}

export class DigitalPadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private notchFilter: BiquadFilter;
  private stereoLFO: LFO;
  private phaseLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.envelope = new ADSR(0.1, 0.2, 0.9, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.notchFilter = new BiquadFilter();
    this.stereoLFO = new LFO();
    this.phaseLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 4; i++) {
      const detune = 1 + (i - 1.5) * 0.001;
      this.oscillators[i].setFrequency(frequency * detune, context.sampleRate);
    }

    this.stereoLFO.setFrequency(0.5, context.sampleRate);
    this.phaseLFO.setFrequency(0.25, context.sampleRate);

    this.lpFilter.setLowpass(8000 + this.velocity * 6000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.notchFilter.setNotch(3000, 2, context.sampleRate);

    this.envelope = new ADSR(0.08, 0.18, 0.88, 0.45, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const stereoPan = this.stereoLFO.sine() * 0.3;
      const phaseMod = this.phaseLFO.sine() * 0.1;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 4; o++) {
        const triangle = this.oscillators[o].triangle();
        const sine = this.oscillators[o].sine();
        const mixed = triangle * 0.6 + sine * 0.4;

        const oscPan = (o - 1.5) / 2 + stereoPan;
        sampleL += mixed * (1 - oscPan * 0.4);
        sampleR += mixed * (1 + oscPan * 0.4);
      }

      sampleL /= 4;
      sampleR /= 4;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.notchFilter.process(sampleL);
      sampleR = this.notchFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.95);
      output.samples[1][i] = softClip(sampleR, 0.95);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.stereoLFO.reset();
    this.phaseLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.notchFilter.clear();
  }
}

export class SpacePadSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private envelope: ADSR;
  private reverbEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private shimmerFilter: BiquadFilter;
  private combFilters: CombFilter[] = [];
  private allpassFilters: AllPassFilter[] = [];
  private delayLines: DelayLine[] = [];
  private spaceLFO: LFO;
  private driftLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    for (let i = 0; i < 4; i++) {
      this.combFilters.push(new CombFilter(1000 + i * 300, 0.8, 0.3));
      this.allpassFilters.push(new AllPassFilter(200 + i * 100, 0.6));
      this.delayLines.push(new DelayLine(22050));
    }
    this.envelope = new ADSR(0.6, 0.5, 0.85, 1.5, 44100);
    this.reverbEnvelope = new ADSR(0.8, 0.6, 0.9, 2.0, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.shimmerFilter = new BiquadFilter();
    this.spaceLFO = new LFO();
    this.driftLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.1, -0.05, -0.02, 0.02, 0.05, 0.1];
    for (let i = 0; i < 6; i++) {
      const detunedFreq = frequency * (1 + detuneAmounts[i] * 0.01);
      this.oscillators[i].setFrequency(detunedFreq, context.sampleRate);
    }

    this.spaceLFO.setFrequency(0.05, context.sampleRate);
    this.driftLFO.setFrequency(0.02, context.sampleRate);

    this.lpFilter.setLowpass(4000 + this.velocity * 3000, 0.7, context.sampleRate);
    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.shimmerFilter.setHighShelf(3000, 3, context.sampleRate);

    this.envelope = new ADSR(0.55, 0.45, 0.82, 1.4, context.sampleRate);
    this.reverbEnvelope = new ADSR(0.75, 0.55, 0.88, 1.9, context.sampleRate);
    this.envelope.trigger();
    this.reverbEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.reverbEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const reverbEnvValue = this.reverbEnvelope.process();

      const spaceMod = this.spaceLFO.sine();
      const drift = this.driftLFO.triangle();

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const saw = this.oscillators[o].sawBandLimited(12);
        const triangle = this.oscillators[o].triangle();
        const sine = this.oscillators[o].sine();
        const mixed = saw * 0.3 + triangle * 0.4 + sine * 0.3;

        const pan = (o - 2.5) / 3 + drift * 0.2;
        sampleL += mixed * (1 - pan * 0.5);
        sampleR += mixed * (1 + pan * 0.5);
      }

      sampleL /= 6;
      sampleR /= 6;

      let reverbL = 0;
      let reverbR = 0;
      const delayTimes = [8000, 12000, 16000, 20000];
      
      for (let c = 0; c < 4; c++) {
        const combOut = this.combFilters[c].process((sampleL + sampleR) * 0.25);
        const allpassOut = this.allpassFilters[c].process(combOut);
        
        this.delayLines[c].write(allpassOut);
        const delayMod = 1 + spaceMod * 0.05;
        const delayed = this.delayLines[c].readInterpolated(delayTimes[c] * delayMod);
        
        if (c % 2 === 0) {
          reverbL += delayed * 0.3;
        } else {
          reverbR += delayed * 0.3;
        }
      }

      sampleL = sampleL * 0.6 + reverbL * reverbEnvValue * 0.4;
      sampleR = sampleR * 0.6 + reverbR * reverbEnvValue * 0.4;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.shimmerFilter.process(sampleL);
      sampleR = this.shimmerFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.88);
      output.samples[1][i] = softClip(sampleR, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive() || this.reverbEnvelope.isActive();
  }

  reset(): void {
    this.oscillators.forEach(o => o.reset());
    this.combFilters.forEach(c => c.clear());
    this.allpassFilters.forEach(a => a.clear());
    this.delayLines.forEach(d => d.clear());
    this.spaceLFO.reset();
    this.driftLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.shimmerFilter.clear();
  }
}

export const PADS_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  'warm-pad': WarmPadSynth,
  'string-pad': StringPadSynth,
  'choir-pad': ChoirPadSynth,
  'glass-pad': GlassPadSynth,
  'dark-pad': DarkPadSynth,
  'evolving-pad': EvolvingPadSynth,
  'noise-pad': NoisePadSynth,
  'brass-pad': BrassPadSynth,
  'digital-pad': DigitalPadSynth,
  'space-pad': SpacePadSynth,
};
