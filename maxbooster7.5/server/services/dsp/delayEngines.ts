import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  DelayLine, BiquadFilter, OnePoleFilter, EnvelopeFollower, LFO,
  msToSamples, dbToLinear, softClip
} from './core';

export class TapeDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private wowFlutter: number = 0;
  private saturation: number = 0;
  private lpFilter: OnePoleFilter;
  private hpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lpFilter = new OnePoleFilter();
    this.hpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const time = (params.time as number) ?? 400;
    const feedback = (params.feedback as number) ?? 0.5;
    const wow = (params.wow as number) ?? 0.3;
    const flutter = (params.flutter as number) ?? 0.2;
    const saturationAmount = (params.saturation as number) ?? 0.4;
    const highCut = (params.highCut as number) ?? 4000;
    const lowCut = (params.lowCut as number) ?? 80;
    const stereoSpread = (params.spread as number) ?? 0.1;

    const delaySamples = msToSamples(time, this.sampleRate);
    const delaySpread = msToSamples(time * stereoSpread, this.sampleRate);
    
    this.lpFilter.setLowpass(highCut, this.sampleRate);
    this.hpFilter.setHighpass(lowCut, 0.707, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      this.wowFlutter += 0.0001;
      const wowMod = Math.sin(this.wowFlutter * 0.4) * wow * 20;
      const flutterMod = Math.sin(this.wowFlutter * 7) * flutter * 5;
      const modulation = wowMod + flutterMod;
      
      const delayedL = this.delayL.readInterpolated(delaySamples + modulation);
      const delayedR = this.delayR.readInterpolated(delaySamples + delaySpread - modulation);
      
      let filteredL = this.lpFilter.process(delayedL);
      let filteredR = this.lpFilter.process(delayedR);
      filteredL = this.hpFilter.process(filteredL);
      filteredR = this.hpFilter.process(filteredR);
      
      const saturatedL = Math.tanh(filteredL * (1 + saturationAmount * 2)) * (1 / (1 + saturationAmount));
      const saturatedR = Math.tanh(filteredR * (1 + saturationAmount * 2)) * (1 / (1 + saturationAmount));
      
      this.delayL.write(input.samples[0][i] + saturatedL * feedback);
      this.delayR.write(input.samples[1][i] + saturatedR * feedback);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + saturatedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + saturatedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.wowFlutter = 0;
  }
}

export class DigitalDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.35;
    const timeL = (params.timeLeft as number) ?? 375;
    const timeR = (params.timeRight as number) ?? 500;
    const feedback = (params.feedback as number) ?? 0.4;
    const highCut = (params.highCut as number) ?? 12000;
    const sync = (params.sync as boolean) ?? false;
    const pingPong = (params.pingPong as boolean) ?? false;

    const delaySamplesL = msToSamples(timeL, this.sampleRate);
    const delaySamplesR = msToSamples(timeR, this.sampleRate);
    
    this.lpFilter.setLowpass(highCut, 0.707, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const delayedL = this.delayL.read(delaySamplesL);
      const delayedR = this.delayR.read(delaySamplesR);
      
      const filteredL = this.lpFilter.process(delayedL);
      const filteredR = this.lpFilter.process(delayedR);
      
      if (pingPong) {
        this.delayL.write(input.samples[0][i] + filteredR * feedback);
        this.delayR.write(input.samples[1][i] + filteredL * feedback);
      } else {
        this.delayL.write(input.samples[0][i] + filteredL * feedback);
        this.delayR.write(input.samples[1][i] + filteredR * feedback);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + filteredL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + filteredR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.lpFilter.clear();
  }
}

export class PingPongDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lpFilter: OnePoleFilter;
  private hpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lpFilter = new OnePoleFilter();
    this.hpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const time = (params.time as number) ?? 300;
    const feedback = (params.feedback as number) ?? 0.55;
    const spread = (params.spread as number) ?? 1.0;
    const highCut = (params.highCut as number) ?? 8000;
    const lowCut = (params.lowCut as number) ?? 100;
    const width = (params.width as number) ?? 1.0;

    const delaySamples = msToSamples(time, this.sampleRate);
    
    this.lpFilter.setLowpass(highCut, this.sampleRate);
    this.hpFilter.setHighpass(lowCut, 0.707, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      const delayedL = this.delayL.read(delaySamples);
      const delayedR = this.delayR.read(delaySamples);
      
      let filteredL = this.lpFilter.process(delayedL);
      let filteredR = this.lpFilter.process(delayedR);
      filteredL = this.hpFilter.process(filteredL);
      filteredR = this.hpFilter.process(filteredR);
      
      this.delayL.write(mono + filteredR * feedback * spread);
      this.delayR.write(filteredL * feedback);
      
      const wetL = filteredL * width;
      const wetR = filteredR * width;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
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

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.3;
    const time = (params.time as number) ?? 80;
    const feedback = (params.feedback as number) ?? 0.1;
    const tone = (params.tone as number) ?? 0.6;
    const doubleTrack = (params.doubleTrack as boolean) ?? false;

    const delaySamples = msToSamples(time, this.sampleRate);
    this.lpFilter.setLowpass(2000 + tone * 8000, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      const delayed = this.delay.read(delaySamples);
      const filtered = this.lpFilter.process(delayed);
      
      this.delay.write(mono + filtered * feedback);
      
      let wetL = filtered;
      let wetR = filtered;
      
      if (doubleTrack) {
        wetL *= 0.7;
        wetR *= 1.0;
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delay.clear();
    this.lpFilter.clear();
  }
}

export class ModDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private lfoL: LFO;
  private lfoR: LFO;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.lfoL = new LFO();
    this.lfoR = new LFO();
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const time = (params.time as number) ?? 350;
    const feedback = (params.feedback as number) ?? 0.45;
    const modRate = (params.modRate as number) ?? 0.5;
    const modDepth = (params.modDepth as number) ?? 0.3;
    const highCut = (params.highCut as number) ?? 6000;
    const stereoPhase = (params.stereoPhase as number) ?? 0.5;

    const baseDelaySamples = msToSamples(time, this.sampleRate);
    const maxModSamples = msToSamples(time * 0.2, this.sampleRate);
    
    this.lfoL.setFrequency(modRate, this.sampleRate);
    this.lfoR.setFrequency(modRate * (1 + stereoPhase * 0.1), this.sampleRate);
    this.lpFilter.setLowpass(highCut, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const modL = this.lfoL.triangle() * modDepth * maxModSamples;
      const modR = this.lfoR.triangle() * modDepth * maxModSamples;
      
      const delayedL = this.delayL.readInterpolated(baseDelaySamples + modL);
      const delayedR = this.delayR.readInterpolated(baseDelaySamples + modR);
      
      const filteredL = this.lpFilter.process(delayedL);
      const filteredR = this.lpFilter.process(delayedR);
      
      this.delayL.write(input.samples[0][i] + filteredL * feedback);
      this.delayR.write(input.samples[1][i] + filteredR * feedback);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + filteredL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + filteredR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.lfoL.reset();
    this.lfoR.reset();
    this.lpFilter.clear();
  }
}

export class DuckingDelayProcessor implements DSPProcessor {
  private delayL: DelayLine;
  private delayR: DelayLine;
  private envelope: EnvelopeFollower;
  private lpFilter: OnePoleFilter;
  private duckAmount: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.delayL = new DelayLine(220500);
    this.delayR = new DelayLine(220500);
    this.envelope = new EnvelopeFollower(5, 200, 44100);
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.5;
    const time = (params.time as number) ?? 400;
    const feedback = (params.feedback as number) ?? 0.45;
    const threshold = dbToLinear((params.threshold as number) ?? -20);
    const duckDepth = (params.duckDepth as number) ?? 0.8;
    const attackMs = (params.attack as number) ?? 10;
    const releaseMs = (params.release as number) ?? 300;
    const highCut = (params.highCut as number) ?? 8000;

    const delaySamples = msToSamples(time, this.sampleRate);
    
    this.envelope.setAttack(attackMs, this.sampleRate);
    this.envelope.setRelease(releaseMs, this.sampleRate);
    this.lpFilter.setLowpass(highCut, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const inputLevel = this.envelope.process(mono);
      
      const duckGain = inputLevel > threshold 
        ? 1 - duckDepth * Math.min(1, (inputLevel - threshold) / threshold)
        : 1;
      
      const delayedL = this.delayL.read(delaySamples);
      const delayedR = this.delayR.read(delaySamples);
      
      const filteredL = this.lpFilter.process(delayedL);
      const filteredR = this.lpFilter.process(delayedR);
      
      this.delayL.write(input.samples[0][i] + filteredL * feedback);
      this.delayR.write(input.samples[1][i] + filteredR * feedback);
      
      const wetL = filteredL * duckGain;
      const wetR = filteredR * duckGain;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.envelope.clear();
    this.lpFilter.clear();
    this.duckAmount = 0;
  }
}

export class MultiTapDelayProcessor implements DSPProcessor {
  private taps: DelayLine[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.taps.push(new DelayLine(220500));
      this.lpFilters.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const baseTime = (params.time as number) ?? 200;
    const feedback = (params.feedback as number) ?? 0.3;
    const spread = (params.spread as number) ?? 1.0;
    const decay = (params.decay as number) ?? 0.8;
    const highCut = (params.highCut as number) ?? 6000;
    const numTaps = Math.floor((params.taps as number) ?? 4);
    const pattern = (params.pattern as string) ?? 'linear';

    const tapTimes = this.calculateTapTimes(baseTime, numTaps, spread, pattern);
    const tapGains = this.calculateTapGains(numTaps, decay);
    
    for (let i = 0; i < numTaps; i++) {
      this.lpFilters[i].setLowpass(highCut * Math.pow(decay, i), this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let wetL = 0, wetR = 0;
      let feedbackSum = 0;
      
      for (let t = 0; t < numTaps; t++) {
        const delaySamples = msToSamples(tapTimes[t], this.sampleRate);
        const delayed = this.taps[t].read(delaySamples);
        const filtered = this.lpFilters[t].process(delayed) * tapGains[t];
        
        const pan = (t / (numTaps - 1)) * Math.PI;
        wetL += filtered * Math.cos(pan);
        wetR += filtered * Math.sin(pan);
        feedbackSum += filtered;
      }
      
      for (let t = 0; t < numTaps; t++) {
        this.taps[t].write(mono + feedbackSum * feedback / numTaps);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  private calculateTapTimes(baseTime: number, numTaps: number, spread: number, pattern: string): number[] {
    const times: number[] = [];
    for (let i = 0; i < numTaps; i++) {
      let time = baseTime;
      switch (pattern) {
        case 'linear': time = baseTime * (i + 1) * spread; break;
        case 'golden': time = baseTime * Math.pow(1.618, i) * spread; break;
        case 'fibonacci': time = baseTime * this.fibonacci(i + 2) * spread / 10; break;
        case 'random': time = baseTime * (0.5 + Math.random()) * (i + 1) * spread; break;
        default: time = baseTime * (i + 1) * spread;
      }
      times.push(time);
    }
    return times;
  }

  private calculateTapGains(numTaps: number, decay: number): number[] {
    return Array.from({ length: numTaps }, (_, i) => Math.pow(decay, i));
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
      const temp = a + b;
      a = b;
      b = temp;
    }
    return b;
  }

  reset(): void {
    this.taps.forEach(t => t.clear());
    this.lpFilters.forEach(f => f.clear());
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

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const time = (params.time as number) ?? 350;
    const feedback = (params.feedback as number) ?? 0.5;
    const filterFreq = (params.filterFreq as number) ?? 2000;
    const filterQ = (params.filterQ as number) ?? 2;
    const filterType = (params.filterType as string) ?? 'lowpass';
    const modRate = (params.modRate as number) ?? 0.3;
    const modDepth = (params.modDepth as number) ?? 0.5;

    const delaySamples = msToSamples(time, this.sampleRate);
    this.lfo.setFrequency(modRate, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mod = this.lfo.sine() * modDepth;
      const modulatedFreq = filterFreq * Math.pow(2, mod);
      
      switch (filterType) {
        case 'lowpass':
          this.filterL.setLowpass(modulatedFreq, filterQ, this.sampleRate);
          this.filterR.setLowpass(modulatedFreq, filterQ, this.sampleRate);
          break;
        case 'highpass':
          this.filterL.setHighpass(modulatedFreq, filterQ, this.sampleRate);
          this.filterR.setHighpass(modulatedFreq, filterQ, this.sampleRate);
          break;
        case 'bandpass':
          this.filterL.setBandpass(modulatedFreq, filterQ, this.sampleRate);
          this.filterR.setBandpass(modulatedFreq, filterQ, this.sampleRate);
          break;
      }
      
      const delayedL = this.delayL.read(delaySamples);
      const delayedR = this.delayR.read(delaySamples);
      
      const filteredL = this.filterL.process(delayedL);
      const filteredR = this.filterR.process(delayedR);
      
      this.delayL.write(input.samples[0][i] + filteredL * feedback);
      this.delayR.write(input.samples[1][i] + filteredR * feedback);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + filteredL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + filteredR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delayL.clear();
    this.delayR.clear();
    this.filterL.clear();
    this.filterR.clear();
    this.lfo.reset();
  }
}

export class ReverseDelayProcessor implements DSPProcessor {
  private bufferL: Float32Array;
  private bufferR: Float32Array;
  private writeIndex: number = 0;
  private grainSize: number = 0;
  private grainPosition: number = 0;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.bufferL = new Float32Array(88200);
    this.bufferR = new Float32Array(88200);
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const time = (params.time as number) ?? 500;
    const feedback = (params.feedback as number) ?? 0.3;
    const crossfade = (params.crossfade as number) ?? 0.1;
    const highCut = (params.highCut as number) ?? 8000;

    this.grainSize = msToSamples(time, this.sampleRate);
    this.lpFilter.setLowpass(highCut, this.sampleRate);
    
    const fadeLength = Math.floor(this.grainSize * crossfade);

    for (let i = 0; i < input.samples[0].length; i++) {
      this.bufferL[this.writeIndex] = input.samples[0][i];
      this.bufferR[this.writeIndex] = input.samples[1][i];
      
      const reverseIndex = (this.writeIndex - this.grainPosition + this.bufferL.length) % this.bufferL.length;
      
      let reversedL = this.bufferL[reverseIndex];
      let reversedR = this.bufferR[reverseIndex];
      
      let fadeEnv = 1;
      if (this.grainPosition < fadeLength) {
        fadeEnv = this.grainPosition / fadeLength;
      } else if (this.grainPosition > this.grainSize - fadeLength) {
        fadeEnv = (this.grainSize - this.grainPosition) / fadeLength;
      }
      
      reversedL *= fadeEnv;
      reversedR *= fadeEnv;
      
      const filteredL = this.lpFilter.process(reversedL);
      const filteredR = this.lpFilter.process(reversedR);
      
      this.writeIndex = (this.writeIndex + 1) % this.bufferL.length;
      this.grainPosition++;
      
      if (this.grainPosition >= this.grainSize) {
        this.grainPosition = 0;
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + filteredL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + filteredR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.bufferL.fill(0);
    this.bufferR.fill(0);
    this.writeIndex = 0;
    this.grainPosition = 0;
    this.lpFilter.clear();
  }
}

export class GranularDelayProcessor implements DSPProcessor {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private grains: Array<{ position: number; speed: number; pan: number; age: number; maxAge: number }> = [];
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.buffer = new Float32Array(220500);
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const grainSize = (params.grainSize as number) ?? 100;
    const grainDensity = (params.density as number) ?? 4;
    const pitch = (params.pitch as number) ?? 0;
    const pitchRandom = (params.pitchRandom as number) ?? 0.2;
    const scatter = (params.scatter as number) ?? 0.3;
    const feedback = (params.feedback as number) ?? 0.3;
    const stereoSpread = (params.spread as number) ?? 0.8;
    const reverse = (params.reverse as number) ?? 0.3;

    const grainSamples = msToSamples(grainSize, this.sampleRate);
    const spawnRate = Math.floor(this.sampleRate / (grainDensity * 10));
    const basePitch = Math.pow(2, pitch / 12);
    
    this.lpFilter.setLowpass(8000, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      this.buffer[this.writeIndex] = mono;
      
      if (i % spawnRate === 0 && this.grains.length < 32) {
        const pitchVar = basePitch * (1 + (Math.random() - 0.5) * pitchRandom * 2);
        const shouldReverse = Math.random() < reverse;
        this.grains.push({
          position: (this.writeIndex - Math.floor(scatter * grainSamples * Math.random()) + this.buffer.length) % this.buffer.length,
          speed: shouldReverse ? -pitchVar : pitchVar,
          pan: (Math.random() - 0.5) * stereoSpread,
          age: 0,
          maxAge: grainSamples
        });
      }
      
      let wetL = 0, wetR = 0;
      
      for (let g = this.grains.length - 1; g >= 0; g--) {
        const grain = this.grains[g];
        
        const envelope = Math.sin(Math.PI * grain.age / grain.maxAge);
        const sample = this.buffer[Math.floor(grain.position) % this.buffer.length];
        const grainOutput = sample * envelope / Math.max(1, this.grains.length * 0.5);
        
        wetL += grainOutput * (0.5 - grain.pan);
        wetR += grainOutput * (0.5 + grain.pan);
        
        grain.position += grain.speed;
        if (grain.position < 0) grain.position += this.buffer.length;
        grain.age++;
        
        if (grain.age >= grain.maxAge) {
          this.grains.splice(g, 1);
        }
      }
      
      wetL = this.lpFilter.process(wetL);
      wetR = this.lpFilter.process(wetR);
      
      this.buffer[this.writeIndex] += (wetL + wetR) * 0.5 * feedback;
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.grains = [];
    this.lpFilter.clear();
  }
}

export const DELAY_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-tape-delay': () => new TapeDelayProcessor(),
  'mb-digital-delay': () => new DigitalDelayProcessor(),
  'mb-ping-pong-delay': () => new PingPongDelayProcessor(),
  'mb-slapback-delay': () => new SlapbackDelayProcessor(),
  'mb-mod-delay': () => new ModDelayProcessor(),
  'mb-ducking-delay': () => new DuckingDelayProcessor(),
  'mb-multi-tap-delay': () => new MultiTapDelayProcessor(),
  'mb-filter-delay': () => new FilterDelayProcessor(),
  'mb-reverse-delay': () => new ReverseDelayProcessor(),
  'mb-granular-delay': () => new GranularDelayProcessor(),
};
