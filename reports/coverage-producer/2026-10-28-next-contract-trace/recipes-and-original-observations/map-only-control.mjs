/** Zero-counter transform control only. Never executes transformed subjects. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {transformSync} from 'esbuild';
import {parseAstAsync} from 'vite';
import {convert} from 'ast-v8-to-istanbul';
const root='/workspace/maxbooster7.5', out='/workspace/onboarding-results/c5-next-contract';
const baseline=JSON.parse(fs.readFileSync(path.join(out,'baseline-a160-selected.json')));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const controls=[];
for(const relative of ['server/logger.ts','server/logSanitizer.ts']){
 const file=path.join(root,relative),source=fs.readFileSync(file,'utf8');
 const options={sourcefile:file,loader:'ts',sourcemap:'external',sourcesContent:true,format:'esm',target:'esnext',
  minify:false,minifyIdentifiers:false,minifySyntax:false,minifyWhitespace:false,treeShaking:false,keepNames:false,
  tsconfigRaw:{compilerOptions:{useDefineForClassFields:true}}};
 const result=transformSync(source,options),ast=await parseAstAsync(result.code);
 // Empty counters are intentionally a syntax/map denominator control, not an execution claim.
 const map=Object.values(await convert({code:result.code,sourceMap:JSON.parse(result.map),ast,
  coverage:{url:`file://${file}`,functions:[]}}))[0];
 const comparison=Object.fromEntries(['statementMap','fnMap','branchMap'].map(key=>[key,{equal:isDeepStrictEqual(map[key],baseline[file][key]),
  baselineEntries:Object.keys(baseline[file][key]).length,controlEntries:Object.keys(map[key]).length}]));
 const allZero=['s','f','b'].every(key=>Object.values(map[key]).flat().every(value=>value===0));
 if(!allZero)throw Error('Map-only control gained a count');
 const stem=relative.replaceAll('/','__');
 fs.writeFileSync(path.join(out,stem+'.map-control.js'),result.code);
 fs.writeFileSync(path.join(out,stem+'.map-control.js.map'),result.map);
 fs.writeFileSync(path.join(out,stem+'.map-control.profile.json'),JSON.stringify(map,null,2)+'\n');
 controls.push({file:relative,sourceSha256:hash(source),options,codeSha256:hash(result.code),mapSha256:hash(result.map),
  comparison,allCountersZero:allZero,executed:false,mergedIntoGlobalCoverage:false});
}
const report={schemaVersion:1,scope:'Pure esbuild transform and empty-counter AST map control for two small source files; no product execution, participating runtime adoption or merge',
 baseline:'Selected exact a160 historical maps',controls,productionReady:false,mergedIntoGlobalCoverage:false};
fs.writeFileSync(path.join(out,'map-only-control.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
