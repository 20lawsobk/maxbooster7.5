#!/usr/bin/env node
/**
 * Max Booster — Node.js DNS Proxy (fallback)
 *
 * This is the FALLBACK proxy used when AdGuard dnsproxy cannot be downloaded
 * (e.g. unsupported architecture, no internet access at install time).
 *
 * The PRIMARY proxy is AdGuard dnsproxy (see setup.sh + README.md).
 * Prefer dnsproxy for production — it handles caching, EDNS0, health checks,
 * and parallel upstreams automatically.
 *
 * This script:
 *   - Listens on UDP + TCP port 53
 *   - Forwards all queries as RFC 8484 DoH POST to the Max Booster app
 *   - Reuses HTTPS connections (keep-alive agent) for low latency
 *   - Returns SERVFAIL on upstream errors (never drops queries silently)
 */

"use strict";

const dgram = require("dgram");
const net = require("net");
const https = require("https");
const http = require("http");
const url = require("url");

// ── Config (all overridable via environment variables) ────────────────────────

const APP_URL = process.env.APP_URL || "https://maxbooster.replit.app";
const LISTEN_IP = process.env.LISTEN_IP || "0.0.0.0";
const DNS_PORT = parseInt(process.env.DNS_PORT || "53", 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "5000", 10);

// ── Parse upstream URL ────────────────────────────────────────────────────────

const parsed = url.parse(APP_URL);
const USE_TLS = parsed.protocol === "https:";
const DOH_HOST = parsed.hostname;
const DOH_PORT = parsed.port ? parseInt(parsed.port, 10) : USE_TLS ? 443 : 80;
const DOH_PATH = (parsed.path || "").replace(/\/$/, "") + "/api/dns/query";

// ── Keep-alive HTTPS agent (reuse connections = lower RTT) ────────────────────

const agent = new (USE_TLS ? https : http).Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: TIMEOUT_MS + 1000,
});

// ── DoH forwarder ─────────────────────────────────────────────────────────────

/**
 * Forward a raw DNS wire-format query to the DoH endpoint.
 * Returns a Buffer with the DNS wire-format response.
 */
function forwardQuery(queryBuffer) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`DoH timeout after ${TIMEOUT_MS} ms`)),
      TIMEOUT_MS,
    );

    const options = {
      agent,
      hostname: DOH_HOST,
      port: DOH_PORT,
      path: DOH_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        Accept: "application/dns-message",
        "Content-Length": queryBuffer.length,
        "User-Agent": "MaxBooster-DNS-Proxy-Node/2.0",
      },
    };

    const transport = USE_TLS ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        clearTimeout(deadline);
        if (res.statusCode !== 200) {
          return reject(new Error(`DoH upstream HTTP ${res.statusCode}`));
        }
        resolve(Buffer.concat(chunks));
      });
      res.on("error", (err) => {
        clearTimeout(deadline);
        reject(err);
      });
    });

    req.on("error", (err) => {
      clearTimeout(deadline);
      reject(err);
    });
    req.write(queryBuffer);
    req.end();
  });
}

// ── SERVFAIL builder ──────────────────────────────────────────────────────────

/**
 * Build a minimal SERVFAIL response from the original query.
 * Mirrors the txid from the query so the client matches it.
 */
function buildServfail(queryBuffer) {
  if (queryBuffer.length < 2) return Buffer.alloc(0);
  const sf = Buffer.alloc(12);
  sf[0] = queryBuffer[0];
  sf[1] = queryBuffer[1];
  sf[2] = 0x81; // QR=1, RD=1
  sf[3] = 0x82; // RA=1, RCODE=2 (SERVFAIL)
  return sf;
}

// ── UDP server ────────────────────────────────────────────────────────────────

const udp = dgram.createSocket("udp4");

udp.on("message", async (msg, rinfo) => {
  try {
    const response = await forwardQuery(msg);
    udp.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) process.stderr.write(`[UDP] send error: ${err.message}\n`);
    });
  } catch (err) {
    process.stderr.write(
      `[UDP] ${rinfo.address}:${rinfo.port} — forward error: ${err.message}\n`,
    );
    const sf = buildServfail(msg);
    if (sf.length > 0) udp.send(sf, rinfo.port, rinfo.address);
  }
});

udp.on("error", (err) => {
  process.stderr.write(`[UDP] Fatal error: ${err.message}\n`);
  process.exit(1);
});

// ── TCP server (DNS-over-TCP per RFC 7766) ────────────────────────────────────

const tcp = net.createServer((socket) => {
  socket.setTimeout(30000);
  let buf = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    // DNS-over-TCP: first 2 bytes = big-endian message length
    while (buf.length >= 2) {
      const msgLen = buf.readUInt16BE(0);
      if (buf.length < 2 + msgLen) break;

      const query = buf.slice(2, 2 + msgLen);
      buf = buf.slice(2 + msgLen);

      forwardQuery(query)
        .then((response) => {
          const lenBuf = Buffer.allocUnsafe(2);
          lenBuf.writeUInt16BE(response.length, 0);
          if (!socket.destroyed)
            socket.write(Buffer.concat([lenBuf, response]));
        })
        .catch((err) => {
          process.stderr.write(`[TCP] forward error: ${err.message}\n`);
          const sf = buildServfail(query);
          if (sf.length > 0 && !socket.destroyed) {
            const lenBuf = Buffer.allocUnsafe(2);
            lenBuf.writeUInt16BE(sf.length, 0);
            socket.write(Buffer.concat([lenBuf, sf]));
          }
          socket.destroy();
        });
    }
  });

  socket.on("timeout", () => socket.destroy());
  socket.on("error", (err) => {
    if (err.code !== "ECONNRESET" && err.code !== "EPIPE") {
      process.stderr.write(`[TCP] socket error: ${err.message}\n`);
    }
  });
});

tcp.on("error", (err) => {
  process.stderr.write(`[TCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  process.stdout.write(`\n[proxy] ${signal} — shutting down gracefully\n`);
  udp.close();
  tcp.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start ─────────────────────────────────────────────────────────────────────

udp.bind(DNS_PORT, LISTEN_IP, () => {
  process.stdout.write(`[UDP] Listening on ${LISTEN_IP}:${DNS_PORT}\n`);
});

tcp.listen(DNS_PORT, LISTEN_IP, () => {
  process.stdout.write(`[TCP] Listening on ${LISTEN_IP}:${DNS_PORT}\n`);
});

process.stdout.write(`Max Booster DNS Proxy (Node.js fallback) started\n`);
process.stdout.write(`  Forwarding → ${APP_URL}/api/dns/query\n`);
process.stdout.write(
  `  Host       : ${DOH_HOST}:${DOH_PORT} (TLS: ${USE_TLS})\n`,
);
process.stdout.write(`  Timeout    : ${TIMEOUT_MS} ms\n`);
