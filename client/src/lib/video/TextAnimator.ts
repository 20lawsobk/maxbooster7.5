import type { AudioAnalysisData, BeatInfo } from './AudioAnalyzer';

export type TextAnimationStyle = 'fade' | 'slide' | 'zoom' | 'bounce' | 'typewriter' | 'glitch' | 'wave' | 'shake' | 'none';
export type EasingFunction = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce' | 'elastic';

export interface TextStyle {
  font: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glowColor?: string;
  glowIntensity?: number;
  gradientColors?: string[];
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal';
  letterSpacing?: number;
  lineHeight?: number;
}

export interface AnimatedCharacter {
  char: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  color: string;
  delay: number;
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  characters: CharacterTiming[];
}

export interface CharacterTiming {
  char: string;
  startTime: number;
  endTime: number;
  index: number;
}

export interface TextPathConfig {
  type: 'arc' | 'wave' | 'circle' | 'custom';
  amplitude?: number;
  frequency?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  customPath?: (t: number, width: number, height: number) => { x: number; y: number };
}

export interface AnimationConfig {
  style: TextAnimationStyle;
  duration: number;
  delay: number;
  easing: EasingFunction;
  stagger?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  intensity?: number;
}

export interface BeatSyncConfig {
  enabled: boolean;
  property: 'scale' | 'opacity' | 'glow' | 'color' | 'shake';
  intensity: number;
  decay: number;
}

const EASING_FUNCTIONS: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    const s = p / 4;
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
  },
};

export class TextAnimator {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private beatMultiplier: number = 1;
  private lastBeatTime: number = 0;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  updateDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  splitTextToWords(text: string, duration: number, startTime: number = 0): WordTiming[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const totalChars = words.reduce((sum, w) => sum + w.length, 0);
    const timePerChar = duration / totalChars;
    
    let currentTime = startTime;
    const wordTimings: WordTiming[] = [];
    
    for (const word of words) {
      const wordStart = currentTime;
      const characters: CharacterTiming[] = [];
      
      for (let i = 0; i < word.length; i++) {
        characters.push({
          char: word[i],
          startTime: currentTime,
          endTime: currentTime + timePerChar,
          index: i,
        });
        currentTime += timePerChar;
      }
      
      wordTimings.push({
        word,
        startTime: wordStart,
        endTime: currentTime,
        characters,
      });
    }
    
    return wordTimings;
  }

  splitTextToCharacters(text: string, duration: number, startTime: number = 0): CharacterTiming[] {
    const chars = text.split('');
    const timePerChar = duration / chars.length;
    
    return chars.map((char, index) => ({
      char,
      startTime: startTime + index * timePerChar,
      endTime: startTime + (index + 1) * timePerChar,
      index,
    }));
  }

  measureText(text: string, style: TextStyle): { width: number; height: number } {
    this.applyTextStyle(style);
    const metrics = this.ctx.measureText(text);
    const height = style.fontSize * (style.lineHeight || 1.2);
    return { width: metrics.width, height };
  }

  measureCharacters(text: string, style: TextStyle): { char: string; width: number; x: number }[] {
    this.applyTextStyle(style);
    const chars: { char: string; width: number; x: number }[] = [];
    let x = 0;
    
    for (const char of text) {
      const width = this.ctx.measureText(char).width + (style.letterSpacing || 0);
      chars.push({ char, width, x });
      x += width;
    }
    
    return chars;
  }

  private applyTextStyle(style: TextStyle): void {
    this.ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.font}`;
    this.ctx.fillStyle = style.color;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'left';
  }

  private getEasedProgress(progress: number, easing: EasingFunction): number {
    return EASING_FUNCTIONS[easing](Math.max(0, Math.min(1, progress)));
  }

  applyBeatSync(beatInfo: BeatInfo | null, config: BeatSyncConfig): void {
    if (!config.enabled || !beatInfo) return;
    
    if (beatInfo.detected) {
      this.beatMultiplier = 1 + config.intensity;
      this.lastBeatTime = performance.now();
    } else {
      const timeSinceBeat = performance.now() - this.lastBeatTime;
      const decay = Math.exp(-timeSinceBeat * config.decay / 1000);
      this.beatMultiplier = 1 + (this.beatMultiplier - 1) * decay;
    }
  }

  renderAnimatedText(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    animation: AnimationConfig,
    currentTime: number,
    startTime: number
  ): void {
    const elapsed = currentTime - startTime - animation.delay;
    if (elapsed < 0) return;
    
    const progress = Math.min(1, elapsed / animation.duration);
    const easedProgress = this.getEasedProgress(progress, animation.easing);
    
    switch (animation.style) {
      case 'fade':
        this.renderFadeAnimation(text, x, y, style, easedProgress);
        break;
      case 'slide':
        this.renderSlideAnimation(text, x, y, style, easedProgress, animation.direction || 'left');
        break;
      case 'zoom':
        this.renderZoomAnimation(text, x, y, style, easedProgress);
        break;
      case 'bounce':
        this.renderBounceAnimation(text, x, y, style, easedProgress);
        break;
      case 'typewriter':
        this.renderTypewriterAnimation(text, x, y, style, easedProgress);
        break;
      case 'glitch':
        this.renderGlitchAnimation(text, x, y, style, easedProgress, currentTime);
        break;
      case 'wave':
        this.renderWaveAnimation(text, x, y, style, currentTime, animation.intensity || 10);
        break;
      case 'shake':
        this.renderShakeAnimation(text, x, y, style, currentTime, animation.intensity || 5);
        break;
      default:
        this.renderText(text, x, y, style);
    }
  }

  renderCharacterByCharacter(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    currentTime: number,
    charTimings: CharacterTiming[],
    highlightStyle?: Partial<TextStyle>
  ): void {
    this.applyTextStyle(style);
    const chars = this.measureCharacters(text, style);
    
    for (let i = 0; i < chars.length; i++) {
      const timing = charTimings[i];
      if (!timing) continue;
      
      const isActive = currentTime >= timing.startTime && currentTime < timing.endTime;
      const isPast = currentTime >= timing.endTime;
      
      let charStyle = { ...style };
      if ((isActive || isPast) && highlightStyle) {
        charStyle = { ...style, ...highlightStyle };
      }
      
      this.renderText(chars[i].char, x + chars[i].x, y, charStyle);
    }
  }

  renderText(text: string, x: number, y: number, style: TextStyle): void {
    this.ctx.save();
    this.applyTextStyle(style);
    
    if (style.glowColor && style.glowIntensity) {
      this.ctx.shadowColor = style.glowColor;
      this.ctx.shadowBlur = style.glowIntensity;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 0;
      this.ctx.fillText(text, x, y);
      this.ctx.fillText(text, x, y);
    }
    
    if (style.shadowColor) {
      this.ctx.shadowColor = style.shadowColor;
      this.ctx.shadowBlur = style.shadowBlur || 0;
      this.ctx.shadowOffsetX = style.shadowOffsetX || 0;
      this.ctx.shadowOffsetY = style.shadowOffsetY || 0;
    }
    
    if (style.gradientColors && style.gradientColors.length >= 2) {
      const gradient = this.createTextGradient(x, y, text, style);
      this.ctx.fillStyle = gradient;
    }
    
    if (style.strokeColor && style.strokeWidth) {
      this.ctx.strokeStyle = style.strokeColor;
      this.ctx.lineWidth = style.strokeWidth;
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(text, x, y);
    }
    
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  private createTextGradient(x: number, y: number, text: string, style: TextStyle): CanvasGradient {
    const metrics = this.ctx.measureText(text);
    let gradient: CanvasGradient;
    
    switch (style.gradientDirection) {
      case 'vertical':
        gradient = this.ctx.createLinearGradient(x, y - style.fontSize / 2, x, y + style.fontSize / 2);
        break;
      case 'diagonal':
        gradient = this.ctx.createLinearGradient(x, y - style.fontSize / 2, x + metrics.width, y + style.fontSize / 2);
        break;
      default:
        gradient = this.ctx.createLinearGradient(x, y, x + metrics.width, y);
    }
    
    const colors = style.gradientColors!;
    for (let i = 0; i < colors.length; i++) {
      gradient.addColorStop(i / (colors.length - 1), colors[i]);
    }
    
    return gradient;
  }

  private renderFadeAnimation(text: string, x: number, y: number, style: TextStyle, progress: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = progress;
    this.renderText(text, x, y, style);
    this.ctx.restore();
  }

  private renderSlideAnimation(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    progress: number,
    direction: 'left' | 'right' | 'up' | 'down'
  ): void {
    const distance = 100;
    let offsetX = 0;
    let offsetY = 0;
    
    switch (direction) {
      case 'left':
        offsetX = (1 - progress) * -distance;
        break;
      case 'right':
        offsetX = (1 - progress) * distance;
        break;
      case 'up':
        offsetY = (1 - progress) * -distance;
        break;
      case 'down':
        offsetY = (1 - progress) * distance;
        break;
    }
    
    this.ctx.save();
    this.ctx.globalAlpha = progress;
    this.renderText(text, x + offsetX, y + offsetY, style);
    this.ctx.restore();
  }

  private renderZoomAnimation(text: string, x: number, y: number, style: TextStyle, progress: number): void {
    const scale = 0.5 + progress * 0.5;
    
    this.ctx.save();
    this.ctx.globalAlpha = progress;
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    this.renderText(text, 0, 0, style);
    this.ctx.restore();
  }

  private renderBounceAnimation(text: string, x: number, y: number, style: TextStyle, progress: number): void {
    const bounceProgress = EASING_FUNCTIONS.bounce(progress);
    const scale = bounceProgress;
    const offsetY = (1 - bounceProgress) * -50;
    
    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, progress * 2);
    this.ctx.translate(x, y + offsetY);
    this.ctx.scale(scale, scale);
    this.renderText(text, 0, 0, style);
    this.ctx.restore();
  }

  private renderTypewriterAnimation(text: string, x: number, y: number, style: TextStyle, progress: number): void {
    const visibleChars = Math.floor(text.length * progress);
    const visibleText = text.substring(0, visibleChars);
    
    this.renderText(visibleText, x, y, style);
    
    if (visibleChars < text.length && Math.floor(progress * 10) % 2 === 0) {
      const cursorX = x + this.ctx.measureText(visibleText).width;
      this.renderText('|', cursorX, y, style);
    }
  }

  private renderGlitchAnimation(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    progress: number,
    time: number
  ): void {
    const glitchIntensity = Math.sin(time * 50) * (1 - progress) * 10;
    const sliceCount = 5;
    
    this.ctx.save();
    this.applyTextStyle(style);
    
    for (let i = 0; i < sliceCount; i++) {
      const sliceY = y - style.fontSize / 2 + (i / sliceCount) * style.fontSize;
      const sliceHeight = style.fontSize / sliceCount;
      const offsetX = (Math.random() - 0.5) * glitchIntensity;
      
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, sliceY, this.width, sliceHeight);
      this.ctx.clip();
      
      if (Math.random() < 0.3 * (1 - progress)) {
        this.ctx.fillStyle = i % 2 === 0 ? '#ff0000' : '#00ffff';
      }
      
      this.ctx.fillText(text, x + offsetX, y);
      this.ctx.restore();
    }
    
    this.ctx.globalAlpha = progress;
    this.renderText(text, x, y, style);
    this.ctx.restore();
  }

  renderWaveAnimation(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    time: number,
    amplitude: number = 10
  ): void {
    this.applyTextStyle(style);
    const chars = this.measureCharacters(text, style);
    
    for (let i = 0; i < chars.length; i++) {
      const waveOffset = Math.sin(time * 5 + i * 0.5) * amplitude;
      this.renderText(chars[i].char, x + chars[i].x, y + waveOffset, style);
    }
  }

  renderShakeAnimation(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    time: number,
    intensity: number = 5
  ): void {
    const offsetX = (Math.random() - 0.5) * intensity * 2;
    const offsetY = (Math.random() - 0.5) * intensity * 2;
    this.renderText(text, x + offsetX, y + offsetY, style);
  }

  renderTextOnPath(
    text: string,
    style: TextStyle,
    pathConfig: TextPathConfig,
    progress: number = 1
  ): void {
    this.applyTextStyle(style);
    const chars = this.measureCharacters(text, style);
    const totalWidth = chars.reduce((sum, c) => sum + c.width, 0);
    
    const visibleChars = Math.floor(chars.length * progress);
    
    for (let i = 0; i < visibleChars; i++) {
      const charProgress = chars[i].x / totalWidth;
      const pos = this.getPathPosition(charProgress, pathConfig);
      
      this.ctx.save();
      this.ctx.translate(pos.x, pos.y);
      
      if (pathConfig.type === 'arc' || pathConfig.type === 'circle') {
        const angle = this.getPathAngle(charProgress, pathConfig);
        this.ctx.rotate(angle);
      }
      
      this.renderText(chars[i].char, 0, 0, style);
      this.ctx.restore();
    }
  }

  private getPathPosition(t: number, config: TextPathConfig): { x: number; y: number } {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    switch (config.type) {
      case 'arc': {
        const radius = config.radius || 200;
        const startAngle = config.startAngle || -Math.PI / 2;
        const endAngle = config.endAngle || Math.PI / 2;
        const angle = startAngle + t * (endAngle - startAngle);
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      }
      case 'wave': {
        const amplitude = config.amplitude || 50;
        const frequency = config.frequency || 2;
        return {
          x: t * this.width,
          y: centerY + Math.sin(t * Math.PI * 2 * frequency) * amplitude,
        };
      }
      case 'circle': {
        const radius = config.radius || 150;
        const angle = t * Math.PI * 2;
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      }
      case 'custom':
        if (config.customPath) {
          return config.customPath(t, this.width, this.height);
        }
        return { x: t * this.width, y: centerY };
      default:
        return { x: t * this.width, y: centerY };
    }
  }

  private getPathAngle(t: number, config: TextPathConfig): number {
    switch (config.type) {
      case 'arc':
      case 'circle': {
        const startAngle = config.startAngle || -Math.PI / 2;
        const endAngle = config.endAngle || Math.PI / 2;
        return startAngle + t * (endAngle - startAngle) + Math.PI / 2;
      }
      default:
        return 0;
    }
  }

  renderOutlineText(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    outlineWidth: number = 4,
    outlineColor: string = '#000000'
  ): void {
    this.ctx.save();
    this.applyTextStyle(style);
    
    this.ctx.strokeStyle = outlineColor;
    this.ctx.lineWidth = outlineWidth;
    this.ctx.lineJoin = 'round';
    this.ctx.strokeText(text, x, y);
    
    this.renderText(text, x, y, style);
    this.ctx.restore();
  }

  renderGlowText(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    glowColor: string = '#ffffff',
    glowIntensity: number = 20
  ): void {
    this.ctx.save();
    this.applyTextStyle(style);
    
    for (let i = 0; i < 3; i++) {
      this.ctx.shadowColor = glowColor;
      this.ctx.shadowBlur = glowIntensity * (1 - i * 0.3);
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 0;
      this.ctx.fillText(text, x, y);
    }
    
    this.ctx.shadowBlur = 0;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  renderShadowText(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    shadowConfig: {
      color: string;
      blur: number;
      offsetX: number;
      offsetY: number;
      layers?: number;
    }
  ): void {
    this.ctx.save();
    this.applyTextStyle(style);
    
    const layers = shadowConfig.layers || 1;
    
    for (let i = layers; i >= 1; i--) {
      this.ctx.fillStyle = shadowConfig.color;
      this.ctx.globalAlpha = 0.3 / i;
      this.ctx.fillText(
        text,
        x + shadowConfig.offsetX * i,
        y + shadowConfig.offsetY * i
      );
    }
    
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = style.color;
    this.renderText(text, x, y, style);
    this.ctx.restore();
  }

  renderBeatReactiveText(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    audioData: AudioAnalysisData | null,
    reactivity: {
      scaleOnBeat?: number;
      glowOnBeat?: boolean;
      colorShift?: boolean;
    } = {}
  ): void {
    if (!audioData) {
      this.renderText(text, x, y, style);
      return;
    }
    
    const { bass, beatDetected } = audioData;
    let modifiedStyle = { ...style };
    
    this.ctx.save();
    
    const scale = 1 + bass * (reactivity.scaleOnBeat || 0.1) * this.beatMultiplier;
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    
    if (reactivity.glowOnBeat && beatDetected) {
      modifiedStyle.glowColor = style.color;
      modifiedStyle.glowIntensity = 30 * bass;
    }
    
    if (reactivity.colorShift) {
      const hueShift = bass * 30;
      modifiedStyle.color = this.shiftHue(style.color, hueShift);
    }
    
    this.renderText(text, 0, 0, modifiedStyle);
    this.ctx.restore();
  }

  private shiftHue(hexColor: string, degrees: number): string {
    const rgb = this.hexToRgb(hexColor);
    if (!rgb) return hexColor;
    
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.h = (hsl.h + degrees) % 360;
    const newRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
    
    return this.rgbToHex(newRgb.r, newRgb.g, newRgb.b);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: h * 360, s, l };
  }

  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  wrapText(text: string, maxWidth: number, style: TextStyle): string[] {
    this.applyTextStyle(style);
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  dispose(): void {
    this.beatMultiplier = 1;
    this.lastBeatTime = 0;
  }
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'Arial',
  fontSize: 48,
  fontWeight: 'bold',
  color: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowBlur: 4,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  letterSpacing: 0,
  lineHeight: 1.2,
};

export const ANIMATION_PRESETS: Record<string, AnimationConfig> = {
  fadeIn: { style: 'fade', duration: 500, delay: 0, easing: 'easeOut' },
  slideUp: { style: 'slide', duration: 400, delay: 0, easing: 'easeOut', direction: 'up' },
  slideDown: { style: 'slide', duration: 400, delay: 0, easing: 'easeOut', direction: 'down' },
  zoomIn: { style: 'zoom', duration: 300, delay: 0, easing: 'easeOut' },
  bounceIn: { style: 'bounce', duration: 600, delay: 0, easing: 'bounce' },
  typewriter: { style: 'typewriter', duration: 2000, delay: 0, easing: 'linear' },
  glitchIn: { style: 'glitch', duration: 800, delay: 0, easing: 'easeOut' },
  wave: { style: 'wave', duration: 0, delay: 0, easing: 'linear', intensity: 10 },
  shake: { style: 'shake', duration: 0, delay: 0, easing: 'linear', intensity: 5 },
};
