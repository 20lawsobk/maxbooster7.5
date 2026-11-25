import type { ObjectIndex } from "../infra/ObjectIndex.js";
import type { PocketStorageService } from "../PocketStorageService.js";
import { logger } from "../../../logger.js";

export interface ScrubStatus {
  running: boolean;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  objectsScanned: number;
  shardsRepaired: number;
  unrecoverableObjects: number;
  passes: number;
}

/**
 * Background scrubber: periodically walks every object in the fabric and asks
 * the storage service to verify each erasure-coded object's shards (presence +
 * checksum), rebuilding and re-placing any missing or corrupt shard via
 * Reed–Solomon while ≥ k shards survive. This is the proactive half of
 * self-healing — it repairs silent shard loss before a read ever touches the
 * object, so degraded redundancy doesn't sit latent until a second failure makes
 * it unrecoverable.
 */
export class ScrubService {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private scrubbing = false;

  private status: ScrubStatus = {
    running: false,
    lastRunAt: null,
    lastDurationMs: null,
    objectsScanned: 0,
    shardsRepaired: 0,
    unrecoverableObjects: 0,
    passes: 0,
  };

  constructor(
    private readonly objectIndex: ObjectIndex,
    private readonly storage: PocketStorageService,
    private readonly intervalMs = 60 * 60 * 1000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.status.running = true;
    // Stagger the first pass so it doesn't pile onto cold-start warmup.
    setTimeout(() => void this.scrub(), 30_000);
    this.intervalId = setInterval(() => void this.scrub(), this.intervalMs);
    logger.info(
      `[FabricScrub] Background scrubber started (interval ${Math.round(
        this.intervalMs / 60000,
      )}m)`,
    );
  }

  stop(): void {
    this.running = false;
    this.status.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info("[FabricScrub] Stopped");
  }

  getStatus(): ScrubStatus {
    return { ...this.status };
  }

  /** Run a single scrub pass over every object. Safe to invoke on demand. */
  async scrub(): Promise<ScrubStatus> {
    if (this.scrubbing) return this.getStatus();
    this.scrubbing = true;
    const startedAt = Date.now();
    let scanned = 0;
    let repaired = 0;
    let unrecoverable = 0;

    try {
      const objects = await this.objectIndex.listAllObjects();
      for (const object of objects) {
        scanned++;
        try {
          const res = await this.storage.scrubObject(object);
          repaired += res.repaired;
          if (res.unrecoverable) unrecoverable++;
        } catch (err) {
          logger.error(
            `[FabricScrub] Error scrubbing object ${object.id}:`,
            err,
          );
        }
      }
    } catch (err) {
      logger.error("[FabricScrub] Scrub pass error:", err);
    }

    this.status = {
      running: this.running,
      lastRunAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      objectsScanned: scanned,
      shardsRepaired: repaired,
      unrecoverableObjects: unrecoverable,
      passes: this.status.passes + 1,
    };
    if (repaired > 0 || unrecoverable > 0) {
      logger.info(
        `[FabricScrub] Pass complete: scanned=${scanned} repaired=${repaired} unrecoverable=${unrecoverable}`,
      );
    }
    this.scrubbing = false;
    return this.getStatus();
  }
}
