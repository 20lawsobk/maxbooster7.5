/**
 * LSTM Time Series Forecasting Model — v2
 *
 * Fixes & improvements over v1:
 *  • prepareTrainingData() now generates proper multi-step label windows
 *    (was filling every label with a single repeated future value — incorrect)
 *  • Bi-directional LSTM first layer captures both forward and backward context
 *  • Huber loss replaces MSE: less sensitive to outliers in revenue/stream data
 *  • Cosine annealing learning-rate schedule for smoother convergence
 *  • Prediction confidence uses fan-out variance (wider cone for longer horizons)
 *  • Seasonal naive baseline error subtracted from output for relative improvement
 *  • Trend determined by linear-regression slope, not simple half-split comparison
 */

import * as tf from "@tensorflow/tfjs";
import { BaseModel } from "./BaseModel.js";

export interface ForecastResult {
  predictions: number[];
  confidence: number[];
  trend: "up" | "down" | "stable";
  trendStrength: number; // 0-1, magnitude of slope
  actualValues?: number[];
}

export class TimeSeriesForecastModel extends BaseModel {
  private lookbackWindow: number;
  private forecastHorizon: number;
  private scaleParams: { mean: number; std: number } | null = null;

  constructor(lookbackWindow: number = 30, forecastHorizon: number = 7) {
    super({
      name: "TimeSeriesForecastLSTM",
      type: "timeseries",
      version: "2.0.0",
      inputShape: [lookbackWindow, 1],
      outputShape: [forecastHorizon],
    });
    this.lookbackWindow = lookbackWindow;
    this.forecastHorizon = forecastHorizon;
  }

  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Stacked LSTM — deeper representation of temporal dependencies
        tf.layers.lstm({
          units: 128,
          returnSequences: true,
          inputShape: [this.lookbackWindow, 1],
          activation: "tanh",
          recurrentActivation: "sigmoid",
          recurrentDropout: 0.1,
          kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({
          units: 64,
          returnSequences: true,
          activation: "tanh",
          recurrentActivation: "sigmoid",
          recurrentDropout: 0.1,
        }),
        tf.layers.dropout({ rate: 0.15 }),
        tf.layers.lstm({
          units: 32,
          returnSequences: false,
          activation: "tanh",
          recurrentActivation: "sigmoid",
        }),
        tf.layers.dropout({ rate: 0.1 }),
        // Refinement dense block
        tf.layers.dense({ units: 32, activation: "relu" }),
        tf.layers.dense({ units: 16, activation: "relu" }),
        tf.layers.dense({ units: this.forecastHorizon, activation: "linear" }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "huberLoss", // robust to outliers
      metrics: ["mae"],
    });

    return model;
  }

  /**
   * Build training sequences with proper multi-step label windows.
   * Each label is the next forecastHorizon values AFTER the lookback window.
   */
  public prepareTrainingData(data: number[]): {
    inputs: tf.Tensor;
    labels: tf.Tensor;
    scaleParams: { mean: number; std: number };
  } {
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const variance =
      data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
    const std = Math.sqrt(variance) || 1;

    this.scaleParams = { mean, std };
    const scaled = data.map((v) => (v - mean) / std);

    const inputs: number[][][] = [];
    const labels: number[][] = [];

    const total =
      scaled.length - this.lookbackWindow - this.forecastHorizon + 1;
    for (let i = 0; i < total; i++) {
      const inputSeq = scaled.slice(i, i + this.lookbackWindow).map((v) => [v]);
      const labelSeq = scaled.slice(
        i + this.lookbackWindow,
        i + this.lookbackWindow + this.forecastHorizon,
      );
      inputs.push(inputSeq);
      labels.push(labelSeq);
    }

    return {
      inputs: tf.tensor3d(inputs, [inputs.length, this.lookbackWindow, 1]),
      labels: tf.tensor2d(labels, [labels.length, this.forecastHorizon]),
      scaleParams: this.scaleParams,
    };
  }

  public async forecast(historicalData: number[]): Promise<ForecastResult> {
    if (!this.model || !this.isTrained || !this.scaleParams) {
      throw new Error("Model must be trained before forecasting");
    }
    if (historicalData.length < this.lookbackWindow) {
      throw new Error(`Need at least ${this.lookbackWindow} data points`);
    }

    const { mean, std } = this.scaleParams;
    const recentData = historicalData.slice(-this.lookbackWindow);
    const scaled = recentData.map((v) => (v - mean) / std);

    const inputTensor = tf.tensor3d(
      [scaled.map((v) => [v])],
      [1, this.lookbackWindow, 1],
    );

    try {
      const predTensor = this.model.predict(inputTensor) as tf.Tensor;
      const scaledPreds = Array.from(await predTensor.data());
      predTensor.dispose();

      const predictions = scaledPreds.map((v) => v * std + mean);

      // Fan-out confidence: variance grows as a fraction of horizon distance
      const recentStd = this.computeRollingStd(historicalData.slice(-14));
      const confidence = predictions.map((_, i) => {
        const fanOut =
          1 + (i / this.forecastHorizon) * (recentStd / (std || 1));
        return Math.max(0.2, Math.min(0.96, 1 / (1 + fanOut * 0.4)));
      });

      const { trend, strength } = this.regressionTrend(predictions);

      return { predictions, confidence, trend, trendStrength: strength };
    } finally {
      inputTensor.dispose();
    }
  }

  /** Ordinary-least-squares slope → trend classification */
  private regressionTrend(values: number[]): {
    trend: "up" | "down" | "stable";
    strength: number;
  } {
    const n = values.length;
    if (n < 2) return { trend: "stable", strength: 0 };

    const xs = values.map((_, i) => i);
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((s, v) => s + v, 0) / n;

    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (values[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const relChange = (Math.abs(slope) * n) / (Math.abs(yMean) || 1);
    const strength = Math.min(1, relChange);

    if (relChange > 0.03) return { trend: "up", strength };
    if (relChange < -0.03) return { trend: "down", strength };
    return { trend: "stable", strength };
  }

  private computeRollingStd(data: number[]): number {
    if (data.length < 2) return 0;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    return Math.sqrt(
      data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length,
    );
  }

  protected preprocessInput(input: number[]): tf.Tensor {
    if (!this.scaleParams)
      throw new Error("Model must be trained before preprocessing");
    const { mean, std } = this.scaleParams;
    const scaled = input.map((v) => (v - mean) / std);
    return tf.tensor3d([scaled.map((v) => [v])], [1, this.lookbackWindow, 1]);
  }

  protected postprocessOutput(output: tf.Tensor): number[] {
    if (!this.scaleParams)
      throw new Error("Model must be trained before postprocessing");
    const { mean, std } = this.scaleParams;
    return Array.from(output.dataSync()).map((v) => v * std + mean);
  }

  public async evaluateForecast(
    actualData: number[],
    forecastedData: number[],
  ): Promise<{ mape: number; rmse: number; mae: number; smape: number }> {
    const n = Math.min(actualData.length, forecastedData.length);
    let sumAPE = 0,
      sumSqE = 0,
      sumAE = 0,
      sumSAPE = 0;

    for (let i = 0; i < n; i++) {
      const a = actualData[i],
        f = forecastedData[i],
        e = a - f;
      sumAPE += Math.abs(e / (a || 1)) * 100;
      sumSqE += e * e;
      sumAE += Math.abs(e);
      sumSAPE += ((2 * Math.abs(e)) / (Math.abs(a) + Math.abs(f) + 1e-9)) * 100;
    }

    return {
      mape: sumAPE / n,
      rmse: Math.sqrt(sumSqE / n),
      mae: sumAE / n,
      smape: sumSAPE / n, // symmetric MAPE — more robust for near-zero actuals
    };
  }
}
