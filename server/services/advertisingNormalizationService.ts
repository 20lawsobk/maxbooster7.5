import type { AdCreative } from '@shared/schema';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

/**
 * Advertisement Content Normalization Service
 * Transforms raw content into platform-specific variants optimized for organic reach.
 * Uses connected social media profiles as distribution channels (Personal Ad Network).
 * Pulls trained ad patterns, peak windows, and top hooks/CTAs from PDIM
 * (written by Max Booster's advertising engine and enriched by MaxCore training).
 */
export class AdvertisingNormalizationService {
  private async getPdimAdData(artistId: string): Promise<{
    patterns: Record<string, any>;
    peaks: any[];
    globalPeaks: any[];
  }> {
    const fallback = { patterns: {}, peaks: [], globalPeaks: [] };
    try {
      const redis = await getRedisClient();
      if (!redis) return fallback;

      const [patternRaw, peaksRaw, globalRaw] = await Promise.all([
        redis.get(`mb:ads:${artistId}:patterns`).catch(() => null),
        redis.lrange(`mb:ads:${artistId}:peaks`, 0, -1).catch(() => []),
        redis.lrange('mb:ads:global:peaks', 0, -1).catch(() => []),
      ]);

      return {
        patterns: patternRaw ? JSON.parse(patternRaw) : {},
        peaks: (peaksRaw || []).map((r: string) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean),
        globalPeaks: (globalRaw || []).map((r: string) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean),
      };
    } catch (e: any) {
      logger.warn(`[AdvertisingNorm] PDIM ad data fetch failed: ${e.message}`);
      return fallback;
    }
  }
  // Platform content requirements for optimal organic performance
  private platformLimits = {
    facebook: {
      textMax: 125, // Short text performs best organically
      hashtagMax: 30,
      imageRatio: [1.91, 1, 4 / 5],
      optimalLength: 80, // Engagement sweet spot
    },
    instagram: {
      textMax: 2200,
      hashtagMax: 30,
      imageRatio: [1.91, 1, 4 / 5],
      optimalLength: 138, // Research-backed engagement length
    },
    twitter: {
      textMax: 280,
      hashtagMax: 10,
      imageRatio: [2, 1, 16 / 9],
      optimalLength: 100, // Highest RT rate
    },
    linkedin: {
      textMax: 3000,
      hashtagMax: 5,
      imageRatio: [1.91, 1],
      optimalLength: 150, // Professional engagement length
    },
    tiktok: {
      textMax: 2200,
      hashtagMax: 10,
      videoRatio: [9 / 16],
      optimalLength: 100, // Short hooks perform best
    },
    youtube: {
      textMax: 5000,
      hashtagMax: 15,
      videoRatio: [16 / 9],
      optimalLength: 200, // Description engagement length
    },
  };

  /**
   * Normalize content for all selected platforms.
   * Creates platform-specific variants optimized for organic virality.
   * Enriches CTAs, hooks, and timing with trained data from PDIM.
   */
  async normalizeContent(creative: AdCreative, platforms: string[], artistId = 'artist-001'): Promise<Record<string, any>> {
    const variants: Record<string, any> = {};
    const pdim = await this.getPdimAdData(artistId);

    for (const platform of platforms) {
      const limits = this.platformLimits[platform as keyof typeof this.platformLimits];
      if (!limits) continue;

      variants[platform] = {
        text: this.optimizeText(
          creative.normalizedContent || creative.rawContent || '',
          platform,
          limits
        ),
        hashtags: this.extractAndOptimizeHashtags(
          creative.rawContent || '',
          limits.hashtagMax,
          platform
        ),
        mediaUrls: creative.assetUrls || [],
        aspectRatio: limits.imageRatio || (limits as any).videoRatio,
        callToAction: this.generateCTA(platform, pdim.patterns),
        optimalPostTime: this.calculateOptimalPostTime(platform, pdim.peaks, pdim.globalPeaks),
        engagementHooks: this.generateEngagementHooks(creative.rawContent || '', platform, pdim.patterns),
      };
    }

    return variants;
  }

  /**
   * Check content compliance for brand safety and platform policies
   */
  async checkCompliance(
    content: string,
    assets: string[]
  ): Promise<{ status: string; issues: any }> {
    const issues = {
      offensive: this.detectOffensiveContent(content),
      spam: this.detectSpamPatterns(content),
      copyright: false, // Placeholder - users upload own content
      brandSafety: this.checkBrandSafety(content),
      engagement: this.validateEngagementQuality(content),
    };

    const hasIssues = Object.entries(issues).some(
      ([key, value]) => key !== 'engagement' && value === true
    );

    const status = hasIssues ? 'rejected' : 'approved';
    return { status, issues };
  }

  /**
   * Optimize text for maximum organic engagement
   */
  private optimizeText(text: string, platform: string, limits: unknown): string {
    // Truncate to optimal length for engagement
    let optimized =
      text.length > limits.optimalLength
        ? text.substring(0, limits.optimalLength - 3) + '...'
        : text;

    // Add platform-specific formatting
    switch (platform) {
      case 'twitter':
        // Keep it punchy for Twitter
        optimized = this.addTwitterFormatting(optimized);
        break;
      case 'linkedin':
        // Professional tone for LinkedIn
        optimized = this.addLinkedInFormatting(optimized);
        break;
      case 'tiktok':
        // Casual, energetic for TikTok
        optimized = this.addTikTokFormatting(optimized);
        break;
    }

    return optimized;
  }

  /**
   * Extract and optimize hashtags for platform-specific discovery
   */
  private extractAndOptimizeHashtags(text: string, maxCount: number, platform: string): string[] {
    // Extract existing hashtags
    const existingHashtags = text.match(/#\w+/g) || [];

    // Add platform-optimized discovery hashtags
    const platformHashtags = this.getPlatformOptimizedHashtags(platform);

    // Combine and deduplicate
    const allHashtags = [...new Set([...existingHashtags, ...platformHashtags])];

    // Return top performing hashtags up to limit
    return allHashtags.slice(0, maxCount);
  }

  /**
   * Get platform-specific hashtags for maximum organic reach
   */
  private getPlatformOptimizedHashtags(platform: string): string[] {
    const musicDiscoveryHashtags = {
      instagram: ['#NewMusic', '#MusicPromotion', '#IndieArtist', '#MusicDiscovery', '#NewRelease'],
      tiktok: ['#NewMusic', '#MusicTok', '#IndieArtist', '#SongPromotion', '#MusicDiscovery'],
      twitter: ['#NowPlaying', '#NewMusicFriday', '#IndieMusic', '#MusicPromotion'],
      facebook: ['#NewMusic', '#MusicRelease', '#IndieArtist'],
      linkedin: ['#MusicIndustry', '#ArtistDevelopment', '#MusicBusiness'],
      youtube: ['#NewMusic', '#MusicVideo', '#IndieArtist', '#MusicDiscovery'],
    };

    return musicDiscoveryHashtags[platform as keyof typeof musicDiscoveryHashtags] || [];
  }

  /**
   * Generate platform-specific call-to-action.
   * Uses top_ctas learned from PDIM ad patterns when available.
   */
  private generateCTA(platform: string, patterns: Record<string, any> = {}): string {
    const platformKey = Object.keys(patterns).find(k => k.startsWith(platform));
    if (platformKey && patterns[platformKey]?.top_ctas?.length) {
      return patterns[platformKey].top_ctas[0];
    }
    const ctas: Record<string, string> = {
      instagram: 'Link in bio to listen 🎵',
      tiktok: 'Full track in bio! 🔥',
      twitter: 'Stream now 🎶',
      facebook: 'Listen on your favorite platform!',
      linkedin: 'Available on all major streaming platforms',
      youtube: 'Watch the full video!',
    };
    return ctas[platform] || 'Check it out!';
  }

  /**
   * Calculate optimal posting time.
   * Prefers artist-specific peak windows from PDIM, falls back to global peaks,
   * then to research-backed defaults.
   */
  private calculateOptimalPostTime(platform: string, peaks: any[] = [], globalPeaks: any[] = []): string {
    const artistPeak = peaks.find(p => p?.platform === platform || p?.platforms?.includes(platform));
    if (artistPeak?.window) return artistPeak.window;

    const globalPeak = globalPeaks.find(p => p?.platform === platform || p?.platforms?.includes(platform));
    if (globalPeak?.window) return globalPeak.window;

    const optimalTimes: Record<string, string> = {
      instagram: '11:00 AM - 1:00 PM weekdays',
      tiktok: '6:00 PM - 10:00 PM daily',
      twitter: '12:00 PM - 3:00 PM weekdays',
      facebook: '1:00 PM - 3:00 PM weekdays',
      linkedin: '7:30 AM - 8:30 AM weekdays',
      youtube: '2:00 PM - 4:00 PM weekends',
    };
    return optimalTimes[platform] || '12:00 PM weekdays';
  }

  /**
   * Generate engagement hooks.
   * Prepends trained top_hooks from PDIM ad patterns before generic defaults.
   */
  private generateEngagementHooks(content: string, platform: string, patterns: Record<string, any> = {}): string[] {
    const hooks: string[] = [];

    const platformKey = Object.keys(patterns).find(k => k.startsWith(platform));
    if (platformKey && patterns[platformKey]?.top_hooks?.length) {
      hooks.push(...patterns[platformKey].top_hooks.slice(0, 2));
    }

    if (!content.includes('?')) {
      hooks.push('What do you think of this track? 💭');
    }
    if (!new RegExp('[\\\u{1F300}-\\\u{1F9FF}]', 'u').test(content)) {
      hooks.push('React with 🔥 if you love this!');
    }
    hooks.push('Tag someone who needs to hear this!');
    if (platform === 'tiktok') hooks.push('Duet this! 🎤');
    else if (platform === 'instagram') hooks.push('Save this for later! 📌');

    return [...new Set(hooks)];
  }

  // Content safety checks
  private detectOffensiveContent(text: string): boolean {
    const offensivePatterns = /\b(spam|scam|explicit|offensive)\b/i;
    return offensivePatterns.test(text);
  }

  private detectSpamPatterns(text: string): boolean {
    // Check for excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
    if (capsRatio > 0.5) return true;

    // Check for excessive exclamation marks
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 5) return true;

    // Check for repetitive text
    if (/(.)\1{4,}/.test(text)) return true;

    return false;
  }

  private checkBrandSafety(text: string): boolean {
    const unsafePatterns = /\b(violence|hate|illegal)\b/i;
    return unsafePatterns.test(text);
  }

  private validateEngagementQuality(text: string): boolean {
    // Text should be substantial
    if (text.length < 20) return false;

    // Should have some variation
    if (!/[.!?]/.test(text)) return false;

    return true;
  }

  // Platform-specific formatting helpers
  private addTwitterFormatting(text: string): string {
    // Twitter loves line breaks for readability
    return text.trim();
  }

  private addLinkedInFormatting(text: string): string {
    // LinkedIn prefers paragraph structure
    return text.trim();
  }

  private addTikTokFormatting(text: string): string {
    // TikTok loves casual, energetic tone
    return text.trim();
  }
}
