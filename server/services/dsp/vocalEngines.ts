import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter, LFO, Oscillator,
  msToSamples, dbToLinear, linearToDb, clamp, softClip
} from './core';

export class AutoTuneProcessor implements DSPProcessor {
  private phaseAccumulator: number = 0;
  private lastPitch: number = 0;
  private pitchBuffer: Float32Array;
  private bufferIndex: number = 0;
  private correlationBuffer: Float32Array;
  private sampleRate: number = 44100;

  constructor() {
    this.pitchBuffer = new Float32Array(4096);
    this.correlationBuffer = new Float32Array(2048);
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const speed = (params.speed as number) ?? 50;
    const amount = (params.amount as number) ?? 100;
    const key = (params.key as string) ?? 'C';
    const scale = (params.scale as string) ?? 'chromatic';
    const detune = (params.detune as number) ?? 0;
    const formantPreserve = (params.formant as boolean) ?? true;
    const mix = (params.mix as number) ?? 1;

    const speedFactor = 1 - (speed / 100) * 0.99;
    const amountFactor = amount / 100;
    
    const scaleNotes = this.getScaleNotes(key, scale);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputSample = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      this.pitchBuffer[this.bufferIndex] = inputSample;
      
      const detectedPitch = this.detectPitch(this.pitchBuffer, this.bufferIndex);
      
      if (detectedPitch > 0) {
        const midiNote = this.freqToMidi(detectedPitch);
        const targetNote = this.quantizeToScale(midiNote, scaleNotes);
        const targetFreq = this.midiToFreq(targetNote + detune / 100);
        
        const pitchRatio = targetFreq / detectedPitch;
        const smoothedRatio = this.lastPitch === 0 
          ? pitchRatio 
          : this.lastPitch * speedFactor + pitchRatio * (1 - speedFactor);
        
        this.lastPitch = smoothedRatio;
        
        const correctedRatio = 1 + (smoothedRatio - 1) * amountFactor;
        
        this.phaseAccumulator += correctedRatio;
        const readIndex = Math.floor(this.phaseAccumulator) % this.pitchBuffer.length;
        
        const correctedSample = this.pitchBuffer[readIndex];
        
        output.samples[0][i] = input.samples[0][i] * (1 - mix) + correctedSample * mix;
        output.samples[1][i] = input.samples[1][i] * (1 - mix) + correctedSample * mix;
      } else {
        output.samples[0][i] = input.samples[0][i];
        output.samples[1][i] = input.samples[1][i];
      }
      
      this.bufferIndex = (this.bufferIndex + 1) % this.pitchBuffer.length;
    }
    
    return output;
  }

  private detectPitch(buffer: Float32Array, currentIndex: number): number {
    const minPeriod = Math.floor(this.sampleRate / 500);
    const maxPeriod = Math.floor(this.sampleRate / 80);
    
    let bestCorrelation = 0;
    let bestPeriod = 0;
    
    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0;
      let energy = 0;
      
      for (let j = 0; j < 256; j++) {
        const idx1 = (currentIndex - j + buffer.length) % buffer.length;
        const idx2 = (currentIndex - j - period + buffer.length) % buffer.length;
        correlation += buffer[idx1] * buffer[idx2];
        energy += buffer[idx1] * buffer[idx1];
      }
      
      if (energy > 0.001) {
        correlation /= Math.sqrt(energy) + 0.0001;
        
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }
    
    if (bestCorrelation > 0.5 && bestPeriod > 0) {
      return this.sampleRate / bestPeriod;
    }
    
    return 0;
  }

  private freqToMidi(freq: number): number {
    return 69 + 12 * Math.log2(freq / 440);
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private getScaleNotes(key: string, scale: string): number[] {
    const keyOffset: Record<string, number> = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };
    
    const scaleIntervals: Record<string, number[]> = {
      'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      'major': [0, 2, 4, 5, 7, 9, 11],
      'minor': [0, 2, 3, 5, 7, 8, 10],
      'pentatonic': [0, 2, 4, 7, 9],
      'blues': [0, 3, 5, 6, 7, 10],
    };
    
    const intervals = scaleIntervals[scale] || scaleIntervals['chromatic'];
    const offset = keyOffset[key] || 0;
    
    return intervals.map(i => (i + offset) % 12);
  }

  private quantizeToScale(midiNote: number, scaleNotes: number[]): number {
    const noteInOctave = ((midiNote % 12) + 12) % 12;
    const octave = Math.floor(midiNote / 12);
    
    let closestNote = scaleNotes[0];
    let minDistance = 12;
    
    for (const note of scaleNotes) {
      const distance = Math.min(
        Math.abs(note - noteInOctave),
        12 - Math.abs(note - noteInOctave)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestNote = note;
      }
    }
    
    return octave * 12 + closestNote;
  }

  reset(): void {
    this.phaseAccumulator = 0;
    this.lastPitch = 0;
    this.pitchBuffer.fill(0);
    this.bufferIndex = 0;
  }
}

export class HarmonyProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private phases: number[] = [];
  private grainSize: number = 2048;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.delayLines.push(new DelayLine(8192));
      this.phases.push(0);
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const voice1Interval = (params.voice1 as number) ?? 4;
    const voice2Interval = (params.voice2 as number) ?? 7;
    const voice1Level = (params.voice1Level as number) ?? -6;
    const voice2Level = (params.voice2Level as number) ?? -6;
    const dryLevel = (params.dryLevel as number) ?? 0;
    const detune = (params.detune as number) ?? 10;
    const pan = (params.pan as number) ?? 50;
    const mix = (params.mix as number) ?? 0.5;

    const voice1Ratio = Math.pow(2, voice1Interval / 12);
    const voice2Ratio = Math.pow(2, voice2Interval / 12);
    const voice1Gain = dbToLinear(voice1Level);
    const voice2Gain = dbToLinear(voice2Level);
    const dryGain = dbToLinear(dryLevel);
    const detuneAmount = detune / 1000;
    const panAmount = pan / 100;

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      for (let v = 0; v < 2; v++) {
        this.delayLines[v].write(mono);
      }
      
      const shiftVoice = (voiceIdx: number, ratio: number): number => {
        const phase = this.phases[voiceIdx];
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase / this.grainSize);
        
        const readPos = this.grainSize * (1 - ratio);
        const grain1 = this.delayLines[voiceIdx].readInterpolated(readPos + phase);
        const grain2 = this.delayLines[voiceIdx].readInterpolated(readPos + (phase + this.grainSize / 2) % this.grainSize);
        
        this.phases[voiceIdx] = (this.phases[voiceIdx] + 1) % this.grainSize;
        
        return grain1 * window + grain2 * (1 - window);
      };
      
      const harmony1 = shiftVoice(0, voice1Ratio * (1 + detuneAmount)) * voice1Gain;
      const harmony2 = shiftVoice(1, voice2Ratio * (1 - detuneAmount)) * voice2Gain;
      
      const harmonyL = harmony1 * (1 - panAmount) + harmony2 * panAmount;
      const harmonyR = harmony1 * panAmount + harmony2 * (1 - panAmount);
      
      const dryL = input.samples[0][i] * dryGain;
      const dryR = input.samples[1][i] * dryGain;
      
      output.samples[0][i] = dryL * (1 - mix) + (dryL + harmonyL) * mix;
      output.samples[1][i] = dryR * (1 - mix) + (dryR + harmonyR) * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayLines.forEach(d => d.clear());
    this.phases.fill(0);
  }
}

export class VocalDoublerProcessor implements DSPProcessor {
  private delayLines: DelayLine[] = [];
  private lfos: LFO[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.delayLines.push(new DelayLine(4410));
      this.lfos.push(new LFO());
      this.lpFilters.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const delay = (params.delay as number) ?? 20;
    const variation = (params.variation as number) ?? 30;
    const pitchVar = (params.pitchVar as number) ?? 10;
    const spread = (params.spread as number) ?? 80;
    const voices = Math.floor((params.voices as number) ?? 2);
    const toneColor = (params.tone as number) ?? 5000;
    const mix = (params.mix as number) ?? 0.5;

    const baseDelay = msToSamples(delay, this.sampleRate);
    const variationSamples = msToSamples(variation, this.sampleRate);
    const pitchModDepth = msToSamples(pitchVar * 0.1, this.sampleRate);
    const spreadAmount = spread / 100;

    for (let v = 0; v < voices; v++) {
      this.lfos[v].setFrequency(0.3 + v * 0.2, this.sampleRate);
      this.lpFilters[v].setLowpass(toneColor, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let doubleL = 0;
      let doubleR = 0;
      
      for (let v = 0; v < voices; v++) {
        this.delayLines[v].write(mono);
        
        const lfoVal = this.lfos[v].sine();
        const timeModulation = lfoVal * variationSamples * 0.5;
        const pitchModulation = this.lfos[v].triangle() * pitchModDepth;
        
        const voiceDelay = baseDelay * (1 + v * 0.3) + timeModulation + pitchModulation;
        const delayed = this.delayLines[v].readInterpolated(voiceDelay);
        const filtered = this.lpFilters[v].process(delayed);
        
        const panPos = (v / (voices - 1 || 1)) * spreadAmount * 2 - spreadAmount;
        const gainL = Math.cos((panPos + 1) * Math.PI * 0.25);
        const gainR = Math.sin((panPos + 1) * Math.PI * 0.25);
        
        doubleL += filtered * gainL;
        doubleR += filtered * gainR;
      }
      
      doubleL /= voices;
      doubleR /= voices;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + (input.samples[0][i] + doubleL) * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + (input.samples[1][i] + doubleR) * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayLines.forEach(d => d.clear());
    this.lfos.forEach(l => l.reset());
    this.lpFilters.forEach(f => f.clear());
  }
}

export class FormantShifterProcessor implements DSPProcessor {
  private filters: BiquadFilter[] = [];
  private outputFilters: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 5; i++) {
      this.filters.push(new BiquadFilter());
      this.outputFilters.push(new BiquadFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const shift = (params.shift as number) ?? 0;
    const gender = (params.gender as number) ?? 0;
    const resonance = (params.resonance as number) ?? 50;
    const mix = (params.mix as number) ?? 1;

    const formantFreqs = [270, 730, 2000, 3000, 4500];
    const formantBandwidths = [60, 90, 150, 200, 300];
    
    const shiftRatio = Math.pow(2, shift / 12);
    const genderRatio = Math.pow(2, gender / 24);
    const q = 0.5 + (resonance / 100) * 4;

    for (let f = 0; f < 5; f++) {
      const originalFreq = formantFreqs[f];
      const shiftedFreq = clamp(originalFreq * shiftRatio * genderRatio, 100, 16000);
      
      this.filters[f].setBandpass(originalFreq, q, this.sampleRate);
      this.outputFilters[f].setPeaking(shiftedFreq, q, 6, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const mono = (inputL + inputR) * 0.5;
      
      let processedMono = 0;
      
      for (let f = 0; f < 5; f++) {
        const bandSignal = this.filters[f].process(mono);
        const shiftedSignal = this.outputFilters[f].process(bandSignal);
        processedMono += shiftedSignal;
      }
      
      processedMono *= 0.5;
      
      output.samples[0][i] = inputL * (1 - mix) + processedMono * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedMono * mix;
    }
    
    return output;
  }

  reset(): void {
    this.filters.forEach(f => f.clear());
    this.outputFilters.forEach(f => f.clear());
  }
}

export class VocalCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private saturationState: number = 0;
  private hpFilter: BiquadFilter;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -18;
    const ratio = (params.ratio as number) ?? 4;
    const attackMs = (params.attack as number) ?? 5;
    const releaseMs = (params.release as number) ?? 80;
    const knee = (params.knee as number) ?? 8;
    const makeup = (params.makeup as number) ?? 6;
    const hpFreq = (params.hpFreq as number) ?? 80;
    const warmth = (params.warmth as number) ?? 30;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const kneeWidth = knee / 2;
    const warmthAmount = warmth / 100;

    this.hpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(12000, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      let inputL = this.hpFilter.process(input.samples[0][i]);
      let inputR = this.hpFilter.process(input.samples[1][i]);
      
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      const inputDb = linearToDb(this.envelope);
      let gainReduction = 0;
      
      if (inputDb > threshold + kneeWidth) {
        gainReduction = (inputDb - threshold) * (1 - 1 / ratio);
      } else if (inputDb > threshold - kneeWidth) {
        const x = inputDb - threshold + kneeWidth;
        gainReduction = (x * x) / (4 * kneeWidth) * (1 - 1 / ratio);
      }
      
      const gain = dbToLinear(-gainReduction) * makeupLin;
      
      let processedL = inputL * gain;
      let processedR = inputR * gain;
      
      if (warmthAmount > 0) {
        processedL = processedL * (1 - warmthAmount) + 
          Math.tanh(processedL * 1.5) * warmthAmount;
        processedR = processedR * (1 - warmthAmount) + 
          Math.tanh(processedR * 1.5) * warmthAmount;
      }
      
      processedL = this.lpFilter.process(processedL);
      processedR = this.lpFilter.process(processedR);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.saturationState = 0;
    this.hpFilter.clear();
    this.lpFilter.clear();
  }
}

export class VocalEQProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lowShelf: BiquadFilter;
  private lowMid: BiquadFilter;
  private midPeak: BiquadFilter;
  private presence: BiquadFilter;
  private air: BiquadFilter;
  private deEss: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lowShelf = new BiquadFilter();
    this.lowMid = new BiquadFilter();
    this.midPeak = new BiquadFilter();
    this.presence = new BiquadFilter();
    this.air = new BiquadFilter();
    this.deEss = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const hpFreq = (params.hpFreq as number) ?? 80;
    const lowGain = (params.low as number) ?? 0;
    const lowMidFreq = (params.lowMidFreq as number) ?? 300;
    const lowMidGain = (params.lowMid as number) ?? 0;
    const midFreq = (params.midFreq as number) ?? 2000;
    const midGain = (params.mid as number) ?? 0;
    const presenceGain = (params.presence as number) ?? 0;
    const airGain = (params.air as number) ?? 0;
    const deEssAmount = (params.deEss as number) ?? 0;
    const outputGain = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    this.lowShelf.setLowShelf(200, lowGain, this.sampleRate);
    this.lowMid.setPeaking(lowMidFreq, 1.5, lowMidGain, this.sampleRate);
    this.midPeak.setPeaking(midFreq, 2, midGain, this.sampleRate);
    this.presence.setPeaking(4000, 1.5, presenceGain, this.sampleRate);
    this.air.setHighShelf(10000, airGain, this.sampleRate);
    this.deEss.setPeaking(6500, 3, -deEssAmount, this.sampleRate);

    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      
      sampleL = this.lowMid.process(sampleL);
      sampleR = this.lowMid.process(sampleR);
      
      sampleL = this.midPeak.process(sampleL);
      sampleR = this.midPeak.process(sampleR);
      
      sampleL = this.presence.process(sampleL);
      sampleR = this.presence.process(sampleR);
      
      sampleL = this.air.process(sampleL);
      sampleR = this.air.process(sampleR);
      
      if (deEssAmount > 0) {
        sampleL = this.deEss.process(sampleL);
        sampleR = this.deEss.process(sampleR);
      }
      
      output.samples[0][i] = sampleL * outGainLin;
      output.samples[1][i] = sampleR * outGainLin;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lowShelf.clear();
    this.lowMid.clear();
    this.midPeak.clear();
    this.presence.clear();
    this.air.clear();
    this.deEss.clear();
  }
}

export class DeBreathProcessor implements DSPProcessor {
  private envelope: number = 0;
  private breathEnvelope: number = 0;
  private hpFilter: BiquadFilter;
  private breathFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.breathFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -35;
    const reduction = (params.reduction as number) ?? -20;
    const attackMs = (params.attack as number) ?? 5;
    const releaseMs = (params.release as number) ?? 100;
    const breathFreq = (params.breathFreq as number) ?? 2500;
    const sensitivity = (params.sensitivity as number) ?? 50;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const reductionLin = dbToLinear(reduction);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const sensitivityFactor = sensitivity / 100;

    this.hpFilter.setHighpass(80, 0.707, this.sampleRate);
    this.breathFilter.setBandpass(breathFreq, 2, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const mono = (inputL + inputR) * 0.5;
      
      const filtered = this.hpFilter.process(mono);
      const inputLevel = Math.abs(filtered);
      
      const breathBand = this.breathFilter.process(mono);
      const breathLevel = Math.abs(breathBand);
      
      const envCoeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * envCoeff + inputLevel * (1 - envCoeff);
      
      const breathCoeff = breathLevel > this.breathEnvelope ? attackCoeff : releaseCoeff;
      this.breathEnvelope = this.breathEnvelope * breathCoeff + breathLevel * (1 - breathCoeff);
      
      const breathRatio = this.envelope > 0.0001 
        ? this.breathEnvelope / this.envelope 
        : 0;
      
      let gain = 1;
      if (this.envelope < thresholdLin && breathRatio > sensitivityFactor) {
        const breathAmount = Math.min(1, (breathRatio - sensitivityFactor) * 2);
        gain = 1 - (1 - reductionLin) * breathAmount;
      }
      
      const processedL = inputL * gain;
      const processedR = inputR * gain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.breathEnvelope = 0;
    this.hpFilter.clear();
    this.breathFilter.clear();
  }
}

export class VocalExciterProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private bandFilters: BiquadFilter[] = [];
  private saturationFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    for (let i = 0; i < 3; i++) {
      this.bandFilters.push(new BiquadFilter());
      this.saturationFilters.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const presence = (params.presence as number) ?? 50;
    const clarity = (params.clarity as number) ?? 50;
    const air = (params.air as number) ?? 30;
    const harmonics = (params.harmonics as number) ?? 20;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    this.hpFilter.setHighpass(2000, 0.707, this.sampleRate);
    this.bandFilters[0].setPeaking(3500, 2, presence * 0.12, this.sampleRate);
    this.bandFilters[1].setPeaking(6000, 2, clarity * 0.1, this.sampleRate);
    this.bandFilters[2].setHighShelf(10000, air * 0.1, this.sampleRate);

    const harmonicsAmount = harmonics / 100;
    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      const highL = this.hpFilter.process(inputL);
      const highR = this.hpFilter.process(inputR);
      
      let saturatedL = highL;
      let saturatedR = highR;
      
      if (harmonicsAmount > 0) {
        saturatedL = Math.tanh(highL * (1 + harmonicsAmount * 3)) * (1 - harmonicsAmount * 0.3);
        saturatedR = Math.tanh(highR * (1 + harmonicsAmount * 3)) * (1 - harmonicsAmount * 0.3);
        
        saturatedL = saturatedL * harmonicsAmount + highL * (1 - harmonicsAmount);
        saturatedR = saturatedR * harmonicsAmount + highR * (1 - harmonicsAmount);
      }
      
      let processedL = inputL + saturatedL * 0.5;
      let processedR = inputR + saturatedR * 0.5;
      
      for (const filter of this.bandFilters) {
        processedL = filter.process(processedL);
        processedR = filter.process(processedR);
      }
      
      processedL *= outGainLin;
      processedR *= outGainLin;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.bandFilters.forEach(f => f.clear());
    this.saturationFilters.forEach(f => f.clear());
  }
}

export class VocalRiderProcessor implements DSPProcessor {
  private envelope: number = 0;
  private targetGain: number = 1;
  private currentGain: number = 1;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const target = (params.target as number) ?? -12;
    const range = (params.range as number) ?? 12;
    const speed = (params.speed as number) ?? 50;
    const sensitivity = (params.sensitivity as number) ?? -40;
    const attack = (params.attack as number) ?? 20;
    const release = (params.release as number) ?? 200;
    const mix = (params.mix as number) ?? 1;

    const targetLin = dbToLinear(target);
    const sensitivityLin = dbToLinear(sensitivity);
    const maxGain = dbToLinear(range);
    const minGain = dbToLinear(-range);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));
    const rideSpeed = 0.0001 * speed;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = (Math.abs(inputL) + Math.abs(inputR)) * 0.5;
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      if (this.envelope > sensitivityLin) {
        this.targetGain = targetLin / Math.max(this.envelope, 0.0001);
        this.targetGain = clamp(this.targetGain, minGain, maxGain);
      }
      
      this.currentGain = this.currentGain * (1 - rideSpeed) + this.targetGain * rideSpeed;
      
      const processedL = inputL * this.currentGain;
      const processedR = inputR * this.currentGain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.targetGain = 1;
    this.currentGain = 1;
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
    this.carrierOsc = new Oscillator();
    this.envelopes = new Array(this.numBands).fill(0);
    
    for (let i = 0; i < this.numBands; i++) {
      this.analysisFilters.push(new BiquadFilter());
      this.synthesisFilters.push(new BiquadFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const carrierFreq = (params.carrierFreq as number) ?? 100;
    const carrierType = (params.carrierType as string) ?? 'saw';
    const bands = Math.floor((params.bands as number) ?? 16);
    const lowFreq = (params.lowFreq as number) ?? 100;
    const highFreq = (params.highFreq as number) ?? 8000;
    const attack = (params.attack as number) ?? 5;
    const release = (params.release as number) ?? 20;
    const voiceMix = (params.voiceMix as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));
    const voiceMixAmount = voiceMix / 100;
    
    const freqRatio = Math.pow(highFreq / lowFreq, 1 / (bands - 1));
    
    for (let b = 0; b < bands; b++) {
      const freq = lowFreq * Math.pow(freqRatio, b);
      const q = 4 + b * 0.5;
      this.analysisFilters[b].setBandpass(freq, q, this.sampleRate);
      this.synthesisFilters[b].setBandpass(freq, q, this.sampleRate);
    }

    this.carrierOsc.setFrequency(carrierFreq, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const modulator = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let carrier: number;
      switch (carrierType) {
        case 'square':
          carrier = this.carrierOsc.square();
          break;
        case 'noise':
          carrier = (Math.random() * 2 - 1) * 0.5;
          break;
        case 'pulse':
          carrier = this.carrierOsc.pulse(0.25);
          break;
        case 'saw':
        default:
          carrier = this.carrierOsc.saw();
      }
      
      carrier = carrier * (1 - voiceMixAmount) + modulator * voiceMixAmount;
      
      let vocodedSignal = 0;
      
      for (let b = 0; b < bands; b++) {
        const bandSignal = this.analysisFilters[b].process(modulator);
        const bandLevel = Math.abs(bandSignal);
        
        const coeff = bandLevel > this.envelopes[b] ? attackCoeff : releaseCoeff;
        this.envelopes[b] = this.envelopes[b] * coeff + bandLevel * (1 - coeff);
        
        const carrierBand = this.synthesisFilters[b].process(carrier);
        vocodedSignal += carrierBand * this.envelopes[b] * 2;
      }
      
      vocodedSignal = softClip(vocodedSignal, 0.9);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + vocodedSignal * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + vocodedSignal * mix;
    }
    
    return output;
  }

  reset(): void {
    this.carrierOsc.reset();
    this.analysisFilters.forEach(f => f.clear());
    this.synthesisFilters.forEach(f => f.clear());
    this.envelopes.fill(0);
  }
}

export const VOCAL_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-auto-tune': () => new AutoTuneProcessor(),
  'mb-harmony': () => new HarmonyProcessor(),
  'mb-vocal-doubler': () => new VocalDoublerProcessor(),
  'mb-formant-shifter': () => new FormantShifterProcessor(),
  'mb-vocal-compressor': () => new VocalCompressorProcessor(),
  'mb-vocal-eq': () => new VocalEQProcessor(),
  'mb-de-breath': () => new DeBreathProcessor(),
  'mb-vocal-exciter': () => new VocalExciterProcessor(),
  'mb-vocal-rider': () => new VocalRiderProcessor(),
  'mb-vocoder': () => new VocoderProcessor(),
};
