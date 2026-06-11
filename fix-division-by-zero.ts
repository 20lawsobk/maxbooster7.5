/**
 * DIVISION-BY-ZERO FIX SCRIPT
 * Fixes all unsafe reduce/length divisions across the codebase
 * 
 * Pattern: arr.reduce(...) / arr.length
 * Fix: arr.reduce(...) / (arr.length || 1)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const files = [
  "server/autonomous-autopilot.ts",
  "server/custom-ai-engine.ts",
  "server/db.ts",
  "server/monitoring/aiModelTelemetry.ts",
  "server/monitoring/metricsCollector.ts",
  "server/pocket-dimension/fabric/compression/ContentDefinedChunker.ts",
  "server/reliability/memory-manager.ts",
  "server/routes/analytics-internal.ts",
  "server/routes/audio-processing.ts",
  "server/routes/selfHealingApi.ts",
  "server/security-system.ts",
  "server/services/advancedAnalyticsService.ts",
  "server/services/aiAnalyticsService.ts",
  "server/services/aiInsightsEngine.ts",
  "server/services/aiMusicService.ts",
  "server/services/algorithmIntelligence.ts",
  "server/services/analyticsAnomalyService.ts",
  "server/services/artistProfileService.ts",
  "server/services/audioNormalizationService.ts",
  "server/services/audioService.ts",
  "server/services/autoPostGenerator.ts",
  "server/services/autopilotLearningService.ts",
  "server/services/beatSyncService.ts",
  "server/services/cohortAnalyticsService.ts",
  "server/services/contentAnalysisService.ts",
  "server/services/hyperLearningEngine.ts",
  "server/services/maxcoreScoreCalibrator.ts",
  "server/services/midiTransformService.ts",
  "server/services/mlModelRegistry.ts",
  "server/services/platformAutoFixer.ts",
  "server/services/revenueForecastService.ts",
  "server/services/revenueForecaster.ts",
  "server/services/royaltyEngine.ts",
  "server/services/smartDefaultsService.ts",
  "server/services/timeStretchService.ts",
  "server/services/timingOptimizer.ts",
  "server/simulations/adBoosterSimulation.ts",
  "server/simulations/autonomousUpgradeSimulation.ts",
  "server/tests/load-testing/loadTestFramework.ts",
  "server/tests/load-testing/simpleLoadTest.ts",
  "client/src/components/advertising/CreativeAutomation.tsx",
  "client/src/components/advertising/CreativeVariantGenerator.tsx",
  "client/src/components/export/ExportProgress.tsx",
  "client/src/components/studio/FlowStateIdeaCapture.tsx",
  "client/src/components/studio/FlowStateQuickSketch.tsx",
  "client/src/components/studio/RMSMeter.tsx",
  "client/src/components/studio/TransportBar.tsx",
  "client/src/hooks/useMultiTrackRecorder.ts",
  "client/src/hooks/useSmartScheduling.ts",
  "client/src/lib/audioAnalysisService.ts",
  "client/src/lib/video/AudioAnalyzer.ts",
  "client/src/lib/video/VideoCompositor.ts",
];

let fixedCount = 0;

for (const file of files) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipped (not found): ${file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  const originalContent = content;

  // Pattern 1: reduce(...) / arr.length (no guard)
  content = content.replace(
    /(\w+)\.reduce\(\(([^)]+)\) => ([^,]+), 0\) \/ \1\.length(?!\s*\|\|)/g,
    "$1.reduce(($2) => $3, 0) / ($1.length || 1)"
  );

  // Pattern 2: reduce(...) / values.length (no guard)
  content = content.replace(
    /(\w+)\.reduce\(\(([^)]+)\) => ([^,]+), 0\) \/ \1\.length(?!\s*\|\|)/g,
    "$1.reduce(($2) => $3, 0) / ($1.length || 1)"
  );

  // Pattern 3: More complex patterns with intermediate variables
  content = content.replace(
    /(\w+)\.reduce\(\(([^)]+)\) => ([^,]+), 0\) \/ (\w+)\.length(?!\s*\|\|)/g,
    (match, arr, params, expr, lenVar) => {
      if (arr === lenVar) {
        return `${arr}.reduce((${params}) => ${expr}, 0) / (${arr}.length || 1)`;
      }
      return match;
    }
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, "utf-8");
    fixedCount++;
    console.log(`✅ Fixed: ${file}`);
  }
}

console.log(`\n✅ Fixed ${fixedCount} files with division-by-zero guards`);
