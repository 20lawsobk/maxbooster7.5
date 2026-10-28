/** Run one existing canonical Node suite in a credential-free owned producer. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { sha256, ownedPath, validateManifest, validateIstanbul, compareCoverageMaps, runOwnedCommand, createKeepNamesPolicy } from './coverage-provenance.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2), target = args[0], requested = args[1];
if (!target || !requested || !/^tests\/[\w./-]+\.test\.mjs$/.test(target) || target.includes('..')) throw Error('Use: node scripts/testing/collect-node-coverage.mjs tests/existing.test.mjs reports/owned-output');
// P1 proves this in-process suite only. pg_ctl and other daemonizing fixtures
// require independent-session ownership tracking before admission is safe.
if (target !== 'tests/fabric-replica-generation.test.mjs') throw Error('P1 coverage producer supports only tests/fabric-replica-generation.test.mjs; other suites require independent-session ownership tracking');
const tracked = spawnSync('git', ['ls-files','--',target], { cwd: root, encoding:'utf8' });
if (tracked.status || tracked.stdout.trim() !== target || !/from\s*["']node:test["']/.test(fs.readFileSync(path.join(root,target),'utf8'))) throw Error('Only an existing Git-visible canonical node:test suite is supported');
const output = ownedPath(path.join(root,'reports'), path.resolve(root,requested));
if (fs.existsSync(output)) throw Error('Producer output must be a new owned directory');
fs.mkdirSync(output,{recursive:true,mode:0o700});
const home=path.join(output,'home');fs.mkdirSync(home,{mode:0o700});
function sourceInputs() {
 const list=spawnSync('git',['ls-files','-cz','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});
 if(list.status!==0)throw Error('Cannot inventory current source');
 const files={};
 for(const file of [...new Set(list.stdout.split('\0').filter(Boolean))].sort()){
  if(/^(reports|docs|dist)\//.test(file)||file.split('/').some(part=>['node_modules','__pycache__','.local'].includes(part)))continue;
  if(!/\.(?:[cm]?[jt]sx?|json|py|sh|go|rs|sql|nix|toml|ya?ml)$/.test(file)&&!['.replit','package-lock.json','pnpm-lock.yaml'].includes(file))continue;
  const full=path.join(root,file);if(fs.existsSync(full)&&fs.statSync(full).isFile())files[file]=sha256(fs.readFileSync(full));
 }
 return {scope:'Git-visible code/config files including new source; docs/reports/dist/private ignored state excluded',sha256:sha256(JSON.stringify(files)),files};
}
const inputsBefore=sourceInputs();
const sourceBefore=sha256(fs.readFileSync(path.join(root,target)));
const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:home,TMPDIR:home,LANG:'C',CI:'1',MAXBOOSTER_NODE_COVERAGE_DIR:output,NODE_V8_COVERAGE:path.join(output,'node-native-corroboration')};
if(process.env.LD_LIBRARY_PATH)env.LD_LIBRARY_PATH=process.env.LD_LIBRARY_PATH;
const command=['--import',path.join(root,'scripts/testing/coverage-node-bootstrap.mjs'),'--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',target];
const run=await runOwnedCommand(process.execPath,command,{cwd:root,env,timeoutMs:120000,maxBuffer:8*1024*1024});
fs.writeFileSync(path.join(output,'test.txt'),(run.stdout||'')+(run.stderr||''));
const report={schemaVersion:1,scope:'One existing Node suite; separate UNMERGED profile, not global coverage',command:[process.execPath,...command],sourceRevision:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),test:target,testSha256:sourceBefore,exitCode:run.status,signal:run.signal,timedOut:run.timedOut,bufferExceeded:run.bufferExceeded,cleanup:run.cleanup,status:'collecting',profiles:[],productionReady:false,mergedIntoGlobalCoverage:false};
try{
 if(run.status!==0||run.error||run.timedOut||run.bufferExceeded||!run.cleanup.complete)throw Error('Existing test execution, producer or owned-process cleanup failed');
 const inputsAfter=sourceInputs(); report.sourceInputs={beforeSha256:inputsBefore.sha256,afterSha256:inputsAfter.sha256,unchanged:inputsBefore.sha256===inputsAfter.sha256};
 fs.writeFileSync(path.join(output,'source-inputs.json'),JSON.stringify({before:inputsBefore,after:inputsAfter},null,2));
 if(inputsBefore.sha256!==inputsAfter.sha256||sourceBefore!==sha256(fs.readFileSync(path.join(root,target))))throw Error('Source/configuration changed during execution');
 const [{convert},{parseAstAsync},{default:libCoverage}]=await Promise.all([import('ast-v8-to-istanbul'),import('vite'),import('istanbul-lib-coverage')]);
 const combined=libCoverage.createCoverageMap({});
 for(const member of fs.readdirSync(output).filter(x=>/^\d+-\d+$/.test(x))){
  const directory=path.join(output,member),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  validateManifest(manifest,directory,root);
  report.profiles.push({producerId:manifest.producerId,manifestSha256:sha256(fs.readFileSync(path.join(directory,'manifest.json'))),runtime:manifest.runtime});
  for(const script of manifest.scripts){
   const code=fs.readFileSync(path.join(directory,script.codeFile),'utf8');
   const map=script.mapFile?JSON.parse(fs.readFileSync(path.join(directory,script.mapFile),'utf8')):undefined;
   const ast=await parseAstAsync(code);
   const generatedPolicy=createKeepNamesPolicy({code,sourceMap:map,ast});
   const converted=await convert({code,sourceMap:map,ast,ignoreNode:generatedPolicy.ignoreNode,coverage:{url:script.url,functions:script.coverage.functions}});
   (report.generatedNodePolicies??=[]).push({scriptId:script.scriptId,...generatedPolicy.audit});
   for(const[file,data]of Object.entries(converted)){
    validateIstanbul(data);
    if(combined.files().includes(file)&&!compareCoverageMaps(combined.fileCoverageFor(file).toJSON(),data).compatible)throw Error('Incompatible producer maps for '+file);
    combined.merge({[file]:data});
   }
  }
 }
 if(!combined.files().length)throw Error('No retained executed production source');
 fs.writeFileSync(path.join(output,'coverage-final.json'),JSON.stringify(combined.toJSON()));
 fs.writeFileSync(path.join(output,'coverage-summary.json'),JSON.stringify({total:combined.getCoverageSummary().toJSON(),...Object.fromEntries(combined.files().map(file=>[file,combined.fileCoverageFor(file).toSummary().toJSON()]))},null,2));
 const baseline=path.join(root,'reports/test-verification/coverage/coverage-final.json');
 if(fs.existsSync(baseline)){const global=JSON.parse(fs.readFileSync(baseline,'utf8'));report.comparison={baselineSha256:sha256(fs.readFileSync(baseline)),files:combined.files().map(file=>({file,...(global[file]?compareCoverageMaps(global[file],combined.fileCoverageFor(file).toJSON()):{compatible:false,mismatches:['missing-global-source']})}))};}
 report.converter={package:'ast-v8-to-istanbul',version:JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('ast-v8-to-istanbul')),'../package.json'),'utf8')).version};
 report.status='collected_unmerged';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
finally{fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(report,null,2));fs.rmSync(home,{recursive:true,force:true});}
console.log(JSON.stringify({status:report.status,exitCode:report.exitCode,profiles:report.profiles.length,output:path.relative(root,output)}));
