import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectColdRuntimeReadiness} from '../scripts/lib/cold-runtime-readiness.mjs';

function evidence() {
  return {
    runtimeAssets:{platformRegistry:{hashMatches:true,revision:'real-fixture-revision'}},
    maxcoreLiveness:{status:200,body:{ok:true}},modelLiveness:{status:200,body:{status:'healthy'}},
    modelReadiness:{status:503,body:{ready:false,model_error:'no_operationally_capable_certified_public_live_candidate'}},
    readiness:{status:503,body:{status:'degraded',unifiedAwareness:{ready:false},subsystems:[
      ...['database','redis','routes','automation'].map(name=>({name,status:'ok'})),
      {name:'audit',status:'unknown',detail:'initializing'}, {name:'maxcore',status:'degraded'},
    ]}},
  };
}
test('actual imported liveness permits only the observed operational ML gate',()=>{
  const result=inspectColdRuntimeReadiness(evidence());
  assert.equal(result.accepted,true);assert.equal(result.productionReady,false);
  assert.deepEqual(result.unverifiedNonMl,['audit']);
});
test('missing runtime data, non-ML degradation and generic readiness exceptions fail closed',()=>{
  for (const alter of [
    e=>{e.runtimeAssets.platformRegistry.hashMatches=false;},
    e=>{e.readiness.body={status:'down',error:'health check failed'};},
    ...['database','redis','routes','automation','audit'].map(name=>e=>{e.readiness.body.subsystems.find(x=>x.name===name).status='degraded';}),
    e=>{e.readiness.body.subsystems.find(x=>x.name==='audit').detail='missing runtime file';},
    e=>{e.readiness.body.subsystems.find(x=>x.name==='maxcore').status='unknown';},
    e=>{e.maxcoreLiveness.status=503;},e=>{e.modelLiveness.status=503;},
    e=>{e.modelReadiness.body.model_error='checkpoint configuration invalid';},
  ]) {
    const value=evidence();alter(value);assert.equal(inspectColdRuntimeReadiness(value).accepted,false);
  }
});
test('healthy aggregate must agree with the actual model and awareness evidence',()=>{
  const value=evidence();value.readiness.status=200;value.readiness.body.status='ok';
  assert.equal(inspectColdRuntimeReadiness(value).accepted,false);
  value.modelReadiness={status:200,body:{ready:true}};value.readiness.body.unifiedAwareness.ready=true;
  value.readiness.body.subsystems.forEach(x=>{x.status='ok';});
  assert.equal(inspectColdRuntimeReadiness(value).productionReady,true);
});
