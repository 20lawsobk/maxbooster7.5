import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { test } from "node:test";
import { precompressPublicAssets } from "../script/lib/precompress-public-assets.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "precompressed-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = path.join(root, "dist", "public", "assets");
  await mkdir(path.join(assets, "nested"), { recursive: true });
  await writeFile(path.join(assets, "app-abc123.js"), "console.log('built');");
  await writeFile(path.join(assets, "nested", "style-abc123.css"), "body{color:#111}");
  await writeFile(path.join(assets, "image.bin"), Buffer.from([0, 1, 2, 3]));
  return { root, assets };
}

test("precompression creates verifiable variants before manifesting", async t => {
  const { root, assets } = await fixture(t);
  const result = await precompressPublicAssets(root);
  assert.deepEqual(result, { sourceFiles: 2, filesWritten: 4, filesVerified: 0 });

  for (const filename of [
    path.join(assets, "app-abc123.js"),
    path.join(assets, "nested", "style-abc123.css"),
  ]) {
    const original = await readFile(filename);
    assert.deepEqual(brotliDecompressSync(await readFile(`${filename}.br`)), original);
    assert.deepEqual(gunzipSync(await readFile(`${filename}.gz`)), original);
  }
  await assert.rejects(stat(path.join(assets, "image.bin.br")), { code: "ENOENT" });
});

test("precompression is idempotent and rejects corrupted existing variants", async t => {
  const { root, assets } = await fixture(t);
  await precompressPublicAssets(root);
  const original = path.join(assets, "app-abc123.js");
  const sidecar = `${original}.br`;
  const previous = await stat(sidecar);
  assert.deepEqual(await precompressPublicAssets(root), {
    sourceFiles: 2, filesWritten: 0, filesVerified: 4,
  });
  assert.equal((await stat(sidecar)).mtimeMs, previous.mtimeMs);

  await writeFile(sidecar, Buffer.from("invalid sidecar"));
  await assert.rejects(precompressPublicAssets(root), /Existing compressed public asset/);
});

test("precompression rejects missing assets directories and invalid concurrency", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "precompressed-assets-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(precompressPublicAssets(root), /assets directory is missing/);
  await mkdir(path.join(root, "dist", "public", "assets"), { recursive: true });
  await assert.rejects(precompressPublicAssets(root, { concurrency: 0 }), /concurrency/);
});
