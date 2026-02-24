import { BasePlugin } from './BasePlugin';

class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }

  nextBipolar(): number {
    return this.next() * 2 - 1;
  }

  reset(seed: number): void {
    this.state = seed;
  }
}

function hashTypeSeed(type: string): number {
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = ((hash << 5) - hash + type.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export class ReverbPlugin extends BasePlugin {
  private convolver: ConvolverNode;
  private preDelay: DelayNode;
  private lowFilter: BiquadFilterNode;
  private highFilter: BiquadFilterNode;
  private wetGainControl: GainNode;
  private widthSplitter: ChannelSplitterNode;
  private widthMerger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;
  private sideInvertGain: GainNode;

  private roomSize: number = 0.5;
  private decay: number = 0.5;
  private damping: number = 0.5;
  private preDelayTime: number = 0.02;
  private width: number = 1.0;
  private currentType: 'hall' | 'room' | 'plate' | 'spring' | 'chamber' = 'hall';

  private impulseResponses: Map<string, AudioBuffer> = new Map();
  private prng: SeededPRNG;

  constructor(context: AudioContext) {
    super(context);

    this.prng = new SeededPRNG(42);

    this.convolver = context.createConvolver();
    this.preDelay = context.createDelay(0.5);
    this.lowFilter = context.createBiquadFilter();
    this.highFilter = context.createBiquadFilter();
    this.wetGainControl = context.createGain();

    this.widthSplitter = context.createChannelSplitter(2);
    this.widthMerger = context.createChannelMerger(2);
    this.midGain = context.createGain();
    this.sideGain = context.createGain();
    this.sideInvertGain = context.createGain();

    this.lowFilter.type = 'highpass';
    this.lowFilter.frequency.value = 100;
    this.highFilter.type = 'lowpass';
    this.highFilter.frequency.value = 8000;

    this.preDelay.delayTime.value = this.preDelayTime;

    this.input.connect(this.preDelay);
    this.preDelay.connect(this.lowFilter);
    this.lowFilter.connect(this.highFilter);
    this.highFilter.connect(this.convolver);
    this.convolver.connect(this.wetGainControl);
    this.wetGainControl.connect(this.widthSplitter);

    this.sideInvertGain.gain.value = -1;
    this.updateWidthGains();

    this.widthSplitter.connect(this.midGain, 0);
    this.widthSplitter.connect(this.midGain, 1);
    this.widthSplitter.connect(this.sideGain, 0);
    this.widthSplitter.connect(this.sideInvertGain, 1);
    this.sideInvertGain.connect(this.sideGain);

    this.midGain.connect(this.widthMerger, 0, 0);
    this.midGain.connect(this.widthMerger, 0, 1);
    this.sideGain.connect(this.widthMerger, 0, 0);
    this.sideGain.connect(this.widthMerger, 0, 1);

    this.widthMerger.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.generateImpulseResponse(this.currentType);
  }

  private generateImpulseResponse(type: 'hall' | 'room' | 'plate' | 'spring' | 'chamber'): void {
    const seed = hashTypeSeed(type) ^ ((this.roomSize * 1000) | 0) ^ ((this.decay * 1000) << 10) ^ ((this.damping * 1000) << 20);
    this.prng.reset(seed);

    const length = Math.max(1, Math.floor(this.context.sampleRate * this.getReverbLength(type)));
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      const channelSeed = seed + channel * 7919;
      this.prng.reset(channelSeed);

      for (let i = 0; i < length; i++) {
        let sample = this.prng.nextBipolar() * Math.pow(1 - i / length, this.decay * 2);

        if (i < this.context.sampleRate * 0.1) {
          const reflectionCount = this.getEarlyReflectionCount(type);
          const reflectionPrng = new SeededPRNG(channelSeed + 12345);
          for (let r = 0; r < reflectionCount; r++) {
            const reflectionTime = reflectionPrng.next() * 0.1;
            const reflectionIndex = Math.floor(reflectionTime * this.context.sampleRate);
            if (i === reflectionIndex) {
              sample += reflectionPrng.nextBipolar() * 0.5 * (1 - r / reflectionCount);
            } else {
              reflectionPrng.nextBipolar();
            }
          }
        }

        if (i > length * 0.1) {
          sample *= Math.pow(this.damping, i / length);
        }

        if (channel === 1) {
          sample *= 0.95 + this.prng.next() * 0.1;
        }

        channelData[i] = sample;
      }

      this.applyRoomSizeModulation(channelData, type);
    }

    this.convolver.buffer = impulse;
    this.impulseResponses.set(this.getIRKey(type), impulse);
  }

  private getIRKey(type: string): string {
    return `${type}_${this.roomSize}_${this.decay}_${this.damping}`;
  }

  private getReverbLength(type: string): number {
    const baseLengths: Record<string, number> = {
      hall: 4.0,
      room: 1.5,
      plate: 2.5,
      spring: 1.0,
      chamber: 3.0,
    };
    return (baseLengths[type] || 2.0) * this.roomSize;
  }

  private getEarlyReflectionCount(type: string): number {
    const reflectionCounts: Record<string, number> = {
      hall: 20,
      room: 8,
      plate: 15,
      spring: 5,
      chamber: 12,
    };
    return reflectionCounts[type] || 10;
  }

  private applyRoomSizeModulation(channelData: Float32Array, type: string): void {
    const modulationDepth = type === 'spring' ? 0.02 : 0.005;
    const modulationRate = 0.5;

    for (let i = 0; i < channelData.length; i++) {
      const modulation = Math.sin((2 * Math.PI * modulationRate * i) / this.context.sampleRate);
      channelData[i] *= 1 + modulation * modulationDepth;
    }
  }

  private updateWidthGains(): void {
    const midLevel = 0.5;
    const sideLevel = this.width * 0.5;
    this.midGain.gain.value = midLevel;
    this.sideGain.gain.value = sideLevel;
  }

  setReverbType(type: 'hall' | 'room' | 'plate' | 'spring' | 'chamber'): void {
    this.currentType = type;
    this.generateImpulseResponse(type);
  }

  setRoomSize(value: number): void {
    this.roomSize = Math.max(0.01, Math.min(1, value));
    this.generateImpulseResponse(this.currentType);
  }

  setDecay(value: number): void {
    this.decay = Math.max(0, Math.min(1, value));
    this.generateImpulseResponse(this.currentType);
  }

  setDamping(value: number): void {
    this.damping = Math.max(0, Math.min(1, value));
    this.highFilter.frequency.setValueAtTime(
      20000 - value * 15000,
      this.context.currentTime
    );
    this.generateImpulseResponse(this.currentType);
  }

  setPreDelay(value: number): void {
    this.preDelayTime = Math.max(0, Math.min(0.5, value));
    this.preDelay.delayTime.setValueAtTime(this.preDelayTime, this.context.currentTime);
  }

  setWidth(value: number): void {
    this.width = Math.max(0, Math.min(1, value));
    this.updateWidthGains();
  }

  setLowCut(frequency: number): void {
    this.lowFilter.frequency.setValueAtTime(
      Math.max(20, Math.min(1000, frequency)),
      this.context.currentTime
    );
  }

  setHighCut(frequency: number): void {
    this.highFilter.frequency.setValueAtTime(
      Math.max(1000, Math.min(20000, frequency)),
      this.context.currentTime
    );
  }

  getName(): string {
    return 'Max Booster Convolution Reverb';
  }

  getParameters(): Record<string, any> {
    return {
      roomSize: this.roomSize,
      decay: this.decay,
      damping: this.damping,
      preDelay: this.preDelayTime,
      lowCut: this.lowFilter.frequency.value,
      highCut: this.highFilter.frequency.value,
      width: this.width,
      type: this.currentType,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.type !== undefined) this.setReverbType(params.type);
    if (params.roomSize !== undefined) this.setRoomSize(params.roomSize);
    if (params.decay !== undefined) this.setDecay(params.decay);
    if (params.damping !== undefined) this.setDamping(params.damping);
    if (params.preDelay !== undefined) this.setPreDelay(params.preDelay);
    if (params.lowCut !== undefined) this.setLowCut(params.lowCut);
    if (params.highCut !== undefined) this.setHighCut(params.highCut);
    if (params.width !== undefined) this.setWidth(params.width);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.convolver.disconnect();
    this.preDelay.disconnect();
    this.lowFilter.disconnect();
    this.highFilter.disconnect();
    this.wetGainControl.disconnect();
    this.widthSplitter.disconnect();
    this.widthMerger.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
    this.sideInvertGain.disconnect();
  }
}
