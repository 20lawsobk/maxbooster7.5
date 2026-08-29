/**
 * Real streaming pack step for the four "Extract & Boot" deploy capsules
 * (node_modules, python_runtime, external/maxcore, external/pdim). Shared
 * between the production build (script/build.ts) and the automated
 * build-then-restore round-trip test
 * (tests/unit/capsule-pack-restore-roundtrip.test.ts) so both exercise the
 * exact same real tar+codec pipeline — no mocks on either side.
 *
 * Codec: zstd, chosen from a real benchmark against this project's actual
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

export const CAPSULE_COMPRESSION_LEVEL = 19;
export const CAPSULE_COMPRESSION_ID = `zstd-${CAPSULE_COMPRESSION_LEVEL}`;

function zstdCompressArgs(): string[] {
  return [`-${CAPSULE_COMPRESSION_LEVEL}`, "--long=27", "-T0", "-c"];
}

export interface PackCapsuleOptions {
  /** Absolute path to the root both `dir` and `capsule` are relative to. */
  root: string;
  /** Directory to pack, relative to `root` (e.g. "node_modules"). */
  dir: string;
  /** Output capsule filename, relative to `root` (e.g. "node_modules.pdim"). */
  capsule: string;
}

export interface PackCapsuleResult {
  capsulePath: string;
  manifestPath: string;
  sizeBytes: number;
  sha256: string;
  compression: string;
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
}: PackCapsuleOptions): Promise<PackCapsuleResult | null> {
  return new Promise((resolveOne, rejectOne) => {
    const abs = path.resolve(root, dir);
    if (!fs.existsSync(abs)) return resolveOne(null);

    const capsulePath = path.resolve(root, capsule);
    console.log(
      `==> Packing ${dir}/ → ${capsule} (${CAPSULE_COMPRESSION_ID}, Extract & Boot)...`,
    );

    const child = spawn(
      "bash",
      [
        "-c",
        `set -o pipefail; tar -cf - ${JSON.stringify(dir)} | zstd ${zstdCompressArgs().join(" ")}`,
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
        root,
        capsule.replace(/\.pdim$/, ".manifest.json"),
      );
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          { compression: CAPSULE_COMPRESSION_ID, sha256, dir },
          null,
          2,
        ),
      );
      fs.rmSync(abs, { recursive: true, force: true });
      const sizeBytes = fs.statSync(capsulePath).size;
      console.log(
        `   ✅ ${dir}/ packed (${(sizeBytes / 1048576).toFixed(0)}MB) and removed from image`,
      );
      resolveOne({
        capsulePath,
        manifestPath,
        sizeBytes,
        sha256,
        compression: CAPSULE_COMPRESSION_ID,
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
