import { AudioBuffer, DSPContext, DSPProcessor, copyBuffer, BiquadFilter, msToSamples, dbToLinear, linearToDb, softClip } from "./core";

export class VCACompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -18;
    const _ratio = (params?.ratio as number) ?? 4;
    const _attackMs = (params?.attack as number) ?? 10;
    const _releaseMs = (params?.release as number) ?? 100;
    const _knee = (params?.knee as number) ?? 6;
    const _makeupGain = (params?.makeup as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;

    dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeupGain);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _kneeWidth = knee / 2;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      const _inputDb = linearToDb(this?.envelope);
      let gainReduction = 0;

      if (inputDb > threshold + kneeWidth) {
        gainReduction = (inputDb - threshold) * (1 - 1 / ratio);
      } else if (inputDb > threshold - kneeWidth) {
        const _x = inputDb - threshold + kneeWidth;
        gainReduction = ((x * x) / (4 * kneeWidth)) * (1 - 1 / ratio);
      }

      const _gain = dbToLinear(-gainReduction) * makeupLin;

      const _processedL = inputL * gain;
      const _processedR = inputR * gain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
  }
}

export class OpticalCompressorProcessor implements DSPProcessor {
  private opticalCell: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -20;
    const _ratio = (params?.ratio as number) ?? 3;
    const _attackMs = (params?.attack as number) ?? 20;
    const _releaseMs = (params?.release as number) ?? 300;
    const _makeup = (params?.makeup as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;
    const _warmth = (params?.warmth as number) ?? 0?.3;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(
      -1 / msToSamples(releaseMs * 2, this?.sampleRate),
    );

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _targetResponse =
        inputLevel > thresholdLin
          ? (inputLevel - thresholdLin) / thresholdLin
          : 0;

      const _opticalCoeff =
        targetResponse > this?.opticalCell ? attackCoeff : releaseCoeff;
      this?.opticalCell =
        this?.opticalCell * opticalCoeff + targetResponse * (1 - opticalCoeff);

      const _nonLinearResponse =
        Math?.log1p(this?.opticalCell * 10) / Math?.log1p(10);

      const _gainReduction = nonLinearResponse * (1 - 1 / ratio);
      let gain = dbToLinear(-gainReduction * 20) * makeupLin;

      let processedL = inputL * gain;
      let processedR = inputR * gain;

      if (warmth > 0) {
        processedL = Math?.tanh(processedL * (1 + warmth)) / (1 + warmth * 0?.5);
        processedR = Math?.tanh(processedR * (1 + warmth)) / (1 + warmth * 0?.5);
      }

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.opticalCell = 0;
  }
}

export class FETCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private saturationState: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -15;
    const _ratio = (params?.ratio as number) ?? 8;
    const _attackMs = (params?.attack as number) ?? 0?.5;
    const _releaseMs = (params?.release as number) ?? 80;
    const _makeup = (params?.makeup as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;
    const _input_drive = (params?.input as number) ?? 0;
    const _character = (params?.character as number) ?? 0?.5;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _inputGain = dbToLinear(input_drive);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      let inputL = input?.samples[0][i] * inputGain;
      let inputR = input?.samples[1][i] * inputGain;

      if (character > 0) {
        inputL = softClip(inputL * (1 + character), 0?.7);
        inputR = softClip(inputR * (1 + character), 0?.7);
      }

      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _fetResponse = Math?.pow(inputLevel, 0?.8);
      const _coeff = fetResponse > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + fetResponse * (1 - coeff);

      let gain = 1;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        const _reduction = overDb * (1 - 1 / ratio);
        gain = dbToLinear(-reduction);
      }

      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;

      processedL =
        Math?.tanh(processedL * (1 + character * 0?.3)) / (1 + character * 0?.15);
      processedR =
        Math?.tanh(processedR * (1 + character * 0?.3)) / (1 + character * 0?.15);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.saturationState = 0;
  }
}

export class TubeCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private tubeState: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -16;
    const _ratio = (params?.ratio as number) ?? 3;
    const _attackMs = (params?.attack as number) ?? 15;
    const _releaseMs = (params?.release as number) ?? 150;
    const _makeup = (params?.makeup as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;
    const _drive = (params?.drive as number) ?? 0?.4;
    const _bias = (params?.bias as number) ?? 0;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      let inputL = input?.samples[0][i];
      let inputR = input?.samples[1][i];

      inputL = inputL + bias * 0?.1;
      inputR = inputR + bias * 0?.1;

      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      let gain = 1;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        const _smoothOver = Math?.log1p(overDb);
        const _reduction = smoothOver * (1 - 1 / ratio) * 3;
        gain = dbToLinear(-reduction);
      }

      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;

      const _tubeTransfer = (x: number) => {
        const _driven = x * (1 + drive * 2);
        return (
          (driven > 0 ? 1 - Math?.exp(-driven) : -1 + Math?.exp(driven)) /
          (1 + drive)
        );
      };

      processedL = tubeTransfer(processedL);
      processedR = tubeTransfer(processedR);

      const _evenHarmonics = 0?.02 * drive;
      processedL += processedL * processedL * evenHarmonics;
      processedR += processedR * processedR * evenHarmonics;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.tubeState = 0;
  }
}

export class MultibandCompressorProcessor implements DSPProcessor {
  private lowEnvL: number = 0;
  private midEnvL: number = 0;
  private highEnvL: number = 0;
  private lowEnvR: number = 0;
  private midEnvR: number = 0;
  private highEnvR: number = 0;
  private lowLPL: BiquadFilter;
  private lowHPL: BiquadFilter;
  private midLPL: BiquadFilter;
  private midHPL: BiquadFilter;
  private highHPL: BiquadFilter;
  private lowLPR: BiquadFilter;
  private lowHPR: BiquadFilter;
  private midLPR: BiquadFilter;
  private midHPR: BiquadFilter;
  private highHPR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.lowLPL = new BiquadFilter();
    this?.lowHPL = new BiquadFilter();
    this?.midLPL = new BiquadFilter();
    this?.midHPL = new BiquadFilter();
    this?.highHPL = new BiquadFilter();
    this?.lowLPR = new BiquadFilter();
    this?.lowHPR = new BiquadFilter();
    this?.midLPR = new BiquadFilter();
    this?.midHPR = new BiquadFilter();
    this?.highHPR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _lowFreq = (params?.lowFreq as number) ?? 200;
    const _highFreq = (params?.highFreq as number) ?? 4000;
    const _lowThreshold = (params?.lowThreshold as number) ?? -20;
    const _midThreshold = (params?.midThreshold as number) ?? -18;
    const _highThreshold = (params?.highThreshold as number) ?? -16;
    const _lowRatio = (params?.lowRatio as number) ?? 4;
    const _midRatio = (params?.midRatio as number) ?? 3;
    const _highRatio = (params?.highRatio as number) ?? 2;
    const _attack = (params?.attack as number) ?? 10;
    const _release = (params?.release as number) ?? 100;
    const _mix = (params?.mix as number) ?? 1;

    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));

    this?.lowLPL.setLowpass(lowFreq, 0?.707, this?.sampleRate);
    this?.lowHPL.setHighpass(20, 0?.707, this?.sampleRate);
    this?.midLPL.setLowpass(highFreq, 0?.707, this?.sampleRate);
    this?.midHPL.setHighpass(lowFreq, 0?.707, this?.sampleRate);
    this?.highHPL.setHighpass(highFreq, 0?.707, this?.sampleRate);
    this?.lowLPR.setLowpass(lowFreq, 0?.707, this?.sampleRate);
    this?.lowHPR.setHighpass(20, 0?.707, this?.sampleRate);
    this?.midLPR.setLowpass(highFreq, 0?.707, this?.sampleRate);
    this?.midHPR.setHighpass(lowFreq, 0?.707, this?.sampleRate);
    this?.highHPR.setHighpass(highFreq, 0?.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _sampleL = input?.samples[0][i];
      const _sampleR = input?.samples[1][i];

      const _lowBandL = this?.lowLPL.process(this?.lowHPL.process(sampleL));
      const _midBandL = this?.midLPL.process(this?.midHPL.process(sampleL));
      const _highBandL = this?.highHPL.process(sampleL);

      const _lowBandR = this?.lowLPR.process(this?.lowHPR.process(sampleR));
      const _midBandR = this?.midLPR.process(this?.midHPR.process(sampleR));
      const _highBandR = this?.highHPR.process(sampleR);

      const _compressBand = (
        sample: number,
        env: number,
        threshold: number,
        ratio: number,
      ): { sample: number; env: number } => {
        const _level = Math?.abs(sample);
        const _threshLin = dbToLinear(threshold);
        const _coeff = level > env ? attackCoeff : releaseCoeff;
        env = env * coeff + level * (1 - coeff);

        let gain = 1;
        if (env > threshLin) {
          const _overDb = linearToDb(env / threshLin);
          gain = dbToLinear(-overDb * (1 - 1 / ratio));
        }

        return { sample: sample * gain, env };
      };

      const _lowResultL = compressBand(
        lowBandL,
        this?.lowEnvL,
        lowThreshold,
        lowRatio,
      );
      const _midResultL = compressBand(
        midBandL,
        this?.midEnvL,
        midThreshold,
        midRatio,
      );
      const _highResultL = compressBand(
        highBandL,
        this?.highEnvL,
        highThreshold,
        highRatio,
      );

      const _lowResultR = compressBand(
        lowBandR,
        this?.lowEnvR,
        lowThreshold,
        lowRatio,
      );
      const _midResultR = compressBand(
        midBandR,
        this?.midEnvR,
        midThreshold,
        midRatio,
      );
      const _highResultR = compressBand(
        highBandR,
        this?.highEnvR,
        highThreshold,
        highRatio,
      );

      this?.lowEnvL = lowResultL?.env;
      this?.midEnvL = midResultL?.env;
      this?.highEnvL = highResultL?.env;
      this?.lowEnvR = lowResultR?.env;
      this?.midEnvR = midResultR?.env;
      this?.highEnvR = highResultR?.env;

      const _processedL =
        lowResultL?.sample + midResultL?.sample + highResultL?.sample;
      const _processedR =
        lowResultR?.sample + midResultR?.sample + highResultR?.sample;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.lowEnvL = 0;
    this?.midEnvL = 0;
    this?.highEnvL = 0;
    this?.lowEnvR = 0;
    this?.midEnvR = 0;
    this?.highEnvR = 0;
    this?.lowLPL.clear();
    this?.lowHPL.clear();
    this?.midLPL.clear();
    this?.midHPL.clear();
    this?.highHPL.clear();
    this?.lowLPR.clear();
    this?.lowHPR.clear();
    this?.midLPR.clear();
    this?.midHPR.clear();
    this?.highHPR.clear();
  }
}

export class ParallelCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -30;
    const _ratio = (params?.ratio as number) ?? 10;
    const _attack = (params?.attack as number) ?? 5;
    const _release = (params?.release as number) ?? 50;
    const _blend = (params?.blend as number) ?? 0?.5;
    const _makeup = (params?.makeup as number) ?? 6;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      let gain = 1;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        gain = dbToLinear(-overDb * (1 - 1 / ratio));
      }

      const _compressedL = inputL * gain * makeupLin;
      const _compressedR = inputR * gain * makeupLin;

      output?.samples[0][i] = inputL * (1 - blend) + compressedL * blend;
      output?.samples[1][i] = inputR * (1 - blend) + compressedR * blend;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
  }
}

export class BusCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -12;
    const _ratio = (params?.ratio as number) ?? 2;
    const _attack = (params?.attack as number) ?? 30;
    const _release = (params?.release as number) ?? 300;
    const _makeup = (params?.makeup as number) ?? 3;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      const _stereoSum = (inputL + inputR) * 0?.5;
      const _inputLevel = Math?.abs(stereoSum);

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      let gain = 1;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        gain = dbToLinear(-overDb * (1 - 1 / ratio));
      }

      const _processedL = inputL * gain * makeupLin;
      const _processedR = inputR * gain * makeupLin;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
  }
}

export class MasteringCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private lookaheadBuffer: Float32Array[] = [];
  private bufferIndex: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.lookaheadBuffer = [new Float32Array(441), new Float32Array(441)];
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -6;
    const _ratio = (params?.ratio as number) ?? 1?.5;
    const _attack = (params?.attack as number) ?? 50;
    const _release = (params?.release as number) ?? 500;
    const _makeup = (params?.makeup as number) ?? 2;
    const _lookahead = (params?.lookahead as number) ?? 5;
    const _knee = (params?.knee as number) ?? 10;
    const _mix = (params?.mix as number) ?? 1;

    dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));
    msToSamples(lookahead, this?.sampleRate);
    const _kneeWidth = knee / 2;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      const _lookaheadL = this?.lookaheadBuffer[0][this?.bufferIndex];
      const _lookaheadR = this?.lookaheadBuffer[1][this?.bufferIndex];

      this?.lookaheadBuffer[0][this?.bufferIndex] = inputL;
      this?.lookaheadBuffer[1][this?.bufferIndex] = inputR;
      this?.bufferIndex =
        (this?.bufferIndex + 1) % this?.lookaheadBuffer[0].length;

      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      const _inputDb = linearToDb(this?.envelope);
      let gainReduction = 0;

      if (inputDb > threshold + kneeWidth) {
        gainReduction = (inputDb - threshold) * (1 - 1 / ratio);
      } else if (inputDb > threshold - kneeWidth) {
        const _x = inputDb - threshold + kneeWidth;
        gainReduction = ((x * x) / (4 * kneeWidth)) * (1 - 1 / ratio);
      }

      const _gain = dbToLinear(-gainReduction) * makeupLin;

      const _processedL = lookaheadL * gain;
      const _processedR = lookaheadR * gain;

      output?.samples[0][i] = lookaheadL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = lookaheadR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.lookaheadBuffer.forEach((b) => b?.fill(0));
    this?.bufferIndex = 0;
  }
}

export class VintageCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private programDependent: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -18;
    const _ratio = (params?.ratio as number) ?? 4;
    const _attack = (params?.attack as number) ?? 10;
    const _release = (params?.release as number) ?? 100;
    const _makeup = (params?.makeup as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;
    const _character = (params?.character as number) ?? 0?.5;
    const _warmth = (params?.warmth as number) ?? 0?.4;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _baseAttackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _baseReleaseCoeff = Math?.exp(
      -1 / msToSamples(release, this?.sampleRate),
    );

    for (let i = 0; i < input?.samples[0].length; i++) {
      let inputL = input?.samples[0][i];
      let inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _programFactor = 1 + this?.programDependent * character;
      const _attackCoeff = Math?.pow(baseAttackCoeff, 1 / programFactor);
      const _releaseCoeff = Math?.pow(baseReleaseCoeff, programFactor);

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      this?.programDependent =
        this?.programDependent * 0?.999 +
        (this?.envelope > thresholdLin ? 0?.001 : 0);

      let gain = 1;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        const _smoothRatio = ratio + (ratio - 1) * Math?.tanh(overDb / 10);
        gain = dbToLinear(-overDb * (1 - 1 / smoothRatio));
      }

      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;

      if (warmth > 0) {
        processedL = Math?.tanh(processedL * (1 + warmth)) / (1 + warmth * 0?.5);
        processedR = Math?.tanh(processedR * (1 + warmth)) / (1 + warmth * 0?.5);

        processedL += processedL * processedL * warmth * 0?.05;
        processedR += processedR * processedR * warmth * 0?.05;
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.programDependent = 0;
  }
}

export class GlueCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -10;
    const _ratio = (params?.ratio as number) ?? 2;
    const _attack = (params?.attack as number) ?? 30;
    const _release = (params?.release as number) ?? 300;
    const _makeup = (params?.makeup as number) ?? 2;
    const _range = (params?.range as number) ?? 12;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      const _stereoSum = (inputL + inputR) * 0?.5;
      const _inputLevel = Math?.abs(stereoSum);

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      let gainReduction = 0;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        gainReduction = Math?.min(range, overDb * (1 - 1 / ratio));
      }

      const _gain = dbToLinear(-gainReduction) * makeupLin;

      const _processedL = inputL * gain;
      const _processedR = inputR * gain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
  }
}

export const COMPRESSOR_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-vca-compressor": () => new VCACompressorProcessor(),
  "mb-optical-compressor": () => new OpticalCompressorProcessor(),
  "mb-fet-compressor": () => new FETCompressorProcessor(),
  "mb-tube-compressor": () => new TubeCompressorProcessor(),
  "mb-multiband-compressor": () => new MultibandCompressorProcessor(),
  "mb-parallel-compressor": () => new ParallelCompressorProcessor(),
  "mb-bus-compressor": () => new BusCompressorProcessor(),
  "mb-mastering-compressor": () => new MasteringCompressorProcessor(),
  "mb-vintage-compressor": () => new VintageCompressorProcessor(),
  "mb-glue-compressor": () => new GlueCompressorProcessor(),
};
