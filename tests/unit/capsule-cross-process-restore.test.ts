import { describe, it, expect, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// End-to-end proof that a capsule built in one process is genuinely portable:
// it must (1) build and durably persist in a separate build process, (2) be
// loadable/verifiable in a wholly separate process afterwards, (3) extract
// back onto disk as a real file tree — including a required vendored
// subsystem path, mirroring external/maxcore in the real app — and (4) that
// extracted tree must actually run when its recorded entry point is invoked.
describe("Capsule cross-process build, verify, and restore", () => {
  let fixtureRoot: string;
  let extractRoot: string;
  let capsuleId: string;

  afterAll(async () => {
    if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
    if (extractRoot) await fs.rm(extractRoot, { recursive: true, force: true });
    if (capsuleId) {
      await fs.rm(path.join(process.cwd(), "pocket-dimensions", capsuleId), {
        recursive: true,
        force: true,
      });
    }
  });

  it("builds in one process, verifies in another, and restores a runnable tree", async () => {
    // 1. Fixture project mimicking the real app's shape: a package.json, a
    //    plain-JS entry point (so no build step is needed to prove
    //    runnability), and a nested "required subsystem" file standing in
    //    for external/maxcore/artifacts/api-server.
    fixtureRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "capsule-fixture-"),
    );
    await fs.writeFile(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({ name: "fixture-app", version: "1.0.0" }, null, 2),
    );
    await fs.writeFile(
      path.join(fixtureRoot, "entry.js"),
      "console.log('FIXTURE_APP_RUNNING');\n",
    );
    await fs.mkdir(
      path.join(fixtureRoot, "external/maxcore/artifacts/api-server"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        fixtureRoot,
        "external/maxcore/artifacts/api-server/marker.txt",
      ),
      "required-subsystem-present",
    );

    const platformCapsulePath = path.resolve(
      process.cwd(),
      "external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.ts",
    );

    const scriptsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "capsule-scripts-"),
    );

    // 2. BUILD in its own child process (real process boundary, not just a
    //    separate `await` in the same test process). Written to a real .mts
    //    file (not --eval) so top-level await works under tsx's transform.
    const buildScriptPath = path.join(scriptsDir, "build.mts");
    await fs.writeFile(
      buildScriptPath,
      `
      import { PlatformCapsuleBuilder } from ${JSON.stringify(platformCapsulePath)};
      const builder = new PlatformCapsuleBuilder(${JSON.stringify(fixtureRoot)});
      const meta = await builder.build({
        version: "e2e-test",
        entryPoint: "entry.js",
        startCommand: "node entry.js",
      });
      console.log(meta.id);
      `,
    );
    const { stdout: buildOut } = await execFileAsync(
      "npx",
      ["tsx", buildScriptPath],
      { cwd: process.cwd() },
    );
    capsuleId = buildOut.trim().split("\n").pop()!.trim();
    expect(capsuleId).toMatch(/^capsule-e2e-test-/);

    // 3. VERIFY in a second, separate child process — proves the index and
    //    metadata are durably on disk, not just cached in the builder's
    //    in-memory pocketManager.
    const verifyScriptPath = path.join(scriptsDir, "verify.mts");
    await fs.writeFile(
      verifyScriptPath,
      `
      import { PlatformCapsuleLoader } from ${JSON.stringify(platformCapsulePath)};
      const loader = new PlatformCapsuleLoader();
      await loader.load(${JSON.stringify(capsuleId)});
      const ok = await loader.verify();
      const manifest = loader.getManifest();
      console.log(JSON.stringify({ ok, entryPoint: manifest.entryPoint, startCommand: manifest.startCommand }));
      `,
    );
    const { stdout: verifyOut } = await execFileAsync(
      "npx",
      ["tsx", verifyScriptPath],
      { cwd: process.cwd() },
    );
    const lines = verifyOut.trim().split("\n");
    const verifyResult = JSON.parse(lines[lines.length - 1]);
    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.entryPoint).toBe("entry.js");
    expect(verifyResult.startCommand).toBe("node entry.js");

    // 4. EXTRACT to a clean directory in a third separate child process.
    extractRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "capsule-extract-"),
    );
    const extractScriptPath = path.join(scriptsDir, "extract.mts");
    await fs.writeFile(
      extractScriptPath,
      `
      import { PlatformCapsuleLoader } from ${JSON.stringify(platformCapsulePath)};
      const loader = new PlatformCapsuleLoader();
      await loader.load(${JSON.stringify(capsuleId)});
      const count = await loader.extractTo(${JSON.stringify(extractRoot)});
      console.log(count);
      `,
    );
    await execFileAsync("npx", ["tsx", extractScriptPath], {
      cwd: process.cwd(),
    });
    await fs.rm(scriptsDir, { recursive: true, force: true });

    // The required vendored subsystem path must have survived the round trip.
    const marker = await fs.readFile(
      path.join(
        extractRoot,
        "external/maxcore/artifacts/api-server/marker.txt",
      ),
      "utf-8",
    );
    expect(marker).toBe("required-subsystem-present");

    // 5. RUN the manifest's recorded start contract against the extracted
    //    tree — proves the capsule is not just byte-identical but actually
    //    bootable.
    const { stdout: runOut } = await execFileAsync(
      "node",
      ["entry.js"],
      { cwd: extractRoot },
    );
    expect(runOut.trim()).toBe("FIXTURE_APP_RUNNING");
  }, 60000);
});
