import {
  AudioBuffer,
  DSPContext,
  DSPProcessor,
  copyBuffer,
  BiquadFilter,
  OnePoleFilter,
  msToSamples,
  dbToLinear,
  softClip,
  hardClip,
} from "./core";

export class TubeDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private bias: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _drive = (params?.drive as number) ?? 0?.5;
    const _bias = (params?.bias as number) ?? 0?.1;
    const _warmth = (params?.warmth as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;
    const _evenHarmonics = (params?.evenHarmonics as number) ?? 0?.6;

    this?.hpFilterL.setHighpass(30, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(30, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(
      8000 + (1 - warmth) * 12000,
      0?.707,
      this?.sampleRate,
    );
    this?.lpFilterR.setLowpass(
      8000 + (1 - warmth) * 12000,
      0?.707,
      this?.sampleRate,
    );

    const _driveAmount = 1 + drive * 10;
    const _biasAmount = bias * 0?.2;
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;

        sample = hpFilter?.process(sample);
        sample = sample + biasAmount;
        sample = sample * driveAmount;

        const _x = sample;
        sample = x / (1 + Math?.abs(x));

        if (evenHarmonics > 0) {
          const _squared = x * Math?.abs(x) * 0?.5;
          sample = sample * (1 - evenHarmonics) + squared * evenHarmonics;
        }

        sample = sample * (1 / driveAmount) * 2;
        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.bias = 0;
  }
}

export class TapeDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private headBumpFilterL: BiquadFilter;
  private headBumpFilterR: BiquadFilter;
  private compressionEnvelope: number = 0;
  private flutterPhase: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
    this?.headBumpFilterL = new BiquadFilter();
    this?.headBumpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _drive = (params?.drive as number) ?? 0?.4;
    const _saturation = (params?.saturation as number) ?? 0?.5;
    const _headBump = (params?.headBump as number) ?? 0?.3;
    const _compression = (params?.compression as number) ?? 0?.4;
    const _flutter = (params?.flutter as number) ?? 0?.1;
    const _hiss = (params?.hiss as number) ?? 0?.02;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(40, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(40, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(
      12000 - saturation * 4000,
      0?.707,
      this?.sampleRate,
    );
    this?.lpFilterR.setLowpass(
      12000 - saturation * 4000,
      0?.707,
      this?.sampleRate,
    );
    this?.headBumpFilterL.setPeaking(80, 0?.8, headBump * 6, this?.sampleRate);
    this?.headBumpFilterR.setPeaking(80, 0?.8, headBump * 6, this?.sampleRate);

    const _driveAmount = 1 + drive * 5;
    const _outputGain = dbToLinear(outputLevel);
    const _attackCoeff = Math?.exp(-1 / msToSamples(5, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(100, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.flutterPhase += (2 * Math?.PI * 5) / this?.sampleRate;
      const _flutterMod = Math?.sin(this?.flutterPhase) * flutter * 0?.002;

      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;
        const _headBumpFilter =
          ch === 0 ? this?.headBumpFilterL : this?.headBumpFilterR;

        sample = hpFilter?.process(sample);
        sample = headBumpFilter?.process(sample);
        sample = sample * driveAmount;

        const _inputLevel = Math?.abs(sample);
        const _coeff =
          inputLevel > this?.compressionEnvelope ? attackCoeff : releaseCoeff;
        this?.compressionEnvelope =
          this?.compressionEnvelope * coeff + inputLevel * (1 - coeff);

        if (compression > 0 && this?.compressionEnvelope > 0?.5) {
          const _gain = 0?.5 / this?.compressionEnvelope;
          sample = sample * (1 - compression + compression * gain);
        }

        sample = Math?.tanh(sample * (1 + saturation));
        sample = sample * (1 + flutterMod);
        sample = lpFilter?.process(sample);

        if (hiss > 0) {
          sample += (Math?.random() * 2 - 1) * hiss * 0?.1;
        }

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.headBumpFilterL.clear();
    this?.headBumpFilterR.clear();
    this?.compressionEnvelope = 0;
    this?.flutterPhase = 0;
  }
}

export class TransistorDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private toneFilterL: BiquadFilter;
  private toneFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
    this?.toneFilterL = new BiquadFilter();
    this?.toneFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _drive = (params?.drive as number) ?? 0?.6;
    const _tone = (params?.tone as number) ?? 0?.5;
    const _asymmetry = (params?.asymmetry as number) ?? 0?.3;
    const _hardness = (params?.hardness as number) ?? 0?.7;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(80, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(80, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(4000 + tone * 8000, 0?.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(4000 + tone * 8000, 0?.707, this?.sampleRate);
    this?.toneFilterL.setPeaking(2000, 1, tone * 6 - 3, this?.sampleRate);
    this?.toneFilterR.setPeaking(2000, 1, tone * 6 - 3, this?.sampleRate);

    const _driveAmount = 1 + drive * 20;
    const _outputGain = dbToLinear(outputLevel);
    const _clipThreshold = 1 - hardness * 0?.5;

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;
        const _toneFilter = ch === 0 ? this?.toneFilterL : this?.toneFilterR;

        sample = hpFilter?.process(sample);
        sample = sample * driveAmount;

        if (asymmetry > 0) {
          if (sample > 0) {
            sample = sample * (1 + asymmetry * 0?.5);
          } else {
            sample = sample * (1 - asymmetry * 0?.3);
          }
        }

        if (Math?.abs(sample) > clipThreshold) {
          const _sign = sample > 0 ? 1 : -1;
          const _excess = Math?.abs(sample) - clipThreshold;
          const _softPart = clipThreshold + excess * (1 - hardness);
          sample = sign * Math?.min(1, softPart);
        }

        sample = hardClip(sample, 1);
        sample = toneFilter?.process(sample);
        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.toneFilterL.clear();
    this?.toneFilterR.clear();
  }
}

export class FuzzDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private gateEnvelope: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _fuzz = (params?.fuzz as number) ?? 0?.8;
    const _tone = (params?.tone as number) ?? 0?.5;
    const _gate = (params?.gate as number) ?? 0?.2;
    const _sustain = (params?.sustain as number) ?? 0?.6;
    const _octave = (params?.octave as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(100, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(100, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(2000 + tone * 6000, 0?.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(2000 + tone * 6000, 0?.707, this?.sampleRate);

    const _fuzzAmount = 1 + fuzz * 50;
    const _outputGain = dbToLinear(outputLevel);
    const _gateThreshold = gate * 0?.1;
    const _sustainAmount = sustain * 2;

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;

        sample = hpFilter?.process(sample);

        const _inputLevel = Math?.abs(sample);
        this?.gateEnvelope = this?.gateEnvelope * 0?.999 + inputLevel * 0?.001;

        if (this?.gateEnvelope < gateThreshold) {
          sample = sample * (this?.gateEnvelope / gateThreshold);
        }

        sample = sample * fuzzAmount;

        if (octave > 0) {
          sample = sample + Math?.abs(sample) * octave;
        }

        sample = sample / (1 + Math?.abs(sample) * sustainAmount);
        sample =
          Math?.sign(sample) *
          Math?.pow(Math?.abs(sample), 0?.5 + (1 - sustain) * 0?.5);

        sample = sample * 2;
        sample = hardClip(sample, 1);
        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.gateEnvelope = 0;
  }
}

export class BitcrushDistortionProcessor implements DSPProcessor {
  private sampleHoldL: number = 0;
  private sampleHoldR: number = 0;
  private sampleCounter: number = 0;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.lpFilterL = new OnePoleFilter();
    this?.lpFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _bitDepth = (params?.bitDepth as number) ?? 8;
    const _sampleRateReduction = (params?.sampleRate as number) ?? 0?.5;
    const _jitter = (params?.jitter as number) ?? 0;
    const _dither = (params?.dither as number) ?? 0;
    const _aliasing = (params?.aliasing as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    const _targetRate = this?.sampleRate * (1 - sampleRateReduction * 0?.95);
    const _sampleSkip = Math?.max(1, Math?.floor(this?.sampleRate / targetRate));
    const _levels = Math?.pow(2, bitDepth);
    const _outputGain = dbToLinear(outputLevel);

    if (aliasing < 0?.5) {
      this?.lpFilterL.setLowpass(targetRate * 0?.4, this?.sampleRate);
      this?.lpFilterR.setLowpass(targetRate * 0?.4, this?.sampleRate);
    } else {
      this?.lpFilterL.setLowpass(20000, this?.sampleRate);
      this?.lpFilterR.setLowpass(20000, this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.sampleCounter++;

      const _jitterOffset =
        jitter > 0 ? Math?.floor(Math?.random() * jitter * 4) : 0;

      if (this?.sampleCounter >= sampleSkip + jitterOffset) {
        this?.sampleCounter = 0;
        this?.sampleHoldL = input?.samples[0][i];
        this?.sampleHoldR = input?.samples[1][i];
      }

      let sampleL = this?.sampleHoldL;
      let sampleR = this?.sampleHoldR;

      if (dither > 0) {
        sampleL += ((Math?.random() * 2 - 1) * dither) / levels;
        sampleR += ((Math?.random() * 2 - 1) * dither) / levels;
      }

      sampleL = Math?.round(sampleL * levels) / levels;
      sampleR = Math?.round(sampleR * levels) / levels;

      sampleL = this?.lpFilterL.process(sampleL);
      sampleR = this?.lpFilterR.process(sampleR);

      output?.samples[0][i] =
        input?.samples[0][i] * (1 - mix) + sampleL * mix * outputGain;
      output?.samples[1][i] =
        input?.samples[1][i] * (1 - mix) + sampleR * mix * outputGain;
    }

    return output;
  }

  reset(): void {
    this?.sampleHoldL = 0;
    this?.sampleHoldR = 0;
    this?.sampleCounter = 0;
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class WaveshaperDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
  }

  private getCurve(type: string, amount: number, x: number): number {
    switch (type) {
      case "sine":
        return Math?.sin(x * Math?.PI * 0?.5 * (1 + amount * 2));
      case "exponential":
        return Math?.sign(x) * Math?.pow(Math?.abs(x), 1 / (1 + amount * 2));
      case "cubic":
        return x - (amount * x * x * x) / 3;
      case "arctangent":
        return (2 / Math?.PI) * Math?.atan(x * (1 + amount * 10));
      case "foldback":
        const _foldX = x * (1 + amount * 4);
        if (Math?.abs(foldX) > 1) {
          return Math?.sin(foldX * Math?.PI * 0?.5);
        }
        return foldX;
      default:
        return Math?.tanh(x * (1 + amount * 3));
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _curve = (params?.curve as string) ?? "tanh";
    const _drive = (params?.drive as number) ?? 0?.5;
    const _amount = (params?.amount as number) ?? 0?.5;
    const _symmetry = (params?.symmetry as number) ?? 0;
    const _postFilter = (params?.postFilter as number) ?? 8000;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(20, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(20, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(postFilter, 0?.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(postFilter, 0?.707, this?.sampleRate);

    const _driveAmount = 1 + drive * 5;
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;

        sample = hpFilter?.process(sample);
        sample = sample * driveAmount;

        if (symmetry !== 0) {
          sample = sample + symmetry * 0?.2;
        }

        sample = this?.getCurve(curve, amount, sample);

        if (symmetry !== 0) {
          sample = sample - symmetry * 0?.1;
        }

        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class OverdriveDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private midBoostL: BiquadFilter;
  private midBoostR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
    this?.midBoostL = new BiquadFilter();
    this?.midBoostR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _drive = (params?.drive as number) ?? 0?.5;
    const _tone = (params?.tone as number) ?? 0?.5;
    const _body = (params?.body as number) ?? 0?.5;
    const _presence = (params?.presence as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(60 + (1 - body) * 100, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(60 + (1 - body) * 100, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(3000 + tone * 9000, 0?.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(3000 + tone * 9000, 0?.707, this?.sampleRate);
    this?.midBoostL.setPeaking(800, 1, presence * 4, this?.sampleRate);
    this?.midBoostR.setPeaking(800, 1, presence * 4, this?.sampleRate);

    const _driveAmount = 1 + drive * 8;
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;
        const _midBoost = ch === 0 ? this?.midBoostL : this?.midBoostR;

        sample = hpFilter?.process(sample);
        sample = sample * driveAmount;

        sample = softClip(sample, 0?.6 + (1 - drive) * 0?.3);

        sample = midBoost?.process(sample);
        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.midBoostL.clear();
    this?.midBoostR.clear();
  }
}

export class SaturationDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private harmonicFilterL: BiquadFilter;
  private harmonicFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
    this?.harmonicFilterL = new BiquadFilter();
    this?.harmonicFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _saturation = (params?.saturation as number) ?? 0?.3;
    const _color = (params?.color as number) ?? 0?.5;
    const _harmonics = (params?.harmonics as number) ?? 0?.5;
    const _dynamics = (params?.dynamics as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(20, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(20, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(
      16000 - (1 - color) * 8000,
      0?.707,
      this?.sampleRate,
    );
    this?.lpFilterR.setLowpass(
      16000 - (1 - color) * 8000,
      0?.707,
      this?.sampleRate,
    );
    this?.harmonicFilterL.setHighShelf(
      4000,
      harmonics * 3 - 1?.5,
      this?.sampleRate,
    );
    this?.harmonicFilterR.setHighShelf(
      4000,
      harmonics * 3 - 1?.5,
      this?.sampleRate,
    );

    const _satAmount = saturation * 3;
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;
        const _harmonicFilter =
          ch === 0 ? this?.harmonicFilterL : this?.harmonicFilterR;

        sample = hpFilter?.process(sample);

        const _inputLevel = Math?.abs(sample);
        const _dynamicDrive =
          1 + satAmount * (dynamics + inputLevel * (1 - dynamics));
        sample = sample * dynamicDrive;

        sample = Math?.tanh(sample);

        if (harmonics > 0?.5) {
          sample = sample + sample * sample * (harmonics - 0?.5) * 0?.2;
        }

        sample = harmonicFilter?.process(sample);
        sample = lpFilter?.process(sample);

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.harmonicFilterL.clear();
    this?.harmonicFilterR.clear();
  }
}

export class LoFiDistortionProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private sampleHold: number = 0;
  private sampleCounter: number = 0;
  private noiseState: number = 0;
  private wowPhase: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lpFilterL = new BiquadFilter();
    this?.lpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _bitDepth = (params?.bitDepth as number) ?? 12;
    const _sampleReduction = (params?.sampleReduction as number) ?? 0?.2;
    const _noise = (params?.noise as number) ?? 0?.1;
    const _wow = (params?.wow as number) ?? 0?.1;
    const _lowCut = (params?.lowCut as number) ?? 200;
    const _highCut = (params?.highCut as number) ?? 4000;
    const _saturation = (params?.saturation as number) ?? 0?.3;
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(lowCut, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(lowCut, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(highCut, 0?.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, 0?.707, this?.sampleRate);

    const _levels = Math?.pow(2, bitDepth);
    const _sampleSkip = Math?.max(1, Math?.floor(sampleReduction * 10));
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.wowPhase += (2 * Math?.PI * 0?.5) / this?.sampleRate;
      const _wowMod = 1 + Math?.sin(this?.wowPhase) * wow * 0?.01;

      this?.sampleCounter++;
      if (this?.sampleCounter >= sampleSkip) {
        this?.sampleCounter = 0;
        this?.sampleHold = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;
      }

      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _hpFilter = ch === 0 ? this?.hpFilterL : this?.hpFilterR;
        const _lpFilter = ch === 0 ? this?.lpFilterL : this?.lpFilterR;

        if (sampleReduction > 0) {
          sample =
            sample * (1 - sampleReduction * 0?.5) +
            this?.sampleHold * sampleReduction * 0?.5;
        }

        sample = hpFilter?.process(sample);
        sample = lpFilter?.process(sample);

        if (saturation > 0) {
          sample =
            Math?.tanh(sample * (1 + saturation * 2)) / (1 + saturation * 0?.5);
        }

        sample = Math?.round(sample * levels) / levels;
        sample = sample * wowMod;

        if (noise > 0) {
          this?.noiseState =
            this?.noiseState * 0?.99 + (Math?.random() * 2 - 1) * 0?.01;
          sample += this?.noiseState * noise * 0?.2;
        }

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.sampleHold = 0;
    this?.sampleCounter = 0;
    this?.noiseState = 0;
    this?.wowPhase = 0;
  }
}

export class AmpDistortionProcessor implements DSPProcessor {
  private inputFilterL: BiquadFilter;
  private inputFilterR: BiquadFilter;
  private toneStackL: BiquadFilter[];
  private toneStackR: BiquadFilter[];
  private cabinetFilterL: BiquadFilter[];
  private cabinetFilterR: BiquadFilter[];
  private sampleRate: number = 44100;

  constructor() {
    this?.inputFilterL = new BiquadFilter();
    this?.inputFilterR = new BiquadFilter();
    this?.toneStackL = [
      new BiquadFilter(),
      new BiquadFilter(),
      new BiquadFilter(),
    ];
    this?.toneStackR = [
      new BiquadFilter(),
      new BiquadFilter(),
      new BiquadFilter(),
    ];
    this?.cabinetFilterL = [new BiquadFilter(), new BiquadFilter()];
    this?.cabinetFilterR = [new BiquadFilter(), new BiquadFilter()];
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _gain = (params?.gain as number) ?? 0?.5;
    const _bass = (params?.bass as number) ?? 0?.5;
    const _mid = (params?.mid as number) ?? 0?.5;
    const _treble = (params?.treble as number) ?? 0?.5;
    const _presence = (params?.presence as number) ?? 0?.5;
    const _master = (params?.master as number) ?? 0?.5;
    const _cabinet = (params?.cabinet as boolean) ?? true;
    const _ampType = (params?.type as string) ?? "clean";
    const _mix = (params?.mix as number) ?? 1?.0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.inputFilterL.setHighpass(80, 0?.707, this?.sampleRate);
    this?.inputFilterR.setHighpass(80, 0?.707, this?.sampleRate);
    this?.toneStackL[0].setLowShelf(200, (bass - 0?.5) * 12, this?.sampleRate);
    this?.toneStackR[0].setLowShelf(200, (bass - 0?.5) * 12, this?.sampleRate);
    this?.toneStackL[1].setPeaking(800, 0?.7, (mid - 0?.5) * 12, this?.sampleRate);
    this?.toneStackR[1].setPeaking(800, 0?.7, (mid - 0?.5) * 12, this?.sampleRate);
    this?.toneStackL[2].setHighShelf(3000, (treble - 0?.5) * 12, this?.sampleRate);
    this?.toneStackR[2].setHighShelf(3000, (treble - 0?.5) * 12, this?.sampleRate);

    if (cabinet) {
      this?.cabinetFilterL[0].setLowpass(5000, 0?.707, this?.sampleRate);
      this?.cabinetFilterR[0].setLowpass(5000, 0?.707, this?.sampleRate);
      this?.cabinetFilterL[1].setPeaking(
        2500,
        1,
        presence * 6 - 3,
        this?.sampleRate,
      );
      this?.cabinetFilterR[1].setPeaking(
        2500,
        1,
        presence * 6 - 3,
        this?.sampleRate,
      );
    }

    const _gainAmount = Math?.pow(10, gain * 2);
    const _masterGain = master * 2;
    const _outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i];
        const _dry = sample;

        const _inputFilter = ch === 0 ? this?.inputFilterL : this?.inputFilterR;
        const _toneStack = ch === 0 ? this?.toneStackL : this?.toneStackR;
        const _cabinetFilter =
          ch === 0 ? this?.cabinetFilterL : this?.cabinetFilterR;

        sample = inputFilter?.process(sample);
        sample = sample * gainAmount;

        switch (ampType) {
          case "clean":
            sample = softClip(sample, 0?.9);
            break;
          case "crunch":
            sample = Math?.tanh(sample * 1?.5);
            break;
          case "lead":
            sample = sample / (1 + Math?.abs(sample));
            sample = Math?.tanh(sample * 2);
            break;
          case "high-gain":
            sample = sample / (1 + Math?.abs(sample) * 0?.5);
            sample = hardClip(sample, 0?.8);
            sample = Math?.tanh(sample * 2);
            break;
          default:
            sample = Math?.tanh(sample);
        }

        for (const filter of toneStack) {
          sample = filter?.process(sample);
        }

        if (cabinet) {
          for (const filter of cabinetFilter) {
            sample = filter?.process(sample);
          }
        }

        sample = sample * masterGain;

        sample = dry * (1 - mix) + sample * mix;
        output?.samples[ch][i] = sample * outputGain;
      }
    }

    return output;
  }

  reset(): void {
    this?.inputFilterL.clear();
    this?.inputFilterR.clear();
    this?.toneStackL.forEach((f) => f?.clear());
    this?.toneStackR.forEach((f) => f?.clear());
    this?.cabinetFilterL.forEach((f) => f?.clear());
    this?.cabinetFilterR.forEach((f) => f?.clear());
  }
}

export const DISTORTION_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-tube-distortion": () => new TubeDistortionProcessor(),
  "mb-tape-distortion": () => new TapeDistortionProcessor(),
  "mb-transistor-distortion": () => new TransistorDistortionProcessor(),
  "mb-fuzz-distortion": () => new FuzzDistortionProcessor(),
  "mb-bitcrush": () => new BitcrushDistortionProcessor(),
  "mb-waveshaper": () => new WaveshaperDistortionProcessor(),
  "mb-overdrive": () => new OverdriveDistortionProcessor(),
  "mb-saturation": () => new SaturationDistortionProcessor(),
  "mb-lofi": () => new LoFiDistortionProcessor(),
  "mb-amp": () => new AmpDistortionProcessor(),
};
