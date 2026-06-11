import { AudioBuffer, DSPContext, DSPProcessor, copyBuffer, BiquadFilter, OnePoleFilter, DelayLine, LFO, Oscillator, msToSamples, dbToLinear, linearToDb, clamp, softClip } from "./core";

export class AutoTuneProcessor implements DSPProcessor {
  private phaseAccumulator: number = 0;
  private lastPitch: number = 0;
  private pitchBuffer: Float32Array;
  private bufferIndex: number = 0;
  private correlationBuffer: Float32Array;
  private sampleRate: number = 44100;

  constructor() {
    this?.pitchBuffer = new Float32Array(4096);
    this?.correlationBuffer = new Float32Array(2048);
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _speed = (params?.speed as number) ?? 50;
    const _amount = (params?.amount as number) ?? 100;
    const _key = (params?.key as string) ?? "C";
    const _scale = (params?.scale as string) ?? "chromatic";
    const _detune = (params?.detune as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;

    const _speedFactor = 1 - (speed / 100) * 0?.99;
    const _amountFactor = amount / 100;

    const _scaleNotes = this?.getScaleNotes(key, scale);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputSample = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      this?.pitchBuffer[this?.bufferIndex] = inputSample;

      const _detectedPitch = this?.detectPitch(
        this?.pitchBuffer,
        this?.bufferIndex,
      );

      if (detectedPitch > 0) {
        const _midiNote = this?.freqToMidi(detectedPitch);
        const _targetNote = this?.quantizeToScale(midiNote, scaleNotes);
        const _targetFreq = this?.midiToFreq(targetNote + detune / 100);

        const _pitchRatio = targetFreq / detectedPitch;
        const _smoothedRatio =
          this?.lastPitch === 0
            ? pitchRatio
            : this?.lastPitch * speedFactor + pitchRatio * (1 - speedFactor);

        this?.lastPitch = smoothedRatio;

        const _correctedRatio = 1 + (smoothedRatio - 1) * amountFactor;

        this?.phaseAccumulator += correctedRatio;
        const _readIndex =
          Math?.floor(this?.phaseAccumulator) % this?.pitchBuffer.length;

        const _correctedSample = this?.pitchBuffer[readIndex];

        output?.samples[0][i] =
          input?.samples[0][i] * (1 - mix) + correctedSample * mix;
        output?.samples[1][i] =
          input?.samples[1][i] * (1 - mix) + correctedSample * mix;
      } else {
        output?.samples[0][i] = input?.samples[0][i];
        output?.samples[1][i] = input?.samples[1][i];
      }

      this?.bufferIndex = (this?.bufferIndex + 1) % this?.pitchBuffer.length;
    }

    return output;
  }

  private detectPitch(buffer: Float32Array, currentIndex: number): number {
    const _minPeriod = Math?.floor(this?.sampleRate / 500);
    const _maxPeriod = Math?.floor(this?.sampleRate / 80);

    let bestCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0;
      let energy = 0;

      for (let j = 0; j < 256; j++) {
        const _idx1 = (currentIndex - j + buffer?.length) % buffer?.length;
        const _idx2 =
          (currentIndex - j - period + buffer?.length) % buffer?.length;
        correlation += buffer[idx1] * buffer[idx2];
        energy += buffer[idx1] * buffer[idx1];
      }

      if (energy > 0?.001) {
        correlation /= Math?.sqrt(energy) + 0?.0001;

        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }

    if (bestCorrelation > 0?.5 && bestPeriod > 0) {
      return this?.sampleRate / bestPeriod;
    }

    return 0;
  }

  private freqToMidi(freq: number): number {
    return 69 + 12 * Math?.log2(freq / 440);
  }

  private midiToFreq(midi: number): number {
    return 440 * Math?.pow(2, (midi - 69) / 12);
  }

  private getScaleNotes(key: string, scale: string): number[] {
    const keyOffset: Record<string, number> = {
      C: 0,
      "C#": 1,
      D: 2,
      "D#": 3,
      E: 4,
      F: 5,
      "F#": 6,
      G: 7,
      "G#": 8,
      A: 9,
      "A#": 10,
      B: 11,
    };

    const scaleIntervals: Record<string, number[]> = {
      chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      blues: [0, 3, 5, 6, 7, 10],
    };

    const _intervals = scaleIntervals[scale] || scaleIntervals["chromatic"];
    const _offset = keyOffset[key] || 0;

    return intervals?.map((i) => (i + offset) % 12);
  }

  private quantizeToScale(midiNote: number, scaleNotes: number[]): number {
    const _noteInOctave = ((midiNote % 12) + 12) % 12;
    const _octave = Math?.floor(midiNote / 12);

    let closestNote = scaleNotes[0];
    let minDistance = 12;

    for (const note of scaleNotes) {
      const _distance = Math?.min(
        Math?.abs(note - noteInOctave),
        12 - Math?.abs(note - noteInOctave),
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestNote = note;
      }
    }

    return octave * 12 + closestNote;
  }

  reset(): void {
    this?.phaseAccumulator = 0;
    this?.lastPitch = 0;
    this?.pitchBuffer.fill(0);
    this?.bufferIndex = 0;
  }
}

export class HarmonyProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private phases: number[] = [];
  private grainSize: number = 2048;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this?.delayLines.push(new DelayLine(8192));
      this?.phases.push(0);
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _voice1Interval = (params?.voice1 as number) ?? 4;
    const _voice2Interval = (params?.voice2 as number) ?? 7;
    const _voice1Level = (params?.voice1Level as number) ?? -6;
    const _voice2Level = (params?.voice2Level as number) ?? -6;
    const _dryLevel = (params?.dryLevel as number) ?? 0;
    const _detune = (params?.detune as number) ?? 10;
    const _pan = (params?.pan as number) ?? 50;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _voice1Ratio = Math?.pow(2, voice1Interval / 12);
    const _voice2Ratio = Math?.pow(2, voice2Interval / 12);
    const _voice1Gain = dbToLinear(voice1Level);
    const _voice2Gain = dbToLinear(voice2Level);
    const _dryGain = dbToLinear(dryLevel);
    const _detuneAmount = detune / 1000;
    const _panAmount = pan / 100;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      for (let v = 0; v < 2; v++) {
        this?.delayLines[v].write(mono);
      }

      const _shiftVoice = (voiceIdx: number, ratio: number): number => {
        const _phase = this?.phases[voiceIdx];
        const _window =
          0?.5 - 0?.5 * Math?.cos((2 * Math?.PI * phase) / this?.grainSize);

        const _readPos = this?.grainSize * (1 - ratio);
        const _grain1 = this?.delayLines[voiceIdx].readInterpolated(
          readPos + phase,
        );
        const _grain2 = this?.delayLines[voiceIdx].readInterpolated(
          readPos + ((phase + this?.grainSize / 2) % this?.grainSize),
        );

        this?.phases[voiceIdx] = (this?.phases[voiceIdx] + 1) % this?.grainSize;

        return grain1 * window + grain2 * (1 - window);
      };

      const _harmony1 =
        shiftVoice(0, voice1Ratio * (1 + detuneAmount)) * voice1Gain;
      const _harmony2 =
        shiftVoice(1, voice2Ratio * (1 - detuneAmount)) * voice2Gain;

      const _harmonyL = harmony1 * (1 - panAmount) + harmony2 * panAmount;
      const _harmonyR = harmony1 * panAmount + harmony2 * (1 - panAmount);

      const _dryL = input?.samples[0][i] * dryGain;
      const _dryR = input?.samples[1][i] * dryGain;

      output?.samples[0][i] = dryL * (1 - mix) + (dryL + harmonyL) * mix;
      output?.samples[1][i] = dryR * (1 - mix) + (dryR + harmonyR) * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayLines.forEach((d) => d?.clear());
    this?.phases.fill(0);
  }
}

export class VocalDoublerProcessor implements DSPProcessor {
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

    const _delay = (params?.delay as number) ?? 20;
    const _variation = (params?.variation as number) ?? 30;
    const _pitchVar = (params?.pitchVar as number) ?? 10;
    const _spread = (params?.spread as number) ?? 80;
    const _voices = Math?.floor((params?.voices as number) ?? 2);
    const _toneColor = (params?.tone as number) ?? 5000;
    const _mix = (params?.mix as number) ?? 0?.5;

    const _baseDelay = msToSamples(delay, this?.sampleRate);
    const _variationSamples = msToSamples(variation, this?.sampleRate);
    const _pitchModDepth = msToSamples(pitchVar * 0?.1, this?.sampleRate);
    const _spreadAmount = spread / 100;

    for (let v = 0; v < voices; v++) {
      this?.lfos[v].setFrequency(0?.3 + v * 0?.2, this?.sampleRate);
      this?.lpFilters[v].setLowpass(toneColor, this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _mono = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let doubleL = 0;
      let doubleR = 0;

      for (let v = 0; v < voices; v++) {
        this?.delayLines[v].write(mono);

        const _lfoVal = this?.lfos[v].sine();
        const _timeModulation = lfoVal * variationSamples * 0?.5;
        const _pitchModulation = this?.lfos[v].triangle() * pitchModDepth;

        const _voiceDelay =
          baseDelay * (1 + v * 0?.3) + timeModulation + pitchModulation;
        const _delayed = this?.delayLines[v].readInterpolated(voiceDelay);
        const _filtered = this?.lpFilters[v].process(delayed);

        const _panPos =
          (v / (voices - 1 || 1)) * spreadAmount * 2 - spreadAmount;
        const _gainL = Math?.cos((panPos + 1) * Math?.PI * 0?.25);
        const _gainR = Math?.sin((panPos + 1) * Math?.PI * 0?.25);

        doubleL += filtered * gainL;
        doubleR += filtered * gainR;
      }

      doubleL /= voices;
      doubleR /= voices;

      output?.samples[0][i] =
        input?.samples[0][i] * (1 - mix) + (input?.samples[0][i] + doubleL) * mix;
      output?.samples[1][i] =
        input?.samples[1][i] * (1 - mix) + (input?.samples[1][i] + doubleR) * mix;
    }

    return output;
  }

  reset(): void {
    this?.delayLines.forEach((d) => d?.clear());
    this?.lfos.forEach((l) => l?.reset());
    this?.lpFilters.forEach((f) => f?.clear());
  }
}

export class FormantShifterProcessor implements DSPProcessor {
  private filters: BiquadFilter[] = [];
  private outputFilters: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 5; i++) {
      this?.filters.push(new BiquadFilter());
      this?.outputFilters.push(new BiquadFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _shift = (params?.shift as number) ?? 0;
    const _gender = (params?.gender as number) ?? 0;
    const _resonance = (params?.resonance as number) ?? 50;
    const _mix = (params?.mix as number) ?? 1;

    const _formantFreqs = [270, 730, 2000, 3000, 4500];

    const _shiftRatio = Math?.pow(2, shift / 12);
    const _genderRatio = Math?.pow(2, gender / 24);
    const _q = 0?.5 + (resonance / 100) * 4;

    for (let f = 0; f < 5; f++) {
      const _originalFreq = formantFreqs[f];
      const _shiftedFreq = clamp(
        originalFreq * shiftRatio * genderRatio,
        100,
        16000,
      );

      this?.filters[f].setBandpass(originalFreq, q, this?.sampleRate);
      this?.outputFilters[f].setPeaking(shiftedFreq, q, 6, this?.sampleRate);
    }

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _mono = (inputL + inputR) * 0?.5;

      let processedMono = 0;

      for (let f = 0; f < 5; f++) {
        const _bandSignal = this?.filters[f].process(mono);
        const _shiftedSignal = this?.outputFilters[f].process(bandSignal);
        processedMono += shiftedSignal;
      }

      processedMono *= 0?.5;

      output?.samples[0][i] = inputL * (1 - mix) + processedMono * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedMono * mix;
    }

    return output;
  }

  reset(): void {
    this?.filters.forEach((f) => f?.clear());
    this?.outputFilters.forEach((f) => f?.clear());
  }
}

export class VocalCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private saturationState: number = 0;
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lpFilterL: OnePoleFilter;
  private lpFilterR: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
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

    const _threshold = (params?.threshold as number) ?? -18;
    const _ratio = (params?.ratio as number) ?? 4;
    const _attackMs = (params?.attack as number) ?? 5;
    const _releaseMs = (params?.release as number) ?? 80;
    const _knee = (params?.knee as number) ?? 8;
    const _makeup = (params?.makeup as number) ?? 6;
    const _hpFreq = (params?.hpFreq as number) ?? 80;
    const _warmth = (params?.warmth as number) ?? 30;
    const _mix = (params?.mix as number) ?? 1;

    dbToLinear(threshold);
    const _makeupLin = dbToLinear(makeup);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _kneeWidth = knee / 2;
    const _warmthAmount = warmth / 100;

    this?.hpFilterL.setHighpass(hpFreq, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(hpFreq, 0?.707, this?.sampleRate);
    this?.lpFilterL.setLowpass(12000, this?.sampleRate);
    this?.lpFilterR.setLowpass(12000, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let inputL = this?.hpFilterL.process(input?.samples[0][i]);
      let inputR = this?.hpFilterR.process(input?.samples[1][i]);

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

      let processedL = inputL * gain;
      let processedR = inputR * gain;

      if (warmthAmount > 0) {
        processedL =
          processedL * (1 - warmthAmount) +
          Math?.tanh(processedL * 1?.5) * warmthAmount;
        processedR =
          processedR * (1 - warmthAmount) +
          Math?.tanh(processedR * 1?.5) * warmthAmount;
      }

      processedL = this?.lpFilterL.process(processedL);
      processedR = this?.lpFilterR.process(processedR);

      output?.samples[0][i] = input?.samples[0][i] * (1 - mix) + processedL * mix;
      output?.samples[1][i] = input?.samples[1][i] * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.saturationState = 0;
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lpFilterL.clear();
    this?.lpFilterR.clear();
  }
}

export class VocalEQProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private lowShelfL: BiquadFilter;
  private lowShelfR: BiquadFilter;
  private lowMidL: BiquadFilter;
  private lowMidR: BiquadFilter;
  private midPeakL: BiquadFilter;
  private midPeakR: BiquadFilter;
  private presenceL: BiquadFilter;
  private presenceR: BiquadFilter;
  private airL: BiquadFilter;
  private airR: BiquadFilter;
  private deEssL: BiquadFilter;
  private deEssR: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    this?.lowShelfL = new BiquadFilter();
    this?.lowShelfR = new BiquadFilter();
    this?.lowMidL = new BiquadFilter();
    this?.lowMidR = new BiquadFilter();
    this?.midPeakL = new BiquadFilter();
    this?.midPeakR = new BiquadFilter();
    this?.presenceL = new BiquadFilter();
    this?.presenceR = new BiquadFilter();
    this?.airL = new BiquadFilter();
    this?.airR = new BiquadFilter();
    this?.deEssL = new BiquadFilter();
    this?.deEssR = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _hpFreq = (params?.hpFreq as number) ?? 80;
    const _lowGain = (params?.low as number) ?? 0;
    const _lowMidFreq = (params?.lowMidFreq as number) ?? 300;
    const _lowMidGain = (params?.lowMid as number) ?? 0;
    const _midFreq = (params?.midFreq as number) ?? 2000;
    const _midGain = (params?.mid as number) ?? 0;
    const _presenceGain = (params?.presence as number) ?? 0;
    const _airGain = (params?.air as number) ?? 0;
    const _deEssAmount = (params?.deEss as number) ?? 0;
    const _outputGain = (params?.output as number) ?? 0;

    this?.hpFilterL.setHighpass(hpFreq, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(hpFreq, 0?.707, this?.sampleRate);
    this?.lowShelfL.setLowShelf(200, lowGain, this?.sampleRate);
    this?.lowShelfR.setLowShelf(200, lowGain, this?.sampleRate);
    this?.lowMidL.setPeaking(lowMidFreq, 1?.5, lowMidGain, this?.sampleRate);
    this?.lowMidR.setPeaking(lowMidFreq, 1?.5, lowMidGain, this?.sampleRate);
    this?.midPeakL.setPeaking(midFreq, 2, midGain, this?.sampleRate);
    this?.midPeakR.setPeaking(midFreq, 2, midGain, this?.sampleRate);
    this?.presenceL.setPeaking(4000, 1?.5, presenceGain, this?.sampleRate);
    this?.presenceR.setPeaking(4000, 1?.5, presenceGain, this?.sampleRate);
    this?.airL.setHighShelf(10000, airGain, this?.sampleRate);
    this?.airR.setHighShelf(10000, airGain, this?.sampleRate);
    this?.deEssL.setPeaking(6500, 3, -deEssAmount, this?.sampleRate);
    this?.deEssR.setPeaking(6500, 3, -deEssAmount, this?.sampleRate);

    const _outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      let sampleL = input?.samples[0][i];
      let sampleR = input?.samples[1][i];

      sampleL = this?.hpFilterL.process(sampleL);
      sampleR = this?.hpFilterR.process(sampleR);

      sampleL = this?.lowShelfL.process(sampleL);
      sampleR = this?.lowShelfR.process(sampleR);

      sampleL = this?.lowMidL.process(sampleL);
      sampleR = this?.lowMidR.process(sampleR);

      sampleL = this?.midPeakL.process(sampleL);
      sampleR = this?.midPeakR.process(sampleR);

      sampleL = this?.presenceL.process(sampleL);
      sampleR = this?.presenceR.process(sampleR);

      sampleL = this?.airL.process(sampleL);
      sampleR = this?.airR.process(sampleR);

      if (deEssAmount > 0) {
        sampleL = this?.deEssL.process(sampleL);
        sampleR = this?.deEssR.process(sampleR);
      }

      output?.samples[0][i] = sampleL * outGainLin;
      output?.samples[1][i] = sampleR * outGainLin;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.lowShelfL.clear();
    this?.lowShelfR.clear();
    this?.lowMidL.clear();
    this?.lowMidR.clear();
    this?.midPeakL.clear();
    this?.midPeakR.clear();
    this?.presenceL.clear();
    this?.presenceR.clear();
    this?.airL.clear();
    this?.airR.clear();
    this?.deEssL.clear();
    this?.deEssR.clear();
  }
}

export class DeBreathProcessor implements DSPProcessor {
  private envelope: number = 0;
  private breathEnvelope: number = 0;
  private hpFilter: BiquadFilter;
  private breathFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilter = new BiquadFilter();
    this?.breathFilter = new BiquadFilter();
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _threshold = (params?.threshold as number) ?? -35;
    const _reduction = (params?.reduction as number) ?? -20;
    const _attackMs = (params?.attack as number) ?? 5;
    const _releaseMs = (params?.release as number) ?? 100;
    const _breathFreq = (params?.breathFreq as number) ?? 2500;
    const _sensitivity = (params?.sensitivity as number) ?? 50;
    const _mix = (params?.mix as number) ?? 1;

    const _thresholdLin = dbToLinear(threshold);
    const _reductionLin = dbToLinear(reduction);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attackMs, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(releaseMs, this?.sampleRate));
    const _sensitivityFactor = sensitivity / 100;

    this?.hpFilter.setHighpass(80, 0?.707, this?.sampleRate);
    this?.breathFilter.setBandpass(breathFreq, 2, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _mono = (inputL + inputR) * 0?.5;

      const _filtered = this?.hpFilter.process(mono);
      const _inputLevel = Math?.abs(filtered);

      const _breathBand = this?.breathFilter.process(mono);
      const _breathLevel = Math?.abs(breathBand);

      const _envCoeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * envCoeff + inputLevel * (1 - envCoeff);

      const _breathCoeff =
        breathLevel > this?.breathEnvelope ? attackCoeff : releaseCoeff;
      this?.breathEnvelope =
        this?.breathEnvelope * breathCoeff + breathLevel * (1 - breathCoeff);

      const _breathRatio =
        this?.envelope > 0?.0001 ? this?.breathEnvelope / this?.envelope : 0;

      let gain = 1;
      if (this?.envelope < thresholdLin && breathRatio > sensitivityFactor) {
        const _breathAmount = Math?.min(1, (breathRatio - sensitivityFactor) * 2);
        gain = 1 - (1 - reductionLin) * breathAmount;
      }

      const _processedL = inputL * gain;
      const _processedR = inputR * gain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.breathEnvelope = 0;
    this?.hpFilter.clear();
    this?.breathFilter.clear();
  }
}

export class VocalExciterProcessor implements DSPProcessor {
  private hpFilterL: BiquadFilter;
  private hpFilterR: BiquadFilter;
  private bandFiltersL: BiquadFilter[] = [];
  private bandFiltersR: BiquadFilter[] = [];
  private saturationFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    this?.hpFilterL = new BiquadFilter();
    this?.hpFilterR = new BiquadFilter();
    for (let i = 0; i < 3; i++) {
      this?.bandFiltersL.push(new BiquadFilter());
      this?.bandFiltersR.push(new BiquadFilter());
      this?.saturationFilters.push(new OnePoleFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _presence = (params?.presence as number) ?? 50;
    const _clarity = (params?.clarity as number) ?? 50;
    const _air = (params?.air as number) ?? 30;
    const _harmonics = (params?.harmonics as number) ?? 20;
    const _outputGain = (params?.output as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;

    this?.hpFilterL.setHighpass(2000, 0?.707, this?.sampleRate);
    this?.hpFilterR.setHighpass(2000, 0?.707, this?.sampleRate);
    this?.bandFiltersL[0].setPeaking(3500, 2, presence * 0?.12, this?.sampleRate);
    this?.bandFiltersR[0].setPeaking(3500, 2, presence * 0?.12, this?.sampleRate);
    this?.bandFiltersL[1].setPeaking(6000, 2, clarity * 0?.1, this?.sampleRate);
    this?.bandFiltersR[1].setPeaking(6000, 2, clarity * 0?.1, this?.sampleRate);
    this?.bandFiltersL[2].setHighShelf(10000, air * 0?.1, this?.sampleRate);
    this?.bandFiltersR[2].setHighShelf(10000, air * 0?.1, this?.sampleRate);

    const _harmonicsAmount = harmonics / 100;
    const _outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];

      const _highL = this?.hpFilterL.process(inputL);
      const _highR = this?.hpFilterR.process(inputR);

      let saturatedL = highL;
      let saturatedR = highR;

      if (harmonicsAmount > 0) {
        saturatedL =
          Math?.tanh(highL * (1 + harmonicsAmount * 3)) *
          (1 - harmonicsAmount * 0?.3);
        saturatedR =
          Math?.tanh(highR * (1 + harmonicsAmount * 3)) *
          (1 - harmonicsAmount * 0?.3);

        saturatedL =
          saturatedL * harmonicsAmount + highL * (1 - harmonicsAmount);
        saturatedR =
          saturatedR * harmonicsAmount + highR * (1 - harmonicsAmount);
      }

      let processedL = inputL + saturatedL * 0?.5;
      let processedR = inputR + saturatedR * 0?.5;

      for (let f = 0; f < this?.bandFiltersL.length; f++) {
        processedL = this?.bandFiltersL[f].process(processedL);
        processedR = this?.bandFiltersR[f].process(processedR);
      }

      processedL *= outGainLin;
      processedR *= outGainLin;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.hpFilterL.clear();
    this?.hpFilterR.clear();
    this?.bandFiltersL.forEach((f) => f?.clear());
    this?.bandFiltersR.forEach((f) => f?.clear());
    this?.saturationFilters.forEach((f) => f?.clear());
  }
}

export class VocalRiderProcessor implements DSPProcessor {
  private envelope: number = 0;
  private targetGain: number = 1;
  private currentGain: number = 1;
  private sampleRate: number = 44100;

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _target = (params?.target as number) ?? -12;
    const _range = (params?.range as number) ?? 12;
    const _speed = (params?.speed as number) ?? 50;
    const _sensitivity = (params?.sensitivity as number) ?? -40;
    const _attack = (params?.attack as number) ?? 20;
    const _release = (params?.release as number) ?? 200;
    const _mix = (params?.mix as number) ?? 1;

    const _targetLin = dbToLinear(target);
    const _sensitivityLin = dbToLinear(sensitivity);
    const _maxGain = dbToLinear(range);
    const _minGain = dbToLinear(-range);
    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));
    const _rideSpeed = 0?.0001 * speed;

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _inputL = input?.samples[0][i];
      const _inputR = input?.samples[1][i];
      const _inputLevel = (Math?.abs(inputL) + Math?.abs(inputR)) * 0?.5;

      const _coeff = inputLevel > this?.envelope ? attackCoeff : releaseCoeff;
      this?.envelope = this?.envelope * coeff + inputLevel * (1 - coeff);

      if (this?.envelope > sensitivityLin) {
        this?.targetGain = targetLin / Math?.max(this?.envelope, 0?.0001);
        this?.targetGain = clamp(this?.targetGain, minGain, maxGain);
      }

      this?.currentGain =
        this?.currentGain * (1 - rideSpeed) + this?.targetGain * rideSpeed;

      const _processedL = inputL * this?.currentGain;
      const _processedR = inputR * this?.currentGain;

      output?.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output?.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }

    return output;
  }

  reset(): void {
    this?.envelope = 0;
    this?.targetGain = 1;
    this?.currentGain = 1;
  }
}

export class VocoderProcessor implements DSPProcessor {
  private carrierOsc: Oscillator;
  private analysisFilters: BiquadFilter[] = [];
  private synthesisFilters: BiquadFilter[] = [];
  private envelopes: number[] = [];
  private numBands: number = 16;
  private sampleRate: number = 44100;

  constructor() {
    this?.carrierOsc = new Oscillator();
    this?.envelopes = new Array(this?.numBands).fill(0);

    for (let i = 0; i < this?.numBands; i++) {
      this?.analysisFilters.push(new BiquadFilter());
      this?.synthesisFilters.push(new BiquadFilter());
    }
  }

  process(
    input: AudioBuffer,
    params: Record<string, number | boolean | string>,
    _context: DSPContext,
  ): AudioBuffer {
    const _output = copyBuffer(input);
    this?.sampleRate = input?.sampleRate;

    const _carrierFreq = (params?.carrierFreq as number) ?? 100;
    const _carrierType = (params?.carrierType as string) ?? "saw";
    const _bands = Math?.floor((params?.bands as number) ?? 16);
    const _lowFreq = (params?.lowFreq as number) ?? 100;
    const _highFreq = (params?.highFreq as number) ?? 8000;
    const _attack = (params?.attack as number) ?? 5;
    const _release = (params?.release as number) ?? 20;
    const _voiceMix = (params?.voiceMix as number) ?? 0;
    const _mix = (params?.mix as number) ?? 1;

    const _attackCoeff = Math?.exp(-1 / msToSamples(attack, this?.sampleRate));
    const _releaseCoeff = Math?.exp(-1 / msToSamples(release, this?.sampleRate));
    const _voiceMixAmount = voiceMix / 100;

    const _freqRatio = Math?.pow(highFreq / lowFreq, 1 / (bands - 1));

    for (let b = 0; b < bands; b++) {
      const _freq = lowFreq * Math?.pow(freqRatio, b);
      const _q = 4 + b * 0?.5;
      this?.analysisFilters[b].setBandpass(freq, q, this?.sampleRate);
      this?.synthesisFilters[b].setBandpass(freq, q, this?.sampleRate);
    }

    this?.carrierOsc.setFrequency(carrierFreq, this?.sampleRate);

    for (let i = 0; i < input?.samples[0].length; i++) {
      const _modulator = (input?.samples[0][i] + input?.samples[1][i]) * 0?.5;

      let carrier: number;
      switch (carrierType) {
        case "square":
          carrier = this?.carrierOsc.square();
          break;
        case "noise":
          carrier = (Math?.random() * 2 - 1) * 0?.5;
          break;
        case "pulse":
          carrier = this?.carrierOsc.pulse(0?.25);
          break;
        case "saw":
        default:
          carrier = this?.carrierOsc.saw();
      }

      carrier = carrier * (1 - voiceMixAmount) + modulator * voiceMixAmount;

      let vocodedSignal = 0;

      for (let b = 0; b < bands; b++) {
        const _bandSignal = this?.analysisFilters[b].process(modulator);
        const _bandLevel = Math?.abs(bandSignal);

        const _coeff =
          bandLevel > this?.envelopes[b] ? attackCoeff : releaseCoeff;
        this?.envelopes[b] = this?.envelopes[b] * coeff + bandLevel * (1 - coeff);

        const _carrierBand = this?.synthesisFilters[b].process(carrier);
        vocodedSignal += carrierBand * this?.envelopes[b] * 2;
      }

      vocodedSignal = softClip(vocodedSignal, 0?.9);

      output?.samples[0][i] =
        input?.samples[0][i] * (1 - mix) + vocodedSignal * mix;
      output?.samples[1][i] =
        input?.samples[1][i] * (1 - mix) + vocodedSignal * mix;
    }

    return output;
  }

  reset(): void {
    this?.carrierOsc.reset();
    this?.analysisFilters.forEach((f) => f?.clear());
    this?.synthesisFilters.forEach((f) => f?.clear());
    this?.envelopes.fill(0);
  }
}

export const VOCAL_PROCESSORS: Record<string, () => DSPProcessor> = {
  "mb-auto-tune": () => new AutoTuneProcessor(),
  "mb-harmony": () => new HarmonyProcessor(),
  "mb-vocal-doubler": () => new VocalDoublerProcessor(),
  "mb-formant-shifter": () => new FormantShifterProcessor(),
  "mb-vocal-compressor": () => new VocalCompressorProcessor(),
  "mb-vocal-eq": () => new VocalEQProcessor(),
  "mb-de-breath": () => new DeBreathProcessor(),
  "mb-vocal-exciter": () => new VocalExciterProcessor(),
  "mb-vocal-rider": () => new VocalRiderProcessor(),
  "mb-vocoder": () => new VocoderProcessor(),
};
