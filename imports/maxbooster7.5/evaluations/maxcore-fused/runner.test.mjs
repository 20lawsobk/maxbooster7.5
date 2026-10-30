import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, hash, safePath, assess, live, validateContract } from './runner.mjs';

const names = ['modelHash','awarenessHash','cacheIdentity','seed','output','refusal','fallback','awarenessDispatches','gpuDispatches'];
const route = {fields:Object.fromEntries(names.map(n => [n,n]))};
const snapshot = {contract:{modelHash:'a'.repeat(64), awarenessSnapshot:{cacheIdentity:'fictional-v1'}}, awarenessHash:'b'.repeat(64), cases:{seed:41873}};
const evidence = {modelHash:'a'.repeat(64), awarenessHash:'b'.repeat(64), cacheIdentity:'fictional-v1',seed:41873,output:'fictional test output',refusal:false,fallback:false,awarenessDispatches:1,gpuDispatches:1};
test('canonical replay ignores key insertion order, not values', () => {
  assert.equal(hash({b:2,a:1}),hash({a:1,b:2}));
  assert.notEqual(hash({a:1}),hash({a:2}));
  assert.equal(canonical({a:[2,1]}),'{"a":[2,1]}');
});
test('no unsafe API paths', () => {
  for (const p of ['https://evil.test','//evil.test','/api/../training','/api/training/start','/api/internal/test','/api/publish']) assert.throws(() => safePath(p));
  assert.equal(safePath('/api/ready'),'/api/ready');
});
test('full telemetry required, heuristic quality is ignored', () => {
  assert.equal(assess(evidence, route, snapshot).status,'PIPELINE_OBSERVED');
  for (const field of names) {
    const partial = {...evidence}; delete partial[field];
    assert.equal(assess(partial, route, snapshot).status,'NOT_ESTABLISHED');
  }
  assert.equal(assess({score:100,veo:100},route,snapshot).status,'NOT_ESTABLISHED');
  assert.equal(assess({...evidence,seed:1},route,snapshot).status,'NOT_ESTABLISHED');
  assert.equal(assess({...evidence,gpuDispatches:0},route,snapshot).status,'NOT_ESTABLISHED');
});
test('explicit refusal and fallback are not quality passes', () => {
  assert.equal(assess({...evidence,refusal:true},route,snapshot).status,'REFUSED');
  assert.equal(assess({...evidence,fallback:true},route,snapshot).status,'FAILED');
});
test('live is blocked before network without parent approval', async () => {
  await assert.rejects(live(snapshot,{}), /PARENT_APPROVAL_REQUIRED/);
});
test('incomplete contract cannot become a live experiment', () => {
  assert.throws(() => validateContract({readinessPath:'/api/ready'}, {cases:[]}));
});