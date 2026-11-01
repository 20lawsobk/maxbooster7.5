/** Real Chromium, React DOM and installed Query v5; owned HTTP/auth/layout boundaries.
 * node --test tests/account-analytics-browser.test.mjs
 * This verifies the routed component's behavior, not provider data delivery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { trackBrowserProcesses } from "./helpers-browser-processes.mjs";

test("AI analytics page renders honest measured, insufficient, failure and account-transition states", { timeout: 40000 }, async t => {
  const root = process.cwd(), chromium = [process.env.CHROMIUM_PATH, process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(binary => binary && fs.existsSync(binary));
  assert.ok(chromium, "Actual Chromium is required; missing browser is not a pass");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "account-analytics-browser-"));
  let server, socket, stopBrowser;
  t.after(async () => {
    socket?.terminate(); try { await stopBrowser?.(); } finally {
      try { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
      finally { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    }
  });
  const auth = `import {useSyncExternalStore} from 'react';
    const subscribe=f=>{window.fixture.listeners.add(f);return()=>window.fixture.listeners.delete(f)};
    export const useRequireSubscription=()=>{useSyncExternalStore(subscribe,()=>window.fixture.version);return{user:window.fixture.user,isLoading:window.fixture.authLoading}};`;
  const modules = {
    "@/hooks/useRequireAuth": auth,
    "@/components/layout/AppLayout": "import React from 'react';export const AppLayout=({children,title,subtitle})=>React.createElement('main',null,React.createElement('h2',null,title),React.createElement('p',null,subtitle),children);",
    "@/lib/queryClient": "export const getCsrfTokenFromCookie=()=>document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.slice(11);",
  };
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import AIDashboard from './client/src/pages/analytics/AIDashboard.tsx';
      window.fixture={user:{id:'owner-a'},authLoading:true,version:0,listeners:new Set()};
      window.setAuth=(user,loading=false)=>{window.fixture.user=user;window.fixture.authLoading=loading;window.fixture.version++;for(const f of window.fixture.listeners)f()};
      const root=createRoot(document.getElementById('app'));window.client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
      root.render(React.createElement(QueryClientProvider,{client:window.client},React.createElement(AIDashboard)));window.unmount=()=>root.unmount();`,
    resolveDir: root, sourcefile: "account-analytics-browser-fixture.tsx" },
    alias: { "@": path.join(root, "client/src") }, bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "owned-analytics-ui-boundaries", setup(api) {
      api.onResolve({ filter: /^@\// }, args => Object.hasOwn(modules, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path], resolveDir: root, loader: "js" }));
    } }],
  });
  const ready = { status: "ready", insight: "280 recorded streams across seven measured days. Listener observations are not unique listeners.",
    method: { name: "observed_summary" }, publicContext: { status: "ready" }, generatedAt: "2026-10-27T12:00:00Z",
    dataWindow: { start: "2026-10-20", end: "2026-10-27", dataPoints: 7 } };
  const requests = [], held = [];
  let mode = "pending", responseBody = ready;
  const respond = response => {
    response.statusCode = mode === "outage" ? 503 : mode === "html-error" ? 500 : 200;
    response.setHeader("Content-Type", mode === "html-error" ? "text/html; charset=utf-8" : "application/json; charset=utf-8");
    response.end(mode === "outage" ? JSON.stringify({ error: "Owned analytics upstream unavailable" }) :
      mode === "html-error" ? "<h1>Owned upstream failed</h1>" : mode === "invalid" ? "{}" : JSON.stringify(responseBody));
  };
  server = http.createServer((request, response) => {
    if (request.url === "/api/ai/analytics/insights") {
      requests.push({ method: request.method, headers: request.headers });
      if (mode === "pending") held.push(response); else respond(response);
    } else if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8"); response.end(bundle.outputFiles[0].text);
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8"); response.setHeader("Set-Cookie", "csrf-token=owned-csrf; SameSite=Strict; Path=/");
      response.end('<!doctype html><meta charset="utf-8"><div id="app"></div><script src="/fixture.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${temp}`, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
  stopBrowser = trackBrowserProcesses(browser);
  const endpoint = await new Promise((resolve, reject) => {
    let log = ""; const timer = setTimeout(() => reject(Error("Owned Chromium startup timeout")), 10000);
    browser.stderr.on("data", chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); } });
    browser.once("error", error => { clearTimeout(timer); reject(error); });
  });
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const exceptions = [], waiters = new Map(); let nextId = 0;
  socket.on("message", raw => {
    const message = JSON.parse(String(raw));
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    const waiter = waiters.get(message.id);
    if (waiter) { waiters.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { waiters.delete(id); reject(Error(`CDP timeout ${method}`)); }, 5000);
    waiters.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined); return result.result?.value;
  };
  const contains = async text => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      assert.deepEqual(exceptions, []);
      if (await evaluate(`Boolean(document.body?.textContent.includes(${JSON.stringify(text)}))`)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail(`Expected ${text}; actual ${await evaluate("document.body.textContent")}`);
  };
  const click = () => evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Generate analysis')).click()");
  await command("Runtime.enable"); await command("Page.enable");
  await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  await contains("Loading AI analytics"); assert.equal(requests.length, 0, "Pending authentication must not request private analytics");
  await evaluate("window.setAuth({id:'owner-a'})"); await contains("MaxCore is summarizing");
  assert.equal(await evaluate("document.querySelector('button').disabled"), true);
  assert.equal(requests[0].method, "POST"); assert.equal(requests[0].headers["x-csrf-token"], "owned-csrf");
  assert.match(requests[0].headers.cookie, /csrf-token=owned-csrf/);
  mode = "ready"; held.splice(0).forEach(respond); await contains("280 recorded streams");
  await contains("does not establish causes or guarantee future performance");
  await contains("beginning 2026-10-20 and ending before 2026-10-27 (UTC)");
  assert.equal(await evaluate("document.body.textContent.includes('Public trend context is currently unavailable')"), false);
  mode = "outage"; await click(); await contains("Owned analytics upstream unavailable");
  assert.equal(await evaluate("document.body.textContent.includes('280 recorded streams')"), false);
  mode = "invalid"; await click(); await contains("MaxCore returned an invalid analytics summary");
  mode = "ready"; responseBody = { ...ready, status: "insufficient_history", insight: "No recorded observations; missing days are unknown.",
    publicContext: { status: "unavailable" }, dataWindow: { ...ready.dataWindow, dataPoints: 0 } };
  await click(); await contains("More recorded history is needed"); await contains("Public trend context is currently unavailable");
  assert.equal(await evaluate("document.body.textContent.includes('0 streams')"), false);
  mode = "html-error"; await click(); await contains("HTTP 500");
  mode = "pending"; responseBody = { ...ready, insight: "Independent owner B summary" };
  const before = requests.length; await evaluate("window.setAuth({id:'owner-b'})"); await contains("MaxCore is summarizing");
  assert.equal(requests.length, before + 1, "A new account must use its own query cache entry");
  assert.equal(await evaluate("document.body.textContent.includes('No recorded observations')"), false);
  mode = "ready"; held.splice(0).forEach(respond); await contains("Independent owner B summary");
  await evaluate("window.setAuth(null)");
  const deadline = Date.now() + 3000;
  while (await evaluate("document.body.textContent.includes('Independent owner B summary')")) {
    assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(requests.length, before + 1, "Logout must not issue a private analytics request");
  await evaluate("window.unmount()"); assert.deepEqual(exceptions, []);
});
