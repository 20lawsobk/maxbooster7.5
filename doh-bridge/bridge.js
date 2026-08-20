#!/usr/bin/env node
/**
 * Max Booster — DoH-to-UDP/TCP DNS Bridge  (Build 1)
 *
 * Translates standard UDP/TCP port-53 queries → DNS-over-HTTPS → UDP/TCP responses.
 * Deploy this on ANY machine with a public IP to make the authoritative DNS reachable
 * from the global internet, without exposing the main app directly on port 53.
 *
 * Features:
 *   • UDP + TCP port 53 listeners
 *   • Concurrent query handling with per-query ID tracking
 *   • TCP framing (RFC 1035 §4.2.2 — 2-byte length prefix)
 *   • Configurable retry + per-query timeout
 *   • Exponential back-off on DoH endpoint failures
 *   • Health + metrics HTTP endpoint (:9053)
 *   • Graceful SIGTERM / SIGINT shutdown
 *   • Zero external dependencies — ships as a single JS file
 *
 * Environment:
 *   DOH_URL           DoH endpoint  (default: http://localhost:5000/api/dns/query)
 *   LISTEN_IP         Bind address  (default: 0.0.0.0)
 *   LISTEN_PORT       DNS port      (default: 53)
 *   QUERY_TIMEOUT_MS  Per-query ms  (default: 5000)
 *   MAX_RETRIES       Retry count   (default: 2)
 *   MAX_PENDING       Pending cap   (default: 10000)
 *   METRICS_PORT      Metrics HTTP  (default: 9053)
 */
"use strict";

const dgram = require("dgram");
const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// ── Config ────────────────────────────────────────────────────────────────────
const DOH_URL = process.env.DOH_URL || "http://localhost:5000/api/dns/query";
const LISTEN_IP = process.env.LISTEN_IP || "0.0.0.0";
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || "53", 10);
const TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT_MS || "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);
const MAX_PENDING = parseInt(process.env.MAX_PENDING || "10000", 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || "9053", 10);

const dohUrl = new URL(DOH_URL);
const useHttps = dohUrl.protocol === "https:";
const httpLib = useHttps ? https : http;

// ── Metrics ───────────────────────────────────────────────────────────────────
const metrics = {
  queries: 0, // total received
  forwarded: 0, // successfully forwarded to DoH
  errors: 0, // DoH errors / bad responses
  timeouts: 0, // per-query timeouts
  retries: 0, // retry attempts
  startTime: Date.now(),
};

// ── Pending query map ─────────────────────────────────────────────────────────
// key: `<proto>:<raddr>:<rport>:<id>` → { send, timer, retries }
const pending = new Map();

function pendingKey(proto, addr, port, id) {
  return `${proto}:${addr}:${port}:${id}`;
}

// ── Core DoH forwarder ────────────────────────────────────────────────────────
function forwardToDoH(msgBuf, onResponse, onError, attempt = 0) {
  const opts = {
    hostname: dohUrl.hostname,
    port: dohUrl.port || (useHttps ? 443 : 80),
    path: dohUrl.pathname + dohUrl.search,
    method: "POST",
    headers: {
      "Content-Type": "application/dns-message",
      Accept: "application/dns-message",
      "Content-Length": msgBuf.length,
    },
    timeout: TIMEOUT_MS,
  };

  const req = httpLib.request(opts, (res) => {
    if (res.statusCode !== 200) {
      metrics.errors++;
      if (attempt < MAX_RETRIES) {
        metrics.retries++;
        const delay = Math.min(100 * 2 ** attempt, 1000);
        setTimeout(
          () => forwardToDoH(msgBuf, onResponse, onError, attempt + 1),
          delay,
        );
      } else {
        onError(new Error(`DoH ${res.statusCode}`));
      }
      res.resume();
      return;
    }
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      metrics.forwarded++;
      onResponse(Buffer.concat(chunks));
    });
  });

  req.on("error", (err) => {
    metrics.errors++;
    if (attempt < MAX_RETRIES) {
      metrics.retries++;
      const delay = Math.min(100 * 2 ** attempt, 1000);
      setTimeout(
        () => forwardToDoH(msgBuf, onResponse, onError, attempt + 1),
        delay,
      );
    } else {
      onError(err);
    }
  });

  req.on("timeout", () => req.destroy(new Error("DoH request timeout")));
  req.write(msgBuf);
  req.end();
}

// ── Build SERVFAIL response (for error cases) ─────────────────────────────────
function makeServfail(queryBuf) {
  if (queryBuf.length < 2) return queryBuf;
  const resp = Buffer.from(queryBuf);
  // Set QR=1, RCODE=2 (SERVFAIL)
  resp[2] = (resp[2] | 0x80) & 0xff;
  resp[3] = (resp[3] & 0xf0) | 0x02;
  return resp;
}

// ── UDP server ────────────────────────────────────────────────────────────────
const udpServer = dgram.createSocket({ type: "udp4", reuseAddr: true });

udpServer.on("message", (msg, rinfo) => {
  if (msg.length < 12) return;
  metrics.queries++;

  if (pending.size >= MAX_PENDING) {
    // Drop under extreme load rather than OOM
    metrics.errors++;
    return;
  }

  const id = msg.readUInt16BE(0);
  const key = pendingKey("udp", rinfo.address, rinfo.port, id);

  const timer = setTimeout(() => {
    if (pending.delete(key)) {
      metrics.timeouts++;
      // Send SERVFAIL back
      const sf = makeServfail(msg);
      udpServer.send(sf, rinfo.port, rinfo.address);
    }
  }, TIMEOUT_MS);

  pending.set(key, { timer });

  forwardToDoH(
    msg,
    (respBuf) => {
      const entry = pending.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(key);
      udpServer.send(respBuf, rinfo.port, rinfo.address, (err) => {
        if (err) metrics.errors++;
      });
    },
    (_err) => {
      const entry = pending.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(key);
      const sf = makeServfail(msg);
      udpServer.send(sf, rinfo.port, rinfo.address);
    },
  );
});

udpServer.on("error", (err) => {
  console.error("[bridge:udp] error:", err.message);
  if (err.code !== "EADDRINUSE") {
    // Rebind after transient errors
    setTimeout(() => udpServer.bind(LISTEN_PORT, LISTEN_IP), 1000);
  }
});

udpServer.bind(LISTEN_PORT, LISTEN_IP, () => {
  const a = udpServer.address();
  console.log(`[bridge:udp] Listening ${a.address}:${a.port} → ${DOH_URL}`);
});

// ── TCP server (RFC 1035 §4.2.2 — 2-byte length prefix) ──────────────────────
const tcpServer = net.createServer((socket) => {
  socket.setTimeout(10_000);
  let lenBuf = Buffer.alloc(0);
  let msgBuf = Buffer.alloc(0);
  let expectedLen = -1;

  socket.on("data", (chunk) => {
    if (expectedLen === -1) {
      lenBuf = Buffer.concat([lenBuf, chunk]);
      if (lenBuf.length < 2) return;
      expectedLen = lenBuf.readUInt16BE(0);
      msgBuf = lenBuf.slice(2);
      lenBuf = Buffer.alloc(0);
    } else {
      msgBuf = Buffer.concat([msgBuf, chunk]);
    }

    if (msgBuf.length < expectedLen) return;
    const query = msgBuf.slice(0, expectedLen);
    metrics.queries++;

    forwardToDoH(
      query,
      (respBuf) => {
        if (socket.destroyed) return;
        const lenHeader = Buffer.alloc(2);
        lenHeader.writeUInt16BE(respBuf.length, 0);
        socket.write(Buffer.concat([lenHeader, respBuf]), (err) => {
          if (err) metrics.errors++;
          socket.end();
        });
      },
      (_err) => {
        if (socket.destroyed) return;
        const sf = makeServfail(query);
        const lh = Buffer.alloc(2);
        lh.writeUInt16BE(sf.length, 0);
        socket.write(Buffer.concat([lh, sf]));
        socket.end();
      },
    );
  });

  socket.on("timeout", () => {
    socket.destroy();
  });
  socket.on("error", () => {
    socket.destroy();
  });
});

tcpServer.listen(LISTEN_PORT, LISTEN_IP, () => {
  const a = tcpServer.address();
  console.log(`[bridge:tcp] Listening ${a.address}:${a.port} → ${DOH_URL}`);
});

tcpServer.on("error", (err) => {
  console.error("[bridge:tcp] error:", err.message);
});

// ── Metrics / health HTTP endpoint ────────────────────────────────────────────
const metricsServer = http.createServer((req, res) => {
  if (req.url === "/metrics" || req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          uptime: ((Date.now() - metrics.startTime) / 1000).toFixed(1),
          queries: metrics.queries,
          forwarded: metrics.forwarded,
          errors: metrics.errors,
          timeouts: metrics.timeouts,
          retries: metrics.retries,
          pendingNow: pending.size,
          dohEndpoint: DOH_URL,
          listenPort: LISTEN_PORT,
        },
        null,
        2,
      ),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

metricsServer.listen(METRICS_PORT, () => {
  console.log(`[bridge:metrics] http://localhost:${METRICS_PORT}/health`);
});

// ── Periodic cache eviction log ───────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  const uptime = ((now - metrics.startTime) / 1000 / 60).toFixed(1);
  console.log(
    `[bridge] uptime=${uptime}m queries=${metrics.queries} errors=${metrics.errors} ` +
      `timeouts=${metrics.timeouts} pending=${pending.size}`,
  );
}, 60_000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(sig) {
  console.log(`[bridge] ${sig} — shutting down gracefully`);
  udpServer.close();
  tcpServer.close();
  metricsServer.close();
  // Flush pending with SERVFAIL
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
  }
  pending.clear();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[bridge] uncaughtException:", err.message);
  metrics.errors++;
});
process.on("unhandledRejection", (reason) => {
  console.error("[bridge] unhandledRejection:", reason);
  metrics.errors++;
});
