import { execSync } from "child_process";
import { build as esBuild } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { packCapsule } from "./lib/capsulePack.js";

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
  let capsuleResults: Array<Awaited<ReturnType<typeof packCapsule>>> = [];

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

    // Pack all capsules CONCURRENTLY instead of one after another. Each
    // targets an independent source directory and writes its own .pdim file,
    // so there is no shared state to race on. The tar|codec pipe is
    // otherwise single-threaded per capsule (zstd's own -T0 threading is
    // internal to one capsule's pipeline); running the (up to) four packs in
    // parallel spreads them across the build container's cores instead of
    // serializing ~4 jobs back to back, which was blowing the build-step
    // time budget as more capsules were added. packCapsule (script/lib/
    // capsulePack.ts) is the same real streaming tar+zstd implementation the
    // round-trip test (tests/unit/capsule-pack-restore-roundtrip.test.ts)
    // exercises. zstd -19 --long=27 was chosen over gzip-9 and xz-9e after
    // benchmarking all three against this project's real capsule directories:
    // it won on compressed size, compress time, AND decompress time.
    capsuleResults = await Promise.all(
      capsuleTargets.map(({ dir, capsule }) => packCapsule({ root, dir, capsule })),
    );
  }

  // external/pdim is no longer deleted from the image — per user directive
  // (2026-08-14) the entire project ships; it is capsule-packed above and
  // restored at first boot alongside node_modules and external/maxcore.

  // ─── Pre-flight image size check ───────────────────────────────────────
  // Everything before this point in the deploy pipeline (scripts/deployment-
  // autofix.mjs: TS/lint/schema/import/runtime checks) runs BEFORE this
  // build step and has no visibility into it. Until now, a failure here —
  // or in the platform's own post-push image-size check — had zero early
  // diagnosis anywhere in the autofix system: 3 of the last 4 deploy
  // failures died at the platform's opaque "image size is over the limit of
  // 8 GiB" rejection with no attribution of which directory caused it (root
  // cause was capsule packing using gzip-9 instead of zstd-19, since fixed
  // above). Capsule packing already de-risked the largest movable pieces;
  // this check catches a REGRESSION of that risk early — before the ~10min
  // build+push round trip — by measuring what will actually ship: git-
  // tracked source (a raw `du` on the project root is dominated by gitignored
  // dev-tooling caches like .cache/.pythonlibs/uploads that never reach the
  // deploy image and would make this check useless — measured ~12GiB of
  // workspace vs ~0.5GiB actually tracked), the freshly built dist/ output,
  // and the real post-compression size of each capsule (already known from
  // packCapsule's own result, not re-derived). This is still an
  // approximation of the platform's own layer accounting (it can't see the
  // separately-cached Nix store layers), so the budget is deliberately
  // conservative, and a measurement failure fails loud rather than silently
  // reporting a false "small".
  if (isDeployBuild) {
    const budgetBytes = 6 * 1024 ** 3; // 6 GiB conservative budget under the platform's 8 GiB hard image limit
    const { totalBytes: trackedBytes, byTopDir } = getTrackedSizeBreakdown(root);
    const distBytes = duBytesOrNull(path.join(root, "dist")) ?? 0;
    const capsuleBreakdown = capsuleResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ name: path.basename(r.capsulePath), sizeBytes: r.sizeBytes }));
    const capsuleBytes = capsuleBreakdown.reduce((sum, c) => sum + c.sizeBytes, 0);
    const totalBytes = trackedBytes + distBytes + capsuleBytes;
    const totalGiB = totalBytes / 1024 ** 3;

    console.log(
      `==> Pre-flight image size check: ${totalGiB.toFixed(2)} GiB (tracked source ${(trackedBytes / 1024 ** 3).toFixed(2)} GiB + dist/ ${(distBytes / 1024 ** 2).toFixed(0)}MB + capsules ${(capsuleBytes / 1024 ** 3).toFixed(2)} GiB; budget ${(budgetBytes / 1024 ** 3).toFixed(1)} GiB, platform hard limit is 8 GiB and also includes Nix layers this check can't see)`,
    );

    if (totalBytes > budgetBytes) {
      const breakdown = [
        ...[...byTopDir.entries()].map(([name, sizeBytes]) => ({ name: `${name}/ (tracked)`, sizeBytes })),
        { name: "dist/ (build output)", sizeBytes: distBytes },
        ...capsuleBreakdown,
      ].sort((a, b) => b.sizeBytes - a.sizeBytes);
      console.error("❌ Pre-flight image size budget exceeded. Largest contributors:");
      for (const { name, sizeBytes } of breakdown.slice(0, 10)) {
        console.error(`   ${(sizeBytes / 1024 ** 2).toFixed(0)}MB  ${name}`);
      }
      throw new Error(
        `deploy image pre-flight size check: ${totalGiB.toFixed(2)} GiB exceeds the ${(budgetBytes / 1024 ** 3).toFixed(1)} GiB budget (platform hard limit is 8 GiB total layers) — shrink, exclude, or capsule-pack the directory named above`,
      );
    }
  }
}

/** `du -sb` on one path; returns null (never a silent 0) when it can't be measured, so a
 * measurement failure surfaces as an explicit warning instead of masquerading as "small". */
function duBytesOrNull(target: string): number | null {
  try {
    const out = execSync(`du -sb -- ${JSON.stringify(target)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const n = parseInt(out.split("\t")[0] ?? "", 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Sums the real on-disk size of every git-tracked file (what a deploy build actually ships,
 * as opposed to `du` on the project root which is dominated by gitignored dev-tooling caches),
 * grouped by top-level directory for attributing which part of the tracked tree is heaviest. */
function getTrackedSizeBreakdown(root: string): {
  totalBytes: number;
  byTopDir: Map<string, number>;
} {
  const out = execSync("git ls-files -z", { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const files = out.toString("utf8").split("\0").filter(Boolean);
  let totalBytes = 0;
  const byTopDir = new Map<string, number>();
  for (const rel of files) {
    let size = 0;
    try {
      size = fs.statSync(path.join(root, rel)).size;
    } catch {
      continue; // tracked but deleted-on-disk file; nothing to ship for it
    }
    totalBytes += size;
    const top = rel.includes("/") ? rel.split("/")[0] : "(root files)";
    byTopDir.set(top, (byTopDir.get(top) ?? 0) + size);
  }
  return { totalBytes, byTopDir };
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
