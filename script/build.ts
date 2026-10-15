import { execSync } from "child_process";
import { buildServerBundles } from "./lib/serverBundles.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { publishCapsule } from "./publish-capsules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function main() {
  // Ordinary web builds must not mutate or download dependencies for the
  // independent MaxCore/PDIM workspaces. Their frozen installs are needed for
  // packed Replit deployments, or when an operator explicitly requests them.
  if (isDeployBuild || process.env.SYNC_SUBSYSTEM_DEPENDENCIES === "1") {
    console.log("==> Synchronizing locked MaxCore/PDIM dependencies...");
    execSync("bash script/sync-subsystem-dependencies.sh", {
      cwd: root,
      stdio: "inherit",
      shell: "/bin/bash",
    });
  } else {
    console.log(
      "==> Skipping independent subsystem installs (set SYNC_SUBSYSTEM_DEPENDENCIES=1 to opt in)",
    );
  }

  console.log("==> Building frontend with Vite...");
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
  console.log("   ✅ Vite build complete → dist/public/");

  console.log("==> Bundling all runtime entries (server, cluster, gateway, sizing, recovery)...");
  await buildServerBundles(root);
  console.log("   ✅ All runtime entry bundles built from current source");

  console.log("\n✅ Build complete.");

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
      // Non-fatal: production degrades to "Python features disabled" exactly
      // as before this step existed. Never fail the publish over it.
      console.warn(
        `   WARNING: portable Python runtime build failed (${(e as Error).message}) — video/audio analysis will be disabled in production`,
      );
      fs.rmSync(pyDir, { recursive: true, force: true });
    }
  }

  if (isDeployBuild) {
    const capsuleTargets: Array<{ dir: string; capsule: string }> = [
      // Python features are explicitly optional in production. If the
      // portable runtime could not be prepared, do not turn that documented
      // degradation into a later missing-directory capsule failure.
      ...(fs.existsSync(path.join(root, "python_runtime"))
        ? [{ dir: "python_runtime", capsule: "python_runtime.pdim" }]
        : []),
      { dir: "node_modules", capsule: "node_modules.pdim" },
      { dir: "external/maxcore", capsule: "external_maxcore.pdim" },
      // Ship the full PDIM subsystem as a capsule, without expanding it into
      // the deployment image.
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

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
