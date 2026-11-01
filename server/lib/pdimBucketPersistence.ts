import type { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisEntry, RedisAofRecord } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { PdimBucketJournal, type PdimObjectStore } from "./pdimBucketJournal.js";
import { isBucketTransaction, orderedBucketRecovery, type PdimBucketTransaction } from "./pdimBucketRecovery.js";
import { readBucketSnapshot, writeBucketSnapshot } from "./pdimBucketSnapshot.js";

// Copy mutable containers, not the immutable strings that dominate storage.
// Capturing must be synchronous at the canonical owner's checkpoint boundary.
function captureEntry(entry: RedisEntry): RedisEntry {
  const copy = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
  };
  return copy(entry) as RedisEntry;
}
class CheckpointCancelledForShutdown extends Error {}

/** Bucket durability coordinator. The application owner still supplies the
 * canonical RedisStore, validation, HTTP admission and graceful-drain boundary.
 * No method writes a local data file or substitutes local state on bucket error.
 */
export class PdimBucketPersistence {
  readonly journal: PdimBucketJournal<PdimBucketTransaction>;
  private capsuleSequence = 0;
  private heartbeat?: ReturnType<typeof setInterval>;
  private renewPending?: Promise<void>;
  private checkpointPending?: Promise<void>;
  private failed?: Error;
  private closing = false;

  constructor(
    objects: PdimObjectStore, namespace: string,
    private readonly engine: RedisStore,
    private readonly entries: Map<string, RedisEntry>,
    private readonly validate: (key: string, value: unknown) => RedisEntry,
    private readonly onStage: (stage: string) => void = () => {},
  ) {
    this.journal = new PdimBucketJournal(objects, namespace, isBucketTransaction);
  }

  assertHealthy(): void {
    if (this.failed) throw this.failed;
    this.journal.assertOwned();
  }

  /** Offline migration only: input must be a quiesced, recovered source. */
  async initialize(
    entries: Iterable<readonly [string, RedisEntry]>,
    redisSequence: number, capsuleSequence: number,
  ): Promise<void> {
    const snapshot = await writeBucketSnapshot(this.journal, entries, redisSequence, capsuleSequence);
    await this.journal.initialize(snapshot);
  }

  async open(): Promise<void> {
    this.onStage("acquiring-lease");
    await this.journal.acquire();
    this.onStage("lease-acquired");
    this.heartbeat = setInterval(() => {
      if (this.renewPending || this.failed) return;
      this.renewPending = this.journal.renew().catch(cause => {
        this.failed = Object.assign(new Error("Bucket PDIM lease unavailable", { cause }),
          { code: "PDIM_DURABILITY_FAILURE" });
      }).finally(() => { this.renewPending = undefined; });
    }, 10_000);
    this.heartbeat.unref();
    try {
      const recovered = await this.journal.recover((completed, total) =>
        this.onStage(`journal:${completed}/${total}`));
      const snapshot = await readBucketSnapshot(this.journal, recovered.snapshot, this.validate,
        (completed, total) => this.onStage(`snapshot-shards:${completed}/${total}`));
      this.onStage("snapshot-verified");
      await this.journal.renew();
      const ordered = orderedBucketRecovery(recovered.transactions, snapshot.redisSequence, snapshot.capsuleSequence);
      this.assertHealthy();
      // Complete validation before publishing any recovered state to the owner.
      this.entries.clear();
      for (const [key, entry] of snapshot.entries) this.entries.set(key, entry);
      this.engine.attachEmbeddedSnapshot(this.entries, {
        baselineSequence: snapshot.redisSequence, recoveryRecords: ordered.records,
      });
      this.engine.attachEmbeddedSnapshot(this.entries, {
        baselineSequence: ordered.redisSequence,
        appendAof: records => this.appendRedis(records),
      });
      this.capsuleSequence = ordered.capsuleSequence;
    } catch (error) {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.engine.closeEmbedded();
      throw error;
    }
  }

  private async appendRedis(records: readonly RedisAofRecord[]): Promise<void> {
    this.assertHealthy();
    await this.journal.append({ kind: "redis", records: [...records] });
  }

  async commitCapsule(changes: Record<string, string | null>, publish: () => void): Promise<void> {
    this.assertHealthy();
    // Capsule callers must use the existing LocalPdimCapsules serialized queue.
    const sequence = this.capsuleSequence + 1;
    await this.journal.append({ kind: "capsule", sequence, changes }, () => {
      publish();
      this.capsuleSequence = sequence;
    });
  }

  checkpoint(): Promise<void> {
    if (this.checkpointPending) return this.checkpointPending;
    this.checkpointPending = this.saveCheckpoint().finally(() => { this.checkpointPending = undefined; });
    return this.checkpointPending;
  }

  private async saveCheckpoint(): Promise<void> {
    const captured = await this.captureSnapshot();
    // Remote uploads happen outside both mutation gates; only immutable captured
    // containers are serialized, so requests can continue during a large upload.
    const snapshot = await writeBucketSnapshot({
      readImmutable: id => this.journal.readImmutable(id),
      putImmutable: bytes => {
        if (this.closing) throw new CheckpointCancelledForShutdown();
        return this.journal.putImmutable(bytes);
      },
    }, captured.entries,
      captured.redisSequence, captured.capsuleSequence);
    if (this.closing) throw new CheckpointCancelledForShutdown();
    await this.journal.checkpoint(snapshot, captured.position);
    this.engine.compactEmbeddedAof(captured.redisSequence);
  }

  async captureSnapshot() {
    this.assertHealthy();
    return this.engine.captureEmbeddedCheckpoint(redisSequence =>
      this.journal.capture(position => ({
        position, redisSequence, capsuleSequence: this.capsuleSequence,
        entries: [...this.entries].map(([key, entry]) => [key, captureEntry(entry)] as const),
      })),
    );
  }

  /** The application must stop admitting commands and drain HTTP first. */
  async close(): Promise<void> {
    this.closing = true;
    try {
      // Every acknowledged mutation is already durable. Shutdown must not start
      // another multi-gigabyte snapshot and exceed the process drain deadline.
      if (this.checkpointPending) {
        try { await this.checkpointPending; }
        catch (error) { if (!(error instanceof CheckpointCancelledForShutdown)) throw error; }
      }
      await this.journal.capture(() => undefined);
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.renewPending) await this.renewPending;
      this.assertHealthy();
      await this.journal.release();
    } finally {
      if (this.heartbeat) clearInterval(this.heartbeat);
    }
  }

  /** Startup failed before serving traffic; don't leave a heartbeat renewing an
   * owner that never bound its port. No checkpoint is necessary in this case. */
  async abortStartup(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.renewPending) await this.renewPending;
    this.assertHealthy();
    await this.journal.release();
  }
}
