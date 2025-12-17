import { BasePlugin } from './BasePlugin';

export interface VocoderBand {
  frequency: number;
  gain: number;
  envelope: number;
  attack: number;
  release: number;
}

/**
 * Professional Vocoder Plugin
 * Carrier/modulator synthesis with 8-32 band processing
 */
export class VocoderPlugin extends BasePlugin {
  private carrierInput: GainNode;
  private modulatorInput: GainNode;
  
  private carrierBandFilters: BiquadFilterNode[] = [];
  private modulatorBandFilters: BiquadFilterNode[] = [];
  private bandGains: GainNode[] = [];
  private envelopeFollowers: GainNode[] = [];
  private envelopeAnalysers: AnalyserNode[] = [];
  
  private carrierOscillator: OscillatorNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer;
  
  private numBands: number = 16;
  private formantShift: number = 0;
  private voicedMix: number = 1;
  private unvoicedMix: number = 0.3;
  private attack: number = 0.005;
  private release: number = 0.05;
  private bandwidthFactor: number = 1;
  private carrierType: 'oscillator' | 'noise' | 'external' = 'oscillator';
  private oscillatorFrequency: number = 110;
  
  private bandEnvelopeValues: Float32Array;
  private bandAttacks: Float32Array;
  private bandReleases: Float32Array;
  private bandLevelMultipliers: Float32Array;
  private analyserTimer: number | null = null;
  
  constructor(context: AudioContext) {
    super(context);
    
    this.carrierInput = context.createGain();
    this.carrierInput.gain.value = 1;
    
    this.modulatorInput = context.createGain();
    this.modulatorInput.gain.value = 1;
    
    this.noiseBuffer = this.createNoiseBuffer();
    this.bandEnvelopeValues = new Float32Array(this.numBands);
    this.bandAttacks = new Float32Array(this.numBands);
    this.bandReleases = new Float32Array(this.numBands);
    this.bandLevelMultipliers = new Float32Array(this.numBands);
    this.initializeBandArrays();
    
    this.setupBands(this.numBands);
    this.setupInternalCarrier();
    this.startEnvelopeTracking();
  }
  
  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }
  
  private initializeBandArrays(): void {
    for (let i = 0; i < this.numBands; i++) {
      this.bandAttacks[i] = this.attack;
      this.bandReleases[i] = this.release;
      this.bandLevelMultipliers[i] = 1.0;
    }
  }
  
  private setupInternalCarrier(): void {
    if (this.carrierOscillator) {
      this.carrierOscillator.stop();
      this.carrierOscillator.disconnect();
    }
    if (this.noiseNode) {
      this.noiseNode.stop();
      this.noiseNode.disconnect();
    }
    
    if (this.carrierType === 'oscillator') {
      this.carrierOscillator = this.context.createOscillator();
      this.carrierOscillator.type = 'sawtooth';
      this.carrierOscillator.frequency.value = this.oscillatorFrequency;
      this.carrierOscillator.connect(this.carrierInput);
      this.carrierOscillator.start();
    } else if (this.carrierType === 'noise') {
      this.noiseNode = this.context.createBufferSource();
      this.noiseNode.buffer = this.noiseBuffer;
      this.noiseNode.loop = true;
      this.noiseNode.connect(this.carrierInput);
      this.noiseNode.start();
    }
  }
  
  private setupBands(numBands: number): void {
    this.carrierBandFilters.forEach(f => f.disconnect());
    this.modulatorBandFilters.forEach(f => f.disconnect());
    this.bandGains.forEach(g => g.disconnect());
    this.envelopeFollowers.forEach(e => e.disconnect());
    this.envelopeAnalysers.forEach(a => a.disconnect());
    
    this.carrierBandFilters = [];
    this.modulatorBandFilters = [];
    this.bandGains = [];
    this.envelopeFollowers = [];
    this.envelopeAnalysers = [];
    
    const minFreq = 100;
    const maxFreq = 10000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    
    for (let i = 0; i < numBands; i++) {
      const logFreq = logMin + (logMax - logMin) * (i / (numBands - 1));
      const centerFreq = Math.pow(10, logFreq);
      const q = numBands / 3 * this.bandwidthFactor;
      
      const carrierFilter = this.context.createBiquadFilter();
      carrierFilter.type = 'bandpass';
      carrierFilter.frequency.value = centerFreq;
      carrierFilter.Q.value = q;
      this.carrierBandFilters.push(carrierFilter);
      
      const modulatorFilter = this.context.createBiquadFilter();
      modulatorFilter.type = 'bandpass';
      modulatorFilter.frequency.value = centerFreq;
      modulatorFilter.Q.value = q;
      this.modulatorBandFilters.push(modulatorFilter);
      
      const envelopeFollower = this.context.createGain();
      envelopeFollower.gain.value = 0;
      this.envelopeFollowers.push(envelopeFollower);
      
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      this.envelopeAnalysers.push(analyser);
      
      const bandGain = this.context.createGain();
      bandGain.gain.value = 0;
      this.bandGains.push(bandGain);
      
      this.carrierInput.connect(carrierFilter);
      carrierFilter.connect(bandGain);
      
      modulatorFilter.connect(analyser);
      
      bandGain.connect(this.wetGain);
    }
    
    this.modulatorInput.connect(this.input);
    for (const filter of this.modulatorBandFilters) {
      this.input.connect(filter);
    }
    
    this.wetGain.connect(this.output);
    this.bandEnvelopeValues = new Float32Array(numBands);
    this.bandAttacks = new Float32Array(numBands);
    this.bandReleases = new Float32Array(numBands);
    this.bandLevelMultipliers = new Float32Array(numBands);
    this.initializeBandArrays();
  }
  
  private startEnvelopeTracking(): void {
    const updateEnvelopes = () => {
      const dataArray = new Uint8Array(128);
      
      for (let i = 0; i < this.numBands; i++) {
        this.envelopeAnalysers[i].getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let j = 0; j < dataArray.length; j++) {
          sum += dataArray[j];
        }
        const average = sum / dataArray.length / 255;
        
        const currentValue = this.bandEnvelopeValues[i];
        const bandAttack = this.bandAttacks[i] || this.attack;
        const bandRelease = this.bandReleases[i] || this.release;
        
        if (average > currentValue) {
          this.bandEnvelopeValues[i] = currentValue + (average - currentValue) * (1 - Math.exp(-1 / (bandAttack * 60)));
        } else {
          this.bandEnvelopeValues[i] = currentValue + (average - currentValue) * (1 - Math.exp(-1 / (bandRelease * 60)));
        }
        
        const levelMultiplier = this.bandLevelMultipliers[i] || 1.0;
        this.bandGains[i].gain.setValueAtTime(
          this.bandEnvelopeValues[i] * levelMultiplier,
          this.context.currentTime
        );
      }
      
      this.analyserTimer = requestAnimationFrame(updateEnvelopes);
    };
    
    updateEnvelopes();
  }
  
  getModulatorInput(): AudioNode {
    return this.modulatorInput;
  }
  
  getCarrierInput(): AudioNode {
    return this.carrierInput;
  }
  
  setNumBands(numBands: number): void {
    this.numBands = Math.max(8, Math.min(32, numBands));
    this.setupBands(this.numBands);
    if (this.carrierType !== 'external') {
      this.setupInternalCarrier();
    }
  }
  
  setFormantShift(semitones: number): void {
    this.formantShift = Math.max(-12, Math.min(12, semitones));
    const shiftRatio = Math.pow(2, this.formantShift / 12);
    
    for (let i = 0; i < this.modulatorBandFilters.length; i++) {
      const originalFreq = this.modulatorBandFilters[i].frequency.value;
      const shiftedFreq = Math.min(20000, Math.max(20, originalFreq * shiftRatio));
      this.carrierBandFilters[i].frequency.setValueAtTime(shiftedFreq, this.context.currentTime);
    }
  }
  
  setVoicedMix(mix: number): void {
    this.voicedMix = Math.max(0, Math.min(1, mix));
  }
  
  setUnvoicedMix(mix: number): void {
    this.unvoicedMix = Math.max(0, Math.min(1, mix));
  }
  
  setAttack(attack: number): void {
    this.attack = Math.max(0.001, Math.min(0.5, attack));
  }
  
  setRelease(release: number): void {
    this.release = Math.max(0.01, Math.min(2, release));
  }
  
  setBandAttack(bandIndex: number, attack: number): void {
    if (bandIndex >= 0 && bandIndex < this.numBands) {
      this.bandAttacks[bandIndex] = Math.max(0.001, Math.min(0.5, attack));
    }
  }
  
  setBandRelease(bandIndex: number, release: number): void {
    if (bandIndex >= 0 && bandIndex < this.numBands) {
      this.bandReleases[bandIndex] = Math.max(0.01, Math.min(2, release));
    }
  }
  
  setBandLevel(bandIndex: number, level: number): void {
    if (bandIndex >= 0 && bandIndex < this.numBands) {
      this.bandLevelMultipliers[bandIndex] = Math.max(0, Math.min(4, level));
    }
  }
  
  setAllBandLevels(levels: number[]): void {
    for (let i = 0; i < Math.min(levels.length, this.numBands); i++) {
      this.setBandLevel(i, levels[i]);
    }
  }
  
  setAllBandAttacks(attacks: number[]): void {
    for (let i = 0; i < Math.min(attacks.length, this.numBands); i++) {
      this.setBandAttack(i, attacks[i]);
    }
  }
  
  setAllBandReleases(releases: number[]): void {
    for (let i = 0; i < Math.min(releases.length, this.numBands); i++) {
      this.setBandRelease(i, releases[i]);
    }
  }
  
  resetBandLevels(): void {
    for (let i = 0; i < this.numBands; i++) {
      this.bandLevelMultipliers[i] = 1.0;
    }
  }
  
  resetBandEnvelopes(): void {
    for (let i = 0; i < this.numBands; i++) {
      this.bandAttacks[i] = this.attack;
      this.bandReleases[i] = this.release;
    }
  }
  
  setBandwidthFactor(factor: number): void {
    this.bandwidthFactor = Math.max(0.5, Math.min(2, factor));
    
    const q = this.numBands / 3 * this.bandwidthFactor;
    for (const filter of [...this.carrierBandFilters, ...this.modulatorBandFilters]) {
      filter.Q.setValueAtTime(q, this.context.currentTime);
    }
  }
  
  setCarrierType(type: 'oscillator' | 'noise' | 'external'): void {
    this.carrierType = type;
    if (type !== 'external') {
      this.setupInternalCarrier();
    } else {
      if (this.carrierOscillator) {
        this.carrierOscillator.stop();
        this.carrierOscillator.disconnect();
        this.carrierOscillator = null;
      }
      if (this.noiseNode) {
        this.noiseNode.stop();
        this.noiseNode.disconnect();
        this.noiseNode = null;
      }
    }
  }
  
  setOscillatorFrequency(frequency: number): void {
    this.oscillatorFrequency = Math.max(20, Math.min(2000, frequency));
    if (this.carrierOscillator) {
      this.carrierOscillator.frequency.setValueAtTime(this.oscillatorFrequency, this.context.currentTime);
    }
  }
  
  getBandData(): VocoderBand[] {
    const bands: VocoderBand[] = [];
    
    for (let i = 0; i < this.numBands; i++) {
      bands.push({
        frequency: this.modulatorBandFilters[i].frequency.value,
        gain: this.bandGains[i].gain.value,
        envelope: this.bandEnvelopeValues[i] || 0,
        attack: this.bandAttacks[i] || this.attack,
        release: this.bandReleases[i] || this.release,
      });
    }
    
    return bands;
  }
  
  getBandLevels(): number[] {
    return Array.from(this.bandLevelMultipliers);
  }
  
  detectVoiced(): { voiced: number; unvoiced: number } {
    const lowBands = this.bandEnvelopeValues.slice(0, Math.floor(this.numBands / 3));
    const highBands = this.bandEnvelopeValues.slice(Math.floor(this.numBands * 2 / 3));
    
    const lowEnergy = lowBands.reduce((a, b) => a + b, 0) / lowBands.length;
    const highEnergy = highBands.reduce((a, b) => a + b, 0) / highBands.length;
    
    const voicedRatio = lowEnergy / (lowEnergy + highEnergy + 0.001);
    
    return {
      voiced: voicedRatio,
      unvoiced: 1 - voicedRatio,
    };
  }
  
  applyPreset(preset: 'robot' | 'whisper' | 'choir' | 'alien' | 'deep'): void {
    switch (preset) {
      case 'robot':
        this.setNumBands(16);
        this.setFormantShift(0);
        this.setCarrierType('oscillator');
        this.setOscillatorFrequency(110);
        this.setAttack(0.005);
        this.setRelease(0.03);
        break;
      case 'whisper':
        this.setNumBands(24);
        this.setFormantShift(0);
        this.setCarrierType('noise');
        this.setAttack(0.01);
        this.setRelease(0.1);
        break;
      case 'choir':
        this.setNumBands(32);
        this.setFormantShift(0);
        this.setCarrierType('oscillator');
        this.setOscillatorFrequency(220);
        this.setAttack(0.02);
        this.setRelease(0.15);
        this.setBandwidthFactor(1.5);
        break;
      case 'alien':
        this.setNumBands(16);
        this.setFormantShift(7);
        this.setCarrierType('oscillator');
        this.setOscillatorFrequency(55);
        this.setAttack(0.003);
        this.setRelease(0.02);
        break;
      case 'deep':
        this.setNumBands(12);
        this.setFormantShift(-5);
        this.setCarrierType('oscillator');
        this.setOscillatorFrequency(55);
        this.setAttack(0.01);
        this.setRelease(0.08);
        break;
    }
  }
  
  getName(): string {
    return 'Max Booster Vocoder';
  }
  
  getParameters(): Record<string, any> {
    return {
      numBands: this.numBands,
      formantShift: this.formantShift,
      voicedMix: this.voicedMix,
      unvoicedMix: this.unvoicedMix,
      attack: this.attack,
      release: this.release,
      bandwidthFactor: this.bandwidthFactor,
      carrierType: this.carrierType,
      oscillatorFrequency: this.oscillatorFrequency,
      bandLevels: Array.from(this.bandLevelMultipliers),
      bandAttacks: Array.from(this.bandAttacks),
      bandReleases: Array.from(this.bandReleases),
      mix: this.mix,
      bypass: this.bypass,
    };
  }
  
  setParameters(params: Record<string, any>): void {
    if (params.numBands !== undefined) this.setNumBands(params.numBands);
    if (params.formantShift !== undefined) this.setFormantShift(params.formantShift);
    if (params.voicedMix !== undefined) this.setVoicedMix(params.voicedMix);
    if (params.unvoicedMix !== undefined) this.setUnvoicedMix(params.unvoicedMix);
    if (params.attack !== undefined) this.setAttack(params.attack);
    if (params.release !== undefined) this.setRelease(params.release);
    if (params.bandwidthFactor !== undefined) this.setBandwidthFactor(params.bandwidthFactor);
    if (params.carrierType !== undefined) this.setCarrierType(params.carrierType);
    if (params.oscillatorFrequency !== undefined) this.setOscillatorFrequency(params.oscillatorFrequency);
    if (params.bandLevels !== undefined) this.setAllBandLevels(params.bandLevels);
    if (params.bandAttacks !== undefined) this.setAllBandAttacks(params.bandAttacks);
    if (params.bandReleases !== undefined) this.setAllBandReleases(params.bandReleases);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
    if (params.preset !== undefined) this.applyPreset(params.preset);
  }
  
  destroy(): void {
    if (this.analyserTimer !== null) {
      cancelAnimationFrame(this.analyserTimer);
    }
    
    if (this.carrierOscillator) {
      this.carrierOscillator.stop();
      this.carrierOscillator.disconnect();
    }
    if (this.noiseNode) {
      this.noiseNode.stop();
      this.noiseNode.disconnect();
    }
    
    this.carrierBandFilters.forEach(f => f.disconnect());
    this.modulatorBandFilters.forEach(f => f.disconnect());
    this.bandGains.forEach(g => g.disconnect());
    this.envelopeFollowers.forEach(e => e.disconnect());
    this.envelopeAnalysers.forEach(a => a.disconnect());
    
    this.carrierInput.disconnect();
    this.modulatorInput.disconnect();
    
    super.destroy();
  }
}
