import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, EnvelopeFollower, DelayLine, LFO,
  msToSamples, dbToLinear, linearToDb, clamp, softClip
} from './core';

export class GateProcessor implements DSPProcessor {
  private envelope: number = 0;
  private gateState: 'closed' | 'opening' | 'open' | 'hold' | 'closing' = 'closed';
  private holdCounter: number = 0;
  private releaseCounter: number = 0;
  private hysteresisState: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -40;
    const hysteresis = (params.hysteresis as number) ?? 4;
    const attackMs = (params.attack as number) ?? 0.5;
    const holdMs = (params.hold as number) ?? 50;
    const releaseMs = (params.release as number) ?? 100;
    const range = (params.range as number) ?? -80;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const hysteresisLin = dbToLinear(threshold - hysteresis);
    const rangeLin = dbToLinear(range);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const holdSamples = msToSamples(holdMs, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      this.envelope = this.envelope * 0.9995 + inputLevel * 0.0005;
      
      const openThreshold = this.gateState === 'closed' ? thresholdLin : hysteresisLin;
      
      if (inputLevel > thresholdLin) {
        this.gateState = 'open';
        this.holdCounter = holdSamples;
      } else if (inputLevel < hysteresisLin && this.gateState === 'open') {
        this.gateState = 'hold';
      }
      
      if (this.gateState === 'hold') {
        this.holdCounter--;
        if (this.holdCounter <= 0) {
          this.gateState = 'closing';
        }
      }
      
      let targetGain: number;
      switch (this.gateState) {
        case 'open':
          targetGain = 1;
          break;
        case 'closing':
        case 'closed':
          targetGain = rangeLin;
          if (this.hysteresisState <= rangeLin + 0.001) {
            this.gateState = 'closed';
          }
          break;
        default:
          targetGain = this.hysteresisState;
      }
      
      const coeff = targetGain > this.hysteresisState ? attackCoeff : releaseCoeff;
      this.hysteresisState = this.hysteresisState * coeff + targetGain * (1 - coeff);
      
      const processedL = inputL * this.hysteresisState;
      const processedR = inputR * this.hysteresisState;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.gateState = 'closed';
    this.holdCounter = 0;
    this.releaseCounter = 0;
    this.hysteresisState = 0;
  }
}

export class ExpanderProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -30;
    const ratio = (params.ratio as number) ?? 2;
    const attackMs = (params.attack as number) ?? 5;
    const releaseMs = (params.release as number) ?? 50;
    const knee = (params.knee as number) ?? 6;
    const range = (params.range as number) ?? -40;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const rangeLin = dbToLinear(range);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const kneeWidth = knee / 2;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      const inputDb = linearToDb(this.envelope);
      let gainReduction = 0;
      
      if (inputDb < threshold - kneeWidth) {
        gainReduction = (threshold - inputDb) * (ratio - 1);
      } else if (inputDb < threshold + kneeWidth) {
        const x = threshold - inputDb + kneeWidth;
        gainReduction = (x * x) / (4 * kneeWidth) * (ratio - 1);
      }
      
      gainReduction = Math.min(gainReduction, -range);
      
      const gain = dbToLinear(-gainReduction);
      
      const processedL = inputL * gain;
      const processedR = inputR * gain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
  }
}

export class DeEsserProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sibilanceFilter: BiquadFilter;
  private listenFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.sibilanceFilter = new BiquadFilter();
    this.listenFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const frequency = (params.frequency as number) ?? 6000;
    const threshold = (params.threshold as number) ?? -20;
    const ratio = (params.ratio as number) ?? 4;
    const attackMs = (params.attack as number) ?? 0.5;
    const releaseMs = (params.release as number) ?? 50;
    const range = (params.range as number) ?? -12;
    const bandwidth = (params.bandwidth as number) ?? 2;
    const listenMode = (params.listen as boolean) ?? false;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));

    this.sibilanceFilter.setBandpass(frequency, bandwidth, this.sampleRate);
    this.listenFilter.setPeaking(frequency, bandwidth, -range, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const mono = (inputL + inputR) * 0.5;
      
      const sibilance = this.sibilanceFilter.process(mono);
      const sibilanceLevel = Math.abs(sibilance);
      
      const coeff = sibilanceLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + sibilanceLevel * (1 - coeff);
      
      let gainReduction = 0;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        gainReduction = Math.min(-range, overDb * (1 - 1 / ratio));
      }
      
      if (listenMode) {
        output.samples[0][i] = sibilance;
        output.samples[1][i] = sibilance;
      } else {
        const gain = dbToLinear(-gainReduction);
        
        const processedL = this.listenFilter.process(inputL) * gain + inputL * (1 - gain);
        const processedR = this.listenFilter.process(inputR) * gain + inputR * (1 - gain);
        
        output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
        output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
      }
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.sibilanceFilter.clear();
    this.listenFilter.clear();
  }
}

export class TransientShaperProcessor implements DSPProcessor {
  private fastEnvelope: number = 0;
  private slowEnvelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const attack = (params.attack as number) ?? 0;
    const sustain = (params.sustain as number) ?? 0;
    const sensitivity = (params.sensitivity as number) ?? 50;
    const outputGain = (params.output as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    const fastAttack = Math.exp(-1 / msToSamples(0.1, this.sampleRate));
    const fastRelease = Math.exp(-1 / msToSamples(5, this.sampleRate));
    const slowAttack = Math.exp(-1 / msToSamples(50, this.sampleRate));
    const slowRelease = Math.exp(-1 / msToSamples(200, this.sampleRate));
    const outputLin = dbToLinear(outputGain);
    const sensitivityFactor = sensitivity / 100;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const fastCoeff = inputLevel > this.fastEnvelope ? fastAttack : fastRelease;
      this.fastEnvelope = this.fastEnvelope * fastCoeff + inputLevel * (1 - fastCoeff);
      
      const slowCoeff = inputLevel > this.slowEnvelope ? slowAttack : slowRelease;
      this.slowEnvelope = this.slowEnvelope * slowCoeff + inputLevel * (1 - slowCoeff);
      
      const transientDiff = (this.fastEnvelope - this.slowEnvelope) * sensitivityFactor;
      
      let attackGain = 1;
      let sustainGain = 1;
      
      if (transientDiff > 0) {
        attackGain = 1 + (attack / 100) * transientDiff * 10;
      }
      
      const sustainAmount = this.slowEnvelope * sensitivityFactor;
      if (sustainAmount > 0.01) {
        sustainGain = 1 + (sustain / 100) * sustainAmount * 5;
      }
      
      const totalGain = clamp(attackGain * sustainGain * outputLin, 0.01, 10);
      
      const processedL = softClip(inputL * totalGain, 0.9);
      const processedR = softClip(inputR * totalGain, 0.9);
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.fastEnvelope = 0;
    this.slowEnvelope = 0;
  }
}

export class EnvelopeFollowerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const attackMs = (params.attack as number) ?? 10;
    const releaseMs = (params.release as number) ?? 100;
    const sensitivity = (params.sensitivity as number) ?? 0;
    const depth = (params.depth as number) ?? 50;
    const filterFreq = (params.filterFreq as number) ?? 1000;
    const mode = (params.mode as string) ?? 'amplitude';
    const mix = (params.mix as number) ?? 1;

    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const sensitivityLin = dbToLinear(sensitivity);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR)) * sensitivityLin;
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      const envAmount = clamp(this.envelope * (depth / 50), 0, 1);
      
      let processedL = inputL;
      let processedR = inputR;
      
      switch (mode) {
        case 'filter':
          const modFreq = filterFreq * (1 + envAmount * 4);
          this.lpFilter.setLowpass(Math.min(modFreq, 20000), this.sampleRate);
          processedL = this.lpFilter.process(inputL);
          processedR = this.lpFilter.process(inputR);
          break;
        case 'amplitude':
        default:
          const ampMod = 1 - envAmount * 0.5;
          processedL = inputL * ampMod;
          processedR = inputR * ampMod;
          break;
      }
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.lpFilter.clear();
  }
}

export class DuckerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private duckGain: number = 1;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -20;
    const range = (params.range as number) ?? -20;
    const attackMs = (params.attack as number) ?? 5;
    const holdMs = (params.hold as number) ?? 100;
    const releaseMs = (params.release as number) ?? 200;
    const ducking = (params.ducking as number) ?? 100;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const rangeLin = dbToLinear(range);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const duckAmount = ducking / 100;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      let targetGain = 1;
      if (this.envelope > thresholdLin) {
        const overAmount = (this.envelope - thresholdLin) / thresholdLin;
        targetGain = 1 - (1 - rangeLin) * Math.min(1, overAmount) * duckAmount;
      }
      
      const gainCoeff = targetGain < this.duckGain ? attackCoeff : releaseCoeff;
      this.duckGain = this.duckGain * gainCoeff + targetGain * (1 - gainCoeff);
      
      const processedL = inputL * this.duckGain;
      const processedR = inputR * this.duckGain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.duckGain = 1;
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
    const maxLookahead = 441;
    this.lookaheadBuffer = [new Float32Array(maxLookahead), new Float32Array(maxLookahead)];
    this.peakBuffer = new Float32Array(maxLookahead);
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const ceiling = (params.ceiling as number) ?? -0.3;
    const threshold = (params.threshold as number) ?? -1;
    const releaseMs = (params.release as number) ?? 100;
    const lookaheadMs = (params.lookahead as number) ?? 5;
    const stereoLink = (params.stereoLink as boolean) ?? true;
    const mix = (params.mix as number) ?? 1;

    const ceilingLin = dbToLinear(ceiling);
    const thresholdLin = dbToLinear(threshold);
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const lookaheadSamples = Math.min(msToSamples(lookaheadMs, this.sampleRate), 440);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      const delayedL = this.lookaheadBuffer[0][this.bufferIndex];
      const delayedR = this.lookaheadBuffer[1][this.bufferIndex];
      
      this.lookaheadBuffer[0][this.bufferIndex] = inputL;
      this.lookaheadBuffer[1][this.bufferIndex] = inputR;
      
      const inputLevel = stereoLink 
        ? Math.max(Math.abs(inputL), Math.abs(inputR))
        : (Math.abs(inputL) + Math.abs(inputR)) * 0.5;
      
      this.peakBuffer[this.peakIndex] = inputLevel;
      
      let maxPeak = 0;
      for (let j = 0; j < lookaheadSamples; j++) {
        const idx = (this.peakIndex - j + this.peakBuffer.length) % this.peakBuffer.length;
        maxPeak = Math.max(maxPeak, this.peakBuffer[idx]);
      }
      
      let targetGain = 1;
      if (maxPeak > thresholdLin) {
        targetGain = thresholdLin / maxPeak;
      }
      
      if (targetGain < this.envelope) {
        this.envelope = targetGain;
      } else {
        this.envelope = this.envelope * releaseCoeff + targetGain * (1 - releaseCoeff);
      }
      
      const gain = Math.min(this.envelope, ceilingLin / Math.max(Math.abs(delayedL), Math.abs(delayedR), 0.0001));
      
      let processedL = delayedL * gain;
      let processedR = delayedR * gain;
      
      processedL = Math.max(-ceilingLin, Math.min(ceilingLin, processedL));
      processedR = Math.max(-ceilingLin, Math.min(ceilingLin, processedR));
      
      output.samples[0][i] = delayedL * (1 - mix) + processedL * mix;
      output.samples[1][i] = delayedR * (1 - mix) + processedR * mix;
      
      this.bufferIndex = (this.bufferIndex + 1) % this.lookaheadBuffer[0].length;
      this.peakIndex = (this.peakIndex + 1) % this.peakBuffer.length;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.lookaheadBuffer.forEach(b => b.fill(0));
    this.peakBuffer.fill(0);
    this.bufferIndex = 0;
    this.peakIndex = 0;
  }
}

export class MaximizerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private lookaheadBuffer: Float32Array[] = [];
  private bufferIndex: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.lookaheadBuffer = [new Float32Array(441), new Float32Array(441)];
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const ceiling = (params.ceiling as number) ?? -0.1;
    const threshold = (params.threshold as number) ?? -6;
    const releaseMs = (params.release as number) ?? 200;
    const character = (params.character as number) ?? 0.5;
    const mix = (params.mix as number) ?? 1;

    const ceilingLin = dbToLinear(ceiling);
    const thresholdLin = dbToLinear(threshold);
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));
    const makeupGain = ceilingLin / thresholdLin;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i] * makeupGain;
      const inputR = input.samples[1][i] * makeupGain;
      
      const delayedL = this.lookaheadBuffer[0][this.bufferIndex];
      const delayedR = this.lookaheadBuffer[1][this.bufferIndex];
      
      this.lookaheadBuffer[0][this.bufferIndex] = inputL;
      this.lookaheadBuffer[1][this.bufferIndex] = inputR;
      
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      if (inputLevel > this.envelope) {
        this.envelope = inputLevel;
      } else {
        this.envelope = this.envelope * releaseCoeff + inputLevel * (1 - releaseCoeff);
      }
      
      let gain = 1;
      if (this.envelope > ceilingLin) {
        gain = ceilingLin / this.envelope;
      }
      
      let processedL = delayedL * gain;
      let processedR = delayedR * gain;
      
      if (character > 0) {
        const satAmount = character * 0.5;
        processedL = processedL * (1 - satAmount) + Math.tanh(processedL * 1.5) * satAmount;
        processedR = processedR * (1 - satAmount) + Math.tanh(processedR * 1.5) * satAmount;
      }
      
      processedL = Math.max(-ceilingLin, Math.min(ceilingLin, processedL));
      processedR = Math.max(-ceilingLin, Math.min(ceilingLin, processedR));
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
      
      this.bufferIndex = (this.bufferIndex + 1) % this.lookaheadBuffer[0].length;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.lookaheadBuffer.forEach(b => b.fill(0));
    this.bufferIndex = 0;
  }
}

export class LevelerProcessor implements DSPProcessor {
  private envelope: number = 0;
  private targetLevel: number = 0;
  private currentGain: number = 1;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const target = (params.target as number) ?? -18;
    const speed = (params.speed as number) ?? 50;
    const range = (params.range as number) ?? 24;
    const threshold = (params.threshold as number) ?? -50;
    const mix = (params.mix as number) ?? 1;

    const targetLin = dbToLinear(target);
    const thresholdLin = dbToLinear(threshold);
    const maxGain = dbToLinear(range);
    const minGain = dbToLinear(-range);
    const rmsWindow = msToSamples(speed * 10, this.sampleRate);
    const smoothCoeff = Math.exp(-1 / rmsWindow);

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = (Math.abs(inputL) + Math.abs(inputR)) * 0.5;
      
      this.envelope = this.envelope * smoothCoeff + inputLevel * inputLevel * (1 - smoothCoeff);
      const rmsLevel = Math.sqrt(this.envelope);
      
      let desiredGain = this.currentGain;
      if (rmsLevel > thresholdLin) {
        desiredGain = targetLin / Math.max(rmsLevel, 0.0001);
        desiredGain = clamp(desiredGain, minGain, maxGain);
      }
      
      const gainSpeed = 0.0001 * (100 - speed + 1);
      this.currentGain = this.currentGain * (1 - gainSpeed) + desiredGain * gainSpeed;
      
      const processedL = inputL * this.currentGain;
      const processedR = inputR * this.currentGain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.targetLevel = 0;
    this.currentGain = 1;
  }
}

export class PumperProcessor implements DSPProcessor {
  private phase: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const rate = (params.rate as number) ?? 4;
    const depth = (params.depth as number) ?? 50;
    const shape = (params.shape as string) ?? 'sine';
    const offset = (params.offset as number) ?? 0;
    const attack = (params.attack as number) ?? 25;
    const sync = (params.sync as boolean) ?? false;
    const mix = (params.mix as number) ?? 1;

    const depthAmount = depth / 100;
    const attackShape = attack / 100;
    const phaseOffset = (offset / 100) * 2 * Math.PI;
    
    let bpm = context.tempo || 120;
    let phaseIncrement: number;
    
    if (sync) {
      const beatsPerSecond = bpm / 60;
      phaseIncrement = (2 * Math.PI * beatsPerSecond * rate) / this.sampleRate;
    } else {
      phaseIncrement = (2 * Math.PI * rate) / this.sampleRate;
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      let modulation: number;
      const currentPhase = (this.phase + phaseOffset) % (2 * Math.PI);
      
      switch (shape) {
        case 'triangle':
          modulation = 1 - 2 * Math.abs(currentPhase / Math.PI - 1);
          break;
        case 'square':
          modulation = currentPhase < Math.PI ? 1 : 0;
          break;
        case 'saw':
          modulation = 1 - currentPhase / (2 * Math.PI);
          break;
        case 'exp':
          modulation = Math.exp(-currentPhase * attackShape * 3);
          break;
        case 'sine':
        default:
          modulation = (Math.cos(currentPhase) + 1) * 0.5;
          break;
      }
      
      const gain = 1 - depthAmount + depthAmount * modulation;
      
      const processedL = inputL * gain;
      const processedR = inputR * gain;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
      
      this.phase = (this.phase + phaseIncrement) % (2 * Math.PI);
    }
    
    return output;
  }

  reset(): void {
    this.phase = 0;
  }
}

export const DYNAMICS_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-gate': () => new GateProcessor(),
  'mb-expander': () => new ExpanderProcessor(),
  'mb-de-esser': () => new DeEsserProcessor(),
  'mb-transient-shaper': () => new TransientShaperProcessor(),
  'mb-envelope-follower': () => new EnvelopeFollowerProcessor(),
  'mb-ducker': () => new DuckerProcessor(),
  'mb-limiter-pro': () => new LimiterProProcessor(),
  'mb-maximizer': () => new MaximizerProcessor(),
  'mb-leveler': () => new LevelerProcessor(),
  'mb-pumper': () => new PumperProcessor(),
};
