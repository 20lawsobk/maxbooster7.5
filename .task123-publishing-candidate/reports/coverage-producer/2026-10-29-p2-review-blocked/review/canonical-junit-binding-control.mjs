import fs from 'node:fs';
import{assertCanonicalEvidence}from'../candidate/admit-node-coverage.mjs';
import{createContract}from'../candidate/coverage-shared-provider.mjs';
const base='/workspace/onboarding-results/c5-admission-prototype/canonical-8a9',root='/workspace/maxbooster7.5',read=n=>fs.readFileSync(base+'/'+n),json=n=>JSON.parse(read(n)),master=json('orchestration/results.json'),job=master.runs.find(x=>x.id==='coverage'&&x.group==='coverage'),inputs=json('orchestration/source-inputs.json');
// This is a guard-level historical negative control, never current-source admission.
const alteredJUnit={tests:1,leafTests:1,failures:0,errors:0,skipped:0,rootFailures:0,rootErrors:0,rootSkipped:0,suitesConsistent:true,timestamps:['2026-10-29T22:33:52.032Z']};
const result=assertCanonicalEvidence({root,master,inputs,current:inputs,revision:master.sourceRevision,job,log:read('orchestration/coverage.txt').toString('utf8'),junit:alteredJUnit,rawManifest:json('coverage/raw-p1/manifest.json'),contract:createContract(root),globalBytes:read('coverage/coverage-final.json'),format:json('coverage/artifact-format.json')});
console.log(JSON.stringify({scope:'historical guard-level review only; no current-source admission',canonicalActualTests:2771,alteredTests:1,accepted:result.assertions===1,reason:'canonical parent job binds log SHA but no JUnit artifact SHA/count digest'}));
