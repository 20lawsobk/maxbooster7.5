// Real React DOM transitions in isolated Chromium. API/query fixtures provide
// pending/data states; this verifies component lifecycle, not payment delivery.
import { test } from "node:test";
import { trackBrowserProcesses } from "./helpers-browser-processes.mjs";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import WebSocket from "ws";

test("Explicit media renderers show errors, retry and preview delivered artifacts in the browser", { timeout: 45000 }, async () => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(chromium, "Chromium is required for the actual lifecycle regression");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "media-renderer-"));
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {LocalMediaRenderer} from './client/src/components/content/LocalMediaRenderer.tsx';
      window.fixture={requests:[],results:[],aborted:false,mode:'failure'};
      window.request=async(method,url,body,options)=>{
        window.fixture.requests.push({method,url,body});
        if(window.fixture.mode==='pending') return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{window.fixture.aborted=true;reject(new Error('aborted'))}));
        if(window.fixture.mode==='failure')throw new Error('Generation unavailable');
        const kind=url.includes('image')?'image':url.includes('audio')?'audio':'video';
        const mediaUrl='/api/storage/file/users/fixture/'+kind;
        const controls=body.dedicated_controls;
        return Response.json({success:true,status:'completed',delivery_status:'durable',url:mediaUrl,job_id:'job-'+kind,
          validation:{artifact_validated:true,quality:'not_evaluated'},capability:{trained:false,kind:{image:'layout',audio:'synthesis',video:'procedural'}[kind]},
          receipt:{url:mediaUrl,job_id:'job-'+kind,durable:true,retrievable:true,sha256:'a'.repeat(64),size_bytes:2048,effective_controls:controls,
          ...(kind!=='audio'?{width:controls.width,height:controls.height}:{}),...(kind!=='image'?{duration:controls.duration_sec}:{})}});
      };
      const root=createRoot(document.getElementById('app'));
      window.mount=()=>root.render(React.createElement('main',null,...['image','audio','video'].map(kind=>React.createElement(LocalMediaRenderer,{kind,key:kind,initialHeadline:'Exact release',onGenerated:result=>window.fixture.results.push(result)}))));
      window.unmount=()=>root.render(null);window.mount();`, resolveDir: root, sourcefile: 'media-renderer-regression.tsx' },
    alias: {'@':path.join(root,'client/src')}, bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'isolated-http-transport',setup(api){
      api.onResolve({filter:/queryClient$/},()=>({path:'http',namespace:'fixture'}));
      api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const apiRequest=(...args)=>window.request(...args);',loader:'js',resolveDir:root}));
    }}],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<div id="app"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${temp}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const stopBrowser = trackBrowserProcesses(browser);
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
    await contains("Create poster");
    await evaluate(`document.querySelector('section[aria-label="Poster layout"] button').click()`);
    await contains("Generation unavailable");
    assert.equal(await evaluate('window.fixture.requests.length'),1,'No automatic retry');
    assert.equal(await evaluate('window.fixture.results.length'),0);
    await evaluate(`window.fixture.mode='success';document.querySelector('section[aria-label="Poster layout"] button').click()`);
    await contains("Download image");
    await evaluate(`document.querySelector('section[aria-label="Instrumental synthesis"] button').click()`);
    await contains("Download audio");
    await evaluate(`document.querySelector('section[aria-label="Promotional clip"] button').click()`);
    await contains("Download video");
    assert.deepEqual(await evaluate('window.fixture.results.map(r=>r.kind)'),['image','audio','video']);
    assert.equal(await evaluate('document.querySelectorAll("img,audio,video").length'),3);
    assert.deepEqual(await evaluate('window.fixture.requests.map(r=>r.url)'),['/api/generate/image','/api/generate/image','/api/generate/audio','/api/generate-video']);
    assert.equal(await evaluate('window.fixture.requests.some(r=>r.body.user_id || r.body.owner_id)'),false);
    await evaluate(`window.fixture.mode='pending';document.querySelector('section[aria-label="Promotional clip"] button').click()`);
    await contains("Creating…");
    await evaluate('window.unmount()');
    const deadline=Date.now()+3000;
    while(!await evaluate('window.fixture.aborted') && Date.now()<deadline)await new Promise(r=>setTimeout(r,30));
    assert.equal(await evaluate('window.fixture.aborted'),true,'Unmount cancels the pending request');
    assert.equal(await evaluate('window.fixture.results.length'),3);
    assert.deepEqual(errors, []);
  } finally {
    socket?.terminate();
    await stopBrowser();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
