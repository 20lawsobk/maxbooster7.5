import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

/** Object writes must enforce generation preconditions; missing objects are null,
 * transport/authorization errors must throw. No filesystem fallback is allowed. */
export interface PdimObjectStore {
  read(key: string, context?: PdimReadContext): Promise<{ bytes: Buffer; generation: string } | null>;
  write(key: string, bytes: Buffer, generation: string | 0): Promise<string>;
}

export const DEFAULT_PDIM_RECOVERY_TIMEOUT_MS = 180_000;

export type PdimReadContext = {
  phase: string;
  sequence?: number;
  ordinal?: number;
  deadlineAt?: number;
  onRead?: (event: PdimRecoveryReadEvent) => void;
};

export type PdimRecoveryReadEvent = {
  phase: string;
  sequence?: number;
  ordinal?: number;
  elapsedMs: number;
  byteLength?: number;
  outcome: "ok" | "failed" | "timeout";
  failureCategory?: string;
};

export type PdimRecoveryOptions = {
  deadlineAt?: number;
  timeoutMs?: number;
  onRead?: (event: PdimRecoveryReadEvent) => void;
};

type Head = {
  version: 1;
  commit: string;
  snapshot: string;
  baseSequence: number;
  baseTip: string | null;
  sequence: number;
  tip: string | null;
  owner: string | null;
  leaseUntil: number;
};

type Frame<T> = { version: 1; sequence: number; previous: string | null; value: T };
export type BucketCheckpoint = Readonly<{ sequence: number; tip: string | null }>;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sequence = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export class PdimBucketUnavailable extends Error {
  readonly code: string = "PDIM_DURABILITY_FAILURE";
}
export class PdimBucketReadTimeout extends PdimBucketUnavailable {
  readonly code = "PDIM_READ_TIMEOUT";

  constructor(
    readonly phase: string,
    readonly sequence?: number,
    readonly ordinal?: number,
    readonly elapsedMs = 0,
  ) {
    super("Bucket PDIM read deadline exceeded");
    this.name = "PdimBucketReadTimeout";
  }
}
export class PdimBucketReadFailure extends PdimBucketUnavailable {
  readonly code = "PDIM_STORAGE_READ_FAILURE";

  constructor(readonly category: string) {
    super("Bucket PDIM object read failed");
    this.name = "PdimBucketReadFailure";
  }
}
export class PdimBucketLeaseBusy extends PdimBucketUnavailable {
  constructor(readonly retryAfterMs: number) {
    super("Another process owns this bucket PDIM namespace");
  }
}

export function pdimBucketReadFailureCategory(error: unknown): string {
  if (error instanceof PdimBucketReadTimeout) return "timeout";
  if (error instanceof PdimBucketReadFailure) return error.category;
  const code = error && typeof error === "object"
    ? (error as { code?: unknown }).code
    : undefined;
  if (typeof code === "string" &&
      ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNABORTED", "ABORT_ERR"].includes(code)) {
    return "timeout";
  }
  if (code === 401 || code === 403) return "access_denied";
  if (code === 404) return "not_found";
  if (code === 429) return "rate_limited";
  if (typeof code === "number" && code >= 500 && code <= 599) return "service_unavailable";
  if (error instanceof PdimBucketUnavailable) {
    if (/missing/i.test(error.message)) return "missing";
    if (/corrupt|integrity|discontinuity|truncated|ancestry/i.test(error.message)) return "integrity";
    return "durability_failure";
  }
  return "storage_error";
}

/** Generation-fenced, single-owner redo log. Objects are immutable; only the
 * small HEAD pointer changes. Unreferenced uploads are NOT committed writes.
 * Snapshot content is supplied by the owner at its consistent capture boundary.
 */
export class PdimBucketJournal<T> {
  private head?: Head;
  private generation?: string;
  private readonly owner = randomUUID();
  private tail: Promise<unknown> = Promise.resolve();
  private failure?: Error;

  constructor(
    private readonly objects: PdimObjectStore,
    private readonly prefix: string,
    private readonly validateValue: (value: unknown) => value is T,
    private readonly clock = Date.now,
    private readonly leaseMs = 60_000,
  ) {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) {
      throw new Error("Invalid PDIM bucket namespace");
    }
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000) throw new Error("Invalid lease duration");
  }

  private serial<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private decodeHead(bytes: Buffer): Head {
    const value = JSON.parse(bytes.toString()) as Head;
    if (value.version !== 1 || typeof value.commit !== "string" ||
        !/^[a-f0-9-]{36}$/.test(value.commit) || !hash(value.snapshot) ||
        !sequence(value.sequence) || !sequence(value.baseSequence) ||
        value.baseSequence > value.sequence ||
        !(value.tip === null || hash(value.tip)) ||
        !(value.baseTip === null || hash(value.baseTip)) ||
        (value.sequence === 0) !== (value.tip === null) ||
        (value.baseSequence === 0) !== (value.baseTip === null) ||
        !(value.owner === null || (typeof value.owner === "string" &&
          /^[a-f0-9-]{36}$/.test(value.owner))) ||
        !Number.isSafeInteger(value.leaseUntil) || value.leaseUntil < 0) {
      throw new PdimBucketUnavailable("Invalid bucket PDIM commit pointer");
    }
    return value;
  }

  assertOwned(): void {
    if (this.failure) throw this.failure;
    if (!this.head || this.head.owner !== this.owner || this.head.leaseUntil <= this.clock()) {
      throw new PdimBucketUnavailable("Bucket PDIM ownership unavailable or expired");
    }
  }

  async putImmutable(bytes: Buffer): Promise<string> {
    const id = digest(bytes);
    const key = `${this.prefix}/objects/${id}`;
    try {
      await this.objects.write(key, bytes, 0);
    } catch (cause) {
      // Reconcile an ambiguous successful upload or an existing identical object.
      // An authorization/network failure is never treated as an absent object.
      const existing = await this.objects.read(key);
      if (!existing || digest(existing.bytes) !== id) {
        throw new PdimBucketUnavailable("Bucket PDIM object publication failed", { cause });
      }
    }
    return id;
  }

  async readImmutable(id: string, context?: PdimReadContext): Promise<Buffer> {
    if (!hash(id)) throw new PdimBucketUnavailable("Invalid bucket object reference");
    const startedAt = performance.now();
    let outcome: PdimRecoveryReadEvent["outcome"] = "failed";
    let failureCategory: string | undefined;
    let byteLength: number | undefined;
    try {
      const key = `${this.prefix}/objects/${id}`;
      let object: { bytes: Buffer; generation: string } | null;
      if (context?.deadlineAt !== undefined) {
        const remainingMs = context.deadlineAt - performance.now();
        if (remainingMs <= 0) {
          throw new PdimBucketReadTimeout(
            context.phase, context.sequence, context.ordinal,
            Math.max(0, Math.round(performance.now() - startedAt)),
          );
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          object = await Promise.race([
            this.objects.read(key, context),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new PdimBucketReadTimeout(
                context.phase, context.sequence, context.ordinal,
                Math.max(0, Math.round(performance.now() - startedAt)),
              )), remainingMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (performance.now() >= context.deadlineAt) {
          throw new PdimBucketReadTimeout(
            context.phase, context.sequence, context.ordinal,
            Math.max(0, Math.round(performance.now() - startedAt)),
          );
        }
      } else {
        object = await this.objects.read(key, context);
      }
      if (!object) throw new PdimBucketReadFailure("missing");
      byteLength = object.bytes.byteLength;
      if (digest(object.bytes) !== id) throw new PdimBucketReadFailure("integrity");
      outcome = "ok";
      return object.bytes;
    } catch (error) {
      failureCategory = pdimBucketReadFailureCategory(error);
      outcome = failureCategory === "timeout" ? "timeout" : "failed";
      throw error;
    } finally {
      if (context?.onRead) {
        context.onRead({
          phase: context.phase,
          ...(context.sequence === undefined ? {} : { sequence: context.sequence }),
          ...(context.ordinal === undefined ? {} : { ordinal: context.ordinal }),
          elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
          ...(byteLength === undefined ? {} : { byteLength }),
          outcome,
          ...(failureCategory ? { failureCategory } : {}),
        });
      }
    }
  }

  private async publish(next: Omit<Head, "commit">, expected: string | 0): Promise<void> {
    // Distinguish this attempt from an identical earlier renewal/initialization.
    const committed: Head = { ...next, commit: randomUUID() };
    const bytes = Buffer.from(JSON.stringify(committed));
    try {
      this.generation = await this.objects.write(`${this.prefix}/HEAD`, bytes, expected);
    } catch (cause) {
      // A response can be lost AFTER the CAS committed. A verified identical
      // readback is the only case where we acknowledge that ambiguous write.
      const actual = await this.objects.read(`${this.prefix}/HEAD`);
      if (!actual || !actual.bytes.equals(bytes)) {
        throw new PdimBucketUnavailable("Bucket PDIM commit rejected or unconfirmed", { cause });
      }
      this.generation = actual.generation;
    }
    this.head = committed;
  }

  /** Explicit migration/new-store operation; never called implicitly on a miss. */
  initialize(snapshot: string): Promise<void> {
    return this.serial(async () => {
      await this.readImmutable(snapshot);
      await this.publish({
        version: 1, snapshot, baseSequence: 0, baseTip: null,
        sequence: 0, tip: null, owner: null, leaseUntil: 0,
      }, 0);
    });
  }

  acquire(): Promise<void> {
    return this.serial(async () => {
      if (this.head?.owner === this.owner) throw new Error("Bucket PDIM already acquired");
      const actual = await this.objects.read(`${this.prefix}/HEAD`);
      if (!actual) throw new PdimBucketUnavailable("Bucket PDIM migration is required; refusing an empty store");
      const head = this.decodeHead(actual.bytes);
      if (head.owner && head.leaseUntil > this.clock()) {
        throw new PdimBucketLeaseBusy(head.leaseUntil - this.clock());
      }
      await this.publish({ ...head, owner: this.owner, leaseUntil: this.clock() + this.leaseMs },
        actual.generation);
    });
  }

  renew(): Promise<void> {
    return this.serial(async () => {
      try {
        if (this.failure) throw this.failure;
        if (!this.head || this.head.owner !== this.owner) {
          throw new PdimBucketUnavailable("Bucket PDIM is not owned by this process");
        }
        if (this.head.leaseUntil <= this.clock()) {
          // A long recovery/GC pause may delay heartbeat execution. Revalidate
          // the unchanged generation; never renew over a successor's lease.
          const actual = await this.objects.read(`${this.prefix}/HEAD`);
          if (!actual || actual.generation !== this.generation ||
              this.decodeHead(actual.bytes).owner !== this.owner) {
            throw new PdimBucketUnavailable("Bucket PDIM owner changed during lease expiry");
          }
        }
        await this.publish({ ...this.head!, leaseUntil: this.clock() + this.leaseMs }, this.generation!);
      } catch (cause) {
        this.failure = new PdimBucketUnavailable("Bucket PDIM lease renewal failed", { cause });
        throw this.failure;
      }
    });
  }

  checkpointPosition(): BucketCheckpoint {
    this.assertOwned();
    return Object.freeze({ sequence: this.head!.sequence, tip: this.head!.tip });
  }

  /** Execute a synchronous capture only after earlier commits AND their local
   * publication callbacks. The caller must separately fence Redis mutations. */
  capture<R>(callback: (position: BucketCheckpoint) => R): Promise<R> {
    return this.serial(async () => {
      this.assertOwned();
      return callback(this.checkpointPosition());
    });
  }

  append(value: T, publish?: () => void): Promise<number> {
    return this.serial(async () => {
      this.assertOwned();
      if (!this.validateValue(value)) throw new Error("Invalid bucket PDIM transaction");
      try {
        const current = this.head!;
        const frame: Frame<T> = {
          version: 1, sequence: current.sequence + 1, previous: current.tip, value,
        };
        const tip = await this.putImmutable(Buffer.from(JSON.stringify(frame)));
        // The network upload must not extend a lease that has already expired.
        this.assertOwned();
        await this.publish({ ...current, tip, sequence: frame.sequence,
          leaseUntil: this.clock() + this.leaseMs }, this.generation!);
        publish?.();
        return frame.sequence;
      } catch (cause) {
        this.failure = new PdimBucketUnavailable("Bucket PDIM write failed; recovery required", { cause });
        throw this.failure;
      }
    });
  }

  async recover(
    onProgress?: (completed: number, total: number) => void,
    options: PdimRecoveryOptions = {},
  ): Promise<{ snapshot: Buffer; transactions: T[] }> {
    this.assertOwned();
    const startedAt = performance.now();
    if (options.timeoutMs !== undefined &&
        (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      throw new Error("Invalid bucket PDIM recovery timeout");
    }
    const deadlineAt = options.deadlineAt ??
      startedAt + (options.timeoutMs ?? DEFAULT_PDIM_RECOVERY_TIMEOUT_MS);
    if (!Number.isFinite(deadlineAt) || deadlineAt <= startedAt) {
      throw new PdimBucketReadTimeout("recovery", undefined, undefined, 0);
    }
    const readContext = (phase: string, sequence?: number, ordinal?: number): PdimReadContext => ({
      phase, sequence, ordinal, deadlineAt, onRead: options.onRead,
    });
    const assertDeadline = (sequence?: number) => {
      if (performance.now() >= deadlineAt) {
        throw new PdimBucketReadTimeout(
          "journal_replay", sequence, undefined,
          Math.max(0, Math.round(performance.now() - startedAt)),
        );
      }
    };
    const head = { ...this.head! };
    const snapshot = await this.readImmutable(head.snapshot, readContext("snapshot_manifest"));
    assertDeadline();
    const transactions: T[] = [];
    let tip = head.tip;
    let expected = head.sequence;
    onProgress?.(0, head.sequence - head.baseSequence);
    while (expected > head.baseSequence) {
      assertDeadline(expected);
      if (!tip) throw new PdimBucketUnavailable("Bucket PDIM journal truncated");
      const frame = JSON.parse((await this.readImmutable(
        tip, readContext("journal_frame", expected),
      )).toString()) as Frame<T>;
      assertDeadline(expected);
      if (frame.version !== 1 || frame.sequence !== expected ||
          !(frame.previous === null || hash(frame.previous)) || !this.validateValue(frame.value)) {
        throw new PdimBucketUnavailable("Bucket PDIM journal discontinuity or invalid transaction");
      }
      transactions.push(frame.value);
      tip = frame.previous;
      expected--;
      if ((head.sequence - expected) % 8 === 0 || expected === head.baseSequence) {
        onProgress?.(head.sequence - expected, head.sequence - head.baseSequence);
      }
    }
    if (tip !== head.baseTip) throw new PdimBucketUnavailable("Bucket PDIM checkpoint ancestry mismatch");
    this.assertOwned();
    assertDeadline();
    return { snapshot, transactions: transactions.reverse() };
  }

  checkpoint(snapshot: string, position: BucketCheckpoint): Promise<void> {
    return this.serial(async () => {
      this.assertOwned();
      const head = this.head!;
      if (!sequence(position.sequence) || position.sequence < head.baseSequence ||
          position.sequence > head.sequence ||
          !(position.tip === null || hash(position.tip))) {
        throw new Error("Invalid bucket PDIM checkpoint position");
      }
      // Verify the supplied position is in the committed chain, not an orphan.
      let tip = head.tip;
      for (let index = head.sequence; index > position.sequence; index--) {
        const frame = JSON.parse((await this.readImmutable(tip!)).toString()) as Frame<T>;
        if (frame.sequence !== index) throw new Error("Invalid checkpoint ancestry");
        tip = frame.previous;
      }
      if (tip !== position.tip) throw new Error("Checkpoint is not a committed ancestor");
      await this.readImmutable(snapshot);
      this.assertOwned();
      await this.publish({ ...head, snapshot, baseSequence: position.sequence,
        baseTip: position.tip }, this.generation!);
    });
  }

  release(): Promise<void> {
    return this.serial(async () => {
      this.assertOwned();
      await this.publish({ ...this.head!, owner: null, leaseUntil: 0 }, this.generation!);
    });
  }
}
