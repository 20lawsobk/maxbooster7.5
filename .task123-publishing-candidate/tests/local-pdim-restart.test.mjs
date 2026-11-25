import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

async function availableLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  return port;
}

test("disk-backed local PDIM recovers acknowledged data after in-process restarts", {
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maxbooster-local-pdim-restart-"));
  try {
    const port = await availableLoopbackPort();
    const program = `
      import assert from "node:assert/strict";
      const pdim = await import("./server/lib/localPdimServer.ts");
      const endpoint = pdim.getLocalPdimUrl();
      const token = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      const exitListenersBefore = process.listenerCount("exit");
      async function command(cmd, args) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ cmd, args }),
        });
        const body = await response.text();
        assert.equal(response.status, 200, body);
        return JSON.parse(body);
      }
      try {
        for (let cycle = 1; cycle <= 3; cycle++) {
          await pdim.startLocalPdimServer();
          if (cycle === 1) {
            assert.equal(await command("SET", ["restart:proof", "durable-value"]), "OK");
          } else {
            assert.equal(await command("GET", ["restart:proof"]), "durable-value");
          }
          await pdim.stopLocalPdimServer();
        }
        assert.equal(process.listenerCount("exit") - exitListenersBefore, 1);
        console.log("cycles=3 recovered=durable-value exitGuardCount=1");
      } finally {
        await pdim.stopLocalPdimServer();
      }
    `;
    const childEnv = {
      PATH: process.env.PATH ?? "",
      HOME: root,
      TMPDIR: root,
      LANG: "C",
      LOCAL_PDIM_PORT: String(port),
      LOCAL_PDIM_STORE_FILE: path.join(root, "local-pdim-store.json"),
      PDIM_LOCAL_CHANNEL_TOKEN: "isolated-local-pdim-test-token",
      ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}),
    };
    const child = spawn(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e", program,
    ], { cwd: process.cwd(), env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output = (output + chunk).slice(-12_000); });
    child.stderr.on("data", chunk => { output = (output + chunk).slice(-12_000); });
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(result.code, 0, `${JSON.stringify(result)}\n${output}`);
    assert.match(output, /cycles=3 recovered=durable-value exitGuardCount=1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
