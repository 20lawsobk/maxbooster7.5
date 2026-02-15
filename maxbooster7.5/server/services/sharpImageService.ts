/**
 * Sharp-based Image Generation Service
 * Production-ready image generation using Sharp instead of Canvas
 * Supports all platform dimensions and promotional graphics
 */

import sharp from 'sharp';
import { nanoid } from 'nanoid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger.js';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageGenerationOptions {
  prompt: string;
  platform: string;
  tone?: 'professional' | 'casual' | 'energetic' | 'creative' | 'promotional';
  brandColors?: string[];
  overlayText?: string;
}

interface GradientColors {
  start: string;
  end: string;
  accent?: string;
}

// B-Lawz Music brand colors
const BRAND_COLORS = {
  primary: '#FFD700',      // Gold
  secondary: '#9B59B6',    // Purple  
  dark: '#1A1A2E',         // Dark background
  accent: '#E94560',       // Red accent
  white: '#FFFFFF',
  black: '#0F0F1A',
};

// Tone-based gradient colors
const TONE_GRADIENTS: Record<string, GradientColors> = {
  professional: { start: '#1A1A2E', end: '#16213E', accent: '#FFD700' },
  casual: { start: '#2D1F4F', end: '#1A1A2E', accent: '#9B59B6' },
  energetic: { start: '#E94560', end: '#FF6B6B', accent: '#FFD700' },
  creative: { start: '#9B59B6', end: '#3498DB', accent: '#FFD700' },
  promotional: { start: '#FFD700', end: '#E94560', accent: '#1A1A2E' },
};

// Platform-specific dimensions
const PLATFORM_DIMENSIONS: Record<string, ImageDimensions> = {
  twitter: { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1080 },
  'instagram-story': { width: 1080, height: 1920 },
  facebook: { width: 1200, height: 630 },
  linkedin: { width: 1200, height: 627 },
  youtube: { width: 1280, height: 720 },
  tiktok: { width: 1080, height: 1920 },
  default: { width: 1200, height: 675 },
};

class SharpImageService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'public', 'generated-content', 'images');
  }

  /**
   * Get platform-specific dimensions
   */
  getDimensions(platform: string): ImageDimensions {
    return PLATFORM_DIMENSIONS[platform.toLowerCase()] || PLATFORM_DIMENSIONS.default;
  }

  /**
   * Create a gradient background image
   */
  private async createGradientBackground(
    width: number,
    height: number,
    colors: GradientColors
  ): Promise<Buffer> {
    // Create SVG gradient
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${colors.start};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors.end};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Create decorative elements overlay
   */
  private async createDecorativeOverlay(
    width: number,
    height: number,
    tone: string
  ): Promise<Buffer> {
    const colors = TONE_GRADIENTS[tone] || TONE_GRADIENTS.creative;
    const accentColor = colors.accent || BRAND_COLORS.primary;
    
    // Create decorative shapes with SVG
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Decorative circles -->
        <circle cx="${width * 0.1}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.15}" 
                fill="${accentColor}" opacity="0.1"/>
        <circle cx="${width * 0.9}" cy="${height * 0.8}" r="${Math.min(width, height) * 0.2}" 
                fill="${accentColor}" opacity="0.08"/>
        <circle cx="${width * 0.5}" cy="${height * 0.1}" r="${Math.min(width, height) * 0.1}" 
                fill="${BRAND_COLORS.secondary}" opacity="0.12"/>
        
        <!-- Sound wave lines -->
        <g stroke="${accentColor}" stroke-width="2" opacity="0.2" fill="none">
          <path d="M ${width * 0.05} ${height * 0.5} 
                   Q ${width * 0.15} ${height * 0.3}, ${width * 0.25} ${height * 0.5} 
                   T ${width * 0.45} ${height * 0.5}"/>
          <path d="M ${width * 0.55} ${height * 0.5} 
                   Q ${width * 0.65} ${height * 0.7}, ${width * 0.75} ${height * 0.5} 
                   T ${width * 0.95} ${height * 0.5}"/>
        </g>
        
        <!-- Corner accents -->
        <polygon points="0,0 ${width * 0.15},0 0,${height * 0.15}" 
                 fill="${accentColor}" opacity="0.15"/>
        <polygon points="${width},${height} ${width - width * 0.15},${height} ${width},${height - height * 0.15}" 
                 fill="${accentColor}" opacity="0.15"/>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Create text overlay with the prompt/message
   */
  private async createTextOverlay(
    width: number,
    height: number,
    text: string,
    platform: string
  ): Promise<Buffer> {
    // Calculate font size based on dimensions and text length
    const maxCharsPerLine = platform === 'instagram' || platform === 'tiktok' ? 20 : 35;
    const lines = this.wrapText(text, maxCharsPerLine);
    const fontSize = Math.min(
      Math.floor(width / 15),
      Math.floor(height / (lines.length * 2 + 2))
    );
    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (height - totalTextHeight) / 2 + fontSize;

    // Create text SVG
    const textElements = lines.map((line, i) => {
      const y = startY + i * lineHeight;
      return `
        <text x="50%" y="${y}" 
              text-anchor="middle" 
              font-family="Arial, Helvetica, sans-serif" 
              font-size="${fontSize}px" 
              font-weight="bold" 
              fill="${BRAND_COLORS.white}">
          <tspan filter="drop-shadow(2px 2px 4px rgba(0,0,0,0.5))">${this.escapeXml(line)}</tspan>
        </text>
      `;
    }).join('');

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${textElements}
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Create branding overlay
   */
  private async createBrandingOverlay(
    width: number,
    height: number
  ): Promise<Buffer> {
    const brandText = 'B-Lawz Music';
    const fontSize = Math.floor(width / 30);
    const padding = fontSize;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Brand text bottom right -->
        <text x="${width - padding}" y="${height - padding}" 
              text-anchor="end" 
              font-family="Arial, Helvetica, sans-serif" 
              font-size="${fontSize}px" 
              font-weight="bold" 
              fill="${BRAND_COLORS.primary}" 
              opacity="0.8">
          ${brandText}
        </text>
        
        <!-- Subtle border accent -->
        <rect x="0" y="0" width="${width}" height="${height}" 
              fill="none" 
              stroke="${BRAND_COLORS.primary}" 
              stroke-width="4" 
              opacity="0.3"/>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Word wrap text into lines
   */
  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Limit to 4 lines max
    return lines.slice(0, 4);
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate a complete promotional image
   */
  async generateImage(options: ImageGenerationOptions): Promise<{
    buffer: Buffer;
    dimensions: ImageDimensions;
    filename: string;
    publicUrl: string;
  }> {
    const { prompt, platform, tone = 'creative' } = options;
    const dimensions = this.getDimensions(platform);
    const { width, height } = dimensions;
    const filename = `${nanoid()}.png`;
    const outputPath = path.join(this.outputDir, filename);
    const publicUrl = `/generated-content/images/${filename}`;

    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      const colors = TONE_GRADIENTS[tone] || TONE_GRADIENTS.creative;

      // Create layers
      const [gradientBuffer, decorativeBuffer, textBuffer, brandingBuffer] = await Promise.all([
        this.createGradientBackground(width, height, colors),
        this.createDecorativeOverlay(width, height, tone),
        this.createTextOverlay(width, height, prompt, platform),
        this.createBrandingOverlay(width, height),
      ]);

      // Compose the final image using Sharp
      const finalImage = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 26, g: 26, b: 46, alpha: 1 }, // Dark background fallback
        },
      })
        .composite([
          { input: await sharp(gradientBuffer).png().toBuffer(), top: 0, left: 0 },
          { input: await sharp(decorativeBuffer).png().toBuffer(), top: 0, left: 0 },
          { input: await sharp(textBuffer).png().toBuffer(), top: 0, left: 0 },
          { input: await sharp(brandingBuffer).png().toBuffer(), top: 0, left: 0 },
        ])
        .png({ quality: 90 })
        .toBuffer();

      // Write to file
      await fs.writeFile(outputPath, finalImage);

      // Verify file was created
      const stats = await fs.stat(outputPath);
      logger.info(`✅ Sharp generated image: ${publicUrl} (${width}x${height}, ${stats.size} bytes)`);

      return {
        buffer: finalImage,
        dimensions,
        filename,
        publicUrl,
      };
    } catch (error: any) {
      logger.error(`Sharp image generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a simple solid color image (fallback)
   */
  async generateSimpleImage(
    width: number,
    height: number,
    backgroundColor: string = BRAND_COLORS.dark
  ): Promise<Buffer> {
    // Convert hex to RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r, g, b },
      },
    })
      .png()
      .toBuffer();
  }

  /**
   * Generate video thumbnail
   */
  async generateVideoThumbnail(options: ImageGenerationOptions): Promise<{
    buffer: Buffer;
    filename: string;
    publicUrl: string;
  }> {
    // Use the same image generation but with play button overlay
    const result = await this.generateImage(options);
    
    // Add play button overlay
    const playButton = await this.createPlayButtonOverlay(
      result.dimensions.width,
      result.dimensions.height
    );

    const thumbnailBuffer = await sharp(result.buffer)
      .composite([
        { input: await sharp(playButton).png().toBuffer(), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    const thumbnailFilename = result.filename.replace('.png', '-thumb.png');
    const thumbnailPath = path.join(this.outputDir, thumbnailFilename);
    await fs.writeFile(thumbnailPath, thumbnailBuffer);

    return {
      buffer: thumbnailBuffer,
      filename: thumbnailFilename,
      publicUrl: `/generated-content/images/${thumbnailFilename}`,
    };
  }

  /**
   * Create play button overlay for video thumbnails
   */
  private async createPlayButtonOverlay(width: number, height: number): Promise<Buffer> {
    const buttonRadius = Math.min(width, height) * 0.1;
    const cx = width / 2;
    const cy = height / 2;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Semi-transparent backdrop -->
        <circle cx="${cx}" cy="${cy}" r="${buttonRadius * 1.3}" 
                fill="rgba(0,0,0,0.5)"/>
        <!-- Play button circle -->
        <circle cx="${cx}" cy="${cy}" r="${buttonRadius}" 
                fill="${BRAND_COLORS.primary}"/>
        <!-- Play triangle -->
        <polygon 
          points="${cx - buttonRadius * 0.3},${cy - buttonRadius * 0.4} 
                  ${cx - buttonRadius * 0.3},${cy + buttonRadius * 0.4} 
                  ${cx + buttonRadius * 0.5},${cy}" 
          fill="${BRAND_COLORS.dark}"/>
      </svg>
    `;

    return Buffer.from(svg);
  }
}

// Export singleton instance
export const sharpImageService = new SharpImageService();

// Log initialization
logger.info('✅ Sharp Image Service initialized - production-ready image generation available');
