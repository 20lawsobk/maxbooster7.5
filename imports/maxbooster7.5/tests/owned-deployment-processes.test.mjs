import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createOwnedProcessTracker} from '../script/deployment/owned-processes.mjs';
import {runExecutive} from '../script/deployment/executive.mjs';

test('owned stop drains root, catches late detached grandchildren and leaves unrelated processes alone',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-process-proof-'));
  const script=path.join(directory,'fixture.mjs');
  fs.writeFileSync(script,`import fs from 'node:fs';import {spawn} from 'node:child_process';
    const [phase,file]=process.argv.slice(2);const child=(name)=>spawn(process.execPath,[process.argv[1],name,file],{detached:true,stdio:'ignore'});
    if(phase==='root') {const p=child('middle');fs.appendFileSync(file,p.pid+'\\n');process.on('SIGTERM',()=>{const late=child('leaf');fs.appendFileSync(file,late.pid+'\\n');setTimeout(()=>{fs.writeFileSync(file+'.drain','drained');process.exit(0);},100);});}
    else if(phase==='middle'){const p=child('leaf');fs.appendFileSync(file,p.pid+'\\n');process.on('SIGTERM',()=>{});}
    else process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  const pids=path.join(directory,'pids');
  const root=spawn(process.execPath,[script,'root',pids],{detached:true,stdio:'ignore'});
  const control=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
  const tracker=createOwnedProcessTracker(root.pid),controlTracker=createOwnedProcessTracker(control.pid);
  try {
    const deadline=Date.now()+5000;
    while((!fs.existsSync(pids)||fs.readFileSync(pids,'utf8').trim().split('\n').length<2)&&Date.now()<deadline){tracker.capture();await delay(10);}
    assert.ok(fs.existsSync(pids),'actual detached descendants must start');
    tracker.capture();
    const stopped=await tracker.stop({graceMs:300,descendantGraceMs:50,pollMs:5});
    assert.equal(fs.readFileSync(pids+'.drain','utf8'),'drained');
    assert.equal(fs.readFileSync(pids,'utf8').trim().split('\n').length,3,'shutdown-created child must be observed');
    assert.ok(stopped.tracked>=4,'root, detached child and both detached grandchildren tracked');
    assert.deepEqual(stopped.remaining,[]);
    assert.equal(controlTracker.live().length,1,'unrelated process must survive');
  } finally {
    await tracker.stop({graceMs:0,descendantGraceMs:0,pollMs:1});
    await controlTracker.stop({graceMs:0,descendantGraceMs:0,pollMs:1});
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('PID start-time change prevents signalling a recycled identity',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'owned-pid-reuse-'));
  const file=path.join(root,'100/stat');fs.mkdirSync(path.dirname(file));
  const write=start=>{const fields=Array(20).fill('0');fields[0]='S';fields[1]='1';fields[2]='100';fields[19]=String(start);fs.writeFileSync(file,`100 (owned fixture) ${fields.join(' ')}`);};
  const signals=[];
  try {
    write(123);const tracker=createOwnedProcessTracker(100,{procRoot:root,kill:(...args)=>signals.push(args)});
    write(456);
    assert.deepEqual((await tracker.stop({graceMs:0,descendantGraceMs:0,pollMs:1})).remaining,[]);
    assert.deepEqual(signals,[]);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('executive abort stops an observed detached sidecar after graceful application drain',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-executive-proof-'));
  const script=path.join(directory,'application.mjs'),file=path.join(directory,'sidecar.pid');
  fs.writeFileSync(script,`import fs from 'node:fs';import {spawn} from 'node:child_process';
    const p=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});
    fs.writeFileSync(process.argv[2],String(p.pid));process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),80));setInterval(()=>{},1000);`);
  const controller=new AbortController();let sidecar;
  try {
    const running=runExecutive([{id:'application',command:process.execPath,args:[script,file],deps:[],cpu:1,io:0,memoryMB:1,application:true}],{
      signal:controller.signal,pollMs:10,budgetMs:5000,log:()=>{},capacity:()=>({cpus:1,memoryMB:4096,availableMB:4096,ioSlots:1}),
    });
    const deadline=Date.now()+3000;
    while(!fs.existsSync(file)&&Date.now()<deadline)await delay(10);
    assert.ok(fs.existsSync(file),'actual application sidecar must start');
    sidecar=createOwnedProcessTracker(Number(fs.readFileSync(file,'utf8')));
    await delay(100);controller.abort();
    await assert.rejects(running,/Executive interrupted/);
    assert.equal(sidecar.live().length,0);
  } finally {
    controller.abort();await sidecar?.stop({graceMs:0,descendantGraceMs:0,pollMs:1});
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
