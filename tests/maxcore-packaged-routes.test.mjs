import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const root = process.cwd();
const apiDir = path.join(root, "external/maxcore/artifacts/api-server");
const bundle = path.join(apiDir, "dist/index.mjs");
const portablePython = path.join(root, "python_runtime/bin/python3");
const routePaths = ["/api/health", "/api/awareness/unified/status"];
const requestTimeoutMs = 5_000;

function isolatedEnvironment(extra = {}) {
  const inherited = ["PATH", "LD_LIBRARY_PATH", "NIX_LD_LIBRARY_PATH", "SSL_CERT_FILE"];
  const env = Object.fromEntries(
    inherited
      .filter((name) => process.env[name])
      .map((name) => [name, process.env[name]]),
  );
  return {
    ...env,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PYTHONDONTWRITEBYTECODE: "1",
    ...extra,
  };
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

async function reservePorts() {
  const apiServer = net.createServer();
  const apiPort = await listen(apiServer);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const modelServer = net.createServer();
    const modelPort = await listen(modelServer);
    if (modelPort >= 65535) {
      await new Promise((resolve) => modelServer.close(resolve));
      continue;
    }
    const healthServer = net.createServer();
    try {
      await listen(healthServer, modelPort + 1);
      await Promise.all(
        [apiServer, modelServer, healthServer].map(
          (server) =>
            new Promise((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
      );
      return { apiPort, modelPort, healthPort: modelPort + 1 };
    } catch {
      await Promise.all(
        [modelServer, healthServer].map(
          (server) => new Promise((resolve) => server.close(resolve)),
        ),
      );
    }
  }
  throw new Error("Could not reserve adjacent disposable Python ports");
}

async function getJson(url, headers) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function waitForApi(url, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged API server exited with code ${child.exitCode}`);
    }
    try {
      const response = await getJson(`${url}/healthz`);
      if (response.status === 200 && response.body?.ok === true) return;
    } catch {
      // The cluster worker may not have bound its port yet.
    }
    await delay(200);
  }
  throw new Error("Packaged API server did not become reachable");
}

async function waitForPythonRoutes(baseUrl, token, child) {
  const deadline = Date.now() + 90_000;
  const headers = { Authorization: `Bearer ${token}` };
  const lastResults = new Map();
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged API server exited with code ${child.exitCode}`);
    }
    let allPassed = true;
    for (const route of routePaths) {
      try {
        const result = await getJson(`${baseUrl}${route}`, headers);
        lastResults.set(route, result);
        if (result.status !== 200) allPassed = false;
      } catch (error) {
        lastResults.set(route, { error: error.message });
        allPassed = false;
      }
    }
    if (allPassed) return lastResults;
    await delay(250);
  }
  throw new Error(
    `Python-backed routes did not return 200: ${JSON.stringify(Object.fromEntries(lastResults))}`,
  );
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    once(child, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}

async function stopProcessGroup(child) {
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (!(await waitForExit(child, 15_000))) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    if (!(await waitForExit(child, 5_000))) {
      throw new Error("Packaged API process group did not stop after SIGKILL");
    }
  }
}

async function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

test(
  "built MaxCore API server proxies both private routes to its supervised Python service",
  { timeout: 180_000 },
  async () => {
    assert.ok(existsSync(portablePython), "portable Python runtime is required");

    const build = spawnSync(
      process.execPath,
      [path.join(apiDir, "node_modules/tsx/dist/cli.mjs"), "build.ts"],
      {
        cwd: apiDir,
        env: isolatedEnvironment({ HOME: os.tmpdir() }),
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    assert.equal(
      build.status,
      0,
      `API-server production build failed:\n${build.stdout}\n${build.stderr}`,
    );
    assert.ok(existsSync(bundle), "API-server build did not produce dist/index.mjs");

    const ports = await reservePorts();
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "maxcore-packaged-routes-"));
    const stateDir = path.join(tempDir, "state");
    const logPath = path.join(tempDir, "api-server.log");
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const channelToken = randomBytes(32).toString("hex");
    const sessionSecret = randomBytes(32).toString("hex");
    let child;
    let failure;
    const serverUrl = `http://127.0.0.1:${ports.apiPort}`;

    try {
      const env = isolatedEnvironment({
        HOME: tempDir,
        TMPDIR: tempDir,
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        PORT: String(ports.apiPort),
        MODEL_API_PORT: String(ports.modelPort),
        MODEL_API_HEALTH_PORT: String(ports.healthPort),
        SESSION_SECRET: sessionSecret,
        PDIM_LOCAL_CHANNEL_TOKEN: channelToken,
        MAXBOOSTER_PYTHON: portablePython,
        MAXBOOSTER_EMBEDDED: "1",
        NODE_CLUSTER_WORKERS: "1",
        MAXCORE_PRIVATE_STATE_DIR: stateDir,
        MAXCORE_MODEL_STATE_DIR: path.join(stateDir, "models"),
        MODEL_SINGLETON_LOCK: path.join(stateDir, "model.lock"),
        PDIM_FORCE_REMOTE: "1",
        MAXCORE_AWARENESS_USE_PROXY: "1",
        HTTPS_PROXY: "http://127.0.0.1:9",
        HTTP_PROXY: "http://127.0.0.1:9",
        https_proxy: "http://127.0.0.1:9",
        http_proxy: "http://127.0.0.1:9",
        no_proxy: "",
        NO_PROXY: "",
        UVICORN_WORKERS: "1",
        UV_THREADPOOL_SIZE: "1",
        MAXCORE_NUM_STREAMS: "1",
        MB_WARM_START: "0",
      });
      const logFd = openSync(logPath, "a", 0o600);
      try {
        child = spawn(process.execPath, [bundle], {
          cwd: tempDir,
          env,
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
      } finally {
        closeSync(logFd);
      }

      await waitForApi(serverUrl, child);
      for (const route of routePaths) {
        const anonymous = await getJson(`${serverUrl}${route}`);
        assert.equal(anonymous.status, 401, `${route} must reject anonymous requests`);
      }

      const responses = await waitForPythonRoutes(serverUrl, channelToken, child);
      const health = responses.get("/api/health");
      assert.equal(health.body?.status, "healthy");
      assert.equal(health.body?.version, "1.0.0");
      assert.equal(typeof health.body?.model_loaded, "boolean");
      assert.equal(typeof health.body?.storage_mode, "string");

      const awareness = responses.get("/api/awareness/unified/status");
      assert.equal(typeof awareness.body?.ready, "boolean");
      assert.equal(awareness.body?.running, true);
      assert.ok(Array.isArray(awareness.body?.configured_sources));
      assert.equal(JSON.stringify([health.body, awareness.body]).includes(channelToken), false);
    } catch (error) {
      failure = error;
    } finally {
      if (child) {
        try {
          await stopProcessGroup(child);
          for (let attempt = 0; attempt < 30; attempt += 1) {
            const openPorts = await Promise.all(
              [ports.apiPort, ports.modelPort, ports.healthPort].map(portIsOpen),
            );
            if (openPorts.every((isOpen) => !isOpen)) break;
            await delay(100);
          }
          const lingering = await Promise.all(
            [ports.apiPort, ports.modelPort, ports.healthPort].map(portIsOpen),
          );
          assert.deepEqual(lingering, [false, false, false], "all isolated ports must be released");
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) {
        try {
          const logs = readFileSync(logPath, "utf8")
            .replaceAll(channelToken, "[redacted]")
            .replaceAll(sessionSecret, "[redacted]");
          failure = new Error(`${failure.message}\n--- packaged server log ---\n${logs}`);
        } catch {
          // Preserve the original failure when no diagnostic log is available.
        }
      }
      rmSync(tempDir, { recursive: true, force: true });
    }

    if (failure) throw failure;
  },
);
