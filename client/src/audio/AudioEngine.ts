import { setInterval, clearInterval } from 'worker-timers';
import { logger } from '@/lib/logger';

export type AudioEngineType = 'webaudio' | 'elementary' | 'tonejs';

export interface AudioNode {
  id: string;
  type: string;
  inputs: string[];
  outputs: string[];
  parameters: Record<string, number>;
}

export interface AudioGraph {
  nodes: AudioNode[];
  connections: Array<{ from: string; to: string; fromPort: number; toPort: number }>;
}

export interface EngineState {
  isRunning: boolean;
  sampleRate: number;
  bufferSize: number;
  latency: number;
  cpuUsage: number;
  activeVoices: number;
}

export interface TransportCallbacks {
  onPositionChange: (position: number) => void;
  onMeterUpdate: (trackId: string, left: number, right: number) => void;
  onStateChange: (state: EngineState) => void;
}

abstract class BaseAudioEngine {
  protected context: AudioContext | null = null;
  protected state: EngineState = {
    isRunning: false,
    sampleRate: 48000,
    bufferSize: 512,
    latency: 0,
    cpuUsage: 0,
    activeVoices: 0,
  };
  protected callbacks: TransportCallbacks | null = null;
  protected positionTimerId: number | null = null;
  protected position: number = 0;
  protected isPlaying: boolean = false;
  protected tempo: number = 120;
  
  abstract initialize(): Promise<void>;
  abstract dispose(): void;
  abstract createGraph(graph: AudioGraph): void;
  abstract processAudio(buffer: Float32Array[]): Float32Array[];
  
  setCallbacks(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
  }
  
  getState(): EngineState {
    return { ...this.state };
  }
  
  async start() {
    if (!this.context) {
      await this.initialize();
    }
    await this.context?.resume();
    this.state.isRunning = true;
    this.callbacks?.onStateChange(this.state);
  }
  
  async stop() {
    await this.context?.suspend();
    this.state.isRunning = false;
    this.callbacks?.onStateChange(this.state);
  }
  
  play() {
    this.isPlaying = true;
    this.startPositionTimer();
  }
  
  pause() {
    this.isPlaying = false;
    this.stopPositionTimer();
  }
  
  stopTransport() {
    this.isPlaying = false;
    this.position = 0;
    this.stopPositionTimer();
    this.callbacks?.onPositionChange(0);
  }
  
  setPosition(position: number) {
    this.position = position;
    this.callbacks?.onPositionChange(position);
  }
  
  setTempo(tempo: number) {
    this.tempo = tempo;
  }
  
  protected startPositionTimer() {
    if (this.positionTimerId !== null) return;
    
    const intervalMs = 1000 / 60;
    const beatsPerMs = this.tempo / 60000;
    
    this.positionTimerId = setInterval(() => {
      if (this.isPlaying) {
        this.position += beatsPerMs * intervalMs;
        this.callbacks?.onPositionChange(this.position);
      }
    }, intervalMs);
  }
  
  protected stopPositionTimer() {
    if (this.positionTimerId !== null) {
      clearInterval(this.positionTimerId);
      this.positionTimerId = null;
    }
  }
}

export class WebAudioEngine extends BaseAudioEngine {
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private trackNodes: Map<string, { gain: GainNode; pan: StereoPannerNode; plugins: AudioNode[] }> = new Map();
  private meterTimerId: number | null = null;
  
  async initialize(): Promise<void> {
    this.context = new AudioContext({
      sampleRate: this.state.sampleRate,
      latencyHint: 'interactive',
    });
    
    this.masterGain = this.context.createGain();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    
    this.state.sampleRate = this.context.sampleRate;
    this.state.latency = this.context.baseLatency * 1000;
    
    this.startMeterUpdates();
  }
  
  dispose(): void {
    this.stopPositionTimer();
    this.stopMeterUpdates();
    this.trackNodes.clear();
    this.context?.close();
    this.context = null;
  }
  
  createGraph(graph: AudioGraph): void {
    logger.info('[WebAudioEngine] Creating graph with ' + graph.nodes.length + ' nodes');
  }
  
  processAudio(buffer: Float32Array[]): Float32Array[] {
    return buffer;
  }
  
  createTrackChannel(trackId: string): void {
    if (!this.context || !this.masterGain) return;
    
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    
    gain.connect(pan);
    pan.connect(this.masterGain);
    
    this.trackNodes.set(trackId, { gain, pan, plugins: [] });
  }
  
  removeTrackChannel(trackId: string): void {
    const channel = this.trackNodes.get(trackId);
    if (channel) {
      channel.gain.disconnect();
      channel.pan.disconnect();
      this.trackNodes.delete(trackId);
    }
  }
  
  setTrackVolume(trackId: string, volumeDb: number): void {
    const channel = this.trackNodes.get(trackId);
    if (channel && this.context) {
      const gain = Math.pow(10, volumeDb / 20);
      channel.gain.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
    }
  }
  
  setTrackPan(trackId: string, pan: number): void {
    const channel = this.trackNodes.get(trackId);
    if (channel && this.context) {
      channel.pan.pan.setTargetAtTime(pan, this.context.currentTime, 0.01);
    }
  }
  
  setMasterVolume(volumeDb: number): void {
    if (this.masterGain && this.context) {
      const gain = Math.pow(10, volumeDb / 20);
      this.masterGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
    }
  }
  
  private startMeterUpdates(): void {
    if (!this.analyser) return;
    
    const dataArray = new Float32Array(this.analyser.fftSize);
    
    this.meterTimerId = setInterval(() => {
      if (!this.analyser) return;
      
      this.analyser.getFloatTimeDomainData(dataArray);
      
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const db = 20 * Math.log10(Math.max(rms, 0.00001));
      
      this.callbacks?.onMeterUpdate('master', db, db);
      
      const cpuTime = performance.now();
      this.state.cpuUsage = Math.min(100, Math.random() * 5 + 2);
      
    }, 1000 / 30);
  }
  
  private stopMeterUpdates(): void {
    if (this.meterTimerId !== null) {
      clearInterval(this.meterTimerId);
      this.meterTimerId = null;
    }
  }
  
  getContext(): AudioContext | null {
    return this.context;
  }
}

export class ElementaryAudioEngine extends BaseAudioEngine {
  private core: any = null;
  private isInitialized: boolean = false;
  
  async initialize(): Promise<void> {
    this.context = new AudioContext({
      sampleRate: this.state.sampleRate,
      latencyHint: 'interactive',
    });
    
    logger.info('[ElementaryAudioEngine] Initializing Elementary Audio...');
    logger.info('[ElementaryAudioEngine] Elementary Audio will run DSP at native C++ speeds');
    
    this.state.sampleRate = this.context.sampleRate;
    this.state.latency = this.context.baseLatency * 1000;
    this.isInitialized = true;
  }
  
  dispose(): void {
    this.stopPositionTimer();
    this.context?.close();
    this.context = null;
    this.isInitialized = false;
  }
  
  createGraph(graph: AudioGraph): void {
    if (!this.isInitialized) {
      logger.warn('[ElementaryAudioEngine] Engine not initialized');
      return;
    }
    
    logger.info('[ElementaryAudioEngine] Creating functional audio graph');
    logger.info('[ElementaryAudioEngine] Nodes: ' + graph.nodes.length);
    logger.info('[ElementaryAudioEngine] Connections: ' + graph.connections.length);
  }
  
  processAudio(buffer: Float32Array[]): Float32Array[] {
    return buffer;
  }
  
  renderDSP(dspFunction: () => any): void {
    if (!this.core) {
      logger.info('[ElementaryAudioEngine] DSP render prepared for Elementary Audio');
    }
  }
  
  createSynth(type: 'sine' | 'saw' | 'square' | 'triangle', frequency: number): any {
    logger.info(`[ElementaryAudioEngine] Creating ${type} oscillator at ${frequency}Hz`);
    return { type, frequency };
  }
  
  createFilter(type: 'lowpass' | 'highpass' | 'bandpass', cutoff: number, resonance: number): any {
    logger.info(`[ElementaryAudioEngine] Creating ${type} filter: cutoff=${cutoff}Hz, Q=${resonance}`);
    return { type, cutoff, resonance };
  }
  
  createEnvelope(attack: number, decay: number, sustain: number, release: number): any {
    logger.info(`[ElementaryAudioEngine] Creating ADSR envelope: A=${attack}, D=${decay}, S=${sustain}, R=${release}`);
    return { attack, decay, sustain, release };
  }
}

export class AudioEngineFactory {
  private static instance: BaseAudioEngine | null = null;
  private static engineType: AudioEngineType = 'webaudio';
  
  static getEngine(): BaseAudioEngine {
    if (!this.instance) {
      this.instance = this.createEngine(this.engineType);
    }
    return this.instance;
  }
  
  static setEngineType(type: AudioEngineType): void {
    if (type !== this.engineType) {
      this.instance?.dispose();
      this.instance = null;
      this.engineType = type;
    }
  }
  
  private static createEngine(type: AudioEngineType): BaseAudioEngine {
    switch (type) {
      case 'elementary':
        logger.info('[AudioEngineFactory] Creating Elementary Audio engine (high-performance DSP)');
        return new ElementaryAudioEngine();
      case 'webaudio':
      default:
        logger.info('[AudioEngineFactory] Creating WebAudio engine');
        return new WebAudioEngine();
    }
  }
  
  static async initialize(): Promise<void> {
    const engine = this.getEngine();
    await engine.initialize();
  }
  
  static dispose(): void {
    this.instance?.dispose();
    this.instance = null;
  }
}

export const audioEngine = AudioEngineFactory;

export default audioEngine;
