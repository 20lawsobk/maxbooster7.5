import type { AudioAnalysisData } from '../AudioAnalyzer';

export type CircularStyle = 'bars' | 'wave' | 'dots' | 'spikes' | 'ring';

export interface CircularVisualizerOptions {
  style: CircularStyle;
  barCount: number;
  innerRadius: number;
  outerRadius: number;
  barWidth: number;
  barMinHeight: number;
  barMaxHeight: number;
  barRadius: number;
  color: string;
  secondaryColor: string;
  gradientColors: string[];
  useRadialGradient: boolean;
  rotation: number;
  rotationSpeed: number;
  mirror: boolean;
  glow: boolean;
  glowColor: string;
  glowIntensity: number;
  glowBlur: number;
  smoothing: number;
  sensitivity: number;
  beatPulse: boolean;
  beatPulseAmount: number;
  particleBurst: boolean;
  particleCount: number;
  particleColor: string;
  particleSize: number;
  particleSpeed: number;
  particleLifetime: number;
  startAngle: number;
  endAngle: number;
  centerX: number;
  centerY: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

interface BarState {
  currentHeight: number;
  targetHeight: number;
}

export class CircularVisualizer {
  private options: CircularVisualizerOptions;
  private barStates: BarState[] = [];
  private particles: Particle[] = [];
  private currentRotation: number = 0;
  private pulseScale: number = 1;
  private lastBeatTime: number = 0;

  static readonly defaultOptions: CircularVisualizerOptions = {
    style: 'bars',
    barCount: 64,
    innerRadius: 100,
    outerRadius: 250,
    barWidth: 4,
    barMinHeight: 5,
    barMaxHeight: 150,
    barRadius: 2,
    color: '#00ff88',
    secondaryColor: '#0088ff',
    gradientColors: ['#ff0080', '#ff8000', '#00ff88', '#00ffff', '#8000ff'],
    useRadialGradient: true,
    rotation: 0,
    rotationSpeed: 0.5,
    mirror: true,
    glow: true,
    glowColor: '#00ff88',
    glowIntensity: 0.8,
    glowBlur: 15,
    smoothing: 0.7,
    sensitivity: 1.5,
    beatPulse: true,
    beatPulseAmount: 20,
    particleBurst: true,
    particleCount: 20,
    particleColor: '#ffffff',
    particleSize: 3,
    particleSpeed: 5,
    particleLifetime: 60,
    startAngle: 0,
    endAngle: Math.PI * 2,
    centerX: 0.5,
    centerY: 0.5,
  };

  constructor(options: Partial<CircularVisualizerOptions> = {}) {
    this.options = { ...CircularVisualizer.defaultOptions, ...options };
    this.initializeBarStates();
  }

  private initializeBarStates(): void {
    this.barStates = Array.from({ length: this.options.barCount }, () => ({
      currentHeight: 0,
      targetHeight: 0,
    }));
  }

  updateOptions(options: Partial<CircularVisualizerOptions>): void {
    const prevBarCount = this.options.barCount;
    this.options = { ...this.options, ...options };
    
    if (options.barCount && options.barCount !== prevBarCount) {
      this.initializeBarStates();
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    audioData: AudioAnalysisData,
    width: number,
    height: number,
    time: number
  ): void {
    const frequencyBands = this.getFrequencyBands(audioData);
    this.updateBarStates(frequencyBands);
    this.updateRotation(time);
    this.updatePulse(audioData);
    
    if (this.options.particleBurst && audioData.beatDetected) {
      this.emitParticles(width, height);
    }
    
    this.updateParticles();

    const centerX = width * this.options.centerX;
    const centerY = height * this.options.centerY;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.currentRotation);

    if (this.options.glow) {
      ctx.shadowColor = this.options.glowColor;
      ctx.shadowBlur = this.options.glowBlur * this.options.glowIntensity;
    }

    const pulseOffset = this.options.beatPulse ? (this.pulseScale - 1) * this.options.beatPulseAmount : 0;
    const effectiveInnerRadius = this.options.innerRadius + pulseOffset;
    const effectiveOuterRadius = this.options.outerRadius + pulseOffset;

    switch (this.options.style) {
      case 'wave':
        this.renderWave(ctx, effectiveInnerRadius);
        break;
      case 'dots':
        this.renderDots(ctx, effectiveInnerRadius, effectiveOuterRadius);
        break;
      case 'spikes':
        this.renderSpikes(ctx, effectiveInnerRadius, effectiveOuterRadius);
        break;
      case 'ring':
        this.renderRing(ctx, effectiveInnerRadius);
        break;
      case 'bars':
      default:
        this.renderBars(ctx, effectiveInnerRadius, effectiveOuterRadius);
        break;
    }

    ctx.restore();

    this.renderParticles(ctx, centerX, centerY);
  }

  private getFrequencyBands(audioData: AudioAnalysisData): number[] {
    const { frequencyData } = audioData;
    const bands: number[] = [];
    const binPerBand = Math.floor(frequencyData.length / this.options.barCount);

    for (let i = 0; i < this.options.barCount; i++) {
      let sum = 0;
      const start = i * binPerBand;
      const end = start + binPerBand;

      for (let j = start; j < end; j++) {
        sum += frequencyData[j];
      }

      const normalized = (sum / binPerBand / 255) * this.options.sensitivity;
      bands.push(Math.min(1, normalized));
    }

    return bands;
  }

  private updateBarStates(frequencyBands: number[]): void {
    const smoothFactor = 1 - this.options.smoothing;
    
    for (let i = 0; i < this.options.barCount; i++) {
      const state = this.barStates[i];
      const targetHeight = frequencyBands[i] * this.options.barMaxHeight;
      
      state.targetHeight = targetHeight;
      state.currentHeight += (targetHeight - state.currentHeight) * smoothFactor;
    }
  }

  private updateRotation(time: number): void {
    this.currentRotation = this.options.rotation + (time * this.options.rotationSpeed * 0.01);
  }

  private updatePulse(audioData: AudioAnalysisData): void {
    if (audioData.beatDetected) {
      this.pulseScale = 1 + this.options.beatPulseAmount / 100;
      this.lastBeatTime = performance.now();
    } else {
      const decay = 0.95;
      this.pulseScale = 1 + (this.pulseScale - 1) * decay;
    }
  }

  private renderBars(
    ctx: CanvasRenderingContext2D,
    innerRadius: number,
    outerRadius: number
  ): void {
    const { barCount, barWidth, barMinHeight, barRadius } = this.options;
    const angleStep = (this.options.endAngle - this.options.startAngle) / barCount;

    for (let i = 0; i < barCount; i++) {
      const angle = this.options.startAngle + i * angleStep;
      const state = this.barStates[i];
      const barHeight = Math.max(barMinHeight, state.currentHeight);
      
      ctx.save();
      ctx.rotate(angle);
      
      ctx.fillStyle = this.getBarColor(i, barHeight);
      
      if (barRadius > 0) {
        this.drawRoundedRect(ctx, -barWidth / 2, innerRadius, barWidth, barHeight, barRadius);
      } else {
        ctx.fillRect(-barWidth / 2, innerRadius, barWidth, barHeight);
      }
      
      if (this.options.mirror) {
        ctx.globalAlpha = 0.4;
        if (barRadius > 0) {
          this.drawRoundedRect(ctx, -barWidth / 2, -innerRadius - barHeight, barWidth, barHeight, barRadius);
        } else {
          ctx.fillRect(-barWidth / 2, -innerRadius - barHeight, barWidth, barHeight);
        }
        ctx.globalAlpha = 1;
      }
      
      ctx.restore();
    }
  }

  private renderWave(ctx: CanvasRenderingContext2D, innerRadius: number): void {
    const { barCount, barMaxHeight } = this.options;
    const angleStep = (this.options.endAngle - this.options.startAngle) / barCount;

    ctx.beginPath();
    ctx.strokeStyle = this.options.color;
    ctx.lineWidth = 3;

    for (let i = 0; i <= barCount; i++) {
      const index = i % barCount;
      const angle = this.options.startAngle + i * angleStep;
      const state = this.barStates[index];
      const radius = innerRadius + state.currentHeight;
      
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (this.options.endAngle - this.options.startAngle >= Math.PI * 2) {
      ctx.closePath();
    }
    
    const gradient = ctx.createRadialGradient(0, 0, innerRadius, 0, 0, innerRadius + barMaxHeight);
    gradient.addColorStop(0, this.options.color);
    gradient.addColorStop(1, this.options.secondaryColor);
    ctx.strokeStyle = gradient;
    
    ctx.stroke();
  }

  private renderDots(
    ctx: CanvasRenderingContext2D,
    innerRadius: number,
    outerRadius: number
  ): void {
    const { barCount, barMaxHeight } = this.options;
    const angleStep = (this.options.endAngle - this.options.startAngle) / barCount;

    for (let i = 0; i < barCount; i++) {
      const angle = this.options.startAngle + i * angleStep;
      const state = this.barStates[i];
      const radius = innerRadius + state.currentHeight;
      const dotSize = 2 + state.currentHeight / barMaxHeight * 6;
      
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = this.getBarColor(i, state.currentHeight);
      ctx.fill();
    }
  }

  private renderSpikes(
    ctx: CanvasRenderingContext2D,
    innerRadius: number,
    outerRadius: number
  ): void {
    const { barCount, barWidth, barMinHeight } = this.options;
    const angleStep = (this.options.endAngle - this.options.startAngle) / barCount;
    const halfAngle = angleStep / 4;

    for (let i = 0; i < barCount; i++) {
      const angle = this.options.startAngle + i * angleStep;
      const state = this.barStates[i];
      const barHeight = Math.max(barMinHeight, state.currentHeight);
      
      const innerX1 = Math.cos(angle - halfAngle) * innerRadius;
      const innerY1 = Math.sin(angle - halfAngle) * innerRadius;
      const innerX2 = Math.cos(angle + halfAngle) * innerRadius;
      const innerY2 = Math.sin(angle + halfAngle) * innerRadius;
      
      const outerX = Math.cos(angle) * (innerRadius + barHeight);
      const outerY = Math.sin(angle) * (innerRadius + barHeight);
      
      ctx.beginPath();
      ctx.moveTo(innerX1, innerY1);
      ctx.lineTo(outerX, outerY);
      ctx.lineTo(innerX2, innerY2);
      ctx.closePath();
      
      ctx.fillStyle = this.getBarColor(i, barHeight);
      ctx.fill();
    }
  }

  private renderRing(ctx: CanvasRenderingContext2D, innerRadius: number): void {
    const { barCount, barMaxHeight } = this.options;
    const angleStep = (this.options.endAngle - this.options.startAngle) / barCount;

    ctx.beginPath();
    
    for (let i = 0; i <= barCount; i++) {
      const index = i % barCount;
      const angle = this.options.startAngle + i * angleStep;
      const state = this.barStates[index];
      const radius = innerRadius + state.currentHeight;
      
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.closePath();
    
    for (let i = barCount; i >= 0; i--) {
      const index = i % barCount;
      const angle = this.options.startAngle + i * angleStep;
      const x = Math.cos(angle) * innerRadius;
      const y = Math.sin(angle) * innerRadius;
      ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    
    const gradient = ctx.createRadialGradient(0, 0, innerRadius, 0, 0, innerRadius + barMaxHeight);
    gradient.addColorStop(0, this.options.color);
    gradient.addColorStop(1, this.options.secondaryColor);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  private getBarColor(index: number, height: number): string {
    const { gradientColors, barCount, useRadialGradient } = this.options;
    
    if (useRadialGradient && gradientColors.length > 1) {
      const colorIndex = Math.floor((index / barCount) * (gradientColors.length - 1));
      const t = ((index / barCount) * (gradientColors.length - 1)) % 1;
      return this.interpolateColors(
        gradientColors[colorIndex],
        gradientColors[colorIndex + 1] || gradientColors[colorIndex],
        t
      );
    }
    
    return this.options.color;
  }

  private emitParticles(width: number, height: number): void {
    const centerX = width * this.options.centerX;
    const centerY = height * this.options.centerY;
    
    for (let i = 0; i < this.options.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.options.particleSpeed * (0.5 + Math.random() * 0.5);
      
      this.particles.push({
        x: centerX + Math.cos(angle) * this.options.innerRadius,
        y: centerY + Math.sin(angle) * this.options.innerRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: this.options.particleSize * (0.5 + Math.random() * 0.5),
        life: this.options.particleLifetime,
        maxLife: this.options.particleLifetime,
        color: this.options.particleColor,
      });
    }
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      return p.life > 0;
    });
  }

  private renderParticles(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number
  ): void {
    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    this.particles = [];
    this.currentRotation = this.options.rotation;
    this.pulseScale = 1;
  }

  dispose(): void {
    this.barStates = [];
    this.particles = [];
  }
}
