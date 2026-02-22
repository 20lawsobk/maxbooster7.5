import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, access } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times - keep this list small!
const allowlist = [
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "nanoid",
  "otplib",
  "@otplib/core",
  "@otplib/hotp",
  "@otplib/totp",
  "@otplib/uri",
  "@otplib/plugin-base32-scure",
  "@otplib/plugin-crypto-noble",
  "passport",
  "passport-local",
  "zod",
  "zod-validation-error",
];

// Heavy native/large packages that must ALWAYS be external
// These cause bundle size bloat and initialization timeouts
const forceExternal = [
  "@tensorflow/tfjs",
  "@tensorflow/tfjs-node",
  "sharp",
  "bcrypt",
  "pg",
  "ioredis",
  "redis",
  "bullmq",
  "stripe",
  "multer",
  "archiver",
  "@neondatabase/serverless",
  "@sendgrid/mail",
  "googleapis",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "@replit/object-storage",
  "connect-pg-simple",
  "music-metadata",
  "node-wav",
  "wavefile",
  "twitter-api-v2",
  "openid-client",
  "helmet",
];

async function buildAll() {
  // Check if pre-built frontend assets are already committed to the repo.
  // If so, skip the expensive Vite build so the deployment VM only has to
  // compile Rust + the fast esbuild server bundle — no memory competition.
  const assetsPrebuilt = await access("dist/public/index.html").then(() => true).catch(() => false);

  if (assetsPrebuilt) {
    console.log("pre-built client assets found — skipping Vite build");
  } else {
    await rm("dist", { recursive: true, force: true });
    console.log("building client...");
    await viteBuild();
  }

  // Only remove the server bundle, preserving any committed frontend assets
  await rm("dist/index.cjs", { force: true });

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

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: uniqueExternals,
    logLevel: "info",
    treeShaking: true,
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
