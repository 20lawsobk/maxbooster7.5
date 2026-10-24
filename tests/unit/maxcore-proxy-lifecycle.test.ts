import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type { Request, Response } from "express";
import { afterEach, expect, it, vi } from "vitest";
import { proxyLifetime, waitForProxyRecovery } from "../../external/maxcore/artifacts/api-server/src/config/proxy-lifecycle.js";

afterEach(() => vi.useRealTimers());
function client() {
  return { req: new EventEmitter() as Request, res: new EventEmitter() as Response };
}
it("cancels a held request on disconnect and releases timers/listeners", async () => {
  vi.useFakeTimers();
  const { req, res } = client();
  const scope = proxyLifetime(req, res, 90000);
  const waiting = waitForProxyRecovery(() => false, scope.signal).catch(error => error);
  res.emit("close");
  expect((await waiting).name).toBe("AbortError");
  scope.dispose();
  expect(req.listenerCount("aborted")).toBe(0);
  expect(res.listenerCount("close")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds unavailable recovery instead of leaving a permanent polling loop", async () => {
  vi.useFakeTimers();
  const { req, res } = client();
  const scope = proxyLifetime(req, res, 100);
  const waiting = waitForProxyRecovery(() => false, scope.signal).catch(error => error);
  await vi.advanceTimersByTimeAsync(100);
  expect((await waiting).name).toBe("TimeoutError");
  scope.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("finishes recovery and removes its timers after a successful request", async () => {
  vi.useFakeTimers();
  const { req, res } = client();
  const scope = proxyLifetime(req, res, 90000);
  await waitForProxyRecovery(() => true, scope.signal);
  scope.dispose();
  expect(vi.getTimerCount()).toBe(0);
  expect(res.listenerCount("close")).toBe(0);
});

// Exercise the exact production retry function without importing workers.
const path = "external/maxcore/artifacts/api-server/src/routes/model-proxy.ts";
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) &&
  ["_isTransientConnErr", "_upstreamRequest"].includes(n.name?.text ?? "")).map(n => n.getText(source)).join("\n");
it("does not replay mutations after a lost response and bounds safe-read retries", async () => {
  const unavailable = Object.assign(new Error("response lost"), { code: "UND_ERR_SOCKET" });
  const send = vi.fn().mockRejectedValue(unavailable);
  const retry = vm.runInNewContext(ts.transpile(`${functions}; _upstreamRequest;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), { undiciRequest: send, _cbRecordFailure() {}, waitForRecovery: async () => {}, console: { log() {} } });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    send.mockClear();
    await expect(retry("http://fixture/operation", { method })).rejects.toThrow("response lost");
    expect(send).toHaveBeenCalledTimes(1);
  }
  send.mockClear();
  await expect(retry("http://fixture/status", { method: "GET" })).rejects.toThrow("response lost");
  expect(send).toHaveBeenCalledTimes(2);
});
