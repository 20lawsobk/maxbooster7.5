import {
  AudioBuffer,
  DSPContext,
  DSPProcessor,
  copyBuffer,
  BiquadFilter,
  OnePoleFilter,
  msToSamples,
  dbToLinear,
  linearToDb,
  clamp,
  softClip,
} from "./core";

export class GateProcessor implements DSPProcessor {
  private envelope: number = 0;
  private gateState: "closed" | "opening" | "open" | "hold" | "closing" =
    "closed";
  private holdCounter: number = 0;
  private releaseCounter: number = 0;
  private hysteresisState: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -40;
    const _hysteresis = (params?.hysteresis as number) ?? 4;
    const _attackMs = (params?.attack as number) ?? 0?.5;
    const _holdMs = (params?.hold as number) ?? 50;
    const _releaseMs = (params?.release as number) ?? 100;
    const _range = (params?.range as number) ?? -80;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _hysteresisLin = dbToLinear(threshold - hysteresis);
    const _rangeLin = dbToLinear(range);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _holdSamples = msToSamples(holdMs, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      this?.envelope = this?.envelope * 0?.9995 + inputLevel * 0?.0005;

      if (inputLevel > thresholdLin) {
        this?.gateState = "open";
        this?.holdCounter = holdSamples;
      } else if (inputLevel < hysteresisLin && this?.gateState === "open") {
        this?.gateState = "hold";
      }

      if (this?.gateState === "hold") {
        this?.holdCounter--;
        if (this?.holdCounter <= 0) {
          this?.gateState = "closing";
        }
      }

      let targetGain: number;
      switch (this?.gateState) {
        case "open":
          targetGain = 1;
          break;
        case "closing":
        case "closed":
          targetGain = rangeLin;
          if (this?.hysteresisState <= rangeLin + 0?.001) {
            this?.gateState = "closed";
          }
          break;
        default:
          targetGain = this?.hysteresisState;
      }

      const _coeff =
        targetGain > this?.hysteresisState ? attackCoeff : releaseCoeff;
      this?.hysteresisState =
        this?.hysteresisState * coeff + targetGain * (1 - coeff);

      const _processedL = inputL * this?.hysteresisState;
      const _processedR = inputR * this?.hysteresisState;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.gateState = "closed";
    this?.holdCounter = 0;
    this?.releaseCounter = 0;
    this?.hysteresisState = 0;
  }
}

export class ExpanderProcessor implements DSPProcessor {
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
    const _ratio = (params?.ratio as number) ?? 2;
    const _attackMs = (params?.attack as number) ?? 5;
    const _releaseMs = (params?.release as number) ?? 50;
    const _knee = (params?.knee as number) ?? 6;
    const _range = (params?.range as number) ?? -40;
    const _mix = (params?.mix as number) ?? 1;

    dbToLinear(threshold);
    dbToLinear(range);
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

      if (inputDb < threshold - kneeWidth) {
        gainReduction = (threshold - inputDb) * (ratio - 1);
      } else if (inputDb < threshold + kneeWidth) {
        const _x = threshold - inputDb + kneeWidth;
        gainReduction = ((x * x) / (4 * kneeWidth)) * (ratio - 1);
      }

      gainReduction = Math?.min(gainReduction, -range);

      const _gain = dbToLinear(-gainReduction);

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

export class DeEsserProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sibilanceFilter: BiquadFilter;
  private listenFilterL: BiquadFilter;
  private listenFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.sibilanceFilter = new BiquadFilter();
    this?.listenFilterL = new BiquadFilter();
    this?.listenFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _frequency = (params?.frequency as number) ?? 6000;
    const _threshold = (params?.threshold as number) ?? -20;
    const _ratio = (params?.ratio as number) ?? 4;
    const _attackMs = (params?.attack as number) ?? 0?.5;
    const _releaseMs = (params?.release as number) ?? 50;
    const _range = (params?.range as number) ?? -12;
    const _bandwidth = (params?.bandwidth as number) ?? 2;
    const _listenMode = (params?.listen as boolean) ?? false;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));

    this?.sibilanceFilter.setBandpass(frequency, bandwidth, this?.sampleRate);
    this?.listenFilterL.setPeaking(
      frequency,
      bandwidth,
      -range,
      this?.sampleRate,
    );
    this?.listenFilterR.setPeaking(
      frequency,
      bandwidth,
      -range,
      this?.sampleRate,
    );

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _mono = (inputL + inputR) * 0?.5;

      const _sibilance = this?.sibilanceFilter.process(mono);
      const _sibilanceLevel = Math?.abs(sibilance);

      const _coeff = sibilanceLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + sibilanceLevel * (1 - coeff);

      let gainReduction = 0;
      if (this?.envelope > thresholdLin) {
        const _overDb = linearToDb(this?.envelope / thresholdLin);
        gainReduction = Math?.min(-range, overDb * (1 - 1 / ratio));
      }

      if (listenMode) {
        output?.samples[0][i] = sibilance;
        output?.samples[1][i] = sibilance;
      } else {
        const _gain = dbToLinear(-gainReduction);

        const _processedL =
          this?.listenFilterL.process(inputL) * gain + inputL * (1 - gain);
        const _processedR =
          this?.listenFilterR.process(inputR) * gain + inputR * (1 - gain);

        output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
        output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
      }
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.sibilanceFilter.clear();
    this?.listenFilterL.clear();
    this?.listenFilterR.clear();
  }
}

export class TransientShaperProcessor implements DSPProcessor {
  private fastEnvelope: number = 0;
  private slowEnvelope: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _attack = (params?.attack as number) ?? 0;
    const _sustain = (params?.sustain as number) ?? 0;
    const _sensitivity = (params?.sensitivity as number) ?? 50;
    const _outputGain = (params?.output as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;

    const _fastAttack = Math?.exp(-1 / msToSamples(0?.1, this?.sampleRate));
    const _fastRelease = Math?.exp(-1 / msToSamples(5, this?.sampleRate));
    const _slowAttack = Math?.exp(-1 / msToSamples(50, this?.sampleRate));
    const _slowRelease = Math?.exp(-1 / msToSamples(200, this?.sampleRate));
    const _outputLin = dbToLinear(outputGain);
    const _sensitivityFactor = sensitivity / 100;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _fastCoeff =
        inputLevel > this?.fastEnvelope ? fastAttack : fastRelease;
      this?.fastEnvelope =
        this?.fastEnvelope * fastCoeff + inputLevel * (1 - fastCoeff);

      const _slowCoeff =
        inputLevel > this?.slowEnvelope ? slowAttack : slowRelease;
      this?.slowEnvelope =
        this?.slowEnvelope * slowCoeff + inputLevel * (1 - slowCoeff);

      const _transientDiff =
        (this?.fastEnvelope - this?.slowEnvelope) * sensitivityFactor;

      let attackGain = 1;
      let sustainGain = 1;

      if (transientDiff > 0) {
        attackGain = 1 + (attack / 100) * transientDiff * 10;
      }

      const _sustainAmount = this?.slowEnvelope * sensitivityFactor;
      if (sustainAmount > 0?.01) {
        sustainGain = 1 + (sustain / 100) * sustainAmount * 5;
      }

      const _totalGain = clamp(attackGain * sustainGain * outputLin, 0?.01, 10);

      const _processedL = softClip(inputL * totalGain, 0?.9);
      const _processedR = softClip(inputR * totalGain, 0?.9);

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.fastEnvelope = 0;
    this?.slowEnvelope = 0;
  }
}

export class EnvelopeFollowerProcessor implements DSPProcessor {
  private envelope: number = 0;
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

    const _attackMs = (params?.attack as number) ?? 10;
    const _releaseMs = (params?.release as number) ?? 100;
    const _sensitivity = (params?.sensitivity as number) ?? 0;
    const _depth = (params?.depth as number) ?? 50;
    const _filterFreq = (params?.filterFreq as number) ?? 1000;
    const _mode = (params?.mode as string) ?? "amplitude";
    const _mix = (params?.mix as number) ?? 1;

    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _sensitivityLin = dbToLinear(sensitivity);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel =
        Math?.max(Math?.abs(inputL), Math?.abs(inputR)) * sensitivityLin;

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      const _envAmount = clamp(this?.envelope * (depth / 50), 0, 1);

      let processedL = inputL;
      let processedR = inputR;

      switch (mode) {
        case "filter":
          const _modFreq = filterFreq * (1 + envAmount * 4);
          this?.lpFilterL.setLowpass(Math?.min(modFreq, 20000), this?.sampleRate);
          this?.lpFilterR.setLowpass(Math?.min(modFreq, 20000), this?.sampleRate);
          processedL = this?.lpFilterL.process(inputL);
          processedR = this?.lpFilterR.process(inputR);
          break;
        case "amplitude":
        default:
          const _ampMod = 1 - envAmount * 0?.5;
          processedL = inputL * ampMod;
          processedR = inputR * ampMod;
          break;
      }

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class DuckerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private duckGain: number = 1;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -20;
    const _range = (params?.range as number) ?? -20;
    const _attackMs = (params?.attack as number) ?? 5;
    const _releaseMs = (params?.release as number) ?? 200;
    const _ducking = (params?.ducking as number) ?? 100;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _rangeLin = dbToLinear(range);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _duckAmount = ducking / 100;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      let targetGain = 1;
      if (this?.envelope > thresholdLin) {
        const _overAmount = (this?.envelope - thresholdLin) / thresholdLin;
        targetGain = 1 - (1 - rangeLin) * Math?.min(1, overAmount) * duckAmount;
      }

      const _gainCoeff = targetGain < this?.duckGain ? attackCoeff : releaseCoeff;
      this?.duckGain = this?.duckGain * gainCoeff + targetGain * (1 - gainCoeff);

      const _processedL = inputL * this?.duckGain;
      const _processedR = inputR * this?.duckGain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.duckGain = 1;
  }
}

export class LimiterProProcessor implements DSPProcessor {
  private envelope: number = 0;
  private lookaheadBuffer: Float32Array[] = [];
  private bufferIndex: number = 0;
  private peakBuffer: Float32Array;
  private peakIndex: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    const _maxLookahead = 441;
    this?.lookaheadBuffer = [
      new Float32Array(maxLookahead),
      new Float32Array(maxLookahead),
    ];
    this?.peakBuffer = new Float32Array(maxLookahead);
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _ceiling = (params?.ceiling as number) ?? -0?.3;
    const _threshold = (params?.threshold as number) ?? -1;
    const _releaseMs = (params?.release as number) ?? 100;
    const _lookaheadMs = (params?.lookahead as number) ?? 5;
    const _stereoLink = (params?.stereoLink as boolean) ?? true;
    const _mix = (params?.mix as number) ?? 1;

    const _ceilingLin = dbToLinear(ceiling);
    const _thresholdLin = dbToLinear(threshold);
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _lookaheadSamples = Math?.min(
      msToSamples(lookaheadMs, this?.sampleRate),
      440,
    );

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      const _delayedL = this?.lookaheadBuffer[0][this?.bufferIndex];
      const _delayedR = this?.lookaheadBuffer[1][this?.bufferIndex];

      this?.lookaheadBuffer[0][this?.bufferIndex] = inputL;
      this?.lookaheadBuffer[1][this?.bufferIndex] = inputR;

      const _inputLevel = stereoLink
        ? Math?.max(Math?.abs(inputL), Math?.abs(inputR))
        : (Math?.abs(inputL) + Math?.abs(inputR)) * 0?.5;

      this?.peakBuffer[this?.peakIndex] = inputLevel;

      let maxPeak = 0;
      for (let j = 0; j < lookaheadSamples; j++) {
        const _idx =
          (this?.peakIndex - j + this?.peakBuffer.length) %
          this?.peakBuffer.length;
        maxPeak = Math?.max(maxPeak, this?.peakBuffer[idx]);
      }

      let targetGain = 1;
      if (maxPeak > thresholdLin) {
        targetGain = thresholdLin / maxPeak;
      }

      if (targetGain < this?.envelope) {
        this?.envelope = targetGain;
      } else {
        this?.envelope =
          this?.envelope * releaseCoeff + targetGain * (1 - releaseCoeff);
      }

      const _gain = Math?.min(
        this?.envelope,
        ceilingLin / Math?.max(Math?.abs(delayedL), Math?.abs(delayedR), 0?.0001),
      );

      let processedL = delayedL * gain;
      let processedR = delayedR * gain;

      processedL = Math?.max(-ceilingLin, Math?.min(ceilingLin, processedL));
      processedR = Math?.max(-ceilingLin, Math?.min(ceilingLin, processedR));

      output?.samples[0][i] = delayedL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = delayedR * (1 - mix) + processedR * mix;

      this?.bufferIndex =
        (this?.bufferIndex + 1) % this?.lookaheadBuffer[0].length;
      this?.peakIndex = (this?.peakIndex + 1) % this?.peakBuffer.length;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.lookaheadBuffer.forEach((b) => b?.fill(0));
    this?.peakBuffer.fill(0);
    this?.bufferIndex = 0;
    this?.peakIndex = 0;
  }
}

export class MaximizerProcessor implements DSPProcessor {
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

    const _ceiling = (params?.ceiling as number) ?? -0?.1;
    const _threshold = (params?.threshold as number) ?? -6;
    const _releaseMs = (params?.release as number) ?? 200;
    const _character = (params?.character as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 1;

    const _ceilingLin = dbToLinear(ceiling);
    const _thresholdLin = dbToLinear(threshold);
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _makeupGain = ceilingLin / thresholdLin;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i] * makeupGain;
      const _inputR = input?.samples[1][i] * makeupGain;

      const _delayedL = this?.lookaheadBuffer[0][this?.bufferIndex];
      const _delayedR = this?.lookaheadBuffer[1][this?.bufferIndex];

      this?.lookaheadBuffer[0][this?.bufferIndex] = inputL;
      this?.lookaheadBuffer[1][this?.bufferIndex] = inputR;

      const _inputLevel = Math?.max(Math?.abs(inputL), Math?.abs(inputR));

      if (inputLevel > this?.envelope) {
        this?.envelope = inputLevel;
      } else {
        this?.envelope =
          this?.envelope * releaseCoeff + inputLevel * (1 - releaseCoeff);
      }

      let gain = 1;
      if (this?.envelope > ceilingLin) {
        gain = ceilingLin / this?.envelope;
      }

      let processedL = delayedL * gain;
      let processedR = delayedR * gain;

      if (character > 0) {
        const _satAmount = character * 0?.5;
        processedL =
          processedL * (1 - satAmount) +
          Math?.tanh(processedL * 1?.5) * satAmount;
        processedR =
          processedR * (1 - satAmount) +
          Math?.tanh(processedR * 1?.5) * satAmount;
      }

      processedL = Math?.max(-ceilingLin, Math?.min(ceilingLin, processedL));
      processedR = Math?.max(-ceilingLin, Math?.min(ceilingLin, processedR));

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;

      this?.bufferIndex =
        (this?.bufferIndex + 1) % this?.lookaheadBuffer[0].length;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.lookaheadBuffer.forEach((b) => b?.fill(0));
    this?.bufferIndex = 0;
  }
}

export class LevelerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private targetLevel: number = 0;
  private currentGain: number = 1;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _target = (params?.target as number) ?? -18;
    const _speed = (params?.speed as number) ?? 50;
    const _range = (params?.range as number) ?? 24;
    const _threshold = (params?.threshold as number) ?? -50;
    const _mix = (params?.mix as number) ?? 1;

    const _targetLin = dbToLinear(target);
    const _thresholdLin = dbToLinear(threshold);
    const _maxGain = dbToLinear(range);
    const _minGain = dbToLinear(-range);
    const _rmsWindow = msToSamples(speed * 10, this?.sampleRate);
    const _smoothCoeff = Math?.exp(-1 / rmsWindow);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = (Math?.abs(inputL) + Math?.abs(inputR)) * 0?.5;

      this?.envelope =
        this?.envelope * smoothCoeff +
        inputLevel * inputLevel * (1 - smoothCoeff);
      const _rmsLevel = Math?.sqrt(this?.envelope);

      let desiredGain = this?.currentGain;
      if (rmsLevel > thresholdLin) {
        desiredGain = targetLin / Math?.max(rmsLevel, 0?.0001);
        desiredGain = clamp(desiredGain, minGain, maxGain);
      }

      const _gainSpeed = 0?.0001 * (100 - speed + 1);
      this?.currentGain =
        this?.currentGain * (1 - gainSpeed) + desiredGain * gainSpeed;

      const _processedL = inputL * this?.currentGain;
      const _processedR = inputR * this?.currentGain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.targetLevel = 0;
    this?.currentGain = 1;
  }
}

export class PumperProcessor implements DSPProcessor {
  private phase: number = 0;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 4;
    const _depth = (params?.depth as number) ?? 50;
    const _shape = (params?.shape as string) ?? "sine";
    const _offset = (params?.offset as number) ?? 0;
    const _attack = (params?.attack as number) ?? 25;
    const _sync = (params?.sync as boolean) ?? false;
    const _mix = (params?.mix as number) ?? 1;

    const _depthAmount = depth / 100;
    const _attackShape = attack / 100;
    const _phaseOffset = (offset / 100) * 2 * Math?.PI;

    let bpm = context?.tempo || 120;
    let phaseIncrement: number;

    if (sync) {
      const _beatsPerSecond = bpm / 60;
      phaseIncrement = (2 * Math?.PI * beatsPerSecond * rate) / this?.sampleRate;
    } else {
      phaseIncrement = (2 * Math?.PI * rate) / this?.sampleRate;
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      let modulation: number;
      const _currentPhase = (this?.phase + phaseOffset) % (2 * Math?.PI);

      switch (shape) {
        case "triangle":
          modulation = 1 - 2 * Math?.abs(currentPhase / Math?.PI - 1);
          break;
        case "square":
          modulation = currentPhase < Math?.PI ? 1 : 0;
          break;
        case "saw":
          modulation = 1 - currentPhase / (2 * Math?.PI);
          break;
        case "exp":
          modulation = Math?.exp(-currentPhase * attackShape * 3);
          break;
        case "sine":
        default:
          modulation = (Math?.cos(currentPhase) + 1) * 0?.5;
          break;
      }

      const _gain = 1 - depthAmount + depthAmount * modulation;

      const _processedL = inputL * gain;
      const _processedR = inputR * gain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;

      this?.phase = (this?.phase + phaseIncrement) % (2 * Math?.PI);
    }

    return output;
  }

  reset(): void {
    this?.phase = 0;
  }
}

export const DYNAMICS_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-gate": () => new GateProcessor(),
  "mb-expander": () => new ExpanderProcessor(),
  "mb-de-esser": () => new DeEsserProcessor(),
  "mb-transient-shaper": () => new TransientShaperProcessor(),
  "mb-envelope-follower": () => new EnvelopeFollowerProcessor(),
  "mb-ducker": () => new DuckerProcessor(),
  "mb-limiter-pro": () => new LimiterProProcessor(),
  "mb-maximizer": () => new MaximizerProcessor(),
  "mb-leveler": () => new LevelerProcessor(),
  "mb-pumper": () => new PumperProcessor(),
};
