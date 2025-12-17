import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, CombFilter,
  EnvelopeFollower, LFO,
  msToSamples, dbToLinear, linearToDb, clamp, softClip
} from './core';

export class U87ModelerProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lowShelf: BiquadFilter;
  private presencePeak: BiquadFilter;
  private airBand: BiquadFilter;
  private proximityFilter: BiquadFilter;
  private transientEnvelope: EnvelopeFollower;
  private bodyResonance: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lowShelf = new BiquadFilter();
    this.presencePeak = new BiquadFilter();
    this.airBand = new BiquadFilter();
    this.proximityFilter = new BiquadFilter();
    this.transientEnvelope = new EnvelopeFollower(0.5, 50, 44100);
    this.bodyResonance = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const proximity = (params.proximity as number) ?? 50;
    const presence = (params.presence as number) ?? 3;
    const air = (params.air as number) ?? 2;
    const warmth = (params.warmth as number) ?? 2;
    const transientResponse = (params.transient as number) ?? 70;
    const hpFreq = (params.hpFreq as number) ?? 40;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    this.hpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    this.lowShelf.setLowShelf(120, warmth, this.sampleRate);
    this.presencePeak.setPeaking(4500, 1.2, presence, this.sampleRate);
    this.airBand.setHighShelf(12000, air, this.sampleRate);
    
    const proximityBoost = (proximity / 100) * 6;
    this.proximityFilter.setLowShelf(200, proximityBoost, this.sampleRate);
    this.bodyResonance.setPeaking(240, 2.5, warmth * 0.5, this.sampleRate);
    
    const transientFactor = transientResponse / 100;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      sampleL = this.proximityFilter.process(sampleL);
      sampleR = this.proximityFilter.process(sampleR);
      
      sampleL = this.bodyResonance.process(sampleL);
      sampleR = this.bodyResonance.process(sampleR);
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      
      sampleL = this.presencePeak.process(sampleL);
      sampleR = this.presencePeak.process(sampleR);
      
      sampleL = this.airBand.process(sampleL);
      sampleR = this.airBand.process(sampleR);
      
      const envelope = this.transientEnvelope.process((sampleL + sampleR) * 0.5);
      const transientGain = 1 + (envelope * transientFactor * 0.5);
      
      sampleL *= transientGain;
      sampleR *= transientGain;
      
      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lowShelf.clear();
    this.presencePeak.clear();
    this.airBand.clear();
    this.proximityFilter.clear();
    this.transientEnvelope.clear();
    this.bodyResonance.clear();
  }
}

export class C414ModelerProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private presencePeak: BiquadFilter;
  private brilliance: BiquadFilter;
  private lowMidCut: BiquadFilter;
  private highShelf: BiquadFilter;
  private patternFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.presencePeak = new BiquadFilter();
    this.brilliance = new BiquadFilter();
    this.lowMidCut = new BiquadFilter();
    this.highShelf = new BiquadFilter();
    this.patternFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const pattern = (params.pattern as string) ?? 'cardioid';
    const presence = (params.presence as number) ?? 3;
    const brilliance = (params.brilliance as number) ?? 2;
    const bass = (params.bass as number) ?? 0;
    const pad = (params.pad as number) ?? 0;
    const hpEnabled = (params.hpEnabled as boolean) ?? false;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    if (hpEnabled) {
      this.hpFilter.setHighpass(80, 0.707, this.sampleRate);
    }
    
    this.presencePeak.setPeaking(3500, 1.5, presence, this.sampleRate);
    this.brilliance.setPeaking(8000, 1.2, brilliance, this.sampleRate);
    this.highShelf.setHighShelf(10000, brilliance * 0.5, this.sampleRate);
    
    let lowFreqMod = 0;
    let highFreqMod = 0;
    
    switch (pattern) {
      case 'figure8':
        lowFreqMod = 3;
        highFreqMod = -1;
        break;
      case 'omni':
        lowFreqMod = 2;
        highFreqMod = 1;
        break;
      case 'hypercardioid':
        lowFreqMod = -2;
        highFreqMod = 2;
        break;
      case 'cardioid':
      default:
        lowFreqMod = 0;
        highFreqMod = 0;
    }
    
    this.patternFilter.setLowShelf(150, bass + lowFreqMod, this.sampleRate);
    this.lowMidCut.setPeaking(400, 1.5, -2, this.sampleRate);
    
    const padLin = dbToLinear(-pad);
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i] * padLin;
      let sampleR = input.samples[1][i] * padLin;
      
      if (hpEnabled) {
        sampleL = this.hpFilter.process(sampleL);
        sampleR = this.hpFilter.process(sampleR);
      }
      
      sampleL = this.patternFilter.process(sampleL);
      sampleR = this.patternFilter.process(sampleR);
      
      sampleL = this.lowMidCut.process(sampleL);
      sampleR = this.lowMidCut.process(sampleR);
      
      sampleL = this.presencePeak.process(sampleL);
      sampleR = this.presencePeak.process(sampleR);
      
      sampleL = this.brilliance.process(sampleL);
      sampleR = this.brilliance.process(sampleR);
      
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      
      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.presencePeak.clear();
    this.brilliance.clear();
    this.lowMidCut.clear();
    this.highShelf.clear();
    this.patternFilter.clear();
  }
}

export class SM7BModelerProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private bassRolloff: BiquadFilter;
  private lowMidBody: BiquadFilter;
  private midPresence: BiquadFilter;
  private presenceSwitch: BiquadFilter;
  private bassRolloffSwitch: BiquadFilter;
  private highRolloff: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.bassRolloff = new BiquadFilter();
    this.lowMidBody = new BiquadFilter();
    this.midPresence = new BiquadFilter();
    this.presenceSwitch = new BiquadFilter();
    this.bassRolloffSwitch = new BiquadFilter();
    this.highRolloff = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const bassRolloffEnabled = (params.bassRolloff as boolean) ?? false;
    const presenceBoostEnabled = (params.presenceBoost as boolean) ?? false;
    const proximity = (params.proximity as number) ?? 30;
    const body = (params.body as number) ?? 2;
    const smoothness = (params.smoothness as number) ?? 50;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    this.hpFilter.setHighpass(50, 0.707, this.sampleRate);
    
    if (bassRolloffEnabled) {
      this.bassRolloffSwitch.setHighpass(400, 0.5, this.sampleRate);
    }
    
    const proximityBoost = (proximity / 100) * 4;
    this.bassRolloff.setLowShelf(150, proximityBoost, this.sampleRate);
    
    this.lowMidBody.setPeaking(350, 1.5, body, this.sampleRate);
    
    this.midPresence.setPeaking(4000, 1.2, 3, this.sampleRate);
    
    if (presenceBoostEnabled) {
      this.presenceSwitch.setPeaking(5500, 2, 5, this.sampleRate);
    }
    
    const hfRolloff = 8000 + (smoothness / 100) * 8000;
    this.highRolloff.setLowpass(hfRolloff, this.sampleRate);
    
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      if (bassRolloffEnabled) {
        sampleL = this.bassRolloffSwitch.process(sampleL);
        sampleR = this.bassRolloffSwitch.process(sampleR);
      }
      
      sampleL = this.bassRolloff.process(sampleL);
      sampleR = this.bassRolloff.process(sampleR);
      
      sampleL = this.lowMidBody.process(sampleL);
      sampleR = this.lowMidBody.process(sampleR);
      
      sampleL = this.midPresence.process(sampleL);
      sampleR = this.midPresence.process(sampleR);
      
      if (presenceBoostEnabled) {
        sampleL = this.presenceSwitch.process(sampleL);
        sampleR = this.presenceSwitch.process(sampleR);
      }
      
      sampleL = this.highRolloff.process(sampleL);
      sampleR = this.highRolloff.process(sampleR);
      
      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.bassRolloff.clear();
    this.lowMidBody.clear();
    this.midPresence.clear();
    this.presenceSwitch.clear();
    this.bassRolloffSwitch.clear();
    this.highRolloff.clear();
  }
}

export class RibbonModelerProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private warmthFilter: BiquadFilter;
  private midDip: BiquadFilter;
  private darkening: OnePoleFilter;
  private smoothing: OnePoleFilter;
  private transientSoftener: EnvelopeFollower;
  private bodyResonance: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.warmthFilter = new BiquadFilter();
    this.midDip = new BiquadFilter();
    this.darkening = new OnePoleFilter();
    this.smoothing = new OnePoleFilter();
    this.transientSoftener = new EnvelopeFollower(5, 80, 44100);
    this.bodyResonance = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const darkness = (params.darkness as number) ?? 60;
    const warmth = (params.warmth as number) ?? 4;
    const smoothness = (params.smoothness as number) ?? 70;
    const body = (params.body as number) ?? 3;
    const vintage = (params.vintage as number) ?? 50;
    const proximity = (params.proximity as number) ?? 40;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    this.hpFilter.setHighpass(60, 0.5, this.sampleRate);
    
    const warmthBoost = warmth + (proximity / 100) * 3;
    this.warmthFilter.setLowShelf(200, warmthBoost, this.sampleRate);
    
    this.bodyResonance.setPeaking(120, 1.5, body, this.sampleRate);
    
    this.midDip.setPeaking(2500, 1.2, -2 - (vintage / 50), this.sampleRate);
    
    const hfCutoff = 12000 - (darkness / 100) * 8000;
    this.darkening.setLowpass(hfCutoff, this.sampleRate);
    
    const smoothCutoff = 15000 - (smoothness / 100) * 7000;
    this.smoothing.setLowpass(smoothCutoff, this.sampleRate);
    
    const transientAmount = smoothness / 100;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      sampleL = this.warmthFilter.process(sampleL);
      sampleR = this.warmthFilter.process(sampleR);
      
      sampleL = this.bodyResonance.process(sampleL);
      sampleR = this.bodyResonance.process(sampleR);
      
      sampleL = this.midDip.process(sampleL);
      sampleR = this.midDip.process(sampleR);
      
      sampleL = this.darkening.process(sampleL);
      sampleR = this.darkening.process(sampleR);
      
      sampleL = this.smoothing.process(sampleL);
      sampleR = this.smoothing.process(sampleR);
      
      const envelope = this.transientSoftener.process((sampleL + sampleR) * 0.5);
      const transientGain = 1 - (envelope * transientAmount * 0.3);
      
      sampleL *= clamp(transientGain, 0.7, 1.0);
      sampleR *= clamp(transientGain, 0.7, 1.0);
      
      if (vintage > 0) {
        const saturation = vintage / 100 * 0.3;
        sampleL = Math.tanh(sampleL * (1 + saturation)) / (1 + saturation * 0.5);
        sampleR = Math.tanh(sampleR * (1 + saturation)) / (1 + saturation * 0.5);
      }
      
      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.warmthFilter.clear();
    this.midDip.clear();
    this.darkening.clear();
    this.smoothing.clear();
    this.transientSoftener.clear();
    this.bodyResonance.clear();
  }
}

export class SM58ModelerProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private proximityFilter: BiquadFilter;
  private midBody: BiquadFilter;
  private presencePeak: BiquadFilter;
  private brilliance: BiquadFilter;
  private popFilter: BiquadFilter;
  private grillEffect: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.proximityFilter = new BiquadFilter();
    this.midBody = new BiquadFilter();
    this.presencePeak = new BiquadFilter();
    this.brilliance = new BiquadFilter();
    this.popFilter = new BiquadFilter();
    this.grillEffect = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const proximity = (params.proximity as number) ?? 50;
    const presence = (params.presence as number) ?? 4;
    const body = (params.body as number) ?? 2;
    const grillColor = (params.grillColor as number) ?? 30;
    const feedback = (params.feedback as number) ?? 0;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    this.hpFilter.setHighpass(50, 0.707, this.sampleRate);
    
    const proximityBoost = (proximity / 100) * 6;
    this.proximityFilter.setLowShelf(150, proximityBoost, this.sampleRate);
    
    this.popFilter.setHighpass(100, 0.5, this.sampleRate);
    
    this.midBody.setPeaking(250, 1.5, body, this.sampleRate);
    
    this.presencePeak.setPeaking(5000, 1.8, presence, this.sampleRate);
    
    this.brilliance.setPeaking(7500, 1.5, presence * 0.5, this.sampleRate);
    
    const grillCutoff = 14000 - (grillColor / 100) * 6000;
    this.grillEffect.setLowpass(grillCutoff, this.sampleRate);
    
    const feedbackNotch = 1000 + feedback * 30;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      sampleL = this.popFilter.process(sampleL);
      sampleR = this.popFilter.process(sampleR);
      
      sampleL = this.proximityFilter.process(sampleL);
      sampleR = this.proximityFilter.process(sampleR);
      
      sampleL = this.midBody.process(sampleL);
      sampleR = this.midBody.process(sampleR);
      
      sampleL = this.presencePeak.process(sampleL);
      sampleR = this.presencePeak.process(sampleR);
      
      sampleL = this.brilliance.process(sampleL);
      sampleR = this.brilliance.process(sampleR);
      
      sampleL = this.grillEffect.process(sampleL);
      sampleR = this.grillEffect.process(sampleR);
      
      sampleL = softClip(sampleL, 0.95);
      sampleR = softClip(sampleR, 0.95);
      
      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.proximityFilter.clear();
    this.midBody.clear();
    this.presencePeak.clear();
    this.brilliance.clear();
    this.popFilter.clear();
    this.grillEffect.clear();
  }
}

export class MicPreampProcessor implements DSPProcessor {
  private inputHpFilter: BiquadFilter;
  private transformerLowShelf: BiquadFilter;
  private transformerHighShelf: BiquadFilter;
  private tubeStage: number = 0;
  private ironResonance: BiquadFilter;
  private outputFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.inputHpFilter = new BiquadFilter();
    this.transformerLowShelf = new BiquadFilter();
    this.transformerHighShelf = new BiquadFilter();
    this.ironResonance = new BiquadFilter();
    this.outputFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const inputGain = (params.input as number) ?? 30;
    const drive = (params.drive as number) ?? 30;
    const transformerType = (params.transformer as string) ?? 'vintage';
    const tubeEmulation = (params.tube as boolean) ?? true;
    const outputTrim = (params.output as number) ?? 0;
    const warmth = (params.warmth as number) ?? 50;
    const iron = (params.iron as number) ?? 30;
    const mix = (params.mix as number) ?? 1;

    this.inputHpFilter.setHighpass(20, 0.707, this.sampleRate);
    
    let lowBoost = 0;
    let highRolloff = 20000;
    let ironFreq = 60;
    
    switch (transformerType) {
      case 'vintage':
        lowBoost = 2 + (warmth / 100) * 3;
        highRolloff = 18000 - (warmth / 100) * 4000;
        ironFreq = 50;
        break;
      case 'modern':
        lowBoost = 1;
        highRolloff = 22000;
        ironFreq = 40;
        break;
      case 'tube':
        lowBoost = 3 + (warmth / 100) * 2;
        highRolloff = 15000 - (warmth / 100) * 3000;
        ironFreq = 60;
        break;
      case 'solid-state':
        lowBoost = 0.5;
        highRolloff = 24000;
        ironFreq = 30;
        break;
    }
    
    this.transformerLowShelf.setLowShelf(100, lowBoost, this.sampleRate);
    this.transformerHighShelf.setHighShelf(8000, -(warmth / 100) * 2, this.sampleRate);
    this.ironResonance.setPeaking(ironFreq, 2, (iron / 100) * 3, this.sampleRate);
    this.outputFilter.setLowpass(highRolloff, this.sampleRate);
    
    const inputGainLin = dbToLinear(inputGain);
    const driveAmount = drive / 100;
    const outputGainLin = dbToLinear(outputTrim);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i] * inputGainLin;
      let sampleR = input.samples[1][i] * inputGainLin;
      
      sampleL = this.inputHpFilter.process(sampleL);
      sampleR = this.inputHpFilter.process(sampleR);
      
      sampleL = this.ironResonance.process(sampleL);
      sampleR = this.ironResonance.process(sampleR);
      
      sampleL = this.transformerLowShelf.process(sampleL);
      sampleR = this.transformerLowShelf.process(sampleR);
      
      if (driveAmount > 0) {
        const driveGain = 1 + driveAmount * 3;
        sampleL = Math.tanh(sampleL * driveGain) / (1 + driveAmount * 0.5);
        sampleR = Math.tanh(sampleR * driveGain) / (1 + driveAmount * 0.5);
        
        if (tubeEmulation) {
          const evenHarmonic = driveAmount * 0.05;
          sampleL += sampleL * sampleL * evenHarmonic;
          sampleR += sampleR * sampleR * evenHarmonic;
        }
      }
      
      sampleL = this.transformerHighShelf.process(sampleL);
      sampleR = this.transformerHighShelf.process(sampleR);
      
      sampleL = this.outputFilter.process(sampleL);
      sampleR = this.outputFilter.process(sampleR);
      
      const processedL = sampleL * outputGainLin;
      const processedR = sampleR * outputGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.inputHpFilter.clear();
    this.transformerLowShelf.clear();
    this.transformerHighShelf.clear();
    this.tubeStage = 0;
    this.ironResonance.clear();
    this.outputFilter.clear();
  }
}

export class RoomSimProcessor implements DSPProcessor {
  private earlyDelays: DelayLine[] = [];
  private diffusers: AllPassFilter[] = [];
  private roomFilters: BiquadFilter[] = [];
  private wallAbsorption: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.earlyDelays.push(new DelayLine(8820));
      this.roomFilters.push(new BiquadFilter());
      this.wallAbsorption.push(new OnePoleFilter());
    }
    for (let i = 0; i < 4; i++) {
      this.diffusers.push(new AllPassFilter(97 + i * 53, 0.5));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const roomSize = (params.roomSize as number) ?? 50;
    const wallType = (params.wallType as string) ?? 'wood';
    const distance = (params.distance as number) ?? 30;
    const width = (params.width as number) ?? 70;
    const ceiling = (params.ceiling as number) ?? 50;
    const floor = (params.floor as string) ?? 'carpet';
    const mix = (params.mix as number) ?? 0.3;

    const sizeMultiplier = 0.5 + (roomSize / 100);
    const distanceDelay = msToSamples(distance * 0.3, this.sampleRate);
    
    let absorptionFreq = 8000;
    switch (wallType) {
      case 'concrete':
        absorptionFreq = 12000;
        break;
      case 'wood':
        absorptionFreq = 6000;
        break;
      case 'foam':
        absorptionFreq = 3000;
        break;
      case 'glass':
        absorptionFreq = 14000;
        break;
    }
    
    let floorReflection = 0.5;
    switch (floor) {
      case 'hardwood':
        floorReflection = 0.8;
        break;
      case 'carpet':
        floorReflection = 0.3;
        break;
      case 'tile':
        floorReflection = 0.9;
        break;
      case 'concrete':
        floorReflection = 0.85;
        break;
    }
    
    const erDelays = [
      Math.floor(distanceDelay * 0.3 * sizeMultiplier),
      Math.floor(distanceDelay * 0.5 * sizeMultiplier),
      Math.floor(distanceDelay * 0.7 * sizeMultiplier),
      Math.floor(distanceDelay * 0.9 * sizeMultiplier),
      Math.floor(distanceDelay * 1.1 * sizeMultiplier),
      Math.floor(distanceDelay * 1.4 * sizeMultiplier),
      Math.floor(distanceDelay * 1.8 * sizeMultiplier),
      Math.floor(distanceDelay * 2.3 * sizeMultiplier),
    ];
    
    const erGains = [0.8, 0.7, 0.6, 0.5, 0.45, 0.35, 0.25, 0.15];
    
    for (let i = 0; i < 8; i++) {
      const freqMod = 1 - (i * 0.08);
      this.wallAbsorption[i].setLowpass(absorptionFreq * freqMod, this.sampleRate);
      this.roomFilters[i].setPeaking(200 + i * 100, 1, ceiling / 50 - 1, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let diffused = mono;
      for (const diffuser of this.diffusers) {
        diffused = diffuser.process(diffused);
      }
      
      let wetL = 0, wetR = 0;
      const widthAmount = width / 100;
      
      for (let e = 0; e < 8; e++) {
        this.earlyDelays[e].write(diffused);
        let reflected = this.earlyDelays[e].read(Math.max(1, erDelays[e]));
        
        reflected = this.wallAbsorption[e].process(reflected);
        reflected = this.roomFilters[e].process(reflected);
        reflected *= erGains[e] * floorReflection;
        
        const angle = (e / 8) * Math.PI * widthAmount;
        wetL += reflected * Math.cos(angle);
        wetR += reflected * Math.sin(angle);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.earlyDelays.forEach(d => d.clear());
    this.diffusers.forEach(d => d.clear());
    this.roomFilters.forEach(f => f.clear());
    this.wallAbsorption.forEach(f => f.clear());
  }
}

export class MicIsolatorProcessor implements DSPProcessor {
  private noiseEnvelope: EnvelopeFollower;
  private signalEnvelope: EnvelopeFollower;
  private gateEnvelope: number = 0;
  private noiseBands: BiquadFilter[] = [];
  private bandEnvelopes: EnvelopeFollower[] = [];
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.noiseEnvelope = new EnvelopeFollower(50, 200, 44100);
    this.signalEnvelope = new EnvelopeFollower(5, 100, 44100);
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    
    const bandFreqs = [100, 250, 500, 1000, 2000, 4000, 8000, 12000];
    for (let i = 0; i < 8; i++) {
      this.noiseBands.push(new BiquadFilter());
      this.bandEnvelopes.push(new EnvelopeFollower(20, 150, 44100));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -40;
    const reduction = (params.reduction as number) ?? -30;
    const attack = (params.attack as number) ?? 5;
    const release = (params.release as number) ?? 150;
    const hpFreq = (params.hpFreq as number) ?? 80;
    const lpFreq = (params.lpFreq as number) ?? 16000;
    const lookahead = (params.lookahead as boolean) ?? false;
    const spectralMode = (params.spectral as boolean) ?? false;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const reductionLin = dbToLinear(reduction);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    this.hpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(lpFreq, 0.707, this.sampleRate);
    
    const bandFreqs = [100, 250, 500, 1000, 2000, 4000, 8000, 12000];
    for (let b = 0; b < 8; b++) {
      this.noiseBands[b].setBandpass(bandFreqs[b], 1.5, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      const mono = (sampleL + sampleR) * 0.5;
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      
      const signalLevel = this.signalEnvelope.process(mono);
      
      let gain = 1;
      
      if (spectralMode) {
        let spectralGain = 1;
        for (let b = 0; b < 8; b++) {
          const bandSample = this.noiseBands[b].process(mono);
          const bandLevel = this.bandEnvelopes[b].process(Math.abs(bandSample));
          
          if (bandLevel < thresholdLin * 0.5) {
            const bandReduction = Math.max(reductionLin, bandLevel / thresholdLin);
            spectralGain = Math.min(spectralGain, bandReduction);
          }
        }
        gain = spectralGain;
      } else {
        if (signalLevel < thresholdLin) {
          const ratio = signalLevel / thresholdLin;
          gain = reductionLin + (1 - reductionLin) * ratio;
        }
      }
      
      const targetEnv = gain;
      const coeff = targetEnv < this.gateEnvelope ? attackCoeff : releaseCoeff;
      this.gateEnvelope = this.gateEnvelope * coeff + targetEnv * (1 - coeff);
      
      const processedL = sampleL * this.gateEnvelope;
      const processedR = sampleR * this.gateEnvelope;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.noiseEnvelope.clear();
    this.signalEnvelope.clear();
    this.gateEnvelope = 0;
    this.noiseBands.forEach(f => f.clear());
    this.bandEnvelopes.forEach(e => e.clear());
    this.hpFilter.clear();
    this.lpFilter.clear();
  }
}

export class PlosiveReducerProcessor implements DSPProcessor {
  private plosiveDetector: BiquadFilter;
  private plosiveEnvelope: EnvelopeFollower;
  private bassEnvelope: EnvelopeFollower;
  private reductionEnvelope: number = 0;
  private hpFilter: BiquadFilter;
  private dynamicHpFilter: BiquadFilter;
  private delayLine: DelayLine;
  private sampleRate: number = 44100;

  constructor() {
    this.plosiveDetector = new BiquadFilter();
    this.plosiveEnvelope = new EnvelopeFollower(0.5, 30, 44100);
    this.bassEnvelope = new EnvelopeFollower(1, 50, 44100);
    this.hpFilter = new BiquadFilter();
    this.dynamicHpFilter = new BiquadFilter();
    this.delayLine = new DelayLine(441);
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const sensitivity = (params.sensitivity as number) ?? 50;
    const reduction = (params.reduction as number) ?? -12;
    const frequency = (params.frequency as number) ?? 120;
    const attack = (params.attack as number) ?? 0.5;
    const release = (params.release as number) ?? 30;
    const lookahead = (params.lookahead as boolean) ?? true;
    const mode = (params.mode as string) ?? 'dynamic';
    const mix = (params.mix as number) ?? 1;

    const sensitivityFactor = sensitivity / 100;
    const reductionLin = dbToLinear(reduction);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));
    const lookaheadSamples = lookahead ? msToSamples(2, this.sampleRate) : 0;

    this.plosiveDetector.setLowpass(frequency, 2, this.sampleRate);
    this.hpFilter.setHighpass(40, 0.707, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const mono = (inputL + inputR) * 0.5;
      
      const plosiveSignal = this.plosiveDetector.process(mono);
      const plosiveLevel = this.plosiveEnvelope.process(Math.abs(plosiveSignal));
      
      const bassLevel = this.bassEnvelope.process(Math.abs(mono));
      
      let plosiveDetected = false;
      if (plosiveLevel > sensitivityFactor * 0.1) {
        const transientRatio = plosiveLevel / (bassLevel + 0.0001);
        if (transientRatio > 2 * sensitivityFactor) {
          plosiveDetected = true;
        }
      }
      
      const targetGain = plosiveDetected ? reductionLin : 1;
      const coeff = plosiveDetected ? attackCoeff : releaseCoeff;
      this.reductionEnvelope = this.reductionEnvelope * coeff + targetGain * (1 - coeff);
      
      let sampleL = inputL;
      let sampleR = inputR;
      
      if (lookahead) {
        this.delayLine.write((inputL + inputR) * 0.5);
        const delayedMono = this.delayLine.read(lookaheadSamples);
        sampleL = delayedMono;
        sampleR = delayedMono;
      }
      
      let processedL = sampleL;
      let processedR = sampleR;
      
      switch (mode) {
        case 'cut':
          processedL = this.hpFilter.process(sampleL) * (1 - this.reductionEnvelope) + sampleL * this.reductionEnvelope;
          processedR = this.hpFilter.process(sampleR) * (1 - this.reductionEnvelope) + sampleR * this.reductionEnvelope;
          break;
        case 'duck':
          processedL = sampleL * this.reductionEnvelope;
          processedR = sampleR * this.reductionEnvelope;
          break;
        case 'dynamic':
        default:
          const dynamicFreq = 40 + (1 - this.reductionEnvelope) * frequency;
          this.dynamicHpFilter.setHighpass(dynamicFreq, 0.5, this.sampleRate);
          processedL = this.dynamicHpFilter.process(sampleL);
          processedR = this.dynamicHpFilter.process(sampleR);
      }
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.plosiveDetector.clear();
    this.plosiveEnvelope.clear();
    this.bassEnvelope.clear();
    this.reductionEnvelope = 0;
    this.hpFilter.clear();
    this.dynamicHpFilter.clear();
    this.delayLine.clear();
  }
}

export class ChannelStripProcessor implements DSPProcessor {
  private inputHpFilter: BiquadFilter;
  private preampSaturation: number = 0;
  private lowShelf: BiquadFilter;
  private lowMid: BiquadFilter;
  private highMid: BiquadFilter;
  private highShelf: BiquadFilter;
  private compEnvelope: number = 0;
  private gateEnvelope: number = 0;
  private outputFilter: OnePoleFilter;
  private transformerFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.inputHpFilter = new BiquadFilter();
    this.lowShelf = new BiquadFilter();
    this.lowMid = new BiquadFilter();
    this.highMid = new BiquadFilter();
    this.highShelf = new BiquadFilter();
    this.outputFilter = new OnePoleFilter();
    this.transformerFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const inputGain = (params.inputGain as number) ?? 20;
    const hpFreq = (params.hpFreq as number) ?? 80;
    const preampDrive = (params.drive as number) ?? 20;
    
    const lowGain = (params.lowGain as number) ?? 0;
    const lowFreq = (params.lowFreq as number) ?? 100;
    const lowMidGain = (params.lowMidGain as number) ?? 0;
    const lowMidFreq = (params.lowMidFreq as number) ?? 400;
    const highMidGain = (params.highMidGain as number) ?? 0;
    const highMidFreq = (params.highMidFreq as number) ?? 2500;
    const highGain = (params.highGain as number) ?? 0;
    const highFreq = (params.highFreq as number) ?? 8000;
    
    const compThreshold = (params.compThreshold as number) ?? -18;
    const compRatio = (params.compRatio as number) ?? 4;
    const compAttack = (params.compAttack as number) ?? 10;
    const compRelease = (params.compRelease as number) ?? 100;
    const compMakeup = (params.compMakeup as number) ?? 0;
    
    const gateThreshold = (params.gateThreshold as number) ?? -50;
    const gateEnabled = (params.gateEnabled as boolean) ?? false;
    
    const outputGain = (params.outputGain as number) ?? 0;
    const transformer = (params.transformer as boolean) ?? true;
    const mix = (params.mix as number) ?? 1;

    this.inputHpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    
    this.lowShelf.setLowShelf(lowFreq, lowGain, this.sampleRate);
    this.lowMid.setPeaking(lowMidFreq, 1.5, lowMidGain, this.sampleRate);
    this.highMid.setPeaking(highMidFreq, 1.5, highMidGain, this.sampleRate);
    this.highShelf.setHighShelf(highFreq, highGain, this.sampleRate);
    
    this.transformerFilter.setLowShelf(120, transformer ? 1.5 : 0, this.sampleRate);
    this.outputFilter.setLowpass(18000, this.sampleRate);
    
    const inputGainLin = dbToLinear(inputGain);
    const driveAmount = preampDrive / 100;
    const compThresholdLin = dbToLinear(compThreshold);
    const compAttackCoeff = Math.exp(-1 / msToSamples(compAttack, this.sampleRate));
    const compReleaseCoeff = Math.exp(-1 / msToSamples(compRelease, this.sampleRate));
    const compMakeupLin = dbToLinear(compMakeup);
    const gateThresholdLin = dbToLinear(gateThreshold);
    const outputGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i] * inputGainLin;
      let sampleR = input.samples[1][i] * inputGainLin;
      
      sampleL = this.inputHpFilter.process(sampleL);
      sampleR = this.inputHpFilter.process(sampleR);
      
      if (driveAmount > 0) {
        const driveGain = 1 + driveAmount * 2;
        sampleL = Math.tanh(sampleL * driveGain) / (1 + driveAmount * 0.3);
        sampleR = Math.tanh(sampleR * driveGain) / (1 + driveAmount * 0.3);
        
        const evenHarmonic = driveAmount * 0.03;
        sampleL += sampleL * sampleL * evenHarmonic;
        sampleR += sampleR * sampleR * evenHarmonic;
      }
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      
      sampleL = this.lowMid.process(sampleL);
      sampleR = this.lowMid.process(sampleR);
      
      sampleL = this.highMid.process(sampleL);
      sampleR = this.highMid.process(sampleR);
      
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      
      const inputLevel = Math.max(Math.abs(sampleL), Math.abs(sampleR));
      const compCoeff = inputLevel > this.compEnvelope ? compAttackCoeff : compReleaseCoeff;
      this.compEnvelope = this.compEnvelope * compCoeff + inputLevel * (1 - compCoeff);
      
      let compGain = 1;
      if (this.compEnvelope > compThresholdLin) {
        const overDb = linearToDb(this.compEnvelope / compThresholdLin);
        const reduction = overDb * (1 - 1 / compRatio);
        compGain = dbToLinear(-reduction);
      }
      
      sampleL *= compGain * compMakeupLin;
      sampleR *= compGain * compMakeupLin;
      
      if (gateEnabled) {
        const gateCoeff = inputLevel > this.gateEnvelope ? 0.1 : 0.9995;
        this.gateEnvelope = this.gateEnvelope * gateCoeff + inputLevel * (1 - gateCoeff);
        
        let gateGain = 1;
        if (this.gateEnvelope < gateThresholdLin) {
          gateGain = clamp(this.gateEnvelope / gateThresholdLin, 0.001, 1);
        }
        
        sampleL *= gateGain;
        sampleR *= gateGain;
      }
      
      if (transformer) {
        sampleL = this.transformerFilter.process(sampleL);
        sampleR = this.transformerFilter.process(sampleR);
      }
      
      sampleL = this.outputFilter.process(sampleL);
      sampleR = this.outputFilter.process(sampleR);
      
      const processedL = sampleL * outputGainLin;
      const processedR = sampleR * outputGainLin;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.inputHpFilter.clear();
    this.preampSaturation = 0;
    this.lowShelf.clear();
    this.lowMid.clear();
    this.highMid.clear();
    this.highShelf.clear();
    this.compEnvelope = 0;
    this.gateEnvelope = 0;
    this.outputFilter.clear();
    this.transformerFilter.clear();
  }
}

export const MICROPHONE_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-u87-modeler': () => new U87ModelerProcessor(),
  'mb-c414-modeler': () => new C414ModelerProcessor(),
  'mb-sm7b-modeler': () => new SM7BModelerProcessor(),
  'mb-ribbon-modeler': () => new RibbonModelerProcessor(),
  'mb-sm58-modeler': () => new SM58ModelerProcessor(),
  'mb-mic-preamp': () => new MicPreampProcessor(),
  'mb-room-sim': () => new RoomSimProcessor(),
  'mb-mic-isolator': () => new MicIsolatorProcessor(),
  'mb-plosive-reducer': () => new PlosiveReducerProcessor(),
  'mb-channel-strip': () => new ChannelStripProcessor(),
};
