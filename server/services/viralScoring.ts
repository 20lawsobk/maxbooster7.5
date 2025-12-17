import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import type { RedisClientType } from 'redis';
import { nanoid } from 'nanoid';

export interface ContentData {
  id?: string;
  caption: string;
  hashtags: string[];
  platform: 'tiktok' | 'instagram' | 'youtube' | 'twitter' | 'facebook' | 'linkedin';
  contentType: 'video' | 'image' | 'carousel' | 'text' | 'story' | 'reel';
  mediaUrl?: string;
  duration?: number;
  hasAudio?: boolean;
  musicGenre?: string;
  targetAudience?: {
    ageRange: string;
    interests: string[];
    location?: string;
  };
  scheduledTime?: Date;
  userId?: string;
}

export interface ViralScore {
  overall: number;
  factors: {
    hookStrength: number;
    emotionalResonance: number;
    trendAlignment: number;
    hashtagOptimization: number;
    visualAppeal: number;
    audioQuality: number;
  };
  platformScores: {
    tiktok: number;
    instagram: number;
    youtube: number;
    twitter: number;
  };
  recommendations: string[];
  confidence: number;
  predictedEngagement: {
    likes: { min: number; max: number };
    shares: { min: number; max: number };
    comments: { min: number; max: number };
  };
}

export interface Improvement {
  id: string;
  category: 'hook' | 'hashtags' | 'timing' | 'format' | 'content' | 'engagement';
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
  expectedImpact: number;
  implementation: string;
}

export interface VariantComparison {
  variants: Array<{
    id: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendedPlatform: string;
  }>;
  winner: string;
  reasoning: string;
  abTestRecommendation: {
    shouldTest: boolean;
    testDuration: number;
    sampleSize: number;
  };
}

interface TrendingTopic {
  topic: string;
  score: number;
  category: string;
  hashtags: string[];
}

interface ViralPattern {
  pattern: string;
  weight: number;
  platforms: string[];
  examples: string[];
}

class ViralScoringService {
  private readonly REDIS_TTL = 3600;
  private readonly CACHE_PREFIX = 'viral:';
  
  private trendingTopics: TrendingTopic[] = [];
  private viralPatterns: ViralPattern[] = [];
  private lastTrendUpdate: Date = new Date(0);
  
  private readonly hookPatterns = [
    { pattern: /^(you won't believe|this is why|the secret|how to|stop scrolling)/i, score: 85 },
    { pattern: /^(breaking|urgent|finally|here's why|unpopular opinion)/i, score: 80 },
    { pattern: /^(i was today years old|nobody talks about|the truth about)/i, score: 75 },
    { pattern: /^(pov:|when you|that feeling when|imagine)/i, score: 70 },
    { pattern: /\?$/, score: 65 },
    { pattern: /^[A-Z]{2,}/, score: 60 },
    { pattern: /🔥|💀|😭|🤯|⚡/, score: 55 },
  ];

  private readonly emotionalTriggers = [
    { keyword: 'amazing', weight: 8 },
    { keyword: 'shocking', weight: 9 },
    { keyword: 'heartwarming', weight: 7 },
    { keyword: 'inspiring', weight: 8 },
    { keyword: 'hilarious', weight: 7 },
    { keyword: 'mind-blowing', weight: 9 },
    { keyword: 'life-changing', weight: 8 },
    { keyword: 'unbelievable', weight: 8 },
    { keyword: 'secret', weight: 7 },
    { keyword: 'exclusive', weight: 6 },
    { keyword: 'finally', weight: 6 },
    { keyword: 'free', weight: 7 },
    { keyword: 'new', weight: 5 },
    { keyword: 'best', weight: 6 },
    { keyword: 'worst', weight: 7 },
    { keyword: 'never', weight: 6 },
    { keyword: 'always', weight: 5 },
  ];

  private readonly platformOptimalHashtags: Record<string, { min: number; max: number; niches: number }> = {
    tiktok: { min: 3, max: 5, niches: 2 },
    instagram: { min: 5, max: 15, niches: 5 },
    youtube: { min: 3, max: 8, niches: 3 },
    twitter: { min: 1, max: 3, niches: 1 },
    facebook: { min: 1, max: 3, niches: 1 },
    linkedin: { min: 3, max: 5, niches: 2 },
  };

  private readonly platformWeights: Record<string, Record<string, number>> = {
    tiktok: { hook: 0.3, trend: 0.25, audio: 0.2, engagement: 0.15, hashtags: 0.1 },
    instagram: { visual: 0.3, hashtags: 0.2, hook: 0.2, engagement: 0.15, trend: 0.15 },
    youtube: { hook: 0.25, content: 0.25, seo: 0.2, engagement: 0.15, trend: 0.15 },
    twitter: { hook: 0.35, trend: 0.25, engagement: 0.2, timing: 0.1, hashtags: 0.1 },
  };

  constructor() {
    this.initializeTrends();
    this.initializeViralPatterns();
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  private async initializeTrends(): Promise<void> {
    this.trendingTopics = [
      { topic: 'music production', score: 85, category: 'music', hashtags: ['#producer', '#beatmaker', '#musicproduction'] },
      { topic: 'artist tips', score: 80, category: 'education', hashtags: ['#artisttips', '#musicmarketing', '#indieartist'] },
      { topic: 'behind the scenes', score: 75, category: 'content', hashtags: ['#bts', '#studiolife', '#makingof'] },
      { topic: 'new release', score: 90, category: 'promotion', hashtags: ['#newmusic', '#outnow', '#newsingle'] },
      { topic: 'collaboration', score: 78, category: 'networking', hashtags: ['#collab', '#featuredartist', '#musiccollaboration'] },
    ];
    this.lastTrendUpdate = new Date();
    logger.info('✅ Viral scoring trends initialized');
  }

  private async initializeViralPatterns(): Promise<void> {
    this.viralPatterns = [
      { pattern: 'hook-story-cta', weight: 0.9, platforms: ['tiktok', 'instagram'], examples: ['Start with hook, tell story, end with CTA'] },
      { pattern: 'controversy-opinion', weight: 0.85, platforms: ['twitter', 'youtube'], examples: ['Unpopular opinion style content'] },
      { pattern: 'tutorial-quick', weight: 0.8, platforms: ['tiktok', 'youtube'], examples: ['Quick how-to guides'] },
      { pattern: 'emotional-journey', weight: 0.88, platforms: ['instagram', 'youtube'], examples: ['Transformation or journey content'] },
      { pattern: 'trend-participation', weight: 0.92, platforms: ['tiktok'], examples: ['Participating in trending challenges'] },
    ];
    logger.info('✅ Viral patterns initialized');
  }

  async scoreContent(content: ContentData): Promise<ViralScore> {
    const cacheKey = `${this.CACHE_PREFIX}score:${content.id || nanoid()}`;
    
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const factors = await this.analyzeFactors(content);
    const platformScores = this.calculatePlatformScores(content, factors);
    const recommendations = this.generateRecommendations(content, factors);
    
    const overall = this.calculateOverallScore(factors, content.platform);
    const confidence = this.calculateConfidence(content, factors);
    const predictedEngagement = this.predictEngagement(overall, content.platform);

    const result: ViralScore = {
      overall,
      factors,
      platformScores,
      recommendations,
      confidence,
      predictedEngagement,
    };

    if (redis) {
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(result));
    }

    logger.info(`📊 Viral score calculated: ${overall}/100 for ${content.platform}`, { contentId: content.id });
    return result;
  }

  private async analyzeFactors(content: ContentData): Promise<ViralScore['factors']> {
    const hookStrength = this.analyzeHookStrength(content.caption);
    const emotionalResonance = this.analyzeEmotionalResonance(content.caption);
    const trendAlignment = await this.analyzeTrendAlignment(content);
    const hashtagOptimization = this.analyzeHashtagOptimization(content.hashtags, content.platform);
    const visualAppeal = this.estimateVisualAppeal(content);
    const audioQuality = this.estimateAudioQuality(content);

    return {
      hookStrength,
      emotionalResonance,
      trendAlignment,
      hashtagOptimization,
      visualAppeal,
      audioQuality,
    };
  }

  private analyzeHookStrength(caption: string): number {
    if (!caption || caption.length === 0) return 20;

    let score = 40;
    const firstLine = caption.split('\n')[0];
    const first50Chars = caption.substring(0, 50);

    for (const { pattern, score: patternScore } of this.hookPatterns) {
      if (pattern.test(first50Chars)) {
        score = Math.max(score, patternScore);
      }
    }

    if (firstLine.length <= 50 && firstLine.length >= 20) {
      score += 5;
    }

    if (/\d/.test(first50Chars)) {
      score += 5;
    }

    if (first50Chars.includes('"') || first50Chars.includes("'")) {
      score += 3;
    }

    return Math.min(100, Math.max(0, score));
  }

  private analyzeEmotionalResonance(caption: string): number {
    if (!caption) return 30;

    const lowerCaption = caption.toLowerCase();
    let score = 35;
    let triggersFound = 0;

    for (const { keyword, weight } of this.emotionalTriggers) {
      if (lowerCaption.includes(keyword)) {
        score += weight;
        triggersFound++;
      }
    }

    const emojiCount = (caption.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount >= 1 && emojiCount <= 5) {
      score += 8;
    } else if (emojiCount > 5) {
      score += 4;
    }

    const exclamationCount = (caption.match(/!/g) || []).length;
    if (exclamationCount >= 1 && exclamationCount <= 3) {
      score += 5;
    }

    if (triggersFound >= 3) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private async analyzeTrendAlignment(content: ContentData): Promise<number> {
    let score = 40;
    const captionLower = content.caption.toLowerCase();
    const hashtagsLower = content.hashtags.map(h => h.toLowerCase());

    for (const trend of this.trendingTopics) {
      if (captionLower.includes(trend.topic.toLowerCase())) {
        score += trend.score * 0.3;
      }
      
      for (const trendHashtag of trend.hashtags) {
        if (hashtagsLower.includes(trendHashtag.toLowerCase())) {
          score += trend.score * 0.15;
        }
      }
    }

    if (content.musicGenre) {
      const musicTrends = this.trendingTopics.filter(t => t.category === 'music');
      if (musicTrends.length > 0) {
        score += 10;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  private analyzeHashtagOptimization(hashtags: string[], platform: string): number {
    const optimal = this.platformOptimalHashtags[platform] || { min: 3, max: 10, niches: 2 };
    let score = 50;

    if (hashtags.length >= optimal.min && hashtags.length <= optimal.max) {
      score += 25;
    } else if (hashtags.length < optimal.min) {
      score -= 15;
    } else if (hashtags.length > optimal.max) {
      score -= 10;
    }

    const nicheHashtags = hashtags.filter(h => {
      const lowH = h.toLowerCase();
      return lowH.includes('music') || lowH.includes('producer') || 
             lowH.includes('artist') || lowH.includes('beat');
    });
    
    if (nicheHashtags.length >= optimal.niches) {
      score += 15;
    }

    const popularHashtags = hashtags.filter(h => {
      const lowH = h.toLowerCase();
      return ['#fyp', '#viral', '#trending', '#foryou', '#explore'].includes(lowH);
    });
    
    if (popularHashtags.length >= 1 && popularHashtags.length <= 2) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private estimateVisualAppeal(content: ContentData): number {
    let score = 50;

    if (content.contentType === 'video' || content.contentType === 'reel') {
      score += 15;
    } else if (content.contentType === 'carousel') {
      score += 12;
    } else if (content.contentType === 'image') {
      score += 8;
    }

    if (content.mediaUrl) {
      score += 10;
    }

    if (content.duration) {
      if (content.platform === 'tiktok' && content.duration >= 15 && content.duration <= 60) {
        score += 15;
      } else if (content.platform === 'instagram' && content.duration >= 30 && content.duration <= 90) {
        score += 12;
      } else if (content.platform === 'youtube' && content.duration >= 480 && content.duration <= 900) {
        score += 15;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  private estimateAudioQuality(content: ContentData): number {
    let score = 45;

    if (content.hasAudio) {
      score += 20;
    }

    if (content.musicGenre) {
      score += 15;
      
      const trendingGenres = ['hip-hop', 'pop', 'r&b', 'electronic', 'afrobeats'];
      if (trendingGenres.includes(content.musicGenre.toLowerCase())) {
        score += 10;
      }
    }

    if (content.platform === 'tiktok' && content.hasAudio) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculatePlatformScores(content: ContentData, factors: ViralScore['factors']): ViralScore['platformScores'] {
    const calculateForPlatform = (platform: string): number => {
      const weights = this.platformWeights[platform] || {
        hook: 0.25, trend: 0.2, engagement: 0.2, hashtags: 0.15, visual: 0.2
      };

      let score = 0;
      score += (factors.hookStrength * (weights.hook || 0));
      score += (factors.trendAlignment * (weights.trend || 0));
      score += (factors.hashtagOptimization * (weights.hashtags || 0));
      score += (factors.visualAppeal * (weights.visual || 0));
      score += (factors.emotionalResonance * (weights.engagement || 0));
      score += (factors.audioQuality * (weights.audio || 0));

      if (platform === content.platform) {
        score += 5;
      }

      return Math.min(100, Math.max(0, Math.round(score)));
    };

    return {
      tiktok: calculateForPlatform('tiktok'),
      instagram: calculateForPlatform('instagram'),
      youtube: calculateForPlatform('youtube'),
      twitter: calculateForPlatform('twitter'),
    };
  }

  private calculateOverallScore(factors: ViralScore['factors'], platform: string): number {
    const weights = this.platformWeights[platform] || {
      hook: 0.2, trend: 0.2, engagement: 0.15, hashtags: 0.15, visual: 0.15, audio: 0.15
    };

    let score = 0;
    score += factors.hookStrength * (weights.hook || 0.2);
    score += factors.emotionalResonance * (weights.engagement || 0.15);
    score += factors.trendAlignment * (weights.trend || 0.2);
    score += factors.hashtagOptimization * (weights.hashtags || 0.15);
    score += factors.visualAppeal * (weights.visual || 0.15);
    score += factors.audioQuality * (weights.audio || 0.15);

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private calculateConfidence(content: ContentData, factors: ViralScore['factors']): number {
    let confidence = 0.5;

    if (content.caption && content.caption.length > 50) confidence += 0.1;
    if (content.hashtags.length >= 3) confidence += 0.1;
    if (content.mediaUrl) confidence += 0.1;
    if (content.targetAudience) confidence += 0.1;

    const avgFactor = Object.values(factors).reduce((a, b) => a + b, 0) / Object.values(factors).length;
    if (avgFactor > 60) confidence += 0.1;

    return Math.min(1, confidence);
  }

  private predictEngagement(overallScore: number, platform: string): ViralScore['predictedEngagement'] {
    const baseMultipliers: Record<string, { likes: number; shares: number; comments: number }> = {
      tiktok: { likes: 1000, shares: 100, comments: 50 },
      instagram: { likes: 500, shares: 50, comments: 30 },
      youtube: { likes: 200, shares: 20, comments: 40 },
      twitter: { likes: 100, shares: 50, comments: 20 },
    };

    const multiplier = baseMultipliers[platform] || baseMultipliers.instagram;
    const scoreMultiplier = overallScore / 50;
    const variance = 0.3;

    return {
      likes: {
        min: Math.round(multiplier.likes * scoreMultiplier * (1 - variance)),
        max: Math.round(multiplier.likes * scoreMultiplier * (1 + variance)),
      },
      shares: {
        min: Math.round(multiplier.shares * scoreMultiplier * (1 - variance)),
        max: Math.round(multiplier.shares * scoreMultiplier * (1 + variance)),
      },
      comments: {
        min: Math.round(multiplier.comments * scoreMultiplier * (1 - variance)),
        max: Math.round(multiplier.comments * scoreMultiplier * (1 + variance)),
      },
    };
  }

  private generateRecommendations(content: ContentData, factors: ViralScore['factors']): string[] {
    const recommendations: string[] = [];

    if (factors.hookStrength < 60) {
      recommendations.push('Start with a stronger hook - try "You won\'t believe..." or ask a compelling question');
    }

    if (factors.emotionalResonance < 50) {
      recommendations.push('Add more emotional triggers - words like "amazing", "secret", or "life-changing" can boost engagement');
    }

    if (factors.trendAlignment < 50) {
      recommendations.push('Incorporate trending topics or sounds to increase discoverability');
    }

    if (factors.hashtagOptimization < 60) {
      const optimal = this.platformOptimalHashtags[content.platform];
      recommendations.push(`Optimize hashtags: use ${optimal?.min}-${optimal?.max} hashtags mixing niche and popular ones`);
    }

    if (factors.visualAppeal < 60 && (content.contentType === 'video' || content.contentType === 'reel')) {
      recommendations.push('Improve visual quality - use better lighting and ensure first 3 seconds are captivating');
    }

    if (factors.audioQuality < 60 && content.platform === 'tiktok') {
      recommendations.push('Add trending audio or original music to boost algorithm performance');
    }

    if (recommendations.length === 0) {
      recommendations.push('Great content! Consider A/B testing different hooks for optimal performance');
    }

    return recommendations.slice(0, 5);
  }

  async predictViralPotential(content: ContentData): Promise<number> {
    const score = await this.scoreContent(content);
    return score.overall;
  }

  async suggestImprovements(content: ContentData): Promise<Improvement[]> {
    const score = await this.scoreContent(content);
    const improvements: Improvement[] = [];

    if (score.factors.hookStrength < 70) {
      improvements.push({
        id: nanoid(),
        category: 'hook',
        priority: score.factors.hookStrength < 50 ? 'high' : 'medium',
        suggestion: 'Rewrite your opening line to create immediate curiosity or FOMO',
        expectedImpact: 15 + Math.round((70 - score.factors.hookStrength) * 0.3),
        implementation: 'Try formats like "The #1 mistake artists make..." or "Nobody told you this about..."',
      });
    }

    if (score.factors.hashtagOptimization < 70) {
      improvements.push({
        id: nanoid(),
        category: 'hashtags',
        priority: 'medium',
        suggestion: 'Optimize your hashtag strategy for better reach',
        expectedImpact: 10 + Math.round((70 - score.factors.hashtagOptimization) * 0.2),
        implementation: 'Mix 2-3 high-reach hashtags with 3-5 niche hashtags relevant to your content',
      });
    }

    if (score.factors.trendAlignment < 60) {
      improvements.push({
        id: nanoid(),
        category: 'content',
        priority: score.factors.trendAlignment < 40 ? 'high' : 'medium',
        suggestion: 'Align your content with current trends',
        expectedImpact: 20,
        implementation: 'Research trending sounds, challenges, or topics in your niche and create relevant content',
      });
    }

    if (score.factors.emotionalResonance < 60) {
      improvements.push({
        id: nanoid(),
        category: 'engagement',
        priority: 'medium',
        suggestion: 'Increase emotional appeal of your content',
        expectedImpact: 12,
        implementation: 'Add storytelling elements, personal experiences, or relatable situations',
      });
    }

    improvements.push({
      id: nanoid(),
      category: 'timing',
      priority: 'low',
      suggestion: 'Post during optimal hours for your audience',
      expectedImpact: 8,
      implementation: 'Use the timing optimizer to find the best posting windows for your platform',
    });

    return improvements.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async compareVariants(variants: ContentData[]): Promise<VariantComparison> {
    const scoredVariants = await Promise.all(
      variants.map(async (variant) => {
        const score = await this.scoreContent(variant);
        return {
          variant,
          score,
          id: variant.id || nanoid(),
        };
      })
    );

    const comparison: VariantComparison = {
      variants: scoredVariants.map(({ id, score, variant }) => ({
        id,
        score: score.overall,
        strengths: this.identifyStrengths(score),
        weaknesses: this.identifyWeaknesses(score),
        recommendedPlatform: this.getRecommendedPlatform(score.platformScores),
      })),
      winner: '',
      reasoning: '',
      abTestRecommendation: {
        shouldTest: false,
        testDuration: 0,
        sampleSize: 0,
      },
    };

    const sortedVariants = [...scoredVariants].sort((a, b) => b.score.overall - a.score.overall);
    comparison.winner = sortedVariants[0].id;
    
    const topScore = sortedVariants[0].score.overall;
    const secondScore = sortedVariants[1]?.score.overall || 0;
    const scoreDifference = topScore - secondScore;

    if (scoreDifference < 10 && sortedVariants.length > 1) {
      comparison.abTestRecommendation = {
        shouldTest: true,
        testDuration: 24,
        sampleSize: 1000,
      };
      comparison.reasoning = `Variants are close in score (${topScore} vs ${secondScore}). A/B testing recommended to determine true winner.`;
    } else {
      comparison.reasoning = `Variant ${comparison.winner} has a clear advantage with ${scoreDifference} points higher score.`;
    }

    return comparison;
  }

  private identifyStrengths(score: ViralScore): string[] {
    const strengths: string[] = [];
    if (score.factors.hookStrength >= 70) strengths.push('Strong opening hook');
    if (score.factors.emotionalResonance >= 70) strengths.push('High emotional appeal');
    if (score.factors.trendAlignment >= 70) strengths.push('Well-aligned with trends');
    if (score.factors.hashtagOptimization >= 70) strengths.push('Optimized hashtag strategy');
    if (score.factors.visualAppeal >= 70) strengths.push('Strong visual presentation');
    if (score.factors.audioQuality >= 70) strengths.push('Quality audio/music');
    return strengths;
  }

  private identifyWeaknesses(score: ViralScore): string[] {
    const weaknesses: string[] = [];
    if (score.factors.hookStrength < 50) weaknesses.push('Weak opening hook');
    if (score.factors.emotionalResonance < 50) weaknesses.push('Low emotional engagement');
    if (score.factors.trendAlignment < 50) weaknesses.push('Not aligned with trends');
    if (score.factors.hashtagOptimization < 50) weaknesses.push('Poor hashtag usage');
    if (score.factors.visualAppeal < 50) weaknesses.push('Needs visual improvement');
    if (score.factors.audioQuality < 50) weaknesses.push('Audio could be improved');
    return weaknesses;
  }

  private getRecommendedPlatform(platformScores: ViralScore['platformScores']): string {
    return Object.entries(platformScores)
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  async getHistoricalPatterns(userId: string): Promise<ViralPattern[]> {
    return this.viralPatterns;
  }

  async updateTrends(): Promise<void> {
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - this.lastTrendUpdate.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate >= 6) {
      await this.initializeTrends();
      logger.info('🔄 Viral trends updated');
    }
  }
}

export const viralScoringService = new ViralScoringService();
