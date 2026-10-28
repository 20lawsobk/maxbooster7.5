import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const root=process.cwd(),owned='/tmp/maxbooster-linux-u3f69z18',project=path.join(owned,'project'),artifact=path.join(owned,'out-final/linux-unpacked'),archive=path.join(artifact,'resources/app.asar');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const streamHash=file=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');fs.createReadStream(file).on('data',b=>h.update(b)).on('error',reject).on('end',()=>resolve(h.digest('hex')));});
const selected=['electron/main.js','electron/runtime-policy.cjs','dist/index.mjs','dist/public/index.html'];
const matches=[];
for(const name of selected){const bytes=asar.extractFile(archive,name);assert.equal(hash(bytes),hash(fs.readFileSync(path.join(project,name))));matches.push({path:name,sha256:hash(bytes),bytes:bytes.length});}
const binary=path.join(artifact,'max-booster');
const sharpItems=asar.listPackage(archive).filter(n=>n.startsWith('/node_modules/@img/sharp-')&&(n.endsWith('.node')||n.includes('libvips-cpp.so')));
assert.ok(sharpItems.some(n=>n.endsWith('.node')));assert.ok(sharpItems.some(n=>n.includes('libvips-cpp.so')));
const native=[];
for(const name of sharpItems){const relative=name.slice(1),header=asar.statFile(archive,relative);assert.equal(header.unpacked,true);const physical=archive+'.unpacked/'+relative;assert.ok(fs.statSync(physical).isFile());native.push({path:relative,unpacked:true,bytes:fs.statSync(physical).size,sha256:await streamHash(physical)});}
assert.ok(asar.statFile(archive,'node_modules/@tensorflow/tfjs/package.json'));
const layout={scope:'Configured Linux x64 DIR artifact only; no OS installer, GUI, complete backend or global launch claim',artifactPath:artifact,archiveBytes:fs.statSync(archive).size,archiveSha256:await streamHash(archive),executableBytes:fs.statSync(binary).size,executableSha256:await streamHash(binary),currentOwnedBuildBytesMatch:matches,sharpNativeResources:native,tensorflowPackageIncluded:true,packagedRootManifest:JSON.parse(asar.extractFile(archive,'package.json').toString()),sourceOriginalMatchesOwned: ['electron/main.js','electron/runtime-policy.cjs'].every(n=>hash(fs.readFileSync(path.join(root,n)))===hash(fs.readFileSync(path.join(project,n))))};
fs.writeFileSync('reports/native-linux-rehearsal/2026-10-28-final/artifact-inspection.json',JSON.stringify(layout,null,2)+'\n');
console.log(JSON.stringify({matchedBuildEntries:matches.length,sharpNativeEntries:native.length,sourceOriginalMatchesOwned:layout.sourceOriginalMatchesOwned,archiveBytes:layout.archiveBytes}));
