import { BasePlugin } from './BasePlugin';

export class CompressorPlugin extends BasePlugin {
  private compressor: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private inputHPF: BiquadFilterNode;

  private autoMakeup: boolean = false;
  private manualMakeupGain: number = 1.0;
  private inputHPFEnabled: boolean = false;

  constructor(context: AudioContext) {
    super(context);

    this.compressor = context.createDynamicsCompressor();
    this.makeupGain = context.createGain();

    this.inputHPF = context.createBiquadFilter();
    this.inputHPF.type = 'highpass';
    this.inputHPF.frequency.value = 80;
    this.inputHPF.Q.value = 0.707;

    this.input.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.setDefaultParameters();
  }

  private setDefaultParameters(): void {
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.1;
    this.makeupGain.gain.value = 1.0;
    this.manualMakeupGain = 1.0;
  }

  private updateMakeupGain(): void {
    if (this.autoMakeup) {
      const threshold = this.compressor.threshold.value;
      const ratio = this.compressor.ratio.value;
      const makeupDb = -threshold * (1 - 1 / ratio) / 2;
      const makeupLinear = Math.pow(10, makeupDb / 20);
      this.makeupGain.gain.setValueAtTime(makeupLinear, this.context.currentTime);
    } else {
      this.makeupGain.gain.setValueAtTime(this.manualMakeupGain, this.context.currentTime);
    }
  }

  private rebuildInputPath(): void {
    try { this.input.disconnect(this.compressor); } catch (e) {}
    try { this.input.disconnect(this.inputHPF); } catch (e) {}
    try { this.inputHPF.disconnect(); } catch (e) {}

    if (this.inputHPFEnabled) {
      this.input.connect(this.inputHPF);
      this.inputHPF.connect(this.compressor);
    } else {
      this.input.connect(this.compressor);
    }
  }

  setThreshold(value: number): void {
    this.compressor.threshold.setValueAtTime(
      Math.max(-100, Math.min(0, value)),
      this.context.currentTime
    );
    if (this.autoMakeup) this.updateMakeupGain();
  }

  setRatio(value: number): void {
    this.compressor.ratio.setValueAtTime(
      Math.max(1, Math.min(20, value)),
      this.context.currentTime
    );
    if (this.autoMakeup) this.updateMakeupGain();
  }

  setKnee(value: number): void {
    this.compressor.knee.setValueAtTime(Math.max(0, Math.min(40, value)), this.context.currentTime);
  }

  setAttack(value: number): void {
    this.compressor.attack.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime
    );
  }

  setRelease(value: number): void {
    this.compressor.release.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime
    );
  }

  setMakeupGain(value: number): void {
    this.manualMakeupGain = Math.max(0, Math.min(10, value));
    if (!this.autoMakeup) {
      this.makeupGain.gain.setValueAtTime(this.manualMakeupGain, this.context.currentTime);
    }
  }

  setAutoMakeup(enabled: boolean): void {
    this.autoMakeup = enabled;
    this.updateMakeupGain();
  }

  setInputHPF(enabled: boolean): void {
    this.inputHPFEnabled = enabled;
    this.rebuildInputPath();
  }

  setInputHPFFrequency(value: number): void {
    this.inputHPF.frequency.setValueAtTime(
      Math.max(20, Math.min(500, value)),
      this.context.currentTime
    );
  }

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
      makeupGain: this.manualMakeupGain,
      autoMakeup: this.autoMakeup,
      inputHPF: this.inputHPFEnabled,
      inputHPFFrequency: this.inputHPF.frequency.value,
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
    if (params.autoMakeup !== undefined) this.setAutoMakeup(params.autoMakeup);
    if (params.inputHPF !== undefined) this.setInputHPF(params.inputHPF);
    if (params.inputHPFFrequency !== undefined) this.setInputHPFFrequency(params.inputHPFFrequency);
    if (params.sidechainHPF !== undefined) this.setInputHPF(params.sidechainHPF);
    if (params.sidechainHPFFrequency !== undefined) this.setInputHPFFrequency(params.sidechainHPFFrequency);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.compressor.disconnect();
    this.makeupGain.disconnect();
    this.inputHPF.disconnect();
  }
}
