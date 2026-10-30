// Explicitly quiesce all writers before invoking. Never deletes source data.
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

function completion(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve() :
      reject(new Error(`Archive process failed (${signal || code})`)));
  });
}
export async function backupRuntimeData(root, storage) {
  await verifyManagedPrivateStorage(storage);
  function validate(file) {
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) validate(path.join(file, name));
    else if (!stat.isFile()) throw new Error("Runtime backup requires regular files and directories, not links/devices");
  }
  for (const dir of ["data", "uploads"]) {
    if (!fs.lstatSync(path.join(root, dir)).isDirectory()) throw new Error(`Missing real directory: ${dir}`);
    validate(path.join(root, dir));
  }
  const name = `private-runtime-recovery/${randomUUID()}/runtime.tar.zst`;
  const object = storage.bucket.file(name);
  let bytes = 0;
  const digest = createHash("sha256");
  const meter = new Transform({ transform(chunk, encoding, done) {
    bytes += chunk.length; digest.update(chunk); done(null, chunk);
  }});
  const progress = setInterval(() => console.log(`[backup] ${bytes} compressed bytes streamed; no local archive`), 15000);
  const children = [];
  const abort = new AbortController();
  const interrupted = () => {
    abort.abort();
    for (const child of children) { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
  };
  process.once("SIGTERM", interrupted);
  process.once("SIGINT", interrupted);
  let generation;
  try {
    const pack = spawn("bash", ["-o", "pipefail", "-c", "tar -cf - data uploads | zstd -6 -T2 -c"],
      { cwd: root, detached: true, stdio: ["ignore", "pipe", "inherit"] });
    children.push(pack);
    await Promise.all([
      completion(pack),
      pipeline(pack.stdout, meter, object.createWriteStream({
        resumable: true, validation: "crc32c",
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: "application/zstd", metadata: { purpose: "runtime-data-recovery" } },
      }), { signal: abort.signal }),
    ]);
    const sha256 = digest.digest("hex");
    const [metadata] = await object.getMetadata();
    generation = String(metadata.generation);
    if (!/^[1-9]\d*$/.test(generation)) throw new Error("Missing immutable generation");
    const readHash = createHash("sha256");
    let readBytes = 0;
    const compare = spawn("bash", ["-o", "pipefail", "-c", "zstd -dc | tar --compare -f -"],
      { cwd: root, detached: true, stdio: ["pipe", "ignore", "inherit"] });
    children.push(compare);
    const check = new Transform({ transform(chunk, encoding, done) {
      readHash.update(chunk); readBytes += chunk.length; done(null, chunk);
    }});
    await Promise.all([
      completion(compare),
      pipeline(storage.bucket.file(name, { generation }).createReadStream({ validation: "crc32c" }),
        check, compare.stdin, { signal: abort.signal }),
    ]);
    if (readHash.digest("hex") !== sha256 || readBytes !== bytes) throw new Error("Bucket readback mismatch");
    const receipt = { version: 1, createdAt: new Date().toISOString(), bucketId: storage.bucketId,
      name, generation, sha256, crc32c: metadata.crc32c, bytes, roots: ["data", "uploads"],
      verified: "generation-pinned CRC32C/SHA256 readback and tar comparison against stopped source" };
    fs.mkdirSync(path.join(root, ".local/state"), { recursive: true });
    fs.writeFileSync(path.join(root, ".local/state/runtime-data-backup.json"),
      JSON.stringify(receipt, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(root, "runtime-data.manifest.json"),
      JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(`BACKUP_VERIFIED: ${bytes} compressed bytes; workspace data unchanged`);
    return receipt;
  } finally {
    interrupted();
    clearInterval(progress);
    process.removeListener("SIGTERM", interrupted);
    process.removeListener("SIGINT", interrupted);
    // An unverified object is never published in a receipt. Retain it rather
    // than risk deleting recovery evidence after an interrupted verification.
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] !== "--writers-stopped") throw new Error("Requires stopped data writers");
  const storage = await createRecoveryStorage({
    bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
  });
  await backupRuntimeData(process.cwd(), storage);
}
