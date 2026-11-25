/**
 * Custom statistical algorithms - all implemented from scratch
 * No external statistics libraries - 100% in-house
 */

export interface Statistics {
  mean: number;
  median: number;
  mode: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
}

/**
 * Calculate comprehensive statistics for a dataset
 */
export function calculateStatistics(data: number[]): Statistics {
  if (data.length === 0) {
    throw new Error("Cannot calculate statistics for empty dataset");
  }

  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((sum, val) => sum + val, 0) / (data.length || 1);
  const variance =
    data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length || 1);
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    median: calculateMedian(sorted),
    mode: calculateMode(data),
    variance,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    range: sorted[sorted.length - 1] - sorted[0],
    q1: calculatePercentile(sorted, 25),
    q3: calculatePercentile(sorted, 75),
    iqr: calculatePercentile(sorted, 75) - calculatePercentile(sorted, 25),
  };
}

/**
 * Calculate median
 */
export function calculateMedian(sortedData: number[]): number {
  const mid = Math.floor(sortedData.length / 2);

  if (sortedData.length % 2 === 0) {
    return (sortedData[mid - 1] + sortedData[mid]) / 2;
  }

  return sortedData[mid];
}

/**
 * Calculate mode (most frequent value)
 */
export function calculateMode(data: number[]): number {
  const frequency = new Map<number, number>();

  data.forEach((val) => {
    frequency.set(val, (frequency.get(val) || 0) + 1);
  });

  let maxFreq = 0;
  let mode = data[0];

  frequency.forEach((freq, val) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      mode = val;
    }
  });

  return mode;
}

/**
 * Calculate percentile
 */
export function calculatePercentile(
  sortedData: number[],
  percentile: number,
): number {
  const index = (percentile / 100) * (sortedData.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sortedData[lower];
  }

  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

/**
 * Calculate correlation coefficient (Pearson's r)
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error("Arrays must have the same length");
  }

  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator > 0 ? numerator / (denominator || 1) : 0;
}

/**
 * Linear regression (y = mx + b)
 */
export function linearRegression(
  x: number[],
  y: number[],
): {
  slope: number;
  intercept: number;
  r2: number;
  predict: (xVal: number) => number;
} {
  if (x.length !== y.length) {
    throw new Error("Arrays must have the same length");
  }

  const n = x.length;
  if (n === 0) {
    return {
      slope: 0,
      intercept: 0,
      r2: 0,
      predict: () => 0,
    };
  }
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0);

  const slopeDenominator = n * sumX2 - sumX * sumX;
  const meanY = sumY / n;
  const slope =
    slopeDenominator !== 0 ? (n * sumXY - sumX * sumY) / slopeDenominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const ssTotal = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
  const ssResidual = y.reduce((sum, val, i) => {
    const predicted = slope * x[i] + intercept;
    return sum + Math.pow(val - predicted, 2);
  }, 0);
  const r2 =
    ssTotal > 0 ? 1 - ssResidual / ssTotal : ssResidual === 0 ? 1 : 0;

  return {
    slope,
    intercept,
    r2,
    predict: (xVal: number) => slope * xVal + intercept,
  };
}

/**
 * Z-score (standard score)
 */
export function calculateZScore(
  value: number,
  mean: number,
  stdDev: number,
): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Detect outliers using IQR method
 */
export function detectOutliersIQR(data: number[]): {
  outliers: number[];
  lowerBound: number;
  upperBound: number;
} {
  if (data.length === 0) {
    return { outliers: [], lowerBound: 0, upperBound: 0 };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const q1 = calculatePercentile(sorted, 25);
  const q3 = calculatePercentile(sorted, 75);
  const iqr = q3 - q1;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = data.filter((val) => val < lowerBound || val > upperBound);

  return { outliers, lowerBound, upperBound };
}

/**
 * Detect outliers using Z-score method
 */
export function detectOutliersZScore(
  data: number[],
  threshold: number = 3,
): number[] {
  if (data.length === 0) return [];
  const stats = calculateStatistics(data);

  return data.filter((val) => {
    const zScore = Math.abs(calculateZScore(val, stats.mean, stats.stdDev));
    return zScore > threshold;
  });
}

/**
 * Covariance between two datasets
 */
export function calculateCovariance(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error("Arrays must have the same length");
  }

  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  let covariance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (x[i] - meanX) * (y[i] - meanY);
  }

  return covariance / n;
}

/**
 * Simple moving average
 */
export function simpleMovingAverage(
  data: number[],
  windowSize: number,
): number[] {
  if (data.length === 0) return [];
  const safeWindowSize = Math.max(1, Math.floor(windowSize) || 1);
  const result: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < safeWindowSize - 1) {
      result.push(
        data.slice(0, i + 1).reduce((sum, val) => sum + val, 0) / (i + 1),
      );
    } else {
      const window = data.slice(i - safeWindowSize + 1, i + 1);
      result.push(
        window.reduce((sum, val) => sum + val, 0) /
          Math.max(1, window.length || safeWindowSize),
      );
    }
  }

  return result;
}

/**
 * Exponential moving average
 */
export function exponentialMovingAverage(
  data: number[],
  alpha: number,
): number[] {
  if (data.length === 0) return [];
  const safeAlpha = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0.3));
  const result: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    result.push(safeAlpha * data[i] + (1 - safeAlpha) * result[i - 1]);
  }

  return result;
}

/**
 * Calculate confidence interval
 */
export function confidenceInterval(
  data: number[],
  confidenceLevel: number = 0.95,
): { lower: number; upper: number; mean: number } {
  if (data.length === 0) {
    return { mean: 0, lower: 0, upper: 0 };
  }
  const stats = calculateStatistics(data);
  const n = data.length;

  // Z-score for 95% confidence = 1.96
  const zScore = confidenceLevel === 0.95 ? 1.96 : 2.576; // 99% = 2.576

  const margin = zScore * (stats.stdDev / Math.sqrt(Math.max(1, n)));

  return {
    mean: stats.mean,
    lower: stats.mean - margin,
    upper: stats.mean + margin,
  };
}
