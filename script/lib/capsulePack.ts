/**
 * Real streaming pack step for the four "Extract & Boot" deploy capsules
 * (node_modules, python_runtime, external/maxcore, external/pdim). Shared
 * between the production build (script/build.ts) and the automated
 * build-then-restore round-trip test
 * (tests/unit/capsule-pack-restore-roundtrip.test.ts) so both exercise the
 * exact same real tar+codec pipeline — no mocks on either side.
 *
 * Codec: zstd. Production uses level 6 for build throughput; the historical
 * level-19 measurements below explain the codec choice, not today's level.
 * Reproduce the level comparison with script/benchmark-capsule-packing.ts.
 * zstd was chosen from a real benchmark against this project's actual
 * capsule directories, all measured through the real pack/restore code
 * paths below (not a hand-rolled CLI pipe — a naive benchmark script
 * measures different numbers than what this file and dist/pdim-restore.mjs
 * actually do):
 *   external/pdim (499M real tree):
 *     - gzip-9:             499M -> 80.4MB  compress 60.4s  decompress 4.1s
 *     - zstd -19 --long=27: 499M -> 39.2MB  compress 63.3s  decompress 4.1s
 *     - xz -9e:             499M -> ~38MB   compress ~251s  decompress ~4.6s
 *   node_modules (1.6G real tree, the one capsule that blocks server boot):
 *     - gzip-9:             1.6G -> 269.0MB compress 194.9s decompress 25.7s
 *     - zstd -19 --long=27: 1.6G -> 122.7MB compress 136.1s decompress 15.2s
 *   external/maxcore (1.7G real tree):
 *     - gzip-9:             1.7G -> 664.9MB compress 157.6s
 *     - zstd -19 --long=27: 1.7G -> 544.3MB compress 196.6s decompress 29.6s
 * zstd matches or beats gzip-9 on every axis at every real scale measured —
 * smaller AND faster to decompress, not a size/speed tradeoff. xz's small
 * ratio edge over zstd (~5%, only benchmarked on the mid-size tree) costs
 * ~4x the compress time, which isn't worth it given node_modules.pdim's
 * decompression speed matters more than the other three capsules (which
 * restore in the background, off the boot-blocking path). One codec/level
 * is used for all four capsules rather than picking differently per
 * capsule: zstd -19 --long=27 wins across every one of them, so there is no
 * tradeoff that would justify a different codec for any single capsule.
 * `--long=27` (256 MiB match window) is what gets zstd's ratio meaningfully
 * ahead of gzip's on this content; without it zstd's advantage shrinks.
 * (external/maxcore's ratio gain is far more modest than the other three —
 * consistent with it containing a much higher proportion of already-dense
 * binary/model artifacts rather than source-tree-shaped text.)
 */
import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { DEPLOYMENT_CONTROL_FILES } from "./deploymentControlFiles.js";

export const CAPSULE_COMPRESSION_LEVEL = 6;
export const CAPSULE_COMPRESSION_ID = `zstd-${CAPSULE_COMPRESSION_LEVEL}`;

export const MAXCORE_CAPSULE_EXCLUDE_PATHS = [
  ".npmrc",
  ".env*",
  ".cloudflared",
  "cookies.txt",
  "__pycache__",
  "**/__pycache__",
  "*.pyc",
  "**/*.pyc",
  "artifacts/ai-training-server/ai_model/training_data",
  "artifacts/ai-training-server/ai_model/training/candidate_runs",
  "artifacts/ai-training-server/ai_model/training/live_learning_runs",
  "artifacts/ai-training-server/ai_model/training/live_candidate_admissions",
  "artifacts/ai-training-server/ai_model/training/candidate_registry",
  "artifacts/ai-training-server/ai_model/weights/model.corrupt",
];

export const PDIM_CAPSULE_EXCLUDE_PATHS = [
  ".npmrc",
  ".env*",
  ".cloudflared",
  "cookies.txt",
  "__pycache__",
  "**/__pycache__",
  "*.pyc",
  "**/*.pyc",
];

function sha256FileSync(file: string): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(file, "r");
  try {
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function zstdCompressArgs(threads: number, level: number): string[] {
  // `-T0` tells zstd to claim every core on the machine for ITS OWN
  // compression. That is correct when only one capsule packs at a time, but
  // the caller (script/build.ts) packs all capsules concurrently via
  // Promise.all — four `-T0` processes racing for the same core pool
  // oversubscribes the CPU 4x and makes each one slower than a properly
  // divided share would be, not faster. Callers running N jobs concurrently
  // should pass `threads = max(1, floor(cpuCount / N))` so the combined
  // demand matches what the machine actually has; a single caller can still
  // pass 0 to keep the old all-cores behavior.
  if (!Number.isInteger(level) || level < 1 || level > 19) throw new Error("Invalid capsule compression level");
  return [`-${level}`, "--long=27", `-T${threads}`, "-c"];
}

export interface PackCapsuleOptions {
  /** Non-destructive release preparation keeps source trees in place. */
  preserveSource?: boolean;
  /** Separate output root; archive member names remain relative to root. */
  outputRoot?: string;
  /** Absolute path to the root both `dir` and `capsule` are relative to. */
  root: string;
  /** Directory to pack, relative to `root` (e.g. "node_modules"). */
  dir: string;
  /** Output capsule filename, relative to `root` (e.g. "node_modules.pdim"). */
  capsule: string;
  /**
   * zstd thread count for THIS capsule's compression (`-T<n>`). Defaults to
   * 0 (zstd's own "use every core" auto mode) for backward compatibility
   * with single-capsule callers (e.g. the round-trip test). When packing
   * several capsules concurrently, pass each one a divided share of the
   * machine's cores instead of leaving every job to claim all of them.
   */
  threads?: number;
  /** Explicit level for reproducible performance comparisons. */
  compressionLevel?: number;
  /** Files that must be hash-verified inside `dir` and recorded in the capsule manifest. */
  requiredMembers?: Array<{ path: string; bytes: number; sha256: string }>;
  /**
   * File or directory patterns relative to `dir` that tar must omit. Patterns
   * are recorded in the capsule manifest so deployment exclusions are
   * auditable. This is separate from .dockerignore: whole-directory capsules
   * are packed before the app-remainder .dockerignore scan.
   */
  excludePaths?: string[];
}

export interface PackCapsuleResult {
  capsulePath: string;
  manifestPath: string;
  sizeBytes: number;
  sha256: string;
  compression: string;
}

function normalizeExcludePaths(excludePaths: string[]): string[] {
  return [...new Set(excludePaths.map((pattern) => {
    const normalized = pattern.replace(/\\/g, "/");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      path.posix.normalize(normalized) !== normalized ||
      normalized.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new Error(`invalid capsule exclusion pattern: ${pattern}`);
    }
    return normalized;
  }))];
}

/**
 * Streams `tar -cf - dir | zstd ... -c` straight into the capsule file,
 * hashing the compressed bytes as they fly by instead of reading the whole
 * capsule back afterward to compute its checksum — the source directory
 * (which can be multiple gigabytes) is never buffered fully in memory, and
 * neither is the compressed output on the way to disk.
 *
 * Writes `<capsule without .pdim>.manifest.json` recording the REAL codec
 * id that ran (`CAPSULE_COMPRESSION_ID`, the same constant used to build
 * the actual zstd invocation above — one source of truth, so the manifest
 * can't drift from what actually executed), then deletes the source
 * directory, mirroring the previous `tar | gzip -9 > capsule` build step.
 *
 * Resolves `null` (no-op, nothing written) if `dir` does not exist under
 * `root` — some capsule targets (python_runtime) only exist during a real
 * deploy build. Rejects on any tar/zstd failure (including a tar failure
 * that would otherwise be silently swallowed by shell pipe semantics —
 * `set -o pipefail` below closes that gap); the caller intentionally lets
 * that reject the whole build rather than silently falling back to a
 * worse codec.
 */
export function packCapsule({
  root,
  dir,
  capsule,
  threads = 0,
  compressionLevel = CAPSULE_COMPRESSION_LEVEL,
  requiredMembers = [],
  excludePaths = [],
  preserveSource = false,
  outputRoot = root,
}: PackCapsuleOptions): Promise<PackCapsuleResult | null> {
  const compression = `zstd-${compressionLevel}`;
  const compressArgs = zstdCompressArgs(threads, compressionLevel);
  return new Promise((resolveOne, rejectOne) => {
    const normalizedExcludePaths = normalizeExcludePaths(excludePaths);
    const abs = path.resolve(root, dir);
    if (!fs.existsSync(abs)) return resolveOne(null);

    for (const member of requiredMembers) {
      const memberPath = path.resolve(abs, member.path);
      if (
        memberPath !== abs &&
        !memberPath.startsWith(`${abs}${path.sep}`)
      ) {
        return rejectOne(new Error(`required capsule member escapes ${dir}: ${member.path}`));
      }
      const stat = fs.statSync(memberPath, { throwIfNoEntry: false });
      if (!stat?.isFile() || stat.size !== member.bytes) {
        return rejectOne(
          new Error(`required capsule member missing or wrong size: ${dir}/${member.path}`),
        );
      }
      const actualSha256 = sha256FileSync(memberPath);
      if (actualSha256 !== member.sha256) {
        return rejectOne(
          new Error(`required capsule member SHA-256 mismatch: ${dir}/${member.path}`),
        );
      }
    }

    const capsulePath = path.resolve(outputRoot, capsule);
    if (capsulePath === abs || capsulePath.startsWith(abs + path.sep)) {
      return rejectOne(new Error("Capsule output must be outside its source tree"));
    }
    fs.mkdirSync(path.dirname(capsulePath), { recursive: true });
    console.log(
      `==> Packing ${dir}/ → ${capsule} (${compression}, -T${threads}, Extract & Boot)...`,
    );

    const tarExcludes = normalizedExcludePaths
      .map((pattern) => `--exclude=${JSON.stringify(`${dir}/${pattern}`)}`)
      .join(" ");
    const child = spawn(
      "bash",
      [
        "-c",
        `set -o pipefail; tar ${tarExcludes} -cf - ${JSON.stringify(dir)} | zstd ${compressArgs.join(" ")}`,
      ],
      { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    );

    const out = fs.createWriteStream(capsulePath);
    const hash = createHash("sha256");
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      rejectOne(err);
    };

    child.on("error", (err) => fail(err));
    child.stdout.on("data", (chunk: Buffer) => hash.update(chunk));
    child.stdout.pipe(out);
    out.on("error", (err) => fail(err));

    let childExited = false;
    let childExitCode: number | null = null;
    let outFinished = false;

    const maybeFinish = () => {
      if (settled || !childExited || !outFinished) return;
      if (childExitCode !== 0) {
        return fail(
          new Error(`packing ${dir} exited with code ${childExitCode}`),
        );
      }
      settled = true;
      const sha256 = hash.digest("hex");
      const manifestPath = path.resolve(
        outputRoot,
        capsule.replace(/\.pdim$/, ".manifest.json"),
      );
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            compression,
            sha256,
            dir,
            requiredMembers,
            excludePaths: normalizedExcludePaths,
          },
          null,
          2,
        ),
      );
      if (!preserveSource) fs.rmSync(abs, { recursive: true, force: true });
      const sizeBytes = fs.statSync(capsulePath).size;
      console.log(
        `   ✅ ${dir}/ packed (${(sizeBytes / 1048576).toFixed(0)}MB); source ${preserveSource ? "preserved" : "removed"}`,
      );
      resolveOne({
        capsulePath,
        manifestPath,
        sizeBytes,
        sha256,
        compression,
      });
    };

    child.on("exit", (code) => {
      childExited = true;
      childExitCode = code ?? -1;
      maybeFinish();
    });
    out.on("finish", () => {
      outFinished = true;
      maybeFinish();
    });
  });
}

export interface PackCapsuleMembersOptions {
  preserveSource?: boolean;
  outputRoot?: string;
  /** Absolute path to the root every path below is relative to. */
  root: string;
  /**
   * Explicit list of FILE paths (relative to `root`) to pack — not whole
   * directories. Used for the "everything else" app-remainder capsule,
   * where the member set is the survivors of a .dockerignore-aware scan
   * (see dockerignoreScan.ts) rather than one clean top-level directory,
   * and where files that must stay physically outside any capsule can live
   * in the very same parent directory as files that must be packed (e.g.
   * dist/pdim-restore.mjs must survive next to dist/cluster.mjs, which must
   * not).
   */
  members: string[];
  /** Output capsule filename, relative to `root`. */
  capsule: string;
  /** zstd thread count for this capsule's compression (`-T<n>`). See packCapsule. */
  threads?: number;
  compressionLevel?: number;
}

/**
 * Same real streaming tar+zstd pipeline as packCapsule() above, but for an
 * explicit file list instead of one whole directory — `tar -T <filelist>`
 * instead of `tar -cf - <dir>`, so members can be cherry-picked out of
 * directories that also contain files which must NOT be packed (dist/ is
 * the reason this exists: dist/pdim-restore.mjs and dist/.db-indexes-ok
 * must remain on disk outside every capsule while the rest of dist/ is
 * packed here). Deletes only the packed files afterward — never a whole
 * directory — so anything deliberately left out of `members` is untouched
 * on disk, including any file that happens to share a parent directory with
 * packed members.
 *
 * Resolves `null` if `members` is empty (nothing to pack — e.g. a from-
 * scratch checkout where the .dockerignore-survivor scan found nothing).
 */
export function packCapsuleMembers({
  root,
  members,
  capsule,
  threads = 0,
  compressionLevel = CAPSULE_COMPRESSION_LEVEL,
  preserveSource = false,
  outputRoot = root,
}: PackCapsuleMembersOptions): Promise<PackCapsuleResult | null> {
  const compression = `zstd-${compressionLevel}`;
  const compressArgs = zstdCompressArgs(threads, compressionLevel);
  return new Promise((resolveOne, rejectOne) => {
    // Enforce this at the destructive packing boundary too: a caller supplying
    // its own member list must not bypass the scanner's bootstrap exclusions.
    const protectedPaths = new Set(
      DEPLOYMENT_CONTROL_FILES.map((file) => path.resolve(root, file)),
    );
    const protectedMember = members.find((file) =>
      protectedPaths.has(path.resolve(root, file)),
    );
    if (protectedMember) {
      return rejectOne(new Error(
        `Refusing to capsule deployment control file: ${protectedMember}`,
      ));
    }
    const existingMembers = members.filter((m) =>
      fs.existsSync(path.resolve(root, m)),
    );
    if (existingMembers.length === 0) return resolveOne(null);

    const capsulePath = path.resolve(outputRoot, capsule);
    fs.mkdirSync(path.dirname(capsulePath), { recursive: true });
    const fileListPath = path.resolve(
      outputRoot,
      `.${capsule.replace(/[\/.]/g, "_")}.filelist`,
    );
    fs.writeFileSync(fileListPath, existingMembers.join("\n") + "\n");

    console.log(
      `==> Packing ${existingMembers.length} remaining app files → ${capsule} (${compression}, -T${threads}, Extract & Boot)...`,
    );

    const cleanupFileList = () => {
      try {
        fs.rmSync(fileListPath, { force: true });
      } catch {}
    };

    const child = spawn(
      "bash",
      [
        "-c",
        `set -o pipefail; tar -cf - --no-recursion -T ${JSON.stringify(fileListPath)} | zstd ${compressArgs.join(" ")}`,
      ],
      { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    );

    const out = fs.createWriteStream(capsulePath);
    const hash = createHash("sha256");
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanupFileList();
      try {
        child.kill("SIGKILL");
      } catch {}
      rejectOne(err);
    };

    child.on("error", (err) => fail(err));
    child.stdout.on("data", (chunk: Buffer) => hash.update(chunk));
    child.stdout.pipe(out);
    out.on("error", (err) => fail(err));

    let childExited = false;
    let childExitCode: number | null = null;
    let outFinished = false;

    const maybeFinish = () => {
      if (settled || !childExited || !outFinished) return;
      if (childExitCode !== 0) {
        return fail(
          new Error(`packing app remainder exited with code ${childExitCode}`),
        );
      }
      settled = true;
      cleanupFileList();
      const sha256 = hash.digest("hex");
      const manifestPath = path.resolve(
        outputRoot,
        capsule.replace(/\.pdim$/, ".manifest.json"),
      );
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            compression,
            sha256,
            dir: "<multiple>",
            memberCount: existingMembers.length,
          },
          null,
          2,
        ),
      );
      for (const member of preserveSource ? [] : existingMembers) {
        try {
          fs.rmSync(path.resolve(root, member), { force: true });
        } catch {}
      }
      const sizeBytes = fs.statSync(capsulePath).size;
      console.log(
        `   ✅ ${existingMembers.length} files packed (${(sizeBytes / 1048576).toFixed(0)}MB); sources ${preserveSource ? "preserved" : "removed"}`,
      );
      resolveOne({
        capsulePath,
        manifestPath,
        sizeBytes,
        sha256,
        compression,
      });
    };

    child.on("exit", (code) => {
      childExited = true;
      childExitCode = code ?? -1;
      maybeFinish();
    });
    out.on("finish", () => {
      outFinished = true;
      maybeFinish();
    });
  });
}
