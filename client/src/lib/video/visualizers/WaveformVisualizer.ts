import type { AudioAnalysisData } from '../AudioAnalyzer';

export type WaveformMode = 'line' | 'filled' | 'mirrored' | 'bars' | 'dots';

export interface WaveformVisualizerOptions {
  mode: WaveformMode;
  sampleCount: number;
  lineWidth: number;
  color: string;
  secondaryColor: string;
  gradientColors: string[];
  useGradient: boolean;
  gradientDirection: 'horizontal' | 'vertical';
  fillOpacity: number;
  mirror: boolean;
  glow: boolean;
  glowColor: string;
  glowIntensity: number;
  glowBlur: number;
  smoothing: number;
  amplitude: number;
  yOffset: number;
  closed: boolean;
  tension: number;
  dotSize: number;
  barWidth: number;
  beatReactive: boolean;
  beatAmplitudeMultiplier: number;
}

export class WaveformVisualizer {
  private options: WaveformVisualizerOptions;
  private smoothedData: number[] = [];
  private previousData: number[] = [];
  private beatScale: number = 1;

  static readonly defaultOptions: WaveformVisualizerOptions = {
    mode: 'line',
    sampleCount: 128,
    lineWidth: 3,
    color: '#00ffff',
    secondaryColor: '#ff00ff',
    gradientColors: ['#ff0080', '#8000ff', '#00ffff'],
    useGradient: true,
    gradientDirection: 'horizontal',
    fillOpacity: 0.3,
    mirror: false,
    glow: true,
    glowColor: '#00ffff',
    glowIntensity: 0.7,
    glowBlur: 12,
    smoothing: 0.5,
    amplitude: 1,
    yOffset: 0,
    closed: false,
    tension: 0.4,
    dotSize: 4,
    barWidth: 3,
    beatReactive: true,
    beatAmplitudeMultiplier: 1.5,
  };

  constructor(options: Partial<WaveformVisualizerOptions> = {}) {
    this.options = { ...WaveformVisualizer.defaultOptions, ...options };
    this.initializeData();
  }

  private initializeData(): void {
    this.smoothedData = new Array(this.options.sampleCount).fill(0.5);
    this.previousData = new Array(this.options.sampleCount).fill(0.5);
  }

  updateOptions(options: Partial<WaveformVisualizerOptions>): void {
    const prevSampleCount = this.options.sampleCount;
    this.options = { ...this.options, ...options };
    
    if (options.sampleCount && options.sampleCount !== prevSampleCount) {
      this.initializeData();
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    audioData: AudioAnalysisData,
    width: number,
    height: number,
    time: number
  ): void {
    const waveformData = this.getWaveformData(audioData);
    this.updateSmoothedData(waveformData);
    
    if (this.options.beatReactive && audioData.beatDetected) {
      this.beatScale = this.options.beatAmplitudeMultiplier;
    } else {
      this.beatScale += (1 - this.beatScale) * 0.1;
    }

    ctx.save();

    if (this.options.glow) {
      ctx.shadowColor = this.options.glowColor;
      ctx.shadowBlur = this.options.glowBlur * this.options.glowIntensity;
    }

    const centerY = height / 2 + this.options.yOffset;
    
    switch (this.options.mode) {
      case 'filled':
        this.renderFilled(ctx, width, height, centerY);
        break;
      case 'mirrored':
        this.renderMirrored(ctx, width, height, centerY);
        break;
      case 'bars':
        this.renderBars(ctx, width, height, centerY);
        break;
      case 'dots':
        this.renderDots(ctx, width, height, centerY);
        break;
      case 'line':
      default:
        this.renderLine(ctx, width, height, centerY);
        break;
    }

    ctx.restore();
  }

  private getWaveformData(audioData: AudioAnalysisData): number[] {
    const { timeDomainData } = audioData;
    const data: number[] = [];
    const step = Math.floor(timeDomainData.length / this.options.sampleCount);

    for (let i = 0; i < this.options.sampleCount; i++) {
      const index = Math.min(i * step, timeDomainData.length - 1);
      data.push(timeDomainData[index] / 255);
    }

    return data;
  }

  private updateSmoothedData(newData: number[]): void {
    const smoothFactor = this.options.smoothing;
    
    for (let i = 0; i < this.options.sampleCount; i++) {
      this.previousData[i] = this.smoothedData[i];
      this.smoothedData[i] = this.smoothedData[i] * smoothFactor + newData[i] * (1 - smoothFactor);
    }
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerY: number
  ): void {
    const amplitude = (height / 2) * this.options.amplitude * this.beatScale;
    
    ctx.strokeStyle = this.createGradient(ctx, width, height, false);
    ctx.lineWidth = this.options.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    
    const points = this.getPoints(width, amplitude, centerY);
    
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, points);
    } else {
      this.drawLinearPath(ctx, points);
    }

    ctx.stroke();
  }

  private renderFilled(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerY: number
  ): void {
    const amplitude = (height / 2) * this.options.amplitude * this.beatScale;
    const points = this.getPoints(width, amplitude, centerY);

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, points, true);
    } else {
      this.drawLinearPath(ctx, points, true);
    }
    
    ctx.lineTo(width, centerY);
    ctx.closePath();

    const gradient = this.createGradient(ctx, width, height, true);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = this.options.fillOpacity;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = this.createGradient(ctx, width, height, false);
    ctx.lineWidth = this.options.lineWidth;
    
    ctx.beginPath();
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, points);
    } else {
      this.drawLinearPath(ctx, points);
    }
    ctx.stroke();
  }

  private renderMirrored(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerY: number
  ): void {
    const amplitude = (height / 4) * this.options.amplitude * this.beatScale;
    const points = this.getPoints(width, amplitude, centerY);
    const mirroredPoints = points.map(p => ({ x: p.x, y: centerY + (centerY - p.y) }));

    ctx.beginPath();
    
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, points, true);
    } else {
      this.drawLinearPath(ctx, points, true);
    }
    
    for (let i = mirroredPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(mirroredPoints[i].x, mirroredPoints[i].y);
    }
    
    ctx.closePath();

    const gradient = this.createGradient(ctx, width, height, true);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = this.options.fillOpacity;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = this.createGradient(ctx, width, height, false);
    ctx.lineWidth = this.options.lineWidth;
    
    ctx.beginPath();
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, points);
    } else {
      this.drawLinearPath(ctx, points);
    }
    ctx.stroke();
    
    ctx.beginPath();
    if (this.options.tension > 0) {
      this.drawSmoothCurve(ctx, mirroredPoints);
    } else {
      this.drawLinearPath(ctx, mirroredPoints);
    }
    ctx.stroke();
  }

  private renderBars(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerY: number
  ): void {
    const amplitude = (height / 2) * this.options.amplitude * this.beatScale;
    const barWidth = this.options.barWidth;
    const gap = (width - this.options.sampleCount * barWidth) / (this.options.sampleCount - 1);

    ctx.fillStyle = this.createGradient(ctx, width, height, true);

    for (let i = 0; i < this.options.sampleCount; i++) {
      const x = i * (barWidth + gap);
      const value = (this.smoothedData[i] - 0.5) * 2 * amplitude;
      
      ctx.fillRect(x, centerY, barWidth, -value);
      
      if (this.options.mirror) {
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x, centerY, barWidth, value * 0.5);
        ctx.globalAlpha = 1;
      }
    }
  }

  private renderDots(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerY: number
  ): void {
    const amplitude = (height / 2) * this.options.amplitude * this.beatScale;
    const points = this.getPoints(width, amplitude, centerY);

    ctx.fillStyle = this.createGradient(ctx, width, height, true);

    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, this.options.dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.options.lineWidth > 0) {
      ctx.strokeStyle = this.createGradient(ctx, width, height, false);
      ctx.lineWidth = this.options.lineWidth / 2;
      
      ctx.beginPath();
      if (this.options.tension > 0) {
        this.drawSmoothCurve(ctx, points);
      } else {
        this.drawLinearPath(ctx, points);
      }
      ctx.stroke();
    }
  }

  private getPoints(width: number, amplitude: number, centerY: number): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const step = width / (this.options.sampleCount - 1);

    for (let i = 0; i < this.options.sampleCount; i++) {
      const x = i * step;
      const value = (this.smoothedData[i] - 0.5) * 2 * amplitude;
      points.push({ x, y: centerY - value });
    }

    return points;
  }

  private drawLinearPath(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    startFromFirst: boolean = false
  ): void {
    if (points.length === 0) return;
    
    if (startFromFirst) {
      ctx.moveTo(points[0].x, points[0].y);
    } else {
      ctx.moveTo(points[0].x, points[0].y);
    }
    
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  }

  private drawSmoothCurve(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    startFromFirst: boolean = false
  ): void {
    if (points.length < 2) return;

    const tension = this.options.tension;
    
    if (startFromFirst) {
      ctx.moveTo(points[0].x, points[0].y);
    } else {
      ctx.moveTo(points[0].x, points[0].y);
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
      const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
      const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
      const cp2y = p2.y - (p3.y - p1.y) * tension / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  private createGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    forFill: boolean
  ): string | CanvasGradient {
    if (!this.options.useGradient) {
      return forFill ? this.options.color : this.options.color;
    }

    const colors = this.options.gradientColors.length > 0 
      ? this.options.gradientColors 
      : [this.options.color, this.options.secondaryColor];

    let gradient: CanvasGradient;
    
    if (this.options.gradientDirection === 'horizontal') {
      gradient = ctx.createLinearGradient(0, 0, width, 0);
    } else {
      gradient = ctx.createLinearGradient(0, 0, 0, height);
    }

    colors.forEach((color, index) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });

    return gradient;
  }

  reset(): void {
    this.initializeData();
    this.beatScale = 1;
  }

  dispose(): void {
    this.smoothedData = [];
    this.previousData = [];
  }
}
