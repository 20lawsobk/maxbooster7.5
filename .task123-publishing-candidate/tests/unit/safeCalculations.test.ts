/**
 * Unit Tests for Safe Calculations
 * Tests edge cases: empty arrays, null values, single elements, NaN, Infinity
 */

import { describe, it, expect } from "vitest";
import {
  safeAverage,
  safeWeightedAverage,
  safePercentage,
  safeRatio,
  safeStandardDeviation,
  safeMedian,
  safeSum,
  safeMax,
  safeMin,
  isSafeNumber,
  clamp,
} from "../../server/utils/safeCalculations";

describe("Safe Calculations", () => {
  describe("safeAverage", () => {
    it("should return 0 for empty array", () => {
      expect(safeAverage([])).toBe(0);
    });

    it("should return 0 for null/undefined", () => {
      expect(safeAverage(null as any)).toBe(0);
      expect(safeAverage(undefined as any)).toBe(0);
    });

    it("should calculate average for normal array", () => {
      expect(safeAverage([1, 2, 3, 4, 5])).toBe(3);
    });

    it("should handle single element", () => {
      expect(safeAverage([42])).toBe(42);
    });

    it("should filter out NaN values", () => {
      expect(safeAverage([1, NaN, 3, 5])).toBe(3);
    });

    it("should filter out Infinity values", () => {
      expect(safeAverage([1, Infinity, 3, 5])).toBe(3);
    });

    it("should handle negative numbers", () => {
      expect(safeAverage([-5, -3, -1])).toBe(-3);
    });

    it("should handle mixed positive and negative", () => {
      expect(safeAverage([-10, 0, 10])).toBe(0);
    });

    it("should handle decimals", () => {
      expect(safeAverage([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
    });
  });

  describe("safeWeightedAverage", () => {
    it("should return 0 for empty arrays", () => {
      expect(safeWeightedAverage([], [])).toBe(0);
    });

    it("should return 0 for mismatched lengths", () => {
      expect(safeWeightedAverage([1, 2], [1])).toBe(0);
    });

    it("should calculate weighted average", () => {
      expect(safeWeightedAverage([10, 20], [1, 1])).toBe(15);
    });

    it("should handle zero weights", () => {
      expect(safeWeightedAverage([10, 20], [0, 0])).toBe(0);
    });

    it("should filter NaN/Infinity from weights", () => {
      expect(safeWeightedAverage([10, 20, 30], [1, NaN, 1])).toBe(20);
    });

    it("should return 0 on length mismatch (any mismatch)", () => {
      expect(safeWeightedAverage([1, 2, 3], [1, 2])).toBe(0);
    });
  });

  describe("safePercentage", () => {
    it("should return 0 for zero denominator", () => {
      expect(safePercentage(10, 0)).toBe(0);
    });

    it("should return 0 for NaN numerator", () => {
      expect(safePercentage(NaN, 100)).toBe(0);
    });

    it("should return 0 for Infinity denominator", () => {
      expect(safePercentage(10, Infinity)).toBe(0);
    });

    it("should calculate percentage correctly", () => {
      expect(safePercentage(50, 100)).toBe(50);
    });

    it("should handle decimals", () => {
      expect(safePercentage(1, 3)).toBeCloseTo(33.33, 1);
    });
  });

  describe("safeRatio", () => {
    it("should return 0 for zero denominator", () => {
      expect(safeRatio(10, 0)).toBe(0);
    });

    it("should calculate ratio correctly", () => {
      expect(safeRatio(10, 2)).toBe(5);
    });

    it("should handle decimals", () => {
      expect(safeRatio(1, 3)).toBeCloseTo(0.333, 2);
    });
  });

  describe("safeStandardDeviation", () => {
    it("should return 0 for empty array", () => {
      expect(safeStandardDeviation([])).toBe(0);
    });

    it("should return 0 for single element", () => {
      expect(safeStandardDeviation([5])).toBe(0);
    });

    it("should return 0 for identical elements", () => {
      expect(safeStandardDeviation([5, 5, 5, 5])).toBe(0);
    });

    it("should calculate standard deviation", () => {
      const result = safeStandardDeviation([1, 2, 3, 4, 5]);
      expect(result).toBeGreaterThan(0);
    });

    it("should filter NaN values", () => {
      const result = safeStandardDeviation([1, NaN, 3, 5]);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("safeMedian", () => {
    it("should return 0 for empty array", () => {
      expect(safeMedian([])).toBe(0);
    });

    it("should return single element", () => {
      expect(safeMedian([42])).toBe(42);
    });

    it("should calculate median for odd-length array", () => {
      expect(safeMedian([1, 3, 5])).toBe(3);
    });

    it("should calculate median for even-length array", () => {
      expect(safeMedian([1, 2, 3, 4])).toBe(2.5);
    });

    it("should handle unsorted array", () => {
      expect(safeMedian([5, 1, 3])).toBe(3);
    });

    it("should filter NaN values", () => {
      expect(safeMedian([1, NaN, 3, 5])).toBe(3);
    });
  });

  describe("safeSum", () => {
    it("should return 0 for empty array", () => {
      expect(safeSum([])).toBe(0);
    });

    it("should sum normal array", () => {
      expect(safeSum([1, 2, 3, 4, 5])).toBe(15);
    });

    it("should filter NaN values", () => {
      expect(safeSum([1, NaN, 3, 5])).toBe(9);
    });

    it("should filter Infinity values", () => {
      expect(safeSum([1, Infinity, 3, 5])).toBe(9);
    });

    it("should handle negative numbers", () => {
      expect(safeSum([-5, -3, -1])).toBe(-9);
    });
  });

  describe("safeMax", () => {
    it("should return 0 for empty array", () => {
      expect(safeMax([])).toBe(0);
    });

    it("should find max value", () => {
      expect(safeMax([1, 5, 3, 2])).toBe(5);
    });

    it("should filter NaN values", () => {
      expect(safeMax([1, NaN, 3, 5])).toBe(5);
    });

    it("should handle negative numbers", () => {
      expect(safeMax([-5, -3, -1])).toBe(-1);
    });
  });

  describe("safeMin", () => {
    it("should return 0 for empty array", () => {
      expect(safeMin([])).toBe(0);
    });

    it("should find min value", () => {
      expect(safeMin([5, 1, 3, 2])).toBe(1);
    });

    it("should filter NaN values", () => {
      expect(safeMin([5, NaN, 3, 1])).toBe(1);
    });

    it("should handle negative numbers", () => {
      expect(safeMin([-5, -3, -1])).toBe(-5);
    });
  });

  describe("isSafeNumber", () => {
    it("should return true for normal numbers", () => {
      expect(isSafeNumber(42)).toBe(true);
      expect(isSafeNumber(0)).toBe(true);
      expect(isSafeNumber(-5)).toBe(true);
    });

    it("should return false for NaN", () => {
      expect(isSafeNumber(NaN)).toBe(false);
    });

    it("should return false for Infinity", () => {
      expect(isSafeNumber(Infinity)).toBe(false);
      expect(isSafeNumber(-Infinity)).toBe(false);
    });

    it("should return false for non-numbers", () => {
      expect(isSafeNumber("42")).toBe(false);
      expect(isSafeNumber(null)).toBe(false);
      expect(isSafeNumber(undefined)).toBe(false);
    });
  });

  describe("clamp", () => {
    it("should clamp value within range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("should clamp value below min", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("should clamp value above max", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("should return min for NaN", () => {
      expect(clamp(NaN, 0, 10)).toBe(0);
    });

    it("should handle negative ranges", () => {
      expect(clamp(-5, -10, 0)).toBe(-5);
    });
  });
});
