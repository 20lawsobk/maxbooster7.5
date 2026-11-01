/**
 * Hybrid Anomaly Detection Model — v2
 *
 * Improvements over v1:
 *  • Weighted ensemble voting (IsoForest:0.40, Autoencoder:0.40, Stats:0.20)
 *    replaces OR-gate which caused excessive false-positive rate
 *  • Reconstruction threshold moved to 99th percentile (was 95th) for tighter
 *    precision on high-confidence anomalies
 *  • EWMA-updated statistical baseline: new data gradually shifts the reference
 *    so the detector adapts to concept drift without full retraining
 *  • Feature extraction enriched with rate-of-change and rolling-std signals
 *  • Severity quantiles calibrated to the training distribution (not hardcoded z-score)
 */

import * as tf from "@tensorflow/tfjs";
import { BaseModel } from "./BaseModel.js";
import { calculateStatistics } from "../statistics/core.js";
import { IsolationForest } from "../algorithms/IsolationForest.js";
import type { AnomalyResult } from "../types.js";

const EWMA_ALPHA = 0.05; // slow drift tracking
const IF_WEIGHT = 0.4;
const AE_WEIGHT = 0.4;
const STAT_WEIGHT = 0.2;
const ANOMALY_THRESHOLD = 0.55; // weighted score must exceed this

export class AnomalyDetectionModel extends BaseModel {
  private reconstructionThreshold99: number = 0;
  private statisticalBaseline: { mean: number; std: number } | null = null;
  private isolationForest: IsolationForest | null = null;

  // Severity percentile calibration (from training distribution)
  private p75score: number = 0.6;
  private p90score: number = 0.75;

  constructor() {
    super({
      name: "AnomalyDetector",
      type: "anomaly",
      version: "2.0.0",
      inputShape: [12],
      outputShape: [12],
    });
  }

  protected buildModel(): tf.LayersModel {
    const autoencoder = tf.sequential({
      layers: [
        // Encoder
        tf.layers.dense({
          units: 16,
          activation: "relu",
          inputShape: [12],
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({ units: 8, activation: "relu" }),
        tf.layers.dense({ units: 4, activation: "relu" }), // bottleneck
        // Decoder
        tf.layers.dense({ units: 8, activation: "relu" }),
        tf.layers.dense({ units: 16, activation: "relu" }),
        tf.layers.dense({ units: 12, activation: "linear" }),
      ],
    });

    autoencoder.compile({
      optimizer: tf.train.adam(0.0005),
      loss: "meanSquaredError",
    });

    return autoencoder;
  }

  public async trainOnNormalData(normalData: number[][]): Promise<void> {
    if (!this.model) await this.initialize();
    if (!this.model) throw new Error("Model initialization failed");

    const allValues = normalData.flat();
    const stats = calculateStatistics(allValues);
    this.statisticalBaseline = { mean: stats.mean, std: stats.stdDev };

    this.isolationForest = new IsolationForest(150, 256, 0.01);
    this.isolationForest.fit(normalData);

    const inputTensor = tf.tensor2d(normalData);

    try {
      await this.model.fit(inputTensor, inputTensor, {
        epochs: 80,
        batchSize: 32,
        validationSplit: 0.15,
        verbose: 0,
        callbacks: {
          onEpochEnd: (_epoch: number, logs?: tf.Logs) => {
            if (logs?.val_loss && logs.val_loss < logs.loss * 0.8) {
              // Early convergence hint — model is generalising well
            }
          },
        },
      });

      const predictions = this.model.predict(inputTensor) as tf.Tensor;
      const errorTensor = tf.losses.meanSquaredError(inputTensor, predictions);
      const errors = Array.from(await errorTensor.data()).sort((a, b) => a - b);

      this.reconstructionThreshold99 =
        errors[Math.floor(errors.length * 0.99)] ?? 0;

      // Calibrate severity quantiles on the weighted ensemble score distribution
      const scores = normalData.map((f) =>
        this.computeWeightedScore(
          this.isolationForest!.anomalyScore(f),
          0, // no reconstruction during calibration pass
          false,
        ),
      );
      scores.sort((a, b) => a - b);
      this.p75score = scores[Math.floor(scores.length * 0.75)] ?? 0.6;
      this.p90score = scores[Math.floor(scores.length * 0.9)] ?? 0.75;

      this.isTrained = true;
      this.metadata.lastTrained = new Date();

      errorTensor.dispose();
      predictions.dispose();
    } finally {
      inputTensor.dispose();
    }
  }

  public async trainOnTimeSeriesData(data: number[]): Promise<void> {
    const vectors = data
      .slice(10)
      .map((_, idx) => this.extractFeatures(data[idx + 10], data, idx + 10));
    await this.trainOnNormalData(vectors);
  }

  public async detectAnomalies(
    featureData: number[][],
  ): Promise<AnomalyResult[]> {
    if (!this.isTrained || !this.statisticalBaseline) return [];
    const results: AnomalyResult[] = [];
    for (let i = 0; i < featureData.length; i++) {
      const r = await this.evaluateFeatures(featureData[i], i);
      if (r.isAnomaly) results.push(r);
    }
    return results;
  }

  public async detectTimeSeriesAnomalies(
    data: number[],
  ): Promise<AnomalyResult[]> {
    if (!this.isTrained || !this.statisticalBaseline) return [];
    const results: AnomalyResult[] = [];
    for (let i = 10; i < data.length; i++) {
      const features = this.extractFeatures(data[i], data, i);
      const r = await this.evaluateFeatures(features, i);
      if (r.isAnomaly) results.push(r);
    }
    return results;
  }

  private computeWeightedScore(
    ifScore: number,
    aeScore: number,
    statFlag: boolean,
  ): number {
    return (
      IF_WEIGHT * ifScore +
      AE_WEIGHT * aeScore +
      STAT_WEIGHT * (statFlag ? 1 : 0)
    );
  }

  private async evaluateFeatures(
    features: number[],
    index: number,
  ): Promise<AnomalyResult> {
    const sb = this.statisticalBaseline!;

    // ── Statistical detector ──────────────────────────────────────────────
    const featureMean = features.reduce((s, v) => s + v, 0) / (features.length || 1);
    const zScore = Math.abs((featureMean - sb.mean) / (sb.std || 1));
    const isStatAnomaly = zScore > 3.5;

    // ── Isolation Forest ─────────────────────────────────────────────────
    let ifScore = 0;
    if (this.isolationForest) {
      ifScore = this.isolationForest.anomalyScore(features);
    }

    // ── Autoencoder ────────────────────────────────────────────────────────
    let aeScore = 0;
    let reconstructionError = 0;
    if (this.model) {
      const inputTensor = tf.tensor2d([features]);
      try {
        const prediction = this.model.predict(inputTensor) as tf.Tensor;
        const errT = tf.losses.meanSquaredError(inputTensor, prediction);
        reconstructionError = (await errT.data())[0];
        // Normalise against the 99th percentile threshold
        aeScore = Math.min(
          1,
          reconstructionError / (this.reconstructionThreshold99 || 1),
        );
        errT.dispose();
        prediction.dispose();
      } finally {
        inputTensor.dispose();
      }
    }

    // ── Weighted ensemble decision ─────────────────────────────────────────
    const weightedScore = this.computeWeightedScore(
      ifScore,
      aeScore,
      isStatAnomaly,
    );
    const isAnomaly = weightedScore > ANOMALY_THRESHOLD;

    // ── Severity (calibrated against training distribution) ──────────────
    let severity: "low" | "medium" | "high" = "low";
    if (weightedScore >= this.p90score) severity = "high";
    else if (weightedScore >= this.p75score) severity = "medium";

    // ── EWMA baseline drift update ────────────────────────────────────────
    if (this.statisticalBaseline) {
      this.statisticalBaseline.mean =
        (1 - EWMA_ALPHA) * this.statisticalBaseline.mean +
        EWMA_ALPHA * featureMean;
    }

    const value = features[0];
    const { mean } = sb;
    const featureStd = Math.sqrt(
      features.reduce((s, v) => s + (v - featureMean) ** 2, 0) /
        (features.length || 1),
    );

    let description = "";
    if (value > mean + 3 * featureStd)
      description = `Unusual spike: ${value.toFixed(2)} (expected ~${mean.toFixed(2)})`;
    else if (value < mean - 3 * featureStd)
      description = `Unusual drop: ${value.toFixed(2)} (expected ~${mean.toFixed(2)})`;
    else
      description = `Pattern anomaly at index ${index} (score=${weightedScore.toFixed(3)})`;

    return {
      isAnomaly,
      score: weightedScore,
      severity,
      expectedValue: mean,
      actualValue: value,
      description,
    };
  }

  private extractFeatures(value: number, ctx: number[], idx: number): number[] {
    const window = ctx.slice(Math.max(0, idx - 10), idx);
    const wMean = window.length
      ? window.reduce((s, v) => s + v, 0) / (window.length || 1)
      : value;
    const wMax = window.length ? Math.max(...window) : value;
    const wMin = window.length ? Math.min(...window) : value;
    const wStd = window.length
      ? Math.sqrt(
          window.reduce((s, v) => s + (v - wMean) ** 2, 0) / (window.length || 1),
        )
      : 0;

    // Rate of change
    const prev = ctx[idx - 1] ?? value;
    const prev2 = ctx[idx - 2] ?? prev;
    const roc1 = value - prev;
    const roc2 = prev - prev2;

    const features = [
      value,
      prev,
      ctx[idx - 2] ?? prev,
      ctx[idx - 3] ?? prev,
      ctx[idx - 4] ?? prev,
      wMean,
      wMax,
      wMin,
      wStd,
      roc1,
      roc2,
      roc1 - roc2, // acceleration
    ];

    return features.slice(0, 12);
  }

  public detectAnomaliesStatistical(data: number[]): AnomalyResult[] {
    const stats = calculateStatistics(data);
    const mean = stats.mean;
    const std = stats.stdDev || 1;

    const q1 = data.slice().sort((a, b) => a - b)[
      Math.floor(data.length * 0.25)
    ];
    const q3 = data.slice().sort((a, b) => a - b)[
      Math.floor(data.length * 0.75)
    ];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    return data
      .map((value, i) => {
        const isOutlier = value < lower || value > upper;
        if (!isOutlier) return null;
        const z = Math.abs((value - mean) / std);
        return {
          isAnomaly: true,
          score: Math.min(1, z / 5),
          severity: (z > 5 ? "high" : z > 3.5 ? "medium" : "low") as
            | "low"
            | "medium"
            | "high",
          expectedValue: mean,
          actualValue: value,
          description: `Statistical outlier at index ${i}: ${value.toFixed(2)}`,
        };
      })
      .filter((r): r is AnomalyResult => r !== null);
  }

  protected preprocessInput(input: any): tf.Tensor {
    return tf.tensor2d([input]);
  }

  protected postprocessOutput(output: tf.Tensor): any {
    return Array.from(output.dataSync());
  }
}
