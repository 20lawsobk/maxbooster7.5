#!/usr/bin/env node
/**
 * Max Booster — VPS DNS Proxy
 *
 * Listens on port 53 (UDP + TCP) and forwards all DNS queries to the
 * Max Booster app's DNS-over-HTTPS endpoint via HTTPS POST.
 *
 * Architecture:
 *   Public DNS client
 *     → port 53 UDP/TCP on this VPS
 *       → HTTPS POST https://<APP_URL>/api/dns/query
 *         → Max Booster built-in DNS server
 *           → DNS response back to client
 *
 * Setup: see README.md
 */

'use strict';

const dgram   = require('dgram');
const net     = require('net');
const https   = require('https');
const http    = require('http');
const url     = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const APP_URL    = process.env.APP_URL    || 'https://maxbooster.replit.app';
const LISTEN_IP  = process.env.LISTEN_IP  || '0.0.0.0';
const DNS_PORT   = parseInt(process.env.DNS_PORT || '53', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '5000', 10);

const parsed   = url.parse(APP_URL);
const DOH_HOST = parsed.hostname;
const DOH_PORT = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
const DOH_PATH = (parsed.path || '') + '/api/dns/query';
const USE_TLS  = parsed.protocol === 'https:';

// ── DoH forwarder ─────────────────────────────────────────────────────────────

function forwardQuery(queryBuffer) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DoH timeout')), TIMEOUT_MS);

    const options = {
      hostname: DOH_HOST,
      port:     DOH_PORT,
      path:     DOH_PATH,
      method:   'POST',
      headers: {
        'Content-Type':   'application/dns-message',
        'Accept':         'application/dns-message',
        'Content-Length': queryBuffer.length,
        'User-Agent':     'MaxBooster-DNS-Proxy/1.0',
      },
    };

    const transport = USE_TLS ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) {
          return reject(new Error(`DoH HTTP ${res.statusCode}`));
        }
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.write(queryBuffer);
    req.end();
  });
}

// ── UDP server (standard DNS) ─────────────────────────────────────────────────

const udp = dgram.createSocket('udp4');

udp.on('message', async (msg, rinfo) => {
  try {
    const response = await forwardQuery(msg);
    udp.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) console.error('[UDP] send error:', err.message);
    });
  } catch (err) {
    console.error('[UDP] forward error:', err.message);
    // Send a SERVFAIL response (minimal valid DNS response with RCODE=2)
    if (msg.length >= 12) {
      const servfail = Buffer.from(msg.slice(0, 12));
      servfail[2] = 0x80; // QR=1 (response)
      servfail[3] = 0x82; // RCODE=2 (SERVFAIL)
      servfail[4] = 0; servfail[5] = 0; // QDCOUNT = 0
      servfail[6] = 0; servfail[7] = 0; // ANCOUNT = 0
      servfail[8] = 0; servfail[9] = 0; // NSCOUNT = 0
      servfail[10] = 0; servfail[11] = 0; // ARCOUNT = 0
      udp.send(servfail, rinfo.port, rinfo.address);
    }
  }
});

udp.on('error', (err) => {
  console.error('[UDP] socket error:', err.message);
  process.exit(1);
});

// ── TCP server (DNS-over-TCP for large responses) ─────────────────────────────

const tcp = net.createServer((socket) => {
  let buf = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    // DNS-over-TCP: first 2 bytes are the message length
    while (buf.length >= 2) {
      const msgLen = buf.readUInt16BE(0);
      if (buf.length < 2 + msgLen) break; // wait for more data

      const query = buf.slice(2, 2 + msgLen);
      buf = buf.slice(2 + msgLen);

      forwardQuery(query).then((response) => {
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(response.length, 0);
        socket.write(Buffer.concat([lenBuf, response]));
      }).catch((err) => {
        console.error('[TCP] forward error:', err.message);
        socket.destroy();
      });
    }
  });

  socket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error('[TCP] socket error:', err.message);
    }
  });
});

tcp.on('error', (err) => {
  console.error('[TCP] server error:', err.message);
  process.exit(1);
});

// ── Start ─────────────────────────────────────────────────────────────────────

udp.bind(DNS_PORT, LISTEN_IP, () => {
  console.log(`[UDP] Listening on ${LISTEN_IP}:${DNS_PORT}`);
});

tcp.listen(DNS_PORT, LISTEN_IP, () => {
  console.log(`[TCP] Listening on ${LISTEN_IP}:${DNS_PORT}`);
});

console.log(`Max Booster DNS Proxy started`);
console.log(`  Forwarding → ${APP_URL}/api/dns/query`);
console.log(`  DoH host   : ${DOH_HOST}:${DOH_PORT} (TLS: ${USE_TLS})`);
console.log(`  Timeout    : ${TIMEOUT_MS}ms`);
