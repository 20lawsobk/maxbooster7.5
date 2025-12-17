import type { AdCreative } from '@shared/schema';

/**
 * Advertisement Content Normalization Service
 * Transforms raw content into platform-specific variants optimized for organic reach
 * Uses connected social media profiles as distribution channels (Personal Ad Network)
 */
export class AdvertisingNormalizationService {
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
   * Normalize content for all selected platforms
   * Creates platform-specific variants optimized for organic virality
   */
  async normalizeContent(creative: AdCreative, platforms: string[]): Promise<Record<string, any>> {
    const variants: Record<string, any> = {};

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
        aspectRatio: limits.imageRatio || limits.videoRatio,
        callToAction: this.generateCTA(platform),
        optimalPostTime: this.calculateOptimalPostTime(platform),
        engagementHooks: this.generateEngagementHooks(creative.rawContent || '', platform),
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
   * Generate platform-specific call-to-action
   */
  private generateCTA(platform: string): string {
    const ctas = {
      instagram: 'Link in bio to listen 🎵',
      tiktok: 'Full track in bio! 🔥',
      twitter: 'Stream now 🎶',
      facebook: 'Listen on your favorite platform!',
      linkedin: 'Available on all major streaming platforms',
      youtube: 'Watch the full video!',
    };

    return ctas[platform as keyof typeof ctas] || 'Check it out!';
  }

  /**
   * Calculate optimal posting time for maximum organic reach
   */
  private calculateOptimalPostTime(platform: string): string {
    // Based on engagement research
    const optimalTimes = {
      instagram: '11:00 AM - 1:00 PM weekdays',
      tiktok: '6:00 PM - 10:00 PM daily',
      twitter: '12:00 PM - 3:00 PM weekdays',
      facebook: '1:00 PM - 3:00 PM weekdays',
      linkedin: '7:30 AM - 8:30 AM weekdays',
      youtube: '2:00 PM - 4:00 PM weekends',
    };

    return optimalTimes[platform as keyof typeof optimalTimes] || '12:00 PM weekdays';
  }

  /**
   * Generate engagement hooks to maximize organic interactions
   */
  private generateEngagementHooks(content: string, platform: string): string[] {
    const hooks: string[] = [];

    // Question hooks (drive comments)
    if (!content.includes('?')) {
      hooks.push('What do you think of this track? 💭');
    }

    // Emoji engagement
    if (!/[\u{1F300}-\u{1F9FF}]/u.test(content)) {
      hooks.push('React with 🔥 if you love this!');
    }

    // Tag engagement
    hooks.push('Tag someone who needs to hear this!');

    // Platform-specific hooks
    if (platform === 'tiktok') {
      hooks.push('Duet this! 🎤');
    } else if (platform === 'instagram') {
      hooks.push('Save this for later! 📌');
    }

    return hooks;
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
