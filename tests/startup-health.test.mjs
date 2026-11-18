import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { waitForStartup } from "../scripts/startup-health.mjs";

async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  t.after(() => { instance.closeAllConnections(); instance.close(); });
  return instance.address().port;
}
test("gateway readiness waits for a real healthy response, not a fixed delay", async t => {
  let probes = 0;
  const port = await server(t, (_req, res) => {
    const ready = ++probes >= 3;
    res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ gateway: "maxcore-diffusion-gateway", status: "healthy" }));
  });
  await waitForStartup({ mode: "gateway", port, timeoutMs: 1000, intervalMs: 5 });
  assert.equal(probes, 3);
});
test("application readiness requires both the SPA and dependencies", async t => {
  let bootChecks = 0;
  const port = await server(t, (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/boot-status") {
      res.end(JSON.stringify({ ready: ++bootChecks >= 3 }));
    } else res.end(JSON.stringify({ status: "ok", unifiedAwareness: { ready: true } }));
  });
  await waitForStartup({ mode: "application", port, timeoutMs: 1000, intervalMs: 5 });
  assert.ok(bootChecks >= 3);
});
test("boot page polls uncached readiness and fades into the application", async () => {
  const source = await readFile(new URL("../server/index.ts", import.meta.url), "utf8");
  const routeStart = source.indexOf('res.status(200).send(`<!DOCTYPE html>');
  assert.notEqual(routeStart, -1);
  assert.match(source.slice(source.indexOf('app.get("/api/boot-status"', 0), routeStart),
    /res\.setHeader\("Cache-Control", "no-store"\)/);

  const scriptStart = source.indexOf("<script>", routeStart) + "<script>".length;
  const scriptEnd = source.indexOf("</script>", scriptStart);
  assert.ok(scriptStart >= "<script>".length && scriptEnd > scriptStart);
  const script = source.slice(scriptStart, scriptEnd);
  assert.match(source.slice(routeStart, scriptStart), /body\.is-ready\{opacity:0;pointer-events:none\}/);

  const timers = [];
  const fetchOptions = [];
  const replies = [false, true];
  const classes = new Set();
  const replacements = [];
  const screen = { classList: { add: name => classes.add(name) } };
  const context = {
    window: {
      matchMedia: () => ({ matches: false }),
      location: { replace: path => replacements.push(path) },
    },
    document: {
      body: screen,
      getElementById: id => id === "boot-screen" ? screen : null,
    },
    fetch: async (_url, options) => {
      fetchOptions.push(options);
      return { ok: true, json: async () => ({ ready: replies.shift() }) };
    },
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
  };
  vm.runInNewContext(script, context, { timeout: 1000 });

  const flushPromises = () => new Promise(resolve => setImmediate(resolve));
  timers.shift().callback();
  await flushPromises();
  assert.equal(timers.at(-1).delay, 2000);
  timers.at(-1).callback();
  await flushPromises();

  assert.deepEqual(fetchOptions.map(options => options.cache), ["no-store", "no-store"]);
  assert.ok(classes.has("is-ready"));
  assert.deepEqual(replacements, []);
  assert.equal(timers.at(-1).delay, 180);
  timers.at(-1).callback();
  assert.deepEqual(replacements, ["/"]);
});
test("liveness text, malformed JSON and degraded dependencies never count as ready", async t => {
  for (const body of ["starting up", "{", JSON.stringify({ status: "degraded" })]) {
    const port = await server(t, (_req, res) => res.end(body));
    await assert.rejects(waitForStartup({ mode: "application", port, timeoutMs: 35, intervalMs: 5 }), /did not become ready/);
  }
});
test("hung responses have a bounded deadline", async t => {
  const port = await server(t, () => {});
  await assert.rejects(waitForStartup({ mode: "gateway", port, timeoutMs: 40, intervalMs: 5 }), /did not become ready/);
});
test("real boot stub preserves root liveness but reports API unavailability", async t => {
  const reserve = http.createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ["scripts/boot-stub-server.mjs"], {
    env: { PATH: process.env.PATH, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub did not listen")), 3000);
    child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    child.once("error", reject);
  });
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  const ready = await fetch(`http://127.0.0.1:${port}/api/ready`);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).ready, false);
});