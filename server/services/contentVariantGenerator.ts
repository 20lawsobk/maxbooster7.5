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
  targetAudience?: {
    ageRange: string;
    interests: string[];
  };
}

export interface Hook {
  id: string;
  text: string;
  type: 'question' | 'statement' | 'statistic' | 'story' | 'controversy' | 'mystery';
  predictedStrength: number;
  targetEmotion: string;
}

export interface Variant {
  id: string;
  caption: string;
  hashtags: string[];
  hookType: string;
  predictedScore: number;
  changes: string[];
}

export interface PerformanceMetrics {
  variantId: string;
  impressions: number;
  engagement: number;
  clicks: number;
  shares: number;
  conversionRate: number;
}

export interface VariantResult {
  variants: Variant[];
  originalScore: number;
  recommendations: string[];
}

class ContentVariantGeneratorService {
  private readonly REDIS_TTL = 3600;
  private readonly CACHE_PREFIX = 'variants:';

  private readonly hookTemplates: Record<string, string[]> = {
    question: [
      'Did you know that {topic}?',
      'Have you ever wondered why {topic}?',
      'What if I told you {topic}?',
      'Why does no one talk about {topic}?',
      'Is this the secret to {topic}?',
    ],
    statement: [
      'This is why {topic} matters',
      'The truth about {topic}',
      'Here\'s what nobody tells you about {topic}',
      '{Topic} changed everything for me',
      'Stop making this mistake with {topic}',
    ],
    statistic: [
      '90% of {audience} don\'t know this about {topic}',
      'I spent 1000 hours learning {topic} so you don\'t have to',
      'Only 1% of {audience} understand {topic}',
      '{Topic} increased my results by 300%',
      'After 5 years of {topic}, here\'s what I learned',
    ],
    story: [
      'Last week, something incredible happened with {topic}',
      'My journey with {topic} started when...',
      'I used to hate {topic} until I discovered this',
      'This one thing about {topic} changed my perspective',
      'The day I realized the truth about {topic}',
    ],
    controversy: [
      'Unpopular opinion: {topic}',
      'I\'m probably going to get hate for this, but {topic}',
      'Hot take: {topic} is overrated',
      'Nobody wants to admit that {topic}',
      'This might be controversial but {topic}',
    ],
    mystery: [
      'The {topic} secret that industry experts hide',
      'What they don\'t want you to know about {topic}',
      'The hidden truth behind {topic}',
      'This {topic} hack is criminally underrated',
      'You\'ve been lied to about {topic}',
    ],
  };

  private readonly hashtagCategories: Record<string, string[]> = {
    music: ['#music', '#musician', '#artist', '#producer', '#songwriter', '#newmusic', '#indieartist'],
    producer: ['#beatmaker', '#producer', '#musicproducer', '#beats', '#hiphopproducer', '#trapbeats'],
    viral: ['#viral', '#fyp', '#foryou', '#trending', '#explore', '#foryoupage'],
    engagement: ['#follow', '#like', '#share', '#comment', '#supportsmallartists'],
    niche: ['#undergroundmusic', '#independentartist', '#unsigned', '#emergingartist'],
    genre: ['#hiphop', '#rnb', '#pop', '#electronic', '#trap', '#lofi', '#afrobeats'],
  };

  private readonly emotionKeywords: Record<string, string[]> = {
    excitement: ['amazing', 'incredible', 'mind-blowing', 'insane', 'epic'],
    curiosity: ['secret', 'hidden', 'discover', 'reveal', 'uncover'],
    urgency: ['now', 'today', 'immediately', 'don\'t miss', 'limited'],
    relatability: ['we all', 'everyone', 'finally', 'exactly', 'literally'],
    inspiration: ['dream', 'achieve', 'success', 'journey', 'growth'],
  };

  constructor() {
    logger.info('✅ Content Variant Generator service initialized');
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async generateCaptionVariants(original: string, count: number = 5): Promise<string[]> {
    const variants: string[] = [];
    const topic = this.extractTopic(original);
    const audience = this.inferAudience(original);

    const hookTypes = Object.keys(this.hookTemplates);
    const usedTypes = new Set<string>();

    for (let i = 0; i < Math.min(count, hookTypes.length); i++) {
      let hookType = hookTypes[i % hookTypes.length];
      
      while (usedTypes.has(hookType) && usedTypes.size < hookTypes.length) {
        hookType = hookTypes[Math.floor(Math.random() * hookTypes.length)];
      }
      usedTypes.add(hookType);

      const template = this.hookTemplates[hookType][
        Math.floor(Math.random() * this.hookTemplates[hookType].length)
      ];

      const newHook = template
        .replace('{topic}', topic)
        .replace('{Topic}', topic.charAt(0).toUpperCase() + topic.slice(1))
        .replace('{audience}', audience);

      const bodyLines = original.split('\n').slice(1).join('\n');
      const variant = `${newHook}\n\n${bodyLines || original}`;
      
      variants.push(this.enhanceWithEmotions(variant));
    }

    logger.info(`📝 Generated ${variants.length} caption variants`);
    return variants;
  }

  async generateHashtagSets(content: ContentData, count: number = 5): Promise<string[][]> {
    const sets: string[][] = [];
    const existingHashtags = new Set(content.hashtags.map(h => h.toLowerCase()));

    const platformOptimal: Record<string, { total: number; viral: number; niche: number }> = {
      tiktok: { total: 5, viral: 2, niche: 3 },
      instagram: { total: 12, viral: 3, niche: 5 },
      youtube: { total: 6, viral: 2, niche: 3 },
      twitter: { total: 3, viral: 1, niche: 2 },
      facebook: { total: 3, viral: 1, niche: 2 },
      linkedin: { total: 5, viral: 1, niche: 3 },
    };

    const config = platformOptimal[content.platform] || platformOptimal.instagram;

    for (let i = 0; i < count; i++) {
      const set: string[] = [];

      const viralTags = this.shuffleArray([...this.hashtagCategories.viral])
        .slice(0, config.viral);
      set.push(...viralTags);

      const topicHashtags = this.generateTopicHashtags(content.caption);
      set.push(...topicHashtags.slice(0, config.niche));

      if (content.caption.toLowerCase().includes('music') || 
          content.caption.toLowerCase().includes('beat') ||
          content.caption.toLowerCase().includes('song')) {
        const musicTags = this.shuffleArray([...this.hashtagCategories.music])
          .slice(0, 2);
        set.push(...musicTags);
      }

      while (set.length < config.total) {
        const allTags = Object.values(this.hashtagCategories).flat();
        const randomTag = allTags[Math.floor(Math.random() * allTags.length)];
        if (!set.includes(randomTag)) {
          set.push(randomTag);
        }
      }

      sets.push([...new Set(set)].slice(0, config.total));
    }

    logger.info(`#️⃣ Generated ${sets.length} hashtag sets for ${content.platform}`);
    return sets;
  }

  async generateHookVariants(content: ContentData): Promise<Hook[]> {
    const hooks: Hook[] = [];
    const topic = this.extractTopic(content.caption);

    for (const [type, templates] of Object.entries(this.hookTemplates)) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const hookText = template
        .replace('{topic}', topic)
        .replace('{Topic}', topic.charAt(0).toUpperCase() + topic.slice(1))
        .replace('{audience}', this.inferAudience(content.caption));

      hooks.push({
        id: nanoid(),
        text: hookText,
        type: type as Hook['type'],
        predictedStrength: this.predictHookStrength(hookText, type),
        targetEmotion: this.getTargetEmotion(type),
      });
    }

    return hooks.sort((a, b) => b.predictedStrength - a.predictedStrength);
  }

  selectWinner(variants: Variant[], metrics: PerformanceMetrics[]): Variant {
    if (metrics.length === 0) {
      return variants.sort((a, b) => b.predictedScore - a.predictedScore)[0];
    }

    const metricsMap = new Map(metrics.map(m => [m.variantId, m]));

    let bestVariant = variants[0];
    let bestScore = -1;

    for (const variant of variants) {
      const variantMetrics = metricsMap.get(variant.id);
      if (variantMetrics) {
        const score = this.calculatePerformanceScore(variantMetrics);
        if (score > bestScore) {
          bestScore = score;
          bestVariant = variant;
        }
      }
    }

    return bestVariant;
  }

  async generateVariants(content: ContentData, count: number = 5): Promise<VariantResult> {
    const cacheKey = `${this.CACHE_PREFIX}${content.id || nanoid()}`;
    
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const captionVariants = await this.generateCaptionVariants(content.caption, count);
    const hashtagSets = await this.generateHashtagSets(content, count);
    const hooks = await this.generateHookVariants(content);

    const variants: Variant[] = captionVariants.map((caption, index) => ({
      id: nanoid(),
      caption,
      hashtags: hashtagSets[index] || content.hashtags,
      hookType: hooks[index]?.type || 'statement',
      predictedScore: 50 + Math.floor(Math.random() * 30) + (hooks[index]?.predictedStrength || 0) / 2,
      changes: this.identifyChanges(content.caption, caption),
    }));

    const originalScore = this.estimateOriginalScore(content);
    const recommendations = this.generateRecommendations(content, variants);

    const result: VariantResult = {
      variants: variants.sort((a, b) => b.predictedScore - a.predictedScore),
      originalScore,
      recommendations,
    };

    if (redis) {
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(result));
    }

    logger.info(`🎯 Generated ${variants.length} content variants`);
    return result;
  }

  private extractTopic(caption: string): string {
    const words = caption.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'or', 'but', 'i', 'you', 'we', 'they', 'my', 'your', 'our']);
    
    const meaningfulWords = words.filter(w => 
      !stopWords.has(w) && 
      w.length > 3 && 
      !w.startsWith('#') && 
      !w.startsWith('@')
    );

    return meaningfulWords.slice(0, 3).join(' ') || 'your content';
  }

  private inferAudience(caption: string): string {
    const lowerCaption = caption.toLowerCase();
    
    if (lowerCaption.includes('producer') || lowerCaption.includes('beat')) {
      return 'producers';
    } else if (lowerCaption.includes('artist') || lowerCaption.includes('singer')) {
      return 'artists';
    } else if (lowerCaption.includes('music') || lowerCaption.includes('song')) {
      return 'music lovers';
    }
    
    return 'creators';
  }

  private enhanceWithEmotions(text: string): string {
    const emotions = Object.values(this.emotionKeywords).flat();
    const hasEmotion = emotions.some(e => text.toLowerCase().includes(e));
    
    if (!hasEmotion) {
      const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
      return text.replace(/\.$/, ` - ${randomEmotion}!`);
    }
    
    return text;
  }

  private generateTopicHashtags(caption: string): string[] {
    const words = caption.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    return words.slice(0, 5).map(w => `#${w}`);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private predictHookStrength(hookText: string, type: string): number {
    let strength = 50;

    if (hookText.includes('?')) strength += 10;
    if (hookText.length > 20 && hookText.length < 80) strength += 10;
    if (/\d+/.test(hookText)) strength += 8;
    if (['question', 'controversy', 'mystery'].includes(type)) strength += 12;

    const emotionWords = Object.values(this.emotionKeywords).flat();
    for (const word of emotionWords) {
      if (hookText.toLowerCase().includes(word)) {
        strength += 5;
        break;
      }
    }

    return Math.min(100, strength);
  }

  private getTargetEmotion(hookType: string): string {
    const emotionMap: Record<string, string> = {
      question: 'curiosity',
      statement: 'authority',
      statistic: 'credibility',
      story: 'connection',
      controversy: 'engagement',
      mystery: 'intrigue',
    };
    return emotionMap[hookType] || 'interest';
  }

  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const engagementRate = metrics.impressions > 0 
      ? (metrics.engagement / metrics.impressions) * 100 
      : 0;
    const shareRate = metrics.engagement > 0 
      ? (metrics.shares / metrics.engagement) * 100 
      : 0;
    
    return (engagementRate * 0.4) + (shareRate * 0.3) + (metrics.conversionRate * 30);
  }

  private identifyChanges(original: string, variant: string): string[] {
    const changes: string[] = [];
    
    const origFirstLine = original.split('\n')[0];
    const varFirstLine = variant.split('\n')[0];
    
    if (origFirstLine !== varFirstLine) {
      changes.push('Modified opening hook');
    }

    if (variant.length !== original.length) {
      changes.push(variant.length > original.length ? 'Extended content' : 'Condensed content');
    }

    if (variant.includes('?') && !original.includes('?')) {
      changes.push('Added question format');
    }

    if (/\d/.test(variant) && !/\d/.test(original)) {
      changes.push('Added statistics/numbers');
    }

    return changes.length > 0 ? changes : ['Hook style variation'];
  }

  private estimateOriginalScore(content: ContentData): number {
    let score = 40;

    if (content.caption.length > 50) score += 10;
    if (content.hashtags.length >= 3) score += 10;
    if (content.hashtags.length <= 15) score += 5;
    if (content.caption.includes('?')) score += 5;

    return Math.min(100, score);
  }

  private generateRecommendations(content: ContentData, variants: Variant[]): string[] {
    const recommendations: string[] = [];

    const topVariant = variants[0];
    if (topVariant && topVariant.predictedScore > 70) {
      recommendations.push(`Top variant shows ${topVariant.predictedScore - 60}% improvement potential`);
    }

    if (content.hashtags.length < 5 && content.platform === 'instagram') {
      recommendations.push('Consider using more hashtags for Instagram (optimal: 8-15)');
    }

    if (!content.caption.includes('?')) {
      recommendations.push('Question-based hooks typically increase engagement by 20%');
    }

    recommendations.push('A/B test your top 2 variants to find the best performer');

    return recommendations;
  }

  async createABTest(
    content: ContentData,
    variantCount: number = 2
  ): Promise<{ variants: Variant[]; testId: string; recommendation: string }> {
    const result = await this.generateVariants(content, variantCount);
    const testId = nanoid();

    return {
      variants: result.variants.slice(0, variantCount),
      testId,
      recommendation: `Test ${variantCount} variants over 24-48 hours with equal audience distribution`,
    };
  }
}

export const contentVariantGeneratorService = new ContentVariantGeneratorService();
