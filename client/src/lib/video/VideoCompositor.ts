import type { LayerConfig, TransformConfig } from '../../../../shared/video/VideoRendererEngine';
import { DEFAULT_TRANSFORM, interpolateValue } from '../../../../shared/video/VideoRendererEngine';
import type { BlendMode } from './WebGLRenderer';

export interface CompositorOptions {
  width: number;
  height: number;
  useOffscreen?: boolean;
  maxBuffers?: number;
  enableAntialiasing?: boolean;
}

export interface CompositeLayer {
  id: string;
  canvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement;
  transform: TransformConfig;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  zIndex: number;
}

export interface PostProcessEffect {
  id: string;
  type: PostProcessEffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export type PostProcessEffectType =
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'hueRotate'
  | 'dropShadow'
  | 'colorMatrix'
  | 'vignette'
  | 'grain'
  | 'chromaKey';

export interface FrameTimingConfig {
  fps: number;
  duration: number;
  currentTime: number;
}

export interface CompositorStats {
  framesComposited: number;
  averageFrameTime: number;
  peakMemoryUsage: number;
  buffersInUse: number;
}

export class CompositorError extends Error {
  constructor(
    message: string,
    public readonly code: CompositorErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CompositorError';
  }
}

export type CompositorErrorCode =
  | 'CANVAS_CREATION_FAILED'
  | 'CONTEXT_LOST'
  | 'INVALID_LAYER'
  | 'BUFFER_OVERFLOW'
  | 'EFFECT_FAILED'
  | 'ABORTED';

interface BufferEntry {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  inUse: boolean;
  lastUsed: number;
}

export class VideoCompositor {
  private mainCanvas: HTMLCanvasElement | OffscreenCanvas;
  private mainCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;
  private useOffscreen: boolean;
  private bufferPool: BufferEntry[] = [];
  private maxBuffers: number;
  private enableAntialiasing: boolean;
  private aborted: boolean = false;
  private stats: CompositorStats = {
    framesComposited: 0,
    averageFrameTime: 0,
    peakMemoryUsage: 0,
    buffersInUse: 0,
  };
  private frameTimes: number[] = [];
  private effects: Map<string, PostProcessEffect> = new Map();

  constructor(options: CompositorOptions) {
    this.width = options.width;
    this.height = options.height;
    this.useOffscreen = options.useOffscreen ?? false;
    this.maxBuffers = options.maxBuffers ?? 8;
    this.enableAntialiasing = options.enableAntialiasing ?? true;

    if (this.useOffscreen && typeof OffscreenCanvas !== 'undefined') {
      this.mainCanvas = new OffscreenCanvas(this.width, this.height);
    } else {
      this.mainCanvas = document.createElement('canvas');
      this.mainCanvas.width = this.width;
      this.mainCanvas.height = this.height;
    }

    const ctx = this.mainCanvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false,
    });

    if (!ctx) {
      throw new CompositorError(
        'Failed to create 2D canvas context',
        'CANVAS_CREATION_FAILED'
      );
    }

    this.mainCtx = ctx;
    this.setupContext(this.mainCtx);
  }

  private setupContext(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = this.enableAntialiasing;
    ctx.imageSmoothingQuality = 'high';
  }

  private acquireBuffer(): BufferEntry {
    for (const buffer of this.bufferPool) {
      if (!buffer.inUse) {
        buffer.inUse = true;
        buffer.lastUsed = performance.now();
        this.stats.buffersInUse++;
        return buffer;
      }
    }

    if (this.bufferPool.length >= this.maxBuffers) {
      throw new CompositorError(
        `Buffer pool exhausted (max: ${this.maxBuffers})`,
        'BUFFER_OVERFLOW'
      );
    }

    const canvas = this.useOffscreen && typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(this.width, this.height)
      : (() => {
          const c = document.createElement('canvas');
          c.width = this.width;
          c.height = this.height;
          return c;
        })();

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new CompositorError('Failed to create buffer context', 'CANVAS_CREATION_FAILED');
    }

    this.setupContext(ctx);

    const entry: BufferEntry = {
      canvas,
      ctx,
      inUse: true,
      lastUsed: performance.now(),
    };

    this.bufferPool.push(entry);
    this.stats.buffersInUse++;
    return entry;
  }

  private releaseBuffer(buffer: BufferEntry): void {
    buffer.inUse = false;
    this.stats.buffersInUse--;
    buffer.ctx.clearRect(0, 0, this.width, this.height);
  }

  async compositeFrame(
    layers: CompositeLayer[],
    backgroundColor?: string,
    signal?: AbortSignal
  ): Promise<ImageData> {
    const startTime = performance.now();

    if (signal?.aborted || this.aborted) {
      throw new CompositorError('Composition aborted', 'ABORTED');
    }

    this.mainCtx.clearRect(0, 0, this.width, this.height);

    if (backgroundColor) {
      this.mainCtx.fillStyle = backgroundColor;
      this.mainCtx.fillRect(0, 0, this.width, this.height);
    }

    const sortedLayers = [...layers]
      .filter((l) => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      if (signal?.aborted || this.aborted) {
        throw new CompositorError('Composition aborted', 'ABORTED');
      }

      await this.renderLayer(layer);
    }

    if (this.effects.size > 0) {
      await this.applyEffects();
    }

    const frameTime = performance.now() - startTime;
    this.recordFrameTime(frameTime);

    return this.mainCtx.getImageData(0, 0, this.width, this.height);
  }

  private async renderLayer(layer: CompositeLayer): Promise<void> {
    const { canvas, transform, opacity, blendMode } = layer;

    this.mainCtx.save();

    this.mainCtx.globalAlpha = opacity;
    this.mainCtx.globalCompositeOperation = this.blendModeToCompositeOp(blendMode);

    const centerX = this.width * transform.anchorX;
    const centerY = this.height * transform.anchorY;

    this.mainCtx.translate(transform.x + centerX, transform.y + centerY);
    this.mainCtx.rotate(transform.rotation);
    this.mainCtx.scale(transform.scaleX, transform.scaleY);
    this.mainCtx.translate(-centerX, -centerY);

    let source: CanvasImageSource;
    if (canvas instanceof OffscreenCanvas) {
      source = await createImageBitmap(canvas);
    } else {
      source = canvas;
    }

    const sourceWidth = 'width' in source ? source.width : this.width;
    const sourceHeight = 'height' in source ? source.height : this.height;

    this.mainCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, this.width, this.height);

    this.mainCtx.restore();
  }

  private blendModeToCompositeOp(blendMode: BlendMode): GlobalCompositeOperation {
    const mapping: Record<BlendMode, GlobalCompositeOperation> = {
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
      darken: 'darken',
      lighten: 'lighten',
      colorDodge: 'color-dodge',
      colorBurn: 'color-burn',
      hardLight: 'hard-light',
      softLight: 'soft-light',
      difference: 'difference',
      exclusion: 'exclusion',
      hue: 'hue',
      saturation: 'saturation',
      color: 'color',
      luminosity: 'luminosity',
      add: 'lighter',
      subtract: 'difference',
    };

    return mapping[blendMode] ?? 'source-over';
  }

  addEffect(effect: PostProcessEffect): void {
    this.effects.set(effect.id, effect);
  }

  removeEffect(effectId: string): boolean {
    return this.effects.delete(effectId);
  }

  setEffectEnabled(effectId: string, enabled: boolean): void {
    const effect = this.effects.get(effectId);
    if (effect) {
      effect.enabled = enabled;
    }
  }

  updateEffectParams(effectId: string, params: Partial<Record<string, number | string | boolean>>): void {
    const effect = this.effects.get(effectId);
    if (effect) {
      effect.params = { ...effect.params, ...params };
    }
  }

  private async applyEffects(): Promise<void> {
    const enabledEffects = Array.from(this.effects.values()).filter((e) => e.enabled);
    if (enabledEffects.length === 0) return;

    const filters: string[] = [];

    for (const effect of enabledEffects) {
      const filter = this.effectToFilter(effect);
      if (filter) {
        filters.push(filter);
      }
    }

    if (filters.length > 0) {
      const buffer = this.acquireBuffer();
      try {
        buffer.ctx.filter = filters.join(' ');
        buffer.ctx.drawImage(this.mainCanvas, 0, 0);

        this.mainCtx.clearRect(0, 0, this.width, this.height);
        this.mainCtx.drawImage(buffer.canvas, 0, 0);
      } finally {
        this.releaseBuffer(buffer);
      }
    }

    for (const effect of enabledEffects) {
      if (effect.type === 'vignette') {
        this.applyVignette(effect.params);
      } else if (effect.type === 'grain') {
        await this.applyGrain(effect.params);
      } else if (effect.type === 'chromaKey') {
        this.applyChromaKey(effect.params);
      }
    }
  }

  private effectToFilter(effect: PostProcessEffect): string | null {
    const { type, params } = effect;

    switch (type) {
      case 'blur':
        return `blur(${params.radius ?? 5}px)`;
      case 'brightness':
        return `brightness(${params.amount ?? 1})`;
      case 'contrast':
        return `contrast(${params.amount ?? 1})`;
      case 'saturate':
        return `saturate(${params.amount ?? 1})`;
      case 'grayscale':
        return `grayscale(${params.amount ?? 1})`;
      case 'sepia':
        return `sepia(${params.amount ?? 1})`;
      case 'invert':
        return `invert(${params.amount ?? 1})`;
      case 'hueRotate':
        return `hue-rotate(${params.degrees ?? 0}deg)`;
      case 'dropShadow':
        return `drop-shadow(${params.offsetX ?? 0}px ${params.offsetY ?? 0}px ${params.blur ?? 5}px ${params.color ?? '#000000'})`;
      default:
        return null;
    }
  }

  private applyVignette(params: Record<string, number | string | boolean>): void {
    const intensity = (params.intensity as number) ?? 0.5;
    const size = (params.size as number) ?? 0.5;

    const gradient = this.mainCtx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.width * size * 0.3,
      this.width / 2,
      this.height / 2,
      this.width * size
    );

    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);

    this.mainCtx.fillStyle = gradient;
    this.mainCtx.fillRect(0, 0, this.width, this.height);
  }

  private async applyGrain(params: Record<string, number | string | boolean>): Promise<void> {
    const intensity = (params.intensity as number) ?? 0.1;
    const size = (params.size as number) ?? 1;

    const imageData = this.mainCtx.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4 * size) {
      const noise = (Math.random() - 0.5) * intensity * 255;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }

    this.mainCtx.putImageData(imageData, 0, 0);
  }

  private applyChromaKey(params: Record<string, number | string | boolean>): void {
    const keyColor = (params.color as string) ?? '#00ff00';
    const tolerance = (params.tolerance as number) ?? 0.3;

    const imageData = this.mainCtx.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;

    const keyR = parseInt(keyColor.slice(1, 3), 16);
    const keyG = parseInt(keyColor.slice(3, 5), 16);
    const keyB = parseInt(keyColor.slice(5, 7), 16);

    const maxDist = 441.67 * tolerance;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const dist = Math.sqrt(
        Math.pow(r - keyR, 2) + Math.pow(g - keyG, 2) + Math.pow(b - keyB, 2)
      );

      if (dist < maxDist) {
        const alpha = Math.min(255, (dist / maxDist) * 255);
        data[i + 3] = alpha;
      }
    }

    this.mainCtx.putImageData(imageData, 0, 0);
  }

  async renderFrame(
    timestamp: number,
    timing: FrameTimingConfig,
    layers: CompositeLayer[],
    backgroundColor?: string
  ): Promise<ImageData> {
    const frameNumber = Math.floor(timestamp * timing.fps);
    const normalizedTime = timestamp / timing.duration;

    return this.compositeFrame(layers, backgroundColor);
  }

  async renderSequence(
    timing: FrameTimingConfig,
    layerProvider: (frameNumber: number, timestamp: number) => CompositeLayer[] | Promise<CompositeLayer[]>,
    onFrame?: (imageData: ImageData, frameNumber: number) => void,
    signal?: AbortSignal,
    backgroundColor?: string
  ): Promise<ImageData[]> {
    const frames: ImageData[] = [];
    const totalFrames = Math.ceil(timing.duration * timing.fps);

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted || this.aborted) {
        throw new CompositorError('Sequence rendering aborted', 'ABORTED');
      }

      const timestamp = frame / timing.fps;
      const layers = await layerProvider(frame, timestamp);
      const imageData = await this.compositeFrame(layers, backgroundColor, signal);

      frames.push(imageData);

      if (onFrame) {
        onFrame(imageData, frame);
      }
    }

    return frames;
  }

  private recordFrameTime(time: number): void {
    this.frameTimes.push(time);
    if (this.frameTimes.length > 100) {
      this.frameTimes.shift();
    }

    this.stats.framesComposited++;
    this.stats.averageFrameTime =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  getCanvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.mainCanvas;
  }

  getContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    return this.mainCtx;
  }

  getStats(): CompositorStats {
    return { ...this.stats };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.mainCanvas instanceof HTMLCanvasElement) {
      this.mainCanvas.width = width;
      this.mainCanvas.height = height;
    } else {
      this.mainCanvas.width = width;
      this.mainCanvas.height = height;
    }

    for (const buffer of this.bufferPool) {
      if (buffer.canvas instanceof HTMLCanvasElement) {
        buffer.canvas.width = width;
        buffer.canvas.height = height;
      } else {
        buffer.canvas.width = width;
        buffer.canvas.height = height;
      }
    }

    this.setupContext(this.mainCtx);
  }

  abort(): void {
    this.aborted = true;
  }

  reset(): void {
    this.aborted = false;
    this.effects.clear();
    this.stats = {
      framesComposited: 0,
      averageFrameTime: 0,
      peakMemoryUsage: 0,
      buffersInUse: 0,
    };
    this.frameTimes = [];
  }

  dispose(): void {
    this.abort();
    this.bufferPool = [];
    this.effects.clear();
  }

  static createDefaultTransform(): TransformConfig {
    return { ...DEFAULT_TRANSFORM };
  }

  static createLayer(
    id: string,
    canvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement,
    options?: Partial<Omit<CompositeLayer, 'id' | 'canvas'>>
  ): CompositeLayer {
    return {
      id,
      canvas,
      transform: options?.transform ?? { ...DEFAULT_TRANSFORM },
      opacity: options?.opacity ?? 1,
      blendMode: options?.blendMode ?? 'normal',
      visible: options?.visible ?? true,
      zIndex: options?.zIndex ?? 0,
    };
  }

  static createEffect(
    id: string,
    type: PostProcessEffectType,
    params?: Record<string, number | string | boolean>
  ): PostProcessEffect {
    return {
      id,
      type,
      enabled: true,
      params: params ?? {},
    };
  }
}

export function interpolateTransform(
  from: TransformConfig,
  to: TransformConfig,
  progress: number
): TransformConfig {
  return {
    x: interpolateValue(from.x, to.x, progress),
    y: interpolateValue(from.y, to.y, progress),
    scaleX: interpolateValue(from.scaleX, to.scaleX, progress),
    scaleY: interpolateValue(from.scaleY, to.scaleY, progress),
    rotation: interpolateValue(from.rotation, to.rotation, progress),
    anchorX: interpolateValue(from.anchorX, to.anchorX, progress),
    anchorY: interpolateValue(from.anchorY, to.anchorY, progress),
  };
}

export function calculateFrameNumber(timestamp: number, fps: number): number {
  return Math.floor(timestamp * fps);
}

export function calculateTimestamp(frameNumber: number, fps: number): number {
  return frameNumber / fps;
}
