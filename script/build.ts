import { execSync, execFileSync } from "child_process";
import { buildServerBundles } from "./lib/serverBundles.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { publishCapsule } from "./publish-capsules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Measure literal paths without shell interpolation. Unreadable paths stay unknown. */
export function duBytesOrNull(target: string): number | null {
  try {
    const output = execFileSync("du", ["-s", "--apparent-size", "--count-links", "--block-size=1", "--", target],
      { encoding: "utf8", timeout: 30_000 });
    const bytes = Number(output.match(/^\d+/)?.[0]);
    return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
  } catch { return null; }
}

/** Conservatively count the entire shipped store, including unreferenced paths. */
export function getNixClosureSize() {
  const store = "/nix/store";
  if (!fs.existsSync(store)) return { roots: [] as string[], coveredRoots: [] as string[], totalBytes: 0 };
  const roots = fs.readdirSync(store).map(name => path.join(store, name));
  const totalBytes = duBytesOrNull(store);
  if (totalBytes === null) throw new Error("Cannot measure the publishing Nix store; image size is unknown");
  return { roots, coveredRoots: [...roots], totalBytes };
}

async function main() {
  fs.rmSync(path.join(root, "dist/build-complete.json"), { force: true });
  const { writeBuildContract, readBuildInputs } = await import("../scripts/start-production.mjs");
  const inputs = readBuildInputs(root);
  execSync("bash script/sync-subsystem-dependencies.sh", {
    cwd: root,
    stdio: "inherit",
    shell: "/bin/bash",
  });
  console.log("==> Building embedded MaxCore production API (no desktop/dashboard packaging)...");
  execSync(`${JSON.stringify(process.execPath)} --import tsx build.ts`, {
    cwd: path.join(root, "external/maxcore/artifacts/api-server"),
    stdio: "inherit",
  });
  console.log("==> Building frontend with Vite...");
  execSync("node node_modules/vite/bin/vite.js build", { cwd: root, stdio: "inherit" });
  console.log("   ✅ Vite build complete → dist/public/");

  console.log("==> Bundling all runtime entries (server, cluster, gateway, sizing, recovery)...");
  await buildServerBundles(root);
  writeBuildContract(root, inputs);
  console.log("   ✅ All runtime entry bundles built from current source");

  console.log("\n✅ Build complete.");
  // Packing/removal and runtime provisioning belong to the explicit publishing
  // pipeline. A normal npm build must never download or delete runtime trees.
  if (process.env.DEPLOY_PACK !== "1") return;

  // ─── Extract & Boot capsules (Pocket Dimension) ────────────────────────────
  // RESTORED 2026-08-14. The old build.sh pipeline packed node_modules (and
  // the Python runtime) into compressed .pdim capsules, deleted the originals
  // from the image, and start.sh re-extracts them on first boot via
  // dist/pdim-restore.mjs. That is how this app previously published under
  // the 8 GiB image limit (the limit applies to the IMAGE; extraction onto
  // the VM's disk at boot is fine — proven by successful Jun/Jul/Aug
  // publishes). When the deploy build moved from build.sh to this script the
  // packing step was lost, so images shipped full uncompressed node_modules
  // and blew the limit. This section reconnects it.
  // Gate: DEPLOY_PACK=1 is set explicitly by the .replit deployment build
  // command. (REPLIT_DEPLOYMENT_ID is only set at RUNTIME, not in the build
  // container — gating on it silently skipped packing; proven by the
  // 2026-08-14 04:08 build log which had no "Packing" lines.)
  const isDeployBuild =
    process.env.PUBLISH_SHELL_PACKS_CAPSULES !== "1" &&
    (process.env.DEPLOY_PACK === "1" || !!process.env.REPLIT_DEPLOYMENT_ID);

  // ─── Portable Python runtime (video/audio analysis + AI sidecar deps) ─────
  // Ported from the old build.sh (2026-08-14). The run container is a
  // Debian-based VM; Nix-store Python paths from the build container don't
  // exist there, and .pythonlibs/.venv are dockerignored. We download
  // python-build-standalone (glibc-linked, works in both containers), install
  // the deps pyproject.toml documents, and pack it as python_runtime.pdim —
  // dist/pdim-restore.mjs already restores it and start.sh/pythonPath.ts
  // already prefer ./python_runtime/bin/python3.
  if (isDeployBuild) {
    const pyDir = path.resolve(root, "python_runtime");
    const pyBin = path.join(pyDir, "bin", "python3");
    const PYVER = "3.12.13";
    const PYDATE = "20260325";
    const PYURL = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYDATE}/cpython-${PYVER}%2B${PYDATE}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
    try {
      if (!fs.existsSync(pyBin)) {
        console.log(`\n==> Downloading portable Python ${PYVER} (x86_64-linux-gnu)...`);
        fs.mkdirSync(pyDir, { recursive: true });
        execSync(
          `set -o pipefail; curl -fSL --retry 2 --connect-timeout 15 --max-time 180 ${JSON.stringify(PYURL)} | tar xz --strip-components=1 -C ${JSON.stringify(pyDir)} python/`,
          { cwd: root, stdio: "inherit", shell: "/bin/bash" },
        );
      }
      execSync(`${JSON.stringify(pyBin)} --version`, { stdio: "inherit" });
      console.log("   Installing Python deps (numpy, pillow, scipy, fastapi, uvicorn, pydantic)...");
      execSync(
        `${JSON.stringify(pyBin)} -I -m pip install --no-cache-dir --quiet numpy pillow "scipy>=1.11.0" "fastapi>=0.100.0" "uvicorn[standard]>=0.23.0" "pydantic>=2.0.0" "urllib3>=2.8.0,<3" "fsspec>=2026.6.0"`,
        { cwd: root, stdio: "inherit", shell: "/bin/bash" },
      );
      execSync(
        `${JSON.stringify(pyBin)} -I -c "import numpy, PIL, scipy, fastapi, uvicorn, pydantic, urllib3, fsspec; assert tuple(map(int, urllib3.__version__.split('.'))) >= (2,8,0); assert tuple(map(int, fsspec.__version__.split('.'))) >= (2026,6,0)"`,
        { stdio: "inherit", shell: "/bin/bash" },
      );
      console.log("   ✅ Portable Python runtime ready → python_runtime/");
    } catch (e) {
      // Local MaxCore/Digital GPU is required. Do not silently package a
      // degraded release, or delete an existing runtime after a failed install.
      throw new Error("Required portable Python runtime provisioning failed; existing runtime preserved", { cause: e });
    }
  }

  if (isDeployBuild) {
    const capsuleTargets: Array<{ dir: string; capsule: string }> = [
      { dir: "python_runtime", capsule: "python_runtime.pdim" },
      { dir: "node_modules", capsule: "node_modules.pdim" },
      { dir: "external/maxcore", capsule: "external_maxcore.pdim" },
      // 2026-08-14: user directive — the ENTIRE project must ship in the
      // deployment (external/pdim included), so it is packed as a capsule
      // rather than deleted from the image.
      { dir: "external/pdim", capsule: "external_pdim.pdim" },
    ];
    // Same packer as the historical shell path; one bounded job at a time.
    for (const { dir, capsule } of capsuleTargets) {
      await publishCapsule(root, "directory", capsule, [dir]);
    }
  }

  // external/pdim is no longer deleted from the image — per user directive
  // (2026-08-14) the entire project ships; it is capsule-packed above and
  // restored at first boot alongside node_modules and external/maxcore.
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => {
  // Later provisioning/packing can fail after compilation created the marker.
  // Never allow startup to accept artifacts from a failed build invocation.
  fs.rmSync(path.join(root, "dist/build-complete.json"), { force: true });
  console.error("Build failed:", err);
  process.exit(1);
});
