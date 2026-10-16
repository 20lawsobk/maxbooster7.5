import { createHash, randomUUID } from "node:crypto";

/** Object writes must enforce generation preconditions; missing objects are null,
 * transport/authorization errors must throw. No filesystem fallback is allowed. */
export interface PdimObjectStore {
  read(key: string): Promise<{ bytes: Buffer; generation: string } | null>;
  write(key: string, bytes: Buffer, generation: string | 0): Promise<string>;
}

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
  readonly code = "PDIM_DURABILITY_FAILURE";
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

  async readImmutable(id: string): Promise<Buffer> {
    if (!hash(id)) throw new PdimBucketUnavailable("Invalid bucket object reference");
    const object = await this.objects.read(`${this.prefix}/objects/${id}`);
    if (!object || digest(object.bytes) !== id) {
      throw new PdimBucketUnavailable("Bucket PDIM object missing or corrupt");
    }
    return object.bytes;
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
        throw new PdimBucketUnavailable("Another process owns this bucket PDIM namespace");
      }
      await this.publish({ ...head, owner: this.owner, leaseUntil: this.clock() + this.leaseMs },
        actual.generation);
    });
  }

  renew(): Promise<void> {
    return this.serial(async () => {
      this.assertOwned();
      try {
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

  async recover(): Promise<{ snapshot: Buffer; transactions: T[] }> {
    this.assertOwned();
    const head = { ...this.head! };
    const snapshot = await this.readImmutable(head.snapshot);
    const transactions: T[] = [];
    let tip = head.tip;
    let expected = head.sequence;
    while (expected > head.baseSequence) {
      if (!tip) throw new PdimBucketUnavailable("Bucket PDIM journal truncated");
      const frame = JSON.parse((await this.readImmutable(tip)).toString()) as Frame<T>;
      if (frame.version !== 1 || frame.sequence !== expected ||
          !(frame.previous === null || hash(frame.previous)) || !this.validateValue(frame.value)) {
        throw new PdimBucketUnavailable("Bucket PDIM journal discontinuity or invalid transaction");
      }
      transactions.push(frame.value);
      tip = frame.previous;
      expected--;
    }
    if (tip !== head.baseTip) throw new PdimBucketUnavailable("Bucket PDIM checkpoint ancestry mismatch");
    this.assertOwned();
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
