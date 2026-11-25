import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@replit/object-storage";

const RELEASE_SOURCE =
  "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
const RELEASE_TARGET =
  "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt";
const STORAGE_PREFIX = "maxcore/checkpoints/sha256-";

type CheckpointManifest = {
  schemaVersion: number;
  path: string;
  sourcePath: string;
  sourceGitBlob: string;
  capability: string;
  qualityClaim: string;
  bytes: number;
  sha256: string;
};

type CheckpointStorageClient = Pick<
  Client,
  "exists" | "downloadToFilename"
>;

export class MaxcoreCheckpointStorageError extends Error {
  readonly code = "MAXCORE_CHECKPOINT_STORAGE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MaxcoreCheckpointStorageError";
  }
}

export function maxcoreCheckpointObjectName(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint manifest contains an invalid SHA-256 digest",
    );
  }
  return `${STORAGE_PREFIX}${sha256}/model.corrupt`;
}

export function withMaxcoreCheckpointPath(
  env: NodeJS.ProcessEnv,
  checkpointPath: string | null,
): NodeJS.ProcessEnv {
  return checkpointPath
    ? { ...env, MAXCORE_CHECKPOINT_PATH: checkpointPath }
    : { ...env };
}

function validateManifest(value: unknown): CheckpointManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint release manifest is unavailable or invalid",
    );
  }

  const manifest = value as Partial<CheckpointManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.path !== RELEASE_TARGET ||
    manifest.sourcePath !== RELEASE_SOURCE ||
    manifest.capability !== "numerical-inference" ||
    manifest.qualityClaim !== "not-evaluated" ||
    !Number.isSafeInteger(manifest.bytes) ||
    (manifest.bytes ?? 0) <= 0 ||
    typeof manifest.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.sourceGitBlob !== "string" ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceGitBlob)
  ) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint release manifest failed validation",
    );
  }

  const pointer = Buffer.from(
    `version https://git-lfs.github.com/spec/v1\n` +
      `oid sha256:${manifest.sha256}\n` +
      `size ${manifest.bytes}\n`,
  );
  const sourceGitBlob = createHash("sha1")
    .update(`blob ${pointer.length}\0`)
    .update(pointer)
    .digest("hex");
  if (manifest.sourceGitBlob !== sourceGitBlob) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint manifest does not match its Git LFS pointer",
    );
  }

  return manifest as CheckpointManifest;
}

async function readManifest(weightsDir: string): Promise<CheckpointManifest> {
  try {
    const raw = await fs.readFile(
      path.join(weightsDir, "model.release.json"),
      "utf8",
    );
    return validateManifest(JSON.parse(raw));
  } catch (error) {
    if (error instanceof MaxcoreCheckpointStorageError) throw error;
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint release manifest could not be read",
      { cause: error },
    );
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFile(
  filePath: string,
  manifest: CheckpointManifest,
): Promise<void> {
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint file is unavailable",
      { cause: error },
    );
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint must be a regular file, not a symlink",
    );
  }
  if (
    stat.size !== manifest.bytes ||
    (await hashFile(filePath).catch((error) => {
      throw new MaxcoreCheckpointStorageError(
        "Pinned checkpoint bytes could not be verified",
        { cause: error },
      );
    })) !== manifest.sha256
  ) {
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint bytes do not match the release manifest",
    );
  }
}

async function verifiedCachePath(
  cacheDir: string,
  manifest: CheckpointManifest,
): Promise<string | null> {
  const target = path.join(cacheDir, "model.pt");
  let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new MaxcoreCheckpointStorageError(
        "MaxCore checkpoint cache could not be inspected",
        { cause: error },
      );
    }
  }
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new MaxcoreCheckpointStorageError(
      "MaxCore checkpoint cache is not a regular file",
    );
  }
  if (
    stat.size === manifest.bytes &&
    (await hashFile(target).catch((error) => {
      throw new MaxcoreCheckpointStorageError(
        "MaxCore checkpoint cache could not be verified",
        { cause: error },
      );
    })) === manifest.sha256
  ) {
    return target;
  }
  try {
    await fs.unlink(target);
  } catch (error) {
    throw new MaxcoreCheckpointStorageError(
      "Invalid MaxCore checkpoint cache could not be removed",
      { cause: error },
    );
  }
  return null;
}

export async function resolveMaxcoreCheckpointForStartup(options: {
  env?: NodeJS.ProcessEnv;
  weightsDir?: string;
  cacheDir?: string;
  client?: CheckpointStorageClient;
} = {}): Promise<string | null> {
  const env = options.env ?? process.env;
  const requestedRelease = (env.MAXCORE_SERVING_RELEASE ?? "live-awareness")
    .trim()
    .toLowerCase();

  // Live awareness does not consume checkpoint weights. Do not add a 109 MB
  // network transfer to its startup path or label it as a trained model.
  if (requestedRelease !== "legacy") return null;

  const weightsDir =
    options.weightsDir ??
    path.resolve(
      process.cwd(),
      "external/maxcore/artifacts/ai-training-server/ai_model/weights",
    );
  const manifest = await readManifest(weightsDir);

  if (env.MAXCORE_CHECKPOINT_PATH) {
    const explicitPath = path.resolve(env.MAXCORE_CHECKPOINT_PATH);
    await verifyFile(explicitPath, manifest);
    return explicitPath;
  }

  const cacheDir =
    options.cacheDir ??
    path.join(os.tmpdir(), "maxbooster-maxcore-checkpoints", manifest.sha256);
  try {
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const cacheStat = await fs.lstat(cacheDir);
    if (cacheStat.isSymbolicLink() || !cacheStat.isDirectory()) {
      throw new MaxcoreCheckpointStorageError(
        "MaxCore checkpoint cache path must be a private regular directory",
      );
    }
  } catch (error) {
    if (error instanceof MaxcoreCheckpointStorageError) throw error;
    throw new MaxcoreCheckpointStorageError(
      "MaxCore checkpoint cache directory could not be prepared",
      { cause: error },
    );
  }

  const cached = await verifiedCachePath(cacheDir, manifest);
  if (cached) return cached;

  const bucketId = env.Replit_storage_bucket_id;
  if (!bucketId) {
    throw new MaxcoreCheckpointStorageError(
      "Replit_storage_bucket_id is required to load the pinned checkpoint",
    );
  }
  const objectName = maxcoreCheckpointObjectName(manifest.sha256);
  let client: CheckpointStorageClient;
  let exists: Awaited<ReturnType<CheckpointStorageClient["exists"]>>;
  try {
    client = options.client ?? new Client({ bucketId });
    exists = await client.exists(objectName);
  } catch (error) {
    throw new MaxcoreCheckpointStorageError(
      "App Storage checkpoint lookup failed",
      { cause: error },
    );
  }
  if (!exists.ok) {
    throw new MaxcoreCheckpointStorageError(
      `App Storage could not check the pinned checkpoint (${exists.error?.statusCode ?? "unknown status"})`,
    );
  }
  if (!exists.value) {
    throw new MaxcoreCheckpointStorageError(
      `Pinned checkpoint is missing from App Storage: ${objectName}`,
    );
  }

  const temporary = path.join(
    cacheDir,
    `model.pt.part-${process.pid}-${randomUUID()}`,
  );
  try {
    const downloaded = await client.downloadToFilename(
      objectName,
      temporary,
      { decompress: false },
    );
    if (!downloaded.ok) {
      throw new MaxcoreCheckpointStorageError(
        `App Storage checkpoint download failed (${downloaded.error?.statusCode ?? "unknown status"})`,
      );
    }
    await verifyFile(temporary, manifest);
    await fs.chmod(temporary, 0o600);
    try {
      await fs.link(temporary, path.join(cacheDir, "model.pt"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const racedCache = await verifiedCachePath(cacheDir, manifest);
      if (!racedCache) {
        throw new MaxcoreCheckpointStorageError(
          "Concurrent checkpoint cache did not contain the pinned bytes",
        );
      }
    }
    return path.join(cacheDir, "model.pt");
  } catch (error) {
    if (error instanceof MaxcoreCheckpointStorageError) throw error;
    throw new MaxcoreCheckpointStorageError(
      "Pinned checkpoint could not be restored from App Storage",
      { cause: error },
    );
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}
