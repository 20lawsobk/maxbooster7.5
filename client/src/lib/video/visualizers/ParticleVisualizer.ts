import type { AudioAnalysisData } from '../AudioAnalyzer';

export type ParticleShape = 'circle' | 'square' | 'star' | 'triangle' | 'diamond' | 'spark';
export type EmissionPattern = 'point' | 'line' | 'circle' | 'rectangle' | 'random';

export interface ParticleVisualizerOptions {
  maxParticles: number;
  emissionRate: number;
  emissionPattern: EmissionPattern;
  emissionArea: { x: number; y: number; width: number; height: number };
  emissionRadius: number;
  particleShape: ParticleShape;
  sizeMin: number;
  sizeMax: number;
  speedMin: number;
  speedMax: number;
  lifetime: number;
  lifetimeVariance: number;
  gravity: number;
  friction: number;
  turbulence: number;
  colors: string[];
  colorMode: 'random' | 'gradient' | 'cycle' | 'audio';
  opacity: number;
  opacityDecay: boolean;
  sizeDecay: boolean;
  glow: boolean;
  glowColor: string;
  glowIntensity: number;
  glowBlur: number;
  trailLength: number;
  trailOpacity: number;
  audioReactive: boolean;
  audioEmissionMultiplier: number;
  audioSizeMultiplier: number;
  audioSpeedMultiplier: number;
  beatBurst: boolean;
  beatBurstCount: number;
  beatBurstSpeed: number;
  rotationSpeed: number;
  rotationVariance: number;
  attractorStrength: number;
  attractorX: number;
  attractorY: number;
  bounce: boolean;
  bounceElasticity: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  initialSize: number;
  life: number;
  maxLife: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  shape: ParticleShape;
  trail: { x: number; y: number }[];
}

export class ParticleVisualizer {
  private options: ParticleVisualizerOptions;
  private particles: Particle[] = [];
  private emissionAccumulator: number = 0;
  private colorIndex: number = 0;
  private time: number = 0;

  static readonly defaultOptions: ParticleVisualizerOptions = {
    maxParticles: 1000,
    emissionRate: 10,
    emissionPattern: 'point',
    emissionArea: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    emissionRadius: 50,
    particleShape: 'circle',
    sizeMin: 2,
    sizeMax: 8,
    speedMin: 1,
    speedMax: 5,
    lifetime: 120,
    lifetimeVariance: 30,
    gravity: 0.1,
    friction: 0.99,
    turbulence: 0.5,
    colors: ['#ff0080', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0080ff', '#8000ff'],
    colorMode: 'random',
    opacity: 1,
    opacityDecay: true,
    sizeDecay: true,
    glow: true,
    glowColor: '#ffffff',
    glowIntensity: 0.6,
    glowBlur: 10,
    trailLength: 0,
    trailOpacity: 0.3,
    audioReactive: true,
    audioEmissionMultiplier: 3,
    audioSizeMultiplier: 2,
    audioSpeedMultiplier: 2,
    beatBurst: true,
    beatBurstCount: 50,
    beatBurstSpeed: 8,
    rotationSpeed: 0,
    rotationVariance: 0.1,
    attractorStrength: 0,
    attractorX: 0.5,
    attractorY: 0.5,
    bounce: false,
    bounceElasticity: 0.7,
  };

  constructor(options: Partial<ParticleVisualizerOptions> = {}) {
    this.options = { ...ParticleVisualizer.defaultOptions, ...options };
  }

  updateOptions(options: Partial<ParticleVisualizerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  render(
    ctx: CanvasRenderingContext2D,
    audioData: AudioAnalysisData,
    width: number,
    height: number,
    time: number
  ): void {
    this.time = time;
    
    const emissionMultiplier = this.options.audioReactive 
      ? 1 + audioData.average * this.options.audioEmissionMultiplier 
      : 1;
    
    this.emitParticles(width, height, emissionMultiplier);
    
    if (this.options.beatBurst && audioData.beatDetected) {
      this.emitBurstParticles(width, height);
    }
    
    this.updateParticles(width, height, audioData);
    
    ctx.save();
    
    if (this.options.glow) {
      ctx.shadowColor = this.options.glowColor;
      ctx.shadowBlur = this.options.glowBlur * this.options.glowIntensity;
    }
    
    if (this.options.trailLength > 0) {
      this.renderTrails(ctx);
    }
    
    this.renderParticles(ctx, audioData);
    
    ctx.restore();
  }

  private emitParticles(width: number, height: number, multiplier: number): void {
    this.emissionAccumulator += this.options.emissionRate * multiplier;
    
    while (this.emissionAccumulator >= 1 && this.particles.length < this.options.maxParticles) {
      this.emissionAccumulator--;
      this.createParticle(width, height);
    }
  }

  private emitBurstParticles(width: number, height: number): void {
    const centerX = width * this.options.emissionArea.x;
    const centerY = height * this.options.emissionArea.y;
    
    for (let i = 0; i < this.options.beatBurstCount && this.particles.length < this.options.maxParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.options.beatBurstSpeed * (0.5 + Math.random() * 0.5);
      
      this.particles.push(this.createParticleAt(
        centerX,
        centerY,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      ));
    }
  }

  private createParticle(width: number, height: number): void {
    const pos = this.getEmissionPosition(width, height);
    const angle = Math.random() * Math.PI * 2;
    const speed = this.options.speedMin + Math.random() * (this.options.speedMax - this.options.speedMin);
    
    this.particles.push(this.createParticleAt(
      pos.x,
      pos.y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - this.options.speedMax * 0.5
    ));
  }

  private createParticleAt(x: number, y: number, vx: number, vy: number): Particle {
    const size = this.options.sizeMin + Math.random() * (this.options.sizeMax - this.options.sizeMin);
    const lifetime = this.options.lifetime + (Math.random() - 0.5) * 2 * this.options.lifetimeVariance;
    
    return {
      x,
      y,
      vx,
      vy,
      size,
      initialSize: size,
      life: lifetime,
      maxLife: lifetime,
      color: this.getParticleColor(),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: this.options.rotationSpeed + (Math.random() - 0.5) * 2 * this.options.rotationVariance,
      shape: this.options.particleShape,
      trail: [],
    };
  }

  private getEmissionPosition(width: number, height: number): { x: number; y: number } {
    const area = this.options.emissionArea;
    const centerX = width * area.x;
    const centerY = height * area.y;
    const areaWidth = width * area.width;
    const areaHeight = height * area.height;

    switch (this.options.emissionPattern) {
      case 'point':
        return { x: centerX, y: centerY };
      
      case 'line':
        return {
          x: centerX - areaWidth / 2 + Math.random() * areaWidth,
          y: centerY,
        };
      
      case 'circle': {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * this.options.emissionRadius;
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      }
      
      case 'rectangle':
        return {
          x: centerX - areaWidth / 2 + Math.random() * areaWidth,
          y: centerY - areaHeight / 2 + Math.random() * areaHeight,
        };
      
      case 'random':
        return {
          x: Math.random() * width,
          y: Math.random() * height,
        };
      
      default:
        return { x: centerX, y: centerY };
    }
  }

  private getParticleColor(): string {
    const { colors, colorMode } = this.options;
    
    switch (colorMode) {
      case 'random':
        return colors[Math.floor(Math.random() * colors.length)];
      
      case 'cycle':
        this.colorIndex = (this.colorIndex + 1) % colors.length;
        return colors[this.colorIndex];
      
      case 'gradient': {
        const t = (this.particles.length / this.options.maxParticles) * (colors.length - 1);
        const index = Math.floor(t);
        const frac = t - index;
        return this.interpolateColors(
          colors[index],
          colors[Math.min(index + 1, colors.length - 1)],
          frac
        );
      }
      
      default:
        return colors[0];
    }
  }

  private updateParticles(width: number, height: number, audioData: AudioAnalysisData): void {
    const attractorX = width * this.options.attractorX;
    const attractorY = height * this.options.attractorY;
    
    this.particles = this.particles.filter(p => {
      if (this.options.trailLength > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > this.options.trailLength) {
          p.trail.shift();
        }
      }
      
      p.vy += this.options.gravity;
      
      p.vx += (Math.random() - 0.5) * this.options.turbulence;
      p.vy += (Math.random() - 0.5) * this.options.turbulence;
      
      if (this.options.attractorStrength !== 0) {
        const dx = attractorX - p.x;
        const dy = attractorY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          const force = this.options.attractorStrength / dist;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }
      
      p.vx *= this.options.friction;
      p.vy *= this.options.friction;
      
      p.x += p.vx;
      p.y += p.vy;
      
      p.rotation += p.rotationSpeed;
      
      if (this.options.bounce) {
        if (p.x < 0 || p.x > width) {
          p.vx *= -this.options.bounceElasticity;
          p.x = Math.max(0, Math.min(width, p.x));
        }
        if (p.y < 0 || p.y > height) {
          p.vy *= -this.options.bounceElasticity;
          p.y = Math.max(0, Math.min(height, p.y));
        }
      }
      
      p.life--;
      
      return p.life > 0;
    });
  }

  private renderTrails(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      if (particle.trail.length < 2) continue;
      
      ctx.beginPath();
      ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
      
      for (let i = 1; i < particle.trail.length; i++) {
        ctx.lineTo(particle.trail[i].x, particle.trail[i].y);
      }
      
      ctx.lineTo(particle.x, particle.y);
      
      const gradient = ctx.createLinearGradient(
        particle.trail[0].x,
        particle.trail[0].y,
        particle.x,
        particle.y
      );
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, particle.color);
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = particle.size * 0.5;
      ctx.lineCap = 'round';
      ctx.globalAlpha = this.options.trailOpacity;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D, audioData: AudioAnalysisData): void {
    const sizeMultiplier = this.options.audioReactive
      ? 1 + audioData.average * this.options.audioSizeMultiplier
      : 1;

    for (const particle of this.particles) {
      const lifeRatio = particle.life / particle.maxLife;
      
      let size = particle.size * sizeMultiplier;
      if (this.options.sizeDecay) {
        size *= lifeRatio;
      }
      
      let opacity = this.options.opacity;
      if (this.options.opacityDecay) {
        opacity *= lifeRatio;
      }
      
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = particle.color;
      
      this.drawShape(ctx, particle.shape, size);
      
      ctx.restore();
    }
  }

  private drawShape(ctx: CanvasRenderingContext2D, shape: ParticleShape, size: number): void {
    switch (shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        break;
      
      case 'square':
        ctx.fillRect(-size, -size, size * 2, size * 2);
        break;
      
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.866, size * 0.5);
        ctx.lineTo(-size * 0.866, size * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size, 0);
        ctx.closePath();
        ctx.fill();
        break;
      
      case 'star':
        this.drawStar(ctx, size, 5, 0.5);
        break;
      
      case 'spark':
        this.drawSpark(ctx, size);
        break;
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, size: number, points: number, innerRatio: number): void {
    ctx.beginPath();
    
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? size : size * innerRatio;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.closePath();
    ctx.fill();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.beginPath();
    
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.moveTo(-size, 0);
    ctx.lineTo(size, 0);
    
    const diagonal = size * 0.7;
    ctx.moveTo(-diagonal, -diagonal);
    ctx.lineTo(diagonal, diagonal);
    ctx.moveTo(diagonal, -diagonal);
    ctx.lineTo(-diagonal, diagonal);
    
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.lineWidth = size * 0.3;
    ctx.lineCap = 'round';
    ctx.stroke();
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

  getParticleCount(): number {
    return this.particles.length;
  }

  reset(): void {
    this.particles = [];
    this.emissionAccumulator = 0;
    this.colorIndex = 0;
  }

  dispose(): void {
    this.particles = [];
  }
}
