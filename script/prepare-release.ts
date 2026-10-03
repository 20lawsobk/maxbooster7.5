import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inventory, sourceIncluded, assertInventory, buildEnvironmentDigest, fileDigest } from "./lib/releaseInventory.js";
import { runBuildProcess } from "./lib/buildProcess.js";
import { buildServerBundles } from "./lib/serverBundles.js";
import { computeRemainingAppMembers } from "./lib/dockerignoreScan.js";
import { DEPLOYMENT_CONTROL_FILES } from "./lib/deploymentControlFiles.js";
import { packCapsule, packCapsuleMembers, MAXCORE_CAPSULE_EXCLUDE_PATHS, PDIM_CAPSULE_EXCLUDE_PATHS } from "./lib/capsulePack.js";
import { cachedCapsule, verifyCapsule, treeIdentity, identity } from "./lib/preparedCapsules.js";
import { preparePython } from "./prepare-runtime.js";
import { buildPortableNode } from "./lib/portableNode.js";
import { validateModelRelease } from "./lib/modelRelease.js";
import { assertNoSelectedMaxCoreCandidate } from "./lib/deploymentPreflight.js";
import { getNixClosureSize } from "./build.js";
import { assertPublishingPayloadClean, measurePublishingPayload } from "./lib/publishingPayload.js";
import { inspectArtifacts, inspectRestored } from "../scripts/verify-runtime-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".prepared-release");
const parent = path.join(root, ".local/prepared-releases");
fs.mkdirSync(parent, { recursive: true });
if (fs.realpathSync(parent) !== parent) throw new Error("Release staging parent must not be a symlink");
const lock = path.join(parent, "preparing.lock");
const fd = fs.openSync(lock, "wx", 0o600);
fs.writeFileSync(fd, String(process.pid));
const work = fs.mkdtempSync(path.join(parent, "work-"));
const payload = path.join(work, "candidate/payload");
const app = path.join(work, "app");
const cache = path.join(parent, "verified-capsules");
const copy = (from: string, to: string) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
};
try {
  console.log("[release] Non-destructive preparation: one staging area; serial capsule verification");
  const availableKB = Number(fs.readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(availableKB) || availableKB < 2 * 1024 ** 2) {
    throw new Error("Preparation needs 2 GiB available memory; competing work must finish first. No app was stopped.");
  }
  // No full source copy, recovery snapshot or full-release extraction.
  // Probe one largest extraction plus compressed outputs and build scratch.
  const largest = Math.max(...["node_modules", "python_runtime", "external/maxcore", "external/pdim"]
    .filter(dir => fs.existsSync(path.join(root, dir)))
    .map(dir => Number(execFileSync("du", ["-sb", path.join(root, dir)], { encoding: "utf8" }).split(/\s/)[0])));
  const required = Math.ceil(largest * 1.25 + 2 * 1024 ** 3);
  const probe = path.join(work, "capacity-probe");
  console.log(`[release] Checking ${(required / 1024 ** 3).toFixed(1)} GiB scratch allocation (not multiple project copies)`);
  try { execFileSync("fallocate", ["-l", String(required), probe], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch { throw new Error(`Cannot allocate ${(required / 1024 ** 3).toFixed(1)} GiB scratch; retained simulations were not touched`); }
  finally { fs.rmSync(probe, { force: true }); }

  const source = await inventory(root, sourceIncluded);
  const environment = buildEnvironmentDigest(process.env);
  const policies = await Promise.all([
    "script/lib/capsulePack.ts", "script/lib/preparedCapsules.ts", "scripts/verify-runtime-artifacts.mjs",
    "dist/pdim-restore.mjs", "script/lib/verifyPortablePython.py",
  ].map(async file => [file, await fileDigest(path.join(root, file))]));
  const policyKey = identity({ policies, platform: process.platform, arch: process.arch, version: 2 });
  assertNoSelectedMaxCoreCandidate(root);
  const model = validateModelRelease(root, { readOnly: true });
  await runBuildProcess(process.execPath, ["scripts/verify-runtime-artifacts.mjs", "deployment-dependencies", root], root);
  fs.mkdirSync(payload, { recursive: true });
  fs.mkdirSync(app);

  // Only runtime-admitted application files belong in the app capsule. The
  // large dependency/source trees stay in the workspace and are streamed later.
  for (const member of computeRemainingAppMembers(root)) {
    if (member.startsWith("dist/") || member === "bin/boosterstate") continue;
    copy(path.join(root, member), path.join(app, member));
  }
  await runBuildProcess(process.execPath, ["node_modules/vite/bin/vite.js", "build",
    "--outDir", path.join(app, "dist/public")], root);
  await buildServerBundles(root, path.join(app, "dist"));

  // Native outputs have their own verified identity, independent of application
  // edits. Never use an unproven workspace binary as a release artifact.
  const nativeInputs = await inventory(root, file =>
    (file === "boosterstate" || file.startsWith("boosterstate/")) && !file.startsWith("boosterstate/target") ||
    ["script", "script/lib", "scripts"].includes(file) ||
    ["script/lib/portableNode.ts", "scripts/build-boosterstate.sh", "scripts/boosterstate-toolchain.nix"].includes(file));
  const nativeKey = identity({ policyKey, nativeInputs });
  const native = path.join(parent, `native-${nativeKey}`);
  if (!fs.existsSync(native)) {
    const building = fs.mkdtempSync(path.join(work, "native-"));
    buildPortableNode(building);
    const tools = path.join(work, "native-tools");
    try {
      await runBuildProcess("bash", ["scripts/build-boosterstate.sh"], root, {
        ...process.env, BOOSTERSTATE_OUTPUT_DIR: path.join(building, "bin"),
        BOOSTERSTATE_TARGET_DIR: path.join(tools, "target"), BOOSTERSTATE_CARGO_HOME: path.join(tools, "cargo"),
        CARGO_BUILD_JOBS: "1",
      });
    } finally { fs.rmSync(tools, { recursive: true, force: true }); }
    const check = inspectRestored(building, [".node_bin/node", ".node_bin/provenance.json", "bin/boosterstate"]);
    if (!check.ready) throw new Error(check.failures.join("\n"));
    await runBuildProcess(path.join(building, ".node_bin/node"), ["--version"], building, { PATH: process.env.PATH });
    fs.writeFileSync(path.join(building, "verified.json"), JSON.stringify(await inventory(building)));
    fs.renameSync(building, native);
  }
  assertInventory(JSON.parse(fs.readFileSync(path.join(native, "verified.json"), "utf8")),
    await inventory(native, file => file !== "verified.json"), "Native cache");
  copy(path.join(native, ".node_bin"), path.join(payload, ".node_bin"));
  copy(path.join(native, "bin/boosterstate"), path.join(app, "bin/boosterstate"));

  for (const [name, dir, excludePaths] of [
    ["node_modules", "node_modules", []],
    ["external_maxcore", "external/maxcore", MAXCORE_CAPSULE_EXCLUDE_PATHS],
    ["external_pdim", "external/pdim", PDIM_CAPSULE_EXCLUDE_PATHS],
  ] as const) {
    const before = await treeIdentity(root, dir);
    const key = identity({ policyKey, before, excludePaths, model: name === "external_maxcore" ? model : null });
    await cachedCapsule({ cache, payload, name, key,
      build: async output => {
        const packed = await packCapsule({ root, dir, capsule: name + ".pdim", outputRoot: output,
          preserveSource: true, threads: 1, excludePaths: [...excludePaths],
          requiredMembers: name === "external_maxcore" ? [model] : [] });
        if (!packed) throw new Error(`Missing capsule source: ${dir}`);
      },
      verify: output => verifyCapsule(root, work, output, name, dir),
    });
    if (before !== await treeIdentity(root, dir)) throw new Error(`${dir} changed during preparation`);
  }
  const pythonInputs = await Promise.all([
    "script/prepare-runtime.ts", "script/lib/pythonRequirements.py", "script/lib/portablePython.mjs",
    "external/maxcore/artifacts/ai-training-server/uv.lock",
  ].map(async file => [file, await fileDigest(path.join(root, file))]));
  await cachedCapsule({ cache, payload, name: "python_runtime", key: identity({ policyKey, pythonInputs }),
    build: async output => {
      const runtime = path.join(work, "runtime");
      fs.mkdirSync(runtime);
      try {
        preparePython(runtime, root);
        await packCapsule({ root: runtime, dir: "python_runtime", capsule: "python_runtime.pdim",
          outputRoot: output, preserveSource: true, threads: 1 });
      } finally { fs.rmSync(runtime, { recursive: true, force: true }); }
    },
    verify: output => verifyCapsule(root, work, output, "python_runtime", "python_runtime"),
  });

  const appMembers = (await inventory(app)).filter(entry => !fs.lstatSync(path.join(app, entry.path)).isDirectory()).map(entry => entry.path);
  const packed = await packCapsuleMembers({ root: app, members: appMembers, capsule: "app_remainder.pdim",
    outputRoot: payload, preserveSource: true, threads: 1 });
  if (!packed) throw new Error("Application capsule is empty");
  fs.rmSync(app, { recursive: true, force: true }); // Own generated staging only.
  await verifyCapsule(root, work, payload, "app_remainder", "");
  for (const file of [...DEPLOYMENT_CONTROL_FILES, "start.sh", "dist/pdim-restore.mjs",
    "scripts/boot-stub-server.mjs", "scripts/port-contract.sh", "scripts/check-port-contract.ts"]) {
    if (fs.existsSync(path.join(root, file))) copy(path.join(root, file), path.join(payload, file));
  }
  const artifacts = await inspectArtifacts(payload);
  if (!artifacts.ready) throw new Error(artifacts.failures.join("\n"));
  const policy = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
  assertPublishingPayloadClean(payload, policy);
  const nix = getNixClosureSize();
  if (nix.roots.some(item => !nix.coveredRoots.includes(item)) ||
      nix.totalBytes + measurePublishingPayload(payload, policy).totalBytes > 7.5 * 1024 ** 3) {
    throw new Error("Prepared release exceeds image budget or Nix roots are unmeasured");
  }
  assertInventory(source, await inventory(root, sourceIncluded), "Source during preparation");
  if (environment !== buildEnvironmentDigest(process.env)) throw new Error("Build settings changed during preparation");
  fs.writeFileSync(path.join(work, "candidate/release.json"), JSON.stringify({
    schemaVersion: 1, createdAt: new Date().toISOString(), source, payload: await inventory(payload),
    buildEnvironment: environment,
    verification: { capsules: true, restoredArtifacts: true, runtimeImports: true, applicationReadiness: false },
  }, null, 2));
  const previous = path.join(work, "previous-release");
  if (fs.existsSync(destination)) fs.renameSync(destination, previous);
  try { fs.renameSync(path.join(work, "candidate"), destination); }
  catch (error) {
    if (fs.existsSync(previous)) fs.renameSync(previous, destination);
    throw error;
  }
  // Only the prior release generated by this builder; retained simulations and
  // unrelated recovery trees are never part of this cleanup.
  fs.rmSync(previous, { recursive: true, force: true });
  console.log("[release] Fresh application build and verified runtime capsules prepared. Publish will not rebuild.");
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  fs.closeSync(fd);
  fs.rmSync(lock);
}