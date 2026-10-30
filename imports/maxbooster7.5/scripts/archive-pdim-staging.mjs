import fs from "node:fs";
import { readdir, open, lstat, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

const candidate = /^local-pdim-store\.json\.async-(\d+)-\d+$/;
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");

/** Archive only retained async staging files. Neither active snapshot nor AOF
 * names match the allowlist. Removal requires explicit authorization plus a
 * remote receipt persisted and read back before the local unlink. */
export async function archivePdimStaging({
  directory, bucket, prefix, removeVerified = false, progress = console.log,
}) {
  const results = [];
  for (const name of (await readdir(directory)).sort()) {
    const match = candidate.exec(name);
    if (!match) continue;
    if (fs.existsSync(`/proc/${match[1]}`)) throw new Error("Candidate writer PID is still present");
    const source = join(directory, name);
    const handle = await open(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile()) throw new Error("Candidate is not a regular file");
      const sameSource = async () => {
        const current = await lstat(source, { bigint: true });
        if (!current.isFile() || identity(current) !== identity(before) ||
            identity(await handle.stat({ bigint: true })) !== identity(before)) {
          throw new Error("Candidate changed during archive; local copy retained");
        }
      };
      const sha = createHash("sha256");
      let bytes = 0;
      const remote = bucket.file(`${prefix}/${name}`);
      progress(JSON.stringify({ phase: "upload", file: name, bytes: String(before.size) }));
      await pipeline(
        handle.createReadStream({ autoClose: false, start: 0 }),
        new Transform({ transform(chunk, _encoding, next) {
          sha.update(chunk); bytes += chunk.length; next(null, chunk);
        } }),
        remote.createWriteStream({
          resumable: true, validation: "crc32c",
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType: "application/octet-stream",
            metadata: { purpose: "retained-pdim-staging-archive" } },
        }),
      );
      const sha256 = sha.digest("hex");
      const [metadata] = await remote.getMetadata();
      if (!/^[1-9]\d*$/.test(String(metadata.generation)) ||
          BigInt(bytes) !== before.size || String(metadata.size) !== String(before.size)) {
        throw new Error("Archive size or generation receipt mismatch");
      }
      const generation = String(metadata.generation);
      const downloadedHash = createHash("sha256");
      let downloadedBytes = 0;
      progress(JSON.stringify({ phase: "verify", file: name }));
      await pipeline(
        bucket.file(remote.name, { generation }).createReadStream({ validation: "crc32c" }),
        new Writable({ write(chunk, _encoding, next) {
          downloadedHash.update(chunk); downloadedBytes += chunk.length; next();
        } }),
      );
      if (downloadedBytes !== bytes || downloadedHash.digest("hex") !== sha256) {
        throw new Error("Archive readback mismatch; local copy retained");
      }
      await sameSource();
      const receipt = {
        version: 1, source: name, object: remote.name, generation,
        bytes, sha256, sourceIdentity: identity(before),
        verifiedAt: new Date().toISOString(), localRemovalAuthorized: removeVerified,
      };
      const receiptFile = bucket.file(`${prefix}/${name}.receipt.json`);
      const encoded = Buffer.from(JSON.stringify(receipt));
      await receiptFile.save(encoded, {
        resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 },
      });
      const [receiptMeta] = await receiptFile.getMetadata();
      const [receiptBytes] = await bucket.file(receiptFile.name, {
        generation: String(receiptMeta.generation),
      }).download({ validation: "crc32c" });
      if (!receiptBytes.equals(encoded)) throw new Error("Receipt readback failed; local copy retained");
      await sameSource();
      if (removeVerified) await unlink(source);
      results.push({ file: name, bytes, sha256, removed: removeVerified });
      progress(JSON.stringify({ phase: "verified", file: name, bytes, removed: removeVerified }));
    } finally { await handle.close(); }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const storage = await createRecoveryStorage({
      bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
    });
    await verifyManagedPrivateStorage(storage);
    const prefix = `private-pdim-staging/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`;
    console.log(JSON.stringify({ archivePrefix: prefix }));
    const results = await archivePdimStaging({
      directory: resolve("data"), bucket: storage.bucket, prefix,
      removeVerified: process.argv.includes("--remove-verified"),
    });
    console.log(JSON.stringify({ complete: true, files: results.length,
      bytes: results.reduce((total, row) => total + row.bytes, 0),
      removed: results.filter(row => row.removed).length, archivePrefix: prefix }));
  } catch (error) {
    // SDK exceptions may contain bucket URLs; do not expose configuration values.
    console.error(JSON.stringify({ complete: false, errorType: error.name, code: error.code ?? null }));
    process.exitCode = 1;
  }
}
