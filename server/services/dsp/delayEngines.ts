import {
  AudioBuffer,
  DSPContext,
  DSPProcessor,
  copyBuffer,
  DelayLine,
  BiquadFilter,
  OnePoleFilter,
  EnvelopeFollower,
  LFO,
  msToSamples,
  dbToLinear,
} from "./core";

export class TapeDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private wowFlutter: number = 0;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _time = (params?.time as number) ?? 400;
    const _feedback = (params?.feedback as number) ?? 0.5;
    const _wow = (params?.wow as number) ?? 0.3;
    const _flutter = (params?.flutter as number) ?? 0.2;
    const _saturationAmount = (params?.saturation as number) ?? 0.4;
    const _highCut = (params?.highCut as number) ?? 4000;
    const _lowCut = (params?.lowCut as number) ?? 80;
    const _stereoSpread = (params?.spread as number) ?? 0.1;

    const _delaySamples = msToSamples(time, this?.sampleRate);
    const _delaySpread = msToSamples(time * stereoSpread, this?.sampleRate);

    this?.lpFilterL.setLowpass(highCut, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, this?.sampleRate);
    this?.hpFilterL.setHighpass(lowCut, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(lowCut, 0.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.wowFlutter += 0.0001;
      const _wowMod = Math?.sin(this?.wowFlutter * 0.4) * wow * 20;
      const _flutterMod = Math?.sin(this?.wowFlutter * 7) * flutter * 5;
      const _modulation = wowMod + flutterMod;

      const _delayedL = this?.delayL.readInterpolated(delaySamples + modulation);
      const _delayedR = this?.delayR.readInterpolated(
        delaySamples + delaySpread - modulation,
      );

      let filteredL = this?.lpFilterL.process(delayedL);
      let filteredR = this?.lpFilterR.process(delayedR);
      filteredL = this?.hpFilterL.process(filteredL);
      filteredR = this?.hpFilterR.process(filteredR);

      const _saturatedL =
        Math?.tanh(filteredL * (1 + saturationAmount * 2)) *
        (1 / (1 + saturationAmount));
      const _saturatedR =
        Math?.tanh(filteredR * (1 + saturationAmount * 2)) *
        (1 / (1 + saturationAmount));

      this?.delayL.write(input?.samples[0][i] + saturatedL * feedback);
      this?.delayR.write(input?.samples[1][i] + saturatedR * feedback);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + saturatedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + saturatedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this.wowFlutter = 0;
  }
}

export class DigitalDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lpFilterL: BiquadFilter;
  private lpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
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

    const _mix = (params?.mix as number) ?? 0.35;
    const _timeL = (params?.timeLeft as number) ?? 375;
    const _timeR = (params?.timeRight as number) ?? 500;
    const _feedback = (params?.feedback as number) ?? 0.4;
    const _highCut = (params?.highCut as number) ?? 12000;
    const _pingPong = (params?.pingPong as boolean) ?? false;

    const _delaySamplesL = msToSamples(timeL, this?.sampleRate);
    const _delaySamplesR = msToSamples(timeR, this?.sampleRate);

    this?.lpFilterL.setLowpass(highCut, 0.707, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, 0.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _delayedL = this?.delayL.read(delaySamplesL);
      const _delayedR = this?.delayR.read(delaySamplesR);

      const _filteredL = this?.lpFilterL.process(delayedL);
      const _filteredR = this?.lpFilterR.process(delayedR);

      if (pingPong) {
        this?.delayL.write(input?.samples[0][i] + filteredR * feedback);
        this?.delayR.write(input?.samples[1][i] + filteredL * feedback);
      } else {
        this?.delayL.write(input?.samples[0][i] + filteredL * feedback);
        this?.delayR.write(input?.samples[1][i] + filteredR * feedback);
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + filteredL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + filteredR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class PingPongDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
    this.hpFilterL = new BiquadFilter();
    this.hpFilterR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _time = (params?.time as number) ?? 300;
    const _feedback = (params?.feedback as number) ?? 0.55;
    const _spread = (params?.spread as number) ?? 1.0;
    const _highCut = (params?.highCut as number) ?? 8000;
    const _lowCut = (params?.lowCut as number) ?? 100;
    const _width = (params?.width as number) ?? 1.0;

    const _delaySamples = msToSamples(time, this?.sampleRate);

    this?.lpFilterL.setLowpass(highCut, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, this?.sampleRate);
    this?.hpFilterL.setHighpass(lowCut, 0.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(lowCut, 0.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;

      const _delayedL = this?.delayL.read(delaySamples);
      const _delayedR = this?.delayR.read(delaySamples);

      let filteredL = this?.lpFilterL.process(delayedL);
      let filteredR = this?.lpFilterR.process(delayedR);
      filteredL = this?.hpFilterL.process(filteredL);
      filteredR = this?.hpFilterR.process(filteredR);

      this?.delayL.write(mono + filteredR * feedback * spread);
      this?.delayR.write(filteredL * feedback);

      const _wetL = filteredL * width;
      const _wetR = filteredR * width;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
  }
}

export class SlapbackDelayProcessor implements DSPProcessor {
  private delay: DelayLine;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delay = new DelayLine(22050);
    this.lpFilter = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.3;
    const _time = (params?.time as number) ?? 80;
    const _feedback = (params?.feedback as number) ?? 0.1;
    const _tone = (params?.tone as number) ?? 0.6;
    const _doubleTrack = (params?.doubleTrack as boolean) ?? false;

    const _delaySamples = msToSamples(time, this?.sampleRate);
    this?.lpFilter.setLowpass(2000 + tone * 8000, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;

      const _delayed = this?.delay.read(delaySamples);
      const _filtered = this?.lpFilter.process(delayed);

      this?.delay.write(mono + filtered * feedback);

      let wetL = filtered;
      let wetR = filtered;

      if (doubleTrack) {
        wetL *= 0.7;
        wetR *= 1.0;
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delay.clear();
    this?.lpFilter.clear();
  }
}

export class ModDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lfoL: LFO;
  private lfoR: LFO;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lfoL = new LFO();
    this.lfoR = new LFO();
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _time = (params?.time as number) ?? 350;
    const _feedback = (params?.feedback as number) ?? 0.45;
    const _modRate = (params?.modRate as number) ?? 0.5;
    const _modDepth = (params?.modDepth as number) ?? 0.3;
    const _highCut = (params?.highCut as number) ?? 6000;
    const _stereoPhase = (params?.stereoPhase as number) ?? 0.5;

    const _baseDelaySamples = msToSamples(time, this?.sampleRate);
    const _maxModSamples = msToSamples(time * 0.2, this?.sampleRate);

    this?.lfoL.setFrequency(modRate, this?.sampleRate);
    this?.lfoR.setFrequency(modRate * (1 + stereoPhase * 0.1), this?.sampleRate);
    this?.lpFilterL.setLowpass(highCut, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _modL = this?.lfoL.triangle() * modDepth * maxModSamples;
      const _modR = this?.lfoR.triangle() * modDepth * maxModSamples;

      const _delayedL = this?.delayL.readInterpolated(baseDelaySamples + modL);
      const _delayedR = this?.delayR.readInterpolated(baseDelaySamples + modR);

      const _filteredL = this?.lpFilterL.process(delayedL);
      const _filteredR = this?.lpFilterR.process(delayedR);

      this?.delayL.write(input?.samples[0][i] + filteredL * feedback);
      this?.delayR.write(input?.samples[1][i] + filteredR * feedback);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + filteredL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + filteredR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.lfoL.reset();
    this?.lfoR.reset();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class DuckingDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private envelope: EnvelopeFollower;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private duckAmount: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.envelope = new EnvelopeFollower(5, 200, 44100);
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.5;
    const _time = (params?.time as number) ?? 400;
    const _feedback = (params?.feedback as number) ?? 0.45;
    const _threshold = dbToLinear((params?.threshold as number) ?? -20);
    const _duckDepth = (params?.duckDepth as number) ?? 0.8;
    const _attackMs = (params?.attack as number) ?? 10;
    const _releaseMs = (params?.release as number) ?? 300;
    const _highCut = (params?.highCut as number) ?? 8000;

    const _delaySamples = msToSamples(time, this?.sampleRate);

    this?.envelope.setAttack(attackMs, this?.sampleRate);
    this?.envelope.setRelease(releaseMs, this?.sampleRate);
    this?.lpFilterL.setLowpass(highCut, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;
      const _inputLevel = this?.envelope.process(mono);

      const _duckGain =
        inputLevel > threshold
          ? 1 - duckDepth * Math?.min(1, (inputLevel - threshold) / threshold)
          : 1;

      const _delayedL = this?.delayL.read(delaySamples);
      const _delayedR = this?.delayR.read(delaySamples);

      const _filteredL = this?.lpFilterL.process(delayedL);
      const _filteredR = this?.lpFilterR.process(delayedR);

      this?.delayL.write(input?.samples[0][i] + filteredL * feedback);
      this?.delayR.write(input?.samples[1][i] + filteredR * feedback);

      const _wetL = filteredL * duckGain;
      const _wetR = filteredR * duckGain;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.envelope.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
    this.duckAmount = 0;
  }
}

export class MultiTapDelayProcessor implements DSPProcessor {
  private taps: DelayLine[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this?.taps.push(new DelayLine(220500));
      this?.lpFilters.push(new OnePoleFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _baseTime = (params?.time as number) ?? 200;
    const _feedback = (params?.feedback as number) ?? 0.3;
    const _spread = (params?.spread as number) ?? 1.0;
    const _decay = (params?.decay as number) ?? 0.8;
    const _highCut = (params?.highCut as number) ?? 6000;
    const _numTaps = Math?.floor((params?.taps as number) ?? 4);
    const _pattern = (params?.pattern as string) ?? "linear";

    const _tapTimes = this?.calculateTapTimes(baseTime, numTaps, spread, pattern);
    const _tapGains = this?.calculateTapGains(numTaps, decay);

    for (let i = 0; i < numTaps; i++) {
      this?.lpFilters[i].setLowpass(
        highCut * Math?.pow(decay, i),
        this?.sampleRate,
      );
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;

      let wetL = 0,
        wetR = 0;
      let feedbackSum = 0;

      for (let t = 0; t < numTaps; t++) {
        const _delaySamples = msToSamples(tapTimes[t], this?.sampleRate);
        const _delayed = this?.taps[t].read(delaySamples);
        const _filtered = this?.lpFilters[t].process(delayed) * tapGains[t];

        const _pan = (t / (numTaps - 1)) * Math?.PI;
        wetL += filtered * Math?.cos(pan);
        wetR += filtered * Math?.sin(pan);
        feedbackSum += filtered;
      }

      for (let t = 0; t < numTaps; t++) {
        this?.taps[t].write(mono + (feedbackSum * feedback) / numTaps);
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  private calculateTapTimes(
    baseTime: number,
    numTaps: number,
    spread: number,
    pattern: string,
  ): number[] {
    const times: number[] = [];
    for (let i = 0; i < numTaps; i++) {
      let time = baseTime;
      switch (pattern) {
        case "linear":
          time = baseTime * (i + 1) * spread;
          break;
        case "golden":
          time = baseTime * Math?.pow(1.618, i) * spread;
          break;
        case "fibonacci":
          time = (baseTime * this?.fibonacci(i + 2) * spread) / 10;
          break;
        case "random":
          time = baseTime * (0.5 + Math?.random()) * (i + 1) * spread;
          break;
        default:
          time = baseTime * (i + 1) * spread;
      }
      times?.push(time);
    }
    return times;
  }

  private calculateTapGains(numTaps: number, decay: number): number[] {
    return Array?.from({ length: numTaps }, (_, i) => Math?.pow(decay, i));
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    let a = 0,
      b = 1;
    for (let i = 2; i <= n; i++) {
      const _temp = a + b;
      a = b;
      b = temp;
    }
    return b;
  }

  reset(): void {
    this?.taps.forEach((t) => t?.clear());
    this?.lpFilters.forEach((f) => f?.clear());
  }
}

export class FilterDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private filterL: BiquadFilter;
  private filterR: BiquadFilter;
  private lfo: LFO;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.filterL = new BiquadFilter();
    this.filterR = new BiquadFilter();
    this.lfo = new LFO();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _time = (params?.time as number) ?? 350;
    const _feedback = (params?.feedback as number) ?? 0.5;
    const _filterFreq = (params?.filterFreq as number) ?? 2000;
    const _filterQ = (params?.filterQ as number) ?? 2;
    const _filterType = (params?.filterType as string) ?? "lowpass";
    const _modRate = (params?.modRate as number) ?? 0.3;
    const _modDepth = (params?.modDepth as number) ?? 0.5;

    const _delaySamples = msToSamples(time, this?.sampleRate);
    this?.lfo.setFrequency(modRate, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mod = this?.lfo.sine() * modDepth;
      const _modulatedFreq = filterFreq * Math?.pow(2, mod);

      switch (filterType) {
        case "lowpass":
          this?.filterL.setLowpass(modulatedFreq, filterQ, this?.sampleRate);
          this?.filterR.setLowpass(modulatedFreq, filterQ, this?.sampleRate);
          break;
        case "highpass":
          this?.filterL.setHighpass(modulatedFreq, filterQ, this?.sampleRate);
          this?.filterR.setHighpass(modulatedFreq, filterQ, this?.sampleRate);
          break;
        case "bandpass":
          this?.filterL.setBandpass(modulatedFreq, filterQ, this?.sampleRate);
          this?.filterR.setBandpass(modulatedFreq, filterQ, this?.sampleRate);
          break;
      }

      const _delayedL = this?.delayL.read(delaySamples);
      const _delayedR = this?.delayR.read(delaySamples);

      const _filteredL = this?.filterL.process(delayedL);
      const _filteredR = this?.filterR.process(delayedR);

      this?.delayL.write(input?.samples[0][i] + filteredL * feedback);
      this?.delayR.write(input?.samples[1][i] + filteredR * feedback);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + filteredL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + filteredR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.filterL.clear();
    this?.filterR.clear();
    this?.lfo.reset();
  }
}

export class ReverseDelayProcessor implements DSPProcessor {
  private bufferL: Float32Array;
  private bufferR: Float32Array;
  private writeIndex: number = 0;
  private grainSize: number = 0;
  private grainPosition: number = 0;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.bufferL = new Float32Array(88200);
    this.bufferR = new Float32Array(88200);
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _time = (params?.time as number) ?? 500;
    const _crossfade = (params?.crossfade as number) ?? 0.1;
    const _highCut = (params?.highCut as number) ?? 8000;

    this.grainSize = msToSamples(time, this?.sampleRate);
    this?.lpFilterL.setLowpass(highCut, this?.sampleRate);
    this?.lpFilterR.setLowpass(highCut, this?.sampleRate);

    const _fadeLength = Math?.floor(this?.grainSize * crossfade);

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.bufferL[this?.writeIndex] = input?.samples[0][i];
      this?.bufferR[this?.writeIndex] = input?.samples[1][i];

      const _reverseIndex =
        (this?.writeIndex - this?.grainPosition + this?.bufferL.length) %
        this?.bufferL.length;

      let reversedL = this?.bufferL[reverseIndex];
      let reversedR = this?.bufferR[reverseIndex];

      let fadeEnv = 1;
      if (this?.grainPosition < fadeLength) {
        fadeEnv = this?.grainPosition / fadeLength;
      } else if (this?.grainPosition > this?.grainSize - fadeLength) {
        fadeEnv = (this?.grainSize - this?.grainPosition) / fadeLength;
      }

      reversedL *= fadeEnv;
      reversedR *= fadeEnv;

      const _filteredL = this?.lpFilterL.process(reversedL);
      const _filteredR = this?.lpFilterR.process(reversedR);

      this.writeIndex = (this?.writeIndex + 1) % this?.bufferL.length;
      this?.grainPosition++;

      if (this?.grainPosition >= this?.grainSize) {
        this.grainPosition = 0;
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + filteredL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + filteredR * mix;
    }

    return output;
  }

  reset(): void {
    this?.bufferL.fill(0);
    this?.bufferR.fill(0);
    this.writeIndex = 0;
    this.grainPosition = 0;
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class GranularDelayProcessor implements DSPProcessor {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private grains: Array<{
    position: number;
    speed: number;
    pan: number;
    age: number;
    maxAge: number;
  }> = [];
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.buffer = new Float32Array(220500);
    this.lpFilterL = new OnePoleFilter();
    this.lpFilterR = new OnePoleFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this.sampleRate = input?.sampleRate;

    const _mix = (params?.mix as number) ?? 0.4;
    const _grainSize = (params?.grainSize as number) ?? 100;
    const _grainDensity = (params?.density as number) ?? 4;
    const _pitch = (params?.pitch as number) ?? 0;
    const _pitchRandom = (params?.pitchRandom as number) ?? 0.2;
    const _scatter = (params?.scatter as number) ?? 0.3;
    const _feedback = (params?.feedback as number) ?? 0.3;
    const _stereoSpread = (params?.spread as number) ?? 0.8;
    const _reverse = (params?.reverse as number) ?? 0.3;

    const _grainSamples = msToSamples(grainSize, this?.sampleRate);
    const _spawnRate = Math?.floor(this?.sampleRate / (grainDensity * 10));
    const _basePitch = Math?.pow(2, pitch / 12);

    this?.lpFilterL.setLowpass(8000, this?.sampleRate);
    this?.lpFilterR.setLowpass(8000, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0.5;
      this?.buffer[this?.writeIndex] = mono;

      if (i % spawnRate === 0 && this?.grains.length < 32) {
        const _pitchVar =
          basePitch * (1 + (Math?.random() - 0.5) * pitchRandom * 2);
        const _shouldReverse = Math?.random() < reverse;
        this?.grains.push({
          position:
            (this?.writeIndex -
              Math?.floor(scatter * grainSamples * Math?.random()) +
              this?.buffer.length) %
            this?.buffer.length,
          speed: shouldReverse ? -pitchVar : pitchVar,
          pan: (Math?.random() - 0.5) * stereoSpread,
          age: 0,
          maxAge: grainSamples,
        });
      }

      let wetL = 0,
        wetR = 0;

      for (let g = this?.grains.length - 1; g >= 0; g--) {
        const _grain = this?.grains[g];

        const _envelope = Math?.sin((Math?.PI * grain?.age) / grain?.maxAge);
        const _sample =
          this?.buffer[Math?.floor(grain?.position) % this?.buffer.length];
        const _grainOutput =
          (sample * envelope) / Math?.max(1, this?.grains.length * 0.5);

        wetL += grainOutput * (0.5 - grain?.pan);
        wetR += grainOutput * (0.5 + grain?.pan);

        grain?.position += grain?.speed;
        if (grain?.position < 0) grain?.position += this?.buffer.length;
        grain?.age++;

        if (grain?.age >= grain?.maxAge) {
          this?.grains.splice(g, 1);
        }
      }

      wetL = this?.lpFilterL.process(wetL);
      wetR = this?.lpFilterR.process(wetR);

      this?.buffer[this?.writeIndex] += (wetL + wetR) * 0.5 * feedback;
      this.writeIndex = (this?.writeIndex + 1) % this?.buffer.length;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.buffer.fill(0);
    this.writeIndex = 0;
    this.grains = [];
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export const DELAY_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-tape-delay": () => new TapeDelayProcessor(),
  "mb-digital-delay": () => new DigitalDelayProcessor(),
  "mb-ping-pong-delay": () => new PingPongDelayProcessor(),
  "mb-slapback-delay": () => new SlapbackDelayProcessor(),
  "mb-mod-delay": () => new ModDelayProcessor(),
  "mb-ducking-delay": () => new DuckingDelayProcessor(),
  "mb-multi-tap-delay": () => new MultiTapDelayProcessor(),
  "mb-filter-delay": () => new FilterDelayProcessor(),
  "mb-reverse-delay": () => new ReverseDelayProcessor(),
  "mb-granular-delay": () => new GranularDelayProcessor(),
};
