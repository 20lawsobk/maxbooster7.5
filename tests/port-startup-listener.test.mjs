import assert from "node:assert/strict";
import net from "node:net";
import dgram from "node:dgram";
import http from "node:http";
import { test } from "node:test";
import {
  configuredPortSpecs,
  httpHealthy,
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

test("dev and production readiness cover all eleven configured local listeners", () => {
  const ports = configuredPortSpecs({});
  assert.equal(ports.length, 11);
  assert.deepEqual(
    ports.map(({ port }) => port).sort((a, b) => a - b),
    [53, 5000, 5353, 5380, 5556, 8008, 8090, 9877, 9878, 9879, 9880],
  );
  assert.deepEqual(
    ports.find(({ name }) => name === "local DNS health"),
    { name: "local DNS health", port: 5380, httpPath: "/health" },
  );
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
