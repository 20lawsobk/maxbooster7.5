/**
 * Custom LSTM Time Series Forecasting Model
 * Predicts future values for streams, engagement, revenue
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import { createSequences, standardize } from '../utils/tensor.js';
import type { TimeSeriesData } from '../types.js';

export interface ForecastResult {
  predictions: number[];
  confidence: number[];
  trend: 'up' | 'down' | 'stable';
  actualValues?: number[];
}

export class TimeSeriesForecastModel extends BaseModel {
  private lookbackWindow: number = 30;
  private forecastHorizon: number = 7;
  private scaleParams: { mean: number; std: number } | null = null;

  constructor(lookbackWindow: number = 30, forecastHorizon: number = 7) {
    super({
      name: 'TimeSeriesForecastLSTM',
      type: 'timeseries',
      version: '1.0.0',
      inputShape: [lookbackWindow, 1],
      outputShape: [forecastHorizon],
    });
    
    this.lookbackWindow = lookbackWindow;
    this.forecastHorizon = forecastHorizon;
  }

  /**
   * Build LSTM model for time series forecasting
   */
  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // First LSTM layer with return sequences
        tf.layers.lstm({
          units: 64,
          returnSequences: true,
          inputShape: [this.lookbackWindow, 1],
          activation: 'tanh',
          recurrentActivation: 'sigmoid',
        }),
        
        // Dropout for regularization
        tf.layers.dropout({ rate: 0.2 }),
        
        // Second LSTM layer
        tf.layers.lstm({
          units: 32,
          returnSequences: false,
          activation: 'tanh',
          recurrentActivation: 'sigmoid',
        }),
        
        // Dropout
        tf.layers.dropout({ rate: 0.2 }),
        
        // Dense layers for refinement
        tf.layers.dense({
          units: 16,
          activation: 'relu',
        }),
        
        // Output layer
        tf.layers.dense({
          units: this.forecastHorizon,
          activation: 'linear',
        }),
      ],
    });

    // Compile model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    return model;
  }

  /**
   * Prepare time series data for training
   */
  public prepareTrainingData(data: number[]): {
    inputs: tf.Tensor;
    labels: tf.Tensor;
    scaleParams: { mean: number; std: number };
  } {
    // Calculate scaling parameters
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    this.scaleParams = { mean, std };
    
    // Standardize data
    const scaled = data.map(val => (val - mean) / (std || 1));
    
    // Create sequences
    const sequences: number[][] = [];
    const labels: number[] = [];
    
    for (let i = 0; i <= scaled.length - this.lookbackWindow - this.forecastHorizon; i++) {
      sequences.push(scaled.slice(i, i + this.lookbackWindow));
      labels.push(scaled[i + this.lookbackWindow + this.forecastHorizon - 1]);
    }
    
    // Convert to tensors
    const inputs = tf.tensor3d(
      sequences.map(seq => seq.map(val => [val])),
      [sequences.length, this.lookbackWindow, 1]
    );
    
    const labelsTensor = tf.tensor2d(
      labels.map(val => new Array(this.forecastHorizon).fill(val)),
      [labels.length, this.forecastHorizon]
    );
    
    return { inputs, labels: labelsTensor, scaleParams: this.scaleParams };
  }

  /**
   * Forecast future values
   */
  public async forecast(historicalData: number[]): Promise<ForecastResult> {
    if (!this.model || !this.isTrained || !this.scaleParams) {
      throw new Error('Model must be trained before forecasting');
    }

    if (historicalData.length < this.lookbackWindow) {
      throw new Error(`Need at least ${this.lookbackWindow} data points for forecasting`);
    }

    // Take last lookbackWindow points
    const recentData = historicalData.slice(-this.lookbackWindow);
    
    // Standardize
    const { mean, std } = this.scaleParams;
    const scaled = recentData.map(val => (val - mean) / (std || 1));
    
    // Create input tensor
    const inputTensor = tf.tensor3d([scaled.map(val => [val])], [1, this.lookbackWindow, 1]);
    
    try {
      // Make prediction
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const scaledPredictions = await prediction.data();
      
      // Denormalize predictions
      const predictions = Array.from(scaledPredictions).map(val => val * (std || 1) + mean);
      
      // Calculate confidence (decreases with forecast distance)
      const confidence = predictions.map((_, i) => 
        Math.max(0.3, 1 - (i / this.forecastHorizon) * 0.7)
      );
      
      // Determine trend
      const trend = this.determineTrend(predictions);
      
      return {
        predictions,
        confidence,
        trend,
      };
    } finally {
      inputTensor.dispose();
    }
  }

  /**
   * Determine trend direction
   */
  private determineTrend(predictions: number[]): 'up' | 'down' | 'stable' {
    if (predictions.length < 2) return 'stable';
    
    const firstHalf = predictions.slice(0, Math.floor(predictions.length / 2));
    const secondHalf = predictions.slice(Math.floor(predictions.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.05) return 'up';
    if (change < -0.05) return 'down';
    return 'stable';
  }

  /**
   * Preprocess input
   */
  protected preprocessInput(input: number[]): tf.Tensor {
    if (!this.scaleParams) {
      throw new Error('Model must be trained before preprocessing');
    }
    
    const { mean, std } = this.scaleParams;
    const scaled = input.map(val => (val - mean) / (std || 1));
    
    return tf.tensor3d([scaled.map(val => [val])], [1, this.lookbackWindow, 1]);
  }

  /**
   * Postprocess output
   */
  protected postprocessOutput(output: tf.Tensor): number[] {
    if (!this.scaleParams) {
      throw new Error('Model must be trained before postprocessing');
    }
    
    const { mean, std } = this.scaleParams;
    const data = Array.from(output.dataSync());
    
    return data.map(val => val * (std || 1) + mean);
  }

  /**
   * Evaluate forecast accuracy
   */
  public async evaluateForecast(
    actualData: number[],
    forecastedData: number[]
  ): Promise<{
    mape: number;
    rmse: number;
    mae: number;
  }> {
    const n = Math.min(actualData.length, forecastedData.length);
    
    let sumAbsPercentError = 0;
    let sumSquaredError = 0;
    let sumAbsError = 0;
    
    for (let i = 0; i < n; i++) {
      const actual = actualData[i];
      const forecast = forecastedData[i];
      const error = actual - forecast;
      
      sumAbsPercentError += Math.abs(error / (actual || 1)) * 100;
      sumSquaredError += error * error;
      sumAbsError += Math.abs(error);
    }
    
    return {
      mape: sumAbsPercentError / n, // Mean Absolute Percentage Error
      rmse: Math.sqrt(sumSquaredError / n), // Root Mean Squared Error
      mae: sumAbsError / n, // Mean Absolute Error
    };
  }
}
