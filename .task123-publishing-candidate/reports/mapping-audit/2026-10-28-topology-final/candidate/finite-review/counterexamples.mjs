import { resolveFiniteTemplatePath as resolve } from '../scripts/lib/finite-route-paths.mjs';
const sources = {
  forStatementShadow:'for(const action of ["outer"]){for(let action="inner"; true;){router.get(`/${action}`,h);break}}',
  forInShadow:'for(const action of ["outer"]){for(const action in {inner:1}){router.get(`/${action}`,h)}}',
  switchCaseShadow:'for(const action of ["outer"]){switch(1){case 1: const action="inner";router.get(`/${action}`,h);break;}}',
  arrayNamedAsync:'const actions=["outer"];for await(const action of actions){router.get(`/${action}`,h)}',
  enumShadow:'for(const action of ["outer"]){enum action {inner};router.get(`/${action}`,h)}',
};
for(const[name,source]of Object.entries(sources)) console.log(JSON.stringify({name,source,result:resolve(source,'fixture.ts',source.indexOf('router.get'))}));
