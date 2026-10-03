import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer, Agent } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { patchElectronBuilderTransport, inspectElectronBuilderTransport } from "../scripts/patch-electron-builder-transport.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { ElectronDownloadTransport } = require("../packages/electron-download-transport/index.cjs");

function scratch(t, dir = os.tmpdir()) {
  const temp = fs.mkdtempSync(path.join(dir, "security-paths-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  return temp;
}
async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
function consumer(scope) {
  return createRequire(path.join(root, scope, "package.json"));
}
function packageDir(req, name) {
  for (const base of req.resolve.paths(name) ?? []) {
    const dir = path.join(base, name);
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  throw new Error(`Missing ${name}`);
}

test("Electron download native transport preserves redirects, agent, progress and failure cleanup", async t => {
  const temp = scratch(t);
  const payload = Buffer.from("binary payload\0\xff");
  const url = await serve(t, (req, res) => {
    if (req.url === "/redirect") return res.writeHead(302, { location: "/file" }).end();
    if (req.url === "/error") return res.writeHead(503).end("unavailable");
    res.setHeader("content-length", payload.length);
    res.end(payload);
  });
  const agent = new Agent();
  t.after(() => agent.destroy());
  let agentUsed = 0;
  const addRequest = agent.addRequest.bind(agent);
  agent.addRequest = (...args) => { agentUsed++; return addRequest(...args); };
  const progress = [];
  const downloader = new ElectronDownloadTransport();
  const file = path.join(temp, "download");
  await downloader.download(`${url}/redirect`, file, {
    agent: { http: agent }, timeout: { request: 1000 },
    getProgressCallback: async info => { progress.push(info); },
  });
  assert.deepEqual(fs.readFileSync(file), payload);
  assert.equal(agentUsed, 2);
  assert.equal(progress.at(-1).percent, 1);
  assert.equal(progress.at(-1).transferred, payload.length);
  const failed = path.join(temp, "failed");
  await assert.rejects(downloader.download(`${url}/error`, failed),
    error => error.response.statusCode === 503 && error.response.status === 503);
  assert.equal(fs.existsSync(failed), false);
  await assert.rejects(downloader.download(`${url}/file`, file), /EEXIST/);
  assert.deepEqual(fs.readFileSync(file), payload, "pre-existing target must survive");
});

test("artifact timeouts and cancellation bound stalled headers and stalled bodies", async t => {
  const temp = scratch(t);
  const url = await serve(t, (req, res) => {
    if (req.url === "/body") { res.writeHead(200); res.write("partial"); }
  });
  const downloader = new ElectronDownloadTransport();
  for (const endpoint of ["headers", "body"]) {
    const start = performance.now();
    const file = path.join(temp, endpoint);
    await assert.rejects(downloader.download(`${url}/${endpoint}`, file, { timeout: { request: 50 } }),
      error => error.name === "TimeoutError" && error.code === "ETIMEDOUT");
    assert.ok(performance.now() - start < 1000);
    assert.equal(fs.existsSync(file), false);
  }
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(downloader.download(url, path.join(temp, "aborted"), { signal: abort.signal }),
    error => error.name === "AbortError");
});

test("cross-origin artifact redirects cannot forward credentials", async t => {
  let received;
  const destination = await serve(t, (req, res) => { received = req.headers; res.end("ok"); });
  const source = await serve(t, (req, res) => res.writeHead(302, { location: destination }).end());
  const file = path.join(scratch(t), "redirect");
  await new ElectronDownloadTransport().download(source, file, {
    headers: { Authorization: "test-only", Cookie: "test-only", "X-Artifact": "public" },
  });
  assert.equal(received.authorization, undefined);
  assert.equal(received.cookie, undefined);
  assert.equal(received["x-artifact"], "public");
});

test("real Electron packager verifies checksum, downloads via patched transport, then reuses artifact cache", async t => {
  const temp = scratch(t);
  const pkg = consumer("node_modules/app-builder-lib");
  const upstream = pkg("@electron/get");
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageDir(pkg, "@electron/get"), "package.json"))).version, "5.1.0");
  assert.equal(inspectElectronBuilderTransport(root).patched, true, "installed transport must already be patched");
  assert.deepEqual(patchElectronBuilderTransport(root), { installed: true, patched: true });
  assert.deepEqual(patchElectronBuilderTransport(root), { installed: true, patched: true });
  const payload = Buffer.from("electron artifact fixture");
  const digest = createHash("sha256").update(payload).digest("hex");
  let hits = 0;
  const mirror = await serve(t, (req, res) => { hits++; res.end(payload); });
  const { downloadElectronArtifactZip } = pkg("./out/util/electronGet.js");
  const filename = "electron-v43.7.7-linux-x64.zip";
  const options = {
    version: "43.7.7", artifactName: "electron", platformName: "linux", arch: "x64",
    cacheDir: path.join(temp, "cache"),
    electronDownload: { mirrorOptions: { resolveAssetURL: async () => mirror },
      checksums: { [filename]: digest }, downloadOptions: { timeout: { request: 1000 } } },
  };
  const downloaded = await downloadElectronArtifactZip(options);
  assert.deepEqual(fs.readFileSync(downloaded), payload);
  assert.equal(await downloadElectronArtifactZip(options), downloaded);
  assert.equal(hits, 1, "cache reuse should not issue a second artifact request");
  await assert.rejects(upstream.downloadArtifact({
    version: options.version, artifactName: options.artifactName, platform: "linux", arch: "x64",
    cacheRoot: path.join(temp, "wrong-checksum"), checksums: { [filename]: "0".repeat(64) },
    mirrorOptions: options.electronDownload.mirrorOptions, downloader: new ElectronDownloadTransport(),
  }), /checksum/i);
});

test("installed code generators compile each real OpenAPI spec into isolated React-query and Zod outputs", t => {
  for (const workspace of ["external/maxcore", "external/pdim"]) {
    const spec = path.join(root, workspace, "lib/api-spec");
    const temp = scratch(t, spec);
    const output = scratch(t);
    const req = consumer(`${workspace}/lib/api-spec`);
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir(req, "orval"), "package.json")));
    assert.ok(Number(manifest.version.split(".")[1]) >= 33);
    const config = path.join(temp, "config.ts");
    fs.writeFileSync(config, `import original from "../orval.config";\n` +
      `const config = structuredCloneWithoutFunctions(original);\n` +
      `function structuredCloneWithoutFunctions(obj) { return Object.fromEntries(Object.entries(obj).map(([name, value]) => [name, { ...value, input: { ...value.input, target: ${JSON.stringify(path.join(spec, "openapi.yaml"))} }, output: { ...value.output, workspace: ${JSON.stringify(output)} + "/" + name, prettier: false } }])); }\n` +
      `export default config;\n`);
    const cli = path.join(packageDir(req, "orval"), manifest.bin.orval);
    const result = spawnSync(process.execPath, [cli, "--config", config], {
      cwd: spec, timeout: 90000, encoding: "utf8",
    });
    assert.equal(result.status, 0, `${workspace}: ${result.stdout}\n${result.stderr}`);
    for (const generated of ["api-client-react", "zod"]) {
      assert.ok(fs.readdirSync(path.join(output, generated, "generated")).length > 0, generated);
    }
    const esbuild = req("esbuild");
    function validate(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) validate(file);
        else if (entry.name.endsWith(".ts")) {
          esbuild.transformSync(fs.readFileSync(file, "utf8"), { loader: "ts", sourcefile: file });
        }
      }
    }
    validate(output);
  }
});

test("PDIM's installed upload middleware parses multipart bytes and enforces size limits", async t => {
  const req = consumer("external/pdim/artifacts/api-server");
  const express = req("express");
  const multer = req("multer");
  const app = express();
  app.post("/upload", multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 } }).single("file"),
    (request, response) => response.json({ text: request.file.buffer.toString(), name: request.file.originalname }));
  app.use((error, request, response, next) => response.status(400).json({ code: error.code }));
  const url = await serve(t, app);
  const form = new FormData();
  form.append("file", new Blob(["real multipart"]), "sample.txt");
  const response = await fetch(`${url}/upload`, { method: "POST", body: form });
  assert.deepEqual(await response.json(), { text: "real multipart", name: "sample.txt" });
  const large = new FormData();
  large.append("file", new Blob(["a".repeat(100)]), "large.txt");
  const rejected = await fetch(`${url}/upload`, { method: "POST", body: large });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).code, "LIMIT_FILE_SIZE");
});