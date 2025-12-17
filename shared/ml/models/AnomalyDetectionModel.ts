/**
 * Custom Anomaly Detection Model
 * Hybrid approach: Isolation Forest + Autoencoder neural network + Statistical baseline
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import { calculateStatistics, detectOutliersIQR, detectOutliersZScore } from '../statistics/core.js';
import { IsolationForest } from '../algorithms/IsolationForest.js';
import type { AnomalyResult } from '../types.js';

export class AnomalyDetectionModel extends BaseModel {
  private autoencoderModel: tf.LayersModel | null = null;
  private reconstructionThreshold: number = 0;
  private statisticalBaseline: { mean: number; std: number } | null = null;
  private isolationForest: IsolationForest | null = null;

  constructor() {
    super({
      name: 'AnomalyDetector',
      type: 'anomaly',
      version: '1.0.0',
      inputShape: [10], // Feature vector size
      outputShape: [10],
    });
  }

  /**
   * Build autoencoder for anomaly detection
   */
  protected buildModel(): tf.LayersModel {
    // Encoder
    const encoder = tf.sequential({
      layers: [
        tf.layers.dense({ units: 8, activation: 'relu', inputShape: [10] }),
        tf.layers.dense({ units: 4, activation: 'relu' }),
        tf.layers.dense({ units: 2, activation: 'relu' }), // Bottleneck
      ],
    });

    // Decoder
    const decoder = tf.sequential({
      layers: [
        tf.layers.dense({ units: 4, activation: 'relu', inputShape: [2] }),
        tf.layers.dense({ units: 8, activation: 'relu' }),
        tf.layers.dense({ units: 10, activation: 'linear' }), // Reconstruct input
      ],
    });

    // Full autoencoder
    const autoencoder = tf.sequential();
    autoencoder.add(encoder);
    autoencoder.add(decoder);

    autoencoder.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
    });

    this.autoencoderModel = autoencoder;
    return autoencoder;
  }

  /**
   * Train on pre-extracted normal feature vectors (10-dimensional)
   */
  public async trainOnNormalData(normalData: number[][]): Promise<void> {
    if (!this.model) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('Model initialization failed');
    }

    // Calculate statistical baseline from feature vectors
    const allValues = normalData.flat();
    const stats = calculateStatistics(allValues);
    this.statisticalBaseline = { mean: stats.mean, std: stats.stdDev };

    // Train Isolation Forest (fast, O(n log n)) on feature vectors
    this.isolationForest = new IsolationForest(100, 256, 0.01);
    this.isolationForest.fit(normalData);

    // Train autoencoder to reconstruct normal feature vectors
    const inputTensor = tf.tensor2d(normalData);

    try {
      await this.model.fit(inputTensor, inputTensor, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0,
      });

      // Calculate reconstruction threshold (95th percentile of reconstruction errors)
      const predictions = this.model.predict(inputTensor) as tf.Tensor;
      const reconstructionErrors = tf.losses.meanSquaredError(inputTensor, predictions);
      const errors = await reconstructionErrors.data();
      
      const sortedErrors = Array.from(errors).sort((a, b) => a - b);
      this.reconstructionThreshold = sortedErrors[Math.floor(sortedErrors.length * 0.95)];

      this.isTrained = true;
      this.metadata.lastTrained = new Date();
    } finally {
      inputTensor.dispose();
    }
  }

  /**
   * Detect anomalies in multi-dimensional feature data
   */
  public async detectAnomalies(featureData: number[][]): Promise<AnomalyResult[]> {
    if (!this.isTrained || !this.statisticalBaseline) {
      throw new Error('Model must be trained before detecting anomalies');
    }

    const results: AnomalyResult[] = [];

    for (let i = 0; i < featureData.length; i++) {
      const features = featureData[i];
      const result = await this.isAnomalyFromFeatures(features, i);
      
      if (result.isAnomaly) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Train on time series data (automatically extracts features)
   */
  public async trainOnTimeSeriesData(data: number[]): Promise<void> {
    const featureVectors: number[][] = [];

    for (let i = 10; i < data.length; i++) {
      const features = this.extractFeatures(data[i], data, i);
      featureVectors.push(features);
    }

    await this.trainOnNormalData(featureVectors);
  }

  /**
   * Detect anomalies in single-dimensional time series data
   * Automatically extracts features from temporal context
   */
  public async detectTimeSeriesAnomalies(data: number[]): Promise<AnomalyResult[]> {
    if (!this.isTrained || !this.statisticalBaseline) {
      throw new Error('Model must be trained before detecting anomalies');
    }

    const results: AnomalyResult[] = [];

    for (let i = 10; i < data.length; i++) {
      const features = this.extractFeatures(data[i], data, i);
      const result = await this.isAnomalyFromFeatures(features, i);
      
      if (result.isAnomaly) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Check if features represent an anomaly
   */
  private async isAnomalyFromFeatures(
    features: number[],
    index: number
  ): Promise<AnomalyResult> {
    if (!this.statisticalBaseline) {
      throw new Error('Statistical baseline not calculated');
    }

    // Compute overall feature statistics for Z-score
    const featureMean = features.reduce((sum, val) => sum + val, 0) / features.length;
    const featureStd = Math.sqrt(
      features.reduce((sum, val) => sum + Math.pow(val - featureMean, 2), 0) / features.length
    );
    const zScore = Math.abs((featureMean - this.statisticalBaseline.mean) / (this.statisticalBaseline.std || 1));
    const isStatisticalAnomaly = zScore > 3;

    // Isolation Forest detection (operates on same feature vector)
    let isIsolationAnomaly = false;
    let isolationScore = 0;
    
    if (this.isolationForest) {
      isIsolationAnomaly = this.isolationForest.predict(features);
      isolationScore = this.isolationForest.anomalyScore(features);
    }

    // Neural network detection (operates on same feature vector)
    let isNeuralAnomaly = false;
    let reconstructionError = 0;

    if (this.model) {
      const inputTensor = tf.tensor2d([features]);

      try {
        const prediction = this.model.predict(inputTensor) as tf.Tensor;
        const error = tf.losses.meanSquaredError(inputTensor, prediction);
        reconstructionError = (await error.data())[0];
        isNeuralAnomaly = reconstructionError > this.reconstructionThreshold;
      } finally {
        inputTensor.dispose();
      }
    }

    // Combine all three methods (voting ensemble)
    const isAnomaly = isStatisticalAnomaly || isIsolationAnomaly || isNeuralAnomaly;

    // Calculate severity (consider all detection methods)
    let severity: 'low' | 'medium' | 'high' = 'low';
    const highSeverity = zScore > 5 || reconstructionError > this.reconstructionThreshold * 2 || isolationScore > 0.8;
    const mediumSeverity = zScore > 4 || reconstructionError > this.reconstructionThreshold * 1.5 || isolationScore > 0.6;
    
    if (highSeverity) {
      severity = 'high';
    } else if (mediumSeverity) {
      severity = 'medium';
    }

    const value = features[0];
    const { mean } = this.statisticalBaseline;
    const isSpike = value > mean + 3 * featureStd;
    const isDrop = value < mean - 3 * featureStd;

    let description = '';
    if (isSpike) {
      description = `Unusual spike: ${value.toFixed(2)} (expected ~${mean.toFixed(2)})`;
    } else if (isDrop) {
      description = `Unusual drop: ${value.toFixed(2)} (expected ~${mean.toFixed(2)})`;
    } else {
      description = `Pattern anomaly detected at index ${index}`;
    }

    return {
      isAnomaly,
      score: Math.max(zScore / 5, reconstructionError / this.reconstructionThreshold, isolationScore),
      severity,
      expectedValue: mean,
      actualValue: value,
      description,
    };
  }

  /**
   * Extract features for neural network
   */
  private extractFeatures(value: number, context: number[], index: number): number[] {
    const features: number[] = [];

    // Current value
    features.push(value);

    // Previous values (up to 5)
    for (let i = 1; i <= 5; i++) {
      features.push(context[index - i] || 0);
    }

    // Statistics of recent window
    const recentWindow = context.slice(Math.max(0, index - 10), index);
    if (recentWindow.length > 0) {
      const recentMean = recentWindow.reduce((sum, val) => sum + val, 0) / recentWindow.length;
      const recentMax = Math.max(...recentWindow);
      const recentMin = Math.min(...recentWindow);

      features.push(recentMean, recentMax, recentMin);
    } else {
      features.push(0, 0, 0);
    }

    // Pad to feature vector size
    while (features.length < 10) {
      features.push(0);
    }

    return features.slice(0, 10);
  }

  /**
   * Batch anomaly detection with statistical methods
   */
  public detectAnomaliesStatistical(data: number[]): AnomalyResult[] {
    const stats = calculateStatistics(data);
    const { outliers } = detectOutliersIQR(data);

    return outliers.map(value => {
      const zScore = Math.abs((value - stats.mean) / (stats.stdDev || 1));
      
      return {
        isAnomaly: true,
        score: zScore / 5,
        severity: zScore > 5 ? 'high' : zScore > 4 ? 'medium' : 'low',
        expectedValue: stats.mean,
        actualValue: value,
        description: `Statistical outlier: ${value.toFixed(2)}`,
      };
    });
  }

  protected preprocessInput(input: any): tf.Tensor {
    return tf.tensor2d([input]);
  }

  protected postprocessOutput(output: tf.Tensor): any {
    return Array.from(output.dataSync());
  }
}
