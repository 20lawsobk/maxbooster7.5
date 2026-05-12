/**
 * tls-proxy — TLS SNI Reverse Proxy
 *
 * Architecture:
 *   Internet → :443 (this proxy on GCP 34.117.33.233)
 *              → TLS termination using SNICallback (cert from DB)
 *              → HTTP forwarded to Replit backend with X-Forwarded-Host
 *
 * The Replit backend (maxbooster.replit.app) reads X-Forwarded-Host to
 * determine which storefront to serve, using the existing logic in
 * server/static.ts and server/middleware/cloudflare.ts.
 *
 * WebSocket upgrade (used by Vite HMR + app WebSockets) is handled via
 * a raw TCP tunnel to the backend to avoid re-framing overhead.
 */

import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { loadSecureContext, prefetchWildcardCert, startCertRefresh } from './certStore.js';

// ── Config ─────────────────────────────────────────────────────────────────────

const BACKEND_HOST     = process.env.BACKEND_HOST     || 'maxbooster.replit.app';
const BACKEND_PORT     = parseInt(process.env.BACKEND_PORT || '443');
const BACKEND_USE_TLS  = (process.env.BACKEND_USE_TLS ?? 'true') !== 'false';
const PROXY_PORT       = parseInt(process.env.PROXY_PORT  || '443');
const PROXY_HOST       = process.env.PROXY_HOST           || '0.0.0.0';

// Keep-alive agent to Replit backend.
// rejectUnauthorized: false because Replit's backend cert is for *.replit.app,
// not for max-booster.com — TLS hostname validation would always fail.
const backendAgent = BACKEND_USE_TLS
  ? new https.Agent({ keepAlive: true, maxSockets: 256, rejectUnauthorized: false })
  : new http.Agent({ keepAlive: true, maxSockets: 256 });

const transport = BACKEND_USE_TLS ? https : http;

// ── HTTP reverse proxy ────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  const tlsSocket = req.socket as tls.TLSSocket;
  const originalHost: string = tlsSocket.servername || (req.headers.host as string) || BACKEND_HOST;

  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  headers['host']              = BACKEND_HOST;
  headers['x-forwarded-host']  = originalHost;
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-for']   = req.socket.remoteAddress ?? '';
  delete headers['connection'];

  const proxyReq = (transport as typeof https).request(
    {
      hostname: BACKEND_HOST,
      port:     BACKEND_PORT,
      path:     req.url,
      method:   req.method,
      headers,
      agent:    backendAgent as https.Agent,
      rejectUnauthorized: false,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode!, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
      proxyRes.on('error', () => res.destroy());
    },
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy] backend request error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq, { end: true });
  req.on('error', () => proxyReq.destroy());
});

// ── WebSocket tunnel ──────────────────────────────────────────────────────────

httpServer.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
  const tlsSocket = socket as tls.TLSSocket;
  const originalHost: string = tlsSocket.servername || (req.headers.host as string) || BACKEND_HOST;

  const backendSocket = net.connect({ host: BACKEND_HOST, port: BACKEND_PORT }, () => {
    // Rewrite the HTTP/1.1 CONNECT line with the correct Host + injected headers
    const upgradeHeaders = [
      `${req.method} ${req.url} HTTP/1.1`,
      `Host: ${BACKEND_HOST}`,
      `X-Forwarded-Host: ${originalHost}`,
      `X-Forwarded-Proto: https`,
      `X-Forwarded-For: ${socket.remoteAddress ?? ''}`,
      `Connection: Upgrade`,
      `Upgrade: ${req.headers['upgrade'] ?? 'websocket'}`,
    ];
    if (req.headers['sec-websocket-key'])
      upgradeHeaders.push(`Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`);
    if (req.headers['sec-websocket-version'])
      upgradeHeaders.push(`Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`);
    if (req.headers['sec-websocket-extensions'])
      upgradeHeaders.push(`Sec-WebSocket-Extensions: ${req.headers['sec-websocket-extensions']}`);
    if (req.headers['sec-websocket-protocol'])
      upgradeHeaders.push(`Sec-WebSocket-Protocol: ${req.headers['sec-websocket-protocol']}`);

    backendSocket.write(upgradeHeaders.join('\r\n') + '\r\n\r\n');
    if (head?.length) backendSocket.write(head);
    backendSocket.pipe(socket, { end: true });
    socket.pipe(backendSocket, { end: true });
  });

  backendSocket.on('error', (err) => {
    console.error('[ws-tunnel] backend error:', err.message);
    socket.destroy();
  });
  socket.on('error', () => backendSocket.destroy());
});

// ── HTTP → HTTPS redirect (port 80) ──────────────────────────────────────────
// Browsers hitting http://max-booster.com or http://artist.max-booster.com
// get a permanent redirect to the HTTPS equivalent.

const HTTP_REDIRECT_PORT = parseInt(process.env.HTTP_REDIRECT_PORT || '80');

const httpRedirectServer = http.createServer((req, res) => {
  const host = (req.headers.host ?? 'max-booster.com').replace(/:\d+$/, '');
  const location = `https://${host}${req.url ?? '/'}`;
  res.writeHead(301, {
    Location:       location,
    'Cache-Control': 'no-store',
    'Content-Length': '0',
  });
  res.end();
});

// ── Health endpoint ───────────────────────────────────────────────────────────

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok:      true,
      uptime:  process.uptime(),
      backend: `${BACKEND_HOST}:${BACKEND_PORT}`,
      tls:     BACKEND_USE_TLS,
    }));
  } else {
    res.writeHead(404).end();
  }
});

// ── TLS server ────────────────────────────────────────────────────────────────

export async function startProxy(): Promise<void> {
  await prefetchWildcardCert();
  startCertRefresh();

  const tlsServer = tls.createServer(
    {
      SNICallback: (servername, cb) => {
        loadSecureContext(servername)
          .then((ctx) => cb(null, ctx))
          .catch((err: Error) => {
            console.error(`[SNI] No cert for ${servername}: ${err.message}`);
            cb(err);
          });
      },
      honorCipherOrder: true,
      minVersion: 'TLSv1.2',
    },
    (socket: tls.TLSSocket) => {
      httpServer.emit('connection', socket);
    },
  );

  tlsServer.on('tlsClientError', (err, _socket) => {
    // Only log non-routine errors (not "no certificate" for unknown SNI)
    if (!err.message.includes('no shared cipher') && !err.message.includes('ECONNRESET')) {
      console.warn('[TLS] Client error:', err.message);
    }
  });

  tlsServer.on('error', (err) => {
    console.error('[TLS] Server error:', err.message);
  });

  const healthPort = parseInt(process.env.HEALTH_PORT || '8080');

  // Start all three listeners concurrently
  await Promise.all([
    // Health check (port 8080)
    new Promise<void>((resolve, reject) => {
      healthServer.listen(healthPort, '0.0.0.0', () => {
        console.log(`[health]   HTTP health check on :${healthPort}`);
        resolve();
      });
      healthServer.on('error', reject);
    }),

    // HTTP → HTTPS redirect (port 80)
    new Promise<void>((resolve) => {
      httpRedirectServer.listen(HTTP_REDIRECT_PORT, '0.0.0.0', () => {
        console.log(`[redirect] HTTP→HTTPS redirect on :${HTTP_REDIRECT_PORT}`);
        resolve();
      });
      httpRedirectServer.on('error', (err) => {
        // Non-fatal: port 80 needs root or CAP_NET_BIND_SERVICE on Linux
        console.warn(`[redirect] Could not bind :${HTTP_REDIRECT_PORT}: ${err.message}`);
        resolve();
      });
    }),

    // TLS SNI proxy (port 443)
    new Promise<void>((resolve, reject) => {
      tlsServer.listen(PROXY_PORT, PROXY_HOST, () => {
        console.log(`[tls]      TLS SNI proxy on ${PROXY_HOST}:${PROXY_PORT}`);
        console.log(`[tls]      Backend: ${BACKEND_USE_TLS ? 'https' : 'http'}://${BACKEND_HOST}:${BACKEND_PORT}`);
        resolve();
      });
      tlsServer.on('error', reject);
    }),
  ]);

  // Graceful shutdown
  const shutdown = (sig: string): void => {
    console.log(`[proxy] ${sig} — shutting down`);
    tlsServer.close();
    httpRedirectServer.close();
    healthServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}
