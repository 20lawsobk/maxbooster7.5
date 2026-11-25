import {
  NonDestructiveRenderer,
  RenderViewport,
  WaveformRenderResult,
  FadeOverlay,
} from "./NonDestructiveRenderer";

export interface TimelineRenderConfig {
  backgroundColor: string;
  waveformColor: string;
  waveformFillColor: string;
  rmsColor: string;
  playheadColor: string;
  gridColor: string;
  transientColor: string;
  selectionColor: string;
  fadeColor: string;
  clipBorderColor: string;
  clipSelectedBorderColor: string;
  antiAlias: boolean;
  showRMS: boolean;
  showTransients: boolean;
  showGrid: boolean;
  showFades: boolean;
  lineWidth: number;
  rmsLineWidth: number;
  devicePixelRatio: number;
}

export interface ClipRenderData {
  id: string;
  sourceId: string;
  name: string;
  startTime: number;
  duration: number;
  sourceOffset: number;
  color: string;
  selected: boolean;
  muted: boolean;
  gain: number;
  fadeIn?: FadeOverlay;
  fadeOut?: FadeOverlay;
  transients?: { position: number; strength: number }[];
}

export interface PlayheadState {
  position: number;
  isPlaying: boolean;
  bpm: number;
  timeSignature: [number, number];
}

interface FrameTimingState {
  lastFrameTime: number;
  deltaTime: number;
  fps: number;
  frameCount: number;
  fpsUpdateTime: number;
  targetFps: number;
  frameBudgetMs: number;
}

interface ScrollState {
  currentOffset: number;
  targetOffset: number;
  velocity: number;
  smoothingFactor: number;
}

const DEFAULT_CONFIG: TimelineRenderConfig = {
  backgroundColor: "#1a1a2e",
  waveformColor: "#4ade80",
  waveformFillColor: "rgba(74, 222, 128, 0.25)",
  rmsColor: "rgba(74, 222, 128, 0.6)",
  playheadColor: "#ef4444",
  gridColor: "rgba(255, 255, 255, 0.08)",
  transientColor: "#f59e0b",
  selectionColor: "rgba(59, 130, 246, 0.2)",
  fadeColor: "rgba(255, 255, 255, 0.15)",
  clipBorderColor: "rgba(255, 255, 255, 0.15)",
  clipSelectedBorderColor: "#3b82f6",
  antiAlias: true,
  showRMS: true,
  showTransients: true,
  showGrid: true,
  showFades: true,
  lineWidth: 1,
  rmsLineWidth: 2,
  devicePixelRatio:
    typeof window !== "undefined" ? window?.devicePixelRatio || 1 : 1,
};

export class TimelineRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private config: TimelineRenderConfig;
  private ndRenderer: NonDestructiveRenderer;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private frameTiming: FrameTimingState = {
    lastFrameTime: 0,
    deltaTime: 0,
    fps: 60,
    frameCount: 0,
    fpsUpdateTime: 0,
    targetFps: 60,
    frameBudgetMs: 16.67,
  };

  private scroll: ScrollState = {
    currentOffset: 0,
    targetOffset: 0,
    velocity: 0,
    smoothingFactor: 0.15,
  };

  private clips: ClipRenderData[] = [];
  private playhead: PlayheadState = {
    position: 0,
    isPlaying: false,
    bpm: 120,
    timeSignature: [4, 4],
  };
  private sampleRate = 44100;
  private viewDuration = 30;
  private containerWidth = 1000;
  private containerHeight = 200;

  constructor(config: Partial<TimelineRenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ndRenderer = new NonDestructiveRenderer();
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d", { alpha: false });

    this.offscreenCanvas = document?.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d", { alpha: false });

    this.resizeCanvas();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.resizeCanvas());
      observer?.observe(canvas);
    }
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.ctx) return;

    const dpr = this.config.devicePixelRatio;
    const rect = this.canvas.getBoundingClientRect();

    this.containerWidth = rect?.width;
    this.containerHeight = rect?.height;

    this.canvas.width = rect?.width * dpr;
    this.canvas.height = rect?.height * dpr;
    this.ctx.scale(dpr, dpr);

    if (this.offscreenCanvas && this.offscreenCtx) {
      this.offscreenCanvas.width = rect?.width * dpr;
      this.offscreenCanvas.height = rect?.height * dpr;
      this.offscreenCtx.scale(dpr, dpr);
    }

    this.canvas.style.width = `${rect?.width}px`;
    this.canvas.style.height = `${rect?.height}px`;
  }

  startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.frameTiming.lastFrameTime = performance?.now();
    this.frameTiming.fpsUpdateTime = performance?.now();
    this.renderFrame(performance?.now());
  }

  stopRenderLoop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderFrame = (timestamp: number): void => {
    if (!this.isRunning) return;

    this.frameTiming.deltaTime =
      (timestamp - this.frameTiming.lastFrameTime) / 1000;
    this.frameTiming.lastFrameTime = timestamp;
    this.frameTiming.frameCount++;

    if (timestamp - this.frameTiming.fpsUpdateTime >= 1000) {
      this.frameTiming.fps = this.frameTiming.frameCount;
      this.frameTiming.frameCount = 0;
      this.frameTiming.fpsUpdateTime = timestamp;
    }

    this.updateScrollPosition();

    if (this.playhead.isPlaying) {
      this.playhead.position += this.frameTiming.deltaTime;
      this.autoScrollToPlayhead();
    }

    this.drawFrame();

    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  private updateScrollPosition(): void {
    const diff = this.scroll.targetOffset - this.scroll.currentOffset;
    if (Math.abs(diff) > 0.001) {
      this.scroll.currentOffset += diff * this.scroll.smoothingFactor;
    } else {
      this.scroll.currentOffset = this.scroll.targetOffset;
    }
  }

  private autoScrollToPlayhead(): void {
    const viewInfo = this.ndRenderer.getViewportForZoom(
      this.viewDuration,
      this.containerWidth,
      this.scroll.currentOffset,
      this.ndRenderer.getDataZoom().horizontalZoom,
    );

    const visibleDuration = viewInfo?.endTime - viewInfo?.startTime;
    const edgeThreshold = visibleDuration * 0.85;

    if (this.playhead.position > viewInfo?.startTime + edgeThreshold) {
      this.scroll.targetOffset = this.playhead.position - visibleDuration * 0.1;
    }
  }

  private drawFrame(): void {
    const ctx = this.offscreenCtx || this.ctx;
    if (!ctx) return;

    const w = this.containerWidth;
    const h = this.containerHeight;

    ctx.fillStyle = this.config.backgroundColor;
    ctx?.fillRect(0, 0, w, h);

    const viewInfo = this.ndRenderer.getViewportForZoom(
      this.viewDuration,
      w,
      this.scroll.currentOffset,
      this.ndRenderer.getDataZoom().horizontalZoom,
    );

    if (this.config.showGrid) {
      this.drawGrid(ctx, viewInfo, w, h);
    }

    for (const clip of this.clips) {
      this.drawClip(ctx, clip, viewInfo, h);
    }

    this.drawPlayhead(ctx, viewInfo, w, h);

    if (this.offscreenCanvas && this.ctx) {
      this.ctx.drawImage(this.offscreenCanvas, 0, 0, w, h);
    }
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    viewInfo: { startTime: number; endTime: number; pixelsPerSecond: number },
    width: number,
    height: number,
  ): void {
    const { bpm, timeSignature } = this.playhead;
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * timeSignature[0];

    ctx.strokeStyle = this.config.gridColor;
    ctx.lineWidth = 1;

    const firstBar = Math.floor(viewInfo?.startTime / secondsPerBar);
    const lastBar = Math.ceil(viewInfo?.endTime / secondsPerBar);

    for (let bar = firstBar; bar <= lastBar; bar++) {
      const barTime = bar * secondsPerBar;
      const x = (barTime - viewInfo?.startTime) * viewInfo?.pixelsPerSecond;

      if (x < 0 || x > width) continue;

      ctx.globalAlpha = 0.3;
      ctx?.beginPath();
      ctx?.moveTo(x, 0);
      ctx?.lineTo(x, height);
      ctx?.stroke();

      ctx.globalAlpha = 0.1;
      for (let beat = 1; beat < timeSignature[0]; beat++) {
        const beatTime = barTime + beat * secondsPerBeat;
        const beatX =
          (beatTime - viewInfo?.startTime) * viewInfo?.pixelsPerSecond;
        if (beatX < 0 || beatX > width) continue;

        ctx?.beginPath();
        ctx?.moveTo(beatX, 0);
        ctx?.lineTo(beatX, height);
        ctx?.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    clip: ClipRenderData,
    viewInfo: { startTime: number; endTime: number; pixelsPerSecond: number },
    height: number,
  ): void {
    const clipEndTime = clip?.startTime + clip?.duration;
    if (clipEndTime < viewInfo?.startTime || clip?.startTime > viewInfo?.endTime)
      return;

    const clipX =
      (clip?.startTime - viewInfo?.startTime) * viewInfo?.pixelsPerSecond;
    const clipW = clip?.duration * viewInfo?.pixelsPerSecond;
    const clipH = height;
    const centerY = clipH / 2;

    ctx?.save();
    ctx?.beginPath();
    ctx?.roundRect(clipX, 1, clipW, clipH - 2, 3);
    ctx?.clip();

    ctx.fillStyle = clip?.muted ? "rgba(60, 60, 70, 0.6)" : `${clip?.color}10`;
    ctx?.fill();

    const viewport: RenderViewport = {
      x: clipX,
      y: 0,
      width: clipW,
      height: clipH,
      startTime: clip.sourceOffset,
      endTime: clip.sourceOffset + clip?.duration,
      pixelsPerSecond: viewInfo.pixelsPerSecond,
      verticalScale: this.ndRenderer.getDataZoom().verticalScale * clip?.gain,
    };

    const result = this.ndRenderer.renderWaveform(
      clip?.sourceId,
      this.sampleRate,
      viewport,
    );

    if (result && result?.path.length > 0) {
      this.drawWaveformPath(ctx, result, clip, centerY, clipH);
    }

    if (this.config.showFades) {
      if (clip?.fadeIn) this.drawFadeOverlay(ctx, clip?.fadeIn, clipH, centerY);
      if (clip?.fadeOut) this.drawFadeOverlay(ctx, clip?.fadeOut, clipH, centerY);
    }

    if (this.config.showTransients && clip?.transients) {
      this.drawTransients(ctx, clip?.transients, viewInfo, clip, clipH);
    }

    ctx.strokeStyle = clip?.selected
      ? this.config.clipSelectedBorderColor
      : this.config.clipBorderColor;
    ctx.lineWidth = clip?.selected ? 2 : 1;
    ctx?.beginPath();
    ctx?.roundRect(clipX, 1, clipW, clipH - 2, 3);
    ctx?.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx?.fillText(clip?.name, clipX + 5, 14);

    ctx?.restore();
  }

  private drawWaveformPath(
    ctx: CanvasRenderingContext2D,
    result: WaveformRenderResult,
    clip: ClipRenderData,
    centerY: number,
    clipH: number,
  ): void {
    const path = result?.path;
    const waveColor = clip?.muted ? "#555" : clip?.color;

    ctx.fillStyle = clip?.muted ? "rgba(85, 85, 85, 0.2)" : `${clip?.color}30`;
    ctx?.beginPath();
    ctx?.moveTo(path[0].x, path[0].yMax);
    for (let i = 1; i < path?.length; i++) {
      ctx?.lineTo(path[i].x, path[i].yMax);
    }
    for (let i = path?.length - 1; i >= 0; i--) {
      ctx?.lineTo(path[i].x, path[i].yMin);
    }
    ctx?.closePath();
    ctx?.fill();

    if (this.config.showRMS) {
      ctx.fillStyle = clip?.muted ? "rgba(85, 85, 85, 0.4)" : `${clip?.color}55`;
      ctx?.beginPath();
      ctx?.moveTo(path[0].x, centerY - path[0].rms * (clipH / 2));
      for (let i = 1; i < path?.length; i++) {
        ctx?.lineTo(path[i].x, centerY - path[i].rms * (clipH / 2));
      }
      for (let i = path?.length - 1; i >= 0; i--) {
        ctx?.lineTo(path[i].x, centerY + path[i].rms * (clipH / 2));
      }
      ctx?.closePath();
      ctx?.fill();
    }

    ctx.strokeStyle = waveColor;
    ctx.lineWidth = this.config.lineWidth;

    ctx?.beginPath();
    for (let i = 0; i < path?.length; i++) {
      if (i === 0) ctx?.moveTo(path[i].x, path[i].yMax);
      else ctx?.lineTo(path[i].x, path[i].yMax);
    }
    ctx?.stroke();

    ctx?.beginPath();
    for (let i = 0; i < path?.length; i++) {
      if (i === 0) ctx?.moveTo(path[i].x, path[i].yMin);
      else ctx?.lineTo(path[i].x, path[i].yMin);
    }
    ctx?.stroke();
  }

  private drawFadeOverlay(
    ctx: CanvasRenderingContext2D,
    fade: FadeOverlay,
    height: number,
    centerY: number,
  ): void {
    const fadePath = this.ndRenderer.computeFadePath(fade, height, centerY);

    ctx.fillStyle = this.config.fadeColor;
    ctx?.beginPath();
    ctx?.moveTo(fadePath[0].x, height);

    for (const point of fadePath) {
      ctx?.lineTo(point?.x, point?.y);
    }

    ctx?.lineTo(fadePath[fadePath?.length - 1].x, height);
    ctx?.closePath();
    ctx?.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx?.setLineDash([4, 4]);
    ctx?.beginPath();
    for (let i = 0; i < fadePath?.length; i++) {
      if (i === 0) ctx?.moveTo(fadePath[i].x, fadePath[i].y);
      else ctx?.lineTo(fadePath[i].x, fadePath[i].y);
    }
    ctx?.stroke();
    ctx?.setLineDash([]);
  }

  private drawTransients(
    ctx: CanvasRenderingContext2D,
    transients: { position: number; strength: number }[],
    viewInfo: { startTime: number; pixelsPerSecond: number },
    clip: ClipRenderData,
    height: number,
  ): void {
    ctx.strokeStyle = this.config.transientColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    for (const t of transients) {
      const timeSec = t?.position / this.sampleRate;
      const absTime = clip?.startTime + timeSec - clip?.sourceOffset;
      const x = (absTime - viewInfo?.startTime) * viewInfo?.pixelsPerSecond;

      const markerHeight = height * 0.3 * t?.strength;
      ctx?.beginPath();
      ctx?.moveTo(x, 0);
      ctx?.lineTo(x, markerHeight);
      ctx?.stroke();

      ctx?.beginPath();
      ctx?.moveTo(x, height);
      ctx?.lineTo(x, height - markerHeight);
      ctx?.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private drawPlayhead(
    ctx: CanvasRenderingContext2D,
    viewInfo: { startTime: number; endTime: number; pixelsPerSecond: number },
    _width: number,
    height: number,
  ): void {
    if (
      this.playhead.position < viewInfo?.startTime ||
      this.playhead.position > viewInfo?.endTime
    )
      return;

    const x =
      (this.playhead.position - viewInfo?.startTime) * viewInfo?.pixelsPerSecond;

    ctx.strokeStyle = this.config.playheadColor;
    ctx.lineWidth = 2;
    ctx?.beginPath();
    ctx?.moveTo(x, 0);
    ctx?.lineTo(x, height);
    ctx?.stroke();

    ctx.fillStyle = this.config.playheadColor;
    ctx?.beginPath();
    ctx?.moveTo(x - 6, 0);
    ctx?.lineTo(x + 6, 0);
    ctx?.lineTo(x, 8);
    ctx?.closePath();
    ctx?.fill();
  }

  setClips(clips: ClipRenderData[]): void {
    this.clips = clips;
  }

  setPlayhead(state: Partial<PlayheadState>): void {
    this.playhead = { ...this.playhead, ...state };
  }

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
  }

  setViewDuration(duration: number): void {
    this.viewDuration = duration;
  }

  scrollTo(offset: number): void {
    this.scroll.targetOffset = Math.max(0, offset);
  }

  scrollBy(delta: number): void {
    this.scroll.targetOffset = Math.max(0, this.scroll.targetOffset + delta);
  }

  zoomAtPoint(factor: number, pixelX: number): void {
    const viewInfo = this.ndRenderer.getViewportForZoom(
      this.viewDuration,
      this.containerWidth,
      this.scroll.currentOffset,
      this.ndRenderer.getDataZoom().horizontalZoom,
    );

    const timeAtCursor =
      viewInfo?.startTime +
      (pixelX / this.containerWidth) * (viewInfo?.endTime - viewInfo?.startTime);

    const currentZoom = this.ndRenderer.getDataZoom().horizontalZoom;
    const newZoom = Math.max(0.01, Math.min(1000, currentZoom * factor));
    this.ndRenderer.setHorizontalZoom(newZoom);

    const newVisibleDuration = this.viewDuration / newZoom;
    const cursorRatio = pixelX / this.containerWidth;
    this.scroll.targetOffset = timeAtCursor - cursorRatio * newVisibleDuration;
    this.scroll.currentOffset = this.scroll.targetOffset;
  }

  getRenderer(): NonDestructiveRenderer {
    return this.ndRenderer;
  }

  getConfig(): TimelineRenderConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<TimelineRenderConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getFps(): number {
    return this.frameTiming.fps;
  }

  getDeltaTime(): number {
    return this.frameTiming.deltaTime;
  }

  getScrollOffset(): number {
    return this.scroll.currentOffset;
  }

  destroy(): void {
    this.stopRenderLoop();
    this.canvas = null;
    this.ctx = null;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.clips = [];
  }
}
