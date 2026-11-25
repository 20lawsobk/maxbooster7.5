import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
import {parseAstAsync} from 'vite';
import {convert} from 'ast-v8-to-istanbul';
import {createKeepNamesPolicy} from '../generated-node-policy.mjs';
const fixtures={
  multiple:'function a(x){if(x)return 1;return 0} function b(){return 2} globalThis.a=a;',
  nested:'function outer(x){ function inner(y){ return y ? 1 : 2 }; return inner(x); }',
  classes:'class First { method(x) { return x ? 1 : 2; } } class Second { static method(){return 3;} }',
  classInitializers:'class Test { value = (() => 2)(); static field = 3; method(x){ return x || 2; } }',
  arrowWrapper:'const a = x => x ? 1 : 2; const b = function(x){ return x || 0; };',
  unicode:'function 東京(x){ return x ? "🎹" : "未実行"; } const mañana = () => 1;',
  escapedAuthorIdentifier:'function \\u005f_name(value) { return value; } function target(x){return x ? 1 : 2} __name(target);',
  destructuredAuthorBinding:'const {__name} = globalThis; function target(x){return x ? 1 : 2} __name(target);',
  shadowedAuthorBinding:'function target(__name) { return __name ? 1 : 2; }',
  jsx:'function Component(value){return <div>{value ? "yes" : "no"}</div>;} ',
  typed:'type T = string; export function typed(value:T){ return value ? value : ""; }',
  defaultAnonymous:'export default function(value) { return value ? 1 : 2; }'
};
const out=[];
for(const[name,source] of Object.entries(fixtures)){
 const file='/owned/'+name+(name==='jsx'?'.jsx':name==='typed'?'.ts':'.js');
 const opts={sourcefile:file,sourcemap:'external',sourcesContent:true,format:'esm',loader:name==='jsx'?'jsx':name==='typed'?'ts':'js',minifyWhitespace:true,minifyIdentifiers:false,target:'es2022'};
 const kept=transformSync(source,{...opts,keepNames:true}), plain=transformSync(source,{...opts,keepNames:false});
 const ast=await parseAstAsync(kept.code),policy=createKeepNamesPolicy({code:kept.code,sourceMap:JSON.parse(kept.map),ast});
 const actual=Object.values(await convert({code:kept.code,sourceMap:JSON.parse(kept.map),ast,ignoreNode:policy.ignoreNode,coverage:{url:'file://'+file,functions:[]}}))[0];
 const control=Object.values(await convert({code:plain.code,sourceMap:JSON.parse(plain.map),ast:await parseAstAsync(plain.code),coverage:{url:'file://'+file,functions:[]}}))[0];
 // Denominator-only transforms: zero input counters are never claimed as executed.
 // Compiler wrapper positions can add nodes; original declaration/branch counts must never shrink.
 for(const key of ['statementMap','fnMap','branchMap']) assert.ok(Object.keys(actual[key]).length >= Object.keys(control[key]).length, name+' lost original '+key);
 if(name.includes('Author')) assert.equal(policy.audit.ignoredGeneratedNodes.length,0,name+' must disable generated filtering on original identifier collisions');
 out.push({name,ignored:policy.audit.ignoredGeneratedNodes.length,counts:Object.fromEntries(['statementMap','fnMap','branchMap'].map(k=>[k,{candidate:Object.keys(actual[k]).length,control:Object.keys(control[k]).length}]))});
}
fs.writeFileSync(new URL('./compiler-controls.json',import.meta.url),JSON.stringify({scope:'Compiler denominator-only control, not an execution or global coverage result',fixtures:out},null,2));
console.log(JSON.stringify({passed:out.length,failed:0,executedApplication:false,mergedIntoGlobalCoverage:false}));
