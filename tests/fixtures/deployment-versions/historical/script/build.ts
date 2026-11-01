import { execSync } from "child_process";
import { build as esBuild } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function main() {
  console.log("==> Building frontend with Vite...");
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
  console.log("   ✅ Vite build complete → dist/public/");

  console.log("==> Bundling server with esbuild → dist/index.mjs...");
  await esBuild({
    entryPoints: [path.resolve(root, "server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: path.resolve(root, "dist/index.mjs"),
    packages: "external",
    sourcemap: false,
    minify: false,
  });
  console.log("   ✅ Server bundle → dist/index.mjs");

  console.log("==> Bundling cluster entry with esbuild → dist/cluster.mjs...");
  await esBuild({
    entryPoints: [path.resolve(root, "server/cluster.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: path.resolve(root, "dist/cluster.mjs"),
    packages: "external",
    sourcemap: false,
    minify: false,
  });
  console.log("   ✅ Cluster bundle → dist/cluster.mjs");

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
    process.env.DEPLOY_PACK === "1" || !!process.env.REPLIT_DEPLOYMENT_ID;

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
          `curl -sL --max-time 180 ${JSON.stringify(PYURL)} | tar xz --strip-components=1 -C ${JSON.stringify(pyDir)} python/`,
          { cwd: root, stdio: "inherit", shell: "/bin/bash" },
        );
      }
      execSync(`${JSON.stringify(pyBin)} --version`, { stdio: "inherit" });
      console.log("   Installing Python deps (numpy, pillow, scipy, fastapi, uvicorn, pydantic)...");
      execSync(
        `${JSON.stringify(pyBin)} -m pip install --no-cache-dir --quiet numpy pillow "scipy>=1.11.0" "fastapi>=0.100.0" "uvicorn[standard]>=0.23.0" "pydantic>=2.0.0"`,
        { cwd: root, stdio: "inherit", shell: "/bin/bash" },
      );
      execSync(
        `${JSON.stringify(pyBin)} -c "import numpy, PIL, scipy, fastapi, uvicorn, pydantic"`,
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
      { dir: "python_runtime", capsule: "python_runtime.pdim" },
      { dir: "node_modules", capsule: "node_modules.pdim" },
      { dir: "external/maxcore", capsule: "external_maxcore.pdim" },
      // 2026-08-14: user directive — the ENTIRE project must ship in the
      // deployment (external/pdim included), so it is packed as a capsule
      // rather than deleted from the image.
      { dir: "external/pdim", capsule: "external_pdim.pdim" },
    ];
    const { createHash } = await import("crypto");
    const { spawn } = await import("child_process");

    // Pack all capsules CONCURRENTLY instead of one after another. Each
    // targets an independent source directory and writes its own .pdim file,
    // so there is no shared state to race on. `tar | gzip -9` is otherwise
    // single-threaded per capsule; running the (up to) four packs in parallel
    // spreads them across the build container's cores instead of serializing
    // ~4 single-core jobs back to back, which was blowing the build-step time
    // budget as more capsules were added.
    const packOne = ({ dir, capsule }: { dir: string; capsule: string }) =>
      new Promise<void>((resolveOne, rejectOne) => {
        const abs = path.resolve(root, dir);
        if (!fs.existsSync(abs)) return resolveOne();
        console.log(`==> Packing ${dir}/ → ${capsule} (gzip-9, Extract & Boot)...`);
        const child = spawn(
          "bash",
          ["-c", `tar -cf - ${JSON.stringify(dir)} | gzip -9 > ${JSON.stringify(capsule)}`],
          { cwd: root, stdio: "inherit" },
        );
        child.on("error", rejectOne);
        child.on("exit", (code) => {
          if (code !== 0) return rejectOne(new Error(`packing ${dir} exited with code ${code}`));
          const sha256 = createHash("sha256")
            .update(fs.readFileSync(path.resolve(root, capsule)))
            .digest("hex");
          fs.writeFileSync(
            path.resolve(root, capsule.replace(/\.pdim$/, ".manifest.json")),
            JSON.stringify({ compression: "gzip-9", sha256, dir }, null, 2),
          );
          fs.rmSync(abs, { recursive: true, force: true });
          const sizeMB = (fs.statSync(path.resolve(root, capsule)).size / 1048576).toFixed(0);
          console.log(`   ✅ ${dir}/ packed (${sizeMB}MB) and removed from image`);
          resolveOne();
        });
      });

    await Promise.all(capsuleTargets.map(packOne));
  }

  // external/pdim is no longer deleted from the image — per user directive
  // (2026-08-14) the entire project ships; it is capsule-packed above and
  // restored at first boot alongside node_modules and external/maxcore.
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
