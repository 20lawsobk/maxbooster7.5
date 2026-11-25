import type { Bucket } from "@google-cloud/storage";
import { performance } from "node:perf_hooks";
import {
  PdimBucketReadFailure,
  PdimBucketReadTimeout,
  type PdimObjectStore,
  type PdimReadContext,
} from "./pdimBucketJournal.js";
import { createRecoveryStorage } from "../../scripts/recovery-private-store.mjs";

export const PDIM_OBJECT_READ_DEADLINE_MS = 20_000;
export const PDIM_GCS_READ_TIMEOUT_MS = 5_000;
export const PDIM_GCS_WRITE_TIMEOUT_MS = 15_000;
export const PDIM_GCS_READ_RETRY_OPTIONS = Object.freeze({
  autoRetry: true,
  maxRetries: 1,
  totalTimeout: 7,
  maxRetryDelay: 1,
  retryDelayMultiplier: 2,
});

function storageFailureCategory(error: unknown): string {
  if (error instanceof PdimBucketReadTimeout) return "timeout";
  const code = error && typeof error === "object"
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 401 || code === 403) return "access_denied";
  if (code === 429) return "rate_limited";
  if (code === 408 || code === 504) return "timeout";
  if (typeof code === "number" && code >= 500 && code <= 599) return "service_unavailable";
  if (typeof code === "string" &&
      ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNABORTED", "ABORT_ERR"].includes(code)) {
    return "timeout";
  }
  return "storage_error";
}

function throwSafeStorageFailure(error: unknown): never {
  throw new PdimBucketReadFailure(storageFailureCategory(error));
}

function awaitReadDeadline<T>(
  operation: () => Promise<T>,
  deadlineAt: number,
  context: PdimReadContext | undefined,
  startedAt: number,
): Promise<T> {
  const remainingMs = deadlineAt - performance.now();
  if (remainingMs <= 0) {
    return Promise.reject(new PdimBucketReadTimeout(
      context?.phase ?? "object_read",
      context?.sequence,
      context?.ordinal,
      Math.max(0, Math.round(performance.now() - startedAt)),
    ));
  }
  let pending: Promise<T>;
  try {
    pending = operation();
  } catch (error) {
    return Promise.reject(error);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    pending,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new PdimBucketReadTimeout(
        context?.phase ?? "object_read",
        context?.sequence,
        context?.ordinal,
        Math.max(0, Math.round(performance.now() - startedAt)),
      )), remainingMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Authenticated App Storage adapter. Reads are pinned to the observed
 * generation; a deletion/replacement during download is an error, not a miss. */
export class PdimBucketObjects implements PdimObjectStore {
  constructor(
    private readonly bucket: Pick<Bucket, "file">,
    private readonly recoveryReadBucket: Pick<Bucket, "file"> = bucket,
  ) {}

  async read(
    key: string,
    context?: PdimReadContext,
  ): Promise<{ bytes: Buffer; generation: string } | null> {
    const startedAt = performance.now();
    const boundedRecoveryRead = context?.deadlineAt !== undefined;
    const deadlineAt = boundedRecoveryRead
      ? Math.min(context.deadlineAt!, startedAt + PDIM_OBJECT_READ_DEADLINE_MS)
      : Number.POSITIVE_INFINITY;
    const readBucket = boundedRecoveryRead ? this.recoveryReadBucket : this.bucket;
    const file = readBucket.file(key);
    const readRequest = <T>(operation: () => Promise<T>) => boundedRecoveryRead
      ? awaitReadDeadline(operation, deadlineAt, context, startedAt)
      : operation();
    const maxGenerationChanges = 3;
    for (let attempt = 0; attempt < maxGenerationChanges; attempt += 1) {
      let generation: string;
      try {
        const [metadata] = await readRequest(
          () => file.getMetadata(),
        );
        if (typeof metadata.generation !== "string") {
          throw new PdimBucketReadFailure("invalid_metadata");
        }
        generation = metadata.generation;
      } catch (error) {
        if ((error as { code?: unknown }).code === 404) return null;
        if (error instanceof PdimBucketReadFailure || error instanceof PdimBucketReadTimeout) throw error;
        throwSafeStorageFailure(error);
      }

      try {
        const [bytes] = await readRequest(
          () => readBucket.file(key, { generation }).download({ validation: "crc32c" }),
        );
        return { bytes, generation };
      } catch (error) {
        if ((error as { code?: unknown }).code !== 404) {
          if (error instanceof PdimBucketReadFailure || error instanceof PdimBucketReadTimeout) throw error;
          throwSafeStorageFailure(error);
        }

        // A generation-pinned read may lose a race with the active lease
        // owner's CAS replacement. Retry only when fresh metadata proves that
        // the object changed; a stable-generation 404 remains a hard failure.
        let currentGeneration: unknown;
        try {
          const [current] = await readRequest(
            () => file.getMetadata(),
          );
          currentGeneration = current.generation;
        } catch (metadataError) {
          if ((metadataError as { code?: unknown }).code === 404) return null;
          if (metadataError instanceof PdimBucketReadFailure ||
              metadataError instanceof PdimBucketReadTimeout) throw metadataError;
          throwSafeStorageFailure(metadataError);
        }
        if (typeof currentGeneration !== "string" || currentGeneration === generation) {
          throw new PdimBucketReadFailure("not_found");
        }
        if (attempt === maxGenerationChanges - 1) {
          throw new PdimBucketReadFailure("generation_conflict");
        }
      }
    }
    throw new PdimBucketReadFailure("generation_conflict");
  }

  async write(key: string, bytes: Buffer, generation: string | 0): Promise<string> {
    const file = this.bucket.file(key);
    await file.save(bytes, {
      resumable: false,
      validation: "crc32c",
      timeout: PDIM_GCS_WRITE_TIMEOUT_MS,
      preconditionOpts: { ifGenerationMatch: generation },
    });
    // The upload response populates this File instance's metadata. Never obtain
    // a replacement writer's generation using an unpinned getMetadata here.
    const published = file.metadata.generation;
    if (typeof published !== "string") throw new Error("Upload returned no generation receipt");
    return published;
  }
}

export function configuredPdimBucketId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.Replit_storage_bucket_id || env.DATABASE_RECOVERY_BUCKET_ID || env.REPLIT_BUCKET_ID;
}

export async function configuredPdimBucketObjects({
  storageFactory = createRecoveryStorage,
  env = process.env,
}: {
  storageFactory?: typeof createRecoveryStorage;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<PdimBucketObjects> {
  const bucketId = configuredPdimBucketId(env);
  if (!bucketId) throw new Error("PDIM App Storage bucket is not configured");
  // Bound normal journal operations too: startup lease acquisition/renewal and
  // runtime writes otherwise inherit the SDK's unbounded default request time.
  // Conditional writes remain generation-fenced; no local fallback is allowed.
  const { bucket } = await storageFactory({
    bucketId,
    timeoutMs: PDIM_GCS_WRITE_TIMEOUT_MS,
  });
  const { bucket: readBucket } = await storageFactory({
    bucketId,
    timeoutMs: PDIM_GCS_READ_TIMEOUT_MS,
    retryOptions: PDIM_GCS_READ_RETRY_OPTIONS,
  });
  return new PdimBucketObjects(bucket, readBucket);
}
