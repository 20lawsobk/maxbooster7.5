import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer, mixBuffers, 
  DelayLine, AllPassFilter, CombFilter, BiquadFilter, OnePoleFilter,
  msToSamples, dbToLinear
} from './core';

export class PlateReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private diffusers: AllPassFilter[] = [];
  private tanks: CombFilter[] = [];
  private damping: OnePoleFilter[] = [];
  private inputFilter: BiquadFilter;
  private outputFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(44100);
    this.inputFilter = new BiquadFilter();
    this.outputFilter = new BiquadFilter();
    for (let i = 0; i < 4; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(142 * (i + 1) * 1.3), 0.75));
    }
    for (let i = 0; i < 8; i++) {
      this.tanks.push(new CombFilter(Math.floor(1557 + i * 233), 0.84, 0.2));
      this.damping.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.35;
    const decay = (params.decay as number) ?? 2.5;
    const damping = (params.damping as number) ?? 0.5;
    const preDelayMs = (params.preDelay as number) ?? 10;
    const brightness = (params.brightness as number) ?? 0.7;
    const modulation = (params.modulation as number) ?? 0.3;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 1557));

    this.inputFilter.setHighpass(80, 0.707, this.sampleRate);
    this.outputFilter.setLowpass(Math.min(20000, 2000 + brightness * 18000), 0.707, this.sampleRate);
    
    for (let i = 0; i < 8; i++) {
      this.tanks[i].setFeedback(decayFactor);
      this.tanks[i].setDamping(damping);
      this.damping[i].setLowpass(1000 + brightness * 10000, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const filtered = this.inputFilter.process(mono);
      
      this.preDelay.write(filtered);
      let signal = this.preDelay.read(preDelaySamples);
      
      for (const diffuser of this.diffusers) {
        signal = diffuser.process(signal);
      }
      
      let leftSum = 0, rightSum = 0;
      for (let t = 0; t < 8; t++) {
        const tankOut = this.damping[t].process(this.tanks[t].process(signal * 0.25));
        if (t % 2 === 0) leftSum += tankOut;
        else rightSum += tankOut;
      }
      
      const modPhase = (2 * Math.PI * i * 0.5) / this.sampleRate;
      const modAmount = Math.sin(modPhase) * modulation * 0.01;
      
      const wetL = this.outputFilter.process(leftSum * (1 + modAmount));
      const wetR = this.outputFilter.process(rightSum * (1 - modAmount));
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.diffusers.forEach(d => d.clear());
    this.tanks.forEach(t => t.clear());
    this.damping.forEach(d => d.clear());
    this.inputFilter.clear();
    this.outputFilter.clear();
  }
}

export class HallReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private earlyReflections: DelayLine[] = [];
  private lateCombs: CombFilter[] = [];
  private allPasses: AllPassFilter[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(88200);
    for (let i = 0; i < 12; i++) {
      this.earlyReflections.push(new DelayLine(Math.floor(4410 + i * 367)));
    }
    const combDelays = [2473, 2767, 3217, 3557, 3907, 4127, 4517, 4903];
    for (let i = 0; i < 8; i++) {
      this.lateCombs.push(new CombFilter(combDelays[i], 0.9, 0.3));
      this.lpFilters.push(new OnePoleFilter());
    }
    for (let i = 0; i < 4; i++) {
      this.allPasses.push(new AllPassFilter(Math.floor(347 + i * 113), 0.7));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const decay = (params.decay as number) ?? 4.0;
    const size = (params.size as number) ?? 0.8;
    const preDelayMs = (params.preDelay as number) ?? 30;
    const diffusion = (params.diffusion as number) ?? 0.8;
    const damping = (params.damping as number) ?? 0.4;
    const erLevel = (params.earlyLevel as number) ?? 0.5;
    const lateLevel = (params.lateLevel as number) ?? 0.7;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 3000));

    for (let i = 0; i < 8; i++) {
      this.lateCombs[i].setFeedback(decayFactor);
      this.lateCombs[i].setDamping(damping);
      this.lpFilters[i].setLowpass(2000 + (1 - damping) * 10000, this.sampleRate);
    }

    const erDelays = [7, 11, 17, 23, 31, 41, 53, 67, 83, 97, 113, 127];
    const erGains = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35];

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      this.preDelay.write(mono);
      const preDelayed = this.preDelay.read(preDelaySamples);
      
      let erL = 0, erR = 0;
      for (let e = 0; e < 12; e++) {
        this.earlyReflections[e].write(preDelayed);
        const erSample = this.earlyReflections[e].read(Math.floor(erDelays[e] * size * 44.1));
        if (e % 2 === 0) erL += erSample * erGains[e];
        else erR += erSample * erGains[e];
      }
      erL *= erLevel;
      erR *= erLevel;
      
      let signal = preDelayed;
      for (const ap of this.allPasses) {
        signal = ap.process(signal) * diffusion + signal * (1 - diffusion);
      }
      
      let lateL = 0, lateR = 0;
      for (let c = 0; c < 8; c++) {
        const combOut = this.lpFilters[c].process(this.lateCombs[c].process(signal * 0.125));
        if (c < 4) lateL += combOut;
        else lateR += combOut;
      }
      lateL *= lateLevel;
      lateR *= lateLevel;
      
      const wetL = erL + lateL;
      const wetR = erR + lateR;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.earlyReflections.forEach(er => er.clear());
    this.lateCombs.forEach(c => c.clear());
    this.allPasses.forEach(ap => ap.clear());
    this.lpFilters.forEach(lp => lp.clear());
  }
}

export class RoomReverbProcessor implements DSPProcessor {
  private delays: DelayLine[] = [];
  private filters: BiquadFilter[] = [];
  private allPasses: AllPassFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.delays.push(new DelayLine(4410));
      this.filters.push(new BiquadFilter());
    }
    for (let i = 0; i < 3; i++) {
      this.allPasses.push(new AllPassFilter(113 + i * 73, 0.6));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.25;
    const size = (params.roomSize as number) ?? 0.5;
    const absorption = (params.absorption as number) ?? 0.5;
    const brightness = (params.brightness as number) ?? 0.6;

    const roomDelays = [
      Math.floor(size * 441),
      Math.floor(size * 587),
      Math.floor(size * 733),
      Math.floor(size * 881),
      Math.floor(size * 1033),
      Math.floor(size * 1181),
    ];
    const reflectionGains = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3].map(g => g * (1 - absorption));

    for (let i = 0; i < 6; i++) {
      this.filters[i].setLowpass(2000 + brightness * 8000, 0.707, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let signal = mono;
      for (const ap of this.allPasses) {
        signal = ap.process(signal);
      }
      
      let wetL = 0, wetR = 0;
      for (let d = 0; d < 6; d++) {
        this.delays[d].write(signal);
        const reflected = this.delays[d].read(roomDelays[d]);
        const filtered = this.filters[d].process(reflected) * reflectionGains[d];
        
        const angle = (d / 6) * Math.PI;
        wetL += filtered * Math.cos(angle);
        wetR += filtered * Math.sin(angle);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.delays.forEach(d => d.clear());
    this.filters.forEach(f => f.clear());
    this.allPasses.forEach(ap => ap.clear());
  }
}

export class ChamberReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private diffusers: AllPassFilter[] = [];
  private feedback: CombFilter[] = [];
  private crossFeedback: number = 0;
  private lpFilter: OnePoleFilter;
  private hpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(22050);
    this.lpFilter = new OnePoleFilter();
    this.hpFilter = new BiquadFilter();
    for (let i = 0; i < 6; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(179 + i * 97), 0.65));
    }
    for (let i = 0; i < 4; i++) {
      this.feedback.push(new CombFilter(Math.floor(1847 + i * 347), 0.85, 0.25));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.3;
    const decay = (params.decay as number) ?? 1.8;
    const size = (params.size as number) ?? 0.6;
    const preDelayMs = (params.preDelay as number) ?? 15;
    const density = (params.density as number) ?? 0.7;
    const lowCut = (params.lowCut as number) ?? 150;
    const highCut = (params.highCut as number) ?? 8000;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 2000));

    this.lpFilter.setLowpass(highCut, this.sampleRate);
    this.hpFilter.setHighpass(lowCut, 0.707, this.sampleRate);

    for (let i = 0; i < 4; i++) {
      this.feedback[i].setFeedback(decayFactor);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const filtered = this.hpFilter.process(mono);
      
      this.preDelay.write(filtered);
      let signal = this.preDelay.read(preDelaySamples);
      
      for (let d = 0; d < 6; d++) {
        const apOut = this.diffusers[d].process(signal);
        signal = apOut * density + signal * (1 - density);
      }
      
      signal = signal + this.crossFeedback * 0.15;
      
      let wetL = 0, wetR = 0;
      for (let f = 0; f < 4; f++) {
        const combOut = this.feedback[f].process(signal * 0.25 * size);
        if (f < 2) wetL += combOut;
        else wetR += combOut;
      }
      
      this.crossFeedback = this.lpFilter.process((wetL + wetR) * 0.5);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.diffusers.forEach(d => d.clear());
    this.feedback.forEach(f => f.clear());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.crossFeedback = 0;
  }
}

export class SpringReverbProcessor implements DSPProcessor {
  private springLines: DelayLine[] = [];
  private dispersionFilters: AllPassFilter[] = [];
  private lpFilter: OnePoleFilter;
  private resonance: BiquadFilter[] = [];
  private feedbackSample: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 3; i++) {
      this.springLines.push(new DelayLine(8820));
      this.resonance.push(new BiquadFilter());
    }
    for (let i = 0; i < 8; i++) {
      this.dispersionFilters.push(new AllPassFilter(Math.floor(29 + i * 17), 0.5));
    }
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.35;
    const decay = (params.decay as number) ?? 3.0;
    const tension = (params.tension as number) ?? 0.6;
    const damping = (params.damping as number) ?? 0.4;
    const springs = Math.floor((params.springs as number) ?? 3);
    const drip = (params.drip as number) ?? 0.5;

    const springDelays = [
      Math.floor(1500 * tension),
      Math.floor(1850 * tension),
      Math.floor(2200 * tension),
    ];
    
    const feedback = Math.pow(0.001, 1 / (decay * this.sampleRate / 2000));
    this.lpFilter.setLowpass(3000 + (1 - damping) * 5000, this.sampleRate);

    for (let i = 0; i < 3; i++) {
      this.resonance[i].setBandpass(400 + i * 200, 2 + drip * 8, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let signal = mono + this.feedbackSample * feedback * 0.3;
      
      for (const ap of this.dispersionFilters) {
        signal = ap.process(signal);
      }
      
      let wet = 0;
      for (let s = 0; s < springs; s++) {
        this.springLines[s].write(signal);
        const springOut = this.springLines[s].read(springDelays[s]);
        const resonated = this.resonance[s].process(springOut) * drip + springOut * (1 - drip);
        wet += resonated / springs;
      }
      
      wet = this.lpFilter.process(wet);
      this.feedbackSample = wet;
      
      const chirp = Math.sin(i * 0.1) * wet * drip * 0.1;
      wet += chirp;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wet * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wet * mix;
    }
    
    return output;
  }

  reset(): void {
    this.springLines.forEach(s => s.clear());
    this.dispersionFilters.forEach(d => d.clear());
    this.lpFilter.clear();
    this.resonance.forEach(r => r.clear());
    this.feedbackSample = 0;
  }
}

export class ShimmerReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private diffusers: AllPassFilter[] = [];
  private tanks: CombFilter[] = [];
  private pitchShiftBuffer: DelayLine;
  private pitchPhase: number = 0;
  private lpFilter: OnePoleFilter;
  private hpFilter: BiquadFilter;
  private shimmerBuffer: Float32Array;
  private shimmerIndex: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(44100);
    this.pitchShiftBuffer = new DelayLine(8192);
    this.lpFilter = new OnePoleFilter();
    this.hpFilter = new BiquadFilter();
    this.shimmerBuffer = new Float32Array(4096);
    
    for (let i = 0; i < 4; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(167 + i * 113), 0.7));
    }
    for (let i = 0; i < 6; i++) {
      this.tanks.push(new CombFilter(Math.floor(2347 + i * 277), 0.88, 0.2));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.4;
    const decay = (params.decay as number) ?? 5.0;
    const shimmer = (params.shimmer as number) ?? 0.5;
    const pitch = (params.pitch as number) ?? 12;
    const preDelayMs = (params.preDelay as number) ?? 20;
    const damping = (params.damping as number) ?? 0.3;
    const modulation = (params.modulation as number) ?? 0.4;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 2500));
    const pitchRatio = Math.pow(2, pitch / 12);
    const grainSize = 2048;

    this.lpFilter.setLowpass(8000 - damping * 5000, this.sampleRate);
    this.hpFilter.setHighpass(200, 0.707, this.sampleRate);

    for (let i = 0; i < 6; i++) {
      this.tanks[i].setFeedback(decayFactor);
      this.tanks[i].setDamping(damping);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const filtered = this.hpFilter.process(mono);
      
      this.preDelay.write(filtered);
      let signal = this.preDelay.read(preDelaySamples);
      
      for (const diffuser of this.diffusers) {
        signal = diffuser.process(signal);
      }
      
      this.shimmerBuffer[this.shimmerIndex] = signal;
      const readPos = (this.shimmerIndex - grainSize + this.shimmerBuffer.length) % this.shimmerBuffer.length;
      const crossfadePos = this.pitchPhase / grainSize;
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * crossfadePos);
      
      const grain1Idx = Math.floor(readPos + this.pitchPhase * pitchRatio) % this.shimmerBuffer.length;
      const grain2Idx = Math.floor(readPos + (this.pitchPhase + grainSize / 2) * pitchRatio) % this.shimmerBuffer.length;
      const grain1 = this.shimmerBuffer[grain1Idx] * window;
      const grain2 = this.shimmerBuffer[grain2Idx] * (1 - window);
      const pitched = (grain1 + grain2) * shimmer;
      
      this.pitchPhase = (this.pitchPhase + 1) % grainSize;
      this.shimmerIndex = (this.shimmerIndex + 1) % this.shimmerBuffer.length;
      
      const modPhase = (2 * Math.PI * i * 0.3) / this.sampleRate;
      const mod = Math.sin(modPhase) * modulation * 0.02;
      
      let wetL = 0, wetR = 0;
      for (let t = 0; t < 6; t++) {
        const tankInput = (signal + pitched) * 0.5;
        const tankOut = this.lpFilter.process(this.tanks[t].process(tankInput * 0.167));
        if (t % 2 === 0) wetL += tankOut * (1 + mod);
        else wetR += tankOut * (1 - mod);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.pitchShiftBuffer.clear();
    this.diffusers.forEach(d => d.clear());
    this.tanks.forEach(t => t.clear());
    this.lpFilter.clear();
    this.hpFilter.clear();
    this.shimmerBuffer.fill(0);
    this.shimmerIndex = 0;
    this.pitchPhase = 0;
  }
}

export class GatedReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private diffusers: AllPassFilter[] = [];
  private combs: CombFilter[] = [];
  private envelope: number = 0;
  private gateState: 'closed' | 'open' | 'hold' | 'release' = 'closed';
  private holdCounter: number = 0;
  private releaseCounter: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(22050);
    for (let i = 0; i < 4; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(113 + i * 67), 0.6));
    }
    for (let i = 0; i < 6; i++) {
      this.combs.push(new CombFilter(Math.floor(1237 + i * 197), 0.9, 0.15));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.5;
    const gateTime = (params.gateTime as number) ?? 300;
    const holdTime = (params.holdTime as number) ?? 100;
    const releaseTime = (params.releaseTime as number) ?? 50;
    const threshold = dbToLinear((params.threshold as number) ?? -20);
    const preDelayMs = (params.preDelay as number) ?? 5;
    const reverse = (params.reverse as boolean) ?? false;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const gateSamples = msToSamples(gateTime, this.sampleRate);
    const holdSamples = msToSamples(holdTime, this.sampleRate);
    const releaseSamples = msToSamples(releaseTime, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const inputLevel = Math.abs(mono);
      
      if (inputLevel > threshold) {
        this.gateState = 'open';
        this.holdCounter = gateSamples;
        this.envelope = 1;
      } else if (this.gateState === 'open') {
        this.holdCounter--;
        if (this.holdCounter <= 0) {
          this.gateState = 'hold';
          this.holdCounter = holdSamples;
        }
      } else if (this.gateState === 'hold') {
        this.holdCounter--;
        if (this.holdCounter <= 0) {
          this.gateState = 'release';
          this.releaseCounter = releaseSamples;
        }
      } else if (this.gateState === 'release') {
        this.releaseCounter--;
        this.envelope = this.releaseCounter / releaseSamples;
        if (this.releaseCounter <= 0) {
          this.gateState = 'closed';
          this.envelope = 0;
        }
      }
      
      this.preDelay.write(mono);
      let signal = this.preDelay.read(preDelaySamples);
      
      for (const diffuser of this.diffusers) {
        signal = diffuser.process(signal);
      }
      
      let wetL = 0, wetR = 0;
      for (let c = 0; c < 6; c++) {
        const combOut = this.combs[c].process(signal * 0.167);
        if (c % 2 === 0) wetL += combOut;
        else wetR += combOut;
      }
      
      let gateEnv = this.envelope;
      if (reverse) {
        gateEnv = 1 - gateEnv;
      }
      
      wetL *= gateEnv;
      wetR *= gateEnv;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.diffusers.forEach(d => d.clear());
    this.combs.forEach(c => c.clear());
    this.envelope = 0;
    this.gateState = 'closed';
    this.holdCounter = 0;
    this.releaseCounter = 0;
  }
}

export class AmbientReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private modulatedDelays: DelayLine[] = [];
  private allPasses: AllPassFilter[] = [];
  private tanks: CombFilter[] = [];
  private lpFilters: OnePoleFilter[] = [];
  private lfoPhases: number[] = [];
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(88200);
    for (let i = 0; i < 4; i++) {
      this.modulatedDelays.push(new DelayLine(8820));
      this.lfoPhases.push(i * Math.PI / 2);
    }
    for (let i = 0; i < 6; i++) {
      this.allPasses.push(new AllPassFilter(Math.floor(277 + i * 131), 0.75));
    }
    for (let i = 0; i < 8; i++) {
      this.tanks.push(new CombFilter(Math.floor(2777 + i * 347), 0.92, 0.15));
      this.lpFilters.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.5;
    const decay = (params.decay as number) ?? 8.0;
    const modRate = (params.modRate as number) ?? 0.2;
    const modDepth = (params.modDepth as number) ?? 0.3;
    const diffusion = (params.diffusion as number) ?? 0.9;
    const preDelayMs = (params.preDelay as number) ?? 50;
    const freeze = (params.freeze as boolean) ?? false;
    const damping = (params.damping as number) ?? 0.2;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = freeze ? 0.999 : Math.pow(0.001, 1 / (decay * this.sampleRate / 3000));
    const lfoIncrement = (2 * Math.PI * modRate) / this.sampleRate;

    for (let i = 0; i < 8; i++) {
      this.tanks[i].setFeedback(decayFactor);
      this.tanks[i].setDamping(damping);
      this.lpFilters[i].setLowpass(4000 + (1 - damping) * 8000, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = freeze ? 0 : (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      this.preDelay.write(mono);
      let signal = this.preDelay.read(preDelaySamples);
      
      for (let d = 0; d < 4; d++) {
        const lfo = Math.sin(this.lfoPhases[d]) * modDepth * 100;
        this.lfoPhases[d] += lfoIncrement;
        if (this.lfoPhases[d] >= 2 * Math.PI) this.lfoPhases[d] -= 2 * Math.PI;
        
        this.modulatedDelays[d].write(signal);
        signal = this.modulatedDelays[d].readInterpolated(500 + lfo);
      }
      
      for (const ap of this.allPasses) {
        signal = ap.process(signal) * diffusion + signal * (1 - diffusion);
      }
      
      let wetL = 0, wetR = 0;
      for (let t = 0; t < 8; t++) {
        const tankOut = this.lpFilters[t].process(this.tanks[t].process(signal * 0.125));
        const pan = (t / 7) * Math.PI;
        wetL += tankOut * Math.cos(pan);
        wetR += tankOut * Math.sin(pan);
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.modulatedDelays.forEach(d => d.clear());
    this.allPasses.forEach(ap => ap.clear());
    this.tanks.forEach(t => t.clear());
    this.lpFilters.forEach(lp => lp.clear());
    this.lfoPhases = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  }
}

export class CathedralReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private earlyReflections: DelayLine[] = [];
  private diffusers: AllPassFilter[] = [];
  private lateTanks: CombFilter[] = [];
  private crossFeedL: DelayLine;
  private crossFeedR: DelayLine;
  private lpFilters: OnePoleFilter[] = [];
  private hpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(176400);
    this.crossFeedL = new DelayLine(4410);
    this.crossFeedR = new DelayLine(4410);
    this.hpFilter = new BiquadFilter();
    
    for (let i = 0; i < 16; i++) {
      this.earlyReflections.push(new DelayLine(Math.floor(8820 + i * 551)));
    }
    for (let i = 0; i < 8; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(353 + i * 179), 0.7));
    }
    for (let i = 0; i < 12; i++) {
      this.lateTanks.push(new CombFilter(Math.floor(3347 + i * 443), 0.94, 0.15));
      this.lpFilters.push(new OnePoleFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.5;
    const decay = (params.decay as number) ?? 12.0;
    const size = (params.size as number) ?? 0.9;
    const preDelayMs = (params.preDelay as number) ?? 80;
    const diffusion = (params.diffusion as number) ?? 0.85;
    const damping = (params.damping as number) ?? 0.25;
    const crossfeed = (params.crossfeed as number) ?? 0.3;
    const erLevel = (params.earlyLevel as number) ?? 0.4;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 4000));

    this.hpFilter.setHighpass(60, 0.707, this.sampleRate);

    for (let i = 0; i < 12; i++) {
      this.lateTanks[i].setFeedback(decayFactor);
      this.lateTanks[i].setDamping(damping);
      this.lpFilters[i].setLowpass(3000 + (1 - damping) * 6000, this.sampleRate);
    }

    const erDelays = [23, 37, 53, 71, 97, 127, 163, 199, 239, 283, 331, 383, 439, 499, 563, 631];
    const erGains = erDelays.map((_, i) => 0.9 * Math.pow(0.85, i / 4));

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      const filtered = this.hpFilter.process(mono);
      
      this.preDelay.write(filtered);
      const preDelayed = this.preDelay.read(preDelaySamples);
      
      let erL = 0, erR = 0;
      for (let e = 0; e < 16; e++) {
        this.earlyReflections[e].write(preDelayed);
        const delay = Math.floor(erDelays[e] * size * this.sampleRate / 1000);
        const erSample = this.earlyReflections[e].read(delay) * erGains[e];
        const pan = (e / 15) * Math.PI;
        erL += erSample * Math.cos(pan);
        erR += erSample * Math.sin(pan);
      }
      erL *= erLevel;
      erR *= erLevel;
      
      let signal = preDelayed;
      for (const diffuser of this.diffusers) {
        signal = diffuser.process(signal) * diffusion + signal * (1 - diffusion);
      }
      
      this.crossFeedL.write(signal);
      this.crossFeedR.write(signal);
      const cfL = this.crossFeedR.read(Math.floor(1500 * size));
      const cfR = this.crossFeedL.read(Math.floor(1700 * size));
      
      let lateL = 0, lateR = 0;
      for (let t = 0; t < 12; t++) {
        const input = t < 6 ? signal + cfL * crossfeed : signal + cfR * crossfeed;
        const tankOut = this.lpFilters[t].process(this.lateTanks[t].process(input * 0.083));
        if (t < 6) lateL += tankOut;
        else lateR += tankOut;
      }
      
      const wetL = erL + lateL;
      const wetR = erR + lateR;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.earlyReflections.forEach(er => er.clear());
    this.diffusers.forEach(d => d.clear());
    this.lateTanks.forEach(t => t.clear());
    this.crossFeedL.clear();
    this.crossFeedR.clear();
    this.lpFilters.forEach(lp => lp.clear());
    this.hpFilter.clear();
  }
}

export class VintageReverbProcessor implements DSPProcessor {
  private preDelay: DelayLine;
  private diffusers: AllPassFilter[] = [];
  private tanks: CombFilter[] = [];
  private inputSaturation: BiquadFilter;
  private outputFilter: BiquadFilter;
  private wowFlutter: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.preDelay = new DelayLine(22050);
    this.inputSaturation = new BiquadFilter();
    this.outputFilter = new BiquadFilter();
    
    for (let i = 0; i < 4; i++) {
      this.diffusers.push(new AllPassFilter(Math.floor(127 + i * 79), 0.6));
    }
    for (let i = 0; i < 6; i++) {
      this.tanks.push(new CombFilter(Math.floor(1777 + i * 263), 0.88, 0.35));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const mix = (params.mix as number) ?? 0.35;
    const decay = (params.decay as number) ?? 2.5;
    const preDelayMs = (params.preDelay as number) ?? 15;
    const character = (params.character as number) ?? 0.6;
    const warmth = (params.warmth as number) ?? 0.7;
    const wow = (params.wow as number) ?? 0.2;
    const flutter = (params.flutter as number) ?? 0.15;

    const preDelaySamples = msToSamples(preDelayMs, this.sampleRate);
    const decayFactor = Math.pow(0.001, 1 / (decay * this.sampleRate / 2000));

    this.inputSaturation.setLowShelf(500, character * 3, this.sampleRate);
    this.outputFilter.setLowpass(4000 + warmth * 4000, 0.707, this.sampleRate);

    for (let i = 0; i < 6; i++) {
      this.tanks[i].setFeedback(decayFactor);
      this.tanks[i].setDamping(0.3 + warmth * 0.3);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      let saturated = this.inputSaturation.process(mono);
      saturated = Math.tanh(saturated * (1 + character)) / (1 + character * 0.5);
      
      this.wowFlutter += 0.0001;
      const wowMod = Math.sin(this.wowFlutter * 0.3) * wow * 10;
      const flutterMod = Math.sin(this.wowFlutter * 5) * flutter * 2;
      const modulation = wowMod + flutterMod;
      
      this.preDelay.write(saturated);
      let signal = this.preDelay.readInterpolated(preDelaySamples + modulation);
      
      for (const diffuser of this.diffusers) {
        signal = diffuser.process(signal);
      }
      
      let wetL = 0, wetR = 0;
      for (let t = 0; t < 6; t++) {
        const tankOut = this.tanks[t].process(signal * 0.167);
        const colored = this.outputFilter.process(tankOut);
        if (t % 2 === 0) wetL += colored;
        else wetR += colored;
      }
      
      const noise = (Math.random() - 0.5) * 0.002 * character;
      wetL += noise;
      wetR += noise;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + wetL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + wetR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.preDelay.clear();
    this.diffusers.forEach(d => d.clear());
    this.tanks.forEach(t => t.clear());
    this.inputSaturation.clear();
    this.outputFilter.clear();
    this.wowFlutter = 0;
  }
}

export const REVERB_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-plate-reverb': () => new PlateReverbProcessor(),
  'mb-hall-reverb': () => new HallReverbProcessor(),
  'mb-room-reverb': () => new RoomReverbProcessor(),
  'mb-chamber-reverb': () => new ChamberReverbProcessor(),
  'mb-spring-reverb': () => new SpringReverbProcessor(),
  'mb-shimmer-reverb': () => new ShimmerReverbProcessor(),
  'mb-gated-reverb': () => new GatedReverbProcessor(),
  'mb-ambient-reverb': () => new AmbientReverbProcessor(),
  'mb-cathedral-reverb': () => new CathedralReverbProcessor(),
  'mb-vintage-reverb': () => new VintageReverbProcessor(),
};
