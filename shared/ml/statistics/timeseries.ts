/**
 * Custom time series analysis algorithms
 * For forecasting, trend detection, seasonality
 */

import { calculateStatistics, linearRegression } from "./core.js";

export interface TimeSeriesDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

export interface TrendAnalysis {
  direction: "up" | "down" | "stable";
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
  seasonalPeriod: number,
): TimeSeriesDecomposition {
  if (data.length === 0) {
    return { trend: [], seasonal: [], residual: [] };
  }

  const safeSeasonalPeriod = Math.max(1, Math.floor(seasonalPeriod) || 1);
  // Extract trend using moving average
  const trend = centeredMovingAverage(data, safeSeasonalPeriod);

  // Detrend the data
  const detrended = data.map((val, i) => val - (trend[i] || 0));

  // Extract seasonal component
  const seasonal = extractSeasonalComponent(detrended, safeSeasonalPeriod);

  // Calculate residuals
  const residual = data.map(
    (val, i) => val - (trend[i] || 0) - (seasonal[i] || 0),
  );

  return { trend, seasonal, residual };
}

/**
 * Centered moving average for trend extraction
 */
function centeredMovingAverage(data: number[], window: number): number[] {
  if (data.length === 0) return [];

  const safeWindow = Math.max(1, Math.floor(window) || 1);
  const result: number[] = [];
  const halfWindow = Math.floor(safeWindow / 2);

  for (let i = 0; i < data.length; i++) {
    if (i < halfWindow || i >= data.length - halfWindow) {
      result.push(data[i]); // Use original value at boundaries
    } else {
      const windowData = data.slice(i - halfWindow, i + halfWindow + 1);
      const avg =
        windowData.reduce((sum, val) => sum + val, 0) / (windowData.length || 1);
      result.push(avg);
    }
  }

  return result;
}

/**
 * Extract seasonal component
 */
function extractSeasonalComponent(
  detrended: number[],
  period: number,
): number[] {
  if (detrended.length === 0) return [];

  const safePeriod = Math.max(1, Math.floor(period) || 1);
  const seasonal: number[] = new Array(detrended.length).fill(0);
  const seasonalAverages = new Array(safePeriod).fill(0);
  const counts = new Array(safePeriod).fill(0);

  // Calculate average for each position in the seasonal cycle
  detrended.forEach((val, i) => {
    const seasonalIndex = i % safePeriod;
    seasonalAverages[seasonalIndex] += val;
    counts[seasonalIndex]++;
  });

  // Normalize by count
  for (let i = 0; i < safePeriod; i++) {
    if (counts[i] > 0) {
      seasonalAverages[i] /= counts[i];
    }
  }

  // Apply seasonal pattern
  detrended.forEach((_, i) => {
    seasonal[i] = seasonalAverages[i % safePeriod];
  });

  return seasonal;
}

/**
 * Analyze trend direction and strength
 */
export function analyzeTrend(data: number[]): TrendAnalysis {
  if (data.length < 2) {
    return { direction: "stable", strength: 0, slope: 0, confidence: 0 };
  }

  // Perform linear regression
  const x = Array.from({ length: data.length }, (_, i) => i);
  const regression = linearRegression(x, data);

  // Determine direction
  let direction: "up" | "down" | "stable" = "stable";
  if (Math.abs(regression.slope) > 0.01) {
    direction = regression.slope > 0 ? "up" : "down";
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
export function detectChangePoints(
  data: number[],
  minSegmentLength: number = 5,
): number[] {
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
  horizon: number,
): number[] {
  if (data.length === 0) return [];
  const safeAlpha = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0.3));
  const safeHorizon = Math.max(0, Math.floor(horizon) || 0);

  // Simple exponential smoothing
  const smoothed: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    smoothed.push(safeAlpha * data[i] + (1 - safeAlpha) * smoothed[i - 1]);
  }

  // Forecast future values
  const forecast: number[] = [];
  let lastValue = smoothed[smoothed.length - 1];

  for (let i = 0; i < safeHorizon; i++) {
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
  gamma: number = 0.1,
): { forecast: number[]; confidence: number[] } {
  const safeSeasonalPeriod = Math.max(1, Math.floor(seasonalPeriod) || 1);
  const safeHorizon = Math.max(0, Math.floor(horizon) || 0);
  const safeAlpha = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0.3));
  const safeBeta = Math.min(1, Math.max(0, Number.isFinite(beta) ? beta : 0.1));
  const safeGamma = Math.min(1, Math.max(0, Number.isFinite(gamma) ? gamma : 0.1));

  if (data.length === 0 || safeHorizon === 0) {
    return { forecast: [], confidence: [] };
  }

  if (data.length < safeSeasonalPeriod * 2) {
    // Fallback to simple smoothing
    const forecast = exponentialSmoothing(data, safeAlpha, safeHorizon);
    const confidence = new Array(safeHorizon).fill(0.5);
    return { forecast, confidence };
  }

  // Initialize level, trend, and seasonal components
  let level = data[0];
  let trend = 0;
  const seasonal = new Array(safeSeasonalPeriod).fill(1);
  const initialLevel = level === 0 ? 1 : level;

  // Initialize seasonal factors
  for (let i = 0; i < safeSeasonalPeriod; i++) {
    seasonal[i] = data[i] / initialLevel;
  }

  // Update equations for each data point
  for (let i = 0; i < data.length; i++) {
    const seasonalIndex = i % safeSeasonalPeriod;
    const oldLevel = level;
    const seasonalFactor = seasonal[seasonalIndex] || 1;

    level =
      safeAlpha * (data[i] / seasonalFactor) +
      (1 - safeAlpha) * (level + trend);
    trend = safeBeta * (level - oldLevel) + (1 - safeBeta) * trend;
    const safeLevel = level === 0 ? 1 : level;
    seasonal[seasonalIndex] =
      safeGamma * (data[i] / safeLevel) +
      (1 - safeGamma) * seasonal[seasonalIndex];
  }

  // Generate forecasts
  const forecast: number[] = [];
  const confidence: number[] = [];

  for (let i = 0; i < safeHorizon; i++) {
    const seasonalIndex = (data.length + i) % safeSeasonalPeriod;
    const forecastValue = (level + trend * (i + 1)) * seasonal[seasonalIndex];
    forecast.push(forecastValue);

    // Confidence decreases with distance
    const conf = Math.max(0, 1 - (i / Math.max(1, safeHorizon)) * 0.5);
    confidence.push(conf);
  }

  return { forecast, confidence };
}

/**
 * Calculate autocorrelation at different lags
 */
export function autocorrelation(data: number[], maxLag: number): number[] {
  if (data.length === 0) return [];
  const stats = calculateStatistics(data);
  const mean = stats.mean;
  const n = data.length;
  const safeMaxLag = Math.max(0, Math.min(Math.floor(maxLag) || 0, n - 1));

  const acf: number[] = [];

  for (let lag = 0; lag <= safeMaxLag; lag++) {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n - lag; i++) {
      numerator += (data[i] - mean) * (data[i + lag] - mean);
    }

    for (let i = 0; i < n; i++) {
      denominator += Math.pow(data[i] - mean, 2);
    }

    acf.push(denominator > 0 ? numerator / (denominator || 1) : 0);
  }

  return acf;
}

/**
 * Detect seasonality period
 */
export function detectSeasonalPeriod(
  data: number[],
  maxPeriod: number = 30,
): number | null {
  if (data.length < 3) return null;
  const acf = autocorrelation(data, Math.max(2, maxPeriod));

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
  if (data.length < 2) return true;
  const trend = analyzeTrend(data);
  const acf = autocorrelation(data, Math.min(10, Math.floor(data.length / 4)));

  // Simple heuristic: check if trend is weak and autocorrelation decays
  const trendWeak = Math.abs(trend.slope) < 0.1;
  const lagOne = acf[1] ?? 0;
  const lagFive = acf[Math.min(5, Math.max(0, acf.length - 1))] ?? 0;
  const acfDecays = lagOne < 0.7 && lagFive < 0.3;

  return trendWeak && acfDecays;
}
