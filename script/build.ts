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

  if (!!process.env.DEPLOY_CLEAN) {
    await triggerGitHubWorkflows();

    const { execSync } = await import("child_process");

    // ── 1. Prune dev dependencies ─────────────────────────────────────────────
    // This is the single biggest win: shrinks node_modules from ~2.1 GB to ~700 MB.
    console.log('[deploy-clean] Pruning dev dependencies (npm prune --omit=dev)...');
    try {
      execSync('npm prune --omit=dev', { stdio: 'inherit' });
    } catch (e) {
      console.warn('[deploy-clean] npm prune failed (non-fatal):', e);
    }

    // ── 2. Source trees & build caches ────────────────────────────────────────
    console.log('[deploy-clean] Removing source trees and build caches...');
    await Promise.all([
      rm('client',          { recursive: true, force: true }),
      rm('server',          { recursive: true, force: true }),
      rm('shared',          { recursive: true, force: true }),
      rm('script',          { recursive: true, force: true }),
      rm('scripts',         { recursive: true, force: true }),
      rm('electron',        { recursive: true, force: true }),
      rm('attached_assets', { recursive: true, force: true }),
      rm('docs',            { recursive: true, force: true }),
      rm('.cache',          { recursive: true, force: true }),
      rm('logs',            { recursive: true, force: true }),
    ]).catch(() => {});

    // ── 3. Rust sidecar: keep only the release binary, drop everything else ───
    // boosterstate/target/debug/ alone is 140 MB of intermediate build artifacts.
    console.log('[deploy-clean] Removing Rust build artifacts (keeping release binary)...');
    await Promise.all([
      rm('boosterstate/target/debug',              { recursive: true, force: true }),
      rm('boosterstate/target/release/build',      { recursive: true, force: true }),
      rm('boosterstate/target/release/deps',       { recursive: true, force: true }),
      rm('boosterstate/target/release/examples',   { recursive: true, force: true }),
      rm('boosterstate/target/release/incremental',{ recursive: true, force: true }),
      rm('boosterstate/target/incremental',        { recursive: true, force: true }),
      rm('boosterstate/target/build',              { recursive: true, force: true }),
      rm('boosterstate/target/deps',               { recursive: true, force: true }),
      rm('boosterstate/target/tmp',                { recursive: true, force: true }),
    ]).catch(() => {});

    // ── 4. TensorFlow native binaries (postinstall downloads them regardless) ─
    console.log('[deploy-clean] Removing TF native libraries...');
    await Promise.all([
      rm('node_modules/@tensorflow/tfjs-node/deps',           { recursive: true, force: true }),
      rm('node_modules/@tensorflow/tfjs-node/binding',        { recursive: true, force: true }),
      rm('node_modules/@tensorflow/tfjs-backend-webgl',       { recursive: true, force: true }),
      rm('node_modules/@tensorflow/tfjs-node/dist/kernels',   { recursive: true, force: true }),
    ]).catch(() => {});

    // ── 5. TF.js browser UMD/ESM/FESM bundles (never used in Node.js) ────────
    console.log('[deploy-clean] Removing TF.js browser bundle variants...');
    try {
      execSync(
        `find node_modules/@tensorflow -type f ` +
        `\\( -name "tf.js" -o -name "tf.min.js" ` +
        `-o -name "tf.es2017.js" -o -name "tf.es2017.min.js" ` +
        `-o -name "tf.fesm.js" -o -name "tf.fesm.min.js" ` +
        `-o -name "*.umd.js" -o -name "*.fesm.js" ` +
        `-o -name "*.es2017.js" -o -name "*.min.js" \\) -delete 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    // ── 6. Electron & app-builder (dev-only, large binaries) ─────────────────
    console.log('[deploy-clean] Removing Electron / app-builder packages...');
    await Promise.all([
      rm('node_modules/electron',             { recursive: true, force: true }),
      rm('node_modules/electron-builder',     { recursive: true, force: true }),
      rm('node_modules/app-builder-bin',      { recursive: true, force: true }),
      rm('node_modules/app-builder-lib',      { recursive: true, force: true }),
      rm('node_modules/builder-util',         { recursive: true, force: true }),
      rm('node_modules/builder-util-runtime', { recursive: true, force: true }),
      rm('node_modules/electron-updater',     { recursive: true, force: true }),
      rm('node_modules/7zip-bin',             { recursive: true, force: true }),
    ]).catch(() => {});

    // ── 7. Sentry browser SDKs (server only needs @sentry/node) ──────────────
    console.log('[deploy-clean] Removing Sentry browser SDKs...');
    await Promise.all([
      rm('node_modules/@sentry/browser',                  { recursive: true, force: true }),
      rm('node_modules/@sentry/vue',                      { recursive: true, force: true }),
      rm('node_modules/@sentry/react',                    { recursive: true, force: true }),
      rm('node_modules/@sentry-internal/browser-utils',   { recursive: true, force: true }),
      rm('node_modules/@sentry-internal/replay',          { recursive: true, force: true }),
      rm('node_modules/@sentry-internal/replay-canvas',   { recursive: true, force: true }),
      rm('node_modules/@sentry-internal/feedback',        { recursive: true, force: true }),
    ]).catch(() => {});

    // ── 8. Source maps throughout node_modules (~200 MB) ─────────────────────
    console.log('[deploy-clean] Removing *.map source map files...');
    try {
      execSync(`find node_modules -name "*.map" -type f -delete 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' });
    } catch (_) {}

    // ── 9. TypeScript declaration files (build-time only) ────────────────────
    console.log('[deploy-clean] Removing *.d.ts TypeScript declaration files...');
    try {
      execSync(`find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' });
    } catch (_) {}

    // ── 10. Test suites bundled inside packages ───────────────────────────────
    console.log('[deploy-clean] Removing test directories inside node_modules...');
    try {
      execSync(
        `find node_modules -type d \\( -name "__tests__" -o -name "test" -o -name "tests" \\) ` +
        `-not -path "*/.bin/*" -exec rm -rf {} + 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    // ── 11. Docs, examples, fixtures inside packages ──────────────────────────
    console.log('[deploy-clean] Removing docs/examples/fixtures inside node_modules...');
    try {
      execSync(
        `find node_modules -maxdepth 3 -type d ` +
        `\\( -name "docs" -o -name "doc" -o -name "examples" -o -name "example" ` +
        `-o -name "tutorial" -o -name "tutorials" -o -name ".github" ` +
        `-o -name "benchmark" -o -name "benchmarks" -o -name "fixtures" \\) ` +
        `-exec rm -rf {} + 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    // ── 12. Changelog / readme files inside packages ──────────────────────────
    console.log('[deploy-clean] Removing changelog/readme files inside node_modules...');
    try {
      execSync(
        `find node_modules -maxdepth 3 -type f ` +
        `\\( -name "CHANGELOG.md" -o -name "CHANGELOG" -o -name "HISTORY.md" ` +
        `-o -name "CHANGES.md" -o -name "CONTRIBUTING.md" ` +
        `-o -name "AUTHORS" -o -name "NOTICE" -o -name "*.md" \\) ` +
        `-delete 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    // ── Summary ───────────────────────────────────────────────────────────────
    try {
      execSync(
        `echo "" && echo "==> Deployment image size summary:" && ` +
        `du -sh dist/ node_modules/ boosterstate/ 2>/dev/null | awk '{printf "   %-20s %s\\n", $2, $1}' && ` +
        `echo "   Total: $(du -sh --exclude=.git . 2>/dev/null | cut -f1)"`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    console.log('[deploy-clean] Deployment cleanup complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
