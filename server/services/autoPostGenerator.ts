import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from './aiModelManager.js';
import { autoPostingService, type PostContent } from './autoPostingService.js';
import { contentQualityPipeline, type ContentVariant, type ContentScores } from './contentQualityPipeline';
import { contentQualityGate } from './contentQualityGate.js';
import { dynamicTrendsService } from './dynamicTrendsService';
import { type TranslatedContent } from './aiTranslationService';
import { MaxCoreAIClient } from './maxcoreClient.js';
import { veoMusicService } from './veoMusicService.js';

async function translateViaMaxCore(
  content: string,
  headline: string | undefined,
  hashtags: string[],
  targetLanguages: string[],
  platform?: string
): Promise<TranslatedContent[]> {
  const results: TranslatedContent[] = [];
  for (const lang of targetLanguages) {
    const mcResult = await MaxCoreAIClient.generate<{
      caption?: string; hook?: string; body?: string; cta?: string;
      content?: string; text?: string;
      headline?: string; hashtags?: string[]; confidence?: number;
    }>('/api/generate/content', {
      topic: content,
      platform: platform || 'instagram',
      tone: 'authentic',
      extra_context: `Translate and culturally adapt the following music social media post to ${lang}. Maintain the artist's voice, energy, and promotional intent. Adapt hashtags for ${lang}-speaking audiences where appropriate. Return the translated post content.`,
    });

    const translatedBody = mcResult?.caption || mcResult?.content || mcResult?.body || mcResult?.text || content;
    const translatedHeadline = mcResult?.headline || headline;
    const translatedHashtags: string[] = (mcResult?.hashtags && mcResult.hashtags.length > 0)
      ? mcResult.hashtags
      : hashtags;

    results.push({
      language: lang,
      languageCode: lang.toLowerCase().slice(0, 2),
      content: translatedBody,
      headline: translatedHeadline,
      hashtags: translatedHashtags,
      culturalNotes: [],
      confidence: 0.9,
    });
  }
  return results;
}

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
   * Get Advertising Autopilot AI v3.0 for user (per-user isolated)
   * Uses aiModelManager to prevent cross-tenant data leakage.
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
      const gateResult = await contentQualityGate.run(userId, {
        topic: request.topic || 'new music',
        objective: request.objective || 'engagement',
        platform: primaryPlatform,
        tone: request.tone,
        targetAudience: request.targetAudience,
        genre: request.genre,
      });

      if (!gateResult) {
        throw new Error('Content quality gate: all variants below minimum threshold. Post skipped to protect quality.');
      }

      const selected = gateResult.winner;
      const variants = [selected, ...gateResult.rejectedVariants];

      if (gateResult.passedOnAttempt > 1) {
        logger.info(
          `[AutoPost] Quality gate: passed on attempt ${gateResult.passedOnAttempt}/${10}, ` +
          `tried ${gateResult.totalVariantsTried} variants, ` +
          `score=${selected.scores.overall.toFixed(1)}, threshold=${gateResult.thresholdUsed}, ` +
          `archived=${gateResult.storedKey ?? 'no'}`
        );
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
        translations = await translateViaMaxCore(
          selected.content,
          selected.headline,
          combinedHashtags,
          request.targetLanguages,
          primaryPlatform,
        );
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
      logger.warn({ err: error }, 'Enhanced content generation failed, falling back:');
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
    
    const translations = await translateViaMaxCore(
      primary.body,
      primary.headline,
      primary.hashtags,
      languages,
    );

    return { primary, translations };
  }

  /**
   * Get trending topics and hashtags for a platform
   */
  async getTrendingForPlatform(
    platform: string,
    genre?: string
  ): Promise<{ topics: unknown[]; hashtags: unknown[] }> {
    const [topics, hashtags] = await Promise.all([
      dynamicTrendsService.getTrendingTopics(platform, genre),
      dynamicTrendsService.getOptimizedHashtags(platform, genre, undefined, 15),
    ]);

    return { topics, hashtags };
  }

  /**
   * Generate content using MaxCore (social autopilot path).
   * MaxCore is always available — no local fallbacks needed.
   */
  async generateSocialContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';
    const topic    = request.topic    || 'new music release';
    const tone     = request.tone     || 'inspirational';
    const platforms = request.platforms || ['instagram', 'facebook', 'twitter'];

    const mc = await MaxCoreAIClient.generate<{
      caption?: string; hook?: string; body?: string; cta?: string; hashtags?: string[];
    }>('/api/generate/content', {
      topic,
      platform:    platforms[0],
      tone,
      artist_name: artistName,
    });

    if (!mc?.caption && !mc?.hook) {
      throw new Error('[AutoPost] MaxCore returned null for social content generation');
    }

    const headline     = mc.hook ?? mc.caption?.split('\n')[0] ?? '';
    const body         = mc.caption ?? [mc.hook, mc.body, mc.cta].filter(Boolean).join('\n\n');
    const callToAction = mc.cta ?? 'Check it out!';
    const hashtags     = request.includeHashtags !== false
      ? (mc.hashtags?.length ? mc.hashtags : this.generateHashtags(topic, platforms))
      : [];

    const now = new Date();
    const optimalHour = this.getOptimalPostingHour(platforms);
    const optimalTime = new Date(now);
    optimalTime.setHours(optimalHour, 0, 0, 0);
    if (optimalTime < now) optimalTime.setDate(optimalTime.getDate() + 1);

    const mediaType    = this.normalizeMediaType(request.mediaType || 'image');
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
   * Generate content using MaxCore (advertising autopilot path).
   * MaxCore is always available — no local fallbacks needed.
   */
  async generateViralContent(
    userId: string,
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    const ai = await this.getAdvertisingAI(userId);

    const user = await storage.getUserById(userId);
    const artistName = user?.firstName || 'Artist';
    const topic     = request.topic || 'new music';
    const platforms = request.platforms || ['instagram', 'tiktok', 'youtube', 'facebook'];

    const mc = await MaxCoreAIClient.generate<{
      caption?: string; hook?: string; body?: string; cta?: string; hashtags?: string[];
    }>('/api/generate/content', {
      topic,
      platform:    platforms[0],
      tone:        request.tone || 'energetic',
      artist_name: artistName,
    });

    if (!mc?.caption && !mc?.hook) {
      throw new Error('[AutoPost] MaxCore returned null for viral content generation');
    }

    const headline     = mc.hook ?? mc.caption?.split('\n')[0] ?? '';
    const body         = mc.caption ?? [mc.hook, mc.body, mc.cta].filter(Boolean).join('\n\n');
    const callToAction = mc.cta ?? 'Share with someone who needs to hear this!';
    const hashtags     = mc.hashtags ?? [];

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
  async generateVeoVideoForContent(
    content: GeneratedContent,
    trackInfo?: { title: string; artist: string; mood?: string; story?: string; lyrics?: string },
  ): Promise<string[]> {
    if (content.mediaType !== 'video' || !trackInfo) return [];

    try {
      const result = await veoMusicService.generateCampaign({
        title: trackInfo.title,
        artist: trackInfo.artist,
        mood: trackInfo.mood || 'energetic',
        story: trackInfo.story || content.headline,
        lyrics: trackInfo.lyrics,
        primary_platforms: content.platforms,
      });

      if (result.success && result.campaign) {
        const mediaUrls = result.campaign.assets.map(a => a.video_url);
        logger.info(`[VeoMusic] Generated ${mediaUrls.length} video assets for auto-post`);
        return mediaUrls;
      }
    } catch (err) {
      logger.warn('[VeoMusic] Veo campaign generation failed for auto-post, falling back to standard video guidance');
    }

    return [];
  }

  async generateAndPostSocial(
    userId: string,
    request: ContentGenerationRequest,
    scheduleOptimal: boolean = true,
    trackInfo?: { title: string; artist: string; mood?: string; story?: string; lyrics?: string },
  ): Promise<{
    content: GeneratedContent;
    posted?: boolean;
    scheduled?: boolean;
    results?: Record<string, unknown>;
    veoAssets?: string[];
  }> {
    const content = await this.generateEnhancedContent(userId, request);

    logger.info(`Generated social content for user ${userId}: "${content.headline}" (score=${content.qualityScores?.overall?.toFixed(1) ?? 'N/A'})`);

    let veoAssets: string[] = [];
    if (content.mediaType === 'video' && trackInfo) {
      veoAssets = await this.generateVeoVideoForContent(content, trackInfo);
    }

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
        veoAssets,
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
        veoAssets,
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
    results?: Record<string, unknown>;
  }> {
    const content = await this.generateEnhancedContent(userId, {
      ...request,
      objective: 'viral',
    });

    logger.info(`Generated viral content for user ${userId}: "${content.headline}" (score=${content.qualityScores?.overall?.toFixed(1) ?? 'N/A'})`);

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
          return `Create SHORT, attention-grabbing video for ${topic} (15-60 seconds). Two options: (1) Video Studio — templates (Social Teaser, Quote Card), audio visualizers (spectrum/particle), 13 GLSL shaders. (2) Veo Music AI Campaign — auto-generates platform-optimized video from your track + BoostSheet. Use /api/social/veo-campaign for AI-generated multi-platform videos (TikTok hooks, YouTube full videos, Spotify Canvas loops). Format: 9:16 vertical for TikTok/Reels/Shorts. Export: 1080p at 30fps.`;
        }
        return `Create engaging video for ${topic} (30-90 seconds). Two options: (1) Video Studio — templates (Release Promo, Lyric Video, Audio Visualizer), WebGL2 engine. (2) Veo Music AI Campaign — generates platform-specific videos automatically from your music + mood + story. Use /api/social/veo-campaign for full multi-platform campaigns or /api/social/veo-campaign/single for one platform. Supports: TikTok (12s hooks), YouTube (3min full), Instagram (30s reels), Spotify Canvas (8s loops), Shorts, Twitter, Facebook.`;
      
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
