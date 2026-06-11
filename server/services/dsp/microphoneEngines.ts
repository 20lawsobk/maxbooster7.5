import { AudioBuffer, DSPContext, DSPProcessor, copyBuffer, BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, EnvelopeFollower, msToSamples, dbToLinear, linearToDb, clamp, softClip } from "./core";

export class U87ModelerProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private presencePeakL: BiquadFilter;
  private presencePeakR: BiquadFilter;
  private airBandL: BiquadFilter;
  private airBandR: BiquadFilter;
  private proximityFilterL: BiquadFilter;
  private proximityFilterR: BiquadFilter;
  private transientEnvelope: EnvelopeFollower;
  private bodyResonanceL: BiquadFilter;
  private bodyResonanceR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.presencePeakL = new BiquadFilter();
    this.presencePeakR = new BiquadFilter();
    this.airBandL = new BiquadFilter();
    this.airBandR = new BiquadFilter();
    this.proximityFilterL = new BiquadFilter();
    this.proximityFilterR = new BiquadFilter();
    this.transientEnvelope = new EnvelopeFollower(0.5, 50, 44100);
    this.bodyResonanceL = new BiquadFilter();
    this.bodyResonanceR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const proximity = (params?.proximity as number) ?? 50;
    const presence = (params?.presence as number) ?? 3;
    const air = (params?.air as number) ?? 2;
    const warmth = (params?.warmth as number) ?? 2;
    const transientResponse = (params?.transient as number) ?? 70;
    const hpFreq = (params?.hpFreq as number) ?? 40;
    const outputGain = (params?.output as number) ?? 0;
    const mix = (params?.mix as number) ?? 1;

    this?.hpFilterL.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.lowShelfL.setLowShelf(120, warmth, this?.sampleRate);
    this?.lowShelfR.setLowShelf(120, warmth, this?.sampleRate);
    this?.presencePeakL.setPeaking(4500, 1.2, presence, this?.sampleRate);
    this?.presencePeakR.setPeaking(4500, 1.2, presence, this?.sampleRate);
    this?.airBandL.setHighShelf(12000, air, this?.sampleRate);
    this?.airBandR.setHighShelf(12000, air, this?.sampleRate);

    const proximityBoost = (proximity / 100) * 6;
    this?.proximityFilterL.setLowShelf(200, proximityBoost, this?.sampleRate);
    this?.proximityFilterR.setLowShelf(200, proximityBoost, this?.sampleRate);
    this?.bodyResonanceL.setPeaking(240, 2.5, warmth * 0.5, this?.sampleRate);
    this?.bodyResonanceR.setPeaking(240, 2.5, warmth * 0.5, this?.sampleRate);

    const transientFactor = transientResponse / 100;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      sampleL = this?.proximityFilterL.process(sampleL);
      sampleR = this?.proximityFilterR.process(sampleR);

      sampleL = this?.bodyResonanceL.process(sampleL);
      sampleR = this?.bodyResonanceR.process(sampleR);

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);

      sampleL = this?.presencePeakL.process(sampleL);
      sampleR = this?.presencePeakR.process(sampleR);

      sampleL = this?.airBandL.process(sampleL);
      sampleR = this?.airBandR.process(sampleR);

      const envelope = this?.transientEnvelope.process(
        (sampleL + sampleR) * 0.5,
      );
      const transientGain = 1 + envelope * transientFactor * 0.5;

      sampleL *= transientGain;
      sampleR *= transientGain;

      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.presencePeakL.clear();
    this?.presencePeakR.clear();
    this?.airBandL.clear();
    this?.airBandR.clear();
    this?.proximityFilterL.clear();
    this?.proximityFilterR.clear();
    this?.transientEnvelope.clear();
    this?.bodyResonanceL.clear();
    this?.bodyResonanceR.clear();
  }
}

export class C414ModelerProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private presencePeakL: BiquadFilter;
  private presencePeakR: BiquadFilter;
  private brillianceL: BiquadFilter;
  private brillianceR: BiquadFilter;
  private lowMidCutL: BiquadFilter;
  private lowMidCutR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private patternFilterL: BiquadFilter;
  private patternFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.presencePeakL = new BiquadFilter();
    this.presencePeakR = new BiquadFilter();
    this.brillianceL = new BiquadFilter();
    this.brillianceR = new BiquadFilter();
    this.lowMidCutL = new BiquadFilter();
    this.lowMidCutR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
    this.patternFilterL = new BiquadFilter();
    this.patternFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const pattern = (params?.pattern as string) ?? "cardioid";
    const presence = (params?.presence as number) ?? 3;
    const brilliance = (params?.brilliance as number) ?? 2;
    const bass = (params?.bass as number) ?? 0;
    const pad = (params?.pad as number) ?? 0;
    const hpEnabled = (params?.hpEnabled as boolean) ?? false;
    const outputGain = (params?.output as number) ?? 0;
    const mix = (params?.mix as number) ?? 1;

    if (hpEnabled) {
      this?.hpFilterL.setHighpass(80, 0.707, this?.sampleRate);
      this?.hpFilterR.setHighpass(80, 0.707, this?.sampleRate);
    }

    this?.presencePeakL.setPeaking(3500, 1.5, presence, this?.sampleRate);
    this?.presencePeakR.setPeaking(3500, 1.5, presence, this?.sampleRate);
    this?.brillianceL.setPeaking(8000, 1.2, brilliance, this?.sampleRate);
    this?.brillianceR.setPeaking(8000, 1.2, brilliance, this?.sampleRate);
    this?.highShelfL.setHighShelf(10000, brilliance * 0.5, this?.sampleRate);
    this?.highShelfR.setHighShelf(10000, brilliance * 0.5, this?.sampleRate);

    let lowFreqMod = 0;
    let _highFreqMod = 0;

    switch (pattern) {
      case "figure8":
        lowFreqMod = 3;
        highFreqMod = -1;
        break;
      case "omni":
        lowFreqMod = 2;
        highFreqMod = 1;
        break;
      case "hypercardioid":
        lowFreqMod = -2;
        highFreqMod = 2;
        break;
      case "cardioid":
      default:
        lowFreqMod = 0;
        highFreqMod = 0;
    }

    this?.patternFilterL.setLowShelf(150, bass + lowFreqMod, this?.sampleRate);
    this?.patternFilterR.setLowShelf(150, bass + lowFreqMod, this?.sampleRate);
    this?.lowMidCutL.setPeaking(400, 1.5, -2, this?.sampleRate);
    this?.lowMidCutR.setPeaking(400, 1.5, -2, this?.sampleRate);

    const padLin = dbToLinear(-pad);
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i] * padLin;
      let sampleR = input?.samples[1][i] * padLin;

      if (hpEnabled) {
        sampleL = this?.hpFilterL.process(sampleL);
        sampleR = this?.hpFilterR.process(sampleR);
      }

      sampleL = this?.patternFilterL.process(sampleL);
      sampleR = this?.patternFilterR.process(sampleR);

      sampleL = this?.lowMidCutL.process(sampleL);
      sampleR = this?.lowMidCutR.process(sampleR);

      sampleL = this?.presencePeakL.process(sampleL);
      sampleR = this?.presencePeakR.process(sampleR);

      sampleL = this?.brillianceL.process(sampleL);
      sampleR = this?.brillianceR.process(sampleR);

      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);

      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.presencePeakL.clear();
    this?.presencePeakR.clear();
    this?.brillianceL.clear();
    this?.brillianceR.clear();
    this?.lowMidCutL.clear();
    this?.lowMidCutR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
    this?.patternFilterL.clear();
    this?.patternFilterR.clear();
  }
}

export class SM7BModelerProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private bassRolloffL: BiquadFilter;
  private bassRolloffR: BiquadFilter;
  private lowMidBodyL: BiquadFilter;
  private lowMidBodyR: BiquadFilter;
  private midPresenceL: BiquadFilter;
  private midPresenceR: BiquadFilter;
  private presenceSwitchL: BiquadFilter;
  private presenceSwitchR: BiquadFilter;
  private bassRolloffSwitchL: BiquadFilter;
  private bassRolloffSwitchR: BiquadFilter;
  private highRolloffL: OnePoleFilter;
  private highRolloffR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.bassRolloffL = new BiquadFilter();
    this.bassRolloffR = new BiquadFilter();
    this.lowMidBodyL = new BiquadFilter();
    this.lowMidBodyR = new BiquadFilter();
    this.midPresenceL = new BiquadFilter();
    this.midPresenceR = new BiquadFilter();
    this.presenceSwitchL = new BiquadFilter();
    this.presenceSwitchR = new BiquadFilter();
    this.bassRolloffSwitchL = new BiquadFilter();
    this.bassRolloffSwitchR = new BiquadFilter();
    this.highRolloffL = new OnePoleFilter();
    this.highRolloffR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const bassRolloffEnabled = (params?.bassRolloff as boolean) ?? false;
    const presenceBoostEnabled = (params?.presenceBoost as boolean) ?? false;
    const proximity = (params?.proximity as number) ?? 30;
    const body = (params?.body as number) ?? 2;
    const smoothness = (params?.smoothness as number) ?? 50;
    const outputGain = (params?.output as number) ?? 0;
    const mix = (params?.mix as number) ?? 1;

    this?.hpFilterL.setHighpass(50, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(50, 0.707, this?.sampleRate);

    if (bassRolloffEnabled) {
      this?.bassRolloffSwitchL.setHighpass(400, 0.5, this?.sampleRate);
      this?.bassRolloffSwitchR.setHighpass(400, 0.5, this?.sampleRate);
    }

    const proximityBoost = (proximity / 100) * 4;
    this?.bassRolloffL.setLowShelf(150, proximityBoost, this?.sampleRate);
    this?.bassRolloffR.setLowShelf(150, proximityBoost, this?.sampleRate);

    this?.lowMidBodyL.setPeaking(350, 1.5, body, this?.sampleRate);
    this?.lowMidBodyR.setPeaking(350, 1.5, body, this?.sampleRate);

    this?.midPresenceL.setPeaking(4000, 1.2, 3, this?.sampleRate);
    this?.midPresenceR.setPeaking(4000, 1.2, 3, this?.sampleRate);

    if (presenceBoostEnabled) {
      this?.presenceSwitchL.setPeaking(5500, 2, 5, this?.sampleRate);
      this?.presenceSwitchR.setPeaking(5500, 2, 5, this?.sampleRate);
    }

    const hfRolloff = 8000 + (smoothness / 100) * 8000;
    this?.highRolloffL.setLowpass(hfRolloff, this?.sampleRate);
    this?.highRolloffR.setLowpass(hfRolloff, this?.sampleRate);

    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      if (bassRolloffEnabled) {
        sampleL = this?.bassRolloffSwitchL.process(sampleL);
        sampleR = this?.bassRolloffSwitchR.process(sampleR);
      }

      sampleL = this?.bassRolloffL.process(sampleL);
      sampleR = this?.bassRolloffR.process(sampleR);

      sampleL = this?.lowMidBodyL.process(sampleL);
      sampleR = this?.lowMidBodyR.process(sampleR);

      sampleL = this?.midPresenceL.process(sampleL);
      sampleR = this?.midPresenceR.process(sampleR);

      if (presenceBoostEnabled) {
        sampleL = this?.presenceSwitchL.process(sampleL);
        sampleR = this?.presenceSwitchR.process(sampleR);
      }

      sampleL = this?.highRolloffL.process(sampleL);
      sampleR = this?.highRolloffR.process(sampleR);

      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.bassRolloffL.clear();
    this?.bassRolloffR.clear();
    this?.lowMidBodyL.clear();
    this?.lowMidBodyR.clear();
    this?.midPresenceL.clear();
    this?.midPresenceR.clear();
    this?.presenceSwitchL.clear();
    this?.presenceSwitchR.clear();
    this?.bassRolloffSwitchL.clear();
    this?.bassRolloffSwitchR.clear();
    this?.highRolloffL.clear();
    this?.highRolloffR.clear();
  }
}

export class RibbonModelerProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private warmthFilterL: BiquadFilter;
  private warmthFilterR: BiquadFilter;
  private midDipL: BiquadFilter;
  private midDipR: BiquadFilter;
  private darkeningL: OnePoleFilter;
  private darkeningR: OnePoleFilter;
  private smoothingL: OnePoleFilter;
  private smoothingR: OnePoleFilter;
  private transientSoftener: EnvelopeFollower;
  private bodyResonanceL: BiquadFilter;
  private bodyResonanceR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.warmthFilterL = new BiquadFilter();
    this.warmthFilterR = new BiquadFilter();
    this.midDipL = new BiquadFilter();
    this.midDipR = new BiquadFilter();
    this.darkeningL = new OnePoleFilter();
    this.darkeningR = new OnePoleFilter();
    this.smoothingL = new OnePoleFilter();
    this.smoothingR = new OnePoleFilter();
    this.transientSoftener = new EnvelopeFollower(5, 80, 44100);
    this.bodyResonanceL = new BiquadFilter();
    this.bodyResonanceR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const darkness = (params?.darkness as number) ?? 60;
    const warmth = (params?.warmth as number) ?? 4;
    const smoothness = (params?.smoothness as number) ?? 70;
    const body = (params?.body as number) ?? 3;
    const vintage = (params?.vintage as number) ?? 50;
    const proximity = (params?.proximity as number) ?? 40;
    const outputGain = (params?.output as number) ?? 0;
    const mix = (params?.mix as number) ?? 1;

    this?.hpFilterL.setHighpass(60, 0.5, this?.sampleRate);
    this?.hpFilterR.setHighpass(60, 0.5, this?.sampleRate);

    const warmthBoost = warmth + (proximity / 100) * 3;
    this?.warmthFilterL.setLowShelf(200, warmthBoost, this?.sampleRate);
    this?.warmthFilterR.setLowShelf(200, warmthBoost, this?.sampleRate);

    this?.bodyResonanceL.setPeaking(120, 1.5, body, this?.sampleRate);
    this?.bodyResonanceR.setPeaking(120, 1.5, body, this?.sampleRate);

    this?.midDipL.setPeaking(2500, 1.2, -2 - vintage / 50, this?.sampleRate);
    this?.midDipR.setPeaking(2500, 1.2, -2 - vintage / 50, this?.sampleRate);

    const hfCutoff = 12000 - (darkness / 100) * 8000;
    this?.darkeningL.setLowpass(hfCutoff, this?.sampleRate);
    this?.darkeningR.setLowpass(hfCutoff, this?.sampleRate);

    const smoothCutoff = 15000 - (smoothness / 100) * 7000;
    this?.smoothingL.setLowpass(smoothCutoff, this?.sampleRate);
    this?.smoothingR.setLowpass(smoothCutoff, this?.sampleRate);

    const transientAmount = smoothness / 100;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      sampleL = this?.warmthFilterL.process(sampleL);
      sampleR = this?.warmthFilterR.process(sampleR);

      sampleL = this?.bodyResonanceL.process(sampleL);
      sampleR = this?.bodyResonanceR.process(sampleR);

      sampleL = this?.midDipL.process(sampleL);
      sampleR = this?.midDipR.process(sampleR);

      sampleL = this?.darkeningL.process(sampleL);
      sampleR = this?.darkeningR.process(sampleR);

      sampleL = this?.smoothingL.process(sampleL);
      sampleR = this?.smoothingR.process(sampleR);

      const envelope = this?.transientSoftener.process(
        (sampleL + sampleR) * 0.5,
      );
      const transientGain = 1 - envelope * transientAmount * 0.3;

      sampleL *= clamp(transientGain, 0.7, 1.0);
      sampleR *= clamp(transientGain, 0.7, 1.0);

      if (vintage > 0) {
        const saturation = (vintage / 100) * 0.3;
        sampleL =
          Math?.tanh(sampleL * (1 + saturation)) / (1 + saturation * 0.5);
        sampleR =
          Math?.tanh(sampleR * (1 + saturation)) / (1 + saturation * 0.5);
      }

      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.warmthFilterL.clear();
    this?.warmthFilterR.clear();
    this?.midDipL.clear();
    this?.midDipR.clear();
    this?.darkeningL.clear();
    this?.darkeningR.clear();
    this?.smoothingL.clear();
    this?.smoothingR.clear();
    this?.transientSoftener.clear();
    this?.bodyResonanceL.clear();
    this?.bodyResonanceR.clear();
  }
}

export class SM58ModelerProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private proximityFilterL: BiquadFilter;
  private proximityFilterR: BiquadFilter;
  private midBodyL: BiquadFilter;
  private midBodyR: BiquadFilter;
  private presencePeakL: BiquadFilter;
  private presencePeakR: BiquadFilter;
  private brillianceL: BiquadFilter;
  private brillianceR: BiquadFilter;
  private popFilterL: BiquadFilter;
  private popFilterR: BiquadFilter;
  private grillEffectL: OnePoleFilter;
  private grillEffectR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.proximityFilterL = new BiquadFilter();
    this.proximityFilterR = new BiquadFilter();
    this.midBodyL = new BiquadFilter();
    this.midBodyR = new BiquadFilter();
    this.presencePeakL = new BiquadFilter();
    this.presencePeakR = new BiquadFilter();
    this.brillianceL = new BiquadFilter();
    this.brillianceR = new BiquadFilter();
    this.popFilterL = new BiquadFilter();
    this.popFilterR = new BiquadFilter();
    this.grillEffectL = new OnePoleFilter();
    this.grillEffectR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const proximity = (params?.proximity as number) ?? 50;
    const presence = (params?.presence as number) ?? 4;
    const body = (params?.body as number) ?? 2;
    const grillColor = (params?.grillColor as number) ?? 30;
    const outputGain = (params?.output as number) ?? 0;
    const mix = (params?.mix as number) ?? 1;

    this?.hpFilterL.setHighpass(50, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(50, 0.707, this?.sampleRate);

    const proximityBoost = (proximity / 100) * 6;
    this?.proximityFilterL.setLowShelf(150, proximityBoost, this?.sampleRate);
    this?.proximityFilterR.setLowShelf(150, proximityBoost, this?.sampleRate);

    this?.popFilterL.setHighpass(100, 0.5, this?.sampleRate);
    this?.popFilterR.setHighpass(100, 0.5, this?.sampleRate);

    this?.midBodyL.setPeaking(250, 1.5, body, this?.sampleRate);
    this?.midBodyR.setPeaking(250, 1.5, body, this?.sampleRate);

    this?.presencePeakL.setPeaking(5000, 1.8, presence, this?.sampleRate);
    this?.presencePeakR.setPeaking(5000, 1.8, presence, this?.sampleRate);

    this?.brillianceL.setPeaking(7500, 1.5, presence * 0.5, this?.sampleRate);
    this?.brillianceR.setPeaking(7500, 1.5, presence * 0.5, this?.sampleRate);

    const grillCutoff = 14000 - (grillColor / 100) * 6000;
    this?.grillEffectL.setLowpass(grillCutoff, this?.sampleRate);
    this?.grillEffectR.setLowpass(grillCutoff, this?.sampleRate);

    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      sampleL = this?.popFilterL.process(sampleL);
      sampleR = this?.popFilterR.process(sampleR);

      sampleL = this?.proximityFilterL.process(sampleL);
      sampleR = this?.proximityFilterR.process(sampleR);

      sampleL = this?.midBodyL.process(sampleL);
      sampleR = this?.midBodyR.process(sampleR);

      sampleL = this?.presencePeakL.process(sampleL);
      sampleR = this?.presencePeakR.process(sampleR);

      sampleL = this?.brillianceL.process(sampleL);
      sampleR = this?.brillianceR.process(sampleR);

      sampleL = this?.grillEffectL.process(sampleL);
      sampleR = this?.grillEffectR.process(sampleR);

      sampleL = softClip(sampleL, 0.95);
      sampleR = softClip(sampleR, 0.95);

      const processedL = sampleL * outGainLin;
      const processedR = sampleR * outGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.proximityFilterL.clear();
    this?.proximityFilterR.clear();
    this?.midBodyL.clear();
    this?.midBodyR.clear();
    this?.presencePeakL.clear();
    this?.presencePeakR.clear();
    this?.brillianceL.clear();
    this?.brillianceR.clear();
    this?.popFilterL.clear();
    this?.popFilterR.clear();
    this?.grillEffectL.clear();
    this?.grillEffectR.clear();
  }
}

export class MicPreampProcessor implements DSPProcessor {
  private inputHpFilterL: BiquadFilter;
  private inputHpFilterR: BiquadFilter;
  private transformerLowShelfL: BiquadFilter;
  private transformerLowShelfR: BiquadFilter;
  private transformerHighShelfL: BiquadFilter;
  private transformerHighShelfR: BiquadFilter;
  private tubeStage: number = 0;
  private ironResonanceL: BiquadFilter;
  private ironResonanceR: BiquadFilter;
  private outputFilterL: OnePoleFilter;
  private outputFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.inputHpFilterL = new BiquadFilter();
    this.inputHpFilterR = new BiquadFilter();
    this.transformerLowShelfL = new BiquadFilter();
    this.transformerLowShelfR = new BiquadFilter();
    this.transformerHighShelfL = new BiquadFilter();
    this.transformerHighShelfR = new BiquadFilter();
    this.ironResonanceL = new BiquadFilter();
    this.ironResonanceR = new BiquadFilter();
    this.outputFilterL = new OnePoleFilter();
    this.outputFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const inputGain = (params?.input as number) ?? 30;
    const drive = (params?.drive as number) ?? 30;
    const transformerType = (params?.transformer as string) ?? "vintage";
    const tubeEmulation = (params?.tube as boolean) ?? true;
    const outputTrim = (params?.output as number) ?? 0;
    const warmth = (params?.warmth as number) ?? 50;
    const iron = (params?.iron as number) ?? 30;
    const mix = (params?.mix as number) ?? 1;

    this?.inputHpFilterL.setHighpass(20, 0.707, this?.sampleRate);
    this?.inputHpFilterR.setHighpass(20, 0.707, this?.sampleRate);

    let lowBoost = 0;
    let highRolloff = 20000;
    let ironFreq = 60;

    switch (transformerType) {
      case "vintage":
        lowBoost = 2 + (warmth / 100) * 3;
        highRolloff = 18000 - (warmth / 100) * 4000;
        ironFreq = 50;
        break;
      case "modern":
        lowBoost = 1;
        highRolloff = 22000;
        ironFreq = 40;
        break;
      case "tube":
        lowBoost = 3 + (warmth / 100) * 2;
        highRolloff = 15000 - (warmth / 100) * 3000;
        ironFreq = 60;
        break;
      case "solid-state":
        lowBoost = 0.5;
        highRolloff = 24000;
        ironFreq = 30;
        break;
    }

    this?.transformerLowShelfL.setLowShelf(100, lowBoost, this?.sampleRate);
    this?.transformerLowShelfR.setLowShelf(100, lowBoost, this?.sampleRate);
    this?.transformerHighShelfL.setHighShelf(
      8000,
      -(warmth / 100) * 2,
      this?.sampleRate,
    );
    this?.transformerHighShelfR.setHighShelf(
      8000,
      -(warmth / 100) * 2,
      this?.sampleRate,
    );
    this?.ironResonanceL.setPeaking(
      ironFreq,
      2,
      (iron / 100) * 3,
      this?.sampleRate,
    );
    this?.ironResonanceR.setPeaking(
      ironFreq,
      2,
      (iron / 100) * 3,
      this?.sampleRate,
    );
    this?.outputFilterL.setLowpass(highRolloff, this?.sampleRate);
    this?.outputFilterR.setLowpass(highRolloff, this?.sampleRate);

    const inputGainLin = dbToLinear(inputGain);
    const driveAmount = drive / 100;
    const outputGainLin = dbToLinear(outputTrim);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i] * inputGainLin;
      let sampleR = input?.samples[1][i] * inputGainLin;

      sampleL = this?.inputHpFilterL.process(sampleL);
      sampleR = this?.inputHpFilterR.process(sampleR);

      sampleL = this?.ironResonanceL.process(sampleL);
      sampleR = this?.ironResonanceR.process(sampleR);

      sampleL = this?.transformerLowShelfL.process(sampleL);
      sampleR = this?.transformerLowShelfR.process(sampleR);

      if (driveAmount > 0) {
        const driveGain = 1 + driveAmount * 3;
        sampleL = Math?.tanh(sampleL * driveGain) / (1 + driveAmount * 0.5);
        sampleR = Math?.tanh(sampleR * driveGain) / (1 + driveAmount * 0.5);

        if (tubeEmulation) {
          const evenHarmonic = driveAmount * 0.05;
          sampleL += sampleL * sampleL * evenHarmonic;
          sampleR += sampleR * sampleR * evenHarmonic;
        }
      }

      sampleL = this?.transformerHighShelfL.process(sampleL);
      sampleR = this?.transformerHighShelfR.process(sampleR);

      sampleL = this?.outputFilterL.process(sampleL);
      sampleR = this?.outputFilterR.process(sampleR);

      const processedL = sampleL * outputGainLin;
      const processedR = sampleR * outputGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.inputHpFilterL.clear();
    this?.inputHpFilterR.clear();
    this?.transformerLowShelfL.clear();
    this?.transformerLowShelfR.clear();
    this?.transformerHighShelfL.clear();
    this?.transformerHighShelfR.clear();
    this.tubeStage = 0;
    this?.ironResonanceL.clear();
    this?.ironResonanceR.clear();
    this?.outputFilterL.clear();
    this?.outputFilterR.clear();
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
      this?.earlyDelays.push(new DelayLine(8820));
      this?.roomFilters.push(new BiquadFilter());
      this?.wallAbsorption.push(new OnePoleFilter());
    }
    for (let i = 0; i < 4; i++) {
      this?.diffusers.push(new AllPassFilter(97 + i * 53, 0.5));
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const roomSize = (params?.roomSize as number) ?? 50;
    const wallType = (params?.wallType as string) ?? "wood";
    const distance = (params?.distance as number) ?? 30;
    const width = (params?.width as number) ?? 70;
    const ceiling = (params?.ceiling as number) ?? 50;
    const floor = (params?.floor as string) ?? "carpet";
    const mix = (params?.mix as number) ?? 0.3;

    const sizeMultiplier = 0.5 + roomSize / 100;
    const distanceDelay = msToSamples(distance * 0.3, this?.sampleRate);

    let absorptionFreq = 8000;
    switch (wallType) {
      case "concrete":
        absorptionFreq = 12000;
        break;
      case "wood":
        absorptionFreq = 6000;
        break;
      case "foam":
        absorptionFreq = 3000;
        break;
      case "glass":
        absorptionFreq = 14000;
        break;
    }

    let floorReflection = 0.5;
    switch (floor) {
      case "hardwood":
        floorReflection = 0.8;
        break;
      case "carpet":
        floorReflection = 0.3;
        break;
      case "tile":
        floorReflection = 0.9;
        break;
      case "concrete":
        floorReflection = 0.85;
        break;
    }

    const erDelays = [
      Math?.floor(distanceDelay * 0.3 * sizeMultiplier),
      Math?.floor(distanceDelay * 0.5 * sizeMultiplier),
      Math?.floor(distanceDelay * 0.7 * sizeMultiplier),
      Math?.floor(distanceDelay * 0.9 * sizeMultiplier),
      Math?.floor(distanceDelay * 1.1 * sizeMultiplier),
      Math?.floor(distanceDelay * 1.4 * sizeMultiplier),
      Math?.floor(distanceDelay * 1.8 * sizeMultiplier),
      Math?.floor(distanceDelay * 2.3 * sizeMultiplier),
    ];

    const erGains = [0.8, 0.7, 0.6, 0.5, 0.45, 0.35, 0.25, 0.15];

    for (let i = 0; i < 8; i++) {
      const freqMod = 1 - i * 0.08;
      this?.wallAbsorption[i].setLowpass(
        absorptionFreq * freqMod,
        this?.sampleRate,
      );
      this?.roomFilters[i].setPeaking(
        200 + i * 100,
        1,
        ceiling / 50 - 1,
        this?.sampleRate,
      );
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;

      let diffused = mono;
      for (const diffuser of this?.diffusers) {
        diffused = diffuser?.process(diffused);
      }

      let wetL = 0,
        wetR = 0;
      const widthAmount = width / 100;

      for (let e = 0; e < 8; e++) {
        this?.earlyDelays[e].write(diffused);
        let reflected = this?.earlyDelays[e].read(Math?.max(1, erDelays[e]));

        reflected = this?.wallAbsorption[e].process(reflected);
        reflected = this?.roomFilters[e].process(reflected);
        reflected *= erGains[e] * floorReflection;

        const angle = (e / 8) * Math.PI * widthAmount;
        wetL += reflected * Math?.cos(angle);
        wetR += reflected * Math?.sin(angle);
      }

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.earlyDelays.forEach((d) => d?.clear());
    this?.diffusers.forEach((d) => d?.clear());
    this?.roomFilters.forEach((f) => f?.clear());
    this?.wallAbsorption.forEach((f) => f?.clear());
  }
}

export class MicIsolatorProcessor implements DSPProcessor {
  private noiseEnvelope: EnvelopeFollower;
  private signalEnvelope: EnvelopeFollower;
  private gateEnvelope: number = 0;
  private noiseBands: BiquadFilter[] = [];
  private bandEnvelopes: EnvelopeFollower[] = [];
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.noiseEnvelope = new EnvelopeFollower(50, 200, 44100);
    this.signalEnvelope = new EnvelopeFollower(5, 100, 44100);
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.lpFilterL = new BiquadFilter();
    this.lpFilterR = new BiquadFilter();

    for (let i = 0; i < 8; i++) {
      this?.noiseBands.push(new BiquadFilter());
      this?.bandEnvelopes.push(new EnvelopeFollower(20, 150, 44100));
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const threshold = (params?.threshold as number) ?? -40;
    const reduction = (params?.reduction as number) ?? -30;
    const attack = (params?.attack as number) ?? 5;
    const release = (params?.release as number) ?? 150;
    const hpFreq = (params?.hpFreq as number) ?? 80;
    const lpFreq = (params?.lpFreq as number) ?? 16000;
    const spectralMode = (params?.spectral as boolean) ?? false;
    const mix = (params?.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const reductionLin = dbToLinear(reduction);
    const attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));

    this?.hpFilterL.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(lpFreq, 0.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(lpFreq, 0.707, this?.sampleRate);

    const bandFreqs = [100, 250, 500, 1000, 2000, 4000, 8000, 12000];
    for (let b = 0; b < 8; b++) {
      this?.noiseBands[b].setBandpass(bandFreqs[b], 1.5, this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];
      const mono = (sampleL + sampleR) * 0.5;

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      sampleL = this?.lpFilterL.process(sampleL);
      sampleR = this?.lpFilterR.process(sampleR);

      const signalLevel = this?.signalEnvelope.process(mono);

      let gain = 1;

      if (spectralMode) {
        let spectralGain = 1;
        for (let b = 0; b < 8; b++) {
          const bandSample = this?.noiseBands[b].process(mono);
          const bandLevel = this?.bandEnvelopes[b].process(Math?.abs(bandSample));

          if (bandLevel < thresholdLin * 0.5) {
            const bandReduction = Math?.max(
              reductionLin,
              bandLevel / thresholdLin,
            );
            spectralGain = Math?.min(spectralGain, bandReduction);
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
      const coeff = targetEnv < this?.gateEnvelope ? attackCoeff : releaseCoeff;
      this.gateEnvelope = this?.gateEnvelope * coeff + targetEnv * (1 - coeff);

      const processedL = sampleL * this?.gateEnvelope;
      const processedR = sampleR * this?.gateEnvelope;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.noiseEnvelope.clear();
    this?.signalEnvelope.clear();
    this.gateEnvelope = 0;
    this?.noiseBands.forEach((f) => f?.clear());
    this?.bandEnvelopes.forEach((e) => e?.clear());
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class PlosiveReducerProcessor implements DSPProcessor {
  private plosiveDetector: BiquadFilter;
  private plosiveEnvelope: EnvelopeFollower;
  private bassEnvelope: EnvelopeFollower;
  private reductionEnvelope: number = 0;
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private dynamicHpFilterL: BiquadFilter;
  private dynamicHpFilterR: BiquadFilter;
  private delayLine: DelayLine;
  private sampleRate: number = 44100;

  constructor() {
    this.plosiveDetector = new BiquadFilter();
    this.plosiveEnvelope = new EnvelopeFollower(0.5, 30, 44100);
    this.bassEnvelope = new EnvelopeFollower(1, 50, 44100);
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.dynamicHpFilterL = new BiquadFilter();
    this.dynamicHpFilterR = new BiquadFilter();
    this.delayLine = new DelayLine(441);
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const sensitivity = (params?.sensitivity as number) ?? 50;
    const reduction = (params?.reduction as number) ?? -12;
    const frequency = (params?.frequency as number) ?? 120;
    const attack = (params?.attack as number) ?? 0.5;
    const release = (params?.release as number) ?? 30;
    const lookahead = (params?.lookahead as boolean) ?? true;
    const mode = (params?.mode as string) ?? "dynamic";
    const mix = (params?.mix as number) ?? 1;

    const sensitivityFactor = sensitivity / 100;
    const reductionLin = dbToLinear(reduction);
    const attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));
    const lookaheadSamples = lookahead ? msToSamples(2, this?.sampleRate) : 0;

    this?.plosiveDetector.setLowpass(frequency, 2, this?.sampleRate);
    this?.hpFilterL.setHighpass(40, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(40, 0.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const inputL = input?.samples[0][i];
      const inputR = input?.samples[1][i];
      const mono = (inputL + inputR) * 0.5;

      const plosiveSignal = this?.plosiveDetector.process(mono);
      const plosiveLevel = this?.plosiveEnvelope.process(
        Math?.abs(plosiveSignal),
      );

      const bassLevel = this?.bassEnvelope.process(Math?.abs(mono));

      let plosiveDetected = false;
      if (plosiveLevel > sensitivityFactor * 0.1) {
        const transientRatio = plosiveLevel / (bassLevel + 0.0001);
        if (transientRatio > 2 * sensitivityFactor) {
          plosiveDetected = true;
        }
      }

      const targetGain = plosiveDetected ? reductionLin : 1;
      const coeff = plosiveDetected ? attackCoeff : releaseCoeff;
      this.reductionEnvelope =
        this?.reductionEnvelope * coeff + targetGain * (1 - coeff);

      let sampleL = inputL;
      let sampleR = inputR;

      if (lookahead) {
        this?.delayLine.write((inputL + inputR) * 0.5);
        const delayedMono = this?.delayLine.read(lookaheadSamples);
        sampleL = delayedMono;
        sampleR = delayedMono;
      }

      let processedL = sampleL;
      let processedR = sampleR;

      switch (mode) {
        case "cut":
          processedL =
            this?.hpFilterL.process(sampleL) * (1 - this?.reductionEnvelope) +
            sampleL * this?.reductionEnvelope;
          processedR =
            this?.hpFilterR.process(sampleR) * (1 - this?.reductionEnvelope) +
            sampleR * this?.reductionEnvelope;
          break;
        case "duck":
          processedL = sampleL * this?.reductionEnvelope;
          processedR = sampleR * this?.reductionEnvelope;
          break;
        case "dynamic":
        default:
          const dynamicFreq = 40 + (1 - this?.reductionEnvelope) * frequency;
          this?.dynamicHpFilterL.setHighpass(dynamicFreq, 0.5, this?.sampleRate);
          this?.dynamicHpFilterR.setHighpass(dynamicFreq, 0.5, this?.sampleRate);
          processedL = this?.dynamicHpFilterL.process(sampleL);
          processedR = this?.dynamicHpFilterR.process(sampleR);
      }

      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.plosiveDetector.clear();
    this?.plosiveEnvelope.clear();
    this?.bassEnvelope.clear();
    this.reductionEnvelope = 0;
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.dynamicHpFilterL.clear();
    this?.dynamicHpFilterR.clear();
    this?.delayLine.clear();
  }
}

export class ChannelStripProcessor implements DSPProcessor {
  private inputHpFilterL: BiquadFilter;
  private inputHpFilterR: BiquadFilter;
  private preampSaturation: number = 0;
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private lowMidL: BiquadFilter;
  private lowMidR: BiquadFilter;
  private highMidL: BiquadFilter;
  private highMidR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private compEnvelope: number = 0;
  private gateEnvelope: number = 0;
  private outputFilterL: OnePoleFilter;
  private outputFilterR: OnePoleFilter;
  private transformerFilterL: BiquadFilter;
  private transformerFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.inputHpFilterL = new BiquadFilter();
    this.inputHpFilterR = new BiquadFilter();
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.lowMidL = new BiquadFilter();
    this.lowMidR = new BiquadFilter();
    this.highMidL = new BiquadFilter();
    this.highMidR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
    this.outputFilterL = new OnePoleFilter();
    this.outputFilterR = new OnePoleFilter();
    this.transformerFilterL = new BiquadFilter();
    this.transformerFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const inputGain = (params?.inputGain as number) ?? 20;
    const hpFreq = (params?.hpFreq as number) ?? 80;
    const preampDrive = (params?.drive as number) ?? 20;

    const lowGain = (params?.lowGain as number) ?? 0;
    const lowFreq = (params?.lowFreq as number) ?? 100;
    const lowMidGain = (params?.lowMidGain as number) ?? 0;
    const lowMidFreq = (params?.lowMidFreq as number) ?? 400;
    const highMidGain = (params?.highMidGain as number) ?? 0;
    const highMidFreq = (params?.highMidFreq as number) ?? 2500;
    const highGain = (params?.highGain as number) ?? 0;
    const highFreq = (params?.highFreq as number) ?? 8000;

    const compThreshold = (params?.compThreshold as number) ?? -18;
    const compRatio = (params?.compRatio as number) ?? 4;
    const compAttack = (params?.compAttack as number) ?? 10;
    const compRelease = (params?.compRelease as number) ?? 100;
    const compMakeup = (params?.compMakeup as number) ?? 0;

    const gateThreshold = (params?.gateThreshold as number) ?? -50;
    const gateEnabled = (params?.gateEnabled as boolean) ?? false;

    const outputGain = (params?.outputGain as number) ?? 0;
    const transformer = (params?.transformer as boolean) ?? true;
    const mix = (params?.mix as number) ?? 1;

    this?.inputHpFilterL.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.inputHpFilterR.setHighpass(hpFreq, 0.707, this?.sampleRate);

    this?.lowShelfL.setLowShelf(lowFreq, lowGain, this?.sampleRate);
    this?.lowShelfR.setLowShelf(lowFreq, lowGain, this?.sampleRate);
    this?.lowMidL.setPeaking(lowMidFreq, 1.5, lowMidGain, this?.sampleRate);
    this?.lowMidR.setPeaking(lowMidFreq, 1.5, lowMidGain, this?.sampleRate);
    this?.highMidL.setPeaking(highMidFreq, 1.5, highMidGain, this?.sampleRate);
    this?.highMidR.setPeaking(highMidFreq, 1.5, highMidGain, this?.sampleRate);
    this?.highShelfL.setHighShelf(highFreq, highGain, this?.sampleRate);
    this?.highShelfR.setHighShelf(highFreq, highGain, this?.sampleRate);

    this?.transformerFilterL.setLowShelf(
      120,
      transformer ? 1.5 : 0,
      this?.sampleRate,
    );
    this?.transformerFilterR.setLowShelf(
      120,
      transformer ? 1.5 : 0,
      this?.sampleRate,
    );
    this?.outputFilterL.setLowpass(18000, this?.sampleRate);
    this?.outputFilterR.setLowpass(18000, this?.sampleRate);

    const inputGainLin = dbToLinear(inputGain);
    const driveAmount = preampDrive / 100;
    const compThresholdLin = dbToLinear(compThreshold);
    const compAttackCoeff = Math?.exp(
      -1 / msToSamples(compAttack, this?.sampleRate),
    );
    const compReleaseCoeff = Math?.exp(
      -1 / msToSamples(compRelease, this?.sampleRate),
    );
    const compMakeupLin = dbToLinear(compMakeup);
    const gateThresholdLin = dbToLinear(gateThreshold);
    const outputGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i] * inputGainLin;
      let sampleR = input?.samples[1][i] * inputGainLin;

      sampleL = this?.inputHpFilterL.process(sampleL);
      sampleR = this?.inputHpFilterR.process(sampleR);

      if (driveAmount > 0) {
        const driveGain = 1 + driveAmount * 2;
        sampleL = Math?.tanh(sampleL * driveGain) / (1 + driveAmount * 0.3);
        sampleR = Math?.tanh(sampleR * driveGain) / (1 + driveAmount * 0.3);

        const evenHarmonic = driveAmount * 0.03;
        sampleL += sampleL * sampleL * evenHarmonic;
        sampleR += sampleR * sampleR * evenHarmonic;
      }

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);

      sampleL = this?.lowMidL.process(sampleL);
      sampleR = this?.lowMidR.process(sampleR);

      sampleL = this?.highMidL.process(sampleL);
      sampleR = this?.highMidR.process(sampleR);

      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);

      const inputLevel = Math?.max(Math?.abs(sampleL), Math?.abs(sampleR));
      const compCoeff =
        inputLevel > this?.compEnvelope ? compAttackCoeff : compReleaseCoeff;
      this.compEnvelope =
        this?.compEnvelope * compCoeff + inputLevel * (1 - compCoeff);

      let compGain = 1;
      if (this?.compEnvelope > compThresholdLin) {
        const overDb = linearToDb(this?.compEnvelope / compThresholdLin);
        const reduction = overDb * (1 - 1 / compRatio);
        compGain = dbToLinear(-reduction);
      }

      sampleL *= compGain * compMakeupLin;
      sampleR *= compGain * compMakeupLin;

      if (gateEnabled) {
        const gateCoeff = inputLevel > this?.gateEnvelope ? 0.1 : 0.9995;
        this.gateEnvelope =
          this?.gateEnvelope * gateCoeff + inputLevel * (1 - gateCoeff);

        let gateGain = 1;
        if (this?.gateEnvelope < gateThresholdLin) {
          gateGain = clamp(this?.gateEnvelope / gateThresholdLin, 0.001, 1);
        }

        sampleL *= gateGain;
        sampleR *= gateGain;
      }

      if (transformer) {
        sampleL = this?.transformerFilterL.process(sampleL);
        sampleR = this?.transformerFilterR.process(sampleR);
      }

      sampleL = this?.outputFilterL.process(sampleL);
      sampleR = this?.outputFilterR.process(sampleR);

      const processedL = sampleL * outputGainLin;
      const processedR = sampleR * outputGainLin;

      output.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.inputHpFilterL.clear();
    this?.inputHpFilterR.clear();
    this.preampSaturation = 0;
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.lowMidL.clear();
    this?.lowMidR.clear();
    this?.highMidL.clear();
    this?.highMidR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
    this.compEnvelope = 0;
    this.gateEnvelope = 0;
    this?.outputFilterL.clear();
    this?.outputFilterR.clear();
    this?.transformerFilterL.clear();
    this?.transformerFilterR.clear();
  }
}

export const MICROPHONE_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-u87-modeler": () => new U87ModelerProcessor(),
  "mb-c414-modeler": () => new C414ModelerProcessor(),
  "mb-sm7b-modeler": () => new SM7BModelerProcessor(),
  "mb-ribbon-modeler": () => new RibbonModelerProcessor(),
  "mb-sm58-modeler": () => new SM58ModelerProcessor(),
  "mb-mic-preamp": () => new MicPreampProcessor(),
  "mb-room-sim": () => new RoomSimProcessor(),
  "mb-mic-isolator": () => new MicIsolatorProcessor(),
  "mb-plosive-reducer": () => new PlosiveReducerProcessor(),
  "mb-channel-strip": () => new ChannelStripProcessor(),
};
