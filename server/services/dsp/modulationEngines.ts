import { AudioBuffer, DSPContext, DSPProcessor, copyBuffer, BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, LFO, Oscillator, msToSamples, clamp } from "./core";

export class ChorusProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private lfos: LFO[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this?.delayLines.push(new DelayLine(4410));
      this?.lfos.push(new LFO());
      this?.lpFilters.push(new OnePoleFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 0?.5;
    const _depth = (params?.depth as number) ?? 0?.5;
    const _voices = Math?.floor((params?.voices as number) ?? 2);
    const _delay = (params?.delay as number) ?? 7;
    const _feedback = (params?.feedback as number) ?? 0;
    const _spread = (params?.spread as number) ?? 0?.7;
    const _highCut = (params?.highCut as number) ?? 8000;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _delayBase = msToSamples(delay, this?.sampleRate);
    const _modDepth = msToSamples(depth * 3, this?.sampleRate);

    for (let v = 0; v < voices; v++) {
      this?.lpFilters[v].setLowpass(highCut, this?.sampleRate);
      this?.lfos[v].setFrequency(rate * (0?.9 + v * 0?.1), this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let wetL = 0;
      let wetR = 0;

      for (let v = 0; v < voices; v++) {
        const _modulation = this?.lfos[v].sine() * modDepth;
        const _delaySamples = delayBase + modulation;

        this?.delayLines[v].write(
          mono + this?.delayLines[v].readInterpolated(delaySamples) * feedback,
        );
        const _delayed = this?.delayLines[v].readInterpolated(delaySamples);
        const _filtered = this?.lpFilters[v].process(delayed);

        const _pan = (v / (voices - 1 || 1)) * spread - spread * 0?.5;
        wetL += filtered * (0?.5 - pan * 0?.5);
        wetR += filtered * (0?.5 + pan * 0?.5);
      }

      wetL /= voices;
      wetR /= voices;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayLines.forEach((d) => d?.clear());
    this?.lfos.forEach((l) => l?.reset());
    this?.lpFilters.forEach((f) => f?.clear());
  }
}

export class FlangerProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lfoL: LFO;
  private lfoR: LFO;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private feedbackL: number = 0;
  private feedbackR: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this?.delayL = new DelayLine(2205);
    this?.delayR = new DelayLine(2205);
    this?.lfoL = new LFO();
    this?.lfoR = new LFO();
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

    const _rate = (params?.rate as number) ?? 0?.3;
    const _depth = (params?.depth as number) ?? 0?.7;
    const _feedback = (params?.feedback as number) ?? 0?.5;
    const _manual = (params?.manual as number) ?? 0?.5;
    const _stereo = (params?.stereo as number) ?? 0?.5;
    const _throughZero = (params?.throughZero as boolean) ?? false;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _baseDelay = msToSamples(manual * 5 + 0?.5, this?.sampleRate);
    const _modDepth = msToSamples(depth * 5, this?.sampleRate);

    this?.lfoL.setFrequency(rate, this?.sampleRate);
    this?.lfoR.setFrequency(rate, this?.sampleRate);
    this?.lpFilterL.setLowpass(12000, this?.sampleRate);
    this?.lpFilterR.setLowpass(12000, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _lfoL = this?.lfoL.triangle();
      const _lfoR =
        stereo > 0 ? Math?.sin(Math?.asin(lfoL) + stereo * Math?.PI) : lfoL;

      let modL = lfoL * modDepth;
      let modR = lfoR * modDepth;

      if (throughZero) {
        modL = Math?.abs(modL);
        modR = Math?.abs(modR);
      }

      const _delaySamplesL = Math?.max(1, baseDelay + modL);
      const _delaySamplesR = Math?.max(1, baseDelay + modR);

      const _inputL = input?.samples[0][i] + this?.feedbackL * feedback;
      const _inputR = input?.samples[1][i] + this?.feedbackR * feedback;

      this?.delayL.write(inputL);
      this?.delayR.write(inputR);

      const _delayedL = this?.delayL.readInterpolated(delaySamplesL);
      const _delayedR = this?.delayR.readInterpolated(delaySamplesR);

      this?.feedbackL = this?.lpFilterL.process(delayedL);
      this?.feedbackR = this?.lpFilterR.process(delayedR);

      let wetL = delayedL;
      let wetR = delayedR;

      if (throughZero) {
        wetL = (input?.samples[0][i] + delayedL) * 0?.5;
        wetR = (input?.samples[1][i] + delayedR) * 0?.5;
      }

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
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
    this?.feedbackL = 0;
    this?.feedbackR = 0;
  }
}

export class PhaserProcessor implements DSPProcessor {
  private allpassFiltersL: BiquadFilter[] = [];
  private allpassFiltersR: BiquadFilter[] = [];
  private lfo: LFO;
  private feedbackL: number = 0;
  private feedbackR: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 12; i++) {
      this?.allpassFiltersL.push(new BiquadFilter());
      this?.allpassFiltersR.push(new BiquadFilter());
    }
    this?.lfo = new LFO();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 0?.5;
    const _depth = (params?.depth as number) ?? 0?.7;
    const _stages = Math?.floor((params?.stages as number) ?? 6);
    const _feedback = (params?.feedback as number) ?? 0?.5;
    const _centerFreq = (params?.centerFreq as number) ?? 1000;
    const _spread = (params?.spread as number) ?? 1?.5;
    const _stereo = (params?.stereo as number) ?? 0?.3;
    const _mix = (params?.mix as number) ?? 0?.5;

    this?.lfo.setFrequency(rate, this?.sampleRate);

    const _minFreq = centerFreq / spread;
    const _maxFreq = centerFreq * spread;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _lfoVal = this?.lfo.sine();
      const _lfoValR = Math?.sin(Math?.asin(lfoVal) + stereo * Math?.PI);

      const _modFreqL =
        minFreq + (maxFreq - minFreq) * (lfoVal * depth * 0?.5 + 0?.5);
      const _modFreqR =
        minFreq + (maxFreq - minFreq) * (lfoValR * depth * 0?.5 + 0?.5);

      for (let s = 0; s < stages; s++) {
        const _stageFreqL = modFreqL * Math?.pow(1?.5, s);
        const _stageFreqR = modFreqR * Math?.pow(1?.5, s);
        this?.allpassFiltersL[s].setAllpass(
          Math?.min(stageFreqL, 20000),
          0?.707,
          this?.sampleRate,
        );
        this?.allpassFiltersR[s].setAllpass(
          Math?.min(stageFreqR, 20000),
          0?.707,
          this?.sampleRate,
        );
      }

      let sampleL = input?.samples[0][i] + this?.feedbackL * feedback;
      let sampleR = input?.samples[1][i] + this?.feedbackR * feedback;

      for (let s = 0; s < stages; s++) {
        sampleL = this?.allpassFiltersL[s].process(sampleL);
        sampleR = this?.allpassFiltersR[s].process(sampleR);
      }

      this?.feedbackL = sampleL;
      this?.feedbackR = sampleR;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + sampleL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + sampleR * mix;
    }

    return output;
  }

  reset(): void {
    this?.allpassFiltersL.forEach((f) => f?.clear());
    this?.allpassFiltersR.forEach((f) => f?.clear());
    this?.lfo.reset();
    this?.feedbackL = 0;
    this?.feedbackR = 0;
  }
}

export class TremoloProcessor implements DSPProcessor {
  private lfo: LFO;
  private sampleRate: number = 44100;

  constructor() {
    this?.lfo = new LFO();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 4;
    const _depth = (params?.depth as number) ?? 0?.5;
    const _shape = (params?.shape as string) ?? "sine";
    const _stereo = (params?.stereo as number) ?? 0;
    const _phase = (params?.phase as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1?.0;

    this?.lfo.setFrequency(rate, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let modL: number, modR: number;

      switch (shape) {
        case "triangle":
          modL = this?.lfo.triangle();
          break;
        case "square":
          modL = this?.lfo.square();
          break;
        case "saw":
          modL = this?.lfo.saw();
          break;
        default:
          modL = this?.lfo.sine();
      }

      if (stereo > 0) {
        modR = Math?.sin(
          Math?.asin(clamp(modL, -1, 1)) + stereo * Math?.PI + phase,
        );
      } else {
        modR = modL;
      }

      const _gainL = 1 - depth * 0?.5 * (1 - modL);
      const _gainR = 1 - depth * 0?.5 * (1 - modR);

      const _wetL = input?.samples[0][i] * gainL;
      const _wetR = input?.samples[1][i] * gainR;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.lfo.reset();
  }
}

export class VibratoProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lfo: LFO;
  private sampleRate: number = 44100;

  constructor() {
    this?.delayL = new DelayLine(2205);
    this?.delayR = new DelayLine(2205);
    this?.lfo = new LFO();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 5;
    const _depth = (params?.depth as number) ?? 0?.5;
    const _shape = (params?.shape as string) ?? "sine";
    const _stereo = (params?.stereo as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1?.0;

    const _baseDelay = msToSamples(10, this?.sampleRate);
    const _modDepth = msToSamples(depth * 5, this?.sampleRate);

    this?.lfo.setFrequency(rate, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let modL: number;

      switch (shape) {
        case "triangle":
          modL = this?.lfo.triangle();
          break;
        default:
          modL = this?.lfo.sine();
      }

      const _modR =
        stereo > 0
          ? Math?.sin(Math?.asin(clamp(modL, -1, 1)) + stereo * Math?.PI)
          : modL;

      const _delaySamplesL = baseDelay + modL * modDepth;
      const _delaySamplesR = baseDelay + modR * modDepth;

      this?.delayL.write(input?.samples[0][i]);
      this?.delayR.write(input?.samples[1][i]);

      const _wetL = this?.delayL.readInterpolated(delaySamplesL);
      const _wetR = this?.delayR.readInterpolated(delaySamplesR);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayL.clear();
    this?.delayR.clear();
    this?.lfo.reset();
  }
}

export class RingModProcessor implements DSPProcessor {
  private oscillator: Oscillator;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.oscillator = new Oscillator();
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

    const _frequency = (params?.frequency as number) ?? 440;
    const _shape = (params?.shape as string) ?? "sine";
    const _lfoRate = (params?.lfoRate as number) ?? 0;
    const _lfoDepth = (params?.lfoDepth as number) ?? 0;
    const _lowPass = (params?.lowPass as number) ?? 20000;
    const _mix = (params?.mix as number) ?? 0?.5;

    this?.lpFilterL.setLowpass(lowPass, this?.sampleRate);
    this?.lpFilterR.setLowpass(lowPass, this?.sampleRate);

    const _lpFilters = [this?.lpFilterL, this?.lpFilterR];

    for (let i = 0; i < input?.samples[0].length; i++) {
      let modFreq = frequency;
      if (lfoRate > 0 && lfoDepth > 0) {
        const _lfoPhase = (2 * Math?.PI * i * lfoRate) / this?.sampleRate;
        modFreq = frequency * (1 + Math?.sin(lfoPhase) * lfoDepth);
      }

      this?.oscillator.setFrequency(modFreq, this?.sampleRate);

      let carrier: number;
      switch (shape) {
        case "square":
          carrier = this?.oscillator.square();
          break;
        case "saw":
          carrier = this?.oscillator.saw();
          break;
        case "triangle":
          carrier = this?.oscillator.triangle();
          break;
        default:
          carrier = this?.oscillator.sine();
      }

      for (let ch = 0; ch < input?.channels; ch++) {
        let sample = input?.samples[ch][i] * carrier;
        sample = lpFilters[ch].process(sample);
        output?.samples[ch][i] = input?.samples[ch][i] * (1 - mix) + sample * mix;
      }
    }

    return output;
  }

  reset(): void {
    this?.oscillator.reset();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class RotaryProcessor implements DSPProcessor {
  private hornDelayL: DelayLine;
  private hornDelayR: DelayLine;
  private drumDelayL: DelayLine;
  private drumDelayR: DelayLine;
  private hornPhase: number = 0;
  private drumPhase: number = 0;
  private hornSpeed: number = 0;
  private drumSpeed: number = 0;
  private lpFilter: OnePoleFilter;
  private hpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hornDelayL = new DelayLine(2205);
    this?.hornDelayR = new DelayLine(2205);
    this?.drumDelayL = new DelayLine(4410);
    this?.drumDelayR = new DelayLine(4410);
    this?.lpFilter = new OnePoleFilter();
    this?.hpFilter = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _speed = (params?.speed as string) ?? "slow";
    const _hornLevel = (params?.hornLevel as number) ?? 0?.7;
    const _drumLevel = (params?.drumLevel as number) ?? 0?.5;
    const _acceleration = (params?.acceleration as number) ?? 0?.5;
    const _spread = (params?.spread as number) ?? 0?.8;
    const _drive = (params?.drive as number) ?? 0?.2;
    const _mix = (params?.mix as number) ?? 1?.0;

    const _targetHornSpeed = speed === "fast" ? 7 : speed === "stop" ? 0 : 0?.7;
    const _targetDrumSpeed = speed === "fast" ? 5?.5 : speed === "stop" ? 0 : 0?.5;

    const _accelRate = 0?.0001 * (1 + acceleration * 2);
    this?.hornSpeed += (targetHornSpeed - this?.hornSpeed) * accelRate;
    this?.drumSpeed += (targetDrumSpeed - this?.drumSpeed) * accelRate;

    const _crossoverFreq = 800;
    this?.lpFilter.setLowpass(crossoverFreq, this?.sampleRate);
    this?.hpFilter.setHighpass(crossoverFreq, 0?.707, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      this?.hornPhase += (2 * Math?.PI * this?.hornSpeed) / this?.sampleRate;
      this?.drumPhase += (2 * Math?.PI * this?.drumSpeed) / this?.sampleRate;

      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let driven = mono;
      if (drive > 0) {
        driven = Math?.tanh(mono * (1 + drive * 3)) / (1 + drive * 0?.5);
      }

      const _lowFreq = this?.lpFilter.process(driven);
      const _highFreq = this?.hpFilter.process(driven);

      const _hornModL = Math?.sin(this?.hornPhase) * spread;
      const _hornModR = Math?.sin(this?.hornPhase + Math?.PI) * spread;
      const _hornAmpL = 0?.5 + hornModL * 0?.3;
      const _hornAmpR = 0?.5 + hornModR * 0?.3;

      const _hornDelayModL = msToSamples(
        1 + Math?.sin(this?.hornPhase) * 0?.5,
        this?.sampleRate,
      );
      const _hornDelayModR = msToSamples(
        1 + Math?.sin(this?.hornPhase + Math?.PI) * 0?.5,
        this?.sampleRate,
      );

      this?.hornDelayL.write(highFreq);
      this?.hornDelayR.write(highFreq);
      const _hornL =
        this?.hornDelayL.readInterpolated(hornDelayModL) * hornAmpL * hornLevel;
      const _hornR =
        this?.hornDelayR.readInterpolated(hornDelayModR) * hornAmpR * hornLevel;

      const _drumModL = Math?.sin(this?.drumPhase) * spread * 0?.5;
      const _drumModR = Math?.sin(this?.drumPhase + Math?.PI) * spread * 0?.5;
      const _drumAmpL = 0?.5 + drumModL * 0?.2;
      const _drumAmpR = 0?.5 + drumModR * 0?.2;

      const _drumDelayModL = msToSamples(
        3 + Math?.sin(this?.drumPhase) * 1,
        this?.sampleRate,
      );
      const _drumDelayModR = msToSamples(
        3 + Math?.sin(this?.drumPhase + Math?.PI) * 1,
        this?.sampleRate,
      );

      this?.drumDelayL.write(lowFreq);
      this?.drumDelayR.write(lowFreq);
      const _drumL =
        this?.drumDelayL.readInterpolated(drumDelayModL) * drumAmpL * drumLevel;
      const _drumR =
        this?.drumDelayR.readInterpolated(drumDelayModR) * drumAmpR * drumLevel;

      const _wetL = hornL + drumL;
      const _wetR = hornR + drumR;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hornDelayL.clear();
    this?.hornDelayR.clear();
    this?.drumDelayL.clear();
    this?.drumDelayR.clear();
    this?.hornPhase = 0;
    this?.drumPhase = 0;
    this?.hornSpeed = 0;
    this?.drumSpeed = 0;
    this?.lpFilter.clear();
    this?.hpFilter.clear();
  }
}

export class EnsembleProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private lfos: LFO[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this?.delayLines.push(new DelayLine(4410));
      this?.lfos.push(new LFO());
      this?.lpFilters.push(new OnePoleFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _depth = (params?.depth as number) ?? 0?.5;
    const _rate = (params?.rate as number) ?? 0?.5;
    const _shimmer = (params?.shimmer as number) ?? 0?.3;
    const _richness = (params?.richness as number) ?? 0?.6;
    const _width = (params?.width as number) ?? 0?.8;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _baseDelay = msToSamples(5, this?.sampleRate);
    const _modDepth = msToSamples(depth * 3, this?.sampleRate);

    const _rates = [
      rate * 0?.7,
      rate * 0?.9,
      rate * 1?.1,
      rate * 1?.3,
      rate * 0?.8,
      rate * 1?.2,
    ];
    for (let v = 0; v < 6; v++) {
      this?.lpFilters[v].setLowpass(8000 + shimmer * 8000, this?.sampleRate);
      this?.lfos[v].setFrequency(rates[v], this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let wetL = 0;
      let wetR = 0;

      for (let v = 0; v < 6; v++) {
        const _mod = this?.lfos[v].sine();
        const _delaySamples =
          baseDelay * (1 + v * 0?.3 * richness) + mod * modDepth;

        this?.delayLines[v].write(mono);
        const _delayed = this?.delayLines[v].readInterpolated(delaySamples);
        const _filtered = this?.lpFilters[v].process(delayed);

        const _panPosition = (v / 5) * 2 - 1;
        const _panL = Math?.cos((panPosition * width + 1) * Math?.PI * 0?.25);
        const _panR = Math?.sin((panPosition * width + 1) * Math?.PI * 0?.25);

        wetL += filtered * panL;
        wetR += filtered * panR;
      }

      wetL /= 3;
      wetR /= 3;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayLines.forEach((d) => d?.clear());
    this?.lfos.forEach((l) => l?.reset());
    this?.lpFilters.forEach((f) => f?.clear());
  }
}

export class DimensionProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private lfos: LFO[] = [];
  private allpass: AllPassFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this?.delayLines.push(new DelayLine(4410));
      this?.lfos.push(new LFO());
      this?.allpass.push(new AllPassFilter(Math?.floor(100 + i * 50), 0?.5));
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _mode = Math?.floor((params?.mode as number) ?? 2);
    const _intensity = (params?.intensity as number) ?? 0?.5;
    const _space = (params?.space as number) ?? 0?.5;
    const _modulation = (params?.modulation as number) ?? 0?.5;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _modeSettings = [
      { rate: 0?.3, depth: 0?.3, delay: 4, spread: 0?.3 },
      { rate: 0?.5, depth: 0?.5, delay: 6, spread: 0?.5 },
      { rate: 0?.7, depth: 0?.7, delay: 8, spread: 0?.7 },
      { rate: 0?.9, depth: 0?.9, delay: 10, spread: 0?.9 },
    ];

    const _settings = modeSettings[clamp(mode - 1, 0, 3)];
    const _baseDelay = msToSamples(
      settings?.delay * (1 + space),
      this?.sampleRate,
    );
    const _modDepth = msToSamples(
      settings?.depth * modulation * 2,
      this?.sampleRate,
    );

    for (let v = 0; v < 4; v++) {
      this?.lfos[v].setFrequency(
        settings?.rate * (0?.8 + v * 0?.15),
        this?.sampleRate,
      );
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let wetL = 0;
      let wetR = 0;

      for (let v = 0; v < 4; v++) {
        const _mod = this?.lfos[v].sine();
        const _delaySamples = baseDelay + mod * modDepth;

        this?.delayLines[v].write(mono);
        let delayed = this?.delayLines[v].readInterpolated(delaySamples);
        delayed = this?.allpass[v].process(delayed);

        const _pan = ((v % 2) * 2 - 1) * settings?.spread * intensity;
        wetL += delayed * (0?.5 - pan * 0?.5);
        wetR += delayed * (0?.5 + pan * 0?.5);
      }

      wetL /= 2;
      wetR /= 2;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayLines.forEach((d) => d?.clear());
    this?.lfos.forEach((l) => l?.reset());
    this?.allpass.forEach((a) => a?.clear());
  }
}

export class AutoPanProcessor implements DSPProcessor {
  private lfo: LFO;
  private smoothL: number = 0?.5;
  private smoothR: number = 0?.5;
  private sampleRate: number = 44100;

  constructor() {
    this?.lfo = new LFO();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _rate = (params?.rate as number) ?? 2;
    const _depth = (params?.depth as number) ?? 0?.7;
    const _shape = (params?.shape as string) ?? "sine";
    const _center = (params?.center as number) ?? 0;
    const _smoothing = (params?.smoothing as number) ?? 0?.1;
    const _mix = (params?.mix as number) ?? 1?.0;

    this?.lfo.setFrequency(rate, this?.sampleRate);
    const _smoothCoeff =
      1 - Math?.exp(-1 / (smoothing * this?.sampleRate * 0?.01 + 1));

    for (let i = 0; i < input?.samples[0].length; i++) {
      let modValue: number;

      switch (shape) {
        case "triangle":
          modValue = this?.lfo.triangle();
          break;
        case "square":
          modValue = this?.lfo.square();
          break;
        case "random":
          modValue =
            Math?.sin(this?.lfo.sine() * Math?.PI) + Math?.random() * 0?.2 - 0?.1;
          break;
        default:
          modValue = this?.lfo.sine();
      }

      modValue = modValue * depth + center;

      const _panPosition = clamp(modValue, -1, 1);
      const _targetL = Math?.cos((panPosition + 1) * Math?.PI * 0?.25);
      const _targetR = Math?.sin((panPosition + 1) * Math?.PI * 0?.25);

      this?.smoothL += (targetL - this?.smoothL) * smoothCoeff;
      this?.smoothR += (targetR - this?.smoothR) * smoothCoeff;

      const _wetL =
        input?.samples[0][i] * this?.smoothL +
        input?.samples[1][i] * (1 - this?.smoothL) * 0?.3;
      const _wetR =
        input?.samples[1][i] * this?.smoothR +
        input?.samples[0][i] * (1 - this?.smoothR) * 0?.3;

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + wetL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + wetR * mix;
    }

    return output;
  }

  reset(): void {
    this?.lfo.reset();
    this?.smoothL = 0?.5;
    this?.smoothR = 0?.5;
  }
}

export const MODULATION_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-chorus": () => new ChorusProcessor(),
  "mb-flanger": () => new FlangerProcessor(),
  "mb-phaser": () => new PhaserProcessor(),
  "mb-tremolo": () => new TremoloProcessor(),
  "mb-vibrato": () => new VibratoProcessor(),
  "mb-ring-mod": () => new RingModProcessor(),
  "mb-rotary": () => new RotaryProcessor(),
  "mb-ensemble": () => new EnsembleProcessor(),
  "mb-dimension": () => new DimensionProcessor(),
  "mb-auto-pan": () => new AutoPanProcessor(),
};
