/** Explicit, memory-heavy boundary test. Run with the app stopped:
 * node --max-old-space-size=3072 --import tsx scripts/verify-large-pdim-snapshot.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSnapshotJson, snapshotJsonChunks } from "../server/lib/pdimSnapshotJson";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdim-string-limit-"));
try {
  const file = path.join(directory, "snapshot.json");
  const text = "x".repeat(1024 * 1024);
  const entries = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [
    `entry${i}`, { type: "string", value: text },
  ]));
  const fd = fs.openSync(file, "w", 0o600);
  try {
    for (const chunk of snapshotJsonChunks(entries)) fs.writeFileSync(fd, chunk);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  assert(fs.statSync(file).size > 536870888, "must exceed V8's single-string limit");
  const restored = readSnapshotJson(file) as typeof entries;
  assert.equal(Object.keys(restored).length, 520);
  for (const value of Object.values(restored)) assert.equal(value.value, text);
  console.log("Large PDIM snapshot round-trip verified");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}