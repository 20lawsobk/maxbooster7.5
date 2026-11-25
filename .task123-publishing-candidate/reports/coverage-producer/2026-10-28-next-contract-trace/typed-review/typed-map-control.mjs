/** Budgeted pure-map controls through Vite's actual TS config-aware transform. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {transformWithEsbuild} from 'vite';
import {ht as ssrTransform} from '/workspace/maxbooster7.5/node_modules/vite/dist/node/chunks/config.js';
import {V8CoverageProvider} from '/workspace/maxbooster7.5/node_modules/@vitest/coverage-v8/dist/provider.js';
const root='/workspace/maxbooster7.5',out='/workspace/onboarding-results/c5-next-contract/final-review';
const baseline=JSON.parse(fs.readFileSync(path.join(out,'baseline-a160-selected.json')));
const files=Object.keys(baseline).sort((a,b)=>fs.statSync(a).size-fs.statSync(b).size);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const provider=Object.create(V8CoverageProvider.prototype);
provider.options={ignoreClassMethods:[]};provider.ctx={logger:{error:message=>{throw Error(message);}}};

function rawDescription(value) {
 if (value === undefined) return {kind:'undefined'};
 if (typeof value === 'number' && !Number.isFinite(value)) return {kind:'number', value:Number.isNaN(value)?'NaN':value===Infinity?'+Infinity':'-Infinity'};
 return {kind:typeof value, value};
}
function prototypeName(value) {
 const proto=Object.getPrototypeOf(value);
 return proto===null?'null':proto===Object.prototype?'Object.prototype':proto===Array.prototype?'Array.prototype':proto?.constructor?.name||'unknown';
}
function typedDifferences(raw, wire, location, result=[]) {
 if (Object.is(raw,wire)) return result;
 if (raw && wire && typeof raw==='object' && typeof wire==='object') {
  if(Object.getPrototypeOf(raw)!==Object.getPrototypeOf(wire)) result.push({path:location,kind:'prototype-difference',rawPrototype:prototypeName(raw),wirePrototype:prototypeName(wire)});
  const keys=[...new Set([...Object.keys(raw),...Object.keys(wire)])].sort();
  for(const key of keys) {
   const r=Object.hasOwn(raw,key),w=Object.hasOwn(wire,key);
   if(!r||!w) result.push({path:location+'.'+key,kind:'own-property-presence',rawOwn:r,wireOwn:w,raw:r?rawDescription(raw[key]):{kind:'absent'},wire:w?rawDescription(wire[key]):{kind:'absent'}});
   else typedDifferences(raw[key],wire[key],location+'.'+key,result);
  }
 } else result.push({path:location,kind:'primitive-or-kind-difference',raw:rawDescription(raw),wire:rawDescription(wire)});
 return result;
}
const typedResults=[];

const controls=[],started=performance.now();
for(const file of files){
 if(performance.now()-started>1200)break;
 const source=fs.readFileSync(file,'utf8'),at=performance.now();
 const options={target:'esnext',minify:false,minifyIdentifiers:false,minifySyntax:false,minifyWhitespace:false,
  treeShaking:false,keepNames:false,supported:{'dynamic-import':true,'import-meta':true}};
 const transformed=await transformWithEsbuild(source,file,options);
 const ssr=await ssrTransform(transformed.code,transformed.map,file,source);
 const profile=Object.values(await provider.remapCoverage(`file://${file}`,0,ssr,[]))[0];
 const stem=path.relative(root,file).replaceAll('/','__');
 fs.writeFileSync(path.join(out,stem+'.vite-tsconfig-ssr.js'),ssr.code);
 fs.writeFileSync(path.join(out,stem+'.vite-tsconfig-ssr.js.map'),JSON.stringify(ssr.map));
 fs.writeFileSync(path.join(out,stem+'.vite-tsconfig-ssr.profile.json'),JSON.stringify(profile,null,2)+'\n');
 const saved=JSON.parse(fs.readFileSync(path.join(out,stem+'.vite-tsconfig-ssr.profile.json')));
 const comparison=Object.fromEntries(['statementMap','fnMap','branchMap'].map(key=>[key,{
  rawEqual:isDeepStrictEqual(profile[key],baseline[file][key]),serializedArtifactEqual:isDeepStrictEqual(saved[key],baseline[file][key]),
  baselineEntries:Object.keys(baseline[file][key]).length,controlEntries:Object.keys(profile[key]).length}]));
 typedResults.push({file:path.relative(root,file),maps:Object.fromEntries(['statementMap','fnMap','branchMap'].map(key=>[key,typedDifferences(profile[key],baseline[file][key],key)]))});
 const allZero=['s','f','b'].every(key=>Object.values(profile[key]).flat().every(value=>value===0));
 if(!allZero)throw Error('Pure-map control gained a count');
 controls.push({file:path.relative(root,file),sourceSha256:hash(source),options,codeSha256:hash(ssr.code),
  mapSha256:hash(JSON.stringify(ssr.map)),durationMs:performance.now()-at,comparison,allCountersZero:allZero,executed:false});
}
const result={schemaVersion:1,scope:'Budgeted map-only tsconfig-aware Vite transform + SSR + installed Vitest provider; no actual subject execution',
 comparisonContract:'Raw strict equality uses isDeepStrictEqual; persisted JSON-map equality is diagnostic only, never policy normalization.',
 baseline:'Historical exact selected a160 entries',controls,notRun:files.filter(file=>!controls.some(item=>item.file===path.relative(root,file))).map(file=>path.relative(root,file)),
 durationMs:performance.now()-started,privateApiWarning:'Private Vite ht and provider method used only for this version-pinned diagnostic, not shipped integration.',
 productionReady:false,mergedIntoGlobalCoverage:false};
fs.writeFileSync(path.join(out,'supported-vite-ssr-controls.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({controls:controls.length,notRun:result.notRun,durationMs:result.durationMs,comparisons:controls.map(item=>({file:item.file,comparison:item.comparison}))}));

fs.writeFileSync(path.join(out,'typed-differences.json'),JSON.stringify({scope:'Raw newly reconstructed map versus exact historical JSON map; typed/prototype observations only, no codec acceptance or subject execution',files:typedResults,productionReady:false,mergedIntoGlobalCoverage:false},null,2)+'\n');
