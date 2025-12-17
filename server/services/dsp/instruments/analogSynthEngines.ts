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

export class MinimoogSynth implements SynthesizerEngine {
  private osc1: Oscillator;
  private osc2: Oscillator;
  private osc3: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private ladderFilter: BiquadFilter;
  private lpFilter2: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private filterCutoff: number = 1000;
  private filterResonance: number = 3;

  constructor() {
    this.osc1 = new Oscillator();
    this.osc2 = new Oscillator();
    this.osc3 = new Oscillator();
    this.envelope = new ADSR(0.001, 0.2, 0.7, 0.3, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.15, 0.4, 0.25, 44100);
    this.ladderFilter = new BiquadFilter();
    this.lpFilter2 = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 0.998, context.sampleRate);
    this.osc3.setFrequency(frequency * 0.5, context.sampleRate);

    this.lfo.setFrequency(5.5, context.sampleRate);

    this.filterCutoff = 400 + this.velocity * 2000;
    this.filterResonance = 3 + this.velocity * 4;

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.18, 0.68, 0.28, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.12, 0.35, 0.22, context.sampleRate);
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
      const lfoValue = this.lfo.sine();

      const osc1Out = this.osc1.sawBandLimited(16) * 0.4;
      const osc2Out = this.osc2.squareBandLimited(12) * 0.35;
      const osc3Out = this.osc3.sine() * 0.25;

      let sample = osc1Out + osc2Out + osc3Out;

      const filterFreq = this.filterCutoff + filterEnvValue * 3000 + lfoValue * 100;
      this.ladderFilter.setLowpass(clamp(filterFreq, 50, 12000), this.filterResonance, this.sampleRate);
      this.lpFilter2.setLowpass(clamp(filterFreq * 1.1, 50, 14000), this.filterResonance * 0.8, this.sampleRate);

      sample = this.ladderFilter.process(sample);
      sample = this.lpFilter2.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.3, 0.92);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.osc3.reset();
    this.lfo.reset();
    this.ladderFilter.clear();
    this.lpFilter2.clear();
    this.hpFilter.clear();
  }
}

export class ProphetSynth implements SynthesizerEngine {
  private oscillators: { osc1: Oscillator, osc2: Oscillator }[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private polyModLFO: LFO;
  private pwmLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private voiceCount: number = 5;

  constructor() {
    for (let i = 0; i < this.voiceCount; i++) {
      this.oscillators.push({
        osc1: new Oscillator(),
        osc2: new Oscillator()
      });
    }
    this.envelope = new ADSR(0.01, 0.3, 0.75, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.01, 0.25, 0.5, 0.35, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.polyModLFO = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.05, -0.02, 0, 0.02, 0.05];
    for (let i = 0; i < this.voiceCount; i++) {
      const detune = 1 + detuneAmounts[i] * 0.01;
      this.oscillators[i].osc1.setFrequency(frequency * detune, context.sampleRate);
      this.oscillators[i].osc2.setFrequency(frequency * detune * 1.002, context.sampleRate);
    }

    this.polyModLFO.setFrequency(0.3, context.sampleRate);
    this.pwmLFO.setFrequency(0.8, context.sampleRate);

    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.28, 0.72, 0.38, context.sampleRate);
    this.filterEnvelope = new ADSR(0.008, 0.22, 0.45, 0.32, context.sampleRate);
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
      const polyMod = this.polyModLFO.sine();
      const pwm = 0.35 + this.pwmLFO.sine() * 0.15;

      let sampleL = 0;
      let sampleR = 0;

      for (let v = 0; v < this.voiceCount; v++) {
        const saw1 = this.oscillators[v].osc1.sawBandLimited(14);
        const pulse2 = this.oscillators[v].osc2.pulse(pwm);

        const voiceSample = saw1 * 0.5 + pulse2 * 0.5;
        const pan = (v - 2) / 2.5;

        sampleL += voiceSample * (1 - pan * 0.4);
        sampleR += voiceSample * (1 + pan * 0.4);
      }

      sampleL /= this.voiceCount;
      sampleR /= this.voiceCount;

      const filterFreq = 600 + filterEnvValue * 3500 + polyMod * 300 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 12000), 2 + filterEnvValue * 2, this.sampleRate);

      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);

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
    this.oscillators.forEach(v => {
      v.osc1.reset();
      v.osc2.reset();
    });
    this.polyModLFO.reset();
    this.pwmLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class JupiterSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private chorusDelay1: DelayLine;
  private chorusDelay2: DelayLine;
  private chorusLFO1: LFO;
  private chorusLFO2: LFO;
  private pwmLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.02, 0.4, 0.8, 0.5, 44100);
    this.filterEnvelope = new ADSR(0.03, 0.35, 0.55, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.chorusDelay1 = new DelayLine(2205);
    this.chorusDelay2 = new DelayLine(2205);
    this.chorusLFO1 = new LFO();
    this.chorusLFO2 = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.08, -0.04, -0.01, 0.01, 0.04, 0.08];
    for (let i = 0; i < 6; i++) {
      const detune = 1 + detuneAmounts[i] * 0.01;
      this.oscillators[i].setFrequency(frequency * detune, context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.chorusLFO1.setFrequency(0.5, context.sampleRate);
    this.chorusLFO2.setFrequency(0.7, context.sampleRate);
    this.pwmLFO.setFrequency(0.4, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.38, 0.78, 0.48, context.sampleRate);
    this.filterEnvelope = new ADSR(0.025, 0.32, 0.52, 0.38, context.sampleRate);
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
      const chorus1 = this.chorusLFO1.sine();
      const chorus2 = this.chorusLFO2.sine();
      const pwm = 0.4 + this.pwmLFO.sine() * 0.1;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const saw = this.oscillators[o].sawBandLimited(14);
        const pulse = this.oscillators[o].pulse(pwm);
        const mixed = saw * 0.55 + pulse * 0.45;

        const pan = (o - 2.5) / 3;
        sampleL += mixed * (1 - pan * 0.4);
        sampleR += mixed * (1 + pan * 0.4);
      }

      const sub = this.subOsc.pulse(0.5) * 0.2;
      sampleL += sub;
      sampleR += sub;

      sampleL /= 6;
      sampleR /= 6;

      const filterFreq = 500 + filterEnvValue * 4000 + this.velocity * 2500;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 14000), 2 + filterEnvValue * 2.5, this.sampleRate);

      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);

      this.chorusDelay1.write(sampleL);
      this.chorusDelay2.write(sampleR);
      const delayTime1 = 400 + chorus1 * 150;
      const delayTime2 = 450 + chorus2 * 150;
      const chorusL = this.chorusDelay1.readInterpolated(delayTime1) * 0.3;
      const chorusR = this.chorusDelay2.readInterpolated(delayTime2) * 0.3;

      sampleL = sampleL * 0.7 + chorusL + chorusR * 0.2;
      sampleR = sampleR * 0.7 + chorusR + chorusL * 0.2;

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
    this.subOsc.reset();
    this.chorusLFO1.reset();
    this.chorusLFO2.reset();
    this.pwmLFO.reset();
    this.chorusDelay1.clear();
    this.chorusDelay2.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class OberheimSynth implements SynthesizerEngine {
  private osc1: Oscillator;
  private osc2: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private stateVariableLP: BiquadFilter;
  private stateVariableBP: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.osc1 = new Oscillator();
    this.osc2 = new Oscillator();
    this.envelope = new ADSR(0.01, 0.25, 0.8, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.02, 0.2, 0.5, 0.35, 44100);
    this.lpFilter = new BiquadFilter();
    this.stateVariableLP = new BiquadFilter();
    this.stateVariableBP = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 1.003, context.sampleRate);

    this.lfo.setFrequency(5.0, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.22, 0.78, 0.38, context.sampleRate);
    this.filterEnvelope = new ADSR(0.015, 0.18, 0.48, 0.32, context.sampleRate);
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
      const lfoValue = this.lfo.sine();

      const saw1 = this.osc1.sawBandLimited(16);
      const saw2 = this.osc2.sawBandLimited(16);
      const pulse1 = this.osc1.pulse(0.35);

      let sample = saw1 * 0.4 + saw2 * 0.3 + pulse1 * 0.3;

      const filterFreq = 700 + filterEnvValue * 4500 + lfoValue * 150 + this.velocity * 2000;
      const resonance = 3 + filterEnvValue * 3;

      this.stateVariableLP.setLowpass(clamp(filterFreq, 100, 12000), resonance, this.sampleRate);
      this.stateVariableBP.setBandpass(clamp(filterFreq, 100, 12000), resonance * 0.7, this.sampleRate);

      const lpOut = this.stateVariableLP.process(sample);
      const bpOut = this.stateVariableBP.process(sample);
      sample = lpOut * 0.7 + bpOut * 0.3;

      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.2, 0.9);

      output.samples[0][i] = sample * 0.98;
      output.samples[1][i] = sample * 1.02;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.lfo.reset();
    this.lpFilter.clear();
    this.stateVariableLP.clear();
    this.stateVariableBP.clear();
    this.hpFilter.clear();
  }
}

export class ARP2600Synth implements SynthesizerEngine {
  private vco1: Oscillator;
  private vco2: Oscillator;
  private vco3: Oscillator;
  private noiseOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private vcf: BiquadFilter;
  private vcf2: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private sampleAndHold: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private ringModDepth: number = 0.3;

  constructor() {
    this.vco1 = new Oscillator();
    this.vco2 = new Oscillator();
    this.vco3 = new Oscillator();
    this.noiseOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.15, 0.7, 0.25, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.12, 0.5, 0.2, 44100);
    this.vcf = new BiquadFilter();
    this.vcf2 = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
    this.sampleAndHold = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.vco1.setFrequency(frequency, context.sampleRate);
    this.vco2.setFrequency(frequency * 2.01, context.sampleRate);
    this.vco3.setFrequency(frequency * 0.5, context.sampleRate);

    this.lfo.setFrequency(6.0, context.sampleRate);
    this.sampleAndHold.setFrequency(4.0, context.sampleRate);

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);
    this.ringModDepth = 0.2 + this.velocity * 0.3;

    this.envelope = new ADSR(0.001, 0.12, 0.68, 0.22, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.1, 0.45, 0.18, context.sampleRate);
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
      const lfoValue = this.lfo.sine();
      const shValue = this.sampleAndHold.square();

      const vco1Out = this.vco1.sawBandLimited(16);
      const vco2Out = this.vco2.pulse(0.3 + lfoValue * 0.1);
      const vco3Out = this.vco3.squareBandLimited(10);
      const noise = this.noiseOsc.noise() * 0.1;

      const ringMod = vco1Out * vco2Out * this.ringModDepth;

      let sample = vco1Out * 0.35 + vco2Out * 0.25 + vco3Out * 0.2 + ringMod + noise;

      const filterFreq = 300 + filterEnvValue * 4000 + shValue * 500 + this.velocity * 2000;
      this.vcf.setLowpass(clamp(filterFreq, 50, 14000), 4 + filterEnvValue * 4, this.sampleRate);
      this.vcf2.setLowpass(clamp(filterFreq * 1.2, 50, 16000), 2, this.sampleRate);

      sample = this.vcf.process(sample);
      sample = this.vcf2.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.4, 0.9);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.vco1.reset();
    this.vco2.reset();
    this.vco3.reset();
    this.noiseOsc.reset();
    this.lfo.reset();
    this.sampleAndHold.reset();
    this.vcf.clear();
    this.vcf2.clear();
    this.hpFilter.clear();
  }
}

export class SH101Synth implements SynthesizerEngine {
  private osc: Oscillator;
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private pwmLFO: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.osc = new Oscillator();
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.001, 0.1, 0.8, 0.2, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.08, 0.4, 0.15, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc.setFrequency(frequency, context.sampleRate);
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.lfo.setFrequency(5.5, context.sampleRate);
    this.pwmLFO.setFrequency(0.6, context.sampleRate);

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.08, 0.78, 0.18, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.06, 0.38, 0.12, context.sampleRate);
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
      const lfoValue = this.lfo.sine();
      const pwm = 0.35 + this.pwmLFO.sine() * 0.15;

      const saw = this.osc.sawBandLimited(18);
      const pulse = this.osc.pulse(pwm);
      const sub = this.subOsc.pulse(0.5);

      let sample = saw * 0.4 + pulse * 0.35 + sub * 0.25;

      const filterFreq = 500 + filterEnvValue * 5000 + lfoValue * 200 + this.velocity * 2500;
      this.lpFilter.setLowpass(clamp(filterFreq, 80, 14000), 3 + filterEnvValue * 4, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.3, 0.92);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc.reset();
    this.subOsc.reset();
    this.lfo.reset();
    this.pwmLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class JunoSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private chorusDelay1: DelayLine;
  private chorusDelay2: DelayLine;
  private chorusLFO: LFO;
  private pwmLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.01, 0.3, 0.8, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.015, 0.25, 0.5, 0.35, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.chorusDelay1 = new DelayLine(2205);
    this.chorusDelay2 = new DelayLine(2205);
    this.chorusLFO = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.04, -0.01, 0.01, 0.04];
    for (let i = 0; i < 4; i++) {
      const detune = 1 + detuneAmounts[i] * 0.01;
      this.oscillators[i].setFrequency(frequency * detune, context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.chorusLFO.setFrequency(0.5, context.sampleRate);
    this.pwmLFO.setFrequency(0.35, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.008, 0.28, 0.78, 0.38, context.sampleRate);
    this.filterEnvelope = new ADSR(0.012, 0.22, 0.48, 0.32, context.sampleRate);
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
      const pwm = 0.4 + this.pwmLFO.sine() * 0.1;

      let sample = 0;

      for (let o = 0; o < 4; o++) {
        const saw = this.oscillators[o].sawBandLimited(14);
        const pulse = this.oscillators[o].pulse(pwm);
        sample += (saw * 0.5 + pulse * 0.5) / 4;
      }

      const sub = this.subOsc.pulse(0.5) * 0.2;
      sample += sub;

      const filterFreq = 600 + filterEnvValue * 4000 + this.velocity * 2500;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 12000), 2 + filterEnvValue * 2, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);

      this.chorusDelay1.write(sample);
      this.chorusDelay2.write(sample);
      const delayTime1 = 300 + chorusMod * 180;
      const delayTime2 = 350 - chorusMod * 180;
      const chorus1 = this.chorusDelay1.readInterpolated(delayTime1) * 0.4;
      const chorus2 = this.chorusDelay2.readInterpolated(delayTime2) * 0.4;

      const sampleL = sample * 0.6 + chorus1;
      const sampleR = sample * 0.6 + chorus2;

      output.samples[0][i] = softClip(sampleL * envValue * this.velocity, 0.88);
      output.samples[1][i] = softClip(sampleR * envValue * this.velocity, 0.88);
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
    this.pwmLFO.reset();
    this.chorusDelay1.clear();
    this.chorusDelay2.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class MS20Synth implements SynthesizerEngine {
  private osc1: Oscillator;
  private osc2: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private lfo: LFO;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private filterDrive: number = 1.5;

  constructor() {
    this.osc1 = new Oscillator();
    this.osc2 = new Oscillator();
    this.envelope = new ADSR(0.001, 0.12, 0.75, 0.2, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.1, 0.5, 0.15, 44100);
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.resonanceFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 1.01, context.sampleRate);

    this.lfo.setFrequency(4.5, context.sampleRate);

    this.hpFilter.setHighpass(200 + this.velocity * 300, 4, context.sampleRate);
    this.filterDrive = 1.3 + this.velocity * 0.7;

    this.envelope = new ADSR(0.001, 0.1, 0.72, 0.18, context.sampleRate);
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
      const lfoValue = this.lfo.sine();

      const saw1 = this.osc1.sawBandLimited(18);
      const ring = saw1 * this.osc2.pulse(0.25);
      const noise = this.osc1.noise() * 0.05;

      let sample = saw1 * 0.5 + ring * 0.35 + noise;

      sample *= this.filterDrive;
      sample = Math.tanh(sample);

      const hpFreq = 100 + filterEnvValue * 800 + lfoValue * 100;
      const lpFreq = 400 + filterEnvValue * 5000 + this.velocity * 3000;
      
      this.hpFilter.setHighpass(clamp(hpFreq, 30, 2000), 6 + filterEnvValue * 6, this.sampleRate);
      this.lpFilter.setLowpass(clamp(lpFreq, 100, 14000), 5 + filterEnvValue * 5, this.sampleRate);
      this.resonanceFilter.setPeaking(lpFreq * 0.9, 4, 8, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample = this.resonanceFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = hardClip(sample * 1.5, 0.95);

      output.samples[0][i] = sample;
      output.samples[1][i] = sample;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.lfo.reset();
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.resonanceFilter.clear();
  }
}

export class OdysseySynth implements SynthesizerEngine {
  private osc1: Oscillator;
  private osc2: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lfo: LFO;
  private sampleAndHold: number = 0;
  private shCounter: number = 0;
  private frequency: number = 220;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private syncEnabled: boolean = true;

  constructor() {
    this.osc1 = new Oscillator();
    this.osc2 = new Oscillator();
    this.envelope = new ADSR(0.001, 0.15, 0.75, 0.25, 44100);
    this.filterEnvelope = new ADSR(0.001, 0.12, 0.5, 0.2, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lfo = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    this.osc1.setFrequency(frequency, context.sampleRate);
    this.osc2.setFrequency(frequency * 1.5, context.sampleRate);

    this.lfo.setFrequency(5.0, context.sampleRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.12, 0.72, 0.22, context.sampleRate);
    this.filterEnvelope = new ADSR(0.001, 0.1, 0.48, 0.18, context.sampleRate);
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
      const lfoValue = this.lfo.sine();

      this.shCounter++;
      if (this.shCounter >= this.sampleRate / 10) {
        this.sampleAndHold = Math.random() * 2 - 1;
        this.shCounter = 0;
      }

      const saw1 = this.osc1.sawBandLimited(16);
      const saw2 = this.osc2.sawBandLimited(14);
      const pulse1 = this.osc1.pulse(0.4 + lfoValue * 0.1);
      const pulse2 = this.osc2.pulse(0.3);

      let sample = saw1 * 0.3 + saw2 * 0.25 + pulse1 * 0.25 + pulse2 * 0.2;

      const ringMod = saw1 * saw2 * 0.15;
      sample += ringMod;

      const filterFreq = 500 + filterEnvValue * 4500 + this.sampleAndHold * 300 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 80, 14000), 3 + filterEnvValue * 4, this.sampleRate);

      sample = this.lpFilter.process(sample);
      sample = this.hpFilter.process(sample);

      sample *= envValue * this.velocity;
      sample = softClip(sample * 1.3, 0.9);

      output.samples[0][i] = sample * 0.98;
      output.samples[1][i] = sample * 1.02;
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.osc1.reset();
    this.osc2.reset();
    this.lfo.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.sampleAndHold = 0;
    this.shCounter = 0;
  }
}

export class PolysixSynth implements SynthesizerEngine {
  private oscillators: Oscillator[] = [];
  private subOsc: Oscillator;
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private chorusDelay1: DelayLine;
  private chorusDelay2: DelayLine;
  private chorusDelay3: DelayLine;
  private chorusLFO: LFO;
  private pwmLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.oscillators.push(new Oscillator());
    }
    this.subOsc = new Oscillator();
    this.envelope = new ADSR(0.02, 0.35, 0.8, 0.5, 44100);
    this.filterEnvelope = new ADSR(0.03, 0.3, 0.5, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.chorusDelay1 = new DelayLine(2205);
    this.chorusDelay2 = new DelayLine(2205);
    this.chorusDelay3 = new DelayLine(2205);
    this.chorusLFO = new LFO();
    this.pwmLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const detuneAmounts = [-0.06, -0.03, -0.01, 0.01, 0.03, 0.06];
    for (let i = 0; i < 6; i++) {
      const detune = 1 + detuneAmounts[i] * 0.01;
      this.oscillators[i].setFrequency(frequency * detune, context.sampleRate);
    }
    this.subOsc.setFrequency(frequency * 0.5, context.sampleRate);

    this.chorusLFO.setFrequency(0.4, context.sampleRate);
    this.pwmLFO.setFrequency(0.3, context.sampleRate);

    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.32, 0.78, 0.48, context.sampleRate);
    this.filterEnvelope = new ADSR(0.025, 0.28, 0.48, 0.38, context.sampleRate);
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
      const pwm = 0.45 + this.pwmLFO.sine() * 0.1;

      let sampleL = 0;
      let sampleR = 0;

      for (let o = 0; o < 6; o++) {
        const saw = this.oscillators[o].sawBandLimited(12);
        const pulse = this.oscillators[o].pulse(pwm);
        const mixed = saw * 0.6 + pulse * 0.4;

        const pan = (o - 2.5) / 3;
        sampleL += mixed * (1 - pan * 0.35);
        sampleR += mixed * (1 + pan * 0.35);
      }

      const sub = this.subOsc.pulse(0.5) * 0.15;
      sampleL += sub;
      sampleR += sub;

      sampleL /= 6;
      sampleR /= 6;

      const filterFreq = 600 + filterEnvValue * 3500 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 100, 10000), 1.5 + filterEnvValue * 2, this.sampleRate);

      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);

      this.chorusDelay1.write((sampleL + sampleR) * 0.5);
      this.chorusDelay2.write(sampleL);
      this.chorusDelay3.write(sampleR);

      const delayTime1 = 250 + chorusMod * 100;
      const delayTime2 = 350 + chorusMod * 120;
      const delayTime3 = 300 - chorusMod * 110;

      const chorus1 = this.chorusDelay1.readInterpolated(delayTime1) * 0.25;
      const chorus2 = this.chorusDelay2.readInterpolated(delayTime2) * 0.2;
      const chorus3 = this.chorusDelay3.readInterpolated(delayTime3) * 0.2;

      sampleL = sampleL * 0.6 + chorus1 + chorus2;
      sampleR = sampleR * 0.6 + chorus1 + chorus3;

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
    this.subOsc.reset();
    this.chorusLFO.reset();
    this.pwmLFO.reset();
    this.chorusDelay1.clear();
    this.chorusDelay2.clear();
    this.chorusDelay3.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export const ANALOG_SYNTH_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  'minimoog': MinimoogSynth,
  'prophet': ProphetSynth,
  'jupiter': JupiterSynth,
  'oberheim': OberheimSynth,
  'arp-2600': ARP2600Synth,
  'sh-101': SH101Synth,
  'juno': JunoSynth,
  'ms-20': MS20Synth,
  'odyssey': OdysseySynth,
  'polysix': PolysixSynth,
};
