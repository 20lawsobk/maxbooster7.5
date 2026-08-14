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
  if (isDeployBuild) {
    const capsuleTargets: Array<{ dir: string; capsule: string }> = [
      { dir: "node_modules", capsule: "node_modules.pdim" },
      { dir: "external/maxcore", capsule: "external_maxcore.pdim" },
      // 2026-08-14: user directive — the ENTIRE project must ship in the
      // deployment (external/pdim included), so it is packed as a capsule
      // rather than deleted from the image.
      { dir: "external/pdim", capsule: "external_pdim.pdim" },
    ];
    for (const { dir, capsule } of capsuleTargets) {
      const abs = path.resolve(root, dir);
      if (!fs.existsSync(abs)) continue;
      console.log(`\n==> Packing ${dir}/ → ${capsule} (gzip-9, Extract & Boot)...`);
      execSync(
        `tar -cf - ${JSON.stringify(dir)} | gzip -9 > ${JSON.stringify(capsule)}`,
        { cwd: root, stdio: "inherit", shell: "/bin/bash" },
      );
      const { createHash } = await import("crypto");
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
