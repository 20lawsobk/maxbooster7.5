import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import vm from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute the registered production handler without starting DB or providers.
const file = "server/routes/socialMedia.ts";
const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
let body = "";
function visit(node: ts.Node): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(source) === "router" && node.expression.name.text === "get" &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/video-proxy/:filename") {
    body = node.arguments.at(-1)!.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);

class VideoResponse extends Writable {
  statusCode = 200;
  headersSent = false;
  chunks: Buffer[] = [];
  headers = new Map<string, string>();
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk)); callback();
  }
  setHeader(key: string, value: string) { this.headers.set(key, value); }
  writeHead(status: number) { this.statusCode = status; this.headersSent = true; return this; }
  status(status: number) { this.statusCode = status; return this; }
  json(value: unknown) { this.end(JSON.stringify(value)); return this; }
  send(value: Buffer) { this.end(value); return this; }
}

function harness(storedUrl: string, fetch = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, { status: 404 }))) {
  const media = Buffer.alloc(16_384); media.write("ftyp", 4, "ascii");
  const external = vi.fn(async (_url: string, _options: unknown) => ({ status: 200, body: media, contentType: "video/mp4" }));
  const write = vi.fn(async () => {});
  const logger = { info: vi.fn(), warn: vi.fn() };
  const handler = vm.runInNewContext(ts.transpile(`const handler=${body};handler;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), {
    getMaxcoreOrigin: () => "https://maxcore.example.invalid",
    getMaxcoreGenerationKey: () => "synthetic-private-channel",
    pocketManager: { openPocket: async () => ({ exists: () => false, write }) },
    getMaxcoreVideoUrlStore: async () => new Map([["fixture.mp4", storedUrl]]),
    fetch, safeFetchBuffer: external, URL, Response, Readable, pipeline,
    AbortController, DOMException, setTimeout, clearTimeout, Buffer,
    logger,
  });
  const req = Object.assign(new EventEmitter(), { params: { filename: "fixture.mp4" }, user: { id: "fixture-owner" } });
  const res = new VideoResponse();
  return { run: () => handler(req, res), fetch, external, write, media, res, logger };
}

it("retrieves an external CDN artifact through the guarded public transport without credentials", async () => {
  const h = harness("https://cdn.example.invalid/fixture.mp4");
  await h.run();
  expect(h.external).toHaveBeenCalledExactlyOnceWith("https://cdn.example.invalid/fixture.mp4",
    { timeoutMs: 8000, maxBytes: 100 * 1024 * 1024 });
  expect(h.fetch).not.toHaveBeenCalled();
  expect(Buffer.concat(h.res.chunks)).toEqual(h.media);
  expect(h.write).toHaveBeenCalledExactlyOnceWith("fixture.mp4", expect.any(Buffer));
});

it("binds credentials and owner only to MaxCore and refuses automatic redirects", async () => {
  const transport = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, {
    status: 302, headers: { location: "https://cdn.example.invalid/fixture.mp4" },
  }));
  const h = harness("https://maxcore.example.invalid/media/fixture.mp4", transport);
  await h.run();
  expect(h.external).not.toHaveBeenCalled();
  expect(h.res.statusCode).toBe(404);
  for (const [url, options] of transport.mock.calls) {
    expect(new URL(url).origin).toBe("https://maxcore.example.invalid");
    expect(options.redirect).toBe("manual");
    expect(options.headers).toEqual({ Authorization: "Bearer synthetic-private-channel", "X-MaxCore-User-Id": "fixture-owner" });
  }
});

it.each(["file:///etc/passwd", "https://user:secret@cdn.example.invalid/fixture.mp4"])(
  "rejects invalid artifact URL %s before making a network call to it", async url => {
    const h = harness(url);
    await h.run();
    expect(h.external).not.toHaveBeenCalled();
    expect(h.fetch.mock.calls.every(([target]) => String(target).startsWith("https://maxcore.example.invalid/"))).toBe(true);
    expect(h.res.statusCode).toBe(404);
    expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain("user:secret");
  });
