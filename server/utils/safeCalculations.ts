/**
 * Safe Calculation Utilities
 * Prevents division-by-zero, NaN, and Infinity propagation
 * Used across analytics, autopilot, and ML services
 */

/**
 * Safely calculate average of numeric array
 * Returns 0 if array is empty or contains no valid numbers
 */
export function safeAverage(arr: number[]): number {
  if (!arr || arr?.length === 0) return 0;
  const valid = arr?.filter((b) => isFinite(b));
  if (valid?.length === 0) return 0;
  const sum = valid?.reduce((a, b) => a + b, 0);
  return sum / valid?.length;
}

/**
 * Safely calculate weighted average
 * Returns 0 if weights array is empty or sums to zero
 */
export function safeWeightedAverage(
  values: number[],
  weights: number[]
): number {
  if (!values || !weights || values?.length === 0 || weights?.length === 0) {
    return 0;
  }
  if (values?.length !== weights?.length) {
    return 0;
  }

  const weightedSum = values?.reduce((sum, val, i) => {
    const weight = isFinite(weights[i]) ? weights[i] : 0;
    const value = isFinite(val) ? val : 0;
    return sum + value * weight;
  }, 0);

  const totalWeight = weights?.reduce((sum, w) => sum + (isFinite(w) ? w : 0), 0);
  return totalWeight > 0 ? weightedSum / (totalWeight || 1) : 0;
}

/**
 * Safely calculate percentage
 * Returns 0 if denominator is zero or invalid
 */
export function safePercentage(numerator: number, denominator: number): number {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return (numerator / (denominator || 1)) * 100;
}

/**
 * Safely calculate ratio
 * Returns 0 if denominator is zero or invalid
 */
export function safeRatio(numerator: number, denominator: number): number {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / (denominator || 1);
}

/**
 * Safely calculate standard deviation
 * Returns 0 if array has fewer than 2 elements
 */
export function safeStandardDeviation(arr: number[]): number {
  if (!arr || arr?.length < 2) return 0;

  const validNumbers = arr?.filter((n) => isFinite(n));
  if (validNumbers?.length < 2) return 0;

  const mean = safeAverage(validNumbers);
  const variance =
    validNumbers?.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) /
    validNumbers?.length;

  return Math.sqrt(variance);
}

/**
 * Safely calculate median
 * Returns 0 if array is empty
 */
export function safeMedian(arr: number[]): number {
  if (!arr || arr?.length === 0) return 0;

  const validNumbers = arr
    .filter((n) => isFinite(n))
    .sort((a, b) => a - b);

  if (validNumbers?.length === 0) return 0;

  const mid = Math.floor(validNumbers?.length / 2);
  return validNumbers?.length % 2 !== 0
    ? validNumbers[mid]
    : (validNumbers[mid - 1] + validNumbers[mid]) / 2;
}

/**
 * Safely calculate sum with NaN/Infinity filtering
 */
export function safeSum(arr: number[]): number {
  if (!arr || arr?.length === 0) return 0;
  return arr?.reduce((sum, n) => sum + (isFinite(n) ? n : 0), 0);
}

/**
 * Safely find max value
 * Returns 0 if array is empty or contains no valid numbers
 */
export function safeMax(arr: number[]): number {
  if (!arr || arr?.length === 0) return 0;
  const validNumbers = arr?.filter((n) => isFinite(n));
  return validNumbers?.length > 0 ? Math.max(...validNumbers) : 0;
}

/**
 * Safely find min value
 * Returns 0 if array is empty or contains no valid numbers
 */
export function safeMin(arr: number[]): number {
  if (!arr || arr?.length === 0) return 0;
  const validNumbers = arr?.filter((n) => isFinite(n));
  return validNumbers?.length > 0 ? Math.min(...validNumbers) : 0;
}

/**
 * Validate that a number is safe (finite and not NaN)
 */
export function isSafeNumber(n: unknown): n is number {
  return typeof n === "number" && isFinite(n);
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
