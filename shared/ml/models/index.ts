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
export { SocialMediaAutopilotAI } from './SocialMediaAutopilotAI.ts';
export { AdvertisingAutopilotAI } from './AdvertisingAutopilotAI.ts';
export { AdvertisingAutopilotAI_v3 } from './AdvertisingAutopilotAI_v3.ts';

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
