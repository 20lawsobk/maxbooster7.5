import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

const MAX_EXTRACTOR_DIAGNOSTIC_BYTES = 8192;

function sanitizeDiagnostic(value, root, stage) {
  return String(value ?? "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replaceAll(root, "<restore-root>")
    .replaceAll(stage, "<restore-stage>")
    .replace(/https?:\/\/[^\s)"']+/gi, "<url>")
    .replace(/\b(?:authorization|bearer|token|secret|credential)\b\s*[:=]?\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/\b(?:data|uploads)\/[^:\s]+/g, "<runtime-entry>")
    .replace(/\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+/g, "<path>")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 4096);
}

function errorSummary(error) {
  if (!error) return "";
  const code = typeof error.code === "string" ? ` (${error.code})` : "";
  return `${error.name || "Error"}${code}: ${error.message || "stream failed"}`;
}

export async function restoreRuntimeData(root, receipt, storage, { tarPath = "tar" } = {}) {
  if (receipt.version !== 1 || !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
      !/^[1-9]\d*$/.test(receipt.generation) ||
      !/^private-runtime-recovery\/[a-f0-9-]+\/runtime\.tar\.zst$/.test(receipt.name) ||
      !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0 ||
      JSON.stringify(receipt.roots) !== '["data","uploads"]') throw new Error("Invalid runtime backup receipt");
  const marker = ".bucket-seed-generation";
  const complete = dir => {
    const destination = path.join(root, dir);
    if (!fs.existsSync(destination)) return false;
    if (!fs.lstatSync(destination).isDirectory() ||
        !fs.existsSync(path.join(destination, marker)) ||
        fs.readFileSync(path.join(destination, marker), "utf8") !== receipt.sha256) {
      throw new Error(`Refusing to overwrite existing ${dir}; reconcile its data before restore`);
    }
    return true;
  };
  if (receipt.roots.every(complete)) return;
  // Validate both existing destinations before creating or extracting anything.
  receipt.roots.forEach(complete);
  const stage = path.join(root, `.runtime-data-stage-${receipt.sha256}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { mode: 0o700 });
  const hash = createHash("sha256");
  let bytes = 0;
  const extractor = spawn(tarPath, ["--zstd", "-xf", "-", "--no-same-owner", "-C", stage],
    { stdio: ["pipe", "ignore", "pipe"] });
  const stderr = [];
  let stderrBytes = 0;
  extractor.stderr.on("data", chunk => {
    if (stderrBytes >= MAX_EXTRACTOR_DIAGNOSTIC_BYTES) return;
    const limited = Buffer.from(chunk).subarray(0, MAX_EXTRACTOR_DIAGNOSTIC_BYTES - stderrBytes);
    stderr.push(limited);
    stderrBytes += limited.length;
  });
  const exited = new Promise(resolve => {
    extractor.once("error", error => resolve({ error }));
    extractor.once("close", (code, signal) => resolve({ code, signal }));
  });
  const meter = new Transform({ transform(chunk, encoding, done) {
    bytes += chunk.length; hash.update(chunk); done(null, chunk);
  }});
  try {
    const streamed = pipeline(
      storage.bucket.file(receipt.name, { generation: receipt.generation }).createReadStream({ validation: "crc32c" }),
      meter, extractor.stdin).then(() => ({}), error => ({ error }));
    const [exit, stream] = await Promise.all([exited, streamed]);
    const diagnostic = sanitizeDiagnostic(Buffer.concat(stderr).toString("utf8"), root, stage);
    if (exit.error) {
      throw new Error(`Runtime extractor could not start: ${sanitizeDiagnostic(errorSummary(exit.error), root, stage)}`,
        { cause: exit.error });
    }
    if (exit.code !== 0) {
      const streamDetail = stream.error && stream.error.code !== "EPIPE"
        ? `; archive stream: ${sanitizeDiagnostic(errorSummary(stream.error), root, stage)}` : "";
      throw new Error(`Runtime extraction failed: tar exited ${exit.code}${exit.signal ? ` (${exit.signal})` : ""}` +
        `${diagnostic ? `: ${diagnostic}` : ""}${streamDetail}`);
    }
    if (stream.error) {
      throw new Error(`Runtime backup stream failed: ${sanitizeDiagnostic(errorSummary(stream.error), root, stage)}`,
        { cause: stream.error });
    }
    if (bytes !== receipt.bytes || hash.digest("hex") !== receipt.sha256) throw new Error("Runtime backup checksum mismatch");
    if (fs.readdirSync(stage).sort().join(",") !== "data,uploads") throw new Error("Unexpected runtime backup roots");
    function validate(file) {
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) for (const name of fs.readdirSync(file)) validate(path.join(file, name));
      else if (!stat.isFile()) throw new Error("Runtime backup contains a link or device");
    }
    validate(stage);
    for (const dir of receipt.roots) {
      if (!fs.lstatSync(path.join(stage, dir)).isDirectory()) throw new Error(`Invalid backup directory: ${dir}`);
      fs.writeFileSync(path.join(stage, dir, marker), receipt.sha256);
    }
    for (const dir of receipt.roots) {
      if (!complete(dir)) fs.renameSync(path.join(stage, dir), path.join(root, dir));
    }
    console.log("[runtime-data] Verified private backup restored; existing seeded data preserved");
  } finally {
    if (extractor.exitCode === null && extractor.signalCode === null) extractor.kill("SIGTERM");
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!fs.existsSync("dist/deployment/runtime-data-backup.json")) {
    throw new Error("Missing required runtime data backup receipt");
  }
  const receipt = JSON.parse(fs.readFileSync("dist/deployment/runtime-data-backup.json", "utf8"));
  const storage = await createRecoveryStorage({ bucketId: receipt.bucketId });
  if (process.argv.includes("--verify-backup")) {
    await verifyManagedPrivateStorage(storage);
    const [metadata] = await storage.bucket.file(receipt.name, { generation: receipt.generation }).getMetadata();
    if (String(metadata.generation) !== receipt.generation ||
        Number(metadata.size) !== receipt.bytes || !receipt.crc32c ||
        metadata.crc32c !== receipt.crc32c ||
        !/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new Error("Retained runtime backup no longer matches verified receipt");
    console.log("[runtime-data] Private generation-pinned backup is available");
  } else await restoreRuntimeData(process.cwd(), receipt, storage);
}
