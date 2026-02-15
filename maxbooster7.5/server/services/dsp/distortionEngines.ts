import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, EnvelopeFollower, DelayLine,
  msToSamples, dbToLinear, linearToDb, softClip, hardClip, clamp
} from './core';

export class TubeDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private bias: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const drive = (params.drive as number) ?? 0.5;
    const bias = (params.bias as number) ?? 0.1;
    const warmth = (params.warmth as number) ?? 0.5;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;
    const evenHarmonics = (params.evenHarmonics as number) ?? 0.6;

    this.hpFilter.setHighpass(30, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(8000 + (1 - warmth) * 12000, 0.707, this.sampleRate);

    const driveAmount = 1 + drive * 10;
    const biasAmount = bias * 0.2;
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        sample = sample + biasAmount;
        sample = sample * driveAmount;
        
        const x = sample;
        sample = x / (1 + Math.abs(x));
        
        if (evenHarmonics > 0) {
          const squared = x * Math.abs(x) * 0.5;
          sample = sample * (1 - evenHarmonics) + squared * evenHarmonics;
        }
        
        sample = sample * (1 / driveAmount) * 2;
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.bias = 0;
  }
}

export class TapeDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private headBumpFilter: BiquadFilter;
  private compressionEnvelope: number = 0;
  private flutterPhase: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.headBumpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const drive = (params.drive as number) ?? 0.4;
    const saturation = (params.saturation as number) ?? 0.5;
    const headBump = (params.headBump as number) ?? 0.3;
    const compression = (params.compression as number) ?? 0.4;
    const flutter = (params.flutter as number) ?? 0.1;
    const hiss = (params.hiss as number) ?? 0.02;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(40, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(12000 - saturation * 4000, 0.707, this.sampleRate);
    this.headBumpFilter.setPeaking(80, 0.8, headBump * 6, this.sampleRate);

    const driveAmount = 1 + drive * 5;
    const outputGain = dbToLinear(outputLevel);
    const attackCoeff = Math.exp(-1 / msToSamples(5, this.sampleRate));
    const releaseCoeff = Math.exp(-1 / msToSamples(100, this.sampleRate));

    for (let i = 0; i < input.samples[0].length; i++) {
      this.flutterPhase += (2 * Math.PI * 5) / this.sampleRate;
      const flutterMod = Math.sin(this.flutterPhase) * flutter * 0.002;
      
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        sample = this.headBumpFilter.process(sample);
        sample = sample * driveAmount;
        
        const inputLevel = Math.abs(sample);
        const coeff = inputLevel > this.compressionEnvelope ? attackCoeff : releaseCoeff;
        this.compressionEnvelope = this.compressionEnvelope * coeff + inputLevel * (1 - coeff);
        
        if (compression > 0 && this.compressionEnvelope > 0.5) {
          const gain = 0.5 / this.compressionEnvelope;
          sample = sample * (1 - compression + compression * gain);
        }
        
        sample = Math.tanh(sample * (1 + saturation));
        sample = sample * (1 + flutterMod);
        sample = this.lpFilter.process(sample);
        
        if (hiss > 0) {
          sample += (Math.random() * 2 - 1) * hiss * 0.1;
        }
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.headBumpFilter.clear();
    this.compressionEnvelope = 0;
    this.flutterPhase = 0;
  }
}

export class TransistorDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private toneFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.toneFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const drive = (params.drive as number) ?? 0.6;
    const tone = (params.tone as number) ?? 0.5;
    const asymmetry = (params.asymmetry as number) ?? 0.3;
    const hardness = (params.hardness as number) ?? 0.7;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(80, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(4000 + tone * 8000, 0.707, this.sampleRate);
    this.toneFilter.setPeaking(2000, 1, tone * 6 - 3, this.sampleRate);

    const driveAmount = 1 + drive * 20;
    const outputGain = dbToLinear(outputLevel);
    const clipThreshold = 1 - hardness * 0.5;

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        sample = sample * driveAmount;
        
        if (asymmetry > 0) {
          if (sample > 0) {
            sample = sample * (1 + asymmetry * 0.5);
          } else {
            sample = sample * (1 - asymmetry * 0.3);
          }
        }
        
        if (Math.abs(sample) > clipThreshold) {
          const sign = sample > 0 ? 1 : -1;
          const excess = Math.abs(sample) - clipThreshold;
          const softPart = clipThreshold + excess * (1 - hardness);
          sample = sign * Math.min(1, softPart);
        }
        
        sample = hardClip(sample, 1);
        sample = this.toneFilter.process(sample);
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.toneFilter.clear();
  }
}

export class FuzzDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private gateEnvelope: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const fuzz = (params.fuzz as number) ?? 0.8;
    const tone = (params.tone as number) ?? 0.5;
    const gate = (params.gate as number) ?? 0.2;
    const sustain = (params.sustain as number) ?? 0.6;
    const octave = (params.octave as number) ?? 0;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(100, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(2000 + tone * 6000, 0.707, this.sampleRate);

    const fuzzAmount = 1 + fuzz * 50;
    const outputGain = dbToLinear(outputLevel);
    const gateThreshold = gate * 0.1;
    const sustainAmount = sustain * 2;

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        
        const inputLevel = Math.abs(sample);
        this.gateEnvelope = this.gateEnvelope * 0.999 + inputLevel * 0.001;
        
        if (this.gateEnvelope < gateThreshold) {
          sample = sample * (this.gateEnvelope / gateThreshold);
        }
        
        sample = sample * fuzzAmount;
        
        if (octave > 0) {
          sample = sample + Math.abs(sample) * octave;
        }
        
        sample = sample / (1 + Math.abs(sample) * sustainAmount);
        sample = Math.sign(sample) * Math.pow(Math.abs(sample), 0.5 + (1 - sustain) * 0.5);
        
        sample = sample * 2;
        sample = hardClip(sample, 1);
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.gateEnvelope = 0;
  }
}

export class BitcrushDistortionProcessor implements DSPProcessor {
  private sampleHoldL: number = 0;
  private sampleHoldR: number = 0;
  private sampleCounter: number = 0;
  private lpFilter: OnePoleFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lpFilter = new OnePoleFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const bitDepth = (params.bitDepth as number) ?? 8;
    const sampleRateReduction = (params.sampleRate as number) ?? 0.5;
    const jitter = (params.jitter as number) ?? 0;
    const dither = (params.dither as number) ?? 0;
    const aliasing = (params.aliasing as number) ?? 0.5;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    const targetRate = this.sampleRate * (1 - sampleRateReduction * 0.95);
    const sampleSkip = Math.max(1, Math.floor(this.sampleRate / targetRate));
    const levels = Math.pow(2, bitDepth);
    const outputGain = dbToLinear(outputLevel);

    if (aliasing < 0.5) {
      this.lpFilter.setLowpass(targetRate * 0.4, this.sampleRate);
    } else {
      this.lpFilter.setLowpass(20000, this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      this.sampleCounter++;
      
      const jitterOffset = jitter > 0 ? Math.floor(Math.random() * jitter * 4) : 0;
      
      if (this.sampleCounter >= sampleSkip + jitterOffset) {
        this.sampleCounter = 0;
        this.sampleHoldL = input.samples[0][i];
        this.sampleHoldR = input.samples[1][i];
      }
      
      let sampleL = this.sampleHoldL;
      let sampleR = this.sampleHoldR;
      
      if (dither > 0) {
        sampleL += (Math.random() * 2 - 1) * dither / levels;
        sampleR += (Math.random() * 2 - 1) * dither / levels;
      }
      
      sampleL = Math.round(sampleL * levels) / levels;
      sampleR = Math.round(sampleR * levels) / levels;
      
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      
      output.samples[0][i] = input.samples[0][i] * (1 - mix) + sampleL * mix * outputGain;
      output.samples[1][i] = input.samples[1][i] * (1 - mix) + sampleR * mix * outputGain;
    }
    
    return output;
  }

  reset(): void {
    this.sampleHoldL = 0;
    this.sampleHoldR = 0;
    this.sampleCounter = 0;
    this.lpFilter.clear();
  }
}

export class WaveshaperDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
  }

  private getCurve(type: string, amount: number, x: number): number {
    switch (type) {
      case 'sine':
        return Math.sin(x * Math.PI * 0.5 * (1 + amount * 2));
      case 'exponential':
        return Math.sign(x) * Math.pow(Math.abs(x), 1 / (1 + amount * 2));
      case 'cubic':
        return x - (amount * x * x * x) / 3;
      case 'arctangent':
        return (2 / Math.PI) * Math.atan(x * (1 + amount * 10));
      case 'foldback':
        const foldX = x * (1 + amount * 4);
        if (Math.abs(foldX) > 1) {
          return Math.sin(foldX * Math.PI * 0.5);
        }
        return foldX;
      default:
        return Math.tanh(x * (1 + amount * 3));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const curve = (params.curve as string) ?? 'tanh';
    const drive = (params.drive as number) ?? 0.5;
    const amount = (params.amount as number) ?? 0.5;
    const symmetry = (params.symmetry as number) ?? 0;
    const postFilter = (params.postFilter as number) ?? 8000;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(20, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(postFilter, 0.707, this.sampleRate);

    const driveAmount = 1 + drive * 5;
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        sample = sample * driveAmount;
        
        if (symmetry !== 0) {
          sample = sample + symmetry * 0.2;
        }
        
        sample = this.getCurve(curve, amount, sample);
        
        if (symmetry !== 0) {
          sample = sample - symmetry * 0.1;
        }
        
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
  }
}

export class OverdriveDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private midBoost: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.midBoost = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const drive = (params.drive as number) ?? 0.5;
    const tone = (params.tone as number) ?? 0.5;
    const body = (params.body as number) ?? 0.5;
    const presence = (params.presence as number) ?? 0.5;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(60 + (1 - body) * 100, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(3000 + tone * 9000, 0.707, this.sampleRate);
    this.midBoost.setPeaking(800, 1, presence * 4, this.sampleRate);

    const driveAmount = 1 + drive * 8;
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        sample = sample * driveAmount;
        
        sample = softClip(sample, 0.6 + (1 - drive) * 0.3);
        
        sample = this.midBoost.process(sample);
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.midBoost.clear();
  }
}

export class SaturationDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private harmonicFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
    this.harmonicFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const saturation = (params.saturation as number) ?? 0.3;
    const color = (params.color as number) ?? 0.5;
    const harmonics = (params.harmonics as number) ?? 0.5;
    const dynamics = (params.dynamics as number) ?? 0.5;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(20, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(16000 - (1 - color) * 8000, 0.707, this.sampleRate);
    this.harmonicFilter.setHighShelf(4000, harmonics * 3 - 1.5, this.sampleRate);

    const satAmount = saturation * 3;
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.hpFilter.process(sample);
        
        const inputLevel = Math.abs(sample);
        const dynamicDrive = 1 + satAmount * (dynamics + inputLevel * (1 - dynamics));
        sample = sample * dynamicDrive;
        
        sample = Math.tanh(sample);
        
        if (harmonics > 0.5) {
          sample = sample + sample * sample * (harmonics - 0.5) * 0.2;
        }
        
        sample = this.harmonicFilter.process(sample);
        sample = this.lpFilter.process(sample);
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.harmonicFilter.clear();
  }
}

export class LoFiDistortionProcessor implements DSPProcessor {
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private sampleHold: number = 0;
  private sampleCounter: number = 0;
  private noiseState: number = 0;
  private wowPhase: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const bitDepth = (params.bitDepth as number) ?? 12;
    const sampleReduction = (params.sampleReduction as number) ?? 0.2;
    const noise = (params.noise as number) ?? 0.1;
    const wow = (params.wow as number) ?? 0.1;
    const lowCut = (params.lowCut as number) ?? 200;
    const highCut = (params.highCut as number) ?? 4000;
    const saturation = (params.saturation as number) ?? 0.3;
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(lowCut, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(highCut, 0.707, this.sampleRate);

    const levels = Math.pow(2, bitDepth);
    const sampleSkip = Math.max(1, Math.floor(sampleReduction * 10));
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      this.wowPhase += (2 * Math.PI * 0.5) / this.sampleRate;
      const wowMod = 1 + Math.sin(this.wowPhase) * wow * 0.01;
      
      this.sampleCounter++;
      if (this.sampleCounter >= sampleSkip) {
        this.sampleCounter = 0;
        this.sampleHold = (input.samples[0][i] + input.samples[1][i]) * 0.5;
      }
      
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        if (sampleReduction > 0) {
          sample = sample * (1 - sampleReduction * 0.5) + this.sampleHold * sampleReduction * 0.5;
        }
        
        sample = this.hpFilter.process(sample);
        sample = this.lpFilter.process(sample);
        
        if (saturation > 0) {
          sample = Math.tanh(sample * (1 + saturation * 2)) / (1 + saturation * 0.5);
        }
        
        sample = Math.round(sample * levels) / levels;
        sample = sample * wowMod;
        
        if (noise > 0) {
          this.noiseState = this.noiseState * 0.99 + (Math.random() * 2 - 1) * 0.01;
          sample += this.noiseState * noise * 0.2;
        }
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.hpFilter.clear();
    this.lpFilter.clear();
    this.sampleHold = 0;
    this.sampleCounter = 0;
    this.noiseState = 0;
    this.wowPhase = 0;
  }
}

export class AmpDistortionProcessor implements DSPProcessor {
  private inputFilter: BiquadFilter;
  private toneStack: BiquadFilter[];
  private cabinetFilter: BiquadFilter[];
  private sampleRate: number = 44100;

  constructor() {
    this.inputFilter = new BiquadFilter();
    this.toneStack = [new BiquadFilter(), new BiquadFilter(), new BiquadFilter()];
    this.cabinetFilter = [new BiquadFilter(), new BiquadFilter()];
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const gain = (params.gain as number) ?? 0.5;
    const bass = (params.bass as number) ?? 0.5;
    const mid = (params.mid as number) ?? 0.5;
    const treble = (params.treble as number) ?? 0.5;
    const presence = (params.presence as number) ?? 0.5;
    const master = (params.master as number) ?? 0.5;
    const cabinet = (params.cabinet as boolean) ?? true;
    const ampType = (params.type as string) ?? 'clean';
    const mix = (params.mix as number) ?? 1.0;
    const outputLevel = (params.output as number) ?? 0;

    this.inputFilter.setHighpass(80, 0.707, this.sampleRate);
    this.toneStack[0].setLowShelf(200, (bass - 0.5) * 12, this.sampleRate);
    this.toneStack[1].setPeaking(800, 0.7, (mid - 0.5) * 12, this.sampleRate);
    this.toneStack[2].setHighShelf(3000, (treble - 0.5) * 12, this.sampleRate);
    
    if (cabinet) {
      this.cabinetFilter[0].setLowpass(5000, 0.707, this.sampleRate);
      this.cabinetFilter[1].setPeaking(2500, 1, presence * 6 - 3, this.sampleRate);
    }

    const gainAmount = Math.pow(10, gain * 2);
    const masterGain = master * 2;
    const outputGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      for (let ch = 0; ch < input.channels; ch++) {
        let sample = input.samples[ch][i];
        const dry = sample;
        
        sample = this.inputFilter.process(sample);
        sample = sample * gainAmount;
        
        switch (ampType) {
          case 'clean':
            sample = softClip(sample, 0.9);
            break;
          case 'crunch':
            sample = Math.tanh(sample * 1.5);
            break;
          case 'lead':
            sample = sample / (1 + Math.abs(sample));
            sample = Math.tanh(sample * 2);
            break;
          case 'high-gain':
            sample = sample / (1 + Math.abs(sample) * 0.5);
            sample = hardClip(sample, 0.8);
            sample = Math.tanh(sample * 2);
            break;
          default:
            sample = Math.tanh(sample);
        }
        
        for (const filter of this.toneStack) {
          sample = filter.process(sample);
        }
        
        if (cabinet) {
          for (const filter of this.cabinetFilter) {
            sample = filter.process(sample);
          }
        }
        
        sample = sample * masterGain;
        
        sample = dry * (1 - mix) + sample * mix;
        output.samples[ch][i] = sample * outputGain;
      }
    }
    
    return output;
  }

  reset(): void {
    this.inputFilter.clear();
    this.toneStack.forEach(f => f.clear());
    this.cabinetFilter.forEach(f => f.clear());
  }
}

export const DISTORTION_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-tube-distortion': () => new TubeDistortionProcessor(),
  'mb-tape-distortion': () => new TapeDistortionProcessor(),
  'mb-transistor-distortion': () => new TransistorDistortionProcessor(),
  'mb-fuzz-distortion': () => new FuzzDistortionProcessor(),
  'mb-bitcrush': () => new BitcrushDistortionProcessor(),
  'mb-waveshaper': () => new WaveshaperDistortionProcessor(),
  'mb-overdrive': () => new OverdriveDistortionProcessor(),
  'mb-saturation': () => new SaturationDistortionProcessor(),
  'mb-lofi': () => new LoFiDistortionProcessor(),
  'mb-amp': () => new AmpDistortionProcessor(),
};
