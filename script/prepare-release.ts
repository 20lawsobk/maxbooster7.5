import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyProductionSimulationTree } from "../scripts/lib/production-simulation-copy.mjs";
import { inventory, sourceIncluded, assertInventory, buildEnvironmentDigest } from "./lib/releaseInventory.js";
import { runBuildProcess } from "./lib/buildProcess.js";
import { inspectArtifacts, inspectRestored } from "../scripts/verify-runtime-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".prepared-release");
const workParent = path.join(root, ".local/prepared-releases");
fs.mkdirSync(workParent, { recursive: true });
// One preparation at a time; retain failed runs rather than erasing evidence.
const lock = path.join(workParent, "preparing.lock");
const fd = fs.openSync(lock, "wx", 0o600);
fs.writeFileSync(fd, String(process.pid));
const work = fs.mkdtempSync(path.join(workParent, "release-"));
try {
  const source = await inventory(root, sourceIncluded);
  const stage = path.join(work, "build");
  fs.mkdirSync(stage);
  console.log(`[release] Isolated preparation: ${stage}`);
  // Verify actual allocatable space, not just statfs estimates. Keep the owned
  // probe bounded; a full copy/build will still fail explicitly if capacity runs out.
  const probe = path.join(work, "allocation-probe");
  // Copy + recovery snapshot + restored verification tree can coexist. Probe
  // their actual anticipated allocation rather than trusting quota-blind df.
  const inputsBytes = ["node_modules", "external", "python_runtime"].reduce((sum, relative) => {
    const value = execFileSync("du", ["-sb", path.join(root, relative)], { encoding: "utf8" });
    return sum + Number(value.split(/\s/)[0]);
  }, 0);
  const requiredBytes = Math.ceil(inputsBytes * 3.5 + 2 * 1024 ** 3);
  console.log(`[release] Probing ${(requiredBytes / 1024 ** 3).toFixed(1)} GiB of allocatable scratch capacity`);
  try { execFileSync("fallocate", ["-l", String(requiredBytes), probe], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch {
    throw new Error(`Release preparation requires ${(requiredBytes / 1024 ** 3).toFixed(1)} GiB of allocatable scratch capacity; the allocation probe failed. Existing releases and workspace files were not changed.`);
  }
  finally { fs.rmSync(probe, { force: true }); }
  const availableKB = Number(fs.readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(availableKB) || availableKB < 3 * 1024 ** 2) {
    throw new Error("Release preparation requires at least 3 GiB of currently available memory; stop competing work before retrying.");
  }
  copyProductionSimulationTree(root, stage);
  const modelSource = "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
  fs.mkdirSync(path.dirname(path.join(stage, modelSource)), { recursive: true });
  fs.copyFileSync(path.join(root, modelSource), path.join(stage, modelSource), fs.constants.COPYFILE_FICLONE);
  const env = { ...process.env };
  delete env.DEPLOY_PACK;
  delete env.PUBLISH_BUILD_ROOT;
  delete env.PUBLISH_PAYLOAD_CLEANUP;
  await runBuildProcess(process.execPath,
    ["script/lib/deploymentPackRecovery.mjs", "--publish-disposable-copy", "."], stage, env);
  const capsules = await inspectArtifacts(stage);
  if (!capsules.ready) throw new Error(capsules.failures.join("\n"));
  const payload = await inventory(stage);
  // Restore a separate copy for executable/syntax checks. Never run start.sh
  // with inherited credentials: that would contact the shared application DB.
  const check = path.join(work, "restore-check");
  fs.cpSync(stage, check, { recursive: true, dereference: false, mode: fs.constants.COPYFILE_FICLONE });
  await runBuildProcess(process.execPath, ["dist/pdim-restore.mjs", "all"], check,
    { PATH: process.env.PATH, MAXCORE_LOCAL: "1" });
  const restored = inspectRestored(check);
  if (!restored.ready) throw new Error(restored.failures.join("\n"));
  await runBuildProcess(path.join(check, ".node_bin/node"), ["--version"], check, { PATH: process.env.PATH });
  await runBuildProcess(path.join(check, "python_runtime/bin/python3"),
    ["-I", "-c", "import numpy,PIL,scipy,pydantic,torch,fastapi,uvicorn,psycopg2,librosa,sklearn,soundfile"], check, { PATH: process.env.PATH });
  assertInventory(source, await inventory(root, sourceIncluded), "Source during preparation");
  const candidate = path.join(work, "candidate");
  fs.mkdirSync(candidate);
  fs.renameSync(stage, path.join(candidate, "payload"));
  fs.writeFileSync(path.join(candidate, "release.json"), JSON.stringify({
    schemaVersion: 1, createdAt: new Date().toISOString(), source, payload,
    buildEnvironment: buildEnvironmentDigest(process.env),
    verification: { capsules: true, restoredArtifacts: true, runtimeImports: true, applicationReadiness: false },
  }, null, 2));
  if (fs.existsSync(destination)) fs.renameSync(destination, path.join(work, "previous-release"));
  fs.renameSync(candidate, destination);
  console.log("[release] Prepared and verified. Publishing will validate and install these exact artifacts, not rebuild.");
  console.log("[release] Full application readiness is checked on startup, not against the shared database during preparation.");
} finally {
  fs.closeSync(fd);
  fs.rmSync(lock);
}