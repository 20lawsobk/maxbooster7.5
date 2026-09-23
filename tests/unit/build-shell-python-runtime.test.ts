import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const scratchDirs: string[] = [];

function isolatedEntrypoint(exitCode: number) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "build-entrypoint-"));
  scratchDirs.push(scratch);
  const project = path.join(scratch, "project");
  const bin = path.join(scratch, "bin");
  fs.mkdirSync(project);
  fs.mkdirSync(bin);
  fs.copyFileSync(path.join(root, "build.sh"), path.join(project, "build.sh"));
  const npm = path.join(bin, "npm");
  fs.writeFileSync(npm, `#!/bin/sh
printf '%s\\n' "cwd=$PWD" "deploy=$DEPLOY_PACK" "args=$*" > "$BUILD_ENTRYPOINT_CAPTURE"
exit ${exitCode}
`, { mode: 0o755 });
  const capture = path.join(scratch, "capture");
  const result = spawnSync("bash", [path.join(project, "build.sh")], {
    cwd: scratch,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      BUILD_ENTRYPOINT_CAPTURE: capture,
      DEPLOY_PACK: "0",
    },
    encoding: "utf8",
  });
  return { result, capture: fs.readFileSync(capture, "utf8"), project };
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("legacy build.sh delegates to the canonical deployment build", () => {
  it("starts from its own project root and executes only DEPLOY_PACK=1 npm run build", () => {
    const { result, capture, project } = isolatedEntrypoint(0);
    expect(result.status).toBe(0);
    expect(capture).toBe(`cwd=${project}\ndeploy=1\nargs=run build\n`);
  });

  it("propagates the canonical build failure without fallback or a second path", () => {
    const { result, capture, project } = isolatedEntrypoint(37);
    expect(result.status).toBe(37);
    expect(capture).toBe(`cwd=${project}\ndeploy=1\nargs=run build\n`);
  });

  it("remains valid shell and has no legacy installer or capsule packer", () => {
    execFileSync("bash", ["-n", path.join(root, "build.sh")]);
    const source = fs.readFileSync(path.join(root, "build.sh"), "utf8");
    expect(source).toContain("exec npm run build");
    expect(source).not.toMatch(/pip install|_pdim_pack|npm ci|source\.pdim/);
  });
});