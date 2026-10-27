import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { trackBrowserProcesses } from "../helpers-browser-processes.mjs";

// The real React DOM and installed Query v5 execute in an owned browser. Only
// HTTP, toast and error-reporting boundaries are fixtures. This dormant wrapper
// is not evidence that the routed Studio page uses it or that providers work.
describe("StudioLoader with the installed Query client", () => {
  let temp: string, server: http.Server, socket: WebSocket;
  let stopBrowser: () => Promise<unknown>;
  let evaluate: (expression: string) => Promise<any>;
  let collectCoverage: (() => Promise<void>) | undefined;
  let captureCounters: (() => Promise<void>) | undefined;
  let lastActionToastCount = 0;
  const exceptions: string[] = [];
  async function contains(text: string) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      expect(exceptions).toEqual([]);
      if (await evaluate(`Boolean(document.body?.textContent.includes(${JSON.stringify(text)}))`)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Missing rendered state: ${text}; actual: ${await evaluate("document.body?.textContent")}`);
  }
  async function click(text: string) {
    lastActionToastCount = await evaluate("window.fixture.toasts.length");
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`);
  }
  async function toast(title: string) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await evaluate(`window.fixture.toasts.length>${lastActionToastCount}&&window.fixture.toasts.at(-1)?.title===${JSON.stringify(title)}`)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error(`Missing toast: ${title}; actual: ${JSON.stringify(await evaluate("window.fixture.toasts"))}`);
  }
  beforeAll(async () => {
    const root = process.cwd();
    const chromium = [process.env.CHROMIUM_PATH, process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
      .find(value => value && fs.existsSync(value));
    expect(chromium, "Owned Chromium is required; this test never skips a missing browser").toBeTruthy();
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-loader-query-"));
    const bundle = await build({
      stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
        import {withStudioLoader} from './client/src/components/studio/StudioLoader.tsx';
        window.fixture={requests:[],toasts:[],errors:[],projects:'pending',samples:'success',waiters:[],creation:'failure',invalidations:[]};
        window.addEventListener('beforeunload',()=>{debugger;});
        const root=createRoot(document.getElementById('app'));
        const Wrapped=withStudioLoader(({title,userId})=>React.createElement('main',{'data-user-id':userId},title));
        window.mount=()=>{window.client=new QueryClient({defaultOptions:{queries:{gcTime:0}}});
          window.client.setDefaultOptions({queries:{queryFn:async({queryKey})=>{
            const resource=queryKey[0].endsWith('projects')?'projects':'samples';window.fixture.requests.push(resource);
            if(window.fixture[resource]==='pending')await new Promise(resolve=>window.fixture.waiters.push(resolve));
            const mode=window.fixture[resource];if(mode==='missing-message')throw {code:'UPSTREAM_UNAVAILABLE'};
            if(mode!=='success')throw new Error(mode==='network'?'Network offline':mode==='auth'?'401 unauthorized':mode==='timeout'?'Request timeout':'Service unavailable');
            return resource==='projects'?[{id:'owned-project'}]:[{id:'public-sample'}];
          }}});
          const invalidate=window.client.invalidateQueries.bind(window.client);
          window.client.invalidateQueries=async filters=>{window.fixture.invalidations.push(filters.queryKey);const result=await invalidate(filters);sessionStorage.setItem('invalidations',JSON.stringify(window.fixture.invalidations));return result};
          root.render(React.createElement(QueryClientProvider,{client:window.client},React.createElement(Wrapped,{title:'Owned studio controls',userId:'fixture-owner'})));};
        window.remount=async()=>{root.render(null);await new Promise(resolve=>setTimeout(resolve,20));window.client.clear();window.mount()};
        window.unmount=()=>root.render(null);window.mount();`, resolveDir: root, sourcefile: "studio-loader-fixture.tsx" },
      alias: { "@": path.join(root, "client/src") }, bundle: true, write: false, format: "iife", jsx: "automatic",
      sourcemap: "external", sourcesContent: true, outfile: path.join(temp, "fixture.js"),
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [{ name: "studio-loader-boundaries", setup(api) {
        api.onResolve({ filter: /\/use-toast$/ }, () => ({ path: "toast", namespace: "fixture" }));
        api.onResolve({ filter: /\/errorService$/ }, () => ({ path: "errors", namespace: "fixture" }));
        api.onResolve({ filter: /\/queryClient$/ }, () => ({ path: "http", namespace: "fixture" }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "toast"
          ? "const toast=x=>{window.fixture.toasts.push(x);sessionStorage.setItem('toasts',JSON.stringify(window.fixture.toasts))};export const useToast=()=>({toast});"
          : args.path === "errors" ? "export const captureException=(error,context)=>window.fixture.errors.push({message:error.message,context});export const errorService={addBreadcrumb(){}};"
          : "export const apiRequest=async(method,url,body)=>{sessionStorage.setItem('creation',JSON.stringify({method,url,body}));if(window.fixture.creation!=='success')throw Error('Project creation unavailable');return Response.json({id:'new-owned-project'})};" }));
      } }],
    });
    const script = bundle.outputFiles.find(file => file.path.endsWith(".js"))!;
    const sourceMap = bundle.outputFiles.find(file => file.path.endsWith(".js.map"))!;
    server = http.createServer((request, response) => {
      // The precise-coverage offsets and source maps both use the UTF-8 script
      // decoded into JavaScript characters. A default legacy page encoding can
      // change Unicode comment widths and silently corrupt remapped counters.
      response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
      response.end(request.url === "/fixture.js" ? script.text : '<div id="app"></div><script src="/fixture.js"></script>');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = spawn(chromium!, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${temp}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    stopBrowser = trackBrowserProcesses(browser);
    const endpoint = await new Promise<string>((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(Error("Chromium startup timeout")), 10000);
      browser.stderr!.on("data", chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      browser.once("error", error => { clearTimeout(timer); reject(error); });
    });
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    socket = new WebSocket(targets.find((target: any) => target.type === "page").webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let next = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    socket.on("message", raw => {
      const message = JSON.parse(String(raw));
      if (message.method === "Debugger.paused") {
        void (async () => {
          try { await captureCounters?.(); }
          catch (error) { exceptions.push(`Coverage producer: ${String(error)}`); }
          finally { await command("Debugger.resume"); }
        })();
      }
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id); clearTimeout(waiter.timer);
        if (message.error) waiter.reject(Error(message.error.message));
        else waiter.resolve(message.result);
      }
    });
    const command = (method: string, params = {}) => new Promise<any>((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 5000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    evaluate = async expression => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      expect(result.exceptionDetails).toBeUndefined();
      return result.result?.value;
    };
    if (process.env.MAXBOOSTER_STUDIO_COVERAGE_DIR) {
      const output = path.resolve(process.env.MAXBOOSTER_STUDIO_COVERAGE_DIR);
      const snapshots: any[] = [];
      const identities: any[] = [];
      const verifiedScripts = new Map<string, string>();
      const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
      await command("Debugger.enable");
      await command("Profiler.enable");
      await command("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
      captureCounters = async () => {
        const raw = await command("Profiler.takePreciseCoverage");
        const executed = raw.result.filter((entry: any) => entry.url.endsWith("/fixture.js"));
        expect(executed.length, "The actual browser script must have execution counters").toBeGreaterThan(0);
        for (const entry of executed) {
          // A reloaded context may retain zero-count ranges after its script is
          // discarded. Script IDs are unique in this attached debugger; cache
          // only identities actually verified before that context disappeared.
          if (!verifiedScripts.has(entry.scriptId)) {
            const { scriptSource } = await command("Debugger.getScriptSource", { scriptId: entry.scriptId });
            expect(sha(scriptSource), "Executed script bytes must match the source-map input").toBe(sha(script.text));
            verifiedScripts.set(entry.scriptId, sha(scriptSource));
            identities.push({ scriptId: entry.scriptId, url: entry.url, sourceSha256: sha(scriptSource) });
          }
        }
        snapshots.push({ result: executed.map((entry: any) => ({ ...entry, url: pathToFileURL(script.path).href })) });
      };
      collectCoverage = async () => {
        await captureCounters!();
        const [{ convert }, { parseAstAsync }, { default: libCoverage }, { mergeProcessCovs }] = await Promise.all([
          import("ast-v8-to-istanbul"), import("vite"), import("istanbul-lib-coverage"), import("@bcoe/v8-coverage"),
        ]);
        // takePreciseCoverage resets counters. Add only these non-overlapping
        // snapshots of the byte-identical bundle, including its real reload.
        const merged = mergeProcessCovs(snapshots);
        expect(merged.result).toHaveLength(1);
        const executed = merged.result[0];
        const target = path.join(root, "client/src/components/studio/StudioLoader.tsx");
        const map = JSON.parse(sourceMap.text);
        const index = map.sources.findIndex((source: string) => path.resolve(path.dirname(script.path), source) === target);
        expect(index, "The component must have its original source in the map").toBeGreaterThanOrEqual(0);
        expect(sha(map.sourcesContent[index]), "Original source must remain unchanged during browser execution").toBe(sha(fs.readFileSync(target)));
        const converted = await convert({ code: script.text, sourceMap: map,
          ast: parseAstAsync(script.text), coverage: { ...executed, url: pathToFileURL(script.path).href } });
        expect(converted[target], "Real source-map remapping must retain the complete component").toBeTruthy();
        const scoped = libCoverage.createCoverageMap({ [target]: converted[target] });
        fs.mkdirSync(output, { recursive: true });
        const artifacts = { "browser-script.js": script.text, "browser-script.js.map": sourceMap.text,
          "browser-v8.json": JSON.stringify({ snapshots, merged }), "coverage-final.json": JSON.stringify(scoped.toJSON()),
          "coverage-summary.json": JSON.stringify({ total: scoped.getCoverageSummary().toJSON(),
            [target]: scoped.fileCoverageFor(target).toSummary().toJSON() }, null, 2) };
        for (const [name, value] of Object.entries(artifacts)) fs.writeFileSync(path.join(output, name), value);
        fs.writeFileSync(path.join(output, "provenance.json"), JSON.stringify({
          scope: "Actual Chromium source-mapped StudioLoader component only; not merged into global Vitest coverage",
          collectedAt: new Date().toISOString(), source: target, sourceSha256: sha(fs.readFileSync(target)),
          testSha256: sha(fs.readFileSync("tests/unit/studio-loader-browser.test.ts")),
          executedScripts: identities, snapshotCountersResetAfterCollection: true,
          artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, sha(value)])),
        }, null, 2));
      };
    }
    await command("Runtime.enable"); await command("Page.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${(server.address() as any).port}/` });
  }, 20000);
  afterAll(async () => {
    socket?.terminate();
    if (stopBrowser) await stopBrowser();
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (temp) fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }, 15000);

  it("reacts to actual query completion, failure, retry and authentication outcomes", { retry: 0, timeout: 120000 }, async () => {
    await contains("Loading Studio...");
    expect(await evaluate("document.body.textContent.includes('Owned studio controls')")).toBe(false);
    await evaluate("window.fixture.projects='success';window.fixture.waiters.splice(0).forEach(resolve=>resolve())");
    await contains("Owned studio controls");
    expect(await evaluate("document.querySelector('main').dataset.userId")).toBe("fixture-owner");
    await contains("Studio loaded successfully");

    await evaluate("window.fixture.projects='network';window.fixture.samples='network';window.remount()");
    await contains("Connection Problem");
    expect(await evaluate("window.fixture.errors.some(e=>e.context.action==='load-projects')")).toBe(true);
    await click("Back to Dashboard");
    expect(await evaluate("location.pathname")).toBe("/dashboard");
    await click("Create Empty Project");
    await toast("Failed to create project");
    await click("Retry Loading");
    await contains("Retrying in");
    await toast("Some resources failed to load");
    expect(await evaluate("window.fixture.toasts.some(t=>t.title==='Data loaded successfully')")).toBe(false);
    await contains("Connection Problem");
    await evaluate("window.fixture.projects='success';window.fixture.samples='success'");
    await click("Retry Loading");
    await toast("Data loaded successfully");
    await contains("Studio loaded successfully");

    await evaluate("window.fixture.samples='network';window.remount()");
    await contains("Limited Functionality");
    expect(await evaluate("document.body.textContent.includes('Owned studio controls')")).toBe(true);
    expect(await evaluate("document.body.textContent.includes('unavailable: samples')")).toBe(true);
    await evaluate("window.fixture.samples='success'");
    await click("Try to reload missing features");
    await toast("Data loaded successfully");
    await contains("Studio loaded successfully");

    await evaluate("window.fixture.projects='network';window.remount()");
    await contains("Limited Functionality");
    expect(await evaluate("document.body.textContent.includes('unavailable: projects')")).toBe(true);
    await evaluate("window.fixture.projects='success'");
    await click("Try to reload missing features");
    await toast("Data loaded successfully");
    await contains("Studio loaded successfully");

    await evaluate("window.fixture.projects='auth';window.fixture.samples='auth';window.remount()");
    await contains("Authentication Required");
    await click("Go to Login");
    expect(await evaluate("location.pathname+location.search")).toBe("/login?returnUrl=/studio");

    await evaluate("window.fixture.projects='timeout';window.fixture.samples='timeout';window.remount()");
    await contains("Loading Timeout");
    await evaluate("window.fixture.projects='generic';window.fixture.samples='generic';window.remount()");
    await contains("Unable to Load Studio");
    await evaluate("window.fixture.projects='missing-message';window.fixture.samples='generic';window.remount()");
    await contains("Unable to Load Studio");
    expect(await evaluate("window.fixture.errors.at(-1).context.action")).toBe("load-projects");
    await evaluate("window.fixture.projects='success';window.fixture.samples='success';window.fixture.creation='success'");
    await click("Create Empty Project");
    // This is the actual location.reload, with the old observer disposed and
    // the bundle mounted again. A debugger pause in beforeunload retains the
    // preceding context's real counters before navigation discards it.
    await contains("Loading Studio...");
    expect(await evaluate("JSON.parse(sessionStorage.getItem('creation'))")).toEqual({
      method: "POST", url: "/api/studio/projects", body: { title: "Untitled Project", bpm: 120, status: "draft" },
    });
    expect(await evaluate("JSON.parse(sessionStorage.getItem('invalidations'))")).toEqual([
      ["/api/studio/projects"], ["/api/studio/start-hub/summary"], ["/api/projects"],
    ]);
    expect(await evaluate("JSON.parse(sessionStorage.getItem('toasts')).at(-1).title")).toBe("Project created");
    await evaluate("window.fixture.projects='success';window.fixture.waiters.splice(0).forEach(resolve=>resolve())");
    await contains("Studio loaded successfully");
    await evaluate("window.unmount()");
    expect(await evaluate("document.getElementById('app').textContent")).toBe("");
    expect(exceptions).toEqual([]);
    await collectCoverage?.();
  });
});
