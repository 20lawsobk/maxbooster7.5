import { describe, it, expect, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import {
  packCapsule,
  CAPSULE_COMPRESSION_ID,
} from "../../script/lib/capsulePack.js";
import { restoreCapsule, tarFlagsForCompression } from "../../dist/pdim-restore.mjs";

// Real, non-mocked build-then-restore round trip for the "Extract & Boot"
// deploy capsule system (script/build.ts packs; dist/pdim-restore.mjs
// restores at boot). No coverage existed for this system before task #175
// swapped its codec from gzip to zstd. This exercises the actual
// `tar | zstd` child-process pipeline on write and the actual restore
// extraction (bsdtar or GNU tar, whichever this environment resolves) on
// read — the only thing synthetic here is the small fixture tree standing
// in for a real capsule directory like node_modules.
//
// dist/pdim-restore.mjs resolves its ROOT from its own file location (the
// real project root) rather than accepting an injectable root, so the
// fixture, capsule, and manifest all have to live under real
// project-relative paths exactly the way a real capsule does — hence the
// shared ROOT_RELATIVE prefix below instead of an os.tmpdir() location.
describe("Capsule pack/restore round trip (real zstd + real tar)", () => {
  const projectRoot = process.cwd();
  const ROOT_RELATIVE = `tests/.tmp-capsule-rt-${process.pid}-${Date.now()}`;
  const sentinelName = ".rt-test-sentinel";

  afterAll(async () => {
    await fs.rm(path.resolve(projectRoot, ROOT_RELATIVE), {
      recursive: true,
      force: true,
    });
    // Defensive cleanup only: restoreCapsule already removes its own lock
    // and scratch bookkeeping files (both written directly under the real
    // project ROOT, not under ROOT_RELATIVE) on every success/failure path.
    // This just guards against a hard crash mid-test leaving one behind.
    for (const entry of await fs.readdir(projectRoot)) {
      if (entry.endsWith(".pdim-restore.lock") || entry.startsWith(".pdim-scratch-")) {
        if (entry.includes(ROOT_RELATIVE.replace(/\//g, "_"))) {
          await fs.rm(path.resolve(projectRoot, entry), {
            recursive: true,
            force: true,
          });
        }
      }
    }
  });

  async function writeFixtureTree(dir: string) {
    await fs.mkdir(path.join(dir, "nested", "deeper"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "a.txt"),
      "hello world\n".repeat(500),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, "nested", "b.json"),
      JSON.stringify({ ok: true, unicode: "héllo 世界 🎧" }, null, 2),
    );
    await fs.writeFile(
      path.join(dir, "nested", "deeper", "c.bin"),
      randomBytes(8192),
    );
    await fs.writeFile(path.join(dir, "empty.txt"), "");
  }

  async function collectFiles(
    dir: string,
    base = dir,
  ): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        for (const [k, v] of await collectFiles(full, base)) out.set(k, v);
      } else if (entry.isFile()) {
        if (entry.name === sentinelName) continue; // restore bookkeeping, not source content
        out.set(path.relative(base, full), await fs.readFile(full));
      }
    }
    return out;
  }

  it("packs a real directory with zstd and restores it byte-identical", async () => {
    const dirRelative = `${ROOT_RELATIVE}/src`;
    const capsuleRelative = `${ROOT_RELATIVE}/fixture.pdim`;
    const manifestRelative = `${ROOT_RELATIVE}/fixture.manifest.json`;
    const srcAbs = path.resolve(projectRoot, dirRelative);

    await writeFixtureTree(srcAbs);

    // Reference copy MUST be taken before packing: packCapsule deletes the
    // source directory on success, exactly like the real build step does.
    const referenceAbs = path.resolve(projectRoot, ROOT_RELATIVE, "reference");
    await fs.cp(srcAbs, referenceAbs, { recursive: true });
    const expected = await collectFiles(referenceAbs);
    expect(expected.size).toBeGreaterThan(0);

    // Real codec id must look like "zstd-<level>", not a placeholder —
    // guards against CAPSULE_COMPRESSION_ID silently regressing to
    // something else while every self-referential assertion below would
    // still trivially pass.
    expect(CAPSULE_COMPRESSION_ID).toMatch(/^zstd-\d+$/);

    const packResult = await packCapsule({
      root: projectRoot,
      dir: dirRelative,
      capsule: capsuleRelative,
    });
    expect(packResult).not.toBeNull();
    expect(packResult!.compression).toBe(CAPSULE_COMPRESSION_ID);

    // Source directory must be gone after a successful pack (matches the
    // real build step's "delete source after packing" behavior).
    await expect(fs.access(srcAbs)).rejects.toThrow();

    // Manifest on disk must record the REAL codec that ran, sourced from
    // the same constant used to build the actual zstd invocation — not a
    // separate literal that could drift from what actually executed.
    const manifestOnDisk = JSON.parse(
      await fs.readFile(path.resolve(projectRoot, manifestRelative), "utf8"),
    );
    expect(manifestOnDisk.compression).toBe(CAPSULE_COMPRESSION_ID);
    expect(manifestOnDisk.sha256).toBe(packResult!.sha256);

    const restored = await restoreCapsule(
      capsuleRelative,
      manifestRelative,
      dirRelative,
      sentinelName,
    );
    expect(restored).toBe(true);

    const actual = await collectFiles(srcAbs);
    expect(Array.from(actual.keys()).sort()).toEqual(
      Array.from(expected.keys()).sort(),
    );
    for (const [relPath, expectedBuf] of expected) {
      const actualBuf = actual.get(relPath);
      expect(actualBuf, `missing restored file: ${relPath}`).toBeDefined();
      expect(actualBuf!.equals(expectedBuf), `content mismatch: ${relPath}`).toBe(
        true,
      );
    }

    // Idempotency: a second restoreCapsule call against an already-restored
    // tree must hit the sentinel skip path (still "successful"), not
    // re-extract — exactly the behavior boot needs across container
    // restarts once a capsule has already been restored once.
    const second = await restoreCapsule(
      capsuleRelative,
      manifestRelative,
      dirRelative,
      sentinelName,
    );
    expect(second).toBe(true);
  }, 60000);

  it("fails closed on a corrupted capsule instead of silently restoring bad content", async () => {
    const dirRelative = `${ROOT_RELATIVE}/src-tamper`;
    const capsuleRelative = `${ROOT_RELATIVE}/tamper.pdim`;
    const manifestRelative = `${ROOT_RELATIVE}/tamper.manifest.json`;
    const srcAbs = path.resolve(projectRoot, dirRelative);

    await fs.mkdir(srcAbs, { recursive: true });
    await fs.writeFile(
      path.join(srcAbs, "only.txt"),
      "integrity-check fixture\n",
    );

    const packResult = await packCapsule({
      root: projectRoot,
      dir: dirRelative,
      capsule: capsuleRelative,
    });
    expect(packResult).not.toBeNull();

    // Flip one byte in the middle of the compressed capsule so its SHA-256
    // no longer matches what the manifest recorded — simulating real-world
    // corruption (truncated upload, disk bitrot) that the checksum exists
    // to catch. The restore-side hash is computed from the raw capsule
    // bytes on disk independent of whether tar/zstd can still decode the
    // corrupted stream, so this reliably exercises the checksum-mismatch
    // path regardless of how the corruption happens to affect decoding.
    const capsuleAbs = path.resolve(projectRoot, capsuleRelative);
    const bytes = await fs.readFile(capsuleAbs);
    const mid = Math.floor(bytes.length / 2);
    bytes[mid] = bytes[mid] ^ 0xff;
    await fs.writeFile(capsuleAbs, bytes);

    const restored = await restoreCapsule(
      capsuleRelative,
      manifestRelative,
      dirRelative,
      sentinelName,
    );
    expect(restored).toBe(false);

    // A failed restore must not leave a partially-extracted target
    // directory, or a leftover scratch directory, behind.
    await expect(fs.access(srcAbs)).rejects.toThrow();
    const leftoverScratch = (await fs.readdir(projectRoot)).filter((e) =>
      e.startsWith(`.pdim-scratch-${dirRelative.replace(/\//g, "_")}-`),
    );
    expect(leftoverScratch).toEqual([]);
  }, 30000);

  it("selects the correct GNU-tar extraction flag for every real capsule codec id", () => {
    // Covers the GNU-tar fallback branch directly: bsdtar (preferred when
    // available, and guaranteed here via the explicit `pkgs.libarchive` Nix
    // dependency) auto-detects the format itself, so a real round trip in
    // this environment cannot otherwise exercise this branch.
    expect(tarFlagsForCompression(CAPSULE_COMPRESSION_ID)).toEqual([
      "--zstd",
      "-xf",
    ]);
    expect(tarFlagsForCompression("zstd-19")).toEqual(["--zstd", "-xf"]);
    expect(tarFlagsForCompression("xz-9e")).toEqual(["-xJf"]);
    expect(tarFlagsForCompression("gzip-9")).toEqual(["-xzf"]);
    expect(tarFlagsForCompression(undefined)).toEqual(["-xzf"]);
  });
});
