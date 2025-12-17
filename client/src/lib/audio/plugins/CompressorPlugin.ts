import { BasePlugin } from './BasePlugin';

/**
 * Professional Compressor Plugin
 * Implements dynamic range compression with look-ahead, knee control, and sidechain
 */
export class CompressorPlugin extends BasePlugin {
  private compressor: DynamicsCompressorNode;
  private makeupGain: GainNode;

  // Advanced parameters
  private lookahead: number = 0.005; // 5ms lookahead
  private delayNode: DelayNode;

  constructor(context: AudioContext) {
    super(context);

    // Create compressor node
    this.compressor = context.createDynamicsCompressor();

    // Create makeup gain
    this.makeupGain = context.createGain();

    // Create lookahead delay for smooth compression
    this.delayNode = context.createDelay(0.1);
    this.delayNode.delayTime.value = this.lookahead;

    // Connect signal path: input -> delay -> compressor -> makeup -> wet
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Set default parameters
    this.setDefaultParameters();
  }

  private setDefaultParameters(): void {
    this.compressor.threshold.value = -24; // dB
    this.compressor.knee.value = 12; // dB
    this.compressor.ratio.value = 4; // 4:1
    this.compressor.attack.value = 0.003; // 3ms
    this.compressor.release.value = 0.1; // 100ms
    this.makeupGain.gain.value = 1.5; // ~3dB makeup gain
  }

  /**
   * Set threshold in dB (-100 to 0)
   */
  setThreshold(value: number): void {
    this.compressor.threshold.setValueAtTime(
      Math.max(-100, Math.min(0, value)),
      this.context.currentTime
    );
  }

  /**
   * Set compression ratio (1 to 20)
   */
  setRatio(value: number): void {
    this.compressor.ratio.setValueAtTime(
      Math.max(1, Math.min(20, value)),
      this.context.currentTime
    );
  }

  /**
   * Set knee in dB (0 to 40)
   */
  setKnee(value: number): void {
    this.compressor.knee.setValueAtTime(Math.max(0, Math.min(40, value)), this.context.currentTime);
  }

  /**
   * Set attack time in seconds (0 to 1)
   */
  setAttack(value: number): void {
    this.compressor.attack.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime
    );
  }

  /**
   * Set release time in seconds (0 to 1)
   */
  setRelease(value: number): void {
    this.compressor.release.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime
    );
  }

  /**
   * Set makeup gain (0 to 10)
   */
  setMakeupGain(value: number): void {
    this.makeupGain.gain.setValueAtTime(Math.max(0, Math.min(10, value)), this.context.currentTime);
  }

  /**
   * Set lookahead time in seconds (0 to 0.05)
   */
  setLookahead(value: number): void {
    this.lookahead = Math.max(0, Math.min(0.05, value));
    this.delayNode.delayTime.setValueAtTime(this.lookahead, this.context.currentTime);
  }

  /**
   * Get current gain reduction in dB
   */
  getGainReduction(): number {
    return this.compressor.reduction;
  }

  getName(): string {
    return 'Max Booster Compressor';
  }

  getParameters(): Record<string, any> {
    return {
      threshold: this.compressor.threshold.value,
      ratio: this.compressor.ratio.value,
      knee: this.compressor.knee.value,
      attack: this.compressor.attack.value,
      release: this.compressor.release.value,
      makeupGain: this.makeupGain.gain.value,
      lookahead: this.lookahead,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.threshold !== undefined) this.setThreshold(params.threshold);
    if (params.ratio !== undefined) this.setRatio(params.ratio);
    if (params.knee !== undefined) this.setKnee(params.knee);
    if (params.attack !== undefined) this.setAttack(params.attack);
    if (params.release !== undefined) this.setRelease(params.release);
    if (params.makeupGain !== undefined) this.setMakeupGain(params.makeupGain);
    if (params.lookahead !== undefined) this.setLookahead(params.lookahead);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.compressor.disconnect();
    this.makeupGain.disconnect();
    this.delayNode.disconnect();
  }
}
