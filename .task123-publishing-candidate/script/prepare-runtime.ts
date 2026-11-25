import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPortableNode } from "./lib/portableNode.js";
import { runPortablePython } from "./lib/portablePython.mjs";
import { assertPublishingCleanupExpectation } from "./lib/publishingPayload.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function preparePython(root: string, sourceRoot = root) {
  const pyDir = path.join(root, "python_runtime");
  const pyBin = path.join(pyDir, "bin/python3");
  const version = "3.12.13", date = "20260325";
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${date}/cpython-${version}%2B${date}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
  try {
    // Never reuse an unverified workspace interpreter or stale dependency tree.
    fs.rmSync(pyDir, { recursive: true, force: true });
    fs.mkdirSync(pyDir, { recursive: true });
    console.log(`==> Downloading portable Python ${version}...`);
    execSync(`set -o pipefail; curl -fsSL --max-time 180 ${JSON.stringify(url)} | tar xz --strip-components=1 -C ${JSON.stringify(pyDir)} python/`,
      { cwd: root, stdio: "inherit", shell: "/bin/bash" });
    runPortablePython(pyBin, ["--version"], { stdio: "inherit" });
    const verifier = path.join(sourceRoot, "script/lib/verifyPortablePython.py");
    runPortablePython(pyBin, [verifier, pyDir], { stdio: "inherit" });
    const requirements = path.join(pyDir, "requirements.lock");
    runPortablePython(pyBin, [path.join(sourceRoot, "script/lib/pythonRequirements.py"),
      path.join(sourceRoot, "external/maxcore/artifacts/ai-training-server/uv.lock"), requirements], { stdio: "inherit" });
    runPortablePython(pyBin, ["-m", "pip", "install", "--require-hashes", "--only-binary=:all:", "--no-cache-dir", "-r", requirements],
      { cwd: root, stdio: "inherit" });
    runPortablePython(pyBin, [verifier, pyDir, "--runtime"], { stdio: "inherit" });
    console.log("==> Verified portable Python runtime ready");
  } catch (cause) {
    fs.rmSync(pyDir, { recursive: true, force: true });
    throw new Error("Required portable Python runtime build failed", { cause });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
assertPublishingCleanupExpectation(process.env, root);
if (process.env.DEPLOY_PACK !== "1" || process.cwd() !== root) {
  throw new Error("Runtime preparation requires a deployment build in its own root");
}
if (process.argv[2] === "python") preparePython(root);
else if (process.argv[2] === "native") {
  buildPortableNode(root);
  execFileSync("bash", ["scripts/build-boosterstate.sh"], { cwd: root, stdio: "inherit" });
} else throw new Error("Expected runtime preparation phase: python or native");
}