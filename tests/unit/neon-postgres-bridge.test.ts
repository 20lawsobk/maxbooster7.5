import { afterEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { once } from "node:events";

const target = vi.hoisted(() => ({ url: "" }));
vi.mock("ws", async (load) => {
  const real = await load<typeof import("ws")>();
  return {
    ...real,
    default: class extends real.WebSocket {
      constructor(_address: string, options: object) {
        super(target.url, { ...options, agent: undefined });
      }
    },
  };
});
import { WebSocketServer } from "ws";
import { startNeonPostgresBridge } from "../../server/lib/neonPostgresBridge";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const upstream = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(upstream, "listening");
  target.url = `ws://127.0.0.1:${(upstream.address() as net.AddressInfo).port}`;
  cleanup.push(() => new Promise<void>((resolve) => {
    for (const client of upstream.clients) client.terminate();
    upstream.close(() => resolve());
  }));
  const bridge = await startNeonPostgresBridge("postgresql://fixture:password@ep-test-pooler.neon.tech/db?sslmode=require&channel_binding=require");
  cleanup.push(() => bridge.close());
  const url = new URL(bridge.databaseUrl);
  const client = net.connect(Number(url.port), url.hostname);
  cleanup.push(() => { client.destroy(); });
  await once(client, "connect");
  return { upstream, bridge, client, url };
}

describe("Neon native PostgreSQL bridge", () => {
  it("forwards binary traffic in both directions with backpressure", async () => {
    const { upstream, client, url } = await fixture();
    upstream.on("connection", (ws) => ws.on("message", (data) => ws.send(data)));
    const input = Buffer.alloc(512 * 1024);
    for (let n = 0; n < input.length; n++) input[n] = n % 256;
    const received: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      let length = 0;
      client.on("error", reject);
      client.on("data", (data) => {
        received.push(data);
        length += data.length;
        if (length === input.length) resolve();
      });
      client.write(input);
    });
    expect(Buffer.concat(received)).toEqual(input);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.username).toBe("fixture");
    expect(url.searchParams.get("sslmode")).toBe("disable");
    expect(url.searchParams.has("channel_binding")).toBe(false);
  });

  it("closes native sessions when the owned bridge stops", async () => {
    const { client, bridge } = await fixture();
    const closed = once(client, "close");
    bridge.close();
    await closed;
    expect(client.destroyed).toBe(true);
  });

  it("closes native sessions when the upstream WebSocket disconnects", async () => {
    const { upstream, client } = await fixture();
    const closed = once(client, "close");
    upstream.on("connection", (ws) => ws.terminate());
    await closed;
    expect(client.destroyed).toBe(true);
  });

  it("rejects non-Neon targets", async () => {
    await expect(startNeonPostgresBridge("postgresql://u:p@example.com/db"))
      .rejects.toThrow("requires a Neon");
  });
});
