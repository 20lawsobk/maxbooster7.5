import { resolveFiniteTemplatePath as resolve } from '../scripts/lib/finite-route-paths.mjs';
const cases={
 withScope:'for(const action of ["outer"]){with({action:"inner"}){router.get(`/${action}`,h)}}',
 classicLoopNamedArray:'const actions=["outer"];for(let actions=["inner"];true;){for(const action of actions){router.get(`/${action}`,h)}break}',
 switchNamedArray:'const actions=["outer"];switch(1){case 1: const actions=["inner"];for(const action of actions){router.get(`/${action}`,h)}break}',
 destructuringForIn:'for(const action of ["outer"]){for(const [action] in {inner:1}){router.get(`/${action}`,h)}}',
 destructuringAssignment:'for(const action of ["outer"]){[action]=["inner"];router.get(`/${action}`,h)}',
 namedClassExpression:'for(const action of ["outer"]){const x=class action {static method(){router.get(`/${action}`,h)}}}',
 staticClassExpression:'for(const action of ["outer"]){const x=class action {static {router.get(`/${action}`,h)}}}',
};
for(const[name,source]of Object.entries(cases)) console.log(JSON.stringify({name,source,result:resolve(source,'fixture.ts',source.indexOf('router.get'))}));
