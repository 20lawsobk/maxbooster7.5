/**
 * AI System KPI Verification Tests
 * Automated tests to ensure simulations meet critical performance thresholds
 * and produce deterministic, reproducible results.
 */

import { describe, test, expect } from '@jest/globals';
import {
  simulateAutonomousUpgrade,
  simulateLongTermAdaptation,
} from '../autonomousUpgradeSimulation';
import { simulateAdBooster, runComprehensiveSimulation } from '../adBoosterSimulation';

describe('AI System KPI Verification', () => {
  describe('Autonomous Upgrade System', () => {
    test('meets ≥95% success rate', async () => {
      const result = await simulateAutonomousUpgrade();
      expect(result.metrics.upgradeSuccessRate).toBeGreaterThanOrEqual(95);
    }, 30000);

    test('meets ≥100% quality threshold vs manual baseline', async () => {
      const result = await simulateAutonomousUpgrade();
      expect(result.metrics.algorithmQualityAverage).toBeGreaterThanOrEqual(100);
    }, 30000);

    test('achieves zero downtime deployments', async () => {
      const result = await simulateAutonomousUpgrade();
      expect(result.metrics.zeroDowntime).toBe(true);
    }, 30000);

    test('maintains or gains competitive advantage', async () => {
      const result = await simulateAutonomousUpgrade();
      expect(['maintained', 'gained']).toContain(result.competitiveAdvantage);
    }, 30000);

    test('meets detection speed SLA compliance', async () => {
      const result = await simulateAutonomousUpgrade();
      expect(result.metrics.detectionSpeedCompliance).toBe(true);
    }, 30000);

    test('produces deterministic results (reproducible)', async () => {
      const run1 = await simulateAutonomousUpgrade();
      const run2 = await simulateAutonomousUpgrade();

      // Results should be identical
      expect(run1.totalScenarios).toEqual(run2.totalScenarios);
      expect(run1.successfulUpgrades).toEqual(run2.successfulUpgrades);
      expect(run1.metrics.upgradeSuccessRate).toEqual(run2.metrics.upgradeSuccessRate);
      expect(run1.metrics.algorithmQualityAverage).toEqual(run2.metrics.algorithmQualityAverage);
      expect(run1.competitiveAdvantage).toEqual(run2.competitiveAdvantage);

      // Verify each scenario is identical
      expect(run1.scenarios.length).toEqual(run2.scenarios.length);
      for (let i = 0; i < run1.scenarios.length; i++) {
        expect(run1.scenarios[i].id).toEqual(run2.scenarios[i].id);
        expect(run1.scenarios[i].success).toEqual(run2.scenarios[i].success);
        expect(run1.scenarios[i].detectionTime).toEqual(run2.scenarios[i].detectionTime);
        expect(run1.scenarios[i].upgradeTime).toEqual(run2.scenarios[i].upgradeTime);
        expect(run1.scenarios[i].algorithmQuality).toEqual(run2.scenarios[i].algorithmQuality);
        expect(run1.scenarios[i].competitiveImpact).toEqual(run2.scenarios[i].competitiveImpact);
      }
    }, 60000);

    test('long-term simulation meets ≥95% success rate', async () => {
      const result = await simulateLongTermAdaptation();
      expect(result.metrics.upgradeSuccessRate).toBeGreaterThanOrEqual(95);
    }, 30000);

    test('long-term simulation maintains continuous adaptation', async () => {
      const result = await simulateLongTermAdaptation();
      expect(result.yearLongSimulation?.continuousAdaptation).toBe(true);
    }, 30000);
  });

  describe('Ad Booster System', () => {
    test('meets ≥2.0x amplification factor (100%+ boost)', async () => {
      const campaign = {
        name: 'Test Campaign',
        type: 'product_launch' as const,
        audienceSize: 'medium' as const,
        duration: 7,
        budget: 300,
        platforms: ['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin'],
        contentQuality: 90,
      };

      const result = await simulateAdBooster(campaign);
      expect(result.amplificationFactor).toBeGreaterThanOrEqual(2.0);
    }, 30000);

    test('comprehensive simulation - all scenarios pass', async () => {
      const results = await runComprehensiveSimulation();
      expect(results.summary.allScenariosPass).toBe(true);
      expect(results.summary.minAmplification).toBeGreaterThanOrEqual(2.0);
      expect(results.summary.averageAmplification).toBeGreaterThanOrEqual(2.5);
    }, 60000);

    test('produces deterministic results (reproducible)', async () => {
      const campaign = {
        name: 'Test Campaign',
        type: 'product_launch' as const,
        audienceSize: 'medium' as const,
        duration: 7,
        budget: 300,
        platforms: ['facebook', 'instagram', 'tiktok'],
        contentQuality: 90,
      };

      const run1 = await simulateAdBooster(campaign);
      const run2 = await simulateAdBooster(campaign);

      // Results should be identical for deterministic calculations
      expect(run1.amplificationFactor).toEqual(run2.amplificationFactor);
      expect(run1.paidAdvertising.estimatedReach).toEqual(run2.paidAdvertising.estimatedReach);
      expect(run1.aiBoosterOrganic.estimatedReach).toEqual(run2.aiBoosterOrganic.estimatedReach);
      expect(run1.comparison.reachIncrease).toEqual(run2.comparison.reachIncrease);
    }, 60000);

    test('achieves zero cost organic amplification', async () => {
      const campaign = {
        name: 'Test Campaign',
        type: 'brand_awareness' as const,
        audienceSize: 'small' as const,
        duration: 7,
        budget: 300,
        platforms: ['instagram', 'tiktok'],
        contentQuality: 85,
      };

      const result = await simulateAdBooster(campaign);
      expect(result.aiBoosterOrganic.totalCost).toBe(0);
    }, 30000);
  });

  describe('Integration Tests', () => {
    test('all critical KPIs pass together', async () => {
      // Run both simulations
      const autonomousResult = await simulateAutonomousUpgrade();
      const adBoosterResults = await runComprehensiveSimulation();

      // Verify all critical KPIs
      expect(autonomousResult.metrics.upgradeSuccessRate).toBeGreaterThanOrEqual(95);
      expect(autonomousResult.metrics.algorithmQualityAverage).toBeGreaterThanOrEqual(100);
      expect(adBoosterResults.summary.allScenariosPass).toBe(true);
      expect(adBoosterResults.summary.minAmplification).toBeGreaterThanOrEqual(2.0);

      // Verify system health
      expect(autonomousResult.metrics.zeroDowntime).toBe(true);
      expect(autonomousResult.metrics.detectionSpeedCompliance).toBe(true);
      expect(['maintained', 'gained']).toContain(autonomousResult.competitiveAdvantage);
    }, 90000);
  });

  describe('Reproducibility Verification', () => {
    test('running simulations multiple times produces identical results', async () => {
      // Run autonomous upgrade 3 times
      const auto1 = await simulateAutonomousUpgrade();
      const auto2 = await simulateAutonomousUpgrade();
      const auto3 = await simulateAutonomousUpgrade();

      // All should have identical metrics
      expect(auto1.metrics.upgradeSuccessRate).toEqual(auto2.metrics.upgradeSuccessRate);
      expect(auto2.metrics.upgradeSuccessRate).toEqual(auto3.metrics.upgradeSuccessRate);

      expect(auto1.metrics.algorithmQualityAverage).toEqual(auto2.metrics.algorithmQualityAverage);
      expect(auto2.metrics.algorithmQualityAverage).toEqual(auto3.metrics.algorithmQualityAverage);

      expect(auto1.competitiveAdvantage).toEqual(auto2.competitiveAdvantage);
      expect(auto2.competitiveAdvantage).toEqual(auto3.competitiveAdvantage);
    }, 120000);

    test('different seeds produce different results', async () => {
      const result1 = await simulateAutonomousUpgrade(12345);
      const result2 = await simulateAutonomousUpgrade(54321);

      // Different seeds should produce different scenario details
      // but both should still pass KPI thresholds
      expect(result1.metrics.upgradeSuccessRate).toBeGreaterThanOrEqual(95);
      expect(result2.metrics.upgradeSuccessRate).toBeGreaterThanOrEqual(95);

      // At least some metrics should differ with different seeds
      const hasDifferences =
        result1.scenarios[0].detectionTime !== result2.scenarios[0].detectionTime ||
        result1.scenarios[0].upgradeTime !== result2.scenarios[0].upgradeTime ||
        result1.scenarios[0].algorithmQuality !== result2.scenarios[0].algorithmQuality;

      expect(hasDifferences).toBe(true);
    }, 60000);
  });
});
