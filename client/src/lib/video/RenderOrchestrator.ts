import type {
  VideoProject,
  LayerConfig,
  TransformConfig,
  Keyframe,
  RenderProgress,
  BackgroundConfig,
  VisualizerConfig,
  TextConfig,
  ImageConfig,
  ShapeConfig,
  ParticleConfig,
} from '../../../../shared/video/VideoRendererEngine';
import { DEFAULT_TRANSFORM, interpolateValue, interpolateColor, EASING_FUNCTIONS } from '../../../../shared/video/VideoRendererEngine';
import { Scene, Layer, getEasingFunction, type EasingName } from './SceneGraph';
import { AudioAnalyzer, generateMockAudioData, type AudioAnalysisData } from './AudioAnalyzer';
import { TextAnimator, type TextStyle, type AnimationConfig as TextAnimationConfig } from './TextAnimator';
import { LyricEngine } from './LyricEngine';
import { SpectrumVisualizer } from './visualizers/SpectrumVisualizer';
import { WaveformVisualizer } from './visualizers/WaveformVisualizer';
import { CircularVisualizer } from './visualizers/CircularVisualizer';
import { ParticleVisualizer } from './visualizers/ParticleVisualizer';
import type { AudioReactiveBinding } from './TemplateCompiler';
import {
  getBrowserCapabilities,
  type BrowserCapabilities,
} from './BrowserCapabilities';

export type OrchestratorState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'exporting' | 'error';

export interface OrchestratorEvents {
  onStateChange?: (state: OrchestratorState) => void;
  onTimeUpdate?: (time: number) => void;
  onProgress?: (progress: RenderProgress) => void;
  onError?: (error: Error) => void;
  onFrameRendered?: (frameNumber: number, timestamp: number) => void;
  onLoadComplete?: () => void;
}

export interface OrchestratorOptions {
  width?: number;
  height?: number;
  fps?: number;
  useOffscreen?: boolean;
  enableAudioAnalysis?: boolean;
  mockAudio?: boolean;
  audioElement?: HTMLAudioElement;
  events?: OrchestratorEvents;
}

interface VisualizerInstance {
  type: 'spectrum' | 'waveform' | 'circular' | 'particle';
  instance: SpectrumVisualizer | WaveformVisualizer | CircularVisualizer | ParticleVisualizer;
  layerId: string;
}

interface ImageCache {
  image: HTMLImageElement | ImageBitmap;
  loaded: boolean;
}

export class RenderOrchestrator {
  private state: OrchestratorState = 'idle';
  private project: VideoProject | null = null;
  private scene: Scene | null = null;
  
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fps: number;
  
  private audioAnalyzer: AudioAnalyzer | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private enableAudioAnalysis: boolean;
  private mockAudio: boolean;
  
  private textAnimator: TextAnimator | null = null;
  private lyricEngine: LyricEngine | null = null;
  private visualizers: Map<string, VisualizerInstance> = new Map();
  private imageCache: Map<string, ImageCache> = new Map();
  
  private currentTime: number = 0;
  private duration: number = 0;
  private isPlaying: boolean = false;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  
  private audioReactiveBindings: AudioReactiveBinding[] = [];
  private events: OrchestratorEvents;
  private capabilities: BrowserCapabilities | null = null;
  
  private exportMode: boolean = false;
  private exportFrameCallback: ((time: number) => void) | null = null;

  constructor(options: OrchestratorOptions = {}) {
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.fps = options.fps ?? 30;
    this.enableAudioAnalysis = options.enableAudioAnalysis ?? true;
    this.mockAudio = options.mockAudio ?? false;
    this.audioElement = options.audioElement ?? null;
    this.events = options.events ?? {};

    if (options.useOffscreen && typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(this.width, this.height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('Failed to create 2D rendering context');
    }
    this.ctx = ctx;

    this.textAnimator = new TextAnimator(
      this.ctx as CanvasRenderingContext2D,
      this.width,
      this.height
    );
  }

  async initialize(): Promise<void> {
    this.capabilities = await getBrowserCapabilities();
    
    if (this.enableAudioAnalysis) {
      this.audioAnalyzer = new AudioAnalyzer();
      await this.audioAnalyzer.initialize();
      
      if (this.audioElement) {
        this.audioAnalyzer.connectAudioElement(this.audioElement);
      }
    }
  }

  async loadProject(project: VideoProject, audioReactiveBindings: AudioReactiveBinding[] = []): Promise<void> {
    this.setState('loading');
    
    try {
      this.project = project;
      this.audioReactiveBindings = audioReactiveBindings;
      
      if (project.width !== this.width || project.height !== this.height) {
        this.resize(project.width, project.height);
      }
      
      this.fps = project.fps;
      this.duration = project.duration;
      this.currentTime = 0;

      this.scene = new Scene({
        width: project.width,
        height: project.height,
        fps: project.fps,
        duration: project.duration,
        backgroundColor: project.backgroundColor,
      }, project.id);

      for (const layerConfig of project.layers) {
        const layer = new Layer(layerConfig);
        this.scene.addLayer(layer);
      }

      for (const keyframe of project.keyframes) {
        const layer = this.scene.getLayer(keyframe.layerId);
        if (layer) {
          layer.addKeyframe(
            keyframe.property,
            keyframe.time,
            keyframe.value as number | string | number[],
            keyframe.easing as EasingName
          );
        }
      }

      await this.initializeRenderers(project.layers);

      if (project.audioUrl && this.enableAudioAnalysis) {
        await this.loadAudio(project.audioUrl);
      }

      this.setState('ready');
      this.events.onLoadComplete?.();
    } catch (error) {
      this.setState('error');
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  private async initializeRenderers(layers: LayerConfig[]): Promise<void> {
    this.visualizers.clear();
    this.imageCache.clear();

    const loadPromises: Promise<void>[] = [];

    for (const layer of layers) {
      if (layer.type === 'visualizer') {
        this.createVisualizer(layer);
      } else if (layer.type === 'image') {
        const imageConfig = layer.config as ImageConfig;
        if (imageConfig.src) {
          loadPromises.push(this.loadImage(layer.id, imageConfig.src));
        }
      }
    }

    await Promise.all(loadPromises);
  }

  private createVisualizer(layer: LayerConfig): void {
    const config = layer.config as VisualizerConfig;
    let instance: VisualizerInstance['instance'];
    let type: VisualizerInstance['type'];

    switch (config.type) {
      case 'spectrum':
      case 'bars':
        type = 'spectrum';
        instance = new SpectrumVisualizer({
          barCount: config.barCount ?? 64,
          barWidth: config.barWidth ?? 8,
          barGap: config.barGap ?? 2,
          color: config.color,
          secondaryColor: config.secondaryColor ?? config.color,
          sensitivity: config.sensitivity ?? 1.5,
          glow: config.glow ?? true,
          glowColor: config.color,
          glowIntensity: config.glowIntensity ?? 0.8,
          mirror: config.mirror ?? false,
        });
        break;

      case 'waveform':
      case 'oscilloscope':
        type = 'waveform';
        instance = new WaveformVisualizer({
          sampleCount: 256,
          color: config.color,
          lineWidth: config.lineWidth ?? 2,
          glow: config.glow ?? true,
          glowColor: config.color,
          glowIntensity: config.glowIntensity ?? 0.6,
        });
        break;

      case 'circular':
        type = 'circular';
        instance = new CircularVisualizer({
          barCount: config.barCount ?? 64,
          innerRadius: config.radius ?? 100,
          outerRadius: (config.radius ?? 100) + 100,
          color: config.color,
          secondaryColor: config.secondaryColor ?? config.color,
          glow: config.glow ?? true,
          glowIntensity: config.glowIntensity ?? 0.8,
        });
        break;

      case 'particles':
        type = 'particle';
        instance = new ParticleVisualizer({
          maxParticles: 500,
          color: config.color,
          size: { min: 2, max: 6 },
          speed: { min: 0.5, max: 2 },
        });
        break;

      default:
        return;
    }

    this.visualizers.set(layer.id, { type, instance, layerId: layer.id });
  }

  private async loadImage(layerId: string, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        this.imageCache.set(layerId, { image: img, loaded: true });
        resolve();
      };
      
      img.onerror = () => {
        this.imageCache.set(layerId, { image: img, loaded: false });
        resolve();
      };
      
      img.src = src;
    });
  }

  private async loadAudio(url: string): Promise<void> {
    if (!this.audioAnalyzer) return;
    
    try {
      await this.audioAnalyzer.loadAudio(url);
    } catch (error) {
      console.warn('Failed to load audio for analysis:', error);
    }
  }

  play(): void {
    if (this.state !== 'ready' && this.state !== 'paused') return;
    
    this.isPlaying = true;
    this.setState('playing');
    this.lastFrameTime = performance.now();
    this.startRenderLoop();
    
    if (this.audioElement) {
      this.audioElement.currentTime = this.currentTime;
      this.audioElement.play();
    }
  }

  pause(): void {
    if (this.state !== 'playing') return;
    
    this.isPlaying = false;
    this.setState('paused');
    this.stopRenderLoop();
    
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  stop(): void {
    this.pause();
    this.seek(0);
  }

  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
    
    if (this.scene) {
      this.scene.setTime(this.currentTime);
    }
    
    if (this.audioElement) {
      this.audioElement.currentTime = this.currentTime;
    }
    
    this.events.onTimeUpdate?.(this.currentTime);
    
    if (!this.isPlaying) {
      this.renderFrame(this.currentTime);
    }
  }

  private startRenderLoop(): void {
    const frameInterval = 1000 / this.fps;
    
    const loop = () => {
      if (!this.isPlaying) return;
      
      const now = performance.now();
      const elapsed = now - this.lastFrameTime;
      
      if (elapsed >= frameInterval) {
        this.currentTime += elapsed / 1000;
        
        if (this.currentTime >= this.duration) {
          this.currentTime = 0;
          if (this.audioElement) {
            this.audioElement.currentTime = 0;
          }
        }
        
        this.renderFrame(this.currentTime);
        this.lastFrameTime = now - (elapsed % frameInterval);
        
        this.events.onTimeUpdate?.(this.currentTime);
      }
      
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopRenderLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  renderFrame(time: number): void {
    if (!this.project || !this.scene) return;

    this.ctx.save();
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = this.project.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.scene.setTime(time);

    const audioData = this.getAudioData(time);

    const activeLayers = this.scene.getActiveLayersAtTime(time)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of activeLayers) {
      this.renderLayer(layer, time, audioData);
    }

    this.ctx.restore();

    const frameNumber = Math.floor(time * this.fps);
    this.events.onFrameRendered?.(frameNumber, time);

    if (this.exportFrameCallback) {
      this.exportFrameCallback(time);
    }
  }

  private getAudioData(time: number): AudioAnalysisData {
    if (this.mockAudio || !this.audioAnalyzer) {
      return generateMockAudioData(time, 120);
    }
    return this.audioAnalyzer.getAnalysisData();
  }

  private renderLayer(layer: Layer, time: number, audioData: AudioAnalysisData): void {
    const config = layer.toLayerConfig();
    const transform = layer.state.transform;
    const opacity = layer.state.opacity;

    if (opacity <= 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    
    this.applyTransform(transform);
    this.applyAudioReactivity(layer.id, audioData);

    switch (config.type) {
      case 'background':
        this.renderBackground(config.config as BackgroundConfig);
        break;
      case 'text':
        this.renderText(config, time);
        break;
      case 'image':
        this.renderImage(config);
        break;
      case 'shape':
        this.renderShape(config.config as ShapeConfig, transform);
        break;
      case 'visualizer':
        this.renderVisualizer(layer.id, audioData, time);
        break;
      case 'particle':
        this.renderParticles(config.config as ParticleConfig, time, audioData);
        break;
    }

    this.ctx.restore();
  }

  private applyTransform(transform: TransformConfig): void {
    const anchorX = this.width * transform.anchorX;
    const anchorY = this.height * transform.anchorY;
    
    this.ctx.translate(transform.x + anchorX, transform.y + anchorY);
    this.ctx.rotate(transform.rotation);
    this.ctx.scale(transform.scaleX, transform.scaleY);
    this.ctx.translate(-anchorX, -anchorY);
  }

  private applyAudioReactivity(layerId: string, audioData: AudioAnalysisData): void {
    const bindings = this.audioReactiveBindings.filter(b => b.layerId === layerId);
    
    for (const binding of bindings) {
      let value = 0;
      switch (binding.frequencyRange) {
        case 'bass':
          value = audioData.bass;
          break;
        case 'mid':
          value = audioData.mid;
          break;
        case 'high':
          value = audioData.treble;
          break;
        case 'full':
          value = audioData.average;
          break;
      }
      
      const effect = value * binding.intensity;
      
      switch (binding.property) {
        case 'scale':
          this.ctx.scale(1 + effect * 0.1, 1 + effect * 0.1);
          break;
        case 'opacity':
          this.ctx.globalAlpha *= (1 - effect * 0.3);
          break;
        case 'rotation':
          this.ctx.rotate(effect * 0.1);
          break;
      }
    }
  }

  private renderBackground(config: BackgroundConfig): void {
    switch (config.type) {
      case 'solid':
        this.ctx.fillStyle = config.color || '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);
        break;
        
      case 'gradient':
        const gradient = this.createLinearGradient(config.colors || [], config.angle || 0);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        break;
        
      case 'radialGradient':
        const radialGradient = this.createRadialGradient(config.colors || []);
        this.ctx.fillStyle = radialGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        break;
        
      case 'image':
        if (config.imageUrl) {
          const cached = this.imageCache.get(config.imageUrl);
          if (cached?.loaded) {
            this.ctx.drawImage(cached.image, 0, 0, this.width, this.height);
          }
        }
        break;
    }
  }

  private createLinearGradient(colors: string[], angle: number): CanvasGradient {
    const angleRad = (angle * Math.PI) / 180;
    const x1 = this.width / 2 - Math.cos(angleRad) * this.width / 2;
    const y1 = this.height / 2 - Math.sin(angleRad) * this.height / 2;
    const x2 = this.width / 2 + Math.cos(angleRad) * this.width / 2;
    const y2 = this.height / 2 + Math.sin(angleRad) * this.height / 2;
    
    const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
    colors.forEach((color, i) => {
      gradient.addColorStop(i / Math.max(1, colors.length - 1), color);
    });
    return gradient;
  }

  private createRadialGradient(colors: string[]): CanvasGradient {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.max(this.width, this.height) / 2;
    
    const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    colors.forEach((color, i) => {
      gradient.addColorStop(i / Math.max(1, colors.length - 1), color);
    });
    return gradient;
  }

  private renderText(config: LayerConfig, time: number): void {
    const textConfig = config.config as TextConfig;
    const transform = config.transform || DEFAULT_TRANSFORM;
    
    const style: TextStyle = {
      font: textConfig.font,
      fontSize: textConfig.fontSize,
      fontWeight: '600',
      color: textConfig.color,
      strokeColor: textConfig.strokeColor,
      strokeWidth: textConfig.strokeWidth,
    };

    if (textConfig.shadow) {
      style.shadowColor = textConfig.shadow.color;
      style.shadowBlur = textConfig.shadow.blur;
      style.shadowOffsetX = textConfig.shadow.offsetX;
      style.shadowOffsetY = textConfig.shadow.offsetY;
    }

    if (this.textAnimator) {
      this.textAnimator.renderText(
        textConfig.text,
        transform.x,
        transform.y,
        style
      );
    }
  }

  private renderImage(config: LayerConfig): void {
    const imageConfig = config.config as ImageConfig;
    const transform = config.transform || DEFAULT_TRANSFORM;
    
    const cached = this.imageCache.get(config.id);
    if (!cached?.loaded) return;
    
    const img = cached.image;
    let drawWidth = imageConfig.width || img.width;
    let drawHeight = imageConfig.height || img.height;
    
    if (imageConfig.fit === 'contain') {
      const scale = Math.min(
        drawWidth / img.width,
        drawHeight / img.height
      );
      drawWidth = img.width * scale;
      drawHeight = img.height * scale;
    } else if (imageConfig.fit === 'cover') {
      const scale = Math.max(
        drawWidth / img.width,
        drawHeight / img.height
      );
      drawWidth = img.width * scale;
      drawHeight = img.height * scale;
    }
    
    const x = transform.x - drawWidth / 2;
    const y = transform.y - drawHeight / 2;
    
    if (imageConfig.borderRadius) {
      this.ctx.save();
      this.roundRect(x, y, drawWidth, drawHeight, imageConfig.borderRadius);
      this.ctx.clip();
    }
    
    this.ctx.drawImage(img, x, y, drawWidth, drawHeight);
    
    if (imageConfig.borderRadius) {
      this.ctx.restore();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  private renderShape(config: ShapeConfig, transform: TransformConfig): void {
    const x = transform.x;
    const y = transform.y;
    
    this.ctx.beginPath();
    
    switch (config.type) {
      case 'rectangle':
        const w = config.width || 100;
        const h = config.height || 100;
        if (config.cornerRadius) {
          this.roundRect(x - w / 2, y - h / 2, w, h, config.cornerRadius);
        } else {
          this.ctx.rect(x - w / 2, y - h / 2, w, h);
        }
        break;
        
      case 'circle':
        this.ctx.arc(x, y, config.radius || 50, 0, Math.PI * 2);
        break;
        
      case 'triangle':
        const size = config.radius || 50;
        this.ctx.moveTo(x, y - size);
        this.ctx.lineTo(x + size * 0.866, y + size * 0.5);
        this.ctx.lineTo(x - size * 0.866, y + size * 0.5);
        this.ctx.closePath();
        break;
        
      case 'polygon':
        const points = config.points || 6;
        const radius = config.radius || 50;
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * radius;
          const py = y + Math.sin(angle) * radius;
          if (i === 0) {
            this.ctx.moveTo(px, py);
          } else {
            this.ctx.lineTo(px, py);
          }
        }
        this.ctx.closePath();
        break;
        
      case 'line':
        const lineWidth = config.width || 100;
        this.ctx.moveTo(x - lineWidth / 2, y);
        this.ctx.lineTo(x + lineWidth / 2, y);
        break;
    }
    
    if (config.fill) {
      this.ctx.fillStyle = config.fill;
      this.ctx.fill();
    }
    
    if (config.stroke) {
      this.ctx.strokeStyle = config.stroke;
      this.ctx.lineWidth = config.strokeWidth || 1;
      this.ctx.stroke();
    }
  }

  private renderVisualizer(layerId: string, audioData: AudioAnalysisData, time: number): void {
    const visualizer = this.visualizers.get(layerId);
    if (!visualizer) return;
    
    visualizer.instance.render(
      this.ctx as CanvasRenderingContext2D,
      audioData,
      this.width,
      this.height,
      time
    );
  }

  private renderParticles(config: ParticleConfig, time: number, audioData: AudioAnalysisData): void {
    const particleVisualizer = new ParticleVisualizer({
      maxParticles: config.count,
      color: typeof config.color === 'string' ? config.color : config.color[0],
      size: config.size,
      speed: config.speed,
      shape: config.shape,
      emissionArea: config.emissionArea,
      audioReactive: config.reactToAudio,
      audioSensitivity: config.audioSensitivity,
    });
    
    particleVisualizer.render(
      this.ctx as CanvasRenderingContext2D,
      audioData,
      this.width,
      this.height,
      time
    );
  }

  getCanvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas;
  }

  getContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    return this.ctx;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  getState(): OrchestratorState {
    return this.state;
  }

  getProject(): VideoProject | null {
    return this.project;
  }

  getCapabilities(): BrowserCapabilities | null {
    return this.capabilities;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = width;
      this.canvas.height = height;
    } else {
      (this.canvas as OffscreenCanvas).width = width;
      (this.canvas as OffscreenCanvas).height = height;
    }
    
    if (this.textAnimator) {
      this.textAnimator.updateDimensions(width, height);
    }
    
    if (this.lyricEngine) {
      this.lyricEngine.updateDimensions(width, height);
    }
  }

  setAudioElement(audioElement: HTMLAudioElement): void {
    this.audioElement = audioElement;
    
    if (this.audioAnalyzer && this.enableAudioAnalysis) {
      this.audioAnalyzer.connectAudioElement(audioElement);
    }
  }

  setExportMode(enabled: boolean, frameCallback?: (time: number) => void): void {
    this.exportMode = enabled;
    this.exportFrameCallback = frameCallback || null;
    
    if (enabled) {
      this.setState('exporting');
    } else if (this.state === 'exporting') {
      this.setState('ready');
    }
  }

  async exportFrame(frameNumber: number): Promise<void> {
    const timestamp = frameNumber / this.fps;
    this.renderFrame(timestamp);
  }

  getFrameRenderer(): (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    frameNumber: number,
    timestamp: number
  ) => void {
    return (canvas, frameNumber, timestamp) => {
      this.renderFrame(timestamp);
      
      const targetCtx = canvas.getContext('2d');
      if (targetCtx) {
        targetCtx.drawImage(this.canvas as CanvasImageSource, 0, 0);
      }
    };
  }

  private setState(state: OrchestratorState): void {
    this.state = state;
    this.events.onStateChange?.(state);
  }

  dispose(): void {
    this.stopRenderLoop();
    
    if (this.audioAnalyzer) {
      this.audioAnalyzer.dispose();
      this.audioAnalyzer = null;
    }
    
    for (const visualizer of this.visualizers.values()) {
      visualizer.instance.dispose();
    }
    this.visualizers.clear();
    
    this.imageCache.clear();
    this.scene = null;
    this.project = null;
    this.textAnimator = null;
    this.lyricEngine = null;
    
    this.setState('idle');
  }
}

export function createOrchestrator(options: OrchestratorOptions = {}): RenderOrchestrator {
  return new RenderOrchestrator(options);
}
