import { BasePlugin } from './BasePlugin';

/**
 * Professional Phaser Plugin
 * Creates a sweeping effect using all-pass filters
 */
export class PhaserPlugin extends BasePlugin {
  private allPassFilters: BiquadFilterNode[] = [];
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private feedback: GainNode;
  private stages: number = 4;

  constructor(context: AudioContext) {
    super(context);

    // Create feedback path
    this.feedback = context.createGain();
    this.feedback.gain.value = 0.5;

    // Create LFO for modulation
    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();

    // Configure LFO
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5; // 0.5 Hz default
    this.lfoGain.gain.value = 1000; // Frequency modulation depth

    // Create all-pass filter stages
    let previousNode: AudioNode = this.input;

    for (let i = 0; i < this.stages; i++) {
      const filter = context.createBiquadFilter();
      filter.type = 'allpass';
      filter.frequency.value = 440 + i * 200; // Stagger frequencies
      filter.Q.value = 0.5;

      // Connect LFO to each filter
      this.lfoGain.connect(filter.frequency);

      // Connect in series
      previousNode.connect(filter);
      previousNode = filter;

      this.allPassFilters.push(filter);
    }

    // Connect output and feedback
    previousNode.connect(this.wetGain);
    previousNode.connect(this.feedback);
    this.feedback.connect(this.allPassFilters[0]); // Feedback to first stage

    // Start LFO
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    this.wetGain.connect(this.output);
  }

  setRate(value: number): void {
    // 0.1 - 10 Hz range
    const rate = Math.max(0.1, Math.min(10, value));
    this.lfo.frequency.setValueAtTime(rate, this.context.currentTime);
  }

  setDepth(value: number): void {
    // 100 - 3000 Hz modulation depth
    const depth = Math.max(100, Math.min(3000, value));
    this.lfoGain.gain.setValueAtTime(depth, this.context.currentTime);
  }

  setFeedback(value: number): void {
    // -0.95 to 0.95
    const feedback = Math.max(-0.95, Math.min(0.95, value));
    this.feedback.gain.setValueAtTime(feedback, this.context.currentTime);
  }

  setStages(count: number): void {
    // 2 to 8 stages (would need rebuild for dynamic changes)
    // For now just adjust Q values to simulate fewer stages
    const stages = Math.max(2, Math.min(8, count));
    this.allPassFilters.forEach((filter, i) => {
      if (i < stages) {
        filter.Q.value = 0.5;
      } else {
        filter.Q.value = 0; // Effectively bypass
      }
    });
  }

  setFrequencyRange(min: number, max: number): void {
    // Adjust the center frequencies of the all-pass filters
    const range = max - min;
    this.allPassFilters.forEach((filter, i) => {
      const frequency = min + (range * i) / this.stages;
      filter.frequency.value = frequency;
    });
  }

  getName(): string {
    return 'Max Booster Phaser';
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.lfo.frequency.value,
      depth: this.lfoGain.gain.value,
      feedback: this.feedback.gain.value,
      stages: this.stages,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
    if (params.stages !== undefined) this.setStages(params.stages);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.feedback.disconnect();
    this.allPassFilters.forEach((filter) => filter.disconnect());
  }
}
