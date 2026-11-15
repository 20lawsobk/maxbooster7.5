import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { restoreVerifiedSnapshot, writeSnapshotManifest } from "../scripts/pdim-content-recovery-drill-lib.mjs";

async function fixture(t) {
  const root = await mkdtemp("/tmp/recovery-snapshot-integrity-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshot = join(root, "snapshot.json");
  const manifest = join(root, "manifest.json");
  const destination = join(root, "restore", "snapshot.json");
  const bytes = Buffer.from("verified original snapshot bytes");
  await writeFile(snapshot, bytes);
  await writeSnapshotManifest(snapshot, manifest, { fixture: true });
  return { root, snapshot, manifest, destination, bytes };
}

test("recovery publishes the exact verified bytes when the source changes before publication", async t => {
  const f = await fixture(t);
  // Run the actual helper with a controlled asynchronous mkdir boundary. Every
  // read, checksum, write and assertion uses the real filesystem. Changing the
  // source here reproduces a concurrently replaced export after verification.
  const helperPath = new URL("../scripts/pdim-content-recovery-drill-lib.mjs", import.meta.url);
  const source = await readFile(helperPath, "utf8");
  const binding = 'from "node:fs/promises"';
  assert.ok(source.includes(binding));
  await writeFile(join(f.root, "boundary.mjs"), `
    import * as fs from 'node:fs/promises';
    export const readFile=fs.readFile, writeFile=fs.writeFile, copyFile=fs.copyFile;
    export async function mkdir(...args) {
      await fs.mkdir(...args);
      await fs.writeFile(${JSON.stringify(f.snapshot)}, 'unverified replacement bytes');
    }
  `);
  const helper = join(f.root, "actual-helper.mjs");
  await writeFile(helper, source.replace(binding, 'from "./boundary.mjs"'));
  const isolated = await import(pathToFileURL(helper));
  await isolated.restoreVerifiedSnapshot(f.snapshot, f.manifest, f.destination);
  assert.equal(await readFile(f.snapshot, "utf8"), "unverified replacement bytes");
  assert.deepEqual(await readFile(f.destination), f.bytes);
  assert.equal((await stat(f.destination)).mode & 0o777, 0o600);
});

test("recovery rejects changed bytes before creating a destination", async t => {
  const f = await fixture(t);
  await writeFile(f.snapshot, "corrupted export");
  await assert.rejects(restoreVerifiedSnapshot(f.snapshot, f.manifest, f.destination), /checksum mismatch/);
  await assert.rejects(stat(f.destination), { code: "ENOENT" });
});

test("recovery retains exclusive destination protection", async t => {
  const f = await fixture(t);
  await restoreVerifiedSnapshot(f.snapshot, f.manifest, f.destination);
  await writeFile(f.destination, "existing recovery data");
  await assert.rejects(restoreVerifiedSnapshot(f.snapshot, f.manifest, f.destination), { code: "EEXIST" });
  assert.equal(await readFile(f.destination, "utf8"), "existing recovery data");
});
