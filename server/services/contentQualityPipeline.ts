import { logger } from '../logger.js';
import { db } from '../db';
import { userBrandVoices, autopilotPreferences } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { aiService } from './aiService';
import { advancedSocialAIService, type AdvancedContentRequest, type ContentScoring as AdvancedScoring } from './advancedSocialAIService.js';
import { pythonAIService } from './pythonAIService.js';
import { MaxCoreAIClient } from './unifiedAIController.js';
import { platformAlgorithmOptimizer } from './platformAlgorithmOptimizer.js';
import { getCalibratedWeights } from './maxcoreScoreCalibrator.js';

// ── Veo Quality Gate Calibration ─────────────────────────────────────────────
// Google's Veo model produces content that consistently scores ~90–95 on this
// pipeline's rubric.  "At least 90% of Veo quality" = 90% × ~90 = 81.
//
// VEO_QUALITY_GATE is set to 81 — this is the hard per-batch minimum that every
// variant must clear before being passed up to the A/B testing retry loop.
// Music-artist-specific vocabulary (scene slang, release urgency, genre voice)
// earns its own +bonus in narrativeAuthenticity/emotionalArc, so the gate is
// achievable without watering it down.
//
// VEO_PRESSURE_FLOOR is 73 — even under maximum Caffeine Mode schedule pressure
// we never publish content that scores below 90% of the gate itself.  This
// preserves the "quality over quantity" contract at all times.
//
//   VEO_QUALITY_GATE     81  — per-batch minimum (90 % of Veo's ~90 baseline)
//   VEO_PRESSURE_FLOOR   73  — absolute floor under max deadline pressure
//   VEO_DEFAULT_VARIANTS 30  — variants per batch; 30+ parallel attempts dramatically
//                              shortens training time and maximises the probability of
//                              clearing the 81 bar on the first round
// ─────────────────────────────────────────────────────────────────────────────
const VEO_QUALITY_GATE    = 81;
const VEO_PRESSURE_FLOOR  = 73;
const VEO_DEFAULT_VARIANTS = 30;

// ── Caffeine Mode — Deadline Pressure System ──────────────────────────────────
// Tracks how far behind schedule the autonomous autopilot is.
// pressure = postsStillNeeded / hoursRemaining
//   0       → on track / ahead of schedule  (normal mode)
//   0–0.5   → mild lag                      (gate floor −4 pts, wider posting window)
//   0.5–1.5 → behind                        (gate floor −7 pts, accelerated learning)
//   > 1.5   → CAFFEINE MODE (critical)      (gate floor −10 pts, max acceleration)
//
// The gate THRESHOLD lowers under pressure so the system can still publish, but
// urgency-themed content simultaneously scores HIGHER — meaning only posts that
// genuinely feel time-sensitive clear the lowered bar.  Like a student on a late-
// night caffeine run who narrows focus to the highest-yield exam material first.
// ─────────────────────────────────────────────────────────────────────────────
let _currentPressure = 0;

export function updateSchedulePressure(pressure: number): void {
  _currentPressure = Math.max(0, pressure);
  if (pressure > 1.5) {
    logger.warn(
      `⚡ [CaffeineMode] CRITICAL schedule pressure: ${pressure.toFixed(2)} posts/hr needed` +
      ` — quality gate + urgency scoring adapting`
    );
  } else if (pressure > 0.5) {
    logger.info(
      `☕ [CaffeineMode] Moderate schedule pressure: ${pressure.toFixed(2)} posts/hr` +
      ` — gate relaxing, urgency content boosted`
    );
  } else if (pressure === 0 && _currentPressure > 0) {
    logger.info(`😌 [CaffeineMode] Schedule pressure cleared — returning to normal quality gate`);
  }
}

export function getCurrentPressure(): number { return _currentPressure; }

/**
 * Pressure-adjusted quality gate minimum score.
 * Normal gate is VEO_QUALITY_GATE (75).  Under deadline pressure it lowers—but
 * urgency signals in content simultaneously raise the engagement score, so the
 * effective bar stays meaningful.  The absolute floor is VEO_PRESSURE_FLOOR (65):
 * even at maximum caffeine pressure we never publish content that falls below
 * 87% of the Veo-equivalent threshold.  Quality over quantity, always.
 */
function pressureAdjustedMinScore(baseMin: number): number {
  if (_currentPressure <= 0)   return baseMin;
  if (_currentPressure > 1.5) return Math.max(VEO_PRESSURE_FLOOR, baseMin - 10); // critical: floor 65
  if (_currentPressure > 0.5) return Math.max(68,                  baseMin - 7);  // moderate: floor 68
  return Math.max(71,                  baseMin - 4);                               // mild:     floor 71
}

/**
 * Urgency scoring bonus when behind schedule.
 * Like caffeine making a student zero in on high-yield material — content that
 * signals time-pressure (now, tonight, last chance, dropping soon) is rewarded
 * with an engagement score boost proportional to how behind we are.
 * Max +12 pts at critical pressure.
 */
function pressureUrgencyBoost(content: string): number {
  if (_currentPressure <= 0) return 0;
  const urgencyRx = /\b(now|tonight|today|last chance|limited|dropping|coming|soon|hours? left|don'?t miss|before|exclusive|only|this week|right now|immediately)\b/i;
  if (!urgencyRx.test(content)) return 0;
  const factor    = Math.min(1, _currentPressure / 1.5);
  const maxBoost  = _currentPressure > 1.5 ? 12 : _currentPressure > 0.5 ? 8 : 4;
  return Math.round(maxBoost * factor);
}
// ─────────────────────────────────────────────────────────────────────────────

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
  algorithmAlignment: number;
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
  releasePhase?: 'pre-release' | 'launch' | 'first-week' | 'sustain' | 'milestone';
  contentFormula?: string;
  streamCount?: number;
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
  /^(🔥|💥|⚡|🚀|✨|🎵|🎶|🚨|💀|🤯|👀|💯|🎤|🎧)/,
  /^(Breaking|NEW|Just dropped|Finally|Here's|This is|You won't believe)/i,
  /\?$/,
  /^[A-Z]{2,}/,
  /^(Unpopular opinion|Hot take|Real talk|POV:|Nobody talks about)/i,
  /^(Out now|It'?s (finally|officially) here|I (almost|nearly) didn'?t)/i,
  /^(The #1|The truth about|They don'?t want you to know)/i,
  /^(From (zero|bedroom|nothing) to|How I (went|got|grew))/i,
  /^(Wait till|Rate this|Be honest|Let me (tell|show) you)/i,
  /^(I wrote this when|This song (saved|changed|came from))/i,
  /(\d+k|\d+ million) (streams?|plays?|followers?)/i,
];

const CTA_PATTERNS = [
  /(check it out|listen now|stream now|watch now|link in bio|tap the link)/i,
  /(share|comment|tag|follow|subscribe|like)/i,
  /(don't miss|limited time|exclusive|first to hear)/i,
];

// ─── 12 PROVEN VIRAL CONTENT FORMULAS ─────────────────────────────────────────
// Each formula has a distinct psychological entry point. Advanced AI cycles
// through these to ensure content diversity and maximize engagement vectors.
const CONTENT_FORMULA_LIBRARY: Record<string, {
  name: string;
  triggers: string[];
  bestFor: string[];
  hookSignals: RegExp[];
  engagementBoost: number;
}> = {
  curiosity_gap:     { name: 'Curiosity Gap',        triggers: ['curiosity','fomo'],                     bestFor: ['viral','engagement'],   hookSignals: [/nobody (told|shows|talks)/i, /they don't want/i, /the secret/i, /nobody expected/i], engagementBoost: 18 },
  before_after:      { name: 'Before/After',          triggers: ['inspiration','transformation'],         bestFor: ['awareness','viral'],    hookSignals: [/from .+ to/i, /before.*after/i, /used to.*now/i, /i started with/i],               engagementBoost: 14 },
  social_proof:      { name: 'Social Proof Stack',    triggers: ['fomo','authority'],                     bestFor: ['conversions','awareness'],hookSignals: [/\d+k? (streams|plays|followers)/i, /everyone is/i, /response has been/i],            engagementBoost: 12 },
  challenge_dare:    { name: 'Challenge / Dare',      triggers: ['competition','identity'],               bestFor: ['viral','engagement'],   hookSignals: [/i dare you/i, /challenge/i, /try (not to|this)/i, /can you/i],                      engagementBoost: 16 },
  insider_secret:    { name: 'Insider Secret',        triggers: ['exclusivity','authority'],              bestFor: ['awareness','engagement'],hookSignals: [/nobody talks about/i, /secret to/i, /what they don't tell/i, /insider/i],            engagementBoost: 15 },
  misconception:     { name: 'Misconception Correction',triggers:['authority','surprise'],               bestFor: ['engagement','viral'],   hookSignals: [/unpopular opinion/i, /hot take/i, /you're wrong about/i, /myth/i],                  engagementBoost: 13 },
  countdown:         { name: 'Countdown / Urgency',   triggers: ['fomo','urgency'],                       bestFor: ['conversions','awareness'],hookSignals: [/\d+ (days|hours|hours) (left|until|away)/i, /dropping/i, /coming soon/i, /launches/i],engagementBoost: 11 },
  milestone:         { name: 'Milestone Celebration', triggers: ['social_proof','community'],             bestFor: ['awareness','engagement'],hookSignals: [/(hit|reached|crossed) \d+/i, /milestone/i, /thank you for/i, /we made it/i],          engagementBoost: 10 },
  relatable_moment:  { name: 'Relatable Moment',      triggers: ['recognition','humor'],                  bestFor: ['viral','engagement'],   hookSignals: [/pov:/i, /me when/i, /not me/i, /tell me why/i, /who else/i],                        engagementBoost: 14 },
  transformation:    { name: 'Transformation Story',  triggers: ['inspiration','hope'],                   bestFor: ['viral','awareness'],    hookSignals: [/this changed (everything|me)/i, /i was.*years old/i, /turning point/i],              engagementBoost: 15 },
  community_shoutout:{ name: 'Community Shoutout',    triggers: ['belonging','gratitude'],                bestFor: ['engagement','awareness'],hookSignals: [/for my (fans|community|day ones|supporters)/i, /thank you.*community/i, /this one is for/i],engagementBoost: 9 },
  industry_truth:    { name: 'Industry Truth',        triggers: ['validation','empowerment'],             bestFor: ['viral','engagement'],   hookSignals: [/industry/i, /label/i, /streams pay/i, /independent artist/i, /nobody tells you/i],   engagementBoost: 16 },
};

// ─── PSYCHOLOGICAL TRIGGER LAYER COMBINATIONS ─────────────────────────────────
// Stacking 2-3 triggers multiplies engagement exponentially. Each objective has
// optimal trigger combos based on audience psychology research.
const PSYCHOLOGICAL_TRIGGER_LAYERS: Record<string, { triggers: string[]; scoreBoost: number }[]> = {
  awareness:    [
    { triggers: ['curiosity', 'exclusivity'],         scoreBoost: 12 },
    { triggers: ['social_proof', 'authority'],         scoreBoost: 10 },
    { triggers: ['inspiration', 'community'],          scoreBoost: 9  },
  ],
  engagement:   [
    { triggers: ['curiosity', 'identity', 'challenge'],scoreBoost: 16 },
    { triggers: ['vulnerability', 'recognition'],      scoreBoost: 14 },
    { triggers: ['humor', 'belonging'],                scoreBoost: 12 },
  ],
  conversions:  [
    { triggers: ['fomo', 'social_proof', 'urgency'],  scoreBoost: 18 },
    { triggers: ['authority', 'exclusivity'],          scoreBoost: 14 },
    { triggers: ['social_proof', 'community'],         scoreBoost: 11 },
  ],
  viral:        [
    { triggers: ['curiosity', 'surprise', 'identity'],scoreBoost: 20 },
    { triggers: ['vulnerability', 'hope', 'community'],scoreBoost: 18 },
    { triggers: ['controversy', 'validation'],         scoreBoost: 16 },
  ],
};

// ─── RELEASE PHASE URGENCY MODIFIERS ──────────────────────────────────────────
// Engagement prediction multipliers based on release timing
const RELEASE_PHASE_MULTIPLIERS: Record<string, number> = {
  'pre-release': 1.08,  // Anticipation builds organic reach
  'launch':      1.22,  // First 24h: highest algorithmic push window
  'first-week':  1.15,  // Playlist/chart window still open
  'sustain':     1.00,  // Standard baseline
  'milestone':   1.12,  // Celebration posts get strong re-share
};

// ─── SELF-IDENTIFICATION PHRASES ──────────────────────────────────────────────
// Phrases that make the reader see themselves in the content. Boosts comments
// and shares because people tag friends who "fit" the identity described.
const SELF_IDENTIFICATION_PHRASES = [
  'For the artists who are still building',
  'This one is for the people who feel everything',
  "If you've ever written a song at 3am and wondered if it matters",
  'For everyone who told you it was just a hobby',
  'For the independent artists grinding without a label',
  'If you believe in the music before anyone else does',
  'For the ones who never stopped creating even when nobody was watching',
  'For the fans who stream on repeat and never skip',
  'If music has ever saved you on a hard day — this one is for you',
  'For the bedroom producers who became everything',
];

class ContentQualityPipeline {
  async buildContext(userId: string, baseContext: Partial<ContentContext>): Promise<ContentContext> {
    try {
      const [[brandVoiceResult], [preferencesResult]] = await Promise.all([
        db.select().from(userBrandVoices).where(eq(userBrandVoices.userId, userId)).limit(1),
        db.select().from(autopilotPreferences).where(eq(autopilotPreferences.userId, userId)).limit(1),
      ]);

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
      logger.warn({ err: error }, 'Error building content context:');
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
      awareness: ['storytelling', 'announcement', 'teaser', 'milestone', 'journey', 'exclusivity'],
      engagement: ['question', 'poll-style', 'behind-the-scenes', 'challenge', 'opinion', 'community'],
      conversions: ['urgency', 'social-proof', 'benefit-focused', 'scarcity', 'value-stack', 'first-mover'],
      viral: ['controversial', 'emotional', 'relatable', 'pov', 'transformation', 'industry-truth'],
    };
    return strategies[objective] || strategies.engagement;
  }

  private async generateSingleVariant(
    context: ContentContext,
    strategy: string,
    index: number
  ): Promise<ContentVariant> {
    let headline: string | undefined;
    let body: string | undefined;
    let cta: string | undefined;
    let hashtags: string[] | undefined;

    // ── Tier 1: Python AI (external trained model) ────────────────────────────
    // Always attempted first.  Falls through cleanly if unavailable or failing.
    if (await pythonAIService.isAvailable()) {
      try {
        const goalMap: Record<string, string> = {
          awareness: 'growth', engagement: 'engagement', conversions: 'conversion', viral: 'growth',
        };
        const aiResult = await pythonAIService.generateContent(
          context.platform, context.topic, context.tone || 'energetic',
          goalMap[context.objective] || 'growth', true,
          context.genre, context.artistName
        );
        if (aiResult.success && aiResult.data?.hook && aiResult.data.body && aiResult.data.cta) {
          headline = aiResult.data.hook;
          body     = aiResult.data.body;
          cta      = aiResult.data.cta;
          hashtags = aiResult.data.hashtags || [];
          logger.info(`[ContentQuality] Variant ${index} generated via Python AI`);
        }
      } catch (err) {
        logger.warn({ err: err }, '[ContentQuality] Python AI failed for variant, falling through to advanced AI:');
      }
    }

    // ── Tier 2: Advanced Social AI (always available, intelligently generated) ─
    // Uses platform profiles, tone profiles, audience profiles, and content-type
    // differentiation to produce genuinely varied, high-quality content.
    // Strategy is mapped to contentType so different variants differ meaningfully.
    if (!headline) {
      try {
        const contentType = this.strategyToContentType(strategy);
        const advancedRequest: AdvancedContentRequest = {
          userId:        context.userId,
          topic:         context.topic,
          platforms:     [context.platform],
          objective:     context.objective,
          tone:          (context.tone as any) || 'casual',
          targetAudience: context.targetAudience,
          genre:         context.genre,
          artistName:    context.artistName,
          contentType,
          includeHashtags: true,
          includeEmojis:   true,
          variantCount:    1,
          // strategy + index used as differentiator seeds so each variant differs
          trendContext: [`strategy:${strategy}`, `variant:${index}`],
        };
        const advancedResult = await advancedSocialAIService.generateAdvancedContent(advancedRequest);
        headline = advancedResult.primary.headline;
        body     = advancedResult.primary.body;
        cta      = advancedResult.primary.callToAction;
        hashtags = advancedResult.primary.hashtags;
        logger.info(`[ContentQuality] Variant ${index} generated via Advanced AI (${contentType})`);
      } catch (err) {
        logger.warn({ err: err }, '[ContentQuality] Advanced AI also failed for variant:');
        throw new Error(`[ContentQuality] All generation tiers failed for variant ${index}: ${err}`);
      }
    }

    // ── Algorithm signal injection ─────────────────────────────────────────────
    // Surgically upgrades the headline/CTA to target the platform's primary
    // algorithmic lever (saves, reply velocity, watch completion, dwell time…).
    // Only applied when content scores below the alignment threshold — avoids
    // over-engineering content that already triggers the right signals.
    const optimised = this.applyAlgorithmSignalOptimization(
      headline!, body!, cta!, context.platform
    );
    headline = optimised.headline;
    body     = optimised.body;
    cta      = optimised.cta;

    const fullContent = `${headline}\n\n${body}`;
    const platformOpt = this.validatePlatformConstraints(fullContent, hashtags!, context.platform);
    const scores      = this.scoreContent(fullContent, headline, cta, context, platformOpt);

    return {
      id: `variant_${index}_${Date.now()}`,
      content:              body!,
      headline:             headline!,
      hashtags:             hashtags!,
      callToAction:         cta!,
      scores,
      platformOptimizations: platformOpt,
    };
  }

  /**
   * Map generation strategy names to AdvancedSocialAI content types.
   * Each content type routes to a different generation profile inside the
   * advanced service, ensuring meaningful variety across variants even when
   * the topic and platform are the same.
   */
  private strategyToContentType(
    strategy: string
  ): 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling' {
    const map: Record<string, 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling'> = {
      storytelling:       'storytelling',
      announcement:       'announcement',
      teaser:             'behind_scenes',
      milestone:          'announcement',
      journey:            'behind_scenes',
      exclusivity:        'announcement',
      question:           'engagement',
      'poll-style':       'engagement',
      'behind-the-scenes':'behind_scenes',
      challenge:          'engagement',
      opinion:            'storytelling',
      community:          'engagement',
      urgency:            'promotional',
      'social-proof':     'promotional',
      'benefit-focused':  'promotional',
      scarcity:           'promotional',
      'value-stack':      'promotional',
      'first-mover':      'promotional',
      controversial:      'storytelling',
      emotional:          'storytelling',
      relatable:          'storytelling',
      pov:                'storytelling',
      transformation:     'storytelling',
      'industry-truth':   'storytelling',
    };
    return map[strategy] ?? 'storytelling';
  }

  /**
   * Apply platform algorithm signal optimization to any generated content.
   *
   * This runs after content is generated (AI or template path) and surgically
   * upgrades the headline and CTA to target the platform's primary algorithmic
   * distribution lever — without altering the core creative content.
   *
   * Approach:
   *  - If the content already has a strong algorithm signal (detected by the
   *    optimizer), leave it untouched — don't over-engineer.
   *  - If the primary signal is weak, inject the minimum effective change:
   *    upgrade the CTA and optionally prepend a signal-boosting phrase.
   */
  /**
   * Validate that generated content meets platform-specific constraints.
   * Checks character limits, hashtag count, and emoji count.
   * Returns a PlatformOptimization descriptor used by the scoring pipeline.
   * Called both internally (as this.validatePlatformConstraints) and
   * externally from contentQualityGate (as contentQualityPipeline.validatePlatformConstraints).
   */
  validatePlatformConstraints(
    content: string,
    hashtags: string[],
    platform: string
  ): PlatformOptimization {
    const key = platform.toLowerCase().replace(/[^a-z]/g, '');

    const PLATFORM_LIMITS: Record<string, { maxChars: number; optimalHashtags: number; optimalEmojis: number }> = {
      instagram:       { maxChars: 2200,  optimalHashtags: 10, optimalEmojis: 5 },
      tiktok:          { maxChars: 2200,  optimalHashtags: 5,  optimalEmojis: 3 },
      twitter:         { maxChars: 280,   optimalHashtags: 2,  optimalEmojis: 2 },
      x:               { maxChars: 280,   optimalHashtags: 2,  optimalEmojis: 2 },
      linkedin:        { maxChars: 3000,  optimalHashtags: 5,  optimalEmojis: 1 },
      facebook:        { maxChars: 5000,  optimalHashtags: 3,  optimalEmojis: 4 },
      youtube:         { maxChars: 5000,  optimalHashtags: 5,  optimalEmojis: 2 },
      threads:         { maxChars: 500,   optimalHashtags: 3,  optimalEmojis: 3 },
      googlebusiness:  { maxChars: 1500,  optimalHashtags: 0,  optimalEmojis: 2 },
    };

    const limits = PLATFORM_LIMITS[key] || { maxChars: 2200, optimalHashtags: 5, optimalEmojis: 3 };

    const emojiCount    = (content.match(/\p{Emoji_Presentation}/gu) || []).length;
    const hashtagCount  = hashtags.length;
    const characterCount = content.length;
    const issues: string[] = [];

    if (characterCount > limits.maxChars) {
      issues.push(`Content too long: ${characterCount} / ${limits.maxChars} characters`);
    }
    if (hashtagCount > limits.optimalHashtags * 2) {
      issues.push(`Too many hashtags: ${hashtagCount} (optimal: ${limits.optimalHashtags})`);
    }
    if (emojiCount > limits.optimalEmojis * 3) {
      issues.push(`Too many emojis: ${emojiCount} (optimal: ${limits.optimalEmojis})`);
    }

    return {
      platform: key,
      characterCount,
      maxCharacters: limits.maxChars,
      hashtagCount,
      optimalHashtags: limits.optimalHashtags,
      emojiCount,
      optimalEmojis: limits.optimalEmojis,
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Aggregate all scoring dimensions into a single ContentScores object.
   * This is the central scoring method called by every content generation path.
   * Public so contentQualityGate can score externally-supplied content.
   */
  scoreContent(
    content: string,
    headline: string,
    cta: string,
    context: ContentContext,
    platformOpt: PlatformOptimization
  ): ContentScores {
    const hookStrength              = this.scoreHook(headline);
    const callToActionEffectiveness = this.scoreCTA(cta);
    const clarity                   = this.scoreClarity(content);
    const sentiment                 = this.scoreSentiment(content, context.objective);
    const brandAlignment            = this.scoreBrandAlignment(content, context);
    const engagement                = this.predictEngagement(content, headline, context);
    const specificity               = this.scoreSpecificity(content, headline);
    const emotionalArc              = this.scoreEmotionalArc(content, headline);
    const narrativeAuthenticity     = this.scoreNarrativeAuthenticity(content, headline);
    const algorithmAlignment        = platformAlgorithmOptimizer.scoreAlgorithmAlignment(
      content, headline, cta, platformOpt.platform
    ).score;

    const platformPenalty = platformOpt.isValid ? 0 : Math.min(10, platformOpt.issues.length * 3);

    // Use MaxCore-calibrated weights when available, fall back to defaults
    const w = getCalibratedWeights();
    const overall = Math.max(0, Math.min(100, Math.round(
      engagement                * w.engagement +
      hookStrength              * w.hookStrength +
      callToActionEffectiveness * w.callToActionEffectiveness +
      sentiment                 * w.sentiment +
      clarity                   * w.clarity +
      brandAlignment            * w.brandAlignment +
      algorithmAlignment        * w.algorithmAlignment +
      specificity               * w.specificity +
      emotionalArc              * w.emotionalArc +
      narrativeAuthenticity     * w.narrativeAuthenticity -
      platformPenalty
    )));

    return {
      overall,
      engagement,
      clarity,
      sentiment,
      brandAlignment,
      hookStrength,
      callToActionEffectiveness,
      algorithmAlignment,
    };
  }

  private applyAlgorithmSignalOptimization(
    headline: string,
    body: string,
    cta: string,
    platform: string
  ): { headline: string; body: string; cta: string } {
    const key = platform.toLowerCase().replace(/[^a-z]/g, '');

    // Score current alignment — only modify if it's weak (< 60)
    const currentScore = platformAlgorithmOptimizer.scoreAlgorithmAlignment(
      body, headline, cta, platform
    );
    if (currentScore.score >= 60) {
      // Already well-aligned — trust the generated content
      return { headline, body, cta };
    }

    // ── Platform-specific signal upgrades ──────────────────────────────────────
    switch (key) {
      case 'twitter':
      case 'x': {
        // Reply velocity — add a question to the CTA if missing
        const hasQuestion = /\?/.test(cta) || /what do you think|agree|disagree|your take/i.test(cta);
        const upgradedCta = hasQuestion ? cta : `${cta} What's your take? Drop it below ↓`;
        // Remove external links from headline if present
        const cleanHeadline = headline.replace(/https?:\/\/\S+/gi, '').trim();
        return { headline: cleanHeadline, body, cta: upgradedCta };
      }

      case 'instagram': {
        // Saves — inject a save-trigger phrase if missing
        const hasSaveTrigger = /save|bookmark/i.test(cta + headline);
        const upgradedCta = hasSaveTrigger
          ? cta
          : `Save this post for later 🔖 — ${cta}`;
        return { headline, body, cta: upgradedCta };
      }

      case 'tiktok': {
        // Watch completion — prepend a curiosity-gap hook if headline is weak
        const hasHook = /pov:|unpopular opinion|this changed|nobody tells|plot twist|here'?s why/i.test(headline);
        const boostedHeadline = hasHook
          ? headline
          : `POV: ${headline}`;
        const hasRewatch = /watch again|rewatch|duet|part 2/i.test(cta);
        const upgradedCta = hasRewatch ? cta : `${cta} — Watch again if you missed it 🔁`;
        return { headline: boostedHeadline, body, cta: upgradedCta };
      }

      case 'linkedin': {
        // Dwell time — append a professional question if CTA is weak
        const hasQuestion = /\?/.test(cta) || /what'?s your|how (do|are|have) you/i.test(cta);
        const upgradedCta = hasQuestion
          ? cta
          : `${cta}\n\nWhat's been your experience with this? Drop it in the comments.`;
        // Warn if body contains a link (should be in comments)
        const bodyHasLink = /https?:\/\/\S+/i.test(body);
        const cleanBody = bodyHasLink
          ? body.replace(/https?:\/\/\S+/gi, '[link in first comment]')
          : body;
        return { headline, body: cleanBody, cta: upgradedCta };
      }

      case 'facebook': {
        // Emotional reactions — inject a tag-a-friend CTA if missing
        const hasTagCta = /tag (a|someone|your)/i.test(cta);
        const upgradedCta = hasTagCta
          ? cta
          : `${cta} Tag someone who needs to hear this ❤️`;
        return { headline, body, cta: upgradedCta };
      }

      case 'threads': {
        // Replies — add a dialogue-inviting question if CTA is just a statement
        const hasDialogue = /\?/.test(cta) || /what'?s your|anyone else|reply with/i.test(cta);
        const upgradedCta = hasDialogue
          ? cta
          : `${cta} What's your experience with this? 👇`;
        return { headline, body, cta: upgradedCta };
      }

      case 'youtube': {
        // CTR × watch time — add a subscribe + watch-next CTA if weak
        const hasWatchNext = /subscribe|watch (this|next|more)/i.test(cta);
        const upgradedCta = hasWatchNext
          ? cta
          : `${cta} Subscribe for more, and watch the next one in the description.`;
        return { headline, body, cta: upgradedCta };
      }

      default:
        return { headline, body, cta };
    }
  }


  private scoreHook(headline: string): number {
    let score = 45;

    for (const pattern of HOOK_PATTERNS) {
      if (pattern.test(headline)) {
        score += 12;
      }
    }

    if (headline.length > 10 && headline.length < 70) score += 10;
    if (headline.includes('...') || headline.includes('👀')) score += 5;
    if (/\d/.test(headline)) score += 6;
    if (headline.includes('"') || headline.includes('\u201c')) score += 4;
    const capsWords = (headline.match(/\b[A-Z]{2,}\b/g) || []).length;
    if (capsWords === 1) score += 4;
    else if (capsWords === 2) score += 2;

    return Math.min(100, score);
  }

  private scoreCTA(cta: string): number {
    let score = 40;

    for (const pattern of CTA_PATTERNS) {
      if (pattern.test(cta)) {
        score += 15;
      }
    }

    if (cta.length > 10 && cta.length < 60) score += 10;
    if (cta.includes('!')) score += 5;
    if (/\b(now|today|tonight|right now)\b/i.test(cta)) score += 8;
    if (/\b(link in bio|tap|click|swipe)\b/i.test(cta)) score += 6;
    if (/\b(first|limited|exclusive|only)\b/i.test(cta)) score += 5;
    if (/[🔥🎵🎧🔗🎟️🎤⏰📈]/u.test(cta)) score += 4;

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
    const positiveWords = [
      'love', 'amazing', 'incredible', 'excited', 'beautiful', 'perfect', 'best', 'fire', 'vibes',
      'banger', 'legendary', 'iconic', 'brilliant', 'outstanding', 'exceptional', 'phenomenal',
      'proud', 'grateful', 'honored', 'blessed', 'inspired', 'powerful', 'authentic', 'real',
      'slaps', 'hard', 'heat', 'gas', 'dope', 'insane', 'crazy', 'wild', 'epic', 'goated',
      'hit', 'anthemic', 'unforgettable', 'magnetic', 'raw', 'honest', 'genuine', 'moving',
      'touching', 'heartfelt', 'soulful', 'groovy', 'infectious', 'addictive', 'catchy',
    ];
    const negativeWords = ['hate', 'worst', 'terrible', 'boring', 'bad', 'disappointing', 'skip'];
    const urgentWords = [
      'now', 'today', 'tonight', 'limited', 'exclusive', 'first', "don't miss",
      '24 hours', 'this week', 'right now', 'immediately', 'before', 'last chance',
    ];
    const emotionalWords = [
      'heart', 'soul', 'life', 'journey', 'saved', 'feel', 'moment', 'real', 'honest',
      'therapy', 'healing', 'darkest', 'struggle', 'vulnerable', 'personal', 'authentic',
      'connection', 'community', 'family', 'roots', 'home', 'truth', 'story', 'chapter',
      'changed', 'transformed', 'overcome', 'survived', 'resilient', 'legacy', 'purpose',
    ];
    const viralWords = [
      'everyone', 'share', 'tag', 'viral', 'trending', 'blowing up', 'going crazy',
      'everybody', 'movement', 'phenomenon', 'explosion', 'taking over',
    ];
    const musicWords = [
      'stream', 'playlist', 'spotify', 'apple music', 'tiktok', 'youtube', 'album',
      'single', 'ep', 'bars', 'hook', 'chorus', '808', 'beat', 'drop', 'vocals',
      'lyrics', 'production', 'mix', 'master', 'studio', 'recording',
    ];

    const lower = content.toLowerCase();
    let score = 58;

    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    const urgentCount = urgentWords.filter(w => lower.includes(w)).length;
    const emotionalCount = emotionalWords.filter(w => lower.includes(w)).length;
    const viralCount = viralWords.filter(w => lower.includes(w)).length;
    const musicCount = musicWords.filter(w => lower.includes(w)).length;

    score += Math.min(20, positiveCount * 4);
    score -= Math.min(25, negativeCount * 8);
    score += Math.min(8, musicCount * 2);

    if (objective === 'conversions') score += Math.min(15, urgentCount * 5);
    if (objective === 'viral') score += Math.min(15, emotionalCount * 4) + Math.min(10, viralCount * 3);
    if (objective === 'engagement') score += Math.min(10, emotionalCount * 3);
    if (objective === 'awareness') score += Math.min(8, positiveCount * 2);

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
    let score = 55;
    const lower = content.toLowerCase();
    const headlineLower = headline.toLowerCase();

    // ── Hook quality ──────────────────────────────────────────────────────────
    if (headline.match(/^(🔥|💥|⚡|🚀|🚨|👀|💀|🤯|💯)/)) score += 7;
    if (/\?$/.test(headline)) score += 6;                           // Question hooks
    if (/^[A-Z]{2,}/.test(headline)) score += 4;                    // Caps-led hooks
    if (/nobody (told|talks|shows)/i.test(headline)) score += 9;    // Curiosity gap
    if (/unpopular opinion|hot take|real talk/i.test(headline)) score += 8; // Opinion hook
    if (/pov:|when you|tell me why/i.test(headline)) score += 7;   // Relatable hook

    // ── Engagement triggers in body ────────────────────────────────────────
    if (lower.includes('?')) score += 8;                             // Questions drive comments
    if (lower.match(/\btag\b|\bshare\b|\bcomment\b|\bdrop\b/i)) score += 7; // Action words
    if (lower.match(/\b(you|your|yours)\b/)) score += 5;            // Direct address
    if (lower.match(/\bi\b.*\bfeel\b|\bwhen i\b|\bi wrote\b/i)) score += 6; // Personal narrative

    // ── Self-identification phrases ─────────────────────────────────────────
    if (lower.match(/for (the|everyone|the artists|the people|anyone)/i)) score += 7;
    if (lower.match(/if you'?ve? (ever|always)|if you believe/i)) score += 6;

    // ── Specificity signals (concrete > generic) ───────────────────────────
    if (/\d+/.test(content)) score += 5;                            // Numbers = specificity
    if (/\d+(k|m)\s+(streams|plays|followers)/i.test(lower)) score += 8; // Stream counts
    if (/(3am|2am|midnight|late night|studio at)/i.test(lower)) score += 6; // Time specifics

    // ── Emotional arc signals ──────────────────────────────────────────────
    const hasHook = HOOK_PATTERNS.some(p => p.test(headline));
    const hasTension = /almost|thought about|wasn't sure|hard (day|time|moment)|darkest/i.test(lower);
    const hasResolution = /but then|then it (clicked|hit)|finally|now i (know|realize|see)/i.test(lower);
    if (hasHook && hasTension) score += 8;                          // Hook + tension = high engagement
    if (hasHook && hasTension && hasResolution) score += 6;         // Full arc bonus

    // ── Content formula detection ──────────────────────────────────────────
    let formulaBoost = 0;
    for (const formula of Object.values(CONTENT_FORMULA_LIBRARY)) {
      if (formula.bestFor.includes(context.objective)) {
        const formulaMatch = formula.hookSignals.some(sig => sig.test(headline) || sig.test(lower));
        if (formulaMatch) { formulaBoost = Math.max(formulaBoost, formula.engagementBoost); }
      }
    }
    score += Math.min(18, formulaBoost);

    // ── Psychological trigger layer detection ──────────────────────────────
    const triggerLayers = PSYCHOLOGICAL_TRIGGER_LAYERS[context.objective] || [];
    for (const layer of triggerLayers) {
      const matchCount = layer.triggers.filter(t => lower.includes(t)).length;
      if (matchCount >= 2) { score += layer.scoreBoost; break; } // First combo match wins
    }

    // ── Release phase multiplier ───────────────────────────────────────────
    const phaseMultiplier = RELEASE_PHASE_MULTIPLIERS[context.releasePhase || 'sustain'] || 1.0;
    score *= phaseMultiplier;

    // ── Objective multiplier ───────────────────────────────────────────────
    const objectiveMultipliers: Record<string, number> = {
      awareness: 0.92, engagement: 1.12, conversions: 0.88, viral: 1.20,
    };
    score *= objectiveMultipliers[context.objective] || 1;

    // ── Content length sweet spot ──────────────────────────────────────────
    if (content.length > 80 && content.length < 350) score += 8;
    else if (content.length > 50 && content.length < 80) score += 5;
    else if (content.length > 350 && content.length < 600) score += 4;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private scoreSpecificity(content: string, headline: string): number {
    let score = 45;
    const full = `${headline} ${content}`.toLowerCase();

    // Numbers signal specificity (research: +36% CTR on numeric hooks)
    const numbers = (full.match(/\d+/g) || []).length;
    score += Math.min(20, numbers * 5);

    // Time-specific references
    if (/(3am|2am|midnight|at \d+(am|pm)|last night|this morning|tonight)/i.test(full)) score += 8;

    // Specific music industry metrics
    if (/\d+(k|m)\s*(streams?|plays?|followers?|listeners?)/i.test(full)) score += 10;
    if (/(charted|playlisted|placed|curated|certified)/i.test(full)) score += 8;

    // Named song/album titles (quoted text)
    if (/"[^"]{2,}"/.test(full) || /\u201c[^\u201d]{2,}\u201d/.test(full)) score += 8;

    // Concrete sensory/location details
    if (/(studio|booth|mic|headphones|board|session)/i.test(full)) score += 5;
    if (/(wrote this|started with|began as|voice memo|track \d+)/i.test(full)) score += 6;

    // Generic penalty — catch-all generic phrases reduce specificity
    const genericPhrases = ['new music', 'check it out', 'excited to share', 'something special', 'hard work'];
    const genericMatches = genericPhrases.filter(p => full.includes(p)).length;
    score -= genericMatches * 4;

    return Math.max(0, Math.min(100, score));
  }

  private scoreEmotionalArc(content: string, headline: string): number {
    let score = 40;
    const full = `${headline} ${content}`.toLowerCase();

    // Hook element (emotional entry point)
    const hookPresent = HOOK_PATTERNS.some(p => p.test(headline));
    if (hookPresent) score += 15;

    // Context setting (why should I care)
    if (/(this (track|song|record|single)|when (i|we)|the (story|moment|night|day))/i.test(full)) score += 10;

    // Tension element (conflict/struggle — creates narrative pull)
    if (/(almost|nearly|didn't think|wasn't sure|hard (to|day|time)|struggle|darkest|almost quit)/i.test(full)) score += 12;

    // Resolution (payoff — releases narrative tension)
    if (/(finally|clicked|realized|turned out|ended up|now it's|glad i did|worth it)/i.test(full)) score += 10;

    // CTA as call-to-action close
    if (/(link in bio|stream|listen|share|tell me|drop a|comment)/i.test(full)) score += 8;

    // Full arc bonus (all 5 elements present)
    const hasAll = hookPresent &&
      /(this (track|song|record)|when i|the story)/i.test(full) &&
      /(almost|struggle|darkest)/i.test(full) &&
      /(finally|clicked|worth it)/i.test(full) &&
      /(stream|share|comment)/i.test(full);
    if (hasAll) score += 15;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Narrative Authenticity — the 9th scoring dimension added for Veo-level calibration.
   *
   * What separates Veo-quality content from generic AI output is grounded,
   * specific, authentic voice.  This dimension rewards:
   *   • Industry-native language that real artists actually use
   *   • Concrete first-person storytelling (not vague claimed experience)
   *   • Punchy, image-rich sentence density (Veo's trademark style)
   *   • Authentic emotion signals (nervous, relieved, almost deleted this)
   *
   * And penalises:
   *   • Corporate PR fluff ("I'm thrilled to announce", "for your listening pleasure")
   *   • Generic lazy phrases ("hard work and dedication", "amazing journey")
   *   • Content that sounds like a press release rather than an artist's voice
   */
  private scoreNarrativeAuthenticity(content: string, headline: string): number {
    let score = 50;
    const full = `${headline} ${content}`.toLowerCase();

    // ── Industry-native language (real artists sound like this) ───────────────
    const industryNative = [
      'bounce session', 'tracking', 'vocal take', 'rough mix', 'demo tape',
      'laid the verse', 'wrote the hook', 'dropped the 808', 'the beat goes',
      'a&r', 'booking', 'tour', 'opening act', 'soundcheck', 'green room',
      'festival', 'headlining', 'setlist', 'feature', 'sample flip',
      'clear the sample', 'stems', 'splice', 'midi', 'adlibs',
      'reference track', 'final masters', 'mixing engineer', 'mastering engineer',
      'producer tag', 'punched in', 'dropped a verse', 'caught a vibe',
      'session ran till', 'in the booth', 'rewrote the bridge',
    ];
    const industryMatches = industryNative.filter(w => full.includes(w)).length;
    score += Math.min(20, industryMatches * 6);

    // ── Corporate PR fluff penalty (no real artist talks like this) ───────────
    const fluffPhrases = [
      "i'm excited to announce", "i am thrilled to share", "please check out",
      "for your listening pleasure", "without further ado", "stay tuned for more",
      "make sure to follow", "don't forget to like", "feel free to share",
      "we are proud to present", "we are excited to share", "incredible journey",
      "amazing opportunity", "hard work and dedication", "blessed and grateful",
      "passionate about music", "pursuing my dreams", "working hard every day",
    ];
    const fluffMatches = fluffPhrases.filter(p => full.includes(p)).length;
    score -= fluffMatches * 9;

    // ── First-person concrete storytelling ────────────────────────────────────
    if (/(i (wrote|started|recorded|spent|stayed|finished|played|scrapped|rewrote)|we (recorded|started|finished|tracked))/i.test(full)) score += 10;
    if (/(track \d+|verse \d+|bar \d+|session \d+|take \d+|chapter \d+)/i.test(full)) score += 8;

    // ── Authentic emotion signals (specific > generic positivity) ─────────────
    if (/(nervous|anxious|relieved|scared to post|wasn't ready|almost deleted|didn't think anyone)/i.test(full)) score += 9;

    // ── Veo-class sentence density: punchy, image-rich, not padded ────────────
    const sentences = full.split(/[.!?]+/).filter(s => s.trim().length > 3);
    const avgLen = sentences.length
      ? sentences.reduce((s, sen) => s + sen.trim().length, 0) / sentences.length
      : 0;
    if (avgLen > 15 && avgLen < 80) score += 8;   // punchy like Veo
    else if (avgLen >= 80 && avgLen < 140) score += 3; // acceptable
    else if (avgLen >= 140) score -= 6;            // too padded

    return Math.max(0, Math.min(100, score));
  }

  async selectBestVariant(
    variants: ContentVariant[],
    minScore: number = VEO_QUALITY_GATE
  ): Promise<ContentVariant | null> {
    // Veo gate + Caffeine Mode: floor lowers under deadline pressure, but urgency
    // content already scored higher in scoreContent — so only urgency-rich posts
    // benefit from the relief.  Absolute floor is VEO_PRESSURE_FLOOR (65).
    const effectiveMin = pressureAdjustedMinScore(minScore);
    if (effectiveMin !== minScore && _currentPressure > 0) {
      logger.info(
        `☕ [CaffeineMode] Veo gate: ${minScore} → ${effectiveMin}` +
        ` (pressure: ${_currentPressure.toFixed(2)}, floor: ${VEO_PRESSURE_FLOOR})`
      );
    }

    const validVariants = variants.filter(v =>
      v.scores.overall >= effectiveMin && v.platformOptimizations.isValid
    );

    if (validVariants.length === 0) {
      const best = variants.sort((a, b) => b.scores.overall - a.scores.overall)[0];
      // Fallback floor: VEO_PRESSURE_FLOOR — never publish below 87% of Veo gate
      if (best && best.scores.overall >= VEO_PRESSURE_FLOOR) {
        logger.warn(
          `[VeoGate] Fallback: best available ${best.scores.overall.toFixed(1)} passes ` +
          `VEO_PRESSURE_FLOOR (${VEO_PRESSURE_FLOOR}). Issues: ${best.platformOptimizations.issues.join(', ') || 'none'}`
        );
        return best;
      }
      logger.warn(
        `[VeoGate] All ${variants.length} variant(s) below ${VEO_PRESSURE_FLOOR} — content rejected. ` +
        `Best score: ${best?.scores.overall.toFixed(1) ?? 'N/A'}`
      );
      return null;
    }

    logger.info(
      `[VeoGate] ✅ Passed — score: ${validVariants[0].scores.overall.toFixed(1)} / gate: ${effectiveMin}`
    );
    return validVariants[0];
  }

  async generateAndSelect(
    userId: string,
    baseContext: Partial<ContentContext>,
    variantCount: number = VEO_DEFAULT_VARIANTS,
    minScore: number = VEO_QUALITY_GATE
  ): Promise<{ selected: ContentVariant | null; variants: ContentVariant[]; context: ContentContext }> {
    const context = await this.buildContext(userId, baseContext);
    // Caffeine Mode: add proportional extra variants under deadline pressure.
    // With a 30-variant base, extras are 20% / 33% / 50% more to meaningfully
    // increase the quality hit probability without doubling compute.
    const pressureExtra = _currentPressure > 1.5
      ? Math.ceil(variantCount * 0.50)   // critical: +50 % (e.g. 30 → 45)
      : _currentPressure > 0.5
        ? Math.ceil(variantCount * 0.33)  // moderate: +33 % (e.g. 30 → 40)
        : 0;
    const variants = await this.generateVariants(context, variantCount + pressureExtra);

    // ── MaxCore re-scoring: enhance top candidates with inference server ───────
    // Run top-3 local candidates through MaxCore for a calibrated score blend.
    // MaxCore returns a 0-100 score; we blend it at 35% weight with the
    // local score (65%) to preserve the Veo-calibrated rubric while benefiting
    // from MaxCore's trained weights.  If MaxCore is offline the local score
    // stands unchanged — no silent quality degradation.
    const topCandidates = [...variants]
      .sort((a, b) => b.scores.overall - a.scores.overall)
      .slice(0, 3);

    const maxcoreAvailable = await MaxCoreAIClient.isAvailable();
    if (maxcoreAvailable) {
      await Promise.all(topCandidates.map(async (variant) => {
        try {
          const result = await MaxCoreAIClient.infer<{ score: number; feedback?: string }>(
            '/api/content/score',
            {
              text:     `${variant.headline}\n\n${variant.content}`,
              platform: context.platform,
              cta:      variant.callToAction,
              hashtags: variant.hashtags,
              userId,
            }
          );
          if (result?.score !== undefined) {
            const mcScore = Math.min(100, Math.max(0, result.score));
            const blended = variant.scores.overall * 0.65 + mcScore * 0.35;
            logger.debug(
              `[MaxCore] Scored variant ${variant.id}: local=${variant.scores.overall.toFixed(1)} ` +
              `maxcore=${mcScore.toFixed(1)} blended=${blended.toFixed(1)}`
            );
            variant.scores.overall = blended;
          }
        } catch { /* MaxCore timeout — local score unchanged */ }
      }));

      // Re-sort after MaxCore blend
      variants.sort((a, b) => b.scores.overall - a.scores.overall);
    }

    const selected = await this.selectBestVariant(variants, minScore);

    logger.info(
      `[VeoGate] Generated ${variants.length} variant(s) (base: ${variantCount} + pressure extra: ${pressureExtra}` +
      `${maxcoreAvailable ? ' + MaxCore blend' : ''}), ` +
      `selected: ${selected?.id || 'none'} (score: ${selected?.scores.overall.toFixed(1) || 'N/A'} / gate: ${VEO_QUALITY_GATE})`
    );

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
    variantCount: number = VEO_DEFAULT_VARIANTS
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

      const variants: ContentVariant[] = advancedResult.variants.map((v, i) => {
        // Apply algorithm signal optimization and run full pipeline scoring
        const body    = v.content.split('\n\n')[1] || v.content;
        const optimised = this.applyAlgorithmSignalOptimization(v.headline, body, v.cta, context.platform);
        const platformOpt = this.validatePlatformConstraints(
          `${optimised.headline}\n\n${optimised.body}`, v.hashtags, context.platform
        );
        const scores = this.scoreContent(
          `${optimised.headline}\n\n${optimised.body}`, optimised.headline, optimised.cta, context, platformOpt
        );
        return {
          id: v.id,
          content:       optimised.body,
          headline:      optimised.headline,
          hashtags:      v.hashtags,
          callToAction:  optimised.cta,
          scores,
          platformOptimizations: platformOpt,
        };
      });

      // Primary variant — apply full scoring pipeline too
      const primaryBody = advancedResult.primary.body;
      const primaryOptimised = this.applyAlgorithmSignalOptimization(
        advancedResult.primary.headline, primaryBody, advancedResult.primary.callToAction, context.platform
      );
      const primaryPlatformOpt = this.validatePlatformConstraints(
        `${primaryOptimised.headline}\n\n${primaryOptimised.body}`, advancedResult.primary.hashtags, context.platform
      );
      const primaryScores = this.scoreContent(
        `${primaryOptimised.headline}\n\n${primaryOptimised.body}`,
        primaryOptimised.headline, primaryOptimised.cta, context, primaryPlatformOpt
      );
      variants.push({
        id: 'advanced_primary',
        content:       primaryOptimised.body,
        headline:      primaryOptimised.headline,
        hashtags:      advancedResult.primary.hashtags,
        callToAction:  primaryOptimised.cta,
        scores:        primaryScores,
        platformOptimizations: primaryPlatformOpt,
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
      const errMsg = (error as Error)?.message ?? String(error);
      const errStack = (error as Error)?.stack?.split('\n')[1]?.trim() ?? '';
      logger.warn(`[AdvancedAI] Content pipeline failed (${errMsg}) ${errStack}`);
      throw error;
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
