import type { TransformConfig, AnimationConfig } from '../../../../../shared/video/VideoRendererEngine';
import type { TextStyle, AnimationConfig as TextAnimationConfig } from '../TextAnimator';
import type { EasingName } from '../SceneGraph';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
export type BackgroundType = 'solid' | 'gradient' | 'radialGradient' | 'image' | 'video';
export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook' | 'spotify' | 'universal';

export interface AspectRatioConfig {
  width: number;
  height: number;
  name: string;
  platforms: Platform[];
}

export const ASPECT_RATIOS: Record<AspectRatio, AspectRatioConfig> = {
  '16:9': { width: 1920, height: 1080, name: 'Landscape', platforms: ['youtube', 'twitter', 'facebook'] },
  '9:16': { width: 1080, height: 1920, name: 'Portrait/Story', platforms: ['instagram', 'tiktok', 'youtube'] },
  '1:1': { width: 1080, height: 1080, name: 'Square', platforms: ['instagram', 'facebook', 'spotify'] },
  '4:5': { width: 1080, height: 1350, name: 'Portrait', platforms: ['instagram', 'facebook'] },
  '4:3': { width: 1440, height: 1080, name: 'Standard', platforms: ['universal'] },
};

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  textSecondary: string;
  overlay: string;
}

export const DEFAULT_PALETTES: Record<string, ColorPalette> = {
  modern: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#f59e0b',
    background: '#0f172a',
    text: '#ffffff',
    textSecondary: '#94a3b8',
    overlay: 'rgba(15, 23, 42, 0.8)',
  },
  neon: {
    primary: '#00ff88',
    secondary: '#ff00ff',
    accent: '#00ffff',
    background: '#000000',
    text: '#ffffff',
    textSecondary: '#888888',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
  minimal: {
    primary: '#1a1a1a',
    secondary: '#333333',
    accent: '#ff4444',
    background: '#ffffff',
    text: '#1a1a1a',
    textSecondary: '#666666',
    overlay: 'rgba(255, 255, 255, 0.9)',
  },
  vintage: {
    primary: '#d4a574',
    secondary: '#8b7355',
    accent: '#c9a66b',
    background: '#1a1612',
    text: '#f5e6d3',
    textSecondary: '#bfae9f',
    overlay: 'rgba(26, 22, 18, 0.85)',
  },
  electric: {
    primary: '#ff3366',
    secondary: '#33ccff',
    accent: '#ffcc00',
    background: '#0a0a1a',
    text: '#ffffff',
    textSecondary: '#aabbcc',
    overlay: 'rgba(10, 10, 26, 0.75)',
  },
  pastel: {
    primary: '#ffc8dd',
    secondary: '#bde0fe',
    accent: '#a2d2ff',
    background: '#fff5f5',
    text: '#2d2d2d',
    textSecondary: '#666666',
    overlay: 'rgba(255, 245, 245, 0.85)',
  },
};

export interface BackgroundConfig {
  type: BackgroundType;
  color?: string;
  gradientColors?: string[];
  gradientAngle?: number;
  imageUrl?: string;
  videoUrl?: string;
  blur?: number;
  opacity?: number;
  overlay?: string;
  parallax?: boolean;
  audioReactive?: boolean;
  audioReactiveIntensity?: number;
}

export interface TextLayerConfig {
  id: string;
  content: string;
  style: Partial<TextStyle>;
  position: { x: number; y: number };
  animation?: {
    enter: TextAnimationConfig['style'];
    exit?: TextAnimationConfig['style'];
    duration: number;
    delay: number;
    easing: EasingName;
  };
  audioReactive?: boolean;
  audioReactiveProperty?: 'scale' | 'glow' | 'shake' | 'color';
  audioReactiveIntensity?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
}

export interface LogoConfig {
  imageUrl?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'custom';
  customPosition?: { x: number; y: number };
  size: number;
  opacity: number;
  animation?: {
    type: 'fade' | 'slide' | 'zoom' | 'none';
    duration: number;
    delay: number;
  };
}

export interface CallToActionConfig {
  text: string;
  subtext?: string;
  style: 'button' | 'banner' | 'minimal' | 'pill';
  position: 'bottom' | 'center' | 'top' | 'custom';
  customPosition?: { x: number; y: number };
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  animation?: {
    type: 'pulse' | 'bounce' | 'glow' | 'slide' | 'none';
    intensity?: number;
  };
  url?: string;
  icon?: string;
}

export interface AudioReactiveConfig {
  enabled: boolean;
  sensitivity: number;
  smoothing: number;
  frequencyRange: 'bass' | 'mid' | 'high' | 'full';
  targets: Array<{
    layerId: string;
    property: 'scale' | 'opacity' | 'glow' | 'position' | 'color' | 'rotation';
    intensity: number;
    offset?: number;
  }>;
}

export interface BaseTemplateOptions {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  duration: number;
  fps?: number;
  palette: ColorPalette;
  background: BackgroundConfig;
  logo?: LogoConfig;
  callToAction?: CallToActionConfig;
  audioReactive?: AudioReactiveConfig;
  watermark?: {
    text: string;
    position: 'bottom-left' | 'bottom-right';
    opacity: number;
  };
}

export interface ReleaseAnnouncementOptions extends BaseTemplateOptions {
  type: 'release';
  artistName: string;
  releaseName: string;
  releaseType: 'single' | 'album' | 'ep' | 'mixtape';
  releaseDate: string;
  coverArtUrl?: string;
  preorderUrl?: string;
  streamingPlatforms?: string[];
  featuredArtists?: string[];
  trackCount?: number;
  tagline?: string;
  animation?: {
    coverReveal: 'zoom' | 'fade' | 'slide' | 'flip' | 'shatter';
    textStyle: 'typewriter' | 'fade' | 'slide' | 'bounce' | 'glitch';
    particleEffect?: 'confetti' | 'sparks' | 'bubbles' | 'none';
  };
}

export interface TourEventOptions extends BaseTemplateOptions {
  type: 'tour';
  tourName: string;
  artistName: string;
  dates: Array<{
    date: string;
    venue: string;
    city: string;
    country?: string;
    ticketUrl?: string;
    soldOut?: boolean;
  }>;
  ticketUrl?: string;
  vipPackageAvailable?: boolean;
  supportingActs?: string[];
  animation?: {
    dateReveal: 'cascade' | 'random' | 'slide' | 'flip';
    mapAnimation?: boolean;
    glowEffect?: boolean;
  };
}

export interface BehindTheScenesOptions extends BaseTemplateOptions {
  type: 'bts';
  title: string;
  subtitle?: string;
  mediaClips: Array<{
    url: string;
    duration: number;
    caption?: string;
    timestamp?: string;
  }>;
  artistName: string;
  projectName?: string;
  location?: string;
  date?: string;
  filmGrain?: number;
  vintageEffect?: boolean;
  animation?: {
    transition: 'crossfade' | 'slide' | 'zoom' | 'glitch' | 'film-burn';
    captionStyle: 'subtitle' | 'overlay' | 'corner';
  };
}

export interface QuoteLyricOptions extends BaseTemplateOptions {
  type: 'quote';
  quote: string;
  attribution?: string;
  artistName: string;
  songTitle?: string;
  albumTitle?: string;
  quotationStyle: 'minimal' | 'decorative' | 'handwritten' | 'neon' | 'typewriter';
  backgroundBlur?: number;
  animation?: {
    revealStyle: 'word-by-word' | 'line-by-line' | 'character' | 'fade' | 'typewriter';
    highlightWords?: string[];
    highlightColor?: string;
    emphasisAnimation?: 'pulse' | 'glow' | 'shake' | 'none';
  };
}

export interface CountdownTimerOptions extends BaseTemplateOptions {
  type: 'countdown';
  title: string;
  targetDate: string;
  eventName: string;
  artistName: string;
  timerStyle: 'digital' | 'analog' | 'flip' | 'minimal' | 'neon';
  showLabels: boolean;
  urgencyThreshold?: number;
  completionMessage?: string;
  coverArtUrl?: string;
  animation?: {
    numberTransition: 'flip' | 'slide' | 'fade' | 'bounce';
    pulseOnChange: boolean;
    glowIntensity?: number;
  };
}

export interface SplitScreenOptions extends BaseTemplateOptions {
  type: 'split';
  leftContent: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    videoUrl?: string;
    label?: string;
  };
  rightContent: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    videoUrl?: string;
    label?: string;
  };
  dividerStyle: 'solid' | 'gradient' | 'animated' | 'diagonal' | 'none';
  dividerColor?: string;
  comparisonType: 'before-after' | 'vs' | 'side-by-side' | 'reveal';
  animation?: {
    revealDirection: 'left-to-right' | 'right-to-left' | 'center-out' | 'simultaneous';
    dividerAnimation?: 'pulse' | 'glow' | 'slide' | 'none';
  };
}

export interface SocialTeaserOptions extends BaseTemplateOptions {
  type: 'teaser';
  hookText: string;
  mainContent: string;
  artistName: string;
  contentType: 'music' | 'announcement' | 'question' | 'poll' | 'reveal';
  teaserLength: 15 | 30;
  audioPreviewUrl?: string;
  coverArtUrl?: string;
  hashtags?: string[];
  mentionHandle?: string;
  swipeUpText?: string;
  animation?: {
    hookAnimation: 'zoom' | 'shake' | 'flash' | 'typewriter';
    revealTiming: 'early' | 'middle' | 'late';
    loopable: boolean;
  };
}

export type PromoTemplateOptions =
  | ReleaseAnnouncementOptions
  | TourEventOptions
  | BehindTheScenesOptions
  | QuoteLyricOptions
  | CountdownTimerOptions
  | SplitScreenOptions
  | SocialTeaserOptions;

export interface TemplateLayer {
  id: string;
  type: 'background' | 'image' | 'video' | 'text' | 'shape' | 'particle' | 'visualizer';
  zIndex: number;
  visible: boolean;
  opacity: number;
  transform: TransformConfig;
  startTime: number;
  endTime: number;
  config: Record<string, unknown>;
  animations: AnimationConfig[];
  audioReactive?: {
    enabled: boolean;
    property: string;
    intensity: number;
  };
}

export interface CompiledTemplate {
  id: string;
  name: string;
  type: PromoTemplateOptions['type'];
  width: number;
  height: number;
  fps: number;
  duration: number;
  layers: TemplateLayer[];
  audioUrl?: string;
  metadata: {
    createdAt: string;
    aspectRatio: AspectRatio;
    platform: Platform[];
    palette: ColorPalette;
  };
}

function getDefaultTransform(): TransformConfig {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

function generateId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function compileReleaseAnnouncement(options: ReleaseAnnouncementOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      gradientColors: background.gradientColors || [palette.primary, palette.secondary],
      gradientAngle: background.gradientAngle || 135,
      imageUrl: background.imageUrl,
      blur: background.blur || 0,
      overlay: background.overlay || palette.overlay,
    },
    animations: [],
  });

  if (options.coverArtUrl) {
    const coverSize = Math.min(width, height) * 0.4;
    const isPortrait = height > width;
    layers.push({
      id: generateId(),
      type: 'image',
      zIndex: 10,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: isPortrait ? (width - coverSize) / 2 : width * 0.15,
        y: isPortrait ? height * 0.2 : (height - coverSize) / 2,
        scaleX: 1,
        scaleY: 1,
      },
      startTime: 0.2,
      endTime: duration,
      config: {
        src: options.coverArtUrl,
        width: coverSize,
        height: coverSize,
        borderRadius: 12,
        shadow: {
          color: 'rgba(0,0,0,0.5)',
          blur: 30,
          offsetX: 0,
          offsetY: 10,
        },
      },
      animations: [
        {
          property: 'scaleX',
          from: 0.8,
          to: 1,
          startTime: 0.2,
          endTime: 0.8,
          easing: 'easeOut',
        },
        {
          property: 'scaleY',
          from: 0.8,
          to: 1,
          startTime: 0.2,
          endTime: 0.8,
          easing: 'easeOut',
        },
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 0.2,
          endTime: 0.6,
          easing: 'easeOut',
        },
      ],
      audioReactive: options.audioReactive?.enabled ? {
        enabled: true,
        property: 'scale',
        intensity: 0.05,
      } : undefined,
    });
  }

  const releaseTypeLabel = options.releaseType.toUpperCase();
  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 20,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.08,
    },
    startTime: 0.5,
    endTime: duration,
    config: {
      text: `NEW ${releaseTypeLabel}`,
      font: 'Inter',
      fontSize: Math.round(width * 0.025),
      fontWeight: '600',
      color: palette.accent,
      align: 'center',
      letterSpacing: 4,
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.5,
        endTime: 0.8,
        easing: 'easeOut',
      },
    ],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 21,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.7,
    },
    startTime: 0.8,
    endTime: duration,
    config: {
      text: options.releaseName,
      font: 'Inter',
      fontSize: Math.round(width * 0.06),
      fontWeight: '800',
      color: palette.text,
      align: 'center',
      maxWidth: width * 0.8,
    },
    animations: [
      {
        property: 'y',
        from: height * 0.75,
        to: height * 0.7,
        startTime: 0.8,
        endTime: 1.3,
        easing: 'easeOut',
      },
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.8,
        endTime: 1.2,
        easing: 'easeOut',
      },
    ],
    audioReactive: options.audioReactive?.enabled ? {
      enabled: true,
      property: 'glow',
      intensity: 0.3,
    } : undefined,
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 22,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.77,
    },
    startTime: 1.0,
    endTime: duration,
    config: {
      text: options.artistName,
      font: 'Inter',
      fontSize: Math.round(width * 0.035),
      fontWeight: '500',
      color: palette.textSecondary,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 1.0,
        endTime: 1.4,
        easing: 'easeOut',
      },
    ],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 23,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.85,
    },
    startTime: 1.5,
    endTime: duration,
    config: {
      text: `OUT ${options.releaseDate}`,
      font: 'Inter',
      fontSize: Math.round(width * 0.028),
      fontWeight: '600',
      color: palette.accent,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 1.5,
        endTime: 1.8,
        easing: 'easeOut',
      },
    ],
  });

  if (options.callToAction) {
    layers.push(createCallToActionLayer(options.callToAction, width, height, duration, palette));
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'release',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileTourEvent(options: TourEventOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      gradientColors: background.gradientColors || [palette.background, palette.primary + '40'],
      gradientAngle: background.gradientAngle || 180,
    },
    animations: [],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 10,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.12,
    },
    startTime: 0.3,
    endTime: duration,
    config: {
      text: options.tourName,
      font: 'Inter',
      fontSize: Math.round(width * 0.055),
      fontWeight: '900',
      color: palette.text,
      align: 'center',
      maxWidth: width * 0.9,
    },
    animations: [
      {
        property: 'scaleX',
        from: 1.2,
        to: 1,
        startTime: 0.3,
        endTime: 0.8,
        easing: 'easeOut',
      },
      {
        property: 'scaleY',
        from: 1.2,
        to: 1,
        startTime: 0.3,
        endTime: 0.8,
        easing: 'easeOut',
      },
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.3,
        endTime: 0.6,
        easing: 'easeOut',
      },
    ],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 11,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.19,
    },
    startTime: 0.5,
    endTime: duration,
    config: {
      text: options.artistName,
      font: 'Inter',
      fontSize: Math.round(width * 0.03),
      fontWeight: '500',
      color: palette.textSecondary,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.5,
        endTime: 0.8,
        easing: 'easeOut',
      },
    ],
  });

  const dateStartY = height * 0.28;
  const dateSpacing = height * 0.08;
  const maxVisibleDates = Math.min(options.dates.length, 6);

  options.dates.slice(0, maxVisibleDates).forEach((dateInfo, index) => {
    const delayBase = 0.8 + index * 0.15;
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 20 + index,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width * 0.1,
        y: dateStartY + index * dateSpacing,
      },
      startTime: delayBase,
      endTime: duration,
      config: {
        text: dateInfo.date,
        font: 'Inter',
        fontSize: Math.round(width * 0.022),
        fontWeight: '600',
        color: palette.accent,
        align: 'left',
      },
      animations: [
        {
          property: 'x',
          from: width * 0.05,
          to: width * 0.1,
          startTime: delayBase,
          endTime: delayBase + 0.4,
          easing: 'easeOut',
        },
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: delayBase,
          endTime: delayBase + 0.3,
          easing: 'easeOut',
        },
      ],
    });

    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 30 + index,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width * 0.35,
        y: dateStartY + index * dateSpacing,
      },
      startTime: delayBase + 0.1,
      endTime: duration,
      config: {
        text: `${dateInfo.venue} - ${dateInfo.city}${dateInfo.country ? `, ${dateInfo.country}` : ''}`,
        font: 'Inter',
        fontSize: Math.round(width * 0.02),
        fontWeight: '400',
        color: dateInfo.soldOut ? palette.textSecondary : palette.text,
        align: 'left',
        maxWidth: width * 0.5,
      },
      animations: [
        {
          property: 'x',
          from: width * 0.3,
          to: width * 0.35,
          startTime: delayBase + 0.1,
          endTime: delayBase + 0.5,
          easing: 'easeOut',
        },
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: delayBase + 0.1,
          endTime: delayBase + 0.4,
          easing: 'easeOut',
        },
      ],
    });

    if (dateInfo.soldOut) {
      layers.push({
        id: generateId(),
        type: 'text',
        zIndex: 40 + index,
        visible: true,
        opacity: 1,
        transform: {
          ...getDefaultTransform(),
          x: width * 0.88,
          y: dateStartY + index * dateSpacing,
        },
        startTime: delayBase + 0.2,
        endTime: duration,
        config: {
          text: 'SOLD OUT',
          font: 'Inter',
          fontSize: Math.round(width * 0.015),
          fontWeight: '700',
          color: '#ff4444',
          align: 'right',
        },
        animations: [
          {
            property: 'opacity',
            from: 0,
            to: 1,
            startTime: delayBase + 0.2,
            endTime: delayBase + 0.5,
            easing: 'easeOut',
          },
        ],
      });
    }
  });

  if (options.callToAction) {
    layers.push(createCallToActionLayer(options.callToAction, width, height, duration, palette));
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'tour',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileBehindTheScenes(options: BehindTheScenesOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      filmGrain: options.filmGrain || 0,
      vintageEffect: options.vintageEffect || false,
    },
    animations: [],
  });

  let currentTime = 0;
  options.mediaClips.forEach((clip, index) => {
    layers.push({
      id: generateId(),
      type: 'video',
      zIndex: 5 + index,
      visible: true,
      opacity: 1,
      transform: getDefaultTransform(),
      startTime: currentTime,
      endTime: currentTime + clip.duration,
      config: {
        src: clip.url,
        fit: 'cover',
        transition: options.animation?.transition || 'crossfade',
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: currentTime,
          endTime: currentTime + 0.5,
          easing: 'easeOut',
        },
        {
          property: 'opacity',
          from: 1,
          to: 0,
          startTime: currentTime + clip.duration - 0.5,
          endTime: currentTime + clip.duration,
          easing: 'easeIn',
        },
      ],
    });

    if (clip.caption) {
      layers.push({
        id: generateId(),
        type: 'text',
        zIndex: 50 + index,
        visible: true,
        opacity: 1,
        transform: {
          ...getDefaultTransform(),
          x: width / 2,
          y: height * 0.88,
        },
        startTime: currentTime + 0.3,
        endTime: currentTime + clip.duration - 0.3,
        config: {
          text: clip.caption,
          font: 'Inter',
          fontSize: Math.round(width * 0.025),
          fontWeight: '400',
          color: palette.text,
          align: 'center',
          shadow: {
            color: 'rgba(0,0,0,0.8)',
            blur: 10,
            offsetX: 0,
            offsetY: 2,
          },
        },
        animations: [
          {
            property: 'opacity',
            from: 0,
            to: 1,
            startTime: currentTime + 0.3,
            endTime: currentTime + 0.6,
            easing: 'easeOut',
          },
        ],
      });
    }

    currentTime += clip.duration;
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 100,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.1,
    },
    startTime: 0.5,
    endTime: duration,
    config: {
      text: options.title,
      font: 'Inter',
      fontSize: Math.round(width * 0.04),
      fontWeight: '700',
      color: palette.text,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.5,
        endTime: 0.8,
        easing: 'easeOut',
      },
    ],
  });

  if (options.subtitle) {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 101,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: height * 0.15,
      },
      startTime: 0.7,
      endTime: duration,
      config: {
        text: options.subtitle,
        font: 'Inter',
        fontSize: Math.round(width * 0.025),
        fontWeight: '400',
        color: palette.textSecondary,
        align: 'center',
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 0.7,
          endTime: 1.0,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'bts',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileQuoteLyric(options: QuoteLyricOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      gradientColors: background.gradientColors || [palette.background, palette.primary + '30'],
      blur: options.backgroundBlur || 0,
    },
    animations: [],
  });

  const quoteStyle = options.quotationStyle || 'minimal';
  const quoteFontSize = quoteStyle === 'handwritten' ? width * 0.045 : width * 0.04;
  const quoteFont = quoteStyle === 'handwritten' ? 'Georgia' : 'Inter';
  const quoteWeight = quoteStyle === 'neon' ? '300' : '500';

  if (quoteStyle === 'decorative' || quoteStyle === 'neon') {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 5,
      visible: true,
      opacity: 0.3,
      transform: {
        ...getDefaultTransform(),
        x: width * 0.12,
        y: height * 0.35,
      },
      startTime: 0.3,
      endTime: duration,
      config: {
        text: '"',
        font: 'Georgia',
        fontSize: Math.round(width * 0.15),
        fontWeight: '400',
        color: palette.accent,
        align: 'center',
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 0.3,
          startTime: 0.3,
          endTime: 0.6,
          easing: 'easeOut',
        },
      ],
    });
  }

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 10,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.45,
    },
    startTime: 0.5,
    endTime: duration,
    config: {
      text: options.quote,
      font: quoteFont,
      fontSize: Math.round(quoteFontSize),
      fontWeight: quoteWeight,
      color: palette.text,
      align: 'center',
      maxWidth: width * 0.8,
      lineHeight: 1.5,
      glowColor: quoteStyle === 'neon' ? palette.accent : undefined,
      glowIntensity: quoteStyle === 'neon' ? 20 : undefined,
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.5,
        endTime: 1.2,
        easing: 'easeOut',
      },
    ],
    audioReactive: options.audioReactive?.enabled ? {
      enabled: true,
      property: 'glow',
      intensity: 0.5,
    } : undefined,
  });

  if (options.attribution || options.artistName) {
    const attributionText = options.attribution || `— ${options.artistName}${options.songTitle ? `, "${options.songTitle}"` : ''}`;
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 11,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: height * 0.65,
      },
      startTime: 1.5,
      endTime: duration,
      config: {
        text: attributionText,
        font: 'Inter',
        fontSize: Math.round(width * 0.022),
        fontWeight: '400',
        color: palette.textSecondary,
        align: 'center',
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 1.5,
          endTime: 1.8,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.callToAction) {
    layers.push(createCallToActionLayer(options.callToAction, width, height, duration, palette));
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'quote',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileCountdownTimer(options: CountdownTimerOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      gradientColors: background.gradientColors,
    },
    animations: [],
  });

  if (options.coverArtUrl) {
    layers.push({
      id: generateId(),
      type: 'image',
      zIndex: 2,
      visible: true,
      opacity: 0.15,
      transform: {
        ...getDefaultTransform(),
        scaleX: 1.2,
        scaleY: 1.2,
      },
      startTime: 0,
      endTime: duration,
      config: {
        src: options.coverArtUrl,
        fit: 'cover',
        blur: 30,
      },
      animations: [],
    });
  }

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 10,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.15,
    },
    startTime: 0.3,
    endTime: duration,
    config: {
      text: options.title,
      font: 'Inter',
      fontSize: Math.round(width * 0.045),
      fontWeight: '700',
      color: palette.text,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.3,
        endTime: 0.6,
        easing: 'easeOut',
      },
    ],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 11,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.22,
    },
    startTime: 0.5,
    endTime: duration,
    config: {
      text: options.eventName,
      font: 'Inter',
      fontSize: Math.round(width * 0.028),
      fontWeight: '400',
      color: palette.textSecondary,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 0.5,
        endTime: 0.8,
        easing: 'easeOut',
      },
    ],
  });

  const timerY = height * 0.45;
  const timerFontSize = options.timerStyle === 'minimal' ? width * 0.08 : width * 0.1;
  const timerUnits = ['DAYS', 'HOURS', 'MINS', 'SECS'];
  const unitSpacing = width * 0.22;
  const startX = width / 2 - (unitSpacing * 1.5);

  timerUnits.forEach((unit, index) => {
    const x = startX + index * unitSpacing;
    
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 20 + index,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x,
        y: timerY,
      },
      startTime: 0.6 + index * 0.1,
      endTime: duration,
      config: {
        text: '00',
        font: options.timerStyle === 'digital' ? 'monospace' : 'Inter',
        fontSize: Math.round(timerFontSize),
        fontWeight: '700',
        color: palette.text,
        align: 'center',
        isCountdownDigit: true,
        countdownUnit: unit.toLowerCase(),
        targetDate: options.targetDate,
        glowColor: options.timerStyle === 'neon' ? palette.accent : undefined,
        glowIntensity: options.timerStyle === 'neon' ? 15 : undefined,
      },
      animations: [
        {
          property: 'scaleX',
          from: 0.5,
          to: 1,
          startTime: 0.6 + index * 0.1,
          endTime: 0.9 + index * 0.1,
          easing: 'bounce',
        },
        {
          property: 'scaleY',
          from: 0.5,
          to: 1,
          startTime: 0.6 + index * 0.1,
          endTime: 0.9 + index * 0.1,
          easing: 'bounce',
        },
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 0.6 + index * 0.1,
          endTime: 0.8 + index * 0.1,
          easing: 'easeOut',
        },
      ],
      audioReactive: options.audioReactive?.enabled ? {
        enabled: true,
        property: 'scale',
        intensity: 0.03,
      } : undefined,
    });

    if (options.showLabels) {
      layers.push({
        id: generateId(),
        type: 'text',
        zIndex: 30 + index,
        visible: true,
        opacity: 1,
        transform: {
          ...getDefaultTransform(),
          x,
          y: timerY + timerFontSize * 0.7,
        },
        startTime: 0.8 + index * 0.1,
        endTime: duration,
        config: {
          text: unit,
          font: 'Inter',
          fontSize: Math.round(width * 0.015),
          fontWeight: '500',
          color: palette.textSecondary,
          align: 'center',
          letterSpacing: 2,
        },
        animations: [
          {
            property: 'opacity',
            from: 0,
            to: 1,
            startTime: 0.8 + index * 0.1,
            endTime: 1.0 + index * 0.1,
            easing: 'easeOut',
          },
        ],
      });
    }
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 50,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.75,
    },
    startTime: 1.5,
    endTime: duration,
    config: {
      text: options.artistName,
      font: 'Inter',
      fontSize: Math.round(width * 0.025),
      fontWeight: '500',
      color: palette.textSecondary,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: 1.5,
        endTime: 1.8,
        easing: 'easeOut',
      },
    ],
  });

  if (options.callToAction) {
    layers.push(createCallToActionLayer(options.callToAction, width, height, duration, palette));
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'countdown',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileSplitScreen(options: SplitScreenOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
    },
    animations: [],
  });

  const isDiagonal = options.dividerStyle === 'diagonal';
  const leftWidth = isDiagonal ? width * 0.55 : width / 2;

  if (options.leftContent.imageUrl || options.leftContent.videoUrl) {
    layers.push({
      id: generateId(),
      type: options.leftContent.videoUrl ? 'video' : 'image',
      zIndex: 5,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: 0,
        y: 0,
        anchorX: 0,
        anchorY: 0,
      },
      startTime: 0,
      endTime: duration,
      config: {
        src: options.leftContent.videoUrl || options.leftContent.imageUrl,
        fit: 'cover',
        clipPath: isDiagonal ? `polygon(0 0, ${leftWidth}px 0, ${leftWidth - width * 0.1}px ${height}px, 0 ${height}px)` : `rect(0, ${leftWidth}px, ${height}px, 0)`,
      },
      animations: options.animation?.revealDirection === 'left-to-right' ? [
        {
          property: 'x',
          from: -leftWidth,
          to: 0,
          startTime: 0.3,
          endTime: 1.0,
          easing: 'easeOut',
        },
      ] : [],
    });
  }

  if (options.rightContent.imageUrl || options.rightContent.videoUrl) {
    layers.push({
      id: generateId(),
      type: options.rightContent.videoUrl ? 'video' : 'image',
      zIndex: 6,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: isDiagonal ? leftWidth - width * 0.1 : width / 2,
        y: 0,
        anchorX: 0,
        anchorY: 0,
      },
      startTime: 0,
      endTime: duration,
      config: {
        src: options.rightContent.videoUrl || options.rightContent.imageUrl,
        fit: 'cover',
        clipPath: isDiagonal ? `polygon(${width * 0.1}px 0, ${width - leftWidth + width * 0.1}px 0, ${width - leftWidth + width * 0.1}px ${height}px, 0 ${height}px)` : undefined,
      },
      animations: options.animation?.revealDirection === 'right-to-left' ? [
        {
          property: 'x',
          from: width,
          to: isDiagonal ? leftWidth - width * 0.1 : width / 2,
          startTime: 0.3,
          endTime: 1.0,
          easing: 'easeOut',
        },
      ] : [],
    });
  }

  if (options.dividerStyle !== 'none') {
    layers.push({
      id: generateId(),
      type: 'shape',
      zIndex: 10,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: 0,
        anchorX: 0.5,
        anchorY: 0,
      },
      startTime: 0.5,
      endTime: duration,
      config: {
        type: 'rectangle',
        width: isDiagonal ? 8 : 4,
        height: height,
        fill: options.dividerColor || palette.accent,
        rotation: isDiagonal ? -5 : 0,
      },
      animations: options.animation?.dividerAnimation === 'glow' ? [
        {
          property: 'opacity',
          from: 0.5,
          to: 1,
          startTime: 0.5,
          endTime: 1.5,
          easing: 'easeInOut',
        },
      ] : [],
    });
  }

  if (options.leftContent.label) {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 20,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: leftWidth / 2,
        y: height * 0.08,
      },
      startTime: 1.0,
      endTime: duration,
      config: {
        text: options.leftContent.label,
        font: 'Inter',
        fontSize: Math.round(width * 0.02),
        fontWeight: '600',
        color: palette.text,
        align: 'center',
        backgroundColor: palette.overlay,
        padding: 10,
        borderRadius: 4,
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 1.0,
          endTime: 1.3,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.rightContent.label) {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 21,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2 + leftWidth / 2,
        y: height * 0.08,
      },
      startTime: 1.0,
      endTime: duration,
      config: {
        text: options.rightContent.label,
        font: 'Inter',
        fontSize: Math.round(width * 0.02),
        fontWeight: '600',
        color: palette.text,
        align: 'center',
        backgroundColor: palette.overlay,
        padding: 10,
        borderRadius: 4,
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: 1.0,
          endTime: 1.3,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.comparisonType === 'vs') {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 25,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: height / 2,
      },
      startTime: 0.8,
      endTime: duration,
      config: {
        text: 'VS',
        font: 'Inter',
        fontSize: Math.round(width * 0.05),
        fontWeight: '900',
        color: palette.accent,
        align: 'center',
        glowColor: palette.accent,
        glowIntensity: 20,
      },
      animations: [
        {
          property: 'scaleX',
          from: 2,
          to: 1,
          startTime: 0.8,
          endTime: 1.2,
          easing: 'bounce',
        },
        {
          property: 'scaleY',
          from: 2,
          to: 1,
          startTime: 0.8,
          endTime: 1.2,
          easing: 'bounce',
        },
      ],
    });
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'split',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

export function compileSocialTeaser(options: SocialTeaserOptions): CompiledTemplate {
  const { width, height } = ASPECT_RATIOS[options.aspectRatio];
  const layers: TemplateLayer[] = [];
  const { palette, background, duration } = options;

  layers.push({
    id: generateId(),
    type: 'background',
    zIndex: 0,
    visible: true,
    opacity: 1,
    transform: getDefaultTransform(),
    startTime: 0,
    endTime: duration,
    config: {
      type: background.type,
      color: background.color || palette.background,
      gradientColors: background.gradientColors || [palette.background, palette.primary + '40'],
      gradientAngle: 180,
    },
    animations: [],
  });

  if (options.coverArtUrl) {
    layers.push({
      id: generateId(),
      type: 'image',
      zIndex: 2,
      visible: true,
      opacity: 0.2,
      transform: {
        ...getDefaultTransform(),
        scaleX: 1.3,
        scaleY: 1.3,
      },
      startTime: 0,
      endTime: duration,
      config: {
        src: options.coverArtUrl,
        fit: 'cover',
        blur: 40,
      },
      animations: [
        {
          property: 'scaleX',
          from: 1.3,
          to: 1.5,
          startTime: 0,
          endTime: duration,
          easing: 'linear',
        },
        {
          property: 'scaleY',
          from: 1.3,
          to: 1.5,
          startTime: 0,
          endTime: duration,
          easing: 'linear',
        },
      ],
    });
  }

  const hookDelay = 0.2;
  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 10,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.35,
    },
    startTime: hookDelay,
    endTime: duration * 0.6,
    config: {
      text: options.hookText,
      font: 'Inter',
      fontSize: Math.round(width * 0.055),
      fontWeight: '800',
      color: palette.text,
      align: 'center',
      maxWidth: width * 0.85,
    },
    animations: [
      {
        property: 'scaleX',
        from: 0.8,
        to: 1,
        startTime: hookDelay,
        endTime: hookDelay + 0.4,
        easing: 'easeOut',
      },
      {
        property: 'scaleY',
        from: 0.8,
        to: 1,
        startTime: hookDelay,
        endTime: hookDelay + 0.4,
        easing: 'easeOut',
      },
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: hookDelay,
        endTime: hookDelay + 0.3,
        easing: 'easeOut',
      },
      {
        property: 'opacity',
        from: 1,
        to: 0,
        startTime: duration * 0.5,
        endTime: duration * 0.6,
        easing: 'easeIn',
      },
    ],
    audioReactive: options.audioReactive?.enabled ? {
      enabled: true,
      property: 'scale',
      intensity: 0.05,
    } : undefined,
  });

  const revealTime = options.animation?.revealTiming === 'early' ? duration * 0.4 : 
                     options.animation?.revealTiming === 'late' ? duration * 0.7 : duration * 0.55;
  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 11,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.45,
    },
    startTime: revealTime,
    endTime: duration,
    config: {
      text: options.mainContent,
      font: 'Inter',
      fontSize: Math.round(width * 0.045),
      fontWeight: '600',
      color: palette.text,
      align: 'center',
      maxWidth: width * 0.85,
    },
    animations: [
      {
        property: 'y',
        from: height * 0.5,
        to: height * 0.45,
        startTime: revealTime,
        endTime: revealTime + 0.5,
        easing: 'easeOut',
      },
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: revealTime,
        endTime: revealTime + 0.3,
        easing: 'easeOut',
      },
    ],
  });

  layers.push({
    id: generateId(),
    type: 'text',
    zIndex: 12,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: width / 2,
      y: height * 0.55,
    },
    startTime: revealTime + 0.3,
    endTime: duration,
    config: {
      text: options.artistName,
      font: 'Inter',
      fontSize: Math.round(width * 0.028),
      fontWeight: '500',
      color: palette.accent,
      align: 'center',
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: revealTime + 0.3,
        endTime: revealTime + 0.6,
        easing: 'easeOut',
      },
    ],
  });

  if (options.mentionHandle) {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 13,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: height * 0.9,
      },
      startTime: duration * 0.7,
      endTime: duration,
      config: {
        text: options.mentionHandle,
        font: 'Inter',
        fontSize: Math.round(width * 0.022),
        fontWeight: '500',
        color: palette.textSecondary,
        align: 'center',
      },
      animations: [
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: duration * 0.7,
          endTime: duration * 0.8,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.swipeUpText) {
    layers.push({
      id: generateId(),
      type: 'text',
      zIndex: 50,
      visible: true,
      opacity: 1,
      transform: {
        ...getDefaultTransform(),
        x: width / 2,
        y: height * 0.82,
      },
      startTime: duration * 0.75,
      endTime: duration,
      config: {
        text: `↑ ${options.swipeUpText}`,
        font: 'Inter',
        fontSize: Math.round(width * 0.022),
        fontWeight: '600',
        color: palette.text,
        align: 'center',
      },
      animations: [
        {
          property: 'y',
          from: height * 0.85,
          to: height * 0.82,
          startTime: duration * 0.75,
          endTime: duration,
          easing: 'easeInOut',
        },
        {
          property: 'opacity',
          from: 0,
          to: 1,
          startTime: duration * 0.75,
          endTime: duration * 0.85,
          easing: 'easeOut',
        },
      ],
    });
  }

  if (options.logo) {
    layers.push(createLogoLayer(options.logo, width, height, duration));
  }

  return {
    id: options.id,
    name: options.name,
    type: 'teaser',
    width,
    height,
    fps: options.fps || 30,
    duration,
    layers,
    metadata: {
      createdAt: new Date().toISOString(),
      aspectRatio: options.aspectRatio,
      platform: ASPECT_RATIOS[options.aspectRatio].platforms,
      palette: options.palette,
    },
  };
}

function createCallToActionLayer(
  cta: CallToActionConfig,
  width: number,
  height: number,
  duration: number,
  palette: ColorPalette
): TemplateLayer {
  const ctaY = cta.position === 'bottom' ? height * 0.92 :
               cta.position === 'center' ? height / 2 :
               cta.position === 'top' ? height * 0.08 :
               cta.customPosition?.y || height * 0.92;
  const ctaX = cta.customPosition?.x || width / 2;

  return {
    id: generateId(),
    type: 'text',
    zIndex: 100,
    visible: true,
    opacity: 1,
    transform: {
      ...getDefaultTransform(),
      x: ctaX,
      y: ctaY,
    },
    startTime: duration * 0.7,
    endTime: duration,
    config: {
      text: cta.text,
      font: 'Inter',
      fontSize: Math.round(width * 0.025),
      fontWeight: '600',
      color: cta.textColor || palette.text,
      align: 'center',
      backgroundColor: cta.style === 'button' || cta.style === 'pill' ? (cta.backgroundColor || palette.accent) : undefined,
      padding: cta.style === 'button' ? { x: 24, y: 12 } : cta.style === 'pill' ? { x: 32, y: 8 } : undefined,
      borderRadius: cta.borderRadius || (cta.style === 'pill' ? 50 : cta.style === 'button' ? 8 : 0),
    },
    animations: [
      {
        property: 'opacity',
        from: 0,
        to: 1,
        startTime: duration * 0.7,
        endTime: duration * 0.8,
        easing: 'easeOut',
      },
      ...(cta.animation?.type === 'pulse' ? [
        {
          property: 'scaleX',
          from: 1,
          to: 1.05,
          startTime: duration * 0.85,
          endTime: duration * 0.95,
          easing: 'easeInOut' as const,
        },
        {
          property: 'scaleY',
          from: 1,
          to: 1.05,
          startTime: duration * 0.85,
          endTime: duration * 0.95,
          easing: 'easeInOut' as const,
        },
      ] : []),
    ],
  };
}

function createLogoLayer(
  logo: LogoConfig,
  width: number,
  height: number,
  duration: number
): TemplateLayer {
  const positions: Record<string, { x: number; y: number }> = {
    'top-left': { x: width * 0.08, y: height * 0.05 },
    'top-right': { x: width * 0.92, y: height * 0.05 },
    'bottom-left': { x: width * 0.08, y: height * 0.95 },
    'bottom-right': { x: width * 0.92, y: height * 0.95 },
    'center': { x: width / 2, y: height / 2 },
  };

  const pos = logo.position === 'custom' && logo.customPosition 
    ? logo.customPosition 
    : positions[logo.position] || positions['bottom-right'];

  return {
    id: generateId(),
    type: 'image',
    zIndex: 200,
    visible: true,
    opacity: logo.opacity,
    transform: {
      ...getDefaultTransform(),
      x: pos.x,
      y: pos.y,
    },
    startTime: logo.animation?.delay || 0,
    endTime: duration,
    config: {
      src: logo.imageUrl || '',
      width: logo.size,
      height: logo.size,
      fit: 'contain',
    },
    animations: logo.animation?.type === 'fade' ? [
      {
        property: 'opacity',
        from: 0,
        to: logo.opacity,
        startTime: logo.animation.delay || 0,
        endTime: (logo.animation.delay || 0) + logo.animation.duration,
        easing: 'easeOut',
      },
    ] : logo.animation?.type === 'zoom' ? [
      {
        property: 'scaleX',
        from: 0,
        to: 1,
        startTime: logo.animation.delay || 0,
        endTime: (logo.animation.delay || 0) + logo.animation.duration,
        easing: 'easeOut',
      },
      {
        property: 'scaleY',
        from: 0,
        to: 1,
        startTime: logo.animation.delay || 0,
        endTime: (logo.animation.delay || 0) + logo.animation.duration,
        easing: 'easeOut',
      },
    ] : [],
  };
}

export function compileTemplate(options: PromoTemplateOptions): CompiledTemplate {
  switch (options.type) {
    case 'release':
      return compileReleaseAnnouncement(options);
    case 'tour':
      return compileTourEvent(options);
    case 'bts':
      return compileBehindTheScenes(options);
    case 'quote':
      return compileQuoteLyric(options);
    case 'countdown':
      return compileCountdownTimer(options);
    case 'split':
      return compileSplitScreen(options);
    case 'teaser':
      return compileSocialTeaser(options);
    default:
      throw new Error(`Unknown template type: ${(options as PromoTemplateOptions).type}`);
  }
}
