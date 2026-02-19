import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from './aiModelManager.js';
import { autoPostingService, type PostContent } from './autoPostingService.js';
import { contentQualityPipeline, type ContentVariant, type ContentScores } from './contentQualityPipeline';
import { dynamicTrendsService } from './dynamicTrendsService';
import { aiTranslationService, type TranslatedContent } from './aiTranslationService';
import { pythonAIService } from './pythonAIService.js';

/**
 * Auto-Post Generator Service v2.0
 * AI-optimized content generation with quality scoring, variant selection,
 * platform optimization, and multilingual support.
 * Integrates ContentQualityPipeline for 3-5x variant generation and scoring.
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
  generateVariants?: number;
  targetLanguages?: string[];
  genre?: string;
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
  generatedBy: 'social_autopilot' | 'advertising_autopilot' | 'quality_pipeline';
  platforms: string[];
  optimalPostingTime: Date;
  mediaGuidance?: string;
  qualityScores?: ContentScores;
  variants?: ContentVariant[];
  translations?: TranslatedContent[];
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
   * Generate high-quality content using ContentQualityPipeline v2.0
   * - Generates multiple variants with scoring
   * - Selects best variant based on quality metrics
   * - Includes platform optimization and hashtag optimization
   * - Supports multilingual translations
   */
  async generateEnhancedContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const platforms = request.platforms || ['instagram'];
    const primaryPlatform = platforms[0];
    
    try {
      const variantCount = request.generateVariants || 3;
      const { selected, variants, context } = await contentQualityPipeline.generateAndSelect(
        userId,
        {
          topic: request.topic || 'new music',
          objective: request.objective || 'engagement',
          platform: primaryPlatform,
          tone: request.tone,
          targetAudience: request.targetAudience,
          genre: request.genre,
        },
        variantCount,
        55
      );

      if (!selected) {
        logger.warn('No variant met quality threshold, falling back to legacy generation');
        return this.generateSocialContent(userId, request);
      }

      const trendingHashtags = await dynamicTrendsService.getOptimizedHashtags(
        primaryPlatform,
        request.genre,
        request.objective,
        request.includeHashtags !== false ? 8 : 0
      );

      const combinedHashtags = request.includeHashtags !== false
        ? [...new Set([...selected.hashtags, ...trendingHashtags.map(h => h.hashtag)])].slice(0, 12)
        : [];

      let translations: TranslatedContent[] | undefined;
      if (request.targetLanguages && request.targetLanguages.length > 0) {
        translations = await aiTranslationService.translateContent({
          content: selected.content,
          headline: selected.headline,
          hashtags: combinedHashtags,
          targetLanguages: request.targetLanguages,
          preserveTone: true,
          adaptForPlatform: primaryPlatform,
        });
      }

      const now = new Date();
      const optimalHour = this.getOptimalPostingHour(platforms);
      const optimalTime = new Date(now);
      optimalTime.setHours(optimalHour, 0, 0, 0);
      if (optimalTime < now) {
        optimalTime.setDate(optimalTime.getDate() + 1);
      }

      const mediaType = this.normalizeMediaType(request.mediaType || 'image');
      const mediaGuidance = this.generateMediaGuidance(mediaType, request.topic || 'new music', request.objective || 'engagement');

      logger.info(`Generated enhanced content for ${userId}: score=${selected.scores.overall.toFixed(1)}, variants=${variants.length}`);

      return {
        headline: selected.headline,
        body: selected.content,
        hashtags: combinedHashtags,
        mentions: [],
        mediaType,
        callToAction: selected.callToAction,
        viralScore: selected.scores.engagement / 100,
        expectedReach: Math.round(selected.scores.overall * 100),
        expectedEngagement: selected.scores.engagement,
        generatedBy: 'quality_pipeline',
        platforms,
        optimalPostingTime: optimalTime,
        mediaGuidance,
        qualityScores: selected.scores,
        variants,
        translations,
      };
    } catch (error) {
      logger.error('Enhanced content generation failed, falling back:', error);
      return this.generateSocialContent(userId, request);
    }
  }

  /**
   * Generate content with A/B testing variants
   * Returns multiple content options for split testing
   */
  async generateABTestVariants(
    userId: string,
    request: ContentGenerationRequest,
    variantCount: number = 3
  ): Promise<{ variants: ContentVariant[]; recommended: ContentVariant | null }> {
    const primaryPlatform = (request.platforms || ['instagram'])[0];
    
    const { selected, variants } = await contentQualityPipeline.generateAndSelect(
      userId,
      {
        topic: request.topic || 'new music',
        objective: request.objective || 'engagement',
        platform: primaryPlatform,
        tone: request.tone,
        genre: request.genre,
      },
      variantCount,
      50
    );

    return { variants, recommended: selected };
  }

  /**
   * Generate multilingual content for global reach
   */
  async generateMultilingualContent(
    userId: string,
    request: ContentGenerationRequest,
    languages: string[]
  ): Promise<{ primary: GeneratedContent; translations: TranslatedContent[] }> {
    const primary = await this.generateEnhancedContent(userId, request);
    
    const translations = await aiTranslationService.translateContent({
      content: primary.body,
      headline: primary.headline,
      hashtags: primary.hashtags,
      targetLanguages: languages,
      preserveTone: true,
    });

    return { primary, translations };
  }

  /**
   * Get trending topics and hashtags for a platform
   */
  async getTrendingForPlatform(
    platform: string,
    genre?: string
  ): Promise<{ topics: any[]; hashtags: any[] }> {
    const [topics, hashtags] = await Promise.all([
      dynamicTrendsService.getTrendingTopics(platform, genre),
      dynamicTrendsService.getOptimizedHashtags(platform, genre, undefined, 15),
    ]);

    return { topics, hashtags };
  }

  /**
   * Generate content using Social Media Autopilot AI (legacy method)
   */
  async generateSocialContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const ai = await this.getSocialAI(userId);

    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';

    const topic = request.topic || 'new music release';
    const tone = request.tone || 'inspirational';
    const platforms = request.platforms || ['instagram', 'facebook', 'twitter'];

    let headline = '';
    let body = '';
    let callToAction = '';
    let aiHashtags: string[] | null = null;

    if (await pythonAIService.isAvailable()) {
      try {
        const goalMap: Record<string, string> = {
          awareness: 'growth', engagement: 'engagement', conversions: 'conversion', viral: 'growth',
        };
        const aiResult = await pythonAIService.generateContent(
          platforms[0], topic, tone, goalMap[request.objective || 'engagement'] || 'growth', true
        );
        if (aiResult.success && aiResult.data && aiResult.data.hook && aiResult.data.body && aiResult.data.cta) {
          headline = aiResult.data.hook;
          body = aiResult.data.body;
          callToAction = aiResult.data.cta;
          aiHashtags = aiResult.data.hashtags;
        }
      } catch (err) {
        logger.warn('[AutoPost] Python AI failed, using templates:', err);
      }
    }

    if (!headline) {
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
    }

    const hashtags = request.includeHashtags !== false
      ? (aiHashtags || this.generateHashtags(topic, platforms))
      : [];

    const now = new Date();
    const optimalHour = this.getOptimalPostingHour(platforms);
    const optimalTime = new Date(now);
    optimalTime.setHours(optimalHour, 0, 0, 0);
    if (optimalTime < now) {
      optimalTime.setDate(optimalTime.getDate() + 1);
    }

    const mediaType = this.normalizeMediaType(request.mediaType || 'image');
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

    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';

    const topic = request.topic || 'new music';
    const platforms = request.platforms || ['instagram', 'tiktok', 'youtube', 'facebook'];

    let headline = '';
    let body = '';
    let hashtags: string[] = [];
    let callToAction = 'Share with someone who needs to hear this!';

    if (await pythonAIService.isAvailable()) {
      try {
        const aiResult = await pythonAIService.generateContent(
          platforms[0], topic, request.tone || 'energetic', 'growth', true
        );
        if (aiResult.success && aiResult.data && aiResult.data.hook && aiResult.data.body && aiResult.data.cta) {
          headline = aiResult.data.hook;
          body = aiResult.data.body;
          callToAction = aiResult.data.cta;
          hashtags = aiResult.data.hashtags || [];
        }
      } catch (err) {
        logger.warn('[AutoPost] Python AI failed for viral content:', err);
      }
    }

    if (!headline) {
      headline = this.generateViralHeadline(artistName, topic, request.tone || 'inspirational');
      body = this.generateViralBody(artistName, topic, request.tone || 'inspirational');
      hashtags = this.generateViralHashtags(topic, platforms);
    }

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
          return `Create SHORT, attention-grabbing video for ${topic} (15-60 seconds) using Video Studio. Hook viewers in first 3 seconds. Templates: Social Teaser (quick announcement), Quote Card (lyric highlight). Features: Audio visualizers (spectrum/particle), 13 GLSL shaders (bloom, glitch, particles), karaoke-style lyrics. Format: 9:16 vertical for TikTok/Reels/Shorts. Export: 1080p at 30fps.`;
        }
        return `Create engaging video for ${topic} (30-90 seconds) using Video Studio. Templates: Release Promo (new music), Lyric Video (animated lyrics), Audio Visualizer (reactive graphics). Features: WebGL2 render engine, 4 visualizer types, text animation with glow/gradient. Format: 9:16 vertical or 16:9 horizontal. Export: 720p/1080p/4K at 24/30/60fps.`;
      
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
