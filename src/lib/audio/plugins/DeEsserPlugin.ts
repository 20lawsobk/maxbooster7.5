import { BasePlugin } from './BasePlugin';

export type DeEsserMode = 'wideband' | 'split-band';
export type DeEsserBandShape = 'narrow' | 'wide';

/**
 * Professional De-Esser Plugin
 * Frequency-specific sibilance reduction with split-band and wideband modes
 */
export class DeEsserPlugin extends BasePlugin {
  private analyserIn: AnalyserNode;
  private analyserSidechain: AnalyserNode;
  
  private lowPass: BiquadFilterNode;
  private highPass: BiquadFilterNode;
  private bandPass: BiquadFilterNode;
  
  private compressor: DynamicsCompressorNode;
  private sidechainGain: GainNode;
  private outputGain: GainNode;
  
  private lowBand: GainNode;
  private highBand: GainNode;
  
  private centerFrequency: number = 6000;
  private bandwidth: number = 2000;
  private threshold: number = -20;
  private ratio: number = 4;
  private attack: number = 0.001;
  private release: number = 0.05;
  private mode: DeEsserMode = 'split-band';
  private bandShape: DeEsserBandShape = 'narrow';
  private listenMode: boolean = false;
  private sMonEnabled: boolean = false;
  private range: number = 12;
  
  constructor(context: AudioContext) {
    super(context);
    
    this.analyserIn = context.createAnalyser();
    this.analyserIn.fftSize = 2048;
    
    this.analyserSidechain = context.createAnalyser();
    this.analyserSidechain.fftSize = 2048;
    
    this.lowPass = context.createBiquadFilter();
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.value = this.centerFrequency - this.bandwidth / 2;
    this.lowPass.Q.value = 0.7;
    
    this.highPass = context.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.highPass.frequency.value = this.centerFrequency + this.bandwidth / 2;
    this.highPass.Q.value = 0.7;
    
    this.bandPass = context.createBiquadFilter();
    this.bandPass.type = 'bandpass';
    this.bandPass.frequency.value = this.centerFrequency;
    this.bandPass.Q.value = this.bandShape === 'narrow' ? 4 : 1;
    
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = this.threshold;
    this.compressor.ratio.value = this.ratio;
    this.compressor.attack.value = this.attack;
    this.compressor.release.value = this.release;
    this.compressor.knee.value = 3;
    
    this.sidechainGain = context.createGain();
    this.sidechainGain.gain.value = 1;
    
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;
    
    this.lowBand = context.createGain();
    this.lowBand.gain.value = 1;
    
    this.highBand = context.createGain();
    this.highBand.gain.value = 1;
    
    this.setupSplitBandMode();
  }
  
  private setupSplitBandMode(): void {
    this.disconnectAll();
    
    this.input.connect(this.analyserIn);
    
    this.input.connect(this.lowPass);
    this.lowPass.connect(this.lowBand);
    this.lowBand.connect(this.outputGain);
    
    this.input.connect(this.bandPass);
    this.bandPass.connect(this.analyserSidechain);
    this.bandPass.connect(this.compressor);
    this.compressor.connect(this.sidechainGain);
    this.sidechainGain.connect(this.outputGain);
    
    this.input.connect(this.highPass);
    this.highPass.connect(this.highBand);
    this.highBand.connect(this.outputGain);
    
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }
  
  private setupWidebandMode(): void {
    this.disconnectAll();
    
    this.input.connect(this.analyserIn);
    
    this.input.connect(this.bandPass);
    this.bandPass.connect(this.analyserSidechain);
    
    this.input.connect(this.compressor);
    this.compressor.connect(this.outputGain);
    
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }
  
  private disconnectAll(): void {
    try {
      this.input.disconnect();
      this.lowPass.disconnect();
      this.highPass.disconnect();
      this.bandPass.disconnect();
      this.compressor.disconnect();
      this.sidechainGain.disconnect();
      this.outputGain.disconnect();
      this.lowBand.disconnect();
      this.highBand.disconnect();
    } catch (e) {
    }
    
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
  }
  
  setCenterFrequency(frequency: number): void {
    this.centerFrequency = Math.max(4000, Math.min(10000, frequency));
    const currentTime = this.context.currentTime;
    
    this.bandPass.frequency.setValueAtTime(this.centerFrequency, currentTime);
    this.lowPass.frequency.setValueAtTime(this.centerFrequency - this.bandwidth / 2, currentTime);
    this.highPass.frequency.setValueAtTime(this.centerFrequency + this.bandwidth / 2, currentTime);
  }
  
  setBandwidth(bandwidth: number): void {
    this.bandwidth = Math.max(500, Math.min(6000, bandwidth));
    const currentTime = this.context.currentTime;
    
    this.lowPass.frequency.setValueAtTime(this.centerFrequency - this.bandwidth / 2, currentTime);
    this.highPass.frequency.setValueAtTime(this.centerFrequency + this.bandwidth / 2, currentTime);
    
    const q = 2000 / this.bandwidth;
    this.bandPass.Q.setValueAtTime(this.bandShape === 'narrow' ? q * 2 : q, currentTime);
  }
  
  setThreshold(threshold: number): void {
    this.threshold = Math.max(-60, Math.min(0, threshold));
    this.compressor.threshold.setValueAtTime(this.threshold, this.context.currentTime);
  }
  
  setRatio(ratio: number): void {
    this.ratio = Math.max(1, Math.min(20, ratio));
    this.compressor.ratio.setValueAtTime(this.ratio, this.context.currentTime);
  }
  
  setAttack(attack: number): void {
    this.attack = Math.max(0.0001, Math.min(0.1, attack));
    this.compressor.attack.setValueAtTime(this.attack, this.context.currentTime);
  }
  
  setRelease(release: number): void {
    this.release = Math.max(0.01, Math.min(1, release));
    this.compressor.release.setValueAtTime(this.release, this.context.currentTime);
  }
  
  setRange(range: number): void {
    this.range = Math.max(0, Math.min(24, range));
  }
  
  setMode(mode: DeEsserMode): void {
    this.mode = mode;
    if (mode === 'split-band') {
      this.setupSplitBandMode();
    } else {
      this.setupWidebandMode();
    }
  }
  
  setBandShape(shape: DeEsserBandShape): void {
    this.bandShape = shape;
    const q = this.bandShape === 'narrow' ? 4 : 1;
    this.bandPass.Q.setValueAtTime(q, this.context.currentTime);
  }
  
  setListenMode(enabled: boolean): void {
    this.listenMode = enabled;
    if (enabled) {
      this.lowBand.gain.setValueAtTime(0, this.context.currentTime);
      this.highBand.gain.setValueAtTime(0, this.context.currentTime);
      this.sidechainGain.gain.setValueAtTime(1, this.context.currentTime);
    } else {
      this.lowBand.gain.setValueAtTime(1, this.context.currentTime);
      this.highBand.gain.setValueAtTime(1, this.context.currentTime);
      this.sidechainGain.gain.setValueAtTime(1, this.context.currentTime);
    }
  }
  
  setSMonEnabled(enabled: boolean): void {
    this.sMonEnabled = enabled;
  }
  
  getGainReduction(): number {
    return this.compressor.reduction;
  }
  
  getInputSpectrum(): Uint8Array {
    const bufferLength = this.analyserIn.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserIn.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  getSidechainSpectrum(): Uint8Array {
    const bufferLength = this.analyserSidechain.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserSidechain.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  getSibilanceLevel(): number {
    const spectrum = this.getSidechainSpectrum();
    const sampleRate = this.context.sampleRate;
    const binSize = sampleRate / (this.analyserSidechain.fftSize);
    
    const lowBin = Math.floor(4000 / binSize);
    const highBin = Math.floor(10000 / binSize);
    
    let sum = 0;
    for (let i = lowBin; i <= highBin && i < spectrum.length; i++) {
      sum += spectrum[i];
    }
    
    return sum / (highBin - lowBin + 1) / 255;
  }
  
  applyPreset(preset: 'subtle' | 'moderate' | 'aggressive' | 'broadcast'): void {
    switch (preset) {
      case 'subtle':
        this.setCenterFrequency(6500);
        this.setBandwidth(2000);
        this.setThreshold(-15);
        this.setRatio(3);
        this.setAttack(0.002);
        this.setRelease(0.05);
        this.setMode('split-band');
        this.setBandShape('narrow');
        break;
      case 'moderate':
        this.setCenterFrequency(6000);
        this.setBandwidth(3000);
        this.setThreshold(-20);
        this.setRatio(5);
        this.setAttack(0.001);
        this.setRelease(0.04);
        this.setMode('split-band');
        this.setBandShape('wide');
        break;
      case 'aggressive':
        this.setCenterFrequency(5500);
        this.setBandwidth(4000);
        this.setThreshold(-25);
        this.setRatio(8);
        this.setAttack(0.0005);
        this.setRelease(0.03);
        this.setMode('wideband');
        this.setBandShape('wide');
        break;
      case 'broadcast':
        this.setCenterFrequency(7000);
        this.setBandwidth(2500);
        this.setThreshold(-18);
        this.setRatio(4);
        this.setAttack(0.001);
        this.setRelease(0.06);
        this.setMode('split-band');
        this.setBandShape('narrow');
        break;
    }
  }
  
  getName(): string {
    return 'Max Booster De-Esser';
  }
  
  getParameters(): Record<string, any> {
    return {
      centerFrequency: this.centerFrequency,
      bandwidth: this.bandwidth,
      threshold: this.threshold,
      ratio: this.ratio,
      attack: this.attack,
      release: this.release,
      range: this.range,
      mode: this.mode,
      bandShape: this.bandShape,
      listenMode: this.listenMode,
      sMonEnabled: this.sMonEnabled,
      mix: this.mix,
      bypass: this.bypass,
    };
  }
  
  setParameters(params: Record<string, any>): void {
    if (params.centerFrequency !== undefined) this.setCenterFrequency(params.centerFrequency);
    if (params.bandwidth !== undefined) this.setBandwidth(params.bandwidth);
    if (params.threshold !== undefined) this.setThreshold(params.threshold);
    if (params.ratio !== undefined) this.setRatio(params.ratio);
    if (params.attack !== undefined) this.setAttack(params.attack);
    if (params.release !== undefined) this.setRelease(params.release);
    if (params.range !== undefined) this.setRange(params.range);
    if (params.mode !== undefined) this.setMode(params.mode);
    if (params.bandShape !== undefined) this.setBandShape(params.bandShape);
    if (params.listenMode !== undefined) this.setListenMode(params.listenMode);
    if (params.sMonEnabled !== undefined) this.setSMonEnabled(params.sMonEnabled);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
    if (params.preset !== undefined) this.applyPreset(params.preset);
  }
  
  destroy(): void {
    super.destroy();
    this.analyserIn.disconnect();
    this.analyserSidechain.disconnect();
    this.lowPass.disconnect();
    this.highPass.disconnect();
    this.bandPass.disconnect();
    this.compressor.disconnect();
    this.sidechainGain.disconnect();
    this.outputGain.disconnect();
    this.lowBand.disconnect();
    this.highBand.disconnect();
  }
}
