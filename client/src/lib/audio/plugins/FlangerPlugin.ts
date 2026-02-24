import { BasePlugin } from './BasePlugin';

export class FlangerPlugin extends BasePlugin {
  private delayL: DelayNode;
  private delayR: DelayNode;
  private lfoL: OscillatorNode;
  private lfoR: OscillatorNode;
  private lfoGainL: GainNode;
  private lfoGainR: GainNode;
  private feedbackL: GainNode;
  private feedbackR: GainNode;
  private panL: StereoPannerNode;
  private panR: StereoPannerNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private stereoWidth: number = 0;

  constructor(context: AudioContext) {
    super(context);

    this.delayL = context.createDelay(0.035);
    this.delayL.delayTime.value = 0.005;

    this.delayR = context.createDelay(0.035);
    this.delayR.delayTime.value = 0.005;

    this.lfoL = context.createOscillator();
    this.lfoGainL = context.createGain();
    this.lfoL.type = 'sine';
    this.lfoL.frequency.value = 0.25;
    this.lfoGainL.gain.value = 0.003;

    this.lfoR = context.createOscillator();
    this.lfoGainR = context.createGain();
    this.lfoR.type = 'sine';
    this.lfoR.frequency.value = 0.25;
    this.lfoGainR.gain.value = 0.003;

    this.feedbackL = context.createGain();
    this.feedbackL.gain.value = 0.5;

    this.feedbackR = context.createGain();
    this.feedbackR.gain.value = 0.5;

    this.panL = context.createStereoPanner();
    this.panR = context.createStereoPanner();
    this.panL.pan.value = 0;
    this.panR.pan.value = 0;

    this.splitter = context.createChannelSplitter(2);
    this.merger = context.createChannelMerger(2);

    this.lfoL.connect(this.lfoGainL);
    this.lfoGainL.connect(this.delayL.delayTime);

    this.lfoR.connect(this.lfoGainR);
    this.lfoGainR.connect(this.delayR.delayTime);

    this.lfoL.start();
    this.lfoR.start();

    this.input.connect(this.delayL);
    this.delayL.connect(this.feedbackL);
    this.feedbackL.connect(this.delayL);
    this.delayL.connect(this.panL);
    this.panL.connect(this.wetGain);

    this.input.connect(this.delayR);
    this.delayR.connect(this.feedbackR);
    this.feedbackR.connect(this.delayR);
    this.delayR.connect(this.panR);
    this.panR.connect(this.wetGain);

    this.wetGain.connect(this.output);

    this.setStereoWidth(0);
  }

  setRate(value: number): void {
    const rate = Math.max(0.1, Math.min(10, value));
    this.lfoL.frequency.setValueAtTime(rate, this.context.currentTime);
    this.lfoR.frequency.setValueAtTime(rate, this.context.currentTime);
  }

  setDepth(value: number): void {
    const depth = Math.max(0, Math.min(0.015, value));
    this.lfoGainL.gain.setValueAtTime(depth, this.context.currentTime);
    this.lfoGainR.gain.setValueAtTime(depth, this.context.currentTime);
  }

  setFeedback(value: number): void {
    const feedback = Math.max(-0.99, Math.min(0.99, value));
    this.feedbackL.gain.setValueAtTime(feedback, this.context.currentTime);
    this.feedbackR.gain.setValueAtTime(feedback, this.context.currentTime);
  }

  setDelayTime(value: number): void {
    const delay = Math.max(0.001, Math.min(0.035, value));
    this.delayL.delayTime.setValueAtTime(delay, this.context.currentTime);
    this.delayR.delayTime.setValueAtTime(delay, this.context.currentTime);
  }

  setStereoWidth(value: number): void {
    this.stereoWidth = Math.max(0, Math.min(1, value));
    this.panL.pan.setValueAtTime(-this.stereoWidth, this.context.currentTime);
    this.panR.pan.setValueAtTime(this.stereoWidth, this.context.currentTime);

    if (this.stereoWidth > 0) {
      this.lfoR.frequency.setValueAtTime(
        this.lfoL.frequency.value,
        this.context.currentTime
      );
      const depth = this.lfoGainL.gain.value;
      this.lfoGainR.gain.setValueAtTime(-depth, this.context.currentTime);
    } else {
      this.lfoR.frequency.setValueAtTime(
        this.lfoL.frequency.value,
        this.context.currentTime
      );
      this.lfoGainR.gain.setValueAtTime(
        this.lfoGainL.gain.value,
        this.context.currentTime
      );
    }
  }

  getName(): string {
    return 'Max Booster Flanger';
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.lfoL.frequency.value,
      depth: this.lfoGainL.gain.value,
      feedback: this.feedbackL.gain.value,
      delayTime: this.delayL.delayTime.value,
      stereoWidth: this.stereoWidth,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
    if (params.delayTime !== undefined) this.setDelayTime(params.delayTime);
    if (params.stereoWidth !== undefined) this.setStereoWidth(params.stereoWidth);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.lfoL.stop();
    this.lfoR.stop();
    this.lfoL.disconnect();
    this.lfoR.disconnect();
    this.lfoGainL.disconnect();
    this.lfoGainR.disconnect();
    this.delayL.disconnect();
    this.delayR.disconnect();
    this.feedbackL.disconnect();
    this.feedbackR.disconnect();
    this.panL.disconnect();
    this.panR.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
  }
}
