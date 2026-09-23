import { createHash } from "crypto";
import fs from "fs";
import path from "path";

export const MODEL_RELEASE_MANIFEST =
  "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.release.json";

export type ModelReleaseRequirement = {
  path: string;
  bytes: number;
  sha256: string;
};

type ModelReleaseManifest = ModelReleaseRequirement & {
  schemaVersion: 1;
  sourcePath: string;
  sourceGitBlob: string;
  capability: "numerical-inference";
  qualityClaim: "not-evaluated";
};

function sha256File(file: string): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(file, "r");
  try {
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

export function validateModelRelease(root: string): ModelReleaseRequirement {
  const manifestPath = path.resolve(root, MODEL_RELEASE_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`required model release manifest is missing: ${MODEL_RELEASE_MANIFEST}`);
  }
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as Partial<ModelReleaseManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sourcePath !==
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt" ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceGitBlob ?? "") ||
    manifest.capability !== "numerical-inference" ||
    manifest.qualityClaim !== "not-evaluated" ||
    manifest.path !==
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt" ||
    !Number.isSafeInteger(manifest.bytes) ||
    (manifest.bytes ?? 0) <= 0 ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256 ?? "")
  ) {
    throw new Error("required model release manifest is invalid");
  }
  const expectedBytes = manifest.bytes as number;
  const expectedSha256 = manifest.sha256 as string;
  const releasePath = manifest.path as string;
  const lfsPointer = Buffer.from(
    `version https://git-lfs.github.com/spec/v1\n` +
      `oid sha256:${expectedSha256}\n` +
      `size ${expectedBytes}\n`,
  );
  const expectedGitBlob = createHash("sha1")
    .update(`blob ${lfsPointer.length}\0`)
    .update(lfsPointer)
    .digest("hex");
  if (expectedGitBlob !== manifest.sourceGitBlob) {
    throw new Error("model release manifest does not match its immutable Git LFS pointer");
  }
  const sourcePath = path.resolve(root, manifest.sourcePath as string);
  const sourceStat = fs.statSync(sourcePath, { throwIfNoEntry: false });
  if (!sourceStat?.isFile() || sourceStat.size !== expectedBytes) {
    throw new Error("immutable model release source is missing or has the wrong size");
  }
  const sourceSha256 = sha256File(sourcePath);
  if (sourceSha256 !== expectedSha256) {
    throw new Error(
      `immutable model release source SHA-256 mismatch: expected ${expectedSha256}, got ${sourceSha256}`,
    );
  }
  const modelPath = path.resolve(root, releasePath);
  let stat = fs.statSync(modelPath, { throwIfNoEntry: false });
  if (!stat) {
    const temporary = `${modelPath}.release-${process.pid}`;
    fs.copyFileSync(sourcePath, temporary, fs.constants.COPYFILE_EXCL);
    try {
      if (sha256File(temporary) !== expectedSha256) {
        throw new Error("materialized model checkpoint changed during copy");
      }
      const copied = fs.openSync(temporary, "r");
      try {
        fs.fsyncSync(copied);
      } finally {
        fs.closeSync(copied);
      }
      fs.renameSync(temporary, modelPath);
      const directory = fs.openSync(path.dirname(modelPath), "r");
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    stat = fs.statSync(modelPath);
  }
  if (!stat.isFile()) {
    throw new Error(`required model checkpoint is not a file: ${releasePath}`);
  }
  if (stat.size !== expectedBytes) {
    throw new Error(
      `required model checkpoint size mismatch: expected ${expectedBytes}, got ${stat.size}`,
    );
  }
  const actualSha256 = sha256File(modelPath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `required model checkpoint SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
  return {
    path: path.relative(path.resolve(root, "external/maxcore"), modelPath),
    bytes: expectedBytes,
    sha256: expectedSha256,
  };
}