export interface VideoFrame {
  timestamp: number;
  duration: number;
  layers: LayerConfig[];
}

export interface LayerConfig {
  id: string;
  type: 'background' | 'visualizer' | 'text' | 'image' | 'shape' | 'particle';
  zIndex: number;
  opacity: number;
  transform?: TransformConfig;
  animation?: AnimationConfig;
  config: BackgroundConfig | VisualizerConfig | TextConfig | ImageConfig | ShapeConfig | ParticleConfig;
}

export interface TransformConfig {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export interface AnimationConfig {
  property: string;
  from: number;
  to: number;
  startTime: number;
  endTime: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce' | 'elastic';
}

export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'radialGradient' | 'image';
  color?: string;
  colors?: string[];
  angle?: number;
  imageUrl?: string;
}

export interface VisualizerConfig {
  type: 'waveform' | 'spectrum' | 'circular' | 'bars' | 'particles' | 'oscilloscope';
  color: string;
  secondaryColor?: string;
  barCount?: number;
  barWidth?: number;
  barGap?: number;
  smoothing?: number;
  sensitivity?: number;
  mirror?: boolean;
  radius?: number;
  lineWidth?: number;
  glow?: boolean;
  glowIntensity?: number;
}

export interface TextConfig {
  text: string;
  font: string;
  fontSize: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  align: 'left' | 'center' | 'right';
  baseline: 'top' | 'middle' | 'bottom';
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  wordWrap?: boolean;
  maxWidth?: number;
}

export interface ImageConfig {
  src: string;
  width?: number;
  height?: number;
  fit: 'contain' | 'cover' | 'fill' | 'none';
  borderRadius?: number;
}

export interface ShapeConfig {
  type: 'rectangle' | 'circle' | 'triangle' | 'polygon' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number;
  cornerRadius?: number;
}

export interface ParticleConfig {
  count: number;
  color: string | string[];
  size: { min: number; max: number };
  speed: { min: number; max: number };
  lifetime: number;
  shape: 'circle' | 'square' | 'star' | 'custom';
  emissionArea: { x: number; y: number; width: number; height: number };
  reactToAudio?: boolean;
  audioSensitivity?: number;
}

export interface VideoProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor: string;
  layers: LayerConfig[];
  audioUrl?: string;
  keyframes: Keyframe[];
}

export interface Keyframe {
  layerId: string;
  time: number;
  property: string;
  value: number | string;
  easing: string;
}

export interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
}

export const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  bounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  elastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    const s = p / 4;
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
  },
};

export const DEFAULT_TRANSFORM: TransformConfig = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

export const VIDEO_PRESETS = {
  'instagram-square': { width: 1080, height: 1080, fps: 30 },
  'instagram-story': { width: 1080, height: 1920, fps: 30 },
  'instagram-reel': { width: 1080, height: 1920, fps: 30 },
  'youtube-standard': { width: 1920, height: 1080, fps: 30 },
  'youtube-short': { width: 1080, height: 1920, fps: 30 },
  'tiktok': { width: 1080, height: 1920, fps: 30 },
  'twitter': { width: 1280, height: 720, fps: 30 },
  'facebook': { width: 1280, height: 720, fps: 30 },
};

export function interpolateValue(
  from: number,
  to: number,
  progress: number,
  easing: keyof typeof EASING_FUNCTIONS = 'linear'
): number {
  const easedProgress = EASING_FUNCTIONS[easing](progress);
  return from + (to - from) * easedProgress;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function interpolateColor(color1: string, color2: string, progress: number): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return color1;
  
  const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * progress);
  const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * progress);
  const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * progress);
  
  return rgbToHex(r, g, b);
}
