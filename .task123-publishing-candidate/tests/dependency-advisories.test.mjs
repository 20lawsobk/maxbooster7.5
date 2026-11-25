import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer, get } from "node:http";
import zlib from "node:zlib";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";

const root = process.cwd();
const scopes = [".", "external/maxcore/artifacts/api-server", "external/pdim/artifacts/api-server"];
const consumer = scope => createRequire(path.join(root, scope, "package.json"));

for (const scope of scopes) {
  test(`${scope}: Express refuses forged forwarding through an invalid mapped trust subnet`, async t => {
    const require = consumer(scope);
    const app = require("express")();
    app.set("trust proxy", "::ffff:10.0.0.0/8");
    app.get("/", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
      headers: { "x-forwarded-for": "203.0.113.99" },
    });
    assert.deepEqual(await response.json(), { ip: "127.0.0.1", ips: [] });
    const proxyaddr = createRequire(require.resolve("express"))("proxy-addr");
    const correct = proxyaddr.compile("::ffff:10.0.0.0/104");
    assert.equal(correct("10.1.2.3"), true);
    assert.equal(correct("203.0.113.99"), false);
  });

  test(`${scope}: compression destroys its native stream when the client aborts`, async t => {
    const require = consumer(scope);
    const streams = [];
    const original = Object.getOwnPropertyDescriptor(zlib, "createGzip");
    Object.defineProperty(zlib, "createGzip", { ...original, value(...args) {
      const stream = original.value(...args);
      streams.push(stream);
      return stream;
    } });
    t.after(() => Object.defineProperty(zlib, "createGzip", original));
    const app = require("express")();
    app.use(require("compression")({ threshold: 0, level: 1 }));
    const payload = randomBytes(256 * 1024);
    app.get("/", (req, res) => {
      res.type("text/plain");
      const timer = setInterval(() => res.write(payload), 10);
      res.once("close", () => clearInterval(timer));
    });
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise((resolve, reject) => {
      const request = get(`http://127.0.0.1:${server.address().port}`, {
        headers: { "accept-encoding": "gzip" },
      }, response => {
        assert.equal(response.headers["content-encoding"], "gzip");
        response.once("data", () => { response.destroy(); resolve(); });
        response.on("error", reject);
      });
      request.on("error", reject);
    });
    for (let i = 0; i < 100 && !streams.every(stream => stream.destroyed); i++) await delay(20);
    assert.equal(streams.length, 1, "the actual compression stream was observed");
    assert.equal(streams[0].destroyed, true);
  });
}

test("PostCSS source maps work and malicious indexed offsets fail promptly", () => {
  const require = consumer(".");
  const sourceMap = createRequire(require.resolve("postcss"))("source-map-js");
  const original = new sourceMap.SourceMapConsumer({
    version: 3, sources: ["input.css"], names: [], mappings: "AAAA", sourcesContent: ["a{}"],
  });
  assert.equal(sourceMap.SourceNode.fromStringWithSourceMap("a{}", original).toString(), "a{}");
  for (const line of [1e10, -1, 1.5]) {
    assert.throws(() => new sourceMap.SourceMapConsumer({
      version: 3, sections: [{ offset: { line, column: 0 },
        map: { version: 3, sources: ["input.css"], names: [], mappings: "AAAA" } }],
    }), /offset/);
  }
});

test("the real typography plugin retains its styles with the patched selector parser", () => {
  const require = consumer(".");
  const typography = require("@tailwindcss/typography")();
  const components = [];
  typography.handler({
    addVariant() {},
    addComponents(value) { components.push(...value); },
    theme: key => key === "typography" ? typography.config.theme.typography : {},
    prefix: value => value,
  });
  assert.ok(components.length > 20);
  assert.ok(components.some(component => Object.hasOwn(component, ".prose")));
  const parser = createRequire(require.resolve("@tailwindcss/typography"))("postcss-selector-parser");
  assert.equal(parser().processSync("article > a::before, .prose h2"), "article > a::before, .prose h2");
  // A separate process enforces a wall-clock bound on the former ~34s CPU attack.
  execFileSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const parser = require(${JSON.stringify(require.resolve("postcss-selector-parser"))});
    const selector = '.a'.repeat(200000);
    assert.equal(parser().processSync(selector), selector);
  `], { timeout: 8000 });
});

test("pino-pretty retains formatting and fast-copy uses controlled depth errors", () => {
  const require = consumer(".");
  const copy = createRequire(require.resolve("pino-pretty"))("fast-copy");
  const value = { message: "ok", nested: { value: 7 } };
  for (const clone of [copy.copy, copy.copyStrict]) {
    assert.deepEqual(clone(value), value);
    assert.notEqual(clone(value).nested, value.nested);
    let deep = {};
    for (let i = 0; i < 2000; i++) deep = { nested: deep };
    assert.throws(() => clone(deep), error => error instanceof copy.MaxDepthExceededError);
  }
  const output = require("pino-pretty").prettyFactory({ colorize: false })({
    level: 30, time: Date.now(), msg: "dependency consumer verified", nested: value,
  });
  assert.match(output, /dependency consumer verified/);
  assert.match(output, /nested/);
  const tfRequire = createRequire(require.resolve("@tensorflow/tfjs"));
  const argparse = tfRequire("argparse");
  const parser = new argparse.ArgumentParser();
  parser.add_argument("--input");
  assert.equal(parser.parse_args(["--input", "model.json"]).input, "model.json");
  assert.throws(() => tfRequire.resolve("sprintf-js"), /Cannot find module/);
});

test("patched Capacitor creates and syncs both platforms with every installed plugin", t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "capacitor-advisories-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({
    name: "max-booster-native-verification", version: "1.0.0",
    dependencies: pkg.dependencies, devDependencies: pkg.devDependencies,
  }));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temp, "node_modules"), "dir");
  fs.mkdirSync(path.join(temp, "web"));
  fs.writeFileSync(path.join(temp, "web/index.html"), "<!doctype html><html><head></head><body></body></html>");
  fs.writeFileSync(path.join(temp, "capacitor.config.json"), JSON.stringify({
    appId: "com.blawzmusic.maxbooster", appName: "Max Booster", webDir: "web",
  }));
  const cli = path.join(root, "node_modules/@capacitor/cli/bin/capacitor");
  for (const platform of ["android", "ios"]) {
    const output = execFileSync(process.execPath, [cli, "add", platform], {
      cwd: temp, encoding: "utf8", timeout: 60000,
    });
    assert.match(output, /platform added/);
    assert.match(output, /@capacitor\/camera/);
    assert.match(output, /@capacitor\/push-notifications/);
  }
  assert.ok(fs.existsSync(path.join(temp, "android/capacitor.settings.gradle")));
  assert.ok(fs.existsSync(path.join(temp, "ios/App/App.xcodeproj/project.pbxproj")));
});
