import { timelineEngine } from '../timeline/TimelineEngine';

export type TransportMode = 'stopped' | 'playing' | 'recording' | 'scrubbing';

export interface TransportEvent {
  type: 'play' | 'pause' | 'stop' | 'record' | 'seek' | 'loop' | 'tempo' | 'timesig';
  timestamp: number;
  data?: any;
}

export interface LatencyCompensation {
  inputLatencySamples: number;
  outputLatencySamples: number;
  pluginLatencySamples: number;
  totalLatencySamples: number;
  compensationDelaySamples: number;
}

export class TransportAuthority {
  private sampleRate: number = 48000;
  private positionSamples: number = 0;
  private mode: TransportMode = 'stopped';
  private isLooping: boolean = false;
  private loopStartSamples: number = 0;
  private loopEndSamples: number = 0;
  private isCountingIn: boolean = false;
  private countInBars: number = 1;
  private countInPositionSamples: number = 0;
  private prerollBars: number = 0;
  
  private latencyCompensation: LatencyCompensation = {
    inputLatencySamples: 0,
    outputLatencySamples: 0,
    pluginLatencySamples: 0,
    totalLatencySamples: 0,
    compensationDelaySamples: 0,
  };
  
  private eventListeners: Set<(event: TransportEvent) => void> = new Set();
  private positionListeners: Set<(samples: number) => void> = new Set();
  
  private animationFrameId: number | null = null;
  private lastUpdateTime: number = 0;
  
  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
    timelineEngine.setSampleRate(sampleRate);
  }
  
  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
    timelineEngine.setSampleRate(sampleRate);
  }
  
  getSampleRate(): number {
    return this.sampleRate;
  }
  
  getPositionSamples(): number {
    return this.positionSamples;
  }
  
  getPositionSeconds(): number {
    return this.positionSamples / this.sampleRate;
  }
  
  getPositionBeats(): number {
    return timelineEngine.samplesToBeats(this.positionSamples);
  }
  
  getPosition() {
    return timelineEngine.getPosition(this.getPositionBeats());
  }
  
  getMode(): TransportMode {
    return this.mode;
  }
  
  isPlaying(): boolean {
    return this.mode === 'playing' || this.mode === 'recording';
  }
  
  isRecording(): boolean {
    return this.mode === 'recording';
  }
  
  play(): void {
    if (this.mode === 'stopped' || this.mode === 'scrubbing') {
      if (this.countInBars > 0) {
        this.startCountIn();
      } else {
        this.startPlayback();
      }
    }
  }
  
  private startCountIn(): void {
    this.isCountingIn = true;
    const tempo = timelineEngine.getTempoAtBeat(this.getPositionBeats());
    const timeSig = timelineEngine.getTimeSignatureAtBeat(this.getPositionBeats());
    const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
    const countInBeats = this.countInBars * beatsPerBar;
    const countInSeconds = (countInBeats * 60) / tempo;
    this.countInPositionSamples = -Math.round(countInSeconds * this.sampleRate);
    
    this.mode = 'playing';
    this.lastUpdateTime = performance.now();
    this.startUpdateLoop();
    this.emitEvent({ type: 'play', timestamp: Date.now() });
  }
  
  private startPlayback(): void {
    if (this.prerollBars > 0) {
      const tempo = timelineEngine.getTempoAtBeat(this.getPositionBeats());
      const timeSig = timelineEngine.getTimeSignatureAtBeat(this.getPositionBeats());
      const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
      const prerollBeats = this.prerollBars * beatsPerBar;
      const prerollSamples = timelineEngine.beatsToSamples(prerollBeats);
      this.positionSamples = Math.max(0, this.positionSamples - prerollSamples);
    }
    
    this.mode = 'playing';
    this.isCountingIn = false;
    this.lastUpdateTime = performance.now();
    this.startUpdateLoop();
    this.emitEvent({ type: 'play', timestamp: Date.now() });
  }
  
  pause(): void {
    if (this.mode === 'playing' || this.mode === 'recording') {
      this.mode = 'stopped';
      this.stopUpdateLoop();
      this.emitEvent({ type: 'pause', timestamp: Date.now() });
    }
  }
  
  stop(): void {
    this.mode = 'stopped';
    this.isCountingIn = false;
    this.positionSamples = 0;
    this.stopUpdateLoop();
    this.notifyPositionListeners();
    this.emitEvent({ type: 'stop', timestamp: Date.now() });
  }
  
  record(): void {
    if (this.mode !== 'recording') {
      if (this.countInBars > 0 && this.mode === 'stopped') {
        this.isCountingIn = true;
        const tempo = timelineEngine.getTempoAtBeat(this.getPositionBeats());
        const timeSig = timelineEngine.getTimeSignatureAtBeat(this.getPositionBeats());
        const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
        const countInBeats = this.countInBars * beatsPerBar;
        const countInSeconds = (countInBeats * 60) / tempo;
        this.countInPositionSamples = -Math.round(countInSeconds * this.sampleRate);
      }
      
      this.mode = 'recording';
      this.lastUpdateTime = performance.now();
      this.startUpdateLoop();
      this.emitEvent({ type: 'record', timestamp: Date.now() });
    }
  }
  
  seek(samples: number): void {
    this.positionSamples = Math.max(0, samples);
    this.notifyPositionListeners();
    this.emitEvent({ type: 'seek', timestamp: Date.now(), data: { samples } });
  }
  
  seekToBeats(beats: number): void {
    this.seek(timelineEngine.beatsToSamples(beats));
  }
  
  seekToSeconds(seconds: number): void {
    this.seek(Math.round(seconds * this.sampleRate));
  }
  
  seekToBar(bar: number, beat: number = 1, subBeat: number = 0): void {
    const beats = timelineEngine.barsBeatsToBeats(bar, beat, subBeat);
    this.seekToBeats(beats);
  }
  
  setLoop(enabled: boolean, startSamples?: number, endSamples?: number): void {
    this.isLooping = enabled;
    if (startSamples !== undefined) this.loopStartSamples = startSamples;
    if (endSamples !== undefined) this.loopEndSamples = endSamples;
    this.emitEvent({ 
      type: 'loop', 
      timestamp: Date.now(), 
      data: { enabled, start: this.loopStartSamples, end: this.loopEndSamples } 
    });
  }
  
  setLoopBeats(enabled: boolean, startBeats?: number, endBeats?: number): void {
    const startSamples = startBeats !== undefined ? timelineEngine.beatsToSamples(startBeats) : undefined;
    const endSamples = endBeats !== undefined ? timelineEngine.beatsToSamples(endBeats) : undefined;
    this.setLoop(enabled, startSamples, endSamples);
  }
  
  getLoopRegion(): { enabled: boolean; startSamples: number; endSamples: number } {
    return {
      enabled: this.isLooping,
      startSamples: this.loopStartSamples,
      endSamples: this.loopEndSamples,
    };
  }
  
  setCountIn(bars: number): void {
    this.countInBars = bars;
  }
  
  setPreroll(bars: number): void {
    this.prerollBars = bars;
  }
  
  setLatencyCompensation(compensation: Partial<LatencyCompensation>): void {
    Object.assign(this.latencyCompensation, compensation);
    this.latencyCompensation.totalLatencySamples = 
      this.latencyCompensation.inputLatencySamples +
      this.latencyCompensation.outputLatencySamples +
      this.latencyCompensation.pluginLatencySamples;
  }
  
  getLatencyCompensation(): LatencyCompensation {
    return { ...this.latencyCompensation };
  }
  
  getCompensatedPositionSamples(): number {
    return this.positionSamples + this.latencyCompensation.compensationDelaySamples;
  }
  
  private startUpdateLoop(): void {
    if (this.animationFrameId !== null) return;
    
    const update = () => {
      const now = performance.now();
      const deltaMs = now - this.lastUpdateTime;
      this.lastUpdateTime = now;
      
      if (this.mode === 'playing' || this.mode === 'recording') {
        const tempo = timelineEngine.getTempoAtBeat(this.getPositionBeats());
        const beatsPerSecond = tempo / 60;
        const beatsAdvanced = beatsPerSecond * (deltaMs / 1000);
        const samplesAdvanced = timelineEngine.beatsToSamples(this.getPositionBeats() + beatsAdvanced) - 
                               timelineEngine.beatsToSamples(this.getPositionBeats());
        
        if (this.isCountingIn) {
          this.countInPositionSamples += samplesAdvanced;
          if (this.countInPositionSamples >= 0) {
            this.isCountingIn = false;
          }
        } else {
          this.positionSamples += samplesAdvanced;
          
          if (this.isLooping && this.positionSamples >= this.loopEndSamples) {
            this.positionSamples = this.loopStartSamples + 
              (this.positionSamples - this.loopEndSamples);
          }
        }
        
        this.notifyPositionListeners();
      }
      
      if (this.mode === 'playing' || this.mode === 'recording') {
        this.animationFrameId = requestAnimationFrame(update);
      }
    };
    
    this.animationFrameId = requestAnimationFrame(update);
  }
  
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  onEvent(listener: (event: TransportEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  
  onPositionChange(listener: (samples: number) => void): () => void {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }
  
  private emitEvent(event: TransportEvent): void {
    this.eventListeners.forEach(listener => listener(event));
  }
  
  private notifyPositionListeners(): void {
    const pos = this.isCountingIn ? this.countInPositionSamples : this.positionSamples;
    this.positionListeners.forEach(listener => listener(pos));
  }
  
  dispose(): void {
    this.stopUpdateLoop();
    this.eventListeners.clear();
    this.positionListeners.clear();
  }
}

export const transportAuthority = new TransportAuthority();
