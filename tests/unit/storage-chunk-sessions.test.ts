import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkUploadSessions, ChunkUploadError, STORAGE_MAX_FILE_BYTES } from "../../server/lib/chunkUploadSessions.js";

const scratch: string[] = [];
afterEach(() => { for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function store(limits = {}, now?: () => number) {
  const directory = mkdtempSync(path.join(tmpdir(), "chunk-unit-")); scratch.push(directory);
  // Unit tests use the actual private filesystem. The separate two-process
  // PostgreSQL test exercises the real transaction/advisory-lock boundary.
  let tail = Promise.resolve();
  return new ChunkUploadSessions({ directory, limits, now, connect: async () => {
    let unlock = () => {};
    return { query: async (text: string) => {
      if (text.startsWith("SELECT pg_advisory")) {
        const prior = tail; tail = new Promise<void>(resolve => { unlock = resolve; }); await prior;
      }
      if (text === "COMMIT" || text === "ROLLBACK") unlock();
    }, release: () => unlock() };
  } });
}
const metadata = (overrides: Record<string, unknown> = {}) => ({
  fileId: "fixture-file", userId: "fixture-owner", fileName: "fixture.wav",
  mimeType: "audio/wav", category: "audio", fileSize: "4", totalChunks: "2", chunkIndex: "0", ...overrides,
});
async function errorStatus(fn: () => Promise<unknown>, status: number) {
  await expect(fn()).rejects.toMatchObject({ statusCode: status });
}

describe("bounded shared storage chunk sessions", () => {
  it("rejects infeasible declarations and malformed parameters before reservation", async () => {
    const sessions = store();
    for (const bad of [{ fileSize: "1", totalChunks: "1000000" }, { chunkIndex: "-1" }, { chunkIndex: "2" },
      { chunkIndex: "0x" }, { chunkIndex: "0.1" }, { chunkIndex: Infinity }, { totalChunks: "0" },
      { totalChunks: "1.0" }, { fileSize: "0" }, { fileId: "x".repeat(129) },
      { mimeType: "audio/wav\r\nfixture" }, { fileSize: String(STORAGE_MAX_FILE_BYTES + 1) }]) {
      await errorStatus(() => sessions.accept(metadata(bad), Buffer.from("AB")), 400);
    }
    expect(await sessions.stats()).toEqual({ sessions: 0, reservedBytes: 0, bufferedBytes: 0 });
  });
  it("retains identical retries once and refuses changed metadata, bytes and foreign owners", async () => {
    const sessions = store();
    expect((await sessions.accept(metadata(), Buffer.from("AB"))).uploaded).toBe(1);
    expect((await sessions.accept(metadata(), Buffer.from("AB"))).uploaded).toBe(1);
    await errorStatus(() => sessions.accept(metadata({ fileName: "changed.wav" }), Buffer.from("AB")), 409);
    await errorStatus(() => sessions.accept(metadata(), Buffer.from("ZZ")), 409);
    await errorStatus(() => sessions.accept(metadata({ userId: "other" }), Buffer.from("AB")), 403);
    await errorStatus(() => sessions.cancel("fixture-file", "other"), 403);
    expect(await sessions.stats()).toEqual({ sessions: 1, reservedBytes: 4, bufferedBytes: 2 });
  });
  it("requires exact actual totals and releases malformed assemblies", async () => {
    for (const [declared, final] of [["4", "CDE"], ["6", "CD"]]) {
      const sessions = store(); await sessions.accept(metadata({ fileSize: declared }), Buffer.from("AB"));
      await errorStatus(() => sessions.accept(metadata({ fileSize: declared, chunkIndex: "1" }), Buffer.from(final)), 400);
      expect((await sessions.stats()).reservedBytes).toBe(0);
    }
  });
  it("enforces aggregate and per-owner reservations and session counts", async () => {
    const sessions = store({ maxFileBytes: 10, maxChunkBytes: 10, maxReservedBytes: 10, maxUserReservedBytes: 6, maxSessions: 3, maxUserSessions: 2 });
    await sessions.accept(metadata({ fileId: "first" }), Buffer.from("AB"));
    await errorStatus(() => sessions.accept(metadata({ fileId: "user-limit" }), Buffer.from("AB")), 429);
    await sessions.accept(metadata({ fileId: "second", userId: "other" }), Buffer.from("AB"));
    await errorStatus(() => sessions.accept(metadata({ fileId: "global-limit", userId: "third" }), Buffer.from("AB")), 429);
    await sessions.cancel("first", "fixture-owner"); await sessions.accept(metadata({ fileId: "replacement" }), Buffer.from("AB"));
    expect((await sessions.stats()).reservedBytes).toBe(8);
    for (const limits of [{ maxSessions: 1 }, { maxUserSessions: 1 }]) {
      const count = store(limits); await count.accept(metadata(), Buffer.from("AB"));
      await errorStatus(() => count.accept(metadata({ fileId: "second" }), Buffer.from("AB")), 429);
    }
  });
  it("retains the supported 500MiB declaration and frees it on cancellation", async () => {
    const sessions = store(); await sessions.accept(metadata({ fileSize: String(STORAGE_MAX_FILE_BYTES), totalChunks: "100" }), Buffer.from("AB"));
    expect((await sessions.stats()).reservedBytes).toBe(STORAGE_MAX_FILE_BYTES);
    await sessions.cancel("fixture-file", "fixture-owner"); expect((await sessions.stats()).reservedBytes).toBe(0);
  });
  it("expires inactive sessions and preserves unknown completion claims across expiry", async () => {
    let now = 0; const sessions = store({ ttlMs: 10 }, () => now);
    await sessions.accept(metadata(), Buffer.from("AB")); now = 11; await sessions.prune();
    expect((await sessions.stats()).sessions).toBe(0);
    await errorStatus(() => sessions.accept(metadata({ chunkIndex: "1" }), Buffer.from("CD")), 409);
    await sessions.accept(metadata(), Buffer.from("AB")); await sessions.accept(metadata({ chunkIndex: "1" }), Buffer.from("CD"));
    const claim = await sessions.beginCompletion("fixture-file", "fixture-owner"); expect(claim.bytes.toString()).toBe("ABCD");
    now = 50; await sessions.prune(); expect((await sessions.stats()).reservedBytes).toBe(4);
    await errorStatus(() => sessions.cancel("fixture-file", "fixture-owner"), 409);
    await errorStatus(() => sessions.beginCompletion("fixture-file", "fixture-owner"), 409);
    expect((await sessions.accept(metadata(), Buffer.from("AB"))).pending).toBe(true);
    await sessions.release("fixture-file", "fixture-owner", claim.token); expect((await sessions.stats()).reservedBytes).toBe(0);
  });
});

// Execute the exact registered handlers without starting provider clients,
// shared-database connections, cron cleanup or post-response notifications.
const routeFile = "server/routes/storage.ts";
const source = ts.createSourceFile(routeFile, readFileSync(routeFile, "utf8"), ts.ScriptTarget.Latest, true);
const sanitizers = source.statements.filter(n => ts.isFunctionDeclaration(n) &&
  ["sanitizeFileName", "sanitizeCategory"].includes(n.name?.text ?? "")).map(n => n.getText(source)).join("\n");
function handler(method: string, url: string, globals: Record<string, unknown>) {
  let found = "";
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        n.expression.getText(source) === `router.${method}` && ts.isStringLiteral(n.arguments[0]) &&
        n.arguments[0].text === url) found = n.arguments[n.arguments.length - 1].getText(source);
    ts.forEachChild(n, visit);
  };
  visit(source);
  expect(found).not.toBe("");
  return vm.runInNewContext(ts.transpile(`${sanitizers}; const handler=${found}; handler;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), { Buffer, path, ChunkUploadError, ALLOWED_CATEGORIES: new Set(["audio", "files"]),
    logger: { info() {}, warn() {}, error() {} }, setImmediate() {}, ...globals });
}
function response() {
  return { statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; } };
}
function routeHarness(ownerRows = [{ id: "fixture-storage" }], lostTrackingAck = false) {
  const sessions = store();
  const uploads = vi.fn(async (_bytes: Buffer, _prefix: string, _name: string, _mime: string) => "fixture-key");
  const deleted = vi.fn(async () => {});
  const tracked: unknown[] = [];
  const db = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === "files" ? tracked : ownerRows }) }) }),
    insert: () => ({ values: (value: unknown) => { tracked.push(value); return {
      onConflictDoNothing: () => { if (lostTrackingAck) throw new Error("Fixture SQL response lost after commit"); return { returning: async () => ownerRows }; },
    }; } }),
  };
  const globals = { chunkUploads: sessions, storageService: { uploadFileAtKey: uploads, deleteFile: deleted,
    getDownloadUrl: async () => "/fixture-download" }, db, userStorage: { id: "id", userId: "user" },
    userStorageFiles: "files", eq() {}, and() {}, isNull() {} };
  const post = handler("post", "/upload/chunk", globals);
  const cancel = handler("delete", "/upload/chunk/:fileId", globals);
  const request = (overrides: Record<string, unknown> = {}, bytes = "AB") => ({
    user: { id: "fixture-owner" }, body: metadata(overrides), file: { buffer: Buffer.from(bytes) },
  });
  return { store: sessions, uploads, deleted, tracked, post, cancel, request };
}

describe("registered storage chunk handlers", () => {
  it("rejects the reproduced declared-one-byte/million-chunk attack before retention or provider writes", async () => {
    const h = routeHarness();
    const res = response();
    await h.post(h.request({ fileSize: "1", totalChunks: "1000000" }, "ABCD"), res);
    expect(res.statusCode).toBe(400);
    expect((await h.store.stats()).sessions).toBe(0);
    expect(h.uploads).not.toHaveBeenCalled();
  });

  it("assembles exact owned bytes once and tracks actual size using frozen metadata", async () => {
    const h = routeHarness();
    const first = response();
    await h.post(h.request(), first);
    expect(first.body.complete).toBe(false);
    await h.post(h.request(), response());
    const last = response();
    await h.post(h.request({ chunkIndex: "1" }, "CD"), last);
    expect(last.body).toMatchObject({ success: true, complete: true, file: { name: "fixture.wav", size: 4 } });
    expect(h.uploads).toHaveBeenCalledTimes(1);
    expect(h.uploads.mock.calls[0][0].toString()).toBe("ABCD");
    expect(h.uploads.mock.calls[0][1]).toMatch(/^users\/fixture-owner\/audio\/chunk-[a-f0-9-]+\/fixture.wav$/);
    expect(h.uploads.mock.calls[0][2]).toBe("audio/wav");
    const retry = response(); await h.post(h.request({ chunkIndex: "1" }, "CD"), retry);
    expect(retry.body).toMatchObject({ complete: true, file: { key: last.body.file.key } });
    expect(h.uploads).toHaveBeenCalledTimes(1);
    expect(h.tracked).toContainEqual(expect.objectContaining({ userId: "fixture-owner", sizeBytes: 4 }));
    expect((await h.store.stats()).reservedBytes).toBe(0);
  });

  it("preserves unknown provider outcomes and refuses cancellation or duplicate writes", async () => {
    const h = routeHarness();
    await h.post(h.request(), response());
    let fail!: (reason: Error) => void;
    let started!: () => void;
    const uploading = new Promise<void>(resolve => { started = resolve; });
    h.uploads.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; started(); }));
    const last = response();
    const completing = h.post(h.request({ chunkIndex: "1" }, "CD"), last);
    await uploading;
    const duplicate = response();
    await h.post(h.request({ chunkIndex: "1" }, "CD"), duplicate);
    expect(duplicate.statusCode).toBe(409);
    const cancelled = response();
    await h.cancel({ user: { id: "fixture-owner" }, params: { fileId: "fixture-file" } }, cancelled);
    expect(cancelled.statusCode).toBe(409);
    expect(h.uploads).toHaveBeenCalledTimes(1);
    fail(new Error("fixture storage unavailable"));
    await completing;
    expect(last.statusCode).toBe(500);
    expect((await h.store.stats()).reservedBytes).toBe(4);
  });

  it("reconciles a committed tracking row after response loss without uploading or deleting twice", async () => {
    const h = routeHarness([{ id: "fixture-storage" }], true);
    await h.post(h.request(), response());
    const lost = response(); await h.post(h.request({ chunkIndex: "1" }, "CD"), lost);
    expect(lost.statusCode).toBe(500); expect(h.deleted).not.toHaveBeenCalled();
    expect((await h.store.stats()).reservedBytes).toBe(4);
    const retry = response(); await h.post(h.request({ chunkIndex: "1" }, "CD"), retry);
    expect(retry.body).toMatchObject({ success: true, complete: true, file: { size: 4 } });
    expect(h.uploads).toHaveBeenCalledTimes(1); expect(h.deleted).not.toHaveBeenCalled();
    expect((await h.store.stats()).reservedBytes).toBe(0);
  });

  it("rolls back an untrackable object instead of reporting upload success", async () => {
    const h = routeHarness([]);
    await h.post(h.request(), response());
    const last = response();
    await h.post(h.request({ chunkIndex: "1" }, "CD"), last);
    expect(last.statusCode).toBe(500);
    expect(h.deleted).toHaveBeenCalledWith(expect.stringMatching(/^users\/fixture-owner\/audio\/chunk-/));
    expect((await h.store.stats()).reservedBytes).toBe(0);
  });
});
