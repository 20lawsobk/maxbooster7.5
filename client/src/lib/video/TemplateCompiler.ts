import type {
  VideoProject,
  LayerConfig,
  TransformConfig,
  Keyframe,
  BackgroundConfig as BaseBackgroundConfig,
  VisualizerConfig,
  TextConfig,
  ImageConfig,
  ShapeConfig,
  ParticleConfig,
} from '../../../../shared/video/VideoRendererEngine';
import { DEFAULT_TRANSFORM } from '../../../../shared/video/VideoRendererEngine';
import type { EasingName } from './SceneGraph';
import {
  type PromoTemplateOptions,
  type ReleaseAnnouncementOptions,
  type TourEventOptions,
  type BehindTheScenesOptions,
  type QuoteLyricOptions,
  type CountdownTimerOptions,
  type SplitScreenOptions,
  type SocialTeaserOptions,
  type CompiledTemplate,
  type TemplateLayer,
  type AspectRatio,
  type ColorPalette,
  type BackgroundConfig,
  type AudioReactiveConfig,
  ASPECT_RATIOS,
  compileReleaseAnnouncement,
  compileTourEvent,
  compileBehindTheScenes,
  compileQuoteLyric,
  compileCountdownTimer,
  compileSplitScreen,
  compileSocialTeaser,
} from './templates/PromoTemplates';

export interface CompilerOptions {
  optimizeForExport?: boolean;
  targetFps?: number;
  generateThumbnail?: boolean;
  audioAnalysis?: boolean;
}

export interface CompilationResult {
  project: VideoProject;
  layers: LayerConfig[];
  keyframes: Keyframe[];
  audioReactiveBindings: AudioReactiveBinding[];
  metadata: CompilationMetadata;
}

export interface AudioReactiveBinding {
  layerId: string;
  property: string;
  frequencyRange: 'bass' | 'mid' | 'high' | 'full';
  intensity: number;
  smoothing: number;
}

export interface CompilationMetadata {
  templateType: string;
  compiledAt: string;
  aspectRatio: AspectRatio;
  estimatedRenderTime: number;
  layerCount: number;
  keyframeCount: number;
  hasAudioReactive: boolean;
  hasVisualizers: boolean;
  hasParticles: boolean;
}

function generateId(prefix: string = 'layer'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getDefaultTransform(): TransformConfig {
  return { ...DEFAULT_TRANSFORM };
}

export function compileTemplate(
  options: PromoTemplateOptions,
  compilerOptions: CompilerOptions = {}
): CompilationResult {
  const compiled = compileTemplateToCompiledTemplate(options);
  return convertCompiledTemplateToResult(compiled, options, compilerOptions);
}

function compileTemplateToCompiledTemplate(options: PromoTemplateOptions): CompiledTemplate {
  switch (options.type) {
    case 'release':
      return compileReleaseAnnouncement(options as ReleaseAnnouncementOptions);
    case 'tour':
      return compileTourEvent(options as TourEventOptions);
    case 'bts':
      return compileBehindTheScenes(options as BehindTheScenesOptions);
    case 'quote':
      return compileQuoteLyric(options as QuoteLyricOptions);
    case 'countdown':
      return compileCountdownTimer(options as CountdownTimerOptions);
    case 'split':
      return compileSplitScreen(options as SplitScreenOptions);
    case 'teaser':
      return compileSocialTeaser(options as SocialTeaserOptions);
    default:
      throw new Error(`Unknown template type: ${(options as any).type}`);
  }
}

function convertCompiledTemplateToResult(
  compiled: CompiledTemplate,
  options: PromoTemplateOptions,
  compilerOptions: CompilerOptions
): CompilationResult {
  const layers = convertTemplateLayers(compiled.layers, compiled.width, compiled.height);
  const keyframes = extractKeyframes(compiled.layers);
  const audioReactiveBindings = extractAudioReactiveBindings(compiled.layers, options);

  const project: VideoProject = {
    id: compiled.id,
    name: compiled.name,
    width: compiled.width,
    height: compiled.height,
    fps: compilerOptions.targetFps ?? compiled.fps,
    duration: compiled.duration,
    backgroundColor: options.palette.background,
    layers,
    audioUrl: compiled.audioUrl,
    keyframes,
  };

  const hasVisualizers = layers.some(l => l.type === 'visualizer');
  const hasParticles = layers.some(l => l.type === 'particle');

  const metadata: CompilationMetadata = {
    templateType: compiled.type,
    compiledAt: new Date().toISOString(),
    aspectRatio: options.aspectRatio,
    estimatedRenderTime: estimateRenderTime(compiled.duration, compiled.fps, layers.length),
    layerCount: layers.length,
    keyframeCount: keyframes.length,
    hasAudioReactive: audioReactiveBindings.length > 0,
    hasVisualizers,
    hasParticles,
  };

  return {
    project,
    layers,
    keyframes,
    audioReactiveBindings,
    metadata,
  };
}

function convertTemplateLayers(
  templateLayers: TemplateLayer[],
  width: number,
  height: number
): LayerConfig[] {
  return templateLayers.map(tl => convertTemplateLayer(tl, width, height));
}

function convertTemplateLayer(
  templateLayer: TemplateLayer,
  width: number,
  height: number
): LayerConfig {
  const baseConfig: LayerConfig = {
    id: templateLayer.id,
    type: mapLayerType(templateLayer.type),
    zIndex: templateLayer.zIndex,
    opacity: templateLayer.opacity,
    transform: templateLayer.transform,
    config: convertLayerConfig(templateLayer, width, height),
  };

  if (templateLayer.animations.length > 0) {
    baseConfig.animation = templateLayer.animations[0];
  }

  return baseConfig;
}

function mapLayerType(type: TemplateLayer['type']): LayerConfig['type'] {
  switch (type) {
    case 'background':
      return 'background';
    case 'image':
    case 'video':
      return 'image';
    case 'text':
      return 'text';
    case 'shape':
      return 'shape';
    case 'particle':
      return 'particle';
    case 'visualizer':
      return 'visualizer';
    default:
      return 'background';
  }
}

function convertLayerConfig(
  layer: TemplateLayer,
  width: number,
  height: number
): LayerConfig['config'] {
  const config = layer.config as Record<string, unknown>;

  switch (layer.type) {
    case 'background':
      return convertBackgroundConfig(config);
    case 'text':
      return convertTextConfig(config);
    case 'image':
    case 'video':
      return convertImageConfig(config);
    case 'shape':
      return convertShapeConfig(config);
    case 'particle':
      return convertParticleConfig(config, width, height);
    case 'visualizer':
      return convertVisualizerConfig(config);
    default:
      return config as BaseBackgroundConfig;
  }
}

function convertBackgroundConfig(config: Record<string, unknown>): BaseBackgroundConfig {
  return {
    type: (config.type as BaseBackgroundConfig['type']) || 'solid',
    color: config.color as string,
    colors: config.gradientColors as string[],
    angle: config.gradientAngle as number,
    imageUrl: config.imageUrl as string,
  };
}

function convertTextConfig(config: Record<string, unknown>): TextConfig {
  return {
    text: (config.text as string) || '',
    font: (config.font as string) || 'Inter',
    fontSize: (config.fontSize as number) || 24,
    color: (config.color as string) || '#ffffff',
    strokeColor: config.strokeColor as string,
    strokeWidth: config.strokeWidth as number,
    align: (config.align as TextConfig['align']) || 'center',
    baseline: (config.baseline as TextConfig['baseline']) || 'middle',
    shadow: config.shadow as TextConfig['shadow'],
    wordWrap: config.wordWrap as boolean,
    maxWidth: config.maxWidth as number,
  };
}

function convertImageConfig(config: Record<string, unknown>): ImageConfig {
  return {
    src: (config.src as string) || (config.imageUrl as string) || '',
    width: config.width as number,
    height: config.height as number,
    fit: (config.fit as ImageConfig['fit']) || 'contain',
    borderRadius: config.borderRadius as number,
  };
}

function convertShapeConfig(config: Record<string, unknown>): ShapeConfig {
  return {
    type: (config.shapeType as ShapeConfig['type']) || 'rectangle',
    fill: config.fill as string,
    stroke: config.stroke as string,
    strokeWidth: config.strokeWidth as number,
    width: config.width as number,
    height: config.height as number,
    radius: config.radius as number,
    cornerRadius: config.cornerRadius as number,
  };
}

function convertParticleConfig(
  config: Record<string, unknown>,
  width: number,
  height: number
): ParticleConfig {
  return {
    count: (config.count as number) || 100,
    color: (config.color as string | string[]) || '#ffffff',
    size: (config.size as ParticleConfig['size']) || { min: 2, max: 8 },
    speed: (config.speed as ParticleConfig['speed']) || { min: 1, max: 3 },
    lifetime: (config.lifetime as number) || 3,
    shape: (config.shape as ParticleConfig['shape']) || 'circle',
    emissionArea: (config.emissionArea as ParticleConfig['emissionArea']) || {
      x: 0,
      y: 0,
      width,
      height,
    },
    reactToAudio: config.reactToAudio as boolean,
    audioSensitivity: config.audioSensitivity as number,
  };
}

function convertVisualizerConfig(config: Record<string, unknown>): VisualizerConfig {
  return {
    type: (config.visualizerType as VisualizerConfig['type']) || 'spectrum',
    color: (config.color as string) || '#00ff88',
    secondaryColor: config.secondaryColor as string,
    barCount: config.barCount as number,
    barWidth: config.barWidth as number,
    barGap: config.barGap as number,
    smoothing: config.smoothing as number,
    sensitivity: config.sensitivity as number,
    mirror: config.mirror as boolean,
    radius: config.radius as number,
    lineWidth: config.lineWidth as number,
    glow: config.glow as boolean,
    glowIntensity: config.glowIntensity as number,
  };
}

function extractKeyframes(layers: TemplateLayer[]): Keyframe[] {
  const keyframes: Keyframe[] = [];

  for (const layer of layers) {
    for (const animation of layer.animations) {
      keyframes.push({
        layerId: layer.id,
        time: animation.startTime,
        property: animation.property,
        value: animation.from,
        easing: animation.easing,
      });

      keyframes.push({
        layerId: layer.id,
        time: animation.endTime,
        property: animation.property,
        value: animation.to,
        easing: animation.easing,
      });
    }
  }

  return keyframes.sort((a, b) => a.time - b.time);
}

function extractAudioReactiveBindings(
  layers: TemplateLayer[],
  options: PromoTemplateOptions
): AudioReactiveBinding[] {
  const bindings: AudioReactiveBinding[] = [];

  for (const layer of layers) {
    if (layer.audioReactive?.enabled) {
      bindings.push({
        layerId: layer.id,
        property: layer.audioReactive.property,
        frequencyRange: 'bass',
        intensity: layer.audioReactive.intensity,
        smoothing: 0.8,
      });
    }
  }

  if (options.audioReactive?.enabled) {
    for (const target of options.audioReactive.targets) {
      if (!bindings.find(b => b.layerId === target.layerId && b.property === target.property)) {
        bindings.push({
          layerId: target.layerId,
          property: target.property,
          frequencyRange: options.audioReactive.frequencyRange,
          intensity: target.intensity,
          smoothing: options.audioReactive.smoothing,
        });
      }
    }
  }

  return bindings;
}

function estimateRenderTime(duration: number, fps: number, layerCount: number): number {
  const baseTimePerFrame = 16;
  const layerMultiplier = 1 + (layerCount * 0.1);
  const totalFrames = duration * fps;
  return (totalFrames * baseTimePerFrame * layerMultiplier) / 1000;
}

export function createVideoProjectFromTemplate(
  templateType: PromoTemplateOptions['type'],
  baseOptions: Partial<PromoTemplateOptions>,
  compilerOptions: CompilerOptions = {}
): VideoProject {
  const fullOptions = buildFullOptions(templateType, baseOptions);
  const result = compileTemplate(fullOptions, compilerOptions);
  return result.project;
}

function buildFullOptions(
  type: PromoTemplateOptions['type'],
  partial: Partial<PromoTemplateOptions>
): PromoTemplateOptions {
  const defaultPalette: ColorPalette = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#f59e0b',
    background: '#0f172a',
    text: '#ffffff',
    textSecondary: '#94a3b8',
    overlay: 'rgba(15, 23, 42, 0.8)',
  };

  const defaultBackground: BackgroundConfig = {
    type: 'gradient',
    gradientColors: [defaultPalette.primary, defaultPalette.secondary],
    gradientAngle: 135,
  };

  const base = {
    id: partial.id || generateId('project'),
    name: partial.name || 'Untitled Project',
    aspectRatio: partial.aspectRatio || '16:9' as AspectRatio,
    duration: partial.duration || 10,
    fps: partial.fps || 30,
    palette: partial.palette || defaultPalette,
    background: partial.background || defaultBackground,
    logo: partial.logo,
    callToAction: partial.callToAction,
    audioReactive: partial.audioReactive,
    watermark: partial.watermark,
  };

  switch (type) {
    case 'release':
      return {
        ...base,
        type: 'release',
        artistName: (partial as Partial<ReleaseAnnouncementOptions>).artistName || 'Artist Name',
        releaseName: (partial as Partial<ReleaseAnnouncementOptions>).releaseName || 'Release Title',
        releaseType: (partial as Partial<ReleaseAnnouncementOptions>).releaseType || 'single',
        releaseDate: (partial as Partial<ReleaseAnnouncementOptions>).releaseDate || 'Coming Soon',
        coverArtUrl: (partial as Partial<ReleaseAnnouncementOptions>).coverArtUrl,
      } as ReleaseAnnouncementOptions;

    case 'tour':
      return {
        ...base,
        type: 'tour',
        tourName: (partial as Partial<TourEventOptions>).tourName || 'Tour Name',
        artistName: (partial as Partial<TourEventOptions>).artistName || 'Artist Name',
        dates: (partial as Partial<TourEventOptions>).dates || [],
      } as TourEventOptions;

    case 'bts':
      return {
        ...base,
        type: 'bts',
        title: (partial as Partial<BehindTheScenesOptions>).title || 'Behind The Scenes',
        artistName: (partial as Partial<BehindTheScenesOptions>).artistName || 'Artist Name',
        mediaClips: (partial as Partial<BehindTheScenesOptions>).mediaClips || [],
      } as BehindTheScenesOptions;

    case 'quote':
      return {
        ...base,
        type: 'quote',
        quote: (partial as Partial<QuoteLyricOptions>).quote || 'Your quote here...',
        artistName: (partial as Partial<QuoteLyricOptions>).artistName || 'Artist Name',
        quotationStyle: (partial as Partial<QuoteLyricOptions>).quotationStyle || 'minimal',
      } as QuoteLyricOptions;

    case 'countdown':
      return {
        ...base,
        type: 'countdown',
        title: (partial as Partial<CountdownTimerOptions>).title || 'Coming Soon',
        targetDate: (partial as Partial<CountdownTimerOptions>).targetDate || new Date(Date.now() + 86400000).toISOString(),
        eventName: (partial as Partial<CountdownTimerOptions>).eventName || 'Event',
        artistName: (partial as Partial<CountdownTimerOptions>).artistName || 'Artist Name',
        timerStyle: (partial as Partial<CountdownTimerOptions>).timerStyle || 'digital',
        showLabels: (partial as Partial<CountdownTimerOptions>).showLabels ?? true,
      } as CountdownTimerOptions;

    case 'split':
      return {
        ...base,
        type: 'split',
        leftContent: (partial as Partial<SplitScreenOptions>).leftContent || { title: 'Left' },
        rightContent: (partial as Partial<SplitScreenOptions>).rightContent || { title: 'Right' },
        dividerStyle: (partial as Partial<SplitScreenOptions>).dividerStyle || 'solid',
        comparisonType: (partial as Partial<SplitScreenOptions>).comparisonType || 'side-by-side',
      } as SplitScreenOptions;

    case 'teaser':
      return {
        ...base,
        type: 'teaser',
        hookText: (partial as Partial<SocialTeaserOptions>).hookText || 'Coming Soon...',
        mainContent: (partial as Partial<SocialTeaserOptions>).mainContent || 'Stay Tuned',
        artistName: (partial as Partial<SocialTeaserOptions>).artistName || 'Artist Name',
        contentType: (partial as Partial<SocialTeaserOptions>).contentType || 'announcement',
        teaserLength: (partial as Partial<SocialTeaserOptions>).teaserLength || 15,
      } as SocialTeaserOptions;

    default:
      throw new Error(`Unknown template type: ${type}`);
  }
}

export function scaleProjectToAspectRatio(
  project: VideoProject,
  targetAspectRatio: AspectRatio
): VideoProject {
  const target = ASPECT_RATIOS[targetAspectRatio];
  const scaleX = target.width / project.width;
  const scaleY = target.height / project.height;
  const scale = Math.min(scaleX, scaleY);

  const scaledLayers = project.layers.map(layer => ({
    ...layer,
    transform: layer.transform ? {
      ...layer.transform,
      x: layer.transform.x * scaleX,
      y: layer.transform.y * scaleY,
      scaleX: layer.transform.scaleX * scale,
      scaleY: layer.transform.scaleY * scale,
    } : undefined,
    config: scaleLayerConfig(layer.config, scaleX, scaleY),
  }));

  const scaledKeyframes = project.keyframes.map(kf => {
    if (kf.property === 'x') {
      return { ...kf, value: (kf.value as number) * scaleX };
    }
    if (kf.property === 'y') {
      return { ...kf, value: (kf.value as number) * scaleY };
    }
    if (kf.property === 'scaleX' || kf.property === 'scaleY') {
      return { ...kf, value: (kf.value as number) * scale };
    }
    return kf;
  });

  return {
    ...project,
    width: target.width,
    height: target.height,
    layers: scaledLayers,
    keyframes: scaledKeyframes,
  };
}

function scaleLayerConfig(
  config: LayerConfig['config'],
  scaleX: number,
  scaleY: number
): LayerConfig['config'] {
  const cfg = config as Record<string, unknown>;

  if ('fontSize' in cfg && typeof cfg.fontSize === 'number') {
    (cfg as any).fontSize = cfg.fontSize * Math.min(scaleX, scaleY);
  }
  if ('width' in cfg && typeof cfg.width === 'number') {
    (cfg as any).width = cfg.width * scaleX;
  }
  if ('height' in cfg && typeof cfg.height === 'number') {
    (cfg as any).height = cfg.height * scaleY;
  }
  if ('radius' in cfg && typeof cfg.radius === 'number') {
    (cfg as any).radius = cfg.radius * Math.min(scaleX, scaleY);
  }
  if ('barWidth' in cfg && typeof cfg.barWidth === 'number') {
    (cfg as any).barWidth = cfg.barWidth * scaleX;
  }
  if ('lineWidth' in cfg && typeof cfg.lineWidth === 'number') {
    (cfg as any).lineWidth = cfg.lineWidth * Math.min(scaleX, scaleY);
  }

  return config;
}

export function addVisualizerToProject(
  project: VideoProject,
  visualizerConfig: Partial<VisualizerConfig>,
  options: {
    zIndex?: number;
    opacity?: number;
    position?: { x: number; y: number };
  } = {}
): VideoProject {
  const visualizerLayer: LayerConfig = {
    id: generateId('visualizer'),
    type: 'visualizer',
    zIndex: options.zIndex ?? 5,
    opacity: options.opacity ?? 1,
    transform: {
      ...getDefaultTransform(),
      x: options.position?.x ?? project.width / 2,
      y: options.position?.y ?? project.height / 2,
    },
    config: {
      type: 'spectrum',
      color: '#00ff88',
      barCount: 64,
      barWidth: 8,
      barGap: 2,
      sensitivity: 1.5,
      glow: true,
      glowIntensity: 0.8,
      ...visualizerConfig,
    } as VisualizerConfig,
  };

  return {
    ...project,
    layers: [...project.layers, visualizerLayer],
  };
}

export function addParticlesToProject(
  project: VideoProject,
  particleConfig: Partial<ParticleConfig>,
  options: {
    zIndex?: number;
    opacity?: number;
    audioReactive?: boolean;
  } = {}
): VideoProject {
  const particleLayer: LayerConfig = {
    id: generateId('particles'),
    type: 'particle',
    zIndex: options.zIndex ?? 15,
    opacity: options.opacity ?? 1,
    transform: getDefaultTransform(),
    config: {
      count: 100,
      color: ['#ffffff', '#00ff88', '#ff00ff'],
      size: { min: 2, max: 6 },
      speed: { min: 0.5, max: 2 },
      lifetime: 5,
      shape: 'circle',
      emissionArea: { x: 0, y: 0, width: project.width, height: project.height },
      reactToAudio: options.audioReactive ?? false,
      audioSensitivity: 1.5,
      ...particleConfig,
    } as ParticleConfig,
  };

  return {
    ...project,
    layers: [...project.layers, particleLayer],
  };
}

export { ASPECT_RATIOS };
