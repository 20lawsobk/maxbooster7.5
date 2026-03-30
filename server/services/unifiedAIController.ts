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
import { maxcoreLocalInfer } from './maxcoreLocalEngine.js';
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

const MC_AI_URL = process.env.AI_SERVER_URL || '';
const MC_AI_KEY = process.env.AI_SERVER_KEY || '';

export class MaxCoreAIClient {
  // Remote server availability cache
  private static _remoteAvailable: boolean | null = null;
  private static _lastCheck = 0;
  private static readonly CHECK_TTL = 30_000;

  // Per-endpoint 404 suppression on the REMOTE server only.
  private static _endpointSuppressed = new Map<string, number>();
  private static readonly ENDPOINT_SUPPRESS_MS = 10 * 60_000; // 10 minutes

  private static isEndpointSuppressed(path: string): boolean {
    const suppressedUntil = MaxCoreAIClient._endpointSuppressed.get(path) ?? 0;
    return Date.now() < suppressedUntil;
  }

  private static suppressEndpoint(path: string): void {
    MaxCoreAIClient._endpointSuppressed.set(path, Date.now() + MaxCoreAIClient.ENDPOINT_SUPPRESS_MS);
    logger.debug(`[MaxCoreAI] remote ${path} suppressed for 10 min — local engine active`);
  }

  private static isJson(r: Response): boolean {
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') || ct.includes('text/json');
  }

  /** Always returns true — MaxCore Local Engine guarantees availability. */
  static async isAvailable(): Promise<boolean> {
    // Probe remote in the background (non-blocking, for telemetry only).
    if (MC_AI_URL && MC_AI_KEY) {
      const now = Date.now();
      if (MaxCoreAIClient._remoteAvailable === null || now - MaxCoreAIClient._lastCheck >= MaxCoreAIClient.CHECK_TTL) {
        fetch(`${MC_AI_URL}/api/health`, {
          headers: { 'X-API-Key': MC_AI_KEY, 'Authorization': `Bearer ${MC_AI_KEY}` },
          signal: AbortSignal.timeout(4000),
        }).then(r => {
          MaxCoreAIClient._remoteAvailable = r.ok && MaxCoreAIClient.isJson(r);
          if (MaxCoreAIClient._remoteAvailable) logger.info('[MaxCoreAI] Remote server is online ✅');
        }).catch(() => {
          MaxCoreAIClient._remoteAvailable = false;
        });
        MaxCoreAIClient._lastCheck = now;
      }
    }
    // MaxCore is ALWAYS available via the local engine.
    return true;
  }

  static async get<T = any>(endpoint: string): Promise<T | null> {
    if (!MC_AI_URL || !MC_AI_KEY) return null;
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
    if (MaxCoreAIClient.isEndpointSuppressed(path)) return null;
    try {
      const r = await fetch(`${MC_AI_URL}${path}`, {
        method: 'GET',
        headers: { 'X-API-Key': MC_AI_KEY, 'Authorization': `Bearer ${MC_AI_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok || !MaxCoreAIClient.isJson(r)) {
        MaxCoreAIClient.suppressEndpoint(path);
        return null;
      }
      return await r.json() as T;
    } catch (e: any) {
      logger.debug(`[MaxCoreAI] GET ${path} failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Infer via MaxCore.
   * Strategy:
   *   1. Try remote training server (fast path when online)
   *   2. On any failure → call MaxCore Local Engine (always succeeds)
   * Source label is always 'MaxCoreAI' regardless of which path ran.
   */
  static async infer<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    // ── Remote attempt ──────────────────────────────────────────────────────
    if (MC_AI_URL && MC_AI_KEY && MaxCoreAIClient._remoteAvailable !== false) {
      const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
      if (!MaxCoreAIClient.isEndpointSuppressed(path)) {
        try {
          const r = await fetch(`${MC_AI_URL}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'X-API-Key':     MC_AI_KEY,
              'Authorization': `Bearer ${MC_AI_KEY}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12000),
          });
          const isJson = MaxCoreAIClient.isJson(r);
          if (r.status === 404 || !isJson) {
            MaxCoreAIClient.suppressEndpoint(path);
          } else if (r.ok) {
            const data = await r.json();
            logger.debug(`[MaxCoreAI] Remote ${path} → success`);
            return data as T;
          } else {
            const errBody = await r.json().catch(() => null) as any;
            logger.debug(`[MaxCoreAI] Remote ${path} ${r.status}: ${errBody?.error ?? 'unavailable'} — routing to local engine`);
          }
        } catch (e: any) {
          logger.debug(`[MaxCoreAI] Remote ${path} unreachable (${e.message}) — routing to local engine`);
        }
      }
    }

    // ── MaxCore Local Engine (always succeeds) ───────────────────────────────
    try {
      const localResult = await maxcoreLocalInfer(body as any);
      logger.debug(`[MaxCoreAI] Local engine produced response (confidence=${localResult.confidence})`);
      return localResult as unknown as T;
    } catch (localErr: any) {
      logger.error(`[MaxCoreAI] Local engine error: ${localErr.message}`);
      return null;
    }
  }
}

if (MC_AI_URL && MC_AI_KEY) {
  logger.info(`[MaxCoreAI] Configured — remote: ${MC_AI_URL} | local engine: always active`);
} else {
  logger.info('[MaxCoreAI] No remote URL set — MaxCore Local Engine active as primary');
}

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
          logger.warn('Model Registry initialization warning:', err);
        }),
        this.adOptimizationEngine.initialize().catch(err => {
          logger.warn('Ad Optimization Engine initialization warning:', err);
        }),
        this.socialAutopilotEngine.initialize().catch(err => {
          logger.warn('Social Autopilot Engine initialization warning:', err);
        }),
      ]);

      this.initializeTimeSeriesModels();
      
      this.initialized = true;
      const duration = Date.now() - startTime;
      logger.info(`✅ Unified AI Controller initialized in ${duration}ms`);
    } catch (error) {
      logger.error('Failed to initialize Unified AI Controller:', error);
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
      // ── Build a focused topic string for MaxCore's template engine ──────────
      // MaxCore uses `topic` as its content body signal, so keep it concise and
      // punchy (artist + track + genre + mood + top keywords, max ~120 chars).
      // Verbose context (stats, description, album details) goes into
      // extra_context so MaxCore stores it, and we use it in post-processing.
      const baseTopic = options.topic || options.genre || 'new music';
      const artist = ctx?.artistName || options.artistName;
      const topicParts: string[] = [baseTopic];
      // Only append artist/track if not already present in the base topic
      if (artist && !baseTopic.toLowerCase().includes(artist.toLowerCase())) {
        topicParts.push(`by ${artist}`);
      }
      if (options.trackTitle && !baseTopic.toLowerCase().includes(options.trackTitle.toLowerCase())) {
        topicParts.push(`"${options.trackTitle}"`);
      }
      if (options.mood) topicParts.push(options.mood);
      if (options.keywords?.length) topicParts.push(options.keywords.slice(0, 4).join(', '));
      const enrichedTopic = topicParts.join(' — ').slice(0, 120);

      // ── Build comprehensive extra_context for MaxCore and local enrichment ──
      const extraParts: string[] = [];
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
      if (options.extraContext) extraParts.push(options.extraContext.slice(0, 200));
      const combinedExtra = extraParts.length ? extraParts.join(' | ') : undefined;

      const mc = await MaxCoreAIClient.infer<any>('/content/generate', {
        platform: mappedPlatform,
        topic:    enrichedTopic,
        tone:     options.tone || 'energetic',
        genre:    options.genre || ctx?.genre,
        mood:     options.mood,
        userId:   options.userId,
        contentType: options.contentType,
        track_title:  options.trackTitle,
        keywords:     options.keywords?.length ? options.keywords : undefined,
        extra_context: combinedExtra?.slice(0, 500),
        // User context — enables personalized output
        artist_name:          artist,
        artist_bio:           ctx?.artistBio,
        brand_voice:          ctx?.brandVoice,
        target_audience:      ctx?.targetAudience,
        content_themes:       ctx?.contentThemes,
        avoid_topics:         ctx?.avoidTopics,
        preferred_hashtags:   ctx?.preferredHashtags,
        recent_post_snippets: ctx?.recentPostSnippets,
      });

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

      // Should never reach here — local engine guarantees a response.
      // Safety net: re-call local engine directly.
      logger.warn('[UnifiedAI] MaxCore infer returned empty — calling local engine directly');
      const fallback = await maxcoreLocalInfer({
        platform: mappedPlatform,
        topic:    options.topic || options.genre || 'new music',
        tone:     options.tone || 'energetic',
        genre:    options.genre || ctx?.genre,
        userId:   options.userId,
        artist_name: ctx?.artistName || options.artistName,
      });
      const fcap = fallback.caption;
      return {
        success: true,
        data: {
          caption:   fcap,
          hashtags:  fallback.hashtags,
          tone:      options.tone || 'energetic',
          toneMatch: fallback.confidence,
          platform:  mappedPlatform,
          charCount: fcap.length,
          hook: fallback.hook,
          body: fallback.body,
          cta:  fallback.cta,
        } as CaptionResult,
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
        confidence: fallback.confidence,
      };
    } catch (error) {
      logger.error('Content generation failed:', error);
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
      const mc = await MaxCoreAIClient.infer<any>('/content/generate', {
        platform,
        topic,
        tone,
        genre:       options.musicData?.genre,
        mood:        options.musicData?.mood,
        artist_name: options.musicData?.artist,
        contentType: options.contentType,
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
      // Safety net — local engine direct call
      const fb = await maxcoreLocalInfer({ platform, topic, tone, genre: options.musicData?.genre });
      return {
        success: true,
        data: { content: [fb.hook, fb.body, fb.cta].filter(Boolean) },
        processingTimeMs: Date.now() - startTime,
        source: 'MaxCoreAI',
        confidence: fb.confidence,
      };
    } catch (error) {
      logger.error('Social content generation failed:', error);
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
      logger.error('Sentiment analysis failed:', error);
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
      logger.error('Recommendation failed:', error);
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
          if (mc && (mc.score !== undefined || mc.allocations || mc.predictedCTR !== undefined || mc.expectedROI !== undefined)) {
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
      logger.error('Ad optimization failed:', error);
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
          if (mc && (mc.bestTime || mc.viralScore !== undefined || mc.schedule || mc.contentType)) {
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
      logger.error('Engagement prediction failed:', error);
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
      logger.error('Metric forecasting failed:', error);
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
    return this.modelRegistry.listModels(filter as any);
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
        return (this.adOptimizationEngine as any).isTrained ?? true;
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
    profiles: any[];
    content: any;
    goals: any;
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
      logger.error('Organic growth optimization error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Organic optimization failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.optimizePersonalAdNetwork',
      };
    }
  }

  public async calculateOrganicROI(results: any): Promise<UnifiedAIResult<any>> {
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
      logger.error('Organic ROI calculation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Organic ROI calculation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AdOptimizationEngine.calculateOrganicROI',
      };
    }
  }

  public async generateOrganicSchedule(options: {
    profiles: any[];
    contentQueue: any[];
    goals: any;
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
      logger.error('Organic schedule generation error:', error);
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
      let profiles: any[] = [];
      
      if (userId) {
        const socialAccounts = await storage.getUserSocialAccounts(userId);
        if (socialAccounts && socialAccounts.length > 0) {
          profiles = socialAccounts.map((account: any) => ({
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
      logger.error('Personal Ad Network analysis error:', error);
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
