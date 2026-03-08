import { BasePlugin } from './BasePlugin';

export class ChorusPlugin extends BasePlugin {
  private static readonly MAX_VOICES = 8;

  private delays: DelayNode[] = [];
  private lfos: OscillatorNode[] = [];
  private lfoGains: GainNode[] = [];
  private voiceGains: GainNode[] = [];
  private panners: StereoPannerNode[] = [];
  private feedbackGains: GainNode[] = [];
  private activeVoices: number = 4;
  private stereoSpread: number = 1.0;
  private feedback: number = 0;

  constructor(context: AudioContext) {
    super(context);

    for (let i = 0; i < ChorusPlugin.MAX_VOICES; i++) {
      const delay = context.createDelay(0.1);
      delay.delayTime.value = 0.02 + i * 0.005;

      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.value = 0.5 + i * 0.3;
      lfoGain.gain.value = 0.002;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();

      const voiceGain = context.createGain();
      voiceGain.gain.value = i < this.activeVoices ? 1 / this.activeVoices : 0;

      const panner = context.createStereoPanner();
      panner.pan.value = this.calculatePan(i, ChorusPlugin.MAX_VOICES);

      const fbGain = context.createGain();
      fbGain.gain.value = 0;

      this.input.connect(delay);
      delay.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(this.wetGain);

      delay.connect(fbGain);
      fbGain.connect(delay);

      this.delays.push(delay);
      this.lfos.push(lfo);
      this.lfoGains.push(lfoGain);
      this.voiceGains.push(voiceGain);
      this.panners.push(panner);
      this.feedbackGains.push(fbGain);
    }

    this.wetGain.connect(this.output);
  }

  private calculatePan(voiceIndex: number, totalVoices: number): number {
    if (totalVoices <= 1) return 0;
    return ((voiceIndex % 2 === 0 ? -1 : 1) * ((Math.floor(voiceIndex / 2) + 1) / Math.ceil(totalVoices / 2))) * this.stereoSpread;
  }

  private updateVoiceGains(): void {
    for (let i = 0; i < ChorusPlugin.MAX_VOICES; i++) {
      const gain = i < this.activeVoices ? 1 / this.activeVoices : 0;
      this.voiceGains[i].gain.setValueAtTime(gain, this.context.currentTime);
    }
  }

  private updatePanning(): void {
    for (let i = 0; i < ChorusPlugin.MAX_VOICES; i++) {
      this.panners[i].pan.setValueAtTime(
        this.calculatePan(i, this.activeVoices),
        this.context.currentTime
      );
    }
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
    this.activeVoices = Math.max(1, Math.min(ChorusPlugin.MAX_VOICES, Math.round(count)));
    this.updateVoiceGains();
    this.updatePanning();
  }

  setStereoSpread(value: number): void {
    this.stereoSpread = Math.max(0, Math.min(1, value));
    this.updatePanning();
  }

  setFeedback(value: number): void {
    this.feedback = Math.max(0, Math.min(0.9, value));
    this.feedbackGains.forEach((fbGain) => {
      fbGain.gain.setValueAtTime(this.feedback, this.context.currentTime);
    });
  }

  getName(): string {
    return 'Max Booster Chorus';
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.lfos[0]?.frequency.value || 0.5,
      depth: this.lfoGains[0]?.gain.value || 0.002,
      voices: this.activeVoices,
      stereoSpread: this.stereoSpread,
      feedback: this.feedback,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.voices !== undefined) this.setVoices(params.voices);
    if (params.stereoSpread !== undefined) this.setStereoSpread(params.stereoSpread);
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
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
    this.voiceGains.forEach((gain) => gain.disconnect());
    this.panners.forEach((panner) => panner.disconnect());
    this.feedbackGains.forEach((fbGain) => fbGain.disconnect());
  }
}
