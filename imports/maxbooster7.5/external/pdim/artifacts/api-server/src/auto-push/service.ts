// ============================================================================
// AUTO PUSH SERVICE
// Automatically pushes dataset chunk metadata from agent → training pipeline
// on server startup. Resumes from last checkpoint after restarts.
// ============================================================================

import { redisManager } from "../redis/manager.js";
import type { RedisStore } from "../redis/store.js";

// System instance IDs (hardcoded to match the provisioned instances)
const AGENT_INSTANCE_ID = "22c8e6d237afe8ae41541f87";
const TRAINING_INSTANCE_ID = "f26378c8b4faf9f237a0f816";

// Dataset config — 100 TB corpus spread across all 9 content categories:
// Visual Images: ~50 TB + Video: ~16 TB + Text-Image pairs: ~10 TB +
// Synthetic Renders: ~8 TB + 3D/Depth: ~6 TB + Faces/Humans: ~4 TB +
// Audio/Music: ~3 TB + Textures/Materials: ~2 TB + Social: ~1 TB = 100 TB
const TOTAL_DATASET_BYTES = 100 * 1024 * 1024 * 1024 * 1024; // 100 TB
const CHUNK_SIZE_BYTES = 64 * 1024 * 1024; // 64 MB per chunk
const TOTAL_CHUNKS = Math.ceil(TOTAL_DATASET_BYTES / CHUNK_SIZE_BYTES); // 1,638,400

// Push rate — 50 chunks × 5 ticks/sec = 250 chunks/sec
// Originally set to 500/50ms (10,000 chunks/sec) but that saturated the event
// loop: 1,500 synchronous execSync calls every 50ms blocked every other request
// for 100–300ms per tick.  Back to the original design rate from replit.md.
const BATCH_SIZE = 50; // chunks per tick
const TICK_MS = 200; // ms between ticks
// Yield to the event loop every this many chunks within a single tick so that
// even a 50-chunk batch can't monopolise the thread.
const YIELD_EVERY = 10;
const STATS_EVERY_N = 10; // write stats hash every N ticks (not every tick)
const AGENT_STREAM_MAX = 50_000; // cap the agent stream so it never OOMs

// Redis keys
const PROGRESS_KEY = "__autopush:progress";
const AGENT_STREAM_KEY = "push:stream";
const AGENT_STATS_KEY = "push:stats";
const TRAINING_INDEX_KEY = "received:chunks";
const TRAINING_STREAM_KEY = "received:stream";

class AutoPushService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private agentStore: RedisStore | null = null;
  private trainingStore: RedisStore | null = null;
  private chunkIndex = 0;
  private _running = false;
  private tickCount = 0;
  private _startedAt: number | null = null;
  // Prevents two async ticks from overlapping if a tick takes longer than TICK_MS.
  private _tickInFlight = false;

  async start(): Promise<void> {
    this.agentStore = await redisManager.getStore(AGENT_INSTANCE_ID);
    this.trainingStore = await redisManager.getStore(TRAINING_INSTANCE_ID);

    if (!this.agentStore || !this.trainingStore) {
      console.warn(
        "[AutoPush] System instances not found — skipping auto-push",
      );
      return;
    }

    // Resume from last checkpoint
    const saved = this.agentStore.execSync("GET", [PROGRESS_KEY]);
    this.chunkIndex = saved ? Number(saved) : 0;

    // Always validate against ZCARD as the authoritative ground truth.
    // The progress key can be stale or wrong — e.g. the health monitor calls
    // restart() during a crisis, which resets it to "0" even if the training
    // store is already complete.  ZCARD cannot be faked.
    const trainingCount = Number(
      this.trainingStore.execSync("ZCARD", [TRAINING_INDEX_KEY]) ?? 0,
    );

    if (trainingCount >= TOTAL_CHUNKS) {
      // Training store is fully populated regardless of what the progress key says.
      if (this.chunkIndex < TOTAL_CHUNKS) {
        console.log(
          `[AutoPush] Training store already has all ` +
            `${trainingCount.toLocaleString()} chunks (progress key was ` +
            `${this.chunkIndex.toLocaleString()}) — restoring checkpoint, skipping push.`,
        );
        this.agentStore.execSync("SET", [PROGRESS_KEY, String(TOTAL_CHUNKS)]);
      } else {
        console.log("[AutoPush] Dataset fully transferred. Nothing to push.");
      }
      return;
    }

    // If the training store is ahead of the progress key, fast-forward.
    if (trainingCount > this.chunkIndex) {
      console.log(
        `[AutoPush] Progress key says ${this.chunkIndex.toLocaleString()} but ` +
          `training store has ${trainingCount.toLocaleString()} chunks — ` +
          "resuming from training count.",
      );
      this.chunkIndex = trainingCount;
      this.agentStore.execSync("SET", [PROGRESS_KEY, String(this.chunkIndex)]);
    }

    if (this.chunkIndex >= TOTAL_CHUNKS) {
      console.log("[AutoPush] Dataset fully transferred. Nothing to push.");
      return;
    }

    const pct = ((this.chunkIndex / TOTAL_CHUNKS) * 100).toFixed(2);
    console.log(
      `[AutoPush] Starting — chunk ${this.chunkIndex.toLocaleString()}/${TOTAL_CHUNKS.toLocaleString()} (${pct}% done)`,
    );

    this._running = true;
    this._startedAt = Date.now();
    this.tickCount = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Stop current run, reset progress to 0, and re-start a fresh transfer. */
  async restart(): Promise<void> {
    this.stop();

    // Re-fetch stores in case they were recycled by the health monitor
    this.agentStore = await redisManager.getStore(AGENT_INSTANCE_ID);
    this.trainingStore = await redisManager.getStore(TRAINING_INSTANCE_ID);

    if (!this.agentStore || !this.trainingStore) {
      console.warn("[AutoPush] Restart failed — system instances unavailable");
      return;
    }

    // Guard: if the training store is already complete, don't erase the
    // progress key and re-run — that would cause the next boot to re-push
    // all 1.638M chunks against an already-full ZSet, creating sustained
    // event-loop pressure for nothing.
    const trainingCount = Number(
      this.trainingStore.execSync("ZCARD", [TRAINING_INDEX_KEY]) ?? 0,
    );
    if (trainingCount >= TOTAL_CHUNKS) {
      console.log(
        `[AutoPush] Restart requested but training store is already complete ` +
          `(${trainingCount.toLocaleString()} chunks) — restoring checkpoint, skipping reset.`,
      );
      this.agentStore.execSync("SET", [PROGRESS_KEY, String(TOTAL_CHUNKS)]);
      this.agentStore.execSync("HSET", [AGENT_STATS_KEY, "status", "complete"]);
      return;
    }

    // Reset progress
    this.chunkIndex = 0;
    this.tickCount = 0;
    this._startedAt = Date.now();
    this.agentStore.execSync("SET", [PROGRESS_KEY, "0"]);
    this.agentStore.execSync("HSET", [AGENT_STATS_KEY, "status", "restarted"]);
    console.log(
      `[AutoPush] Restarted — replaying all ${TOTAL_CHUNKS.toLocaleString()} chunks`,
    );

    this._running = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (!this.agentStore || !this.trainingStore) return;
    if (this._tickInFlight) return; // previous async tick still running — skip
    this._tickInFlight = true;
    this._tickInner()
      .catch((err) => {
        console.error(
          "[AutoPush] Tick error (chunk",
          this.chunkIndex,
          "):",
          err,
        );
      })
      .finally(() => {
        this._tickInFlight = false;
      });
  }

  private async _tickInner(): Promise<void> {
    if (!this.agentStore || !this.trainingStore) return;

    const batchEnd = Math.min(this.chunkIndex + BATCH_SIZE, TOTAL_CHUNKS);
    const now = String(Date.now());

    for (let i = this.chunkIndex; i < batchEnd; i++) {
      const chunkId = `chunk-${i}`;
      const offset = i * CHUNK_SIZE_BYTES;
      const size = Math.min(CHUNK_SIZE_BYTES, TOTAL_DATASET_BYTES - offset);

      // Agent stream — capped at AGENT_STREAM_MAX to prevent memory blow-out
      this.agentStore.execSync("XADD", [
        AGENT_STREAM_KEY,
        "MAXLEN",
        "~",
        String(AGENT_STREAM_MAX),
        "*",
        "chunkId",
        chunkId,
        "index",
        String(i),
        "offset",
        String(offset),
        "size",
        String(size),
        "status",
        "pushed",
        "pushedAt",
        now,
      ]);

      // Training sorted index (by offset = natural order for range reads)
      this.trainingStore.execSync("ZADD", [
        TRAINING_INDEX_KEY,
        String(offset),
        chunkId,
      ]);

      // Training stream — capped at 10,000 most-recent events
      this.trainingStore.execSync("XADD", [
        TRAINING_STREAM_KEY,
        "MAXLEN",
        "~",
        "10000",
        "*",
        "chunkId",
        chunkId,
        "offset",
        String(offset),
        "size",
        String(size),
        "receivedAt",
        now,
      ]);

      // Yield every YIELD_EVERY chunks so the event loop stays free for
      // incoming requests even within a single batch.
      if ((i - this.chunkIndex + 1) % YIELD_EVERY === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
    }

    this.chunkIndex = batchEnd;
    this.tickCount++;

    // Stop the interval the moment all chunks are transferred — no more work to do.
    if (this.chunkIndex >= TOTAL_CHUNKS) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this._running = false;
      console.log(
        "[AutoPush] ✓ Dataset fully transferred — all",
        TOTAL_CHUNKS.toLocaleString(),
        "chunks pushed.",
      );
    }

    // Checkpoint progress every tick (cheap SET)
    this.agentStore.execSync("SET", [PROGRESS_KEY, String(this.chunkIndex)]);

    // Write rich stats only every STATS_EVERY_N ticks to save CPU
    if (this.tickCount % STATS_EVERY_N === 0) {
      const bytesDone = this.chunkIndex * CHUNK_SIZE_BYTES;
      const gbDone = (bytesDone / 1024 ** 3).toFixed(2);
      const totalGB = (TOTAL_DATASET_BYTES / 1024 ** 3).toFixed(2);
      const elapsedMs = this._startedAt ? Date.now() - this._startedAt : 0;
      const rate =
        elapsedMs > 0 ? Math.round(this.chunkIndex / (elapsedMs / 1000)) : 0; // chunks/sec
      const remaining = TOTAL_CHUNKS - this.chunkIndex;
      const etaSec = rate > 0 ? Math.round(remaining / rate) : 0;

      this.agentStore.execSync("HSET", [
        AGENT_STATS_KEY,
        "totalChunks",
        String(TOTAL_CHUNKS),
        "pushedChunks",
        String(this.chunkIndex),
        "chunksRemaining",
        String(remaining),
        "totalBytes",
        String(TOTAL_DATASET_BYTES),
        "pushedBytes",
        String(bytesDone),
        "pushedGB",
        gbDone,
        "totalGB",
        totalGB,
        "pctComplete",
        ((this.chunkIndex / TOTAL_CHUNKS) * 100).toFixed(4),
        "chunksPerSec",
        String(rate),
        "etaSeconds",
        String(etaSec),
        "lastPushedAt",
        now,
      ]);
    }

    if (this.chunkIndex % 50_000 === 0 && this.chunkIndex > 0) {
      const pct = ((this.chunkIndex / TOTAL_CHUNKS) * 100).toFixed(2);
      console.log(
        `[AutoPush] ${this.chunkIndex.toLocaleString()}/${TOTAL_CHUNKS.toLocaleString()} chunks (${pct}%)`,
      );
    }

    if (this.chunkIndex >= TOTAL_CHUNKS) {
      this.stop();
      this.agentStore.execSync("XADD", [
        AGENT_STREAM_KEY,
        "MAXLEN",
        "~",
        String(AGENT_STREAM_MAX),
        "*",
        "type",
        "transfer-complete",
        "totalChunks",
        String(TOTAL_CHUNKS),
        "completedAt",
        now,
      ]);
      this.agentStore.execSync("HSET", [AGENT_STATS_KEY, "status", "complete"]);
      console.log("[AutoPush] All chunks transferred!");
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._running = false;
  }

  get running(): boolean {
    return this._running;
  }

  get progress(): { chunkIndex: number; totalChunks: number; pct: string } {
    return {
      chunkIndex: this.chunkIndex,
      totalChunks: TOTAL_CHUNKS,
      pct: ((this.chunkIndex / TOTAL_CHUNKS) * 100).toFixed(2),
    };
  }

  /** Pull the rich stats hash from the agent store (null if not available). */
  liveStats(): Record<string, string> | null {
    if (!this.agentStore) return null;
    try {
      const raw = this.agentStore.execSync("HGETALL", [AGENT_STATS_KEY]);
      if (!raw) return null;

      // RedisStore returns HGETALL as a plain object {key: value}
      if (typeof raw === "object" && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        if (Object.keys(obj).length === 0) return null;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = String(v);
        return out;
      }

      // Fallback: flat [k, v, k, v, ...] array (Redis RESP format)
      if (Array.isArray(raw) && raw.length >= 2) {
        const out: Record<string, string> = {};
        for (let i = 0; i < raw.length; i += 2)
          out[String(raw[i])] = String(raw[i + 1]);
        return out;
      }

      return null;
    } catch {
      return null;
    }
  }
}

export const autoPushService = new AutoPushService();
