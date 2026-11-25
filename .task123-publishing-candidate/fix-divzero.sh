#!/bin/bash

# Fix division-by-zero bugs: arr.reduce(...) / arr.length → arr.reduce(...) / (arr.length || 1)

files=(
  "server/autonomous-autopilot.ts"
  "server/custom-ai-engine.ts"
  "server/db.ts"
  "server/monitoring/aiModelTelemetry.ts"
  "server/monitoring/metricsCollector.ts"
  "server/reliability/memory-manager.ts"
  "server/routes/analytics-internal.ts"
  "server/routes/audio-processing.ts"
  "server/routes/selfHealingApi.ts"
  "server/security-system.ts"
  "server/services/advancedAnalyticsService.ts"
  "server/services/aiAnalyticsService.ts"
  "server/services/aiInsightsEngine.ts"
  "server/services/aiMusicService.ts"
  "server/services/algorithmIntelligence.ts"
  "server/services/analyticsAnomalyService.ts"
  "server/services/artistProfileService.ts"
  "server/services/audioNormalizationService.ts"
  "server/services/audioService.ts"
  "server/services/autoPostGenerator.ts"
  "server/services/autopilotLearningService.ts"
  "server/services/beatSyncService.ts"
  "server/services/cohortAnalyticsService.ts"
  "server/services/contentAnalysisService.ts"
  "server/services/hyperLearningEngine.ts"
  "server/services/maxcoreScoreCalibrator.ts"
  "server/services/midiTransformService.ts"
  "server/services/mlModelRegistry.ts"
  "server/services/platformAutoFixer.ts"
  "server/services/revenueForecastService.ts"
  "server/services/revenueForecaster.ts"
  "server/services/royaltyEngine.ts"
  "server/services/smartDefaultsService.ts"
  "server/services/timeStretchService.ts"
  "server/services/timingOptimizer.ts"
  "server/simulations/adBoosterSimulation.ts"
  "server/simulations/autonomousUpgradeSimulation.ts"
  "server/tests/load-testing/loadTestFramework.ts"
  "server/tests/load-testing/simpleLoadTest.ts"
  "client/src/components/advertising/CreativeAutomation.tsx"
  "client/src/components/advertising/CreativeVariantGenerator.tsx"
  "client/src/components/export/ExportProgress.tsx"
  "client/src/components/studio/FlowStateIdeaCapture.tsx"
  "client/src/components/studio/FlowStateQuickSketch.tsx"
  "client/src/components/studio/RMSMeter.tsx"
  "client/src/components/studio/TransportBar.tsx"
  "client/src/hooks/useMultiTrackRecorder.ts"
  "client/src/hooks/useSmartScheduling.ts"
  "client/src/lib/audioAnalysisService.ts"
  "client/src/lib/video/AudioAnalyzer.ts"
  "client/src/lib/video/VideoCompositor.ts"
)

fixed=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Fix: arr.reduce(...) / arr.length → arr.reduce(...) / (arr.length || 1)
    sed -i 's/\(\.reduce([^)]*)\) \/ \([a-zA-Z_][a-zA-Z0-9_]*\.length\)$/\1 \/ (\2 || 1)/g' "$file"
    ((fixed++))
    echo "✅ Fixed: $file"
  fi
done

echo ""
echo "✅ Fixed $fixed files"
