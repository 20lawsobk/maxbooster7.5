import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Official glibc binary, not a copy of the build host's Nix-linked executable. */
export function buildPortableNode(root: string): void {
  const version = "22.22.0";
  const name = `node-v${version}-linux-x64`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "maxbooster-node-"));
  try {
    const archive = path.join(temp, `${name}.tar.xz`);
    const base = `https://nodejs.org/dist/v${version}`;
    execFileSync("curl", ["--fail", "--silent", "--show-error", "--location", `${base}/${name}.tar.xz`, "-o", archive]);
    const sums = execFileSync("curl", ["--fail", "--silent", "--show-error", "--location", `${base}/SHASUMS256.txt`], { encoding: "utf8" });
    const expected = sums.split("\n").find((line) => line.trim().endsWith(` ${name}.tar.xz`))?.split(/\s+/)[0];
    const actual = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    if (!expected || actual !== expected) throw new Error("Portable Node checksum mismatch");
    const dest = path.join(root, ".node_bin");
    fs.mkdirSync(dest, { recursive: true });
    execFileSync("tar", ["-xJf", archive, "--strip-components=2", "-C", dest, `${name}/bin/node`]);
    fs.chmodSync(path.join(dest, "node"), 0o755);
    fs.writeFileSync(path.join(dest, "provenance.json"), JSON.stringify({ version, platform: "linux-x64", archiveSha256: actual }));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}