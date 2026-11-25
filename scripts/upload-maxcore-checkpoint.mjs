#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@replit/object-storage";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const weightsDir = path.join(
  projectRoot,
  "external/maxcore/artifacts/ai-training-server/ai_model/weights",
);
const manifestPath = path.join(weightsDir, "model.release.json");
const defaultSourcePath = path.join(projectRoot, "model.corrupt");
const args = new Set(process.argv.slice(2));
const verifyOnly = args.has("--verify-only");
const moveSource = args.has("--move");
const unknownArgs = [...args].filter(
  (arg) => !["--verify-only", "--move"].includes(arg),
);

if (unknownArgs.length) {
  console.error(`Unsupported arguments: ${unknownArgs.join(", ")}`);
  process.exit(2);
}
if (verifyOnly && moveSource) {
  console.error("--verify-only cannot be combined with --move.");
  process.exit(2);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function readPinnedManifest() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const expectedSource =
    "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
  const expectedTarget =
    "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt";
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sourcePath !== expectedSource ||
    manifest.path !== expectedTarget ||
    manifest.capability !== "numerical-inference" ||
    manifest.qualityClaim !== "not-evaluated" ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceGitBlob)
  ) {
    throw new Error("The pinned checkpoint manifest is invalid.");
  }
  const pointer = Buffer.from(
    `version https://git-lfs.github.com/spec/v1\n` +
      `oid sha256:${manifest.sha256}\nsize ${manifest.bytes}\n`,
  );
  const sourceBlob = createHash("sha1")
    .update(`blob ${pointer.length}\0`)
    .update(pointer)
    .digest("hex");
  if (sourceBlob !== manifest.sourceGitBlob) {
    throw new Error("The release manifest does not match its Git LFS pointer.");
  }
  return manifest;
}

async function fileMatchesManifest(filePath, manifest) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Checkpoint source must be a regular file.");
  }
  return (
    stat.size === manifest.bytes &&
    (await sha256File(filePath)) === manifest.sha256
  );
}

async function verifyFile(filePath, manifest) {
  if (!(await fileMatchesManifest(filePath, manifest))) {
    throw new Error("Checkpoint source does not match the pinned manifest.");
  }
}

async function main() {
  const manifest = await readPinnedManifest();
  await verifyFile(defaultSourcePath, manifest);

  const objectName =
    `maxcore/checkpoints/sha256-${manifest.sha256}/model.corrupt`;

  if (verifyOnly) {
    console.log(
      `Verified local checkpoint: ${manifest.bytes} bytes, sha256 ${manifest.sha256}`,
    );
    return;
  }

  const bucketId = process.env.Replit_storage_bucket_id;
  if (!bucketId) {
    throw new Error("Replit_storage_bucket_id is not configured.");
  }
  const client = new Client({ bucketId });
  const existing = await client.exists(objectName);
  if (!existing.ok) {
    throw new Error(
      `App Storage lookup failed (${existing.error?.statusCode ?? "unknown status"}).`,
    );
  }

  const temporaryDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "maxcore-checkpoint-verify-"),
  );
  const storedCopy = path.join(temporaryDir, "model.corrupt");
  try {
    let storedMatches = false;
    if (existing.value) {
      const downloaded = await client.downloadToFilename(
        objectName,
        storedCopy,
        { decompress: false },
      );
      if (!downloaded.ok) {
        throw new Error(
          `Existing App Storage checkpoint could not be inspected (${downloaded.error?.statusCode ?? "unknown status"}).`,
        );
      }
      storedMatches = await fileMatchesManifest(storedCopy, manifest);
      if (!storedMatches) {
        // The content-addressed key is wrong; replace it with the verified
        // object whose digest is part of the key and release manifest.
      }
    }

    if (!storedMatches) {
      const uploaded = await client.uploadFromFilename(
        objectName,
        defaultSourcePath,
        { compress: false },
      );
      if (!uploaded.ok) {
        throw new Error(
          `App Storage upload failed (${uploaded.error?.statusCode ?? "unknown status"}).`,
        );
      }
      await fs.rm(storedCopy, { force: true });
      const downloaded = await client.downloadToFilename(
        objectName,
        storedCopy,
        { decompress: false },
      );
      if (!downloaded.ok) {
        throw new Error(
          `Uploaded checkpoint could not be verified (${downloaded.error?.statusCode ?? "unknown status"}).`,
        );
      }
      await verifyFile(storedCopy, manifest);
    }

    if (moveSource) {
      await fs.unlink(defaultSourcePath);
    }
    console.log(
      `${storedMatches ? "Verified existing" : "Uploaded and verified"} App Storage checkpoint: ${objectName} (${manifest.bytes} bytes, sha256 ${manifest.sha256})`,
    );
    if (moveSource) {
      console.log("Removed the local import after verifying the stored copy.");
    }
    console.log(
      "This artifact is marked not-evaluated; storing it does not certify a trained or production-ready model.",
    );
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`MaxCore checkpoint transfer failed: ${error.message}`);
  process.exitCode = 1;
});
