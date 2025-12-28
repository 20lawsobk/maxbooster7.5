/**
 * Export all custom ML models
 * 100% in-house AI implementation - no external APIs
 */

export { BaseModel } from './BaseModel.js';
export { TimeSeriesForecastModel } from './TimeSeriesForecastModel.js';
export { AnomalyDetectionModel } from './AnomalyDetectionModel.js';
export { ChurnPredictionModel } from './ChurnPredictionModel.js';
export { GenreClassificationModel, GENRES, type Genre } from './GenreClassificationModel.js';
export { BPMDetectionModel } from './BPMDetectionModel.js';
export { EngagementPredictionModel } from './EngagementPredictionModel.js';
export { ContentPatternLearner } from './ContentPatternLearner.js';
export { IntelligentMixingModel } from './IntelligentMixingModel.js';
export { BrandVoiceAnalyzer } from './BrandVoiceAnalyzer.js';
export { SocialMediaAutopilotAI } from './SocialMediaAutopilotAI.js';
export { AdvertisingAutopilotAI } from './AdvertisingAutopilotAI.js';
export { AdvertisingAutopilotAI_v3 } from './AdvertisingAutopilotAI_v3.js';
export { RecommendationEngine } from './RecommendationEngine.js';
export { AdvancedTimeSeriesModel } from './AdvancedTimeSeriesModel.js';
export { AdOptimizationEngine } from './AdOptimizationEngine.js';
export { SocialAutopilotEngine } from './SocialAutopilotEngine.js';

export type {
  Platform,
  ContentType,
  DayOfWeek,
  HistoricalPost,
  AudienceInsights,
  TrendingTopic,
  BestTimeResult,
  ContentTypeRecommendation,
  ViralPotentialScore,
  ContentAdaptation,
  ScheduleOptimization,
  TrendDetectionResult,
  EngagementPrediction as SocialEngagementPrediction,
  FollowerGrowthStrategy,
} from './SocialAutopilotEngine.js';

export type {
  Campaign,
  CampaignMetrics,
  CampaignScore,
  AudienceTargeting,
  Creative,
  CreativeMetrics,
  BudgetAllocation,
  BudgetOptimizationResult,
  AudienceCluster,
  AudienceTargetingResult,
  CreativeVariant,
  CreativePrediction,
  ROIForecast,
  ROIPredictionPoint,
  ABTestRecommendation,
} from './AdOptimizationEngine.js';

export type {
  TimeSeriesForecast,
  ForecastResult,
  SeasonalityPattern,
  MetricType,
  PredictionHorizon,
  TrendDecomposition,
  VisualizationData,
  HyperParameters,
  FeatureSet,
} from './AdvancedTimeSeriesModel.js';

export type {
  ChurnFeatures,
  ChurnPredictionResult,
} from './ChurnPredictionModel.js';

export type {
  BPMDetectionResult,
  KeyDetectionResult,
} from './BPMDetectionModel.js';

export type {
  ContentFeatures,
  EngagementTargets,
} from './EngagementPredictionModel.js';

export type {
  NGram,
  MarkovChain,
} from './ContentPatternLearner.js';

export type {
  MixingParameters,
  MasteringParameters,
  AudioAnalysis,
} from './IntelligentMixingModel.js';

export type {
  AudioFeatureVector,
  TrackData,
  ArtistData,
  UserInteraction,
  SimilarityResult,
  RecommendationResult,
  PlaylistConfig,
  GeneratedPlaylist,
  CollaboratorMatch,
} from './RecommendationEngine.js';
