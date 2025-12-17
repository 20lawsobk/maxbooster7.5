/**
 * Manual verification script to test deterministic behavior
 * Run with: tsx server/simulations/verifyDeterministic.ts
 */

import { simulateAutonomousUpgrade } from './autonomousUpgradeSimulation';
import { simulateAdBooster } from './adBoosterSimulation';
import { logger } from '../logger.js';

/**
 * TODO: Add function documentation
 */
async function verifyDeterministicBehavior() {
  logger.info('🔍 Verifying Deterministic Behavior\n');
  logger.info('='.repeat(80));

  // Test 1: Autonomous Upgrade - Same seed produces identical results
  logger.info('\n📊 Test 1: Autonomous Upgrade Reproducibility');
  logger.info('-'.repeat(80));

  const auto1 = await simulateAutonomousUpgrade(12345);
  const auto2 = await simulateAutonomousUpgrade(12345);

  const autoMatch =
    auto1.totalScenarios === auto2.totalScenarios &&
    auto1.successfulUpgrades === auto2.successfulUpgrades &&
    auto1.metrics.upgradeSuccessRate === auto2.metrics.upgradeSuccessRate &&
    auto1.metrics.algorithmQualityAverage === auto2.metrics.algorithmQualityAverage &&
    auto1.competitiveAdvantage === auto2.competitiveAdvantage;

  logger.info(
    `Run 1: ${auto1.successfulUpgrades}/${auto1.totalScenarios} success (${auto1.metrics.upgradeSuccessRate.toFixed(1)}%)`
  );
  logger.info(
    `Run 2: ${auto2.successfulUpgrades}/${auto2.totalScenarios} success (${auto2.metrics.upgradeSuccessRate.toFixed(1)}%)`
  );
  logger.info(`Results Match: ${autoMatch ? '✅ YES' : '❌ NO'}`);

  if (!autoMatch) {
    logger.info('\n⚠️  FAILURE: Results differ between runs!');
    return false;
  }

  // Test 2: Different seeds produce different results
  logger.info('\n📊 Test 2: Different Seeds Produce Different Results');
  logger.info('-'.repeat(80));

  const auto3 = await simulateAutonomousUpgrade(54321);

  const hasDifferences =
    auto1.scenarios[0].detectionTime !== auto3.scenarios[0].detectionTime ||
    auto1.scenarios[0].upgradeTime !== auto3.scenarios[0].upgradeTime ||
    auto1.scenarios[0].algorithmQuality !== auto3.scenarios[0].algorithmQuality;

  logger.info(
    `Seed 12345 - Scenario A Detection Time: ${(auto1.scenarios[0].detectionTime / 60000).toFixed(1)}m`
  );
  logger.info(
    `Seed 54321 - Scenario A Detection Time: ${(auto3.scenarios[0].detectionTime / 60000).toFixed(1)}m`
  );
  logger.info(`Results Differ: ${hasDifferences ? '✅ YES' : '❌ NO'}`);

  if (!hasDifferences) {
    logger.info('\n⚠️  FAILURE: Different seeds should produce different results!');
    return false;
  }

  // Test 3: KPI Thresholds
  logger.info('\n📊 Test 3: KPI Threshold Verification');
  logger.info('-'.repeat(80));

  const kpisPassed =
    auto1.metrics.upgradeSuccessRate >= 95 &&
    auto1.metrics.algorithmQualityAverage >= 100 &&
    auto1.metrics.zeroDowntime === true &&
    auto1.metrics.detectionSpeedCompliance === true;

  logger.info(
    `Success Rate: ${auto1.metrics.upgradeSuccessRate.toFixed(1)}% (≥95%) ${auto1.metrics.upgradeSuccessRate >= 95 ? '✅' : '❌'}`
  );
  logger.info(
    `Algorithm Quality: ${auto1.metrics.algorithmQualityAverage.toFixed(1)}% (≥100%) ${auto1.metrics.algorithmQualityAverage >= 100 ? '✅' : '❌'}`
  );
  logger.info(
    `Zero Downtime: ${auto1.metrics.zeroDowntime} ${auto1.metrics.zeroDowntime ? '✅' : '❌'}`
  );
  logger.info(
    `Detection Speed SLA: ${auto1.metrics.detectionSpeedCompliance} ${auto1.metrics.detectionSpeedCompliance ? '✅' : '❌'}`
  );

  if (!kpisPassed) {
    logger.info('\n⚠️  FAILURE: Some KPI thresholds not met!');
    return false;
  }

  // Test 4: Ad Booster Reproducibility
  logger.info('\n📊 Test 4: Ad Booster Reproducibility');
  logger.info('-'.repeat(80));

  const campaign = {
    name: 'Test Campaign',
    type: 'product_launch' as const,
    audienceSize: 'medium' as const,
    duration: 7,
    budget: 300,
    platforms: ['facebook', 'instagram', 'tiktok'],
    contentQuality: 90,
  };

  const ad1 = await simulateAdBooster(campaign);
  const ad2 = await simulateAdBooster(campaign);

  const adMatch =
    ad1.amplificationFactor === ad2.amplificationFactor &&
    ad1.paidAdvertising.estimatedReach === ad2.paidAdvertising.estimatedReach &&
    ad1.aiBoosterOrganic.estimatedReach === ad2.aiBoosterOrganic.estimatedReach;

  logger.info(`Run 1 Amplification: ${ad1.amplificationFactor}x`);
  logger.info(`Run 2 Amplification: ${ad2.amplificationFactor}x`);
  logger.info(`Results Match: ${adMatch ? '✅ YES' : '❌ NO'}`);
  logger.info(`Meets ≥2.0x threshold: ${ad1.amplificationFactor >= 2.0 ? '✅ YES' : '❌ NO'}`);

  if (!adMatch) {
    logger.info('\n⚠️  FAILURE: Ad Booster results differ between runs!');
    return false;
  }

  if (ad1.amplificationFactor < 2.0) {
    logger.info('\n⚠️  FAILURE: Ad Booster amplification below 2.0x threshold!');
    return false;
  }

  // All tests passed
  logger.info('\n' + '='.repeat(80));
  logger.info('✅ ALL TESTS PASSED - Simulations are deterministic and meet KPI thresholds');
  logger.info('='.repeat(80));

  return true;
}

// Run verification
verifyDeterministicBehavior()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    logger.error('\n❌ ERROR:', error);
    process.exit(1);
  });
