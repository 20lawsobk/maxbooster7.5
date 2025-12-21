/**
 * Real-Life Event Generators for Max Booster Simulation
 * 
 * Generates realistic events that trigger system responses:
 * - User lifecycle events (signup, activity, churn)
 * - Content events (releases, streams, viral moments)
 * - Financial events (payments, payouts, refunds)
 * - Social events (posts, engagement, trends)
 * - Market events (algorithm changes, competitor actions)
 * - System events (failures, recoveries, scaling)
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';

// Industry-specific constants based on real music industry data (2024-2025)
export const INDUSTRY_BENCHMARKS = {
  // Global Market Size (2024-2025)
  globalRecordedMusicRevenue: 35,       // $35B global recorded music
  distributionPlatformMarket: 2.1,      // $2.1B distribution platforms
  independentArtistCount: 80000000,     // 80M active independent artists globally
  independentMarketShare: 0.43,         // 43% of Spotify catalog streams
  marketGrowthRate: 0.13,               // 12-15% CAGR
  targetAddressableMarket: 8000000,     // 10% of 80M = serious/growth-minded artists

  // User metrics (premium SaaS model)
  avgMonthlyChurnRate: 0.04,         // 4% monthly churn (lower for premium)
  avgUpgradeRate: 0.06,              // 6% upgrade per month (AI features drive upgrades)
  avgEngagementRate: 0.065,          // 6.5% DAU (higher with AI tools)
  avgSessionDuration: 18,            // 18 minutes (DAW + analytics)
  avgSessionsPerWeek: 4.5,           // Higher due to autonomous monitoring
  
  // Streaming metrics
  avgStreamsPerRelease: 5000,
  avgRevenuePerStream: 0.004,        // $0.004 per stream
  viralThresholdStreams: 100000,
  playlistPickupRate: 0.12,          // 12% with AI optimization (vs 8% industry)
  streamingUplift: 0.18,             // 15-20% streaming increase with AI
  
  // Social metrics (with autonomous systems)
  avgFollowerGrowthRate: 0.035,      // 3.5% with auto-posting (vs 2% manual)
  avgPostEngagementRate: 0.045,      // 4.5% with AI optimization
  viralPostThreshold: 10000,         // 10k engagements = viral
  marketingLaborReduction: 0.50,     // 40-60% labor savings
  
  // Max Booster Pricing
  monthlyPrice: 49,                  // $49/month standard
  yearlyMonthlyPrice: 39,            // $39/month billed yearly ($468/year)
  lifetimePrice: 699,                // $699 lifetime
  avgOrderValue: 49,
  avgPayoutAmount: 250,              // Higher payouts with optimization
  refundRate: 0.015,                 // 1.5% refund (premium product)
  
  // Competitor Pricing Context
  competitorDistroKidYearly: 22.99,
  competitorTuneCoreSingle: 9.99,
  competitorBeatStarsMonthly: 19.99,
  
  // Platform metrics
  targetUptime: 99.95,
  avgResponseTime: 120,              // 120ms
  maxAcceptableErrorRate: 0.01,      // 1%
  
  // Market Penetration Targets (80M artist market - AGGRESSIVE)
  targetConversionFromCompetitors: 0.15,  // 15% power user conversion - Max Booster is that good
  targetLabelConversion: 0.10,            // 10% boutique labels - full suite wins deals
  year1SubscriberTarget: 250000,          // 250k subscribers year 1
  year2SubscriberTarget: 500000,          // 500k by year 2 (viral word-of-mouth)
  year3SubscriberTarget: 1000000,         // 1M by year 3 (market dominance begins)
  year5SubscriberTarget: 4000000,         // 4M by year 5 (5% of 80M)
  year10SubscriberTarget: 16000000,       // 16M by year 10 (20% market share)
  year2ARRTarget: 250000000,              // $250M ARR by year 2
  year3ARRTarget: 500000000,              // $500M ARR by year 3
  year5ARRTarget: 2000000000,             // $2B ARR by year 5
  year10ARRTarget: 8000000000,            // $8B ARR by year 10
};

// Seasonal modifiers (indexed by month 0-11)
export const SEASONAL_MODIFIERS = {
  userGrowth: [0.8, 0.9, 1.0, 1.0, 0.9, 0.85, 0.8, 0.85, 1.1, 1.0, 1.2, 1.3],    // Q4 spike
  streaming: [1.0, 0.95, 1.0, 1.0, 1.0, 1.1, 1.2, 1.15, 1.0, 1.0, 1.1, 1.3],     // Summer + holidays
  releases: [0.9, 0.95, 1.0, 1.1, 1.0, 0.9, 0.8, 0.85, 1.2, 1.1, 1.0, 0.7],      // Q3 releases
  socialActivity: [0.9, 0.95, 1.0, 1.0, 1.0, 1.1, 1.2, 1.2, 1.0, 1.05, 1.1, 1.0],
};

// Day of week modifiers (0 = Sunday)
export const DAY_MODIFIERS = {
  streaming: [1.2, 0.9, 0.85, 0.85, 0.9, 1.1, 1.2],      // Weekends higher
  socialActivity: [1.1, 0.8, 0.85, 0.9, 1.0, 1.2, 1.15],
  userSignups: [0.7, 1.0, 1.1, 1.0, 1.0, 0.9, 0.8],      // Weekdays higher
};

// Hour of day modifiers (0-23)
export const HOUR_MODIFIERS = {
  streaming: [0.3, 0.2, 0.15, 0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0, 1.0, 
              1.1, 1.0, 0.95, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.1, 0.8, 0.5],
  socialActivity: [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.1, 1.2,
                   1.3, 1.2, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.1, 0.7, 0.4],
};

// Genre-specific multipliers
export const GENRE_MULTIPLIERS = {
  hiphop: { streams: 1.4, social: 1.5, viral: 1.3 },
  pop: { streams: 1.3, social: 1.4, viral: 1.4 },
  electronic: { streams: 1.2, social: 1.1, viral: 1.0 },
  rnb: { streams: 1.2, social: 1.3, viral: 1.2 },
  rock: { streams: 1.0, social: 0.8, viral: 0.7 },
  country: { streams: 0.9, social: 0.9, viral: 0.8 },
  latin: { streams: 1.5, social: 1.6, viral: 1.5 },
  indie: { streams: 0.7, social: 1.0, viral: 0.9 },
  classical: { streams: 0.4, social: 0.3, viral: 0.2 },
};

// Platform-specific engagement rates
export const PLATFORM_ENGAGEMENT = {
  spotify: { streamMultiplier: 1.0, playlistChance: 0.08, saveRate: 0.15 },
  apple_music: { streamMultiplier: 0.4, playlistChance: 0.06, saveRate: 0.20 },
  youtube_music: { streamMultiplier: 0.3, playlistChance: 0.05, saveRate: 0.10 },
  amazon_music: { streamMultiplier: 0.15, playlistChance: 0.04, saveRate: 0.12 },
  tidal: { streamMultiplier: 0.05, playlistChance: 0.03, saveRate: 0.25 },
  deezer: { streamMultiplier: 0.08, playlistChance: 0.04, saveRate: 0.11 },
  soundcloud: { streamMultiplier: 0.1, playlistChance: 0.02, saveRate: 0.08 },
};

export interface GeneratedEvent {
  id: string;
  type: string;
  category: 'user' | 'content' | 'financial' | 'social' | 'market' | 'system';
  timestamp: Date;
  data: Record<string, any>;
  probability: number;
  triggered: boolean;
  impact: 'low' | 'medium' | 'high' | 'critical';
  triggerChain?: string[];
}

export interface UserBehaviorPattern {
  archetype: string;
  activityLevel: 'high' | 'medium' | 'low';
  preferredHours: number[];
  preferredDays: number[];
  contentFrequency: number;
  engagementStyle: 'creator' | 'curator' | 'consumer';
  upgradeReadiness: number;
  churnRisk: number;
}

export interface MarketEvent {
  type: 'algorithm_change' | 'competitor_launch' | 'industry_trend' | 'regulation' | 'economic';
  platform?: string;
  impact: number;
  duration: number;
  affectedMetrics: string[];
  responseRequired: boolean;
}

export class EventGenerator extends EventEmitter {
  private simulatedDate: Date;
  private random: () => number;
  
  constructor(simulatedDate: Date = new Date(), seed?: number) {
    super();
    this.simulatedDate = simulatedDate;
    this.random = seed !== undefined ? this.seededRandom(seed) : Math.random;
  }

  private seededRandom(seed: number): () => number {
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getSeasonalModifier(type: keyof typeof SEASONAL_MODIFIERS): number {
    const month = this.simulatedDate.getMonth();
    return SEASONAL_MODIFIERS[type][month];
  }

  private getDayModifier(type: keyof typeof DAY_MODIFIERS): number {
    const day = this.simulatedDate.getDay();
    return DAY_MODIFIERS[type][day];
  }

  private getHourModifier(type: keyof typeof HOUR_MODIFIERS): number {
    const hour = this.simulatedDate.getHours();
    return HOUR_MODIFIERS[type][hour];
  }

  public generateUserSignupEvent(baseProb: number = 0.15): GeneratedEvent {
    const seasonalMod = this.getSeasonalModifier('userGrowth');
    const dayMod = this.getDayModifier('userSignups');
    const finalProb = baseProb * seasonalMod * dayMod;
    const triggered = this.random() < finalProb;

    const archetypes = ['hobbyist', 'emerging_artist', 'established_artist', 'label', 'enterprise'];
    const weights = [0.50, 0.25, 0.15, 0.07, 0.03];
    const archetype = this.weightedChoice(archetypes, weights);

    const tiers = ['monthly', 'yearly', 'lifetime'];
    const tierWeights = archetype === 'hobbyist' ? [0.65, 0.30, 0.05] :
                       archetype === 'enterprise' ? [0.10, 0.30, 0.60] :
                       [0.50, 0.35, 0.15];
    const tier = this.weightedChoice(tiers, tierWeights);

    const genres = Object.keys(GENRE_MULTIPLIERS);
    const genre = genres[Math.floor(this.random() * genres.length)];

    return {
      id: this.generateId(),
      type: 'user_signup',
      category: 'user',
      timestamp: new Date(this.simulatedDate),
      data: {
        archetype,
        tier,
        genre,
        source: this.weightedChoice(
          ['organic', 'referral', 'paid_ad', 'social', 'press'],
          [0.4, 0.25, 0.2, 0.1, 0.05]
        ),
        expectedLTV: tier === 'monthly' ? 588 : tier === 'yearly' ? 1200 : 699,
      },
      probability: finalProb,
      triggered,
      impact: tier === 'lifetime' ? 'high' : tier === 'yearly' ? 'medium' : 'low',
    };
  }

  public generateChurnEvent(user: { churnRisk: number; daysSinceActive: number; tier: string }): GeneratedEvent {
    const baseProbDaily = INDUSTRY_BENCHMARKS.avgMonthlyChurnRate / 30;
    const riskMultiplier = user.churnRisk * (1 + user.daysSinceActive * 0.1);
    const tierMultiplier = user.tier === 'monthly' ? 1.0 : user.tier === 'yearly' ? 0.7 : 0.5;
    
    const finalProb = Math.min(0.5, baseProbDaily * riskMultiplier * tierMultiplier);
    const triggered = this.random() < finalProb;

    return {
      id: this.generateId(),
      type: 'user_churn',
      category: 'user',
      timestamp: new Date(this.simulatedDate),
      data: {
        reason: this.weightedChoice(
          ['price', 'competition', 'features', 'inactivity', 'support', 'other'],
          [0.25, 0.2, 0.2, 0.15, 0.1, 0.1]
        ),
        preventable: this.random() < 0.4,
        daysSinceActive: user.daysSinceActive,
        tier: user.tier,
      },
      probability: finalProb,
      triggered,
      impact: user.tier === 'lifetime' ? 'critical' : user.tier === 'yearly' ? 'high' : 'medium',
    };
  }

  public generateStreamEvent(release: { 
    daysSinceRelease: number; 
    isViral: boolean;
    genre: string;
    followers: number;
  }): GeneratedEvent {
    const seasonalMod = this.getSeasonalModifier('streaming');
    const dayMod = this.getDayModifier('streaming');
    const hourMod = this.getHourModifier('streaming');
    
    const genreMultiplier = GENRE_MULTIPLIERS[release.genre as keyof typeof GENRE_MULTIPLIERS]?.streams || 1.0;
    const viralMultiplier = release.isViral ? 50 : 1;
    const decayFactor = Math.exp(-release.daysSinceRelease / 30); // 30-day half-life
    const followerFactor = Math.log10(Math.max(10, release.followers)) / 4;

    const baseStreams = INDUSTRY_BENCHMARKS.avgStreamsPerRelease / (24 * 60);
    const estimatedStreams = Math.floor(
      baseStreams * seasonalMod * dayMod * hourMod * genreMultiplier * 
      viralMultiplier * decayFactor * followerFactor * (1 + this.random() * 0.5)
    );

    const triggered = estimatedStreams > 0;

    return {
      id: this.generateId(),
      type: 'stream_event',
      category: 'content',
      timestamp: new Date(this.simulatedDate),
      data: {
        streamCount: estimatedStreams,
        revenue: estimatedStreams * INDUSTRY_BENCHMARKS.avgRevenuePerStream,
        platforms: Object.entries(PLATFORM_ENGAGEMENT)
          .filter(() => this.random() < 0.7)
          .reduce((acc, [platform, data]) => {
            acc[platform] = Math.floor(estimatedStreams * data.streamMultiplier);
            return acc;
          }, {} as Record<string, number>),
        isPlaylistDriven: this.random() < INDUSTRY_BENCHMARKS.playlistPickupRate,
      },
      probability: 1,
      triggered,
      impact: estimatedStreams > INDUSTRY_BENCHMARKS.viralThresholdStreams ? 'critical' : 
              estimatedStreams > 10000 ? 'high' : estimatedStreams > 1000 ? 'medium' : 'low',
    };
  }

  public generateViralEvent(release: {
    totalStreams: number;
    socialEngagement: number;
    genre: string;
  }): GeneratedEvent {
    const baseProb = 0.001;
    const streamFactor = Math.min(2, release.totalStreams / 50000);
    const socialFactor = Math.min(2, release.socialEngagement / 5000);
    const genreMultiplier = GENRE_MULTIPLIERS[release.genre as keyof typeof GENRE_MULTIPLIERS]?.viral || 1.0;
    
    const finalProb = baseProb * streamFactor * socialFactor * genreMultiplier;
    const triggered = this.random() < finalProb;

    const viralTrigger = this.weightedChoice(
      ['tiktok_trend', 'playlist_feature', 'influencer', 'meme', 'challenge', 'organic'],
      [0.35, 0.25, 0.15, 0.1, 0.1, 0.05]
    );

    return {
      id: this.generateId(),
      type: 'viral_moment',
      category: 'content',
      timestamp: new Date(this.simulatedDate),
      data: {
        trigger: viralTrigger,
        estimatedReach: Math.floor(100000 + this.random() * 900000),
        projectedStreamIncrease: Math.floor(10 + this.random() * 90), // 10x-100x
        duration: Math.floor(3 + this.random() * 14), // 3-17 days
        platforms: viralTrigger === 'tiktok_trend' ? ['tiktok', 'instagram', 'youtube'] :
                   viralTrigger === 'playlist_feature' ? ['spotify', 'apple_music'] :
                   ['all'],
      },
      probability: finalProb,
      triggered,
      impact: 'critical',
      triggerChain: ['increased_streams', 'follower_surge', 'press_coverage', 'playlist_adds'],
    };
  }

  public generatePaymentEvent(user: { tier: string; daysSincePayment: number }): GeneratedEvent {
    const isSubscription = user.daysSincePayment >= 30;
    const tierPrices = { free: 0, basic: 9.99, pro: 29.99, enterprise: 99.99 };
    const amount = tierPrices[user.tier as keyof typeof tierPrices] || 0;

    if (amount === 0) {
      return {
        id: this.generateId(),
        type: 'payment_skipped',
        category: 'financial',
        timestamp: new Date(this.simulatedDate),
        data: { reason: 'free_tier' },
        probability: 1,
        triggered: false,
        impact: 'low',
      };
    }

    const triggered = isSubscription;
    const failureRate = 0.02;
    const failed = triggered && this.random() < failureRate;

    return {
      id: this.generateId(),
      type: failed ? 'payment_failed' : 'payment_received',
      category: 'financial',
      timestamp: new Date(this.simulatedDate),
      data: {
        amount,
        currency: 'USD',
        type: 'subscription',
        method: this.weightedChoice(
          ['card', 'paypal', 'apple_pay', 'google_pay'],
          [0.6, 0.2, 0.12, 0.08]
        ),
        failed,
        failureReason: failed ? this.weightedChoice(
          ['insufficient_funds', 'card_expired', 'fraud_block', 'network_error'],
          [0.4, 0.3, 0.2, 0.1]
        ) : null,
      },
      probability: isSubscription ? 1 : 0,
      triggered: triggered && !failed,
      impact: failed ? 'high' : user.tier === 'enterprise' ? 'medium' : 'low',
    };
  }

  public generateSocialEvent(user: {
    followers: number;
    engagementRate: number;
    platforms: string[];
  }): GeneratedEvent {
    const seasonalMod = this.getSeasonalModifier('socialActivity');
    const dayMod = this.getDayModifier('socialActivity');
    const hourMod = this.getHourModifier('socialActivity');

    const baseProb = 0.1 * seasonalMod * dayMod * hourMod;
    const triggered = this.random() < baseProb;

    const platform = user.platforms[Math.floor(this.random() * user.platforms.length)] || 'instagram';
    const estimatedEngagement = Math.floor(
      user.followers * user.engagementRate * (0.5 + this.random())
    );

    const isViral = estimatedEngagement > INDUSTRY_BENCHMARKS.viralPostThreshold;

    return {
      id: this.generateId(),
      type: 'social_post',
      category: 'social',
      timestamp: new Date(this.simulatedDate),
      data: {
        platform,
        contentType: this.weightedChoice(
          ['image', 'video', 'story', 'reel', 'text'],
          [0.25, 0.3, 0.2, 0.2, 0.05]
        ),
        estimatedReach: Math.floor(user.followers * (0.1 + this.random() * 0.3)),
        estimatedEngagement,
        isViral,
        hashtags: Math.floor(3 + this.random() * 7),
        mentions: Math.floor(this.random() * 3),
      },
      probability: baseProb,
      triggered,
      impact: isViral ? 'high' : estimatedEngagement > 1000 ? 'medium' : 'low',
    };
  }

  public generateMarketEvent(): GeneratedEvent {
    const eventTypes: MarketEvent['type'][] = [
      'algorithm_change', 'competitor_launch', 'industry_trend', 'regulation', 'economic'
    ];
    
    const type = this.weightedChoice(
      eventTypes,
      [0.3, 0.25, 0.25, 0.1, 0.1]
    ) as MarketEvent['type'];

    const platforms = ['spotify', 'tiktok', 'instagram', 'youtube', 'apple_music'];
    const platform = platforms[Math.floor(this.random() * platforms.length)];

    const baseProb = type === 'algorithm_change' ? 0.001 :
                    type === 'competitor_launch' ? 0.0005 :
                    type === 'industry_trend' ? 0.002 :
                    type === 'regulation' ? 0.0001 :
                    0.0003;

    const triggered = this.random() < baseProb;

    return {
      id: this.generateId(),
      type: `market_${type}`,
      category: 'market',
      timestamp: new Date(this.simulatedDate),
      data: {
        eventType: type,
        platform: type === 'algorithm_change' ? platform : undefined,
        impact: -0.2 + this.random() * 0.4, // -20% to +20%
        duration: Math.floor(7 + this.random() * 83), // 7-90 days
        description: this.getMarketEventDescription(type, platform),
        affectedMetrics: this.getAffectedMetrics(type),
        requiresResponse: this.random() < 0.7,
      },
      probability: baseProb,
      triggered,
      impact: Math.abs(-0.2 + this.random() * 0.4) > 0.1 ? 'high' : 'medium',
    };
  }

  public generateSystemEvent(): GeneratedEvent {
    const eventTypes = [
      'high_load', 'database_slow', 'queue_backlog', 'memory_pressure',
      'api_error_spike', 'third_party_outage', 'security_alert'
    ];

    const type = eventTypes[Math.floor(this.random() * eventTypes.length)];
    
    const baseProbDaily = 0.005; // 0.5% daily chance of any system event
    const triggered = this.random() < baseProbDaily;

    const severity = this.random();
    const impact: GeneratedEvent['impact'] = severity > 0.95 ? 'critical' :
                                              severity > 0.8 ? 'high' :
                                              severity > 0.5 ? 'medium' : 'low';

    return {
      id: this.generateId(),
      type: `system_${type}`,
      category: 'system',
      timestamp: new Date(this.simulatedDate),
      data: {
        eventType: type,
        severity,
        affectedServices: this.getAffectedServices(type),
        estimatedResolutionTime: Math.floor(5 + this.random() * 55), // 5-60 minutes
        autoRecoverable: this.random() < 0.7,
        userImpact: Math.floor(this.random() * 10), // % of users affected
      },
      probability: baseProbDaily,
      triggered,
      impact,
    };
  }

  private weightedChoice<T>(choices: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let random = this.random() * total;
    
    for (let i = 0; i < choices.length; i++) {
      random -= weights[i];
      if (random <= 0) return choices[i];
    }
    
    return choices[choices.length - 1];
  }

  private getMarketEventDescription(type: MarketEvent['type'], platform?: string): string {
    const descriptions = {
      algorithm_change: `${platform || 'Platform'} updated their recommendation algorithm, affecting content discovery`,
      competitor_launch: 'New competitor entered the market with aggressive pricing',
      industry_trend: 'New content format gaining popularity across platforms',
      regulation: 'New data privacy regulations affecting user tracking',
      economic: 'Economic conditions affecting subscription spending patterns',
    };
    return descriptions[type];
  }

  private getAffectedMetrics(type: MarketEvent['type']): string[] {
    const metrics = {
      algorithm_change: ['streams', 'discovery', 'playlist_adds'],
      competitor_launch: ['signups', 'churn', 'pricing_pressure'],
      industry_trend: ['content_types', 'engagement', 'viral_potential'],
      regulation: ['data_collection', 'targeting', 'analytics'],
      economic: ['revenue', 'churn', 'upgrade_rate'],
    };
    return metrics[type];
  }

  private getAffectedServices(type: string): string[] {
    const services = {
      high_load: ['api', 'web', 'streaming'],
      database_slow: ['database', 'analytics', 'search'],
      queue_backlog: ['distribution', 'email', 'notifications'],
      memory_pressure: ['api', 'workers', 'cache'],
      api_error_spike: ['api', 'integrations', 'webhooks'],
      third_party_outage: ['payments', 'social', 'distribution'],
      security_alert: ['auth', 'api', 'data'],
    };
    return services[type as keyof typeof services] || ['unknown'];
  }

  public setSimulatedDate(date: Date): void {
    this.simulatedDate = date;
  }

  public generateBatchEvents(count: number, type: string): GeneratedEvent[] {
    const events: GeneratedEvent[] = [];
    const generators: Record<string, () => GeneratedEvent> = {
      user_signup: () => this.generateUserSignupEvent(),
      market: () => this.generateMarketEvent(),
      system: () => this.generateSystemEvent(),
    };

    const generator = generators[type];
    if (!generator) return events;

    for (let i = 0; i < count; i++) {
      events.push(generator());
    }

    return events;
  }
}

export default EventGenerator;
