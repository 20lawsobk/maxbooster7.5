export { SpectrumVisualizer } from './SpectrumVisualizer';
export type { SpectrumVisualizerOptions, SpectrumStyle } from './SpectrumVisualizer';

export { WaveformVisualizer } from './WaveformVisualizer';
export type { WaveformVisualizerOptions, WaveformMode } from './WaveformVisualizer';

export { CircularVisualizer } from './CircularVisualizer';
export type { CircularVisualizerOptions, CircularStyle } from './CircularVisualizer';

export { ParticleVisualizer } from './ParticleVisualizer';
export type { ParticleVisualizerOptions, ParticleShape, EmissionPattern } from './ParticleVisualizer';

import type { AudioAnalysisData } from '../AudioAnalyzer';

export interface BaseVisualizer {
  render(
    ctx: CanvasRenderingContext2D,
    audioData: AudioAnalysisData,
    width: number,
    height: number,
    time: number
  ): void;
  updateOptions(options: Record<string, unknown>): void;
  reset(): void;
  dispose(): void;
}

export type VisualizerType = 'spectrum' | 'waveform' | 'circular' | 'particle';

export interface VisualizerPreset {
  name: string;
  type: VisualizerType;
  options: Record<string, unknown>;
}

export const VISUALIZER_PRESETS: Record<string, VisualizerPreset> = {
  'neon-spectrum': {
    name: 'Neon Spectrum',
    type: 'spectrum',
    options: {
      barCount: 64,
      style: 'neon',
      glow: true,
      glowIntensity: 1,
      mirror: true,
      sensitivity: 1.8,
    },
  },
  'classic-bars': {
    name: 'Classic Bars',
    type: 'spectrum',
    options: {
      barCount: 32,
      style: 'classic',
      color: '#00ff88',
      secondaryColor: '#0088ff',
      glow: false,
      showCaps: true,
    },
  },
  'gradient-wave': {
    name: 'Gradient Wave',
    type: 'spectrum',
    options: {
      barCount: 128,
      style: 'gradient',
      barWidth: 4,
      barGap: 1,
      barRadius: 2,
      gradientColors: ['#ff0080', '#ff8000', '#ffff00', '#00ff00'],
    },
  },
  'smooth-waveform': {
    name: 'Smooth Waveform',
    type: 'waveform',
    options: {
      mode: 'line',
      sampleCount: 256,
      tension: 0.5,
      useGradient: true,
      glow: true,
    },
  },
  'filled-wave': {
    name: 'Filled Wave',
    type: 'waveform',
    options: {
      mode: 'filled',
      sampleCount: 128,
      fillOpacity: 0.5,
      gradientColors: ['#00ffff', '#ff00ff'],
    },
  },
  'mirrored-wave': {
    name: 'Mirrored Wave',
    type: 'waveform',
    options: {
      mode: 'mirrored',
      sampleCount: 128,
      beatReactive: true,
      beatAmplitudeMultiplier: 1.5,
    },
  },
  'radial-spectrum': {
    name: 'Radial Spectrum',
    type: 'circular',
    options: {
      style: 'bars',
      barCount: 64,
      innerRadius: 80,
      outerRadius: 200,
      rotationSpeed: 0.2,
      beatPulse: true,
      particleBurst: true,
    },
  },
  'circular-wave': {
    name: 'Circular Wave',
    type: 'circular',
    options: {
      style: 'wave',
      barCount: 128,
      innerRadius: 100,
      glow: true,
      glowIntensity: 0.8,
    },
  },
  'particle-burst': {
    name: 'Particle Burst',
    type: 'particle',
    options: {
      maxParticles: 500,
      emissionRate: 5,
      particleShape: 'circle',
      beatBurst: true,
      beatBurstCount: 30,
      glow: true,
      trailLength: 5,
    },
  },
  'starfield': {
    name: 'Starfield',
    type: 'particle',
    options: {
      maxParticles: 200,
      emissionRate: 2,
      particleShape: 'star',
      sizeMin: 3,
      sizeMax: 8,
      gravity: 0,
      emissionPattern: 'random',
      audioReactive: true,
    },
  },
  'particle-stream': {
    name: 'Particle Stream',
    type: 'particle',
    options: {
      maxParticles: 1000,
      emissionRate: 20,
      emissionPattern: 'line',
      emissionArea: { x: 0.5, y: 0, width: 1, height: 0 },
      gravity: 0.2,
      particleShape: 'circle',
      trailLength: 10,
      audioReactive: true,
    },
  },
};

export function createVisualizer(
  type: VisualizerType,
  options?: Record<string, unknown>
): BaseVisualizer {
  const { SpectrumVisualizer } = require('./SpectrumVisualizer');
  const { WaveformVisualizer } = require('./WaveformVisualizer');
  const { CircularVisualizer } = require('./CircularVisualizer');
  const { ParticleVisualizer } = require('./ParticleVisualizer');

  switch (type) {
    case 'spectrum':
      return new SpectrumVisualizer(options);
    case 'waveform':
      return new WaveformVisualizer(options);
    case 'circular':
      return new CircularVisualizer(options);
    case 'particle':
      return new ParticleVisualizer(options);
    default:
      throw new Error(`Unknown visualizer type: ${type}`);
  }
}

export function createVisualizerFromPreset(presetName: string): BaseVisualizer | null {
  const preset = VISUALIZER_PRESETS[presetName];
  if (!preset) return null;
  
  return createVisualizer(preset.type, preset.options);
}
