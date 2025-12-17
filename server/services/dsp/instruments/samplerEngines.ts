import {
  AudioBuffer, DSPContext, createBuffer,
  BiquadFilter, OnePoleFilter, DelayLine, AllPassFilter,
  LFO, Oscillator, ADSR, EnvelopeFollower,
  msToSamples, dbToLinear, clamp, softClip, hardClip
} from '../core';

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: DSPContext): void;
  noteOff(context: DSPContext): void;
  render(numSamples: number, context: DSPContext): AudioBuffer;
  isActive(): boolean;
  reset(): void;
}

class SampleBuffer {
  private buffer: Float32Array;
  private sampleRate: number;
  private length: number;

  constructor(length: number, sampleRate: number = 44100) {
    this.buffer = new Float32Array(length);
    this.sampleRate = sampleRate;
    this.length = length;
  }

  generate(generator: (phase: number, sampleRate: number) => number): void {
    for (let i = 0; i < this.length; i++) {
      const phase = i / this.length;
      this.buffer[i] = generator(phase, this.sampleRate);
    }
  }

  generateSineWave(frequency: number, harmonics: number[] = [1]): void {
    this.generate((phase, sr) => {
      let value = 0;
      for (let h = 0; h < harmonics.length; h++) {
        value += Math.sin(2 * Math.PI * frequency * (h + 1) * phase * this.length / sr) * harmonics[h];
      }
      return value;
    });
  }

  generateNoise(): void {
    for (let i = 0; i < this.length; i++) {
      this.buffer[i] = Math.random() * 2 - 1;
    }
  }

  generatePiano(frequency: number): void {
    const decay = 4;
    for (let i = 0; i < this.length; i++) {
      const t = i / this.sampleRate;
      const env = Math.exp(-t * decay);
      let value = 0;
      for (let h = 1; h <= 8; h++) {
        const harmEnv = Math.exp(-t * decay * h * 0.5);
        value += Math.sin(2 * Math.PI * frequency * h * t) * harmEnv / h;
      }
      this.buffer[i] = value * env;
    }
  }

  generateOrgan(frequency: number): void {
    const drawbars = [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1];
    for (let i = 0; i < this.length; i++) {
      const t = i / this.sampleRate;
      let value = 0;
      for (let d = 0; d < drawbars.length; d++) {
        const harmonic = d === 0 ? 0.5 : d;
        value += Math.sin(2 * Math.PI * frequency * harmonic * t) * drawbars[d];
      }
      this.buffer[i] = value / 4;
    }
  }

  generateVoice(frequency: number): void {
    for (let i = 0; i < this.length; i++) {
      const t = i / this.sampleRate;
      const fundamental = Math.sin(2 * Math.PI * frequency * t);
      const formant1 = Math.sin(2 * Math.PI * 800 * t) * 0.3;
      const formant2 = Math.sin(2 * Math.PI * 1200 * t) * 0.2;
      const formant3 = Math.sin(2 * Math.PI * 2500 * t) * 0.1;
      this.buffer[i] = fundamental * 0.5 + formant1 + formant2 + formant3;
    }
  }

  read(position: number): number {
    if (position < 0 || position >= this.length) return 0;
    return this.buffer[Math.floor(position)];
  }

  readInterpolated(position: number): number {
    if (position < 0 || position >= this.length - 1) return 0;
    const idx = Math.floor(position);
    const frac = position - idx;
    return this.buffer[idx] * (1 - frac) + this.buffer[idx + 1] * frac;
  }

  getLength(): number {
    return this.length;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  setFromArray(data: Float32Array): void {
    const copyLength = Math.min(data.length, this.length);
    for (let i = 0; i < copyLength; i++) {
      this.buffer[i] = data[i];
    }
  }
}

class SamplePlayer {
  private sample: SampleBuffer;
  private position: number = 0;
  private playbackRate: number = 1;
  private playing: boolean = false;
  private loopStart: number = 0;
  private loopEnd: number = 0;
  private looping: boolean = false;

  constructor(sample: SampleBuffer) {
    this.sample = sample;
    this.loopEnd = sample.getLength();
  }

  trigger(playbackRate: number = 1): void {
    this.position = 0;
    this.playbackRate = playbackRate;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
  }

  setLoopPoints(start: number, end: number): void {
    this.loopStart = start;
    this.loopEnd = Math.min(end, this.sample.getLength());
    this.looping = true;
  }

  disableLoop(): void {
    this.looping = false;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  process(): number {
    if (!this.playing) return 0;

    const sample = this.sample.readInterpolated(this.position);
    this.position += this.playbackRate;

    if (this.looping) {
      if (this.position >= this.loopEnd) {
        this.position = this.loopStart + (this.position - this.loopEnd);
      }
    } else {
      if (this.position >= this.sample.getLength()) {
        this.playing = false;
        return 0;
      }
    }

    return sample;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getPosition(): number {
    return this.position;
  }

  setPosition(pos: number): void {
    this.position = clamp(pos, 0, this.sample.getLength() - 1);
  }
}

export class BasicSamplerSynth implements SynthesizerEngine {
  private sample: SampleBuffer;
  private player: SamplePlayer;
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private baseFrequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.sample = new SampleBuffer(44100 * 2, 44100);
    this.sample.generatePiano(440);
    this.player = new SamplePlayer(this.sample);
    
    this.envelope = new ADSR(0.005, 0.3, 0.7, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.baseFrequency = 440;
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const playbackRate = frequency / this.baseFrequency;
    this.player.trigger(playbackRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000 + this.velocity * 5000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.003, 0.28, 0.68, 0.38, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      let sample = this.player.process();

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive() && this.player.isPlaying();
  }

  reset(): void {
    this.player.stop();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class MultisampleSynth implements SynthesizerEngine {
  private samples: { sample: SampleBuffer, player: SamplePlayer, baseFreq: number, minVel: number, maxVel: number }[] = [];
  private activePlayer: SamplePlayer | null = null;
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    const velocityLayers = [
      { minVel: 0, maxVel: 0.33, decay: 6, brightness: 0.5 },
      { minVel: 0.33, maxVel: 0.66, decay: 4, brightness: 0.7 },
      { minVel: 0.66, maxVel: 1.0, decay: 2, brightness: 1.0 }
    ];

    const frequencies = [220, 440, 880];

    for (const freq of frequencies) {
      for (const layer of velocityLayers) {
        const sample = new SampleBuffer(44100 * 3, 44100);
        for (let i = 0; i < sample.getLength(); i++) {
          const t = i / 44100;
          const env = Math.exp(-t * layer.decay);
          let value = 0;
          const numHarmonics = Math.floor(8 * layer.brightness);
          for (let h = 1; h <= numHarmonics; h++) {
            const harmEnv = Math.exp(-t * layer.decay * h * 0.4);
            value += Math.sin(2 * Math.PI * freq * h * t) * harmEnv / h;
          }
          (sample as any).buffer[i] = value * env;
        }
        
        this.samples.push({
          sample,
          player: new SamplePlayer(sample),
          baseFreq: freq,
          minVel: layer.minVel,
          maxVel: layer.maxVel
        });
      }
    }

    this.envelope = new ADSR(0.005, 0.4, 0.6, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    let bestSample = this.samples[0];
    let bestDistance = Infinity;

    for (const s of this.samples) {
      if (this.velocity >= s.minVel && this.velocity < s.maxVel) {
        const freqDistance = Math.abs(Math.log2(frequency / s.baseFreq));
        if (freqDistance < bestDistance) {
          bestDistance = freqDistance;
          bestSample = s;
        }
      }
    }

    const playbackRate = frequency / bestSample.baseFreq;
    bestSample.player.trigger(playbackRate);
    this.activePlayer = bestSample.player;

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(4000 + this.velocity * 6000, 0.9, context.sampleRate);

    this.envelope = new ADSR(0.003, 0.38, 0.58, 0.48, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      let sample = this.activePlayer ? this.activePlayer.process() : 0;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.samples.forEach(s => s.player.stop());
    this.activePlayer = null;
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class GranularSamplerSynth implements SynthesizerEngine {
  private sample: SampleBuffer;
  private grains: { position: number, phase: number, amp: number, rate: number, pan: number }[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private positionLFO: LFO;
  private densityLFO: LFO;
  private frequency: number = 440;
  private baseFrequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private grainSize: number = 2000;
  private grainDensity: number = 8;
  private grainCounter: number = 0;
  private scanPosition: number = 0;

  constructor() {
    this.sample = new SampleBuffer(44100 * 4, 44100);
    for (let i = 0; i < this.sample.getLength(); i++) {
      const t = i / 44100;
      let value = 0;
      for (let h = 1; h <= 16; h++) {
        const env = Math.exp(-t * 0.5 * h * 0.3);
        value += Math.sin(2 * Math.PI * 440 * h * t) * env / h;
      }
      (this.sample as any).buffer[i] = value * 0.5;
    }

    for (let i = 0; i < 12; i++) {
      this.grains.push({ position: 0, phase: 0, amp: 0, rate: 1, pan: 0 });
    }

    this.envelope = new ADSR(0.1, 0.4, 0.8, 0.6, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.positionLFO = new LFO();
    this.densityLFO = new LFO();
    this.baseFrequency = 440;
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.grainCounter = 0;
    this.scanPosition = 0;
    this.grainSize = Math.floor(context.sampleRate / 15);

    const playbackRate = frequency / this.baseFrequency;
    for (const grain of this.grains) {
      grain.position = 0;
      grain.phase = 0;
      grain.amp = 0;
      grain.rate = playbackRate * (0.95 + Math.random() * 0.1);
      grain.pan = (Math.random() * 2 - 1) * 0.6;
    }

    this.positionLFO.setFrequency(0.08, context.sampleRate);
    this.densityLFO.setFrequency(0.12, context.sampleRate);

    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000 + this.velocity * 4000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.09, 0.38, 0.78, 0.58, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const positionMod = (this.positionLFO.sine() + 1) * 0.5;
      const densityMod = 1 + this.densityLFO.sine() * 0.3;

      this.scanPosition += 0.5;
      if (this.scanPosition >= this.sample.getLength() * 0.8) {
        this.scanPosition = 0;
      }

      this.grainCounter++;
      const triggerInterval = Math.floor(this.grainSize / (this.grainDensity * densityMod));

      if (this.grainCounter >= triggerInterval) {
        this.grainCounter = 0;
        for (const grain of this.grains) {
          if (grain.amp <= 0.01) {
            grain.position = this.scanPosition + positionMod * this.sample.getLength() * 0.3;
            grain.position = grain.position % this.sample.getLength();
            grain.phase = 0;
            grain.amp = 0.7 + Math.random() * 0.3;
            grain.pan = (Math.random() * 2 - 1) * 0.6;
            break;
          }
        }
      }

      let sampleL = 0;
      let sampleR = 0;

      for (const grain of this.grains) {
        if (grain.amp > 0.001) {
          const grainEnv = Math.sin(grain.phase * Math.PI);
          const sampleValue = this.sample.readInterpolated(grain.position) * grain.amp * grainEnv;

          sampleL += sampleValue * (1 - grain.pan * 0.5);
          sampleR += sampleValue * (1 + grain.pan * 0.5);

          grain.position += grain.rate;
          if (grain.position >= this.sample.getLength()) {
            grain.position -= this.sample.getLength();
          }

          grain.phase += 1 / this.grainSize;
          if (grain.phase >= 1) {
            grain.amp = 0;
            grain.phase = 0;
          }
        }
      }

      sampleL /= 4;
      sampleR /= 4;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.grains.forEach(g => {
      g.position = 0;
      g.phase = 0;
      g.amp = 0;
    });
    this.grainCounter = 0;
    this.scanPosition = 0;
    this.positionLFO.reset();
    this.densityLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class StretchSamplerSynth implements SynthesizerEngine {
  private sample: SampleBuffer;
  private grains: { position: number, phase: number }[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private baseFrequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private stretchFactor: number = 1;
  private readPosition: number = 0;
  private grainSize: number = 1024;
  private hopSize: number = 256;
  private currentGrain: number = 0;

  constructor() {
    this.sample = new SampleBuffer(44100 * 3, 44100);
    this.sample.generatePiano(440);

    for (let i = 0; i < 4; i++) {
      this.grains.push({ position: i * this.hopSize, phase: i * 0.25 });
    }

    this.envelope = new ADSR(0.02, 0.3, 0.8, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.baseFrequency = 440;
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;
    this.readPosition = 0;
    this.currentGrain = 0;

    this.stretchFactor = 1.5;
    this.grainSize = Math.floor(context.sampleRate / 20);
    this.hopSize = Math.floor(this.grainSize / 4);

    for (let i = 0; i < 4; i++) {
      this.grains[i].position = i * this.hopSize;
      this.grains[i].phase = i * 0.25;
    }

    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000 + this.velocity * 4000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.28, 0.78, 0.48, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);
    const pitchRatio = this.frequency / this.baseFrequency;

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      let sample = 0;

      for (const grain of this.grains) {
        if (grain.position >= 0 && grain.position < this.sample.getLength()) {
          const grainEnv = 0.5 * (1 - Math.cos(2 * Math.PI * grain.phase));
          const sampleValue = this.sample.readInterpolated(grain.position);
          sample += sampleValue * grainEnv;
        }

        grain.position += pitchRatio;
        grain.phase += 1 / this.grainSize;

        if (grain.phase >= 1) {
          grain.phase = 0;
          this.readPosition += this.hopSize / this.stretchFactor;
          grain.position = this.readPosition;
        }
      }

      sample /= 2;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.readPosition = 0;
    for (const grain of this.grains) {
      grain.position = 0;
      grain.phase = 0;
    }
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class SlicerSynth implements SynthesizerEngine {
  private samples: SampleBuffer[] = [];
  private currentSlice: number = 0;
  private player: SamplePlayer;
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private numSlices: number = 16;

  constructor() {
    const sliceLength = Math.floor(44100 * 0.25);
    
    for (let s = 0; s < this.numSlices; s++) {
      const sample = new SampleBuffer(sliceLength, 44100);
      const freq = 100 + s * 50;
      
      for (let i = 0; i < sliceLength; i++) {
        const t = i / 44100;
        const env = Math.exp(-t * 8);
        let value = 0;
        if (s % 4 === 0) {
          value = Math.sin(2 * Math.PI * freq * 0.5 * t) * env;
        } else if (s % 4 === 2) {
          value = (Math.random() * 2 - 1) * env * 0.5;
        } else {
          value = Math.sin(2 * Math.PI * freq * t) * env;
        }
        (sample as any).buffer[i] = value;
      }
      this.samples.push(sample);
    }

    this.player = new SamplePlayer(this.samples[0]);
    this.envelope = new ADSR(0.001, 0.15, 0.5, 0.1, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const baseNote = 60;
    const midiNote = Math.round(12 * Math.log2(frequency / 261.63) + 60);
    this.currentSlice = clamp(midiNote - baseNote, 0, this.numSlices - 1);

    this.player = new SamplePlayer(this.samples[this.currentSlice]);
    const playbackRate = frequency / (100 + this.currentSlice * 50);
    this.player.trigger(clamp(playbackRate, 0.5, 2));

    this.hpFilter.setHighpass(30, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(8000 + this.velocity * 4000, 1.2, context.sampleRate);

    this.envelope = new ADSR(0.001, 0.13, 0.48, 0.08, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      let sample = this.player.process();

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample * 1.2, 0.9);
      output.samples[1][i] = softClip(sample * 1.2, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.player.stop();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class ROMplerSynth implements SynthesizerEngine {
  private samples: { sample: SampleBuffer, player: SamplePlayer, name: string, baseFreq: number }[] = [];
  private activePlayer: SamplePlayer | null = null;
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private chorusDelay: DelayLine;
  private chorusLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    const sampleConfigs = [
      { name: 'piano', freq: 440, type: 'piano' },
      { name: 'strings', freq: 440, type: 'strings' },
      { name: 'brass', freq: 220, type: 'brass' },
      { name: 'choir', freq: 440, type: 'choir' }
    ];

    for (const config of sampleConfigs) {
      const sample = new SampleBuffer(44100 * 3, 44100);
      
      for (let i = 0; i < sample.getLength(); i++) {
        const t = i / 44100;
        let value = 0;
        
        switch (config.type) {
          case 'piano':
            const pianoEnv = Math.exp(-t * 3);
            for (let h = 1; h <= 10; h++) {
              value += Math.sin(2 * Math.PI * config.freq * h * t) * Math.exp(-t * h * 0.5) / h;
            }
            value *= pianoEnv;
            break;
            
          case 'strings':
            const stringsEnv = Math.min(t * 3, 1) * Math.exp(-Math.max(0, t - 2) * 0.5);
            for (let h = 1; h <= 8; h++) {
              const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 0.003;
              value += Math.sin(2 * Math.PI * config.freq * h * (1 + vibrato) * t) / h;
            }
            value *= stringsEnv * 0.5;
            break;
            
          case 'brass':
            const brassEnv = Math.min(t * 10, 1) * Math.exp(-Math.max(0, t - 1.5) * 0.8);
            const brassFilter = 0.5 + 0.5 * Math.min(t * 4, 1);
            for (let h = 1; h <= 12; h++) {
              const hAmp = brassFilter > h * 0.1 ? 1 / h : 0;
              value += Math.sin(2 * Math.PI * config.freq * h * t) * hAmp;
            }
            value *= brassEnv * 0.4;
            break;
            
          case 'choir':
            const choirEnv = Math.min(t * 2, 1) * Math.exp(-Math.max(0, t - 2) * 0.3);
            const formants = [800, 1200, 2500];
            for (let f = 0; f < formants.length; f++) {
              value += Math.sin(2 * Math.PI * config.freq * t) * 
                       Math.sin(2 * Math.PI * formants[f] * t) * 0.3;
            }
            value *= choirEnv;
            break;
        }
        
        (sample as any).buffer[i] = value;
      }

      this.samples.push({
        sample,
        player: new SamplePlayer(sample),
        name: config.name,
        baseFreq: config.freq
      });
    }

    this.envelope = new ADSR(0.02, 0.3, 0.75, 0.4, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.chorusDelay = new DelayLine(2205);
    this.chorusLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const selectedSample = this.samples[0];
    const playbackRate = frequency / selectedSample.baseFreq;
    selectedSample.player.trigger(playbackRate);
    this.activePlayer = selectedSample.player;

    this.chorusLFO.setFrequency(0.5, context.sampleRate);
    this.hpFilter.setHighpass(50, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000 + this.velocity * 4000, 0.9, context.sampleRate);

    this.envelope = new ADSR(0.018, 0.28, 0.73, 0.38, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const chorusMod = this.chorusLFO.sine();
      
      let sample = this.activePlayer ? this.activePlayer.process() : 0;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);

      this.chorusDelay.write(sample);
      const delayTime = 300 + chorusMod * 100;
      const chorusSample = this.chorusDelay.readInterpolated(delayTime) * 0.2;

      const sampleL = sample * 0.8 + chorusSample;
      const sampleR = sample * 0.8 - chorusSample;

      output.samples[0][i] = softClip(sampleL * envValue * this.velocity, 0.9);
      output.samples[1][i] = softClip(sampleR * envValue * this.velocity, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.samples.forEach(s => s.player.stop());
    this.activePlayer = null;
    this.chorusDelay.clear();
    this.chorusLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class LooperSynth implements SynthesizerEngine {
  private loopBuffer: SampleBuffer;
  private player: SamplePlayer;
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private feedbackDelay: DelayLine;
  private frequency: number = 440;
  private baseFrequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private loopLength: number = 44100;

  constructor() {
    this.loopLength = 44100 * 2;
    this.loopBuffer = new SampleBuffer(this.loopLength, 44100);
    
    for (let i = 0; i < this.loopLength; i++) {
      const t = i / 44100;
      const loopPhase = (i / this.loopLength) * 2 * Math.PI;
      let value = 0;
      
      value += Math.sin(2 * Math.PI * 440 * t) * 0.3;
      value += Math.sin(2 * Math.PI * 880 * t) * 0.15 * Math.sin(loopPhase * 2);
      value += Math.sin(2 * Math.PI * 660 * t) * 0.1 * Math.sin(loopPhase * 3);
      
      (this.loopBuffer as any).buffer[i] = value;
    }

    this.player = new SamplePlayer(this.loopBuffer);
    this.player.setLoopPoints(0, this.loopLength);
    
    this.envelope = new ADSR(0.1, 0.2, 0.9, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.feedbackDelay = new DelayLine(22050);
    this.baseFrequency = 440;
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const playbackRate = frequency / this.baseFrequency;
    this.player.trigger(playbackRate);

    this.hpFilter.setHighpass(40, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000 + this.velocity * 4000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.09, 0.18, 0.88, 0.48, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      let sample = this.player.process();

      const delayed = this.feedbackDelay.read(11025);
      this.feedbackDelay.write(sample + delayed * 0.3);

      sample = sample * 0.8 + delayed * 0.2;

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.player.stop();
    this.feedbackDelay.clear();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class TextureSamplerSynth implements SynthesizerEngine {
  private samples: SampleBuffer[] = [];
  private players: SamplePlayer[] = [];
  private envelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private reverbDelay1: DelayLine;
  private reverbDelay2: DelayLine;
  private panLFO: LFO;
  private textureLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    for (let t = 0; t < 4; t++) {
      const sample = new SampleBuffer(44100 * 4, 44100);
      
      for (let i = 0; i < sample.getLength(); i++) {
        const rand1 = Math.random() * 2 - 1;
        const rand2 = Math.random() * 2 - 1;
        const filtered = rand1 * 0.3 + rand2 * 0.7;
        const shaped = Math.tanh(filtered * 2) * 0.5;
        (sample as any).buffer[i] = shaped;
      }
      
      this.samples.push(sample);
      const player = new SamplePlayer(sample);
      player.setLoopPoints(1000, sample.getLength() - 1000);
      this.players.push(player);
    }

    this.envelope = new ADSR(0.5, 0.8, 0.85, 1.0, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.reverbDelay1 = new DelayLine(22050);
    this.reverbDelay2 = new DelayLine(22050);
    this.panLFO = new LFO();
    this.textureLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < 4; i++) {
      const playbackRate = 0.5 + (frequency / 440) * 0.5 + i * 0.1;
      this.players[i].trigger(playbackRate);
    }

    this.panLFO.setFrequency(0.1, context.sampleRate);
    this.textureLFO.setFrequency(0.05, context.sampleRate);

    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(3000 + this.velocity * 2000, 0.6, context.sampleRate);

    this.envelope = new ADSR(0.48, 0.78, 0.83, 0.98, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const panMod = this.panLFO.sine();
      const textureMod = (this.textureLFO.sine() + 1) * 0.5;

      let sampleL = 0;
      let sampleR = 0;

      for (let p = 0; p < 4; p++) {
        const textureSample = this.players[p].process();
        const pan = (p - 1.5) / 2 + panMod * 0.2;
        const amp = 0.5 + textureMod * 0.3 * (p % 2 === 0 ? 1 : -1);
        
        sampleL += textureSample * (1 - pan * 0.4) * amp;
        sampleR += textureSample * (1 + pan * 0.4) * amp;
      }

      sampleL /= 4;
      sampleR /= 4;

      this.reverbDelay1.write(sampleL);
      this.reverbDelay2.write(sampleR);
      
      const reverb1 = this.reverbDelay1.readInterpolated(15000) * 0.3;
      const reverb2 = this.reverbDelay2.readInterpolated(17000) * 0.3;
      
      sampleL += reverb1 + reverb2 * 0.5;
      sampleR += reverb2 + reverb1 * 0.5;

      sampleL = this.hpFilter.process(sampleL);
      sampleR = this.hpFilter.process(sampleR);
      sampleL = this.lpFilter.process(sampleL);
      sampleR = this.lpFilter.process(sampleR);

      sampleL *= envValue * this.velocity;
      sampleR *= envValue * this.velocity;

      output.samples[0][i] = softClip(sampleL, 0.9);
      output.samples[1][i] = softClip(sampleR, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.players.forEach(p => p.stop());
    this.reverbDelay1.clear();
    this.reverbDelay2.clear();
    this.panLFO.reset();
    this.textureLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class ResynthesisSynth implements SynthesizerEngine {
  private harmonicAmplitudes: number[] = [];
  private harmonicPhases: number[] = [];
  private envelope: ADSR;
  private filterEnvelope: ADSR;
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private spectralLFO: LFO;
  private frequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;
  private numHarmonics: number = 32;

  constructor() {
    for (let i = 0; i < this.numHarmonics; i++) {
      this.harmonicAmplitudes.push(1 / (i + 1));
      this.harmonicPhases.push(0);
    }

    this.envelope = new ADSR(0.05, 0.3, 0.75, 0.4, 44100);
    this.filterEnvelope = new ADSR(0.08, 0.4, 0.5, 0.35, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.spectralLFO = new LFO();
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    for (let i = 0; i < this.numHarmonics; i++) {
      this.harmonicPhases[i] = 0;
      this.harmonicAmplitudes[i] = Math.pow(0.8, i) * (1 + Math.sin(i * 0.5) * 0.3);
    }

    this.spectralLFO.setFrequency(0.2, context.sampleRate);
    this.hpFilter.setHighpass(60, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(5000, 1.0, context.sampleRate);

    this.envelope = new ADSR(0.045, 0.28, 0.73, 0.38, context.sampleRate);
    this.filterEnvelope = new ADSR(0.075, 0.38, 0.48, 0.33, context.sampleRate);
    this.envelope.trigger();
    this.filterEnvelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
    this.filterEnvelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const filterEnvValue = this.filterEnvelope.process();
      const spectralMod = this.spectralLFO.sine();

      let sample = 0;

      for (let h = 0; h < this.numHarmonics; h++) {
        const harmonicFreq = this.frequency * (h + 1);
        if (harmonicFreq > this.sampleRate * 0.45) break;

        const ampMod = 1 + spectralMod * 0.2 * Math.sin(h * 0.3);
        const amp = this.harmonicAmplitudes[h] * ampMod;
        
        sample += Math.sin(this.harmonicPhases[h]) * amp;
        
        this.harmonicPhases[h] += (2 * Math.PI * harmonicFreq) / this.sampleRate;
        if (this.harmonicPhases[h] > 2 * Math.PI) {
          this.harmonicPhases[h] -= 2 * Math.PI;
        }
      }

      sample /= 4;

      const filterFreq = 1500 + filterEnvValue * 4000 + this.velocity * 2000;
      this.lpFilter.setLowpass(clamp(filterFreq, 200, 12000), 1.2, this.sampleRate);

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.9);
      output.samples[1][i] = softClip(sample, 0.9);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    for (let i = 0; i < this.numHarmonics; i++) {
      this.harmonicPhases[i] = 0;
    }
    this.spectralLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export class VoiceSamplerSynth implements SynthesizerEngine {
  private sample: SampleBuffer;
  private player: SamplePlayer;
  private envelope: ADSR;
  private formantFilters: BiquadFilter[] = [];
  private lpFilter: BiquadFilter;
  private hpFilter: BiquadFilter;
  private vibratoLFO: LFO;
  private formantLFO: LFO;
  private frequency: number = 440;
  private baseFrequency: number = 440;
  private velocity: number = 0;
  private sampleRate: number = 44100;

  constructor() {
    this.sample = new SampleBuffer(44100 * 3, 44100);
    this.sample.generateVoice(440);
    this.player = new SamplePlayer(this.sample);
    this.player.setLoopPoints(5000, this.sample.getLength() - 5000);

    for (let i = 0; i < 5; i++) {
      this.formantFilters.push(new BiquadFilter());
    }

    this.envelope = new ADSR(0.1, 0.3, 0.8, 0.5, 44100);
    this.lpFilter = new BiquadFilter();
    this.hpFilter = new BiquadFilter();
    this.vibratoLFO = new LFO();
    this.formantLFO = new LFO();
    this.baseFrequency = 440;
  }

  noteOn(frequency: number, velocity: number, context: DSPContext): void {
    this.frequency = frequency;
    this.velocity = velocity / 127;
    this.sampleRate = context.sampleRate;

    const playbackRate = frequency / this.baseFrequency;
    this.player.trigger(playbackRate);

    const formantFreqs = [800, 1200, 2500, 3500, 4500];
    const formantQs = [8, 6, 5, 4, 3];
    const formantGains = [5, 3, 2, 1.5, 1];
    for (let i = 0; i < 5; i++) {
      this.formantFilters[i].setPeaking(formantFreqs[i], formantQs[i], formantGains[i], context.sampleRate);
    }

    this.vibratoLFO.setFrequency(5.5, context.sampleRate);
    this.formantLFO.setFrequency(0.15, context.sampleRate);

    this.hpFilter.setHighpass(100, 0.7, context.sampleRate);
    this.lpFilter.setLowpass(6000 + this.velocity * 4000, 0.8, context.sampleRate);

    this.envelope = new ADSR(0.09, 0.28, 0.78, 0.48, context.sampleRate);
    this.envelope.trigger();
  }

  noteOff(context: DSPContext): void {
    this.envelope.release();
  }

  render(numSamples: number, context: DSPContext): AudioBuffer {
    const output = createBuffer(numSamples, 2, context.sampleRate);

    for (let i = 0; i < numSamples; i++) {
      const envValue = this.envelope.process();
      const vibrato = this.vibratoLFO.sine() * 0.003 * envValue;
      const formantMod = this.formantLFO.sine() * 0.1;

      const playbackRate = (this.frequency / this.baseFrequency) * (1 + vibrato);
      this.player.setPlaybackRate(playbackRate);

      let sample = this.player.process();

      for (let f = 0; f < 5; f++) {
        sample = this.formantFilters[f].process(sample);
      }

      sample = this.hpFilter.process(sample);
      sample = this.lpFilter.process(sample);
      sample *= envValue * this.velocity;

      output.samples[0][i] = softClip(sample, 0.88);
      output.samples[1][i] = softClip(sample, 0.88);
    }

    return output;
  }

  isActive(): boolean {
    return this.envelope.isActive();
  }

  reset(): void {
    this.player.stop();
    this.formantFilters.forEach(f => f.clear());
    this.vibratoLFO.reset();
    this.formantLFO.reset();
    this.lpFilter.clear();
    this.hpFilter.clear();
  }
}

export const SAMPLER_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  'basic-sampler': BasicSamplerSynth,
  'multisample': MultisampleSynth,
  'granular-sampler': GranularSamplerSynth,
  'stretch-sampler': StretchSamplerSynth,
  'slicer': SlicerSynth,
  'rompler': ROMplerSynth,
  'looper': LooperSynth,
  'texture-sampler': TextureSamplerSynth,
  'resynthesis': ResynthesisSynth,
  'voice-sampler': VoiceSamplerSynth,
};
