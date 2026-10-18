import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { restoreRuntimeData } from "../scripts/restore-runtime-data.mjs";

test("runtime restore retains a sanitized tar diagnostic and removes failed staging data", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-restore-diagnostic-"));
  const bytes = Buffer.from("not a zstandard-compressed tar archive");
  const sha256 = "a".repeat(64);
  const receipt = {
    version: 1,
    sha256,
    generation: "1",
    name: `private-runtime-recovery/${"a".repeat(8)}-aaaa-aaaa-aaaa-aaaaaaaaaaaa/runtime.tar.zst`,
    bytes: bytes.length,
    roots: ["data", "uploads"],
  };
  const storage = { bucket: { file: () => ({ createReadStream: () => Readable.from([bytes]) }) } };
  try {
    await assert.rejects(
      restoreRuntimeData(root, receipt, storage),
      error => {
        assert.match(error.message, /Runtime extraction failed: tar exited 2/);
        assert.match(error.message, /(?:zstd|archive|tar|format)/i);
        assert.doesNotMatch(error.message, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      },
    );
    assert.equal(fs.existsSync(path.join(root, `.runtime-data-stage-${sha256}`)), false);
    assert.equal(fs.existsSync(path.join(root, "data")), false);
    assert.equal(fs.existsSync(path.join(root, "uploads")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
