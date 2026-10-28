/** Read-only retained-runtime replay. Never writes canonical coverage or combines profiles. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseAstAsync } from 'vite';
import { convert } from 'ast-v8-to-istanbul';
import { validateManifest, validateIstanbul, compareCoverageMaps, createKeepNamesPolicy, sha256 } from '../../../scripts/testing/coverage-provenance.mjs';
const cohort=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(cohort,'../../..'), out=path.join(cohort,'profile');
const receipt=JSON.parse(fs.readFileSync(path.join(out,'receipt.json')));
const baselineFile=path.join(root,'reports/test-verification/coverage/coverage-final.json');
const baselineBytes=fs.readFileSync(baselineFile), global=JSON.parse(baselineBytes), saved=JSON.parse(fs.readFileSync(path.join(out,'coverage-final.json')));
assert.equal(sha256(baselineBytes),receipt.comparison.baselineSha256);
const files=[];
for(const producer of receipt.profiles){
 const directory=path.join(out,producer.producerId), manifestFile=path.join(directory,'manifest.json');
 assert.equal(sha256(fs.readFileSync(manifestFile)),producer.manifestSha256);
 const manifest=JSON.parse(fs.readFileSync(manifestFile));
 assert.equal(validateManifest(manifest,directory,root),true);
 for(const script of manifest.scripts){
  const code=fs.readFileSync(path.join(directory,script.codeFile),'utf8'), sourceMap=script.mapFile?JSON.parse(fs.readFileSync(path.join(directory,script.mapFile))):undefined;
  const ast=await parseAstAsync(code), policy=createKeepNamesPolicy({code,sourceMap,ast});
  assert.deepEqual(receipt.generatedNodePolicies.find(item=>item.scriptId===script.scriptId),{scriptId:script.scriptId,...policy.audit});
  const replay=await convert({code,sourceMap,ast,ignoreNode:policy.ignoreNode,coverage:{url:script.url,functions:script.coverage.functions}});
  for(const[file,raw]of Object.entries(replay)){
   assert.equal(validateIstanbul(raw),true);
   // This is a disk-artifact identity check only. Serialization is not a normalization or merge policy.
   const diskRepresentation=JSON.parse(JSON.stringify(raw));
   assert.deepEqual(diskRepresentation,saved[file]);
   const strict=compareCoverageMaps(global[file],raw), serializedMapDiagnostic=compareCoverageMaps(global[file],diskRepresentation);
   assert.deepEqual({file,...strict},receipt.comparison.files.find(item=>item.file===file));
   const record={file:path.relative(root,file),rawRuntimeValidated:true,savedArtifactReproduced:true,ignoredCompilerNodes:policy.audit.ignoredGeneratedNodes.length,strict,serializedMapDiagnostic};
   if(file.endsWith('/server/config/ports.ts')){
    assert.equal(Object.keys(raw.statementMap).length,21);assert.equal(Object.keys(raw.fnMap).length,3);
    const uncalled=Object.keys(raw.fnMap).find(id=>raw.fnMap[id].name==='loopbackUrl');
    assert.notEqual(uncalled,undefined);assert.equal(raw.f[uncalled],0);
    record.portsOriginalNodes={statements:21,functions:3,uncalledLoopbackUrlCount:raw.f[uncalled]};
   }
   files.push(record);
  }
 }
}
assert.equal(files.length,9);assert.equal(receipt.cleanup.complete,true);assert.deepEqual(receipt.cleanup.remainingLivePids,[]);
assert.equal(sha256(fs.readFileSync(baselineFile)),sha256(baselineBytes));
const audit={schemaVersion:1,scope:'Independent current-source retained-runtime validation/reconversion; disk-serialization comparison is diagnostic only, no profile combination',sourceRevision:receipt.sourceRevision,converter:receipt.converter,canonicalCoverageSha256:sha256(baselineBytes),canonicalCoverageUnchanged:true,profiles:receipt.profiles.length,files,strictCompatibleFiles:files.filter(item=>item.strict.compatible).map(item=>item.file),serializedMapDiagnosticCompatibleFiles:files.filter(item=>item.serializedMapDiagnostic.compatible).map(item=>item.file),ownedCleanupComplete:true,mergedIntoGlobalCoverage:false,productionReady:false};
fs.writeFileSync(path.join(cohort,'profile-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({profiles:audit.profiles,validatedFiles:files.length,strictCompatibleFiles:audit.strictCompatibleFiles,serializedMapDiagnosticCompatibleFiles:audit.serializedMapDiagnosticCompatibleFiles,canonicalCoverageUnchanged:true,ownedCleanupComplete:true}));
