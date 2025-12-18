/**
 * Feature Store - Shared Data Layer for Autopilot Coordination
 * Stores audience insights, timing patterns, and performance metrics
 * Enables learning from data while supporting rule-based decisions
 */

export interface AudienceCohort {
  cohortId: string;
  name: string;
  size: number;
  platforms: string[];
  demographics: {
    ageRange: [number, number];
    topGeos: string[];
    interests: string[];
  };
  performance: {
    avgEngagementRate: number;
    avgConversionRate: number;
    ltv: number;
    acquisitionCost: number;
  };
  behavior: {
    activeHours: number[];
    activeDays: string[];
    preferredContentTypes: string[];
    fatigueScore: number;
    lastInteractionDate: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TimingPattern {
  platform: string;
  hourlyPerformance: Record<number, { organic: number; paid: number; combined: number }>;
  dailyPerformance: Record<string, { organic: number; paid: number; combined: number }>;
  seasonalTrends: Record<string, number>;
  releaseDayMultipliers: number[];
  lastUpdated: Date;
}

export interface ContentPerformance {
  contentType: string;
  platform: string;
  avgReach: number;
  avgEngagement: number;
  avgConversions: number;
  viralityScore: number;
  sampleSize: number;
  lastUpdated: Date;
}

export interface CampaignInsight {
  campaignId: string;
  campaignType: string;
  totalSpend: number;
  totalReach: number;
  totalEngagement: number;
  totalConversions: number;
  roi: number;
  organicLift: number;
  paidLift: number;
  synergyEffect: number;
  lessonsLearned: string[];
  endDate: Date;
}

export interface CrossSystemMetrics {
  organicReachVsPaidReach: number;
  organicEngagementVsPaidEngagement: number;
  synergyMultiplier: number;
  optimalOrganicPaidRatio: number;
  audienceOverlapPercentage: number;
  brandSentimentScore: number;
  growthVelocity: number;
  churnRisk: number;
}

export interface LearningEvent {
  eventId: string;
  eventType: 'post' | 'ad' | 'campaign' | 'schedule';
  source: 'social' | 'advertising';
  platform: string;
  timestamp: Date;
  input: Record<string, any>;
  output: Record<string, any>;
  feedback?: { actual: Record<string, any>; quality: number };
}

export class FeatureStore {
  private audienceCohorts: Map<string, AudienceCohort> = new Map();
  private timingPatterns: Map<string, TimingPattern> = new Map();
  private contentPerformance: Map<string, ContentPerformance> = new Map();
  private campaignInsights: Map<string, CampaignInsight> = new Map();
  private crossSystemMetrics: CrossSystemMetrics | null = null;
  private learningEvents: LearningEvent[] = [];
  private maxLearningEvents = 10000;

  constructor() {
    this.initializeDefaultPatterns();
  }

  private initializeDefaultPatterns(): void {
    const platforms = ['twitter', 'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin'];
    
    for (const platform of platforms) {
      const defaultPattern: TimingPattern = {
        platform,
        hourlyPerformance: {},
        dailyPerformance: {},
        seasonalTrends: {},
        releaseDayMultipliers: [1.0, 0.85, 0.70, 0.60, 0.52, 0.45, 0.40],
        lastUpdated: new Date(),
      };

      for (let hour = 0; hour < 24; hour++) {
        const isPeak = [9, 12, 17, 19, 20, 21].includes(hour);
        const baseScore = isPeak ? 0.8 : 0.4;
        defaultPattern.hourlyPerformance[hour] = {
          organic: baseScore,
          paid: baseScore * 0.9,
          combined: baseScore * 1.1,
        };
      }

      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayScores = [0.70, 0.85, 0.95, 1.0, 0.98, 1.05, 0.75];
      for (let i = 0; i < days.length; i++) {
        defaultPattern.dailyPerformance[days[i]] = {
          organic: dayScores[i],
          paid: dayScores[i] * 0.95,
          combined: dayScores[i] * 1.05,
        };
      }

      const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
      const monthScores = [0.85, 0.88, 0.92, 0.95, 1.0, 1.05, 1.10, 1.08, 0.95, 0.92, 0.98, 1.15];
      for (let i = 0; i < months.length; i++) {
        defaultPattern.seasonalTrends[months[i]] = monthScores[i];
      }

      this.timingPatterns.set(platform, defaultPattern);
    }

    this.crossSystemMetrics = {
      organicReachVsPaidReach: 0.4,
      organicEngagementVsPaidEngagement: 0.6,
      synergyMultiplier: 1.2,
      optimalOrganicPaidRatio: 0.6,
      audienceOverlapPercentage: 0.35,
      brandSentimentScore: 0.7,
      growthVelocity: 0.05,
      churnRisk: 0.15,
    };
  }

  public upsertAudienceCohort(cohort: AudienceCohort): void {
    cohort.updatedAt = new Date();
    this.audienceCohorts.set(cohort.cohortId, cohort);
  }

  public getAudienceCohort(cohortId: string): AudienceCohort | undefined {
    return this.audienceCohorts.get(cohortId);
  }

  public getAllAudienceCohorts(): AudienceCohort[] {
    return Array.from(this.audienceCohorts.values());
  }

  public getTopPerformingCohorts(limit: number = 5): AudienceCohort[] {
    return Array.from(this.audienceCohorts.values())
      .sort((a, b) => b.performance.avgEngagementRate - a.performance.avgEngagementRate)
      .slice(0, limit);
  }

  public updateTimingPattern(platform: string, updates: Partial<TimingPattern>): void {
    const existing = this.timingPatterns.get(platform);
    if (existing) {
      this.timingPatterns.set(platform, { ...existing, ...updates, lastUpdated: new Date() });
    }
  }

  public getTimingPattern(platform: string): TimingPattern | undefined {
    return this.timingPatterns.get(platform);
  }

  public getOptimalPostingTime(platform: string, source: 'organic' | 'paid' | 'combined'): { hour: number; day: string; score: number } {
    const pattern = this.timingPatterns.get(platform);
    if (!pattern) {
      return { hour: 12, day: 'wednesday', score: 0.5 };
    }

    let bestHour = 12;
    let bestHourScore = 0;
    for (const [hourStr, scores] of Object.entries(pattern.hourlyPerformance)) {
      const score = scores[source];
      if (score > bestHourScore) {
        bestHourScore = score;
        bestHour = parseInt(hourStr);
      }
    }

    let bestDay = 'wednesday';
    let bestDayScore = 0;
    for (const [day, scores] of Object.entries(pattern.dailyPerformance)) {
      const score = scores[source];
      if (score > bestDayScore) {
        bestDayScore = score;
        bestDay = day;
      }
    }

    return {
      hour: bestHour,
      day: bestDay,
      score: bestHourScore * bestDayScore,
    };
  }

  public recordContentPerformance(performance: ContentPerformance): void {
    const key = `${performance.contentType}_${performance.platform}`;
    const existing = this.contentPerformance.get(key);
    
    if (existing) {
      const totalSamples = existing.sampleSize + performance.sampleSize;
      const weight1 = existing.sampleSize / totalSamples;
      const weight2 = performance.sampleSize / totalSamples;
      
      this.contentPerformance.set(key, {
        contentType: performance.contentType,
        platform: performance.platform,
        avgReach: existing.avgReach * weight1 + performance.avgReach * weight2,
        avgEngagement: existing.avgEngagement * weight1 + performance.avgEngagement * weight2,
        avgConversions: existing.avgConversions * weight1 + performance.avgConversions * weight2,
        viralityScore: existing.viralityScore * weight1 + performance.viralityScore * weight2,
        sampleSize: totalSamples,
        lastUpdated: new Date(),
      });
    } else {
      this.contentPerformance.set(key, { ...performance, lastUpdated: new Date() });
    }
  }

  public getContentPerformance(contentType: string, platform: string): ContentPerformance | undefined {
    return this.contentPerformance.get(`${contentType}_${platform}`);
  }

  public getBestContentTypes(platform: string, limit: number = 5): ContentPerformance[] {
    return Array.from(this.contentPerformance.values())
      .filter(p => p.platform === platform)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, limit);
  }

  public recordCampaignInsight(insight: CampaignInsight): void {
    this.campaignInsights.set(insight.campaignId, insight);
  }

  public getCampaignInsight(campaignId: string): CampaignInsight | undefined {
    return this.campaignInsights.get(campaignId);
  }

  public getCampaignsByType(type: string): CampaignInsight[] {
    return Array.from(this.campaignInsights.values())
      .filter(c => c.campaignType === type);
  }

  public getAverageCampaignROI(type?: string): number {
    const campaigns = type 
      ? this.getCampaignsByType(type) 
      : Array.from(this.campaignInsights.values());
    
    if (campaigns.length === 0) return 1.0;
    return campaigns.reduce((sum, c) => sum + c.roi, 0) / campaigns.length;
  }

  public updateCrossSystemMetrics(updates: Partial<CrossSystemMetrics>): void {
    if (this.crossSystemMetrics) {
      this.crossSystemMetrics = { ...this.crossSystemMetrics, ...updates };
    }
  }

  public getCrossSystemMetrics(): CrossSystemMetrics | null {
    return this.crossSystemMetrics;
  }

  public recordLearningEvent(event: Omit<LearningEvent, 'eventId' | 'timestamp'>): string {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEvent: LearningEvent = {
      ...event,
      eventId,
      timestamp: new Date(),
    };
    
    this.learningEvents.push(fullEvent);
    
    if (this.learningEvents.length > this.maxLearningEvents) {
      this.learningEvents = this.learningEvents.slice(-this.maxLearningEvents / 2);
    }
    
    return eventId;
  }

  public addFeedbackToEvent(eventId: string, feedback: { actual: Record<string, any>; quality: number }): void {
    const event = this.learningEvents.find(e => e.eventId === eventId);
    if (event) {
      event.feedback = feedback;
      this.updatePatternsFromFeedback(event);
    }
  }

  private updatePatternsFromFeedback(event: LearningEvent): void {
    if (!event.feedback) return;

    const platform = event.platform;
    const pattern = this.timingPatterns.get(platform);
    if (!pattern) return;

    const timestamp = event.timestamp;
    const hour = timestamp.getHours();
    const day = timestamp.toLocaleDateString('en-US', { weekday: 'lowercase' });
    
    const qualityScore = event.feedback.quality;
    const learningRate = 0.1;

    if (pattern.hourlyPerformance[hour]) {
      const current = pattern.hourlyPerformance[hour];
      const key = event.source === 'social' ? 'organic' : 'paid';
      current[key] = current[key] * (1 - learningRate) + qualityScore * learningRate;
      current.combined = (current.organic + current.paid) / 2;
    }

    if (pattern.dailyPerformance[day]) {
      const current = pattern.dailyPerformance[day];
      const key = event.source === 'social' ? 'organic' : 'paid';
      current[key] = current[key] * (1 - learningRate) + qualityScore * learningRate;
      current.combined = (current.organic + current.paid) / 2;
    }

    pattern.lastUpdated = new Date();
    this.timingPatterns.set(platform, pattern);
  }

  public getRecentLearningEvents(limit: number = 100, filters?: { source?: 'social' | 'advertising'; platform?: string; eventType?: string }): LearningEvent[] {
    let events = this.learningEvents.slice(-limit);
    
    if (filters) {
      if (filters.source) {
        events = events.filter(e => e.source === filters.source);
      }
      if (filters.platform) {
        events = events.filter(e => e.platform === filters.platform);
      }
      if (filters.eventType) {
        events = events.filter(e => e.eventType === filters.eventType);
      }
    }
    
    return events;
  }

  public calculateLearningProgress(): { totalEvents: number; feedbackRate: number; avgQuality: number; trendsDetected: string[] } {
    const totalEvents = this.learningEvents.length;
    const eventsWithFeedback = this.learningEvents.filter(e => e.feedback);
    const feedbackRate = totalEvents > 0 ? eventsWithFeedback.length / totalEvents : 0;
    const avgQuality = eventsWithFeedback.length > 0
      ? eventsWithFeedback.reduce((sum, e) => sum + (e.feedback?.quality || 0), 0) / eventsWithFeedback.length
      : 0;

    const trendsDetected: string[] = [];
    
    if (this.crossSystemMetrics) {
      if (this.crossSystemMetrics.synergyMultiplier > 1.3) {
        trendsDetected.push('Strong organic-paid synergy detected');
      }
      if (this.crossSystemMetrics.churnRisk > 0.3) {
        trendsDetected.push('Elevated audience churn risk');
      }
      if (this.crossSystemMetrics.growthVelocity > 0.1) {
        trendsDetected.push('Above-average growth velocity');
      }
    }

    return { totalEvents, feedbackRate, avgQuality, trendsDetected };
  }

  public exportForTraining(): {
    timingData: Array<{ platform: string; hour: number; day: string; source: string; score: number }>;
    contentData: Array<{ contentType: string; platform: string; engagement: number; conversions: number }>;
    campaignData: Array<{ type: string; roi: number; synergyEffect: number }>;
  } {
    const timingData: Array<{ platform: string; hour: number; day: string; source: string; score: number }> = [];
    
    for (const [platform, pattern] of this.timingPatterns) {
      for (const [hourStr, scores] of Object.entries(pattern.hourlyPerformance)) {
        timingData.push({ platform, hour: parseInt(hourStr), day: 'any', source: 'organic', score: scores.organic });
        timingData.push({ platform, hour: parseInt(hourStr), day: 'any', source: 'paid', score: scores.paid });
      }
    }

    const contentData = Array.from(this.contentPerformance.values()).map(p => ({
      contentType: p.contentType,
      platform: p.platform,
      engagement: p.avgEngagement,
      conversions: p.avgConversions,
    }));

    const campaignData = Array.from(this.campaignInsights.values()).map(c => ({
      type: c.campaignType,
      roi: c.roi,
      synergyEffect: c.synergyEffect,
    }));

    return { timingData, contentData, campaignData };
  }
}

export const featureStore = new FeatureStore();
