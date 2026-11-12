import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(root, "scripts/process-ownership.sh");

function capture(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  return {
    child,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    done: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`process failed (${code ?? signal}): ${stderr}`));
      });
    }),
  };
}

test("dev instance lock serializes processes sharing the same workspace", { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "maxbooster-dev-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = capture(spawn("bash", ["-c", [
    `source ${JSON.stringify(helper)}`,
    `dev_acquire_instance_lock ${JSON.stringify(directory)}`,
    "echo owner-acquired",
    "read -t 1.5 -r _ < /dev/zero || true",
  ].join("; ")], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TMPDIR: directory } }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("first process did not acquire the lock")), 3000);
    owner.child.stdout.on("data", chunk => {
      if (String(chunk).includes("owner-acquired")) {
        clearTimeout(timer);
        resolve();
      }
    });
    owner.child.once("error", reject);
  });

  const contender = capture(spawn("bash", ["-c", [
    `source ${JSON.stringify(helper)}`,
    `dev_acquire_instance_lock ${JSON.stringify(directory)}`,
    "echo contender-acquired",
  ].join("; ")], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TMPDIR: directory } }));
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(contender.stdout.includes("contender-acquired"), false);
  await owner.done;
  await contender.done;
  assert.match(contender.stdout, /contender-acquired/);
});

test("workflow cleanup terminates descendants before releasing their owner process", { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "maxbooster-dev-tree-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pidFile = path.join(directory, "pids");
  const command = [
    `source ${JSON.stringify(helper)}`,
    `bash -c 'sleep 60 & echo $! > ${JSON.stringify(pidFile)}; wait' &`,
    "root=$!",
    `for i in $(seq 1 30); do [ -s ${JSON.stringify(pidFile)} ] && break; sleep 0.05; done`,
    `child=$(cat ${JSON.stringify(pidFile)})`,
    'dev_stop_owned_tree "$root"',
    'kill -0 "$root" 2>/dev/null && exit 2',
    'kill -0 "$child" 2>/dev/null && exit 3',
    "echo tree-stopped",
  ].join("\n");
  const result = await capture(spawn("bash", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
  })).done;
  assert.match(result.stdout, /tree-stopped/);
});
