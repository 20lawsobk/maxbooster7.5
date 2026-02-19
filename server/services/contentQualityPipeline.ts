import { logger } from '../logger.js';
import { db } from '../db';
import { userBrandVoices, autopilotPreferences } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { aiService } from './aiService';
import { advancedSocialAIService, type AdvancedContentRequest, type ContentScoring as AdvancedScoring } from './advancedSocialAIService.js';
import { pythonAIService } from './pythonAIService.js';

export interface ContentVariant {
  id: string;
  content: string;
  headline: string;
  hashtags: string[];
  callToAction: string;
  scores: ContentScores;
  platformOptimizations: PlatformOptimization;
}

export interface ContentScores {
  overall: number;
  engagement: number;
  clarity: number;
  sentiment: number;
  brandAlignment: number;
  hookStrength: number;
  callToActionEffectiveness: number;
}

export interface PlatformOptimization {
  platform: string;
  characterCount: number;
  maxCharacters: number;
  hashtagCount: number;
  optimalHashtags: number;
  emojiCount: number;
  optimalEmojis: number;
  isValid: boolean;
  issues: string[];
}

export interface ContentContext {
  userId: string;
  artistName: string;
  genre?: string;
  topic: string;
  objective: 'awareness' | 'engagement' | 'conversions' | 'viral';
  platform: string;
  tone?: string;
  targetAudience?: string;
  brandVoice?: BrandVoiceData;
  recentPerformance?: RecentPerformance;
  avoidTopics?: string[];
  preferredHashtags?: string[];
}

export interface BrandVoiceData {
  tone: 'formal' | 'casual' | 'mixed';
  emojiUsage: 'none' | 'light' | 'moderate' | 'heavy';
  hashtagFrequency: number;
  avgSentenceLength: number;
  vocabularyComplexity: 'simple' | 'moderate' | 'advanced';
  commonPhrases: string[];
}

export interface RecentPerformance {
  avgEngagementRate: number;
  topPerformingHashtags: string[];
  topPerformingTopics: string[];
  bestPostingTimes: { day: number; hour: number }[];
}

const PLATFORM_CONSTRAINTS: Record<string, {
  maxCharacters: number;
  optimalHashtags: { min: number; max: number };
  optimalEmojis: { min: number; max: number };
  features: string[];
}> = {
  twitter: {
    maxCharacters: 280,
    optimalHashtags: { min: 1, max: 3 },
    optimalEmojis: { min: 0, max: 2 },
    features: ['threads', 'polls', 'mentions'],
  },
  instagram: {
    maxCharacters: 2200,
    optimalHashtags: { min: 5, max: 15 },
    optimalEmojis: { min: 2, max: 5 },
    features: ['carousels', 'reels', 'stories', 'shoppable'],
  },
  facebook: {
    maxCharacters: 63206,
    optimalHashtags: { min: 1, max: 3 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['events', 'groups', 'live', 'stories'],
  },
  tiktok: {
    maxCharacters: 2200,
    optimalHashtags: { min: 3, max: 5 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['duets', 'stitches', 'sounds', 'effects'],
  },
  linkedin: {
    maxCharacters: 3000,
    optimalHashtags: { min: 3, max: 5 },
    optimalEmojis: { min: 0, max: 2 },
    features: ['articles', 'newsletters', 'polls'],
  },
  youtube: {
    maxCharacters: 5000,
    optimalHashtags: { min: 3, max: 15 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['shorts', 'community', 'premiere'],
  },
};

const HOOK_PATTERNS = [
  /^(🔥|💥|⚡|🚀|✨|🎵|🎶)/,
  /^(Breaking|NEW|Just dropped|Finally|Here's|This is|You won't believe)/i,
  /\?$/,
  /^[A-Z]{2,}/,
];

const CTA_PATTERNS = [
  /(check it out|listen now|stream now|watch now|link in bio|tap the link)/i,
  /(share|comment|tag|follow|subscribe|like)/i,
  /(don't miss|limited time|exclusive|first to hear)/i,
];

class ContentQualityPipeline {
  async buildContext(userId: string, baseContext: Partial<ContentContext>): Promise<ContentContext> {
    try {
      const [brandVoiceResult] = await db
        .select()
        .from(userBrandVoices)
        .where(eq(userBrandVoices.userId, userId))
        .limit(1);

      const [preferencesResult] = await db
        .select()
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1);

      const brandVoice = brandVoiceResult?.voiceProfile as BrandVoiceData | undefined;

      return {
        userId,
        artistName: preferencesResult?.artistName || baseContext.artistName || 'Artist',
        genre: preferencesResult?.genre || baseContext.genre,
        topic: baseContext.topic || 'new music',
        objective: baseContext.objective || 'engagement',
        platform: baseContext.platform || 'instagram',
        tone: preferencesResult?.contentTone || baseContext.tone || 'casual',
        targetAudience: baseContext.targetAudience,
        brandVoice,
        avoidTopics: (preferencesResult?.avoidTopics as string[]) || [],
        preferredHashtags: (preferencesResult?.preferredHashtags as string[]) || [],
      };
    } catch (error) {
      logger.error('Error building content context:', error);
      return {
        userId,
        artistName: baseContext.artistName || 'Artist',
        topic: baseContext.topic || 'new music',
        objective: baseContext.objective || 'engagement',
        platform: baseContext.platform || 'instagram',
      };
    }
  }

  async generateVariants(context: ContentContext, count: number = 3): Promise<ContentVariant[]> {
    const variants: ContentVariant[] = [];
    const strategies = this.getGenerationStrategies(context.objective);

    for (let i = 0; i < count; i++) {
      const strategy = strategies[i % strategies.length];
      const variant = await this.generateSingleVariant(context, strategy, i);
      variants.push(variant);
    }

    return variants.sort((a, b) => b.scores.overall - a.scores.overall);
  }

  private getGenerationStrategies(objective: string): string[] {
    const strategies: Record<string, string[]> = {
      awareness: ['storytelling', 'announcement', 'teaser'],
      engagement: ['question', 'poll-style', 'behind-the-scenes'],
      conversions: ['urgency', 'social-proof', 'benefit-focused'],
      viral: ['controversial', 'emotional', 'relatable'],
    };
    return strategies[objective] || strategies.engagement;
  }

  private async generateSingleVariant(
    context: ContentContext,
    strategy: string,
    index: number
  ): Promise<ContentVariant> {
    let headline: string;
    let body: string;
    let cta: string;
    let hashtags: string[];

    let usedAI = false;
    if (await pythonAIService.isAvailable()) {
      try {
        const goalMap: Record<string, string> = {
          awareness: 'growth', engagement: 'engagement', conversions: 'conversion', viral: 'growth',
        };
        const aiResult = await pythonAIService.generateContent(
          context.platform, context.topic, context.tone || 'energetic',
          goalMap[context.objective] || 'growth', true
        );
        if (aiResult.success && aiResult.data && aiResult.data.hook && aiResult.data.body && aiResult.data.cta) {
          headline = aiResult.data.hook;
          body = aiResult.data.body;
          cta = aiResult.data.cta;
          hashtags = aiResult.data.hashtags || this.generateOptimizedHashtags(context);
          usedAI = true;
        }
      } catch (err) {
        logger.warn('[ContentQuality] Python AI failed for variant, using templates:', err);
      }
    }

    if (!usedAI) {
      const generated = this.generateContentByStrategy(context, strategy);
      headline = generated.headline;
      body = generated.body;
      cta = generated.cta;
      hashtags = this.generateOptimizedHashtags(context);
    }

    const fullContent = `${headline!}\n\n${body!}`;
    const platformOpt = this.validatePlatformConstraints(fullContent, hashtags!, context.platform);
    const scores = this.scoreContent(fullContent, headline!, cta!, context, platformOpt);

    return {
      id: `variant_${index}_${Date.now()}`,
      content: body!,
      headline: headline!,
      hashtags: hashtags!,
      callToAction: cta!,
      scores,
      platformOptimizations: platformOpt,
    };
  }

  private generateContentByStrategy(
    context: ContentContext,
    strategy: string
  ): { headline: string; body: string; cta: string } {
    const { artistName, topic, objective, tone, genre } = context;
    const genreTag = genre ? ` #${genre.replace(/\s+/g, '')}` : '';

    const templates: Record<string, Record<string, { headline: string; body: string; cta: string }>> = {
      awareness: {
        storytelling: {
          headline: `🎵 The story behind "${topic}"`,
          body: `Every song has a story. "${topic}" came from a place of pure ${tone === 'casual' ? 'vibes' : 'inspiration'}. I poured months of work into this, and today I finally get to share it with you.${genreTag}`,
          cta: 'Listen and let me know if you feel it too!',
        },
        announcement: {
          headline: `📢 ${artistName} - ${topic} is officially HERE`,
          body: `The wait is over! "${topic}" just dropped on all platforms. This one's special - it's everything I've been working toward. Thank you for being on this journey with me.${genreTag}`,
          cta: 'Stream it now - link in bio!',
        },
        teaser: {
          headline: `Something big is coming... 👀`,
          body: `I've been keeping this quiet, but "${topic}" drops soon and I can't contain my excitement. ${artistName} has never done anything like this before.${genreTag}`,
          cta: 'Stay tuned - you don\'t want to miss this!',
        },
      },
      engagement: {
        question: {
          headline: `Quick question for you all... 🤔`,
          body: `What's the first thing you look for in a new track? The beat, the lyrics, or the vibe? I'm curious because "${topic}" has all three, and I want to know what hits first for you.${genreTag}`,
          cta: 'Drop your answer in the comments!',
        },
        'poll-style': {
          headline: `Help me decide! 🎯`,
          body: `Working on the visuals for "${topic}" and I'm stuck between two concepts. Should I go moody and cinematic, or bright and energetic? Your vote matters!${genreTag}`,
          cta: 'Vote below - moody or bright?',
        },
        'behind-the-scenes': {
          headline: `Studio diaries 🎧`,
          body: `Here's something you don't usually see - the raw creation process for "${topic}". 47 takes, 3 rewrites, and one moment where everything just clicked. That's what you're hearing in the final version.${genreTag}`,
          cta: 'Want more BTS content like this?',
        },
      },
      conversions: {
        urgency: {
          headline: `⏰ "${topic}" is LIVE right now`,
          body: `This is it - "${topic}" by ${artistName} is officially streaming everywhere. The first 24 hours are crucial, and your support means everything. Every stream, every save, every share counts.${genreTag}`,
          cta: 'Stream now - let\'s make this one count!',
        },
        'social-proof': {
          headline: `🔥 "${topic}" is catching fire`,
          body: `The response to "${topic}" has been incredible. Seeing all your stories, hearing how it's hitting different - this is why I make music. Join the thousands who are already playing it on repeat.${genreTag}`,
          cta: 'Don\'t miss what everyone\'s talking about!',
        },
        'benefit-focused': {
          headline: `Need that perfect ${genre || 'vibe'} track?`,
          body: `"${topic}" is that song you add to every playlist. Whether you're working out, driving, or just vibing, this track elevates the moment. ${artistName} made this one for YOU.${genreTag}`,
          cta: 'Add it to your playlist now!',
        },
      },
      viral: {
        controversial: {
          headline: `Unpopular opinion... 💭`,
          body: `"${topic}" breaks every rule in the ${genre || 'music'} playbook - and that's exactly why it works. Some people won't get it, and that's okay. This one's for the ones who do.${genreTag}`,
          cta: 'Agree or disagree? Let me know!',
        },
        emotional: {
          headline: `This song saved my life 💔`,
          body: `I don't usually share this, but "${topic}" came from my darkest moment. Writing it was therapy. If you're going through something, I hope this reaches you at the right time.${genreTag}`,
          cta: 'Share if this resonates with someone you know.',
        },
        relatable: {
          headline: `POV: It's 2 AM and you can't stop replaying "${topic}" 😅`,
          body: `No one asked for this much replay value but ${artistName} delivered anyway. Sorry not sorry for the earworm. You've been warned.${genreTag}`,
          cta: 'Tag someone who needs this chaos!',
        },
      },
    };

    const objectiveTemplates = templates[objective] || templates.engagement;
    const selectedTemplate = objectiveTemplates[strategy] || Object.values(objectiveTemplates)[0];

    return selectedTemplate;
  }

  private generateOptimizedHashtags(context: ContentContext): string[] {
    const { platform, genre, objective, preferredHashtags = [] } = context;
    const constraints = PLATFORM_CONSTRAINTS[platform] || PLATFORM_CONSTRAINTS.instagram;

    const baseHashtags: string[] = [];

    if (genre) {
      baseHashtags.push(`#${genre.replace(/\s+/g, '')}`);
      baseHashtags.push(`#${genre.replace(/\s+/g, '')}Music`);
    }

    const objectiveHashtags: Record<string, string[]> = {
      awareness: ['#NewMusic', '#MusicRelease', '#OutNow', '#NewArtist', '#Discover'],
      engagement: ['#MusicCommunity', '#MusicLovers', '#ShareYourThoughts', '#MusicTalk'],
      conversions: ['#StreamNow', '#LinkInBio', '#MusicStreaming', '#SpotifyPlaylist', '#AppleMusic'],
      viral: ['#Viral', '#Trending', '#ForYou', '#FYP', '#MusicViral'],
    };

    baseHashtags.push(...(objectiveHashtags[objective] || objectiveHashtags.engagement));

    const platformHashtags: Record<string, string[]> = {
      tiktok: ['#FYP', '#ForYou', '#TikTokMusic', '#MusicTok'],
      instagram: ['#InstaMusic', '#MusicOfInstagram', '#Reels', '#Explore'],
      twitter: ['#NowPlaying', '#MusicTwitter'],
      youtube: ['#YouTubeMusic', '#Shorts', '#Subscribe'],
      facebook: ['#FacebookMusic', '#MusicVideo'],
      linkedin: ['#MusicIndustry', '#IndependentArtist', '#MusicBusiness'],
    };

    baseHashtags.push(...(platformHashtags[platform] || []));
    baseHashtags.push(...preferredHashtags.slice(0, 3));

    const uniqueHashtags = [...new Set(baseHashtags)];
    return uniqueHashtags.slice(0, constraints.optimalHashtags.max);
  }

  validatePlatformConstraints(
    content: string,
    hashtags: string[],
    platform: string
  ): PlatformOptimization {
    const constraints = PLATFORM_CONSTRAINTS[platform] || PLATFORM_CONSTRAINTS.instagram;
    const issues: string[] = [];

    const characterCount = content.length;
    const hashtagCount = hashtags.length;
    const emojiRegex = new RegExp('[\\u{1F300}-\\u{1F9FF}]', 'gu');
    const emojiCount = (content.match(emojiRegex) || []).length;

    if (characterCount > constraints.maxCharacters) {
      issues.push(`Content exceeds ${platform} limit (${characterCount}/${constraints.maxCharacters})`);
    }

    if (hashtagCount < constraints.optimalHashtags.min) {
      issues.push(`Too few hashtags (${hashtagCount} < ${constraints.optimalHashtags.min})`);
    } else if (hashtagCount > constraints.optimalHashtags.max) {
      issues.push(`Too many hashtags (${hashtagCount} > ${constraints.optimalHashtags.max})`);
    }

    if (emojiCount < constraints.optimalEmojis.min) {
      issues.push(`Consider adding emojis for ${platform}`);
    } else if (emojiCount > constraints.optimalEmojis.max) {
      issues.push(`Too many emojis for ${platform} (${emojiCount} > ${constraints.optimalEmojis.max})`);
    }

    return {
      platform,
      characterCount,
      maxCharacters: constraints.maxCharacters,
      hashtagCount,
      optimalHashtags: constraints.optimalHashtags.max,
      emojiCount,
      optimalEmojis: constraints.optimalEmojis.max,
      isValid: issues.length === 0,
      issues,
    };
  }

  scoreContent(
    content: string,
    headline: string,
    cta: string,
    context: ContentContext,
    platformOpt: PlatformOptimization
  ): ContentScores {
    const hookStrength = this.scoreHook(headline);
    const ctaEffectiveness = this.scoreCTA(cta);
    const clarity = this.scoreClarity(content);
    const sentiment = this.scoreSentiment(content, context.objective);
    const brandAlignment = this.scoreBrandAlignment(content, context);
    const engagement = this.predictEngagement(content, headline, context);

    const weights = {
      engagement: 0.25,
      clarity: 0.15,
      sentiment: 0.15,
      brandAlignment: 0.15,
      hookStrength: 0.15,
      callToActionEffectiveness: 0.15,
    };

    const platformPenalty = platformOpt.isValid ? 0 : 15;

    const overall = Math.max(0, Math.min(100,
      engagement * weights.engagement +
      clarity * weights.clarity +
      sentiment * weights.sentiment +
      brandAlignment * weights.brandAlignment +
      hookStrength * weights.hookStrength +
      ctaEffectiveness * weights.callToActionEffectiveness -
      platformPenalty
    ));

    return {
      overall,
      engagement,
      clarity,
      sentiment,
      brandAlignment,
      hookStrength,
      callToActionEffectiveness: ctaEffectiveness,
    };
  }

  private scoreHook(headline: string): number {
    let score = 50;

    for (const pattern of HOOK_PATTERNS) {
      if (pattern.test(headline)) {
        score += 15;
      }
    }

    if (headline.length > 10 && headline.length < 60) score += 10;
    if (headline.includes('...') || headline.includes('👀')) score += 5;

    return Math.min(100, score);
  }

  private scoreCTA(cta: string): number {
    let score = 40;

    for (const pattern of CTA_PATTERNS) {
      if (pattern.test(cta)) {
        score += 20;
      }
    }

    if (cta.length > 10 && cta.length < 50) score += 10;
    if (cta.includes('!')) score += 5;

    return Math.min(100, score);
  }

  private scoreClarity(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    const avgLength = content.length / Math.max(sentences.length, 1);

    let score = 70;

    if (avgLength > 20 && avgLength < 100) score += 15;
    if (sentences.length >= 2 && sentences.length <= 5) score += 10;

    const complexWords = content.match(/\b\w{10,}\b/g) || [];
    if (complexWords.length < 3) score += 5;

    return Math.min(100, score);
  }

  private scoreSentiment(content: string, objective: string): number {
    const positiveWords = ['love', 'amazing', 'incredible', 'excited', 'beautiful', 'perfect', 'best', 'fire', 'vibes'];
    const negativeWords = ['hate', 'worst', 'terrible', 'boring', 'bad', 'disappointing'];
    const urgentWords = ['now', 'today', 'limited', 'exclusive', 'first', 'don\'t miss'];
    const emotionalWords = ['heart', 'soul', 'life', 'journey', 'saved', 'feel', 'moment'];

    const lower = content.toLowerCase();
    let score = 60;

    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    const urgentCount = urgentWords.filter(w => lower.includes(w)).length;
    const emotionalCount = emotionalWords.filter(w => lower.includes(w)).length;

    score += positiveCount * 5;
    score -= negativeCount * 10;

    if (objective === 'conversions' && urgentCount > 0) score += urgentCount * 5;
    if (objective === 'viral' && emotionalCount > 0) score += emotionalCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  private scoreBrandAlignment(content: string, context: ContentContext): number {
    let score = 70;

    if (context.brandVoice) {
      const emojiRegex = new RegExp('[\\u{1F300}-\\u{1F9FF}]', 'gu');
      const emojiCount = (content.match(emojiRegex) || []).length;

      const expectedEmojis: Record<string, number> = {
        none: 0,
        light: 1,
        moderate: 3,
        heavy: 5,
      };

      const expected = expectedEmojis[context.brandVoice.emojiUsage] || 2;
      const emojiDiff = Math.abs(emojiCount - expected);
      score -= emojiDiff * 3;

      if (context.brandVoice.commonPhrases.some(phrase => 
        content.toLowerCase().includes(phrase.toLowerCase())
      )) {
        score += 10;
      }
    }

    if (context.avoidTopics?.some(topic => 
      content.toLowerCase().includes(topic.toLowerCase())
    )) {
      score -= 30;
    }

    return Math.max(0, Math.min(100, score));
  }

  private predictEngagement(content: string, headline: string, context: ContentContext): number {
    let score = 60;

    if (content.includes('?')) score += 10;
    if (content.match(/\btag\b|\bshare\b|\bcomment\b/i)) score += 8;
    if (headline.match(/^(🔥|💥|⚡|🚀)/)) score += 5;

    const engagementMultipliers: Record<string, number> = {
      awareness: 0.9,
      engagement: 1.1,
      conversions: 0.85,
      viral: 1.2,
    };

    score *= engagementMultipliers[context.objective] || 1;

    if (content.length > 50 && content.length < 300) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  async selectBestVariant(
    variants: ContentVariant[],
    minScore: number = 60
  ): Promise<ContentVariant | null> {
    const validVariants = variants.filter(v => 
      v.scores.overall >= minScore && v.platformOptimizations.isValid
    );

    if (validVariants.length === 0) {
      const best = variants.sort((a, b) => b.scores.overall - a.scores.overall)[0];
      if (best && best.scores.overall >= minScore * 0.8) {
        logger.warn(`Selected variant with platform issues: ${best.platformOptimizations.issues.join(', ')}`);
        return best;
      }
      return null;
    }

    return validVariants[0];
  }

  async generateAndSelect(
    userId: string,
    baseContext: Partial<ContentContext>,
    variantCount: number = 3,
    minScore: number = 60
  ): Promise<{ selected: ContentVariant | null; variants: ContentVariant[]; context: ContentContext }> {
    const context = await this.buildContext(userId, baseContext);
    const variants = await this.generateVariants(context, variantCount);
    const selected = await this.selectBestVariant(variants, minScore);

    logger.info(`Generated ${variants.length} variants, selected: ${selected?.id || 'none'} (score: ${selected?.scores.overall.toFixed(1) || 'N/A'})`);

    return { selected, variants, context };
  }

  /**
   * Generate content using Advanced Social AI (GPT-5.2 Level)
   * Provides deep semantic understanding, viral pattern analysis,
   * and multi-dimensional content scoring
   */
  async generateWithAdvancedAI(
    userId: string,
    baseContext: Partial<ContentContext>,
    variantCount: number = 3
  ): Promise<{
    selected: ContentVariant | null;
    variants: ContentVariant[];
    context: ContentContext;
    advancedInsights: {
      viralPotential: number;
      audienceResonance: number;
      optimalTiming: { day: number; hour: number };
      mediaRecommendation: string;
      improvements: string[];
    };
  }> {
    const context = await this.buildContext(userId, baseContext);
    
    try {
      const advancedRequest: AdvancedContentRequest = {
        userId,
        topic: context.topic,
        platforms: [context.platform],
        objective: context.objective,
        tone: context.tone as any,
        targetAudience: context.targetAudience,
        genre: context.genre,
        artistName: context.artistName,
        contentType: this.mapObjectiveToContentType(context.objective),
        includeHashtags: true,
        includeEmojis: true,
        variantCount,
      };

      const advancedResult = await advancedSocialAIService.generateAdvancedContent(advancedRequest);

      const variants: ContentVariant[] = advancedResult.variants.map((v, i) => ({
        id: v.id,
        content: v.content.split('\n\n')[1] || v.content,
        headline: v.headline,
        hashtags: v.hashtags,
        callToAction: v.cta,
        scores: {
          overall: v.predictedScore,
          engagement: advancedResult.scoring.engagement,
          clarity: advancedResult.scoring.clarity,
          sentiment: advancedResult.scoring.sentiment,
          brandAlignment: advancedResult.scoring.brandAlignment,
          hookStrength: advancedResult.scoring.hookStrength,
          callToActionEffectiveness: advancedResult.scoring.ctaEffectiveness,
        },
        platformOptimizations: {
          platform: context.platform,
          characterCount: v.content.length,
          maxCharacters: 2200,
          hashtagCount: v.hashtags.length,
          optimalHashtags: 10,
          emojiCount: 3,
          optimalEmojis: 3,
          isValid: true,
          issues: [],
        },
      }));

      variants.push({
        id: 'advanced_primary',
        content: advancedResult.primary.body,
        headline: advancedResult.primary.headline,
        hashtags: advancedResult.primary.hashtags,
        callToAction: advancedResult.primary.callToAction,
        scores: {
          overall: advancedResult.scoring.overall,
          engagement: advancedResult.scoring.engagement,
          clarity: advancedResult.scoring.clarity,
          sentiment: advancedResult.scoring.sentiment,
          brandAlignment: advancedResult.scoring.brandAlignment,
          hookStrength: advancedResult.scoring.hookStrength,
          callToActionEffectiveness: advancedResult.scoring.ctaEffectiveness,
        },
        platformOptimizations: {
          platform: context.platform,
          characterCount: advancedResult.primary.body.length,
          maxCharacters: 2200,
          hashtagCount: advancedResult.primary.hashtags.length,
          optimalHashtags: 10,
          emojiCount: advancedResult.primary.emojis.length,
          optimalEmojis: 3,
          isValid: true,
          issues: [],
        },
      });

      variants.sort((a, b) => b.scores.overall - a.scores.overall);
      const selected = variants[0] || null;

      logger.info(`[AdvancedAI] Generated ${variants.length} variants with GPT-5.2 level AI, best score: ${selected?.scores.overall.toFixed(1)}`);

      return {
        selected,
        variants,
        context,
        advancedInsights: {
          viralPotential: advancedResult.viralPotential.score,
          audienceResonance: advancedResult.audienceResonance.resonanceScore,
          optimalTiming: {
            day: advancedResult.optimalTiming.bestDays[0] || 3,
            hour: advancedResult.optimalTiming.bestHours[0] || 12,
          },
          mediaRecommendation: advancedResult.mediaGuidance.recommendedType,
          improvements: advancedResult.insights
            .filter(i => i.type === 'improvement')
            .map(i => i.message),
        },
      };
    } catch (error) {
      logger.error('[AdvancedAI] Error generating advanced content, falling back:', error);
      const variants = await this.generateVariants(context, variantCount);
      const selected = await this.selectBestVariant(variants, 50);
      
      return {
        selected,
        variants,
        context,
        advancedInsights: {
          viralPotential: 50,
          audienceResonance: 60,
          optimalTiming: { day: 3, hour: 12 },
          mediaRecommendation: 'image',
          improvements: [],
        },
      };
    }
  }

  private mapObjectiveToContentType(objective: string): 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling' {
    const mapping: Record<string, 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling'> = {
      awareness: 'announcement',
      engagement: 'engagement',
      conversions: 'promotional',
      viral: 'storytelling',
    };
    return mapping[objective] || 'announcement';
  }
}

export const contentQualityPipeline = new ContentQualityPipeline();
