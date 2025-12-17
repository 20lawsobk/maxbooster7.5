import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import type { RedisClientType } from 'redis';
import { nanoid } from 'nanoid';

export interface AlgorithmHealth {
  platform: string;
  overallScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'shadowbanned';
  metrics: {
    reachTrend: 'increasing' | 'stable' | 'declining';
    engagementRate: number;
    impressionRatio: number;
    followerGrowth: number;
    hashtagReach: number;
  };
  alerts: AlgorithmAlert[];
  recommendations: string[];
  lastChecked: Date;
}

export interface AlgorithmAlert {
  id: string;
  type: 'shadowban' | 'reach_decline' | 'engagement_drop' | 'algorithm_change' | 'content_warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: Date;
  suggestedAction: string;
  resolved: boolean;
}

export interface EngagementPattern {
  platform: string;
  optimalPostFrequency: number;
  engagementDecayRate: number;
  peakEngagementWindow: number;
  recommendedGapBetweenPosts: number;
  contentTypePerformance: Record<string, number>;
}

export interface AlgorithmChange {
  id: string;
  platform: string;
  detectedAt: Date;
  changeType: 'ranking' | 'reach' | 'engagement' | 'hashtag' | 'content_distribution';
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  adaptations: string[];
}

export interface ShadowBanCheck {
  platform: string;
  isShadowbanned: boolean;
  confidence: number;
  indicators: {
    hashtagVisibility: number;
    explorePageReach: number;
    nonFollowerReach: number;
    engagementFromNew: number;
    searchVisibility: number;
  };
  possibleCauses: string[];
  remediation: string[];
}

export interface PlatformAlgorithmProfile {
  platform: string;
  keyFactors: Array<{ factor: string; weight: number; description: string }>;
  contentPreferences: string[];
  penaltyTriggers: string[];
  boostOpportunities: string[];
  recentChanges: AlgorithmChange[];
}

class AlgorithmIntelligenceService {
  private readonly REDIS_TTL = 1800;
  private readonly CACHE_PREFIX = 'algorithm:';

  private readonly platformAlgorithms: Record<string, PlatformAlgorithmProfile> = {
    tiktok: {
      platform: 'tiktok',
      keyFactors: [
        { factor: 'watch_time', weight: 0.35, description: 'How long users watch your video (completion rate)' },
        { factor: 'engagement_velocity', weight: 0.25, description: 'Speed of likes/comments in first hour' },
        { factor: 'shares', weight: 0.20, description: 'Shares to friends and reposts' },
        { factor: 'profile_visits', weight: 0.10, description: 'Users visiting your profile after watching' },
        { factor: 'follows', weight: 0.10, description: 'New followers gained from content' },
      ],
      contentPreferences: [
        'Native content (filmed in-app)',
        'Trending sounds and effects',
        'First 1-3 seconds hook',
        'Vertical 9:16 format',
        'Consistent posting schedule',
      ],
      penaltyTriggers: [
        'Watermarks from other platforms',
        'Low quality/blurry videos',
        'Misleading or spam content',
        'Excessive external links',
        'Deleted and re-uploaded content',
      ],
      boostOpportunities: [
        'Duet trending creators',
        'Use sounds before they peak',
        'Post during platform-wide events',
        'Engage in comments immediately after posting',
        'Cross-promote from other accounts',
      ],
      recentChanges: [],
    },
    instagram: {
      platform: 'instagram',
      keyFactors: [
        { factor: 'saves', weight: 0.30, description: 'Content saves indicate high value' },
        { factor: 'shares', weight: 0.25, description: 'DM shares and story reshares' },
        { factor: 'comments', weight: 0.20, description: 'Meaningful comment discussions' },
        { factor: 'watch_time', weight: 0.15, description: 'Reels completion rate' },
        { factor: 'profile_actions', weight: 0.10, description: 'Follows, clicks, and interactions' },
      ],
      contentPreferences: [
        'Carousel posts (2-10 slides)',
        'Reels with trending audio',
        'Story engagement (polls, questions)',
        'Consistent aesthetic',
        'Location and relevant hashtags',
      ],
      penaltyTriggers: [
        'Engagement pods and bots',
        'Hashtag overuse (30+ same hashtags)',
        'Posting and deleting frequently',
        'External link overuse in captions',
        'Reposted content without credit',
      ],
      boostOpportunities: [
        'Collab posts with other accounts',
        'Instagram Lives and broadcasts',
        'Early adoption of new features',
        'Respond to all comments in first hour',
        'Use Instagram shopping features',
      ],
      recentChanges: [],
    },
    youtube: {
      platform: 'youtube',
      keyFactors: [
        { factor: 'watch_time', weight: 0.40, description: 'Total watch time and session duration' },
        { factor: 'ctr', weight: 0.25, description: 'Click-through rate from impressions' },
        { factor: 'engagement', weight: 0.20, description: 'Likes, comments, shares combined' },
        { factor: 'retention', weight: 0.10, description: 'Audience retention curve' },
        { factor: 'frequency', weight: 0.05, description: 'Consistent upload schedule' },
      ],
      contentPreferences: [
        'Longer content (8-15 minutes optimal)',
        'Strong thumbnails and titles',
        'End screens and cards',
        'Chapter markers for navigation',
        'Keyword-optimized descriptions',
      ],
      penaltyTriggers: [
        'Clickbait (low retention after click)',
        'Misleading titles/thumbnails',
        'Copyright strikes',
        'Community guideline violations',
        'Artificial traffic sources',
      ],
      boostOpportunities: [
        'YouTube Shorts cross-promotion',
        'Community tab engagement',
        'Premier video releases',
        'Playlist optimization',
        'Collaborations with similar channels',
      ],
      recentChanges: [],
    },
    twitter: {
      platform: 'twitter',
      keyFactors: [
        { factor: 'retweets', weight: 0.30, description: 'Retweets and quote tweets' },
        { factor: 'replies', weight: 0.25, description: 'Reply threads and conversations' },
        { factor: 'likes', weight: 0.20, description: 'Immediate likes velocity' },
        { factor: 'dwell_time', weight: 0.15, description: 'Time spent reading/viewing' },
        { factor: 'follows', weight: 0.10, description: 'Follows from tweet discovery' },
      ],
      contentPreferences: [
        'Thread format for long content',
        'Media attachments (images, videos)',
        'Timely/trending topics',
        'Reply to trending conversations',
        'Original thoughts and takes',
      ],
      penaltyTriggers: [
        'Spam behavior patterns',
        'Excessive mentions/hashtags',
        'Automated posting abuse',
        'Coordinated inauthentic behavior',
        'Repeated identical tweets',
      ],
      boostOpportunities: [
        'Quote tweet viral content',
        'Twitter Spaces participation',
        'Breaking news commentary',
        'Engage with high-profile accounts',
        'Use Twitter polls',
      ],
      recentChanges: [],
    },
  };

  private readonly shadowbanIndicators = {
    hashtagVisibilityThreshold: 30,
    exploreReachThreshold: 10,
    nonFollowerReachThreshold: 20,
    newEngagementThreshold: 15,
    searchVisibilityThreshold: 50,
  };

  constructor() {
    logger.info('✅ Algorithm Intelligence service initialized');
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async checkAlgorithmHealth(
    platform: string,
    userId: string,
    recentMetrics?: {
      impressions: number[];
      engagement: number[];
      followers: number[];
      hashtagReach: number[];
    }
  ): Promise<AlgorithmHealth> {
    const cacheKey = `${this.CACHE_PREFIX}health:${platform}:${userId}`;
    
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const metrics = this.analyzeMetrics(recentMetrics);
    const alerts = await this.detectAlerts(platform, metrics, userId);
    const status = this.determineStatus(metrics, alerts);
    const recommendations = this.generateRecommendations(platform, metrics, alerts);
    const overallScore = this.calculateHealthScore(metrics, alerts);

    const result: AlgorithmHealth = {
      platform,
      overallScore,
      status,
      metrics: {
        reachTrend: metrics.reachTrend,
        engagementRate: metrics.engagementRate,
        impressionRatio: metrics.impressionRatio,
        followerGrowth: metrics.followerGrowth,
        hashtagReach: metrics.hashtagReach,
      },
      alerts,
      recommendations,
      lastChecked: new Date(),
    };

    if (redis) {
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(result));
    }

    logger.info(`🔍 Algorithm health check: ${platform} - Score: ${overallScore}/100 - Status: ${status}`);
    return result;
  }

  async checkShadowBan(
    platform: string,
    userId: string,
    recentMetrics?: {
      hashtagReach: number;
      exploreReach: number;
      nonFollowerReach: number;
      newEngagement: number;
      searchVisibility: number;
    }
  ): Promise<ShadowBanCheck> {
    const metrics = recentMetrics || {
      hashtagReach: 60,
      exploreReach: 40,
      nonFollowerReach: 50,
      newEngagement: 35,
      searchVisibility: 70,
    };

    const indicators = {
      hashtagVisibility: metrics.hashtagReach,
      explorePageReach: metrics.exploreReach,
      nonFollowerReach: metrics.nonFollowerReach,
      engagementFromNew: metrics.newEngagement,
      searchVisibility: metrics.searchVisibility,
    };

    const lowIndicators = [
      indicators.hashtagVisibility < this.shadowbanIndicators.hashtagVisibilityThreshold,
      indicators.explorePageReach < this.shadowbanIndicators.exploreReachThreshold,
      indicators.nonFollowerReach < this.shadowbanIndicators.nonFollowerReachThreshold,
      indicators.engagementFromNew < this.shadowbanIndicators.newEngagementThreshold,
      indicators.searchVisibility < this.shadowbanIndicators.searchVisibilityThreshold,
    ];

    const lowCount = lowIndicators.filter(Boolean).length;
    const isShadowbanned = lowCount >= 3;
    const confidence = Math.min(100, 20 + (lowCount * 20));

    const possibleCauses: string[] = [];
    const remediation: string[] = [];

    if (indicators.hashtagVisibility < 30) {
      possibleCauses.push('Banned or overused hashtags');
      remediation.push('Research and use fresh, relevant hashtags');
    }
    if (indicators.explorePageReach < 10) {
      possibleCauses.push('Content not meeting discovery criteria');
      remediation.push('Focus on save-worthy and shareable content');
    }
    if (indicators.nonFollowerReach < 20) {
      possibleCauses.push('Algorithm limiting distribution');
      remediation.push('Increase posting quality over quantity');
    }
    if (indicators.engagementFromNew < 15) {
      possibleCauses.push('Content not resonating with new audiences');
      remediation.push('Test new content styles and hooks');
    }

    if (isShadowbanned) {
      remediation.push('Take a 48-hour posting break');
      remediation.push('Remove any suspicious third-party apps');
      remediation.push('Avoid engagement pods or automation');
    }

    return {
      platform,
      isShadowbanned,
      confidence,
      indicators,
      possibleCauses,
      remediation,
    };
  }

  async getEngagementPatterns(platform: string, userId: string): Promise<EngagementPattern> {
    const basePatterns: Record<string, EngagementPattern> = {
      tiktok: {
        platform: 'tiktok',
        optimalPostFrequency: 3,
        engagementDecayRate: 0.15,
        peakEngagementWindow: 2,
        recommendedGapBetweenPosts: 4,
        contentTypePerformance: {
          'trending_sound': 1.3,
          'original_sound': 0.9,
          'duet': 1.2,
          'stitch': 1.1,
          'tutorial': 1.15,
        },
      },
      instagram: {
        platform: 'instagram',
        optimalPostFrequency: 1.5,
        engagementDecayRate: 0.20,
        peakEngagementWindow: 1,
        recommendedGapBetweenPosts: 8,
        contentTypePerformance: {
          'carousel': 1.4,
          'reel': 1.3,
          'single_image': 0.9,
          'story': 1.1,
          'live': 1.2,
        },
      },
      youtube: {
        platform: 'youtube',
        optimalPostFrequency: 0.5,
        engagementDecayRate: 0.05,
        peakEngagementWindow: 48,
        recommendedGapBetweenPosts: 72,
        contentTypePerformance: {
          'long_form': 1.2,
          'shorts': 1.1,
          'live': 0.9,
          'premiere': 1.3,
          'community': 0.8,
        },
      },
      twitter: {
        platform: 'twitter',
        optimalPostFrequency: 5,
        engagementDecayRate: 0.30,
        peakEngagementWindow: 0.5,
        recommendedGapBetweenPosts: 2,
        contentTypePerformance: {
          'thread': 1.4,
          'media': 1.25,
          'quote_tweet': 1.2,
          'poll': 1.15,
          'text_only': 0.9,
        },
      },
    };

    return basePatterns[platform] || basePatterns.instagram;
  }

  async detectAlgorithmChanges(
    platform: string,
    historicalData?: Array<{ date: Date; reach: number; engagement: number }>
  ): Promise<AlgorithmChange[]> {
    const changes: AlgorithmChange[] = [];
    
    if (!historicalData || historicalData.length < 7) {
      return this.getRecentPlatformChanges(platform);
    }

    const recentAvg = this.calculateAverage(historicalData.slice(-7).map(d => d.reach));
    const previousAvg = this.calculateAverage(historicalData.slice(-14, -7).map(d => d.reach));
    
    const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (Math.abs(changePercent) > 20) {
      changes.push({
        id: nanoid(),
        platform,
        detectedAt: new Date(),
        changeType: 'reach',
        impact: changePercent > 0 ? 'positive' : 'negative',
        description: `Reach ${changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(changePercent).toFixed(1)}%`,
        adaptations: changePercent < 0 
          ? ['Review recent content strategy', 'Check for banned hashtags', 'Analyze competitor content']
          : ['Double down on current strategy', 'Increase posting frequency', 'Test new content formats'],
      });
    }

    return changes;
  }

  async getPlatformProfile(platform: string): Promise<PlatformAlgorithmProfile> {
    return this.platformAlgorithms[platform] || this.platformAlgorithms.instagram;
  }

  async adaptToAlgorithmChange(
    platform: string,
    change: AlgorithmChange
  ): Promise<{ strategy: string[]; priority: 'immediate' | 'short_term' | 'long_term' }> {
    const strategies: string[] = [];
    let priority: 'immediate' | 'short_term' | 'long_term' = 'short_term';

    if (change.impact === 'negative') {
      priority = 'immediate';
      strategies.push('Pause any scheduled content temporarily');
      strategies.push('Analyze top-performing content from last week');
      strategies.push('Review and update hashtag strategy');
      strategies.push('Increase engagement with audience (replies, DMs)');
    } else {
      strategies.push('Increase posting frequency by 25%');
      strategies.push('Repurpose top content across formats');
      strategies.push('Test new content types while momentum is high');
    }

    return { strategy: strategies, priority };
  }

  async getAlgorithmInsights(
    platform: string,
    userId: string
  ): Promise<{
    currentState: AlgorithmHealth;
    optimizationScore: number;
    topActions: Array<{ action: string; expectedImpact: number; effort: 'low' | 'medium' | 'high' }>;
    benchmarks: { userAvg: number; platformAvg: number; topCreators: number };
  }> {
    const health = await this.checkAlgorithmHealth(platform, userId);
    const patterns = await this.getEngagementPatterns(platform, userId);

    const topActions: Array<{ action: string; expectedImpact: number; effort: 'low' | 'medium' | 'high' }> = [
      { action: 'Engage with comments within 30 minutes of posting', expectedImpact: 15, effort: 'low' },
      { action: 'Use platform-specific features (Collab, Duet, etc)', expectedImpact: 20, effort: 'medium' },
      { action: 'Post during optimal windows consistently', expectedImpact: 12, effort: 'low' },
      { action: 'A/B test hooks and thumbnails', expectedImpact: 18, effort: 'medium' },
      { action: 'Increase save/share-worthy content', expectedImpact: 25, effort: 'high' },
    ];

    return {
      currentState: health,
      optimizationScore: health.overallScore,
      topActions: topActions.sort((a, b) => (b.expectedImpact / (a.effort === 'low' ? 1 : a.effort === 'medium' ? 2 : 3)) - (a.expectedImpact / (b.effort === 'low' ? 1 : b.effort === 'medium' ? 2 : 3))),
      benchmarks: {
        userAvg: health.metrics.engagementRate,
        platformAvg: platform === 'tiktok' ? 5.5 : platform === 'instagram' ? 3.2 : 2.1,
        topCreators: platform === 'tiktok' ? 12 : platform === 'instagram' ? 8 : 5,
      },
    };
  }

  private analyzeMetrics(recentMetrics?: {
    impressions: number[];
    engagement: number[];
    followers: number[];
    hashtagReach: number[];
  }): {
    reachTrend: 'increasing' | 'stable' | 'declining';
    engagementRate: number;
    impressionRatio: number;
    followerGrowth: number;
    hashtagReach: number;
  } {
    if (!recentMetrics) {
      return {
        reachTrend: 'stable',
        engagementRate: 4.2,
        impressionRatio: 65,
        followerGrowth: 0.5,
        hashtagReach: 45,
      };
    }

    const { impressions, engagement, followers, hashtagReach } = recentMetrics;
    
    const recentImp = this.calculateAverage(impressions.slice(-3));
    const previousImp = this.calculateAverage(impressions.slice(0, 3));
    const impChange = ((recentImp - previousImp) / previousImp) * 100;

    let reachTrend: 'increasing' | 'stable' | 'declining' = 'stable';
    if (impChange > 10) reachTrend = 'increasing';
    else if (impChange < -10) reachTrend = 'declining';

    const totalImp = this.calculateSum(impressions);
    const totalEng = this.calculateSum(engagement);
    const engagementRate = totalImp > 0 ? (totalEng / totalImp) * 100 : 0;

    const followerGrowth = followers.length >= 2 
      ? ((followers[followers.length - 1] - followers[0]) / followers[0]) * 100 
      : 0;

    return {
      reachTrend,
      engagementRate: Math.round(engagementRate * 10) / 10,
      impressionRatio: 60 + Math.floor(Math.random() * 30),
      followerGrowth: Math.round(followerGrowth * 10) / 10,
      hashtagReach: this.calculateAverage(hashtagReach),
    };
  }

  private async detectAlerts(
    platform: string,
    metrics: ReturnType<typeof this.analyzeMetrics>,
    userId: string
  ): Promise<AlgorithmAlert[]> {
    const alerts: AlgorithmAlert[] = [];

    if (metrics.reachTrend === 'declining') {
      alerts.push({
        id: nanoid(),
        type: 'reach_decline',
        severity: 'medium',
        message: 'Your reach has been declining over the past week',
        detectedAt: new Date(),
        suggestedAction: 'Review recent content and adjust posting strategy',
        resolved: false,
      });
    }

    if (metrics.engagementRate < 2) {
      alerts.push({
        id: nanoid(),
        type: 'engagement_drop',
        severity: 'high',
        message: 'Engagement rate is below average for this platform',
        detectedAt: new Date(),
        suggestedAction: 'Focus on creating more engaging, save-worthy content',
        resolved: false,
      });
    }

    if (metrics.hashtagReach < 30) {
      alerts.push({
        id: nanoid(),
        type: 'shadowban',
        severity: 'high',
        message: 'Low hashtag visibility detected - possible shadowban',
        detectedAt: new Date(),
        suggestedAction: 'Run full shadowban check and review hashtag usage',
        resolved: false,
      });
    }

    return alerts;
  }

  private determineStatus(
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[]
  ): AlgorithmHealth['status'] {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;
    const shadowbanAlert = alerts.find(a => a.type === 'shadowban');

    if (shadowbanAlert && shadowbanAlert.severity === 'critical') {
      return 'shadowbanned';
    }
    if (criticalAlerts > 0 || highAlerts >= 2) {
      return 'critical';
    }
    if (highAlerts > 0 || metrics.reachTrend === 'declining') {
      return 'warning';
    }
    return 'healthy';
  }

  private generateRecommendations(
    platform: string,
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[]
  ): string[] {
    const recommendations: string[] = [];
    const profile = this.platformAlgorithms[platform];

    if (metrics.reachTrend === 'declining') {
      recommendations.push('Increase content quality and test new formats');
      recommendations.push('Engage more with your audience (comments, DMs, lives)');
    }

    if (metrics.engagementRate < 3) {
      recommendations.push('Create more interactive content (polls, questions, calls to action)');
      recommendations.push('Focus on the first 3 seconds hook for videos');
    }

    if (profile) {
      recommendations.push(...profile.boostOpportunities.slice(0, 2));
    }

    return recommendations.slice(0, 5);
  }

  private calculateHealthScore(
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[]
  ): number {
    let score = 70;

    if (metrics.reachTrend === 'increasing') score += 10;
    else if (metrics.reachTrend === 'declining') score -= 15;

    if (metrics.engagementRate >= 5) score += 15;
    else if (metrics.engagementRate >= 3) score += 5;
    else score -= 10;

    if (metrics.followerGrowth > 1) score += 10;
    else if (metrics.followerGrowth < 0) score -= 5;

    for (const alert of alerts) {
      if (alert.severity === 'critical') score -= 25;
      else if (alert.severity === 'high') score -= 15;
      else if (alert.severity === 'medium') score -= 10;
      else score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private getRecentPlatformChanges(platform: string): AlgorithmChange[] {
    return [];
  }

  private calculateAverage(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private calculateSum(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
  }
}

export const algorithmIntelligenceService = new AlgorithmIntelligenceService();
