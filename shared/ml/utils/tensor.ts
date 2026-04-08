/**
 * TensorFlow.js utility functions
 * Custom tensor operations and helpers
 */

import * as tf from '@tensorflow/tfjs';

/**
 * Normalize data to 0-1 range
 */
export function normalize(data: number[]): number[] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  
  if (range === 0) return data.map(() => 0.5);
  
  return data.map(val => (val - min) / range);
}

/**
 * Standardize data (mean=0, std=1)
 */
export function standardize(data: number[]): number[] {
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const std = Math.sqrt(variance);
  
  if (std === 0) return data.map(() => 0);
  
  return data.map(val => (val - mean) / std);
}

/**
 * Create sliding windows for time series data
 */
export function createSequences(
  data: number[],
  windowSize: number,
  stepSize: number = 1
): { sequences: number[][], labels: number[] } {
  const sequences: number[][] = [];
  const labels: number[] = [];
  
  for (let i = 0; i <= data.length - windowSize - 1; i += stepSize) {
    sequences.push(data.slice(i, i + windowSize));
    labels.push(data[i + windowSize]);
  }
  
  return { sequences, labels };
}

/**
 * Split data into train and validation sets
 */
export function trainValidationSplit<T>(
  data: T[],
  validationSplit: number = 0.2
): { train: T[], validation: T[] } {
  const splitIndex = Math.floor(data.length * (1 - validationSplit));
  
  return {
    train: data.slice(0, splitIndex),
    validation: data.slice(splitIndex)
  };
}

/**
 * Convert array to tensor with automatic cleanup
 */
export function arrayToTensor(
  data: number[][] | number[],
  shape?: number[]
): tf.Tensor {
  return tf.tidy(() => {
    const tensor = tf.tensor(data);
    return shape ? tensor.reshape(shape) : tensor;
  });
}

/**
 * Safely dispose of tensors
 */
export function disposeTensors(...tensors: (tf.Tensor | undefined)[]): void {
  tensors.forEach(tensor => {
    if (tensor) {
      tensor.dispose();
    }
  });
}

/**
 * Calculate moving average
 */
export function movingAverage(data: number[], windowSize: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    result.push(avg);
  }
  
  return result;
}

/**
 * Calculate exponential moving average
 */
export function exponentialMovingAverage(data: number[], alpha: number = 0.3): number[] {
  const result: number[] = [data[0]];
  
  for (let i = 1; i < data.length; i++) {
    const ema = alpha * data[i] + (1 - alpha) * result[i - 1];
    result.push(ema);
  }
  
  return result;
}

/**
 * One-hot encode categorical data
 */
export function oneHotEncode(labels: number[], numClasses: number): number[][] {
  return labels.map(label => {
    const encoded = new Array(numClasses).fill(0);
    encoded[label] = 1;
    return encoded;
  });
}

/**
 * Decode one-hot encoded data
 */
export function oneHotDecode(encoded: number[][]): number[] {
  return encoded.map(arr => arr.indexOf(Math.max(...arr)));
}

/**
 * Shuffle array and labels together
 */
export function shuffle<T, U>(array1: T[], array2: U[]): { shuffled1: T[], shuffled2: U[] } {
  const indices = array1.map((_, i) => i);
  
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  return {
    shuffled1: indices.map(i => array1[i]),
    shuffled2: indices.map(i => array2[i])
  };
}
