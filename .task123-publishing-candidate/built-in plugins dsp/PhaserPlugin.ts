import { BasePlugin } from "./BasePlugin";

export class PhaserPlugin extends BasePlugin {
  private allPassFilters: BiquadFilterNode[] = [];
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private lfoR: OscillatorNode | null = null;
  private lfoGainR: GainNode | null = null;
  private allPassFiltersR: BiquadFilterNode[] = [];
  private feedback: GainNode;
  private feedbackR: GainNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private panL: StereoPannerNode | null = null;
  private panR: StereoPannerNode | null = null;
  private stages: number = 4;
  private maxStages: number = 12;
  private stereoPhaseOffset: number = 0;
  private stereoEnabled: boolean = false;
  private currentRate: number = 0.5;
  private currentDepth: number = 1000;

  constructor(context: AudioContext) {
    super(context);

    this.feedback = context.createGain();
    this.feedback.gain.value = 0.5;

    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();
    this.lfo.type = "sine";
    this.lfo.frequency.value = this.currentRate;
    this.lfoGain.gain.value = this.currentDepth;

    for (let i = 0; i < this.maxStages; i++) {
      const filter = context.createBiquadFilter();
      filter.type = "allpass";
      filter.frequency.value = 440 + i * 200;
      filter.Q.value = 0.5;
      this.allPassFilters.push(filter);
    }

    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    this.rebuildChain();

    this.wetGain.connect(this.output);
  }

  private rebuildChain(): void {
    try {
      this.input.disconnect();
    } catch (_) {}
    this.input.connect(this.dryGain);

    this.allPassFilters.forEach((f) => {
      f.disconnect();
      try {
        this.lfoGain.disconnect(f.frequency);
      } catch (_) {}
    });
    this.feedback.disconnect();

    if (this.stereoEnabled) {
      this.rebuildStereoChain();
      return;
    }

    if (this.merger) {
      this.teardownStereo();
    }

    let prev: AudioNode = this.input;
    for (let i = 0; i < this.stages; i++) {
      const filter = this.allPassFilters[i];
      this.lfoGain.connect(filter.frequency);
      prev.connect(filter);
      prev = filter;
    }

    prev.connect(this.wetGain);
    prev.connect(this.feedback);
    this.feedback.connect(this.allPassFilters[0]);
  }

  private rebuildStereoChain(): void {
    this.teardownStereo();

    this.merger = this.context.createChannelMerger(2);
    this.panL = this.context.createStereoPanner();
    this.panR = this.context.createStereoPanner();
    this.panL.pan.value = -1;
    this.panR.pan.value = 1;

    this.feedbackR = this.context.createGain();
    this.feedbackR.gain.value = this.feedback.gain.value;

    this.lfoR = this.context.createOscillator();
    this.lfoGainR = this.context.createGain();
    this.lfoR.type = "sine";
    this.lfoR.frequency.value = this.currentRate;
    this.lfoGainR.gain.value = this.currentDepth;
    this.lfoR.connect(this.lfoGainR);
    this.lfoR.start();

    this.allPassFiltersR = [];
    for (let i = 0; i < this.maxStages; i++) {
      const filter = this.context.createBiquadFilter();
      filter.type = "allpass";
      filter.frequency.value = this.allPassFilters[i].frequency.value;
      filter.Q.value = this.allPassFilters[i].Q.value;
      this.allPassFiltersR.push(filter);
    }

    let prevL: AudioNode = this.input;
    for (let i = 0; i < this.stages; i++) {
      const filter = this.allPassFilters[i];
      this.lfoGain.connect(filter.frequency);
      prevL.connect(filter);
      prevL = filter;
    }
    prevL.connect(this.feedback);
    this.feedback.connect(this.allPassFilters[0]);
    prevL.connect(this.panL);
    this.panL.connect(this.merger, 0, 0);

    let prevR: AudioNode = this.input;
    for (let i = 0; i < this.stages; i++) {
      const filter = this.allPassFiltersR[i];
      this.lfoGainR!.connect(filter.frequency);
      prevR.connect(filter);
      prevR = filter;
    }
    prevR.connect(this.feedbackR);
    this.feedbackR.connect(this.allPassFiltersR[0]);
    prevR.connect(this.panR);
    this.panR.connect(this.merger, 0, 1);

    this.merger.connect(this.wetGain);
  }

  private teardownStereo(): void {
    if (this.lfoR) {
      try {
        this.lfoR.stop();
      } catch (_) {}
      this.lfoR.disconnect();
      this.lfoR = null;
    }
    if (this.lfoGainR) {
      this.lfoGainR.disconnect();
      this.lfoGainR = null;
    }
    if (this.feedbackR) {
      this.feedbackR.disconnect();
      this.feedbackR = null;
    }
    this.allPassFiltersR.forEach((f) => f.disconnect());
    this.allPassFiltersR = [];
    if (this.panL) {
      this.panL.disconnect();
      this.panL = null;
    }
    if (this.panR) {
      this.panR.disconnect();
      this.panR = null;
    }
    if (this.merger) {
      this.merger.disconnect();
      this.merger = null;
    }
  }

  setRate(value: number): void {
    const rate = Math.max(0.1, Math.min(10, value));
    this.currentRate = rate;
    this.lfo.frequency.setValueAtTime(rate, this.context.currentTime);
    if (this.lfoR) {
      this.lfoR.frequency.setValueAtTime(rate, this.context.currentTime);
    }
  }

  setDepth(value: number): void {
    const depth = Math.max(100, Math.min(3000, value));
    this.currentDepth = depth;
    this.lfoGain.gain.setValueAtTime(depth, this.context.currentTime);
    if (this.lfoGainR) {
      this.lfoGainR.gain.setValueAtTime(depth, this.context.currentTime);
    }
  }

  setFeedback(value: number): void {
    const feedback = Math.max(-0.95, Math.min(0.95, value));
    this.feedback.gain.setValueAtTime(feedback, this.context.currentTime);
    if (this.feedbackR) {
      this.feedbackR.gain.setValueAtTime(feedback, this.context.currentTime);
    }
  }

  setStages(count: number): void {
    const stages = Math.max(2, Math.min(this.maxStages, count));
    if (stages === this.stages) return;
    this.stages = stages;
    this.rebuildChain();
  }

  setStereo(phaseOffset: number): void {
    const offset = Math.max(0, Math.min(1, phaseOffset));
    this.stereoPhaseOffset = offset;
    const wasEnabled = this.stereoEnabled;
    this.stereoEnabled = offset > 0;
    if (this.stereoEnabled !== wasEnabled) {
      this.rebuildChain();
    }
  }

  setFrequencyRange(min: number, max: number): void {
    const range = max - min;
    for (let i = 0; i < this.maxStages; i++) {
      const frequency = min + (range * i) / this.maxStages;
      this.allPassFilters[i].frequency.value = frequency;
      if (this.allPassFiltersR[i]) {
        this.allPassFiltersR[i].frequency.value = frequency;
      }
    }
  }

  getName(): string {
    return "Max Booster Phaser";
  }

  getParameters(): Record<string, any> {
    return {
      rate: this.currentRate,
      depth: this.currentDepth,
      feedback: this.feedback.gain.value,
      stages: this.stages,
      stereo: this.stereoPhaseOffset,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.rate !== undefined) this.setRate(params.rate);
    if (params.depth !== undefined) this.setDepth(params.depth);
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
    if (params.stages !== undefined) this.setStages(params.stages);
    if (params.stereo !== undefined) this.setStereo(params.stereo);
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
    this.teardownStereo();
  }
}
