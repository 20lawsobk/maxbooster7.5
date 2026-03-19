import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, access, readdir, stat, writeFile } from "fs/promises";
import { brotliCompress, gzip, constants as zlibConstants } from "zlib";
import { promisify } from "util";
import { spawnSync } from "child_process";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

async function precompressAssets(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await precompressAssets(fullPath);
      return;
    }
    if (!/\.(js|css|svg|json|html|xml|txt)$/.test(entry.name)) return;
    if (/\.(br|gz)$/.test(entry.name)) return;
    const info = await stat(fullPath);
    if (info.size < 512) return;
    const src = await readFile(fullPath);
    await Promise.all([
      brotliCompressAsync(src, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })
        .then(buf => writeFile(`${fullPath}.br`, buf)),
      gzipAsync(src, { level: 9 })
        .then(buf => writeFile(`${fullPath}.gz`, buf)),
    ]);
  }));
}

// On VM deployment cold-start bundling gives no benefit — externalize everything.
// Keeping the allowlist empty ensures ALL dependencies are loaded from node_modules,
// which keeps dist/index.cjs small (only application code, no vendor code).
const allowlist: string[] = [];

// ── IMPORTANT: Runtime dependency classification ──────────────────────────────
// Because EVERY package is externalized (loaded from node_modules at runtime),
// any package imported by server code MUST be in "dependencies", NOT
// "devDependencies", or it will be deleted by `npm run prune:deploy` during the
// [deploy-clean] phase, crashing the production server.
//
// Packages currently in "dependencies" that are server-runtime critical:
//   @tensorflow/tfjs-node — server/workers/tfWorkerThread.ts, baseModelTrainer.ts
//   esbuild              — server/self-evolution-engine.ts (static top-level import)
//
// Packages safely left in "devDependencies" (never loaded in production):
//   vite    — only loaded inside `else` branch (NODE_ENV !== "production")
//   vitest  — only appears in a template string inside generateTestsForUpgrade()
//   All @radix-ui/*, react, framer-motion, etc. — bundled into dist/public by Vite
// ─────────────────────────────────────────────────────────────────────────────

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
  // DEPLOY_CLEAN=1 → production deployment build.
  // Always force a fresh Vite prebuild so the deployment image contains
  // up-to-date, correctly-hashed frontend assets regardless of whatever
  // stale dist/public/ files may have been committed to git.
  //
  // Dev builds (no DEPLOY_CLEAN): skip Vite when pre-built assets exist to
  // avoid a slow 30–60 s compile on every server-only code change.
  const isDeployBuild = !!process.env.DEPLOY_CLEAN;
  const assetsPrebuilt = !isDeployBuild &&
    await access("dist/public/index.html").then(() => true).catch(() => false);

  if (assetsPrebuilt) {
    console.log("pre-built client assets found — skipping Vite build (dev mode)");
    const files = await readdir("dist/public/assets");
    const needsCompress = files.some(f => /\.(js|css)$/.test(f) && !f.endsWith('.br'));
    if (needsCompress) {
      console.log("pre-compressing existing assets with brotli + gzip...");
      await precompressAssets("dist/public");
      console.log("pre-compression complete ✓");
    } else {
      console.log("pre-compressed assets already present ✓");
    }
  } else {
    await rm("dist", { recursive: true, force: true });
    if (isDeployBuild) {
      console.log("[prebuild] Compiling fresh frontend assets for deployment...");
    } else {
      console.log("building client...");
    }
    await viteBuild();
    console.log("pre-compressing assets with brotli + gzip...");
    await precompressAssets("dist/public");
    console.log("pre-compression complete ✓");
    if (isDeployBuild) {
      console.log("[prebuild] Frontend prebuild complete ✓");
    }
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

  // Skip server bundle rebuild when no source files have changed since last build.
  // `find -newer` lets the OS kernel do the mtime comparison — no per-file stat() calls.
  // Only applied in dev (non-deploy) mode; deployment always rebuilds fresh.
  const serverBundleExists = !isDeployBuild &&
    await access("dist/index.cjs").then(() => true).catch(() => false);

  const needsServerRebuild = !serverBundleExists || isDeployBuild || (() => {
    const changed = spawnSync(
      'find', ['server', 'shared', '-name', '*.ts', '-newer', 'dist/index.cjs'],
      { encoding: 'utf8' }
    );
    return (changed.stdout?.trim() ?? '').length > 0;
  })();

  if (!needsServerRebuild) {
    console.log("server bundle up-to-date — skipping esbuild (no source changes detected)");
  } else {
    await rm("dist/index.cjs", { force: true });
    await rm("dist/cluster.cjs", { force: true });

    console.log("building server...");
    const pkg = JSON.parse(await readFile("package.json", "utf-8"));
    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];

    const externals = [
      ...allDeps.filter((dep) => !allowlist.includes(dep)),
      ...forceExternal,
    ];

    const uniqueExternals = [...new Set(externals)];

    console.log(`Externalizing ${uniqueExternals.length} packages to reduce bundle size`);

    const sharedBuildConfig = {
      platform: "node" as const,
      bundle: true,
      format: "cjs" as const,
      define: {
        "process.env.NODE_ENV": '"production"',
        "import.meta.url": "__importMetaUrl__",
      },
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
      // TF worker thread: runs inside worker_threads — must be a standalone file.
      // The cluster primary deletes server/ in deploy-clean, so this must land in dist/.
      esbuild({
        ...sharedBuildConfig,
        entryPoints: ["server/workers/tfWorkerThread.ts"],
        outfile: "dist/workers/tfWorkerThread.cjs",
      }),
    ]);
  }

  // dist/index.js — ESM entry point for `node dist/index.js` (deployment run command).
  // package.json has "type":"module" so .js = ESM; ESM can import CJS with no extra config.
  await writeFile("dist/index.js", "import './cluster.cjs';\n");
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
    // Flags are defined in the "prune:deploy" script in package.json — edit there,
    // not here — so there is a single canonical source of truth for prune behaviour.
    console.log('[deploy-clean] Pruning dev dependencies...');
    try {
      execSync('npm run prune:deploy', { stdio: 'inherit' });
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
    // Safe to delete unconditionally: Node.js never require()s .d.ts files.
    // They are only consumed by the TypeScript compiler, which already ran.
    console.log('[deploy-clean] Removing *.d.ts TypeScript declaration files...');
    try {
      execSync(`find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' });
    } catch (_) {}

    // ── 10 & 11. node_modules directory sweeps — intentionally minimal ─────────
    // Only __tests__ (Jest/Vitest double-underscore convention) is safe to remove
    // unconditionally.  Packages never export runtime code from __tests__/.
    //
    // "test", "tests", "scripts", "doc", "docs", "examples", "fixtures" etc.
    // are intentionally excluded: many packages store required runtime JS
    // inside those directories.  Real-world breakage examples:
    //   • exceljs/lib/doc/workbook.js  — required at runtime by exceljs
    //   • wavefile/scripts/polyfills.js — required by wavefile at runtime
    // Disk savings from those sweeps is < 10 MB total — not worth the risk.
    console.log('[deploy-clean] Removing __tests__ directories inside node_modules...');
    try {
      execSync(
        `find node_modules -type d -name "__tests__" ` +
        `-not -path "*/.bin/*" -exec rm -rf {} + 2>/dev/null || true`,
        { stdio: 'inherit', shell: '/bin/bash' }
      );
    } catch (_) {}

    // ── 12. Changelog / readme files inside packages ──────────────────────────
    // Only delete files that Node.js can never require() at runtime.
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

    // ── 13. Python .pythonlibs — do NOT strip ────────────────────────────────
    // All Python packages (tensorboard, sympy, tensorflow_io, etc.) are required
    // for production functionality (AI inference, audio processing, etc.).

    // ── Summary ───────────────────────────────────────────────────────────────
    try {
      execSync(
        `echo "" && echo "==> Deployment image size summary:" && ` +
        `du -sh dist/ node_modules/ boosterstate/ .pythonlibs/ 2>/dev/null | awk '{printf "   %-20s %s\\n", $2, $1}' && ` +
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
