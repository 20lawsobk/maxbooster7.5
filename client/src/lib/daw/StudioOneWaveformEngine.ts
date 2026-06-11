import { PeakCacheEngine, peakCacheEngine, PeakData } from "./PeakCacheEngine";
import {
  NonDestructiveRenderer,
  nonDestructiveRenderer,
  DataZoomState,
} from "./NonDestructiveRenderer";
import {
  TimelineRenderer,
  TimelineRenderConfig,
  ClipRenderData,
  PlayheadState,
} from "./TimelineRenderer";
import {
  TransformRenderer,
  transformRenderer,
  ProcessingChain,
  TransformEvent,
} from "./TransformRenderer";

export interface StudioOneEngineConfig {
  sampleRate: number;
  bpm: number;
  timeSignature: [number, number];
  maxCacheSizeMB: number;
  renderConfig: Partial<TimelineRenderConfig>;
}

export interface EngineStats {
  fps: number;
  deltaTime: number;
  cacheUtilization: number;
  cacheEntries: number;
  totalCacheBytes: number;
  clipCount: number;
  currentZoom: number;
  verticalScale: number;
  scrollOffset: number;
  isPlaying: boolean;
  playheadPosition: number;
}

const DEFAULT_ENGINE_CONFIG: StudioOneEngineConfig = {
  sampleRate: 44100,
  bpm: 120,
  timeSignature: [4, 4],
  maxCacheSizeMB: 256,
  renderConfig: {},
};

export class StudioOneWaveformEngine {
  private peakCache: PeakCacheEngine;
  private ndRenderer: NonDestructiveRenderer;
  private timeline: TimelineRenderer;
  private transform: TransformRenderer;
  private config: StudioOneEngineConfig;
  private canvas: HTMLCanvasElement | null = null;
  private initialized = false;

  constructor(config: Partial<StudioOneEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.peakCache = peakCacheEngine;
    this.ndRenderer = nonDestructiveRenderer;
    this.timeline = new TimelineRenderer(this?.config.renderConfig);
    this.transform = transformRenderer;
  }

  initialize(canvas: HTMLCanvasElement): void {
    if (this?.initialized) return;

    this.canvas = canvas;
    this?.timeline.attach(canvas);
    this?.timeline.setSampleRate(this?.config.sampleRate);
    this?.timeline.setPlayhead({
      bpm: this.config.bpm,
      timeSignature: this.config.timeSignature,
    });

    this.initialized = true;
  }

  start(): void {
    if (!this?.initialized) return;
    this?.timeline.startRenderLoop();
  }

  stop(): void {
    this?.timeline.stopRenderLoop();
  }

  loadAudio(
    sourceId: string,
    audioData: Float32Array,
    sampleRate?: number,
    channels?: number,
  ): void {
    const sr = sampleRate || this?.config.sampleRate;
    this?.peakCache.generatePeakCache(sourceId, audioData, sr, channels || 1);
  }

  loadAudioBuffer(sourceId: string, buffer: AudioBuffer): void {
    const channelData = buffer?.getChannelData(0);
    this?.peakCache.generatePeakCache(
      sourceId,
      channelData,
      buffer?.sampleRate,
      buffer?.numberOfChannels,
    );
  }

  setClips(clips: ClipRenderData[]): void {
    this?.timeline.setClips(clips);
  }

  addClip(clip: ClipRenderData): void {
    const currentClips = this?.getClips();
    currentClips?.push(clip);
    this?.timeline.setClips(currentClips);
  }

  removeClip(clipId: string): void {
    const currentClips = this?.getClips().filter((c) => c?.id !== clipId);
    this?.timeline.setClips(currentClips);
  }

  private getClips(): ClipRenderData[] {
    return [];
  }

  play(fromPosition?: number): void {
    if (fromPosition !== undefined) {
      this?.timeline.setPlayhead({ position: fromPosition });
    }
    this?.timeline.setPlayhead({ isPlaying: true });
  }

  pause(): void {
    this?.timeline.setPlayhead({ isPlaying: false });
  }

  seek(position: number): void {
    this?.timeline.setPlayhead({ position });
  }

  setBpm(bpm: number): void {
    this.config.bpm = bpm;
    this?.timeline.setPlayhead({ bpm });
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.config.timeSignature = [numerator, denominator];
    this?.timeline.setPlayhead({ timeSignature: [numerator, denominator] });
  }

  zoomIn(factor: number = 1.5, atPixelX?: number): void {
    const x =
      atPixelX ?? (this?.canvas?.getBoundingClientRect().width ?? 500) / 2;
    this?.timeline.zoomAtPoint(factor, x);
  }

  zoomOut(factor: number = 1.5, atPixelX?: number): void {
    const x =
      atPixelX ?? (this?.canvas?.getBoundingClientRect().width ?? 500) / 2;
    this?.timeline.zoomAtPoint(1 / factor, x);
  }

  setVerticalScale(scale: number): void {
    this?.ndRenderer.setVerticalScale(scale);
  }

  getVerticalScale(): number {
    return this?.ndRenderer.getDataZoom().verticalScale;
  }

  setDataZoom(zoom: Partial<DataZoomState>): void {
    this?.ndRenderer.setDataZoom(zoom);
  }

  scrollTo(timeOffset: number): void {
    this?.timeline.scrollTo(timeOffset);
  }

  scrollBy(timeDelta: number): void {
    this?.timeline.scrollBy(timeDelta);
  }

  registerProcessingChain(sourceId: string, chain: ProcessingChain): void {
    this?.transform.registerSource(sourceId, chain);
  }

  async renderToAudio(
    sourceId: string,
    audioContext?: AudioContext,
  ): Promise<Float32Array | null> {
    return this?.transform.renderTransform(sourceId, audioContext);
  }

  onTransformEvent(listener: (event: TransformEvent) => void): () => void {
    return this?.transform.addEventListener(listener);
  }

  getPeaks(
    sourceId: string,
    startSample: number,
    endSample: number,
    targetWidth: number,
  ): PeakData[] | null {
    const result = this?.peakCache.getPeaksForView(
      sourceId,
      startSample,
      endSample,
      targetWidth,
    );
    return result?.peaks ?? null;
  }

  detectTransients(
    sourceId: string,
    threshold?: number,
  ): { position: number; strength: number }[] {
    return this?.peakCache.detectTransients(sourceId, threshold);
  }

  updateRenderConfig(config: Partial<TimelineRenderConfig>): void {
    this?.timeline.updateConfig(config);
  }

  setViewDuration(duration: number): void {
    this?.timeline.setViewDuration(duration);
  }

  getStats(): EngineStats {
    const cacheStats = this?.peakCache.getCacheStats();
    const dataZoom = this?.ndRenderer.getDataZoom();

    return {
      fps: this.timeline.getFps(),
      deltaTime: this.timeline.getDeltaTime(),
      cacheUtilization: cacheStats.utilizationPercent,
      cacheEntries: cacheStats.entries,
      totalCacheBytes: cacheStats.totalBytes,
      clipCount: 0,
      currentZoom: dataZoom.horizontalZoom,
      verticalScale: dataZoom.verticalScale,
      scrollOffset: this.timeline.getScrollOffset(),
      isPlaying: false,
      playheadPosition: 0,
    };
  }

  invalidateSource(sourceId: string): void {
    this?.peakCache.invalidateCache(sourceId);
  }

  clearCache(): void {
    this?.peakCache.clearAll();
  }

  destroy(): void {
    this?.stop();
    this?.timeline.destroy();
    this?.transform.destroy();
    this.initialized = false;
    this.canvas = null;
  }
}

export const studioOneWaveformEngine = new StudioOneWaveformEngine();

export {
  PeakCacheEngine,
  peakCacheEngine,
  NonDestructiveRenderer,
  nonDestructiveRenderer,
  TimelineRenderer,
  TransformRenderer,
  transformRenderer,
};

export type {
  PeakData,
  DataZoomState,
  TimelineRenderConfig,
  ClipRenderData,
  PlayheadState,
  ProcessingChain,
  TransformEvent,
};
