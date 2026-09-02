/**
 * DATASET DOWNLOAD SERVICE
 *
 * Downloads discovered public datasets and stores them inside Pocket Dimension
 * as the primary storage model. Supports streaming large files, parallel chunk
 * downloads, and resumable sessions.
 *
 * Flow:
 *   discovered_datasets (DB) → HTTP stream → PDIM pocket → datasetDownloads (DB)
 */

import { db } from "../lib/db.js";
import { discoveredDatasets, datasetDownloads } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { fabricStorage } from "../pocket-dimension/fabric/index.js";
import { logger } from "../logger.js";
import {
  MemoryBudget,
  ParallelDownloadProcessor,
} from "./parallelProcessor.js";
import { createHash } from "crypto";
import https from "https";
import http from "http";

// ── Source-aware URL Resolver ─────────────────────────────────────────────

const AUDIO_EXT =
  /\.(mp3|flac|wav|ogg|mid|midi|aac|m4a|opus|aiff|aif|wma|alac|ape|wv|au|snd|ra|dsf|dff|ac3|amr|xm|s3m|it|mod|mpc|tta|tak|spx|caf|w64|rf64)$/i;
const DATA_EXT =
  /\.(parquet|csv|json|jsonl|tsv|zip|tar|gz|7z|arrow|hdf5|h5|pkl|pt|pth|bin|safetensors|npy|npz|msgpack|avro|feather|orc|xml|yaml|yml|toml|txt|pdf|db|sqlite|sqlite3|pq|bz2|xz|zst|lz4|cbor|pb|onnx|tflite|gguf|ggml)$/i;

/** Resolve a page/index URL to an actual downloadable file URL for each source. */
async function resolveDownloadUrl(
  source: string,
  url: string,
  downloadUrl: string | null,
  externalId: string,
): Promise<{ fileUrl: string; fileName: string }[]> {
  try {
    if (source === "archive.org") {
      // Extract archive identifier from URL or externalId
      const identifier = externalId.replace("archive:", "");
      const meta = await fetch(`https://archive.org/metadata/${identifier}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
      });
      if (!meta.ok) throw new Error("Archive metadata failed");
      const body = (await meta.json()) as any;
      const files: any[] = body.files ?? [];

      // Prefer audio files, fall back to any data file
      const audioFiles = files.filter((f: any) => AUDIO_EXT.test(f.name));
      const dataFiles = files.filter((f: any) => DATA_EXT.test(f.name));
      const targets = (audioFiles.length ? audioFiles : dataFiles).slice(0, 5);

      if (targets.length === 0) {
        // Fallback: return the item page itself
        return [{ fileUrl: url, fileName: identifier }];
      }

      return targets.map((f: any) => ({
        fileUrl: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
        fileName: f.name,
      }));
    }

    if (source === "huggingface") {
      const repoId = externalId.replace("hf:", "");
      // Fetch dataset card to find parquet/data files
      const infoRes = await fetch(
        `https://huggingface.co/api/datasets/${repoId}`,
        {
          signal: AbortSignal.timeout(10_000),
          headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
        },
      );
      if (!infoRes.ok) throw new Error("HuggingFace API failed");
      const info = await infoRes.json();

      // Try to get parquet info via datasets-server
      const parquetRes = await fetch(
        `https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(repoId)}`,
        {
          signal: AbortSignal.timeout(10_000),
          headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
        },
      ).catch(() => null);

      if (parquetRes?.ok) {
        const parquet = (await parquetRes.json()) as any;
        const splits: any[] = parquet.parquet_files ?? [];
        const targets = splits.slice(0, 3);
        if (targets.length > 0) {
          return targets.map((f: any) => ({
            fileUrl: f.url,
            fileName: `${repoId.replace("/", "_")}_${f.split}_${f.filename}`,
          }));
        }
      }

      // Fall back to README if nothing else available
      const readmeUrl = `https://huggingface.co/datasets/${repoId}/resolve/main/README.md`;
      return [
        {
          fileUrl: readmeUrl,
          fileName: `${repoId.replace("/", "_")}_README.md`,
        },
      ];
    }

    if (source === "zenodo") {
      // Zenodo gives us a direct file URL already in downloadUrl
      if (downloadUrl) {
        const parts = downloadUrl.split("/");
        return [
          {
            fileUrl: downloadUrl,
            fileName: parts[parts.length - 1] || "zenodo_file",
          },
        ];
      }
    }

    // Default: use whatever URL we have
    const finalUrl = downloadUrl ?? url;
    const parts = finalUrl.split("/");
    return [
      {
        fileUrl: finalUrl,
        fileName: parts[parts.length - 1] || "dataset_file",
      },
    ];
  } catch (err) {
    logger.warn(
      `[DatasetDownload] URL resolve failed for ${externalId}: ${(err as Error).message}`,
    );
    const finalUrl = downloadUrl ?? url;
    const parts = finalUrl.split("/");
    return [
      {
        fileUrl: finalUrl,
        fileName: parts[parts.length - 1] || "dataset_file",
      },
    ];
  }
}

// Bounded-parallel ingestion. Each download buffers the whole file in RAM (no
// streaming write API into PDIM) and then EC-encodes it (more transient
// buffers), so unbounded parallelism exceeds the container's memory and the OS
// SIGKILLs the process (exit 137). Instead of a global serial lock, the
// ParallelDownloadProcessor runs up to DOWNLOAD_CONCURRENCY downloads at once
// while a MemoryBudget caps the *total* bytes buffered in flight — so the many
// small/skip/error rows drain in parallel and only genuinely large files are
// throttled (by memory, not by a 1-at-a-time queue). Both are env-tunable.
const DOWNLOAD_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.DOWNLOAD_CONCURRENCY ?? "12", 10) || 12,
);
// Total in-flight buffered bytes allowed across all concurrent downloads. The
// container runs with an 8 GB heap (--max-old-space-size=8192); 4 GB leaves
// headroom for the transient EC-encoding buffers (~1.5× payload) plus the rest
// of the server. Tunable via DOWNLOAD_MEMORY_BUDGET_MB.
const DOWNLOAD_MEMORY_BUDGET_BYTES =
  Math.max(
    256,
    parseInt(process.env.DOWNLOAD_MEMORY_BUDGET_MB ?? "4096", 10) || 4096,
  ) *
  1024 *
  1024;
// Reservation used when a response has no Content-Length, so unsized downloads
// are still gated against the budget.
const DEFAULT_RESERVE_BYTES = 64 * 1024 * 1024; // 64 MB
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per write chunk
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB cap per dataset
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min per file

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "complete"
  | "error"
  | "skipped";

export interface DownloadProgress {
  downloadId: number;
  datasetId: number;
  datasetName: string;
  status: DownloadStatus;
  sizeBytes: number;
  downloadedBytes: number;
  percent: number;
  pdimKey?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface StreamResult {
  data: Buffer;
  // The memory reservation for `data`. The caller MUST invoke this once it has
  // finished storing the payload (i.e. after putNamedObject), so the budget
  // covers the full lifetime of the buffer PLUS the transient EC/compression
  // allocations made while storing — not just the download itself.
  release: () => void;
}

function streamToBuffer(
  url: string,
  onProgress?: (bytes: number, total: number) => void,
  // Optional memory-budget gate: invoked once Content-Length is known (before
  // any bytes are buffered) so the parallel processor can bound total in-flight
  // memory.
  acquireBudget?: (totalBytes: number) => Promise<() => void>,
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let releaseBudget: () => void = () => {};
    let activeRes: import("http").IncomingMessage | null = null;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      releaseBudget(); // give back the reservation if we already acquired it
      activeRes?.destroy(); // stop any in-flight stream so it can't resume later
      reject(err);
    };

    const succeed = (data: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // NB: do NOT release here — ownership of the reservation transfers to the
      // caller, which releases after the payload is stored.
      resolve({ data, release: releaseBudget });
    };

    const timer = setTimeout(
      () => fail(new Error("Download timeout")),
      DOWNLOAD_TIMEOUT_MS,
    );

    const get = (u: string, redirects = 0): void => {
      if (redirects > 5) return fail(new Error("Too many redirects"));

      // Everything here must reject (never throw): this callback runs async, so a
      // synchronous throw (e.g. a malformed redirect URL) would escape the
      // Promise and crash the whole process instead of failing one download.
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return fail(new Error(`Invalid download URL: ${u}`));
      }
      const proto = parsed.protocol === "https:" ? https : http;

      try {
        proto
          .get(
            parsed,
            { headers: { "User-Agent": "MaxBooster-PDIM/1.0" } },
            (res) => {
              try {
                if (
                  res.statusCode &&
                  res.statusCode >= 300 &&
                  res.statusCode < 400 &&
                  res.headers.location
                ) {
                  res.resume();
                  // Resolve relative redirects (e.g. "/path") against the current
                  // URL so a Location header that isn't absolute can't throw.
                  const next = new URL(res.headers.location, parsed).toString();
                  return get(next, redirects + 1);
                }
                if (!res.statusCode || res.statusCode >= 400) {
                  res.resume();
                  return fail(new Error(`HTTP ${res.statusCode} for ${u}`));
                }

                activeRes = res;
                const total = parseInt(
                  res.headers["content-length"] ?? "0",
                  10,
                );
                const chunks: Buffer[] = [];
                let received = 0;

                if (total > MAX_DOWNLOAD_SIZE) {
                  return fail(
                    new Error(
                      `File too large: ${total} bytes (max ${MAX_DOWNLOAD_SIZE})`,
                    ),
                  );
                }

                const attachListeners = (): void => {
                  res.on("data", (chunk: Buffer) => {
                    received += chunk.length;
                    // Runtime guard: a missing/lying Content-Length can't be
                    // trusted, so cap on the bytes actually streamed too.
                    if (received > MAX_DOWNLOAD_SIZE) {
                      return fail(
                        new Error(
                          `File too large: streamed > ${MAX_DOWNLOAD_SIZE} bytes`,
                        ),
                      );
                    }
                    chunks.push(chunk);
                    onProgress?.(received, total);
                  });

                  res.on("end", () => succeed(Buffer.concat(chunks)));
                  res.on("error", (err) => fail(err));
                };

                if (acquireBudget) {
                  // Reserve memory before buffering a single byte. Content-Length
                  // is the reservation when known; otherwise fall back to a
                  // conservative default so unsized responses still get gated.
                  res.pause();
                  acquireBudget(total > 0 ? total : DEFAULT_RESERVE_BYTES)
                    .then((release) => {
                      // We may have already failed (e.g. timed out) while waiting
                      // for budget. If so, hand the reservation straight back
                      // instead of resuming a stream nobody is listening to.
                      if (settled) {
                        release();
                        return;
                      }
                      releaseBudget = release;
                      attachListeners();
                      res.resume();
                    })
                    .catch((err: unknown) => fail(err as Error));
                } else {
                  attachListeners();
                }
              } catch (err) {
                fail(err as Error);
              }
            },
          )
          .on("error", (err) => fail(err));
      } catch (err) {
        fail(err as Error);
      }
    };

    get(url);
  });
}

// ── Download Service ──────────────────────────────────────────────────────

export class DatasetDownloadService {
  private static instance: DatasetDownloadService;
  private activeDownloads = new Map<number, DownloadProgress>();
  // Bounds total bytes buffered in flight across all concurrent downloads.
  private readonly memoryBudget = new MemoryBudget(
    DOWNLOAD_MEMORY_BUDGET_BYTES,
  );

  // Bounded-parallel worker pool. Drains the download queue with up to
  // DOWNLOAD_CONCURRENCY workers; memory safety comes from `memoryBudget`.
  private readonly processor = new ParallelDownloadProcessor(
    (id) => this.download(id).then(() => undefined),
    {
      concurrency: DOWNLOAD_CONCURRENCY,
      onError: (id, err) =>
        logger.error(`[DatasetDownload] Worker error (download #${id}):`, err),
      onIdle: () => logger.info("[DatasetDownload] Queue drained — idle"),
    },
  );

  private constructor() {}

  static getInstance(): DatasetDownloadService {
    if (!DatasetDownloadService.instance) {
      DatasetDownloadService.instance = new DatasetDownloadService();
    }
    return DatasetDownloadService.instance;
  }

  /** Queue a dataset for download by DB id. */
  async enqueue(datasetId: number): Promise<number> {
    const [dataset] = await db
      .select()
      .from(discoveredDatasets)
      .where(eq(discoveredDatasets.id, datasetId));

    if (!dataset) throw new Error(`Dataset ${datasetId} not found`);
    if (dataset.isDownloaded) throw new Error("Dataset already downloaded");
    if (dataset.isQueued) throw new Error("Dataset already in queue");
    if (!dataset.downloadUrl && !dataset.url)
      throw new Error("No download URL available");

    const [download] = await db
      .insert(datasetDownloads)
      .values({ datasetId, status: "pending" })
      .returning();

    await db
      .update(discoveredDatasets)
      .set({ isQueued: true })
      .where(eq(discoveredDatasets.id, datasetId));

    logger.info(
      `[DatasetDownload] Enqueued ${dataset.name} (download #${download.id})`,
    );

    this.processor.add([download.id]);
    return download.id;
  }

  /** Queue multiple datasets at once. */
  async enqueueMany(datasetIds: number[]): Promise<number[]> {
    const downloadIds: number[] = [];
    for (const id of datasetIds) {
      try {
        const dlId = await this.enqueue(id);
        downloadIds.push(dlId);
      } catch (err) {
        logger.warn(`[DatasetDownload] Skip ${id}: ${(err as Error).message}`);
      }
    }
    return downloadIds;
  }

  /** Actually download a single dataset and store in PDIM. */
  async download(downloadId: number): Promise<DownloadProgress> {
    const [dl] = await db
      .select()
      .from(datasetDownloads)
      .where(eq(datasetDownloads.id, downloadId));

    if (!dl) throw new Error(`Download ${downloadId} not found`);

    const [dataset] = await db
      .select()
      .from(discoveredDatasets)
      .where(eq(discoveredDatasets.id, dl.datasetId));

    if (!dataset) throw new Error(`Dataset ${dl.datasetId} not found`);

    const progress: DownloadProgress = {
      downloadId,
      datasetId: dataset.id,
      datasetName: dataset.name,
      status: "downloading",
      sizeBytes: 0,
      downloadedBytes: 0,
      percent: 0,
      startedAt: new Date(),
    };

    this.activeDownloads.set(downloadId, progress);

    await db
      .update(datasetDownloads)
      .set({ status: "downloading", startedAt: new Date() })
      .where(eq(datasetDownloads.id, downloadId));

    // Resolve actual file URLs (source-aware: archive.org metadata, HF parquet, etc.)
    logger.info(
      `[DatasetDownload] Resolving files for "${dataset.name}" [${dataset.source}]`,
    );
    const targets = await resolveDownloadUrl(
      dataset.source,
      dataset.url,
      dataset.downloadUrl,
      dataset.externalId,
    );

    logger.info(
      `[DatasetDownload] Resolved ${targets.length} file(s) for "${dataset.name}": ` +
        targets.map((t) => t.fileName).join(", "),
    );

    try {
      // All dataset bytes flow through the single fabric data path: each file
      // becomes a fabric object (compression + erasure coding + chunk placement)
      // under the "max-booster-datasets" pocket. No direct PocketDimension writes.
      const policy = await fabricStorage.recommendedPolicy();

      const safeCategory = dataset.category.replace(/[^a-z0-9]/g, "-");
      const safeName = dataset.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 120);
      const pdimBase = `${safeCategory}/${dataset.source}/${safeName}`;

      let totalBytes = 0;
      const pdimKeys: string[] = [];

      for (let i = 0; i < targets.length; i++) {
        const { fileUrl, fileName } = targets[i];
        logger.info(
          `[DatasetDownload] Fetching (${i + 1}/${targets.length}): ${fileUrl}`,
        );

        const { data, release } = await streamToBuffer(
          fileUrl,
          (received, total) => {
            progress.downloadedBytes = totalBytes + received;
            progress.sizeBytes = total * targets.length; // rough estimate
            progress.percent =
              total > 0
                ? Math.round(((i + received / (total || 1)) / (targets.length || 1)) * 100)
                : Math.round((i / (targets.length || 1)) * 100);
            this.activeDownloads.set(downloadId, { ...progress });
          },
          (totalBytesToBuffer) => this.memoryBudget.acquire(totalBytesToBuffer),
        );

        // Hold the memory reservation until the payload is fully stored (the EC
        // encode in putNamedObject allocates extra transient buffers on top of
        // `data`), then release it on every exit path.
        try {
          const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const pdimKey =
            targets.length === 1 ? pdimBase : `${pdimBase}/${safeFileName}`;
          await fabricStorage.putNamedObject(
            "max-booster-datasets",
            "datasets",
            pdimKey,
            "application/octet-stream",
            data,
            { policy },
          );

          totalBytes += data.length;
          pdimKeys.push(pdimKey);
          logger.info(
            `[DatasetDownload] Stored: ${pdimKey} (${(data.length / 1024 / 1024).toFixed(2)} MB)`,
          );
        } finally {
          release();
        }
      }

      const primaryKey = pdimKeys[0];

      await db
        .update(datasetDownloads)
        .set({
          status: "complete",
          pdimKey: primaryKey,
          sizeBytes: totalBytes,
          downloadedBytes: totalBytes,
          completedAt: new Date(),
        })
        .where(eq(datasetDownloads.id, downloadId));

      await db
        .update(discoveredDatasets)
        .set({ isDownloaded: true, isQueued: false })
        .where(eq(discoveredDatasets.id, dataset.id));

      progress.status = "complete";
      progress.pdimKey = primaryKey;
      progress.sizeBytes = totalBytes;
      progress.downloadedBytes = totalBytes;
      progress.percent = 100;
      progress.completedAt = new Date();
      this.activeDownloads.set(downloadId, progress);

      logger.info(
        `[DatasetDownload] Done: "${dataset.name}" → ${pdimKeys.length} file(s) in PDIM ` +
          `(${(totalBytes / 1024 / 1024).toFixed(1)} MB total)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[DatasetDownload] Failed "${dataset.name}": ${msg}`);

      await db
        .update(datasetDownloads)
        .set({ status: "error", errorMessage: msg.slice(0, 500) })
        .where(eq(datasetDownloads.id, downloadId));

      await db
        .update(discoveredDatasets)
        .set({ isQueued: false })
        .where(eq(discoveredDatasets.id, dataset.id));

      progress.status = "error";
      progress.errorMessage = msg;
      this.activeDownloads.set(downloadId, progress);
    }

    return progress;
  }

  /** Progress for all active/recent downloads. */
  getActiveProgress(): DownloadProgress[] {
    return [...this.activeDownloads.values()];
  }

  getProgress(downloadId: number): DownloadProgress | null {
    return this.activeDownloads.get(downloadId) ?? null;
  }

  /** Historical download records from DB. */
  async listDownloads(
    limit = 50,
  ): Promise<(typeof datasetDownloads.$inferSelect)[]> {
    const rows = await db.select().from(datasetDownloads);
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /** Auto-download all newly discovered datasets that haven't been downloaded yet. */
  async autoDownloadNew(
    opts: {
      category?: string;
      maxDatasets?: number;
      minLikes?: number;
      sources?: string[];
    } = {},
  ): Promise<number[]> {
    const rows = await db.select().from(discoveredDatasets);
    const candidates = rows
      .filter((r) => {
        if (r.isDownloaded || r.isQueued) return false;
        if (!r.downloadUrl && !r.url) return false;
        if (opts.category && r.category !== opts.category) return false;
        if (opts.minLikes !== undefined && (r.likes ?? 0) < opts.minLikes)
          return false;
        if (opts.sources && !opts.sources.includes(r.source)) return false;
        return true;
      })
      .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
      .slice(0, opts.maxDatasets ?? 10);

    return this.enqueueMany(candidates.map((c) => c.id));
  }

  /**
   * Rebuild the in-memory queue from the DB on boot. The queue and
   * activeDownloads map are in-process, so a restart orphans everything that was
   * mid-flight. Here we:
   *   - reset any download stuck in "downloading" back to "pending" (its stream
   *     died with the old process), and
   *   - re-enqueue every "pending" download id,
   * then kick the processor so in-flight work resumes automatically instead of
   * silently stalling until someone re-triggers it.
   */
  async recoverPendingDownloads(): Promise<number> {
    const stuck = await db
      .update(datasetDownloads)
      .set({ status: "pending", startedAt: null })
      .where(eq(datasetDownloads.status, "downloading"))
      .returning();
    if (stuck.length > 0) {
      logger.warn(
        `[DatasetDownload] Reset ${stuck.length} stuck "downloading" → "pending" after restart`,
      );
    }

    const pending = await db
      .select()
      .from(datasetDownloads)
      .where(eq(datasetDownloads.status, "pending"));

    const ids = pending.map((d) => d.id);

    if (ids.length > 0) {
      logger.info(
        `[DatasetDownload] Recovered ${ids.length} pending download(s) into queue after restart`,
      );
      // The processor dedupes ids already queued/in-flight, so re-adding is safe.
      this.processor.add(ids);
    }
    return ids.length;
  }

  /** Live snapshot of the parallel processor + memory budget for monitoring. */
  getProcessorStats(): {
    active: number;
    queued: number;
    concurrency: number;
    memory: { total: number; available: number; waiting: number };
  } {
    return { ...this.processor.stats, memory: this.memoryBudget.stats };
  }
}

export const datasetDownloader = DatasetDownloadService.getInstance();
