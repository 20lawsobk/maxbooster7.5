import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes, createHash } from "node:crypto";

// This test never contacts PostgreSQL; actual storage I/O uses the real private
// local PDIM owner, isolated in a temporary working directory and free port.
vi.mock("../../db.js", () => ({ db: {} }));

describe("canonical local storage provider boot wiring", () => {
  it("constructs before owner boot without I/O, then writes/reads local PDIM despite stale remote defaults", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "provider-boot-"));
    const cwd = process.cwd();
    const saved = { ...process.env };
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    let stop: (() => Promise<void>) | undefined;
    let closePockets: (() => Promise<void>) | undefined;
    try {
      process.chdir(temporary);
      Object.assign(process.env, {
        LOCAL_PDIM_PORT: String(port),
        PDIM_LOCAL_CHANNEL_TOKEN: randomBytes(32).toString("hex"),
        PDIM_EXEC_URL: "http://127.0.0.1:1/stale-external-endpoint",
        PDIM_HTTP_EXEC_URL: "http://127.0.0.1:1/stale-external-endpoint",
        PDIM_EXEC_TOKEN: "stale-external-credential",
        PDIM_BEARER_TOKEN: "stale-external-credential",
      });
      delete process.env.PDIM_FORCE_REMOTE;
      vi.resetModules();
      const transport = vi.spyOn(globalThis, "fetch");
      const { storageService, PocketDimensionStorageProvider } = await import("../storageService.js");
      const provider = new PocketDimensionStorageProvider();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(transport).not.toHaveBeenCalled();
      const local = await import("../../lib/localPdimServer.js");
      stop = local.stopLocalPdimServer;
      await local.startLocalPdimServer();
      const { pocketManager } = await import("../../pocket-dimension/index.js");
      closePockets = () => pocketManager.closeAll();
      const bytes = Buffer.alloc(1644);
      bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
      bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
      bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
      bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
      bytes.write("data", 36); bytes.writeUInt32LE(1600, 40);
      const key = "users/isolated-test/generated/boot-proof.wav";
      await storageService.uploadFileAtKey(bytes, key, "audio/wav");
      const actual = await storageService.downloadFile(key);
      expect(createHash("sha256").update(actual).digest("hex"))
        .toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(await provider.fileExists(key)).toBe(true);
      const execCalls = transport.mock.calls.filter(([url]) => String(url).includes("/exec"));
      expect(execCalls.length).toBeGreaterThan(0);
      for (const [url, init] of execCalls) {
        expect(String(url)).toBe(`http://127.0.0.1:${port}/api/redis/instances/local/exec`);
        expect((init?.headers as Record<string, string>)?.Authorization)
          .toBe(`Bearer ${process.env.PDIM_LOCAL_CHANNEL_TOKEN}`);
      }
      const requestCount = transport.mock.calls.length;
      const token = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      delete process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      await expect(new PocketDimensionStorageProvider().uploadFile(bytes, "missing-token.wav", "audio/wav"))
        .rejects.toThrow("requires the inherited private channel token");
      expect(transport.mock.calls.length).toBe(requestCount);
      process.env.PDIM_LOCAL_CHANNEL_TOKEN = token;
      transport.mockRestore();
    } finally {
      vi.restoreAllMocks();
      if (closePockets) await closePockets();
      if (stop) await stop();
      process.chdir(cwd);
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30_000);
});