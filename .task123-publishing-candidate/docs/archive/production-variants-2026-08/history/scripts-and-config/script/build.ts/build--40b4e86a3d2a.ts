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
  // DISABLED from the automatic deploy build (2026-08-13): this project's
  // deployed image is already failing to publish with
  // "image size is over the limit of 8 GiB: total size of layers exceeds
  // limit" — confirmed happening even WITHOUT this step (a build before this
  // step existed already failed with the same error). Adding another
  // ~165-200MB of duplicated source into an image that's already over
  // budget only makes that worse, so this no longer runs automatically here.
  // Run `npx tsx script/build-capsule.ts [version]` manually if you need a
  // capsule — it still works standalone, just isn't part of the deploy build
  // until the image-size problem is resolved.

  // ─── Trim dead weight from the deployed image (2026-08-13) ────────────────
  // external/pdim is the vendored PDIM *engine source* — nothing at app
  // runtime imports it (only script/build-capsule.ts, which is disabled from
  // this build above). It's ~500MB of pure waste in an image that's already
  // exceeding the 8GB limit. Only remove it when running inside an actual
  // Replit deployment build (REPLIT_DEPLOYMENT_ID is set) — never in a local
  // dev `npm run build`, where deleting it would break capsule tooling.
  if (process.env.REPLIT_DEPLOYMENT_ID) {
    const pdimDir = path.resolve(root, "external/pdim");
    if (fs.existsSync(pdimDir)) {
      console.log(
        "\n==> Deploy build detected: removing external/pdim (unused vendored engine source, ~500MB) from the shipped image...",
      );
      fs.rmSync(pdimDir, { recursive: true, force: true });
      console.log("   ✅ external/pdim removed");
    }
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
