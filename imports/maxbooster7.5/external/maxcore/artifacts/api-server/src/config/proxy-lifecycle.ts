import type { Request, Response } from "express";

/** Own timers and disconnect listeners for one upstream request. */
export function proxyLifetime(req: Request, res: Response, timeoutMs: number) {
  const controller = new AbortController();
  const disconnect = () => {
    if (!res.writableEnded) controller.abort(new DOMException("Client disconnected", "AbortError"));
  };
  const timer = setTimeout(() => controller.abort(
    new DOMException("Upstream request deadline exceeded", "TimeoutError")), timeoutMs);
  req.once("aborted", disconnect);
  res.once("close", disconnect);
  if (req.aborted || res.destroyed) disconnect();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      req.off("aborted", disconnect);
      res.off("close", disconnect);
    },
  };
}

/** Recovery is bounded and cancelled when its client no longer needs it. */
export async function waitForProxyRecovery(
  ready: () => boolean,
  signal: AbortSignal,
  timeoutMs = 90_000,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    signal.throwIfAborted();
    if (ready()) return;
    if (Date.now() - started >= timeoutMs) {
      throw new DOMException("Python recovery deadline exceeded", "TimeoutError");
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 50);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
    });
  }
}
