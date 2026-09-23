// Loaded before the application by readiness-assembled-acceptance.mjs.
// Denies every non-loopback TCP/TLS connection and all UDP sockets.
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

if (process.env.READINESS_EGRESS_GUARD !== "1") {
  throw new Error("Readiness egress guard loaded without its safety marker");
}

const allowedHosts = new Set([
  "127.0.0.1",
  "::1",
  "localhost",
  "0.0.0.0",
  "::",
]);

function destination(args) {
  const first = args[0];
  if (typeof first === "string") return { path: first };
  if (typeof first === "number") {
    return { host: typeof args[1] === "string" ? args[1] : "localhost" };
  }
  return first && typeof first === "object"
    ? { host: first.host ?? first.hostname, path: first.path }
    : {};
}

function assertLocal(args, transport) {
  const target = destination(args);
  if (target.path) return;
  const host = String(target.host ?? "localhost").toLowerCase().replace(/^\[|\]$/g, "");
  if (!allowedHosts.has(host)) {
    throw new Error(`[readiness-egress-denied] ${transport} destination is not loopback`);
  }
}

const netConnect = net.connect.bind(net);
const netCreateConnection = net.createConnection.bind(net);
const socketConnect = net.Socket.prototype.connect;
net.connect = (...args) => {
  assertLocal(args, "tcp");
  return netConnect(...args);
};
net.createConnection = (...args) => {
  assertLocal(args, "tcp");
  return netCreateConnection(...args);
};
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  assertLocal(args, "tcp-socket");
  return socketConnect.apply(this, args);
};

const tlsConnect = tls.connect.bind(tls);
tls.connect = (...args) => {
  assertLocal(args, "tls");
  return tlsConnect(...args);
};

dgram.createSocket = () => {
  throw new Error("[readiness-egress-denied] UDP sockets are disabled");
};

for (const method of [
  "exec",
  "execFile",
  "fork",
  "spawn",
  "execSync",
  "execFileSync",
  "spawnSync",
]) {
  childProcess[method] = () => {
    throw new Error(`[readiness-egress-denied] child_process.${method} is disabled`);
  };
}

syncBuiltinESMExports();