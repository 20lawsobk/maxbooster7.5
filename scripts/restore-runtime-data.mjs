import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

export async function restoreRuntimeData(root, receipt, storage) {
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
  const extractor = spawn("tar", ["--zstd", "-xf", "-", "--no-same-owner", "-C", stage],
    { stdio: ["pipe", "ignore", "inherit"] });
  const exited = new Promise((resolve, reject) => {
    extractor.once("error", reject);
    extractor.once("close", code => code === 0 ? resolve() : reject(new Error(`Runtime extraction failed: ${code}`)));
  });
  const meter = new Transform({ transform(chunk, encoding, done) {
    bytes += chunk.length; hash.update(chunk); done(null, chunk);
  }});
  try {
    await Promise.all([exited, pipeline(
      storage.bucket.file(receipt.name, { generation: receipt.generation }).createReadStream({ validation: "crc32c" }),
      meter, extractor.stdin)]);
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
    extractor.kill("SIGTERM");
    await exited.catch(() => {});
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
