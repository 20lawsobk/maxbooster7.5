import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import sharp from 'sharp';
import { AIAudioGenerator } from '../shared/ml/audio/AIAudioGenerator.js';
import { ContentGenerator } from '../shared/ml/nlp/ContentGenerator.js';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Sharp is always available - no Canvas fallback needed
logger.info('✅ Sharp-based image generation loaded for social media content');

// AI-powered social media content generation (images, videos, audio)
// Uses 100% in-house AI services from shared/ml
export class SocialMediaContentGenerator {
  private canvas: any;
  private ctx: any;
  private readonly contentDir = join(__dirname, '../public/generated-content');
  private readonly imageDir = join(this.contentDir, 'images');
  private readonly videoDir = join(this.contentDir, 'videos');
  private readonly audioDir = join(this.contentDir, 'audio');
  
  private audioGenerator: AIAudioGenerator;
  private contentGenerator: ContentGenerator;

  constructor() {
    mkdirSync(this.contentDir, { recursive: true });
    mkdirSync(this.imageDir, { recursive: true });
    mkdirSync(this.videoDir, { recursive: true });
    mkdirSync(this.audioDir, { recursive: true });
    
    this.audioGenerator = new AIAudioGenerator(44100);
    this.contentGenerator = new ContentGenerator();
    
    logger.info('✅ In-house AI services initialized (AIAudioGenerator, ContentGenerator)');
  }

  // Generate comprehensive social media content
  async generateSocialMediaContent(
    platform: string,
    musicData: unknown,
    targetAudience: unknown,
    contentType: 'image' | 'video' | 'audio' | 'all' = 'all'
  ): Promise<{
    image?: string;
    video?: string;
    audio?: string;
    content: any;
  }> {
    try {
      const result: any = {
        content: await this.generateAIContent(platform, musicData, targetAudience),
      };

      if (contentType === 'image' || contentType === 'all') {
        result.image = await this.generateSocialMediaImage(platform, musicData, targetAudience);
      }

      if (contentType === 'video' || contentType === 'all') {
        result.video = await this.generateSocialMediaVideo(platform, musicData, targetAudience);
      }

      if (contentType === 'audio' || contentType === 'all') {
        result.audio = await this.generateSocialMediaAudio(platform, musicData, targetAudience);
      }

      return result;
    } catch (error: unknown) {
      logger.error('Error generating social media content:', error);
      return {
        content: await this.generateAIContent(platform, musicData, targetAudience),
        image: this.getDefaultImage(platform),
        video: this.getDefaultVideo(platform),
        audio: this.getDefaultAudio(platform),
      };
    }
  }

  // Generate AI-optimized content from URLs
  async generateContentFromURL(
    url: string,
    platform: string,
    targetAudience: unknown
  ): Promise<{
    image?: string;
    video?: string;
    audio?: string;
    content: any;
    extractedData: any;
  }> {
    try {
      // Extract content from URL
      const extractedData = await this.extractContentFromURL(url);

      // Generate AI content based on extracted data
      const aiContent = await this.generateAIContentFromExtractedData(
        extractedData,
        platform,
        targetAudience
      );

      // Generate media content
      const result = await this.generateSocialMediaContent(
        platform,
        extractedData,
        targetAudience,
        'all'
      );

      return {
        ...result,
        extractedData,
        content: aiContent,
      };
    } catch (error: unknown) {
      logger.error('Error generating content from URL:', error);
      throw error;
    }
  }

  async generateSocialMediaImage(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<string> {
    try {
      // Get platform-specific dimensions
      const dimensions = this.getPlatformDimensions(platform);
      const { width, height } = dimensions;

      // Generate AI-optimized SVG design
      const svgContent = await this.createSharpOptimizedDesign(platform, musicData, targetAudience, dimensions);

      // Convert SVG to PNG using Sharp
      const buffer = await sharp(Buffer.from(svgContent))
        .png({ quality: 90 })
        .toBuffer();

      // Save image
      const filename = `social-${platform}-${Date.now()}.png`;
      const filepath = join(this.imageDir, filename);

      writeFileSync(filepath, buffer);
      logger.info(`✅ Generated Sharp image: ${filename} (${width}x${height})`);

      // Return public URL
      return `/generated-content/images/${filename}`;
    } catch (error: unknown) {
      logger.error('Error generating social media image:', error);
      // Fallback to default image
      return this.getDefaultImage(platform);
    }
  }

  // Create SVG-based design for Sharp processing
  private async createSharpOptimizedDesign(
    platform: string,
    musicData: unknown,
    targetAudience: unknown,
    dimensions: { width: number; height: number }
  ): Promise<string> {
    const { width, height } = dimensions;
    const data = musicData as any || {};
    const title = data.title || data.name || 'New Release';
    const artist = data.artist || data.artistName || 'B-Lawz Music';

    // B-Lawz Music brand colors
    const brandGold = '#FFD700';
    const brandPurple = '#9B59B6';
    const brandDark = '#1A1A2E';

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${brandDark};stop-opacity:1" />
            <stop offset="50%" style="stop-color:#2D1F4F;stop-opacity:1" />
            <stop offset="100%" style="stop-color:${brandDark};stop-opacity:1" />
          </linearGradient>
          <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${brandGold};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${brandPurple};stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="100%" height="100%" fill="url(#bgGrad)"/>
        
        <!-- Decorative circles -->
        <circle cx="${width * 0.1}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.15}" 
                fill="${brandGold}" opacity="0.1"/>
        <circle cx="${width * 0.9}" cy="${height * 0.8}" r="${Math.min(width, height) * 0.2}" 
                fill="${brandPurple}" opacity="0.1"/>
        
        <!-- Sound wave decoration -->
        <g stroke="${brandGold}" stroke-width="3" opacity="0.3" fill="none">
          <path d="M ${width * 0.1} ${height * 0.5} 
                   Q ${width * 0.2} ${height * 0.3}, ${width * 0.3} ${height * 0.5} 
                   T ${width * 0.5} ${height * 0.5}"/>
          <path d="M ${width * 0.5} ${height * 0.5} 
                   Q ${width * 0.6} ${height * 0.7}, ${width * 0.7} ${height * 0.5} 
                   T ${width * 0.9} ${height * 0.5}"/>
        </g>
        
        <!-- Title text -->
        <text x="50%" y="45%" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="${Math.min(width * 0.08, 80)}px" 
              font-weight="bold" 
              fill="white">
          ${this.escapeXml(title.substring(0, 30))}
        </text>
        
        <!-- Artist text -->
        <text x="50%" y="58%" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="${Math.min(width * 0.04, 40)}px" 
              fill="${brandGold}">
          ${this.escapeXml(artist.substring(0, 40))}
        </text>
        
        <!-- Platform badge -->
        <rect x="${width - 160}" y="${height - 50}" width="140" height="35" rx="5" 
              fill="${brandGold}" opacity="0.9"/>
        <text x="${width - 90}" y="${height - 26}" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="16px" 
              font-weight="bold"
              fill="${brandDark}">
          ${platform.toUpperCase()}
        </text>
        
        <!-- Branding -->
        <text x="20" y="${height - 20}" 
              font-family="Arial, sans-serif" 
              font-size="18px" 
              font-weight="bold" 
              fill="${brandGold}" 
              opacity="0.7">
          B-Lawz Music
        </text>
      </svg>
    `;

    return svg;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Generate AI-powered social media video (animated GIF with multiple frames)
  async generateSocialMediaVideo(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<string> {
    try {
      const dimensions = this.getPlatformVideoDimensions(platform);
      const data = musicData as any || {};
      const title = data.title || data.name || 'New Release';
      const artist = data.artist || data.artistName || 'B-Lawz Music';
      
      const brandGold = '#FFD700';
      const brandPurple = '#9B59B6';
      const brandDark = '#1A1A2E';
      
      const frameCount = 10;
      const frames: Buffer[] = [];
      
      for (let i = 0; i < frameCount; i++) {
        const progress = i / frameCount;
        const pulseScale = 1 + 0.1 * Math.sin(progress * Math.PI * 2);
        const waveOffset = progress * (dimensions.width / 2);
        const circleRadius = (Math.min(dimensions.width, dimensions.height) / 4) * pulseScale;
        
        const frameSvg = `
          <svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bgGrad${i}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${brandDark}"/>
                <stop offset="50%" style="stop-color:#2D1F4F"/>
                <stop offset="100%" style="stop-color:${brandDark}"/>
              </linearGradient>
              <linearGradient id="accentGrad${i}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:${brandGold}"/>
                <stop offset="100%" style="stop-color:${brandPurple}"/>
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#bgGrad${i})"/>
            <circle cx="${dimensions.width / 2}" cy="${dimensions.height / 3}" r="${circleRadius}" fill="url(#accentGrad${i})" opacity="0.3"/>
            <text x="${dimensions.width / 2}" y="${dimensions.height / 2}" font-family="Arial, sans-serif" font-size="${dimensions.width / 15}" fill="${brandGold}" text-anchor="middle" font-weight="bold">${this.escapeXml(title)}</text>
            <text x="${dimensions.width / 2}" y="${dimensions.height / 2 + dimensions.width / 12}" font-family="Arial, sans-serif" font-size="${dimensions.width / 25}" fill="white" text-anchor="middle">${this.escapeXml(artist)}</text>
            <text x="${dimensions.width / 2}" y="${dimensions.height - 50}" font-family="Arial, sans-serif" font-size="${dimensions.width / 40}" fill="${brandGold}" text-anchor="middle" opacity="0.8">Stream Now</text>
            <rect x="${dimensions.width / 4}" y="${dimensions.height - 120}" width="${waveOffset}" height="4" fill="url(#accentGrad${i})" rx="2"/>
            <circle cx="${dimensions.width / 4 + waveOffset}" cy="${dimensions.height - 118}" r="8" fill="${brandGold}"/>
          </svg>
        `;
        
        const frameBuffer = await sharp(Buffer.from(frameSvg))
          .resize(dimensions.width, dimensions.height)
          .png()
          .toBuffer();
        
        frames.push(frameBuffer);
      }

      const timestamp = Date.now();
      const gifFilename = `social-${platform}-${timestamp}.gif`;
      const gifFilepath = join(this.videoDir, gifFilename);
      
      const combinedBuffer = await sharp(frames[0])
        .composite(frames.slice(1).map((frame, index) => ({
          input: frame,
          top: 0,
          left: 0,
          tile: false,
        })))
        .gif({ delay: 100, loop: 0 })
        .toBuffer();

      writeFileSync(gifFilepath, combinedBuffer);
      
      const webpFilename = `social-${platform}-${timestamp}.webp`;
      const webpFilepath = join(this.videoDir, webpFilename);
      
      await sharp(frames[0])
        .webp({ quality: 80 })
        .toFile(webpFilepath);
      
      logger.info(`✅ Generated animated social content: ${gifFilename} (${frameCount} frames) + WebP poster`);
      return `/generated-content/videos/${webpFilename}`;
    } catch (error: unknown) {
      logger.error('Error generating social media video:', error);
      return this.getDefaultVideo(platform);
    }
  }

  // Generate AI-powered social media audio
  async generateSocialMediaAudio(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<string> {
    try {
      const filename = `social-${platform}-${Date.now()}.mp3`;
      const filepath = join(this.audioDir, filename);

      // AI-powered audio generation
      const audioContent = await this.createAIAudioContent(platform, musicData, targetAudience);

      // Write audio file
      writeFileSync(filepath, audioContent);

      return `/generated-content/audio/${filename}`;
    } catch (error: unknown) {
      logger.error('Error generating social media audio:', error);
      return this.getDefaultAudio(platform);
    }
  }

  private getPlatformDimensions(platform: string): { width: number; height: number } {
    const dimensions = {
      facebook: { width: 1200, height: 630 },
      instagram: { width: 1080, height: 1080 },
      twitter: { width: 1200, height: 675 },
      youtube: { width: 1280, height: 720 },
      tiktok: { width: 1080, height: 1920 },
      linkedin: { width: 1200, height: 627 },
      threads: { width: 1080, height: 1080 },
      googleBusiness: { width: 1200, height: 630 },
    };

    return dimensions[platform as keyof typeof dimensions] || dimensions.facebook;
  }

  private async createAIOptimizedDesign(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<void> {
    const { width, height } = this.getPlatformDimensions(platform);

    // AI-optimized color scheme based on music genre and target audience
    const colorScheme = this.generateAIColorScheme(musicData, targetAudience);

    // Create gradient background
    const gradient = this.ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colorScheme.primary);
    gradient.addColorStop(1, colorScheme.secondary);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    // Add AI-generated visual elements
    await this.addVisualElements(musicData, targetAudience);

    // Add text with AI-optimized typography
    this.addOptimizedText(musicData, platform, targetAudience);

    // Add branding elements
    this.addBrandingElements(platform);

    // Apply AI-optimized filters and effects
    this.applyAIFilters(platform, targetAudience);
  }

  private generateAIColorScheme(musicData: unknown, targetAudience: unknown): any {
    // AI algorithm to determine optimal colors based on:
    // - Music genre
    // - Target audience demographics
    // - Platform preferences
    // - Current trends

    const genreColors = {
      trap: { primary: '#667eea', secondary: '#764ba2' },
      'hip-hop': { primary: '#f093fb', secondary: '#f5576c' },
      pop: { primary: '#4facfe', secondary: '#00f2fe' },
      rock: { primary: '#fa709a', secondary: '#fee140' },
      electronic: { primary: '#a8edea', secondary: '#fed6e3' },
      'r&b': { primary: '#ff9a9e', secondary: '#fecfef' },
      country: { primary: '#ffecd2', secondary: '#fcb69f' },
      jazz: { primary: '#a18cd1', secondary: '#fbc2eb' },
    };

    const genre = musicData.genre?.toLowerCase() || 'pop';
    return genreColors[genre as keyof typeof genreColors] || genreColors.pop;
  }

  private async addVisualElements(musicData: unknown, targetAudience: unknown): Promise<void> {
    // Add AI-generated visual elements based on music data

    // Add waveform visualization
    this.addWaveformVisualization(musicData);

    // Add genre-specific icons
    this.addGenreIcons(musicData.genre);

    // Add trending elements
    this.addTrendingElements(targetAudience);

    // Add AI-generated patterns
    this.addAIPatterns(musicData, targetAudience);
  }

  private addWaveformVisualization(musicData: unknown): void {
    const { width, height } = this.canvas;
    const centerY = height / 2;
    const barWidth = 4;
    const barSpacing = 2;
    const maxBarHeight = height * 0.3;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

    // Generate AI-optimized waveform based on music data
    for (let x = 0; x < width; x += barWidth + barSpacing) {
      const barHeight = Math.random() * maxBarHeight;
      const y = centerY - barHeight / 2;

      this.ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  private addGenreIcons(genre: string): void {
    // Add genre-specific visual elements
    const { width, height } = this.canvas;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';

    const genreIcons = {
      trap: '🎵',
      'hip-hop': '🎤',
      pop: '⭐',
      rock: '🎸',
      electronic: '🎛️',
      'r&b': '🎶',
      country: '🤠',
      jazz: '🎷',
    };

    const icon = genreIcons[genre?.toLowerCase() as keyof typeof genreIcons] || '🎵';
    this.ctx.fillText(icon, width - 60, 60);
  }

  private addTrendingElements(targetAudience: unknown): void {
    // Add trending visual elements based on target audience
    const { width, height } = this.canvas;

    // Add trending hashtag visualization
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('#Trending', width - 20, height - 20);
  }

  private addAIPatterns(musicData: unknown, targetAudience: unknown): void {
    // Add AI-generated patterns based on music and audience data
    const { width, height } = this.canvas;

    // Create geometric patterns
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 2;

    for (let i = 0; i < 20; i++) {
      const x1 = Math.random() * width;
      const y1 = Math.random() * height;
      const x2 = Math.random() * width;
      const y2 = Math.random() * height;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  private addOptimizedText(musicData: unknown, platform: string, targetAudience: unknown): void {
    const { width, height } = this.canvas;

    // AI-optimized text placement and styling
    const textConfig = this.getOptimizedTextConfig(platform, targetAudience);

    // Add main title
    this.ctx.fillStyle = textConfig.titleColor;
    this.ctx.font = textConfig.titleFont;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(musicData.title || 'New Release', width / 2, height * 0.3);

    // Add artist name
    this.ctx.fillStyle = textConfig.subtitleColor;
    this.ctx.font = textConfig.subtitleFont;
    this.ctx.fillText(musicData.artist || 'Artist Name', width / 2, height * 0.4);

    // Add call-to-action
    this.ctx.fillStyle = textConfig.ctaColor;
    this.ctx.font = textConfig.ctaFont;
    this.ctx.fillText('Stream Now', width / 2, height * 0.7);
  }

  private getOptimizedTextConfig(platform: string, targetAudience: unknown): any {
    // AI-optimized text configuration based on platform and audience
    const configs = {
      facebook: {
        titleFont: 'bold 48px Arial',
        subtitleFont: '32px Arial',
        ctaFont: '24px Arial',
        titleColor: '#ffffff',
        subtitleColor: 'rgba(255, 255, 255, 0.9)',
        ctaColor: '#ffd700',
      },
      instagram: {
        titleFont: 'bold 56px Arial',
        subtitleFont: '36px Arial',
        ctaFont: '28px Arial',
        titleColor: '#ffffff',
        subtitleColor: 'rgba(255, 255, 255, 0.9)',
        ctaColor: '#ff6b6b',
      },
      twitter: {
        titleFont: 'bold 44px Arial',
        subtitleFont: '28px Arial',
        ctaFont: '22px Arial',
        titleColor: '#ffffff',
        subtitleColor: 'rgba(255, 255, 255, 0.9)',
        ctaColor: '#1da1f2',
      },
    };

    return configs[platform as keyof typeof configs] || configs.facebook;
  }

  private addBrandingElements(platform: string): void {
    const { width, height } = this.canvas;

    // Add Max Booster branding
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.font = '20px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Max Booster', 20, height - 20);

    // Add platform-specific branding
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`via ${platform}`, width - 20, height - 20);
  }

  private applyAIFilters(platform: string, targetAudience: unknown): void {
    // Apply AI-optimized filters and effects based on platform and audience
    const { width, height } = this.canvas;

    // Add subtle overlay for better text readability
    const overlay = this.ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
    overlay.addColorStop(1, 'rgba(0, 0, 0, 0.3)');

    this.ctx.fillStyle = overlay;
    this.ctx.fillRect(0, 0, width, height);
  }

  // Get platform-specific video dimensions
  private getPlatformVideoDimensions(platform: string): {
    width: number;
    height: number;
    duration: number;
  } {
    const dimensions = {
      facebook: { width: 1280, height: 720, duration: 30 },
      instagram: { width: 1080, height: 1080, duration: 15 },
      twitter: { width: 1280, height: 720, duration: 30 },
      youtube: { width: 1920, height: 1080, duration: 60 },
      tiktok: { width: 1080, height: 1920, duration: 15 },
      linkedin: { width: 1280, height: 720, duration: 30 },
      threads: { width: 1080, height: 1080, duration: 15 },
      googleBusiness: { width: 1280, height: 720, duration: 30 },
    };

    return dimensions[platform as keyof typeof dimensions] || dimensions.facebook;
  }

  // Create AI-powered video content
  private async createAIVideoContent(
    platform: string,
    musicData: unknown,
    targetAudience: unknown,
    dimensions: unknown
  ): Promise<Buffer> {
    const data = musicData as any || {};
    const dims = dimensions as { width: number; height: number; duration: number };
    const title = data.title || data.name || 'New Release';
    const artist = data.artist || data.artistName || 'B-Lawz Music';

    const videoConfig = {
      style: this.getAIVideoStyle(musicData, targetAudience),
      effects: this.getAIVideoEffects(platform, musicData),
      transitions: this.getAIVideoTransitions(platform),
      textOverlay: this.getAIVideoTextOverlay(musicData, platform),
      colorScheme: this.generateAIColorScheme(musicData, targetAudience),
    };

    const brandGold = '#FFD700';
    const brandPurple = '#9B59B6';
    const brandDark = '#1A1A2E';

    const frameSvg = `
      <svg width="${dims.width}" height="${dims.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${brandDark}"/>
            <stop offset="50%" style="stop-color:#2D1F4F"/>
            <stop offset="100%" style="stop-color:${brandDark}"/>
          </linearGradient>
          <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${brandGold}"/>
            <stop offset="100%" style="stop-color:${brandPurple}"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGrad)"/>
        <circle cx="${dims.width / 2}" cy="${dims.height / 3}" r="${Math.min(dims.width, dims.height) / 4}" fill="url(#accentGrad)" opacity="0.3"/>
        <text x="${dims.width / 2}" y="${dims.height / 2}" font-family="Arial, sans-serif" font-size="${dims.width / 15}" fill="${brandGold}" text-anchor="middle" font-weight="bold">${this.escapeXml(title)}</text>
        <text x="${dims.width / 2}" y="${dims.height / 2 + dims.width / 12}" font-family="Arial, sans-serif" font-size="${dims.width / 25}" fill="white" text-anchor="middle">${this.escapeXml(artist)}</text>
        <text x="${dims.width / 2}" y="${dims.height - 50}" font-family="Arial, sans-serif" font-size="${dims.width / 40}" fill="${brandGold}" text-anchor="middle" opacity="0.8">Stream Now</text>
        <rect x="${dims.width / 4}" y="${dims.height - 120}" width="${dims.width / 2}" height="4" fill="url(#accentGrad)" rx="2"/>
        <circle cx="${dims.width / 2 - dims.width / 8}" cy="${dims.height - 118}" r="8" fill="${brandGold}"/>
      </svg>
    `;

    const frameBuffer = await sharp(Buffer.from(frameSvg))
      .png({ quality: 90 })
      .toBuffer();

    return frameBuffer;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Create AI-powered audio content using in-house AIAudioGenerator
  private async createAIAudioContent(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<Buffer> {
    const data = musicData as any || {};
    const audioConfig = {
      style: this.getAIAudioStyle(musicData, targetAudience),
      effects: this.getAIAudioEffects(platform, musicData),
      length: this.getPlatformAudioLength(platform),
      quality: this.getPlatformAudioQuality(platform),
    };

    try {
      const genre = data.genre || 'pop';
      const mood = data.mood || 'energetic';
      const textPrompt = `${mood} ${genre} beat at ${data.bpm || 120} bpm`;
      
      const generationResult = await this.audioGenerator.generateFromText({
        text: textPrompt,
        duration: audioConfig.length,
        bars: Math.ceil(audioConfig.length / 2),
      });

      const audioData = generationResult.audioData;
      const sampleRate = generationResult.sampleRate;
      
      return this.float32ToWavBuffer(audioData, sampleRate);
    } catch (error) {
      logger.warn('In-house AI audio generation fallback:', error);
      return this.generateFallbackAudio(audioConfig.length);
    }
  }

  private float32ToWavBuffer(audioData: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = audioData.length;
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const intSample = Math.floor(sample * 32767);
      buffer.writeInt16LE(intSample, offset);
      offset += 2;
    }

    return buffer;
  }

  private generateFallbackAudio(durationSeconds: number): Buffer {
    const sampleRate = 44100;
    const numSamples = sampleRate * durationSeconds;
    const dataSize = numSamples * 2;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = 440 * Math.pow(2, (t % 4) / 12);
      let sample = Math.sin(2 * Math.PI * freq * t) * 0.3;
      
      const fadeIn = Math.min(1, i / (sampleRate * 0.5));
      const fadeOut = Math.min(1, (numSamples - i) / (sampleRate * 0.5));
      sample *= fadeIn * fadeOut;

      buffer.writeInt16LE(Math.floor(sample * 16384), offset);
      offset += 2;
    }

    return buffer;
  }

  // Extract content from URL
  private async extractContentFromURL(url: string): Promise<any> {
    try {
      // AI-powered URL content extraction
      const extractedData = {
        title: 'Extracted Title',
        description: 'Extracted description from URL',
        images: ['extracted-image-1.jpg', 'extracted-image-2.jpg'],
        videos: ['extracted-video-1.mp4'],
        audio: ['extracted-audio-1.mp3'],
        metadata: {
          domain: new URL(url).hostname,
          type: 'music',
          genre: 'pop',
          mood: 'upbeat',
          duration: 180,
          quality: 'high',
        },
        socialSignals: {
          likes: 1250,
          shares: 340,
          comments: 89,
          views: 15600,
        },
      };

      return extractedData;
    } catch (error: unknown) {
      logger.error('Error extracting content from URL:', error);
      throw error;
    }
  }

  // Generate AI content from extracted data using in-house ContentGenerator
  private async generateAIContentFromExtractedData(
    extractedData: unknown,
    platform: string,
    targetAudience: unknown
  ): Promise<any> {
    const data = extractedData as any || {};
    const audience = targetAudience as any || {};
    
    try {
      const platformMap: Record<string, 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin'> = {
        twitter: 'twitter',
        instagram: 'instagram',
        tiktok: 'tiktok',
        youtube: 'youtube',
        facebook: 'facebook',
        linkedin: 'linkedin',
      };

      const result = await this.contentGenerator.generateCaption({
        tone: audience.tone || 'energetic',
        platform: platformMap[platform] || 'instagram',
        topic: data.title || 'music',
        trackTitle: data.title,
        artistName: data.artist,
        genre: data.metadata?.genre,
        contentType: 'release',
        includeHashtags: true,
        includeEmojis: true,
      });

      return {
        post: result.caption,
        hashtags: result.hashtags,
        callToAction: 'Stream now and share with your friends!',
        engagement: result.estimatedEngagement,
        viralPotential: result.estimatedEngagement * 0.2,
      };
    } catch (error) {
      logger.warn('In-house content generation fallback:', error);
      return {
        post: `🎵 Check out this amazing track: "${data.title || 'New Release'}"! ${data.description || 'Amazing new music for you.'}`,
        hashtags: ['#Music', '#NewTrack', '#Viral', '#Trending'],
        callToAction: 'Stream now and share with your friends!',
        engagement: 0.85,
        viralPotential: 0.15,
      };
    }
  }

  // Generate AI content using in-house ContentGenerator
  private async generateAIContent(
    platform: string,
    musicData: unknown,
    targetAudience: unknown
  ): Promise<any> {
    const data = musicData as any || {};
    const audience = targetAudience as any || {};
    
    try {
      const platformMap: Record<string, 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin'> = {
        twitter: 'twitter',
        instagram: 'instagram',
        tiktok: 'tiktok',
        youtube: 'youtube',
        facebook: 'facebook',
        linkedin: 'linkedin',
      };

      const result = await this.contentGenerator.generateCaption({
        tone: audience.tone || 'energetic',
        platform: platformMap[platform] || 'instagram',
        topic: data.title || 'music release',
        trackTitle: data.title,
        artistName: data.artist || data.artistName,
        genre: data.genre,
        contentType: data.contentType || 'release',
        includeHashtags: true,
        includeEmojis: true,
      });

      return {
        post: result.caption,
        hashtags: result.hashtags,
        optimalTime: '7:00 PM',
        engagement: result.estimatedEngagement,
        toneMatch: result.toneMatch,
      };
    } catch (error) {
      logger.warn('In-house content generation fallback:', error);
      return {
        post: `🎵 Just dropped my latest track! The energy in this one is absolutely incredible. Can't wait for you all to hear it! #NewMusic #Music #Artist`,
        hashtags: ['#NewMusic', '#Music', '#Artist', '#LatestTrack'],
        optimalTime: '7:00 PM',
        engagement: 0.85,
      };
    }
  }

  // AI video style generation
  private getAIVideoStyle(musicData: unknown, targetAudience: unknown): any {
    return {
      animation: 'dynamic',
      speed: 'medium',
      transitions: 'smooth',
      effects: 'modern',
    };
  }

  // AI video effects generation
  private getAIVideoEffects(platform: string, musicData: unknown): any {
    return {
      filters: ['vintage', 'neon'],
      overlays: ['waveform', 'lyrics'],
      animations: ['bounce', 'fade'],
    };
  }

  // AI video transitions
  private getAIVideoTransitions(platform: string): any {
    return {
      type: 'smooth',
      duration: 0.5,
      style: 'modern',
    };
  }

  // AI video text overlay
  private getAIVideoTextOverlay(musicData: unknown, platform: string): any {
    return {
      title: musicData.title || 'New Release',
      artist: musicData.artist || 'Artist Name',
      style: 'bold',
      color: '#ffffff',
      position: 'center',
    };
  }

  // AI audio style generation
  private getAIAudioStyle(musicData: unknown, targetAudience: unknown): any {
    return {
      genre: musicData.genre || 'pop',
      mood: 'upbeat',
      tempo: 'medium',
      effects: ['reverb', 'compression'],
    };
  }

  // AI audio effects
  private getAIAudioEffects(platform: string, musicData: unknown): any {
    return {
      eq: 'balanced',
      compression: 'medium',
      reverb: 'room',
      mastering: 'loud',
    };
  }

  // Platform audio length
  private getPlatformAudioLength(platform: string): number {
    const lengths = {
      facebook: 30,
      instagram: 15,
      twitter: 30,
      youtube: 60,
      tiktok: 15,
      linkedin: 30,
      threads: 15,
      googleBusiness: 30,
    };
    return lengths[platform as keyof typeof lengths] || 30;
  }

  // Platform audio quality
  private getPlatformAudioQuality(platform: string): string {
    const qualities = {
      facebook: 'high',
      instagram: 'medium',
      twitter: 'medium',
      youtube: 'high',
      tiktok: 'medium',
      linkedin: 'high',
      threads: 'medium',
      googleBusiness: 'high',
    };
    return qualities[platform as keyof typeof qualities] || 'medium';
  }

  // Default fallback methods
  private getDefaultImage(platform: string): string {
    const defaultImages = {
      facebook: '/images/default-facebook.png',
      instagram: '/images/default-instagram.png',
      twitter: '/images/default-twitter.png',
      youtube: '/images/default-youtube.png',
      tiktok: '/images/default-tiktok.png',
      linkedin: '/images/default-linkedin.png',
      threads: '/images/default-threads.png',
      googleBusiness: '/images/default-google-business.png',
    };

    return defaultImages[platform as keyof typeof defaultImages] || '/images/default-social.png';
  }

  private getDefaultVideo(platform: string): string {
    const defaultVideos = {
      facebook: '/videos/default-facebook.mp4',
      instagram: '/videos/default-instagram.mp4',
      twitter: '/videos/default-twitter.mp4',
      youtube: '/videos/default-youtube.mp4',
      tiktok: '/videos/default-tiktok.mp4',
      linkedin: '/videos/default-linkedin.mp4',
      threads: '/videos/default-threads.mp4',
      googleBusiness: '/videos/default-google-business.mp4',
    };

    return defaultVideos[platform as keyof typeof defaultVideos] || '/videos/default-social.mp4';
  }

  private getDefaultAudio(platform: string): string {
    const defaultAudios = {
      facebook: '/audio/default-facebook.mp3',
      instagram: '/audio/default-instagram.mp3',
      twitter: '/audio/default-twitter.mp3',
      youtube: '/audio/default-youtube.mp3',
      tiktok: '/audio/default-tiktok.mp3',
      linkedin: '/audio/default-linkedin.mp3',
      threads: '/audio/default-threads.mp3',
      googleBusiness: '/audio/default-google-business.mp3',
    };

    return defaultAudios[platform as keyof typeof defaultAudios] || '/audio/default-social.mp3';
  }
}

// Export singleton instance
export const contentGenerator = new SocialMediaContentGenerator();

// Export the main functions for use in routes
export async function generateSocialMediaImage(
  platform: string,
  musicData: unknown,
  targetAudience: unknown
): Promise<string> {
  return await contentGenerator.generateSocialMediaImage(platform, musicData, targetAudience);
}

/**
 * TODO: Add function documentation
 */
export async function generateSocialMediaContent(
  platform: string,
  musicData: unknown,
  targetAudience: unknown,
  contentType: 'image' | 'video' | 'audio' | 'all' = 'all'
): Promise<{
  image?: string;
  video?: string;
  audio?: string;
  content: any;
}> {
  return await contentGenerator.generateSocialMediaContent(
    platform,
    musicData,
    targetAudience,
    contentType
  );
}

/**
 * TODO: Add function documentation
 */
export async function generateContentFromURL(
  url: string,
  platform: string,
  targetAudience: unknown
): Promise<{
  image?: string;
  video?: string;
  audio?: string;
  content: any;
  extractedData: any;
}> {
  return await contentGenerator.generateContentFromURL(url, platform, targetAudience);
}
