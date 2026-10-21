// A sealed fixture is deliberately missing ML. This contract cannot establish
// full application readiness and must reject failures in its real dependencies.
export function isExpectedIsolatedReadiness(status, body) {
  if (status !== 503 || body?.status !== "degraded" || body?.unifiedAwareness?.ready !== false || !Array.isArray(body.subsystems)) return false;
  const statuses = new Map(body.subsystems.map(value => [value?.name, value?.status]));
  if (!["database", "redis", "routes"].every(name => statuses.get(name) === "ok")) return false;
  return body.subsystems.every(value => value?.name === "maxcore" || ["ok", "unknown"].includes(value?.status));
}
