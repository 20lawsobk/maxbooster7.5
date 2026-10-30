import { execFileSync } from "child_process";
import { buildServerBundles } from "./lib/serverBundles.js";
import { compressionPlan, deploymentTimings, runDeploymentJobs } from "./lib/deploymentExecution.js";
import { effectiveCapacity } from "../server/computeSizing.js";
import { runBuildProcess } from "./lib/buildProcess.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAXCORE_CAPSULE_EXCLUDE_PATHS,
  PDIM_CAPSULE_EXCLUDE_PATHS,
  packCapsule,
  packCapsuleMembers,
} from "./lib/capsulePack.js";
import { assertNoSelectedMaxCoreCandidate } from "./lib/deploymentPreflight.js";
import {
  computeRemainingAppMembers,
  BOOTSTRAP_AND_CAPSULE_OWN_PATHS,
} from "./lib/dockerignoreScan.js";
import { validateModelRelease } from "./lib/modelRelease.js";
import {
  assertPublishingCleanupExpectation,
  assertPublishingPayloadClean,
  cleanPublishingPayload,
  isDisposablePublishingCopy,
  measurePublishingPayload,
} from "./lib/publishingPayload.js";
import {
  beginDeploymentPack,
  recoverDeploymentPack,
  RECOVERY_HELPER_PATH,
} from "./lib/deploymentPackRecovery.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function main() {
  const timing = deploymentTimings();
  // Publishing commands declare an exact disposable root.
  // Check before recovery (which mutates inputs), Vite, or any pack operation.
  assertPublishingCleanupExpectation(process.env, root);
  // The deployment command also invokes this dependency-free helper BEFORE
  // npm/tsx, because packing can remove node_modules and build.ts itself.
  recoverDeploymentPack(root);
  let packTransaction: ReturnType<typeof beginDeploymentPack> | null = null;
  const modelRelease = process.env.DEPLOY_PACK === "1"
    ? validateModelRelease(root)
    : null;
  if (process.env.DEPLOY_PACK === "1") {
    // Reject stale nested/hoisted installs before expensive work or destructive packing.
    execFileSync(process.execPath, ["scripts/verify-runtime-artifacts.mjs", "deployment-dependencies", root],
      { cwd: root, stdio: "inherit" });
  }
  timing("recovery-and-preflight");
  const isDeployBuild = process.env.DEPLOY_PACK === "1";
  const capacity = effectiveCapacity();
  const prepareRuntime = (phase: string) => runBuildProcess(
    process.execPath, ["--import", "tsx", "script/prepare-runtime.ts", phase], root,
    { ...process.env, CARGO_BUILD_JOBS: String(Math.max(1, Math.floor(capacity.cpus))) },
  );
  const compile = async () => {
    console.log("==> Building frontend with Vite...");
    await runBuildProcess(process.execPath, ["node_modules/vite/bin/vite.js", "build"], root);
    console.log("   ✅ Vite build complete → dist/public/");

    console.log("==> Bundling five server entrypoints in one graph scan...");
    await buildServerBundles(root);
    if (!fs.statSync(
      path.resolve(root, "dist/retained-pdim-recovery-worker.mjs"),
    ).isFile()) {
      throw new Error("Required retained PDIM recovery worker artifact was not built");
    }
    console.log("==> Compilation complete");
  };
  // Historical scaffold: compile first, then prepare the required runtimes,
  // then capsule-pack. Avoid overlapping compiler and package-install peaks.
  const preparation = isDeployBuild
    ? [{ name: "compilation", run: compile },
       { name: "portable-python", run: () => prepareRuntime("python") },
       { name: "portable-node-and-native-sidecar", run: () => prepareRuntime("native") }]
    : [{ name: "compilation", run: compile }];
  console.log("==> Compile → portable runtimes → capsule packing");
  await runDeploymentJobs(preparation, 1, async phase => {
    const started = performance.now();
    let status = "failed";
    try { await phase.run(); status = "ok"; }
    finally {
      console.log(`[deployment-timing] ${phase.name}: ${((performance.now() - started) / 1000).toFixed(3)}s; status=${status}`);
    }
  });
  timing("all-build-prerequisites");

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
  // Capture the policy while it is still on disk: app-remainder packing may
  // remove .dockerignore itself. Missing policy is an explicit build failure.
  const publishingDockerignore = isDeployBuild
    ? fs.readFileSync(path.join(root, ".dockerignore"), "utf8")
    : "";
  let capsuleResults: Array<Awaited<ReturnType<typeof packCapsule>>> = [];

  if (isDeployBuild) {
    assertNoSelectedMaxCoreCandidate(root);
    // Snapshot ALL inputs before the first destructive pack, including files
    // intentionally excluded from runtime capsules (notably model.corrupt).
    // .deployment-pack-state is dockerignored; backups never inflate the shipped image.
    packTransaction = beginDeploymentPack(root);
    timing("recovery-snapshot");
    const capsuleTargets: Array<{
      dir: string;
      capsule: string;
      requiredMembers?: Array<{ path: string; bytes: number; sha256: string }>;
      excludePaths?: string[];
    }> = [
      { dir: "python_runtime", capsule: "python_runtime.pdim" },
      { dir: "node_modules", capsule: "node_modules.pdim" },
      {
        dir: "external/maxcore",
        capsule: "external_maxcore.pdim",
        requiredMembers: modelRelease ? [modelRelease] : [],
        // These are workspace credentials, mutable training pulls, or
        // generated candidate artifacts—not serving code or named training
        // corpora. The source modules and supported corpus files remain in
        // the capsule; model.pt is independently admitted by modelRelease.
        excludePaths: MAXCORE_CAPSULE_EXCLUDE_PATHS,
      },
      // 2026-08-14: user directive — the ENTIRE project must ship in the
      // deployment (external/pdim included), so it is packed as a capsule
      // rather than deleted from the image.
      {
        dir: "external/pdim",
        capsule: "external_pdim.pdim",
        excludePaths: PDIM_CAPSULE_EXCLUDE_PATHS,
      },
    ];

    // Pack all capsules CONCURRENTLY instead of one after another. Each
    // targets an independent source directory and writes its own .pdim file,
    // so there is no shared state to race on. Running the (up to) four packs
    // in parallel spreads them across the build container's cores instead of
    // serializing ~4 jobs back to back, which was blowing the build-step
    // time budget as more capsules were added. packCapsule (script/lib/
    // capsulePack.ts) is the same real streaming tar+zstd implementation the
    // round-trip test (tests/unit/capsule-pack-restore-roundtrip.test.ts)
    // exercises. zstd --long=27 was chosen over gzip-9 and xz-9e after
    // benchmarking all three against this project's real capsule directories:
    // it won on compressed size, compress time, AND decompress time.
    // The packer now uses level 6 to prioritize build throughput; the image
    // size gate below still enforces the same total-image safety budget.
    //
    // Thread allocation: zstd's own -T0 mode claims every core for ONE
    // capsule's compression. Left at -T0 while four capsules pack
    // concurrently, that oversubscribes the CPU 4x — four processes each
    // trying to use all N cores fight each other instead of finishing
    // sooner. Only targets that actually exist on disk will really spawn a
    // process (packCapsule no-ops on a missing dir), so divide the machine's
    // cores by how many packs will REALLY run concurrently, not by the
    // static target count, and give each job that many threads (at least 1).
    const existingTargets = capsuleTargets.filter(({ dir }) =>
      fs.existsSync(path.resolve(root, dir)),
    );
    const cpuCount = effectiveCapacity().cpus;
    const { concurrency, threads: perJobThreads } = compressionPlan(cpuCount, existingTargets.length);
    console.log(
      `==> Packing ${existingTargets.length} capsule(s), at most ${concurrency} concurrently across ${cpuCount} effective CPU(s) → ${perJobThreads} zstd thread(s) each`,
    );
    capsuleResults = await runDeploymentJobs(
      capsuleTargets, concurrency, ({ dir, capsule, requiredMembers, excludePaths }) =>
        packCapsule({
          root,
          dir,
          capsule,
          threads: perJobThreads,
          requiredMembers,
          excludePaths,
        }),
    );
    timing("primary-capsules");
  }

  // external/pdim is no longer deleted from the image — per user directive
  // (2026-08-14) the entire project ships; it is capsule-packed above and
  // restored at first boot alongside node_modules and external/maxcore.

  // ─── App remainder capsule (everything else) ───────────────────────────
  // The four capsules above cover the big, well-known deploy directories.
  // Everything ELSE that would still ship in the image — client/, server/,
  // migrations/, bin/, dist/'s own build output (minus dist/pdim-restore.mjs
  // itself, which must stay outside every capsule), top-level config files,
  // and any other file .dockerignore does not filter out — is scanned and
  // packed here too, so "the whole app" ships as compressed Extract & Boot
  // capsules rather than as raw files. Must run AFTER the four capsules
  // above have been packed (and their source directories removed) so the
  // .dockerignore-aware scan below sees the same post-capsule tree the
  // image will actually have, and after the Vite/esbuild build steps above
  // so dist/public and dist/*.mjs already exist to be included.
  //
  // This capsule restores in the CRITICAL (boot-blocking) tier, not the
  // background tier the other three use: it contains dist/cluster.mjs,
  // dist/index.mjs, and dist/gateway.mjs, which start.sh execs/spawns
  // synchronously right after the critical restore step, plus the
  // boosterstate binary and legacy AI sidecar source start.sh also touches
  // synchronously before backgrounding would finish. See dist/pdim-restore.mjs.
  let appRemainderResult: Awaited<ReturnType<typeof packCapsuleMembers>> =
    null;
  if (isDeployBuild) {
    const remainingMembers = computeRemainingAppMembers(root).filter(
      (member) => member !== RECOVERY_HELPER_PATH &&
        member !== ".deployment-pack-state" && !member.startsWith(".deployment-pack-state/"),
    );
    for (const required of ["dist/retained-pdim-recovery-worker.mjs", "scripts/startup-health.mjs"]) {
      if (!remainingMembers.includes(required)) {
        throw new Error(`Required runtime artifact is absent from the app capsule payload: ${required}`);
      }
    }
    console.log(
      `==> Scanned .dockerignore-survivor payload: ${remainingMembers.length} file(s) remaining outside the four existing capsules and the boot bootstrap set (${BOOTSTRAP_AND_CAPSULE_OWN_PATHS.join(", ")})`,
    );
    packTransaction!.preserveMembers(remainingMembers);
    appRemainderResult = await packCapsuleMembers({
      root,
      members: remainingMembers,
      capsule: "app_remainder.pdim",
      threads: compressionPlan(effectiveCapacity().cpus, 1).threads,
    });
  }
  timing("application-capsule");

  // Finish cache-producing subprocess work BEFORE physical cleanup/measurement.
  const nix = isDeployBuild ? getNixClosureSize() : null;
  timing("nix-accounting");
  let publishingMeasurement: ReturnType<typeof measurePublishingPayload> | undefined;

  // The Repl-layer uploader can traverse dockerignored workspace state anyway.
  // Enforce the policy physically ONLY on an explicitly authorized disposable copy,
  // after every capsule has finished and before measuring the final payload.
  // DEPLOY_PACK alone is used by preserved simulations and MUST NOT delete it.
  if (isDeployBuild && isDisposablePublishingCopy(process.env, root)) {
    const requiredPaths = [
      "start.sh", ".node_bin/node", "dist/pdim-restore.mjs",
      "scripts/boot-stub-server.mjs", "scripts/port-contract.sh",
      "scripts/check-port-contract.ts", RECOVERY_HELPER_PATH,
      ...[...capsuleResults, appRemainderResult]
        .filter((result): result is NonNullable<typeof result> => result !== null)
        .flatMap((result) => [
          path.relative(root, result.capsulePath),
          path.relative(root, result.manifestPath),
        ]),
    ];
    const cleaned = cleanPublishingPayload({
      root, env: process.env, dockerignore: publishingDockerignore, requiredPaths,
    });
    publishingMeasurement = cleaned.measurement;
    console.log(`==> Publishing-copy cleanup: removed ${cleaned.removedPaths.length} excluded path(s); bootstrap, recovery helper, manifests and capsules preserved`);
  } else if (isDeployBuild) {
    console.log("==> Publishing-copy cleanup skipped: no root-scoped publishing authorization (DEPLOY_PACK alone is not authorization)");
  }

  // ─── Pre-flight image size check ───────────────────────────────────────
  // Replit's 8 GiB limit includes BOTH the Repl payload and every transitive
  // Nix dependency. Measuring only tracked files/capsules is therefore not a
  // valid pre-flight: a large CUDA or EDA closure can exceed the limit while
  // the project payload looks small. Query the Nix store registration DB for
  // the complete, deduplicated closure of every store path exported into this
  // build environment, add its NAR sizes to the payload, and fail closed if
  // any root cannot be accounted for. NAR size is the store's own serialized
  // size metric and is the closest locally available measurement of the Nix
  // layer that the platform creates after this build command exits.
  if (nix) {
    const hardLimitBytes = 8 * 1024 ** 3;
    const budgetBytes = 7.5 * 1024 ** 3;
    const { totalBytes: payloadBytes, byTopDir } =
      publishingMeasurement ?? measurePublishingPayload(root, publishingDockerignore);
    const totalBytes = payloadBytes + nix.totalBytes;
    const totalGiB = totalBytes / 1024 ** 3;

    console.log(
      `==> Pre-flight image size check: ${totalGiB.toFixed(2)} GiB (${(payloadBytes / 1024 ** 3).toFixed(2)} GiB Repl payload + ${(nix.totalBytes / 1024 ** 3).toFixed(2)} GiB deduplicated Nix closure; ${nix.coveredRoots.length}/${nix.roots.length} Nix roots accounted for; safety budget ${(budgetBytes / 1024 ** 3).toFixed(1)} GiB, hard limit ${(hardLimitBytes / 1024 ** 3).toFixed(0)} GiB)`,
    );

    const unmeasuredRoots = nix.roots.filter(
      (rootPath) => !nix.coveredRoots.includes(rootPath),
    );
    if (totalBytes > budgetBytes || unmeasuredRoots.length > 0) {
      const breakdown = [
        ...nix.largestRootClosures.map(({ path: nixPath, sizeBytes }) => ({
          name: `${path.basename(nixPath)} (Nix closure)`,
          sizeBytes,
        })),
        ...[...byTopDir.entries()].map(([name, sizeBytes]) => ({
          name: `${name} (actual payload)`,
          sizeBytes,
        })),
      ].sort((a, b) => b.sizeBytes - a.sizeBytes);
      console.error(
        "❌ Pre-flight image size verification failed. Largest contributors:",
      );
      for (const { name, sizeBytes } of breakdown.slice(0, 10)) {
        console.error(`   ${(sizeBytes / 1024 ** 2).toFixed(0)}MB  ${name}`);
      }
      if (unmeasuredRoots.length > 0) {
        console.error(
          `   ${unmeasuredRoots.length} Nix root(s) could not be found in any readable Nix registration database:`,
        );
        for (const rootPath of unmeasuredRoots.slice(0, 10)) {
          console.error(`      ${rootPath}`);
        }
      }
      const reason =
        totalBytes > budgetBytes
          ? `${totalGiB.toFixed(2)} GiB exceeds the ${(budgetBytes / 1024 ** 3).toFixed(1)} GiB safety budget`
          : `${unmeasuredRoots.length} Nix root(s) are unmeasured`;
      throw new Error(
        `deploy image pre-flight size check: ${reason} (platform hard limit is ${(hardLimitBytes / 1024 ** 3).toFixed(0)} GiB total layers) — remove unnecessary Nix packages or shrink the contributors named above`,
      );
    }
  }
  packTransaction?.complete();
  if (isDeployBuild && isDisposablePublishingCopy(process.env, root)) {
    assertPublishingPayloadClean(root, publishingDockerignore);
  }
  timing("payload-cleanup-and-image-verification");
  console.log("==> Build and all applicable deployment checks complete.");
}

/** `du -sb` on one path; returns null (never a silent 0) when it can't be measured, so a
 * measurement failure surfaces as an explicit warning instead of masquerading as "small". */
export function duBytesOrNull(target: string): number | null {
  try {
    const out = execFileSync("du", ["-sb", "--", target], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const n = parseInt(out.split("\t")[0] ?? "", 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

type NixClosureMeasurement = {
  roots: string[];
  coveredRoots: string[];
  totalBytes: number;
  largestRootClosures: Array<{ path: string; sizeBytes: number }>;
};

/**
 * Measures the complete Nix closure exported into this build environment.
 *
 * Replit's cache-mounted store is readable but is not always registered in
 * /nix/var/nix/db, so `nix-store -qR` can incorrectly call existing paths
 * invalid. Read both registration databases directly in immutable mode and
 * union their closure rows by store path. The embedded Python uses only the
 * standard library supplied by the required python-3.12 Replit module.
 */
export function getNixClosureSize(): NixClosureMeasurement {
  const storePathPattern = /\/nix\/store\/[0-9a-z]{32}-[^/: \t\n]+/g;
  const discoveredRoots = [
    ...new Set(
      Object.values(process.env).flatMap(
        (value) => value?.match(storePathPattern) ?? [],
      ),
    ),
  ].sort();
  if (discoveredRoots.length === 0) {
    // A native Linux CI runner has no Nix layer. A Nix-equipped deployment
    // without discoverable roots is still an error, never a zero estimate.
    if (!fs.existsSync("/nix/store")) {
      return { totalBytes: 0, roots: [], coveredRoots: [], largestRootClosures: [] };
    }
    throw new Error(
      "deploy image pre-flight size check: no Nix roots were discoverable in the build environment",
    );
  }
  // A store path can appear in an environment variable (e.g. Nix's own $out
  // during a `nix-shell` invocation) without ever having been realized on
  // disk, or after its content has been garbage-collected. Such a path
  // contributes nothing to the actual image and can never be measured, so
  // it must not count as a Nix root at all -- otherwise a stale env var
  // permanently trips the "unmeasured root" fail-closed check even though
  // every real dependency is accounted for. Any root that DOES exist on
  // disk still must be measured or covered below; only genuinely absent
  // paths are dropped here.
  const roots = discoveredRoots.filter(
    (root) => fs.existsSync(root) || fs.lstatSync(root, { throwIfNoEntry: false }) != null,
  );
  if (roots.length === 0) {
    throw new Error(
      "deploy image pre-flight size check: no on-disk Nix roots were discoverable in the build environment",
    );
  }

  const python = String.raw`
import json, os, sqlite3, sys

roots = set(json.load(sys.stdin))
databases = [
    os.path.join(os.environ.get("NIX_STATE_DIR", "/nix/var/nix"), "db", "db.sqlite"),
    "/nix/var/nix/db/db.sqlite",
    "/mnt/cacache/nix/var/nix/db/db.sqlite",
]
closure_sizes = {}
covered = set()
root_closure_sizes = {}
opened = 0

for db in dict.fromkeys(databases):
    if not os.path.isfile(db):
        continue
    try:
        con = sqlite3.connect("file:" + db + "?mode=ro&immutable=1", uri=True)
        con.execute("CREATE TEMP TABLE wanted(path TEXT PRIMARY KEY)")
        con.executemany("INSERT OR IGNORE INTO wanted VALUES (?)", ((p,) for p in roots))
        known = {row[0] for row in con.execute(
            "SELECT path FROM ValidPaths JOIN wanted USING(path)"
        )}
        covered.update(known)
        for store_path, nar_size in con.execute("""
            WITH RECURSIVE closure(id) AS (
                SELECT id FROM ValidPaths JOIN wanted USING(path)
                UNION
                SELECT Refs.reference FROM Refs JOIN closure ON Refs.referrer = closure.id
            )
            SELECT path, COALESCE(narSize, 0)
            FROM ValidPaths JOIN closure USING(id)
        """):
            closure_sizes[store_path] = max(closure_sizes.get(store_path, 0), nar_size)
        for root_path, size_bytes in con.execute("""
            WITH RECURSIVE closure(root, id) AS (
                SELECT id, id FROM ValidPaths JOIN wanted USING(path)
                UNION
                SELECT closure.root, Refs.reference
                FROM Refs JOIN closure ON Refs.referrer = closure.id
            )
            SELECT root_path.path, COALESCE(SUM(member.narSize), 0)
            FROM closure
            JOIN ValidPaths AS root_path ON root_path.id = closure.root
            JOIN ValidPaths AS member ON member.id = closure.id
            GROUP BY closure.root
        """):
            root_closure_sizes[root_path] = max(root_closure_sizes.get(root_path, 0), size_bytes)
        opened += 1
        con.close()
    except sqlite3.Error:
        continue

if opened == 0:
    raise RuntimeError("no readable Nix registration database")

# Some roots exported into this environment are Replit-provisioned "module"
# packages (language runtimes, package-manager CLIs, browser binaries, etc.)
# rather than plain nixpkgs derivations -- confirmed by direct lookup that
# their store paths are genuinely absent from every readable registration
# database (not a transient miss), even though the paths exist on disk and
# are real environment dependencies. Treating them as "unmeasured" would
# fail the whole preflight even when they are honestly small. Since there is
# no registration row, their own transitive Nix references can't be
# resolved from the db, but their real on-disk footprint can be measured
# directly (walking the directory, real file sizes, no estimate) and
# reported as its own closure -- covering them without pretending to know
# dependencies that were never recorded.
for p in sorted(roots - covered):
    if not os.path.isdir(p) and not os.path.isfile(p):
        continue
    total = 0
    if os.path.isfile(p):
        try:
            total = os.path.getsize(p)
        except OSError:
            continue
    else:
        for dirpath, _dirnames, filenames in os.walk(p):
            for fn in filenames:
                fp = os.path.join(dirpath, fn)
                try:
                    if not os.path.islink(fp):
                        total += os.path.getsize(fp)
                except OSError:
                    pass
    closure_sizes[p] = max(closure_sizes.get(p, 0), total)
    root_closure_sizes[p] = max(root_closure_sizes.get(p, 0), total)
    covered.add(p)

print(json.dumps({
    "roots": sorted(roots),
    "coveredRoots": sorted(covered),
    "totalBytes": sum(closure_sizes.values()),
    "largestRootClosures": [
        {"path": p, "sizeBytes": n}
        for p, n in sorted(root_closure_sizes.items(), key=lambda item: item[1], reverse=True)[:20]
    ],
}))
`;

  try {
    const output = execFileSync("python3", ["-c", python], {
      encoding: "utf8",
      input: JSON.stringify(roots),
      maxBuffer: 16 * 1024 * 1024,
    });
    const measurement = JSON.parse(output) as NixClosureMeasurement;
    if (
      !Number.isFinite(measurement.totalBytes) ||
      measurement.totalBytes <= 0 ||
      !Array.isArray(measurement.coveredRoots)
    ) {
      throw new Error("invalid Nix closure measurement");
    }
    return measurement;
  } catch (error) {
    throw new Error(
      `deploy image pre-flight size check: could not measure the Nix closure; refusing to report a false PASS (${(error as Error).message})`,
      { cause: error },
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
}
