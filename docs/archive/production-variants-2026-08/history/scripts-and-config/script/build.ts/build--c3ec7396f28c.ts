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

  // ─── App deployment capsule (Pocket Dimension engine) ─────────────────────
  // The actual deploy pipeline for this project is `npm run build` (this
  // script) + `bash start.sh` on Replit's native VM deployment target — NOT
  // build.sh/Dockerfile.prod (those back a separate, currently-unused
  // Docker-based path). The capsule step therefore has to live here too, or
  // a real Replit publish never produces one. Non-fatal: a capsule failure
  // must never block a deploy.
  const capsuleScript = path.resolve(root, "script/build-capsule.ts");
  if (fs.existsSync(capsuleScript)) {
    console.log(
      "\n==> App capsule: building portable Pocket Dimension snapshot of app source...",
    );
    const version =
      process.env.REPLIT_DEPLOYMENT_ID ||
      new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    try {
      execSync(
        `npx tsx ${JSON.stringify(capsuleScript)} ${JSON.stringify(version)}`,
        { cwd: root, stdio: "inherit" },
      );
      console.log("   ✅ App capsule built → deploy-capsule/");
    } catch (err) {
      console.warn(
        "   WARNING: app capsule build failed — deployment continues without it (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
