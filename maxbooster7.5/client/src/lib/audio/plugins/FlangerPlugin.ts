import { BasePlugin } from './BasePlugin';

/**
 * Professional Flanger Plugin
 * Creates a sweeping, jet-like effect through comb filtering
 */
export class FlangerPlugin extends BasePlugin {
  private delay: DelayNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private feedback: GainNode;

  constructor(context: AudioContext) {
    super(context);

    // Create delay (1-20ms range for flanging)
    this.delay = context.createDelay(0.02);
    this.delay.delayTime.value = 0.005; // 5ms center

    // Create LFO for modulation
    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();

    // Configure LFO
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.25; // 0.25 Hz default
    this.lfoGain.gain.value = 0.003; // 3ms modulation depth

    // Create feedback loop
    this.feedback = context.createGain();
    this.feedback.gain.value = 0.5; // 50% feedback

    // Connect modulation
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    // Connect signal path with feedback
    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay); // Feedback loop
    this.delay.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  setRate(value: number): void {
    // 0.1 - 10 Hz range
    const rate = Math.max(0.1, Math.min(10, value));
    this.lfo.frequency.setValueAtTime(rate, this.context.currentTime);
  }

  setDepth(value: number): void {
    // 0 - 10ms modulation depth
    const depth = Math.max(0, Math.min(0.01, value));
    this.lfoGain.gain.setValueAtTime(depth, this.context.currentTime);
  }

  setFeedback(value: number): void {
    // -0.99 to 0.99 (negative for inverted feedback)
    const feedback = Math.max(-0.99, Math.min(0.99, value));
    this.feedback.gain.setValueAtTime(feedback, this.context.currentTime);
  }

  setDelayTime(value: number): void {
    // 1-20ms range
    const delay = Math.max(0.001, Math.min(0.02, value));
    this.delay.delayTime.setValueAtTime(delay, this.context.currentTime);
  }

  getName(): string {
    return 'Max Booster Flanger';
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.lfo.frequency.value,
      depth: this.lfoGain.gain.value,
      feedback: this.feedback.gain.value,
      delayTime: this.delay.delayTime.value,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
    if (params.delayTime !== undefined) this.setDelayTime(params.delayTime);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.feedback.disconnect();
  }
}
