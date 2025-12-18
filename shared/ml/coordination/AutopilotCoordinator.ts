/**
 * Autopilot Coordinator - Cross-System Communication & Conflict Resolution
 * Enables Social Media and Advertising autopilots to work together intelligently
 * Rule-based decision making with learning-enhanced optimization
 */

export interface AudienceInsight {
  cohortId: string;
  platform: string;
  engagementAffinity: number;
  spendElasticity: number;
  organicReach: number;
  paidReach: number;
  conversionRate: number;
  fatigueScore: number;
  lastUpdated: Date;
}

export interface TimingSignal {
  platform: string;
  hourOfDay: number;
  dayOfWeek: number;
  organicPerformanceMultiplier: number;
  paidPerformanceMultiplier: number;
  competitionLevel: number;
  audienceActivityScore: number;
}

export interface PerformanceLift {
  contentType: string;
  organicLift: number;
  paidLift: number;
  combinedEffect: number;
  isPositiveSynergy: boolean;
}

export interface CampaignState {
  campaignId: string;
  campaignType: 'release' | 'tour' | 'merch' | 'awareness' | 'evergreen';
  priority: 'critical' | 'high' | 'medium' | 'low';
  startDate: Date;
  endDate?: Date;
  budgetAllocated: number;
  budgetSpent: number;
  organicPostsScheduled: number;
  paidAdsActive: number;
  performanceScore: number;
}

export interface ExecutionIntent {
  source: 'social' | 'advertising';
  action: 'post' | 'schedule' | 'boost' | 'pause' | 'adjust_budget' | 'target_audience';
  platform: string;
  audienceCohort?: string;
  scheduledTime?: Date;
  budgetImpact?: number;
  expectedOutcome: {
    reach: number;
    engagement: number;
    conversions?: number;
  };
  conflictRisk: number;
}

export interface CoordinationDecision {
  approved: boolean;
  adjustments?: Partial<ExecutionIntent>;
  reason: string;
  alternativeRecommendation?: ExecutionIntent;
  conflictsWith?: ExecutionIntent[];
}

export type ConflictResolutionStrategy = 'organic_priority' | 'paid_priority' | 'balanced' | 'campaign_critical';

export const COORDINATION_RULES = {
  organicLiftThreshold: 0.7,
  paidPacingWarningThreshold: 0.8,
  audienceFatigueLimit: 0.75,
  minimumPostGapHours: 2,
  maxDailyTouchpoints: 5,
  budgetReallocationThreshold: 0.2,
  synergyBoostThreshold: 1.3,
  conflictCooldownMinutes: 30,
} as const;

export const PRIORITY_MATRIX: Record<CampaignState['campaignType'], Record<CampaignState['priority'], number>> = {
  release: { critical: 100, high: 90, medium: 70, low: 50 },
  tour: { critical: 95, high: 85, medium: 65, low: 45 },
  merch: { critical: 80, high: 70, medium: 55, low: 35 },
  awareness: { critical: 75, high: 60, medium: 45, low: 30 },
  evergreen: { critical: 60, high: 50, medium: 40, low: 25 },
};

export class AutopilotCoordinator {
  private audienceInsights: Map<string, AudienceInsight> = new Map();
  private timingSignals: Map<string, TimingSignal[]> = new Map();
  private performanceLifts: Map<string, PerformanceLift> = new Map();
  private activeCampaigns: Map<string, CampaignState> = new Map();
  private pendingIntents: ExecutionIntent[] = [];
  private executionHistory: Array<{ intent: ExecutionIntent; timestamp: Date; outcome?: any }> = [];
  private resolutionStrategy: ConflictResolutionStrategy = 'balanced';

  constructor() {}

  public setResolutionStrategy(strategy: ConflictResolutionStrategy): void {
    this.resolutionStrategy = strategy;
  }

  public updateAudienceInsight(insight: AudienceInsight): void {
    const key = `${insight.cohortId}_${insight.platform}`;
    this.audienceInsights.set(key, { ...insight, lastUpdated: new Date() });
  }

  public updateTimingSignal(signal: TimingSignal): void {
    const key = signal.platform;
    const signals = this.timingSignals.get(key) || [];
    const existingIdx = signals.findIndex(
      s => s.hourOfDay === signal.hourOfDay && s.dayOfWeek === signal.dayOfWeek
    );
    if (existingIdx >= 0) {
      signals[existingIdx] = signal;
    } else {
      signals.push(signal);
    }
    this.timingSignals.set(key, signals);
  }

  public updatePerformanceLift(contentType: string, lift: PerformanceLift): void {
    this.performanceLifts.set(contentType, lift);
  }

  public registerCampaign(campaign: CampaignState): void {
    this.activeCampaigns.set(campaign.campaignId, campaign);
  }

  public updateCampaignState(campaignId: string, updates: Partial<CampaignState>): void {
    const campaign = this.activeCampaigns.get(campaignId);
    if (campaign) {
      this.activeCampaigns.set(campaignId, { ...campaign, ...updates });
    }
  }

  public evaluateIntent(intent: ExecutionIntent): CoordinationDecision {
    const conflicts = this.detectConflicts(intent);
    const organicLift = this.getOrganicLift(intent.platform);
    const audienceFatigue = this.getAudienceFatigue(intent.audienceCohort, intent.platform);
    const campaignPriority = this.getHighestCampaignPriority();

    if (conflicts.length > 0) {
      return this.resolveConflicts(intent, conflicts);
    }

    if (audienceFatigue > COORDINATION_RULES.audienceFatigueLimit) {
      return {
        approved: false,
        reason: `Audience fatigue score (${(audienceFatigue * 100).toFixed(0)}%) exceeds limit. Recommend waiting.`,
        alternativeRecommendation: this.suggestAlternativeTime(intent),
      };
    }

    if (intent.source === 'advertising' && organicLift > COORDINATION_RULES.organicLiftThreshold) {
      if (this.resolutionStrategy !== 'paid_priority') {
        return {
          approved: false,
          reason: `Organic content performing well (${(organicLift * 100).toFixed(0)}% lift). Consider delaying paid promotion.`,
          adjustments: { budgetImpact: (intent.budgetImpact || 0) * 0.5 },
        };
      }
    }

    if (this.checkSynergy(intent)) {
      return {
        approved: true,
        reason: 'Positive synergy detected between organic and paid activities.',
        adjustments: {
          expectedOutcome: {
            ...intent.expectedOutcome,
            reach: Math.round(intent.expectedOutcome.reach * COORDINATION_RULES.synergyBoostThreshold),
          },
        },
      };
    }

    return {
      approved: true,
      reason: 'No conflicts detected. Execution approved.',
    };
  }

  public submitIntent(intent: ExecutionIntent): CoordinationDecision {
    const decision = this.evaluateIntent(intent);
    
    if (decision.approved) {
      this.pendingIntents.push(intent);
      this.executionHistory.push({ intent, timestamp: new Date() });
      
      if (this.pendingIntents.length > 100) {
        this.pendingIntents = this.pendingIntents.slice(-50);
      }
      if (this.executionHistory.length > 500) {
        this.executionHistory = this.executionHistory.slice(-250);
      }
    }
    
    return decision;
  }

  private detectConflicts(intent: ExecutionIntent): ExecutionIntent[] {
    const conflicts: ExecutionIntent[] = [];
    const now = new Date();
    const cooldownMs = COORDINATION_RULES.conflictCooldownMinutes * 60 * 1000;

    for (const pending of this.pendingIntents) {
      if (pending.platform !== intent.platform) continue;
      
      if (pending.scheduledTime && intent.scheduledTime) {
        const timeDiff = Math.abs(pending.scheduledTime.getTime() - intent.scheduledTime.getTime());
        if (timeDiff < cooldownMs) {
          conflicts.push(pending);
          continue;
        }
      }

      if (pending.audienceCohort === intent.audienceCohort && 
          pending.source !== intent.source) {
        conflicts.push(pending);
      }
    }

    const recentExecutions = this.executionHistory.filter(
      e => now.getTime() - e.timestamp.getTime() < cooldownMs &&
           e.intent.platform === intent.platform
    );
    
    if (recentExecutions.length >= COORDINATION_RULES.maxDailyTouchpoints) {
      const dummyConflict: ExecutionIntent = {
        source: 'social',
        action: 'post',
        platform: intent.platform,
        expectedOutcome: { reach: 0, engagement: 0 },
        conflictRisk: 1,
      };
      conflicts.push(dummyConflict);
    }

    return conflicts;
  }

  private resolveConflicts(intent: ExecutionIntent, conflicts: ExecutionIntent[]): CoordinationDecision {
    const intentPriority = this.calculateIntentPriority(intent);
    const maxConflictPriority = Math.max(...conflicts.map(c => this.calculateIntentPriority(c)));

    switch (this.resolutionStrategy) {
      case 'organic_priority':
        if (intent.source === 'social') {
          return {
            approved: true,
            reason: 'Organic content prioritized per strategy.',
            conflictsWith: conflicts,
          };
        }
        return {
          approved: false,
          reason: 'Organic priority strategy: paid content deferred.',
          alternativeRecommendation: this.suggestAlternativeTime(intent),
        };

      case 'paid_priority':
        if (intent.source === 'advertising') {
          return {
            approved: true,
            reason: 'Paid content prioritized per strategy.',
            conflictsWith: conflicts,
          };
        }
        return {
          approved: false,
          reason: 'Paid priority strategy: organic content deferred.',
          alternativeRecommendation: this.suggestAlternativeTime(intent),
        };

      case 'campaign_critical':
        if (intentPriority >= 80) {
          return {
            approved: true,
            reason: 'Critical campaign priority override.',
            conflictsWith: conflicts,
          };
        }
        return {
          approved: false,
          reason: 'Non-critical intent deferred for campaign focus.',
          alternativeRecommendation: this.suggestAlternativeTime(intent),
        };

      case 'balanced':
      default:
        if (intentPriority > maxConflictPriority) {
          return {
            approved: true,
            reason: 'Higher priority intent approved.',
            conflictsWith: conflicts,
          };
        }
        return {
          approved: false,
          reason: 'Lower priority than existing scheduled activities.',
          alternativeRecommendation: this.suggestAlternativeTime(intent),
        };
    }
  }

  private calculateIntentPriority(intent: ExecutionIntent): number {
    let priority = 50;

    priority += intent.expectedOutcome.reach / 1000;
    priority += intent.expectedOutcome.engagement / 100;
    
    if (intent.action === 'boost') priority += 10;
    if (intent.action === 'schedule') priority += 5;
    
    priority -= intent.conflictRisk * 20;

    for (const [, campaign] of this.activeCampaigns) {
      const campaignScore = PRIORITY_MATRIX[campaign.campaignType][campaign.priority];
      priority = Math.max(priority, campaignScore);
    }

    return Math.min(100, Math.max(0, priority));
  }

  private getOrganicLift(platform: string): number {
    const recentOrganic = this.executionHistory.filter(
      e => e.intent.source === 'social' && 
           e.intent.platform === platform &&
           e.outcome?.engagement
    ).slice(-10);

    if (recentOrganic.length < 3) return 0;

    const avgEngagement = recentOrganic.reduce(
      (sum, e) => sum + (e.outcome?.engagement || 0), 0
    ) / recentOrganic.length;

    const baseline = 100;
    return Math.min(1, avgEngagement / baseline);
  }

  private getAudienceFatigue(cohortId: string | undefined, platform: string): number {
    if (!cohortId) return 0;
    
    const key = `${cohortId}_${platform}`;
    const insight = this.audienceInsights.get(key);
    return insight?.fatigueScore || 0;
  }

  private getHighestCampaignPriority(): number {
    let maxPriority = 0;
    for (const [, campaign] of this.activeCampaigns) {
      const score = PRIORITY_MATRIX[campaign.campaignType][campaign.priority];
      maxPriority = Math.max(maxPriority, score);
    }
    return maxPriority;
  }

  private checkSynergy(intent: ExecutionIntent): boolean {
    const recentOpposite = this.executionHistory.filter(
      e => e.intent.source !== intent.source &&
           e.intent.platform === intent.platform &&
           Date.now() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    if (recentOpposite.length === 0) return false;

    const lift = this.performanceLifts.get(intent.platform);
    return lift?.isPositiveSynergy === true && lift.combinedEffect > 1.2;
  }

  private suggestAlternativeTime(intent: ExecutionIntent): ExecutionIntent {
    const signals = this.timingSignals.get(intent.platform) || [];
    const now = new Date();
    
    const bestSignal = signals
      .filter(s => {
        const targetTime = new Date(now);
        targetTime.setHours(s.hourOfDay, 0, 0, 0);
        if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
        return targetTime.getTime() - now.getTime() > COORDINATION_RULES.minimumPostGapHours * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const scoreA = intent.source === 'social' 
          ? a.organicPerformanceMultiplier 
          : a.paidPerformanceMultiplier;
        const scoreB = intent.source === 'social'
          ? b.organicPerformanceMultiplier
          : b.paidPerformanceMultiplier;
        return scoreB - scoreA;
      })[0];

    if (bestSignal) {
      const alternativeTime = new Date(now);
      alternativeTime.setHours(bestSignal.hourOfDay, 0, 0, 0);
      if (alternativeTime <= now) alternativeTime.setDate(alternativeTime.getDate() + 1);

      return {
        ...intent,
        scheduledTime: alternativeTime,
        conflictRisk: Math.max(0, intent.conflictRisk - 0.2),
      };
    }

    const alternativeTime = new Date(now.getTime() + COORDINATION_RULES.minimumPostGapHours * 60 * 60 * 1000);
    return { ...intent, scheduledTime: alternativeTime };
  }

  public getCoordinationStatus(): {
    activeCampaigns: number;
    pendingIntents: number;
    audienceInsightsCount: number;
    recentExecutions: number;
    currentStrategy: ConflictResolutionStrategy;
  } {
    return {
      activeCampaigns: this.activeCampaigns.size,
      pendingIntents: this.pendingIntents.length,
      audienceInsightsCount: this.audienceInsights.size,
      recentExecutions: this.executionHistory.length,
      currentStrategy: this.resolutionStrategy,
    };
  }

  public getRecommendedBudgetAllocation(
    totalBudget: number,
    campaignType: CampaignState['campaignType']
  ): { organic: number; paid: number; reserve: number } {
    const organicLift = this.calculateAverageOrganicLift();
    
    const baseAllocations: Record<CampaignState['campaignType'], { organic: number; paid: number }> = {
      release: { organic: 0.25, paid: 0.65 },
      tour: { organic: 0.30, paid: 0.55 },
      merch: { organic: 0.20, paid: 0.70 },
      awareness: { organic: 0.40, paid: 0.45 },
      evergreen: { organic: 0.50, paid: 0.35 },
    };

    const base = baseAllocations[campaignType];
    
    const organicBonus = organicLift > 0.5 ? 0.1 : 0;
    const adjustedOrganic = Math.min(0.6, base.organic + organicBonus);
    const adjustedPaid = Math.max(0.3, base.paid - organicBonus);

    return {
      organic: Math.round(totalBudget * adjustedOrganic),
      paid: Math.round(totalBudget * adjustedPaid),
      reserve: Math.round(totalBudget * 0.1),
    };
  }

  private calculateAverageOrganicLift(): number {
    const platforms = ['instagram', 'twitter', 'tiktok', 'facebook', 'youtube'];
    const lifts = platforms.map(p => this.getOrganicLift(p));
    return lifts.reduce((a, b) => a + b, 0) / platforms.length;
  }

  public learnFromOutcome(
    intent: ExecutionIntent,
    outcome: { reach: number; engagement: number; conversions?: number }
  ): void {
    const historyEntry = this.executionHistory.find(
      e => e.intent === intent || 
           (e.intent.action === intent.action && 
            e.intent.platform === intent.platform &&
            e.intent.source === intent.source &&
            !e.outcome)
    );

    if (historyEntry) {
      historyEntry.outcome = outcome;
    }

    if (intent.audienceCohort) {
      const key = `${intent.audienceCohort}_${intent.platform}`;
      const existing = this.audienceInsights.get(key);
      
      if (existing) {
        const fatigueChange = outcome.engagement < intent.expectedOutcome.engagement * 0.7 
          ? 0.05 
          : -0.02;
        
        this.audienceInsights.set(key, {
          ...existing,
          fatigueScore: Math.max(0, Math.min(1, existing.fatigueScore + fatigueChange)),
          lastUpdated: new Date(),
        });
      }
    }

    const lift = this.performanceLifts.get(intent.platform);
    if (lift) {
      const actualLift = outcome.engagement / intent.expectedOutcome.engagement;
      const hasOppositeRecent = this.executionHistory.some(
        e => e.intent.source !== intent.source &&
             e.intent.platform === intent.platform &&
             Date.now() - e.timestamp.getTime() < 12 * 60 * 60 * 1000
      );

      if (hasOppositeRecent) {
        this.performanceLifts.set(intent.platform, {
          ...lift,
          combinedEffect: (lift.combinedEffect + actualLift) / 2,
          isPositiveSynergy: actualLift > 1.1,
        });
      }
    }
  }
}

export const autopilotCoordinator = new AutopilotCoordinator();
