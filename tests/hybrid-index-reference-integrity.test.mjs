import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the committed loadIndex method from the actual TypeScript AST.
const source = fs.readFileSync('server/services/hybridStorageService.ts', 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'HybridStorageService');
assert.ok(service, 'HybridStorageService exists');
const method = service.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === 'loadIndex');
assert.ok(method, 'loadIndex exists');
const js = ts.transpileModule('class TestStorage { ' + method.getText(ast) + ' }; globalThis.TestStorage = TestStorage;', {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None},
}).outputText;

function metadata(key, {userId='owner', hash='same-content', isPublic=false, isDeduplicated=false, deduplicationRef}={}) {
  return {key, originalName:'track.wav', mimeType:'audio/wav', sizeBytes:3, compressedSize:3,
    tier:'cold', location:'pocket-dimension', contentHash:hash, accessCount:0,
    lastAccessed:'2026-10-26T00:00:00.000Z', createdAt:'2026-10-26T00:00:00.000Z',
    userId, isPublic, isDeduplicated, ...(deduplicationRef ? {deduplicationRef} : {})};
}
function goodIndex() {
  const primary=metadata('users/owner/primary');
  const duplicate=metadata('users/buyer/alias',{userId:'buyer',isPublic:true,isDeduplicated:true,deduplicationRef:primary.key});
  return {files:{[primary.key]:primary,[duplicate.key]:duplicate},
    contentHashes:{'same-content':[primary.key,duplicate.key]},
    // Legacy public pointer may reference a private primary containing identical bytes.
    publicHashes:{'same-content':primary.key}};
}
function setup(record=goodIndex(), readError=null) {
  const calls=[];
  const ctx=vm.createContext({getPdimClient:()=>({get:async key=>{
    calls.push(key);
    if(readError)throw readError;
    return record === null ? null : JSON.stringify(record);
  }}),logger:{info(){}}});
  vm.runInContext(js,ctx);
  const s=new ctx.TestStorage();
  s.fileIndex=new Map([['preserved',{userId:'preserved'}]]);
  s.contentHashIndex=new Map([['old',['preserved']]]);
  s.publicContentHashes=new Map([['old','preserved']]);
  return {s,calls};
}
async function rejectedWithoutMutation(record, description) {
  const {s,calls}=setup(record);
  await assert.rejects(()=>s.loadIndex(), /Failed to load hybrid storage ownership index/,description);
  assert.equal(s.fileIndex.has('preserved'),true);
  assert.equal(s.contentHashIndex.has('old'),true);
  assert.equal(s.publicContentHashes.has('old'),true);
  assert.deepEqual(calls,['hybrid:storage:index']);
}

test('valid primary and cross-account public duplicate survive index load',async()=>{
  const {s}=setup(); await s.loadIndex();
  assert.equal(s.fileIndex.size,2);
  assert.equal(s.fileIndex.get('users/buyer/alias').deduplicationRef,'users/owner/primary');
  assert.equal(s.publicContentHashes.get('same-content'),'users/owner/primary');
});
test('authoritative null is a legitimate empty index',async()=>{
  const {s}=setup(null); await s.loadIndex(); assert.equal(s.fileIndex.size,0);
});
test('PDIM read errors fail closed without overwriting prior maps',async()=>{
  const {s}=setup(goodIndex(),new Error('simulated PDIM outage'));
  await assert.rejects(()=>s.loadIndex(),/Failed to load hybrid storage ownership index/);
  assert.equal(s.fileIndex.has('preserved'),true);
});
test('missing dedup primary rejects index',async()=>{
  const p=goodIndex();delete p.files['users/owner/primary'];delete p.contentHashes['same-content'];
  await rejectedWithoutMutation(p,'missing primary');
});
test('chained dedup references reject index',async()=>{
  const p=goodIndex();p.files['users/owner/primary'].isDeduplicated=true;
  p.files['users/owner/primary'].deduplicationRef='users/buyer/alias';
  await rejectedWithoutMutation(p,'chained references');
});
test('dedup content hash mismatch rejects index',async()=>{
  const p=goodIndex();p.files['users/buyer/alias'].contentHash='different';
  await rejectedWithoutMutation(p,'hash mismatch');
});
test('self-referencing dedup rejects index',async()=>{
  const p=goodIndex();p.files['users/buyer/alias'].deduplicationRef='users/buyer/alias';
  await rejectedWithoutMutation(p,'self ref');
});
test('wrong content hash bucket rejects index',async()=>{
  const p=goodIndex();p.contentHashes={'wrong-hash':['users/owner/primary','users/buyer/alias']};
  await rejectedWithoutMutation(p,'wrong hash bucket');
});
test('duplicate key in same hash bucket rejects index',async()=>{
  const p=goodIndex();p.contentHashes['same-content'].push('users/buyer/alias');
  await rejectedWithoutMutation(p,'duplicate key');
});
test('public content pointer with wrong hash rejects index',async()=>{
  const p=goodIndex();p.publicHashes={'wrong-hash':'users/owner/primary'};
  await rejectedWithoutMutation(p,'wrong public hash');
});
test('invalid public content pointer rejects index',async()=>{
  const p=goodIndex();p.publicHashes={'same-content':'users/outsider/missing'};
  await rejectedWithoutMutation(p,'missing public ref');
});

test('missing deduplicated alias in hash index rejects recovery without mutation',async()=>{
  const p=goodIndex();
  p.contentHashes['same-content']=['users/owner/primary'];
  await rejectedWithoutMutation(p,'unindexed alias must not permit primary deletion');
});
test('missing primary in hash index rejects recovery without mutation',async()=>{
  const p=goodIndex();
  p.contentHashes['same-content']=['users/buyer/alias'];
  await rejectedWithoutMutation(p,'unindexed primary must not be accepted');
});
test('missing complete hash bucket rejects recovery without mutation',async()=>{
  const p=goodIndex();
  p.contentHashes={};
  await rejectedWithoutMutation(p,'unindexed files must not be accepted');
});
test('independent unindexed file rejects recovery without mutation',async()=>{
  const p=goodIndex();
  p.files['users/other/unindexed']=metadata('users/other/unindexed',{userId:'other',hash:'other-content'});
  await rejectedWithoutMutation(p,'unindexed independent file must not be accepted');
});


// Exercise the committed upload() method, not a hand-written duplicate.
// Hash-bucket iteration order is not a guarantee of primary-byte ownership.
const uploadMethod = service.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === 'upload');
assert.ok(uploadMethod, 'upload method exists');
const uploadJs = ts.transpileModule(
  'class TestUpload { ' + uploadMethod.getText(ast) + ' }; globalThis.TestUpload = TestUpload;',
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}},
).outputText;

function setupUpload(bucketKeys, entries) {
  const ctx=vm.createContext({logger:{info(){}}});
  vm.runInContext(uploadJs,ctx);
  const s=new ctx.TestUpload();
  let writes=0, physicalWrites=0;
  s.fileIndex=new Map(entries.map(e=>[e.key,e]));
  s.contentHashIndex=new Map([['same-content',[...bucketKeys]]]);
  s.publicContentHashes=new Map();
  s.initialize=async()=>{};
  s.computeContentHash=()=> 'same-content';
  s.generateFileKey=()=> 'users/new/new';
  s.saveIndex=async()=>{writes++};
  s.coldPocket={write:async()=>{physicalWrites++;return {compressedSize:3}}};
  return {s,counts:()=>({writes,physicalWrites})};
}

test('upload-time deduplication resolves primary even when restored bucket lists alias first',async()=>{
  const primary=metadata('users/owner/primary');
  const alias=metadata('users/buyer/alias',{userId:'buyer',isDeduplicated:true,deduplicationRef:primary.key});
  const {s,counts}=setupUpload([alias.key,primary.key],[primary,alias]);
  const result=await s.upload('new','new.wav',{length:3},'audio/wav');
  assert.equal(result.isDeduplicated,true);
  assert.equal(s.fileIndex.get(result.key).deduplicationRef,primary.key);
  assert.equal(s.fileIndex.get(result.key).isDeduplicated,true);
  assert.equal(s.contentHashIndex.get('same-content').length,3);
  assert.deepEqual(counts(),{writes:1,physicalWrites:0});
});

test('public upload points public content hash at concrete primary, not alias',async()=>{
  const primary=metadata('users/owner/primary');
  const alias=metadata('users/buyer/alias',{userId:'buyer',isDeduplicated:true,deduplicationRef:primary.key});
  const {s}=setupUpload([alias.key,primary.key],[primary,alias]);
  const result=await s.upload('new','new.wav',{length:3},'audio/wav',{isPublic:true});
  assert.equal(s.fileIndex.get(result.key).deduplicationRef,primary.key);
  assert.equal(s.publicContentHashes.get('same-content'),primary.key);
});

test('missing primary refuses upload without creating a dangling alias or persisting',async()=>{
  const alias=metadata('users/buyer/alias',{userId:'buyer',isDeduplicated:true,deduplicationRef:'users/owner/missing'});
  const {s,counts}=setupUpload([alias.key],[alias]);
  await assert.rejects(()=>s.upload('new','new.wav',{length:3},'audio/wav'),/no primary byte owner/);
  assert.equal(s.fileIndex.size,1);
  assert.equal(s.fileIndex.has('users/new/new'),false);
  assert.deepEqual(counts(),{writes:0,physicalWrites:0});
});

test('normal primary-first upload deduplicates without physical rewrite',async()=>{
  const primary=metadata('users/owner/primary');
  const {s,counts}=setupUpload([primary.key],[primary]);
  const result=await s.upload('new','new.wav',{length:3},'audio/wav');
  assert.equal(s.fileIndex.get(result.key).deduplicationRef,primary.key);
  assert.deepEqual(counts(),{writes:1,physicalWrites:0});
});
