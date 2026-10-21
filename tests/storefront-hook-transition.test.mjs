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

test("Storefront keeps hook order across pending, missing and loaded public/owner states", { timeout: 30000 }, async () => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(chromium, "Chromium is required for the actual lifecycle regression");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "storefront-hooks-"));
  const uiNames = ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle", "Button", "Badge", "Separator"];
  const iconNames = ["Music", "ShoppingCart", "Crown", "Instagram", "Twitter", "Youtube", "ExternalLink", "Check", "Sparkles", "Heart", "Share2", "Play", "Gift", "Tag", "Loader2", "Eye", "EyeOff", "Pencil", "Globe", "Copy", "AlertTriangle", "CheckCircle2", "Star", "UserPlus", "UserCheck", "Pause"];
  const queryModule = `import {useSyncExternalStore} from "react";
    const subscribe=f=>{window.fixture.listeners.add(f);return()=>window.fixture.listeners.delete(f)};
    const snap=()=>window.fixture.version;
    const storefront={id:'store',userId:'owner',name:'Loaded storefront fixture',slug:'fixture',isActive:true,isPublic:true,customization:{},seo:{},user:{username:'creator'}};
    const qc={invalidateQueries(){}};
    export const useQueryClient=()=>qc;
    export const useMutation=()=>({mutate(){},isPending:false});
    export function useQuery(options){useSyncExternalStore(subscribe,snap,snap);
      const stage=window.fixture.stage,key=String(options.queryKey[0]);
      if(key.startsWith('/api/storefront/public/'))return{data:stage==='loaded'?storefront:undefined,isLoading:stage==='loading',isError:stage.startsWith('owner')};
      if(key.startsWith('/api/storefront/preview/'))return{data:stage==='ownerloaded'?{...storefront,isActive:false,isPublic:false}:undefined,isLoading:stage==='ownerloading'};
      return {data:undefined,isLoading:false};
    }`;
  const modules = {
    "@tanstack/react-query": queryModule,
    wouter: "export const useParams=()=>({slug:'fixture'});const nav=()=>{};export const useLocation=()=>['/storefront/fixture',nav];",
    "@/hooks/use-toast": "const toast=()=>{};export const useToast=()=>({toast});",
    "@/hooks/useAuth": "export const useAuth=()=>({user:window.fixture.stage.startsWith('owner')?{id:'owner'}:null});",
    "@/lib/queryClient": "export const apiRequest=()=>{throw Error('Unexpected fixture write')};",
    "lucide-react": iconNames.map(name => `export const ${name}=()=>null;`).join("\n"),
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Storefront from './client/src/pages/Storefront.tsx';window.fixture={stage:'loading',version:0,listeners:new Set()};window.transition=stage=>{window.fixture.stage=stage;window.fixture.version++;for(const f of window.fixture.listeners)f()};createRoot(document.getElementById('app')).render(React.createElement(Storefront));`, resolveDir: root, sourcefile: "storefront-regression.tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-component-fixtures", setup(api) {
      api.onResolve({ filter: /^(?:@tanstack\/react-query|wouter|lucide-react|@\/)/ }, args => ({ path: args.path, namespace: "fixture" }));
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path] ??
        `import React from 'react';${uiNames.map(name => `export const ${name}=({children})=>React.createElement('div',null,children);`).join("\n")}`, resolveDir: root, loader: "js" }));
    } }],
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
    await contains("Opening your storefront");
    for (const [stage, text] of [["loaded", "Loaded storefront fixture"], ["missing", "Storefront Not Found"], ["loaded", "Loaded storefront fixture"], ["ownerloading", "Opening your storefront"], ["ownerloaded", "PREVIEW"]]) {
      await evaluate(`window.transition(${JSON.stringify(stage)})`);
      await contains(text);
    }
    assert.deepEqual(errors, []);
  } finally {
    socket?.terminate();
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else browser.once("exit", resolve); });
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
