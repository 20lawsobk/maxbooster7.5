import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { computeRemainingAppMembers } from "../../script/lib/dockerignoreScan.js";

describe("deployment .dockerignore sensitive path coverage", () => {
  it("excludes workspace credentials and local-only files from the app remainder", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dockerignore-sensitive-paths-"),
    );
    try {
      await fs.copyFile(
        path.join(process.cwd(), ".dockerignore"),
        path.join(temporaryRoot, ".dockerignore"),
      );

      const fixtureFiles = [
        ".npmrc",
        ".env",
        ".env.production",
        ".cloudflared/config.yml",
        "dns-node/keys/signing.key",
        "server/.npmrc",
        "server/.env.preview",
        "server/index.ts",
      ];
      for (const relativeFile of fixtureFiles) {
        const absoluteFile = path.join(temporaryRoot, relativeFile);
        await fs.mkdir(path.dirname(absoluteFile), { recursive: true });
        await fs.writeFile(absoluteFile, "fixture");
      }

      const members = computeRemainingAppMembers(temporaryRoot);
      for (const omitted of fixtureFiles.filter(
        (relativeFile) => relativeFile !== "server/index.ts",
      )) {
        expect(members).not.toContain(omitted);
      }
      expect(members).toContain("server/index.ts");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("omits the root workspace venv and its external wrapper while preserving capsule outputs", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dockerignore-workspace-venv-"),
    );
    const workspace = path.join(temporaryRoot, "workspace");
    const external = path.join(temporaryRoot, "external-wrapper");
    try {
      await fs.mkdir(workspace, { recursive: true });
      await fs.mkdir(path.join(external, "bin"), { recursive: true });
      const executable = path.join(external, "bin", "python-wrapped");
      await fs.writeFile(executable, Buffer.from("external interpreter fixture"));
      await fs.symlink("python-wrapped", path.join(external, "bin", ".python-wrapped"));
      await fs.copyFile(
        path.join(process.cwd(), ".dockerignore"),
        path.join(workspace, ".dockerignore"),
      );
      for (const [relative, contents] of [
        ["venv/bin/python", "workspace interpreter"],
        ["venv/pyvenv.cfg", "workspace environment metadata"],
        ["python_runtime.pdim", "portable runtime capsule"],
        ["python_runtime.manifest.json", "portable runtime manifest"],
        ["start.sh", "bootstrap entry point"],
      ]) {
        const file = path.join(workspace, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, contents);
      }
      const wrapper = path.join(workspace, "venv", "bin", ".python-wrapped");
      const wrapperTarget = path.join(external, "bin", ".python-wrapped");
      const originalTarget = await fs.readlink(wrapperTarget);
      const targetBytes = createHash("sha256").update(await fs.readFile(executable)).digest("hex");
      await fs.symlink(path.relative(path.dirname(wrapper), wrapperTarget), wrapper);

      const members = computeRemainingAppMembers(workspace);
      expect(members.some((member) => member === "venv" || member.startsWith("venv/"))).toBe(false);
      expect(members).toContain("python_runtime.pdim");
      expect(members).toContain("python_runtime.manifest.json");
      expect(members).toContain("start.sh");
      expect(await fs.readlink(wrapper)).toContain("external-wrapper");
      expect(await fs.readlink(wrapperTarget)).toBe(originalTarget);
      expect(createHash("sha256").update(await fs.readFile(executable)).digest("hex")).toBe(targetBytes);
      expect(await fs.lstat(wrapper)).toBeTruthy();
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});