import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, EnvelopeFollower,
  msToSamples, dbToLinear, linearToDb, softClip
} from './core';

export class VCACompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -18;
    const ratio = (params.ratio as number) ?? 4;
    const attackMs = (params.attack as number) ?? 10;
    const releaseMs = (params.release as number) ?? 100;
    const knee = (params.knee as number) ?? 6;
    const makeupGain = (params.makeup as number) ?? 0;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeupGain);
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
      
      if (inputDb > threshold + kneeWidth) {
        gainReduction = (inputDb - threshold) * (1 - 1 / ratio);
      } else if (inputDb > threshold - kneeWidth) {
        const x = inputDb - threshold + kneeWidth;
        gainReduction = (x * x) / (4 * kneeWidth) * (1 - 1 / ratio);
      }
      
      const gain = dbToLinear(-gainReduction) * makeupLin;
      
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

export class OpticalCompressorProcessor implements DSPProcessor {
  private opticalCell: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -20;
    const ratio = (params.ratio as number) ?? 3;
    const attackMs = (params.attack as number) ?? 20;
    const releaseMs = (params.release as number) ?? 300;
    const makeup = (params.makeup as number) ?? 0;
    const mix = (params.mix as number) ?? 1;
    const warmth = (params.warmth as number) ?? 0.3;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs * 2, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const targetResponse = inputLevel > thresholdLin 
        ? (inputLevel - thresholdLin) / thresholdLin 
        : 0;
      
      const opticalCoeff = targetResponse > this.opticalCell ? attackCoeff : releaseCoeff;
      this.opticalCell = this.opticalCell * opticalCoeff + targetResponse * (1 - opticalCoeff);
      
      const nonLinearResponse = Math.log1p(this.opticalCell * 10) / Math.log1p(10);
      
      const gainReduction = nonLinearResponse * (1 - 1 / ratio);
      let gain = dbToLinear(-gainReduction * 20) * makeupLin;
      
      let processedL = inputL * gain;
      let processedR = inputR * gain;
      
      if (warmth > 0) {
        processedL = Math.tanh(processedL * (1 + warmth)) / (1 + warmth * 0.5);
        processedR = Math.tanh(processedR * (1 + warmth)) / (1 + warmth * 0.5);
      }
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.opticalCell = 0;
  }
}

export class FETCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private saturationState: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -15;
    const ratio = (params.ratio as number) ?? 8;
    const attackMs = (params.attack as number) ?? 0.5;
    const releaseMs = (params.release as number) ?? 80;
    const makeup = (params.makeup as number) ?? 0;
    const mix = (params.mix as number) ?? 1;
    const input_drive = (params.input as number) ?? 0;
    const character = (params.character as number) ?? 0.5;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const inputGain = dbToLinear(input_drive);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      let inputL = input.samples[0][i] * inputGain;
      let inputR = input.samples[1][i] * inputGain;
      
      if (character > 0) {
        inputL = softClip(inputL * (1 + character), 0.7);
        inputR = softClip(inputR * (1 + character), 0.7);
      }
      
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const fetResponse = Math.pow(inputLevel, 0.8);
      const coeff = fetResponse > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + fetResponse * (1 - coeff);
      
      let gain = 1;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        const reduction = overDb * (1 - 1 / ratio);
        gain = dbToLinear(-reduction);
      }
      
      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;
      
      processedL = Math.tanh(processedL * (1 + character * 0.3)) / (1 + character * 0.15);
      processedR = Math.tanh(processedR * (1 + character * 0.3)) / (1 + character * 0.15);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.saturationState = 0;
  }
}

export class TubeCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private tubeState: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -16;
    const ratio = (params.ratio as number) ?? 3;
    const attackMs = (params.attack as number) ?? 15;
    const releaseMs = (params.release as number) ?? 150;
    const makeup = (params.makeup as number) ?? 0;
    const mix = (params.mix as number) ?? 1;
    const drive = (params.drive as number) ?? 0.4;
    const bias = (params.bias as number) ?? 0;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attackMs, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(releaseMs, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      let inputL = input.samples[0][i];
      let inputR = input.samples[1][i];
      
      inputL = inputL + bias * 0.1;
      inputR = inputR + bias * 0.1;
      
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      let gain = 1;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        const smoothOver = Math.log1p(overDb);
        const reduction = smoothOver * (1 - 1 / ratio) * 3;
        gain = dbToLinear(-reduction);
      }
      
      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;
      
      const tubeTransfer = (x: number) => {
        const driven = x * (1 + drive * 2);
        return (driven > 0 
          ? 1 - Math.exp(-driven) 
          : -1 + Math.exp(driven)) / (1 + drive);
      };
      
      processedL = tubeTransfer(processedL);
      processedR = tubeTransfer(processedR);
      
      const evenHarmonics = 0.02 * drive;
      processedL += processedL * processedL * evenHarmonics;
      processedR += processedR * processedR * evenHarmonics;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.tubeState = 0;
  }
}

export class MultibandCompressorProcessor implements DSPProcessor {
  private lowEnv: number = 0;
  private midEnv: number = 0;
  private highEnv: number = 0;
  private lowLP: BiquadFilter;
  private lowHP: BiquadFilter;
  private midLP: BiquadFilter;
  private midHP: BiquadFilter;
  private highHP: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowLP = new BiquadFilter();
    this.lowHP = new BiquadFilter();
    this.midLP = new BiquadFilter();
    this.midHP = new BiquadFilter();
    this.highHP = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const lowFreq = (params.lowFreq as number) ?? 200;
    const highFreq = (params.highFreq as number) ?? 4000;
    const lowThreshold = (params.lowThreshold as number) ?? -20;
    const midThreshold = (params.midThreshold as number) ?? -18;
    const highThreshold = (params.highThreshold as number) ?? -16;
    const lowRatio = (params.lowRatio as number) ?? 4;
    const midRatio = (params.midRatio as number) ?? 3;
    const highRatio = (params.highRatio as number) ?? 2;
    const attack = (params.attack as number) ?? 10;
    const release = (params.release as number) ?? 100;
    const mix = (params.mix as number) ?? 1;

    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    this.lowLP.setLowpass(lowFreq, 0.707, this.sampleRate);
    this.lowHP.setHighpass(20, 0.707, this.sampleRate);
    this.midLP.setLowpass(highFreq, 0.707, this.sampleRate);
    this.midHP.setHighpass(lowFreq, 0.707, this.sampleRate);
    this.highHP.setHighpass(highFreq, 0.707, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const mono = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      
      const lowBand = this.lowLP.process(this.lowHP.process(mono));
      const midBand = this.midLP.process(this.midHP.process(mono));
      const highBand = this.highHP.process(mono);
      
      const compressBand = (sample: number, env: number, threshold: number, ratio: number): { sample: number; env: number } => {
        const level = Math.abs(sample);
        const threshLin = dbToLinear(threshold);
        const coeff = level > env ? attackCoeff : releaseCoeff;
        env = env * coeff + level * (1 - coeff);
        
        let gain = 1;
        if (env > threshLin) {
          const overDb = linearToDb(env / threshLin);
          gain = dbToLinear(-overDb * (1 - 1 / ratio));
        }
        
        return { sample: sample * gain, env };
      };
      
      const lowResult = compressBand(lowBand, this.lowEnv, lowThreshold, lowRatio);
      const midResult = compressBand(midBand, this.midEnv, midThreshold, midRatio);
      const highResult = compressBand(highBand, this.highEnv, highThreshold, highRatio);
      
      this.lowEnv = lowResult.env;
      this.midEnv = midResult.env;
      this.highEnv = highResult.env;
      
      const processed = lowResult.sample + midResult.sample + highResult.sample;
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processed * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processed * mix;
    }
    
    return output;
  }

  reset(): void {
    this.lowEnv = 0;
    this.midEnv = 0;
    this.highEnv = 0;
    this.lowLP.clear();
    this.lowHP.clear();
    this.midLP.clear();
    this.midHP.clear();
    this.highHP.clear();
  }
}

export class ParallelCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -30;
    const ratio = (params.ratio as number) ?? 10;
    const attack = (params.attack as number) ?? 5;
    const release = (params.release as number) ?? 50;
    const blend = (params.blend as number) ?? 0.5;
    const makeup = (params.makeup as number) ?? 6;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      let gain = 1;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        gain = dbToLinear(-overDb * (1 - 1 / ratio));
      }
      
      const compressedL = inputL * gain * makeupLin;
      const compressedR = inputR * gain * makeupLin;
      
      output.samples[0][i] = inputL * (1 - blend) + compressedL * blend;
      output.samples[1][i] = inputR * (1 - blend) + compressedR * blend;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
  }
}

export class BusCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -12;
    const ratio = (params.ratio as number) ?? 2;
    const attack = (params.attack as number) ?? 30;
    const release = (params.release as number) ?? 300;
    const makeup = (params.makeup as number) ?? 3;
    const mix = (params.mix as number) ?? 1;
    const sidechain = (params.sidechain as number) ?? 0;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      const stereoSum = (inputL + inputR) * 0.5;
      const inputLevel = Math.abs(stereoSum);
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      let gain = 1;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        gain = dbToLinear(-overDb * (1 - 1 / ratio));
      }
      
      const processedL = inputL * gain * makeupLin;
      const processedR = inputR * gain * makeupLin;
      
      output.samples[0][i] = inputL * (1 - mix) + processedL * mix;
      output.samples[1][i] = inputR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
  }
}

export class MasteringCompressorProcessor implements DSPProcessor {
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
    
    const threshold = (params.threshold as number) ?? -6;
    const ratio = (params.ratio as number) ?? 1.5;
    const attack = (params.attack as number) ?? 50;
    const release = (params.release as number) ?? 500;
    const makeup = (params.makeup as number) ?? 2;
    const lookahead = (params.lookahead as number) ?? 5;
    const knee = (params.knee as number) ?? 10;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));
    const lookaheadSamples = msToSamples(lookahead, this.sampleRate);
    const kneeWidth = knee / 2;

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      const lookaheadL = this.lookaheadBuffer[0][this.bufferIndex];
      const lookaheadR = this.lookaheadBuffer[1][this.bufferIndex];
      
      this.lookaheadBuffer[0][this.bufferIndex] = inputL;
      this.lookaheadBuffer[1][this.bufferIndex] = inputR;
      this.bufferIndex = (this.bufferIndex + 1) % this.lookaheadBuffer[0].length;
      
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
      
      const processedL = lookaheadL * gain;
      const processedR = lookaheadR * gain;
      
      output.samples[0][i] = lookaheadL * (1 - mix) + processedL * mix;
      output.samples[1][i] = lookaheadR * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.lookaheadBuffer.forEach(b => b.fill(0));
    this.bufferIndex = 0;
  }
}

export class VintageCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private programDependent: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -18;
    const ratio = (params.ratio as number) ?? 4;
    const attack = (params.attack as number) ?? 10;
    const release = (params.release as number) ?? 100;
    const makeup = (params.makeup as number) ?? 0;
    const mix = (params.mix as number) ?? 1;
    const character = (params.character as number) ?? 0.5;
    const warmth = (params.warmth as number) ?? 0.4;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const baseAttackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const baseReleaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      let inputL = input.samples[0][i];
      let inputR = input.samples[1][i];
      const inputLevel = Math.max(Math.abs(inputL), Math.abs(inputR));
      
      const programFactor = 1 + this.programDependent * character;
      const attackCoeff = Math.pow(baseAttackCoeff, 1 / programFactor);
      const releaseCoeff = Math.pow(baseReleaseCoeff, programFactor);
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      this.programDependent = this.programDependent * 0.999 + (this.envelope > thresholdLin ? 0.001 : 0);
      
      let gain = 1;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        const smoothRatio = ratio + (ratio - 1) * Math.tanh(overDb / 10);
        gain = dbToLinear(-overDb * (1 - 1 / smoothRatio));
      }
      
      let processedL = inputL * gain * makeupLin;
      let processedR = inputR * gain * makeupLin;
      
      if (warmth > 0) {
        processedL = Math.tanh(processedL * (1 + warmth)) / (1 + warmth * 0.5);
        processedR = Math.tanh(processedR * (1 + warmth)) / (1 + warmth * 0.5);
        
        processedL += processedL * processedL * warmth * 0.05;
        processedR += processedR * processedR * warmth * 0.05;
      }
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + processedL * mix;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + processedR * mix;
    }
    
    return output;
  }

  reset(): void {
    this.envelope = 0;
    this.programDependent = 0;
  }
}

export class GlueCompressorProcessor implements DSPProcessor {
  private envelope: number = 0;
  private sampleRate: number = 44100;

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const threshold = (params.threshold as number) ?? -10;
    const ratio = (params.ratio as number) ?? 2;
    const attack = (params.attack as number) ?? 30;
    const release = (params.release as number) ?? 300;
    const makeup = (params.makeup as number) ?? 2;
    const range = (params.range as number) ?? 12;
    const mix = (params.mix as number) ?? 1;

    const thresholdLin = dbToLinear(threshold);
    const makeupLin = dbToLinear(makeup);
    const attackCoeff = Math.exp(-1 / msToSamples(attack, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(release, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      const inputL = input.samples[0][i];
      const inputR = input.samples[1][i];
      
      const stereoSum = (inputL + inputR) * 0.5;
      const inputLevel = Math.abs(stereoSum);
      
      const coeff = inputLevel > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = this.envelope * coeff + inputLevel * (1 - coeff);
      
      let gainReduction = 0;
      if (this.envelope > thresholdLin) {
        const overDb = linearToDb(this.envelope / thresholdLin);
        gainReduction = Math.min(range, overDb * (1 - 1 / ratio));
      }
      
      const gain = dbToLinear(-gainReduction) * makeupLin;
      
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

export const COMPRESSOR_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-vca-compressor': () => new VCACompressorProcessor(),
  'mb-optical-compressor': () => new OpticalCompressorProcessor(),
  'mb-fet-compressor': () => new FETCompressorProcessor(),
  'mb-tube-compressor': () => new TubeCompressorProcessor(),
  'mb-multiband-compressor': () => new MultibandCompressorProcessor(),
  'mb-parallel-compressor': () => new ParallelCompressorProcessor(),
  'mb-bus-compressor': () => new BusCompressorProcessor(),
  'mb-mastering-compressor': () => new MasteringCompressorProcessor(),
  'mb-vintage-compressor': () => new VintageCompressorProcessor(),
  'mb-glue-compressor': () => new GlueCompressorProcessor(),
};
