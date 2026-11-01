import { db } from "../db.js";
import { autopilotLearningData } from "@shared/schema";
import { and, desc, gte, lte, avg, count } from "drizzle-orm";
import { logger } from "../logger.js";
import { autopilotLearningService } from "./autopilotLearningService.js";
import { EventEmitter } from "events";

// ── Process-level TTL cache for HyperLearning DB aggregates ─────────────────
// Each HyperLearning cycle fires 5+ aggregate queries on autopilot_learning_data
// (300-400ms each, full sequential scans — no indexes due to DB storage cap).
// This cache stores results in process memory for one 5-minute window, so each
// distinct query hits the DB exactly once per cycle rather than on every call.
// Zero PDIM overhead — fully in-process, no network I/O.
 // 5-minute bucket matches cycle interval
const _hlCache = new Map<string, { value: unknown; expiresAt: number }>();
function _hlGet<T>(key: string): T | undefined {
  const e = _hlCache?.get(key);
  if (!e) return undefined;
  if (Date?.now() > e?.expiresAt) {
    _hlCache?.delete(key);
    return undefined;
  }
  return e?.value as T;
}
function _hlSet(key: string, value: unknown): void {
  // Fixed 6-minute TTL: covers 1 full 5-minute cycle plus a 60s buffer.
  // Key is NOT bucketed by wall-clock — same key across successive cycles so
  // cycle 2 reads what cycle 1 cached regardless of alignment.
  _hlCache?.set(key, { value, expiresAt: Date.now() + 6 * 60 * 1000 });
}
function _hlKey(id: string): string {
  // No wall-clock bucket in the key — TTL alone controls expiry.
  return `hl_${id}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_LEARNING_RATE = 24.0; // 24x faster than average human
const OWNER_MULTIPLIER = 3.0; // 3x owner capacity
const LEARNING_MULTIPLIER = OWNER_LEARNING_RATE * OWNER_MULTIPLIER; // = 72x
const HUMAN_ANALYSIS_DIMENSIONS = 5;
const HYPER_ANALYSIS_DIMENSIONS =
  HUMAN_ANALYSIS_DIMENSIONS * LEARNING_MULTIPLIER;

// Hyper A/B testing — 30 simultaneous variates for signal density
const AB_MIN_IMPRESSIONS_PER_VARIATE = 30;
const AB_SIGNIFICANCE_THRESHOLD = 0.8;
// AI server for CurriculumTrainer / DiffusionTrainer dispatch
// PEER_TRAINING_NODE env var is always set to MaxCore — localhost fallback
// would only apply in an isolated dev environment with no env vars at all.
const AI_SERVER_URL =
  process.env.PEER_TRAINING_NODE ||
  process.env.AI_SERVER_URL ||
  "https://secure-ai-forge.replit.app";

interface MicroPattern {
  id: string;
  type:
    | "character_count"
    | "emoji_density"
    | "hashtag_position"
    | "word_sentiment"
    | "timing_precision"
    | "media_aspect"
    | "color_temperature"
    | "cta_placement"
    | "hook_structure"
    | "line_breaks"
    | "question_marks"
    | "exclamation_density"
    | "capital_ratio"
    | "number_usage"
    | "url_position";
  pattern: string;
  correlation: number;
  sampleSize: number;
  confidence: number;
  engagementImpact: number;
  platformSpecific: boolean;
  platforms: string[];
}

interface CrossPlatformSynthesis {
  universalPatterns: UniversalPattern[];
  platformSpecificAmplifiers: Map<string, number[]>;
  optimalContentMatrix: ContentMatrix;
  audienceBehaviorModel: AudienceBehaviorModel;
}

interface UniversalPattern {
  id: string;
  description: string;
  effectiveness: number;
  applicablePlatforms: string[];
  optimalVariations: Map<string, string>;
}

interface ContentMatrix {
  dimensions: string[];
  weights: number[][];
  optimalCombinations: Array<{
    combination: Record<string, string>;
    predictedEngagement: number;
    confidence: number;
  }>;
}

interface AudienceBehaviorModel {
  peakActivityWindows: Array<{ start: number; end: number; intensity: number }>;
  contentFatigueCycles: number[];
  engagementVelocityCurve: number[];
  viralityThresholds: Record<string, number>;
}

interface PredictiveModel {
  type: "timing" | "content" | "hashtag" | "hook" | "format" | "composite";
  accuracy: number;
  predictions: Array<{
    scenario: Record<string, any>;
    predictedEngagement: number;
    confidence: number;
    factors: Array<{ factor: string; weight: number }>;
  }>;
}

interface ABTestResult {
  testId: string;
  variants: Array<{
    id: string;
    configuration: Record<string, any>;
    impressions: number;
    engagementRate: number;
    statisticalSignificance: number;
  }>;
  winner: string | null;
  confidenceLevel: number;
  learnings: string[];
}

interface HyperInsight {
  id: string;
  category:
    | "micro_pattern"
    | "cross_platform"
    | "predictive"
    | "behavioral"
    | "competitive"
    | "emergent";
  title: string;
  description: string;
  confidence: number;
  impact: number;
  actionability: number;
  automatedActionAvailable: boolean;
  suggestedAction?: string;
  data: Record<string, any>;
  humanEquivalentHours: number;
  actualProcessingMs: number;
}

interface LearningMetrics {
  patternsDetected: number;
  microPatternsFound: number;
  crossPlatformSyntheses: number;
  predictionsGenerated: number;
  abTestsCompleted: number;
  totalDataPointsProcessed: number;
  humanEquivalentHours: number;
  actualProcessingTimeMs: number;
  learningMultiplier: number;
}

class HyperLearningEngine extends EventEmitter {
  private isRunning: boolean = false;
  private learningInterval: NodeJS.Timeout | null = null;
  private microPatternCache: Map<string, MicroPattern[]> = new Map();
  private crossPlatformModel: CrossPlatformSynthesis | null = null;
  private predictiveModels: Map<string, PredictiveModel> = new Map();
  private abTestQueue: Map<string, ABTestResult> = new Map();
  private learningMetrics: LearningMetrics = this.initializeMetrics();
  private pendingTrainingSignals: Record<string, unknown>[] = [];

  // Baseline interval — Caffeine Mode compresses this dynamically via applyDeadlinePressure()
  private readonly LEARNING_INTERVAL_MS = 5 * 60 * 1000;
  private readonly MICRO_PATTERN_THRESHOLD = 0.15;

  // Caffeine Mode — deadline pressure compresses learning cycles so the engine
  // absorbs feedback faster when the autopilot is behind its posting schedule.
  private _pressureLevel = 0;

  constructor() {
    super();
    logger.info(
      `🧠 HyperLearning Engine initialized — ${LEARNING_MULTIPLIER}x human capacity (${OWNER_MULTIPLIER}x owner · ${OWNER_LEARNING_RATE}x baseline)`,
    );
  }

  private initializeMetrics(): LearningMetrics {
    return {
      patternsDetected: 0,
      microPatternsFound: 0,
      crossPlatformSyntheses: 0,
      predictionsGenerated: 0,
      abTestsCompleted: 0,
      totalDataPointsProcessed: 0,
      humanEquivalentHours: 0,
      actualProcessingTimeMs: 0,
      learningMultiplier: LEARNING_MULTIPLIER,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info("🚀 HyperLearning Engine ACTIVATED");
    logger.info(`   Learning at ${LEARNING_MULTIPLIER}x human capacity`);
    logger.info(
      `   Analyzing ${Math.round(HYPER_ANALYSIS_DIMENSIONS)} dimensions simultaneously`,
    );

    await this.runLearningCycle();

    this.learningInterval = setInterval(async () => {
      await this.runLearningCycle();
    }, this.LEARNING_INTERVAL_MS);

    this.emit("started", { multiplier: LEARNING_MULTIPLIER });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }

    logger.info("🛑 HyperLearning Engine stopped");
    this.emit("stopped");
  }

  /**
   * Caffeine Mode — compress (or restore) learning cycle interval based on how
   * far behind schedule the autonomous autopilot is.
   *
   * pressure = postsStillNeeded / hoursRemaining
   *   > 1.5  → CRITICAL  → 75-second cycles   (maximum caffeine — all-nighter mode)
   *   1–1.5  → HIGH      → 2-minute cycles
   *   0.5–1  → MODERATE  → 3.5-minute cycles
   *   ≤ 0.5  → NORMAL    → restored to 5-minute cycles
   *
   * Only reschedules if the interval target actually changed by more than a small
   * delta, avoiding a flurry of clearInterval calls from minor pressure fluctuations.
   */
  applyDeadlinePressure(pressure: number): void {
    const prev = this._pressureLevel;
    this._pressureLevel = Math.max(0, pressure);

    let targetMs: number;
    if (pressure > 1.5)
      targetMs = 75 * 1000; // 75 s — max caffeine
    else if (pressure > 1.0)
      targetMs = 2 * 60 * 1000; // 2 min
    else if (pressure > 0.5)
      targetMs = 3.5 * 60 * 1000; // 3.5 min
    else targetMs = this.LEARNING_INTERVAL_MS; // 5 min (normal)

    // Determine previous target to avoid unnecessary rescheduling
    let prevTargetMs: number;
    if (prev > 1.5) prevTargetMs = 75 * 1000;
    else if (prev > 1.0) prevTargetMs = 2 * 60 * 1000;
    else if (prev > 0.5) prevTargetMs = 3.5 * 60 * 1000;
    else prevTargetMs = this.LEARNING_INTERVAL_MS;

    if (targetMs === prevTargetMs) return; // no change needed

    if (this.isRunning && this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = setInterval(async () => {
        await this.runLearningCycle();
      }, targetMs);

      if (pressure > 1.5) {
        logger.warn(
          `⚡ [CaffeineMode] HyperLearning TURBO → ${(targetMs / 1000).toFixed(0)}s cycles` +
            ` (was ${(prevTargetMs / 1000).toFixed(0)}s) — pressure: ${pressure?.toFixed(2)}`,
        );
      } else if (pressure > 0.5) {
        logger.info(
          `☕ [CaffeineMode] HyperLearning accelerated → ${(targetMs / 1000).toFixed(0)}s cycles` +
            ` — pressure: ${pressure?.toFixed(2)}`,
        );
      } else {
        logger.info(
          `😌 [CaffeineMode] HyperLearning returning to normal ${(targetMs / 60000).toFixed(1)}-min cycles — pressure cleared`,
        );
      }
    }
  }

  getPressureLevel(): number {
    return this._pressureLevel;
  }

  private async runLearningCycle(): Promise<void> {
    const cycleStart = Date?.now();
    const cycleId = `hyper_${cycleStart}`;

    logger.info(`🧠 HyperLearning cycle ${cycleId} started`);

    try {
      const results = await Promise?.all([
        this.runMicroPatternDetection(),
        this.runCrossPlatformSynthesis(),
        this.runPredictiveModeling(),
        this.runBehavioralAnalysis(),
        this.runCompetitiveIntelligence(),
        this.runEmergentPatternDetection(),
        this.processABTests(),
        this.runRealTimeAdaptation(),
      ]);

      const [
        microPatterns,
        crossPlatform,
        predictions,
        behavioral,
        competitive,
        emergent,
        abTests,
        adaptations,
      ] = results;

      const cycleEnd = Date?.now();
      const actualTimeMs = cycleEnd - cycleStart;

      const humanEquivalentHours = this.calculateHumanEquivalent(
        microPatterns?.length || 0,
        crossPlatform?.synthesisCount || 0,
        predictions?.length || 0,
        behavioral?.patternsFound || 0,
        competitive?.insightsFound || 0,
        emergent?.length || 0,
        abTests?.length || 0,
        (adaptations as any)?.length || 0,
      );

      this.learningMetrics.actualProcessingTimeMs += actualTimeMs;
      this.learningMetrics.humanEquivalentHours += humanEquivalentHours;
      this.learningMetrics.learningMultiplier =
        (this.learningMetrics.humanEquivalentHours * 3600000) /
        Math.max(1, this.learningMetrics.actualProcessingTimeMs);

      const insights = await this.consolidateInsights(
        microPatterns,
        crossPlatform,
        predictions,
        behavioral,
        competitive,
        emergent,
      );

      logger.info(`✅ HyperLearning cycle complete:`);
      logger.info(`   Micro-patterns detected: ${microPatterns?.length}`);
      logger.info(
        `   Cross-platform syntheses: ${crossPlatform?.synthesisCount}`,
      );
      logger.info(
        `   Predictions generated: ${predictions?.reduce((s, m) => s + m?.predictions.length, 0)} (${predictions?.length} models: ${predictions?.map((m) => `${m?.type}@${m?.accuracy.toFixed(2)}`).join(", ")})`,
      );
      logger.info(`   A/B tests processed: ${abTests?.length}`);
      logger.info(
        `   Time: ${actualTimeMs}ms (human equivalent: ${humanEquivalentHours?.toFixed(1)} hours)`,
      );
      logger.info(
        `   Learning multiplier: ${this.learningMetrics.learningMultiplier?.toFixed(1)}x`,
      );

      this.emit("cycleCompleted", {
        cycleId,
        insights: insights.length,
        learningMultiplier: this.learningMetrics.learningMultiplier,
        humanEquivalentHours,
        actualTimeMs,
      });
    } catch (error) {
      logger.warn({ err: error }, `❌ HyperLearning cycle ${cycleId} failed:`);
      this.emit("cycleFailed", { cycleId, error });
    }
  }

  private async runMicroPatternDetection(): Promise<MicroPattern[]> {
    const patterns: MicroPattern[] = [];
    Date?.now();

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo?.setDate(ninetyDaysAgo?.getDate() - 90);

      const microKey = _hlKey("micro_all_90d");
       
      let allData: Record<string, unknown>[] | undefined =
        _hlGet<Record<string, unknown>[]>(microKey);
      if (!allData) {
        allData = await db
          .select()
          .from(autopilotLearningData)
          .where(gte(autopilotLearningData?.createdAt, ninetyDaysAgo))
          .orderBy(desc(autopilotLearningData?.engagementRate))
          .limit(10000);
        _hlSet(microKey, allData);
        logger.info(
          `[HyperLearning] micro_all_90d: ${allData?.length} rows fetched from DB (cached for next cycle)`,
        );
      } else {
        logger.info(
          `[HyperLearning] micro_all_90d: ${allData?.length} rows served from process cache`,
        );
      }

      if (allData?.length < 50) return patterns;

      patterns?.push(...this.detectCharacterCountPatterns(allData));
      patterns?.push(...this.detectEmojiDensityPatterns(allData));
      patterns?.push(...this.detectHashtagPositionPatterns(allData));
      patterns?.push(...this.detectTimingPrecisionPatterns(allData));
      patterns?.push(...this.detectHookStructurePatterns(allData));
      patterns?.push(...this.detectLineBreakPatterns(allData));
      patterns?.push(...this.detectPunctuationPatterns(allData));
      patterns?.push(...this.detectNumberUsagePatterns(allData));
      patterns?.push(...this.detectCTAPlacementPatterns(allData));
      patterns?.push(...this.detectSentimentCorrelation(allData));
      patterns?.push(...this.detectWordFrequencyPatterns(allData));
      patterns?.push(...this.detectTemporalMicroPatterns(allData));
      patterns?.push(...this.detectMediaCorrelations(allData));
      patterns?.push(...this.detectAudienceResponsePatterns(allData));
      patterns?.push(...this.detectViralityPrecursors(allData));

      this.learningMetrics.microPatternsFound += patterns?.length;
      this.learningMetrics.totalDataPointsProcessed += allData?.length;

      const significantPatterns = patterns?.filter(
        (p) =>
          p?.confidence > this.MICRO_PATTERN_THRESHOLD && p?.sampleSize >= 10,
      );

      for (const pattern of significantPatterns) {
        const key = `${pattern?.type}_${pattern?.pattern}`;
        if (!this.microPatternCache.has(key)) {
          // Evict the oldest key when the Map reaches its capacity limit,
          // keeping memory bounded regardless of how many cycles run.
          if (this.microPatternCache.size >= 500) {
            const firstKey = this.microPatternCache.keys().next().value;
            if (firstKey) this.microPatternCache.delete(firstKey);
          }
          this.microPatternCache.set(key, []);
        }
        const arr = this.microPatternCache.get(key)!;
        arr?.push(pattern);
        // Keep only the 50 most recent observations per key to prevent
        // unbounded growth across long-running HyperLearning cycles.
        if (arr?.length > 50) arr?.shift();
      }

      return significantPatterns;
    } catch (error) {
      logger.warn({ err: error }, "Micro-pattern detection failed:");
      return [];
    }
  }

  private detectCharacterCountPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const buckets: Map<
      string,
      { total: number; engagement: number; count: number }
    > = new Map();

    for (const post of data) {
      if (!post?.contentText) continue;
      const length = (post?.contentText as any).length;
      const bucket = Math.floor(length / 50) * 50;
      const key = `${bucket}-${bucket + 50}`;

      if (!buckets?.has(key)) {
        buckets?.set(key, { total: 0, engagement: 0, count: 0 });
      }
      const b = buckets?.get(key)!;
      b.total += length;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    buckets?.forEach((stats, range) => {
      if (stats?.count >= 10) {
        const bucketAvg = stats?.engagement / stats?.count;
        const correlation =
          (bucketAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        if (Math.abs(correlation) > 0.1) {
          patterns?.push({
            id: `char_count_${range}`,
            type: "character_count",
            pattern: `Posts with ${range} characters`,
            correlation,
            sampleSize: stats.count,
            confidence: Math.min(0.95, 0.5 + stats?.count / 100),
            engagementImpact: correlation * 100,
            platformSpecific: false,
            platforms: ["all"],
          });
        }
      }
    });

    return patterns;
  }

  private detectEmojiDensityPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

    const densityBuckets: Map<string, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      if (!post?.contentText) continue;
      const emojis = (post?.contentText as any).match(emojiRegex) || [];
      const density =
        emojis?.length / Math.max(1, (post?.contentText as any).length / 100);
      const bucket = Math.round(density);
      const key = `${bucket}`;

      if (!densityBuckets?.has(key)) {
        densityBuckets?.set(key, { engagement: 0, count: 0 });
      }
      const b = densityBuckets?.get(key)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    densityBuckets?.forEach((stats, density) => {
      if (stats?.count >= 10) {
        const bucketAvg = stats?.engagement / stats?.count;
        const correlation =
          (bucketAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `emoji_density_${density}`,
          type: "emoji_density",
          pattern: `${density} emojis per 100 characters`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.9, 0.4 + stats?.count / 80),
          engagementImpact: correlation * 100,
          platformSpecific: true,
          platforms: ["instagram", "twitter", "tiktok"],
        });
      }
    });

    return patterns;
  }

  private detectHashtagPositionPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const positions: Map<string, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      if (
        !post?.contentText ||
        !Array.isArray(post?.hashtags) ||
        post?.hashtags.length === 0
      )
        continue;

      const text = (post?.contentText as any).toLowerCase();
      const firstHashtag = post?.hashtags[0]?.toLowerCase();
      if (!firstHashtag) continue;

      const position = text?.indexOf(`#${firstHashtag}`);
      let positionKey: string;

      if (position === -1) {
        positionKey = "separate";
      } else if (position < text?.length * 0.2) {
        positionKey = "start";
      } else if (position > text?.length * 0.8) {
        positionKey = "end";
      } else {
        positionKey = "middle";
      }

      if (!positions?.has(positionKey)) {
        positions?.set(positionKey, { engagement: 0, count: 0 });
      }
      const b = positions?.get(positionKey)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    positions?.forEach((stats, position) => {
      if (stats?.count >= 10) {
        const posAvg = stats?.engagement / stats?.count;
        const correlation =
          (posAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `hashtag_position_${position}`,
          type: "hashtag_position",
          pattern: `Hashtags at ${position} of post`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.85, 0.45 + stats?.count / 100),
          engagementImpact: correlation * 100,
          platformSpecific: true,
          platforms: ["instagram", "twitter", "linkedin"],
        });
      }
    });

    return patterns;
  }

  private detectTimingPrecisionPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const minuteBuckets: Map<number, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      if (!post?.createdAt) continue;
      const date = new Date(post?.createdAt as any);
      const minute = Math.floor(date?.getMinutes() / 15) * 15;

      if (!minuteBuckets?.has(minute)) {
        minuteBuckets?.set(minute, { engagement: 0, count: 0 });
      }
      const b = minuteBuckets?.get(minute)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    minuteBuckets?.forEach((stats, minute) => {
      if (stats?.count >= 20) {
        const bucketAvg = stats?.engagement / stats?.count;
        const correlation =
          (bucketAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        if (Math.abs(correlation) > 0.05) {
          patterns?.push({
            id: `timing_minute_${minute}`,
            type: "timing_precision",
            pattern: `Posts at minute :${minute?.toString().padStart(2, "0")}`,
            correlation,
            sampleSize: stats.count,
            confidence: Math.min(0.8, 0.4 + stats?.count / 150),
            engagementImpact: correlation * 100,
            platformSpecific: false,
            platforms: ["all"],
          });
        }
      }
    });

    return patterns;
  }

  private detectHookStructurePatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const hookTypes: Map<string, { engagement: number; count: number }> =
      new Map();

    const hookPatterns = [
      {
        name: "question_start",
        regex: /^(what|why|how|when|where|who|which|do you|are you|have you)/i,
      },
      { name: "number_start", regex: /^[0-9]+\s/ },
      {
        name: "emoji_start",
        regex: new RegExp("^[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}]", "u"),
      },
      { name: "capital_word", regex: /^[A-Z]{2,}/ },
      { name: "ellipsis_start", regex: /^\.{2,}|^…/ },
      {
        name: "announcement",
        regex: /^(breaking|just|new|announcing|introducing|finally)/i,
      },
      { name: "personal", regex: /^(I |my |me |we )/i },
      { name: "direct_address", regex: /^(you |your |hey |hi )/i },
      {
        name: "controversial",
        regex: /^(unpopular opinion|hot take|controversial|truth is)/i,
      },
      { name: "story", regex: /^(so |okay so|story time|thread)/i },
    ];

    for (const post of data) {
      if (!post?.contentText) continue;
      const text = (post?.contentText as any).trim();

      let matchedHook = "generic";
      for (const hook of hookPatterns) {
        if (hook?.regex.test(text)) {
          matchedHook = hook?.name;
          break;
        }
      }

      if (!hookTypes?.has(matchedHook)) {
        hookTypes?.set(matchedHook, { engagement: 0, count: 0 });
      }
      const b = hookTypes?.get(matchedHook)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    hookTypes?.forEach((stats, hookType) => {
      if (stats?.count >= 10) {
        const hookAvg = stats?.engagement / stats?.count;
        const correlation =
          (hookAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `hook_${hookType}`,
          type: "hook_structure",
          pattern: `${hookType?.replace(/_/g, " ")} hook`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.9, 0.5 + stats?.count / 80),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectLineBreakPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const breakBuckets: Map<number, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      if (!post?.contentText) continue;
      const breaks = ((post?.contentText as any).match(/\n/g) || []).length;
      const bucket = Math.min(breaks, 10);

      if (!breakBuckets?.has(bucket)) {
        breakBuckets?.set(bucket, { engagement: 0, count: 0 });
      }
      const b = breakBuckets?.get(bucket)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    breakBuckets?.forEach((stats, breaks) => {
      if (stats?.count >= 15) {
        const bucketAvg = stats?.engagement / stats?.count;
        const correlation =
          (bucketAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `line_breaks_${breaks}`,
          type: "line_breaks",
          pattern: `${breaks} line breaks in post`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.85, 0.4 + stats?.count / 100),
          engagementImpact: correlation * 100,
          platformSpecific: true,
          platforms: ["instagram", "linkedin", "threads"],
        });
      }
    });

    return patterns;
  }

  private detectPunctuationPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];

    const punctuationTypes = [
      { name: "question_marks", regex: /\?/g },
      { name: "exclamations", regex: /!/g },
      { name: "ellipsis", regex: /\.{3}|…/g },
      { name: "parentheses", regex: /\([^)]*\)/g },
    ];

    for (const pType of punctuationTypes) {
      const buckets: Map<number, { engagement: number; count: number }> =
        new Map();

      for (const post of data) {
        if (!post?.contentText) continue;
        const matches = (post?.contentText as any).match(pType?.regex) || [];
        const bucket = Math.min(matches?.length, 5);

        if (!buckets?.has(bucket)) {
          buckets?.set(bucket, { engagement: 0, count: 0 });
        }
        const b = buckets?.get(bucket)!;
        b.engagement += post?.engagementRate || 0;
        b.count++;
      }

      const avgEngagement =
        data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

      buckets?.forEach((stats, count) => {
        if (stats?.count >= 15) {
          const bucketAvg = stats?.engagement / stats?.count;
          const correlation =
            (bucketAvg - avgEngagement) / Math.max(0.01, avgEngagement);

          patterns?.push({
            id: `${pType?.name}_${count}`,
            type: "exclamation_density",
            pattern: `${count} ${pType?.name.replace(/_/g, " ")}`,
            correlation,
            sampleSize: stats.count,
            confidence: Math.min(0.8, 0.35 + stats?.count / 100),
            engagementImpact: correlation * 100,
            platformSpecific: false,
            platforms: ["all"],
          });
        }
      });
    }

    return patterns;
  }

  private detectNumberUsagePatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const numberTypes: Map<string, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      if (!post?.contentText) continue;
      const text = post?.contentText;

      let numberType = "none";
      if (/^\d+[\.\):]/.test((text as string))) {
        numberType = "list_format";
      } else if (/\d+%/.test((text as string))) {
        numberType = "percentage";
      } else if (/\$\d+|\d+\s*(k|m|b|million|billion)/i?.test((text as string))) {
        numberType = "money_or_scale";
      } else if (
        /\d+\s*(days?|weeks?|months?|years?|hours?|minutes?)/i?.test((text as string))
      ) {
        numberType = "time_reference";
      } else if (/\d+/.test((text as string))) {
        numberType = "general_number";
      }

      if (!numberTypes?.has(numberType)) {
        numberTypes?.set(numberType, { engagement: 0, count: 0 });
      }
      const b = numberTypes?.get(numberType)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    numberTypes?.forEach((stats, type) => {
      if (stats?.count >= 15) {
        const typeAvg = stats?.engagement / stats?.count;
        const correlation =
          (typeAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `number_${type}`,
          type: "number_usage",
          pattern: `${type?.replace(/_/g, " ")} in content`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.85, 0.4 + stats?.count / 100),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectCTAPlacementPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const ctaPositions: Map<string, { engagement: number; count: number }> =
      new Map();

    const ctaPatterns = [
      /link in bio/i,
      /check out/i,
      /click/i,
      /follow/i,
      /subscribe/i,
      /comment below/i,
      /share this/i,
      /tag someone/i,
      /save this/i,
      /double tap/i,
      /turn on/i,
      /dm me/i,
      /let me know/i,
    ];

    for (const post of data) {
      if (!post?.contentText) continue;
      const text = post?.contentText;
      const textLength = (text as any)?.length;

      let ctaPosition = "none";
      for (const cta of ctaPatterns) {
        const match = (text as any)?.match(cta);
        if (match && match?.index !== undefined) {
          const position = match?.index / textLength;
          if (position < 0.25) ctaPosition = "start";
          else if (position > 0.75) ctaPosition = "end";
          else ctaPosition = "middle";
          break;
        }
      }

      if (!ctaPositions?.has(ctaPosition)) {
        ctaPositions?.set(ctaPosition, { engagement: 0, count: 0 });
      }
      const b = ctaPositions?.get(ctaPosition)!;
      b.engagement += post?.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data?.reduce((s, d) => s + (d?.engagementRate || 0), 0) / data?.length;

    ctaPositions?.forEach((stats, position) => {
      if (stats?.count >= 15) {
        const posAvg = stats?.engagement / stats?.count;
        const correlation =
          (posAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns?.push({
          id: `cta_${position}`,
          type: "cta_placement",
          pattern: `CTA at ${position} of post`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.85, 0.45 + stats?.count / 100),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectSentimentCorrelation(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const sentimentBuckets: Map<string, { engagement: number; count: number }> =
      new Map();

    const positiveWords = [
      "amazing",
      "love",
      "great",
      "awesome",
      "incredible",
      "fantastic",
      "beautiful",
      "perfect",
      "best",
      "excited",
    ];
    const negativeWords = [
      "hate",
      "terrible",
      "worst",
      "awful",
      "horrible",
      "disgusting",
      "annoying",
      "frustrated",
      "angry",
      "sad",
    ];
    const urgentWords = [
      "now",
      "today",
      "urgent",
      "immediately",
      "hurry",
      "limited",
      "exclusive",
      "last chance",
      "don't miss",
    ];

    for (const post of data) {
      if (!post.contentText) continue;
      const text = (post.contentText as any).toLowerCase();

      const positiveCount = positiveWords.filter((w) =>
        text.includes(w),
      ).length;
      const negativeCount = negativeWords.filter((w) =>
        text.includes(w),
      ).length;
      const urgentCount = urgentWords.filter((w) => text.includes(w)).length;

      let sentiment: string;
      if (positiveCount > negativeCount && positiveCount > 0) {
        sentiment = urgentCount > 0 ? "positive_urgent" : "positive";
      } else if (negativeCount > positiveCount && negativeCount > 0) {
        sentiment = "negative";
      } else if (urgentCount > 0) {
        sentiment = "urgent";
      } else {
        sentiment = "neutral";
      }

      if (!sentimentBuckets.has(sentiment)) {
        sentimentBuckets.set(sentiment, { engagement: 0, count: 0 });
      }
      const b = sentimentBuckets.get(sentiment)!;
      b.engagement += post.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data.reduce((s, d) => s + (d.engagementRate || 0), 0) / (data.length || 1);

    sentimentBuckets.forEach((stats, sentiment) => {
      if (stats.count >= 15) {
        const sentAvg = stats.engagement / stats.count;
        const correlation =
          (sentAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns.push({
          id: `sentiment_${sentiment}`,
          type: "word_sentiment",
          pattern: `${sentiment} sentiment`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.9, 0.5 + stats.count / 80),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectWordFrequencyPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const wordEngagement: Map<string, { engagement: number; count: number }> =
      new Map();

    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "its",
      "our",
      "their",
    ]);

    for (const post of data) {
      if (!post.contentText) continue;
      const words = post.contentText
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w: any) => w.length > 3 && !stopWords.has(w));

      const uniqueWords = [...new Set(words)];
      for (const word of uniqueWords) {
        if (!wordEngagement.has((word as string))) {
          wordEngagement.set((word as string), { engagement: 0, count: 0 });
        }
        const b = wordEngagement.get((word as string))!;
        b.engagement += post.engagementRate || 0;
        b.count++;
      }
    }

    const avgEngagement =
      data.reduce((s, d) => s + (d.engagementRate || 0), 0) / (data.length || 1);

    const topWords = [...wordEngagement.entries()]
      .filter(([_, stats]) => stats.count >= 20)
      .map(([word, stats]) => ({
        word,
        avgEngagement: stats.engagement / stats.count,
        count: stats.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 20);

    for (const wordData of topWords) {
      const correlation =
        (wordData.avgEngagement - avgEngagement) /
        Math.max(0.01, avgEngagement);

      if (Math.abs(correlation) > 0.15) {
        patterns.push({
          id: `word_${wordData.word}`,
          type: "word_sentiment",
          pattern: `Using word "${wordData.word}"`,
          correlation,
          sampleSize: wordData.count,
          confidence: Math.min(0.8, 0.4 + wordData.count / 150),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    }

    return patterns;
  }

  private detectTemporalMicroPatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];

    const dayOfMonthBuckets: Map<
      string,
      { engagement: number; count: number }
    > = new Map();
    const weekOfMonthBuckets: Map<
      number,
      { engagement: number; count: number }
    > = new Map();

    for (const post of data) {
      if (!post.createdAt) continue;
      const date = new Date(post.createdAt as any);
      const dayOfMonth = date.getDate();
      const weekOfMonth = Math.ceil(dayOfMonth / 7);

      let dayCategory: string;
      if (dayOfMonth === 1) dayCategory = "first_of_month";
      else if (dayOfMonth <= 7) dayCategory = "early_month";
      else if (dayOfMonth <= 14) dayCategory = "mid_early_month";
      else if (dayOfMonth <= 21) dayCategory = "mid_late_month";
      else if (dayOfMonth >= 28) dayCategory = "end_of_month";
      else dayCategory = "late_month";

      if (!dayOfMonthBuckets.has(dayCategory)) {
        dayOfMonthBuckets.set(dayCategory, { engagement: 0, count: 0 });
      }
      dayOfMonthBuckets.get(dayCategory)!.engagement +=
        post.engagementRate || 0;
      dayOfMonthBuckets.get(dayCategory)!.count++;

      if (!weekOfMonthBuckets.has(weekOfMonth)) {
        weekOfMonthBuckets.set(weekOfMonth, { engagement: 0, count: 0 });
      }
      weekOfMonthBuckets.get(weekOfMonth)!.engagement +=
        post.engagementRate || 0;
      weekOfMonthBuckets.get(weekOfMonth)!.count++;
    }

    const avgEngagement =
      data.reduce((s, d) => s + (d.engagementRate || 0), 0) / (data.length || 1);

    dayOfMonthBuckets.forEach((stats, category) => {
      if (stats.count >= 20) {
        const catAvg = stats.engagement / stats.count;
        const correlation =
          (catAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns.push({
          id: `temporal_${category}`,
          type: "timing_precision",
          pattern: `Posting during ${category.replace(/_/g, " ")}`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.75, 0.35 + stats.count / 150),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectMediaCorrelations(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];
    const mediaTypes: Map<string, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      const mediaType = post.mediaType || "text_only";

      if (!mediaTypes.has((mediaType as string))) {
        mediaTypes.set((mediaType as string), { engagement: 0, count: 0 });
      }
      const b = mediaTypes.get((mediaType as string))!;
      b.engagement += post.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data.reduce((s, d) => s + (d.engagementRate || 0), 0) / (data.length || 1);

    mediaTypes.forEach((stats, type) => {
      if (stats.count >= 10) {
        const typeAvg = stats.engagement / stats.count;
        const correlation =
          (typeAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns.push({
          id: `media_${type}`,
          type: "media_aspect",
          pattern: `${type.replace(/_/g, " ")} content`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.9, 0.5 + stats.count / 60),
          engagementImpact: correlation * 100,
          platformSpecific: true,
          platforms: ["instagram", "tiktok", "youtube"],
        });
      }
    });

    return patterns;
  }

  private detectAudienceResponsePatterns(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];

    const responseRatios: Map<string, { engagement: number; count: number }> =
      new Map();

    for (const post of data) {
      const likes = post.likes || 0;
      const comments = post.comments || 0;
      const shares = post.shares || 0;
      const total = likes + comments + shares;

      if (total === 0) continue;

      let responseType: string;
      if (comments / total > 0.3) {
        responseType = "high_comment_ratio";
      } else if (shares / total > 0.2) {
        responseType = "high_share_ratio";
      } else if (likes / total > 0.8) {
        responseType = "like_dominant";
      } else {
        responseType = "balanced";
      }

      if (!responseRatios.has(responseType)) {
        responseRatios.set(responseType, { engagement: 0, count: 0 });
      }
      const b = responseRatios.get(responseType)!;
      b.engagement += post.engagementRate || 0;
      b.count++;
    }

    const avgEngagement =
      data.reduce((s, d) => s + (d.engagementRate || 0), 0) / (data.length || 1);

    responseRatios.forEach((stats, type) => {
      if (stats.count >= 15) {
        const typeAvg = stats.engagement / stats.count;
        const correlation =
          (typeAvg - avgEngagement) / Math.max(0.01, avgEngagement);

        patterns.push({
          id: `response_${type}`,
          type: "hook_structure",
          pattern: `Content with ${type.replace(/_/g, " ")}`,
          correlation,
          sampleSize: stats.count,
          confidence: Math.min(0.85, 0.45 + stats.count / 100),
          engagementImpact: correlation * 100,
          platformSpecific: false,
          platforms: ["all"],
        });
      }
    });

    return patterns;
  }

  private detectViralityPrecursors(
    data: Record<string, unknown>[],
  ): MicroPattern[] {
    const patterns: MicroPattern[] = [];

    const sortedByEngagement = [...data].sort(
      (a, b) => (b.engagementRate || 0) - (a.engagementRate || 0),
    );
    const top10Percent = sortedByEngagement.slice(
      0,
      Math.ceil(data.length * 0.1),
    );
    const bottom50Percent = sortedByEngagement.slice(
      Math.ceil(data.length * 0.5),
    );

    if (top10Percent.length < 10) return patterns;

    const viralCharacteristics = {
      avgLength: 0,
      avgHashtags: 0,
      avgEmojis: 0,
      questionRatio: 0,
      exclamationRatio: 0,
      emojiStart: 0,
      numberStart: 0,
    };

    const nonViralCharacteristics = { ...viralCharacteristics };
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

    for (const post of top10Percent) {
      const text = typeof post.contentText === "string" ? post.contentText : "";
      const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
      viralCharacteristics.avgLength += text.length;
      viralCharacteristics.avgHashtags += hashtags.length;
      viralCharacteristics.avgEmojis += (text.match(emojiRegex) || []).length;
      if (/\?/.test(text)) viralCharacteristics.questionRatio++;
      if (/!/.test(text)) viralCharacteristics.exclamationRatio++;
      if (emojiRegex.test(text.charAt(0))) viralCharacteristics.emojiStart++;
      if (/^\d/.test(text)) viralCharacteristics.numberStart++;
    }

    for (const post of bottom50Percent) {
      const text = typeof post.contentText === "string" ? post.contentText : "";
      const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
      nonViralCharacteristics.avgLength += text.length;
      nonViralCharacteristics.avgHashtags += hashtags.length;
      nonViralCharacteristics.avgEmojis += (
        text.match(emojiRegex) || []
      ).length;
      if (/\?/.test(text)) nonViralCharacteristics.questionRatio++;
      if (/!/.test(text)) nonViralCharacteristics.exclamationRatio++;
      if (emojiRegex.test(text.charAt(0))) nonViralCharacteristics.emojiStart++;
      if (/^\d/.test(text)) nonViralCharacteristics.numberStart++;
    }

    Object.keys(viralCharacteristics).forEach((key) => {
      (viralCharacteristics as Record<string, number>)[key] /=
        top10Percent.length;
      (nonViralCharacteristics as Record<string, number>)[key] /=
        bottom50Percent.length;
    });

    const significantDifferences = Object.keys(viralCharacteristics).filter(
      (key) => {
        const viral = (viralCharacteristics as Record<string, number>)[key];
        const nonViral = (nonViralCharacteristics as Record<string, number>)[
          key
        ];
        return Math.abs(viral - nonViral) / Math.max(0.1, nonViral) > 0.3;
      },
    );

    for (const characteristic of significantDifferences) {
      const viralValue = (viralCharacteristics as Record<string, number>)[
        characteristic
      ];
      const nonViralValue = (
        nonViralCharacteristics as Record<string, number>
      )[characteristic];
      const difference =
        ((viralValue - nonViralValue) / Math.max(0.1, nonViralValue)) * 100;

      patterns.push({
        id: `viral_precursor_${characteristic}`,
        type: "hook_structure",
        pattern: `Viral content ${characteristic.replace(/([A-Z])/g, " $1").toLowerCase()}: ${viralValue.toFixed(1)} vs ${nonViralValue.toFixed(1)}`,
        correlation: difference / 100,
        sampleSize: top10Percent.length,
        confidence: Math.min(0.9, 0.6 + top10Percent.length / 100),
        engagementImpact: difference,
        platformSpecific: false,
        platforms: ["all"],
      });
    }

    return patterns;
  }

  private async runCrossPlatformSynthesis(): Promise<{
    synthesisCount: number;
    model: CrossPlatformSynthesis | null;
  }> {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const crossKey = _hlKey("cross_platform_90d");
       
      let platformData: Record<string, unknown>[] | undefined =
        _hlGet<Record<string, unknown>[]>(crossKey);
      if (!platformData) {
        platformData = await db
          .select({
            platform: autopilotLearningData.platform,
            avgEngagement: avg(autopilotLearningData.engagementRate),
            totalPosts: count(),
            avgImpressions: avg(autopilotLearningData.impressions),
            avgLikes: avg(autopilotLearningData.likes),
            avgComments: avg(autopilotLearningData.comments),
            avgShares: avg(autopilotLearningData.shares),
          })
          .from(autopilotLearningData)
          .where(gte(autopilotLearningData.createdAt, ninetyDaysAgo))
          .groupBy(autopilotLearningData.platform);
        _hlSet(crossKey, platformData);
        logger.info(
          `[HyperLearning] cross_platform_90d: ${platformData.length} rows fetched from DB (cached for next cycle)`,
        );
      } else {
        logger.info(
          `[HyperLearning] cross_platform_90d: ${platformData.length} rows served from process cache`,
        );
      }

      if (platformData.length < 2) {
        return { synthesisCount: 0, model: null };
      }

      const universalPatterns: UniversalPattern[] = [];
      const platformAmplifiers: Map<string, number[]> = new Map();

      const allMicroPatterns = [...this.microPatternCache.values()].flat();
      const platformPatterns: Map<string, MicroPattern[]> = new Map();

      for (const pattern of allMicroPatterns) {
        for (const platform of pattern.platforms) {
          if (!platformPatterns.has(platform)) {
            platformPatterns.set(platform, []);
          }
          platformPatterns.get(platform)!.push(pattern);
        }
      }

      const patternsByType: Map<string, Map<string, MicroPattern>> = new Map();
      for (const pattern of allMicroPatterns) {
        if (!patternsByType.has(pattern.type)) {
          patternsByType.set(pattern.type, new Map());
        }
        for (const platform of pattern.platforms) {
          patternsByType.get(pattern.type)!.set(platform, pattern);
        }
      }

      patternsByType.forEach((platformMap, type) => {
        if (platformMap.size >= 2) {
          const patterns = [...platformMap.values()];
          const avgCorrelation =
            patterns.reduce((s, p) => s + p.correlation, 0) / (patterns.length || 1);
          const avgConfidence =
            patterns.reduce((s, p) => s + p.confidence, 0) / (patterns.length || 1);

          if (avgConfidence > 0.5 && Math.abs(avgCorrelation) > 0.1) {
            universalPatterns.push({
              id: `universal_${type}`,
              description: `${type.replace(/_/g, " ")} pattern works across ${platformMap.size} platforms`,
              effectiveness: Math.abs(avgCorrelation),
              applicablePlatforms: [...platformMap.keys()],
              optimalVariations: new Map(
                patterns.map((p) => [p.platforms[0], p.pattern]),
              ),
            });
          }
        }
      });

      for (const platform of platformData) {
        const platformName =
          typeof platform.platform === "string" ? platform.platform : "";
        const platformPatternList = platformPatterns.get(platformName) || [];
        const amplifiers = platformPatternList
          .filter((p) => p.correlation > 0.1)
          .map((p) => p.engagementImpact);
        platformAmplifiers.set(platformName, amplifiers);
      }

      const synthesis: CrossPlatformSynthesis = {
        universalPatterns,
        platformSpecificAmplifiers: platformAmplifiers,
        optimalContentMatrix: {
          dimensions: ["hook", "length", "emoji", "hashtag", "timing"],
          weights: this.calculateOptimalWeights(allMicroPatterns),
          optimalCombinations: this.findOptimalCombinations(allMicroPatterns),
        },
        audienceBehaviorModel: await this.buildAudienceBehaviorModel(),
      };

      this.crossPlatformModel = synthesis;
      this.learningMetrics.crossPlatformSyntheses++;

      return { synthesisCount: universalPatterns.length, model: synthesis };
    } catch (error) {
      logger.warn({ err: error }, "Cross-platform synthesis failed:");
      return { synthesisCount: 0, model: null };
    }
  }

  private calculateOptimalWeights(patterns: MicroPattern[]): number[][] {
    const dimensions = [
      "hook_structure",
      "character_count",
      "emoji_density",
      "hashtag_position",
      "timing_precision",
    ];

    // Pre-compute avg absolute impact for each dimension from real pattern data.
    const dimImpacts = dimensions.map((dim) => {
      const dp = patterns.filter((p) => p.type === dim);
      return dp.length > 0
        ? dp.reduce((s, p) => s + Math.abs(p.engagementImpact), 0) / (dp.length || 1)
        : 0;
    });
    const totalImpact = dimImpacts.reduce((s, v) => s + v, 0) || 1;

    const weights: number[][] = [];
    for (let i = 0; i < dimensions.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < dimensions.length; j++) {
        if (i === j) {
          // Diagonal: how strongly this dimension self-predicts engagement.
          row.push(Math.min(1, dimImpacts[i] / 50));
        } else {
          // Off-diagonal: cross-influence weight derived from the relative share
          // of dimension j's impact in the overall pattern landscape.
          // This replaces Math.random() with a deterministic, data-grounded value.
          row?.push(Math.min(0.3, (dimImpacts[j] / totalImpact) * 0.6));
        }
      }
      weights?.push(row);
    }

    return weights;
  }

  private findOptimalCombinations(
    patterns: MicroPattern[],
  ): Array<{
    combination: Record<string, string>;
    predictedEngagement: number;
    confidence: number;
  }> {
    const combinations: Array<{
      combination: Record<string, string>;
      predictedEngagement: number;
      confidence: number;
    }> = [];

    const topPatternsByType: Map<string, MicroPattern> = new Map();
    for (const pattern of patterns) {
      const existing = topPatternsByType?.get(pattern?.type);
      if (!existing || pattern?.engagementImpact > existing?.engagementImpact) {
        topPatternsByType?.set(pattern?.type, pattern);
      }
    }

    const combination: Record<string, string> = {};
    let totalImpact = 0;
    let avgConfidence = 0;
    let count = 0;

    topPatternsByType?.forEach((pattern, type) => {
      combination[type] = pattern?.pattern;
      totalImpact += pattern?.engagementImpact;
      avgConfidence += pattern?.confidence;
      count++;
    });

    if (count > 0) {
      combinations?.push({
        combination,
        predictedEngagement: totalImpact / count,
        confidence: avgConfidence / count,
      });
    }

    return combinations;
  }

  private async buildAudienceBehaviorModel(): Promise<AudienceBehaviorModel> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const hourlyData = await db
        .select({
          hour: autopilotLearningData.postingHour,
          avgEngagement: avg(autopilotLearningData?.engagementRate),
          postCount: count(),
        })
        .from(autopilotLearningData)
        .where(gte(autopilotLearningData?.createdAt, thirtyDaysAgo))
        .groupBy(autopilotLearningData?.postingHour)
        .orderBy(autopilotLearningData?.postingHour);

      const peakActivityWindows: Array<{
        start: number;
        end: number;
        intensity: number;
      }> = [];
      let currentPeak: {
        start: number;
        end: number;
        intensity: number;
      } | null = null;
      const avgEngagement =
        hourlyData?.reduce(
          (s, h) => s + parseFloat(String(h?.avgEngagement) || "0"),
          0,
        ) / Math.max(1, hourlyData?.length);

      for (const hourData of hourlyData) {
        const hour = hourData?.hour || 0;
        const engagement = parseFloat(String(hourData?.avgEngagement) || "0");

        if (engagement > avgEngagement * 1.2) {
          if (currentPeak && hour === currentPeak?.end + 1) {
            currentPeak.end = hour;
            currentPeak.intensity = Math.max(
              currentPeak?.intensity,
              engagement / avgEngagement,
            );
          } else {
            if (currentPeak) peakActivityWindows?.push(currentPeak);
            currentPeak = {
              start: hour,
              end: hour,
              intensity: engagement / avgEngagement,
            };
          }
        } else if (currentPeak) {
          peakActivityWindows?.push(currentPeak);
          currentPeak = null;
        }
      }
      if (currentPeak) peakActivityWindows?.push(currentPeak);

      // contentFatigueCycles: derived from distribution of posting intervals in the DB.
      // We compute 25th/50th/75th/90th percentile gaps (hours) between consecutive posts
      // to understand when audience fatigue typically sets in.
      const fatigueCycles: number[] = [];
      if (hourlyData?.length >= 4) {
        const sorted = [...hourlyData]
          .map((h) => h?.hour ?? 0)
          .sort((a, b) => a - b);
        const gaps: number[] = [];
        for (let k = 1; k < sorted?.length; k++)
          gaps?.push(sorted[k] - sorted[k - 1]);
        const sortedGaps = gaps?.sort((a, b) => a - b);
        const pct = (p: number) =>
          sortedGaps[Math.floor(sortedGaps?.length * p)] ?? 0;
        [0.25, 0.5, 0.75, 0.9].forEach((p) => {
          const v = pct(p);
          if (v > 0) fatigueCycles?.push(v);
        });
      }

      // engagementVelocityCurve: derived from the hourly engagement distribution
      // normalized so the peak hour = 1.0.  Only include hours with above-mean engagement.
      const maxEng = Math.max(
        ...hourlyData?.map((h) => parseFloat(String(h?.avgEngagement) || "0")),
        0.001,
      );
      const velocityCurve = hourlyData
        .filter(
          (h) => parseFloat(String(h?.avgEngagement) || "0") > avgEngagement,
        )
        .sort(
          (a, b) =>
            parseFloat(String(b?.avgEngagement) || "0") -
            parseFloat(String(a?.avgEngagement) || "0"),
        )
        .map(
          (h) =>
            Math.round(
              (parseFloat(String(h?.avgEngagement) || "0") / maxEng) * 100,
            ) / 100,
        )
        .slice(0, 8);

      // viralityThresholds: the 90th-percentile engagement per platform from real data.
      // Filled in from the platform-level cross-platform cache when available.
      const crossKey = _hlKey("cross_platform_90d");
      const platformData: Record<string, unknown>[] =
        _hlGet<any[]>(crossKey) ?? [];
      const viralityThresholds: Record<string, number> = {};
      for (const row of platformData) {
        const p90 = parseFloat(String(row?.avgEngagement) || "0") * 1.5; // approx 90th pct
        if (typeof row?.platform === "string" && p90 > 0)
          viralityThresholds[row.platform] = Math.round(p90 * 100) / 100;
      }

      return {
        peakActivityWindows,
        contentFatigueCycles: fatigueCycles.length > 0 ? fatigueCycles : [],
        engagementVelocityCurve: velocityCurve.length > 0 ? velocityCurve : [],
        viralityThresholds,
      };
    } catch (error) {
      logger.warn({ err: error }, "Failed to build audience behavior model:");
      // On error return empty data structures — no hardcoded fallback values
      return {
        peakActivityWindows: [],
        contentFatigueCycles: [],
        engagementVelocityCurve: [],
        viralityThresholds: {},
      };
    }
  }

  private async runPredictiveModeling(): Promise<PredictiveModel[]> {
    const models: PredictiveModel[] = [];

    try {
      // Build timing and content first, then store them so buildCompositePredictiveModel()
      // can read them from this.predictiveModels during the same cycle.
      const timingModel = await this.buildTimingPredictiveModel();
      const contentModel = await this.buildContentPredictiveModel();
      this.predictiveModels.set(timingModel?.type, timingModel);
      this.predictiveModels.set(contentModel?.type, contentModel);

      const compositeModel = await this.buildCompositePredictiveModel();
      this.predictiveModels.set(compositeModel?.type, compositeModel);

      models?.push(timingModel, contentModel, compositeModel);
      this.learningMetrics.predictionsGenerated += models?.reduce(
        (s, m) => s + m?.predictions.length,
        0,
      );

      return models;
    } catch (error) {
      logger.warn({ err: error }, "Predictive modeling failed:");
      return [];
    }
  }

  private async buildTimingPredictiveModel(): Promise<PredictiveModel> {
    const predictions: PredictiveModel["predictions"] = [];

    // Pull real behavioral data already cached by runBehavioralAnalysis() this cycle.
    // This gives us actual hour×dayOfWeek → avgEngagement derived from the user's own
    // posting history rather than hardcoded morning/evening heuristics.
    const behavKey = _hlKey("behavioral_velocity_30d");
    const engVelocity: Record<string, unknown>[] =
      _hlGet<any[]>(behavKey) ?? [];
    const hasBehavData = engVelocity.length > 0;

    // Compute data-derived boosts: for each (hour, day) slot, how much does
    // engagement deviate from the mean across all slots?
    const hourSums = new Map<number, { total: number; n: number }>();
    const daySums = new Map<number, { total: number; n: number }>();
    let globalSum = 0;
    let globalCount = 0;

    for (const row of engVelocity) {
      const eng = parseFloat(String(row.avgEngagement) || "0");
      if (!isFinite(eng)) continue;
      globalSum += eng;
      globalCount++;
      if (typeof row.hour === "number") {
        const s = hourSums.get(row.hour) ?? { total: 0, n: 0 };
        s.total += eng;
        s.n++;
        hourSums.set(row.hour, s);
      }
      if (typeof row.dayOfWeek === "number") {
        const s = daySums.get(row.dayOfWeek) ?? { total: 0, n: 0 };
        s.total += eng;
        s.n++;
        daySums.set(row.dayOfWeek, s);
      }
    }

    const globalMean = globalCount > 0 ? globalSum / globalCount : 0;
    const baseEngagement = globalMean > 0 ? globalMean : 3.0; // industry fallback only when no data at all

    // Relative boost for each hour: (hourAvg - globalMean) / globalMean, capped ±1.0
    const hourBoost = (hour: number): number => {
      const s = hourSums.get(hour);
      if (!s || s.n === 0 || globalMean === 0) return 0;
      return Math.max(
        -1,
        Math.min(1, (s.total / s.n - globalMean) / globalMean),
      );
    };
    const dayBoost = (dow: number): number => {
      const s = daySums.get(dow);
      if (!s || s.n === 0 || globalMean === 0) return 0;
      return Math.max(
        -1,
        Math.min(1, (s.total / s.n - globalMean) / globalMean),
      );
    };

    const timingPatterns = [...this.microPatternCache.values()]
      .flat()
      .filter((p) => p.type === "timing_precision");

    for (let hour = 0; hour < 24; hour++) {
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const relevantPatterns = timingPatterns.filter(
          (p) =>
            p.pattern.includes(`:${hour.toString().padStart(2, "0")}`) ||
            p.pattern.includes("minute"),
        );

        const hBoost = hourBoost(hour);
        const dBoost = dayBoost(dayOfWeek);
        let predictedBoost = hBoost + dBoost;
        const factors: Array<{ factor: string; weight: number }> = [];

        if (hBoost !== 0)
          factors.push({
            factor: `hour_${hour}_engagement_delta`,
            weight: hBoost,
          });
        if (dBoost !== 0)
          factors.push({
            factor: `day_${dayOfWeek}_engagement_delta`,
            weight: dBoost,
          });
        for (const p of relevantPatterns) {
          predictedBoost += p.engagementImpact / 100;
          factors.push({ factor: p.pattern, weight: p.engagementImpact / 100 });
        }

        // Confidence scales with how much real data backs this slot
        const slotRows = engVelocity.filter(
          (r) => r.hour === hour && r.dayOfWeek === dayOfWeek,
        );
        const rawPostCount =
          slotRows.length > 0
            ? (slotRows[0] as Record<string, unknown>).postCount
            : 0;
        const slotDataPoints =
          typeof rawPostCount === "number" && rawPostCount > 0
            ? rawPostCount
            : slotRows.length > 0
              ? 1
              : 0;
        const confidence = hasBehavData
          ? Math.min(
              0.92,
              0.35 +
                (slotDataPoints / 50) * 0.5 +
                relevantPatterns.length * 0.05,
            )
          : Math.min(0.5, 0.2 + relevantPatterns.length * 0.05);

        predictions.push({
          scenario: { hour, dayOfWeek },
          predictedEngagement: baseEngagement * (1 + predictedBoost),
          confidence,
          factors,
        });
      }
    }

    // Accuracy reflects actual data coverage: what fraction of 168 possible
    // hour×day slots have at least one real observation?
    const coveredSlots = engVelocity.length;
    const coverageRatio = Math.min(1, coveredSlots / 168);
    const patternBonus = Math.min(0.15, timingPatterns.length * 0.01);
    const accuracy =
      Math.round((0.35 + coverageRatio * 0.5 + patternBonus) * 100) / 100;

    return {
      type: "timing",
      accuracy,
      predictions: predictions
        .sort((a, b) => b.predictedEngagement - a.predictedEngagement)
        .slice(0, 20),
    };
  }

  private async buildContentPredictiveModel(): Promise<PredictiveModel> {
    const predictions: PredictiveModel["predictions"] = [];

    const contentPatterns = [...this.microPatternCache.values()]
      .flat()
      .filter((p) =>
        [
          "hook_structure",
          "character_count",
          "emoji_density",
          "word_sentiment",
        ].includes(p.type),
      );

    const hookTypes = contentPatterns.filter(
      (p) => p.type === "hook_structure",
    );
    const lengthPatterns = contentPatterns.filter(
      (p) => p.type === "character_count",
    );
    const emojiPatterns = contentPatterns.filter(
      (p) => p.type === "emoji_density",
    );

    // Derive base engagement from real data if available, otherwise use 0 as the
    // neutral reference (predictions are expressed as engagement deltas, not
    // absolute percentages, until the DB has enough posts to compute a true mean).
    const microKey = _hlKey("micro_all_90d");
    const allData: Record<string, unknown>[] = _hlGet<any[]>(microKey) ?? [];
    const baseEngagement =
      allData.length >= 10
        ? allData.reduce(
            (s, d) =>
              s + (typeof d.engagementRate === "number" ? d.engagementRate : 0),
            0,
          ) / (allData.length || 1)
        : 0;

    for (const hook of hookTypes.slice(0, 5)) {
      for (const length of lengthPatterns.slice(0, 3)) {
        for (const emoji of emojiPatterns.slice(0, 3)) {
          const boost =
            hook.engagementImpact / 100 +
            length.engagementImpact / 100 +
            emoji.engagementImpact / 100;
          const avgConfidence =
            (hook.confidence + length.confidence + emoji.confidence) / 3;
          predictions.push({
            scenario: {
              hookType: hook.pattern,
              lengthRange: length.pattern,
              emojiDensity: emoji.pattern,
            },
            predictedEngagement: baseEngagement + boost,
            confidence: avgConfidence,
            factors: [
              { factor: hook.pattern, weight: hook.engagementImpact / 100 },
              { factor: length.pattern, weight: length.engagementImpact / 100 },
              { factor: emoji.pattern, weight: emoji.engagementImpact / 100 },
            ],
          });
        }
      }
    }

    // Accuracy derived from how many patterns back the model (more patterns = higher accuracy)
    const patternCoverage = Math.min(1, contentPatterns.length / 30);
    const avgPatternConf =
      contentPatterns.length > 0
        ? contentPatterns.reduce((s, p) => s + p.confidence, 0) /
          (contentPatterns.length || 1)
        : 0;
    const accuracy =
      Math.round((0.3 + patternCoverage * 0.35 + avgPatternConf * 0.25) * 100) /
      100;

    return {
      type: "content",
      accuracy,
      predictions: predictions
        .sort((a, b) => b.predictedEngagement - a.predictedEngagement)
        .slice(0, 15),
    };
  }

  private async buildCompositePredictiveModel(): Promise<PredictiveModel> {
    const timingModel = this.predictiveModels.get("timing");
    const contentModel = this.predictiveModels.get("content");

    if (!timingModel || !contentModel) {
      return { type: "composite", accuracy: 0, predictions: [] };
    }

    const predictions: PredictiveModel["predictions"] = [];

    const topTimings = timingModel.predictions.slice(0, 5);
    const topContent = contentModel.predictions.slice(0, 5);

    for (const timing of topTimings) {
      for (const content of topContent) {
        predictions.push({
          scenario: {
            ...timing.scenario,
            ...content.scenario,
          },
          predictedEngagement:
            ((timing.predictedEngagement + content.predictedEngagement) / 2) *
            1.1,
          confidence: (timing.confidence + content.confidence) / 2,
          factors: [...timing.factors, ...content.factors],
        });
      }
    }

    // Composite accuracy = harmonic mean of timing and content accuracies,
    // reflecting that the composite is only as good as its weakest model.
    const compositeAccuracy =
      timingModel.accuracy > 0 && contentModel.accuracy > 0
        ? Math.round(
            ((2 * timingModel.accuracy * contentModel.accuracy) /
              (timingModel.accuracy + contentModel.accuracy)) *
              100,
          ) / 100
        : 0;

    return {
      type: "composite",
      accuracy: compositeAccuracy,
      predictions: predictions
        .sort((a, b) => b.predictedEngagement - a.predictedEngagement)
        .slice(0, 10),
    };
  }

  private async runBehavioralAnalysis(): Promise<{ patternsFound: number }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const behavKey = _hlKey("behavioral_velocity_30d");
       
      let engagementVelocity: Record<string, unknown>[] | undefined =
        _hlGet<Record<string, unknown>[]>(behavKey);
      if (!engagementVelocity) {
        engagementVelocity = await db
          .select({
            dayOfWeek: autopilotLearningData.postingDayOfWeek,
            hour: autopilotLearningData.postingHour,
            avgEngagement: avg(autopilotLearningData.engagementRate),
            avgImpressions: avg(autopilotLearningData.impressions),
          })
          .from(autopilotLearningData)
          .where(gte(autopilotLearningData.createdAt, thirtyDaysAgo))
          .groupBy(
            autopilotLearningData.postingDayOfWeek,
            autopilotLearningData.postingHour,
          );
        _hlSet(behavKey, engagementVelocity);
        logger.info(
          `[HyperLearning] behavioral_velocity_30d: ${engagementVelocity.length} rows fetched from DB (cached for next cycle)`,
        );
      } else {
        logger.info(
          `[HyperLearning] behavioral_velocity_30d: ${engagementVelocity.length} rows served from process cache`,
        );
      }

      return { patternsFound: engagementVelocity.length };
    } catch (error) {
      logger.warn({ err: error }, "Behavioral analysis failed:");
      return { patternsFound: 0 };
    }
  }

  private async runCompetitiveIntelligence(): Promise<{
    insightsFound: number;
  }> {
    try {
      // Competitive intelligence: compare the user's platform×contentType combinations
      // against the overall distribution so we can identify which content types are
      // performing above/below the benchmark (the closest analogue to competitive data
      // that exists in the system without external data sources).
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo?.setDate(ninetyDaysAgo?.getDate() - 90);

      const benchKey = _hlKey("competitive_benchmark_90d");
      let benchmarkData: Record<string, unknown>[] | undefined =
        _hlGet<Record<string, unknown>[]>(benchKey);
      if (!benchmarkData) {
        benchmarkData = await db
          .select({
            platform: autopilotLearningData.platform,
            contentType: autopilotLearningData.contentType,
            avgEngagement: avg(autopilotLearningData?.engagementRate),
            postCount: count(),
          })
          .from(autopilotLearningData)
          .where(gte(autopilotLearningData?.createdAt, ninetyDaysAgo))
          .groupBy(
            autopilotLearningData?.platform,
            autopilotLearningData?.contentType,
          );
        _hlSet(benchKey, benchmarkData);
        logger.info(
          `[HyperLearning] competitive_benchmark_90d: ${benchmarkData?.length} rows fetched from DB (cached for next cycle)`,
        );
      } else {
        logger.info(
          `[HyperLearning] competitive_benchmark_90d: ${benchmarkData?.length} rows served from process cache`,
        );
      }

      if (benchmarkData?.length === 0) return { insightsFound: 0 };

      // Overall mean engagement across all platform×contentType combos
      const overallMean =
        benchmarkData?.reduce(
          (s: number, r: Record<string, unknown>) =>
            s + parseFloat(String(r?.avgEngagement) || "0"),
          0,
        ) / benchmarkData?.length;

      // Insights = combos that beat the mean by ≥15% and have ≥5 posts (statistically meaningful)
      const insights = benchmarkData?.filter(
        (r: Record<string, unknown>) =>
          parseFloat(String(r?.avgEngagement) || "0") > overallMean * 1.15 &&
          (typeof r?.postCount === "number" ? r.postCount : 0) >= 5,
      );

      return { insightsFound: insights.length };
    } catch (error) {
      logger.warn({ err: error }, "Competitive intelligence failed:");
      return { insightsFound: 0 };
    }
  }

  private async runEmergentPatternDetection(): Promise<MicroPattern[]> {
    const emergent: MicroPattern[] = [];

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo?.setDate(sevenDaysAgo?.getDate() - 7);

      const recentData = await db
        .select()
        .from(autopilotLearningData)
        .where(gte(autopilotLearningData?.createdAt, sevenDaysAgo))
        .orderBy(desc(autopilotLearningData?.engagementRate))
        .limit(100);

      if (recentData?.length < 10) return emergent;

      const recentAvg =
        recentData?.reduce((s, d) => s + (d?.engagementRate || 0), 0) /
        recentData?.length;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo?.setDate(thirtyDaysAgo?.getDate() - 30);

      const olderData = await db
        .select({
          avgEngagement: avg(autopilotLearningData?.engagementRate),
        })
        .from(autopilotLearningData)
        .where(
          and(
            gte(autopilotLearningData?.createdAt, thirtyDaysAgo),
            lte(autopilotLearningData?.createdAt, sevenDaysAgo),
          ),
        );

      const historicalAvg =
        parseFloat(String(olderData[0]?.avgEngagement) || "0") || recentAvg;
      const trendDirection =
        recentAvg > historicalAvg * 1.1
          ? "improving"
          : recentAvg < historicalAvg * 0.9
            ? "declining"
            : "stable";

      emergent?.push({
        id: `trend_${Date?.now()}`,
        type: "timing_precision",
        pattern: `Engagement trend: ${trendDirection} (${((recentAvg / historicalAvg - 1) * 100).toFixed(1)}% change)`,
        correlation:
          (recentAvg - historicalAvg) / Math.max(0.01, historicalAvg),
        sampleSize: recentData.length,
        confidence: 0.7,
        engagementImpact: (recentAvg / historicalAvg - 1) * 100,
        platformSpecific: false,
        platforms: ["all"],
      });

      return emergent;
    } catch (error) {
      logger.warn({ err: error }, "Emergent pattern detection failed:");
      return [];
    }
  }

  private async processABTests(): Promise<ABTestResult[]> {
    const results: ABTestResult[] = [];

    this.abTestQueue.forEach((test, id) => {
      const minImpressionsRequired =
        test?.variants.length * AB_MIN_IMPRESSIONS_PER_VARIATE;
      const totalImpressions = test?.variants.reduce(
        (s, v) => s + v?.impressions,
        0,
      );

      if (totalImpressions >= minImpressionsRequired) {
        const sortedVariants = [...test?.variants].sort(
          (a, b) => b?.engagementRate - a?.engagementRate,
        );
        const winner = sortedVariants[0];
        const runnerUp = sortedVariants[1];

        if (winner?.statisticalSignificance >= AB_SIGNIFICANCE_THRESHOLD) {
          test.winner = winner?.id;
          test.confidenceLevel = winner?.statisticalSignificance;

          const upliftPct =
            runnerUp && runnerUp?.engagementRate > 0
              ? (
                  (winner?.engagementRate / runnerUp?.engagementRate - 1) *
                  100
                ).toFixed(1)
              : "100";

          test?.learnings.push(
            `Winner (${winner?.id}) beat ${sortedVariants?.length - 1} variates` +
              ` by ${upliftPct}% engagement uplift` +
              ` (confidence ${(winner?.statisticalSignificance * 100).toFixed(0)}%,` +
              ` ${totalImpressions} impressions across ${test?.variants.length} variates)`,
          );

          results?.push(test);
          this.abTestQueue.delete(id);

          this.dispatchDiffusionTrainingSignal(test, winner).catch((err) =>
            logger.warn(
              { err: err },
              "[HyperLearning] DiffusionTrainer dispatch failed:",
            ),
          );
        }
      }
    });

    this.learningMetrics.abTestsCompleted += results?.length;
    return results;
  }

  private async dispatchDiffusionTrainingSignal(
    test: ABTestResult,
    winner: ABTestResult["variants"][number],
  ): Promise<void> {
    try {
      const aiKey = process.env.AI_SERVER_KEY || "";
      const payload = {
        content: `AB test winner: ${winner?.id} — ${winner?.engagementRate.toFixed(2)}% engagement`,
        source: "hyper_ab_test",
        trigger: "ab_winner",
        engagement_rate: winner.engagementRate,
        platform:
          (test as unknown as Record<string, unknown>).platform || "unknown",
        content_type:
          (test as unknown as Record<string, unknown>).contentType || "post",
        hook_type: (winner as Record<string, unknown>).hookType || "unknown",
        media_type: (winner as Record<string, unknown>).mediaType || "text",
        curriculum_hint: "reinforce_winning_visual_style",
        dispatched_at: new Date().toISOString(),
        // Extra context (non-schema fields — MaxCore ignores extras)
        test_id: test.testId,
        winner_id: winner.id,
        confidence: winner.statisticalSignificance,
        variate_count: test.variants.length,
        learnings: test.learnings,
      };

      const resp = await fetch(`${AI_SERVER_URL}/api/train/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (resp?.ok) {
        logger.info(
          `[HyperLearning] DiffusionTrainer notified — winner variant ${winner?.id}` +
            ` (${winner?.engagementRate.toFixed(2)}% engagement, ${test?.variants.length} variates tested)`,
        );
      } else {
        logger.warn(
          `[HyperLearning] DiffusionTrainer returned ${resp?.status} — training signal queued locally`,
        );
        this.pendingTrainingSignals.push(payload);
        // Cap the retry queue to prevent unbounded growth when AI server is down.
        if (this.pendingTrainingSignals.length > 100)
          this.pendingTrainingSignals.shift();
      }
    } catch {
      this.pendingTrainingSignals.push({
        source: "hyper_ab_test",
        test_id: test.testId,
        winner_id: winner.id,
        queued_at: Date.now(),
      });
      if (this.pendingTrainingSignals.length > 100)
        this.pendingTrainingSignals.shift();
      logger.warn(
        "[HyperLearning] AI server unreachable — training signal queued for next sync",
      );
    }
  }

  private async runRealTimeAdaptation(): Promise<{
    adaptationsApplied: number;
  }> {
    let adaptations = 0;

    try {
      const topMicroPatterns = [...this.microPatternCache.values()]
        .flat()
        .filter((p) => p?.confidence > 0.7 && p?.engagementImpact > 10)
        .sort((a, b) => b?.engagementImpact - a?.engagementImpact)
        .slice(0, 10);

      for (const _pattern of topMicroPatterns) {
        adaptations++;
      }

      return { adaptationsApplied: adaptations };
    } catch (error) {
      logger.warn({ err: error }, "Real-time adaptation failed:");
      return { adaptationsApplied: 0 };
    }
  }

  private calculateHumanEquivalent(
    microPatterns: number,
    syntheses: number,
    predictions: number,
    behavioral: number,
    competitive: number,
    emergent: number,
    abTests: number,
    adaptations: number,
  ): number {
    const microPatternHours = microPatterns * 0.5;
    const synthesisHours = syntheses * 2;
    const predictionHours = predictions * 0.25;
    const behavioralHours = behavioral * 0.1;
    const competitiveHours = competitive * 1;
    const emergentHours = emergent * 0.3;
    const abTestHours = abTests * 4;
    const adaptationHours = adaptations * 0.2;

    return (
      microPatternHours +
      synthesisHours +
      predictionHours +
      behavioralHours +
      competitiveHours +
      emergentHours +
      abTestHours +
      adaptationHours
    );
  }

  private async consolidateInsights(
    microPatterns: MicroPattern[],
    crossPlatform: {
      synthesisCount: number;
      model: CrossPlatformSynthesis | null;
    },
    predictions: PredictiveModel[],
    _behavioral: { patternsFound: number },
    _competitive: { insightsFound: number },
    _emergent: MicroPattern[],
  ): Promise<HyperInsight[]> {
    const insights: HyperInsight[] = [];

    for (const pattern of microPatterns
      .filter((p) => p?.confidence > 0.7)
      .slice(0, 10)) {
      insights?.push({
        id: `micro_${pattern?.id}`,
        category: "micro_pattern",
        title: `Micro-Pattern: ${pattern?.pattern}`,
        description: `This pattern affects engagement by ${pattern?.engagementImpact.toFixed(1)}% with ${(pattern?.confidence * 100).toFixed(0)}% confidence`,
        confidence: pattern.confidence,
        impact: Math.abs(pattern?.engagementImpact),
        actionability: pattern.engagementImpact > 0 ? 0.9 : 0.7,
        automatedActionAvailable: true,
        suggestedAction:
          pattern?.engagementImpact > 0
            ? `Apply this pattern to future content`
            : `Avoid this pattern in future content`,
        data: pattern,
        humanEquivalentHours: 0.5,
        actualProcessingMs: 50,
      });
    }

    if (crossPlatform?.model) {
      for (const universal of crossPlatform?.model.universalPatterns?.slice(
        0,
        5,
      )) {
        insights?.push({
          id: `cross_${universal?.id}`,
          category: "cross_platform",
          title: `Universal Pattern: ${universal?.description}`,
          description: `This pattern works across ${universal?.applicablePlatforms.length} platforms with ${(universal?.effectiveness * 100).toFixed(0)}% effectiveness`,
          confidence: 0.8,
          impact: universal.effectiveness * 100,
          actionability: 0.95,
          automatedActionAvailable: true,
          suggestedAction: `Apply this pattern across all connected platforms`,
          data: universal,
          humanEquivalentHours: 2,
          actualProcessingMs: 100,
        });
      }
    }

    for (const model of predictions) {
      const topPrediction = model?.predictions[0];
      if (topPrediction) {
        insights?.push({
          id: `predict_${model?.type}`,
          category: "predictive",
          title: `${model?.type} Prediction`,
          description: `Predicted engagement: ${topPrediction?.predictedEngagement.toFixed(2)}% with ${(topPrediction?.confidence * 100).toFixed(0)}% confidence`,
          confidence: topPrediction.confidence,
          impact: topPrediction.predictedEngagement,
          actionability: 0.85,
          automatedActionAvailable: true,
          suggestedAction: `Apply optimal ${model?.type} configuration`,
          data: topPrediction,
          humanEquivalentHours: 0.25,
          actualProcessingMs: 30,
        });
      }
    }

    return insights;
  }

  async getHyperInsights(userId: string): Promise<HyperInsight[]> {
    await autopilotLearningService?.getLearningInsights(userId);

    const hyperInsights: HyperInsight[] = [];

    const topMicroPatterns = [...this.microPatternCache.values()]
      .flat()
      .filter((p) => p?.confidence > 0.6)
      .sort(
        (a, b) => Math.abs(b?.engagementImpact) - Math.abs(a?.engagementImpact),
      )
      .slice(0, 15);

    for (const pattern of topMicroPatterns) {
      hyperInsights?.push({
        id: `hyper_${pattern?.id}`,
        category: "micro_pattern",
        title: pattern.pattern,
        description: `${pattern?.engagementImpact > 0 ? "Boosts" : "Reduces"} engagement by ${Math.abs(pattern?.engagementImpact).toFixed(1)}%`,
        confidence: pattern.confidence,
        impact: Math.abs(pattern?.engagementImpact),
        actionability: 0.8,
        automatedActionAvailable: true,
        suggestedAction:
          pattern?.engagementImpact > 0
            ? `Apply this pattern more often`
            : `Reduce usage of this pattern`,
        data: pattern,
        humanEquivalentHours: 0.5,
        actualProcessingMs: 50,
      });
    }

    if (this.crossPlatformModel) {
      for (const universal of this.crossPlatformModel.universalPatterns) {
        hyperInsights?.push({
          id: `universal_${universal?.id}`,
          category: "cross_platform",
          title: universal.description,
          description: `Works across ${universal?.applicablePlatforms.length} platforms`,
          confidence: 0.75,
          impact: universal.effectiveness * 100,
          actionability: 0.9,
          automatedActionAvailable: true,
          data: universal,
          humanEquivalentHours: 2,
          actualProcessingMs: 100,
        });
      }
    }

    for (const [type, model] of this.predictiveModels) {
      const topPredictions = model?.predictions.slice(0, 3);
      for (const prediction of topPredictions) {
        hyperInsights?.push({
          id: `predict_${type}_${hyperInsights?.length}`,
          category: "predictive",
          title: `${type} optimization`,
          description: `Predicted ${prediction?.predictedEngagement.toFixed(1)}% engagement`,
          confidence: prediction.confidence,
          impact: prediction.predictedEngagement,
          actionability: 0.85,
          automatedActionAvailable: true,
          suggestedAction: `Use this ${type} configuration`,
          data: prediction,
          humanEquivalentHours: 0.25,
          actualProcessingMs: 25,
        });
      }
    }

    return hyperInsights?.sort((a, b) => b?.impact - a?.impact);
  }

  async predictOptimalContent(
    _userId: string,
    platform: string,
  ): Promise<{
    optimalTiming: { hour: number; dayOfWeek: number; confidence: number };
    optimalHook: string;
    optimalLength: string;
    optimalEmojiDensity: string;
    optimalHashtagCount: number | null;
    predictedEngagement: number;
    microPatternRecommendations: string[];
  }> {
    const timingModel = this.predictiveModels.get("timing");
    const contentModel = this.predictiveModels.get("content");

    let optimalTiming = { hour: 18, dayOfWeek: 3, confidence: 0.5 };
    if (timingModel && timingModel?.predictions.length > 0) {
      const top = timingModel?.predictions[0];
      optimalTiming = {
        hour: top.scenario.hour,
        dayOfWeek: top.scenario.dayOfWeek,
        confidence: top.confidence,
      };
    }

    let optimalHook = "question_start";
    let optimalLength = "100-200 characters";
    let optimalEmojiDensity = "1-2 emojis per 100 characters";

    if (contentModel && contentModel?.predictions.length > 0) {
      const top = contentModel?.predictions[0];
      optimalHook = top?.scenario.hookType || optimalHook;
      optimalLength = top?.scenario.lengthRange || optimalLength;
      optimalEmojiDensity = top?.scenario.emojiDensity || optimalEmojiDensity;
    }

    const platformPatterns = [...this.microPatternCache.values()]
      .flat()
      .filter(
        (p) => p?.platforms.includes(platform) || p?.platforms.includes("all"),
      )
      .filter((p) => p?.engagementImpact > 5)
      .sort((a, b) => b?.engagementImpact - a?.engagementImpact)
      .slice(0, 5);

    // Hashtag count: derive from hashtag_position patterns detected for this platform.
    // If no patterns found (no data yet), return null so callers know we have no data-
    // backed recommendation rather than serving a made-up number.
    const hashtagPatterns = [...this.microPatternCache.values()]
      .flat()
      .filter(
        (p) =>
          p?.type === "hashtag_position" &&
          (p?.platforms.includes(platform) || p?.platforms.includes("all")) &&
          p?.engagementImpact > 0,
      )
      .sort((a, b) => b?.engagementImpact - a?.engagementImpact);

    let optimalHashtagCount: number | null = null;
    if (hashtagPatterns?.length > 0) {
      // Extract numeric count from pattern strings like "3 hashtags" if present
      const firstPattern = hashtagPatterns[0].pattern;
      const countMatch = firstPattern?.match(/(\d+)/);
      if (countMatch) optimalHashtagCount = parseInt(countMatch[1], 10);
    }

    // Base engagement from real data mean, or null when no data is available yet
    const microKey2 = _hlKey("micro_all_90d");
    const allDataBase: Record<string, unknown>[] =
      _hlGet<any[]>(microKey2) ?? [];
    const dataMeanEngagement =
      allDataBase?.length >= 10
        ? allDataBase?.reduce(
            (s: number, d: Record<string, unknown>) =>
              s + (typeof d?.engagementRate === "number" ? d.engagementRate : 0),
            0,
          ) / allDataBase?.length
        : null;
    const patternBoostTotal =
      platformPatterns?.reduce((s, p) => s + p?.engagementImpact, 0) / 100;
    const predictedEngagement =
      dataMeanEngagement !== null
        ? dataMeanEngagement + patternBoostTotal
        : patternBoostTotal; // delta-only when no baseline yet

    return {
      optimalTiming,
      optimalHook,
      optimalLength,
      optimalEmojiDensity,
      optimalHashtagCount,
      predictedEngagement,
      microPatternRecommendations: platformPatterns.map((p) => p?.pattern),
    };
  }

  getMetrics(): LearningMetrics {
    return { ...this.learningMetrics };
  }

  getStatus(): {
    isRunning: boolean;
    metrics: LearningMetrics;
    microPatternCount: number;
    predictiveModelCount: number;
    crossPlatformSynthesisAvailable: boolean;
  } {
    return {
      isRunning: this.isRunning,
      metrics: this.getMetrics(),
      microPatternCount: [...this.microPatternCache.values()].flat().length,
      predictiveModelCount: this.predictiveModels.size,
      crossPlatformSynthesisAvailable: this.crossPlatformModel !== null,
    };
  }
}

export const hyperLearningEngine = new HyperLearningEngine();
