import assert from "node:assert/strict";
import net from "node:net";
import dgram from "node:dgram";
import { test } from "node:test";
import {
  configuredPortSpecs,
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

test("dev and production readiness cover the exact ten mapped listener ports", () => {
  const ports = configuredPortSpecs({});
  assert.equal(ports.length, 10);
  assert.deepEqual(
    ports.map(({ port }) => port).sort((a, b) => a - b),
    [53, 5000, 5353, 5556, 8008, 8090, 9877, 9878, 9879, 9880],
  );
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
