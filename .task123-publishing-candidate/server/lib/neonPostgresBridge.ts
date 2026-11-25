import net from "node:net";
import WebSocket, { createWebSocketStream } from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";

/** Preserve native PostgreSQL sessions/transactions over Neon's TLS WebSocket
 * transport. Only the private loopback hop is plaintext; remote certificates
 * and hostnames are verified by ws, including when using the egress proxy. */
export async function startNeonPostgresBridge(databaseUrl: string) {
  const upstream = new URL(databaseUrl);
  if (!upstream.hostname.endsWith(".neon.tech")) {
    throw new Error("The Neon PostgreSQL bridge requires a Neon database hostname");
  }
  const hostname = upstream.hostname.replace("-pooler.", ".");
  const agent = process.env.HTTPS_PROXY
    ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
    : undefined;
  const sockets = new Set<net.Socket>();
  const websockets = new Set<WebSocket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    const ws = new WebSocket(`wss://${hostname}/v2`, { agent, handshakeTimeout: 10_000 });
    websockets.add(ws);
    const stream = createWebSocketStream(ws);
    const close = () => {
      socket.destroy();
      stream.destroy();
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
      sockets.delete(socket);
      websockets.delete(ws);
    };
    socket.on("error", close);
    socket.on("close", close);
    stream.on("error", close);
    stream.on("close", close);
    // Node streams apply backpressure in both directions and preserve bytes.
    socket.pipe(stream).pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as net.AddressInfo;
  const local = new URL(databaseUrl);
  local.hostname = "127.0.0.1";
  local.port = String(address.port);
  // libpq's TLS settings describe only the loopback socket here. The remote
  // hop always uses verified wss://, as the Neon serverless driver does.
  for (const name of ["sslmode", "sslrootcert", "sslcert", "sslkey", "channel_binding"]) {
    local.searchParams.delete(name);
  }
  local.searchParams.set("sslmode", "disable");
  local.searchParams.set("connect_timeout", "10");
  return {
    databaseUrl: local.toString(),
    close() {
      for (const socket of sockets) socket.destroy();
      for (const ws of websockets) ws.terminate();
      server.close();
      agent?.destroy();
    },
  };
}
