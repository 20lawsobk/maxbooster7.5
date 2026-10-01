/**
 * readiness-gauge — engine: run resolved checks, score them, render a verdict.
 *
 * Scoring: weighted mean over non-blocked checks (pass=100, warn=60, fail=0).
 * Verdict rules (in order):
 *   1. Any required check failed            -> NO GO
 *   2. Any required check blocked           -> at most CONDITIONAL GO
 *   3. score >= thresholds.go               -> GO
 *   4. score >= thresholds.conditionalGo   -> CONDITIONAL GO
 *   5. otherwise                            -> NO GO
 */
import type {
  CategoryScore,
  CheckContext,
  CheckStatus,
  GaugeReport,
  IndustryProfile,
  ResolvedCheck,
  ScoredCheck,
  Verdict,
} from "./types.js";
import { STATUS_POINTS, TOOL_VERSION } from "./types.js";

export async function runChecks(
  ctx: CheckContext,
  resolved: ResolvedCheck[],
  onProgress?: (id: string, index: number, total: number) => void,
): Promise<ScoredCheck[]> {
  const enabled = resolved.filter((r) => r.enabled);
  const scored: ScoredCheck[] = [];
  let i = 0;
  for (const r of enabled) {
    i++;
    onProgress?.(r.check.id, i, enabled.length);
    const t0 = Date.now();
    let status: CheckStatus = "blocked";
    let summary = "check did not complete";
    let evidence: string[] = [];
    let remediation: string | undefined;
    try {
      const res = await r.check.run(ctx, r.config);
      status = res.status;
      summary = res.summary;
      evidence = res.evidence;
      remediation = res.remediation;
    } catch (err: any) {
      status = "blocked";
      summary = `check crashed: ${String(err?.message ?? err).slice(0, 200)}`;
      remediation = "Fix the check implementation or disable it in the profile.";
    }
    scored.push({
      id: r.check.id,
      name: r.check.name,
      category: r.check.category,
      enabled: true,
      weight: r.weight,
      required: r.required,
      status,
      points: status === "blocked" ? null : STATUS_POINTS[status],
      summary,
      evidence,
      remediation,
      durationMs: Date.now() - t0,
    });
  }
  return scored;
}

export function scoreChecks(
  scored: ScoredCheck[],
): { score: number | null; categories: CategoryScore[] } {
  let weightedSum = 0;
  let weightTotal = 0;
  const byCategory = new Map<string, { sum: number; w: number; n: number }>();
  for (const s of scored) {
    if (s.points === null) continue;
    weightedSum += s.points * s.weight;
    weightTotal += s.weight;
    const c = byCategory.get(s.category) ?? { sum: 0, w: 0, n: 0 };
    c.sum += s.points * s.weight;
    c.w += s.weight;
    c.n++;
    byCategory.set(s.category, c);
  }
  const categories: CategoryScore[] = [...byCategory.entries()]
    .map(([category, c]) => ({
      category,
      checks: c.n,
      score: c.w > 0 ? Math.round((c.sum / c.w) * 10) / 10 : null,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
  return {
    score: weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : null,
    categories,
  };
}

export function decideVerdict(
  scored: ScoredCheck[],
  score: number | null,
  thresholds: { go: number; conditionalGo: number },
): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = [];
  const requiredFailed = scored.filter((s) => s.required && s.status === "fail");
  const requiredBlocked = scored.filter((s) => s.required && s.status === "blocked");

  if (requiredFailed.length > 0) {
    return {
      verdict: "NO GO",
      reasons: requiredFailed.map((s) => `required check failed: ${s.id} — ${s.summary}`),
    };
  }
  if (score === null) {
    return { verdict: "NO GO", reasons: ["no checks produced a score"] };
  }

  let verdict: Verdict;
  if (score >= thresholds.go) verdict = "GO";
  else if (score >= thresholds.conditionalGo) verdict = "CONDITIONAL GO";
  else verdict = "NO GO";
  reasons.push(`weighted score ${score} vs thresholds GO>=${thresholds.go}, CONDITIONAL>=${thresholds.conditionalGo}`);

  if (requiredBlocked.length > 0 && verdict === "GO") {
    verdict = "CONDITIONAL GO";
    reasons.push(
      `capped at CONDITIONAL GO: required check(s) blocked — ${requiredBlocked.map((s) => s.id).join(", ")}`,
    );
  } else if (requiredBlocked.length > 0) {
    reasons.push(
      `required check(s) blocked (unverifiable): ${requiredBlocked.map((s) => s.id).join(", ")}`,
    );
  }
  const blocked = scored.filter((s) => s.status === "blocked" && !s.required);
  if (blocked.length > 0) {
    reasons.push(`excluded from score (blocked): ${blocked.map((s) => s.id).join(", ")}`);
  }
  return { verdict, reasons };
}

export function buildGaugeReport(
  profile: IndustryProfile,
  cwd: string,
  scored: ScoredCheck[],
): GaugeReport {
  const { score, categories } = scoreChecks(scored);
  const { verdict, reasons } = decideVerdict(scored, score, profile.thresholds);
  return {
    tool: "readiness-gauge",
    toolVersion: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    profile: {
      name: profile.name,
      displayName: profile.displayName,
      description: profile.description,
      version: profile.version,
    },
    cwd,
    score,
    verdict,
    verdictReasons: reasons,
    thresholds: { ...profile.thresholds },
    checks: scored,
    categories,
  };
}
