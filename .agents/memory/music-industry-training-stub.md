---
name: musicIndustryTrainingData stub shapes
description: Full shape contract required by baseModelTrainer.ts, ContentGenerator, and advertising autopilot
---

## Rule
All exports must match the EXACT nested access patterns in baseModelTrainer.ts. Wrong shapes produce silent `undefined` chain errors or runtime TypeErrors.

**Why:** The stub was recreated after the file went missing. Three rounds of shape fixes were needed (sequencing, CALL_TO_ACTION_LIBRARY structure, then PAID_AD_BENCHMARKS platform metrics).

## Critical shapes (that previously crashed)

### ORGANIC_AS_ADS_PATTERNS
```typescript
{
  crossPlatformBurstStrategy: {
    sequencing: {
      t0:   { platform: "tiktok" },
      t2h:  { platform: "instagram" },
      t4h:  { platform: "twitter" },
      t6h:  { platform: "youtube" },
      t24h: { platform: "facebook" },
    }
  },
  funnelReplication: {
    awareness:     { organicTactic: string },
    consideration: { organicTactic: string },
    conversion:    { organicTactic: string },
  }
}
```

### PAID_AD_BENCHMARKS
```typescript
{
  performanceVsOrganic: {
    conversionComparison: { organicCVR: number }
  },
  platformMetrics: {
    meta_instagram: {
      avgCPM: { engagement: number, conversion: number },
      avgCTR: { video: number, carousel: number, image: number, story: number },
      avgCVR: { coldAudience: number, warmAudience: number, retargeting: number },
      frequencyOptimal: { min: number, max: number },
    },
    tiktok_ads: { same shape as meta_instagram }
  }
}
```

### CALL_TO_ACTION_LIBRARY
```typescript
{
  streaming: { direct: string[], urgent: string[], social_proof: string[] },
  engagement: { comment_bait: string[], save_prompts: string[], share_prompts: string[], follow_prompts: string[] },
  presave: string[]
}
```

### EMOTIONAL_TRIGGER_PATTERNS
Must be a **RECORD object** (not array): `Record<string, Array<{trigger, engagementBoost}>>`.
Iterated as `Object.keys()`, then `EMOTIONAL_TRIGGER_PATTERNS[category].length`.

### VIDEO_CONTENT_TRAINING_PACK
```typescript
{
  youtubeEightM: {
    musicCategoryEngagementRates: { [genre]: { likeRate, commentRate, shareRate } },
    videoFeatureImportance: { hookInFirst3Seconds: number }
  },
  audioSetPatterns: {
    tenSecondClipSignals: { [signal]: { engagementBoost, shareabilityBoost } }
    // must include "dropPresent" key
  },
  harmonySetPatterns: {
    videoMusicAlignment: { beatSyncedEditing: { retentionLift, shareabilityLift } }
  },
  musicBenchTextPairs: { genreDescriptors: { [genre]: string[] } },
  mtgJamendoInsights: {
    highEngagementTagCombinations: any[],
    tempoEngagementCorrelation: object
  }
}
```

### GENRE_VIRAL_HOOKS
`Record<string, Record<string, readonly string[]>>` — each genre has keys: tiktok, instagram, twitter, youtube (all string arrays).

### PLATFORM_CONTENT_SCRIPTS
```typescript
{
  tiktok:    { viralHookFormulas: string[] },
  instagram: { reelsHookFormulas: string[] },
  twitter:   { standaloneFormats: Record<string, string> },  // Object.keys() used
  youtube:   { titleFormulas: string[] }
}
```
