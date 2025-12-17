/**
 * Custom time series analysis algorithms
 * For forecasting, trend detection, seasonality
 */

import { calculateStatistics, linearRegression } from './core.js';

export interface TimeSeriesDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  strength: number;
  slope: number;
  confidence: number;
}

/**
 * Decompose time series into trend, seasonal, and residual components
 * Using additive model: Y = Trend + Seasonal + Residual
 */
export function decomposeTimeSeries(
  data: number[],
  seasonalPeriod: number
): TimeSeriesDecomposition {
  // Extract trend using moving average
  const trend = centeredMovingAverage(data, seasonalPeriod);
  
  // Detrend the data
  const detrended = data.map((val, i) => val - (trend[i] || 0));
  
  // Extract seasonal component
  const seasonal = extractSeasonalComponent(detrended, seasonalPeriod);
  
  // Calculate residuals
  const residual = data.map((val, i) => 
    val - (trend[i] || 0) - (seasonal[i] || 0)
  );
  
  return { trend, seasonal, residual };
}

/**
 * Centered moving average for trend extraction
 */
function centeredMovingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  const halfWindow = Math.floor(window / 2);
  
  for (let i = 0; i < data.length; i++) {
    if (i < halfWindow || i >= data.length - halfWindow) {
      result.push(data[i]); // Use original value at boundaries
    } else {
      const windowData = data.slice(i - halfWindow, i + halfWindow + 1);
      const avg = windowData.reduce((sum, val) => sum + val, 0) / windowData.length;
      result.push(avg);
    }
  }
  
  return result;
}

/**
 * Extract seasonal component
 */
function extractSeasonalComponent(detrended: number[], period: number): number[] {
  const seasonal: number[] = new Array(detrended.length).fill(0);
  const seasonalAverages = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  
  // Calculate average for each position in the seasonal cycle
  detrended.forEach((val, i) => {
    const seasonalIndex = i % period;
    seasonalAverages[seasonalIndex] += val;
    counts[seasonalIndex]++;
  });
  
  // Normalize by count
  for (let i = 0; i < period; i++) {
    if (counts[i] > 0) {
      seasonalAverages[i] /= counts[i];
    }
  }
  
  // Apply seasonal pattern
  detrended.forEach((_, i) => {
    seasonal[i] = seasonalAverages[i % period];
  });
  
  return seasonal;
}

/**
 * Analyze trend direction and strength
 */
export function analyzeTrend(data: number[]): TrendAnalysis {
  if (data.length < 2) {
    return { direction: 'stable', strength: 0, slope: 0, confidence: 0 };
  }
  
  // Perform linear regression
  const x = Array.from({ length: data.length }, (_, i) => i);
  const regression = linearRegression(x, data);
  
  // Determine direction
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (Math.abs(regression.slope) > 0.01) {
    direction = regression.slope > 0 ? 'up' : 'down';
  }
  
  // Strength based on R²
  const strength = Math.abs(regression.r2);
  
  return {
    direction,
    strength,
    slope: regression.slope,
    confidence: regression.r2,
  };
}

/**
 * Detect change points in time series
 */
export function detectChangePoints(data: number[], minSegmentLength: number = 5): number[] {
  const changePoints: number[] = [];
  
  if (data.length < minSegmentLength * 2) {
    return changePoints;
  }
  
  // Use cumulative sum (CUSUM) algorithm
  const stats = calculateStatistics(data);
  const mean = stats.mean;
  const stdDev = stats.stdDev;
  
  let cumSum = 0;
  const threshold = 3 * stdDev;
  
  for (let i = 1; i < data.length; i++) {
    cumSum += data[i] - mean;
    
    if (Math.abs(cumSum) > threshold && i > minSegmentLength) {
      changePoints.push(i);
      cumSum = 0; // Reset after detecting change point
    }
  }
  
  return changePoints;
}

/**
 * Forecast future values using exponential smoothing
 */
export function exponentialSmoothing(
  data: number[],
  alpha: number,
  horizon: number
): number[] {
  if (data.length === 0) return [];
  
  // Simple exponential smoothing
  const smoothed: number[] = [data[0]];
  
  for (let i = 1; i < data.length; i++) {
    smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
  }
  
  // Forecast future values
  const forecast: number[] = [];
  let lastValue = smoothed[smoothed.length - 1];
  
  for (let i = 0; i < horizon; i++) {
    forecast.push(lastValue);
  }
  
  return forecast;
}

/**
 * Holt-Winters forecasting (handles trend and seasonality)
 */
export function holtWintersForecasting(
  data: number[],
  seasonalPeriod: number,
  horizon: number,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.1
): { forecast: number[]; confidence: number[] } {
  if (data.length < seasonalPeriod * 2) {
    // Fallback to simple smoothing
    const forecast = exponentialSmoothing(data, alpha, horizon);
    const confidence = new Array(horizon).fill(0.5);
    return { forecast, confidence };
  }
  
  // Initialize level, trend, and seasonal components
  let level = data[0];
  let trend = 0;
  const seasonal = new Array(seasonalPeriod).fill(1);
  
  // Initialize seasonal factors
  for (let i = 0; i < seasonalPeriod; i++) {
    seasonal[i] = data[i] / level;
  }
  
  // Update equations for each data point
  for (let i = 0; i < data.length; i++) {
    const seasonalIndex = i % seasonalPeriod;
    const oldLevel = level;
    
    level = alpha * (data[i] / seasonal[seasonalIndex]) + (1 - alpha) * (level + trend);
    trend = beta * (level - oldLevel) + (1 - beta) * trend;
    seasonal[seasonalIndex] = gamma * (data[i] / level) + (1 - gamma) * seasonal[seasonalIndex];
  }
  
  // Generate forecasts
  const forecast: number[] = [];
  const confidence: number[] = [];
  
  for (let i = 0; i < horizon; i++) {
    const seasonalIndex = (data.length + i) % seasonalPeriod;
    const forecastValue = (level + trend * (i + 1)) * seasonal[seasonalIndex];
    forecast.push(forecastValue);
    
    // Confidence decreases with distance
    const conf = Math.max(0, 1 - (i / horizon) * 0.5);
    confidence.push(conf);
  }
  
  return { forecast, confidence };
}

/**
 * Calculate autocorrelation at different lags
 */
export function autocorrelation(data: number[], maxLag: number): number[] {
  const stats = calculateStatistics(data);
  const mean = stats.mean;
  const n = data.length;
  
  const acf: number[] = [];
  
  for (let lag = 0; lag <= maxLag; lag++) {
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n - lag; i++) {
      numerator += (data[i] - mean) * (data[i + lag] - mean);
    }
    
    for (let i = 0; i < n; i++) {
      denominator += Math.pow(data[i] - mean, 2);
    }
    
    acf.push(numerator / denominator);
  }
  
  return acf;
}

/**
 * Detect seasonality period
 */
export function detectSeasonalPeriod(data: number[], maxPeriod: number = 30): number | null {
  const acf = autocorrelation(data, maxPeriod);
  
  // Find first significant peak after lag 1
  let maxAcf = 0;
  let period: number | null = null;
  
  for (let lag = 2; lag <= maxPeriod; lag++) {
    if (acf[lag] > maxAcf && acf[lag] > 0.3) {
      maxAcf = acf[lag];
      period = lag;
    }
  }
  
  return period;
}

/**
 * ARIMA-style differencing to make series stationary
 */
export function difference(data: number[], order: number = 1): number[] {
  let result = [...data];
  
  for (let d = 0; d < order; d++) {
    const diffed: number[] = [];
    for (let i = 1; i < result.length; i++) {
      diffed.push(result[i] - result[i - 1]);
    }
    result = diffed;
  }
  
  return result;
}

/**
 * Test for stationarity (simplified Augmented Dickey-Fuller)
 */
export function isStationary(data: number[]): boolean {
  const trend = analyzeTrend(data);
  const acf = autocorrelation(data, Math.min(10, Math.floor(data.length / 4)));
  
  // Simple heuristic: check if trend is weak and autocorrelation decays
  const trendWeak = Math.abs(trend.slope) < 0.1;
  const acfDecays = acf[1] < 0.7 && acf[Math.min(5, acf.length - 1)] < 0.3;
  
  return trendWeak && acfDecays;
}
