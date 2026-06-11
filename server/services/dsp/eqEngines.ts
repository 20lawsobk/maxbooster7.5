import {
  AudioBuffer,
  DSPContext,
  DSPProcessor,
  copyBuffer,
  BiquadFilter,
  EnvelopeFollower,
  dbToLinear,
} from "./core";

export class ParametricEQProcessor implements DSPProcessor {
  private bandsL: BiquadFilter[] = [];
  private bandsR: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this?.bandsL.push(new BiquadFilter());
      this?.bandsR.push(new BiquadFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _hpFreq = (params?.hpFreq as number) ?? 20;
    const _hpEnabled = (params?.hpEnabled as boolean) ?? false;
    const _lpFreq = (params?.lpFreq as number) ?? 20000;
    const _lpEnabled = (params?.lpEnabled as boolean) ?? false;
    const _band1Freq = (params?.band1Freq as number) ?? 100;
    const _band1Gain = (params?.band1Gain as number) ?? 0;
    const _band1Q = (params?.band1Q as number) ?? 1;
    const _band2Freq = (params?.band2Freq as number) ?? 500;
    const _band2Gain = (params?.band2Gain as number) ?? 0;
    const _band2Q = (params?.band2Q as number) ?? 1;
    const _band3Freq = (params?.band3Freq as number) ?? 2000;
    const _band3Gain = (params?.band3Gain as number) ?? 0;
    const _band3Q = (params?.band3Q as number) ?? 1;
    const _band4Freq = (params?.band4Freq as number) ?? 8000;
    const _band4Gain = (params?.band4Gain as number) ?? 0;
    const _band4Q = (params?.band4Q as number) ?? 1;
    const _outputGain = (params?.output as number) ?? 0;

    if (hpEnabled) {
      this?.bandsL[0].setHighpass(hpFreq, 0.707, this?.sampleRate);
      this?.bandsR[0].setHighpass(hpFreq, 0.707, this?.sampleRate);
    }
    if (lpEnabled) {
      this?.bandsL[1].setLowpass(lpFreq, 0.707, this?.sampleRate);
      this?.bandsR[1].setLowpass(lpFreq, 0.707, this?.sampleRate);
    }
    this?.bandsL[2].setPeaking(band1Freq, band1Q, band1Gain, this?.sampleRate);
    this?.bandsR[2].setPeaking(band1Freq, band1Q, band1Gain, this?.sampleRate);
    this?.bandsL[3].setPeaking(band2Freq, band2Q, band2Gain, this?.sampleRate);
    this?.bandsR[3].setPeaking(band2Freq, band2Q, band2Gain, this?.sampleRate);
    this?.bandsL[4].setPeaking(band3Freq, band3Q, band3Gain, this?.sampleRate);
    this?.bandsR[4].setPeaking(band3Freq, band3Q, band3Gain, this?.sampleRate);
    this?.bandsL[5].setPeaking(band4Freq, band4Q, band4Gain, this?.sampleRate);
    this?.bandsR[5].setPeaking(band4Freq, band4Q, band4Gain, this?.sampleRate);

    const _outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      if (hpEnabled) {
        sampleL = this?.bandsL[0].process(sampleL);
        sampleR = this?.bandsR[0].process(sampleR);
      }
      if (lpEnabled) {
        sampleL = this?.bandsL[1].process(sampleL);
        sampleR = this?.bandsR[1].process(sampleR);
      }

      for (let b = 2; b <= 5; b++) {
        sampleL = this?.bandsL[b].process(sampleL);
        sampleR = this?.bandsR[b].process(sampleR);
      }

      output?.samples[0][i] = sampleL * outGainLin;
      output?.samples[1][i] = sampleR * outGainLin;
    }

    return output;
  }

  reset(): void {
    this?.bandsL.forEach((b) => b?.clear());
    this?.bandsR.forEach((b) => b?.clear());
  }
}

export class GraphicEQProcessor implements DSPProcessor {
  private bandsL: BiquadFilter[] = [];
  private bandsR: BiquadFilter[] = [];
  private frequencies: number[] = [
    31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
  ];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 10; i++) {
      this?.bandsL.push(new BiquadFilter());
      this?.bandsR.push(new BiquadFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _gains = [
      (params?.band31 as number) ?? 0,
      (params?.band63 as number) ?? 0,
      (params?.band125 as number) ?? 0,
      (params?.band250 as number) ?? 0,
      (params?.band500 as number) ?? 0,
      (params?.band1k as number) ?? 0,
      (params?.band2k as number) ?? 0,
      (params?.band4k as number) ?? 0,
      (params?.band8k as number) ?? 0,
      (params?.band16k as number) ?? 0,
    ];
    const _q = (params?.q as number) ?? 1.4;

    for (let b = 0; b < 10; b++) {
      this?.bandsL[b].setPeaking(
        this?.frequencies[b],
        q,
        gains[b],
        this?.sampleRate,
      );
      this?.bandsR[b].setPeaking(
        this?.frequencies[b],
        q,
        gains[b],
        this?.sampleRate,
      );
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      for (let b = 0; b < 10; b++) {
        sampleL = this?.bandsL[b].process(sampleL);
        sampleR = this?.bandsR[b].process(sampleR);
      }

      output?.samples[0][i] = sampleL;
      output?.samples[1][i] = sampleR;
    }

    return output;
  }

  reset(): void {
    this?.bandsL.forEach((b) => b?.clear());
    this?.bandsR.forEach((b) => b?.clear());
  }
}

export class VintageEQProcessor implements DSPProcessor {
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private midPeakL: BiquadFilter;
  private midPeakR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private presenceL: BiquadFilter;
  private presenceR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.midPeakL = new BiquadFilter();
    this.midPeakR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
    this.presenceL = new BiquadFilter();
    this.presenceR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _low = (params?.low as number) ?? 0;
    const _lowFreq = (params?.lowFreq as number) ?? 100;
    const _mid = (params?.mid as number) ?? 0;
    const _midFreq = (params?.midFreq as number) ?? 1000;
    const _high = (params?.high as number) ?? 0;
    const _highFreq = (params?.highFreq as number) ?? 8000;
    const _drive = (params?.drive as number) ?? 0.2;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.lowShelfL.setLowShelf(lowFreq, low, this?.sampleRate);
    this?.lowShelfR.setLowShelf(lowFreq, low, this?.sampleRate);
    this?.midPeakL.setPeaking(midFreq, 0.7, mid, this?.sampleRate);
    this?.midPeakR.setPeaking(midFreq, 0.7, mid, this?.sampleRate);
    this?.highShelfL.setHighShelf(highFreq, high, this?.sampleRate);
    this?.highShelfR.setHighShelf(highFreq, high, this?.sampleRate);
    this?.presenceL.setPeaking(3500, 1.5, high * 0.3, this?.sampleRate);
    this?.presenceR.setPeaking(3500, 1.5, high * 0.3, this?.sampleRate);

    const _outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      if (drive > 0) {
        sampleL = Math?.tanh(sampleL * (1 + drive * 2)) / (1 + drive);
        sampleR = Math?.tanh(sampleR * (1 + drive * 2)) / (1 + drive);
      }

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);
      sampleL = this?.midPeakL.process(sampleL);
      sampleR = this?.midPeakR.process(sampleR);
      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);
      sampleL = this?.presenceL.process(sampleL);
      sampleR = this?.presenceR.process(sampleR);

      output?.samples[0][i] = sampleL * outGain;
      output?.samples[1][i] = sampleR * outGain;
    }

    return output;
  }

  reset(): void {
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.midPeakL.clear();
    this?.midPeakR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
    this?.presenceL.clear();
    this?.presenceR.clear();
  }
}

export class LinearPhaseEQProcessor implements DSPProcessor {
  private fftSize: number = 2048;
  private buffer: Float32Array[] = [];
  private outputBuffer: Float32Array[] = [];
  private position: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.buffer = [
      new Float32Array(this?.fftSize),
      new Float32Array(this?.fftSize),
    ];
    this.outputBuffer = [
      new Float32Array(this?.fftSize),
      new Float32Array(this?.fftSize),
    ];
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _lowGain = dbToLinear((params?.lowGain as number) ?? 0);
    const _lowFreq = (params?.lowFreq as number) ?? 100;
    const _midGain = dbToLinear((params?.midGain as number) ?? 0);
    const _midFreq = (params?.midFreq as number) ?? 1000;
    const _highGain = dbToLinear((params?.highGain as number) ?? 0);
    const _highFreq = (params?.highFreq as number) ?? 8000;

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.buffer[0][this?.position] = input?.samples[0][i];
      this?.buffer[1][this?.position] = input?.samples[1][i];


      let freqNorm = ((this?.position / this?.fftSize) * this?.sampleRate) / 2;
      let gain = 1;

      if (freqNorm < lowFreq) {
        gain *= lowGain;
      } else if (freqNorm < midFreq) {
        const _t = (freqNorm - lowFreq) / (midFreq - lowFreq);
        gain *= lowGain * (1 - t) + midGain * t;
      } else if (freqNorm < highFreq) {
        const _t = (freqNorm - midFreq) / (highFreq - midFreq);
        gain *= midGain * (1 - t) + highGain * t;
      } else {
        gain *= highGain;
      }

      output?.samples[0][i] = input?.samples[0][i] * gain;
      output?.samples[1][i] = input?.samples[1][i] * gain;

      this.position = (this?.position + 1) % this?.fftSize;
    }

    return output;
  }

  reset(): void {
    this?.buffer.forEach((b) => b?.fill(0));
    this?.outputBuffer.forEach((b) => b?.fill(0));
    this.position = 0;
  }
}

export class DynamicEQProcessor implements DSPProcessor {
  private bandsL: BiquadFilter[] = [];
  private bandsR: BiquadFilter[] = [];
  private envelopes: EnvelopeFollower[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this?.bandsL.push(new BiquadFilter());
      this?.bandsR.push(new BiquadFilter());
      this?.envelopes.push(new EnvelopeFollower(10, 100, 44100));
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _frequencies = [
      (params?.freq1 as number) ?? 200,
      (params?.freq2 as number) ?? 1000,
      (params?.freq3 as number) ?? 4000,
      (params?.freq4 as number) ?? 10000,
    ];
    const _thresholds = [
      dbToLinear((params?.thresh1 as number) ?? -20),
      dbToLinear((params?.thresh2 as number) ?? -20),
      dbToLinear((params?.thresh3 as number) ?? -20),
      dbToLinear((params?.thresh4 as number) ?? -20),
    ];
    const _gains = [
      (params?.gain1 as number) ?? -6,
      (params?.gain2 as number) ?? -6,
      (params?.gain3 as number) ?? -6,
      (params?.gain4 as number) ?? -6,
    ];
    const _q = (params?.q as number) ?? 2;

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];
      const _mono = (sampleL + sampleR) * 0.5;

      for (let b = 0; b < 4; b++) {
        const _level = this?.envelopes[b].process(mono);
        const _dynamicGain =
          level > thresholds[b]
            ? gains[b] * Math?.min(1, (level - thresholds[b]) / thresholds[b])
            : 0;

        this?.bandsL[b].setPeaking(
          frequencies[b],
          q,
          dynamicGain,
          this?.sampleRate,
        );
        this?.bandsR[b].setPeaking(
          frequencies[b],
          q,
          dynamicGain,
          this?.sampleRate,
        );
        sampleL = this?.bandsL[b].process(sampleL);
        sampleR = this?.bandsR[b].process(sampleR);
      }

      output?.samples[0][i] = sampleL;
      output?.samples[1][i] = sampleR;
    }

    return output;
  }

  reset(): void {
    this?.bandsL.forEach((b) => b?.clear());
    this?.bandsR.forEach((b) => b?.clear());
    this?.envelopes.forEach((e) => e?.clear());
  }
}

export class SurgicalEQProcessor implements DSPProcessor {
  private bandsL: BiquadFilter[] = [];
  private bandsR: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this?.bandsL.push(new BiquadFilter());
      this?.bandsR.push(new BiquadFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _configs = [];
    for (let i = 1; i <= 8; i++) {
      configs?.push({
        freq: (params[`freq${i}`] as number) ?? 1000,
        gain: (params[`gain${i}`] as number) ?? 0,
        q: (params[`q${i}`] as number) ?? 10,
        enabled: (params[`enabled${i}`] as boolean) ?? i <= 4,
      });
    }

    for (let b = 0; b < 8; b++) {
      if (configs[b].enabled) {
        this?.bandsL[b].setPeaking(
          configs[b].freq,
          configs[b].q,
          configs[b].gain,
          this?.sampleRate,
        );
        this?.bandsR[b].setPeaking(
          configs[b].freq,
          configs[b].q,
          configs[b].gain,
          this?.sampleRate,
        );
      }
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      for (let b = 0; b < 8; b++) {
        if (configs[b].enabled && configs[b].gain !== 0) {
          sampleL = this?.bandsL[b].process(sampleL);
          sampleR = this?.bandsR[b].process(sampleR);
        }
      }

      output?.samples[0][i] = sampleL;
      output?.samples[1][i] = sampleR;
    }

    return output;
  }

  reset(): void {
    this?.bandsL.forEach((b) => b?.clear());
    this?.bandsR.forEach((b) => b?.clear());
  }
}

export class AnalogEQProcessor implements DSPProcessor {
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private lowMidL: BiquadFilter;
  private lowMidR: BiquadFilter;
  private highMidL: BiquadFilter;
  private highMidR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.lowMidL = new BiquadFilter();
    this.lowMidR = new BiquadFilter();
    this.highMidL = new BiquadFilter();
    this.highMidR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _lowGain = (params?.low as number) ?? 0;
    const _lowFreq = (params?.lowFreq as number) ?? 80;
    const _lowMidGain = (params?.lowMid as number) ?? 0;
    const _lowMidFreq = (params?.lowMidFreq as number) ?? 400;
    const _highMidGain = (params?.highMid as number) ?? 0;
    const _highMidFreq = (params?.highMidFreq as number) ?? 2500;
    const _highGain = (params?.high as number) ?? 0;
    const _highFreq = (params?.highFreq as number) ?? 10000;
    const _drive = (params?.drive as number) ?? 0.3;

    this?.lowShelfL.setLowShelf(lowFreq, lowGain, this?.sampleRate);
    this?.lowShelfR.setLowShelf(lowFreq, lowGain, this?.sampleRate);
    this?.lowMidL.setPeaking(lowMidFreq, 0.7, lowMidGain, this?.sampleRate);
    this?.lowMidR.setPeaking(lowMidFreq, 0.7, lowMidGain, this?.sampleRate);
    this?.highMidL.setPeaking(highMidFreq, 0.7, highMidGain, this?.sampleRate);
    this?.highMidR.setPeaking(highMidFreq, 0.7, highMidGain, this?.sampleRate);
    this?.highShelfL.setHighShelf(highFreq, highGain, this?.sampleRate);
    this?.highShelfR.setHighShelf(highFreq, highGain, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);
      sampleL = this?.lowMidL.process(sampleL);
      sampleR = this?.lowMidR.process(sampleR);
      sampleL = this?.highMidL.process(sampleL);
      sampleR = this?.highMidR.process(sampleR);
      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);

      if (drive > 0) {
        sampleL = Math?.tanh(sampleL * (1 + drive)) / (1 + drive * 0.5);
        sampleR = Math?.tanh(sampleR * (1 + drive)) / (1 + drive * 0.5);

        sampleL += sampleL * sampleL * drive * 0.02;
        sampleR += sampleR * sampleR * drive * 0.02;
      }

      output?.samples[0][i] = sampleL;
      output?.samples[1][i] = sampleR;
    }

    return output;
  }

  reset(): void {
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.lowMidL.clear();
    this?.lowMidR.clear();
    this?.highMidL.clear();
    this?.highMidR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
  }
}

export class MasteringEQProcessor implements DSPProcessor {
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private lowMidL: BiquadFilter;
  private lowMidR: BiquadFilter;
  private midL: BiquadFilter;
  private midR: BiquadFilter;
  private highMidL: BiquadFilter;
  private highMidR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private airL: BiquadFilter;
  private airR: BiquadFilter;
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.lowMidL = new BiquadFilter();
    this.lowMidR = new BiquadFilter();
    this.midL = new BiquadFilter();
    this.midR = new BiquadFilter();
    this.highMidL = new BiquadFilter();
    this.highMidR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
    this.airL = new BiquadFilter();
    this.airR = new BiquadFilter();
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
    this.lpFilterL = new BiquadFilter();
    this.lpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _hpFreq = (params?.hpFreq as number) ?? 20;
    const _lpFreq = (params?.lpFreq as number) ?? 20000;
    const _lowGain = (params?.low as number) ?? 0;
    const _lowMidGain = (params?.lowMid as number) ?? 0;
    const _midGain = (params?.mid as number) ?? 0;
    const _highMidGain = (params?.highMid as number) ?? 0;
    const _highGain = (params?.high as number) ?? 0;
    const _airGain = (params?.air as number) ?? 0;
    const _outputLevel = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(hpFreq, 0.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(lpFreq, 0.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(lpFreq, 0.707, this?.sampleRate);
    this?.lowShelfL.setLowShelf(80, lowGain, this?.sampleRate);
    this?.lowShelfR.setLowShelf(80, lowGain, this?.sampleRate);
    this?.lowMidL.setPeaking(250, 0.7, lowMidGain, this?.sampleRate);
    this?.lowMidR.setPeaking(250, 0.7, lowMidGain, this?.sampleRate);
    this?.midL.setPeaking(1000, 0.7, midGain, this?.sampleRate);
    this?.midR.setPeaking(1000, 0.7, midGain, this?.sampleRate);
    this?.highMidL.setPeaking(4000, 0.7, highMidGain, this?.sampleRate);
    this?.highMidR.setPeaking(4000, 0.7, highMidGain, this?.sampleRate);
    this?.highShelfL.setHighShelf(8000, highGain, this?.sampleRate);
    this?.highShelfR.setHighShelf(8000, highGain, this?.sampleRate);
    this?.airL.setHighShelf(16000, airGain, this?.sampleRate);
    this?.airR.setHighShelf(16000, airGain, this?.sampleRate);

    const _outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);
      sampleL = this?.lpFilterL.process(sampleL);
      sampleR = this?.lpFilterR.process(sampleR);

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);
      sampleL = this?.lowMidL.process(sampleL);
      sampleR = this?.lowMidR.process(sampleR);
      sampleL = this?.midL.process(sampleL);
      sampleR = this?.midR.process(sampleR);
      sampleL = this?.highMidL.process(sampleL);
      sampleR = this?.highMidR.process(sampleR);
      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);
      sampleL = this?.airL.process(sampleL);
      sampleR = this?.airR.process(sampleR);

      output?.samples[0][i] = sampleL * outGain;
      output?.samples[1][i] = sampleR * outGain;
    }

    return output;
  }

  reset(): void {
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.lowMidL.clear();
    this?.lowMidR.clear();
    this?.midL.clear();
    this?.midR.clear();
    this?.highMidL.clear();
    this?.highMidR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
    this?.airL.clear();
    this?.airR.clear();
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class MidSideEQProcessor implements DSPProcessor {
  private midLow: BiquadFilter;
  private midMid: BiquadFilter;
  private midHigh: BiquadFilter;
  private sideLow: BiquadFilter;
  private sideMid: BiquadFilter;
  private sideHigh: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.midLow = new BiquadFilter();
    this.midMid = new BiquadFilter();
    this.midHigh = new BiquadFilter();
    this.sideLow = new BiquadFilter();
    this.sideMid = new BiquadFilter();
    this.sideHigh = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _midLowGain = (params?.midLow as number) ?? 0;
    const _midMidGain = (params?.midMid as number) ?? 0;
    const _midHighGain = (params?.midHigh as number) ?? 0;
    const _sideLowGain = (params?.sideLow as number) ?? 0;
    const _sideMidGain = (params?.sideMid as number) ?? 0;
    const _sideHighGain = (params?.sideHigh as number) ?? 0;
    const _width = (params?.width as number) ?? 1;

    this?.midLow.setLowShelf(150, midLowGain, this?.sampleRate);
    this?.midMid.setPeaking(1000, 1, midMidGain, this?.sampleRate);
    this?.midHigh.setHighShelf(6000, midHighGain, this?.sampleRate);
    this?.sideLow.setLowShelf(150, sideLowGain, this?.sampleRate);
    this?.sideMid.setPeaking(1000, 1, sideMidGain, this?.sampleRate);
    this?.sideHigh.setHighShelf(6000, sideHighGain, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _left = input?.samples[0][i];
      const _right = input?.samples[1][i];

      let mid = (left + right) * 0.5;
      let side = (left - right) * 0.5;

      mid = this?.midLow.process(mid);
      mid = this?.midMid.process(mid);
      mid = this?.midHigh.process(mid);

      side = this?.sideLow.process(side);
      side = this?.sideMid.process(side);
      side = this?.sideHigh.process(side);

      side *= width;

      output?.samples[0][i] = mid + side;
      output?.samples[1][i] = mid - side;
    }

    return output;
  }

  reset(): void {
    this?.midLow.clear();
    this?.midMid.clear();
    this?.midHigh.clear();
    this?.sideLow.clear();
    this?.sideMid.clear();
    this?.sideHigh.clear();
  }
}

export class TiltEQProcessor implements DSPProcessor {
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private highShelfL: BiquadFilter;
  private highShelfR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelfL = new BiquadFilter();
    this.lowShelfR = new BiquadFilter();
    this.highShelfL = new BiquadFilter();
    this.highShelfR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _tilt = (params?.tilt as number) ?? 0;
    const _centerFreq = (params?.centerFreq as number) ?? 1000;
    const _outputLevel = (params?.output as number) ?? 0;

    const _lowGain = -tilt;
    const _highGain = tilt;

    this?.lowShelfL.setLowShelf(centerFreq * 0.5, lowGain, this?.sampleRate);
    this?.lowShelfR.setLowShelf(centerFreq * 0.5, lowGain, this?.sampleRate);
    this?.highShelfL.setHighShelf(centerFreq * 2, highGain, this?.sampleRate);
    this?.highShelfR.setHighShelf(centerFreq * 2, highGain, this?.sampleRate);

    const _outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);
      sampleL = this?.highShelfL.process(sampleL);
      sampleR = this?.highShelfR.process(sampleR);

      output?.samples[0][i] = sampleL * outGain;
      output?.samples[1][i] = sampleR * outGain;
    }

    return output;
  }

  reset(): void {
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.highShelfL.clear();
    this?.highShelfR.clear();
  }
}

export const EQ_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-parametric-eq": () => new ParametricEQProcessor(),
  "mb-graphic-eq": () => new GraphicEQProcessor(),
  "mb-vintage-eq": () => new VintageEQProcessor(),
  "mb-linear-phase-eq": () => new LinearPhaseEQProcessor(),
  "mb-dynamic-eq": () => new DynamicEQProcessor(),
  "mb-surgical-eq": () => new SurgicalEQProcessor(),
  "mb-analog-eq": () => new AnalogEQProcessor(),
  "mb-mastering-eq": () => new MasteringEQProcessor(),
  "mb-midside-eq": () => new MidSideEQProcessor(),
  "mb-tilt-eq": () => new TiltEQProcessor(),
};
