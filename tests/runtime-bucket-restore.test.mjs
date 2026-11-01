import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupRuntimeData } from "../scripts/backup-runtime-data.mjs";
import { restoreRuntimeData } from "../scripts/restore-runtime-data.mjs";
import { createRecoveryStorage } from "../scripts/recovery-private-store.mjs";

test("real private bucket backup restores, rejects bad hashes, and preserves newer seeded files", {
  skip: process.env.RUN_PRIVATE_BUCKET_TEST !== "1", timeout: 60000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bucket-roundtrip-"));
  const source = path.join(root, "source");
  const restored = path.join(root, "restored");
  fs.mkdirSync(path.join(source, "data"), { recursive: true });
  fs.mkdirSync(path.join(source, "uploads"));
  fs.mkdirSync(restored);
  fs.writeFileSync(path.join(source, "data/test.json"), '{"test":true}');
  fs.writeFileSync(path.join(source, "uploads/test.txt"), "original");
  const storage = await createRecoveryStorage({
    bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
  });
  let receipt;
  try {
    receipt = await backupRuntimeData(source, storage);
    await assert.rejects(restoreRuntimeData(restored, { ...receipt, sha256: "0".repeat(64) }, storage), /checksum/);
    assert.equal(fs.existsSync(path.join(restored, "data")), false);
    await restoreRuntimeData(restored, receipt, storage);
    assert.equal(fs.readFileSync(path.join(restored, "data/test.json"), "utf8"), '{"test":true}');
    fs.writeFileSync(path.join(restored, "uploads/test.txt"), "newer production content");
    await restoreRuntimeData(restored, receipt, storage);
    assert.equal(fs.readFileSync(path.join(restored, "uploads/test.txt"), "utf8"), "newer production content");
    fs.unlinkSync(path.join(restored, "uploads/.bucket-seed-generation"));
    await assert.rejects(restoreRuntimeData(restored, receipt, storage), /Refusing to overwrite/);
  } finally {
    if (receipt) await storage.bucket.file(receipt.name, { generation: receipt.generation })
      .delete({ preconditionOpts: { ifGenerationMatch: receipt.generation } });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
