#!/usr/bin/env node
// Zero-dependency boot-time liveness stub.
//
// Why this exists: the deployment platform's health check hits "/" starting
// the instant the container starts, on a fixed poll interval, and kills the
// container if the port never opens within its timeout window. The real
// server can't bind that port until node_modules has been restored from its
// compressed capsule (Node can't `require`/`import` anything without it),
// and on a cold boot that restore can take longer than the platform's
// startup-probe window even when it's the only thing blocking boot.
//
// This script uses ONLY Node's http core module (no node_modules needed) so
// it can start in milliseconds, before any dependency restore happens. It
// binds the real port and answers root liveness with 200 immediately,
// satisfying the platform health check while the actual app finishes
// initializing in the background. start.sh kills this process — freeing the
// port — right before launching the real server on the same port.
//
// Every other path returns an explicit unavailable response. API consumers
// and readiness probes must wait for the real application to take the port.

import http from "node:http";

const port = Number(process.env.PORT || 5000);

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url || "/", "http://boot.local").pathname; } catch { pathname = null; }
  if (pathname !== "/") {
    res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store", "retry-after": "2" });
    res.end(JSON.stringify({ status: "starting", ready: false, bootPhase: true }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
  res.end("starting up");
});

server.on("error", (err) => {
  // If the real port is already taken (e.g. a previous run's server is
  // somehow still up), fail loudly instead of silently doing nothing —
  // this script's only job is to hold the port, so a bind failure here
  // is worth surfacing in the deploy logs.
  console.error(`[boot-stub] failed to bind port ${port}:`, err?.message || err);
  process.exit(1);
});

// Bind explicitly to 0.0.0.0 — Replit's published-app health check reaches
// the container over the network, not via loopback, so a server bound only
// to 127.0.0.1/localhost is invisible to it even while "running".
server.listen(port, "0.0.0.0", () => {
  console.log(`[boot-stub] listening on 0.0.0.0:${port} (liveness placeholder while node_modules restores)`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  // Don't let a stuck close() hang start.sh's teardown indefinitely.
  setTimeout(() => process.exit(0), 2000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
