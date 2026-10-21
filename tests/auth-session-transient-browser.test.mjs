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

test("AuthProvider preserves verified identity and avoids false sign-out during session throttling", { timeout: 30000 }, async () => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(chromium, "Chromium is required for the actual lifecycle regression");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "auth-transient-"));
  const modules={
    "@/lib/queryClient":"export const apiRequest=async()=>new Response('{}');export const setAuthToken=()=>{};export const clearAuthToken=()=>{};export const getAuthToken=()=>null;export const getCsrfTokenFromCookie=()=>null;",
    "@/contexts/ThemeContext":"export const useTheme=()=>({acceptAccountTheme(){}});",
    "@/lib/offline/identity":"export const offlineIdentity=()=>({owner:window.fixture.owner,epoch:0});export const setOfflineIdentity=owner=>{window.fixture.owner=owner};",
    "@/lib/offline":"export const draftStorage={destroy(){}};export const offlineCache={clearPrivateData:async()=>{},destroy(){}};export const offlineQueue={close(){}};export const syncManager={pause(){}};",
    "@/lib/idbPersister":"export const clearPrivateQueryCache=async()=>{};",
    "@/hooks/use-toast":"export const toast=()=>{};",
    "@/lib/offline/accountCoordinator":"export const acquireAccountLease=async()=>{};export const changeAccount=fn=>fn();export const registerAccountCleanup=()=>()=>{};",
    "@/lib/offline/studioOfflineLifecycle":"export const resetStudioOfflineState=async()=>{};",
  };
  const bundle=await build({stdin:{contents:`import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {AuthProvider,useAuth} from './client/src/components/auth/AuthProvider.tsx';
    window.fixture={owner:null,throttle:false,reads:0,redirects:0};window.fetch=async url=>{if(String(url).includes('/api/auth/me')){window.fixture.reads++;if(window.fixture.throttle){window.fixture.throttle=false;return new Response('{}',{status:429,headers:{'Retry-After':'1'}})}return new Response(JSON.stringify({id:'owner'}));}return new Response('{}');};
    function Probe(){const auth=useAuth();window.auth=auth;useEffect(()=>{if(!auth.isLoading&&!auth.user)window.fixture.redirects++},[auth.isLoading,auth.user]);return React.createElement('div',null,auth.user?'verified:'+auth.user.id:auth.isLoading?'checking session':'anonymous');}
    const root=createRoot(document.getElementById('app'));let generation=0;window.mount=(throttle)=>{window.fixture.owner=null;window.fixture.throttle=throttle;window.fixture.redirects=0;window.fixture.reads=0;window.qc=new QueryClient({defaultOptions:{queries:{queryFn:async()=>({})}}});root.render(React.createElement(QueryClientProvider,{client:window.qc,key:++generation},React.createElement(AuthProvider,null,React.createElement(Probe))));};window.mount(false);`,resolveDir:root,sourcefile:'auth-transient-fixture.tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'private-io-fixtures',setup(api){api.onResolve({filter:/^@\//},args=>modules[args.path]?{path:args.path,namespace:'fixture'}:{path:path.join(root,'client/src',args.path.slice(2)+'.ts')});api.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js',resolveDir:root}));}}],
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
    await contains('verified:owner');
    await evaluate('window.fixture.throttle=true;void window.qc.invalidateQueries({queryKey:["/api/auth/me"]})');
    await contains('Session verification is temporarily unavailable');
    assert.equal(await evaluate('window.auth.user.id'),'owner');
    assert.equal(await evaluate('window.fixture.redirects'),0);
    const recovered=Date.now()+5000;
    while(Date.now()<recovered&&await evaluate('Boolean(document.querySelector("[role=alert]"))'))await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'),false);
    await evaluate('window.mount(true)');
    await contains('Session verification is temporarily unavailable');
    assert.equal(await evaluate('window.auth.isLoading'),true);
    assert.equal(await evaluate('window.fixture.redirects'),0);
    await contains('verified:owner');
    assert.equal(await evaluate('window.fixture.redirects'),0);
    assert.deepEqual(errors, []);
  } finally {
    socket?.terminate();
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else browser.once("exit", resolve); });
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
