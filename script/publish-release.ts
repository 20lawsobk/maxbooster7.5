import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventory, sourceIncluded, assertInventory, buildEnvironmentDigest } from "./lib/releaseInventory.js";
import { assertPublishingPayloadClean, measurePublishingPayload } from "./lib/publishingPayload.js";
import { isPublishingEnvironment } from "./lib/deploymentPackRecovery.mjs";
import { getNixClosureSize } from "./build.js";

export async function verifyPreparedRelease(root: string) {
  const directory = path.join(root, ".prepared-release");
  if (!fs.existsSync(path.join(directory, "release.json"))) {
    throw new Error("No prepared release. Run npm run release:prepare before publishing.");
  }
  if (fs.realpathSync(directory) !== directory) throw new Error("Prepared release directory must not be a symlink");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "release.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.source) || !Array.isArray(manifest.payload) ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      manifest.verification?.capsules !== true || manifest.verification?.restoredArtifacts !== true ||
      manifest.verification?.runtimeImports !== true) throw new Error("Invalid or unverified prepared release");
  assertInventory(manifest.source, await inventory(root, sourceIncluded), "Production source");
  if (manifest.buildEnvironment !== buildEnvironmentDigest(process.env)) {
    throw new Error("Frontend build environment changed; prepare the release with the intended VITE_ settings before publishing.");
  }
  const payloadRoot = path.join(directory, "payload");
  if (fs.realpathSync(payloadRoot) !== payloadRoot) throw new Error("Payload directory must not be a symlink");
  assertInventory(manifest.payload, await inventory(payloadRoot), "Prepared artifacts");
  for (const required of [
    "start.sh", ".node_bin/node", "dist/pdim-restore.mjs",
    "scripts/boot-stub-server.mjs", "scripts/port-contract.sh",
    ...["node_modules", "python_runtime", "external_maxcore", "external_pdim", "app_remainder"]
      .flatMap(name => [`${name}.pdim`, `${name}.manifest.json`]),
  ]) {
    if (!manifest.payload.some((entry: { path: string }) => entry.path === required)) {
      throw new Error(`Required prepared artifact missing: ${required}`);
    }
  }
  return { manifest, payloadRoot };
}

export async function installPreparedRelease(root: string, env: NodeJS.ProcessEnv) {
  root = path.resolve(root);
  if (!isPublishingEnvironment(env, root) || fs.realpathSync(root) !== root) {
    throw new Error("Prepared release installation requires explicit disposable publishing-root authorization");
  }
  const { manifest, payloadRoot } = await verifyPreparedRelease(root);
  const policy = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
  assertPublishingPayloadClean(payloadRoot, policy);
  // The builder's Nix layer may differ from the preparation machine's layer.
  // Measure it afresh before any input deletion; never reuse a saved estimate.
  const nix = getNixClosureSize();
  const payload = measurePublishingPayload(payloadRoot, policy);
  if (nix.roots.some(p => !nix.coveredRoots.includes(p)) ||
      nix.totalBytes + payload.totalBytes > 7.5 * 1024 ** 3) {
    throw new Error("Prepared release exceeds image budget or has unmeasured Nix roots");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "publish-prepared-"));
  try {
    fs.cpSync(payloadRoot, path.join(temporary, "payload"), {
      recursive: true, dereference: false, mode: fs.constants.COPYFILE_FICLONE,
    });
    assertInventory(manifest.payload, await inventory(path.join(temporary, "payload")), "Staged artifacts");
    // All validation is complete. This root is the explicitly disposable
    // publishing copy, never the development checkout. Install only the exact
    // admitted payload; source/dependency trees must not inflate the image.
    const names = fs.readdirSync(root);
    for (const name of names.filter(name => name !== ".cache")) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    if (names.includes(".cache") || fs.existsSync(path.join(root, ".cache"))) {
      fs.rmSync(path.join(root, ".cache"), { recursive: true, force: true });
    }
    fs.cpSync(path.join(temporary, "payload"), root, { recursive: true, dereference: false });
    assertPublishingPayloadClean(root, policy);
    assertInventory(manifest.payload, await inventory(root), "Installed artifacts");
    console.log(`[release] Verified release ${manifest.createdAt} installed; no application build or package installation ran.`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    if (process.argv.length !== 4 || process.argv[2] !== "--publish-disposable-copy" ||
        path.resolve(process.argv[3]) !== ownRoot || process.cwd() !== ownRoot ||
        ["DEPLOY_PACK", "PUBLISH_BUILD_ROOT", "PUBLISH_PAYLOAD_CLEANUP"].some(key => process.env[key] !== undefined)) {
      throw new Error("Publishing requires its own explicit disposable root and no inherited cleanup authorization");
    }
    await installPreparedRelease(ownRoot, {
      ...process.env, DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1", PUBLISH_BUILD_ROOT: ownRoot,
    });
  } catch (error) {
    console.error("[release] Publishing refused:", (error as Error).message);
    process.exitCode = 1;
  }
}