/**
 * Base class for all audio plugins
 * Provides common functionality for Web Audio API effect processors
 */
export abstract class BasePlugin {
  protected context: AudioContext;
  protected input: GainNode;
  protected output: GainNode;
  protected wetGain: GainNode;
  protected dryGain: GainNode;
  protected bypass: boolean = false;
  protected mix: number = 1.0; // 0 = dry, 1 = wet

  constructor(context: AudioContext) {
    this.context = context;

    // Create input/output nodes
    this.input = context.createGain();
    this.output = context.createGain();

    // Create wet/dry mix nodes
    this.wetGain = context.createGain();
    this.dryGain = context.createGain();

    // Set initial mix
    this.setMix(1.0);

    // Connect dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
  }

  /**
   * Connect plugin to audio node
   */
  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  /**
   * Disconnect plugin
   */
  disconnect(): void {
    this.output.disconnect();
  }

  /**
   * Set wet/dry mix
   * @param value 0-1 where 0 is fully dry and 1 is fully wet
   */
  setMix(value: number): void {
    this.mix = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this.mix;
    this.dryGain.gain.value = 1 - this.mix;
  }

  /**
   * Set bypass state
   */
  setBypass(bypass: boolean): void {
    this.bypass = bypass;
    if (bypass) {
      this.wetGain.gain.value = 0;
      this.dryGain.gain.value = 1;
    } else {
      this.setMix(this.mix);
    }
  }

  /**
   * Get input node for connecting sources
   */
  getInput(): AudioNode {
    return this.input;
  }

  /**
   * Get output node for connecting to destination
   */
  getOutput(): AudioNode {
    return this.output;
  }

  /**
   * Get current parameters as object
   */
  abstract getParameters(): Record<string, any>;

  /**
   * Set parameters from object
   */
  abstract setParameters(params: Record<string, any>): void;

  /**
   * Get plugin name
   */
  abstract getName(): string;

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnect();
    this.input.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
  }
}
