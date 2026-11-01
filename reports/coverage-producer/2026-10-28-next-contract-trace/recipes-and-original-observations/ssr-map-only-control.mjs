/** Pure Vite SSR/provider map reconstruction; transformed subjects never execute. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {transformSync} from 'esbuild';
import {ht as ssrTransform} from '/workspace/maxbooster7.5/node_modules/vite/dist/node/chunks/config.js';
import {V8CoverageProvider} from '/workspace/maxbooster7.5/node_modules/@vitest/coverage-v8/dist/provider.js';
const root='/workspace/maxbooster7.5',out='/workspace/onboarding-results/c5-next-contract';
const baseline=JSON.parse(fs.readFileSync(path.join(out,'baseline-a160-selected.json')));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const provider=Object.create(V8CoverageProvider.prototype);
provider.options={ignoreClassMethods:[]};provider.ctx={logger:{error:message=>{throw Error(message);}}};
const controls=[];
for(const relative of ['server/logger.ts','server/logSanitizer.ts']){
 const file=path.join(root,relative),source=fs.readFileSync(file,'utf8');
 const options={sourcefile:file,loader:'ts',sourcemap:'external',sourcesContent:true,format:'esm',target:'esnext',
  minify:false,minifyIdentifiers:false,minifySyntax:false,minifyWhitespace:false,treeShaking:false,keepNames:false,
  tsconfigRaw:{compilerOptions:{useDefineForClassFields:true}}};
 const transformed=transformSync(source,options);
 const ssr=await ssrTransform(transformed.code,JSON.parse(transformed.map),file,source);
 const output=await provider.remapCoverage(`file://${file}`,0,ssr,[]),map=Object.values(output)[0];
 const stem=relative.replaceAll('/','__');
 fs.writeFileSync(path.join(out,stem+'.ssr-map-control.js'),ssr.code);
 fs.writeFileSync(path.join(out,stem+'.ssr-map-control.js.map'),JSON.stringify(ssr.map));
 fs.writeFileSync(path.join(out,stem+'.ssr-map-control.profile.json'),JSON.stringify(map,null,2)+'\n');
 // Persisted wire comparisons are diagnostics; no normalization/merge policy is approved.
 const saved=JSON.parse(fs.readFileSync(path.join(out,stem+'.ssr-map-control.profile.json')));
 const comparison=Object.fromEntries(['statementMap','fnMap','branchMap'].map(key=>[key,{rawEqual:isDeepStrictEqual(map[key],baseline[file][key]),
  serializedArtifactEqual:isDeepStrictEqual(saved[key],baseline[file][key]),baselineEntries:Object.keys(baseline[file][key]).length,controlEntries:Object.keys(map[key]).length}]));
 const allZero=['s','f','b'].every(key=>Object.values(map[key]).flat().every(value=>value===0));
 if(!allZero)throw Error('Map-only control gained a counter');
 controls.push({file:relative,sourceSha256:hash(source),options,codeSha256:hash(ssr.code),mapSha256:hash(JSON.stringify(ssr.map)),
  comparison,allCountersZero:allZero,executed:false,providerCall:'Exact installed remapCoverage with zero functions, wrapperLength=0',
  privateApiWarning:'Diagnostic only: Vite private ht export and provider prototype are version-pinned observation tools, not approved production integration APIs.'});
}
const result={schemaVersion:1,scope:'Map-only pure esbuild+Vite SSR+exact installed Vitest conversion control; not actual canonical runtime capture',controls,productionReady:false,mergedIntoGlobalCoverage:false};
fs.writeFileSync(path.join(out,'ssr-map-only-control.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
