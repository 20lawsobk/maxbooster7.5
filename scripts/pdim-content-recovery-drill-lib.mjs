import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writeSnapshotManifest(snapshotPath, manifestPath, content) {
  const bytes = await readFile(snapshotPath);
  const manifest = {
    schemaVersion: 1,
    snapshotFile: "local-pdim-store.export.json",
    snapshotBytes: bytes.length,
    snapshotSha256: sha256(bytes),
    content,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  return manifest;
}

export async function restoreVerifiedSnapshot(snapshotPath, manifestPath, destinationPath) {
  const [bytes, manifestBytes] = await Promise.all([
    readFile(snapshotPath),
    readFile(manifestPath),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest?.schemaVersion !== 1 ||
    !Number.isSafeInteger(manifest?.snapshotBytes) ||
    typeof manifest?.snapshotSha256 !== "string"
  ) {
    throw new Error("PDIM recovery manifest is invalid");
  }
  if (bytes.length !== manifest.snapshotBytes || sha256(bytes) !== manifest.snapshotSha256) {
    throw new Error("PDIM recovery snapshot checksum mismatch");
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  // COPYFILE_EXCL is intentional: recovery must never replace a destination
  // selected by mistake, even after a valid checksum.
  await copyFile(snapshotPath, destinationPath, constants.COPYFILE_EXCL);
  return manifest;
}