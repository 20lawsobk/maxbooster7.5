import { execSync } from "child_process";
import { build as esBuild } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function main() {
  console.log("==> Building frontend with Vite...");
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
  console.log("   ✅ Vite build complete → dist/public/");

  console.log("==> Bundling server with esbuild → dist/index.cjs...");
  await esBuild({
    entryPoints: [path.resolve(root, "server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.resolve(root, "dist/index.cjs"),
    packages: "external",
    sourcemap: false,
    minify: false,
  });
  console.log("   ✅ Server bundle → dist/index.cjs");

  console.log("==> Bundling cluster entry with esbuild → dist/cluster.cjs...");
  await esBuild({
    entryPoints: [path.resolve(root, "server/cluster.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.resolve(root, "dist/cluster.cjs"),
    packages: "external",
    sourcemap: false,
    minify: false,
  });
  console.log("   ✅ Cluster bundle → dist/cluster.cjs");

  console.log("\n✅ Build complete.");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
