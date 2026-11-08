import fs from "node:fs";

function formatBytes(bytes) {
  const units = ["B", "K", "M", "G", "T"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`;
}

export function finalizeSourceManifest(capsulePath, manifestPath, createdAt = new Date().toISOString()) {
  const packed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const packedBytes = fs.statSync(capsulePath).size;
  if (!Number.isSafeInteger(packed.rawBytes) || packed.rawBytes < 0 ||
      !Number.isSafeInteger(packed.memberCount) || packed.memberCount < 1 ||
      !/^[a-f0-9]{64}$/.test(packed.sha256) ||
      !/^zstd-\d+$/.test(packed.compression) || packedBytes < 1) {
    throw new Error("Source capsule is missing its streamed size/hash evidence");
  }

  const manifest = {
    ...packed,
    capsule: "source.pdim",
    label: "Application source tree",
    rawSize: formatBytes(packed.rawBytes),
    rawSizeBytes: packed.rawBytes,
    packedSize: formatBytes(packedBytes),
    packedSizeBytes: packedBytes,
    format: "pdim-v2",
    autoRestore: false,
    note: "Not needed at runtime — restore manually: bsdtar -xf source.pdim, or tar --zstd -xf source.pdim",
    createdAt,
  };
  const temporaryPath = `${manifestPath}.${process.pid}.finalizing`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(temporaryPath, manifestPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  return manifest;
}

if (process.argv[1] && process.argv[1].endsWith("/finalize-source-manifest.mjs")) {
  const [capsulePath, manifestPath] = process.argv.slice(2);
  if (!capsulePath || !manifestPath || process.argv.length !== 4) {
    throw new Error("Usage: finalize-source-manifest.mjs <capsule> <manifest>");
  }
  const manifest = finalizeSourceManifest(capsulePath, manifestPath);
  console.log(
    `   Source capsule: ${manifest.rawSize} payload → ${manifest.packedSize}; sha256=${manifest.sha256.slice(0, 16)}...`,
  );
}
