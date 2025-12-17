import { BasePlugin } from './BasePlugin';

/**
 * Professional Delay Plugin
 * Implements stereo delay with ping-pong, feedback, filtering, and modulation
 */
export class DelayPlugin extends BasePlugin {
  private delayL: DelayNode;
  private delayR: DelayNode;
  private feedbackL: GainNode;
  private feedbackR: GainNode;
  private filterL: BiquadFilterNode;
  private filterR: BiquadFilterNode;
  private panL: StereoPannerNode;
  private panR: StereoPannerNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;

  // Parameters
  private delayTimeL: number = 0.25; // 250ms
  private delayTimeR: number = 0.25; // 250ms
  private feedback: number = 0.3;
  private crossFeedback: number = 0;
  private filterFreq: number = 2000;
  private modDepth: number = 0;
  private syncMode: boolean = false;
  private bpm: number = 120;

  constructor(context: AudioContext) {
    super(context);

    // Create delay nodes (max 5 seconds)
    this.delayL = context.createDelay(5);
    this.delayR = context.createDelay(5);

    // Create feedback nodes
    this.feedbackL = context.createGain();
    this.feedbackR = context.createGain();

    // Create filters for feedback path
    this.filterL = context.createBiquadFilter();
    this.filterR = context.createBiquadFilter();
    this.filterL.type = 'lowpass';
    this.filterR.type = 'lowpass';
    this.filterL.frequency.value = this.filterFreq;
    this.filterR.frequency.value = this.filterFreq;

    // Create stereo panners
    this.panL = context.createStereoPanner();
    this.panR = context.createStereoPanner();
    this.panL.pan.value = -0.5;
    this.panR.pan.value = 0.5;

    // Create LFO for modulation
    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();
    this.lfo.frequency.value = 0.5; // 0.5 Hz
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    // Connect modulation to delay times
    this.lfoGain.connect(this.delayL.delayTime);
    this.lfoGain.connect(this.delayR.delayTime);

    // Wire up the delay network
    this.setupDelayNetwork();

    // Set initial delay times
    this.delayL.delayTime.value = this.delayTimeL;
    this.delayR.delayTime.value = this.delayTimeR;
    this.feedbackL.gain.value = this.feedback;
    this.feedbackR.gain.value = this.feedback;
  }

  private setupDelayNetwork(): void {
    // Split input to both channels
    const splitter = this.context.createChannelSplitter(2);
    const merger = this.context.createChannelMerger(2);

    this.input.connect(splitter);

    // Left channel path
    splitter.connect(this.delayL, 0);
    this.delayL.connect(this.filterL);
    this.filterL.connect(this.feedbackL);
    this.feedbackL.connect(this.delayL); // Feedback loop
    this.filterL.connect(this.panL);

    // Right channel path
    splitter.connect(this.delayR, 1);
    this.delayR.connect(this.filterR);
    this.filterR.connect(this.feedbackR);
    this.feedbackR.connect(this.delayR); // Feedback loop
    this.filterR.connect(this.panR);

    // Merge and output
    this.panL.connect(merger, 0, 0);
    this.panR.connect(merger, 0, 1);
    merger.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  /**
   * Set delay time in seconds or note division
   */
  setDelayTime(left: number, right?: number): void {
    if (this.syncMode) {
      // Convert note division to seconds based on BPM
      const beatLength = 60 / this.bpm;
      this.delayTimeL = this.getNoteTime(left, beatLength);
      this.delayTimeR = this.getNoteTime(right || left, beatLength);
    } else {
      this.delayTimeL = Math.max(0.001, Math.min(5, left));
      this.delayTimeR = Math.max(0.001, Math.min(5, right || left));
    }

    this.delayL.delayTime.setValueAtTime(this.delayTimeL, this.context.currentTime);
    this.delayR.delayTime.setValueAtTime(this.delayTimeR, this.context.currentTime);
  }

  /**
   * Convert note division to time
   */
  private getNoteTime(division: number, beatLength: number): number {
    const noteDivisions: Record<number, number> = {
      1: 4, // Whole note
      2: 2, // Half note
      4: 1, // Quarter note
      8: 0.5, // Eighth note
      16: 0.25, // Sixteenth note
      32: 0.125, // Thirty-second note
    };

    const multiplier = noteDivisions[division] || 1;
    return beatLength * multiplier;
  }

  /**
   * Set feedback amount (0-0.95)
   */
  setFeedback(value: number): void {
    this.feedback = Math.max(0, Math.min(0.95, value));
    this.feedbackL.gain.setValueAtTime(this.feedback, this.context.currentTime);
    this.feedbackR.gain.setValueAtTime(this.feedback, this.context.currentTime);
  }

  /**
   * Set cross-feedback for ping-pong effect (0-0.95)
   */
  setCrossFeedback(value: number): void {
    this.crossFeedback = Math.max(0, Math.min(0.95, value));

    // Disconnect and reconnect with cross-feedback
    if (this.crossFeedback > 0) {
      this.feedbackL.disconnect();
      this.feedbackR.disconnect();

      // Create cross connections
      this.feedbackL.connect(this.delayR);
      this.feedbackR.connect(this.delayL);

      this.feedbackL.gain.value = this.crossFeedback;
      this.feedbackR.gain.value = this.crossFeedback;
    } else {
      // Restore normal feedback
      this.setupDelayNetwork();
      this.setFeedback(this.feedback);
    }
  }

  /**
   * Set filter frequency for feedback path (20-20000 Hz)
   */
  setFilterFrequency(value: number): void {
    this.filterFreq = Math.max(20, Math.min(20000, value));
    this.filterL.frequency.setValueAtTime(this.filterFreq, this.context.currentTime);
    this.filterR.frequency.setValueAtTime(this.filterFreq, this.context.currentTime);
  }

  /**
   * Set modulation depth (0-0.01)
   */
  setModulationDepth(value: number): void {
    this.modDepth = Math.max(0, Math.min(0.01, value));
    this.lfoGain.gain.setValueAtTime(this.modDepth, this.context.currentTime);
  }

  /**
   * Set modulation rate in Hz (0.1-10)
   */
  setModulationRate(value: number): void {
    this.lfo.frequency.setValueAtTime(Math.max(0.1, Math.min(10, value)), this.context.currentTime);
  }

  /**
   * Enable/disable tempo sync
   */
  setSync(enabled: boolean, bpm: number = 120): void {
    this.syncMode = enabled;
    this.bpm = bpm;
    if (enabled) {
      // Re-calculate delay times based on current settings
      this.setDelayTime(4, 4); // Default to quarter notes
    }
  }

  /**
   * Set stereo spread (-1 to 1)
   */
  setStereoSpread(value: number): void {
    const spread = Math.max(-1, Math.min(1, value));
    this.panL.pan.setValueAtTime(-spread, this.context.currentTime);
    this.panR.pan.setValueAtTime(spread, this.context.currentTime);
  }

  /**
   * Apply delay presets
   */
  applyPreset(preset: 'slapback' | 'echo' | 'ping-pong' | 'dotted' | 'tape' | 'dub'): void {
    switch (preset) {
      case 'slapback':
        this.setDelayTime(0.05, 0.07);
        this.setFeedback(0.1);
        this.setCrossFeedback(0);
        this.setFilterFrequency(8000);
        break;
      case 'echo':
        this.setDelayTime(0.25, 0.25);
        this.setFeedback(0.4);
        this.setCrossFeedback(0);
        this.setFilterFrequency(4000);
        break;
      case 'ping-pong':
        this.setDelayTime(0.2, 0.3);
        this.setFeedback(0.3);
        this.setCrossFeedback(0.5);
        this.setStereoSpread(0.8);
        break;
      case 'dotted':
        this.setSync(true, this.bpm);
        this.setDelayTime(8, 12); // Dotted eighth
        this.setFeedback(0.35);
        break;
      case 'tape':
        this.setDelayTime(0.3, 0.3);
        this.setFeedback(0.5);
        this.setFilterFrequency(2000);
        this.setModulationDepth(0.003);
        this.setModulationRate(0.3);
        break;
      case 'dub':
        this.setDelayTime(0.375, 0.375);
        this.setFeedback(0.7);
        this.setFilterFrequency(1000);
        this.setCrossFeedback(0.2);
        break;
    }
  }

  getName(): string {
    return 'Max Booster Stereo Delay';
  }

  getParameters(): Record<string, any> {
    return {
      delayTimeL: this.delayTimeL,
      delayTimeR: this.delayTimeR,
      feedback: this.feedback,
      crossFeedback: this.crossFeedback,
      filterFreq: this.filterFreq,
      modDepth: this.modDepth,
      modRate: this.lfo.frequency.value,
      syncMode: this.syncMode,
      bpm: this.bpm,
      stereoSpread: this.panL.pan.value,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.delayTimeL !== undefined || params.delayTimeR !== undefined) {
      this.setDelayTime(params.delayTimeL || this.delayTimeL, params.delayTimeR || this.delayTimeR);
    }
    if (params.feedback !== undefined) this.setFeedback(params.feedback);
    if (params.crossFeedback !== undefined) this.setCrossFeedback(params.crossFeedback);
    if (params.filterFreq !== undefined) this.setFilterFrequency(params.filterFreq);
    if (params.modDepth !== undefined) this.setModulationDepth(params.modDepth);
    if (params.modRate !== undefined) this.setModulationRate(params.modRate);
    if (params.syncMode !== undefined) this.setSync(params.syncMode, params.bpm || this.bpm);
    if (params.stereoSpread !== undefined) this.setStereoSpread(params.stereoSpread);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
    if (params.preset !== undefined) this.applyPreset(params.preset);
  }

  destroy(): void {
    super.destroy();
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delayL.disconnect();
    this.delayR.disconnect();
    this.feedbackL.disconnect();
    this.feedbackR.disconnect();
    this.filterL.disconnect();
    this.filterR.disconnect();
    this.panL.disconnect();
    this.panR.disconnect();
  }
}
