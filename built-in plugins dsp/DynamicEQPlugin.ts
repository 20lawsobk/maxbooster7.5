import { BasePlugin } from './BasePlugin';

export type DynamicMode = 'compress' | 'expand';

export interface DynamicBand {
  frequency: number;
  gain: number;
  q: number;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  mode: DynamicMode;
  solo: boolean;
  bypass: boolean;
  dynamicActivity: number;
}

/**
 * Professional Dynamic EQ Plugin
 * Per-band threshold compression with up to 8 bands
 */
export class DynamicEQPlugin extends BasePlugin {
  private bands: DynamicBand[] = [];
  private bandFilters: BiquadFilterNode[] = [];
  private bandAnalysers: AnalyserNode[] = [];
  private bandCompressors: DynamicsCompressorNode[] = [];
  private bandGains: GainNode[] = [];
  private sidechainInputs: GainNode[] = [];
  
  private preAnalyser: AnalyserNode;
  private postAnalyser: AnalyserNode;
  private outputGain: GainNode;
  
  private maxBands: number = 8;
  private animationFrame: number | null = null;
  private dynamicActivityValues: Float32Array;
  
  constructor(context: AudioContext) {
    super(context);
    
    this.preAnalyser = context.createAnalyser();
    this.preAnalyser.fftSize = 4096;
    this.preAnalyser.smoothingTimeConstant = 0.8;
    
    this.postAnalyser = context.createAnalyser();
    this.postAnalyser.fftSize = 4096;
    this.postAnalyser.smoothingTimeConstant = 0.8;
    
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;
    
    this.dynamicActivityValues = new Float32Array(this.maxBands);
    
    this.input.connect(this.preAnalyser);
    
    this.setupDefaultBands();
    this.startDynamicTracking();
  }
  
  private setupDefaultBands(): void {
    const defaultFrequencies = [100, 250, 500, 1000, 2000, 4000, 8000, 16000];
    
    for (let i = 0; i < this.maxBands; i++) {
      this.addBand({
        frequency: defaultFrequencies[i],
        gain: 0,
        q: 1,
        threshold: -20,
        ratio: 2,
        attack: 0.01,
        release: 0.1,
        mode: 'compress',
        solo: false,
        bypass: true,
        dynamicActivity: 0,
      });
    }
  }
  
  private addBand(config: DynamicBand): void {
    const index = this.bands.length;
    this.bands.push(config);
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = config.frequency;
    filter.Q.value = config.q;
    filter.gain.value = config.gain;
    this.bandFilters.push(filter);
    
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    this.bandAnalysers.push(analyser);
    
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = config.threshold;
    compressor.ratio.value = config.ratio;
    compressor.attack.value = config.attack;
    compressor.release.value = config.release;
    compressor.knee.value = 6;
    this.bandCompressors.push(compressor);
    
    const bandGain = this.context.createGain();
    bandGain.gain.value = 1;
    this.bandGains.push(bandGain);
    
    const sidechainInput = this.context.createGain();
    sidechainInput.gain.value = 1;
    this.sidechainInputs.push(sidechainInput);
    
    this.rebuildAudioGraph();
  }
  
  private rebuildAudioGraph(): void {
    try {
      this.input.disconnect();
      this.outputGain.disconnect();
      this.bandFilters.forEach(f => f.disconnect());
      this.bandCompressors.forEach(c => c.disconnect());
      this.bandGains.forEach(g => g.disconnect());
    } catch (e) {
    }
    
    this.input.connect(this.preAnalyser);
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    
    let lastNode: AudioNode = this.input;
    
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const filter = this.bandFilters[i];
      const compressor = this.bandCompressors[i];
      const analyser = this.bandAnalysers[i];
      const bandGain = this.bandGains[i];
      
      if (band.bypass) {
        lastNode.connect(filter);
        filter.connect(bandGain);
        lastNode = bandGain;
      } else {
        const splitter = this.context.createChannelSplitter(2);
        const merger = this.context.createChannelMerger(2);
        
        const sidechainFilter = this.context.createBiquadFilter();
        sidechainFilter.type = 'bandpass';
        sidechainFilter.frequency.value = band.frequency;
        sidechainFilter.Q.value = band.q * 2;
        
        lastNode.connect(filter);
        lastNode.connect(sidechainFilter);
        sidechainFilter.connect(analyser);
        
        filter.connect(compressor);
        compressor.connect(bandGain);
        lastNode = bandGain;
      }
    }
    
    lastNode.connect(this.outputGain);
    this.outputGain.connect(this.postAnalyser);
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }
  
  private startDynamicTracking(): void {
    const updateDynamics = () => {
      for (let i = 0; i < this.bands.length; i++) {
        if (!this.bands[i].bypass) {
          const reduction = Math.abs(this.bandCompressors[i].reduction);
          this.dynamicActivityValues[i] = reduction;
          this.bands[i].dynamicActivity = reduction;
        } else {
          this.dynamicActivityValues[i] = 0;
          this.bands[i].dynamicActivity = 0;
        }
      }
      
      this.animationFrame = requestAnimationFrame(updateDynamics);
    };
    
    updateDynamics();
  }
  
  setBandFrequency(bandIndex: number, frequency: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].frequency = Math.max(20, Math.min(20000, frequency));
    this.bandFilters[bandIndex].frequency.setValueAtTime(
      this.bands[bandIndex].frequency,
      this.context.currentTime
    );
  }
  
  setBandGain(bandIndex: number, gain: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].gain = Math.max(-24, Math.min(24, gain));
    this.bandFilters[bandIndex].gain.setValueAtTime(
      this.bands[bandIndex].gain,
      this.context.currentTime
    );
  }
  
  setBandQ(bandIndex: number, q: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].q = Math.max(0.1, Math.min(30, q));
    this.bandFilters[bandIndex].Q.setValueAtTime(
      this.bands[bandIndex].q,
      this.context.currentTime
    );
  }
  
  setBandThreshold(bandIndex: number, threshold: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].threshold = Math.max(-60, Math.min(0, threshold));
    this.bandCompressors[bandIndex].threshold.setValueAtTime(
      this.bands[bandIndex].threshold,
      this.context.currentTime
    );
  }
  
  setBandRatio(bandIndex: number, ratio: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].ratio = Math.max(1, Math.min(20, ratio));
    this.bandCompressors[bandIndex].ratio.setValueAtTime(
      this.bands[bandIndex].ratio,
      this.context.currentTime
    );
  }
  
  setBandAttack(bandIndex: number, attack: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].attack = Math.max(0.001, Math.min(1, attack));
    this.bandCompressors[bandIndex].attack.setValueAtTime(
      this.bands[bandIndex].attack,
      this.context.currentTime
    );
  }
  
  setBandRelease(bandIndex: number, release: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].release = Math.max(0.01, Math.min(3, release));
    this.bandCompressors[bandIndex].release.setValueAtTime(
      this.bands[bandIndex].release,
      this.context.currentTime
    );
  }
  
  setBandMode(bandIndex: number, mode: DynamicMode): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].mode = mode;
    
    if (mode === 'expand') {
      this.bandCompressors[bandIndex].ratio.setValueAtTime(0.5, this.context.currentTime);
    } else {
      this.bandCompressors[bandIndex].ratio.setValueAtTime(
        this.bands[bandIndex].ratio,
        this.context.currentTime
      );
    }
  }
  
  setBandSolo(bandIndex: number, solo: boolean): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].solo = solo;
    
    const anySolo = this.bands.some(b => b.solo);
    
    for (let i = 0; i < this.bands.length; i++) {
      if (anySolo) {
        this.bandGains[i].gain.setValueAtTime(
          this.bands[i].solo ? 1 : 0,
          this.context.currentTime
        );
      } else {
        this.bandGains[i].gain.setValueAtTime(1, this.context.currentTime);
      }
    }
  }
  
  setBandBypass(bandIndex: number, bypass: boolean): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.bands[bandIndex].bypass = bypass;
    this.rebuildAudioGraph();
  }
  
  connectSidechain(bandIndex: number, source: AudioNode): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    source.connect(this.sidechainInputs[bandIndex]);
  }
  
  disconnectSidechain(bandIndex: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    
    this.sidechainInputs[bandIndex].disconnect();
  }
  
  getFrequencyResponse(frequencies: Float32Array): Float32Array {
    const totalResponse = new Float32Array(frequencies.length);
    totalResponse.fill(1);
    
    const magResponse = new Float32Array(frequencies.length);
    const phaseResponse = new Float32Array(frequencies.length);
    
    for (const filter of this.bandFilters) {
      filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);
      for (let i = 0; i < frequencies.length; i++) {
        totalResponse[i] *= magResponse[i];
      }
    }
    
    return totalResponse;
  }
  
  getPreSpectrum(): Uint8Array {
    const bufferLength = this.preAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.preAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  getPostSpectrum(): Uint8Array {
    const bufferLength = this.postAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.postAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  getBands(): DynamicBand[] {
    return [...this.bands];
  }
  
  getDynamicActivity(): Float32Array {
    return new Float32Array(this.dynamicActivityValues);
  }
  
  applyPreset(preset: 'vocal' | 'bass' | 'drums' | 'master' | 'deharsh'): void {
    switch (preset) {
      case 'vocal':
        this.setBandBypass(0, true);
        this.setBandBypass(1, true);
        this.setBandBypass(2, false);
        this.setBandFrequency(2, 300);
        this.setBandThreshold(2, -18);
        this.setBandRatio(2, 3);
        this.setBandBypass(3, false);
        this.setBandFrequency(3, 3000);
        this.setBandThreshold(3, -15);
        this.setBandRatio(3, 2);
        this.setBandBypass(4, false);
        this.setBandFrequency(4, 6000);
        this.setBandThreshold(4, -20);
        this.setBandRatio(4, 4);
        break;
        
      case 'bass':
        this.setBandBypass(0, false);
        this.setBandFrequency(0, 60);
        this.setBandThreshold(0, -15);
        this.setBandRatio(0, 4);
        this.setBandBypass(1, false);
        this.setBandFrequency(1, 120);
        this.setBandThreshold(1, -18);
        this.setBandRatio(1, 3);
        for (let i = 2; i < 8; i++) {
          this.setBandBypass(i, true);
        }
        break;
        
      case 'drums':
        this.setBandBypass(0, false);
        this.setBandFrequency(0, 80);
        this.setBandThreshold(0, -12);
        this.setBandRatio(0, 4);
        this.setBandBypass(3, false);
        this.setBandFrequency(3, 2500);
        this.setBandThreshold(3, -15);
        this.setBandRatio(3, 3);
        this.setBandBypass(5, false);
        this.setBandFrequency(5, 8000);
        this.setBandThreshold(5, -18);
        this.setBandRatio(5, 2);
        break;
        
      case 'master':
        this.setBandBypass(0, false);
        this.setBandFrequency(0, 100);
        this.setBandThreshold(0, -10);
        this.setBandRatio(0, 2);
        this.setBandBypass(2, false);
        this.setBandFrequency(2, 500);
        this.setBandThreshold(2, -12);
        this.setBandRatio(2, 1.5);
        this.setBandBypass(4, false);
        this.setBandFrequency(4, 3000);
        this.setBandThreshold(4, -15);
        this.setBandRatio(4, 2);
        this.setBandBypass(6, false);
        this.setBandFrequency(6, 10000);
        this.setBandThreshold(6, -12);
        this.setBandRatio(6, 1.5);
        break;
        
      case 'deharsh':
        for (let i = 0; i < 4; i++) {
          this.setBandBypass(i, true);
        }
        this.setBandBypass(4, false);
        this.setBandFrequency(4, 3500);
        this.setBandThreshold(4, -20);
        this.setBandRatio(4, 4);
        this.setBandQ(4, 3);
        this.setBandBypass(5, false);
        this.setBandFrequency(5, 5000);
        this.setBandThreshold(5, -18);
        this.setBandRatio(5, 3);
        this.setBandQ(5, 2);
        break;
    }
  }
  
  getName(): string {
    return 'Max Booster Dynamic EQ';
  }
  
  getParameters(): Record<string, any> {
    return {
      bands: this.bands.map(b => ({ ...b })),
      mix: this.mix,
      bypass: this.bypass,
    };
  }
  
  setParameters(params: Record<string, any>): void {
    if (params.bands) {
      params.bands.forEach((band: Partial<DynamicBand>, index: number) => {
        if (index < this.bands.length) {
          if (band.frequency !== undefined) this.setBandFrequency(index, band.frequency);
          if (band.gain !== undefined) this.setBandGain(index, band.gain);
          if (band.q !== undefined) this.setBandQ(index, band.q);
          if (band.threshold !== undefined) this.setBandThreshold(index, band.threshold);
          if (band.ratio !== undefined) this.setBandRatio(index, band.ratio);
          if (band.attack !== undefined) this.setBandAttack(index, band.attack);
          if (band.release !== undefined) this.setBandRelease(index, band.release);
          if (band.mode !== undefined) this.setBandMode(index, band.mode);
          if (band.solo !== undefined) this.setBandSolo(index, band.solo);
          if (band.bypass !== undefined) this.setBandBypass(index, band.bypass);
        }
      });
    }
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
    if (params.preset !== undefined) this.applyPreset(params.preset);
  }
  
  destroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.bandFilters.forEach(f => f.disconnect());
    this.bandAnalysers.forEach(a => a.disconnect());
    this.bandCompressors.forEach(c => c.disconnect());
    this.bandGains.forEach(g => g.disconnect());
    this.sidechainInputs.forEach(s => s.disconnect());
    
    this.preAnalyser.disconnect();
    this.postAnalyser.disconnect();
    this.outputGain.disconnect();
    
    super.destroy();
  }
}
