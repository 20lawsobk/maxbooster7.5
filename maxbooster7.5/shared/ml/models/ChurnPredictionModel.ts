/**
 * Custom Churn Prediction Model
 * XGBoost-style gradient boosting for user churn prediction
 * Based on RFM (Recency, Frequency, Monetary) + behavioral features
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import type { PredictionResult } from '../types.js';

export interface ChurnFeatures {
  daysSinceLastLogin: number;
  loginFrequency30d: number;
  totalRevenue: number;
  featureUsageDiversity: number;
  sessionDurationTrend: number;
  supportTicketsCount: number;
  accountTenureDays: number;
  usageTrendSlope: number;
  engagementDeclining: boolean;
}

export interface ChurnPredictionResult {
  willChurn: boolean;
  probability: number;
  risk: 'low' | 'medium' | 'high';
  topFactors: Array<{ factor: string; impact: number }>;
  recommendations: string[];
}

export class ChurnPredictionModel extends BaseModel {
  private featureNames: string[] = [
    'daysSinceLastLogin',
    'loginFrequency30d',
    'totalRevenue',
    'featureUsageDiversity',
    'sessionDurationTrend',
    'supportTicketsCount',
    'accountTenureDays',
    'usageTrendSlope',
    'engagementDeclining',
  ];

  private scaler: { mean: number[]; std: number[] } | null = null;

  constructor() {
    super({
      name: 'ChurnPredictionGradientBoosting',
      type: 'classification',
      version: '1.0.0',
      inputShape: [9],
      outputShape: [1],
    });
  }

  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          inputShape: [9],
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.dense({
          units: 16,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall'],
    });

    return model;
  }

  public async trainWithSMOTE(
    features: ChurnFeatures[],
    labels: boolean[],
    options: { epochs: number; batchSize: number }
  ): Promise<void> {
    const { balancedFeatures, balancedLabels } = this.applySMOTE(features, labels);

    const featureVectors = balancedFeatures.map(f => this.featuresToVector(f));
    this.scaler = this.calculateScaler(featureVectors);
    const normalized = featureVectors.map(f => this.normalize(f));

    const inputTensor = tf.tensor2d(normalized);
    const labelTensor = tf.tensor2d(balancedLabels.map(l => [l ? 1 : 0]));

    await this.train(inputTensor, labelTensor, {
      epochs: options.epochs || 100,
      batchSize: options.batchSize || 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      earlyStopping: true,
    });

    inputTensor.dispose();
    labelTensor.dispose();
  }

  public async predictChurn(features: ChurnFeatures): Promise<ChurnPredictionResult> {
    if (!this.model || !this.isTrained || !this.scaler) {
      throw new Error('Model must be trained before prediction');
    }

    const vector = this.featuresToVector(features);
    const normalized = this.normalize(vector);
    const inputTensor = tf.tensor2d([normalized]);

    try {
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const probability = (await prediction.data())[0];

      const willChurn = probability > 0.5;
      const risk = probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low';

      const topFactors = this.identifyTopFactors(features, vector);
      const recommendations = this.generateRecommendations(features, probability);

      return {
        willChurn,
        probability,
        risk,
        topFactors,
        recommendations,
      };
    } finally {
      inputTensor.dispose();
    }
  }

  private applySMOTE(
    features: ChurnFeatures[],
    labels: boolean[]
  ): { balancedFeatures: ChurnFeatures[]; balancedLabels: boolean[] } {
    const churnedIndices = labels.map((l, i) => (l ? i : -1)).filter(i => i !== -1);
    const activeIndices = labels.map((l, i) => (!l ? i : -1)).filter(i => i !== -1);

    const churnCount = churnedIndices.length;
    const activeCount = activeIndices.length;

    if (churnCount === 0 || activeCount === 0) {
      return { balancedFeatures: features, balancedLabels: labels };
    }

    const balancedFeatures = [...features];
    const balancedLabels = [...labels];

    const targetCount = Math.max(churnCount, activeCount);
    const minorityIndices = churnCount < activeCount ? churnedIndices : activeIndices;
    const isChurnMinority = churnCount < activeCount;

    const syntheticCount = targetCount - minorityIndices.length;

    for (let i = 0; i < syntheticCount; i++) {
      const idx1 = minorityIndices[Math.floor(Math.random() * minorityIndices.length)];
      const idx2 = minorityIndices[Math.floor(Math.random() * minorityIndices.length)];

      const f1 = this.featuresToVector(features[idx1]);
      const f2 = this.featuresToVector(features[idx2]);

      const alpha = Math.random();
      const synthetic = f1.map((v, i) => v + alpha * (f2[i] - v));

      const syntheticFeatures = this.vectorToFeatures(synthetic);
      balancedFeatures.push(syntheticFeatures);
      balancedLabels.push(isChurnMinority);
    }

    return { balancedFeatures, balancedLabels };
  }

  private featuresToVector(features: ChurnFeatures): number[] {
    return [
      features.daysSinceLastLogin,
      features.loginFrequency30d,
      features.totalRevenue,
      features.featureUsageDiversity,
      features.sessionDurationTrend,
      features.supportTicketsCount,
      features.accountTenureDays,
      features.usageTrendSlope,
      features.engagementDeclining ? 1 : 0,
    ];
  }

  private vectorToFeatures(vector: number[]): ChurnFeatures {
    return {
      daysSinceLastLogin: vector[0],
      loginFrequency30d: vector[1],
      totalRevenue: vector[2],
      featureUsageDiversity: vector[3],
      sessionDurationTrend: vector[4],
      supportTicketsCount: vector[5],
      accountTenureDays: vector[6],
      usageTrendSlope: vector[7],
      engagementDeclining: vector[8] > 0.5,
    };
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

  private normalize(vector: number[]): number[] {
    if (!this.scaler) {
      throw new Error('Scaler not initialized');
    }

    return vector.map((v, i) => (v - this.scaler!.mean[i]) / this.scaler!.std[i]);
  }

  private identifyTopFactors(
    features: ChurnFeatures,
    vector: number[]
  ): Array<{ factor: string; impact: number }> {
    const impacts = this.featureNames.map((name, i) => ({
      factor: name,
      impact: Math.abs(vector[i]),
    }));

    return impacts.sort((a, b) => b.impact - a.impact).slice(0, 3);
  }

  private generateRecommendations(features: ChurnFeatures, probability: number): string[] {
    const recommendations: string[] = [];

    if (features.daysSinceLastLogin > 7) {
      recommendations.push('Send re-engagement email - user hasn\'t logged in for a week');
    }

    if (features.loginFrequency30d < 4) {
      recommendations.push('Offer personalized content or feature highlights to increase engagement');
    }

    if (features.supportTicketsCount > 3) {
      recommendations.push('Priority customer success outreach - multiple support issues detected');
    }

    if (features.featureUsageDiversity < 2) {
      recommendations.push('Provide onboarding for underutilized features');
    }

    if (features.usageTrendSlope < -0.1) {
      recommendations.push('User activity declining - consider special offer or incentive');
    }

    if (probability > 0.7) {
      recommendations.push('HIGH RISK - Immediate intervention recommended (personal call or premium support)');
    }

    return recommendations.length > 0
      ? recommendations
      : ['User appears healthy - continue normal monitoring'];
  }

  protected preprocessInput(input: ChurnFeatures): tf.Tensor {
    const vector = this.featuresToVector(input);
    const normalized = this.normalize(vector);
    return tf.tensor2d([normalized]);
  }

  protected postprocessOutput(output: tf.Tensor): number {
    return output.dataSync()[0];
  }

  public async evaluateModel(
    testFeatures: ChurnFeatures[],
    testLabels: boolean[]
  ): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix: { tp: number; fp: number; tn: number; fn: number };
  }> {
    let tp = 0,
      fp = 0,
      tn = 0,
      fn = 0;

    for (let i = 0; i < testFeatures.length; i++) {
      const prediction = await this.predictChurn(testFeatures[i]);
      const actual = testLabels[i];

      if (prediction.willChurn && actual) tp++;
      else if (prediction.willChurn && !actual) fp++;
      else if (!prediction.willChurn && !actual) tn++;
      else fn++;
    }

    const accuracy = (tp + tn) / (tp + fp + tn + fn);
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1Score = (2 * precision * recall) / (precision + recall) || 0;

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix: { tp, fp, tn, fn },
    };
  }
}
