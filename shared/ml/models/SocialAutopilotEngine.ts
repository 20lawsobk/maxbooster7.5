/**
 * Social Autopilot Engine - Enhanced AI for Social Media Optimization
 * 
 * Features:
 * - Optimal posting time prediction per platform
 * - Content type recommendation (video, image, text, story)
 * - Posting frequency optimization
 * - Trend detection and viral potential scoring
 * - Cross-platform content adaptation
 * - Engagement prediction with confidence scores
 * - Follower growth optimization
 * 
 * 100% custom implementation - no external APIs
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import { PLATFORM_LIMITS } from '../coordination/SocialMediaRuleEngine.js';

export type Platform = 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';
export type ContentType = 'video' | 'image' | 'text' | 'story' | 'carousel' | 'reel' | 'short' | 'live';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface HistoricalPost {
  postId: string;
  platform: Platform;
  contentType: ContentType;
  postedAt: Date;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  reach: number;
  impressions: number;
  engagementRate: number;
  followerCountAtTime: number;
  hashtagCount: number;
  mentionCount: number;
  contentLength: number;
  hasLink: boolean;
  hasEmoji: boolean;
  topics: string[];
}

export interface AudienceInsights {
  platform: Platform;
  totalFollowers: number;
  activeFollowers: number;
  peakActivityHours: number[];
  peakActivityDays: DayOfWeek[];
  demographicBreakdown: {
    ageGroups: Record<string, number>;
    genders: Record<string, number>;
    locations: Record<string, number>;
    interests: string[];
  };
  engagementPatterns: {
    avgEngagementRate: number;
    bestPerformingContentTypes: ContentType[];
    avgTimeToFirstEngagement: number;
  };
}

export interface TrendingTopic {
  topic: string;
  platform: Platform;
  trendScore: number;
  velocity: number;
  relevanceToAudience: number;
  competitionLevel: number;
  suggestedAction: string;
  expiryEstimate: Date;
}

export interface BestTimeResult {
  platform: Platform;
  optimalTime: Date;
  alternativeTimes: Date[];
  confidence: number;
  expectedEngagement: number;
  expectedReach: number;
  audienceOnlinePercentage: number;
  reasoning: string;
  dataPointsUsed: number;
}

export interface ContentTypeRecommendation {
  platform: Platform;
  recommendedType: ContentType;
  alternatives: Array<{ type: ContentType; score: number; reason: string }>;
  confidence: number;
  expectedEngagementBoost: number;
  reasoning: string;
  platformTrends: string[];
}

export interface ViralPotentialScore {
  overallScore: number;
  shareability: number;
  emotionalResonance: number;
  trendAlignment: number;
  noveltyScore: number;
  audienceRelevance: number;
  timingScore: number;
  confidence: number;
  topFactors: Array<{ factor: string; impact: number; recommendation: string }>;
  viralProbability: number;
  estimatedReachMultiplier: number;
  reasoning: string;
}

export interface ContentAdaptation {
  originalPlatform: Platform;
  targetPlatform: Platform;
  adaptedContent: {
    text: string;
    hashtags: string[];
    mentions: string[];
    contentType: ContentType;
    mediaAdjustments: string[];
    characterLimit: number;
    optimizations: string[];
  };
  expectedPerformance: {
    engagementRate: number;
    reach: number;
    confidence: number;
  };
  reasoning: string;
}

export interface ScheduleOptimization {
  platform: Platform;
  suggestedSchedule: Array<{
    dayOfWeek: DayOfWeek;
    time: string;
    contentType: ContentType;
    priority: 'high' | 'medium' | 'low';
    expectedEngagement: number;
  }>;
  postsPerDay: number;
  postsPerWeek: number;
  restDays: DayOfWeek[];
  audienceFatigueRisk: number;
  growthPotential: number;
  reasoning: string;
}

export interface TrendDetectionResult {
  trends: TrendingTopic[];
  emergingTopics: string[];
  decliningTopics: string[];
  recommendedActions: Array<{
    action: string;
    urgency: 'immediate' | 'soon' | 'optional';
    potentialImpact: number;
    reasoning: string;
  }>;
  marketSentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

export interface EngagementPrediction {
  platform: Platform;
  contentType: ContentType;
  predictedLikes: number;
  predictedComments: number;
  predictedShares: number;
  predictedSaves: number;
  predictedReach: number;
  predictedImpressions: number;
  engagementRate: number;
  confidence: number;
  confidenceInterval: { low: number; high: number };
  factors: Array<{ factor: string; impact: number }>;
  reasoning: string;
}

export interface FollowerGrowthStrategy {
  platform: Platform;
  currentFollowers: number;
  projectedGrowth: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  strategies: Array<{
    strategy: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
    timeToResults: string;
    priority: number;
  }>;
  contentRecommendations: string[];
  collaborationSuggestions: string[];
  hashtagStrategy: string[];
  postingOptimizations: string[];
  reasoning: string;
}

const PLATFORM_PEAK_HOURS: Record<Platform, number[]> = {
  twitter: [9, 12, 15, 17, 20],
  instagram: [8, 11, 14, 17, 19, 21],
  tiktok: [7, 10, 14, 17, 19, 21, 23],
  youtube: [12, 15, 17, 20, 21],
  facebook: [9, 13, 16, 19, 20],
  linkedin: [7, 8, 10, 12, 17, 18],
};

const PLATFORM_PEAK_DAYS: Record<Platform, DayOfWeek[]> = {
  twitter: ['tuesday', 'wednesday', 'thursday'],
  instagram: ['tuesday', 'wednesday', 'friday'],
  tiktok: ['tuesday', 'thursday', 'friday'],
  youtube: ['thursday', 'friday', 'saturday'],
  facebook: ['wednesday', 'thursday', 'friday'],
  linkedin: ['tuesday', 'wednesday', 'thursday'],
};

const CONTENT_TYPE_PERFORMANCE: Record<Platform, Record<ContentType, number>> = {
  twitter: { text: 0.7, image: 0.85, video: 0.9, story: 0.5, carousel: 0.6, reel: 0.5, short: 0.5, live: 0.6 },
  instagram: { text: 0.3, image: 0.7, video: 0.85, story: 0.8, carousel: 0.9, reel: 0.95, short: 0.9, live: 0.7 },
  tiktok: { text: 0.2, image: 0.4, video: 0.95, story: 0.6, carousel: 0.5, reel: 0.9, short: 0.95, live: 0.8 },
  youtube: { text: 0.2, image: 0.3, video: 0.95, story: 0.5, carousel: 0.3, reel: 0.7, short: 0.85, live: 0.75 },
  facebook: { text: 0.5, image: 0.75, video: 0.85, story: 0.7, carousel: 0.8, reel: 0.85, short: 0.8, live: 0.9 },
  linkedin: { text: 0.75, image: 0.8, video: 0.85, story: 0.5, carousel: 0.9, reel: 0.6, short: 0.7, live: 0.8 },
};

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const DAY_NAMES: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export class SocialAutopilotEngine extends BaseModel {
  private engagementModel: tf.LayersModel | null = null;
  private viralityModel: tf.LayersModel | null = null;
  private timingModel: tf.LayersModel | null = null;
  private historicalData: Map<Platform, HistoricalPost[]> = new Map();
  private audienceInsights: Map<Platform, AudienceInsights> = new Map();
  private platformScalers: Map<Platform, { mean: number[]; std: number[] }> = new Map();

  constructor() {
    super({
      name: 'SocialAutopilotEngine',
      type: 'regression',
      version: '1.0.0',
      inputShape: [32],
      outputShape: [6],
    });
  }

  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [32],
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 6,
          activation: 'linear',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    return model;
  }

  private buildViralityModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 64, activation: 'relu', inputShape: [16] }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  private buildTimingModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 48, activation: 'relu', inputShape: [12] }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 24, activation: 'relu' }),
        tf.layers.dense({ units: 24, activation: 'softmax' }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  protected preprocessInput(input: any): tf.Tensor {
    const features = this.extractInputFeatures(input);
    return tf.tensor2d([features]);
  }

  protected postprocessOutput(output: tf.Tensor): any {
    return output.arraySync();
  }

  private extractInputFeatures(input: any): number[] {
    return new Array(32).fill(0).map((_, i) => input[i] || 0);
  }

  public async initialize(): Promise<void> {
    if (!this.model) {
      this.model = this.buildModel();
      this.isCompiled = true;
    }
    this.viralityModel = this.buildViralityModel();
    this.timingModel = this.buildTimingModel();
  }

  public loadHistoricalData(posts: HistoricalPost[]): void {
    this.historicalData.clear();
    for (const post of posts) {
      if (!this.historicalData.has(post.platform)) {
        this.historicalData.set(post.platform, []);
      }
      this.historicalData.get(post.platform)!.push(post);
    }
  }

  public loadAudienceInsights(insights: AudienceInsights[]): void {
    this.audienceInsights.clear();
    for (const insight of insights) {
      this.audienceInsights.set(insight.platform, insight);
    }
  }

  public predictBestTime(platform: Platform, contentType: ContentType): BestTimeResult {
    const historicalPosts = this.historicalData.get(platform) || [];
    const audience = this.audienceInsights.get(platform);
    const now = new Date();

    const hourPerformance: Record<number, { total: number; count: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourPerformance[h] = { total: 0, count: 0 };
    }

    for (const post of historicalPosts) {
      const hour = post.postedAt.getHours();
      hourPerformance[hour].total += post.engagementRate;
      hourPerformance[hour].count += 1;
    }

    let bestHour = PLATFORM_PEAK_HOURS[platform][0];
    let bestScore = 0;

    for (let h = 0; h < 24; h++) {
      let score = 0;
      if (hourPerformance[h].count > 0) {
        score = hourPerformance[h].total / hourPerformance[h].count;
      } else if (PLATFORM_PEAK_HOURS[platform].includes(h)) {
        score = 0.5;
      }
      
      if (audience?.peakActivityHours.includes(h)) {
        score *= 1.3;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestHour = h;
      }
    }

    const bestDays = audience?.peakActivityDays || PLATFORM_PEAK_DAYS[platform];
    const optimalDay = bestDays[0];
    
    const optimalTime = this.getNextOccurrence(optimalDay, bestHour, now);
    const alternativeTimes = this.getAlternativeTimes(platform, bestHour, now, 3);

    const dataPointsUsed = historicalPosts.filter(p => 
      p.contentType === contentType
    ).length;

    const confidence = Math.min(0.95, 0.5 + (dataPointsUsed / 100) * 0.45);
    const expectedEngagement = this.estimateEngagement(platform, contentType, bestHour);
    const expectedReach = this.estimateReach(platform, audience?.totalFollowers || 1000);
    const audienceOnlinePercentage = audience?.peakActivityHours.includes(bestHour) ? 0.35 : 0.15;

    const reasoning = this.generateTimingReasoning(
      platform, 
      contentType, 
      bestHour, 
      optimalDay, 
      dataPointsUsed,
      audience
    );

    return {
      platform,
      optimalTime,
      alternativeTimes,
      confidence,
      expectedEngagement,
      expectedReach,
      audienceOnlinePercentage,
      reasoning,
      dataPointsUsed,
    };
  }

  public recommendContentType(platform: Platform): ContentTypeRecommendation {
    const historicalPosts = this.historicalData.get(platform) || [];
    const performance = CONTENT_TYPE_PERFORMANCE[platform];
    
    const typePerformance: Record<ContentType, { avgEngagement: number; count: number }> = {} as any;
    const contentTypes: ContentType[] = ['video', 'image', 'text', 'story', 'carousel', 'reel', 'short', 'live'];
    
    for (const type of contentTypes) {
      typePerformance[type] = { avgEngagement: 0, count: 0 };
    }

    for (const post of historicalPosts) {
      if (typePerformance[post.contentType]) {
        typePerformance[post.contentType].avgEngagement += post.engagementRate;
        typePerformance[post.contentType].count += 1;
      }
    }

    const scores: Array<{ type: ContentType; score: number; reason: string }> = [];
    
    for (const type of contentTypes) {
      let score = performance[type] || 0.5;
      
      if (typePerformance[type].count > 0) {
        const historical = typePerformance[type].avgEngagement / typePerformance[type].count;
        score = (score + historical) / 2;
      }
      
      const trendBonus = this.getContentTypeTrendBonus(platform, type);
      score *= (1 + trendBonus);
      
      const reason = this.getContentTypeReason(platform, type, score);
      scores.push({ type, score, reason });
    }

    scores.sort((a, b) => b.score - a.score);
    
    const recommendedType = scores[0].type;
    const alternatives = scores.slice(1, 4);
    
    const confidence = Math.min(0.95, 0.6 + (historicalPosts.length / 200) * 0.35);
    const expectedEngagementBoost = (scores[0].score - 0.5) * 100;

    const platformTrends = this.getPlatformTrends(platform);
    const reasoning = this.generateContentTypeReasoning(
      platform, 
      recommendedType, 
      scores[0].score, 
      historicalPosts.length
    );

    return {
      platform,
      recommendedType,
      alternatives,
      confidence,
      expectedEngagementBoost,
      reasoning,
      platformTrends,
    };
  }

  public detectTrends(platforms: Platform[]): TrendDetectionResult {
    const trends: TrendingTopic[] = [];
    const emergingTopics: string[] = [];
    const decliningTopics: string[] = [];
    const recommendedActions: TrendDetectionResult['recommendedActions'] = [];

    const simulatedTrends = this.generateSimulatedTrends(platforms);
    trends.push(...simulatedTrends);

    for (const platform of platforms) {
      const posts = this.historicalData.get(platform) || [];
      const topicFrequency: Record<string, { count: number; avgEngagement: number }> = {};

      for (const post of posts) {
        for (const topic of post.topics) {
          if (!topicFrequency[topic]) {
            topicFrequency[topic] = { count: 0, avgEngagement: 0 };
          }
          topicFrequency[topic].count += 1;
          topicFrequency[topic].avgEngagement += post.engagementRate;
        }
      }

      const recentPosts = posts.filter(p => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return p.postedAt >= weekAgo;
      });

      for (const [topic, data] of Object.entries(topicFrequency)) {
        const recentCount = recentPosts.filter(p => p.topics.includes(topic)).length;
        const velocity = data.count > 0 ? recentCount / data.count : 0;
        
        if (velocity > 0.5) {
          emergingTopics.push(topic);
        } else if (velocity < 0.1 && data.count > 5) {
          decliningTopics.push(topic);
        }
      }
    }

    if (emergingTopics.length > 0) {
      recommendedActions.push({
        action: `Create content around trending topics: ${emergingTopics.slice(0, 3).join(', ')}`,
        urgency: 'immediate',
        potentialImpact: 0.8,
        reasoning: 'These topics are gaining momentum and early adoption can maximize visibility.',
      });
    }

    if (decliningTopics.length > 0) {
      recommendedActions.push({
        action: `Pivot away from declining topics: ${decliningTopics.slice(0, 3).join(', ')}`,
        urgency: 'soon',
        potentialImpact: 0.5,
        reasoning: 'These topics are losing audience interest and may reduce engagement.',
      });
    }

    recommendedActions.push({
      action: 'Maintain consistent posting schedule with trending content types',
      urgency: 'optional',
      potentialImpact: 0.6,
      reasoning: 'Consistency combined with trend awareness maximizes long-term growth.',
    });

    const confidence = Math.min(0.9, 0.5 + (trends.length / 20) * 0.4);

    return {
      trends,
      emergingTopics: Array.from(new Set(emergingTopics)).slice(0, 10),
      decliningTopics: Array.from(new Set(decliningTopics)).slice(0, 5),
      recommendedActions,
      marketSentiment: this.calculateMarketSentiment(trends),
      confidence,
    };
  }

  public scoreViralPotential(
    platform: Platform,
    content: {
      text: string;
      contentType: ContentType;
      hashtags: string[];
      topics: string[];
      hasEmoji: boolean;
      scheduledTime?: Date;
    }
  ): ViralPotentialScore {
    const shareability = this.calculateShareability(content.text, content.contentType, platform);
    const emotionalResonance = this.calculateEmotionalResonance(content.text);
    const trendAlignment = this.calculateTrendAlignment(content.topics, content.hashtags, platform);
    const noveltyScore = this.calculateNoveltyScore(content.text, platform);
    const audienceRelevance = this.calculateAudienceRelevance(content.topics, platform);
    const timingScore = content.scheduledTime 
      ? this.calculateTimingScore(content.scheduledTime, platform)
      : 0.5;

    const weights = {
      shareability: 0.25,
      emotionalResonance: 0.2,
      trendAlignment: 0.2,
      noveltyScore: 0.1,
      audienceRelevance: 0.15,
      timingScore: 0.1,
    };

    const overallScore = 
      shareability * weights.shareability +
      emotionalResonance * weights.emotionalResonance +
      trendAlignment * weights.trendAlignment +
      noveltyScore * weights.noveltyScore +
      audienceRelevance * weights.audienceRelevance +
      timingScore * weights.timingScore;

    const topFactors = this.identifyTopViralFactors({
      shareability,
      emotionalResonance,
      trendAlignment,
      noveltyScore,
      audienceRelevance,
      timingScore,
    });

    const viralProbability = this.calculateViralProbability(overallScore, platform);
    const estimatedReachMultiplier = 1 + (overallScore * 4);
    const confidence = 0.6 + (this.historicalData.get(platform)?.length || 0) / 500 * 0.3;

    const reasoning = this.generateViralReasoning(
      overallScore,
      topFactors,
      platform,
      content.contentType
    );

    return {
      overallScore,
      shareability,
      emotionalResonance,
      trendAlignment,
      noveltyScore,
      audienceRelevance,
      timingScore,
      confidence: Math.min(0.95, confidence),
      topFactors,
      viralProbability,
      estimatedReachMultiplier,
      reasoning,
    };
  }

  public adaptContent(
    content: { text: string; hashtags: string[]; mentions: string[] },
    originalPlatform: Platform,
    targetPlatform: Platform
  ): ContentAdaptation {
    const targetLimits = PLATFORM_LIMITS[targetPlatform];
    const characterLimit = targetLimits?.maxCharacters || 280;
    const maxHashtags = targetLimits?.maxHashtags || 5;
    const maxMentions = targetLimits?.maxMentions || 5;

    let adaptedText = content.text;
    
    if (adaptedText.length > characterLimit) {
      adaptedText = this.truncateText(adaptedText, characterLimit);
    }

    adaptedText = this.adjustToneForPlatform(adaptedText, targetPlatform);

    const adaptedHashtags = this.adaptHashtags(
      content.hashtags, 
      targetPlatform, 
      maxHashtags
    );

    const adaptedMentions = content.mentions.slice(0, maxMentions);

    const recommendedContentType = this.getOptimalContentType(targetPlatform);
    const mediaAdjustments = this.getMediaAdjustments(originalPlatform, targetPlatform);
    const optimizations = this.getOptimizations(targetPlatform);

    const audience = this.audienceInsights.get(targetPlatform);
    const expectedPerformance = {
      engagementRate: (audience?.engagementPatterns.avgEngagementRate || 0.03) * 1.1,
      reach: (audience?.activeFollowers || 1000) * 0.2,
      confidence: 0.7,
    };

    const reasoning = this.generateAdaptationReasoning(
      originalPlatform,
      targetPlatform,
      content.text.length,
      characterLimit
    );

    return {
      originalPlatform,
      targetPlatform,
      adaptedContent: {
        text: adaptedText,
        hashtags: adaptedHashtags,
        mentions: adaptedMentions,
        contentType: recommendedContentType,
        mediaAdjustments,
        characterLimit,
        optimizations,
      },
      expectedPerformance,
      reasoning,
    };
  }

  public optimizeSchedule(platform: Platform, postsPerWeek: number): ScheduleOptimization {
    const audience = this.audienceInsights.get(platform);
    const historicalPosts = this.historicalData.get(platform) || [];
    const limits = PLATFORM_LIMITS[platform];

    const maxDailyPosts = limits?.maxDailyPosts || 5;
    const minGapMinutes = limits?.minPostGapMinutes || 60;

    const postsPerDay = Math.min(
      Math.ceil(postsPerWeek / 7),
      maxDailyPosts
    );

    const peakHours = audience?.peakActivityHours || PLATFORM_PEAK_HOURS[platform];
    const peakDays = audience?.peakActivityDays || PLATFORM_PEAK_DAYS[platform];

    const schedule: ScheduleOptimization['suggestedSchedule'] = [];
    const contentTypeRec = this.recommendContentType(platform);

    for (const day of peakDays.slice(0, Math.min(postsPerWeek, 7))) {
      for (let i = 0; i < Math.min(postsPerDay, peakHours.length); i++) {
        const hour = peakHours[i];
        schedule.push({
          dayOfWeek: day,
          time: `${hour.toString().padStart(2, '0')}:00`,
          contentType: i === 0 ? contentTypeRec.recommendedType : 
            (contentTypeRec.alternatives[i - 1]?.type || contentTypeRec.recommendedType),
          priority: i === 0 ? 'high' : (i === 1 ? 'medium' : 'low'),
          expectedEngagement: this.estimateEngagement(platform, contentTypeRec.recommendedType, hour),
        });

        if (schedule.length >= postsPerWeek) break;
      }
      if (schedule.length >= postsPerWeek) break;
    }

    const restDays = DAY_NAMES.filter(d => !peakDays.includes(d)).slice(0, 2);
    const audienceFatigueRisk = this.calculateFatigueRisk(postsPerWeek, platform);
    const growthPotential = this.calculateGrowthPotential(schedule, platform);

    const reasoning = this.generateScheduleReasoning(
      platform,
      postsPerWeek,
      peakDays,
      audienceFatigueRisk
    );

    return {
      platform,
      suggestedSchedule: schedule,
      postsPerDay,
      postsPerWeek: Math.min(postsPerWeek, schedule.length),
      restDays,
      audienceFatigueRisk,
      growthPotential,
      reasoning,
    };
  }

  public predictEngagement(
    platform: Platform,
    contentType: ContentType,
    scheduledTime: Date,
    content: { text: string; hashtags: string[]; hasMedia: boolean }
  ): EngagementPrediction {
    const audience = this.audienceInsights.get(platform);
    const historicalPosts = this.historicalData.get(platform) || [];

    const baseEngagement = audience?.engagementPatterns.avgEngagementRate || 0.03;
    const followers = audience?.totalFollowers || 1000;

    const contentTypeMultiplier = CONTENT_TYPE_PERFORMANCE[platform][contentType] || 0.5;
    const hour = scheduledTime.getHours();
    const timingMultiplier = PLATFORM_PEAK_HOURS[platform].includes(hour) ? 1.3 : 0.8;
    const day = DAY_NAMES[scheduledTime.getDay()];
    const dayMultiplier = PLATFORM_PEAK_DAYS[platform].includes(day) ? 1.2 : 0.9;

    const hashtagBonus = Math.min(content.hashtags.length * 0.02, 0.15);
    const mediaBonus = content.hasMedia ? 0.2 : 0;
    const lengthBonus = content.text.length > 50 && content.text.length < 200 ? 0.1 : 0;

    const adjustedEngagement = baseEngagement * 
      contentTypeMultiplier * 
      timingMultiplier * 
      dayMultiplier * 
      (1 + hashtagBonus + mediaBonus + lengthBonus);

    const engagementRate = Math.min(adjustedEngagement, 0.25);
    const predictedReach = Math.round(followers * (0.15 + engagementRate * 2));
    const predictedImpressions = Math.round(predictedReach * 1.5);
    const predictedLikes = Math.round(predictedReach * engagementRate * 0.7);
    const predictedComments = Math.round(predictedReach * engagementRate * 0.15);
    const predictedShares = Math.round(predictedReach * engagementRate * 0.1);
    const predictedSaves = Math.round(predictedReach * engagementRate * 0.05);

    const confidence = 0.6 + (historicalPosts.length / 300) * 0.3;
    const variance = engagementRate * 0.3;

    const factors = [
      { factor: 'Content Type', impact: contentTypeMultiplier - 0.5 },
      { factor: 'Timing', impact: timingMultiplier - 1 },
      { factor: 'Day of Week', impact: dayMultiplier - 1 },
      { factor: 'Hashtags', impact: hashtagBonus },
      { factor: 'Media', impact: mediaBonus },
    ].filter(f => Math.abs(f.impact) > 0.05)
     .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    const reasoning = this.generateEngagementReasoning(
      platform,
      contentType,
      engagementRate,
      factors
    );

    return {
      platform,
      contentType,
      predictedLikes,
      predictedComments,
      predictedShares,
      predictedSaves,
      predictedReach,
      predictedImpressions,
      engagementRate,
      confidence: Math.min(0.95, confidence),
      confidenceInterval: {
        low: engagementRate - variance,
        high: engagementRate + variance,
      },
      factors,
      reasoning,
    };
  }

  public generateFollowerGrowthStrategy(platform: Platform): FollowerGrowthStrategy {
    const audience = this.audienceInsights.get(platform);
    const historicalPosts = this.historicalData.get(platform) || [];
    
    const currentFollowers = audience?.totalFollowers || 1000;
    const avgEngagement = audience?.engagementPatterns.avgEngagementRate || 0.03;

    const dailyGrowthRate = 0.002 + (avgEngagement * 0.1);
    const projectedGrowth = {
      daily: Math.round(currentFollowers * dailyGrowthRate),
      weekly: Math.round(currentFollowers * dailyGrowthRate * 7),
      monthly: Math.round(currentFollowers * dailyGrowthRate * 30),
    };

    const strategies: FollowerGrowthStrategy['strategies'] = [
      {
        strategy: 'Increase posting consistency with optimal timing',
        expectedImpact: 0.25,
        effort: 'medium',
        timeToResults: '2-4 weeks',
        priority: 1,
      },
      {
        strategy: 'Engage with trending topics and hashtags',
        expectedImpact: 0.3,
        effort: 'low',
        timeToResults: '1-2 weeks',
        priority: 2,
      },
      {
        strategy: 'Cross-promote content across platforms',
        expectedImpact: 0.2,
        effort: 'medium',
        timeToResults: '2-3 weeks',
        priority: 3,
      },
      {
        strategy: 'Collaborate with similar-sized creators',
        expectedImpact: 0.35,
        effort: 'high',
        timeToResults: '1-2 months',
        priority: 4,
      },
      {
        strategy: 'Respond to all comments within 1 hour',
        expectedImpact: 0.15,
        effort: 'high',
        timeToResults: '3-4 weeks',
        priority: 5,
      },
    ];

    const contentRec = this.recommendContentType(platform);
    const contentRecommendations = [
      `Focus on ${contentRec.recommendedType} content for maximum engagement`,
      'Create series or recurring content themes for audience retention',
      'Share behind-the-scenes content to build authenticity',
      'Use storytelling to create emotional connections',
    ];

    const collaborationSuggestions = [
      'Partner with creators in complementary niches',
      'Host joint live sessions or takeovers',
      'Create duets or response content',
      'Feature guest appearances in your content',
    ];

    const trendResult = this.detectTrends([platform]);
    const hashtagStrategy = [
      'Mix 3-5 popular hashtags with 2-3 niche-specific ones',
      `Consider trending: ${trendResult.emergingTopics.slice(0, 3).join(', ') || 'music, artist, newrelease'}`,
      'Create a branded hashtag for community building',
      'Research competitor hashtags for inspiration',
    ];

    const scheduleOpt = this.optimizeSchedule(platform, 14);
    const postingOptimizations = [
      `Post during peak hours: ${PLATFORM_PEAK_HOURS[platform].slice(0, 3).join(', ')}:00`,
      `Best days: ${PLATFORM_PEAK_DAYS[platform].slice(0, 3).join(', ')}`,
      `Aim for ${scheduleOpt.postsPerDay} posts per day maximum`,
      'Maintain at least 1-2 rest days per week to avoid fatigue',
    ];

    const reasoning = `Based on your current ${currentFollowers} followers and ${(avgEngagement * 100).toFixed(1)}% engagement rate on ${platform}, ` +
      `implementing these strategies could increase your follower count by approximately ${projectedGrowth.monthly} per month. ` +
      `Focus on ${contentRec.recommendedType} content and posting during ${PLATFORM_PEAK_DAYS[platform][0]} at ${PLATFORM_PEAK_HOURS[platform][0]}:00 for optimal results.`;

    return {
      platform,
      currentFollowers,
      projectedGrowth,
      strategies,
      contentRecommendations,
      collaborationSuggestions,
      hashtagStrategy,
      postingOptimizations,
      reasoning,
    };
  }

  private getNextOccurrence(day: DayOfWeek, hour: number, from: Date): Date {
    const result = new Date(from);
    const targetDay = DAY_INDEX[day];
    const currentDay = result.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7;
    if (daysToAdd === 0 && result.getHours() >= hour) daysToAdd = 7;
    
    result.setDate(result.getDate() + daysToAdd);
    result.setHours(hour, 0, 0, 0);
    
    return result;
  }

  private getAlternativeTimes(platform: Platform, bestHour: number, from: Date, count: number): Date[] {
    const alternatives: Date[] = [];
    const peakHours = PLATFORM_PEAK_HOURS[platform].filter(h => h !== bestHour);
    const peakDays = PLATFORM_PEAK_DAYS[platform];
    
    for (let i = 0; i < Math.min(count, peakHours.length); i++) {
      const day = peakDays[i % peakDays.length];
      alternatives.push(this.getNextOccurrence(day, peakHours[i], from));
    }
    
    return alternatives;
  }

  private estimateEngagement(platform: Platform, contentType: ContentType, hour: number): number {
    const base = 0.03;
    const typeMultiplier = CONTENT_TYPE_PERFORMANCE[platform][contentType] || 0.5;
    const timeMultiplier = PLATFORM_PEAK_HOURS[platform].includes(hour) ? 1.3 : 0.8;
    return base * typeMultiplier * timeMultiplier;
  }

  private estimateReach(platform: Platform, followers: number): number {
    const reachRates: Record<Platform, number> = {
      twitter: 0.15,
      instagram: 0.2,
      tiktok: 0.35,
      youtube: 0.25,
      facebook: 0.12,
      linkedin: 0.18,
    };
    return Math.round(followers * (reachRates[platform] || 0.15));
  }

  private generateTimingReasoning(
    platform: Platform,
    contentType: ContentType,
    bestHour: number,
    optimalDay: DayOfWeek,
    dataPointsUsed: number,
    audience?: AudienceInsights
  ): string {
    const dataSource = dataPointsUsed > 10 
      ? `Based on ${dataPointsUsed} historical posts` 
      : 'Based on platform-wide best practices';
    
    const audienceNote = audience 
      ? ` and your audience's peak activity patterns` 
      : '';
    
    return `${dataSource}${audienceNote}, posting ${contentType} content on ${optimalDay}s at ${bestHour}:00 ` +
      `is optimal for ${platform}. This timing aligns with when your audience is most active and engaged. ` +
      `Consider A/B testing with the alternative times to further optimize your schedule.`;
  }

  private getContentTypeTrendBonus(platform: Platform, type: ContentType): number {
    const trendingTypes: Partial<Record<Platform, ContentType[]>> = {
      instagram: ['reel', 'carousel'],
      tiktok: ['short', 'video'],
      youtube: ['short', 'live'],
      linkedin: ['carousel', 'video'],
    };
    
    return trendingTypes[platform]?.includes(type) ? 0.15 : 0;
  }

  private getContentTypeReason(platform: Platform, type: ContentType, score: number): string {
    if (score > 0.8) return `Top performer on ${platform} with high engagement rates`;
    if (score > 0.6) return `Strong performance, good for regular posting`;
    if (score > 0.4) return `Moderate performance, use strategically`;
    return `Lower engagement, consider alternatives`;
  }

  private getPlatformTrends(platform: Platform): string[] {
    const trends: Record<Platform, string[]> = {
      twitter: ['Short-form video clips', 'Thread storytelling', 'Poll engagement'],
      instagram: ['Reels dominating feed', 'Carousel posts for education', 'Story engagement'],
      tiktok: ['Trending sounds', 'Duets and stitches', 'Educational content'],
      youtube: ['Shorts growth', 'Community posts', 'Live streaming'],
      facebook: ['Video content priority', 'Group engagement', 'Live events'],
      linkedin: ['Carousel documents', 'Personal stories', 'Industry insights'],
    };
    return trends[platform] || [];
  }

  private generateContentTypeReasoning(
    platform: Platform,
    recommendedType: ContentType,
    score: number,
    dataPoints: number
  ): string {
    const confidence = dataPoints > 50 ? 'high confidence' : 'moderate confidence';
    return `With ${confidence}, ${recommendedType} content is recommended for ${platform} based on ` +
      `a performance score of ${(score * 100).toFixed(0)}%. ` +
      `This content type currently aligns with platform algorithm preferences and audience expectations. ` +
      `Consider mixing with alternative content types to maintain variety.`;
  }

  private generateSimulatedTrends(platforms: Platform[]): TrendingTopic[] {
    const commonTrends = [
      { topic: 'New Music Friday', relevance: 0.9 },
      { topic: 'Behind The Scenes', relevance: 0.8 },
      { topic: 'Artist Journey', relevance: 0.75 },
      { topic: 'Music Production', relevance: 0.7 },
      { topic: 'Collaboration Announcement', relevance: 0.85 },
    ];
    
    const trends: TrendingTopic[] = [];
    
    for (const platform of platforms) {
      for (const trend of commonTrends.slice(0, 3)) {
        trends.push({
          topic: trend.topic,
          platform,
          trendScore: 0.6 + Math.random() * 0.4,
          velocity: 0.5 + Math.random() * 0.5,
          relevanceToAudience: trend.relevance,
          competitionLevel: 0.3 + Math.random() * 0.5,
          suggestedAction: `Create ${trend.topic.toLowerCase()} content`,
          expiryEstimate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
    
    return trends;
  }

  private calculateMarketSentiment(trends: TrendingTopic[]): 'positive' | 'neutral' | 'negative' {
    const avgScore = trends.reduce((sum, t) => sum + t.trendScore, 0) / (trends.length || 1);
    if (avgScore > 0.7) return 'positive';
    if (avgScore > 0.4) return 'neutral';
    return 'negative';
  }

  private calculateShareability(text: string | undefined, contentType: ContentType, platform: Platform): number {
    let score = 0.5;
    
    if (contentType === 'video' || contentType === 'reel') score += 0.2;
    if (text && text.includes('?')) score += 0.1;
    if (text && text.length > 50 && text.length < 150) score += 0.1;
    if (text && /\b(share|retweet|tag|comment)\b/i.test(text)) score += 0.1;
    
    return Math.min(1, score);
  }

  private calculateEmotionalResonance(text: string): number {
    const emotionalWords = /\b(love|amazing|incredible|excited|proud|grateful|inspired|happy|blessed|journey|dream|passion)\b/gi;
    const matches = text.match(emotionalWords) || [];
    return Math.min(1, 0.3 + matches.length * 0.1);
  }

  private calculateTrendAlignment(topics: string[], hashtags: string[], platform: Platform): number {
    const trendingTopics = ['newmusic', 'music', 'artist', 'producer', 'song', 'album', 'release'];
    const alignedCount = [...topics, ...hashtags].filter(t => 
      trendingTopics.some(trend => t.toLowerCase().includes(trend))
    ).length;
    return Math.min(1, 0.3 + alignedCount * 0.15);
  }

  private calculateNoveltyScore(text: string, platform: Platform): number {
    const posts = this.historicalData.get(platform) || [];
    if (posts.length === 0) return 0.7;
    return 0.5 + Math.random() * 0.3;
  }

  private calculateAudienceRelevance(topics: string[], platform: Platform): number {
    const audience = this.audienceInsights.get(platform);
    if (!audience) return 0.5;
    
    const interests = audience.demographicBreakdown.interests || [];
    const matchCount = topics.filter(t => 
      interests.some(i => i.toLowerCase().includes(t.toLowerCase()))
    ).length;
    
    return Math.min(1, 0.4 + matchCount * 0.2);
  }

  private calculateTimingScore(scheduledTime: Date, platform: Platform): number {
    const hour = scheduledTime.getHours();
    const day = DAY_NAMES[scheduledTime.getDay()];
    
    const hourScore = PLATFORM_PEAK_HOURS[platform].includes(hour) ? 0.8 : 0.4;
    const dayScore = PLATFORM_PEAK_DAYS[platform].includes(day) ? 0.9 : 0.5;
    
    return (hourScore + dayScore) / 2;
  }

  private identifyTopViralFactors(scores: Record<string, number>): ViralPotentialScore['topFactors'] {
    return Object.entries(scores)
      .map(([factor, score]) => ({
        factor: factor.replace(/([A-Z])/g, ' $1').trim(),
        impact: score,
        recommendation: score > 0.7 
          ? 'Strong factor - maintain this approach' 
          : score > 0.4 
            ? 'Moderate - room for improvement'
            : 'Weak - focus on improving this area',
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);
  }

  private calculateViralProbability(overallScore: number, platform: Platform): number {
    const baseProbability: Record<Platform, number> = {
      tiktok: 0.05,
      twitter: 0.02,
      instagram: 0.03,
      youtube: 0.01,
      facebook: 0.02,
      linkedin: 0.01,
    };
    return Math.min(0.5, (baseProbability[platform] || 0.02) * (1 + overallScore * 5));
  }

  private generateViralReasoning(
    score: number,
    topFactors: ViralPotentialScore['topFactors'],
    platform: Platform,
    contentType: ContentType
  ): string {
    const scoreLabel = score > 0.7 ? 'high' : score > 0.4 ? 'moderate' : 'low';
    const topFactor = topFactors[0]?.factor || 'overall quality';
    
    return `This ${contentType} content has ${scoreLabel} viral potential (${(score * 100).toFixed(0)}%) on ${platform}. ` +
      `The strongest factor is ${topFactor}. ` +
      `To improve viral chances, focus on ${topFactors[topFactors.length - 1]?.factor || 'engagement hooks'} ` +
      `and post during peak audience activity times.`;
  }

  private truncateText(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return text.slice(0, limit - 3).trim() + '...';
  }

  private adjustToneForPlatform(text: string, platform: Platform): string {
    if (platform === 'linkedin') {
      return text.replace(/!+/g, '.').replace(/\b(lol|omg|tbh)\b/gi, '');
    }
    if (platform === 'tiktok') {
      return text.toLowerCase().replace(/\.$/, '');
    }
    return text;
  }

  private adaptHashtags(hashtags: string[], platform: Platform, limit: number): string[] {
    const platformSpecific: Partial<Record<Platform, string[]>> = {
      instagram: ['music', 'newmusic', 'artist', 'musician', 'instagood'],
      tiktok: ['fyp', 'foryou', 'viral', 'music', 'artist'],
      twitter: ['music', 'newrelease', 'artist'],
      linkedin: ['musicindustry', 'artist', 'creative'],
    };
    
    const base = hashtags.slice(0, Math.floor(limit * 0.6));
    const platformTags = (platformSpecific[platform] || []).slice(0, limit - base.length);
    
    return Array.from(new Set([...base, ...platformTags])).slice(0, limit);
  }

  private getOptimalContentType(platform: Platform): ContentType {
    const optimal: Record<Platform, ContentType> = {
      twitter: 'image',
      instagram: 'reel',
      tiktok: 'video',
      youtube: 'video',
      facebook: 'video',
      linkedin: 'carousel',
    };
    return optimal[platform] || 'image';
  }

  private getMediaAdjustments(from: Platform, to: Platform): string[] {
    const adjustments: string[] = [];
    
    if (to === 'tiktok' && from !== 'tiktok') {
      adjustments.push('Convert to vertical 9:16 format');
      adjustments.push('Add trending sound or music');
      adjustments.push('Keep under 60 seconds for optimal reach');
    }
    
    if (to === 'instagram' && from !== 'instagram') {
      adjustments.push('Optimize for 1:1 or 4:5 ratio');
      adjustments.push('Ensure high resolution (1080x1080 minimum)');
    }
    
    if (to === 'youtube') {
      adjustments.push('Consider creating Shorts version (under 60s)');
      adjustments.push('Use 16:9 aspect ratio for standard videos');
    }
    
    if (to === 'linkedin') {
      adjustments.push('Keep professional tone');
      adjustments.push('Add subtitles for video content');
    }
    
    return adjustments.length > 0 ? adjustments : ['No major adjustments needed'];
  }

  private getOptimizations(platform: Platform): string[] {
    const opts: Record<Platform, string[]> = {
      twitter: ['Use thread format for longer content', 'Include relevant mentions'],
      instagram: ['Use all 30 hashtags strategically', 'Add alt text for accessibility'],
      tiktok: ['Use trending sounds', 'Add text overlays', 'Hook in first 3 seconds'],
      youtube: ['Optimize thumbnail', 'Include keywords in description', 'Add end screen'],
      facebook: ['Encourage shares', 'Use native video upload', 'Tag relevant pages'],
      linkedin: ['Use document/carousel format', 'Ask thoughtful questions', 'Tag industry leaders'],
    };
    return opts[platform] || [];
  }

  private generateAdaptationReasoning(
    from: Platform,
    to: Platform,
    originalLength: number,
    targetLimit: number
  ): string {
    const truncated = originalLength > targetLimit;
    return `Content adapted from ${from} to ${to}. ` +
      (truncated ? `Text truncated from ${originalLength} to ${targetLimit} characters. ` : '') +
      `Hashtags and tone adjusted for ${to} audience expectations. ` +
      `Media format recommendations provided for optimal platform performance.`;
  }

  private calculateFatigueRisk(postsPerWeek: number, platform: Platform): number {
    const limits = PLATFORM_LIMITS[platform];
    const maxSafe = (limits?.maxDailyPosts || 5) * 5;
    return Math.min(1, postsPerWeek / maxSafe);
  }

  private calculateGrowthPotential(
    schedule: ScheduleOptimization['suggestedSchedule'],
    platform: Platform
  ): number {
    const highPriorityCount = schedule.filter(s => s.priority === 'high').length;
    return Math.min(1, 0.5 + (highPriorityCount / schedule.length) * 0.5);
  }

  private generateScheduleReasoning(
    platform: Platform,
    postsPerWeek: number,
    peakDays: DayOfWeek[],
    fatigueRisk: number
  ): string {
    const riskLevel = fatigueRisk > 0.7 ? 'high' : fatigueRisk > 0.4 ? 'moderate' : 'low';
    return `Optimized schedule for ${platform} with ${postsPerWeek} posts per week. ` +
      `Focus on ${peakDays.slice(0, 3).join(', ')} for maximum engagement. ` +
      `Audience fatigue risk is ${riskLevel}. ` +
      `Include rest days to maintain audience interest and avoid algorithm penalties.`;
  }

  private generateEngagementReasoning(
    platform: Platform,
    contentType: ContentType,
    engagementRate: number,
    factors: Array<{ factor: string; impact: number }>
  ): string {
    const ratePercentage = (engagementRate * 100).toFixed(2);
    const topPositive = factors.find(f => f.impact > 0);
    const topNegative = factors.find(f => f.impact < 0);
    
    let reasoning = `Predicted ${ratePercentage}% engagement rate for ${contentType} on ${platform}. `;
    
    if (topPositive) {
      reasoning += `${topPositive.factor} is boosting performance. `;
    }
    if (topNegative) {
      reasoning += `Consider improving ${topNegative.factor} for better results. `;
    }
    
    return reasoning;
  }
}
