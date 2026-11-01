/**
 * readiness-gauge — shared types.
 *
 * A universal, tunable production-readiness gauge. Checks are small,
 * runnable probes against a codebase; industry profiles assign each check a
 * weight, a required flag, and optional config, plus the score thresholds
 * that map to GO / CONDITIONAL GO / NO GO.
 */

export type CheckStatus = "pass" | "fail" | "warn" | "blocked";
export type Verdict = "GO" | "CONDITIONAL GO" | "NO GO";

export interface CheckContext {
  /** Repository root the checks run against. */
  cwd: string;
}

export interface CheckResult {
  status: CheckStatus;
  /** One-line human summary, e.g. "0 secrets found in 1,204 tracked files". */
  summary: string;
  /** Supporting detail lines (file paths, counts, excerpts). */
  evidence: string[];
  /** What to do when the check does not pass. */
  remediation?: string;
  durationMs: number;
}

export interface Check {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Per-check timeout in ms; exceeding it marks the check blocked. */
  timeoutMs: number;
  run(ctx: CheckContext, config: Record<string, unknown>): Promise<CheckResult>;
}

/** Per-check tuning inside an industry profile. */
export interface CheckTuning {
  enabled?: boolean;
  /** 1 (background) .. 5 (critical). Default 1. */
  weight?: number;
  /** A failed required check forces NO GO; a blocked one caps at CONDITIONAL GO. */
  required?: boolean;
  /** Check-specific knobs, e.g. { maxUndocumented: 5 }. */
  config?: Record<string, unknown>;
}

export interface IndustryProfile {
  name: string;
  displayName: string;
  description: string;
  version: string;
  thresholds: {
    /** Score >= go => GO. */
    go: number;
    /** Score >= conditionalGo => CONDITIONAL GO, else NO GO. */
    conditionalGo: number;
  };
  /** Checks not listed here default to { enabled: true, weight: 1 }. */
  checks: Record<string, CheckTuning>;
  notes?: string[];
}

export interface ResolvedCheck {
  check: Check;
  enabled: boolean;
  weight: number;
  required: boolean;
  config: Record<string, unknown>;
}

export interface ScoredCheck {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  weight: number;
  required: boolean;
  status: CheckStatus;
  /** pass=100, warn=60, fail=0; blocked checks are excluded from the score. */
  points: number | null;
  summary: string;
  evidence: string[];
  remediation?: string;
  durationMs: number;
}

export interface CategoryScore {
  category: string;
  checks: number;
  score: number | null;
}

export interface GaugeReport {
  tool: string;
  toolVersion: string;
  generatedAt: string;
  profile: {
    name: string;
    displayName: string;
    description: string;
    version: string;
  };
  cwd: string;
  /** 0-100 weighted score over non-blocked checks, or null when none ran. */
  score: number | null;
  verdict: Verdict;
  /** Machine-readable reasons the verdict is what it is. */
  verdictReasons: string[];
  thresholds: { go: number; conditionalGo: number };
  checks: ScoredCheck[];
  categories: CategoryScore[];
}

export const TOOL_VERSION = "1.0.0";

export const STATUS_POINTS: Record<Exclude<CheckStatus, "blocked">, number> = {
  pass: 100,
  warn: 60,
  fail: 0,
};
