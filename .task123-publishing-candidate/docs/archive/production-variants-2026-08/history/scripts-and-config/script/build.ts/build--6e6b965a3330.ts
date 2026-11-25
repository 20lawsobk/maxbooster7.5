import { execFileSync, execSync } from "child_process";
import { build as esBuild } from "esbuild";
import fs from "fs";
import os from "os";
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
        console.log(
          `\n==> Downloading portable Python ${PYVER} (x86_64-linux-gnu)...`,
        );
        fs.mkdirSync(pyDir, { recursive: true });
        execSync(
          `curl -sL --max-time 180 ${JSON.stringify(PYURL)} | tar xz --strip-components=1 -C ${JSON.stringify(pyDir)} python/`,
          { cwd: root, stdio: "inherit", shell: "/bin/bash" },
        );
      }
      execSync(`${JSON.stringify(pyBin)} --version`, { stdio: "inherit" });
      console.log(
        "   Installing Python deps (numpy, pillow, scipy, fastapi, uvicorn, pydantic)...",
      );
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
    // so there is no shared state to race on. Running the (up to) four packs
    // in parallel spreads them across the build container's cores instead of
    // serializing ~4 jobs back to back, which was blowing the build-step
    // time budget as more capsules were added. packCapsule (script/lib/
    // capsulePack.ts) is the same real streaming tar+zstd implementation the
    // round-trip test (tests/unit/capsule-pack-restore-roundtrip.test.ts)
    // exercises. zstd -19 --long=27 was chosen over gzip-9 and xz-9e after
    // benchmarking all three against this project's real capsule directories:
    // it won on compressed size, compress time, AND decompress time.
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
    const cpuCount = os.cpus().length || 1;
    const concurrentPackCount = existingTargets.length || 1;
    const perJobThreads = Math.max(
      1,
      Math.floor(cpuCount / concurrentPackCount),
    );
    console.log(
      `==> Packing ${existingTargets.length} capsule(s) concurrently across ${cpuCount} CPU(s) → ${perJobThreads} zstd thread(s) each`,
    );
    capsuleResults = await Promise.all(
      capsuleTargets.map(({ dir, capsule }) =>
        packCapsule({ root, dir, capsule, threads: perJobThreads }),
      ),
    );
  }

  // external/pdim is no longer deleted from the image — per user directive
  // (2026-08-14) the entire project ships; it is capsule-packed above and
  // restored at first boot alongside node_modules and external/maxcore.

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
  if (isDeployBuild) {
    const hardLimitBytes = 8 * 1024 ** 3;
    const budgetBytes = 7.5 * 1024 ** 3;
    const { totalBytes: trackedBytes, byTopDir } =
      getTrackedSizeBreakdown(root);
    const distBytes = requireMeasuredBytes(path.join(root, "dist"), "dist/");
    const capsuleBreakdown = capsuleResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({
        name: path.basename(r.capsulePath),
        sizeBytes: r.sizeBytes,
      }));
    const capsuleBytes = capsuleBreakdown.reduce(
      (sum, c) => sum + c.sizeBytes,
      0,
    );
    const nix = getNixClosureSize();
    const payloadBytes = trackedBytes + distBytes + capsuleBytes;
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
          name: `${name}/ (tracked)`,
          sizeBytes,
        })),
        { name: "dist/ (build output)", sizeBytes: distBytes },
        ...capsuleBreakdown,
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

function requireMeasuredBytes(target: string, label: string): number {
  const measured = duBytesOrNull(target);
  if (measured === null) {
    throw new Error(
      `deploy image pre-flight size check: could not measure ${label}; refusing to report a false PASS`,
    );
  }
  return measured;
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

/** Sums the real on-disk size of every git-tracked file (what a deploy build actually ships,
 * as opposed to `du` on the project root which is dominated by gitignored dev-tooling caches),
 * grouped by top-level directory for attributing which part of the tracked tree is heaviest. */
function getTrackedSizeBreakdown(root: string): {
  totalBytes: number;
  byTopDir: Map<string, number>;
} {
  const out = execSync("git ls-files -z", {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
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

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
}
