// Real React DOM transitions in isolated Chromium. API/query fixtures provide
// pending/data states; this verifies component lifecycle, not payment delivery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import WebSocket from "ws";

test("Studio never saves an unread project and permits an empty project only after a successful load", { timeout: 30000 }, async () => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(chromium, "Chromium is required for the actual lifecycle regression");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-save-guard-"));
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {useProjectSync} from './client/src/hooks/useProjectSync.ts';import {useStudioStore} from './client/src/stores/studioStore.ts';
      window.fixture={id:'project-a',mode:'failure',reads:[],writes:[]};
      window.fetch=async(url,options={})=>{if(options.method==='POST'){const data=JSON.parse(options.body);window.fixture.writes.push({url,data});return new Response(JSON.stringify({success:true,projectId:window.fixture.id,persistedStateVersion:data.version,persistedStateMatches:true}));}
      window.fixture.reads.push(url);if(window.fixture.mode==='failure')return new Response('{}',{status:503});if(url.endsWith('/daw-state'))return new Response(JSON.stringify({dawState:window.fixture.mode==='roundtrip'?window.fixture.saved:null}));if(url.endsWith('/tracks'))return new Response(JSON.stringify({tracks:[],clips:[]}));return new Response(JSON.stringify({id:window.fixture.id,title:'Empty verified project'}));};
      function Harness(){window.sync=useProjectSync(window.fixture.id);return React.createElement('div',null,'Studio hook mounted')};const root=createRoot(document.getElementById('app'));window.render=()=>root.render(React.createElement(Harness));window.store=useStudioStore;window.render();`, resolveDir: root, sourcefile: 'studio-sync-regression.tsx' },
    alias: {'@':path.join(root,'client/src')}, bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','import.meta.env.DEV':'false'},
    plugins:[{name:'isolated-hook-services',setup(api){
      api.onResolve({filter:/^@tanstack\/react-query$/},()=>({path:'query',namespace:'fixture'}));
      api.onResolve({filter:/queryClient$/},()=>({path:'csrf',namespace:'fixture'}));
      api.onResolve({filter:/offline\/accountLocalStorage$/},()=>({path:'storage',namespace:'fixture'}));
      api.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='query'?'const client={invalidateQueries(){}};export const useQueryClient=()=>client;':args.path==='csrf'?'export const getCsrfTokenFromCookie=()=>"fixture-csrf";':'export const accountLocalStorage={getItem:()=>null,setItem(){},removeItem(){}};',loader:'js',resolveDir:root}));
    }}],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<div id="app"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${temp}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(new Error("Chromium debugger startup timed out")), 10000);
      browser.stderr.on("data", chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      browser.once("error", error => { clearTimeout(timer); reject(error); });
    });
    const address = new URL(endpoint);
    const targets = await (await fetch(`http://${address.host}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let id = 0;
    const waiting = new Map();
    const errors = [];
    socket.on("message", raw => {
      const message = JSON.parse(raw);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      const pending = waiting.get(message.id);
      if (pending) { waiting.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { waiting.delete(key); reject(new Error(`CDP timed out: ${method}`)); }, 5000);
      waiting.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.text);
      return result.result?.value;
    };
    const contains = async text => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (await evaluate(`Boolean(document.body?.textContent.includes(${JSON.stringify(text)}))`)) return;
        assert.equal(errors.length, 0, errors.join("\n"));
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.fail(`Expected component state: ${text}; errors: ${errors.join("\n")}`);
    };
    await command("Runtime.enable"); await command("Page.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await contains("Studio hook mounted");
    assert.equal(await evaluate('window.sync.forceSave()'),false);
    assert.equal(await evaluate('window.sync.loadProjectData()'),false);
    assert.equal(await evaluate('window.sync.forceSave()'),false);
    assert.deepEqual(await evaluate('window.fixture.writes'),[]);
    assert.equal(await evaluate('window.fixture.reads.length'),1,'A failed saved-state read must not fall through to an empty reconstruction');
    await evaluate('window.fixture.mode="empty-success"');
    assert.equal(await evaluate('window.sync.loadProjectData()'),true);
    assert.equal(await evaluate('window.sync.forceSave()'),true);
    assert.equal(await evaluate('window.fixture.writes.length'),1);
    assert.equal(await evaluate('window.fixture.writes[0].data.title'),'Empty verified project');
    await evaluate(`{
      const state=window.store.getState();window.fixture.track=state.addTrack('audio','Saved inserts');
      const plugin={pluginId:'mb-eq',pluginSlug:'mb-eq',type:'eq',name:'EQ',bypassed:true,parameters:{mid:-6,midFreq:1000}};
      state.addPlugin(window.fixture.track,plugin);state.addPlugin('master',{...plugin,type:'compressor',pluginId:'mb-comp-studio',pluginSlug:'mb-comp-studio'});
    }`);
    assert.equal(await evaluate('window.sync.forceSave()'),true);
    await evaluate(`window.fixture.saved=window.fixture.writes.at(-1).data.dawState;window.fixture.mode='roundtrip';window.store.setState({tracks:[]})`);
    assert.equal(await evaluate('window.sync.loadProjectData()'),true);
    const restored=await evaluate(`({track:window.store.getState().tracks.find(t=>t.id===window.fixture.track)?.plugins[0],master:window.store.getState().masterTrack.plugins[0]})`);
    assert.equal(restored.track.type,'eq');assert.equal(restored.track.bypassed,true);assert.equal(restored.track.parameters.mid,-6);
    assert.equal(restored.master.type,'compressor');assert.equal(restored.master.bypassed,true);
    await evaluate('window.fixture.id="project-b";window.render()');
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await evaluate('window.sync.forceSave()'),false,'Switching project blocks writes until that project is loaded');
    assert.equal(await evaluate('window.fixture.writes.length'),2);
    assert.deepEqual(errors, []);
  } finally {
    socket?.terminate();
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else browser.once("exit", resolve); });
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
