/** Pure retained-runtime AST/map trace: does not import application subjects. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseAstAsync} from 'vite';
import {TraceMap, decodedMappings, originalPositionFor} from '@jridgewell/trace-mapping';
const root='/workspace/maxbooster7.5';
const out='/workspace/onboarding-results/c5-next-contract';
const cohort=path.join(root,'reports/coverage-producer/2026-10-28-keepnames-final/profile/201184-0');
const manifest=JSON.parse(fs.readFileSync(path.join(cohort,'manifest.json')));
const baseline=JSON.parse(fs.readFileSync(path.join(out,'baseline-a160-selected.json')));
const saved=JSON.parse(fs.readFileSync(path.join(out,'node-bca-selected.json')));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const result=[];
function walk(node, fn, parent) {
 if(!node || typeof node!=='object')return;
 if(node.type)fn(node,parent);
 for(const[key,value]of Object.entries(node)){
  if(key==='loc')continue;
  if(Array.isArray(value))for(const child of value)walk(child,fn,node);
  else if(value&&typeof value==='object')walk(value,fn,node);
 }
}
for(const script of manifest.scripts){
 const source=script.originalScriptFile;
 const code=fs.readFileSync(path.join(cohort,script.codeFile),'utf8');
 if(sha(code)!==script.codeSha256)throw Error('Retained code identity mismatch');
 const mapBytes=fs.readFileSync(path.join(cohort,script.mapFile));
 if(sha(mapBytes)!==script.mapSha256)throw Error('Retained map identity mismatch');
 const map=JSON.parse(mapBytes), trace=new TraceMap(map), ast=await parseAstAsync(code);
 const offsets=[0];for(let i=0;i<code.length;i++)if(code[i]==='\n')offsets.push(i+1);
 const points=decodedMappings(trace).flatMap((line,i)=>line.filter(s=>s.length>1).map(s=>({offset:offsets[i]+s[0],segment:s})));
 const nodes=[];walk(ast,(node,parent)=>nodes.push({node,parent}));
 const pos=offset=>{let line=0;while(line+1<offsets.length&&offsets[line+1]<=offset)line++;return {line:line+1,column:offset-offsets[line]};};
 const brief=node=>({type:node.type,start:node.start,end:node.end,generatedStart:pos(node.start),generatedEnd:pos(node.end),
   code:code.slice(node.start,node.end).slice(0,500),nodeSha256:sha(code.slice(node.start,node.end)),
   startMapsTo:originalPositionFor(trace,pos(node.start)),endMapsTo:originalPositionFor(trace,pos(node.end)),
   originalPoints:[...new Set(points.filter(p=>p.offset>=node.start&&p.offset<node.end).map(p=>`${p.segment[1]}:${p.segment[2]+1}:${p.segment[3]}`))].slice(0,20)});
 const compiler=[];
 for(const{node,parent}of nodes){
  if(node.type==='ExpressionStatement'&&node.expression?.type==='CallExpression'&&/^__name\d*$/.test(node.expression.callee?.name||'')&&node.expression.arguments[0]?.type==='ThisExpression'){
   compiler.push({kind:'class-static-name-call',parentType:parent?.type,...brief(node)});
  }
  if(node.type==='ArrowFunctionExpression'&&parent?.type==='CallExpression'&&parent.arguments[0]===node&&parent.callee?.type==='MemberExpression'&&parent.callee.property?.name==='then'&&code.slice(node.start,node.end).includes('"__esModule"in')){
   compiler.push({kind:'tsx-dynamic-import-interop',call:brief(parent),...brief(node)});
  }
 }
 const canonical=baseline[source],nodeProfile=saved[source];
 const relevant=[];
 for(const[kind,fields]of [['statementMap',['start']],['fnMap',['decl','loc']],['branchMap',['loc']]]){
  const canonicalKeys=new Set(Object.values(canonical[kind]).map(x=>JSON.stringify(x)));
  for(const[id,entry]of Object.entries(nodeProfile[kind])){
   if(canonicalKeys.has(JSON.stringify(entry)))continue;
   const originalPos=kind==='statementMap'?entry.start:entry.loc.start;
   const matching=nodes.filter(({node})=>['ArrowFunctionExpression','ExpressionStatement','VariableDeclarator','ReturnStatement','ConditionalExpression','LogicalExpression'].includes(node.type))
    .filter(({node})=>{
     const original=originalPositionFor(trace,pos(node.start));
     return original.line===originalPos.line && original.column===originalPos.column;
    }).sort((a,b)=>(a.node.end-a.node.start)-(b.node.end-b.node.start));
   relevant.push({kind,id,entry,exactStartAstWitnesses:matching.slice(0,2).map(({node})=>brief(node))});
  }
 }
 result.push({source:path.relative(root,source),runtime:{codeSha256:script.codeSha256,mapSha256:script.mapSha256,originalSources:script.originalSources},
   originalSourceSha256:sha(fs.readFileSync(source)),compilerConstructs:compiler,serializedDifferingNodeEntries:relevant});
}
const output={schemaVersion:1,scope:'Read-only retained runtime AST/source-map witnesses; no product execution or conversion/merge',files:result,productionReady:false,mergedIntoGlobalCoverage:false};
fs.writeFileSync(path.join(out,'runtime-ast-witnesses.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({files:result.length,compilerConstructs:result.map(x=>({file:x.source,constructs:x.compilerConstructs.map(y=>y.kind)})),productionReady:false}));
