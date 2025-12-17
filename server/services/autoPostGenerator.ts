import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from './aiModelManager.js';
import { autoPostingService, type PostContent } from './autoPostingService.js';

/**
 * Auto-Post Generator Service
 * Generates AI-optimized content and automatically posts it
 * Integrates both Social Media Autopilot and Advertising Autopilot AI v3.0
 */

export interface ContentGenerationRequest {
  topic?: string;
  objective?: 'awareness' | 'engagement' | 'conversions' | 'viral';
  platforms?: string[];
  targetAudience?: string;
  tone?: 'professional' | 'casual' | 'humorous' | 'inspirational';
  includeHashtags?: boolean;
  includeMentions?: boolean;
  mediaType?: 'text' | 'audio' | 'image' | 'photo' | 'video' | 'carousel';
}

export interface GeneratedContent {
  headline: string;
  body: string;
  hashtags: string[];
  mentions: string[];
  mediaType: 'text' | 'audio' | 'image' | 'photo' | 'video' | 'carousel';
  callToAction?: string;
  viralScore?: number;
  expectedReach?: number;
  expectedEngagement?: number;
  generatedBy: 'social_autopilot' | 'advertising_autopilot';
  platforms: string[];
  optimalPostingTime: Date;
  mediaGuidance?: string; // Guidance for what media content to create
}

class AutoPostGenerator {
  /**
   * Get Social Media Autopilot AI for user (per-user isolated)
   * FIXED: Uses aiModelManager to prevent cross-tenant data leakage
   */
  private async getSocialAI(userId: string) {
    return await aiModelManager.getSocialAutopilot(userId);
  }

  /**
   * Get Advertising Autopilot AI v3.0 for user (per-user isolated)
   * FIXED: Uses aiModelManager to prevent cross-tenant data leakage
   */
  private async getAdvertisingAI(userId: string) {
    return await aiModelManager.getAdvertisingAutopilot(userId);
  }

  /**
   * Generate content using Social Media Autopilot AI
   */
  async generateSocialContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const ai = await this.getSocialAI(userId);

    // Get user's profile for personalization
    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';

    // Generate content based on objective
    const topic = request.topic || 'new music release';
    const tone = request.tone || 'inspirational';
    const platforms = request.platforms || ['instagram', 'facebook', 'twitter'];

    // Content templates based on objective
    let headline = '';
    let body = '';
    let callToAction = '';

    switch (request.objective) {
      case 'awareness':
        headline = this.generateAwarenessHeadline(artistName, topic, tone);
        body = this.generateAwarenessBody(artistName, topic, tone);
        callToAction = 'Check it out!';
        break;
      
      case 'engagement':
        headline = this.generateEngagementHeadline(artistName, topic, tone);
        body = this.generateEngagementBody(artistName, topic, tone);
        callToAction = 'Let me know what you think!';
        break;
      
      case 'conversions':
        headline = this.generateConversionHeadline(artistName, topic, tone);
        body = this.generateConversionBody(artistName, topic, tone);
        callToAction = 'Stream now on Spotify!';
        break;
      
      case 'viral':
        headline = this.generateViralHeadline(artistName, topic, tone);
        body = this.generateViralBody(artistName, topic, tone);
        callToAction = 'Share if you love it!';
        break;
      
      default:
        headline = `${artistName} - ${topic}`;
        body = `Excited to share this with you all! ${topic}`;
        callToAction = 'Check it out!';
    }

    // Generate hashtags
    const hashtags = request.includeHashtags !== false
      ? this.generateHashtags(topic, platforms)
      : [];

    // Generate optimal posting time (use AI if available)
    const now = new Date();
    const optimalHour = this.getOptimalPostingHour(platforms);
    const optimalTime = new Date(now);
    optimalTime.setHours(optimalHour, 0, 0, 0);
    if (optimalTime < now) {
      optimalTime.setDate(optimalTime.getDate() + 1);
    }

    // Normalize mediaType (photo -> image)
    const mediaType = this.normalizeMediaType(request.mediaType || 'image');
    
    // Generate media guidance
    const mediaGuidance = this.generateMediaGuidance(mediaType, topic, request.objective || 'engagement');

    return {
      headline,
      body,
      hashtags,
      mentions: [],
      mediaType,
      callToAction,
      generatedBy: 'social_autopilot',
      platforms,
      optimalPostingTime: optimalTime,
      mediaGuidance,
    };
  }

  /**
   * Generate content using Advertising Autopilot AI v3.0
   */
  async generateViralContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const ai = await this.getAdvertisingAI(userId);

    // Get user's profile for personalization
    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';

    // Generate viral-optimized content
    const topic = request.topic || 'new music';
    const platforms = request.platforms || ['instagram', 'tiktok', 'youtube', 'facebook'];

    // Viral content templates (designed for maximum sharing)
    const headline = this.generateViralHeadline(artistName, topic, request.tone || 'inspirational');
    const body = this.generateViralBody(artistName, topic, request.tone || 'inspirational');
    const hashtags = this.generateViralHashtags(topic, platforms);
    const callToAction = 'Share with someone who needs to hear this!';

    // Get AI prediction for this content
    const prediction = await ai.predictViralContent({
      headline,
      body,
      hashtags,
      mentions: [],
      mediaType: request.mediaType || 'video',
      callToAction,
      platforms,
      scheduledTime: new Date(),
    });

    // Get optimal distribution plan
    const distributionPlan = await ai.generateContentDistributionPlan(
      {
        headline,
        body,
        hashtags,
        mentions: [],
        mediaType: request.mediaType || 'video',
        callToAction,
      },
      platforms
    );

    // Use the optimal posting time from the highest priority platform
    const optimalTime = distributionPlan[0]?.optimalPostingTime || new Date();

    // Normalize mediaType (photo -> image)
    const mediaType = this.normalizeMediaType(request.mediaType || 'video');
    
    // Generate media guidance
    const mediaGuidance = this.generateMediaGuidance(mediaType, topic, request.objective || 'viral');

    return {
      headline,
      body,
      hashtags,
      mentions: [],
      mediaType,
      callToAction,
      viralScore: prediction.predictions.viralityScore,
      expectedReach: prediction.predictions.expectedReach,
      expectedEngagement: prediction.predictions.expectedEngagement,
      generatedBy: 'advertising_autopilot',
      platforms: distributionPlan.map(p => p.platform),
      optimalPostingTime: optimalTime,
      mediaGuidance,
    };
  }

  /**
   * Generate content AND auto-post using Social Media Autopilot
   */
  async generateAndPostSocial(
    userId: string,
    request: ContentGenerationRequest,
    scheduleOptimal: boolean = true
  ): Promise<{
    content: GeneratedContent;
    posted?: boolean;
    scheduled?: boolean;
    results?: any;
  }> {
    // Generate content
    const content = await this.generateSocialContent(userId, request);

    logger.info(`Generated social content for user ${userId}: "${content.headline}"`);

    // Prepare post content
    const postContent: PostContent = {
      text: content.body,
      headline: content.headline,
      hashtags: content.hashtags,
      mentions: content.mentions,
      mediaType: content.mediaType,
    };

    // Post or schedule
    if (scheduleOptimal) {
      const scheduledPost = await autoPostingService.schedulePost(
        userId,
        content.platforms,
        postContent,
        content.optimalPostingTime,
        'social_autopilot'
      );

      return {
        content,
        scheduled: true,
        results: scheduledPost,
      };
    } else {
      const postResults = await autoPostingService.postNow(
        userId,
        content.platforms,
        postContent,
        'social_autopilot'
      );

      return {
        content,
        posted: true,
        results: postResults,
      };
    }
  }

  /**
   * Generate content AND auto-post using Advertising Autopilot AI v3.0
   */
  async generateAndPostViral(
    userId: string,
    request: ContentGenerationRequest,
    scheduleOptimal: boolean = true
  ): Promise<{
    content: GeneratedContent;
    posted?: boolean;
    scheduled?: boolean;
    results?: any;
  }> {
    // Generate viral content with AI prediction
    const content = await this.generateViralContent(userId, request);

    logger.info(`Generated viral content for user ${userId}: "${content.headline}" (viral score: ${content.viralScore?.toFixed(2)})`);

    // Prepare post content
    const postContent: PostContent = {
      text: content.body,
      headline: content.headline,
      hashtags: content.hashtags,
      mentions: content.mentions,
      mediaType: content.mediaType,
    };

    // Post or schedule
    if (scheduleOptimal) {
      const scheduledPost = await autoPostingService.schedulePost(
        userId,
        content.platforms,
        postContent,
        content.optimalPostingTime,
        'advertising_autopilot',
        {
          viralityScore: content.viralScore,
          expectedReach: content.expectedReach,
          expectedEngagement: content.expectedEngagement,
        }
      );

      return {
        content,
        scheduled: true,
        results: scheduledPost,
      };
    } else {
      const postResults = await autoPostingService.postNow(
        userId,
        content.platforms,
        postContent,
        'advertising_autopilot'
      );

      return {
        content,
        posted: true,
        results: postResults,
      };
    }
  }

  // Content generation helpers

  private generateAwarenessHeadline(artist: string, topic: string, tone: string): string {
    const templates = [
      `${artist} presents: ${topic}`,
      `Introducing ${topic} by ${artist}`,
      `${artist} - ${topic} is here!`,
      `New from ${artist}: ${topic}`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateAwarenessBody(artist: string, topic: string, tone: string): string {
    return `Hey everyone! I'm excited to share ${topic} with you. This has been a labor of love and I can't wait for you to experience it. Let me know your thoughts!`;
  }

  private generateEngagementHeadline(artist: string, topic: string, tone: string): string {
    const templates = [
      `What do you think about ${topic}?`,
      `${artist} wants YOUR opinion on ${topic}`,
      `Help me decide: ${topic}`,
      `Question for you about ${topic}`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateEngagementBody(artist: string, topic: string, tone: string): string {
    return `I've been working on ${topic} and would love your feedback! What resonates with you? Drop a comment and let's connect. Your input means everything to me!`;
  }

  private generateConversionHeadline(artist: string, topic: string, tone: string): string {
    const templates = [
      `${topic} - Stream Now!`,
      `Don't miss ${topic} by ${artist}`,
      `${topic} is LIVE - Listen Now`,
      `${artist}: ${topic} Available Everywhere`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateConversionBody(artist: string, topic: string, tone: string): string {
    return `${topic} is officially out NOW on all streaming platforms! 🎵 I poured my heart into this and I hope it moves you. Stream it, save it, share it with someone who needs to hear it!`;
  }

  private generateViralHeadline(artist: string, topic: string, tone: string): string {
    const templates = [
      `🔥 You won't believe what ${artist} just dropped`,
      `This ${topic} will blow your mind`,
      `${artist} just changed the game with ${topic}`,
      `Everyone's talking about ${topic} - here's why`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateViralBody(artist: string, topic: string, tone: string): string {
    return `I've been waiting to share this moment with you... ${topic} is finally here and it's everything I hoped it would be. This is more than just music - it's a movement. Tag someone who needs this in their life RIGHT NOW! 🚀`;
  }

  private generateHashtags(topic: string, platforms: string[]): string[] {
    const baseHashtags = ['#music', '#newmusic', '#artist'];
    
    // Platform-specific hashtags
    if (platforms.includes('instagram')) {
      baseHashtags.push('#instamusic', '#musicproduction');
    }
    if (platforms.includes('tiktok')) {
      baseHashtags.push('#fyp', '#viral', '#musictok');
    }
    if (platforms.includes('twitter')) {
      baseHashtags.push('#NowPlaying', '#MusicTwitter');
    }

    // Topic-based hashtags
    const topicWords = topic.toLowerCase().split(' ');
    for (const word of topicWords) {
      if (word.length > 3) {
        baseHashtags.push(`#${word}`);
      }
    }

    return baseHashtags.slice(0, 7); // Max 7 hashtags for optimal performance
  }

  private generateViralHashtags(topic: string, platforms: string[]): string[] {
    const viralHashtags = [
      '#newmusic',
      '#musicvideo',
      '#unsignedartist',
      '#independentartist',
      '#musicproducer',
    ];

    // Viral platform hashtags
    if (platforms.includes('tiktok')) {
      viralHashtags.push('#fyp', '#foryou', '#viral', '#trending');
    }
    if (platforms.includes('instagram')) {
      viralHashtags.push('#reels', '#explore');
    }
    if (platforms.includes('youtube')) {
      viralHashtags.push('#shorts', '#youtubeshorts');
    }

    return viralHashtags.slice(0, 10);
  }

  /**
   * Normalize media type (convert 'photo' to 'image')
   */
  private normalizeMediaType(mediaType: string): 'text' | 'audio' | 'image' | 'video' | 'carousel' {
    if (mediaType === 'photo') return 'image';
    if (['text', 'audio', 'image', 'video', 'carousel'].includes(mediaType)) {
      return mediaType as 'text' | 'audio' | 'image' | 'video' | 'carousel';
    }
    return 'image'; // default
  }

  /**
   * Generate media guidance for content creators
   */
  private generateMediaGuidance(mediaType: string, topic: string, objective: string): string {
    switch (mediaType) {
      case 'text':
        return `Create text-only post. No images or videos needed. Focus on compelling copy and storytelling.`;
      
      case 'audio':
        return `Create audio content for ${topic}. Examples: 30-60 second music snippet, behind-the-scenes voice note, audio preview, podcast clip, or narrated story. Platforms: Instagram Reels (with static image), TikTok (with visualization), Twitter Spaces, YouTube (audio with static image).`;
      
      case 'image':
      case 'photo':
        return `Create eye-catching image for ${topic}. Examples: album artwork, professional photo, promotional graphic, quote card, or behind-the-scenes snapshot. Optimal dimensions: 1080x1080 (square) for Instagram/Facebook, 1080x1920 (vertical) for Instagram Stories/TikTok. Use vibrant colors and readable text overlays.`;
      
      case 'video':
        if (objective === 'viral') {
          return `Create SHORT, attention-grabbing video for ${topic} (15-60 seconds). Hook viewers in first 3 seconds. Examples: music video snippet, performance clip, creative visual, trending sound/challenge, or emotional storytelling. Vertical format (9:16) performs best on TikTok, Instagram Reels, YouTube Shorts. Include captions for sound-off viewing.`;
        }
        return `Create engaging video for ${topic} (30-90 seconds). Examples: music video preview, performance footage, behind-the-scenes content, lyric video, or promotional clip. Vertical format (9:16) recommended. Add captions and ensure good lighting/audio quality.`;
      
      case 'carousel':
        return `Create carousel/slideshow (2-10 images/videos) for ${topic}. Examples: step-by-step story, before/after sequence, collection showcase, or multi-angle presentation. Each slide should tell part of the story. Works best on Instagram and Facebook. Include swipeable call-to-action.`;
      
      default:
        return `Create visual content for ${topic}.`;
    }
  }

  private getOptimalPostingHour(platforms: string[]): number {
    // Optimal posting hours based on platform research
    const optimalHours: Record<string, number> = {
      instagram: 18, // 6 PM
      facebook: 13,  // 1 PM
      twitter: 12,   // 12 PM
      tiktok: 19,    // 7 PM
      youtube: 14,   // 2 PM
      linkedin: 10,  // 10 AM
    };

    // Return average optimal hour across platforms
    const hours = platforms.map(p => optimalHours[p] || 12);
    return Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
  }
}

// Export singleton instance
export const autoPostGenerator = new AutoPostGenerator();
