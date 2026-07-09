---
name: musicIndustryTrainingData stub
description: The shared/ml/training/musicIndustryTrainingData.ts file was absent; its absence killed 10+ routes at startup. Stub shape requirements for each consumer.
---

# musicIndustryTrainingData stub

## Why it matters
`shared/ml/training/musicIndustryTrainingData.ts` is imported by:
- `shared/ml/nlp/ContentGenerator.ts` → imported by routes/ai, routes/socialAI, routes/promotionalTools, routes/autopilotLearning, routes/unifiedContent, routes/creativeModel, routes/musicWorkflowAutomations, routes/songwriting
- `server/services/baseModelTrainer.ts` → imported by routes/advertising, routes/advertisingAutopilot, routes/monitoring, routes/executiveDashboard, routes/autopilot, routes/dualAutopilot

Absence = every one of those routes 404s at runtime with no warning at call time (only a silent LOAD FAILURE at startup).

**Why:** tsx propagates the missing-module error up the full import chain, so a single missing training file kills the entire dependent route tree. The error only appears in startup logs as "LOAD FAILURE 'routeName'" — not as a 404 on the route itself.

## Required export shapes (matched to consumer access patterns)

### ContentGenerator.ts needs
- `SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies` — Record<string, string[]> keyed by genre + "general"
- `VIRAL_CONTENT_CORPUS_FLAT` — string[]

### baseModelTrainer.ts needs (nested access patterns — flat values crash)
- `ENGAGEMENT_PREDICTION_FEATURES.contentFactors.hashtagCount.optimal.{min,max}` — numbers
- `ENGAGEMENT_PREDICTION_FEATURES.contentFactors.mediaPresence.{videoMultiplier,imageMultiplier}` — numbers
- `ENGAGEMENT_PREDICTION_FEATURES.temporalFactors.hourOfDay.peakHours` — number[]
- `ENGAGEMENT_PREDICTION_FEATURES.musicSpecificFactors.newRelease.multiplier` — number
- `ORGANIC_AS_ADS_PATTERNS.crossPlatformBurstStrategy.sequencing.{t0,t2h,t4h,t6h,t24h}.platform` — strings (NOT a flat array)
- `ORGANIC_AS_ADS_PATTERNS.funnelReplication[stage].organicTactic` — string
- `PAID_AD_BENCHMARKS.platformMetrics.meta_instagram.{avgCPM.engagement,avgCPM.conversion,avgCTR.video/carousel/image,avgCVR.coldAudience,frequencyOptimal.min/max}` — numbers
- `PAID_AD_BENCHMARKS.platformMetrics.tiktok_ads.{avgCPM,avgCTR,avgCVR,frequencyOptimal}` — same shape
- `GENRE_VIRAL_HOOKS[genre][platform]` — string[] (keyed by BOTH genre AND platform; flat {hooks,emojis,keywords} is also acceptable as extra fields but the platform keys are what get iterated)
- `VIDEO_CONTENT_TRAINING_PACK.youtubeEightM.musicCategoryEngagementRates[genre].{likeRate,commentRate,shareRate}` — numbers (NOT plain numbers)
- `VIDEO_CONTENT_TRAINING_PACK.youtubeEightM.videoFeatureImportance.hookInFirst3Seconds` — number
- `VIDEO_CONTENT_TRAINING_PACK.audioSetPatterns.tenSecondClipSignals.dropPresent.engagementBoost` — number
- `VIDEO_CONTENT_TRAINING_PACK.harmonySetPatterns.videoMusicAlignment.beatSyncedEditing.{retentionLift,shareabilityLift}` — numbers
- `VIDEO_CONTENT_TRAINING_PACK.mtgJamendoInsights.highEngagementTagCombinations` — string[][] (array of tag combo arrays)
- `getHashtagsForGenre(genre: string): string[]` — function

## How to apply
If the stub is ever regenerated or extended, run `grep -n "ORGANIC_AS_ADS_PATTERNS\.\|PAID_AD_BENCHMARKS\.\|ENGAGEMENT_PREDICTION\.\|GENRE_VIRAL_HOOKS\[" server/services/baseModelTrainer.ts` to get the full access pattern list before writing shapes. Flat scalar values for any of the above cause silent NaN/undefined training (no crash) or TypeError crashes in the synthetic data generation loops.
