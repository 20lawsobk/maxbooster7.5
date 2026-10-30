/** Bound both response headers and body consumption, including cancellation. */
export async function withMediaJobDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs: number; timeoutMessage: string },
): Promise<T> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Media request timeout must be a positive finite number");
  }
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  let rejectAborted!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
  const abort = (reason: unknown) => {
    controller.abort(reason);
    rejectAborted(reason);
  };
  const relayAbort = () => abort(options.signal?.reason ?? new DOMException("Cancelled", "AbortError"));
  options.signal?.addEventListener("abort", relayAbort, { once: true });
  const timer = setTimeout(() => abort(new DOMException(options.timeoutMessage, "TimeoutError")), options.timeoutMs);
  try {
    // Racing also bounds an injected transport that does not observe its signal.
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    }), aborted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", relayAbort);
  }
}

/** Remove the abort listener on normal completion as well as cancellation. */
export function waitForMediaJobPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
