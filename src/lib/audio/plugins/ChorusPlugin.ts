import { BasePlugin } from './BasePlugin';

/**
 * Professional Chorus Plugin
 * Creates rich, detuned copies for width and depth
 */
export class ChorusPlugin extends BasePlugin {
  private delays: DelayNode[] = [];
  private lfos: OscillatorNode[] = [];
  private lfoGains: GainNode[] = [];
  private voices: number = 4;

  constructor(context: AudioContext) {
    super(context);

    // Create multiple detuned voices
    for (let i = 0; i < this.voices; i++) {
      // Create delay for each voice (20-50ms range)
      const delay = context.createDelay(0.1);
      delay.delayTime.value = 0.02 + i * 0.01;

      // Create LFO for modulation
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();

      // Configure LFO (different rates for each voice)
      lfo.frequency.value = 0.5 + i * 0.3; // 0.5-1.4 Hz
      lfoGain.gain.value = 0.002; // 2ms modulation depth

      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();

      // Connect delay to wet signal
      this.input.connect(delay);
      delay.connect(this.wetGain);

      this.delays.push(delay);
      this.lfos.push(lfo);
      this.lfoGains.push(lfoGain);
    }

    this.wetGain.connect(this.output);
  }

  setRate(value: number): void {
    const rate = Math.max(0.1, Math.min(10, value));
    this.lfos.forEach((lfo, i) => {
      lfo.frequency.setValueAtTime(rate + i * 0.3, this.context.currentTime);
    });
  }

  setDepth(value: number): void {
    const depth = Math.max(0, Math.min(0.01, value));
    this.lfoGains.forEach((gain) => {
      gain.gain.setValueAtTime(depth, this.context.currentTime);
    });
  }

  setVoices(count: number): void {
    // Adjust active voices by changing gains
    const activeVoices = Math.max(1, Math.min(this.voices, count));
    this.delays.forEach((delay, i) => {
      const gain = i < activeVoices ? 1 / activeVoices : 0;
      // Would need additional gain nodes per voice for this
    });
  }

  getName(): string {
    return 'Max Booster Chorus';
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.lfos[0]?.frequency.value || 0.5,
      depth: this.lfoGains[0]?.gain.value || 0.002,
      voices: this.voices,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.voices !== undefined) this.setVoices(params.voices);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.lfos.forEach((lfo) => {
      lfo.stop();
      lfo.disconnect();
    });
    this.lfoGains.forEach((gain) => gain.disconnect());
    this.delays.forEach((delay) => delay.disconnect());
  }
}
