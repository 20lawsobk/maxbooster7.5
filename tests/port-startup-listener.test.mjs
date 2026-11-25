import assert from "node:assert/strict";
import net from "node:net";
import dgram from "node:dgram";
import http from "node:http";
import { test } from "node:test";
import { spawn } from "node:child_process";
import {
  configuredPortSpecs,
  httpHealthy,
  pidIsRunning,
  waitForConfiguredPorts,
} from "../scripts/wait-configured-ports.mjs";

function listenTcp(port = 0) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({
      port: server.address().port,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

function listenUdp() {
  const socket = dgram.createSocket("udp4");
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => resolve({
      port: socket.address().port,
      close: () => new Promise((done) => socket.close(done)),
    }));
  });
}

function listenHttp(statusCode = 200) {
  const server = http.createServer((_request, response) => {
    response.writeHead(statusCode);
    response.end("fixture");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      port: server.address().port,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

test("dev and production readiness cover all twelve configured local listeners", () => {
  const devPorts = configuredPortSpecs({
    DNS_AUTHORITY_PORT: "1053",
    MAXBOOSTER_DEV_PORTS: "1",
  });
  const productionPorts = configuredPortSpecs({
    MAXBOOSTER_DEV_PORTS: "1",
    NODE_ENV: "production",
  });
  assert.equal(devPorts.length, 12);
  assert.equal(productionPorts.length, 12);
  assert.deepEqual(
    devPorts.map(({ port }) => port).sort((a, b) => a - b),
    [1053, 5000, 5353, 5380, 5556, 8008, 8090, 8080, 9877, 9878, 9879, 9880].sort((a, b) => a - b),
  );
  assert.deepEqual(
    productionPorts.map(({ port }) => port).sort((a, b) => a - b),
    [53, 5000, 5353, 5380, 5556, 8008, 8090, 8080, 9877, 9878, 9879, 9880].sort((a, b) => a - b),
  );
  assert.deepEqual(
    devPorts.find(({ name }) => name === "DNS API"),
    { name: "DNS API", port: 8080, httpPath: "/ready" },
  );
  assert.deepEqual(
    devPorts.find(({ name }) => name === "local DNS health"),
    { name: "local DNS health", port: 5380, httpPath: "/health" },
  );
  assert.deepEqual(
    devPorts.filter(({ name }) => name.includes("MaxCore") || name === "web application")
      .map(({ name, httpPath }) => [name, httpPath]),
    [
      ["web application", "/api/health"],
      ["MaxCore diffusion gateway", "/health"],
      ["MaxCore API", "/healthz"],
      ["MaxCore model API", "/api/health"],
      ["MaxCore model health", "/healthz"],
      ["MaxCore proxy sidecar", "/health"],
    ],
  );
  for (const [name, httpPath] of [
    ["web application", "/ready"],
    ["MaxCore diffusion gateway", "/health"],
    ["MaxCore API", "/healthz"],
    ["MaxCore model API", "/api/ready"],
    ["MaxCore model health", "/healthz"],
    ["MaxCore proxy sidecar", "/health"],
  ]) {
    assert.equal(
      productionPorts.find((entry) => entry.name === name)?.httpPath,
      httpPath,
      `${name} uses the same verified HTTP readiness in production`,
    );
  }
});

test("development startup accepts live web app while production readiness stays strict", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(request.url === "/api/health" ? 200 : 503);
    response.end("fixture");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = server.address().port;
    const devWeb = configuredPortSpecs({ MAXBOOSTER_DEV_PORTS: "1" })
      .find(({ name }) => name === "web application");
    const devResult = await waitForConfiguredPorts(
      [{ ...devWeb, port }],
      { timeoutMs: 100, intervalMs: 5 },
    );
    assert.deepEqual(devResult, { ready: true, missing: [] });

    const productionWeb = configuredPortSpecs({ NODE_ENV: "production" })
      .find(({ name }) => name === "web application");
    const productionResult = await waitForConfiguredPorts(
      [{ ...productionWeb, port }],
      { timeoutMs: 20, intervalMs: 5 },
    );
    assert.deepEqual(productionResult, {
      ready: false,
      missing: ["web application"],
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("readiness requires the DNS health listener to return HTTP 200", async () => {
  const healthy = await listenHttp(200);
  const unhealthy = await listenHttp(503);
  try {
    assert.equal(await httpHealthy(healthy.port), true);
    assert.equal(await httpHealthy(unhealthy.port), false);
    const result = await waitForConfiguredPorts([
      { name: "unhealthy fixture", port: unhealthy.port, httpPath: "/health" },
    ], { timeoutMs: 20, intervalMs: 5 });
    assert.deepEqual(result, { ready: false, missing: ["unhealthy fixture"] });
  } finally {
    await healthy.close();
    await unhealthy.close();
  }
});

test("DNS API readiness probes /ready rather than accepting a TCP-only listener", async () => {
  let requestedPath = null;
  const result = await waitForConfiguredPorts([
    { name: "DNS API", port: 8_080, httpPath: "/ready" },
  ], {
    timeoutMs: 100,
    intervalMs: 10,
    tcpProbe: async () => true,
    httpProbe: async (_port, path) => {
      requestedPath = path;
      return path === "/ready";
    },
  });
  assert.deepEqual(result, { ready: true, missing: [] });
  assert.equal(requestedPath, "/ready");
});

test("development checks model liveness while production checks trained readiness", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(request.url === "/api/health" ? 200 : 503);
    response.end("fixture");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = server.address().port;
    const devModel = configuredPortSpecs({ MAXBOOSTER_DEV_PORTS: "1" })
      .find(({ name }) => name === "MaxCore model API");
    const devResult = await waitForConfiguredPorts(
      [{ ...devModel, port }],
      { timeoutMs: 100, intervalMs: 5 },
    );
    assert.deepEqual(devResult, { ready: true, missing: [] });

    const productionModel = configuredPortSpecs({ NODE_ENV: "production" })
      .find(({ name }) => name === "MaxCore model API");
    const productionResult = await waitForConfiguredPorts(
      [{ ...productionModel, port }],
      { timeoutMs: 20, intervalMs: 5 },
    );
    assert.deepEqual(productionResult, {
      ready: false,
      missing: ["MaxCore model API"],
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("readiness waits for TCP listeners and both DNS UDP sockets", async () => {
  const udp = await listenUdp();
  const tcp = await listenTcp(udp.port);
  try {
    const result = await waitForConfiguredPorts([
      { name: "fixture TCP+UDP", port: tcp.port, udp: true },
    ], { timeoutMs: 2_000, intervalMs: 10 });
    assert.deepEqual(result, { ready: true, missing: [] });
  } finally {
    await tcp.close();
    await udp.close();
  }
});

test("readiness reports listeners that remain closed", async () => {
  const result = await waitForConfiguredPorts([
    { name: "closed fixture", port: 65_000 },
  ], { timeoutMs: 20, intervalMs: 5 });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["closed fixture"]);
});

test("readiness fails promptly when the watched application process exits", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "setTimeout(() => process.exit(134), 50)",
  ], { stdio: "ignore" });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const startedAt = Date.now();
  try {
    const result = await waitForConfiguredPorts([
      { name: "required fixture listener", port: 65_000 },
    ], {
      timeoutMs: 10_000,
      intervalMs: 5,
      processProbe: () => pidIsRunning(child.pid),
    });
    const exit = await exited;
    assert.deepEqual(result, {
      ready: false,
      missing: ["required fixture listener"],
      processExited: true,
    });
    assert.deepEqual(exit, { code: 134, signal: null });
    assert.ok(Date.now() - startedAt < 2_000, "failure should not wait for the readiness timeout");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
});
