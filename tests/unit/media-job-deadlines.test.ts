import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForMediaJobPoll, withMediaJobDeadline } from "../../client/src/lib/mediaJobTransport";
import { pollVideoJobUntilDone } from "../../client/src/lib/videoJobPolling";
import { pollStudioAudioJob, resolveStudioGenerationResponse } from "../../client/src/components/studio/studioAudioDelivery";

const forever = () => new Promise<never>(() => {});
const noSleep = async () => {};
const reply = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// Advance the real state machine with controlled transport promises; no app,
// provider, database, loopback server or application credential is required.
describe("bounded generation status transport", () => {
  it("bounds a stalled header even when the transport ignores cancellation", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = withMediaJobDeadline(async requestSignal => { signal = requestSignal; return forever(); }, {
      timeoutMs: 100, timeoutMessage: "Owned request timed out",
    });
    const assertion = expect(result).rejects.toThrow("Owned request timed out");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes caller listeners and the deadline after a successful operation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(withMediaJobDeadline(async () => "delivered", {
      signal: controller.signal, timeoutMs: 100, timeoutMessage: "late",
    })).resolves.toBe("delivered");
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts an in-flight status operation immediately on caller cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const result = withMediaJobDeadline(async requestSignal => { signal = requestSignal; return forever(); }, {
      signal: controller.signal, timeoutMs: 100, timeoutMessage: "late",
    });
    const assertion = expect(result).rejects.toThrow("Owned cancellation");
    await Promise.resolve();
    controller.abort(new Error("Owned cancellation"));
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans normal wait listeners rather than accumulating one per poll", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const wait = waitForMediaJobPoll(10, controller.signal);
    await vi.advanceTimersByTimeAsync(10); await wait;
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects an aborted wait and clears its timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const wait = waitForMediaJobPoll(100, controller.signal);
    const assertion = expect(wait).rejects.toThrow("Cancelled wait");
    controller.abort(new Error("Cancelled wait"));
    await assertion; expect(vi.getTimerCount()).toBe(0);
  });
  it("does not dispatch if cancellation arrives before deferred transport starts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = vi.fn(forever);
    const result = withMediaJobDeadline(operation, { signal: controller.signal,
      timeoutMs: 100, timeoutMessage: "late" });
    const assertion = expect(result).rejects.toThrow("Cancel before dispatch");
    controller.abort(new Error("Cancel before dispatch"));
    await assertion;
    expect(operation).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("removes deadlines and listeners when transport fails before the deadline", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(withMediaJobDeadline(async () => { throw new Error("Owned transport failure"); }, {
      signal: controller.signal, timeoutMs: 100, timeoutMessage: "late",
    })).rejects.toThrow("Owned transport failure");
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the deadline active while a native blob body remains open", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const result = withMediaJobDeadline(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { body = controller; },
    })).blob(), { timeoutMs: 100, timeoutMessage: "Blob body timed out" });
    const assertion = expect(result).rejects.toThrow("Blob body timed out");
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(body).toBeDefined(); body?.error(new Error("Owned stalled stream cleanup"));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start transport for an already aborted signal", async () => {
    const controller = new AbortController(); controller.abort();
    const operation = vi.fn(forever);
    await expect(withMediaJobDeadline(operation, { signal: controller.signal,
      timeoutMs: 100, timeoutMessage: "late" })).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("video polling cancellation and wall-clock budget", () => {
  it("bounds stalled response bodies, not just returned headers", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchStatus = vi.fn(async (_id: string, requestSignal?: AbortSignal) => {
      signal = requestSignal;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }));
    });
    const result = pollVideoJobUntilDone("owned-job", { fetchStatus, sleep: noSleep,
      requestTimeoutMs: 100, maxElapsedMs: 500, maxConsecutiveErrors: 1 });
    const assertion = expect(result).rejects.toThrow("Network error");
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(signal?.aborted).toBe(true);
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(body).toBeDefined();
    body?.error(new Error("Owned stalled stream cleanup"));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("caller cancellation aborts the actual outstanding request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const fetchStatus = vi.fn(async (_id: string, requestSignal?: AbortSignal) => { signal = requestSignal; return forever(); });
    const result = pollVideoJobUntilDone("owned-job", { fetchStatus, sleep: noSleep, signal: controller.signal });
    const assertion = expect(result).rejects.toThrow("Cancelled");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(); await assertion;
    expect(signal?.aborted).toBe(true);
    expect(fetchStatus).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not publish a late completed response after cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let finish!: (response: Response) => void;
    const fetchStatus = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const completed = vi.fn(); const onProgress = vi.fn();
    const result = pollVideoJobUntilDone("owned-job", { fetchStatus, sleep: noSleep,
      signal: controller.signal, onProgress });
    result.then(completed, () => {});
    const assertion = expect(result).rejects.toThrow("Cancelled");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(); await assertion;
    finish(reply({ status: "done", url: "/api/storage/file/late.mp4" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("enforces elapsed time when request latency exceeds the attempt-delay budget", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchStatus = vi.fn(async (_id: string, requestSignal?: AbortSignal) => { signal = requestSignal; return forever(); });
    const result = pollVideoJobUntilDone("owned-job", { fetchStatus, sleep: noSleep,
      requestTimeoutMs: 200, maxElapsedMs: 100, maxAttempts: 210 });
    const assertion = expect(result).rejects.toThrow("Video generation timed out");
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(signal?.aborted).toBe(true); expect(fetchStatus).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans deadlines after a real successful response without changing its owner URL", async () => {
    vi.useFakeTimers();
    const fetchStatus = vi.fn(async () => reply({ status: "done", url: "/api/storage/file/owned.mp4" }));
    await expect(pollVideoJobUntilDone("owned-job", { fetchStatus, sleep: noSleep }))
      .resolves.toMatchObject({ success: true, url: "/api/storage/file/owned.mp4" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Studio delivery deadline", () => {
  it("bounds a stalled audio status fetch without needing a supplied caller signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => { signal = options?.signal ?? undefined; return forever(); });
    const result = pollStudioAudioJob("owned-job", { fetchImpl, requestTimeoutMs: 100, maxElapsedMs: 500 });
    const assertion = expect(result).rejects.toThrow("Audio status request timed out");
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(signal?.aborted).toBe(true); expect(fetchImpl).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a stalled audio response body too", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } })));
    const result = pollStudioAudioJob("owned-job", { fetchImpl, requestTimeoutMs: 100, maxElapsedMs: 500 });
    const assertion = expect(result).rejects.toThrow("Audio status request timed out");
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(body).toBeDefined();
    body?.error(new Error("Owned stalled stream cleanup"));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a result before dispatch when its caller is already cancelled", async () => {
    const controller = new AbortController(); controller.abort(new Error("Closed project"));
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    await expect(resolveStudioGenerationResponse({ audioFilePath: "/api/storage/file/old.wav" }, {
      signal: controller.signal,
    })).rejects.toThrow("Closed project");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("does not turn caller cancellation during optional MIDI into a completed result", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    let midiSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("audio-job")) return reply({ status: "done", url: "/api/storage/file/owned.wav" });
      midiSignal = options?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start(control) { body = control; } }));
    });
    vi.stubGlobal("fetch", fetchImpl);
    const result = resolveStudioGenerationResponse({ jobId: "owned-job" }, { signal: controller.signal });
    const assertion = expect(result).rejects.toThrow("Project changed");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    controller.abort(new Error("Project changed")); await assertion;
    expect(midiSignal?.aborted).toBe(true);
    expect(body).toBeDefined(); body?.error(new Error("Owned stalled stream cleanup"));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the delivered audio available if optional MIDI stalls", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("audio-job")
      ? reply({ status: "done", url: "/api/storage/file/owned.wav" })
      : new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }))));
    const result = resolveStudioGenerationResponse({ jobId: "owned-job" });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toMatchObject({ audioFilePath: "/api/storage/file/owned.wav",
      midiError: "Generated MIDI download timed out" });
    expect(body).toBeDefined();
    body?.error(new Error("Owned stalled stream cleanup"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
