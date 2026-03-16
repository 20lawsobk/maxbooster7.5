import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, access } from "fs/promises";

// On VM deployment cold-start bundling gives no benefit — externalize everything.
// Keeping the allowlist empty ensures ALL dependencies are loaded from node_modules,
// which keeps dist/index.cjs small (only application code, no vendor code).
const allowlist: string[] = [];

// Explicit force-external list as a safety net (catches scoped packages that
// the allDeps filter might miss if they appear as transitive imports).
const forceExternal = [
  // TensorFlow — already externalized by allDeps, but belt-and-suspenders
  "@tensorflow/tfjs",
  "@tensorflow/tfjs-node",
  // Framework / ORM
  "express",
  "express-rate-limit",
  "express-session",
  "drizzle-orm",
  "drizzle-zod",
  // Auth
  "passport",
  "passport-local",
  "jsonwebtoken",
  "otplib",
  "@otplib/core",
  "@otplib/hotp",
  "@otplib/totp",
  "@otplib/uri",
  "@otplib/plugin-base32-scure",
  "@otplib/plugin-crypto-noble",
  "openid-client",
  "bcrypt",
  // HTTP / networking
  "axios",
  "cors",
  "helmet",
  // DB / cache / queue
  "pg",
  "ioredis",
  "redis",
  "bullmq",
  "connect-pg-simple",
  "connect-redis",
  "memorystore",
  "@neondatabase/serverless",
  // Storage / media
  "sharp",
  "multer",
  "archiver",
  "music-metadata",
  "node-wav",
  "wavefile",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "@replit/object-storage",
  // Third-party services
  "stripe",
  "@sendgrid/mail",
  "googleapis",
  "twitter-api-v2",
  // Observability
  "@sentry/node",
  "@sentry/profiling-node",
  "prom-client",
  // Utilities (large)
  "date-fns",
  "zod",
  "zod-validation-error",
  "nanoid",
];

async function buildAll() {
  // Skip Vite if pre-built frontend assets are already committed to the repo.
  const assetsPrebuilt = await access("dist/public/index.html").then(() => true).catch(() => false);

  if (assetsPrebuilt) {
    console.log("pre-built client assets found — skipping Vite build");
  } else {
    await rm("dist", { recursive: true, force: true });
    console.log("building client...");
    await viteBuild();
  }

  // Skip Rust build if: explicitly disabled, running in any Replit environment
  // (REPL_SLUG or REPLIT_DEPLOYMENT), or if the release binary already exists
  // (meaning build.sh already compiled it). This prevents a slow/unnecessary
  // debug-mode cargo build from running inside the deployment build container.
  const releaseExists = await access("boosterstate/target/release/boosterstate").then(() => true).catch(() => false);
  const skipRust =
    process.env.SKIP_BOOSTERSTATE === '1' ||
    !!process.env.REPL_SLUG ||
    !!process.env.REPLIT_DEPLOYMENT ||
    releaseExists;
  if (skipRust) {
    if (releaseExists) {
      console.log("skipping boosterstate build — release binary already present (built by build.sh)");
    } else {
      console.log("skipping boosterstate build (SKIP_BOOSTERSTATE=1 or Replit environment)");
    }
  } else {
    const binaryExists = await access("boosterstate/target/release/boosterstate").then(() => true).catch(() => false);
    if (!binaryExists) {
      console.log("boosterstate release binary not found — building with cargo --release...");
      const { execSync } = await import("child_process");
      execSync("cargo build --release --manifest-path boosterstate/Cargo.toml", { stdio: "inherit" });
      console.log("boosterstate release binary built");
    } else {
      console.log("pre-built boosterstate release binary found — skipping cargo build");
    }
  }

  await rm("dist/index.cjs", { force: true });
  await rm("dist/cluster.cjs", { force: true });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  
  // Externalize everything not in allowlist, plus force-external heavy packages
  const externals = [
    ...allDeps.filter((dep) => !allowlist.includes(dep)),
    ...forceExternal,
  ];
  
  // Dedupe the externals list
  const uniqueExternals = [...new Set(externals)];

  console.log(`Externalizing ${uniqueExternals.length} packages to reduce bundle size`);

  const sharedBuildConfig = {
    platform: "node" as const,
    bundle: true,
    format: "cjs" as const,
    define: {
      "process.env.NODE_ENV": '"production"',
      // Replace import.meta.url with a CJS-compatible variable so esbuild
      // stops emitting "import.meta is not available with cjs" warnings.
      "import.meta.url": "__importMetaUrl__",
    },
    // Banner runs before any bundled code — defines the CJS equivalent of
    // import.meta.url so every file in the bundle resolves it correctly.
    banner: {
      js: `const __importMetaUrl__ = require("url").pathToFileURL(__filename).href;`,
    },
    minify: true,
    minifySyntax: true,
    external: uniqueExternals,
    logLevel: "info" as const,
    treeShaking: true,
    legalComments: "none" as const,
    drop: ["debugger"] as ("debugger" | "console")[],
  };

  await Promise.all([
    esbuild({
      ...sharedBuildConfig,
      entryPoints: ["server/index.ts"],
      outfile: "dist/index.cjs",
    }),
    esbuild({
      ...sharedBuildConfig,
      entryPoints: ["server/cluster.ts"],
      outfile: "dist/cluster.cjs",
    }),
  ]);
}

async function triggerGitHubWorkflows() {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO || 'blawzmusic/max-booster';

  if (!pat) {
    console.log('GITHUB_PAT not set — skipping desktop/mobile build triggers.');
    return;
  }

  const workflows = [
    { file: 'build-desktop.yml', label: 'Desktop (Windows / macOS / Linux)' },
    { file: 'build-mobile.yml',  label: 'Mobile (Android / iOS)' },
  ];

  console.log('Triggering desktop & mobile builds on GitHub Actions...');
  await Promise.all(
    workflows.map(async ({ file, label }) => {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${file}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      if (res.ok || res.status === 204) {
        console.log(`  ✅ ${label}`);
      } else {
        const body = await res.text().catch(() => '');
        console.error(`  ❌ ${label} — HTTP ${res.status}: ${body}`);
      }
    })
  );
}

async function main() {
  await buildAll();

  if (process.env.REPLIT_DEPLOYMENT === '1') {
    await triggerGitHubWorkflows();

    // Clean up unnecessary files to reduce deployment image size
    console.log('Cleaning up build artifacts...');
    await Promise.all([
      rm('script', { recursive: true, force: true }),
      rm('client/src', { recursive: true, force: true }),
      rm('server', { recursive: true, force: true }),
      rm('.cache', { recursive: true, force: true }),
      rm('logs', { recursive: true, force: true }),
    ]).catch(() => {});
    console.log('Cleanup complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
