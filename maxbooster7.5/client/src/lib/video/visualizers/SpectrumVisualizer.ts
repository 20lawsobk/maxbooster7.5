import type { AudioAnalysisData } from '../AudioAnalyzer';

export type SpectrumStyle = 'classic' | 'rounded' | 'gradient' | 'neon' | 'blocks' | 'outline';

export interface SpectrumVisualizerOptions {
  barCount: number;
  barWidth: number;
  barGap: number;
  barMinHeight: number;
  barMaxHeight: number;
  barRadius: number;
  color: string;
  secondaryColor: string;
  gradientColors: string[];
  mirror: boolean;
  mirrorGap: number;
  style: SpectrumStyle;
  glow: boolean;
  glowColor: string;
  glowIntensity: number;
  glowBlur: number;
  smoothing: number;
  sensitivity: number;
  responsiveness: number;
  frequencyRange: { min: number; max: number };
  alignment: 'bottom' | 'center' | 'top';
  capHeight: number;
  capColor: string;
  capFallSpeed: number;
  showCaps: boolean;
}

interface BarState {
  currentHeight: number;
  targetHeight: number;
  capY: number;
  velocity: number;
}

export class SpectrumVisualizer {
  private options: SpectrumVisualizerOptions;
  private barStates: BarState[] = [];
  private lastUpdateTime: number = 0;
  private gradientCache: Map<string, CanvasGradient> = new Map();

  static readonly defaultOptions: SpectrumVisualizerOptions = {
    barCount: 64,
    barWidth: 8,
    barGap: 2,
    barMinHeight: 4,
    barMaxHeight: 300,
    barRadius: 4,
    color: '#00ff88',
    secondaryColor: '#0088ff',
    gradientColors: ['#ff0080', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0080ff', '#8000ff'],
    mirror: false,
    mirrorGap: 20,
    style: 'classic',
    glow: true,
    glowColor: '#00ff88',
    glowIntensity: 0.8,
    glowBlur: 15,
    smoothing: 0.7,
    sensitivity: 1.5,
    responsiveness: 0.3,
    frequencyRange: { min: 0, max: 1 },
    alignment: 'bottom',
    capHeight: 3,
    capColor: '#ffffff',
    capFallSpeed: 0.05,
    showCaps: true,
  };

  constructor(options: Partial<SpectrumVisualizerOptions> = {}) {
    this.options = { ...SpectrumVisualizer.defaultOptions, ...options };
    this.initializeBarStates();
  }

  private initializeBarStates(): void {
    this.barStates = Array.from({ length: this.options.barCount }, () => ({
      currentHeight: 0,
      targetHeight: 0,
      capY: 0,
      velocity: 0,
    }));
  }

  updateOptions(options: Partial<SpectrumVisualizerOptions>): void {
    const prevBarCount = this.options.barCount;
    this.options = { ...this.options, ...options };
    
    if (options.barCount && options.barCount !== prevBarCount) {
      this.initializeBarStates();
    }
    
    this.gradientCache.clear();
  }

  render(
    ctx: CanvasRenderingContext2D,
    audioData: AudioAnalysisData,
    width: number,
    height: number,
    time: number
  ): void {
    const deltaTime = time - this.lastUpdateTime;
    this.lastUpdateTime = time;

    const frequencyBands = this.getFrequencyBands(audioData);
    this.updateBarStates(frequencyBands, deltaTime);
    
    ctx.save();
    
    if (this.options.glow) {
      ctx.shadowColor = this.options.glowColor;
      ctx.shadowBlur = this.options.glowBlur * this.options.glowIntensity;
    }

    const totalBarWidth = this.options.barWidth + this.options.barGap;
    const totalWidth = this.options.barCount * totalBarWidth - this.options.barGap;
    const startX = (width - totalWidth) / 2;
    
    const baseY = this.getBaseY(height);

    for (let i = 0; i < this.options.barCount; i++) {
      const state = this.barStates[i];
      const x = startX + i * totalBarWidth;
      const barHeight = Math.max(this.options.barMinHeight, state.currentHeight);
      
      this.drawBar(ctx, x, baseY, barHeight, i, audioData.beatDetected);
      
      if (this.options.mirror) {
        const mirrorY = baseY + this.options.mirrorGap;
        ctx.globalAlpha = 0.4;
        this.drawBar(ctx, x, mirrorY, barHeight * 0.7, i, audioData.beatDetected, true);
        ctx.globalAlpha = 1;
      }
      
      if (this.options.showCaps) {
        this.drawCap(ctx, x, baseY, state);
      }
    }

    ctx.restore();
  }

  private getFrequencyBands(audioData: AudioAnalysisData): number[] {
    const { frequencyData } = audioData;
    const bands: number[] = [];
    
    const minIndex = Math.floor(frequencyData.length * this.options.frequencyRange.min);
    const maxIndex = Math.floor(frequencyData.length * this.options.frequencyRange.max);
    const rangeLength = maxIndex - minIndex;
    const binPerBand = rangeLength / this.options.barCount;

    for (let i = 0; i < this.options.barCount; i++) {
      let sum = 0;
      const start = minIndex + Math.floor(i * binPerBand);
      const end = Math.min(minIndex + Math.floor((i + 1) * binPerBand), frequencyData.length);
      const count = end - start;

      for (let j = start; j < end; j++) {
        sum += frequencyData[j];
      }

      const normalized = count > 0 ? (sum / count / 255) * this.options.sensitivity : 0;
      bands.push(Math.min(1, normalized));
    }

    return bands;
  }

  private updateBarStates(frequencyBands: number[], deltaTime: number): void {
    const smoothFactor = 1 - Math.pow(1 - this.options.responsiveness, deltaTime * 60);
    
    for (let i = 0; i < this.options.barCount; i++) {
      const state = this.barStates[i];
      const targetHeight = frequencyBands[i] * this.options.barMaxHeight;
      
      state.targetHeight = targetHeight;
      state.currentHeight += (targetHeight - state.currentHeight) * smoothFactor;
      
      if (state.currentHeight > state.capY) {
        state.capY = state.currentHeight;
        state.velocity = 0;
      } else {
        state.velocity += this.options.capFallSpeed * deltaTime * 60;
        state.capY -= state.velocity;
        state.capY = Math.max(state.capY, state.currentHeight);
      }
    }
  }

  private getBaseY(height: number): number {
    switch (this.options.alignment) {
      case 'top':
        return this.options.barMaxHeight + 20;
      case 'center':
        return height / 2;
      case 'bottom':
      default:
        return height - 20;
    }
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    baseY: number,
    height: number,
    index: number,
    beatDetected: boolean,
    flipped: boolean = false
  ): void {
    const { barWidth, barRadius, style } = this.options;
    const drawHeight = flipped ? height : -height;
    const y = flipped ? baseY : baseY;

    ctx.beginPath();
    
    switch (style) {
      case 'rounded':
        this.drawRoundedBar(ctx, x, y, barWidth, drawHeight, barRadius);
        break;
      case 'blocks':
        this.drawBlockBar(ctx, x, y, barWidth, drawHeight);
        break;
      case 'outline':
        ctx.strokeStyle = this.getBarColor(ctx, index, height, baseY);
        ctx.lineWidth = 2;
        this.drawRoundedBar(ctx, x, y, barWidth, drawHeight, barRadius);
        ctx.stroke();
        return;
      default:
        ctx.rect(x, y, barWidth, drawHeight);
    }

    ctx.fillStyle = this.getBarColor(ctx, index, height, baseY);
    
    if (style === 'neon' || beatDetected) {
      ctx.shadowBlur = this.options.glowBlur * (beatDetected ? 2 : 1);
    }
    
    ctx.fill();
  }

  private drawRoundedBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const actualRadius = Math.min(radius, Math.abs(height) / 2, width / 2);
    const yEnd = y + height;
    const direction = height < 0 ? -1 : 1;
    
    ctx.moveTo(x + actualRadius, y);
    ctx.lineTo(x + width - actualRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + actualRadius * direction);
    ctx.lineTo(x + width, yEnd - actualRadius * direction);
    ctx.quadraticCurveTo(x + width, yEnd, x + width - actualRadius, yEnd);
    ctx.lineTo(x + actualRadius, yEnd);
    ctx.quadraticCurveTo(x, yEnd, x, yEnd - actualRadius * direction);
    ctx.lineTo(x, y + actualRadius * direction);
    ctx.quadraticCurveTo(x, y, x + actualRadius, y);
    ctx.closePath();
  }

  private drawBlockBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const blockHeight = 4;
    const blockGap = 2;
    const blockCount = Math.ceil(Math.abs(height) / (blockHeight + blockGap));
    const direction = height < 0 ? -1 : 1;

    for (let i = 0; i < blockCount; i++) {
      const blockY = y + i * (blockHeight + blockGap) * direction;
      ctx.rect(x, blockY, width, blockHeight * direction);
    }
  }

  private getBarColor(
    ctx: CanvasRenderingContext2D,
    index: number,
    height: number,
    baseY: number
  ): string | CanvasGradient {
    const { style, color, secondaryColor, gradientColors, barCount } = this.options;

    switch (style) {
      case 'gradient': {
        const cacheKey = `vertical-${baseY}-${height}`;
        let gradient = this.gradientCache.get(cacheKey);
        
        if (!gradient) {
          gradient = ctx.createLinearGradient(0, baseY, 0, baseY - height);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, secondaryColor);
          this.gradientCache.set(cacheKey, gradient);
        }
        
        return gradient;
      }
      
      case 'neon': {
        const hue = (index / barCount) * 360;
        return `hsl(${hue}, 100%, 60%)`;
      }
      
      default: {
        if (gradientColors.length > 1) {
          const colorIndex = Math.floor((index / barCount) * (gradientColors.length - 1));
          const t = ((index / barCount) * (gradientColors.length - 1)) % 1;
          return this.interpolateColors(gradientColors[colorIndex], gradientColors[colorIndex + 1] || gradientColors[colorIndex], t);
        }
        return color;
      }
    }
  }

  private drawCap(
    ctx: CanvasRenderingContext2D,
    x: number,
    baseY: number,
    state: BarState
  ): void {
    const { barWidth, capHeight, capColor } = this.options;
    
    ctx.fillStyle = capColor;
    ctx.fillRect(x, baseY - state.capY - capHeight, barWidth, capHeight);
  }

  private interpolateColors(color1: string, color2: string, t: number): string {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);
    
    if (!c1 || !c2) return color1;
    
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    
    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }

  reset(): void {
    this.initializeBarStates();
    this.gradientCache.clear();
    this.lastUpdateTime = 0;
  }

  dispose(): void {
    this.barStates = [];
    this.gradientCache.clear();
  }
}
