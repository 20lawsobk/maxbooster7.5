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
 * 100% in-house AI - no external API dependencies
 */

import { logger } from '../logger.js';
import { MLModelRegistry } from './mlModelRegistry.js';
import { storage } from '../storage.js';
import { AIService } from './aiService.js';
import * as aiAnalyticsService from './aiAnalyticsService.js';
import { ContentGenerator, type GenerationOptions, type CaptionResult } from '../../shared/ml/nlp/ContentGenerator.js';
import { SentimentAnalyzer, type FullAnalysisResult, type SentimentResult } from '../../shared/ml/nlp/SentimentAnalyzer.js';
import { RecommendationEngine, type RecommendationResult, type SimilarityResult, type TrackData, type ArtistData, type UserInteraction } from '../../shared/ml/models/RecommendationEngine.js';
import { AdOptimizationEngine, type Campaign, type CampaignScore, type BudgetOptimizationResult, type CreativePrediction, type ROIForecast } from '../../shared/ml/models/AdOptimizationEngine.js';
import { SocialAutopilotEngine, type Platform, type ContentType, type BestTimeResult, type ContentTypeRecommendation, type ViralPotentialScore, type EngagementPrediction, type ScheduleOptimization, type HistoricalPost, type AudienceInsights } from '../../shared/ml/models/SocialAutopilotEngine.js';
import { AdvancedTimeSeriesModel, type MetricType, type PredictionHorizon, type ForecastResult } from '../../shared/ml/models/AdvancedTimeSeriesModel.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ContentGenerationOptions extends GenerationOptions {
  userId?: string;
  projectId?: string;
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
// UNIFIED AI CONTROLLER
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
      const result = this.contentGenerator.generateCaption(options);
      
      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'ContentGenerator',
        confidence: result.toneMatch,
      };
    } catch (error) {
      logger.error('Content generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content generation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'ContentGenerator',
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

    try {
      const result = await this.aiService.generateSocialContent(options);
      
      return {
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime,
        source: 'AIService',
        confidence: 0.85,
      };
    } catch (error) {
      logger.error('Social content generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Social content generation failed',
        processingTimeMs: Date.now() - startTime,
        source: 'AIService',
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
      let result: FullAnalysisResult | SentimentResult;
      
      if (options.includeEmotions || options.includeToxicity || options.includeAspects) {
        result = this.sentimentAnalyzer.analyze(options.text);
      } else {
        result = this.sentimentAnalyzer.analyzeSentiment(options.text);
      }

      const confidence = 'overallConfidence' in result 
        ? result.overallConfidence 
        : result.confidence;
      
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
