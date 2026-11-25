type Command = (command: string, args: string[], signal?: AbortSignal) => Promise<unknown>;
type Request = {
  command: string; args: string[]; bytes: number; signal?: AbortSignal;
  resolve: (value: unknown) => void; reject: (error: unknown) => void;
};
const blocking = new Set(["BLPOP", "BRPOP", "BZPOPMIN", "BZPOPMAX"]);
const standalone = new Set([
  "PUBLISH", "SUBSCRIBE", "UNSUBSCRIBE", "PSUBSCRIBE", "PUNSUBSCRIBE", "__PDIM_MULTI_EXEC",
]);

/** Reuse the canonical transaction engine to amortize remote journal latency.
 * Each caller waits for the underlying transaction's durable completion.
 * Blocking pops must not hold the queue needed to deliver their future values.
 */
export class PdimBucketCommandBatcher {
  private queue: Request[] = [];
  private queuedBytes = 0;
  private running = false;
  private closed = false;
  private drainWaiters: (() => void)[] = [];
  constructor(private readonly execute: Command) {}

  exec(command: string, args: string[], signal?: AbortSignal): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("PDIM command batcher is closed"));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted"));
    const upper = command.toUpperCase();
    if (blocking.has(upper)) return this.execute(upper, args, signal);
    const bytes = Buffer.byteLength(upper) + args.reduce((sum, arg) => sum + Buffer.byteLength(arg), 0);
    if (this.queue.length >= 4096 || this.queuedBytes + bytes > 64 * 1024 * 1024) {
      return Promise.reject(Object.assign(new Error("PDIM durable write queue is full"), { code: "PDIM_BACKPRESSURE" }));
    }
    const promise = new Promise((resolve, reject) => {
      this.queue.push({ command: upper, args, bytes, signal, resolve, reject });
      this.queuedBytes += bytes;
    });
    if (!this.running) {
      this.running = true;
      setTimeout(() => { void this.drain(); }, 5);
    }
    return promise;
  }

  private individual(request: Request): boolean {
    return standalone.has(request.command) || request.command.startsWith("CAPSULE.");
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length) {
        const requests: Request[] = [];
        let bytes = 0;
        while (this.queue.length && requests.length < 128) {
          const next = this.queue[0]!;
          if (requests.length && (this.individual(next) || bytes + next.bytes > 4 * 1024 * 1024)) break;
          this.queue.shift();
          this.queuedBytes -= next.bytes;
          if (next.signal?.aborted) {
            next.reject(next.signal.reason ?? new Error("Request aborted"));
            continue;
          }
          requests.push(next);
          bytes += next.bytes;
          if (this.individual(next)) break;
        }
        if (!requests.length) continue;
        try {
          if (this.individual(requests[0]!)) {
            const row = requests[0]!;
            row.resolve(await this.execute(row.command, row.args, row.signal));
          } else {
            const result = await this.execute("__PDIM_MULTI_EXEC", [
              JSON.stringify(requests.map(row => [row.command, ...row.args])),
            ]);
            if (!Array.isArray(result) || result.length !== requests.length ||
                result.some(row => !Array.isArray(row) || row.length !== 2)) {
              throw new Error("Invalid canonical PDIM transaction response");
            }
            for (let index = 0; index < requests.length; index++) {
              const [error, value] = result[index];
              if (error) requests[index]!.reject(new Error(
                typeof error === "object" && typeof error.message === "string" ? error.message : "PDIM command failed",
              ));
              else requests[index]!.resolve(value);
            }
          }
        } catch (error) {
          for (const row of requests) row.reject(error);
        }
      }
    } finally {
      this.running = false;
      for (const resolve of this.drainWaiters.splice(0)) resolve();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.running) await new Promise<void>(resolve => this.drainWaiters.push(resolve));
  }
}
