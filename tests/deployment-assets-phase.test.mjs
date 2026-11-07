import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { precompressPublicAssets } from "../script/lib/precompress-public-assets.mjs";
import { validateBuild, writeBuildContract } from "../scripts/start-production.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredArtifacts = [
  "dist/index.mjs",
  "dist/cluster.mjs",
  "dist/gateway.mjs",
  "dist/dns-node.mjs",
  "dist/compute-sizing.mjs",
  "dist/retained-pdim-recovery-worker.mjs",
  "dist/public/index.html",
  "external/maxcore/artifacts/api-server/dist/index.mjs",
];

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "deployment-assets-phase-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await copyFile(path.join(sourceRoot, "build.sh"), path.join(root, "build.sh"));
  await copyFile(
    path.join(sourceRoot, "scripts/start-production.mjs"),
    path.join(root, "scripts/start-production.mjs"),
  );
  for (const file of [
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "start.sh",
    "client/index.html",
    "server/index.ts",
  ]) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "fixture source\n");
  }
  for (const file of requiredArtifacts) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "fixture artifact\n");
  }
  await mkdir(path.join(root, "dist/public/assets"), { recursive: true });
  await writeFile(path.join(root, "dist/public/assets/app.js"), "console.log('fixture');");
  await precompressPublicAssets(root);
  writeBuildContract(root);
  return root;
}

function runAssetsPhase(root) {
  return spawnSync("bash", ["build.sh", "--executive-task", "assets"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("deployment asset finalization refreshes strict hashes after deliberate sidecar removal", async t => {
  const root = await createFixture(t);
  const brotli = path.join(root, "dist/public/assets/app.js.br");
  const gzip = path.join(root, "dist/public/assets/app.js.gz");
  await access(brotli);
  await access(gzip);

  const result = runAssetsPhase(root);
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(access(brotli), { code: "ENOENT" });
  await assert.rejects(access(gzip), { code: "ENOENT" });
  assert.doesNotThrow(() => validateBuild(root));
  const contract = JSON.parse(await readFile(path.join(root, "dist/build-complete.json"), "utf8"));
  assert.ok(!Object.keys(contract.files).some(file => /\.(?:br|gz)$/i.test(file)));
});

test("deployment asset finalization rejects changed source before deleting variants", async t => {
  const root = await createFixture(t);
  const brotli = path.join(root, "dist/public/assets/app.js.br");
  await writeFile(path.join(root, "server/index.ts"), "changed after build\n");

  const result = runAssetsPhase(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source file content changed since build|Changed since build/);
  await access(brotli);
});
