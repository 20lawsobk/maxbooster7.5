import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnFixtureCommand} from '../scripts/lib/fixture-command-input.mjs';

test('private fixture archives larger than the Node readFile limit stream to child stdin',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-input-'));
  const file=path.join(directory,'large-sparse-archive');
  const size=2**31+1;
  try {
    fs.closeSync(fs.openSync(file,'w'));
    fs.truncateSync(file,size);
    assert.throws(()=>fs.readFileSync(file),{code:'ERR_FS_FILE_TOO_LARGE'});
    const child=spawnFixtureCommand(process.execPath,['--input-type=module','-e',
      "import fs from 'node:fs';const chunk=Buffer.alloc(65536);let total=0,count;while((count=fs.readSync(0,chunk,0,chunk.length,null))>0)total+=count;console.log(total)"],
    {inputFile:file,env:{PATH:process.env.PATH},encoding:'utf8',timeout:30000,maxBuffer:1024});
    assert.equal(child.status,0,child.stderr);
    assert.equal(Number(child.stdout.trim()),size);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('fixture commands reject ambiguous input sources before opening a file',()=>{
  assert.throws(()=>spawnFixtureCommand(process.execPath,[],{input:'data',inputFile:'/missing'}),/one fixture input source/);
});
