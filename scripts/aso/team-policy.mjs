/**
 * Deterministic, reviewable team policy optimizer. It changes scheduling and
 * bounded model budgets from measured outcomes; it NEVER changes pass gates,
 * approval requirements, role permissions or production configuration.
 */
export function chooseSpecialistIncidents(incidents, roleOutcomes = {}, maxPerRole = 3) {
  const eligible = incidents.filter(item =>
    item.status === "OPEN_NOT_FIXED" && typeof item.file === "string" &&
    item.file.length > 0 && item.risk !== "critical" &&
    !item.blockedByRepetition &&
    (roleOutcomes[item.owner]?.attempts ?? 0) < maxPerRole);
  const score = item => {
    const stats=roleOutcomes[item.owner]??{attempts:0,successes:0,totalDurationMs:0};
    // Bayesian-smoothed expected success, corrected for measured wall time.
    const success=(stats.successes+1)/(stats.attempts+2);
    const cost=stats.attempts ? Math.max(60_000,stats.totalDurationMs/stats.attempts) : 120_000;
    const exploration=0.1/Math.sqrt(stats.attempts+1);
    const repetitionPenalty=Math.min(item.repetition??1,4)*0.04;
    return success*60_000/cost+exploration-repetitionPenalty;
  };
  return eligible.sort((a,b)=>a.priority-b.priority ||
    score(b)-score(a) || a.id.localeCompare(b.id));
}
export function selectSpecialistModel(incident, env = process.env) {
  if (env.ASO_ROLE_MODEL?.trim()) return env.ASO_ROLE_MODEL.trim();
  // Restrict cheap-first model selection to low-risk, mechanically localized
  // errors. Escalate repeated or ambiguous problems to a stronger model.
  const basic=(incident.repetition??1)<=1 &&
    ["code-correctness","frontend-or-browser","test-failure"].includes(incident.family);
  return basic ? (env.ASO_ROLE_FAST_MODEL || "gpt-6.1-terra") :
    (env.ASO_ROLE_DEEP_MODEL || "gpt-6.1-sol");
}
export function updateRoleOutcome(previous, outcome) {
  const stats=previous??{attempts:0,successes:0,totalDurationMs:0};
  const duration=Math.max(0,Number.isFinite(outcome.durationMs)?outcome.durationMs:0);
  return {
    attempts:stats.attempts+1,
    successes:stats.successes+(outcome.accepted?1:0),
    totalDurationMs:(stats.totalDurationMs??0)+duration,
    lastStatus:outcome.accepted?"VERIFIED_BRANCH_COMMIT":"REJECTED_OR_REVIEW_REQUIRED",
  };
}
