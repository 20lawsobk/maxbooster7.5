// Actual installed MaxCore generator consumers, not mocked dependency versions.
// node --test tests/maxcore-dev-dependency-security.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

const scriptsRequire = createRequire(new URL("../external/maxcore/scripts/package.json", import.meta.url));
const puppeteerRequire = createRequire(scriptsRequire.resolve("puppeteer-core"));
const bidiEntry = puppeteerRequire.resolve("chromium-bidi");
const bidiRequire = createRequire(bidiEntry);
const { z } = bidiRequire("zod");
const specRequire = createRequire(new URL("../external/maxcore/lib/api-spec/package.json", import.meta.url));
const orvalRequire = createRequire(specRequire.resolve("orval"));
const typedocRequire = createRequire(orvalRequire.resolve("typedoc"));
const MarkdownIt = typedocRequire("markdown-it");

function manifest(req, name) {
  for (const base of req.resolve.paths(name) ?? []) {
    const file = path.join(base, name, "package.json");
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  throw new Error(`Missing actual dependency ${name}`);
}

test("actual scripts and TypeDoc consumers resolve the compatible patched graph", () => {
  assert.equal(manifest(scriptsRequire, "puppeteer-core").version, "25.13.0");
  assert.equal(manifest(puppeteerRequire, "@puppeteer/browsers").version, "3.2.4");
  assert.equal(manifest(puppeteerRequire, "chromium-bidi").version, "157.0.8090-0");
  assert.equal(manifest(bidiRequire, "zod").version, "4.6.7");
  assert.equal(manifest(typedocRequire, "markdown-it").version, "14.3.3");
});

test("actual BiDi parser handles valid input and reports invalid field paths with its own Zod", async () => {
  const parser = await import(pathToFileURL(path.join(path.dirname(bidiEntry), "protocol-parser/protocol-parser.js")).href);
  const schema = z.object({ value: z.string() });
  assert.deepEqual(parser.parseObject({ value: "ok" }, schema), { value: "ok" });
  assert.throws(() => parser.parseObject({ value: 1 }, schema), error => {
    assert.equal(error.error, "invalid argument");
    assert.match(error.message, /value/);
    assert.equal(error instanceof TypeError, false);
    return true;
  });
});

for (const kind of ["array", "map", "set"]) {
  test(`actual BiDi Zod rejects oversized ${kind} before element traversal`, () => {
    let visits = 0;
    const value = z.preprocess(item => { visits++; return item; }, z.string());
    const schema = kind === "array" ? z.array(value).max(1) :
      kind === "map" ? z.map(z.string(), value).max(1) : z.set(value).max(1);
    const input = kind === "array" ? Array(1000).fill(1) :
      kind === "map" ? new Map(Array.from({ length: 1000 }, (_, i) => [`k${i}`, i])) :
        new Set(Array.from({ length: 1000 }, (_, i) => i));
    const parsed = schema.safeParse(input);
    assert.equal(parsed.success, false);
    assert.equal(visits, 0, "upper-size validation must run before untrusted item traversal");
    assert.equal(parsed.error.issues.length, 1);
    assert.equal(parsed.error.issues[0].code, "too_big");
    const valid = kind === "array" ? ["ok"] : kind === "map" ? new Map([["k", "ok"]]) : new Set(["ok"]);
    assert.equal(schema.safeParse(valid).success, true);
    assert.equal(visits, 1);
  });
}

test("actual TypeDoc Markdown preserves normal rendering and bounds six advisory inputs", { timeout: 20000 }, () => {
  const markdown = new MarkdownIt();
  assert.equal(markdown.render("# Title\n\n[link](https://example.invalid)\n\n- One\n- Two\n"),
    '<h1>Title</h1>\n<p><a href="https://example.invalid">link</a></p>\n<ul>\n<li>One</li>\n<li>Two</li>\n</ul>\n');
  const cases = [
    ...["<!--", "<?x", "<!A", "<![CDATA["].map(token => ({ text: `x ${token}`.repeat(64000), html: true })),
    { text: '[a]: /u "' + "x\n".repeat(100000), html: false },
    { text: "[" + "a\n".repeat(20000), html: false },
  ];
  for (const fixture of cases) {
    const started = performance.now();
    const output = new MarkdownIt({ html: fixture.html }).render(fixture.text);
    assert.ok(output.length > 0);
    assert.ok(performance.now() - started < 10000, "bounded advisory fixture exceeded 10s");
  }
});

test("actual upgraded Puppeteer drives configured Chromium through owned loopback CDP", { timeout: 45000 }, async t => {
  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  assert.ok(executablePath && fs.existsSync(executablePath), "Configured real Chromium is required");
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end('<!doctype html><meta charset="utf-8"><title>Owned browser fixture</title><button id="run">東京 🎵</button><output id="value">idle</output><script>document.querySelector("#run").onclick=()=>document.querySelector("#value").textContent="مرحبا 🎹"</script>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const { default: puppeteer } = await import(pathToFileURL(scriptsRequire.resolve("puppeteer-core")).href);
  const browser = await puppeteer.launch({ executablePath, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const child = browser.process();
  t.after(async () => { if (browser.connected) await browser.close(); });
  try {
    const page = await browser.newPage();
    const response = await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load", timeout: 15000 });
    assert.equal(response.status(), 200);
    assert.match(await browser.version(), /Chrome\/\d+\./);
    assert.equal(await page.title(), "Owned browser fixture");
    assert.equal(await page.$eval("#run", element => element.textContent), "東京 🎵");
    await page.click("#run");
    assert.equal(await page.$eval("#value", element => element.textContent), "مرحبا 🎹");
    const screenshot = await page.screenshot({ type: "png" });
    assert.equal(Buffer.from(screenshot).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(screenshot.length > 1000);
  } finally { await browser.close(); }
  assert.equal(browser.connected, false);
  assert.notEqual(child.exitCode ?? child.signalCode, null, "owned browser process must exit");
});
