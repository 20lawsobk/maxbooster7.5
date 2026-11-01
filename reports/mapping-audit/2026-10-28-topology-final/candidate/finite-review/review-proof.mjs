import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { resolveFiniteTemplatePath as resolve } from '../scripts/lib/finite-route-paths.mjs';
const cases = [
 ['for-statement-shadow','for(const action of ["outer"]){for(let action="inner"; true;){router.get(`/${action}`,h);break}}',['/inner']],
 ['for-in-shadow','for(const action of ["outer"]){for(const action in {inner:1}){router.get(`/${action}`,h)}}',['/inner']],
 ['switch-case-shadow','for(const action of ["outer"]){switch(1){case 1: const action="inner";router.get(`/${action}`,h);break;}}',['/inner']],
 ['switch-default-shadow','for(const action of ["outer"]){switch(1){default: const action="inner";router.get(`/${action}`,h);break;}}',['/inner']],
];
const observations=[];
for(const[name,source,expected]of cases){
 const recorded=[];
 vm.runInNewContext(source,{router:{get:(value)=>recorded.push(value)},h:()=>{}},{timeout:1000});
 observations.push({name,source,expected,actualRegistration:recorded,candidateResult:resolve(source,'fixture.ts',source.indexOf('router.get')),sourceExecutionScope:'credential-free synthetic fixture only; helper never executes application source'});
}
const helperPath=path.resolve(import.meta.dirname,'../scripts/lib/finite-route-paths.mjs');
const result={schemaVersion:1,observedAt:new Date().toISOString(),scope:'Read-only finite path helper adversarial independent review',helper:{file:helperPath,sha256:crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex')},repositorySourceModified:false,observations};
fs.writeFileSync(path.join(import.meta.dirname,'review-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(observations.map(({name,actualRegistration,candidateResult})=>({name,actualRegistration,candidateResult})),null,2));
