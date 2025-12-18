/**
 * Advertising Rule Engine
 * Deterministic rule-based decision making for advertising management
 * Works with learning components for optimization while enforcing hard constraints
 */

export interface BudgetConstraints {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  minBidAmount: number;
  maxBidAmount: number;
  reservePercentage: number;
}

export interface TargetingConstraints {
  minAge: number;
  maxAge: number;
  allowedGeos: string[];
  blockedGeos: string[];
  allowedPlacements: string[];
  blockedPlacements: string[];
  brandSafetyKeywords: string[];
}

export interface ComplianceRule {
  id: string;
  type: 'budget' | 'targeting' | 'creative' | 'timing';
  description: string;
  validator: (context: AdContext) => boolean;
  severity: 'block' | 'warn' | 'info';
  remediation?: string;
}

export interface AdContext {
  platform: string;
  campaignType: 'awareness' | 'traffic' | 'engagement' | 'conversions' | 'app_installs';
  objective: string;
  budget: number;
  dailySpend: number;
  weeklySpend: number;
  monthlySpend: number;
  bidAmount: number;
  targetAgeMin: number;
  targetAgeMax: number;
  targetGeos: string[];
  placements: string[];
  creativeText: string;
  hasAudioContent: boolean;
  isRetargeting: boolean;
  organicEngagementRate: number;
  competitorActivityLevel: number;
  audienceSaturation: number;
}

export interface BudgetAllocationRule {
  id: string;
  name: string;
  condition: (context: AdContext) => boolean;
  adjustment: number;
  reason: string;
}

export interface AdRuleEvaluationResult {
  allowed: boolean;
  violations: Array<{ ruleId: string; message: string; severity: 'block' | 'warn' | 'info' }>;
  recommendations: string[];
  adjustedBudget?: number;
  adjustedBid?: number;
  paceRecommendation?: 'accelerate' | 'maintain' | 'slow_down' | 'pause';
}

export const PLATFORM_AD_LIMITS: Record<string, { minDailyBudget: number; maxAdsPerCampaign: number; maxCampaigns: number }> = {
  facebook: { minDailyBudget: 1, maxAdsPerCampaign: 50, maxCampaigns: 5000 },
  instagram: { minDailyBudget: 1, maxAdsPerCampaign: 50, maxCampaigns: 5000 },
  twitter: { minDailyBudget: 1, maxAdsPerCampaign: 100, maxCampaigns: 2500 },
  tiktok: { minDailyBudget: 20, maxAdsPerCampaign: 20, maxCampaigns: 999 },
  youtube: { minDailyBudget: 10, maxAdsPerCampaign: 50, maxCampaigns: 10000 },
  spotify: { minDailyBudget: 250, maxAdsPerCampaign: 10, maxCampaigns: 100 },
  linkedin: { minDailyBudget: 10, maxAdsPerCampaign: 30, maxCampaigns: 1000 },
};

export const MUSIC_CAMPAIGN_BENCHMARKS = {
  streaming: {
    avgCPC: { low: 0.15, medium: 0.35, high: 0.75 },
    avgCPM: { low: 3.50, medium: 8.00, high: 15.00 },
    avgConversionRate: { low: 0.02, medium: 0.05, high: 0.12 },
    recommendedDailyBudget: { min: 20, optimal: 100, max: 500 },
  },
  ticketSales: {
    avgCPC: { low: 0.50, medium: 1.25, high: 3.00 },
    avgCPM: { low: 8.00, medium: 15.00, high: 35.00 },
    avgConversionRate: { low: 0.005, medium: 0.02, high: 0.05 },
    recommendedDailyBudget: { min: 50, optimal: 250, max: 2000 },
  },
  merchSales: {
    avgCPC: { low: 0.40, medium: 1.00, high: 2.50 },
    avgCPM: { low: 6.00, medium: 12.00, high: 28.00 },
    avgConversionRate: { low: 0.008, medium: 0.025, high: 0.06 },
    recommendedDailyBudget: { min: 30, optimal: 150, max: 1000 },
  },
  awareness: {
    avgCPC: { low: 0.05, medium: 0.15, high: 0.35 },
    avgCPM: { low: 1.50, medium: 4.00, high: 10.00 },
    avgConversionRate: { low: 0.01, medium: 0.03, high: 0.07 },
    recommendedDailyBudget: { min: 10, optimal: 50, max: 300 },
  },
};

export const DEFAULT_BUDGET_CONSTRAINTS: BudgetConstraints = {
  dailyLimit: 500,
  weeklyLimit: 2500,
  monthlyLimit: 10000,
  minBidAmount: 0.01,
  maxBidAmount: 50,
  reservePercentage: 0.1,
};

export const DEFAULT_TARGETING_CONSTRAINTS: TargetingConstraints = {
  minAge: 13,
  maxAge: 65,
  allowedGeos: [],
  blockedGeos: [],
  allowedPlacements: [],
  blockedPlacements: [],
  brandSafetyKeywords: ['violence', 'hate', 'drugs', 'adult', 'gambling'],
};

export const DEFAULT_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: 'daily_budget_limit',
    type: 'budget',
    description: 'Daily budget limit check',
    validator: (ctx) => ctx.dailySpend + ctx.budget <= DEFAULT_BUDGET_CONSTRAINTS.dailyLimit,
    severity: 'block',
    remediation: 'Reduce budget or wait for daily limit reset',
  },
  {
    id: 'weekly_budget_limit',
    type: 'budget',
    description: 'Weekly budget limit check',
    validator: (ctx) => ctx.weeklySpend + ctx.budget <= DEFAULT_BUDGET_CONSTRAINTS.weeklyLimit,
    severity: 'warn',
    remediation: 'Consider reducing weekly spend or increasing budget limits',
  },
  {
    id: 'monthly_budget_limit',
    type: 'budget',
    description: 'Monthly budget limit check',
    validator: (ctx) => ctx.monthlySpend + ctx.budget <= DEFAULT_BUDGET_CONSTRAINTS.monthlyLimit,
    severity: 'warn',
    remediation: 'Review monthly budget allocation',
  },
  {
    id: 'bid_range',
    type: 'budget',
    description: 'Bid amount within acceptable range',
    validator: (ctx) => 
      ctx.bidAmount >= DEFAULT_BUDGET_CONSTRAINTS.minBidAmount && 
      ctx.bidAmount <= DEFAULT_BUDGET_CONSTRAINTS.maxBidAmount,
    severity: 'block',
    remediation: 'Adjust bid amount to be within acceptable range',
  },
  {
    id: 'age_targeting',
    type: 'targeting',
    description: 'Age targeting compliance',
    validator: (ctx) => 
      ctx.targetAgeMin >= DEFAULT_TARGETING_CONSTRAINTS.minAge && 
      ctx.targetAgeMax <= DEFAULT_TARGETING_CONSTRAINTS.maxAge,
    severity: 'block',
    remediation: 'Adjust age targeting to comply with platform policies',
  },
  {
    id: 'brand_safety',
    type: 'creative',
    description: 'Brand safety keyword check',
    validator: (ctx) => {
      const text = ctx.creativeText.toLowerCase();
      return !DEFAULT_TARGETING_CONSTRAINTS.brandSafetyKeywords.some(kw => text.includes(kw));
    },
    severity: 'block',
    remediation: 'Remove or replace flagged content',
  },
  {
    id: 'audience_saturation',
    type: 'targeting',
    description: 'Audience saturation check',
    validator: (ctx) => ctx.audienceSaturation < 0.8,
    severity: 'warn',
    remediation: 'Expand targeting or reduce frequency to avoid audience fatigue',
  },
  {
    id: 'organic_synergy',
    type: 'timing',
    description: 'Organic engagement synergy check',
    validator: (ctx) => !(ctx.organicEngagementRate > 0.7 && ctx.budget > 100),
    severity: 'info',
    remediation: 'Consider reducing paid spend when organic is performing well',
  },
];

export const DEFAULT_BUDGET_ALLOCATION_RULES: BudgetAllocationRule[] = [
  {
    id: 'high_competition',
    name: 'High Competition Adjustment',
    condition: (ctx) => ctx.competitorActivityLevel > 0.7,
    adjustment: 1.2,
    reason: 'Increase budget due to high competition',
  },
  {
    id: 'low_competition',
    name: 'Low Competition Savings',
    condition: (ctx) => ctx.competitorActivityLevel < 0.3,
    adjustment: 0.8,
    reason: 'Reduce budget due to low competition',
  },
  {
    id: 'high_organic',
    name: 'High Organic Performance',
    condition: (ctx) => ctx.organicEngagementRate > 0.6,
    adjustment: 0.7,
    reason: 'Reduce paid spend when organic is strong',
  },
  {
    id: 'retargeting_efficiency',
    name: 'Retargeting Efficiency',
    condition: (ctx) => ctx.isRetargeting,
    adjustment: 1.1,
    reason: 'Increase budget for efficient retargeting',
  },
  {
    id: 'saturation_reduction',
    name: 'Saturation Reduction',
    condition: (ctx) => ctx.audienceSaturation > 0.6,
    adjustment: 0.6,
    reason: 'Reduce budget to prevent audience fatigue',
  },
];

export class AdvertisingRuleEngine {
  private complianceRules: ComplianceRule[] = [...DEFAULT_COMPLIANCE_RULES];
  private budgetAllocationRules: BudgetAllocationRule[] = [...DEFAULT_BUDGET_ALLOCATION_RULES];
  private budgetConstraints: BudgetConstraints = { ...DEFAULT_BUDGET_CONSTRAINTS };
  private targetingConstraints: TargetingConstraints = { ...DEFAULT_TARGETING_CONSTRAINTS };

  constructor() {}

  public setBudgetConstraints(constraints: Partial<BudgetConstraints>): void {
    this.budgetConstraints = { ...this.budgetConstraints, ...constraints };
  }

  public setTargetingConstraints(constraints: Partial<TargetingConstraints>): void {
    this.targetingConstraints = { ...this.targetingConstraints, ...constraints };
  }

  public addComplianceRule(rule: ComplianceRule): void {
    const existingIdx = this.complianceRules.findIndex(r => r.id === rule.id);
    if (existingIdx >= 0) {
      this.complianceRules[existingIdx] = rule;
    } else {
      this.complianceRules.push(rule);
    }
  }

  public addBudgetAllocationRule(rule: BudgetAllocationRule): void {
    const existingIdx = this.budgetAllocationRules.findIndex(r => r.id === rule.id);
    if (existingIdx >= 0) {
      this.budgetAllocationRules[existingIdx] = rule;
    } else {
      this.budgetAllocationRules.push(rule);
    }
  }

  public evaluateAdRequest(context: AdContext): AdRuleEvaluationResult {
    const violations: AdRuleEvaluationResult['violations'] = [];
    const recommendations: string[] = [];
    let adjustedBudget = context.budget;
    let adjustedBid = context.bidAmount;

    for (const rule of this.complianceRules) {
      const passes = rule.validator(context);
      if (!passes) {
        violations.push({
          ruleId: rule.id,
          message: rule.description,
          severity: rule.severity,
        });
        if (rule.remediation) {
          recommendations.push(rule.remediation);
        }
      }
    }

    for (const rule of this.budgetAllocationRules) {
      if (rule.condition(context)) {
        adjustedBudget *= rule.adjustment;
        recommendations.push(rule.reason);
      }
    }

    adjustedBudget = Math.max(
      PLATFORM_AD_LIMITS[context.platform]?.minDailyBudget || 1,
      Math.min(this.budgetConstraints.dailyLimit - context.dailySpend, adjustedBudget)
    );

    adjustedBid = Math.max(
      this.budgetConstraints.minBidAmount,
      Math.min(this.budgetConstraints.maxBidAmount, adjustedBid)
    );

    const paceRecommendation = this.calculatePaceRecommendation(context);

    const hasBlockingViolation = violations.some(v => v.severity === 'block');

    return {
      allowed: !hasBlockingViolation,
      violations,
      recommendations,
      adjustedBudget: Math.round(adjustedBudget * 100) / 100,
      adjustedBid: Math.round(adjustedBid * 100) / 100,
      paceRecommendation,
    };
  }

  private calculatePaceRecommendation(context: AdContext): 'accelerate' | 'maintain' | 'slow_down' | 'pause' {
    const dailyPaceRatio = context.dailySpend / this.budgetConstraints.dailyLimit;
    const weeklyPaceRatio = context.weeklySpend / this.budgetConstraints.weeklyLimit;
    
    if (context.audienceSaturation > 0.85) {
      return 'pause';
    }
    
    if (dailyPaceRatio > 0.9 || weeklyPaceRatio > 0.9) {
      return 'slow_down';
    }
    
    if (dailyPaceRatio < 0.3 && context.organicEngagementRate < 0.5) {
      return 'accelerate';
    }
    
    return 'maintain';
  }

  public getOptimalBidStrategy(
    platform: string,
    objective: string,
    competitionLevel: number
  ): { strategy: string; suggestedBid: number; reasoning: string } {
    const benchmarks = MUSIC_CAMPAIGN_BENCHMARKS[objective as keyof typeof MUSIC_CAMPAIGN_BENCHMARKS] 
      || MUSIC_CAMPAIGN_BENCHMARKS.awareness;

    let suggestedBid: number;
    let strategy: string;
    let reasoning: string;

    if (competitionLevel > 0.7) {
      suggestedBid = benchmarks.avgCPC.high;
      strategy = 'aggressive';
      reasoning = 'High competition requires aggressive bidding to maintain visibility';
    } else if (competitionLevel > 0.4) {
      suggestedBid = benchmarks.avgCPC.medium;
      strategy = 'balanced';
      reasoning = 'Moderate competition allows for balanced bidding';
    } else {
      suggestedBid = benchmarks.avgCPC.low;
      strategy = 'conservative';
      reasoning = 'Low competition enables cost-efficient conservative bidding';
    }

    const platformMultipliers: Record<string, number> = {
      spotify: 1.5,
      youtube: 1.2,
      tiktok: 0.9,
      instagram: 1.0,
      facebook: 0.95,
      twitter: 0.85,
    };

    suggestedBid *= platformMultipliers[platform] || 1.0;

    return {
      strategy,
      suggestedBid: Math.round(suggestedBid * 100) / 100,
      reasoning,
    };
  }

  public calculateBudgetDistribution(
    totalBudget: number,
    campaignDuration: number,
    releaseDate?: Date
  ): Array<{ day: number; budgetPercentage: number; reasoning: string }> {
    const distribution: Array<{ day: number; budgetPercentage: number; reasoning: string }> = [];
    
    if (releaseDate) {
      const today = new Date();
      const daysUntilRelease = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      for (let day = 1; day <= campaignDuration; day++) {
        let percentage: number;
        let reasoning: string;

        if (day <= daysUntilRelease - 3) {
          percentage = 0.05;
          reasoning = 'Pre-release awareness building';
        } else if (day <= daysUntilRelease) {
          percentage = 0.10;
          reasoning = 'Pre-release hype building';
        } else if (day === daysUntilRelease + 1) {
          percentage = 0.20;
          reasoning = 'Release day maximum push';
        } else if (day <= daysUntilRelease + 7) {
          percentage = 0.12;
          reasoning = 'First week momentum';
        } else {
          percentage = 0.05;
          reasoning = 'Sustaining period';
        }

        distribution.push({ day, budgetPercentage: percentage, reasoning });
      }
    } else {
      const basePercentage = 1 / campaignDuration;
      for (let day = 1; day <= campaignDuration; day++) {
        distribution.push({
          day,
          budgetPercentage: basePercentage,
          reasoning: 'Even distribution for evergreen campaign',
        });
      }
    }

    const totalPercentage = distribution.reduce((sum, d) => sum + d.budgetPercentage, 0);
    return distribution.map(d => ({
      ...d,
      budgetPercentage: Math.round((d.budgetPercentage / totalPercentage) * 10000) / 10000,
    }));
  }

  public shouldPauseForOrganicPerformance(
    organicEngagementRate: number,
    currentAdSpend: number,
    expectedReturn: number
  ): { shouldPause: boolean; reason: string; recommendation: string } {
    const effectiveROI = expectedReturn / currentAdSpend;
    const organicThreshold = 0.65;
    const roiThreshold = 1.5;

    if (organicEngagementRate > organicThreshold && effectiveROI < roiThreshold) {
      return {
        shouldPause: true,
        reason: `Organic engagement (${(organicEngagementRate * 100).toFixed(0)}%) is high while ad ROI (${effectiveROI.toFixed(2)}x) is below threshold`,
        recommendation: 'Pause paid campaigns and let organic momentum continue. Resume when organic declines.',
      };
    }

    if (organicEngagementRate > 0.5 && effectiveROI < 1.2) {
      return {
        shouldPause: false,
        reason: 'Moderate organic performance with low ROI',
        recommendation: 'Reduce ad spend by 30% and monitor for synergy effects.',
      };
    }

    return {
      shouldPause: false,
      reason: 'Ad performance is within acceptable parameters',
      recommendation: 'Continue current strategy with regular optimization.',
    };
  }

  public getAudienceExpansionRecommendation(
    currentAudienceSize: number,
    saturationLevel: number,
    conversionRate: number
  ): { shouldExpand: boolean; expansionFactor: number; strategy: string } {
    if (saturationLevel > 0.75 && conversionRate > 0.03) {
      return {
        shouldExpand: true,
        expansionFactor: 2.0,
        strategy: 'Create lookalike audience from high-value converters',
      };
    }

    if (saturationLevel > 0.60 && conversionRate > 0.02) {
      return {
        shouldExpand: true,
        expansionFactor: 1.5,
        strategy: 'Expand to broader interest targeting',
      };
    }

    if (saturationLevel < 0.40 && conversionRate < 0.01) {
      return {
        shouldExpand: false,
        expansionFactor: 0.7,
        strategy: 'Narrow targeting to improve conversion rate before expanding',
      };
    }

    return {
      shouldExpand: false,
      expansionFactor: 1.0,
      strategy: 'Maintain current audience targeting',
    };
  }
}

export const advertisingRuleEngine = new AdvertisingRuleEngine();
