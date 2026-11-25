import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createContract,validateCapturedManifest,validateExecuted} from './coverage-shared-provider.mjs';
import {typedSha256} from './coverage-coordinate-contract.mjs';
const root='/workspace/maxbooster7.5',old='/workspace/onboarding-results/c5-shared-producer/prototype-1';
const actual=JSON.parse(fs.readFileSync(old+'/manifest.json')),raw=JSON.parse(fs.readFileSync(old+'/raw-v8.json'));
const contract=createContract(root),producerId='12345678-1234-1234-1234-123456789abc';
const manifest={...actual,schemaVersion:3,kind:'actual-P1-shared-Vite-Debugger-runtime',producerId,contract,contractSha256:typedSha256(contract),offsetEncoding:'UTF-16 code units',snapshot:{id:producerId+'-1',window:{startedAt:'2026-10-28T00:00:00.000Z',finishedAt:'2026-10-28T00:00:01.000Z'},reset:'Profiler.startPreciseCoverage before imports; one take after actual node:test lifecycle',overlap:'single fresh process, single snapshot; no merge'},scripts:actual.scripts.map(x=>({...x,observedDebuggerUrl:x.runtimeUrl}))};
const context={root,target:actual.target,contract,producerId,raw};
const rows=[];
function check(name,fn){fn();rows.push({name,status:'passed'});}
check('historical actual nine-script payload satisfies explicit injected-reader schema only',()=>assert.equal(validateCapturedManifest(manifest,context),true));
check('one manifest-only count change rejects against actual retained raw script',()=>{const copy=structuredClone(manifest);copy.scripts[0].coverage.functions[0].ranges[0].count++;assert.throws(()=>validateCapturedManifest(copy,context),/actual raw record/);});
check('actual raw duplicate script ID rejects',()=>{const changed=structuredClone(context);changed.raw.result.push(structuredClone(raw.result[0]));assert.throws(()=>validateCapturedManifest(manifest,changed),/duplicate/);});
check('different expected parent nonce rejects without reblessing historical data',()=>assert.throws(()=>validateCapturedManifest(manifest,{...context,producerId:'87654321-1234-1234-1234-123456789abc'}),/snapshot identity/));
check('malformed nested V8 range rejects even inside script bounds',()=>{const item=structuredClone(manifest.scripts[0]);const bytes={executed:fs.readFileSync(old+'/'+item.codeFile,'utf8'),body:fs.readFileSync(old+'/'+item.bodyFile,'utf8'),map:JSON.parse(fs.readFileSync(old+'/'+item.mapFile)),source:fs.readFileSync(item.file,'utf8'),contract};item.coverage.functions[0].ranges=[{startOffset:5,endOffset:10,count:1},{startOffset:0,endOffset:10,count:1}];assert.throws(()=>validateExecuted(item,bytes),/outside function/);});
fs.writeFileSync(new URL('./actual-raw-binding-check.json',import.meta.url),JSON.stringify({scope:'Independent reader diagnostic over retained historical raw bytes with explicit injected metadata; NO current production/counter admission',checks:rows,passed:rows.length,productionReady:false},null,2)+'\n');
console.log(JSON.stringify({passed:rows.length,scope:'historical reader diagnostic only'}));
