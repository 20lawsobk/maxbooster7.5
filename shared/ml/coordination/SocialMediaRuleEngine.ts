/**
 * Social Media Rule Engine
 * Deterministic rule-based decision making for social media management
 * Works with learning components for optimization while enforcing hard constraints
 */

export interface PlatformLimits {
  maxDailyPosts: number;
  minPostGapMinutes: number;
  maxHashtags: number;
  maxMentions: number;
  maxCharacters: number;
  maxMediaPerPost: number;
  supportedMediaTypes: string[];
}

export interface ContentGuideline {
  id: string;
  type: 'required' | 'prohibited' | 'recommended';
  description: string;
  validator: (content: string) => boolean;
  severity: 'block' | 'warn' | 'info';
}

export interface SchedulingRule {
  id: string;
  name: string;
  condition: (context: SchedulingContext) => boolean;
  action: 'allow' | 'delay' | 'block';
  delayMinutes?: number;
  reason: string;
}

export interface SchedulingContext {
  platform: string;
  scheduledTime: Date;
  postsSentToday: number;
  lastPostTime?: Date;
  audienceFatigue: number;
  isReleaseCampaign: boolean;
  isTourPromotion: boolean;
  hasActiveAds: boolean;
  organicEngagementRate: number;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  violations: Array<{ ruleId: string; message: string; severity: 'block' | 'warn' | 'info' }>;
  recommendations: string[];
  adjustedScheduleTime?: Date;
}

export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  twitter: {
    maxDailyPosts: 50,
    minPostGapMinutes: 15,
    maxHashtags: 5,
    maxMentions: 10,
    maxCharacters: 280,
    maxMediaPerPost: 4,
    supportedMediaTypes: ['image', 'video', 'gif'],
  },
  instagram: {
    maxDailyPosts: 10,
    minPostGapMinutes: 60,
    maxHashtags: 30,
    maxMentions: 20,
    maxCharacters: 2200,
    maxMediaPerPost: 10,
    supportedMediaTypes: ['image', 'video', 'carousel'],
  },
  tiktok: {
    maxDailyPosts: 5,
    minPostGapMinutes: 120,
    maxHashtags: 10,
    maxMentions: 5,
    maxCharacters: 2200,
    maxMediaPerPost: 1,
    supportedMediaTypes: ['video'],
  },
  facebook: {
    maxDailyPosts: 5,
    minPostGapMinutes: 180,
    maxHashtags: 10,
    maxMentions: 50,
    maxCharacters: 63206,
    maxMediaPerPost: 10,
    supportedMediaTypes: ['image', 'video', 'link'],
  },
  youtube: {
    maxDailyPosts: 3,
    minPostGapMinutes: 240,
    maxHashtags: 15,
    maxMentions: 10,
    maxCharacters: 5000,
    maxMediaPerPost: 1,
    supportedMediaTypes: ['video'],
  },
  linkedin: {
    maxDailyPosts: 3,
    minPostGapMinutes: 240,
    maxHashtags: 5,
    maxMentions: 30,
    maxCharacters: 3000,
    maxMediaPerPost: 9,
    supportedMediaTypes: ['image', 'video', 'document'],
  },
  threads: {
    maxDailyPosts: 20,
    minPostGapMinutes: 30,
    maxHashtags: 5,
    maxMentions: 10,
    maxCharacters: 500,
    maxMediaPerPost: 10,
    supportedMediaTypes: ['image', 'video'],
  },
  googlebusiness: {
    maxDailyPosts: 3,
    minPostGapMinutes: 480,
    maxHashtags: 0,
    maxMentions: 0,
    maxCharacters: 1500,
    maxMediaPerPost: 10,
    supportedMediaTypes: ['image'],
  },
};

export const DEFAULT_CONTENT_GUIDELINES: ContentGuideline[] = [
  {
    id: 'no_excessive_caps',
    type: 'prohibited',
    description: 'Avoid excessive capitalization',
    validator: (content) => {
      const caps = content.replace(/[^A-Z]/g, '').length;
      const letters = content.replace(/[^a-zA-Z]/g, '').length;
      return letters > 0 ? caps / letters < 0.5 : true;
    },
    severity: 'warn',
  },
  {
    id: 'has_call_to_action',
    type: 'recommended',
    description: 'Include a call to action',
    validator: (content) => {
      const ctaPatterns = /\b(listen|watch|click|link|bio|check out|swipe|tap|follow|share|subscribe|comment|tag|dm|stream)\b/i;
      return ctaPatterns.test(content);
    },
    severity: 'info',
  },
  {
    id: 'appropriate_length',
    type: 'recommended',
    description: 'Content should be between 50-200 characters for optimal engagement',
    validator: (content) => content.length >= 50 && content.length <= 200,
    severity: 'info',
  },
  {
    id: 'no_spam_indicators',
    type: 'prohibited',
    description: 'Avoid spam-like patterns',
    validator: (content) => {
      const spamPatterns = /(.)\1{4,}|!!!+|???\+|\$\$\$|free money|click here now/i;
      return !spamPatterns.test(content);
    },
    severity: 'block',
  },
];

export const DEFAULT_SCHEDULING_RULES: SchedulingRule[] = [
  {
    id: 'daily_limit',
    name: 'Daily Post Limit',
    condition: (ctx) => {
      const limits = PLATFORM_LIMITS[ctx.platform];
      return ctx.postsSentToday >= (limits?.maxDailyPosts || 10);
    },
    action: 'block',
    reason: 'Daily post limit reached for this platform',
  },
  {
    id: 'post_gap',
    name: 'Minimum Post Gap',
    condition: (ctx) => {
      if (!ctx.lastPostTime) return false;
      const limits = PLATFORM_LIMITS[ctx.platform];
      const minGapMs = (limits?.minPostGapMinutes || 60) * 60 * 1000;
      return ctx.scheduledTime.getTime() - ctx.lastPostTime.getTime() < minGapMs;
    },
    action: 'delay',
    delayMinutes: 60,
    reason: 'Posts are too close together. Delaying for better engagement.',
  },
  {
    id: 'audience_fatigue',
    name: 'Audience Fatigue Check',
    condition: (ctx) => ctx.audienceFatigue > 0.8,
    action: 'delay',
    delayMinutes: 240,
    reason: 'High audience fatigue detected. Delaying to prevent disengagement.',
  },
  {
    id: 'ad_coordination',
    name: 'Ad Campaign Coordination',
    condition: (ctx) => ctx.hasActiveAds && ctx.organicEngagementRate > 0.7,
    action: 'allow',
    reason: 'Organic content can complement active ad campaigns.',
  },
  {
    id: 'release_priority',
    name: 'Release Campaign Priority',
    condition: (ctx) => ctx.isReleaseCampaign,
    action: 'allow',
    reason: 'Release campaign content has priority scheduling.',
  },
  {
    id: 'weekend_check',
    name: 'Weekend Engagement Adjustment',
    condition: (ctx) => {
      const day = ctx.scheduledTime.getDay();
      return (day === 0 || day === 6) && !ctx.isReleaseCampaign && !ctx.isTourPromotion;
    },
    action: 'delay',
    delayMinutes: 180,
    reason: 'Weekend posting adjusted for optimal audience activity.',
  },
];

export class SocialMediaRuleEngine {
  private contentGuidelines: ContentGuideline[] = [...DEFAULT_CONTENT_GUIDELINES];
  private schedulingRules: SchedulingRule[] = [...DEFAULT_SCHEDULING_RULES];
  private customPlatformLimits: Map<string, Partial<PlatformLimits>> = new Map();

  constructor() {}

  public addContentGuideline(guideline: ContentGuideline): void {
    const existingIdx = this.contentGuidelines.findIndex(g => g.id === guideline.id);
    if (existingIdx >= 0) {
      this.contentGuidelines[existingIdx] = guideline;
    } else {
      this.contentGuidelines.push(guideline);
    }
  }

  public addSchedulingRule(rule: SchedulingRule): void {
    const existingIdx = this.schedulingRules.findIndex(r => r.id === rule.id);
    if (existingIdx >= 0) {
      this.schedulingRules[existingIdx] = rule;
    } else {
      this.schedulingRules.push(rule);
    }
  }

  public setCustomPlatformLimits(platform: string, limits: Partial<PlatformLimits>): void {
    this.customPlatformLimits.set(platform.toLowerCase(), limits);
  }

  public getPlatformLimits(platform: string): PlatformLimits {
    const base = PLATFORM_LIMITS[platform.toLowerCase()] || PLATFORM_LIMITS.twitter;
    const custom = this.customPlatformLimits.get(platform.toLowerCase());
    return custom ? { ...base, ...custom } : base;
  }

  public evaluateContent(content: string, platform: string): RuleEvaluationResult {
    const violations: RuleEvaluationResult['violations'] = [];
    const recommendations: string[] = [];
    const limits = this.getPlatformLimits(platform);

    if (content.length > limits.maxCharacters) {
      violations.push({
        ruleId: 'character_limit',
        message: `Content exceeds ${limits.maxCharacters} character limit for ${platform}`,
        severity: 'block',
      });
    }

    const hashtagCount = (content.match(/#\w+/g) || []).length;
    if (hashtagCount > limits.maxHashtags) {
      violations.push({
        ruleId: 'hashtag_limit',
        message: `Too many hashtags (${hashtagCount}/${limits.maxHashtags})`,
        severity: 'warn',
      });
    }

    const mentionCount = (content.match(/@\w+/g) || []).length;
    if (mentionCount > limits.maxMentions) {
      violations.push({
        ruleId: 'mention_limit',
        message: `Too many mentions (${mentionCount}/${limits.maxMentions})`,
        severity: 'warn',
      });
    }

    for (const guideline of this.contentGuidelines) {
      const passes = guideline.validator(content);
      
      if (guideline.type === 'prohibited' && !passes) {
        violations.push({
          ruleId: guideline.id,
          message: guideline.description,
          severity: guideline.severity,
        });
      } else if (guideline.type === 'required' && !passes) {
        violations.push({
          ruleId: guideline.id,
          message: `Missing required: ${guideline.description}`,
          severity: guideline.severity,
        });
      } else if (guideline.type === 'recommended' && !passes) {
        recommendations.push(guideline.description);
      }
    }

    const hasBlockingViolation = violations.some(v => v.severity === 'block');

    return {
      allowed: !hasBlockingViolation,
      violations,
      recommendations,
    };
  }

  public evaluateScheduling(context: SchedulingContext): RuleEvaluationResult {
    const violations: RuleEvaluationResult['violations'] = [];
    const recommendations: string[] = [];
    let adjustedTime: Date | undefined;
    let maxDelay = 0;

    for (const rule of this.schedulingRules) {
      if (rule.condition(context)) {
        if (rule.action === 'block') {
          violations.push({
            ruleId: rule.id,
            message: rule.reason,
            severity: 'block',
          });
        } else if (rule.action === 'delay' && rule.delayMinutes) {
          violations.push({
            ruleId: rule.id,
            message: rule.reason,
            severity: 'warn',
          });
          maxDelay = Math.max(maxDelay, rule.delayMinutes);
        }
      }
    }

    if (maxDelay > 0) {
      adjustedTime = new Date(context.scheduledTime.getTime() + maxDelay * 60 * 1000);
    }

    const hour = context.scheduledTime.getHours();
    if (hour < 6 || hour > 23) {
      recommendations.push('Consider scheduling between 6 AM and 11 PM for better engagement');
    }

    const hasBlockingViolation = violations.some(v => v.severity === 'block');

    return {
      allowed: !hasBlockingViolation,
      violations,
      recommendations,
      adjustedScheduleTime: adjustedTime,
    };
  }

  public evaluatePost(
    content: string,
    platform: string,
    context: SchedulingContext
  ): RuleEvaluationResult {
    const contentResult = this.evaluateContent(content, platform);
    const schedulingResult = this.evaluateScheduling(context);

    return {
      allowed: contentResult.allowed && schedulingResult.allowed,
      violations: [...contentResult.violations, ...schedulingResult.violations],
      recommendations: [...contentResult.recommendations, ...schedulingResult.recommendations],
      adjustedScheduleTime: schedulingResult.adjustedScheduleTime,
    };
  }

  public getOptimalPostingWindows(platform: string): Array<{ hourStart: number; hourEnd: number; quality: 'best' | 'good' | 'avoid' }> {
    const windows: Record<string, Array<{ hourStart: number; hourEnd: number; quality: 'best' | 'good' | 'avoid' }>> = {
      twitter: [
        { hourStart: 9, hourEnd: 11, quality: 'best' },
        { hourStart: 12, hourEnd: 13, quality: 'best' },
        { hourStart: 17, hourEnd: 19, quality: 'good' },
        { hourStart: 0, hourEnd: 6, quality: 'avoid' },
      ],
      instagram: [
        { hourStart: 11, hourEnd: 13, quality: 'best' },
        { hourStart: 19, hourEnd: 21, quality: 'best' },
        { hourStart: 7, hourEnd: 9, quality: 'good' },
        { hourStart: 0, hourEnd: 6, quality: 'avoid' },
      ],
      tiktok: [
        { hourStart: 7, hourEnd: 9, quality: 'best' },
        { hourStart: 12, hourEnd: 15, quality: 'best' },
        { hourStart: 19, hourEnd: 22, quality: 'best' },
        { hourStart: 2, hourEnd: 6, quality: 'avoid' },
      ],
      facebook: [
        { hourStart: 9, hourEnd: 11, quality: 'best' },
        { hourStart: 13, hourEnd: 16, quality: 'good' },
        { hourStart: 19, hourEnd: 21, quality: 'good' },
        { hourStart: 0, hourEnd: 7, quality: 'avoid' },
      ],
      youtube: [
        { hourStart: 12, hourEnd: 16, quality: 'best' },
        { hourStart: 20, hourEnd: 22, quality: 'good' },
        { hourStart: 0, hourEnd: 8, quality: 'avoid' },
      ],
      linkedin: [
        { hourStart: 8, hourEnd: 10, quality: 'best' },
        { hourStart: 12, hourEnd: 13, quality: 'best' },
        { hourStart: 17, hourEnd: 18, quality: 'good' },
        { hourStart: 21, hourEnd: 7, quality: 'avoid' },
      ],
    };

    return windows[platform.toLowerCase()] || windows.instagram;
  }
}

export const socialMediaRuleEngine = new SocialMediaRuleEngine();
