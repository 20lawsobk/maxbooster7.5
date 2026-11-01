import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const REPO=process.cwd();
const SCANNER=process.env.ENDPOINT_AUDIT_CANDIDATE ?? path.join(REPO,'scripts/audit-endpoints.mjs');

function fixture(t, files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'topology-candidate-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'client/src'),{recursive:true});
  for(const[name,source]of Object.entries(files)) {
    const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
  }
  execFileSync(process.execPath,[SCANNER,'--static'],{cwd:root,env:{PATH:process.env.PATH,HOME:root,TMPDIR:root},encoding:'utf8',timeout:20000});
  assert.equal(fs.existsSync(path.join(root,'SOURCE_EXECUTED')),false,'Discovery must not evaluate source');
  return JSON.parse(fs.readFileSync(path.join(root,'reports/endpoint-audit.json'),'utf8'));
}
const actualFiles={
 'server/routes.ts':`import {writeFileSync} from 'node:fs';writeFileSync('SOURCE_EXECUTED','unsafe');const groups=[{path:'/api/export',loader:()=>import('./routes/export.js')},{path:'/api/fan-hub',loader:()=>import('./routes/fanHub.js')}];`,
 ...Object.fromEntries(['export','durableExports','fanHub'].map(name=>['server/routes/'+name+'.ts',fs.readFileSync(path.join(REPO,'server/routes',name+'.ts'),'utf8')])),
};

test('Actual durable exports inherit their canonical nested /api/export mount',t=>{
 const report=fixture(t,actualFiles);
 for(const[method,rawPath]of [['POST','/jobs/:jobId/:action'],['DELETE','/history/:id']]) {
  const rows=report.backendRoutes.filter(row=>row.file==='server/routes/durableExports.ts'&&row.method===method&&row.rawPath===rawPath);
  assert.equal(rows.length,1);assert.equal(rows[0].fullPath,'/api/export'+rawPath);assert.equal(rows[0].processScope,'main-app');
 }
});

test('Actual Fan Hub finite template yields all four concrete public method/action paths',t=>{
 const report=fixture(t,actualFiles);
 const rows=report.backendRoutes.filter(row=>row.file==='server/routes/fanHub.ts'&&row.resolvedVia==='finite-loop-template');
 assert.deepEqual(rows.map(row=>`${row.method} ${row.fullPath}`).sort(),[
  'GET /api/fan-hub/consent/:token','GET /api/fan-hub/unsubscribe/:token',
  'POST /api/fan-hub/consent/:token','POST /api/fan-hub/unsubscribe/:token',
 ]);
 assert.equal(report.backendRoutes.some(row=>row.fullPath.includes('${')),false);
});

test('Every source-proven alias of a nested child router is preserved',t=>{
 const report=fixture(t,{
  'server/index.ts':`import r from './routes/root';const app=express();app.use('/one',r);app.use('/two',r);`,
  'server/routes/root.ts':`import c from './child';const router=Router();router.use('/nested',c);export default router;`,
  'server/routes/child.ts':`const router=Router();router.get('/leaf',handler);export default router;`,
 });
 assert.deepEqual(report.backendRoutes.filter(row=>row.file.endsWith('/child.ts')).map(row=>row.fullPath).sort(),['/one/nested/leaf','/two/nested/leaf']);
 assert.deepEqual(report.mountedRouters.find(row=>row.file==='server/routes/child.ts').contexts.map(row=>row.prefix).sort(),['/one/nested','/two/nested']);
});

test('Identical shared-router paths in separate application processes remain distinct',t=>{
 const report=fixture(t,{
  'server/index.ts':`import r from './routes/child';const app=express();app.use('/same',r);app.listen(5000);`,
  'server/sidecar.ts':`import r from './routes/child';const serviceApp=express();serviceApp.use('/same',r);serviceApp.listen(9000);`,
  'server/routes/child.ts':`const router=Router();router.get('/leaf',handler);export default router;`,
 });
 assert.deepEqual(report.backendRoutes.filter(row=>row.file.endsWith('/child.ts')).map(row=>({path:row.fullPath,scope:row.processScope})).sort((a,b)=>a.scope.localeCompare(b.scope)),[
  {path:'/same/leaf',scope:'main-app'},{path:'/same/leaf',scope:'standalone:server/sidecar.ts'},
 ]);
});

test('Cycles terminate with an explicit mount diagnostic rather than unlimited invented paths',t=>{
 const report=fixture(t,{
  'server/index.ts':`import r from './routes/root';const app=express();app.use('/api',r);`,
  'server/routes/root.ts':`import c from './child';const router=Router();router.use('/nested',c);router.get('/root',handler);export default router;`,
  'server/routes/child.ts':`import r from './root';const router=Router();router.use('/again',r);router.get('/leaf',handler);export default router;`,
 });
 assert.ok(report.backendRoutes.length<10);
 assert.ok(report.unresolvedDynamic.some(row=>row.reason==='mount-cycle-or-depth-limit'));
});

test('Unknown runtime templates and shadowed loop names never become literal high-confidence routes',t=>{
 const report=fixture(t,{
  'server/index.ts':`import r from './routes/root';const app=express();app.use('/api',r);`,
  'server/routes/root.ts':`const router=Router();router.get(\`/\${runtimeValue}/:id\`,handler);for(const action of ['safe'] as const){function deferred(action){router.post(\`/\${action}/:id\`,handler)}}export default router;`,
 });
 assert.equal(report.backendRoutes.some(row=>row.fullPath.includes('${')),false);
 assert.equal(report.unresolvedDynamic.filter(row=>row.reason==='unresolved-template-path').length,2);
});

test('Unmounted child modules are retained with explicit unresolved topology',t=>{
 const report=fixture(t,{
  'server/routes/root.ts':`import c from './child';const router=Router();router.use('/relative',c);export default router;`,
  'server/routes/child.ts':`const router=Router();router.get('/leaf',handler);export default router;`,
 });
 const row=report.backendRoutes.find(row=>row.file.endsWith('/child.ts'));
 assert.equal(row.confidence,'unmounted-or-unresolved');assert.equal(row.fullPath,'/leaf');
});

test('Unknown interpolated mount prefixes remain explicit rather than literal complete URLs',t=>{
 const report=fixture(t,{
  'server/index.ts':`import r from './routes/child';const app=express();app.use(\`/api/\${runtimePrefix}\`,r);`,
  'server/routes/child.ts':`const router=Router();router.get('/leaf',handler);export default router;`,
 });
 const row=report.backendRoutes.find(row=>row.file.endsWith('/child.ts'));
 assert.equal(row.confidence,'unmounted-or-unresolved');
 assert.ok(report.unresolvedDynamic.some(row=>row.reason==='unresolved-template-mount-prefix'));
});
