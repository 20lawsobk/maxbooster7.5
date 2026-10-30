import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const currentFile = fileURLToPath(import.meta.url);

async function uploadProbe(scope) {
  const require = createRequire(`${root}/${scope}/package.json`);
  const multer = require("multer");
  let finishFilter;
  let filterReady;
  const pendingFilter = new Promise(resolve => { filterReady = resolve; });
  let handleCalls = 0;
  let finishUpload;
  const uploadFinished = new Promise(resolve => { finishUpload = resolve; });
  const upload = multer({
    storage: {
      _handleFile(req, file, callback) { handleCalls++; callback(null, {}); },
      _removeFile(req, file, callback) { callback(); },
    },
    fileFilter(req, file, callback) { finishFilter = callback; filterReady(); },
  }).single("file");
  const server = createServer((req, res) => {
    if (req.url === "/health") return res.end("alive");
    upload(req, res, error => {
      finishUpload(error);
      if (!res.destroyed) res.end("done");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const boundary = "dependency-teardown-boundary";
    const client = request({ host: "127.0.0.1", port: server.address().port,
      path: "/upload", method: "POST", headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "transfer-encoding": "chunked",
      } });
    client.on("error", () => {});
    client.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe.txt"\r\nContent-Type: text/plain\r\n\r\npartial`);
    await pendingFilter;
    client.destroy();
    assert.ok(await uploadFinished, "aborted request must complete as an error while filter is pending");
    // The delayed async policy result arrives after teardown. It must neither
    // reopen storage nor emit an unhandled file stream error in this process.
    finishFilter(null, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(handleCalls, 0, "late accepted filter cannot enter storage after abort");
    const healthy = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(await healthy.text(), "alive");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function decoderProbe(scope) {
  const require = createRequire(`${root}/${scope}/package.json`);
  const undici = scope === "." ? createRequire(require.resolve("gaxios"))("undici") : require("undici");
  const server = createServer((req, res) => {
    if (req.url === "/excessive") {
      res.setHeader("content-encoding", Array(100).fill("gzip").join(","));
      res.end(gzipSync("discard this untrusted response"));
    } else if (req.url === "/gzip") {
      res.setHeader("content-encoding", "gzip");
      res.end(gzipSync("normal decoded response"));
    } else res.end("alive");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(async () => {
      const response = await undici.fetch(`${origin}/excessive`);
      await response.text();
    }, error => /too many content-encodings/.test(String(error.cause?.message ?? error.message)),
    "untrusted excessive encoding must produce a bounded controlled fetch rejection");
    assert.equal(await (await undici.fetch(`${origin}/gzip`)).text(), "normal decoded response");
    assert.equal(await (await undici.fetch(`${origin}/health`)).text(), "alive");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[2] === "--probe") {
  const timer = setTimeout(() => process.exit(2), 5_000);
  try {
    await (process.argv[3] === "multer" ? uploadProbe : decoderProbe)(process.argv[4]);
    console.log("TEARDOWN_PROBE_PASS");
  } finally { clearTimeout(timer); }
} else {
  for (const scope of [".", "external/pdim/artifacts/api-server"]) {
    test(`${scope}: pending asynchronous upload filter cannot reopen an aborted request`, () => {
      const child = spawnSync(process.execPath, [currentFile, "--probe", "multer", scope], {
        cwd: root, env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 8_000,
      });
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      assert.match(child.stdout, /TEARDOWN_PROBE_PASS/);
    });
  }
  for (const scope of [".", "external/maxcore/artifacts/api-server"]) {
    test(`${scope}: fetch refuses excessive response encodings and remains usable`, () => {
      const child = spawnSync(process.execPath, [currentFile, "--probe", "undici", scope], {
        cwd: root, env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 8_000,
      });
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      assert.match(child.stdout, /TEARDOWN_PROBE_PASS/);
    });
  }
}
