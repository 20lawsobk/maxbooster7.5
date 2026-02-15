import { BasePlugin } from './BasePlugin';

/**
 * Professional Reverb Plugin
 * Implements convolution reverb with multiple impulse responses and algorithmic reverb
 */
export class ReverbPlugin extends BasePlugin {
  private convolver: ConvolverNode;
  private preDelay: DelayNode;
  private lowFilter: BiquadFilterNode;
  private highFilter: BiquadFilterNode;
  private wetGainControl: GainNode;

  // Reverb parameters
  private roomSize: number = 0.5;
  private decay: number = 0.5;
  private damping: number = 0.5;
  private preDelayTime: number = 0.02; // 20ms

  // Impulse response library
  private impulseResponses: Map<string, AudioBuffer> = new Map();

  constructor(context: AudioContext) {
    super(context);

    // Create reverb nodes
    this.convolver = context.createConvolver();
    this.preDelay = context.createDelay(0.5);
    this.lowFilter = context.createBiquadFilter();
    this.highFilter = context.createBiquadFilter();
    this.wetGainControl = context.createGain();

    // Configure filters
    this.lowFilter.type = 'highpass';
    this.lowFilter.frequency.value = 100;
    this.highFilter.type = 'lowpass';
    this.highFilter.frequency.value = 8000;

    // Set pre-delay
    this.preDelay.delayTime.value = this.preDelayTime;

    // Connect signal path
    this.input.connect(this.preDelay);
    this.preDelay.connect(this.lowFilter);
    this.lowFilter.connect(this.highFilter);
    this.highFilter.connect(this.convolver);
    this.convolver.connect(this.wetGainControl);
    this.wetGainControl.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Generate default impulse response
    this.generateImpulseResponse('hall');
  }

  /**
   * Generate algorithmic impulse response
   */
  private generateImpulseResponse(type: 'hall' | 'room' | 'plate' | 'spring' | 'chamber'): void {
    const length = this.context.sampleRate * this.getReverbLength(type);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);

      // Generate reverb tail using exponential decay
      for (let i = 0; i < length; i++) {
        // Base decay curve
        let sample = (Math.random() * 2 - 1) * Math.pow(1 - i / length, this.decay * 2);

        // Add early reflections
        if (i < this.context.sampleRate * 0.1) {
          const reflectionCount = this.getEarlyReflectionCount(type);
          for (let r = 0; r < reflectionCount; r++) {
            const reflectionTime = Math.random() * 0.1;
            const reflectionIndex = Math.floor(reflectionTime * this.context.sampleRate);
            if (i === reflectionIndex) {
              sample += (Math.random() * 2 - 1) * 0.5 * (1 - r / reflectionCount);
            }
          }
        }

        // Apply damping (frequency-dependent decay)
        if (i > length * 0.1) {
          sample *= Math.pow(this.damping, i / length);
        }

        // Add slight stereo variation
        if (channel === 1) {
          sample *= 0.95 + Math.random() * 0.1;
        }

        channelData[i] = sample;
      }

      // Apply room size modulation
      this.applyRoomSizeModulation(channelData, type);
    }

    this.convolver.buffer = impulse;
    this.impulseResponses.set(type, impulse);
  }

  /**
   * Get reverb length based on room type
   */
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

  /**
   * Get early reflection count for room type
   */
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

  /**
   * Apply room size modulation to impulse response
   */
  private applyRoomSizeModulation(channelData: Float32Array, type: string): void {
    const modulationDepth = type === 'spring' ? 0.02 : 0.005;
    const modulationRate = 0.5;

    for (let i = 0; i < channelData.length; i++) {
      const modulation = Math.sin((2 * Math.PI * modulationRate * i) / this.context.sampleRate);
      channelData[i] *= 1 + modulation * modulationDepth;
    }
  }

  /**
   * Set reverb type
   */
  setReverbType(type: 'hall' | 'room' | 'plate' | 'spring' | 'chamber'): void {
    // Check if we have cached impulse response
    if (this.impulseResponses.has(type)) {
      this.convolver.buffer = this.impulseResponses.get(type)!;
    } else {
      this.generateImpulseResponse(type);
    }
  }

  /**
   * Set room size (0-1)
   */
  setRoomSize(value: number): void {
    this.roomSize = Math.max(0, Math.min(1, value));
    // Regenerate current impulse response with new room size
    this.generateImpulseResponse('hall');
  }

  /**
   * Set decay time (0-1)
   */
  setDecay(value: number): void {
    this.decay = Math.max(0, Math.min(1, value));
  }

  /**
   * Set damping (high frequency absorption) (0-1)
   */
  setDamping(value: number): void {
    this.damping = Math.max(0, Math.min(1, value));
    this.highFilter.frequency.setValueAtTime(
      20000 - value * 15000, // More damping = lower cutoff
      this.context.currentTime
    );
  }

  /**
   * Set pre-delay in seconds (0-0.5)
   */
  setPreDelay(value: number): void {
    this.preDelayTime = Math.max(0, Math.min(0.5, value));
    this.preDelay.delayTime.setValueAtTime(this.preDelayTime, this.context.currentTime);
  }

  /**
   * Set low cut frequency (20-1000 Hz)
   */
  setLowCut(frequency: number): void {
    this.lowFilter.frequency.setValueAtTime(
      Math.max(20, Math.min(1000, frequency)),
      this.context.currentTime
    );
  }

  /**
   * Set high cut frequency (1000-20000 Hz)
   */
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
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.roomSize !== undefined) this.setRoomSize(params.roomSize);
    if (params.decay !== undefined) this.setDecay(params.decay);
    if (params.damping !== undefined) this.setDamping(params.damping);
    if (params.preDelay !== undefined) this.setPreDelay(params.preDelay);
    if (params.lowCut !== undefined) this.setLowCut(params.lowCut);
    if (params.highCut !== undefined) this.setHighCut(params.highCut);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
    if (params.type !== undefined) this.setReverbType(params.type);
  }

  destroy(): void {
    super.destroy();
    this.convolver.disconnect();
    this.preDelay.disconnect();
    this.lowFilter.disconnect();
    this.highFilter.disconnect();
    this.wetGainControl.disconnect();
  }
}
