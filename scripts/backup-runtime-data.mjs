// Run only with all writers stopped. Never deletes workspace data.
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

if (process.argv[2] !== "--writers-stopped") throw new Error("Requires stopped data writers");
const root = process.cwd();
const scratch = fs.mkdtempSync("/tmp/runtime-data-backup-");
const hash = async file => {
  const digest = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
};
const run = (args, cwd = root) => {
  const result = spawnSync("bash", ["-o", "pipefail", "-c", args], { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Archive operation failed (${result.status})`);
};
try {
  const storage = await createRecoveryStorage({
    bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
  });
  await verifyManagedPrivateStorage(storage);
  console.log("Private storage verified; capturing data and uploads without exclusions");
  const archive = path.join(scratch, "runtime.tar.zst");
  run(`tar -cf - data uploads | zstd -6 -T2 -c > ${JSON.stringify(archive)}`);
  const sha256 = await hash(archive);
  const name = `private-runtime-recovery/${randomUUID()}/runtime.tar.zst`;
  const [uploaded] = await storage.bucket.upload(archive, {
    destination: name, validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { metadata: { sha256, purpose: "runtime-data-recovery" } },
  });
  const [metadata] = await uploaded.getMetadata();
  const generation = String(metadata.generation);
  if (!/^[1-9]\d*$/.test(generation)) throw new Error("Missing immutable object generation");
  const readback = path.join(scratch, "readback.tar.zst");
  await pipeline(storage.bucket.file(name, { generation }).createReadStream({ validation: "crc32c" }),
    fs.createWriteStream(readback, { flags: "wx", mode: 0o600 }));
  if (await hash(readback) !== sha256) throw new Error("Bucket readback SHA-256 mismatch");
  run(`zstd -dc ${JSON.stringify(readback)} | tar --compare -f -`);
  const receipt = { version: 1, createdAt: new Date().toISOString(),
    bucketId: storage.bucketId, name, generation, sha256,
    bytes: fs.statSync(readback).size, roots: ["data", "uploads"],
    verified: "generation-pinned CRC32C/SHA256 readback and tar comparison against stopped source" };
  fs.mkdirSync(".local/state", { recursive: true });
  fs.writeFileSync(".local/state/runtime-data-backup.json", JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(`BACKUP_VERIFIED: ${receipt.bytes} compressed bytes; workspace data unchanged`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
