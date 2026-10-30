// ── Parallel download processor ─────────────────────────────────────────────
//
// The dataset download path buffers each file fully in memory before handing it
// to the fabric. A naive "just raise the concurrency" therefore risks OOM when
// several large files coincide. This module provides two cooperating primitives:
//
//   - MemoryBudget: a FIFO byte-budget semaphore that bounds the *total* bytes
//     buffered in flight across all concurrent downloads. A download reserves
//     against its Content-Length before it starts buffering and releases on
//     completion/error, so memory can never exceed the budget regardless of how
//     many workers run.
//   - ParallelDownloadProcessor: a fixed-size worker pool that drains a queue of
//     download ids with bounded concurrency, deduping ids that are already
//     queued or in flight.
//
// Together they let many small/skip/error rows clear in parallel (the common
// case) while a handful of large files are throttled by the memory budget rather
// than by a global serial lock.

/**
 * FIFO byte-budget semaphore. `acquire(n)` resolves once `n` bytes are available
 * and returns a release function. Requests are granted in arrival order so a
 * stream of small requests cannot starve a large one. A single request larger
 * than the whole budget is clamped to the budget so it can still run alone
 * (never deadlocks).
 */
export class MemoryBudget {
  private available: number;
  private readonly total: number;
  private readonly waiters: Array<{ need: number; grant: () => void }> = [];

  constructor(totalBytes: number) {
    this.total = Math.max(1, Math.floor(totalBytes));
    this.available = this.total;
  }

  async acquire(bytes: number): Promise<() => void> {
    const need = Math.min(Math.max(0, Math.floor(bytes)), this.total);

    // Fast path: budget free and nobody waiting ahead of us (preserves FIFO
    // fairness — if there are waiters we must queue behind them).
    if (this.waiters.length === 0 && this.available >= need) {
      this.available -= need;
    } else {
      await new Promise<void>((grant) => {
        this.waiters.push({ need, grant });
        this.drain();
      });
      // drain() already subtracted `need` from the budget on our behalf.
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.available += need;
      this.drain();
    };
  }

  /** Grant queued waiters in FIFO order while the budget can satisfy the head. */
  private drain(): void {
    while (this.waiters.length > 0 && this.available >= this.waiters[0]!.need) {
      const w = this.waiters.shift()!;
      this.available -= w.need;
      w.grant();
    }
  }

  get stats(): { total: number; available: number; waiting: number } {
    return {
      total: this.total,
      available: this.available,
      waiting: this.waiters.length,
    };
  }
}

export interface ParallelProcessorOptions {
  /** Maximum number of tasks running at once. */
  concurrency: number;
  /** Called when a task's runner rejects (the pool never throws on its own). */
  onError?: (taskId: number, err: unknown) => void;
  /** Called whenever the queue empties and no task is in flight. */
  onIdle?: () => void;
}

/**
 * Fixed-size worker pool that drains a queue of numeric task ids. `add()` is
 * idempotent w.r.t. ids already queued or in flight, so re-enqueuing the same
 * download id (e.g. on restart recovery) is a no-op rather than a double run.
 */
export class ParallelDownloadProcessor {
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private readonly inFlight = new Set<number>();
  private readonly concurrency: number;
  private readonly runner: (id: number) => Promise<void>;
  private readonly onError?: (id: number, err: unknown) => void;
  private readonly onIdle?: () => void;

  constructor(
    runner: (id: number) => Promise<void>,
    opts: ParallelProcessorOptions,
  ) {
    this.runner = runner;
    this.concurrency = Math.max(1, Math.floor(opts.concurrency));
    this.onError = opts.onError;
    this.onIdle = opts.onIdle;
  }

  add(ids: number[]): void {
    for (const id of ids) {
      if (this.queued.has(id) || this.inFlight.has(id)) continue;
      this.queue.push(id);
      this.queued.add(id);
    }
    this.pump();
  }

  get stats(): { active: number; queued: number; concurrency: number } {
    return {
      active: this.inFlight.size,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }

  private pump(): void {
    while (this.inFlight.size < this.concurrency && this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.queued.delete(id);
      this.inFlight.add(id);
      void this.runner(id)
        .catch((err) => this.onError?.(id, err))
        .finally(() => {
          this.inFlight.delete(id);
          if (this.inFlight.size === 0 && this.queue.length === 0) {
            this.onIdle?.();
          }
          this.pump();
        });
    }
  }
}
