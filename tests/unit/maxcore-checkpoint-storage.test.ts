import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MaxcoreCheckpointStorageError,
  maxcoreCheckpointObjectName,
  resolveMaxcoreCheckpointForStartup,
  withMaxcoreCheckpointPath,
} from "../../server/services/maxcoreCheckpointStorage.js";

const SOURCE_PATH =
  "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
const TARGET_PATH =
  "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt";

const temporaryDirectories: string[] = [];

async function makeFixture(contents: Buffer) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maxcore-checkpoint-test-"));
  temporaryDirectories.push(root);
  const weightsDir = path.join(root, "weights");
  const cacheDir = path.join(root, "cache");
  await fs.mkdir(weightsDir);

  const sha256 = createHash("sha256").update(contents).digest("hex");
  const pointer = Buffer.from(
    `version https://git-lfs.github.com/spec/v1\n` +
      `oid sha256:${sha256}\nsize ${contents.length}\n`,
  );
  const sourceGitBlob = createHash("sha1")
    .update(`blob ${pointer.length}\0`)
    .update(pointer)
    .digest("hex");
  await fs.writeFile(
    path.join(weightsDir, "model.release.json"),
    JSON.stringify({
      schemaVersion: 1,
      sourcePath: SOURCE_PATH,
      sourceGitBlob,
      path: TARGET_PATH,
      bytes: contents.length,
      sha256,
      capability: "numerical-inference",
      qualityClaim: "not-evaluated",
    }),
  );
  return { root, weightsDir, cacheDir, sha256, contents };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("MaxCore App Storage checkpoint loading", () => {
  it("does not fetch checkpoint weights for live-awareness serving", async () => {
    const pathResult = await resolveMaxcoreCheckpointForStartup({
      env: { MAXCORE_SERVING_RELEASE: "live-awareness" },
      weightsDir: "/path-that-must-not-be-read",
    });
    expect(pathResult).toBeNull();
  });

  it("downloads only the manifest-pinned object and verifies it before use", async () => {
    const fixture = await makeFixture(Buffer.from("valid checkpoint bytes"));
    const source = path.join(fixture.root, "source.bin");
    await fs.writeFile(source, fixture.contents);
    const client = {
      exists: vi.fn().mockResolvedValue({ ok: true, value: true }),
      downloadToFilename: vi.fn(async (_name: string, destination: string) => {
        await fs.copyFile(source, destination);
        return { ok: true as const, value: null };
      }),
    };

    const checkpointPath = await resolveMaxcoreCheckpointForStartup({
      env: {
        MAXCORE_SERVING_RELEASE: "legacy",
        Replit_storage_bucket_id: "test-bucket",
      },
      weightsDir: fixture.weightsDir,
      cacheDir: fixture.cacheDir,
      client,
    });

    expect(checkpointPath).toBe(path.join(fixture.cacheDir, "model.pt"));
    expect(await fs.readFile(checkpointPath!)).toEqual(fixture.contents);
    expect(client.exists).toHaveBeenCalledWith(
      maxcoreCheckpointObjectName(fixture.sha256),
    );
    expect(client.downloadToFilename).toHaveBeenCalledWith(
      maxcoreCheckpointObjectName(fixture.sha256),
      expect.stringContaining(".part-"),
      { decompress: false },
    );
    expect((await fs.stat(checkpointPath!)).mode & 0o777).toBe(0o600);
  });

  it("reuses only a cached file that still matches the release manifest", async () => {
    const fixture = await makeFixture(Buffer.from("cached checkpoint bytes"));
    await fs.mkdir(fixture.cacheDir, { recursive: true });
    const cachedPath = path.join(fixture.cacheDir, "model.pt");
    await fs.writeFile(cachedPath, fixture.contents, { mode: 0o600 });
    const client = {
      exists: vi.fn(),
      downloadToFilename: vi.fn(),
    };

    const checkpointPath = await resolveMaxcoreCheckpointForStartup({
      env: {
        MAXCORE_SERVING_RELEASE: "legacy",
        Replit_storage_bucket_id: "test-bucket",
      },
      weightsDir: fixture.weightsDir,
      cacheDir: fixture.cacheDir,
      client,
    });

    expect(checkpointPath).toBe(cachedPath);
    expect(client.exists).not.toHaveBeenCalled();
    expect(client.downloadToFilename).not.toHaveBeenCalled();
  });

  it("rejects and removes a downloaded object that fails the pinned digest", async () => {
    const fixture = await makeFixture(Buffer.from("expected checkpoint"));
    const client = {
      exists: vi.fn().mockResolvedValue({ ok: true, value: true }),
      downloadToFilename: vi.fn(async (_name: string, destination: string) => {
        await fs.writeFile(destination, "different bytes");
        return { ok: true as const, value: null };
      }),
    };

    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: {
          MAXCORE_SERVING_RELEASE: "legacy",
          Replit_storage_bucket_id: "test-bucket",
        },
        weightsDir: fixture.weightsDir,
        cacheDir: fixture.cacheDir,
        client,
      }),
    ).rejects.toThrow(/do not match the release manifest/);
    expect(await fs.readdir(fixture.cacheDir)).toEqual([]);
  });

  it("fails clearly when the pinned object is absent or the bucket is unconfigured", async () => {
    const fixture = await makeFixture(Buffer.from("expected checkpoint"));
    const client = {
      exists: vi.fn().mockResolvedValue({ ok: true, value: false }),
      downloadToFilename: vi.fn(),
    };
    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: { MAXCORE_SERVING_RELEASE: "legacy", Replit_storage_bucket_id: "test-bucket" },
        weightsDir: fixture.weightsDir,
        cacheDir: fixture.cacheDir,
        client,
      }),
    ).rejects.toThrow(/missing from App Storage/);

    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: { MAXCORE_SERVING_RELEASE: "legacy" },
        weightsDir: fixture.weightsDir,
        cacheDir: fixture.cacheDir,
      }),
    ).rejects.toThrow(/Replit_storage_bucket_id is required/);
  });

  it("sanitizes storage lookup errors and rejects symlinked caches", async () => {
    const fixture = await makeFixture(Buffer.from("expected checkpoint"));
    const lookupClient = {
      exists: vi.fn().mockRejectedValue(new Error("private provider response")),
      downloadToFilename: vi.fn(),
    };

    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: {
          MAXCORE_SERVING_RELEASE: "legacy",
          Replit_storage_bucket_id: "test-bucket",
        },
        weightsDir: fixture.weightsDir,
        cacheDir: fixture.cacheDir,
        client: lookupClient,
      }),
    ).rejects.toMatchObject({
      code: "MAXCORE_CHECKPOINT_STORAGE",
      message: "App Storage checkpoint lookup failed",
    } satisfies Partial<MaxcoreCheckpointStorageError>);

    const outsideCacheFile = path.join(fixture.root, "outside.bin");
    await fs.writeFile(outsideCacheFile, fixture.contents);
    await fs.mkdir(fixture.cacheDir, { recursive: true });
    await fs.symlink(outsideCacheFile, path.join(fixture.cacheDir, "model.pt"));

    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: {
          MAXCORE_SERVING_RELEASE: "legacy",
          Replit_storage_bucket_id: "test-bucket",
        },
        weightsDir: fixture.weightsDir,
        cacheDir: fixture.cacheDir,
        client: lookupClient,
      }),
    ).rejects.toThrow(/cache is not a regular file/);
    expect(await fs.readFile(outsideCacheFile)).toEqual(fixture.contents);
  });

  it("validates explicit checkpoint overrides and forwards only verified paths", async () => {
    const fixture = await makeFixture(Buffer.from("explicit checkpoint"));
    const explicitPath = path.join(fixture.root, "explicit.pt");
    await fs.writeFile(explicitPath, fixture.contents);

    const resolved = await resolveMaxcoreCheckpointForStartup({
      env: {
        MAXCORE_SERVING_RELEASE: "legacy",
        MAXCORE_CHECKPOINT_PATH: explicitPath,
      },
      weightsDir: fixture.weightsDir,
    });
    expect(resolved).toBe(explicitPath);

    const env = withMaxcoreCheckpointPath({ NODE_ENV: "production" }, resolved);
    expect(env.MAXCORE_CHECKPOINT_PATH).toBe(explicitPath);
    expect(env.NODE_ENV).toBe("production");
    expect(
      withMaxcoreCheckpointPath({ NODE_ENV: "production" }, null)
        .MAXCORE_CHECKPOINT_PATH,
    ).toBeUndefined();

    await fs.writeFile(explicitPath, "tampered");
    await expect(
      resolveMaxcoreCheckpointForStartup({
        env: {
          MAXCORE_SERVING_RELEASE: "legacy",
          MAXCORE_CHECKPOINT_PATH: explicitPath,
        },
        weightsDir: fixture.weightsDir,
      }),
    ).rejects.toThrow(/do not match the release manifest/);
  });
});
