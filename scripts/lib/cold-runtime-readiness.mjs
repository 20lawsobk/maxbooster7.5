// Cold startup is narrower than production readiness. A model/source gate may
// remain unavailable; an unrelated route, dependency or packaging failure may not.
export function inspectColdRuntimeReadiness(evidence) {
  const fail = reason => ({accepted:false, reason});
  const {readiness, maxcoreLiveness, modelLiveness, modelReadiness, runtimeAssets} = evidence;
  if (runtimeAssets?.platformRegistry?.hashMatches !== true || !runtimeAssets.platformRegistry.revision) return fail('Required platform registry is missing or changed');
  if (maxcoreLiveness?.status !== 200 || maxcoreLiveness.body?.ok !== true) return fail('Imported MaxCore Node liveness is not proven');
  if (modelLiveness?.status !== 200 || modelLiveness.body?.status !== 'healthy') return fail('Imported Python liveness is not proven');
  if (![200,503].includes(modelReadiness?.status) || typeof modelReadiness.body?.ready !== 'boolean') return fail('Actual model readiness was not observed');
  if (modelReadiness.status === 503 && (modelReadiness.body.ready !== false || modelReadiness.body.model_error !== 'no_operationally_capable_certified_public_live_candidate')) return fail('Model unavailability is not the known operational candidate gate');
  if (modelReadiness.status === 200 && modelReadiness.body.ready !== true) return fail('Model status contradicts its actual readiness');
  const body = readiness?.body;
  if (![200,503].includes(readiness?.status) || !body || body.error || body.status === 'down' || !Array.isArray(body.subsystems)) return fail('Application readiness failed outside its ML gate');
  const statuses = new Map(body.subsystems.map(value => [value?.name,value?.status]));
  if (!['database','redis','routes'].every(name => statuses.get(name) === 'ok')) return fail('Database, Redis and complete route registration must all be healthy');
  if (!['ok','degraded'].includes(statuses.get('maxcore'))) return fail('Configured MaxCore subsystem is absent or down');
  const unverifiedNonMl = [];
  for (const item of body.subsystems) {
    if (item.name === 'maxcore' || item.status === 'ok') continue;
    // The existing audit probe explicitly exposes asynchronous cold bootstrap.
    // Retain that unverified signal instead of calling its audit a passing gate.
    if (item.name === 'audit' && item.status === 'unknown' && ['initializing','not initialized'].includes(item.detail)) {
      unverifiedNonMl.push('audit');
      continue;
    }
    return fail(`Non-ML subsystem ${item.name} is not healthy`);
  }
  if (readiness.status === 200) {
    if (body.status !== 'ok' || body.unifiedAwareness?.ready !== true || modelReadiness.status !== 200 || modelReadiness.body.ready !== true) return fail('Healthy aggregate contradicts its actual ML evidence');
    return {accepted:true,scope:'cold-startup',productionReady:true,unverifiedNonMl};
  }
  if (body.status !== 'degraded' || typeof body.unifiedAwareness?.ready !== 'boolean' ||
      !(modelReadiness.body.ready === false || body.unifiedAwareness.ready === false)) return fail('503 is not explained by the observed ML/awareness gate');
  return {accepted:true,scope:'cold-startup-with-ml-unavailable',productionReady:false,unverifiedNonMl};
}
