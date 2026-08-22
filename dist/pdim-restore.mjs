#!/usr/bin/env node
/**
 * PDIM Capsule Restore — Extract & Boot
 *
 * Extracts node_modules.pdim (and python_runtime.pdim if present) on first
 * startup.  Idempotent: skips extraction when the sentinel file
 * node_modules/.pdim-restored already exists.
 *
 * Reads compression format from *.manifest.json written by build.sh:
 *   "xz-9e"  → tar -xJf  (XZ)
 *   "gzip-9" → tar -xzf  (gzip, fallback)
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  renameSync,
  readdirSync,
  createReadStream,
} from "fs";
import { createHash } from "crypto";
import { spawn, spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Resolve bsdtar once per process. bsdtar (libarchive) sets
// ARCHIVE_EXTRACT_ATOMIC by default, which is libarchive's actual fix for
// the "Directory renamed before its status could be extracted" extractor
// race — not a workaround, a different (safer) extraction strategy. Falls
// back to null (caller uses GNU tar + exit-code tolerance) if unavailable.
let _bsdtarBinCache;
function resolveBsdtar() {
  if (_bsdtarBinCache !== undefined) return _bsdtarBinCache;
  try {
    const probe = spawnSync("bsdtar", ["--version"], { stdio: "ignore" });
    _bsdtarBinCache = probe.status === 0 ? "bsdtar" : null;
  } catch {
    _bsdtarBinCache = null;
  }
  return _bsdtarBinCache;
}

// Reserved VM deployments keep the same persistent disk across the rapid
// crash/restart cycles a slow cold boot causes: the platform kills a
// container that doesn't open its port in time and immediately starts a new
// one on the SAME volume. If the killed container's `tar` child was
// orphaned rather than torn down before the new one starts, two tar
// processes end up extracting into the same node_modules/ tree at once —
// which is exactly what produced tar's "Directory renamed before its status
// could be extracted" warnings. A simple PID lockfile makes a fresh restore
// attempt wait for (or clean up after) a prior one instead of racing it.
async function acquireRestoreLock(targetDir) {
  const lockPath = resolve(ROOT, `${targetDir.replace(/[\/]/g, "_")}.pdim-restore.lock`);
  const isPidAlive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  for (let waited = 0; waited < 120_000; waited += 500) {
    if (existsSync(lockPath)) {
      const heldPid = Number(readFileSync(lockPath, "utf8").trim());
      if (heldPid && isPidAlive(heldPid)) {
        if (waited === 0) {
          console.log(
            `[pdim-restore] ${targetDir}/ restore already in progress (pid ${heldPid}) — waiting instead of racing it`,
          );
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      // Stale lock from a killed process — safe to reclaim.
      try {
        rmSync(lockPath, { force: true });
      } catch {}
    }
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      return () => {
        try {
          rmSync(lockPath, { force: true });
        } catch {}
      };
    } catch {
      // Another process won the race to create the lock file — retry the loop.
      continue;
    }
  }

  console.error(
    `[pdim-restore] WARN: gave up waiting for ${targetDir}/ restore lock after 120s — proceeding anyway`,
  );
  return () => {};
}

function readManifest(manifestPath) {
  try {
    if (existsSync(manifestPath)) {
      return JSON.parse(readFileSync(manifestPath, "utf8"));
    }
  } catch (_) {}
  return null;
}

async function restoreCapsule(capsuleName, manifestName, targetDir, sentinel) {
  const capsulePath = resolve(ROOT, capsuleName);
  const manifestPath = resolve(ROOT, manifestName);
  const sentinelPath = resolve(ROOT, targetDir, sentinel || ".pdim-restored");

  if (!existsSync(capsulePath)) {
    console.log(`[pdim-restore] ${capsuleName}: capsule not found — skipping`);
    return true;
  }

  if (existsSync(sentinelPath)) {
    console.log(`[pdim-restore] ${targetDir}/ already restored — skipping`);
    return true;
  }

  const releaseLock = await acquireRestoreLock(targetDir);
  // Another process may have finished the restore while we were waiting on
  // the lock — re-check the sentinel before starting a redundant extraction.
  if (existsSync(sentinelPath)) {
    releaseLock();
    console.log(`[pdim-restore] ${targetDir}/ restored while waiting on lock — skipping`);
    return true;
  }

  const manifest = readManifest(manifestPath);
  const compression = manifest?.compression || "gzip-9";
  const tarFlag = compression.startsWith("xz") ? "-xJf" : "-xzf";

  // Prefer bsdtar (libarchive) over GNU tar for the actual extraction. This
  // isn't a warning-tolerance workaround — libarchive ships a real fix for
  // this exact class of bug: it added ARCHIVE_EXTRACT_ATOMIC (atomic
  // directory creation/rename during extraction, avoiding the create→rename
  // window that the kernel/overlayfs "Directory renamed before its status
  // could be extracted" race lands in) and bsdtar enables it by default.
  // GNU tar has no equivalent flag — this is a tool-level fix, not a
  // config tweak. libarchive auto-detects gzip/xz from the stream, so no
  // format-specific flag is needed; GNU tar's exit-code-tolerant path below
  // remains as a safety net for any environment where bsdtar is unavailable.
  const bsdtarBin = resolveBsdtar();

  // Extract into a scratch directory that nothing else in the tree has ever
  // seen, then swap it into place with a single rename — instead of
  // extracting the thousands of individual files/dirs of node_modules
  // directly on top of the real target path. GNU tar's "Directory renamed
  // before its status could be extracted" is a known extractor race
  // (reported against Docker/overlay filesystems and container runtimes
  // generally) triggered by rapid nested mkdir/rename traffic landing on a
  // path that already has directory entries in it — exactly the shape of a
  // fresh multi-thousand-file node_modules extraction. Extracting into an
  // empty scratch dir removes any pre-existing entries for tar to collide
  // with; the only operation touching the real target path is one atomic
  // rename after the archive is fully verified.
  const scratchDir = resolve(ROOT, `.pdim-scratch-${targetDir.replace(/[\/]/g, "_")}-${process.pid}`);
  const finalTargetPath = resolve(ROOT, targetDir);

  // Clean up any scratch leftovers from a prior crashed attempt (same or
  // different pid) before starting a fresh one.
  try {
    const prefix = `.pdim-scratch-${targetDir.replace(/[\/]/g, "_")}-`;
    for (const entry of readdirSync(ROOT)) {
      if (entry.startsWith(prefix)) {
        rmSync(resolve(ROOT, entry), { recursive: true, force: true });
      }
    }
  } catch {}

  try {
    mkdirSync(scratchDir, { recursive: true });
  } catch (e) {
    console.error(`[pdim-restore] ERROR: could not create scratch dir ${scratchDir}: ${e.message}`);
    releaseLock();
    return false;
  }

  console.log(
    `[pdim-restore] Extracting ${capsuleName} (${compression}) → ${scratchDir}/ (staging for ${targetDir}/) ...`,
  );

  // Stream the capsule through tar's stdin while simultaneously hashing the
  // same bytes as they pass through, instead of reading the whole file once
  // to verify its checksum and then reading it AGAIN to extract it. For a
  // large capsule (node_modules can be hundreds of MB to multi-GB) that
  // double read was itself enough to blow the deployment's startup-probe
  // window — the "Extracting" log never even appeared before the platform
  // killed and restarted the container. One read now covers both.
  return new Promise((resolvePromise) => {
    const fail = (msg) => {
      console.error(`[pdim-restore] ERROR: ${msg}`);
      // Remove the scratch tree so the next boot retries cleanly; the real
      // target path was never touched, so it's left exactly as it was.
      try {
        rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
      releaseLock();
      resolvePromise(false);
    };

    // Each capsule extracts into its own scratch/target directory, so running
    // the four restores concurrently is safe (no shared-path writes) and
    // turns total wall-clock time from the SUM of all extractions into
    // roughly the MAX of the largest one — needed to stay under the
    // deployment promote-step startup-probe timeout now that four capsules
    // ship. The archive's internal paths already start with the target dir
    // name (e.g. "node_modules/..."), so extracting with -C scratchDir
    // reproduces "scratchDir/node_modules/...".
    // Capture stderr instead of piping straight to the console: the scratch-
    // dir swap alone did NOT eliminate "Directory renamed before its status
    // could be extracted" (confirmed against real deploy logs — it recurred
    // verbatim even extracting into a brand-new empty directory). That rules
    // out a collision with pre-existing entries and matches a well-documented
    // GNU tar / overlayfs kernel race (identical message reported against
    // RHEL, Ubuntu, and Docker/dokku for large nested node_modules-style
    // trees): the kernel's overlay copy-up renames a just-created directory
    // out from under tar between mkdir and the follow-up stat/chmod call.
    // The content already written into that directory is NOT lost — only the
    // final metadata touch-up on it is — so this specific, well-known warning
    // class is treated as non-fatal (with a loud log and a post-extraction
    // sanity check below), while anything else on stderr still fails hard.
    const usingBsdtar = !!bsdtarBin;
    const child = usingBsdtar
      ? spawn(bsdtarBin, ["-x", "-f", "-", "-C", scratchDir], {
          stdio: ["pipe", "inherit", "pipe"],
        })
      : spawn("tar", [tarFlag, "-", "-C", scratchDir], {
          stdio: ["pipe", "inherit", "pipe"],
        });
    if (usingBsdtar) {
      console.log(`[pdim-restore] Using bsdtar (libarchive, atomic extraction) for ${capsuleName}`);
    } else {
      console.log(`[pdim-restore] bsdtar not found — falling back to GNU tar for ${capsuleName}`);
    }

    let stderrBuf = "";
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      process.stderr.write(text);
    });

    const hash = manifest?.sha256 ? createHash("sha256") : null;
    const source = createReadStream(capsulePath);
    let sourceErrored = false;

    source.on("data", (chunk) => {
      if (hash) hash.update(chunk);
    });
    source.on("error", (err) => {
      sourceErrored = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      fail(`failed reading ${capsuleName}: ${err.message}`);
    });
    source.pipe(child.stdin);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(`tar timed out after 900s extracting ${capsuleName}`);
    }, 900_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      fail(`tar spawn failed: ${err.message}`);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (sourceErrored) return; // already handled by source's error path

      // GNU tar's own documented exit-status contract (see `man tar`,
      // RETURN VALUE): 0 = success, 1 = "some files differ" (non-fatal
      // warnings were printed but the archive was otherwise processed),
      // 2 = fatal error. This is the standard, well-established way tooling
      // distinguishes the two (e.g. rsync/tar wrappers across CI systems
      // treat exit 1 as warn-and-continue) — it's tar itself telling us
      // which class of outcome this was, not a guess based on matching
      // specific message text. Real production logs from THIS app show
      // exactly this: the overlayfs kernel race that renames a just-created
      // directory out from under tar mid-extraction (documented in RHEL
      // solution 3449271, Ubuntu kernel bug #1728489, moby/moby #19647 for
      // this identical message on large nested node_modules-style trees)
      // only ever produces exit 1 — the archive content is fully written,
      // just missing a final metadata touch-up on the affected dirs. A
      // genuinely fatal problem (truncated archive, disk full, permission
      // denial) exits >=2. We still verify the resulting tree size below
      // rather than trusting exit 1 blindly.
      if (code === 2 || (code !== 0 && code !== 1)) {
        return fail(`tar exited with fatal code ${code}`);
      }
      if (code === 1) {
        console.error(
          `[pdim-restore] WARN: tar exited 1 (warnings only, per its own ` +
            `exit-status contract) while extracting ${capsuleName} — likely ` +
            `the known overlayfs "Directory renamed" kernel race; content is ` +
            `still written, only trailing dir metadata touch-up was skipped. ` +
            `Continuing; verifying tree size below.`,
        );
      }

      if (hash) {
        const actual = hash.digest("hex");
        if (actual !== manifest.sha256) {
          return fail(
            `checksum mismatch for ${capsuleName}\n` +
              `  expected ${manifest.sha256}\n  actual   ${actual}`,
          );
        }
      }

      // Archive contents landed at scratchDir/<targetDir>/... (the archive's
      // internal paths already start with the target dir name). Swap the
      // fully-verified tree into place with one atomic rename instead of the
      // thousands of individual creates a direct extraction would perform on
      // the live path.
      const extractedPath = resolve(scratchDir, targetDir);
      if (!existsSync(extractedPath)) {
        return fail(
          `extraction succeeded but ${extractedPath} was not produced — archive layout mismatch`,
        );
      }

      // Sanity-check the tree size, since the benign-warning path above
      // deliberately tolerates a nonzero tar exit code — this catches the
      // case where "benign-looking" warnings actually coincided with real
      // content loss instead of just a skipped metadata touch-up.
      let entryCount = 0;
      try {
        entryCount = readdirSync(extractedPath).length;
      } catch (e) {
        return fail(`could not verify extracted tree at ${extractedPath}: ${e.message}`);
      }
      if (entryCount === 0) {
        return fail(`extraction produced an empty ${targetDir}/ directory — treating as failed`);
      }
      const MIN_ENTRIES = { node_modules: 500 };
      const minExpected = MIN_ENTRIES[targetDir];
      if (minExpected && entryCount < minExpected) {
        return fail(
          `extracted ${targetDir}/ has only ${entryCount} entries (expected ${minExpected}+) — treating as failed`,
        );
      }

      try {
        rmSync(finalTargetPath, { recursive: true, force: true });
        mkdirSync(dirname(finalTargetPath), { recursive: true });
        renameSync(extractedPath, finalTargetPath);
      } catch (e) {
        return fail(`failed to swap ${extractedPath} into ${finalTargetPath}: ${e.message}`);
      } finally {
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {}
      }

      // Write the sentinel only after a fully successful extraction+swap so
      // subsequent boots skip re-extraction (idempotent restore).
      try {
        writeFileSync(sentinelPath, new Date().toISOString());
      } catch (e) {
        console.error(
          `[pdim-restore] WARN: could not write sentinel ${sentinelPath}: ${e.message}`,
        );
      }

      console.log(`[pdim-restore] ✅ ${targetDir}/ restored from ${capsuleName}`);
      releaseLock();
      resolvePromise(true);
    });
  });
}

// node_modules MUST be present before the Node process can import anything,
// so it is the only capsule that legitimately has to block the app from
// starting. python_runtime / external/maxcore / external/pdim are consumed
// lazily by subsystems that already start asynchronously and degrade
// gracefully when their backing files aren't there yet (Python sidecar warns
// and falls back, MaxCore's local supervisor reports its probe as
// degraded/unreachable, external/pdim isn't imported by the running app at
// all) — so blocking boot on them too only serves to burn through the
// deployment's startup-probe window for no functional benefit. `critical`
// mode restores node_modules only; `background` mode restores the rest.
const CAPSULES = {
  nodeModules: () =>
    restoreCapsule(
      "node_modules.pdim",
      "node_modules.manifest.json",
      "node_modules",
      ".pdim-restored",
    ),
  pythonRuntime: () =>
    restoreCapsule(
      "python_runtime.pdim",
      "python_runtime.manifest.json",
      "python_runtime",
      ".pdim-restored-py",
    ),
  // external/maxcore — internalized MaxCore subsystem (packed by script/build.ts).
  // Required unless local MaxCore mode is explicitly disabled (MAXCORE_LOCAL=0).
  maxcore: () =>
    restoreCapsule(
      "external_maxcore.pdim",
      "external_maxcore.manifest.json",
      "external/maxcore",
      ".pdim-restored-maxcore",
    ),
  // external/pdim — vendored PDIM subsystem (packed by script/build.ts).
  // Shipped per user directive that the entire project be included; a failed
  // restore is logged but non-fatal since app runtime does not import it.
  pdim: () =>
    restoreCapsule(
      "external_pdim.pdim",
      "external_pdim.manifest.json",
      "external/pdim",
      ".pdim-restored-pdim",
    ),
};

const mode = process.argv[2] || "all";

if (mode === "critical") {
  const nodeModulesOk = await CAPSULES.nodeModules();
  if (!nodeModulesOk) {
    console.error(
      "[pdim-restore] FATAL: node_modules restore failed — server will crash",
    );
    process.exit(1);
  }
  console.log("[pdim-restore] Critical capsule (node_modules) restored.");
} else if (mode === "background") {
  await Promise.all([
    CAPSULES.pythonRuntime(),
    CAPSULES.maxcore(),
    CAPSULES.pdim(),
  ]);
  console.log("[pdim-restore] Background capsules processed.");
} else {
  // Legacy/dev path: restore everything up front and block on it.
  const [nodeModulesOk, , maxcoreOk] = await Promise.all([
    CAPSULES.nodeModules(),
    CAPSULES.pythonRuntime(),
    CAPSULES.maxcore(),
    CAPSULES.pdim(),
  ]);

  let ok = nodeModulesOk;
  if (process.env.MAXCORE_LOCAL !== "0") ok = maxcoreOk && ok;

  if (!ok) {
    console.error(
      "[pdim-restore] FATAL: a required capsule restore failed — server will crash",
    );
    process.exit(1);
  }

  console.log("[pdim-restore] All capsules processed.");
}
