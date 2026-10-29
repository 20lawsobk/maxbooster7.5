import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const start = route.indexOf("const hybridMeta = hybridStorageService.getMetadata(key);");
const read = route.indexOf("hybridStorageService.read(readPrincipal, key)", start);
const guard = route.indexOf("if (hybridMeta && !fileBuffer) {", read);
const fallback = route.indexOf("fileBuffer = await storageService.downloadFile(key)", read);
const fallbackBlock = route.lastIndexOf("if (!fileBuffer) {", fallback);
const guardSource = guard < 0 || fallbackBlock < 0 ? "" : route.slice(guard, fallbackBlock).trim();

function evaluateGuard(hybridMeta, fileBuffer, hybridReadError) {
  assert.ok(guardSource, "a fail-closed guard must be present");
  const calls = [];
  const res = {
    status(code) { calls.push(["status", code]); return this; },
    json(body) { calls.push(["json", body]); return { code: calls.find(([kind]) => kind === "status")?.[1], body }; },
  };
  const logger = { warn(_context, message) { calls.push(["warn", message]); } };
  const evaluate = new Function(
    "hybridMeta", "fileBuffer", "hybridReadError", "logger", "res",
    `${guardSource}\nreturn "direct-fallback-eligible";`,
  );
  return { result: evaluate(hybridMeta, fileBuffer, hybridReadError, logger, res), calls };
}

describe("hybrid file reads must fail closed before direct-storage fallback", () => {
  it("places the guard after the hybrid read and before the direct fallback", () => {
    assert.ok(start >= 0 && read > start && guard > read && fallbackBlock > guard && fallback > fallbackBlock);
  });

  it("refuses direct fallback after an integrity or storage error", () => {
    const { result, calls } = evaluateGuard({ userId: "owner" }, null, new Error("hash mismatch"));
    assert.equal(result.code, 503);
    assert.equal(result.body.message, "Hybrid file temporarily unavailable");
    assert.equal(calls.filter(([kind]) => kind === "warn").length, 1);
  });

  it("refuses direct fallback after an unexpected null hybrid read", () => {
    assert.equal(evaluateGuard({ userId: "owner" }, null, undefined).result.code, 503);
  });

  it("preserves a successful verified hybrid read", () => {
    assert.equal(evaluateGuard({ userId: "owner" }, Buffer.from("ok"), undefined).result, "direct-fallback-eligible");
  });

  it("retains the legacy direct fallback when no hybrid metadata exists", () => {
    assert.equal(evaluateGuard(undefined, null, undefined).result, "direct-fallback-eligible");
  });

  it("keeps private no-store caching before any hybrid read", () => {
    const cache = route.lastIndexOf('res.setHeader("Cache-Control", "private, no-store")', start);
    assert.ok(cache >= 0 && cache < read);
  });

  it("does not expose the underlying storage error in the HTTP response", () => {
    const { result } = evaluateGuard({ userId: "owner" }, null, new Error("secret-storage-token"));
    assert.doesNotMatch(JSON.stringify(result.body), /secret-storage-token/);
  });
});
