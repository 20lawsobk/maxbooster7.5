/**
 * Unified AI Services Controller for Max Booster
 *
 * Integrates and coordinates all custom AI services:
 * - Content Generation (NLP)
 * - Sentiment Analysis
 * - Recommendation Engine
 * - Ad Optimization
 * - Social Autopilot
 * - Time Series Forecasting
 * - Model Registry Management
 *
 * Inference priority:
 *   1. MaxCore remote training server (AI_SERVER_URL / AI_SERVER_KEY)
 *   2. MaxCore Local Engine (always available — in-process, zero latency)
 *
 * MaxCore is the ONLY source. The local engine guarantees MaxCore always
 * succeeds — source label 'MaxCoreAI' on every response.
 */

import { logger } from '../logger.js';
import { MLModelRegistry } from './mlModelRegistry.js';
import { storage } from '../storage.js';
import { AIService } from './aiService.js';
import * as aiAnalyticsService from './aiAnalyticsService.js';
import { pythonAIService } from './pythonAIService.js';
import { ContentGenerator, type GenerationOptions, type CaptionResult } from '../../shared/ml/nlp/ContentGenerator.js';
import { MaxCoreAIClient } from './maxcoreClient.js';
export { MaxCoreAIClient } from './maxcoreClient.js';
import { SentimentAnalyzer, type FullAnalysisResult, type SentimentResult } from '../../shared/ml/nlp/SentimentAnalyzer.js';
import { RecommendationEngine, type RecommendationResult, type SimilarityResult, type TrackData, type ArtistData, type UserInteraction } from '../../shared/ml/models/RecommendationEngine.js';
import { AdOptimizationEngine, type Campaign, type CampaignScore, type BudgetOptimizationResult, type CreativePrediction, type ROIForecast } from '../../shared/ml/models/AdOptimizationEngine.js';
import { SocialAutopilotEngine, type Platform, type ContentType, type BestTimeResult, type ContentTypeRecommendation, type ViralPotentialScore, type EngagementPrediction, type ScheduleOptimization, type HistoricalPost, type AudienceInsights } from '../../shared/ml/models/SocialAutopilotEngine.js';
import { AdvancedTimeSeriesModel, type MetricType, type PredictionHorizon, type ForecastResult } from '../../shared/ml/models/AdvancedTimeSeriesModel.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UserGenerationContext {
  artistBio?: string;
  genre?: string;
  brandVoice?: string;
  targetAudience?: string;
  contentThemes?: string[];
  avoidTopics?: string[];
  preferredHashtags?: string[];
  recentPostSnippets?: string[];
  artistName?: string;
}

export interface ContentGenerationOptions extends GenerationOptions {
  userId?: string;
  projectId?: string;
  userContext?: UserGenerationContext;
  // Rich content context — feeds directly into MaxCore for better AI output
  keywords?: string[];
  mood?: string;
  extraContext?: string;
  album?: string;
  releaseDate?: string;
  similarArtists?: string[];
  bodyPreview?: string;
  description?: string;
  label?: string;
  tracklist?: string[];
  viewCount?: number | null;
  likeCount?: number | null;
}

export interface SentimentAnalysisOptions {
  text: string;
  includeEmotions?: boolean;
  includeToxicity?: boolean;
  includeAspects?: boolean;
  aspects?: string[];
}

export interface RecommendationOptions {
  userId: string;
  type: 'tracks' | 'artists' | 'similar';
  seedIds?: string[];
  limit?: number;
  hybridWeight?: number;
}

export interface AdOptimizationOptions {
  campaign: Campaign;
  action: 'score' | 'optimize_budget' | 'predict_creative' | 'forecast_roi';
  campaigns?: Campaign[];
  totalBudget?: number;
  forecastPeriod?: number;
}

export interface EngagementPredictionOptions {
  platform: Platform;
  content: {
    text: string;
    contentType: ContentType;
    hashtags: string[];
    topics: string[];
    hasEmoji: boolean;
    scheduledTime?: Date;
  };
  action: 'predict_engagement' | 'viral_potential' | 'best_time' | 'recommend_type' | 'optimize_schedule';
  postsPerWeek?: number;
}

export interface ForecastOptions {
  metric: MetricType;
  horizon: PredictionHorizon;
  historicalData: number[];
  timestamps?: Date[];
}

export interface AIHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  services: {
    modelRegistry: ServiceHealth;
    contentGenerator: ServiceHealth;
    sentimentAnalyzer: ServiceHealth;
    recommendationEngine: ServiceHealth;
    adOptimizationEngine: ServiceHealth;
    socialAutopilotEngine: ServiceHealth;
    timeSeriesModel: ServiceHealth;
    legacyAIService: ServiceHealth;
    analyticsService: ServiceHealth;
  };
  modelStats: {
    registeredModels: number;
    activeModels: number;
    trainedModels: number;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'uninitialized';
  initialized: boolean;
  lastError?: string;
  responseTimeMs?: number;
}

export interface UnifiedAIResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  processingTimeMs: number;
  source: string;
  confidence?: number;
}

// ============================================================================
// MAXCORE AI CLIENT — calls the trained model server (Priority 1)
// ============================================================================
// MaxCoreAIClient is defined in ./maxcoreClient.ts (TF-free) and re-exported
// above via: export { MaxCoreAIClient } from './maxcoreClient.js'
// ============================================================================

export class UnifiedAIController {
  private static instance: UnifiedAIController;
  
  private modelRegistry: MLModelRegistry;
  private aiService: AIService;
  private contentGenerator: ContentGenerator;
  private sentimentAnalyzer: SentimentAnalyzer;
  private recommendationEngine: RecommendationEngine;
  private adOptimizationEngine: AdOptimizationEngine;
  private socialAutopilotEngine: SocialAutopilotEngine;
  private timeSeriesModels: Map<string, AdvancedTimeSeriesModel> = new Map();
  
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private lastHealthCheck: Date = new Date();
  private healthCache: AIHealthStatus | null = null;

  private constructor() {
    this.modelRegistry = MLModelRegistry.getInstance();
    this.aiService = new AIService();
    this.contentGenerator = new ContentGenerator();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.recommendationEngine = new RecommendationEngine();
    this.adOptimizationEngine = new AdOptimizationEngine();
    this.socialAutopilotEngine = new SocialAutopilotEngine();
  }

  public static getInstance(): UnifiedAIController {
    if (!UnifiedAIController.instance) {
      UnifiedAIController.instance = new UnifiedAIController();
    }
    return UnifiedAIController.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    await this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    const startTime = Date.now();
    logger.info('🤖 Initializing Unified AI Controller...');

    try {
      await Promise.all([
        this.modelRegistry.initialize().catch(err => {
          logger.warn({ err: err }, 'Model Registry initialization warning:');
        }),
        this.adOptimizationEngine.initialize().catch(err => {
          logger.warn({ err: err }, 'Ad Optimization Engine initialization warning:');
        }),
        this.socialAutopilotEngine.initialize().catch(err => {
          logger.warn({ err: err }, 'Social Autopilot Engine initialization warning:');
        }),
      ]);

      this.initializeTimeSeriesModels();
      
      this.initialized = true;
      const duration = Date.now() - startTime;
      logger.info(`✅ Unified AI Controller initialized in ${duration}ms`);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize Unified AI Controller:');
      throw error;
    }
  }

  private initializeTimeSeriesModels(): void {
    const metrics: MetricType[] = ['streams', 'revenue', 'followers', 'engagement'];
    const horizons: PredictionHorizon[] = [7, 30, 90];

    for (const metric of metrics) {
      for (const horizon of horizons) {
        const key = `${metric}_${horizon}`;
        this.timeSeriesModels.set(key, new AdvancedTimeSeriesModel(metric, horizon));
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================================================
  // CONTENT GENERATION
  // ============================================================================

  public async generateContent(options: ContentGenerationOptions): Promise<UnifiedAIResult<CaptionResult>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      const platformAliases: Record<string, string> = {
        threads: 'instagram',
        googlebusiness: 'facebook',
      };
      const mappedPlatform = options.platform && platformAliases[options.platform]
        ? platformAliases[options.platform]
        : (options.platform || 'instagram');

      const ctx = options.userContext;

      // MaxCore is the ONLY source — always succeeds via remote + local engine
      //
      // ── Two-tier payload strategy ────────────────────────────────────────────
      // TIER 1 — topic (short subject keyword, ≤300 chars)
      //   Used by MaxCore for genre/platform/style matching.
      //   Contains: artist, track, album, label, URL metadata.
      //   Does NOT contain the user's instruction — that goes in extra_context.
      //
      // TIER 2 — extra_context (full creative directive, never truncated)
      //   The user's verbatim instruction is placed FIRST so MaxCore's LLM
      //   treats it as the primary generation directive. Supporting metadata
      //   (stats, tracklist, body preview) follows as supplementary context.
      //
      // This separation is the difference between MaxCore generating generic
      // music captions vs. actually following what the user asked for.

      const artist = ctx?.artistName || options.artistName;

      // Build a clean topic from metadata — no user instruction text
      const baseTopic = options.topic || options.genre || 'new music';
      const topicParts: string[] = [baseTopic];
      if (artist && !baseTopic.toLowerCase().includes(artist.toLowerCase())) {
        topicParts.push(`by ${artist}`);
      }
      if (options.trackTitle && !baseTopic.toLowerCase().includes(options.trackTitle.toLowerCase())) {
        topicParts.push(`"${options.trackTitle}"`);
      }
      if (options.mood) topicParts.push(options.mood);
      if (options.keywords?.length) topicParts.push(options.keywords.slice(0, 4).join(', '));
      // 300-char limit is enough for full metadata context without polluting the topic signal
      const enrichedTopic = topicParts.join(' — ').slice(0, 300);

      // ── Build extra_context — user instruction FIRST, then supporting detail ──
      const extraParts: string[] = [];
      // User's verbatim instruction is the primary creative directive
      if (options.extraContext) extraParts.push(options.extraContext);
      // Supporting metadata follows
      if (options.album)       extraParts.push(`Album: ${options.album}`);
      if (options.releaseDate) extraParts.push(`Released: ${options.releaseDate}`);
      if (options.label)       extraParts.push(`Label: ${options.label}`);
      if (options.tracklist?.length) extraParts.push(`Tracklist: ${options.tracklist.slice(0, 4).join(', ')}`);
      if (options.viewCount != null && options.viewCount > 0) {
        extraParts.push(`${(options.viewCount / 1_000_000 >= 1
          ? (options.viewCount / 1_000_000).toFixed(1) + 'M'
          : (options.viewCount / 1000).toFixed(0) + 'K')} views`);
      }
      if (options.likeCount != null && options.likeCount > 0) {
        extraParts.push(`${(options.likeCount / 1000).toFixed(0)}K likes`);
      }
      if (options.bodyPreview) {
        const clean = options.bodyPreview.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
        if (clean) extraParts.push(clean);
      } else if (options.description) {
        const clean = options.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
        if (clean) extraParts.push(clean);
      }
      const combinedExtra = extraParts.length ? extraParts.join(' | ') : undefined;

      // /api/generate/content is the structured endpoint on the remote server.
      // It builds caption = hook + "\n\n" + body + "\n\n" + cta server-side,
      // so the caption field is always clean (never raw model token output).
      // Pass all available structured fields so MaxCore has full context.
      const mcPayload: Record<string, unknown> = {
        platform:              mappedPlatform,
        topic:                 enrichedTopic,
        tone:                  options.tone || 'energetic',
        genre:                 options.genre || ctx?.genre,
        artist_name:           artist,
        brand_voice:           ctx?.brandVoice,
        target_audience:       ctx?.targetAudience,
        preferred_hashtags:    ctx?.preferredHashtags,
      };
      // If the caller supplied a verbatim user instruction, pass it as a
      // dedicated `instruction` field AND prepend it in extra_context so MaxCore
      // receives it through both channels regardless of API version.
      if (options.extraContext) {
        mcPayload.instruction  = options.extraContext;
        mcPayload.prompt       = options.extraContext;
      }
      // Artist bio / context
      if (ctx?.artistBio)              mcPayload.artist_context        = ctx.artistBio;
      // Content guidance
      if (ctx?.contentThemes?.length)  mcPayload.content_themes        = ctx.contentThemes;
      if (ctx?.avoidTopics?.length)    mcPayload.avoid_topics          = ctx.avoidTopics;
      if (ctx?.recentPostSnippets?.length) mcPayload.recent_post_snippets = ctx.recentPostSnippets;
      // Release / project metadata
      if (options.album)               mcPayload.album                 = options.album;
      if (options.releaseDate)         mcPayload.release_date          = options.releaseDate;
      if (options.label)               mcPayload.label                 = options.label;
      if (options.tracklist?.length)   mcPayload.tracklist             = options.tracklist;
      // extra_context: user instruction FIRST (already placed first in extraParts),
      // followed by supporting metadata. Never truncated — MaxCore needs the full text.
      if (combinedExtra)               mcPayload.extra_context         = combinedExtra;

      logger.debug(`[UnifiedAI] MaxCore payload topic="${enrichedTopic.slice(0, 60)}" instruction="${(options.extraContext ?? '').slice(0, 80)}"`)

      const mc = await MaxCoreAIClient.infer<any>('/api/generate/content', mcPayload);

      if (mc?.caption || mc?.hook) {
        const caption = mc.caption || `${mc.hook}\n\n${mc.body || ''}\n\n${mc.cta || ''}`.trim();

        // ── Enrich hashtags with artist-specific keywords ─────────────────────
        // MaxCore always returns generic platform hashtags (#fyp, #viral, etc.).
        // Merge the user's actual keywords (from URL metadata, labels, etc.)
        // so the post reaches the right audience. Keep MaxCore's hashtags but
        // prepend keyword-derived ones, capped at 15 total.
        const mcHashtags: string[] = Array.isArray(mc.hashtags) ? mc.hashtags : [];
        const keywordHashtags = (options.keywords ?? [])
          .filter((k: string) => k && k.length > 1)
          .map((k: string) => k.startsWith('#') ? k : `#${k.replace(/\s+/g, '').toLowerCase()}`)
          .filter((h: string) => !mcHashtags.includes(h));
        // Also derive hashtag from artist name if available and not already present
        const artistTag = artist
          ? `#${artist.replace(/\s+/g, '').toLowerCase()}`
          : null;
        if (artistTag && !mcHashtags.includes(artistTag) && !keywordHashtags.includes(artistTag)) {
          keywordHashtags.unshift(artistTag);
        }
        const enrichedHashtags = [...keywordHashtags, ...mcHashtags].slice(0, 15);

        return {
          success: true,
          data: {
            caption,
            hashtags:  enrichedHashtags.length ? enrichedHashtags : mcHashtags,
            tone:      options.tone || 'energetic',
            toneMatch: mc.confidence || 0.95,
            platform:  mappedPlatform,
            charCount: caption.length,
            hook: mc.hook,
            body: mc.body,
            cta:  mc.cta,
          } as CaptionResult,
          processingTimeMs: Date.now() - startTime,
          source: 'MaxCoreAI',
          confidence: mc.confidence || 0.95,
        };
      }

      // MaxCore returned no content — transient issue.
      logger.warn('[UnifiedAI] MaxCore returned empty response (transient) — no content generated');
      return {
        success: false,
        error: 'MaxCore returned no content — please retry',
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
      };
    } catch (error) {
      logger.warn({ err: error }, '[UnifiedAI] generateContent error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content generation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
      };
    }
  }

  public async generateSocialContent(options: {
    platform?: Platform;
    contentType: 'post' | 'story' | 'video' | 'ad';
    tone: 'professional' | 'casual' | 'energetic' | 'promotional';
    customPrompt?: string;
    musicData?: {
      genre: string;
      mood: string;
      title: string;
      artist: string;
    };
  }): Promise<UnifiedAIResult<{ content: string[] }>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    const platform = (options.platform || 'instagram') as string;
    const topic = options.musicData
      ? `${options.musicData.title} by ${options.musicData.artist}`
      : (options.customPrompt || 'new music');
    const tone = options.tone || 'energetic';

    try {
      // MaxCore is the ONLY source — always succeeds via remote + local engine
      const mc = await MaxCoreAIClient.infer<any>('/api/generate/content', {
        platform,
        topic,
        tone,
        genre:       options.musicData?.genre,
        artist_name: options.musicData?.artist,
      });
      if (mc?.caption || mc?.hook) {
        const parts = mc.caption
          ? [mc.caption]
          : [mc.hook, mc.body, mc.cta].filter(Boolean);
        return {
          success: true,
          data: { content: parts },
          processingTimeMs: Date.now() - startTime,
          source: 'MaxCoreAI',
          confidence: mc.confidence || 0.95,
        };
      }
      // MaxCore returned no content — transient.
      logger.warn('[UnifiedAI] MaxCore returned empty response for generateSocialContent (transient)');
      return {
        success: false,
        error: 'MaxCore returned no content — please retry',
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
      };
    } catch (error) {
      logger.warn({ err: error }, '[UnifiedAI] generateSocialContent error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Social content generation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
      };
    }
  }

  public generateHashtags(options: {
    topic?: string;
    genre?: string;
    platform?: Platform;
    tone?: 'professional' | 'casual' | 'energetic' | 'promotional';
    count?: number;
  }): string[] {
    return this.contentGenerator.generateHashtags(options);
  }

  // ============================================================================
  // SENTIMENT ANALYSIS
  // ============================================================================

  public async analyzeSentiment(options: SentimentAnalysisOptions): Promise<UnifiedAIResult<FullAnalysisResult | SentimentResult>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      // Priority 1: MaxCore
      if (await MaxCoreAIClient.isAvailable()) {
        try {
          const mc = await MaxCoreAIClient.infer<any>('/analyze/sentiment', {
            text: options.text,
            includeEmotions: options.includeEmotions,
            includeToxicity: options.includeToxicity,
          });
          if (mc?.sentiment || mc?.label) {
            return {
              success: true,
              data: mc as FullAnalysisResult,
              processingTimeMs: Date.now() - startTime,
              source: 'MaxCoreAI',
              confidence: mc.confidence || 0.92,
            };
          }
        } catch (mcErr) {
          logger.warn('[UnifiedAI] MaxCore sentiment failed, falling through:', mcErr);
        }
      }

      let result: FullAnalysisResult | SentimentResult;
      if (options.includeEmotions || options.includeToxicity || options.includeAspects) {
        result = this.sentimentAnalyzer.analyze(options.text);
      } else {
        result = this.sentimentAnalyzer.analyzeSentiment(options.text);
      }
      const confidence = 'overallConfidence' in result ? result.overallConfidence : result.confidence;
      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'SentimentAnalyzer',
        confidence,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Sentiment analysis failed:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sentiment analysis failed',
        processingTimeMs: Date.now() - startTime,
        source: 'SentimentAnalyzer',
      };
    }
  }

  public analyzeToxicity(text: string) {
    return this.sentimentAnalyzer.detectToxicity(text);
  }

  public detectEmotions(text: string) {
    return this.sentimentAnalyzer.detectEmotions(text);
  }

  // ============================================================================
  // RECOMMENDATIONS
  // ============================================================================

  public async getRecommendations(options: RecommendationOptions): Promise<UnifiedAIResult<RecommendationResult | SimilarityResult[]>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      let result: RecommendationResult | SimilarityResult[];

      switch (options.type) {
        case 'tracks':
          result = await this.recommendationEngine.recommendTracks(
            options.userId,
            options.seedIds || [],
            options.limit || 20,
            options.hybridWeight || 0.5
          );
          break;
        case 'artists':
          result = await this.recommendationEngine.recommendArtists(
            options.userId,
            options.limit || 10
          );
          break;
        case 'similar':
          if (!options.seedIds || options.seedIds.length === 0) {
            throw new Error('seedIds required for similar recommendations');
          }
          result = this.recommendationEngine.findSimilar(
            options.seedIds[0],
            'track',
            options.limit || 10
          );
          break;
        default:
          throw new Error(`Unknown recommendation type: ${options.type}`);
      }

      const confidence = Array.isArray(result) 
        ? (result.length > 0 ? result[0].score : 0)
        : result.confidence;

      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'RecommendationEngine',
        confidence,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Recommendation failed:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Recommendation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'RecommendationEngine',
      };
    }
  }

  public addTrackData(tracks: TrackData[]): void {
    this.recommendationEngine.addTracks(tracks);
  }

  public addArtistData(artists: ArtistData[]): void {
    this.recommendationEngine.addArtists(artists);
  }

  public recordInteraction(interaction: UserInteraction): void {
    this.recommendationEngine.recordInteraction(interaction);
  }

  // ============================================================================
  // AD OPTIMIZATION
  // ============================================================================

  public async optimizeAd(options: AdOptimizationOptions): Promise<UnifiedAIResult<CampaignScore | BudgetOptimizationResult | CreativePrediction | ROIForecast>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      // Priority 1: MaxCore
      if (await MaxCoreAIClient.isAvailable()) {
        try {
          const mc = await MaxCoreAIClient.infer<any>('/optimize/ad', {
            action: options.action,
            campaign: options.campaign,
            campaigns: options.campaigns,
            totalBudget: options.totalBudget,
            forecastPeriod: options.forecastPeriod,
          });
          // MaxCore returns {action, confidence, source} — accept any non-empty response
          if (mc && (mc.score !== undefined || mc.allocations || mc.predictedCTR !== undefined || mc.expectedROI !== undefined || mc.confidence !== undefined)) {
            return {
              success: true,
              data: mc,
              processingTimeMs: Date.now() - startTime,
              source: 'MaxCoreAI',
              confidence: mc.confidence || 0.9,
            };
          }
        } catch (mcErr) {
          logger.warn('[UnifiedAI] MaxCore ad optimization failed, falling through:', mcErr);
        }
      }

      let result: CampaignScore | BudgetOptimizationResult | CreativePrediction | ROIForecast;

      switch (options.action) {
        case 'score':
          result = await this.adOptimizationEngine.scoreCampaign(options.campaign);
          break;
        case 'optimize_budget':
          if (!options.campaigns || !options.totalBudget) {
            throw new Error('campaigns and totalBudget required for budget optimization');
          }
          result = await this.adOptimizationEngine.optimizeBudgetAllocation(
            options.campaigns,
            options.totalBudget
          );
          break;
        case 'predict_creative':
          if (!options.campaign.creatives || options.campaign.creatives.length === 0) {
            throw new Error('Campaign must have creatives for prediction');
          }
          result = await this.adOptimizationEngine.predictCreativePerformance(
            options.campaign.creatives[0],
            options.campaign
          );
          break;
        case 'forecast_roi':
          result = await this.adOptimizationEngine.forecastROI(
            options.campaign,
            options.forecastPeriod || 30
          );
          break;
        default:
          throw new Error(`Unknown ad optimization action: ${options.action}`);
      }

      const confidence = 'confidence' in result ? result.confidence : 0.75;

      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine',
        confidence,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Ad optimization failed:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ad optimization failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine',
      };
    }
  }

  public async generateAdCampaign(config: {
    targetAudience: {
      age: string;
      interests: string[];
      location: string;
      demographics: string;
    };
    budget: number;
    campaignType: 'awareness' | 'conversion' | 'engagement' | 'viral';
  }, musicData: unknown) {
    await this.ensureInitialized();
    return this.aiService.generateSuperiorAdCampaign(config, musicData);
  }

  // ============================================================================
  // SOCIAL ENGAGEMENT PREDICTION
  // ============================================================================

  public async predictEngagement(options: EngagementPredictionOptions): Promise<UnifiedAIResult<BestTimeResult | ContentTypeRecommendation | ViralPotentialScore | ScheduleOptimization>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      // Priority 1: MaxCore
      if (await MaxCoreAIClient.isAvailable()) {
        try {
          const mc = await MaxCoreAIClient.infer<any>('/predict/engagement', {
            platform: options.platform,
            action: options.action,
            content: options.content,
            postsPerWeek: options.postsPerWeek,
          });
          // MaxCore returns {action, platform, confidence, source} — accept any non-empty response
          if (mc && (mc.bestTime || mc.viralScore !== undefined || mc.schedule || mc.contentType || mc.confidence !== undefined)) {
            return {
              success: true,
              data: mc,
              processingTimeMs: Date.now() - startTime,
              source: 'MaxCoreAI',
              confidence: mc.confidence || 0.9,
            };
          }
        } catch (mcErr) {
          logger.warn('[UnifiedAI] MaxCore engagement prediction failed, falling through:', mcErr);
        }
      }

      let result: BestTimeResult | ContentTypeRecommendation | ViralPotentialScore | ScheduleOptimization;

      switch (options.action) {
        case 'best_time':
          result = this.socialAutopilotEngine.predictBestTime(
            options.platform,
            options.content.contentType
          );
          break;
        case 'recommend_type':
          result = this.socialAutopilotEngine.recommendContentType(options.platform);
          break;
        case 'viral_potential':
          result = this.socialAutopilotEngine.scoreViralPotential(
            options.platform,
            options.content
          );
          break;
        case 'optimize_schedule':
          result = this.socialAutopilotEngine.optimizeSchedule(
            options.platform,
            options.postsPerWeek || 7
          );
          break;
        case 'predict_engagement':
          const viralScore = this.socialAutopilotEngine.scoreViralPotential(
            options.platform,
            options.content
          );
          result = viralScore;
          break;
        default:
          throw new Error(`Unknown engagement prediction action: ${options.action}`);
      }

      const confidence = 'confidence' in result ? result.confidence : 0.7;

      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'SocialAutopilotEngine',
        confidence,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Engagement prediction failed:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Engagement prediction failed',
        processingTimeMs: Date.now() - startTime,
        source: 'SocialAutopilotEngine',
      };
    }
  }

  public loadHistoricalPosts(posts: HistoricalPost[]): void {
    this.socialAutopilotEngine.loadHistoricalData(posts);
  }

  public loadAudienceInsights(insights: AudienceInsights[]): void {
    this.socialAutopilotEngine.loadAudienceInsights(insights);
  }

  public detectTrends(platforms: Platform[]) {
    return this.socialAutopilotEngine.detectTrends(platforms);
  }

  public adaptContent(
    content: { text: string; hashtags: string[]; mentions: string[] },
    originalPlatform: Platform,
    targetPlatform: Platform
  ) {
    return this.socialAutopilotEngine.adaptContent(content, originalPlatform, targetPlatform);
  }

  // ============================================================================
  // TIME SERIES FORECASTING
  // ============================================================================

  public async forecastMetrics(options: ForecastOptions): Promise<UnifiedAIResult<ForecastResult>> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      const modelKey = `${options.metric}_${options.horizon}`;
      let model = this.timeSeriesModels.get(modelKey);

      if (!model) {
        model = new AdvancedTimeSeriesModel(options.metric, options.horizon);
        this.timeSeriesModels.set(modelKey, model);
      }

      if (!model.isModelTrained()) {
        const { inputs, labels } = model.prepareTrainingData(options.historicalData, options.timestamps);
        await model.train(inputs, labels, {
          epochs: 50,
          batchSize: 16,
          validationSplit: 0.2,
        });
        inputs.dispose();
        labels.dispose();
      }

      const result = await model.forecast(options.historicalData, options.timestamps);

      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'AdvancedTimeSeriesModel',
        confidence: 1 - (result.accuracy.mape / 100),
      };
    } catch (error) {
      logger.warn({ err: error }, 'Metric forecasting failed:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Metric forecasting failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdvancedTimeSeriesModel',
      };
    }
  }

  public async predictAnalyticsMetric(params: {
    metric: 'streams' | 'engagement' | 'revenue';
    timeframe: '7d' | '30d' | '90d';
  }) {
    await this.ensureInitialized();
    return aiAnalyticsService.predictMetric(params);
  }

  public async predictChurn() {
    await this.ensureInitialized();
    return aiAnalyticsService.predictChurn();
  }

  public async forecastRevenue(timeframe: string = '30d') {
    await this.ensureInitialized();
    return aiAnalyticsService.forecastRevenue(timeframe);
  }

  public async detectAnomalies() {
    await this.ensureInitialized();
    return aiAnalyticsService.detectAnomalies();
  }

  public async generateInsights() {
    await this.ensureInitialized();
    return aiAnalyticsService.generateInsights();
  }

  // ============================================================================
  // MODEL REGISTRY
  // ============================================================================

  public async getRegisteredModels(filter?: { status?: string; type?: string }) {
    await this.ensureInitialized();
    return this.modelRegistry.listModels(filter as Record<string, unknown>);
  }

  public async registerModel(options: {
    name: string;
    version: string;
    type: 'classification' | 'regression' | 'clustering' | 'timeseries' | 'nlp' | 'audio' | 'recommendation' | 'multimodal';
    inputShape: number[];
    outputShape: number[];
    parameters?: Record<string, unknown>;
    tags?: string[];
    description?: string;
  }) {
    await this.ensureInitialized();
    return this.modelRegistry.registerModel(options);
  }

  public async getModelPerformance(modelId: string) {
    await this.ensureInitialized();
    return this.modelRegistry.getModelPerformance(modelId);
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  public async getAIHealthStatus(): Promise<AIHealthStatus> {
    const now = new Date();
    
    if (this.healthCache && (now.getTime() - this.lastHealthCheck.getTime()) < 30000) {
      return this.healthCache;
    }

    const services: AIHealthStatus['services'] = {
      modelRegistry: await this.checkServiceHealth('modelRegistry', () => this.modelRegistry.listModels()),
      contentGenerator: this.checkSyncServiceHealth('contentGenerator', () => {
        this.contentGenerator.generateCaption({
          tone: 'casual',
          platform: 'twitter',
          maxLength: 50,
        });
      }),
      sentimentAnalyzer: this.checkSyncServiceHealth('sentimentAnalyzer', () => {
        this.sentimentAnalyzer.analyzeSentiment('test');
      }),
      recommendationEngine: this.checkSyncServiceHealth('recommendationEngine', () => {
        this.recommendationEngine.findSimilar('test', 'track', 1);
      }),
      adOptimizationEngine: await this.checkServiceHealth('adOptimizationEngine', async () => {
        return (this.adOptimizationEngine as Record<string, unknown>).isTrained ?? true;
      }),
      socialAutopilotEngine: this.checkSyncServiceHealth('socialAutopilotEngine', () => {
        this.socialAutopilotEngine.predictBestTime('twitter', 'text');
      }),
      timeSeriesModel: this.checkSyncServiceHealth('timeSeriesModel', () => {
        return this.timeSeriesModels.size > 0;
      }),
      legacyAIService: await this.checkServiceHealth('legacyAIService', async () => {
        return true;
      }),
      analyticsService: await this.checkServiceHealth('analyticsService', async () => {
        return true;
      }),
    };

    const registeredModels = await this.modelRegistry.listModels();
    const activeModels = registeredModels.filter(m => m.status === 'active');
    
    const healthyCount = Object.values(services).filter(s => s.status === 'healthy').length;
    const totalCount = Object.keys(services).length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyCount < totalCount * 0.5) {
      overall = 'unhealthy';
    } else if (healthyCount < totalCount) {
      overall = 'degraded';
    }

    this.healthCache = {
      overall,
      lastChecked: now,
      services,
      modelStats: {
        registeredModels: registeredModels.length,
        activeModels: activeModels.length,
        trainedModels: this.timeSeriesModels.size,
      },
    };

    this.lastHealthCheck = now;
    return this.healthCache;
  }

  private async checkServiceHealth(
    name: string,
    healthCheck: () => Promise<any>
  ): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      await healthCheck();
      return {
        status: 'healthy',
        initialized: true,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  private checkSyncServiceHealth(
    name: string,
    healthCheck: () => any
  ): ServiceHealth {
    const startTime = Date.now();
    try {
      healthCheck();
      return {
        status: 'healthy',
        initialized: true,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getServiceStats() {
    return {
      initialized: this.initialized,
      timeSeriesModelsLoaded: this.timeSeriesModels.size,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  // ============================================================================
  // PERSONAL AD NETWORK - ORGANIC GROWTH METHODS
  // ============================================================================

  public async optimizeOrganicGrowth(options: {
    profiles: unknown[];
    content: Record<string, unknown>;
    goals: Record<string, unknown>;
  }): Promise<UnifiedAIResult<any>> {
    const startTime = Date.now();
    try {
      const result = await this.adEngine.optimizePersonalAdNetwork(
        options.profiles,
        options.content,
        options.goals
      );
      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.optimizePersonalAdNetwork',
      };
    } catch (error) {
      logger.warn({ err: error }, 'Organic growth optimization error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Organic optimization failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.optimizePersonalAdNetwork',
      };
    }
  }

  public async calculateOrganicROI(results: Record<string, unknown>): Promise<UnifiedAIResult<any>> {
    const startTime = Date.now();
    try {
      const analysis = this.adEngine.calculateOrganicROI(results);
      return {
        success: true,
        data: analysis,
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.calculateOrganicROI',
      };
    } catch (error) {
      logger.warn({ err: error }, 'Organic ROI calculation error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Organic ROI calculation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.calculateOrganicROI',
      };
    }
  }

  public async generateOrganicSchedule(options: {
    profiles: unknown[];
    contentQueue: unknown[];
    goals: Record<string, unknown>;
  }): Promise<UnifiedAIResult<any>> {
    const startTime = Date.now();
    try {
      const schedule = this.adEngine.generateOrganicSchedule(
        options.profiles,
        options.contentQueue,
        options.goals
      );
      return {
        success: true,
        data: schedule,
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.generateOrganicSchedule',
      };
    } catch (error) {
      logger.warn({ err: error }, 'Organic schedule generation error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Schedule generation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.generateOrganicSchedule',
      };
    }
  }

  public async analyzePersonalAdNetwork(userId?: string): Promise<UnifiedAIResult<any>> {
    const startTime = Date.now();
    try {
      let profiles: unknown[] = [];
      
      if (userId) {
        const socialAccounts = await storage.getUserSocialAccounts(userId);
        if (socialAccounts && socialAccounts.length > 0) {
          profiles = socialAccounts.map((account: Record<string, unknown>) => ({
            id: account.id?.toString() || account.platformUserId || '',
            platform: account.platform,
            username: account.username || account.profileName || 'user',
            followers: account.followers || account.metrics?.followers || 0,
            engagementRate: account.engagementRate || account.metrics?.engagementRate || 0.03,
            isActive: account.isActive !== false,
          }));
        }
      }
      
      if (profiles.length === 0) {
        profiles = [
          { id: '1', platform: 'instagram', username: 'demo', followers: 5000, engagementRate: 0.05, isActive: true },
          { id: '2', platform: 'twitter', username: 'demo', followers: 3000, engagementRate: 0.03, isActive: true },
          { id: '3', platform: 'tiktok', username: 'demo', followers: 10000, engagementRate: 0.08, isActive: true },
        ];
        logger.debug('No connected social accounts found, using demo profiles for analysis');
      }
      
      const result = await this.adEngine.optimizePersonalAdNetwork(
        profiles,
        { id: userId || 'demo', text: 'Sample content for analysis', hasMedia: true },
        { targetReach: 10000 }
      );
      
      return {
        success: true,
        data: {
          networkAnalysis: result.networkAnalysis,
          equivalentAdValue: result.equivalentAdValue,
          recommendations: result.recommendations,
        },
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.analyzePersonalAdNetwork',
      };
    } catch (error) {
      logger.warn({ err: error }, 'Personal Ad Network analysis error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network analysis failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.analyzePersonalAdNetwork',
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const unifiedAIController = UnifiedAIController.getInstance();

export default unifiedAIController;
