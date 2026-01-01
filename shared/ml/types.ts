/**
 * Shared types for custom ML infrastructure
 * 100% in-house AI implementation - no external APIs
 */

export interface ModelMetadata {
  id: string;
  name: string;
  version: string;
  type: 'timeseries' | 'classification' | 'regression' | 'clustering' | 'anomaly' | 'multimodal' | 'reinforcement';
  inputShape: number[];
  outputShape: number[];
  createdAt: Date;
  lastTrained: Date;
  accuracy?: number;
  loss?: number;
  metrics?: Record<string, number>;
}

export interface TrainingData {
  inputs: number[][];
  labels: number[];
  validationSplit?: number;
}

export interface TrainingOptions {
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit?: number;
  earlyStopping?: boolean;
  verbose?: boolean;
}

export interface PredictionResult {
  predictions: number[];
  confidence: number[];
  metadata?: Record<string, any>;
}

export interface EvaluationMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  mse?: number;
  mae?: number;
  r2Score?: number;
  confusionMatrix?: number[][];
}

export interface TimeSeriesData {
  timestamps: Date[];
  values: number[];
  features?: number[][];
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  severity: 'low' | 'medium' | 'high';
  expectedValue: number;
  actualValue: number;
  description: string;
}

export interface GenreClassificationResult {
  genre: string;
  confidence: number;
  topGenres: Array<{ genre: string; confidence: number }>;
}

export interface AudioFeatures {
  mfcc: number[][];
  spectralCentroid: number[];
  spectralRolloff: number[];
  spectralFlux: number[];
  zeroCrossingRate: number[];
  chroma: number[][];
  tempo: number;
  key: string;
}

export interface ContentPattern {
  pattern: string;
  frequency: number;
  performance: number;
  examples: string[];
}

export interface EngagementPrediction {
  score: number;
  confidence: number;
  suggestions: string[];
  predictedReach: number;
  predictedClicks: number;
}

export interface BrandVoiceProfile {
  tone: 'formal' | 'casual' | 'mixed';
  emojiUsage: 'none' | 'light' | 'moderate' | 'heavy';
  hashtagFrequency: number;
  avgSentenceLength: number;
  vocabularyComplexity: 'simple' | 'moderate' | 'advanced';
  commonPhrases: string[];
  confidenceScore: number;
}
