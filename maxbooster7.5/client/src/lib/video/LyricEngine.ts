import type { AudioAnalysisData, BeatInfo } from './AudioAnalyzer';
import { TextAnimator, type TextStyle, type AnimationConfig, type WordTiming, type CharacterTiming, DEFAULT_TEXT_STYLE, ANIMATION_PRESETS } from './TextAnimator';

export type LyricFormat = 'lrc' | 'srt' | 'plain';
export type DisplayMode = 'line' | 'word' | 'karaoke';
export type TextPosition = 'top' | 'center' | 'bottom' | 'custom';

export interface LyricLine {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: LyricWord[];
}

export interface LyricWord {
  text: string;
  startTime: number;
  endTime: number;
  index: number;
}

export interface LyricEngineConfig {
  displayMode: DisplayMode;
  textPosition: TextPosition;
  customPosition?: { x: number; y: number };
  textStyle: TextStyle;
  highlightStyle: Partial<TextStyle>;
  animationIn: AnimationConfig;
  animationOut: AnimationConfig;
  lineSpacing: number;
  maxLines: number;
  karaokeStyle: KaraokeStyle;
  backgroundEffect: BackgroundEffect;
  beatSync: BeatSyncOptions;
}

export interface KaraokeStyle {
  enabled: boolean;
  fillColor: string;
  fillDirection: 'left' | 'right';
  glowOnActive: boolean;
  glowColor: string;
  glowIntensity: number;
}

export interface BackgroundEffect {
  enabled: boolean;
  type: 'blur' | 'dim' | 'gradient' | 'none';
  intensity: number;
  color?: string;
  blurRadius?: number;
  gradientColors?: string[];
}

export interface BeatSyncOptions {
  enabled: boolean;
  pulseScale: number;
  glowOnBeat: boolean;
  shakeOnBeat: boolean;
  colorShiftOnBeat: boolean;
}

export interface ParsedLyrics {
  format: LyricFormat;
  lines: LyricLine[];
  metadata?: Record<string, string>;
}

export class LyricEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private config: LyricEngineConfig;
  private lyrics: LyricLine[] = [];
  private textAnimator: TextAnimator;
  private currentLineIndex: number = -1;
  private beatMultiplier: number = 1;
  private lastBeatTime: number = 0;

  constructor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    config?: Partial<LyricEngineConfig>
  ) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.config = { ...DEFAULT_LYRIC_CONFIG, ...config };
    this.textAnimator = new TextAnimator(ctx, width, height);
  }

  updateDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.textAnimator.updateDimensions(width, height);
  }

  updateConfig(config: Partial<LyricEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  parseLRC(lrcContent: string): ParsedLyrics {
    const lines: LyricLine[] = [];
    const metadata: Record<string, string> = {};
    const lrcLines = lrcContent.split('\n');
    
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const metaRegex = /\[([a-z]+):([^\]]+)\]/i;
    
    for (const line of lrcLines) {
      const metaMatch = line.match(metaRegex);
      if (metaMatch && !line.match(timeRegex)) {
        metadata[metaMatch[1]] = metaMatch[2];
        continue;
      }
      
      const times: number[] = [];
      let match;
      let text = line;
      
      while ((match = timeRegex.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
        times.push(minutes * 60 + seconds + milliseconds / 1000);
        text = text.replace(match[0], '');
      }
      
      text = text.trim();
      if (!text || times.length === 0) continue;
      
      for (const time of times) {
        lines.push({
          id: `lrc-${lines.length}`,
          text,
          startTime: time,
          endTime: time + 5,
        });
      }
    }
    
    lines.sort((a, b) => a.startTime - b.startTime);
    
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTime = lines[i + 1].startTime;
    }
    
    for (const line of lines) {
      line.words = this.generateWordTimings(line.text, line.startTime, line.endTime);
    }
    
    return { format: 'lrc', lines, metadata };
  }

  parseSRT(srtContent: string): ParsedLyrics {
    const lines: LyricLine[] = [];
    const blocks = srtContent.trim().split(/\n\n+/);
    
    for (const block of blocks) {
      const blockLines = block.split('\n');
      if (blockLines.length < 3) continue;
      
      const timeLine = blockLines[1];
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      
      if (!timeMatch) continue;
      
      const startTime = this.parseTimeCode(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const endTime = this.parseTimeCode(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      const text = blockLines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
      
      if (!text) continue;
      
      const line: LyricLine = {
        id: `srt-${lines.length}`,
        text,
        startTime,
        endTime,
        words: this.generateWordTimings(text, startTime, endTime),
      };
      
      lines.push(line);
    }
    
    return { format: 'srt', lines };
  }

  parsePlainText(text: string, duration: number, linesPerScreen: number = 2): ParsedLyrics {
    const rawLines = text.split('\n').filter(l => l.trim());
    const lines: LyricLine[] = [];
    const timePerLine = duration / rawLines.length;
    
    for (let i = 0; i < rawLines.length; i++) {
      const startTime = i * timePerLine;
      const endTime = (i + 1) * timePerLine;
      
      lines.push({
        id: `plain-${i}`,
        text: rawLines[i].trim(),
        startTime,
        endTime,
        words: this.generateWordTimings(rawLines[i].trim(), startTime, endTime),
      });
    }
    
    return { format: 'plain', lines };
  }

  private parseTimeCode(hours: string, minutes: string, seconds: string, milliseconds: string): number {
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      parseInt(milliseconds, 10) / 1000
    );
  }

  private generateWordTimings(text: string, startTime: number, endTime: number): LyricWord[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const duration = endTime - startTime;
    const totalChars = words.reduce((sum, w) => sum + w.length, 0);
    
    const result: LyricWord[] = [];
    let currentTime = startTime;
    
    for (let i = 0; i < words.length; i++) {
      const wordDuration = (words[i].length / totalChars) * duration;
      
      result.push({
        text: words[i],
        startTime: currentTime,
        endTime: currentTime + wordDuration,
        index: i,
      });
      
      currentTime += wordDuration;
    }
    
    return result;
  }

  loadLyrics(content: string, format: LyricFormat, duration?: number): void {
    let parsed: ParsedLyrics;
    
    switch (format) {
      case 'lrc':
        parsed = this.parseLRC(content);
        break;
      case 'srt':
        parsed = this.parseSRT(content);
        break;
      case 'plain':
        parsed = this.parsePlainText(content, duration || 180);
        break;
      default:
        throw new Error(`Unsupported lyric format: ${format}`);
    }
    
    this.lyrics = parsed.lines;
    this.currentLineIndex = -1;
  }

  setLyrics(lines: LyricLine[]): void {
    this.lyrics = lines;
    this.currentLineIndex = -1;
  }

  getCurrentLine(time: number): LyricLine | null {
    for (let i = 0; i < this.lyrics.length; i++) {
      if (time >= this.lyrics[i].startTime && time < this.lyrics[i].endTime) {
        this.currentLineIndex = i;
        return this.lyrics[i];
      }
    }
    return null;
  }

  getVisibleLines(time: number): LyricLine[] {
    const visibleLines: LyricLine[] = [];
    const { maxLines } = this.config;
    
    for (let i = 0; i < this.lyrics.length; i++) {
      if (time >= this.lyrics[i].startTime && time < this.lyrics[i].endTime) {
        const startIdx = Math.max(0, i - Math.floor((maxLines - 1) / 2));
        const endIdx = Math.min(this.lyrics.length, startIdx + maxLines);
        
        for (let j = startIdx; j < endIdx; j++) {
          visibleLines.push(this.lyrics[j]);
        }
        break;
      }
    }
    
    return visibleLines;
  }

  render(currentTime: number, audioData?: AudioAnalysisData | null, beatInfo?: BeatInfo | null): void {
    this.updateBeatSync(beatInfo || null);
    this.renderBackgroundEffect();
    
    switch (this.config.displayMode) {
      case 'line':
        this.renderLineMode(currentTime);
        break;
      case 'word':
        this.renderWordMode(currentTime);
        break;
      case 'karaoke':
        this.renderKaraokeMode(currentTime, audioData || null);
        break;
    }
  }

  private updateBeatSync(beatInfo: BeatInfo | null): void {
    if (!this.config.beatSync.enabled || !beatInfo) return;
    
    if (beatInfo.detected) {
      this.beatMultiplier = 1 + this.config.beatSync.pulseScale;
      this.lastBeatTime = performance.now();
    } else {
      const timeSinceBeat = performance.now() - this.lastBeatTime;
      const decay = Math.exp(-timeSinceBeat * 0.005);
      this.beatMultiplier = 1 + (this.beatMultiplier - 1) * decay;
    }
  }

  private renderBackgroundEffect(): void {
    const { backgroundEffect } = this.config;
    if (!backgroundEffect.enabled) return;
    
    this.ctx.save();
    
    switch (backgroundEffect.type) {
      case 'dim':
        this.ctx.fillStyle = `rgba(0, 0, 0, ${backgroundEffect.intensity})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
        break;
      
      case 'gradient': {
        const colors = backgroundEffect.gradientColors || ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0)'];
        const gradient = this.ctx.createLinearGradient(0, this.height - 200, 0, this.height);
        colors.forEach((color, i) => {
          gradient.addColorStop(i / (colors.length - 1), color);
        });
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, this.height - 200, this.width, 200);
        break;
      }
      
      case 'blur':
        break;
    }
    
    this.ctx.restore();
  }

  private getTextPosition(): { x: number; y: number } {
    const padding = 50;
    
    switch (this.config.textPosition) {
      case 'top':
        return { x: this.width / 2, y: padding + this.config.textStyle.fontSize };
      case 'center':
        return { x: this.width / 2, y: this.height / 2 };
      case 'bottom':
        return { x: this.width / 2, y: this.height - padding - this.config.textStyle.fontSize };
      case 'custom':
        return this.config.customPosition || { x: this.width / 2, y: this.height / 2 };
      default:
        return { x: this.width / 2, y: this.height - padding - this.config.textStyle.fontSize };
    }
  }

  private renderLineMode(currentTime: number): void {
    const visibleLines = this.getVisibleLines(currentTime);
    if (visibleLines.length === 0) return;
    
    const position = this.getTextPosition();
    const { lineSpacing, textStyle, highlightStyle, animationIn } = this.config;
    
    const totalHeight = visibleLines.length * (textStyle.fontSize + lineSpacing) - lineSpacing;
    let y = position.y - totalHeight / 2;
    
    for (const line of visibleLines) {
      const isCurrentLine = currentTime >= line.startTime && currentTime < line.endTime;
      const lineProgress = isCurrentLine 
        ? (currentTime - line.startTime) / (line.endTime - line.startTime)
        : currentTime >= line.endTime ? 1 : 0;
      
      const style = isCurrentLine ? { ...textStyle, ...highlightStyle } : textStyle;
      
      this.ctx.save();
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      if (isCurrentLine && this.config.beatSync.enabled) {
        this.ctx.translate(position.x, y);
        this.ctx.scale(this.beatMultiplier, this.beatMultiplier);
        this.textAnimator.renderText(line.text, 0, 0, style);
      } else {
        const animProgress = isCurrentLine 
          ? Math.min(1, (currentTime - line.startTime) / (animationIn.duration / 1000))
          : currentTime >= line.startTime ? 1 : 0;
        
        this.ctx.globalAlpha = animProgress;
        this.textAnimator.renderText(line.text, position.x, y, style);
      }
      
      this.ctx.restore();
      y += textStyle.fontSize + lineSpacing;
    }
  }

  private renderWordMode(currentTime: number): void {
    const currentLine = this.getCurrentLine(currentTime);
    if (!currentLine || !currentLine.words) return;
    
    const position = this.getTextPosition();
    const { textStyle, highlightStyle } = this.config;
    
    this.ctx.save();
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const totalWidth = this.measureLineWidth(currentLine.text, textStyle);
    let x = position.x - totalWidth / 2;
    
    for (const word of currentLine.words) {
      const isActive = currentTime >= word.startTime && currentTime < word.endTime;
      const isPast = currentTime >= word.endTime;
      
      const style = isActive || isPast ? { ...textStyle, ...highlightStyle } : textStyle;
      
      this.ctx.textAlign = 'left';
      
      if (isActive && this.config.beatSync.enabled) {
        this.ctx.save();
        this.ctx.translate(x, position.y);
        this.ctx.scale(this.beatMultiplier, this.beatMultiplier);
        this.textAnimator.renderText(word.text, 0, 0, style);
        this.ctx.restore();
      } else {
        this.textAnimator.renderText(word.text, x, position.y, style);
      }
      
      const wordWidth = this.measureWordWidth(word.text, textStyle);
      x += wordWidth + this.measureWordWidth(' ', textStyle);
    }
    
    this.ctx.restore();
  }

  private renderKaraokeMode(currentTime: number, audioData: AudioAnalysisData | null): void {
    const currentLine = this.getCurrentLine(currentTime);
    if (!currentLine) return;
    
    const position = this.getTextPosition();
    const { textStyle, highlightStyle, karaokeStyle } = this.config;
    
    const lineProgress = (currentTime - currentLine.startTime) / (currentLine.endTime - currentLine.startTime);
    
    this.ctx.save();
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const text = currentLine.text;
    const totalWidth = this.measureLineWidth(text, textStyle);
    const x = position.x - totalWidth / 2;
    
    this.textAnimator.renderText(text, position.x, position.y, textStyle);
    
    this.ctx.save();
    
    const fillWidth = totalWidth * lineProgress;
    const clipX = karaokeStyle.fillDirection === 'left' ? x : x + totalWidth - fillWidth;
    
    this.ctx.beginPath();
    this.ctx.rect(clipX, position.y - textStyle.fontSize, fillWidth, textStyle.fontSize * 2);
    this.ctx.clip();
    
    const filledStyle: TextStyle = {
      ...textStyle,
      color: karaokeStyle.fillColor,
      ...(karaokeStyle.glowOnActive && {
        glowColor: karaokeStyle.glowColor,
        glowIntensity: karaokeStyle.glowIntensity * (audioData?.bass || 0.5),
      }),
    };
    
    if (this.config.beatSync.enabled) {
      this.ctx.translate(position.x, position.y);
      this.ctx.scale(this.beatMultiplier, this.beatMultiplier);
      this.textAnimator.renderText(text, 0, 0, filledStyle);
    } else {
      this.textAnimator.renderText(text, position.x, position.y, filledStyle);
    }
    
    this.ctx.restore();
    this.ctx.restore();
  }

  private measureLineWidth(text: string, style: TextStyle): number {
    this.ctx.save();
    this.ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.font}`;
    const width = this.ctx.measureText(text).width;
    this.ctx.restore();
    return width;
  }

  private measureWordWidth(word: string, style: TextStyle): number {
    this.ctx.save();
    this.ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.font}`;
    const width = this.ctx.measureText(word).width;
    this.ctx.restore();
    return width;
  }

  renderWithAnimation(
    currentTime: number,
    animationStyle: AnimationConfig['style'],
    audioData?: AudioAnalysisData | null
  ): void {
    const currentLine = this.getCurrentLine(currentTime);
    if (!currentLine) return;
    
    const position = this.getTextPosition();
    const lineStartTime = currentLine.startTime;
    
    const animation: AnimationConfig = {
      ...ANIMATION_PRESETS[animationStyle] || ANIMATION_PRESETS.fadeIn,
      style: animationStyle,
    };
    
    this.textAnimator.renderAnimatedText(
      currentLine.text,
      position.x,
      position.y,
      this.config.textStyle,
      animation,
      currentTime,
      lineStartTime
    );
  }

  getLyrics(): LyricLine[] {
    return this.lyrics;
  }

  getCurrentLineIndex(): number {
    return this.currentLineIndex;
  }

  getDuration(): number {
    if (this.lyrics.length === 0) return 0;
    return this.lyrics[this.lyrics.length - 1].endTime;
  }

  dispose(): void {
    this.lyrics = [];
    this.currentLineIndex = -1;
    this.textAnimator.dispose();
  }
}

export const DEFAULT_LYRIC_CONFIG: LyricEngineConfig = {
  displayMode: 'karaoke',
  textPosition: 'bottom',
  textStyle: {
    ...DEFAULT_TEXT_STYLE,
    fontSize: 64,
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 3,
    shadowColor: 'rgba(0, 0, 0, 0.8)',
    shadowBlur: 10,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
  },
  highlightStyle: {
    color: '#ffff00',
    glowColor: '#ffff00',
    glowIntensity: 20,
  },
  animationIn: ANIMATION_PRESETS.fadeIn,
  animationOut: { ...ANIMATION_PRESETS.fadeIn, style: 'fade' },
  lineSpacing: 20,
  maxLines: 3,
  karaokeStyle: {
    enabled: true,
    fillColor: '#00ffff',
    fillDirection: 'left',
    glowOnActive: true,
    glowColor: '#00ffff',
    glowIntensity: 25,
  },
  backgroundEffect: {
    enabled: true,
    type: 'gradient',
    intensity: 0.6,
    gradientColors: ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0)'],
  },
  beatSync: {
    enabled: true,
    pulseScale: 0.05,
    glowOnBeat: true,
    shakeOnBeat: false,
    colorShiftOnBeat: false,
  },
};

export const LYRIC_STYLE_PRESETS: Record<string, Partial<LyricEngineConfig>> = {
  classic: {
    displayMode: 'line',
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 48,
      color: '#ffffff',
      font: 'Georgia',
    },
    karaokeStyle: {
      enabled: false,
      fillColor: '#ffffff',
      fillDirection: 'left',
      glowOnActive: false,
      glowColor: '#ffffff',
      glowIntensity: 0,
    },
  },
  neon: {
    displayMode: 'karaoke',
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 72,
      color: '#ff00ff',
      font: 'Impact',
      glowColor: '#ff00ff',
      glowIntensity: 30,
    },
    karaokeStyle: {
      enabled: true,
      fillColor: '#00ffff',
      fillDirection: 'left',
      glowOnActive: true,
      glowColor: '#00ffff',
      glowIntensity: 40,
    },
    beatSync: {
      enabled: true,
      pulseScale: 0.1,
      glowOnBeat: true,
      shakeOnBeat: false,
      colorShiftOnBeat: true,
    },
  },
  minimal: {
    displayMode: 'word',
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 36,
      color: '#cccccc',
      font: 'Helvetica',
      fontWeight: '300',
    },
    highlightStyle: {
      color: '#ffffff',
      fontWeight: 'bold',
    },
    backgroundEffect: {
      enabled: false,
      type: 'none',
      intensity: 0,
    },
    beatSync: {
      enabled: false,
      pulseScale: 0,
      glowOnBeat: false,
      shakeOnBeat: false,
      colorShiftOnBeat: false,
    },
  },
  gradient: {
    displayMode: 'karaoke',
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 56,
      color: '#ffffff',
      gradientColors: ['#ff6b6b', '#feca57', '#48dbfb'],
      gradientDirection: 'horizontal',
    },
    karaokeStyle: {
      enabled: true,
      fillColor: '#ffffff',
      fillDirection: 'left',
      glowOnActive: true,
      glowColor: '#ffffff',
      glowIntensity: 20,
    },
  },
  bold: {
    displayMode: 'line',
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 80,
      color: '#ffffff',
      font: 'Impact',
      fontWeight: '900',
      strokeColor: '#000000',
      strokeWidth: 5,
    },
    highlightStyle: {
      color: '#ff0000',
    },
    beatSync: {
      enabled: true,
      pulseScale: 0.15,
      glowOnBeat: false,
      shakeOnBeat: true,
      colorShiftOnBeat: false,
    },
  },
};

export function detectLyricFormat(content: string): LyricFormat {
  const trimmed = content.trim();
  
  if (/\[\d{2}:\d{2}\.\d{2,3}\]/.test(trimmed)) {
    return 'lrc';
  }
  
  if (/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) {
    return 'srt';
  }
  
  return 'plain';
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function generateLRC(lines: LyricLine[]): string {
  return lines
    .map(line => `[${formatTime(line.startTime)}]${line.text}`)
    .join('\n');
}
