/**
 * Custom Engagement Prediction Model
 * Gradient Boosting for predicting likes, comments, shares
 * Based on content features + temporal patterns + user history
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import type { EngagementPrediction } from '../types.js';

export interface ContentFeatures {
  postLength: number;
  sentimentScore: number;
  hashtagCount: number;
  emojiCount: number;
  mediaPresent: boolean;
  textComplexity: number;
  hourOfDay: number;
  dayOfWeek: number;
  timeSinceLastPost: number;
  followerCount: number;
  historicalAvgLikes: number;
  historicalEngagementRate: number;
  accountAge: number;
  engagementRateLast30d: number;
  postingFrequency: number;
  trendingHashtagsUsed: number;
}

export interface EngagementTargets {
  likes: number;
  comments: number;
  shares: number;
}

export class EngagementPredictionModel extends BaseModel {
  private scaler: { mean: number[]; std: number[] } | null = null;
  private targetScaler: { mean: number[]; std: number[] } | null = null;

  constructor() {
    super({
      name: 'EngagementPredictionGradientBoosting',
      type: 'regression',
      version: '1.0.0',
      inputShape: [16],
      outputShape: [3],
    });
  }

  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [16],
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        tf.layers.dense({
          units: 16,
          activation: 'relu',
        }),

        tf.layers.dense({
          units: 3,
          activation: 'linear',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    return model;
  }

  public async trainModel(
    features: ContentFeatures[],
    targets: EngagementTargets[],
    options: { epochs: number; batchSize: number }
  ): Promise<void> {
    const featureVectors = features.map(f => this.featuresToVector(f));
    const targetVectors = targets.map(t => [
      Math.log1p(t.likes),
      Math.log1p(t.comments),
      Math.log1p(t.shares),
    ]);

    this.scaler = this.calculateScaler(featureVectors);
    this.targetScaler = this.calculateScaler(targetVectors);

    const normalized = featureVectors.map(f => this.normalizeFeatures(f));
    const normalizedTargets = targetVectors.map(t => this.normalizeTargets(t));

    const inputTensor = tf.tensor2d(normalized);
    const targetTensor = tf.tensor2d(normalizedTargets);

    await this.train(inputTensor, targetTensor, {
      epochs: options.epochs || 200,
      batchSize: options.batchSize || 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      earlyStopping: true,
    });

    inputTensor.dispose();
    targetTensor.dispose();
  }

  public async predictEngagement(features: ContentFeatures): Promise<EngagementPrediction> {
    if (!this.model || !this.isTrained || !this.scaler || !this.targetScaler) {
      throw new Error('Model must be trained before prediction');
    }

    const vector = this.featuresToVector(features);
    const normalized = this.normalizeFeatures(vector);
    const inputTensor = tf.tensor2d([normalized]);

    try {
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const normalizedPred = await prediction.data();

      const denormalized = this.denormalizeTargets(Array.from(normalizedPred));

      const likes = Math.round(Math.expm1(denormalized[0]));
      const comments = Math.round(Math.expm1(denormalized[1]));
      const shares = Math.round(Math.expm1(denormalized[2]));

      const totalEngagement = likes + comments * 2 + shares * 3;
      const score = Math.min(100, (totalEngagement / features.followerCount) * 100);
      const confidence = this.calculateConfidence(features);

      const suggestions = this.generateSuggestions(features, score);

      const estimatedReach = Math.round(
        features.followerCount * (0.1 + (score / 100) * 0.4)
      );
      const estimatedClicks = Math.round(estimatedReach * 0.02);

      return {
        score,
        confidence,
        suggestions,
        predictedReach: estimatedReach,
        predictedClicks: estimatedClicks,
      };
    } finally {
      inputTensor.dispose();
    }
  }

  private featuresToVector(features: ContentFeatures): number[] {
    return [
      features.postLength,
      features.sentimentScore,
      features.hashtagCount,
      features.emojiCount,
      features.mediaPresent ? 1 : 0,
      features.textComplexity,
      features.hourOfDay,
      features.dayOfWeek,
      features.timeSinceLastPost,
      features.followerCount,
      features.historicalAvgLikes,
      features.historicalEngagementRate,
      features.accountAge,
      features.engagementRateLast30d,
      features.postingFrequency,
      features.trendingHashtagsUsed,
    ];
  }

  private calculateScaler(vectors: number[][]): { mean: number[]; std: number[] } {
    const numFeatures = vectors[0].length;
    const mean: number[] = new Array(numFeatures).fill(0);
    const std: number[] = new Array(numFeatures).fill(0);

    for (const vector of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        mean[i] += vector[i];
      }
    }

    for (let i = 0; i < numFeatures; i++) {
      mean[i] /= vectors.length;
    }

    for (const vector of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        std[i] += Math.pow(vector[i] - mean[i], 2);
      }
    }

    for (let i = 0; i < numFeatures; i++) {
      std[i] = Math.sqrt(std[i] / vectors.length) || 1;
    }

    return { mean, std };
  }

  private normalizeFeatures(vector: number[]): number[] {
    if (!this.scaler) throw new Error('Scaler not initialized');
    return vector.map((v, i) => (v - this.scaler!.mean[i]) / this.scaler!.std[i]);
  }

  private normalizeTargets(vector: number[]): number[] {
    if (!this.targetScaler) throw new Error('Target scaler not initialized');
    return vector.map((v, i) => (v - this.targetScaler!.mean[i]) / this.targetScaler!.std[i]);
  }

  private denormalizeTargets(vector: number[]): number[] {
    if (!this.targetScaler) throw new Error('Target scaler not initialized');
    return vector.map((v, i) => v * this.targetScaler!.std[i] + this.targetScaler!.mean[i]);
  }

  private calculateConfidence(features: ContentFeatures): number {
    let confidence = 0.7;

    if (features.historicalEngagementRate > 0) confidence += 0.1;
    if (features.historicalAvgLikes > 100) confidence += 0.1;
    if (features.accountAge > 365) confidence += 0.05;
    if (features.postingFrequency > 10) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  private generateSuggestions(features: ContentFeatures, score: number): string[] {
    const suggestions: string[] = [];

    if (features.hashtagCount < 3) {
      suggestions.push('Add 3-5 relevant hashtags to increase discoverability');
    }

    if (!features.mediaPresent) {
      suggestions.push('Posts with images/videos get 2-3x more engagement');
    }

    if (features.postLength < 50) {
      suggestions.push('Add more context - posts with 100-150 characters perform best');
    }

    if (features.emojiCount === 0) {
      suggestions.push('Consider adding 1-2 emojis for more engaging content');
    }

    if (features.hourOfDay < 6 || features.hourOfDay > 22) {
      suggestions.push('Post during peak hours (8AM-10AM or 7PM-9PM) for better reach');
    }

    if (features.timeSinceLastPost < 2) {
      suggestions.push('Wait at least 2-3 hours between posts to avoid audience fatigue');
    }

    if (features.sentimentScore < -0.2) {
      suggestions.push('Consider more positive messaging for better engagement');
    }

    if (score < 30) {
      suggestions.push('LOW ENGAGEMENT PREDICTED - Consider revising content strategy');
    } else if (score > 70) {
      suggestions.push('HIGH ENGAGEMENT PREDICTED - Great content! Post at optimal time.');
    }

    return suggestions;
  }

  protected preprocessInput(input: ContentFeatures): tf.Tensor {
    const vector = this.featuresToVector(input);
    const normalized = this.normalizeFeatures(vector);
    return tf.tensor2d([normalized]);
  }

  protected postprocessOutput(output: tf.Tensor): EngagementTargets {
    const data = output.dataSync();
    const denormalized = this.denormalizeTargets(Array.from(data));

    return {
      likes: Math.round(Math.expm1(denormalized[0])),
      comments: Math.round(Math.expm1(denormalized[1])),
      shares: Math.round(Math.expm1(denormalized[2])),
    };
  }

  public async evaluateModel(
    testFeatures: ContentFeatures[],
    testTargets: EngagementTargets[]
  ): Promise<{
    likesR2: number;
    commentsR2: number;
    sharesR2: number;
    overallR2: number;
  }> {
    const predictions: EngagementTargets[] = [];

    for (const features of testFeatures) {
      const vector = this.featuresToVector(features);
      const normalized = this.normalizeFeatures(vector);
      const inputTensor = tf.tensor2d([normalized]);

      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      const pred = this.postprocessOutput(prediction);
      predictions.push(pred);

      inputTensor.dispose();
      prediction.dispose();
    }

    const likesR2 = this.calculateR2(
      testTargets.map(t => t.likes),
      predictions.map(p => p.likes)
    );

    const commentsR2 = this.calculateR2(
      testTargets.map(t => t.comments),
      predictions.map(p => p.comments)
    );

    const sharesR2 = this.calculateR2(
      testTargets.map(t => t.shares),
      predictions.map(p => p.shares)
    );

    const overallR2 = (likesR2 + commentsR2 + sharesR2) / 3;

    return { likesR2, commentsR2, sharesR2, overallR2 };
  }

  private calculateR2(actual: number[], predicted: number[]): number {
    const mean = actual.reduce((sum, val) => sum + val, 0) / actual.length;
    const ssTotal = actual.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    const ssResidual = actual.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);

    return 1 - ssResidual / ssTotal;
  }
}
