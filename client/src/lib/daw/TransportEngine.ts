export interface TempoEvent {
  id: string;
  time: number;
  tempo: number;
  curve: "instant" | "linear" | "exponential";
}

export interface TimeSignatureEvent {
  id: string;
  bar: number;
  numerator: number;
  denominator: number;
}

export interface TransportEngineState {
  sampleRate: number;
  bufferSize: number;
  currentSample: number;
  isPlaying: boolean;
  isRecording: boolean;
  isLooping: boolean;
  loopStartSample: number;
  loopEndSample: number;
  tempoMap: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  prerollEnabled: boolean;
  prerollBars: number;
  countInEnabled: boolean;
  countInBars: number;
  metronomeEnabled: boolean;
  inputLatencySamples: number;
  outputLatencySamples: number;
  pluginLatencySamples: number;
}

export interface MusicalPosition {
  bar: number;
  beat: number;
  tick: number;
  totalBeats: number;
}

export interface TimePosition {
  samples: number;
  seconds: number;
  musical: MusicalPosition;
}

export type TransportEventType =
  | "play"
  | "pause"
  | "stop"
  | "record"
  | "position-change"
  | "tempo-change"
  | "loop-change"
  | "preroll-start"
  | "preroll-end"
  | "count-in-beat";

export interface TransportEvent {
  type: TransportEventType;
  time: number;
  data?: Record<string, unknown>;
}

type TransportListener = (event: TransportEvent) => void;

const TICKS_PER_BEAT = 960;

export class TransportEngine {
  private state: TransportEngineState;
  private listeners: Map<TransportEventType | "*", Set<TransportListener>> =
    new Map();
  private animationFrameId: number | null = null;
  private lastTickTime: number = 0;
  private audioContext: AudioContext | null = null;

  constructor(sampleRate: number = 48000, bufferSize: number = 512) {
    this.state = {
      sampleRate,
      bufferSize,
      currentSample: 0,
      isPlaying: false,
      isRecording: false,
      isLooping: false,
      loopStartSample: 0,
      loopEndSample: sampleRate * 16,
      tempoMap: [{ id: "initial", time: 0, tempo: 120, curve: "instant" }],
      timeSignatures: [{ id: "initial", bar: 1, numerator: 4, denominator: 4 }],
      prerollEnabled: false,
      prerollBars: 1,
      countInEnabled: false,
      countInBars: 1,
      metronomeEnabled: false,
      inputLatencySamples: 0,
      outputLatencySamples: 0,
      pluginLatencySamples: 0,
    };
  }

  setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
    this.state.sampleRate = ctx.sampleRate;
  }

  getState(): Readonly<TransportEngineState> {
    return { ...this.state };
  }

  getCurrentPosition(): TimePosition {
    return this.sampleToPosition(this.state.currentSample);
  }

  sampleToPosition(samples: number): TimePosition {
    const seconds = samples / this.state.sampleRate;
    const musical = this.secondsToMusical(seconds);
    return { samples, seconds, musical };
  }

  positionToSamples(position: MusicalPosition): number {
    const seconds = this.musicalToSeconds(position);
    return Math.round(seconds * this.state.sampleRate);
  }

  secondsToMusical(seconds: number): MusicalPosition {
    let remainingSeconds = seconds;
    let totalBeats = 0;
    let currentBar = 1;
    let currentBeat = 1;

    const tempo = this.getTempoAtTime(seconds);
    const beatsPerSecond = tempo / 60;
    totalBeats = seconds * beatsPerSecond;

    const ts = this.getTimeSignatureAtBar(1);
    const beatsPerBar = ts.numerator;

    const fullBars = Math.floor(totalBeats / beatsPerBar);
    currentBar = fullBars + 1;
    const remainingBeats = totalBeats - fullBars * beatsPerBar;
    currentBeat = Math.floor(remainingBeats) + 1;
    const tick = Math.round((remainingBeats % 1) * TICKS_PER_BEAT);

    return { bar: currentBar, beat: currentBeat, tick, totalBeats };
  }

  musicalToSeconds(position: MusicalPosition): number {
    const ts = this.getTimeSignatureAtBar(position.bar);
    const beatsPerBar = ts.numerator;
    const totalBeats =
      (position.bar - 1) * beatsPerBar +
      (position.beat - 1) +
      position.tick / TICKS_PER_BEAT;
    const tempo = this.getTempoAtBar(position.bar);
    return totalBeats * (60 / tempo);
  }

  getTempoAtTime(seconds: number): number {
    let tempo = 120;
    for (const event of this.state.tempoMap) {
      if (event.time <= seconds) {
        tempo = event.tempo;
      }
    }
    return tempo;
  }

  getTempoAtBar(bar: number): number {
    const seconds = this.barToSeconds(bar);
    return this.getTempoAtTime(seconds);
  }

  barToSeconds(bar: number): number {
    const ts = this.getTimeSignatureAtBar(bar);
    const beatsPerBar = ts.numerator;
    const tempo = this.state.tempoMap[0]?.tempo || 120;
    const totalBeats = (bar - 1) * beatsPerBar;
    return totalBeats * (60 / tempo);
  }

  getTimeSignatureAtBar(bar: number): TimeSignatureEvent {
    let ts = this.state.timeSignatures[0];
    for (const event of this.state.timeSignatures) {
      if (event.bar <= bar) {
        ts = event;
      }
    }
    return ts;
  }

  getTotalLatencySamples(): number {
    return (
      this.state.inputLatencySamples +
      this.state.outputLatencySamples +
      this.state.pluginLatencySamples
    );
  }

  getCompensatedPosition(): number {
    return Math.max(
      0,
      this.state.currentSample - this.getTotalLatencySamples(),
    );
  }

  setPluginLatency(samples: number): void {
    this.state.pluginLatencySamples = samples;
  }

  addTempoEvent(event: Omit<TempoEvent, "id">): string {
    const id = `tempo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newEvent = { ...event, id };
    this.state.tempoMap.push(newEvent);
    this.state.tempoMap.sort((a, b) => a.time - b.time);
    this.emit({
      type: "tempo-change",
      time: performance.now(),
      data: newEvent,
    });
    return id;
  }

  removeTempoEvent(id: string): void {
    const index = this.state.tempoMap.findIndex((e) => e.id === id);
    if (index > 0) {
      this.state.tempoMap.splice(index, 1);
      this.emit({ type: "tempo-change", time: performance.now() });
    }
  }

  addTimeSignature(event: Omit<TimeSignatureEvent, "id">): string {
    const id = `ts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newEvent = { ...event, id };
    this.state.timeSignatures.push(newEvent);
    this.state.timeSignatures.sort((a, b) => a.bar - b.bar);
    return id;
  }

  play(): void {
    if (this.state.isPlaying) return;

    if (this.state.countInEnabled && !this.state.isRecording) {
      this.performCountIn().then(() => {
        this.startPlayback();
      });
    } else if (this.state.prerollEnabled) {
      this.performPreroll();
      this.startPlayback();
    } else {
      this.startPlayback();
    }
  }

  private async performCountIn(): Promise<void> {
    const ts = this.getTimeSignatureAtBar(1);
    const tempo = this.getTempoAtTime(0);
    const beatDuration = 60000 / tempo;

    for (let i = 0; i < this.state.countInBars * ts.numerator; i++) {
      this.emit({
        type: "count-in-beat",
        time: performance.now(),
        data: { beat: i + 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, beatDuration));
    }
  }

  private performPreroll(): void {
    const ts = this.getTimeSignatureAtBar(1);
    const tempo = this.getTempoAtTime(0);
    const beatsPerBar = ts.numerator;
    const prerollBeats = this.state.prerollBars * beatsPerBar;
    const prerollSeconds = prerollBeats * (60 / tempo);
    const prerollSamples = Math.round(prerollSeconds * this.state.sampleRate);

    this.state.currentSample = Math.max(
      0,
      this.state.currentSample - prerollSamples,
    );
    this.emit({ type: "preroll-start", time: performance.now() });
  }

  private startPlayback(): void {
    this.state.isPlaying = true;
    this.lastTickTime = performance.now();
    this.emit({ type: "play", time: performance.now() });
    this.startAnimationLoop();
  }

  pause(): void {
    this.state.isPlaying = false;
    this.stopAnimationLoop();
    this.emit({ type: "pause", time: performance.now() });
  }

  stop(): void {
    this.state.isPlaying = false;
    this.state.isRecording = false;
    this.state.currentSample = 0;
    this.stopAnimationLoop();
    this.emit({ type: "stop", time: performance.now() });
    this.emit({
      type: "position-change",
      time: performance.now(),
      data: this.getCurrentPosition(),
    });
  }

  record(): void {
    this.state.isRecording = true;
    this.emit({ type: "record", time: performance.now() });
    this.play();
  }

  setPosition(samples: number): void {
    this.state.currentSample = Math.max(0, samples);
    this.emit({
      type: "position-change",
      time: performance.now(),
      data: this.getCurrentPosition(),
    });
  }

  setPositionBars(bar: number, beat: number = 1, tick: number = 0): void {
    const samples = this.positionToSamples({ bar, beat, tick, totalBeats: 0 });
    this.setPosition(samples);
  }

  setLoop(enabled: boolean, startSamples?: number, endSamples?: number): void {
    this.state.isLooping = enabled;
    if (startSamples !== undefined) this.state.loopStartSample = startSamples;
    if (endSamples !== undefined) this.state.loopEndSample = endSamples;
    this.emit({
      type: "loop-change",
      time: performance.now(),
      data: {
        enabled: this.state.isLooping,
        start: this.state.loopStartSample,
        end: this.state.loopEndSample,
      },
    });
  }

  setTempo(tempo: number): void {
    if (tempo < 20 || tempo > 999) return;
    if (this.state.tempoMap.length > 0) {
      this.state.tempoMap[0].tempo = tempo;
    }
    this.emit({
      type: "tempo-change",
      time: performance.now(),
      data: { tempo },
    });
  }

  private startAnimationLoop(): void {
    const tick = () => {
      if (!this.state.isPlaying) return;

      const now = performance.now();
      const deltaMs = now - this.lastTickTime;
      this.lastTickTime = now;

      this.getTempoAtTime(
        this.state.currentSample / this.state.sampleRate,
      );
      const samplesPerMs = this.state.sampleRate / 1000;
      const deltaSamples = Math.round(deltaMs * samplesPerMs);

      this.state.currentSample += deltaSamples;

      if (
        this.state.isLooping &&
        this.state.currentSample >= this.state.loopEndSample
      ) {
        this.state.currentSample = this.state.loopStartSample;
      }

      this.emit({
        type: "position-change",
        time: now,
        data: this.getCurrentPosition(),
      });
      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  on(type: TransportEventType | "*", listener: TransportListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.off(type, listener);
  }

  off(type: TransportEventType | "*", listener: TransportListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(event: TransportEvent): void {
    this.listeners.get(event.type)?.forEach((l) => l(event));
    this.listeners.get("*")?.forEach((l) => l(event));
  }

  dispose(): void {
    this.stopAnimationLoop();
    this.listeners.clear();
  }
}

export const transportEngine = new TransportEngine();
