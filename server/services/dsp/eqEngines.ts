import { 
  AudioBuffer, DSPContext, DSPProcessor, copyBuffer,
  BiquadFilter, OnePoleFilter, EnvelopeFollower,
  msToSamples, dbToLinear, linearToDb
} from './core';

export class ParametricEQProcessor implements DSPProcessor {
  private bands: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.bands.push(new BiquadFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const hpFreq = (params.hpFreq as number) ?? 20;
    const hpEnabled = (params.hpEnabled as boolean) ?? false;
    const lpFreq = (params.lpFreq as number) ?? 20000;
    const lpEnabled = (params.lpEnabled as boolean) ?? false;
    const band1Freq = (params.band1Freq as number) ?? 100;
    const band1Gain = (params.band1Gain as number) ?? 0;
    const band1Q = (params.band1Q as number) ?? 1;
    const band2Freq = (params.band2Freq as number) ?? 500;
    const band2Gain = (params.band2Gain as number) ?? 0;
    const band2Q = (params.band2Q as number) ?? 1;
    const band3Freq = (params.band3Freq as number) ?? 2000;
    const band3Gain = (params.band3Gain as number) ?? 0;
    const band3Q = (params.band3Q as number) ?? 1;
    const band4Freq = (params.band4Freq as number) ?? 8000;
    const band4Gain = (params.band4Gain as number) ?? 0;
    const band4Q = (params.band4Q as number) ?? 1;
    const outputGain = (params.output as number) ?? 0;

    if (hpEnabled) this.bands[0].setHighpass(hpFreq, 0.707, this.sampleRate);
    if (lpEnabled) this.bands[1].setLowpass(lpFreq, 0.707, this.sampleRate);
    this.bands[2].setPeaking(band1Freq, band1Q, band1Gain, this.sampleRate);
    this.bands[3].setPeaking(band2Freq, band2Q, band2Gain, this.sampleRate);
    this.bands[4].setPeaking(band3Freq, band3Q, band3Gain, this.sampleRate);
    this.bands[5].setPeaking(band4Freq, band4Q, band4Gain, this.sampleRate);

    const outGainLin = dbToLinear(outputGain);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      if (hpEnabled) {
        sampleL = this.bands[0].process(sampleL);
        sampleR = this.bands[0].process(sampleR);
      }
      if (lpEnabled) {
        sampleL = this.bands[1].process(sampleL);
        sampleR = this.bands[1].process(sampleR);
      }
      
      for (let b = 2; b <= 5; b++) {
        sampleL = this.bands[b].process(sampleL);
        sampleR = this.bands[b].process(sampleR);
      }
      
      output.samples[0][i] = sampleL * outGainLin;
      output.samples[1][i] = sampleR * outGainLin;
    }
    
    return output;
  }

  reset(): void {
    this.bands.forEach(b => b.clear());
  }
}

export class GraphicEQProcessor implements DSPProcessor {
  private bands: BiquadFilter[] = [];
  private frequencies: number[] = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 10; i++) {
      this.bands.push(new BiquadFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const gains = [
      (params.band31 as number) ?? 0,
      (params.band63 as number) ?? 0,
      (params.band125 as number) ?? 0,
      (params.band250 as number) ?? 0,
      (params.band500 as number) ?? 0,
      (params.band1k as number) ?? 0,
      (params.band2k as number) ?? 0,
      (params.band4k as number) ?? 0,
      (params.band8k as number) ?? 0,
      (params.band16k as number) ?? 0,
    ];
    const q = (params.q as number) ?? 1.4;

    for (let b = 0; b < 10; b++) {
      this.bands[b].setPeaking(this.frequencies[b], q, gains[b], this.sampleRate);
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      for (let b = 0; b < 10; b++) {
        sampleL = this.bands[b].process(sampleL);
        sampleR = this.bands[b].process(sampleR);
      }
      
      output.samples[0][i] = sampleL;
      output.samples[1][i] = sampleR;
    }
    
    return output;
  }

  reset(): void {
    this.bands.forEach(b => b.clear());
  }
}

export class VintageEQProcessor implements DSPProcessor {
  private lowShelf: BiquadFilter;
  private midPeak: BiquadFilter;
  private highShelf: BiquadFilter;
  private presence: BiquadFilter;
  private saturation: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelf = new BiquadFilter();
    this.midPeak = new BiquadFilter();
    this.highShelf = new BiquadFilter();
    this.presence = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const low = (params.low as number) ?? 0;
    const lowFreq = (params.lowFreq as number) ?? 100;
    const mid = (params.mid as number) ?? 0;
    const midFreq = (params.midFreq as number) ?? 1000;
    const high = (params.high as number) ?? 0;
    const highFreq = (params.highFreq as number) ?? 8000;
    const drive = (params.drive as number) ?? 0.2;
    const outputLevel = (params.output as number) ?? 0;

    this.lowShelf.setLowShelf(lowFreq, low, this.sampleRate);
    this.midPeak.setPeaking(midFreq, 0.7, mid, this.sampleRate);
    this.highShelf.setHighShelf(highFreq, high, this.sampleRate);
    this.presence.setPeaking(3500, 1.5, high * 0.3, this.sampleRate);

    const outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      if (drive > 0) {
        sampleL = Math.tanh(sampleL * (1 + drive * 2)) / (1 + drive);
        sampleR = Math.tanh(sampleR * (1 + drive * 2)) / (1 + drive);
      }
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      sampleL = this.midPeak.process(sampleL);
      sampleR = this.midPeak.process(sampleR);
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      sampleL = this.presence.process(sampleL);
      sampleR = this.presence.process(sampleR);
      
      output.samples[0][i] = sampleL * outGain;
      output.samples[1][i] = sampleR * outGain;
    }
    
    return output;
  }

  reset(): void {
    this.lowShelf.clear();
    this.midPeak.clear();
    this.highShelf.clear();
    this.presence.clear();
  }
}

export class LinearPhaseEQProcessor implements DSPProcessor {
  private fftSize: number = 2048;
  private buffer: Float32Array[] = [];
  private outputBuffer: Float32Array[] = [];
  private position: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.buffer = [new Float32Array(this.fftSize), new Float32Array(this.fftSize)];
    this.outputBuffer = [new Float32Array(this.fftSize), new Float32Array(this.fftSize)];
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const lowGain = dbToLinear((params.lowGain as number) ?? 0);
    const lowFreq = (params.lowFreq as number) ?? 100;
    const midGain = dbToLinear((params.midGain as number) ?? 0);
    const midFreq = (params.midFreq as number) ?? 1000;
    const highGain = dbToLinear((params.highGain as number) ?? 0);
    const highFreq = (params.highFreq as number) ?? 8000;

    for (let i = 0; i < input.samples[0].length; i++) {
      this.buffer[0][this.position] = input.samples[0][i];
      this.buffer[1][this.position] = input.samples[1][i];
      
      const outputPos = (this.position + this.fftSize / 2) % this.fftSize;
      
      let freqNorm = (this.position / this.fftSize) * this.sampleRate / 2;
      let gain = 1;
      
      if (freqNorm < lowFreq) {
        gain *= lowGain;
      } else if (freqNorm < midFreq) {
        const t = (freqNorm - lowFreq) / (midFreq - lowFreq);
        gain *= lowGain * (1 - t) + midGain * t;
      } else if (freqNorm < highFreq) {
        const t = (freqNorm - midFreq) / (highFreq - midFreq);
        gain *= midGain * (1 - t) + highGain * t;
      } else {
        gain *= highGain;
      }
      
      output.samples[0][i] = input.samples[0][i] * gain;
      output.samples[1][i] = input.samples[1][i] * gain;
      
      this.position = (this.position + 1) % this.fftSize;
    }
    
    return output;
  }

  reset(): void {
    this.buffer.forEach(b => b.fill(0));
    this.outputBuffer.forEach(b => b.fill(0));
    this.position = 0;
  }
}

export class DynamicEQProcessor implements DSPProcessor {
  private bands: BiquadFilter[] = [];
  private envelopes: EnvelopeFollower[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 4; i++) {
      this.bands.push(new BiquadFilter());
      this.envelopes.push(new EnvelopeFollower(10, 100, 44100));
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const frequencies = [
      (params.freq1 as number) ?? 200,
      (params.freq2 as number) ?? 1000,
      (params.freq3 as number) ?? 4000,
      (params.freq4 as number) ?? 10000,
    ];
    const thresholds = [
      dbToLinear((params.thresh1 as number) ?? -20),
      dbToLinear((params.thresh2 as number) ?? -20),
      dbToLinear((params.thresh3 as number) ?? -20),
      dbToLinear((params.thresh4 as number) ?? -20),
    ];
    const gains = [
      (params.gain1 as number) ?? -6,
      (params.gain2 as number) ?? -6,
      (params.gain3 as number) ?? -6,
      (params.gain4 as number) ?? -6,
    ];
    const q = (params.q as number) ?? 2;

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      const mono = (sampleL + sampleR) * 0.5;
      
      for (let b = 0; b < 4; b++) {
        const level = this.envelopes[b].process(mono);
        const dynamicGain = level > thresholds[b] 
          ? gains[b] * Math.min(1, (level - thresholds[b]) / thresholds[b])
          : 0;
        
        this.bands[b].setPeaking(frequencies[b], q, dynamicGain, this.sampleRate);
        sampleL = this.bands[b].process(sampleL);
        sampleR = this.bands[b].process(sampleR);
      }
      
      output.samples[0][i] = sampleL;
      output.samples[1][i] = sampleR;
    }
    
    return output;
  }

  reset(): void {
    this.bands.forEach(b => b.clear());
    this.envelopes.forEach(e => e.clear());
  }
}

export class SurgicalEQProcessor implements DSPProcessor {
  private bands: BiquadFilter[] = [];
  private sampleRate: number = 44100;

  constructor() {
    for (let i = 0; i < 8; i++) {
      this.bands.push(new BiquadFilter());
    }
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const configs = [];
    for (let i = 1; i <= 8; i++) {
      configs.push({
        freq: (params[`freq${i}`] as number) ?? 1000,
        gain: (params[`gain${i}`] as number) ?? 0,
        q: (params[`q${i}`] as number) ?? 10,
        enabled: (params[`enabled${i}`] as boolean) ?? (i <= 4),
      });
    }

    for (let b = 0; b < 8; b++) {
      if (configs[b].enabled) {
        this.bands[b].setPeaking(configs[b].freq, configs[b].q, configs[b].gain, this.sampleRate);
      }
    }

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      for (let b = 0; b < 8; b++) {
        if (configs[b].enabled && configs[b].gain !== 0) {
          sampleL = this.bands[b].process(sampleL);
          sampleR = this.bands[b].process(sampleR);
        }
      }
      
      output.samples[0][i] = sampleL;
      output.samples[1][i] = sampleR;
    }
    
    return output;
  }

  reset(): void {
    this.bands.forEach(b => b.clear());
  }
}

export class AnalogEQProcessor implements DSPProcessor {
  private lowShelf: BiquadFilter;
  private lowMid: BiquadFilter;
  private highMid: BiquadFilter;
  private highShelf: BiquadFilter;
  private satL: number = 0;
  private satR: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelf = new BiquadFilter();
    this.lowMid = new BiquadFilter();
    this.highMid = new BiquadFilter();
    this.highShelf = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const lowGain = (params.low as number) ?? 0;
    const lowFreq = (params.lowFreq as number) ?? 80;
    const lowMidGain = (params.lowMid as number) ?? 0;
    const lowMidFreq = (params.lowMidFreq as number) ?? 400;
    const highMidGain = (params.highMid as number) ?? 0;
    const highMidFreq = (params.highMidFreq as number) ?? 2500;
    const highGain = (params.high as number) ?? 0;
    const highFreq = (params.highFreq as number) ?? 10000;
    const drive = (params.drive as number) ?? 0.3;

    this.lowShelf.setLowShelf(lowFreq, lowGain, this.sampleRate);
    this.lowMid.setPeaking(lowMidFreq, 0.7, lowMidGain, this.sampleRate);
    this.highMid.setPeaking(highMidFreq, 0.7, highMidGain, this.sampleRate);
    this.highShelf.setHighShelf(highFreq, highGain, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      sampleL = this.lowMid.process(sampleL);
      sampleR = this.lowMid.process(sampleR);
      sampleL = this.highMid.process(sampleL);
      sampleR = this.highMid.process(sampleR);
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      
      if (drive > 0) {
        sampleL = Math.tanh(sampleL * (1 + drive)) / (1 + drive * 0.5);
        sampleR = Math.tanh(sampleR * (1 + drive)) / (1 + drive * 0.5);
        
        sampleL += sampleL * sampleL * drive * 0.02;
        sampleR += sampleR * sampleR * drive * 0.02;
      }
      
      output.samples[0][i] = sampleL;
      output.samples[1][i] = sampleR;
    }
    
    return output;
  }

  reset(): void {
    this.lowShelf.clear();
    this.lowMid.clear();
    this.highMid.clear();
    this.highShelf.clear();
  }
}

export class MasteringEQProcessor implements DSPProcessor {
  private lowShelf: BiquadFilter;
  private lowMid: BiquadFilter;
  private mid: BiquadFilter;
  private highMid: BiquadFilter;
  private highShelf: BiquadFilter;
  private air: BiquadFilter;
  private hpFilter: BiquadFilter;
  private lpFilter: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelf = new BiquadFilter();
    this.lowMid = new BiquadFilter();
    this.mid = new BiquadFilter();
    this.highMid = new BiquadFilter();
    this.highShelf = new BiquadFilter();
    this.air = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.lpFilter = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const hpFreq = (params.hpFreq as number) ?? 20;
    const lpFreq = (params.lpFreq as number) ?? 20000;
    const lowGain = (params.low as number) ?? 0;
    const lowMidGain = (params.lowMid as number) ?? 0;
    const midGain = (params.mid as number) ?? 0;
    const highMidGain = (params.highMid as number) ?? 0;
    const highGain = (params.high as number) ?? 0;
    const airGain = (params.air as number) ?? 0;
    const outputLevel = (params.output as number) ?? 0;

    this.hpFilter.setHighpass(hpFreq, 0.707, this.sampleRate);
    this.lpFilter.setLowpass(lpFreq, 0.707, this.sampleRate);
    this.lowShelf.setLowShelf(80, lowGain, this.sampleRate);
    this.lowMid.setPeaking(250, 0.7, lowMidGain, this.sampleRate);
    this.mid.setPeaking(1000, 0.7, midGain, this.sampleRate);
    this.highMid.setPeaking(4000, 0.7, highMidGain, this.sampleRate);
    this.highShelf.setHighShelf(8000, highGain, this.sampleRate);
    this.air.setHighShelf(16000, airGain, this.sampleRate);

    const outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      sampleL = this.lowMid.process(sampleL);
      sampleR = this.lowMid.process(sampleR);
      sampleL = this.mid.process(sampleL);
      sampleR = this.mid.process(sampleR);
      sampleL = this.highMid.process(sampleL);
      sampleR = this.highMid.process(sampleR);
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      sampleL = this.air.process(sampleL);
      sampleR = this.air.process(sampleR);
      
      output.samples[0][i] = sampleL * outGain;
      output.samples[1][i] = sampleR * outGain;
    }
    
    return output;
  }

  reset(): void {
    this.lowShelf.clear();
    this.lowMid.clear();
    this.mid.clear();
    this.highMid.clear();
    this.highShelf.clear();
    this.air.clear();
    this.hpFilter.clear();
    this.lpFilter.clear();
  }
}

export class MidSideEQProcessor implements DSPProcessor {
  private midLow: BiquadFilter;
  private midMid: BiquadFilter;
  private midHigh: BiquadFilter;
  private sideLow: BiquadFilter;
  private sideMid: BiquadFilter;
  private sideHigh: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.midLow = new BiquadFilter();
    this.midMid = new BiquadFilter();
    this.midHigh = new BiquadFilter();
    this.sideLow = new BiquadFilter();
    this.sideMid = new BiquadFilter();
    this.sideHigh = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const midLowGain = (params.midLow as number) ?? 0;
    const midMidGain = (params.midMid as number) ?? 0;
    const midHighGain = (params.midHigh as number) ?? 0;
    const sideLowGain = (params.sideLow as number) ?? 0;
    const sideMidGain = (params.sideMid as number) ?? 0;
    const sideHighGain = (params.sideHigh as number) ?? 0;
    const width = (params.width as number) ?? 1;

    this.midLow.setLowShelf(150, midLowGain, this.sampleRate);
    this.midMid.setPeaking(1000, 1, midMidGain, this.sampleRate);
    this.midHigh.setHighShelf(6000, midHighGain, this.sampleRate);
    this.sideLow.setLowShelf(150, sideLowGain, this.sampleRate);
    this.sideMid.setPeaking(1000, 1, sideMidGain, this.sampleRate);
    this.sideHigh.setHighShelf(6000, sideHighGain, this.sampleRate);

    for (let i = 0; i < input.samples[0].length; i++) {
      const left = input.samples[0][i];
      const right = input.samples[1][i];
      
      let mid = (left + right) * 0.5;
      let side = (left - right) * 0.5;
      
      mid = this.midLow.process(mid);
      mid = this.midMid.process(mid);
      mid = this.midHigh.process(mid);
      
      side = this.sideLow.process(side);
      side = this.sideMid.process(side);
      side = this.sideHigh.process(side);
      
      side *= width;
      
      output.samples[0][i] = mid + side;
      output.samples[1][i] = mid - side;
    }
    
    return output;
  }

  reset(): void {
    this.midLow.clear();
    this.midMid.clear();
    this.midHigh.clear();
    this.sideLow.clear();
    this.sideMid.clear();
    this.sideHigh.clear();
  }
}

export class TiltEQProcessor implements DSPProcessor {
  private lowShelf: BiquadFilter;
  private highShelf: BiquadFilter;
  private sampleRate: number = 44100;

  constructor() {
    this.lowShelf = new BiquadFilter();
    this.highShelf = new BiquadFilter();
  }

  process(input: AudioBuffer, params: Record<string, number | boolean | string>, context: DSPContext): AudioBuffer {
    const output = copyBuffer(input);
    this.sampleRate = input.sampleRate;
    
    const tilt = (params.tilt as number) ?? 0;
    const centerFreq = (params.centerFreq as number) ?? 1000;
    const outputLevel = (params.output as number) ?? 0;

    const lowGain = -tilt;
    const highGain = tilt;

    this.lowShelf.setLowShelf(centerFreq * 0.5, lowGain, this.sampleRate);
    this.highShelf.setHighShelf(centerFreq * 2, highGain, this.sampleRate);

    const outGain = dbToLinear(outputLevel);

    for (let i = 0; i < input.samples[0].length; i++) {
      let sampleL = input.samples[0][i];
      let sampleR = input.samples[1][i];
      
      sampleL = this.lowShelf.process(sampleL);
      sampleR = this.lowShelf.process(sampleR);
      sampleL = this.highShelf.process(sampleL);
      sampleR = this.highShelf.process(sampleR);
      
      output.samples[0][i] = sampleL * outGain;
      output.samples[1][i] = sampleR * outGain;
    }
    
    return output;
  }

  reset(): void {
    this.lowShelf.clear();
    this.highShelf.clear();
  }
}

export const EQ_PROCESSORS: Record<string, () => DSPProcessor> = {
  'mb-parametric-eq': () => new ParametricEQProcessor(),
  'mb-graphic-eq': () => new GraphicEQProcessor(),
  'mb-vintage-eq': () => new VintageEQProcessor(),
  'mb-linear-phase-eq': () => new LinearPhaseEQProcessor(),
  'mb-dynamic-eq': () => new DynamicEQProcessor(),
  'mb-surgical-eq': () => new SurgicalEQProcessor(),
  'mb-analog-eq': () => new AnalogEQProcessor(),
  'mb-mastering-eq': () => new MasteringEQProcessor(),
  'mb-mid-side-eq': () => new MidSideEQProcessor(),
  'mb-tilt-eq': () => new TiltEQProcessor(),
};
