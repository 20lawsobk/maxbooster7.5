import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

export const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const get = (object, path) => path.split('.').reduce((v, k) => v?.[k], object);
const fields = ['modelHash','awarenessHash','cacheIdentity','seed','output','refusal','fallback','awarenessDispatches','gpuDispatches'];
export function safePath(path) {
  assert(typeof path === 'string' && /^\/api\/[a-zA-Z0-9/_-]+$/.test(path) &&
    !/training|reload|internal|publish|schedule|admin|autopilot/i.test(path), 'UNSAFE_API_PATH');
  return path;
}
export function validateContract(c, cases) {
  assert(cases?.cases?.length === 7 && new Set(cases.cases.map(t => t.id)).size === 7, 'INVALID_CASE_SET');
  safePath(c.readinessPath);
  assert(sha(c.modelHash) && typeof c.sourceRevision === 'string' && c.sourceRevision.length > 0, 'MISSING_MODEL_OR_SOURCE_PIN');
  assert(Array.isArray(c.sourceFiles) && c.sourceFiles.length > 0, 'MISSING_SOURCE_FILES');
  const a = c.awarenessSnapshot;
  assert(a && Array.isArray(a.sources) && a.sources.length && Array.isArray(a.directives) && a.directives.length && typeof a.cacheIdentity === 'string' && a.cacheIdentity, 'MISSING_FROZEN_AWARENESS');
  for (const test of cases.cases) {
    const r = c.routes?.[test.id];
    assert(r && r.body && r.fields, 'MISSING_CASE_ROUTE');
    safePath(r.path);
    assert(r.body.seed === cases.seed && r.body.prompt === test.prompt &&
      canonical(r.body.awareness) === canonical(a), 'REQUEST_NOT_FROZEN');
    assert(fields.every(f => typeof r.fields[f] === 'string' && /^[\w.]+$/.test(r.fields[f])), 'MISSING_EVIDENCE_MAPPING');
  }
}
const frozenPaths = ['evaluations/maxcore-quality/cases.json','evaluations/maxcore-quality/types.json',
  'evaluations/maxcore-fused/runner.mjs', 'evaluations/maxcore-fused/PROTOCOL.md',
  'scripts/evaluate-maxcore-fused.mjs'];
export async function freeze(contract) {
  const casesBytes = await readFile('evaluations/maxcore-fused/cases.json');
  const cases = JSON.parse(casesBytes);
  validateContract(contract, cases);
  const pins = {};
  for (const path of [...frozenPaths, 'evaluations/maxcore-fused/cases.json', ...contract.sourceFiles]) {
    assert(typeof path === 'string' && !relative(process.cwd(), resolve(path)).startsWith('..') && !path.startsWith('/') && !/(^|\/)\.env|secret|credential/i.test(path), 'UNSAFE_SOURCE_PATH');
    pins[path] = hash(await readFile(path));
  }
  const payload = {version:1, cases, contract, pins, awarenessHash:hash(contract.awarenessSnapshot)};
  return {...payload, snapshotHash:hash(payload)};
}
export async function validateSnapshot(snapshot) {
  const {snapshotHash, ...payload} = snapshot;
  assert(hash(payload) === snapshotHash, 'SNAPSHOT_TAMPERED');
  validateContract(snapshot.contract, snapshot.cases);
  assert(canonical(snapshot.cases) === canonical(JSON.parse(await readFile('evaluations/maxcore-fused/cases.json', 'utf8'))), 'CASE_DRIFT');
  assert(snapshot.awarenessHash === hash(snapshot.contract.awarenessSnapshot), 'AWARENESS_TAMPERED');
  for (const p of [...frozenPaths, 'evaluations/maxcore-fused/cases.json', ...snapshot.contract.sourceFiles]) {
    assert(sha(snapshot.pins[p]) && hash(await readFile(p)) === snapshot.pins[p], 'SOURCE_DRIFT');
  }
}
export function assess(response, route, snapshot) {
  const e = Object.fromEntries(fields.map(f => [f, get(response, route.fields[f])]));
  if (e.refusal === true) return {status:'REFUSED'};
  if (e.fallback === true) return {status:'FAILED', reason:'SILENT_OR_DECLARED_FALLBACK'};
  if (e.refusal !== false || e.fallback !== false || e.output == null || e.output === '' ||
      e.modelHash !== snapshot.contract.modelHash || e.awarenessHash !== snapshot.awarenessHash ||
      e.cacheIdentity !== snapshot.contract.awarenessSnapshot.cacheIdentity || e.seed !== snapshot.cases.seed ||
      !Number.isSafeInteger(e.awarenessDispatches) || e.awarenessDispatches < 1 ||
      !Number.isSafeInteger(e.gpuDispatches) || e.gpuDispatches < 1) {
    return {status:'NOT_ESTABLISHED', reason:'MISSING_OR_MISMATCHED_PIPELINE_EVIDENCE'};
  }
  return {status:'PIPELINE_OBSERVED', outputHash:hash(e.output),
    awarenessDispatches:e.awarenessDispatches, gpuDispatches:e.gpuDispatches};
}
export async function live(snapshot, env = process.env) {
  assert(env.MAXCORE_FUSED_PARENT_READY === 'yes' && env.MAXCORE_FUSED_ALLOW_GENERATION === 'yes', 'PARENT_APPROVAL_REQUIRED');
  await validateSnapshot(snapshot);
  const base = new URL(env.MAXCORE_FUSED_BASE_URL);
  assert(base.pathname === '/' && !base.username && !base.password &&
    (base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname))), 'UNSAFE_ORIGIN');
  assert(env.E2E_SESSION_COOKIE && !/[\r\n]/.test(env.E2E_SESSION_COOKIE), 'ORDINARY_E2E_SESSION_REQUIRED');
  async function request(path, body) {
    safePath(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(new URL(path, base), {method:body ? 'POST':'GET',
        redirect:'error', signal:controller.signal,
        headers:{cookie:env.E2E_SESSION_COOKIE, 'content-type':'application/json',
          ...(env.E2E_CSRF_TOKEN ? {'x-csrf-token':env.E2E_CSRF_TOKEN} : {})},
        ...(body ? {body:canonical(body)} : {})});
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) { controller.abort(); throw new Error('RESPONSE_LIMIT'); }
        chunks.push(chunk);
      }
      return {status:response.status, json:response.ok ? JSON.parse(Buffer.concat(chunks).toString()) : null};
    } finally { clearTimeout(timeout); }
  }
  const report = {snapshotHash:snapshot.snapshotHash, quality:'NOT_ESTABLISHED',
    decodedMedia:'NOT_ESTABLISHED', temporalConsistency:'NOT_ESTABLISHED', veoComparison:'NOT_ESTABLISHED', cases:[]};
  try {
    const readiness = await request(snapshot.contract.readinessPath);
    assert(readiness.status === 200, 'READINESS_FAILED');
    for (const test of snapshot.cases.cases) {
      const route = snapshot.contract.routes[test.id];
      const row = {id:test.id, kind:test.kind, requestHash:hash(route.body), attempts:[]};
      report.cases.push(row);
      for (let n = 0; n < 2; n++) {
        const result = await request(route.path, route.body);
        row.attempts.push(result.status === 200 ? assess(result.json, route, snapshot) :
          {status:'HTTP_FAILURE', httpStatus:result.status});
        if (result.status === 401 || result.status === 403) throw new Error('AUTH_FAILED');
      }
      row.exactReplay = row.attempts.every(a => a.status === 'PIPELINE_OBSERVED') ?
        (row.attempts[0].outputHash === row.attempts[1].outputHash ? 'PASS':'FAIL') : 'NOT_ESTABLISHED';
    }
    report.execution = 'COMPLETE';
  } catch {
    report.execution = 'BLOCKED';
    report.error = 'REQUEST_OR_READINESS_FAILED_NO_FALLBACK';
  }
  return report;
}
export async function save(name, value) {
  assert(/^[a-z0-9-]+\.json$/.test(name), 'UNSAFE_REPORT_NAME');
  await mkdir('reports/maxcore-fused', {recursive:true});
  await writeFile(`reports/maxcore-fused/${name}`, JSON.stringify(value, null, 2) + '\n', {flag:'wx', mode:0o600});
}