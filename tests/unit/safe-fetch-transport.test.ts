import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeFetchBuffer } from "../../server/services/safeUrlFetch";

// Route only the test Agent's sockets to an isolated HTTP fixture. Production
// URL/redirect checks, Axios streaming/decompression limits and aborts stay real.
const servers: http.Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
async function fixture(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const original = (http.Agent.prototype as any).addRequest;
  vi.spyOn(http.Agent.prototype as any, "addRequest").mockImplementation(function(this: http.Agent, ...args: any[]) {
    const [request, options] = args;
    return original.call(this, request, {...options, hostname: "127.0.0.1", host: "127.0.0.1", port});
  });
}
describe("real bounded HTTP transport", () => {
  it("downloads legitimate binary audio bytes", async () => {
    const bytes = Buffer.from([0,255,1,128]);
    await fixture((_, res) => res.end(bytes));
    expect((await safeFetchBuffer("http://public.example/audio")).body).toEqual(bytes);
  });
  it("rejects a metadata redirect before a second request", async () => {
    let requests = 0;
    await fixture((_, res) => {
      requests++;
      res.writeHead(302, {Location:"http://169.254.169.254/latest/meta-data/"}); res.end();
    });
    await expect(safeFetchBuffer("http://public.example/audio")).rejects.toThrow();
    expect(requests).toBe(1);
  });
  it("restricts Bandcamp-style redirect destinations", async () => {
    await fixture((_, res) => {res.writeHead(302,{Location:"http://another.example/"});res.end();});
    await expect(safeFetchBuffer("http://public.example/", {
      allowedHost: host => host === "public.example",
    })).rejects.toThrow();
  });
  it("caps chunked responses without Content-Length", async () => {
    await fixture((_, res) => {res.write(Buffer.alloc(64));res.end(Buffer.alloc(64));});
    await expect(safeFetchBuffer("http://public.example/",{maxBytes:100})).rejects.toThrow();
  });
  it("enforces an overall deadline on a stalled response body", async () => {
    await fixture((_, res) => {res.writeHead(200);res.write("partial");});
    await expect(safeFetchBuffer("http://public.example/",{timeoutMs:100})).rejects.toThrow();
  });
  it("bounds redirect loops", async () => {
    let requests = 0;
    await fixture((_, res) => {requests++;res.writeHead(302,{Location:"http://public.example/"});res.end();});
    await expect(safeFetchBuffer("http://public.example/")).rejects.toThrow();
    expect(requests).toBe(4);
  });
});