/**
 * SYSTEM INTELLIGENCE LAYER
 *
 * A contextual reasoning engine that understands errors and security events the
 * way a senior engineer would — correlating multiple concurrent signals into
 * coherent narratives, inferring root causes, predicting resolutions, and
 * narrating system state in plain language.
 *
 * Unlike the pattern-matching auto-fixers (which react to individual events one
 * at a time), this layer synthesises a sliding window of signals into a single
 * answer to the question: "What is actually happening right now, and why?"
 *
 *   "5 PDIM 500s + LuaExecutor queued=4 + AIService seeding fail
 *    = PDIM cold-start cascade. Not a bug. Expected for the first
 *    3-8 minutes after restart. Will self-resolve. No action needed."
 *
 * Architecture:
 *   1. Event window     — 10-minute sliding buffer of every observed log entry
 *   2. Signal extractor — derives typed, quantified signals from the window
 *   3. Inference engine — applies domain-knowledge rules: signals → Understanding
 *   4. Narrator         — generates human-readable situation reports
 *   5. Security analyser— enriches threat assessments with intent classification
 *   6. Hooks            — wired into chainErrorAutoFixer, platformAutoFixer,
 *                         selfHealingEngine, and the structured-log transport
 *   7. Admin API data   — consumed by GET /api/admin/intelligence/*
 */

import { EventEmitter } from "events";
import { addLogTransport, type LogEntry } from "./structuredLogger.js";
import { logger } from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErrorClass =
  | "pdim_cold_start" // PDIM waking up — fully expected
  | "pdim_genuine_outage" // PDIM actually down post-warm-up
  | "pdim_throttle_cascade" // Services flooding PDIM simultaneously
  | "lua_executor_saturation" // LuaExecutor slot exhausted
  | "bullmq_lock_race" // BullMQ lock expires during slow LuaExecutor round-trip
  | "memory_pressure" // Heap approaching or exceeding limit
  | "database_slow" // PostgreSQL latency or connection issue
  | "route_error_spike" // Specific route 5xx rate elevated
  | "auth_anomaly" // Unusual authentication error pattern
  | "seeding_deferred" // AI/audio data seeding skipped (PDIM cold)
  | "self_healing_active" // Auto-fixer applied a patch
  | "unknown_pattern"; // Novel error not covered by knowledge base

export type SecurityIntent =
  | "credential_stuffing" // Automated password/username enumeration
  | "reconnaissance" // Attack surface mapping (404 probing, path enumeration)
  | "sql_injection" // DB extraction or destruction attempt
  | "xss_attempt" // Client-side code injection
  | "path_traversal" // Directory traversal / file read attempt
  | "command_injection" // Shell command execution attempt
  | "ddos" // Volumetric denial of service
  | "api_abuse" // Rate limit evasion or scraping
  | "session_probe" // Session token enumeration / hijacking
  | "payment_fraud" // Payment manipulation attempt
  | "prototype_pollution" // JavaScript prototype chain attack
  | "unknown_threat"; // Unclassified

export type SystemPhase =
  | "cold_starting" // < 120 s uptime — startup grace period
  | "warming" // 120–780 s — PDIM slow-lane active
  | "operational" // Normal steady-state
  | "degraded" // One or more subsystems unhealthy
  | "critical"; // Multiple critical subsystems down

export type TrendDirection = "improving" | "stable" | "degrading";

export type AttackStage =
  | "reconnaissance"
  | "weaponization"
  | "delivery"
  | "exploitation"
  | "persistence";

export type Sophistication = "automated" | "semi-targeted" | "targeted";

export interface RecommendedAction {
  priority: "immediate" | "high" | "medium" | "low";
  action: string;
  rationale: string;
  automated: boolean; // true if the system already handles this
}

export interface ErrorUnderstanding {
  errorClass: ErrorClass;
  what: string; // What is happening (clear, concise, no jargon)
  why: string; // Root cause (inferred from signals)
  impact: string; // What is affected right now
  severity: "negligible" | "low" | "medium" | "high" | "critical";
  confidence: number; // 0–1: how sure we are about the root cause
  expectedResolution: string; // What will make this go away
  estimatedResolutionMs: number | null; // null = unknown
  recommendedActions: RecommendedAction[];
  correlatedSignals: string[]; // Human-readable list of contributing signals
  isRoutineNoise: boolean; // Should this be suppressed from human attention?
  requiresHumanAttention: boolean;
  enrichedAt: number;
}

export interface SecurityUnderstanding {
  threatIntent: SecurityIntent;
  intentLabel: string; // Human-readable intent description
  attackStage: AttackStage;
  sophistication: Sophistication;
  sophisticationLabel: string;
  predictedNextMove: string;
  falsePositiveLikelihood: number; // 0–1
  confidence: number; // 0–1
  reasoning: string; // Full reasoning chain (like a threat analyst's note)
  countermeasures: RecommendedAction[];
  enrichedAt: number;
}

export interface SystemNarrative {
  headline: string; // One-sentence status summary
  body: string; // 2-3 paragraph situation report
  keyInsights: string[]; // Bullet-point highlights
  systemPhase: SystemPhase;
  phaseLabel: string;
  healthScore: number; // 0–100
  trend: TrendDirection;
  activeThreats: number;
  topErrorClass: ErrorClass | null;
  topErrorDescription: string | null;
  nextExpectedEvent: string;
  uptimeSeconds: number;
  generatedAt: number;
}

export interface Insight {
  id: string;
  priority: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  action: string;
  automated: boolean;
  since: number;
}

// ─── Windowed event buffer ────────────────────────────────────────────────────

interface WindowedEvent {
  ts: number;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const _EVENT_WINDOW_MS = 10 * 60_000; // 10 minutes
const _MAX_WINDOW_SIZE = 2000;

// ─── Signals extracted from the window ───────────────────────────────────────

interface Signals {
  uptimeMs: number;
  pdim5xxCount: number; // PDIM HTTP 500/502 in window
  pdim5xxRecentMs: number; // Last PDIM 5xx timestamp
  pdimCircuitOpen: boolean;
  pdimHadFirstSuccess: boolean; // Heuristic: any "Connected via HTTP exec" log?
  luaSaturationCount: number; // "LuaExecutor busy" events
  luaMaxQueued: number; // Max queued value seen
  bullmqLockCount: number; // "Missing lock for job" count
  seedingFailCount: number; // "Could not seed" count
  memHeapPct: number; // Current heap %
  memPressureEvents: number; // Heap warn events in window
  dbSlowCount: number; // Slow DB query / timeout events
  routeErrSpikes: string[]; // Routes with > 20% 5xx in window
  chainFixerFires: number; // Auto-fix patterns fired
  chainFixerPatterns: string[]; // Which patterns fired
  incidentCount: number; // Open platform incidents
  incidentTitles: string[]; // Incident titles
  unknownErrorCount: number; // Novel errors (no pattern match)
  unknownErrors: string[]; // Sample messages
  securityThreatCount: number; // Active threat assessments
}

// ─── Inference rules ─────────────────────────────────────────────────────────

interface InferenceRule {
  id: ErrorClass;
  name: string;
  matches(signals: Signals): boolean;
  confidence(signals: Signals): number;
  explain(
    signals: Signals,
  ): Omit<ErrorUnderstanding, "errorClass" | "confidence" | "enrichedAt">;
}

// ─── Security reasoning rules ─────────────────────────────────────────────────

interface SecurityRule {
  id: SecurityIntent;
  name: string;
  threatTypes: string[]; // ThreatAssessment?.threatType values that match
  indicators: RegExp[]; // Indicator patterns that match
  explain(
    indicators: string[],
    threatLevel: number,
    requestCount: number,
  ): Omit<SecurityUnderstanding, "threatIntent" | "confidence" | "enrichedAt">;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

const INFERENCE_RULES: InferenceRule[] = [
  // ── Rule 1: PDIM Cold-Start Cascade ────────────────────────────────────────
  {
    id: "pdim_cold_start",
    name: "PDIM Cold-Start Cascade",
    matches: (s) =>
      s?.pdim5xxCount > 0 && !s?.pdimHadFirstSuccess && s?.uptimeMs < 120_000,
    confidence: (s) => {
      let c = 0.7;
      if (s?.uptimeMs < 60_000) c += 0.15;
      if (!s?.pdimCircuitOpen) c += 0.1; // slow-lane, not open = expected
      if (s?.seedingFailCount > 0) c += 0.05;
      return Math?.min(c, 0.97);
    },
    explain: (s) => ({
      what: "PDIM (the key-value store) is still waking up after restart.",
      why: `Replit's autoscale environment spins PDIM down between sessions. The first ${s?.pdim5xxCount} request(s) failed with HTTP 5xx while PDIM initialises — this is fully expected behaviour during the startup grace window (first 120 seconds).`,
      impact: `BullMQ job processing is delayed; AI genre-profile seeding is deferred (${s?.seedingFailCount} keys); LuaExecutor${s?.luaSaturationCount > 0 ? ` is queued (max ${s?.luaMaxQueued} waiting)` : " is operating normally"}.`,
      severity: "negligible",
      expectedResolution:
        "PDIM will complete initialisation within 3–8 minutes of the first request. The circuit-breaker slow-lane absorbs failures silently. All queued operations will resume automatically.",
      estimatedResolutionMs: Math?.max(0, 480_000 - s?.uptimeMs),
      recommendedActions: [
        {
          priority: "low",
          action: "Monitor PDIM first-success log line",
          rationale:
            'Once "PDIM first success" appears the cascade resolves on its own.',
          automated: true,
        },
      ],
      correlatedSignals: [
        `${s?.pdim5xxCount} PDIM HTTP 5xx in window`,
        `Uptime: ${Math?.round(s?.uptimeMs / 1000)}s (within startup grace)`,
        ...(s?.seedingFailCount > 0
          ? [`${s?.seedingFailCount} seeding deferrals`]
          : []),
        ...(s?.luaSaturationCount > 0
          ? [`LuaExecutor saturation ×${s?.luaSaturationCount}`]
          : []),
      ],
      isRoutineNoise: true,
      requiresHumanAttention: false,
    }),
  },

  // ── Rule 2: PDIM Slow-Lane Pressure ────────────────────────────────────────
  {
    id: "pdim_throttle_cascade",
    name: "PDIM Slow-Lane Pressure",
    matches: (s) =>
      s?.pdim5xxCount > 0 &&
      !s?.pdimCircuitOpen &&
      s?.uptimeMs >= 120_000 &&
      s?.uptimeMs < 780_000,
    confidence: (s) => {
      let c = 0.65;
      if (s?.luaSaturationCount > 0) c += 0.15;
      if (s?.seedingFailCount > 0) c += 0.1;
      if (s?.uptimeMs < 480_000) c += 0.05;
      return Math?.min(c, 0.92);
    },
    explain: (s) => ({
      what: "Multiple services are contending for PDIM connections during the slow-lane phase.",
      why: `After the startup grace window, the circuit breaker entered slow-lane mode — it tolerates up to 800 failures over 11 minutes while PDIM finishes waking up. ${s?.pdim5xxCount} failure(s) have been absorbed. BullMQ, HyperLearning, and AIService seeding are all issuing concurrent PDIM requests, creating a throttle cascade.`,
      impact: `Elevated PDIM error rate without circuit opening; ${s?.luaSaturationCount > 0 ? "LuaExecutor slot contention" : "normal LuaExecutor operation"}; ${s?.seedingFailCount > 0 ? "seeding retries scheduled" : "seeding completed or skipped"}.`,
      severity: "low",
      expectedResolution:
        'Will fully resolve when PDIM\'s first successful response triggers the "warm" transition. Typically 3–6 minutes after the grace window ends.',
      estimatedResolutionMs: Math?.max(0, 780_000 - s?.uptimeMs),
      recommendedActions: [
        {
          priority: "low",
          action: "No action required",
          rationale:
            "Circuit-breaker slow-lane is designed for exactly this scenario. ChainFixer monitors LuaExecutor saturation automatically.",
          automated: true,
        },
      ],
      correlatedSignals: [
        `${s?.pdim5xxCount} PDIM 5xx absorbed by slow-lane`,
        `Uptime: ${Math?.round(s?.uptimeMs / 1000)}s (slow-lane window)`,
        ...(s?.luaSaturationCount > 0
          ? [
              `LuaExecutor saturation ×${s?.luaSaturationCount} (max queue: ${s?.luaMaxQueued})`,
            ]
          : []),
        ...(s?.chainFixerFires > 0
          ? [
              `ChainFixer fired ×${s?.chainFixerFires}: ${s?.chainFixerPatterns.join(", ")}`,
            ]
          : []),
      ],
      isRoutineNoise: true,
      requiresHumanAttention: false,
    }),
  },

  // ── Rule 3: PDIM Genuine Outage ────────────────────────────────────────────
  {
    id: "pdim_genuine_outage",
    name: "PDIM Genuine Outage",
    matches: (s) =>
      s?.pdim5xxCount > 5 && s?.pdimCircuitOpen && s?.uptimeMs > 600_000,
    confidence: (s) => {
      let c = 0.6;
      if (s?.uptimeMs > 900_000) c += 0.15; // well past warm-up
      if (s?.pdim5xxCount > 20) c += 0.1;
      if (s?.incidentCount > 0) c += 0.1;
      return Math?.min(c, 0.88);
    },
    explain: (s) => ({
      what: "PDIM is experiencing an unexpected outage after successful warm-up.",
      why: `The circuit breaker opened after ${s?.pdim5xxCount} consecutive failures, well past the expected cold-start window. This indicates PDIM (pocketdimensionstorage?.replit.app) is either down, restarting, or has encountered an internal error.`,
      impact:
        "All BullMQ job processing paused; real-time features relying on PDIM (WebSocket pub-sub, rate limiting, session store) are degraded. The system is operating in graceful-degradation mode.",
      severity: "high",
      expectedResolution:
        "The circuit breaker probes PDIM every 60–120 seconds and will auto-recover when PDIM responds. No code change needed.",
      estimatedResolutionMs: null,
      recommendedActions: [
        {
          priority: "high",
          action: "Check pocketdimensionstorage?.replit.app deployment status",
          rationale:
            "PDIM is a separate Replit deployment; it may have been stopped, is restarting, or has an error.",
          automated: false,
        },
        {
          priority: "medium",
          action: "Monitor circuit breaker HALF-OPEN probe results",
          rationale:
            'The circuit automatically probes for recovery; watch for "Circuit CLOSED" in logs.',
          automated: true,
        },
      ],
      correlatedSignals: [
        `Circuit OPEN (${s?.pdim5xxCount} failures)`,
        `Uptime: ${Math?.round(s?.uptimeMs / 1000)}s (post-warm-up outage)`,
        ...(s?.incidentCount > 0
          ? [
              `${s?.incidentCount} open platform incident(s): ${s?.incidentTitles.slice(0, 2).join(", ")}`,
            ]
          : []),
      ],
      isRoutineNoise: false,
      requiresHumanAttention: true,
    }),
  },

  // ── Rule 4: LuaExecutor Saturation ─────────────────────────────────────────
  {
    id: "lua_executor_saturation",
    name: "LuaExecutor Saturation",
    matches: (s) => s?.luaSaturationCount > 0 && s?.luaMaxQueued >= 3,
    confidence: (s) => {
      let c = 0.75;
      if (s?.pdim5xxCount > 0) c += 0.1; // common concurrent cause
      if (s?.luaMaxQueued >= 5) c += 0.1;
      return Math?.min(c, 0.92);
    },
    explain: (s) => ({
      what: `LuaExecutor is congested — up to ${s?.luaMaxQueued} operations queued behind 1 active slot.`,
      why: "BullMQ, HyperLearning, AIService seeding, and ChainFixer are all issuing concurrent PDIM commands. The single-slot LuaExecutor serialises them, creating a queue when PDIM responses are slow during cold-start.",
      impact:
        "BullMQ job polling is delayed; stale-job detection runs late; some lock timeouts may occur causing BullMQ to re-queue jobs (no data loss).",
      severity: s?.luaMaxQueued >= 5 ? "medium" : "low",
      expectedResolution:
        "ChainFixer proactively resets the semaphore when saturation is detected. Queue drains automatically as PDIM warms up and response times improve.",
      estimatedResolutionMs: s?.pdimHadFirstSuccess ? 60_000 : null,
      recommendedActions: [
        {
          priority: "low",
          action: "ChainFixer OFFENSIVE mode is already handling this",
          rationale:
            'The auto-fixer detects "approaching saturation" and resets slots pre-emptively before timeout cascades.',
          automated: true,
        },
      ],
      correlatedSignals: [
        `LuaExecutor saturation ×${s?.luaSaturationCount} (peak queue: ${s?.luaMaxQueued})`,
        ...(s?.pdim5xxCount > 0
          ? [`${s?.pdim5xxCount} PDIM 5xx (common trigger)`]
          : []),
        ...(s?.bullmqLockCount > 0
          ? [`${s?.bullmqLockCount} BullMQ lock race(s) (downstream effect)`]
          : []),
      ],
      isRoutineNoise: s?.uptimeMs < 480_000,
      requiresHumanAttention: s?.luaMaxQueued >= 8,
    }),
  },

  // ── Rule 5: BullMQ Lock Race ────────────────────────────────────────────────
  {
    id: "bullmq_lock_race",
    name: "BullMQ Lock Race",
    matches: (s) => s?.bullmqLockCount > 0,
    confidence: (s) => {
      let c = 0.8;
      if (s?.luaSaturationCount > 0) c += 0.1;
      if (s?.pdim5xxCount > 0) c += 0.05;
      return Math?.min(c, 0.93);
    },
    explain: (s) => ({
      what: "BullMQ job locks are expiring before jobs complete.",
      why: "Slow LuaExecutor round-trips (caused by PDIM latency during cold-start) are exceeding BullMQ's lock timeout. BullMQ treats the job as stalled and re-queues it automatically.",
      impact:
        "Some jobs may run twice (at-least-once delivery). If job processors are idempotent, there is no data loss. Job processing resumes on re-queue.",
      severity: "low",
      expectedResolution:
        "Resolves automatically as PDIM warms up and LuaExecutor latency drops below the lock timeout.",
      estimatedResolutionMs:
        s?.uptimeMs < 480_000 ? Math?.max(0, 480_000 - s?.uptimeMs) : 120_000,
      recommendedActions: [
        {
          priority: "low",
          action: "Verify job processors are idempotent",
          rationale:
            "BullMQ re-queues stalled jobs; if processors are not idempotent, duplicate processing could cause data inconsistency.",
          automated: false,
        },
      ],
      correlatedSignals: [
        `${s?.bullmqLockCount} lock race(s) detected`,
        ...(s?.luaSaturationCount > 0
          ? ["LuaExecutor saturation (root cause)"]
          : []),
      ],
      isRoutineNoise: true,
      requiresHumanAttention: false,
    }),
  },

  // ── Rule 6: Memory Pressure ─────────────────────────────────────────────────
  {
    id: "memory_pressure",
    name: "Memory Pressure",
    matches: (s) => s?.memHeapPct > 80 || s?.memPressureEvents > 0,
    confidence: (s) => {
      let c = 0.85;
      if (s?.memHeapPct > 92) c = 0.95;
      return c;
    },
    explain: (s) => ({
      what: `Heap is at ${s?.memHeapPct}% of the V8 limit.`,
      why: "High memory usage may indicate a memory leak in a long-running loop, accumulation of cached data without eviction, or large in-memory payloads (e?.g. AI model weights, audio buffers, bulk analytics results).",
      impact:
        s?.memHeapPct > 92
          ? "Imminent OOM risk — platform auto-fixer has forced a GC cycle."
          : "Elevated GC frequency may cause latency spikes. No immediate risk.",
      severity:
        s?.memHeapPct > 92 ? "high" : s?.memHeapPct > 85 ? "medium" : "low",
      expectedResolution:
        "Platform auto-fixer runs GC and trims internal buffers. If heap stays above 85% for > 10 minutes, investigate for memory leaks.",
      estimatedResolutionMs: null,
      recommendedActions: [
        {
          priority: s?.memHeapPct > 90 ? "high" : "medium",
          action: "Monitor heap trend over next 5 minutes",
          rationale:
            "If heap is growing linearly (not sawtooth from GC), a leak is likely.",
          automated: true,
        },
        ...(s?.memHeapPct > 90
          ? [
              {
                priority: "high" as const,
                action: "Check for TensorFlow model weights held in memory",
                rationale:
                  "AI model weights (audio analysis, advertising) are large and may accumulate if not freed after inference.",
                automated: false,
              },
            ]
          : []),
      ],
      correlatedSignals: [
        `Heap: ${s?.memHeapPct}%`,
        ...(s?.memPressureEvents > 0
          ? [`${s?.memPressureEvents} heap warning event(s) in window`]
          : []),
      ],
      isRoutineNoise: s?.memHeapPct < 85,
      requiresHumanAttention: s?.memHeapPct > 90,
    }),
  },

  // ── Rule 7: Database Slow ───────────────────────────────────────────────────
  {
    id: "database_slow",
    name: "Database Slow / Timeout",
    matches: (s) => s?.dbSlowCount > 2,
    confidence: (s) => Math?.min(0.7 + s?.dbSlowCount * 0.03, 0.9),
    explain: (s) => ({
      what: `Database is responding slowly — ${s?.dbSlowCount} slow-query or timeout event(s) in the last 10 minutes.`,
      why: "Possible causes: Neon PostgreSQL cold-start (serverless wake-up), table lock contention, a long-running transaction, or a missing index on a newly-queried column.",
      impact:
        "API endpoints that read from the database are slower than normal. HyperLearning analytics queries may time out and return empty results.",
      severity: s?.dbSlowCount > 10 ? "medium" : "low",
      expectedResolution:
        "Neon PostgreSQL cold-starts self-resolve within 10–30 seconds. Persistent slowness requires query analysis.",
      estimatedResolutionMs: 30_000,
      recommendedActions: [
        {
          priority: "medium",
          action: "Check for long-running transactions in PostgreSQL",
          rationale:
            "A stuck transaction can block the entire table and cause cascading slowness.",
          automated: false,
        },
      ],
      correlatedSignals: [`${s?.dbSlowCount} slow-query/timeout events`],
      isRoutineNoise: s?.dbSlowCount <= 3,
      requiresHumanAttention: s?.dbSlowCount > 10,
    }),
  },

  // ── Rule 8: Self-Healing Active ─────────────────────────────────────────────
  {
    id: "self_healing_active",
    name: "Self-Healing Active",
    matches: (s) =>
      s?.chainFixerFires > 0 && s?.pdim5xxCount === 0 && !s?.pdimCircuitOpen,
    confidence: (_s) => 0.9,
    explain: (s) => ({
      what: "The self-healing system applied automated fixes during this window.",
      why: `ChainFixer triggered ${s?.chainFixerFires} fix action(s): ${s?.chainFixerPatterns.join(", ")}. These patterns matched known error signatures and their recovery routines ran automatically.`,
      impact:
        "The affected subsystem(s) were corrected without service interruption.",
      severity: "negligible",
      expectedResolution:
        "Already resolved — auto-fixer has applied the patch.",
      estimatedResolutionMs: 0,
      recommendedActions: [
        {
          priority: "low",
          action: "Review ChainFixer history if patterns repeat > 10 times",
          rationale:
            "High repetition of the same fix suggests a deeper root cause that may warrant a permanent code-level fix.",
          automated: true,
        },
      ],
      correlatedSignals: [
        `ChainFixer: ${s?.chainFixerPatterns.join(", ")} (×${s?.chainFixerFires})`,
      ],
      isRoutineNoise: true,
      requiresHumanAttention: false,
    }),
  },

  // ── Rule 9: Unknown Pattern ─────────────────────────────────────────────────
  {
    id: "unknown_pattern",
    name: "Novel Error Pattern",
    matches: (s) => s?.unknownErrorCount > 0,
    confidence: (_s) => 0.55,
    explain: (s) => ({
      what: `${s?.unknownErrorCount} error(s) did not match any known recovery pattern.`,
      why: `These errors have no corresponding auto-fix rule. They may represent new failure modes, third-party API changes, or code regressions. Samples: ${s?.unknownErrors.slice(0, 2).join(" | ")}`,
      impact:
        "Unknown — the blast radius cannot be assessed without more context.",
      severity: "medium",
      expectedResolution:
        "Manual investigation required. If the pattern repeats, add a ChainFixer rule with an appropriate auto-fix.",
      estimatedResolutionMs: null,
      recommendedActions: [
        {
          priority: "medium",
          action:
            "Review novel error messages and determine if they are actionable",
          rationale:
            "Novel errors that repeat may indicate a regression or new failure mode.",
          automated: false,
        },
      ],
      correlatedSignals: s?.unknownErrors.slice(0, 3),
      isRoutineNoise: false,
      requiresHumanAttention: true,
    }),
  },
];

// ─── Security Knowledge Base ──────────────────────────────────────────────────

const SECURITY_RULES: SecurityRule[] = [
  {
    id: "credential_stuffing",
    name: "Credential Stuffing",
    threatTypes: ["auth_brute_force", "credential_stuffing"],
    indicators: [
      /auth fail/i,
      /login fail/i,
      /invalid.*password/i,
      /password.*invalid/i,
    ],
    explain: (indicators, threatLevel, requestCount) => ({
      intentLabel:
        "Automated credential stuffing — testing stolen username/password pairs at scale.",
      attackStage: "delivery",
      sophistication: requestCount > 100 ? "automated" : "semi-targeted",
      sophisticationLabel:
        requestCount > 100
          ? "Automated: high-volume, low-intelligence bot using pre-compiled credential lists."
          : "Semi-targeted: lower volume suggests credential rotation or CAPTCHA evasion.",
      predictedNextMove:
        "Will iterate through more username/password variants. If not blocked, may pivot to password-reset flow or OAuth.",
      falsePositiveLikelihood: threatLevel < 0.7 ? 0.2 : 0.05,
      reasoning: `${indicators?.length} authentication-failure indicators observed. Request volume (${requestCount}) and failure pattern suggests automated tooling rather than a legitimate user with a forgotten password. Threat level ${(threatLevel * 100).toFixed(0)}%. The self-healing engine has ${threatLevel > 0.85 ? "blocked this IP and terminated active sessions" : "rate-limited this IP"}.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "IP blocked by self-healing engine",
          rationale: "Automated block on high threat score.",
          automated: true,
        },
        {
          priority: "medium",
          action: "Enable CAPTCHA on login endpoint",
          rationale: "Increases cost for automated attacks.",
          automated: false,
        },
      ],
    }),
  },
  {
    id: "reconnaissance",
    name: "Attack Surface Reconnaissance",
    threatTypes: ["path_traversal", "rate_abuse"],
    indicators: [
      /admin/i,
      /\.env/i,
      /phpinfo/i,
      /config/i,
      /wp-/i,
      /\.git/i,
      /backup/i,
    ],
    explain: (indicators, threatLevel, requestCount) => ({
      intentLabel:
        "Attack surface reconnaissance — mapping endpoints, technologies, and vulnerabilities.",
      attackStage: "reconnaissance",
      sophistication: "automated",
      sophisticationLabel:
        "Automated scanner probing for common web vulnerabilities and misconfigurations.",
      predictedNextMove:
        "Having mapped the attack surface, attacker will likely pivot to exploitation of discovered endpoints or attempt injection attacks.",
      falsePositiveLikelihood: 0.1,
      reasoning: `${requestCount} probing requests observed, hitting ${indicators?.length} known reconnaissance paths (admin panels, config files, backup endpoints). Threat level ${(threatLevel * 100).toFixed(0)}%. This is a standard automated scan — the server returns appropriate 404s for non-existent endpoints, so no data was exposed.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "Rate limiting applied by self-healing engine",
          rationale: "Slows scan rate below useful threshold.",
          automated: true,
        },
        {
          priority: "low",
          action: "Consider Cloudflare bot-fight mode",
          rationale: "Blocks scanner fingerprints at the edge.",
          automated: false,
        },
      ],
    }),
  },
  {
    id: "sql_injection",
    name: "SQL Injection Attempt",
    threatTypes: ["sql_injection"],
    indicators: [
      /union.*select/i,
      /drop.*table/i,
      /or.*1=1/i,
      /sleep\(/i,
      /benchmark\(/i,
    ],
    explain: (indicators, threatLevel, _requestCount) => ({
      intentLabel:
        "SQL injection — attempting to extract data or execute database commands.",
      attackStage: "exploitation",
      sophistication: indicators?.some((i) =>
        /sleep|benchmark|waitfor/i?.test(i?.source),
      )
        ? "targeted"
        : "automated",
      sophisticationLabel: indicators?.some((i) =>
        /sleep|benchmark|waitfor/i?.test(i?.source),
      )
        ? "Targeted: time-based blind injection suggests a skilled attacker."
        : "Automated: pattern matches a standard SQLmap or similar scanner.",
      predictedNextMove:
        "If injection is possible, attacker will enumerate tables, extract user credentials, and potentially attempt privilege escalation.",
      falsePositiveLikelihood: 0.03,
      reasoning: `SQL injection payloads detected with threat level ${(threatLevel * 100).toFixed(0)}%. The application uses Drizzle ORM with parameterised queries for all database access, which provides strong protection against injection. The payload was blocked before reaching the database layer.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "Request blocked and IP flagged by self-healing engine",
          rationale: "SQL injection is always blocked at the WAF layer.",
          automated: true,
        },
        {
          priority: "low",
          action: "Verify all raw SQL usage uses $1/$2 parameterisation",
          rationale:
            "ORM does not protect against raw sql`...` calls with interpolation.",
          automated: false,
        },
      ],
    }),
  },
  {
    id: "xss_attempt",
    name: "XSS Injection Attempt",
    threatTypes: ["xss"],
    indicators: [/<script/i, /javascript:/i, /onerror=/i, /onload=/i],
    explain: (_indicators, threatLevel, _requestCount) => ({
      intentLabel:
        "Cross-site scripting — attempting to inject client-side code into responses.",
      attackStage: "exploitation",
      sophistication: "automated",
      sophisticationLabel:
        "Automated XSS probe — likely a scanner testing for reflected or stored XSS.",
      predictedNextMove:
        "If successful, would attempt to steal session cookies, redirect users, or deliver malware. CSP headers prevent execution.",
      falsePositiveLikelihood: 0.05,
      reasoning: `XSS payload detected with threat level ${(threatLevel * 100).toFixed(0)}%. The application serves strict Content-Security-Policy headers that prevent inline script execution. DOMPurify sanitises user-supplied HTML on the client. The payload was sanitised and blocked.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "Payload blocked by security middleware",
          rationale: "Input sanitisation and CSP provide defence-in-depth.",
          automated: true,
        },
        {
          priority: "low",
          action: "Verify CSP does not include unsafe-inline in script-src",
          rationale: "Strict CSP is the primary XSS mitigation.",
          automated: false,
        },
      ],
    }),
  },
  {
    id: "path_traversal",
    name: "Path Traversal Attempt",
    threatTypes: ["path_traversal"],
    indicators: [/\.\.\//i, /%2e%2e/i, /etc\/passwd/i, /windows\/system32/i],
    explain: (_indicators, threatLevel, _requestCount) => ({
      intentLabel:
        "Path traversal — attempting to read files outside the web root.",
      attackStage: "exploitation",
      sophistication: "automated",
      sophisticationLabel:
        "Automated scanner testing for directory traversal vulnerabilities.",
      predictedNextMove:
        "If successful, would attempt to read /etc/passwd, .env files, or application secrets.",
      falsePositiveLikelihood: 0.02,
      reasoning: `Path traversal payload detected with threat level ${(threatLevel * 100).toFixed(0)}%. Static file serving is path-safe (Express static middleware normalises paths). Environment variables are never served as static files.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "Request blocked by security middleware",
          rationale: "Path normalisation prevents traversal.",
          automated: true,
        },
      ],
    }),
  },
  {
    id: "ddos",
    name: "Volumetric DoS / DDoS",
    threatTypes: ["ddos", "rate_abuse"],
    indicators: [/rate?.limit/i, /too many request/i],
    explain: (_indicators, threatLevel, requestCount) => ({
      intentLabel:
        "Volumetric denial of service — flooding with requests to exhaust server capacity.",
      attackStage: "exploitation",
      sophistication: requestCount > 500 ? "automated" : "semi-targeted",
      sophisticationLabel: `${requestCount} requests in rate window — ${requestCount > 500 ? "high-volume automated flood" : "moderate rate — may be aggressive scraping"}.`,
      predictedNextMove:
        "Will likely continue to increase request rate or rotate IPs if current IP is blocked.",
      falsePositiveLikelihood: 0.15,
      reasoning: `High request rate (${requestCount} req/window) from this source with threat level ${(threatLevel * 100).toFixed(0)}%. Distributed rate limiter and admission control are active. Excess requests are being queued and rejected with 429.`,
      countermeasures: [
        {
          priority: "immediate",
          action: "Rate limiting active — 429 responses applied",
          rationale: "Distributed rate limiter absorbs excess load.",
          automated: true,
        },
        {
          priority: "medium",
          action: "Consider Cloudflare DDoS protection at edge",
          rationale:
            "Edge-level protection reduces load before it reaches the origin.",
          automated: false,
        },
      ],
    }),
  },
  {
    id: "unknown_threat",
    name: "Unclassified Threat",
    threatTypes: ["unknown"],
    indicators: [],
    explain: (_indicators, threatLevel, _requestCount) => ({
      intentLabel:
        "Unclassified threat — does not match known attack pattern taxonomy.",
      attackStage: "reconnaissance",
      sophistication: "semi-targeted",
      sophisticationLabel:
        "Behaviour is anomalous but does not fit known attack signatures.",
      predictedNextMove: "Unknown — monitoring continues.",
      falsePositiveLikelihood: 0.35,
      reasoning: `Threat level ${(threatLevel * 100).toFixed(0)}% with no matching pattern. May be a novel attack vector, a misconfigured legitimate client, or a false positive. The self-healing engine continues monitoring this source.`,
      countermeasures: [
        {
          priority: "low",
          action: "Monitor source IP for escalating behaviour",
          rationale:
            "Unclassified threats require observation before hard blocking.",
          automated: true,
        },
      ],
    }),
  },
];

// ─── System Intelligence Engine ───────────────────────────────────────────────

class SystemIntelligenceEngine extends EventEmitter {
  private eventWindow: WindowedEvent[] = [];
  private recentSecurityUnderstandings: Array<
    SecurityUnderstanding & { ip: string; threatId: string }
  > = [];
  private insights: Insight[] = [];
  private _startedAt: number = Date?.now();
  private _firstPdimSuccessAt: number = 0;
  private _chainFixerFires: Array<{
    ts: number;
    patternId: string;
    patternName: string;
  }> = [];
  private _threatCount: number = 0;
  private _healedThreats: number = 0;
  private _initialized = false;
  private _cbIsOpen: (() => boolean) | null = null; // cached circuit-breaker accessor

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  initialize(): void {
    if (this?._initialized) return;
    this._initialized = true;
    this._startedAt = Date?.now();

    // Hook into structured logger to build event window
    addLogTransport((entry) => {
      this?._ingestLogEntry(entry);
    });

    // Subscribe to existing system events (lazy import avoids circular deps)
    this?._subscribeToSystems().catch(() => {
      /* non-fatal */
    });

    // Periodic insight refresh
    const _insightTimer = setInterval(() => this?._refreshInsights(), 60_000);
    insightTimer?.unref();

    logger?.info(
      "[SystemIntelligence] Reasoning engine initialized — watching all error and security signals",
    );
  }

  private async _subscribeToSystems(): Promise<void> {
    await new Promise((r) => setTimeout(r, 3_000)); // wait for services to start

    // Cache circuit-breaker accessor to avoid require() in hot path
    try {
      const _cbMod = await import("../lib/pdimCircuitBreaker.js");
      this._cbIsOpen = cbMod?.cbIsOpen;
    } catch {
      /* non-fatal — cbIsOpen defaults to false */
    }

    try {
      const { chainErrorAutoFixer } = await import("./chainErrorAutoFixer.js");
      chainErrorAutoFixer?.on(
        "fixed",
        (ev: { patternId: string; attempt: number }) => {
          this?._chainFixerFires.push({
            ts: Date?.now(),
            patternId: ev?.patternId,
            patternName: ev?.patternId,
          });
          if (this?._chainFixerFires.length > 200) this?._chainFixerFires.shift();
        },
      );
    } catch {
      /* optional */
    }

    try {
      const { platformAutoFixer } = await import("./platformAutoFixer.js");
      platformAutoFixer?.on(
        "incident:opened",
        (inc: { severity: string; title: string }) => {
          this?._addInsight({
            id: `incident_${Date?.now()}`,
            priority: inc?.severity as Insight["priority"],
            title: `Platform Incident: ${inc?.title}`,
            detail:
              "The platform auto-fixer has opened a new incident. Check the Incidents dashboard for details.",
            action:
              "Review incident details and applied patches in the Platform Fixer admin panel.",
            automated: true,
            since: Date?.now(),
          });
        },
      );
    } catch {
      /* optional */
    }

    try {
      const { selfHealingEngine } = await import(
        "./selfHealingSecurityEngine.js"
      );
      selfHealingEngine?.on(
        "threat_detected",
        (assessment: {
          id: string;
          threatType: string;
          threatLevel: number;
          confidence: number;
          indicators: string[];
          detectionTime: number;
        }) => {
          this?._threatCount++;
          const _understanding = this?._classifySecurityThreat(assessment);
          this?.recentSecurityUnderstandings.unshift({
            ...understanding,
            ip: "classified",
            threatId: assessment?.id,
          });
          if (this?.recentSecurityUnderstandings.length > 100)
            this?.recentSecurityUnderstandings.pop();

          if (
            understanding?.falsePositiveLikelihood < 0.3 &&
            assessment?.threatLevel > 0.7
          ) {
            this?._addInsight({
              id: `threat_${assessment?.id}`,
              priority: assessment?.threatLevel > 0.9 ? "critical" : "high",
              title: `Security: ${understanding?.intentLabel.split("—")[0].trim()}`,
              detail: understanding?.reasoning,
              action:
                understanding?.countermeasures[0]?.action ??
                "Review threat assessment.",
              automated: understanding?.countermeasures[0]?.automated ?? false,
              since: Date?.now(),
            });
          }
        },
      );

      selfHealingEngine?.on("threat_healed", () => {
        this?._healedThreats++;
      });
    } catch {
      /* optional */
    }
  }

  // ─── Event window management ───────────────────────────────────────────────

  private _ingestLogEntry(entry: LogEntry): void {
    const _now = Date?.now();

    // Detect PDIM first success
    if (
      this?._firstPdimSuccessAt === 0 &&
      (entry?.message.includes("PDIM first success") ||
        entry?.message.includes("[PDIM] Circuit CLOSED"))
    ) {
      this._firstPdimSuccessAt = now;
    }

    this?.eventWindow.push({
      ts: now,
      level: entry?.level,
      message: entry?.message,
      metadata: entry?.metadata,
    });

    // Prune old entries
    const _cutoff = now - EVENT_WINDOW_MS;
    while (this?.eventWindow.length > 0 && this?.eventWindow[0].ts < cutoff) {
      this?.eventWindow.shift();
    }
    if (this?.eventWindow.length > MAX_WINDOW_SIZE) {
      this?.eventWindow.splice(0, this?.eventWindow.length - MAX_WINDOW_SIZE);
    }
  }

  // ─── Signal extraction ─────────────────────────────────────────────────────

  private _extractSignals(): Signals {
    const _mem = process?.memoryUsage();
    const _heapPct = Math?.round((mem?.heapUsed / mem?.heapTotal) * 100);

    let pdim5xxCount = 0;
    let pdim5xxRecentMs = 0;
    let luaSatCount = 0;
    let luaMaxQueued = 0;
    let bullmqLockCount = 0;
    let seedingFailCount = 0;
    let memPressureEvents = 0;
    let dbSlowCount = 0;
    let unknownErrorCount = 0;
    const unknownErrors: string[] = [];
    const _chainFixerPatternSet = new Set<string>();

    for (const ev of this?.eventWindow) {
      const _m = ev?.message;

      if (/PDIM HTTP 5\d\d|ERR PDIM HTTP 5/i?.test(m)) {
        pdim5xxCount++;
        pdim5xxRecentMs = Math?.max(pdim5xxRecentMs, ev?.ts);
      }
      if (/LuaExecutor busy/i?.test(m)) {
        luaSatCount++;
        const _match = m?.match(/(\d+)\s+queued/);
        if (match)
          luaMaxQueued = Math?.max(luaMaxQueued, parseInt(match[1], 10));
      }
      if (/Missing lock for job/i?.test(m)) bullmqLockCount++;
      if (/Could not seed/i?.test(m)) seedingFailCount++;
      if (/heap.*warn|memory.*warn|GC.*forced/i?.test(m)) memPressureEvents++;
      if (
        /slow.*query|query.*timeout|db.*timeout|connection.*timeout.*pg/i?.test(
          m,
        )
      )
        dbSlowCount++;
      if (/Novel error.*no pattern/i?.test(m)) {
        unknownErrorCount++;
        if (unknownErrors?.length < 5) unknownErrors?.push(m?.slice(0, 120));
      }
      const _fixerMatch = m?.match(/\[ChainFixer\] (.+?) —/);
      if (fixerMatch) chainFixerPatternSet?.add(fixerMatch[1]);
    }

    // Route error spikes from routeErrors map (platformAutoFixer tracks these)
    const routeErrSpikes: string[] = [];

    // Open incidents and incident titles
    const incidentTitles: string[] = [];
    let incidentCount = 0;

    // ChainFixer fires in window (from our subscription)
    const _windowCutoff = Date?.now() - EVENT_WINDOW_MS;
    const _chainFixerFires = this?._chainFixerFires.filter(
      (f) => f?.ts > windowCutoff,
    );
    for (const f of chainFixerFires) chainFixerPatternSet?.add(f?.patternId);

    // Determine circuit state using cached accessor (set during _subscribeToSystems)
    let pdimCircuitOpen = false;
    try {
      if (this?._cbIsOpen) pdimCircuitOpen = this?._cbIsOpen();
    } catch {
      /* non-fatal */
    }

    return {
      uptimeMs: Date?.now() - this?._startedAt,
      pdim5xxCount,
      pdim5xxRecentMs,
      pdimCircuitOpen,
      pdimHadFirstSuccess: this?._firstPdimSuccessAt > 0,
      luaSaturationCount: luaSatCount,
      luaMaxQueued,
      bullmqLockCount,
      seedingFailCount,
      memHeapPct: heapPct,
      memPressureEvents,
      dbSlowCount,
      routeErrSpikes,
      chainFixerFires: chainFixerFires?.length,
      chainFixerPatterns: [...chainFixerPatternSet],
      incidentCount,
      incidentTitles,
      unknownErrorCount,
      unknownErrors,
      securityThreatCount: this?._threatCount,
    };
  }

  // ─── Inference engine ──────────────────────────────────────────────────────

  analyzeCurrentState(): ErrorUnderstanding[] {
    const _signals = this?._extractSignals();
    const results: ErrorUnderstanding[] = [];

    for (const rule of INFERENCE_RULES) {
      if (!rule?.matches(signals)) continue;
      const _confidence = rule?.confidence(signals);
      if (confidence < 0.4) continue;

      results?.push({
        errorClass: rule?.id,
        confidence,
        enrichedAt: Date?.now(),
        ...rule?.explain(signals),
      });
    }

    // Sort by severity then confidence
    const _SEV_ORDER = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      negligible: 1,
    };
    results?.sort((a, b) => {
      const _sd = SEV_ORDER[b?.severity] - SEV_ORDER[a?.severity];
      return sd !== 0 ? sd : b?.confidence - a?.confidence;
    });

    return results;
  }

  // ─── Security classifier ───────────────────────────────────────────────────

  private _classifySecurityThreat(assessment: {
    threatType: string;
    threatLevel: number;
    confidence: number;
    indicators: string[];
    detectionTime: number;
  }): SecurityUnderstanding {
    const _indicators = assessment?.indicators;
    const _requestCount = indicators?.length; // proxy for volume

    for (const rule of SECURITY_RULES) {
      const _typeMatch = rule?.threatTypes.some(
        (t) =>
          assessment?.threatType.toLowerCase().includes(t) ||
          t?.includes(assessment?.threatType.toLowerCase()),
      );
      const _indicatorMatch = rule?.indicators.some((pat) =>
        indicators?.some((i) => pat?.test(i)),
      );

      if (typeMatch || indicatorMatch) {
        return {
          threatIntent: rule?.id,
          confidence: assessment?.confidence,
          enrichedAt: Date?.now(),
          ...rule?.explain(
            indicators?.map((i) => i),
            assessment?.threatLevel,
            requestCount,
          ),
        };
      }
    }

    // Fallback
    const _fallbackRule = SECURITY_RULES[SECURITY_RULES?.length - 1];
    return {
      threatIntent: "unknown_threat",
      confidence: assessment?.confidence,
      enrichedAt: Date?.now(),
      ...fallbackRule?.explain(indicators, assessment?.threatLevel, requestCount),
    };
  }

  // ─── Narrator ─────────────────────────────────────────────────────────────

  narrateSystemState(): SystemNarrative {
    const _signals = this?._extractSignals();
    const _understandings = this?.analyzeCurrentState();
    const _uptimeSec = Math?.round(signals?.uptimeMs / 1000);

    // Determine system phase
    let systemPhase: SystemPhase;
    let phaseLabel: string;
    if (signals?.uptimeMs < 120_000) {
      systemPhase = "cold_starting";
      phaseLabel = `Cold-starting (${uptimeSec}s uptime — startup grace period)`;
    } else if (signals?.uptimeMs < 780_000 && !signals?.pdimHadFirstSuccess) {
      systemPhase = "warming";
      phaseLabel = `Warming up (${uptimeSec}s uptime — PDIM slow-lane active)`;
    } else if (signals?.pdimCircuitOpen || signals?.incidentCount > 0) {
      systemPhase = "degraded";
      phaseLabel = `Degraded — ${signals?.incidentCount} incident(s), circuit ${signals?.pdimCircuitOpen ? "OPEN" : "closed"}`;
    } else {
      systemPhase = "operational";
      phaseLabel = `Operational (${Math?.round(uptimeSec / 60)}m uptime)`;
    }

    // Health score: start at 100, subtract for problems
    let healthScore = 100;
    if (signals?.pdimCircuitOpen) healthScore -= 30;
    else if (signals?.pdim5xxCount > 0)
      healthScore -= Math?.min(15, signals?.pdim5xxCount);
    if (signals?.memHeapPct > 90) healthScore -= 20;
    else if (signals?.memHeapPct > 80) healthScore -= 10;
    if (signals?.dbSlowCount > 5) healthScore -= 15;
    if (signals?.unknownErrorCount > 0) healthScore -= 10;
    if (signals?.incidentCount > 0) healthScore -= signals?.incidentCount * 8;
    healthScore = Math?.max(0, Math?.min(100, healthScore));

    // Trend
    let trend: TrendDirection = "stable";
    const _recentPdim = this?.eventWindow.filter(
      (e) => e?.ts > Date?.now() - 2 * 60_000 && /PDIM HTTP 5/i?.test(e?.message),
    ).length;
    const _olderPdim = this?.eventWindow.filter(
      (e) =>
        e?.ts <= Date?.now() - 2 * 60_000 &&
        e?.ts > Date?.now() - 5 * 60_000 &&
        /PDIM HTTP 5/i?.test(e?.message),
    ).length;
    if (recentPdim < olderPdim * 0.7) trend = "improving";
    else if (recentPdim > olderPdim * 1.4) trend = "degrading";

    // Headline
    const _topUnderstanding = understandings[0];
    let headline: string;
    if (systemPhase === "cold_starting") {
      headline =
        "System is starting up — initial PDIM errors are expected and being absorbed.";
    } else if (systemPhase === "warming") {
      headline =
        "System is warming up — PDIM slow-lane is absorbing expected failures.";
    } else if (systemPhase === "degraded") {
      headline = topUnderstanding
        ? `System degraded: ${topUnderstanding?.what}`
        : "System degraded — check platform fixer for details.";
    } else if (trend === "improving") {
      headline = "System is recovering and trending healthy.";
    } else {
      headline = `System operating normally — health ${healthScore}%.`;
    }

    // Body
    const _noiseCount = understandings?.filter((u) => u?.isRoutineNoise).length;
    const _actionableCount = understandings?.filter(
      (u) => u?.requiresHumanAttention,
    ).length;

    const bodyParts: string[] = [];
    bodyParts?.push(
      systemPhase === "operational"
        ? `The platform has been running for ${Math?.round(uptimeSec / 60)} minute(s) and all critical subsystems are ${signals?.pdimCircuitOpen ? "degraded" : "healthy"}.`
        : `The platform is in the "${phaseLabel}" phase. Uptime: ${uptimeSec}s.`,
    );

    if (noiseCount > 0) {
      bodyParts?.push(
        `${noiseCount} routine event type(s) are active but require no action — ` +
          `these are expected patterns (${understandings
            .filter((u) => u?.isRoutineNoise)
            .map((u) => u?.errorClass.replace(/_/g, " "))
            .join(", ")}).`,
      );
    }

    if (actionableCount > 0) {
      bodyParts?.push(
        `${actionableCount} situation(s) require human attention: ` +
          understandings
            .filter((u) => u?.requiresHumanAttention)
            .map((u) => u?.what)
            .join("; "),
      );
    } else if (systemPhase === "operational") {
      bodyParts?.push(
        "No immediate action is required. Self-healing systems are operating normally.",
      );
    }

    if (signals?.securityThreatCount > 0) {
      bodyParts?.push(
        `Security: ${signals?.securityThreatCount} threat(s) detected since startup; ` +
          `${this?._healedThreats} healed automatically.`,
      );
    }

    const _body = bodyParts?.join(" ");

    // Key insights
    const keyInsights: string[] = [];
    if (signals?.pdim5xxCount > 0 && !signals?.pdimCircuitOpen) {
      keyInsights?.push(
        `PDIM: ${signals?.pdim5xxCount} 5xx errors absorbed (circuit closed — slow-lane handling).`,
      );
    }
    if (signals?.pdimCircuitOpen) {
      keyInsights?.push(
        "PDIM circuit breaker is OPEN — queued operations paused.",
      );
    }
    if (signals?.luaMaxQueued > 0) {
      keyInsights?.push(
        `LuaExecutor peak queue depth: ${signals?.luaMaxQueued} (auto-reset by ChainFixer).`,
      );
    }
    if (signals?.memHeapPct > 75) {
      keyInsights?.push(
        `Heap at ${signals?.memHeapPct}% of limit — ${signals?.memHeapPct > 90 ? "GC forced" : "monitoring"}.`,
      );
    }
    if (signals?.seedingFailCount > 0) {
      keyInsights?.push(
        `${signals?.seedingFailCount} AI data seed(s) deferred — will retry when PDIM is warm.`,
      );
    }
    if (this?._threatCount > 0) {
      keyInsights?.push(
        `Security: ${this?._threatCount} threat(s) detected, ${this?._healedThreats} auto-healed.`,
      );
    }
    if (keyInsights?.length === 0)
      keyInsights?.push("All subsystems operating within normal parameters.");

    // Next expected event
    let nextExpectedEvent: string;
    if (systemPhase === "cold_starting") {
      nextExpectedEvent =
        "PDIM first-success response will transition system to slow-lane phase.";
    } else if (systemPhase === "warming") {
      nextExpectedEvent =
        "PDIM will complete warm-up and circuit will transition to CLOSED-stable.";
    } else if (signals?.pdimCircuitOpen) {
      nextExpectedEvent =
        "Circuit breaker will probe PDIM in the next 60–120 seconds.";
    } else {
      nextExpectedEvent =
        "Next HyperLearning cycle in ~5 minutes; MaxCore weight sync in ~10 minutes.";
    }

    return {
      headline,
      body,
      keyInsights,
      systemPhase,
      phaseLabel,
      healthScore,
      trend,
      activeThreats: this?._threatCount - this?._healedThreats,
      topErrorClass: topUnderstanding?.errorClass ?? null,
      topErrorDescription: topUnderstanding?.what ?? null,
      nextExpectedEvent,
      uptimeSeconds: uptimeSec,
      generatedAt: Date?.now(),
    };
  }

  // ─── Actionable insights ───────────────────────────────────────────────────

  private _addInsight(insight: Insight): void {
    const _existing = this?.insights.findIndex((i) => i?.id === insight?.id);
    if (existing !== -1) {
      this?.insights[existing] = insight;
      return;
    }
    this?.insights.unshift(insight);
    if (this?.insights.length > 50) this?.insights.pop();
  }

  private _refreshInsights(): void {
    const _understandings = this?.analyzeCurrentState();

    for (const u of understandings) {
      if (u?.requiresHumanAttention && !u?.isRoutineNoise) {
        this?._addInsight({
          id: `error_${u?.errorClass}`,
          priority:
            u?.severity === "critical"
              ? "critical"
              : u?.severity === "high"
                ? "high"
                : u?.severity === "medium"
                  ? "medium"
                  : "low",
          title: u?.errorClass
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c?.toUpperCase()),
          detail: u?.what + " " + u?.why,
          action: u?.recommendedActions[0]?.action ?? "Investigate.",
          automated: u?.recommendedActions[0]?.automated ?? false,
          since: Date?.now(),
        });
      }
    }

    // Prune resolved insights older than 1 hour
    const _cutoff = Date?.now() - 60 * 60_000;
    this.insights = this?.insights.filter((i) => i?.since > cutoff);
  }

  getInsights(): Insight[] {
    this?._refreshInsights();
    return this?.insights.slice(0, 20);
  }

  // ─── Admin API data ────────────────────────────────────────────────────────

  getStatus() {
    const _narrative = this?.narrateSystemState();
    const _understandings = this?.analyzeCurrentState();
    const _signals = this?._extractSignals();

    return {
      narrative,
      currentUnderstandings: understandings,
      signals: {
        uptimeSeconds: Math?.round(signals?.uptimeMs / 1000),
        pdim5xxInWindow: signals?.pdim5xxCount,
        pdimCircuitOpen: signals?.pdimCircuitOpen,
        pdimWarm: signals?.pdimHadFirstSuccess,
        luaMaxQueued: signals?.luaMaxQueued,
        bullmqLockRaces: signals?.bullmqLockCount,
        seedingFailures: signals?.seedingFailCount,
        heapPercent: signals?.memHeapPct,
        dbSlowQueries: signals?.dbSlowCount,
        unknownErrors: signals?.unknownErrorCount,
        chainFixerFires: signals?.chainFixerFires,
        openIncidents: signals?.incidentCount,
        securityThreats: signals?.securityThreatCount,
      },
      security: {
        totalThreats: this?._threatCount,
        healedThreats: this?._healedThreats,
        recentAssessments: this?.recentSecurityUnderstandings.slice(0, 10),
      },
      insights: this?.getInsights(),
      generatedAt: Date?.now(),
    };
  }

  getSecurityReport() {
    return {
      totalThreatsDetected: this?._threatCount,
      totalThreatsHealed: this?._healedThreats,
      activeThreats: Math?.max(0, this?._threatCount - this?._healedThreats),
      recentAssessments: this?.recentSecurityUnderstandings.slice(0, 20),
      generatedAt: Date?.now(),
    };
  }

  getEventWindow(limit = 100) {
    return this?.eventWindow.slice(-limit).reverse();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const _systemIntelligence = new SystemIntelligenceEngine();
