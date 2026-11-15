import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVideoJobStatus } from "../../client/src/lib/videoJobPolling";
import { fetchMusicVideoJobStatus } from "../../client/src/lib/musicVideoJobs";

// Execute the actual visibility effect, its listener and cleanup. The controlled
// native Response body performs no network or browser/app startup.
function actualEffect() {
  const file = "client/src/components/content/ServerVideoGenerator.tsx";
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" &&
        node.arguments[0]?.getText(source).includes("const onVisible =")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!callback) throw new Error("Missing actual video visibility effect");
  return ts.transpileModule(`globalThis.setup = ${callback.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
function fixture(kind: "video" | "music-video", transport: typeof fetch) {
  const generation = new AbortController();
  const requests: Array<Promise<unknown>> = [];
  const listeners = new Map<string, () => void>();
  const apply = vi.fn(); const busy = vi.fn(); const stage = vi.fn(); const elapsed = vi.fn();
  const userCancelledRef = { current: false };
  vi.stubGlobal("fetch", transport);
  const context = { AbortController, AbortSignal, console,
    document: { visibilityState: "visible", addEventListener: (name: string, handler: () => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name) },
    activeJobIdRef: { current: "owned-job" }, activeJobKindRef: { current: kind },
    abortControllerRef: { current: generation }, userCancelledRef,
    fetch: transport, fetchMusicVideoJobStatus,
    readVideoJobStatus: (...args: Parameters<typeof readVideoJobStatus>) => {
      const result = readVideoJobStatus(...args); requests.push(result); return result;
    },
    applyVideoResult: apply, setIsGenerating: busy, setGeneratingStage: stage, setGeneratingElapsed: elapsed,
    setup: undefined as unknown as () => () => void,
  };
  vm.runInNewContext(actualEffect(), context);
  const cleanup = context.setup();
  return { generation, requests, listeners, apply, busy, stage, elapsed, cleanup,
    cancel: () => { userCancelledRef.current = true; generation.abort(); },
    show: () => listeners.get("visibilitychange")?.() };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(["video", "music-video"] as const)("%s resume ownership", kind => {
  it("consumes a complete status and publishes the original owned URL once", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async () => Response.json(kind === "video"
      ? { status: "done", url: "/api/storage/file/owned.mp4" }
      : { status: "completed", videoUrl: "/api/storage/file/owned.mp4" }));
    const f = fixture(kind, transport); f.show(); await vi.advanceTimersByTimeAsync(0);
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: true,
      url: "/api/storage/file/owned.mp4" }), "owned-job");
    expect(f.busy).toHaveBeenCalledWith(false); expect(f.stage).toHaveBeenCalledWith("");
    expect(transport.mock.calls[0]).toEqual([kind === "video" ? "/api/social/video-job/owned-job"
      : "/api/social/music-video-job/owned-job", expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) })]);
    f.cleanup(); expect(f.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels the outstanding native body with the user's generation request", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    let requestSignal: AbortSignal | undefined;
    const transport = vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      requestSignal = options?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start(control) { body = control; } }));
    });
    const f = fixture(kind, transport); f.show(); await vi.advanceTimersByTimeAsync(0);
    const rejected = expect(f.requests[0]).rejects.toThrow();
    f.cancel(); await rejected; await vi.advanceTimersByTimeAsync(0);
    expect(requestSignal?.aborted).toBe(true); expect(f.apply).not.toHaveBeenCalled();
    expect(f.busy).not.toHaveBeenCalled(); expect(f.stage).not.toHaveBeenCalled();
    body?.error(new Error("Owned stalled stream cleanup"));
    f.cleanup(); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts owned resume probes on unmount and prevents a late publication", async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    const transport = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      requestSignal = options?.signal ?? undefined;
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const f = fixture(kind, transport); f.show(); await vi.advanceTimersByTimeAsync(0);
    const rejected = expect(f.requests[0]).rejects.toThrow();
    f.cleanup(); await rejected;
    finish(Response.json({ status: "done", url: "/api/storage/file/late.mp4" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(requestSignal?.aborted).toBe(true); expect(f.apply).not.toHaveBeenCalled();
    expect(f.busy).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a bounded deadline through the full native response body", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    let requestSignal: AbortSignal | undefined;
    const transport = vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      requestSignal = options?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start(control) { body = control; } }));
    });
    const f = fixture(kind, transport); f.show();
    await vi.advanceTimersByTimeAsync(0);
    const rejected = expect(f.requests[0]).rejects.toThrow("Video status request timed out");
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    expect(requestSignal?.aborted).toBe(true); expect(f.apply).not.toHaveBeenCalled();
    expect(f.busy).not.toHaveBeenCalled(); body?.error(new Error("Owned stalled stream cleanup"));
    f.cleanup(); expect(vi.getTimerCount()).toBe(0);
  });
});
